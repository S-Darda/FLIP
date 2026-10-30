"""Phase 1 exit criteria: no raw uploads, signed site agents, policy enforcement, tenancy,
admin MFA, federated AutoML across real agents and signed artefacts."""
import threading
import time

import pytest

from flipml import synth
from flip_agent.core import Agent, AgentState
from flip_agent.demo import write_csv

from conftest import TMP, wait_for

FEATURES = ["age", "length_of_stay", "prior_admissions", "num_medications", "hba1c", "bmi"]


@pytest.fixture(scope="module")
def federation(client):
    """Three enrolled agents, each with a local CSV, running in background threads."""
    admin = {"Authorization": "Bearer " + client.post("/api/auth/login", json={
        "email": "admin@test.io", "password": "adminpass1", "portal": "admin"}).json()["access_token"]}
    org = client.post("/api/orgs", headers=admin, json={"name": "Hospital Group"}).json()
    agents, stop = [], threading.Event()
    for i, (n, shift) in enumerate([(420, 0.0), (360, 5.0), (300, -4.0)]):
        site = client.post("/api/sites", headers=admin, json={"org_id": org["org_id"], "name": f"Test Hospital {i}"}).json()
        path = TMP / f"site{i}" / "readmissions.csv"
        write_csv(path, synth.readmission_site(20 + i, n, shift))
        state = AgentState.load(TMP / f"site{i}" / "agent")
        state.server = "http://testserver"
        agent = Agent(state, http=client)
        agent.enrol(site["enrolment_token"])
        agent.add_dataset("readmissions", path)
        agents.append((agent, site, path))
    threads = [threading.Thread(target=a.run_forever, args=(stop,), kwargs={"wait": 1}, daemon=True) for a, _, _ in agents]
    for t in threads:
        t.start()
    yield {"admin": admin, "agents": agents, "site_ids": [s["site_id"] for _, s, _ in agents], "org": org}
    stop.set()
    for t in threads:
        t.join(timeout=5)


def _study(client, headers, name, **kw):
    body = {"project_name": name, "description": "study", "domain": "Healthcare", "mode": "federated",
            "task_type": "classification", "dataset_name": "readmissions", "target": "readmitted",
            "features": FEATURES, "min_sites": 2, "families": ["linear", "mlp"], "max_trials": 3, **kw}
    return client.post("/api/projects", headers=headers, json=body)


def test_no_raw_upload_paths(client, dev1):
    r = client.post("/api/projects", headers=dev1, data={"project_name": "Upload"},
                    files=[("files", ("x.csv", b"a,b\n1,2\n", "text/csv"))])
    assert r.status_code == 422
    assert client.post("/api/projects/1/datasets", headers=dev1, files=[("files", ("x.csv", b"a", "text/csv"))]).status_code in (404, 405)
    paths = {getattr(r, "path", "") for r in client.app.routes}
    assert not any("upload" in p or p.endswith("/datasets/{dataset_id}") for p in paths)


def test_enrolment_and_signatures(client, federation):
    agent, site, _ = federation["agents"][0]
    admin = federation["admin"]
    sites = {s["site_id"]: s for s in client.get("/api/sites", headers=admin).json()}
    assert sites[site["site_id"]]["status"] == "Active"
    # The token is single-use.
    r = client.post("/api/agent/enrol", json={"token": site["enrolment_token"], "public_key": "a" * 64})
    assert r.status_code == 401
    # Unsigned and badly signed requests are refused.
    assert client.post("/api/agent/heartbeat").status_code == 401
    bad = {"X-FLIP-Site": str(site["site_id"]), "X-FLIP-Timestamp": str(int(time.time() * 1000)), "X-FLIP-Signature": "00" * 64}
    assert client.post("/api/agent/heartbeat", headers=bad).status_code == 401
    # Replaying an old timestamp is refused even with a valid signature.
    from flip_agent.core import _signing_message
    ts = agent._last_ts - 5
    sig = agent._key.sign(_signing_message("POST", "/api/agent/heartbeat", ts, b"")).hex()
    replay = {"X-FLIP-Site": str(site["site_id"]), "X-FLIP-Timestamp": str(ts), "X-FLIP-Signature": sig}
    assert client.post("/api/agent/heartbeat", headers=replay).status_code == 401
    assert agent.heartbeat()["ok"]


def test_dataset_registration_is_schema_only(client, federation):
    agent, site, _ = federation["agents"][0]
    with pytest.raises(RuntimeError, match="422"):
        agent._signed("POST", "/api/agent/datasets", {"name": "leak", "schema": {"rows": 2, "columns": [
            {"name": "age", "type": "numeric", "rows": [[61], [72]]}]}})
    listed = next(s for s in client.get("/api/sites", headers=federation["admin"]).json() if s["site_id"] == site["site_id"])
    ds = listed["datasets"][0]
    assert ds["name"] == "readmissions" and ds["rows"] == 420
    assert set(ds["schema"]) == {"rows", "columns"}


def test_site_cannot_answer_another_sites_task(client, federation, dev1):
    from app.database import SessionLocal
    from app.models import AgentTask, ModelTraining, Project
    (a0, s0, _), (a1, s1, _) = federation["agents"][:2]
    pid = _study(client, dev1, "Isolation check", site_ids=federation["site_ids"]).json()["project_id"]
    db = SessionLocal()
    job = ModelTraining(project_id=pid, started_by=db.get(Project, pid).created_by, status="Cancelled")
    db.add(job)
    db.flush()
    t = AgentTask(site_id=s0["site_id"], training_id=job.training_id, kind="eval", payload="{}", status="sent")
    db.add(t)
    db.commit()
    with pytest.raises(RuntimeError, match="404"):
        a1._signed("POST", f"/api/agent/tasks/{t.task_id}/result", {"result": {"n": 1}})
    db.delete(t)
    db.delete(job)
    db.commit()
    db.close()
    client.delete(f"/api/projects/{pid}", headers=dev1)


def test_policy_matrix(client, federation, dev1):
    ids = federation["site_ids"]
    assert _study(client, dev1, "Local two sites", mode="local", site_ids=ids[:2]).status_code == 422
    assert _study(client, dev1, "Local with DP", mode="local", site_ids=ids[:1], dp_required=True).status_code == 422
    assert _study(client, dev1, "Too few sites", site_ids=ids[:2], min_sites=3).status_code == 422
    assert _study(client, dev1, "Target in features", site_ids=ids, features=FEATURES + ["readmitted"]).status_code == 422
    assert _study(client, dev1, "Regression on label", site_ids=ids, task_type="regression").status_code == 422
    assert _study(client, dev1, "Unknown column", site_ids=ids, features=["shoe_size"]).status_code == 422


def test_federated_automl_end_to_end(client, federation, dev1, dev2, admin):
    r = _study(client, dev1, "Readmission federated", site_ids=federation["site_ids"], max_epsilon=200.0)
    assert r.status_code == 201, r.text
    pid = r.json()["project_id"]
    client.post(f"/api/projects/{pid}/review", headers=admin, json={"decision": "Approved"})

    # Budget enforcement happens before anything runs.
    over = client.post(f"/api/projects/{pid}/training", headers=dev1, json={"rounds": 200, "trials": 3, "dp_enabled": True, "noise_multiplier": 0.5})
    assert over.status_code == 422 and "limit" in over.json()["detail"]

    r = client.post(f"/api/projects/{pid}/training", headers=dev1, json={
        "rounds": 4, "trials": 2, "dp_enabled": True, "noise_multiplier": 1.0, "clip_norm": 1.0, "learning_rate": 0.3})
    assert r.status_code == 201, r.text
    ids = r.json()["trial_ids"]
    jobs = [wait_for(client, dev1, i, timeout=90) for i in ids]
    assert all(j["status"] == "Completed" for j in jobs), [j["error"] for j in jobs]
    best = [j for j in (client.get(f"/api/training/{i}", headers=dev1).json() for i in ids) if j["is_best"]]
    assert len(best) == 1
    job = jobs[0]
    rep = job["report"]
    assert job["mode"] == "federated" and job["num_nodes"] == 3
    assert rep["sites"] == 3 and len(rep["per_site"]) == 3 and rep["auroc"] is not None
    assert "visible to the coordinator" in rep["update_visibility"]
    assert rep["privacy"]["guarantee"] and rep["privacy"]["rounds"] == 4

    # Signed artefact verifies against the published key and fails if tampered with.
    from app.security import verify_artefact
    dl = client.get(f"/api/training/{job['training_id']}/download", headers=dev1).json()
    assert verify_artefact(dl["artefact"], dl["signature"], dl["public_key"])
    dl["artefact"]["params"][1][0] += 1.0
    assert not verify_artefact(dl["artefact"], dl["signature"], dl["public_key"])

    # Tenancy: another developer can't see the study, its runs or its artefact.
    assert client.get(f"/api/projects/{pid}", headers=dev2).status_code == 404
    assert client.get(f"/api/training/{job['training_id']}/download", headers=dev2).status_code == 404


def test_developers_cannot_manage_sites(client, federation, dev1):
    assert client.get("/api/orgs", headers=dev1).status_code == 403
    assert client.post("/api/sites", headers=dev1, json={"org_id": 1, "name": "Rogue"}).status_code == 403
    listed = client.get("/api/sites", headers=dev1).json()
    assert listed and all("key_fingerprint" not in s and "enrolment_token" not in s for s in listed)


def test_admin_mfa_flow(client):
    from app.security import totp
    r = client.post("/api/auth/register", json={"username": "Mfa User", "email": "mfa@test.io", "password": "mfapass123"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    secret = client.post("/api/auth/mfa/setup", headers=h).json()["secret"]
    step = int(time.time() // 30)
    assert client.post("/api/auth/mfa/enable", headers=h, json={"code": "000000" if totp(secret, step) != "000000" else "111111"}).status_code == 400
    r = client.post("/api/auth/mfa/enable", headers=h, json={"code": totp(secret, step)})
    assert r.status_code == 200 and r.json()["user"]["mfa_enabled"]
    login = client.post("/api/auth/login", json={"email": "mfa@test.io", "password": "mfapass123"}).json()
    assert login["mfa_required"] and "access_token" not in login
    # The code used to enable can't be replayed; the next step's code works.
    assert client.post("/api/auth/mfa/verify", json={"mfa_token": login["mfa_token"], "code": totp(secret, step)}).status_code == 401
    ok = client.post("/api/auth/mfa/verify", json={"mfa_token": login["mfa_token"], "code": totp(secret, step + 1)})
    assert ok.status_code == 200 and ok.json()["access_token"]
