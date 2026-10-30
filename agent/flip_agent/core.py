"""Identity, signed transport and the task loop."""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from flipml.site import SiteData, TaskRejected, handle

from . import __version__

log = logging.getLogger("flip_agent")


def _signing_message(method: str, path: str, ts: int, body: bytes) -> bytes:
    import hashlib
    return f"{method.upper()}\n{path}\n{ts}\n{hashlib.sha256(body).hexdigest()}".encode()


@dataclass
class AgentState:
    """Everything the agent keeps on disk, in one folder owned by the site."""
    folder: Path
    server: str = ""
    site_id: int | None = None
    site_name: str = ""
    datasets: dict[str, str] = field(default_factory=dict)  # name -> local file path

    @property
    def key_path(self) -> Path:
        return self.folder / "identity_ed25519.pem"

    @property
    def config_path(self) -> Path:
        return self.folder / "agent.json"

    @classmethod
    def load(cls, folder: Path) -> "AgentState":
        folder = Path(folder)
        st = cls(folder=folder)
        if st.config_path.exists():
            data = json.loads(st.config_path.read_text())
            st.server, st.site_id, st.site_name = data.get("server", ""), data.get("site_id"), data.get("site_name", "")
            st.datasets = data.get("datasets", {})
        return st

    def save(self) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps({"server": self.server, "site_id": self.site_id,
                                                "site_name": self.site_name, "datasets": self.datasets}, indent=2))

    def new_key(self) -> Ed25519PrivateKey:
        key = Ed25519PrivateKey.generate()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                    serialization.NoEncryption()))
        try:
            os.chmod(self.key_path, 0o600)
        except OSError:
            pass
        return key

    def key(self) -> Ed25519PrivateKey:
        return serialization.load_pem_private_key(self.key_path.read_bytes(), password=None)


def public_hex(key: Ed25519PrivateKey) -> str:
    return key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()


class Agent:
    def __init__(self, state: AgentState, timeout: float = 40.0, http: httpx.Client | None = None):
        self.state = state
        self.http = http or httpx.Client(base_url=state.server.rstrip("/"), timeout=timeout)
        self._key = state.key() if state.key_path.exists() else None
        self._last_ts = 0
        self._data: dict[str, SiteData] = {}

    # ---------------------------------------------------------------- transport

    def _signed(self, method: str, path: str, body: dict | None = None) -> httpx.Response:
        raw = json.dumps(body).encode() if body is not None else b""
        ts = max(int(time.time() * 1000), self._last_ts + 1)  # strictly increasing for replay protection
        self._last_ts = ts
        sig = self._key.sign(_signing_message(method, path, ts, raw)).hex()
        headers = {"X-FLIP-Site": str(self.state.site_id), "X-FLIP-Timestamp": str(ts), "X-FLIP-Signature": sig}
        if body is not None:
            headers["Content-Type"] = "application/json"
        r = self.http.request(method, path, content=raw or None, headers=headers)
        if r.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
        return r

    # ---------------------------------------------------------------- commands

    def enrol(self, token: str) -> dict:
        """Generate this site's key locally and register only the public half."""
        key = self.state.new_key()
        r = self.http.post("/api/agent/enrol", json={"token": token, "public_key": public_hex(key), "agent_version": __version__})
        if r.status_code >= 400:
            raise RuntimeError(f"Enrolment failed: {r.status_code} {r.text[:300]}")
        info = r.json()
        self._key = key
        self.state.site_id, self.state.site_name = info["site_id"], info["site_name"]
        self.state.save()
        return info

    def add_dataset(self, name: str, path: Path) -> dict:
        """Profile a local CSV and send its schema (never its rows)."""
        path = Path(path).resolve()
        data = SiteData.from_csv(path)
        schema = data.schema()
        self._signed("POST", "/api/agent/datasets", {"name": name, "schema": schema})
        self.state.datasets[name] = str(path)
        self.state.save()
        self._data[name] = data
        return schema

    def heartbeat(self) -> dict:
        return self._signed("POST", "/api/agent/heartbeat", {}).json()

    def _dataset(self, name: str) -> SiteData:
        if name not in self.state.datasets:
            raise TaskRejected(f"dataset '{name}' is not registered at this site")
        if name not in self._data:
            self._data[name] = SiteData.from_csv(Path(self.state.datasets[name]))
        return self._data[name]

    def run_once(self, wait: float = 20.0) -> int:
        tasks = self._signed("GET", f"/api/agent/tasks?wait={int(wait)}").json()["tasks"]
        for t in tasks:
            p = t["payload"]
            try:
                result = handle(self._dataset(p.get("dataset", "")), t["kind"], p)
                self._signed("POST", f"/api/agent/tasks/{t['task_id']}/result", {"result": result})
                size = len(json.dumps(result["delta"])) if t["kind"] == "train" else 0
                what = (f"weight update ({size / 1024:.1f} KB)"
                        if t["kind"] == "train" else "aggregate statistics")
                log.info("[%s] run %s %s round %s: sent %s, no rows", self.state.site_name, t["training_id"], t["kind"], t["round"], what)
            except TaskRejected as exc:
                log.warning("[%s] rejected task %s: %s", self.state.site_name, t["task_id"], exc)
                self._signed("POST", f"/api/agent/tasks/{t['task_id']}/result", {"error": str(exc)})
        return len(tasks)

    def run_forever(self, stop=None, wait: float = 20.0) -> None:
        log.info("[%s] agent running against %s", self.state.site_name, self.state.server)
        backoff = 1.0
        while not (stop and stop.is_set()):
            try:
                self.run_once(wait)
                backoff = 1.0
            except (httpx.HTTPError, RuntimeError) as exc:
                log.warning("[%s] %s; retrying in %.0fs", self.state.site_name, exc, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, 30)
