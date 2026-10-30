"""Demo federation: three hospital agents, each with its own synthetic readmissions table.

  python -m flip_agent.demo --server http://localhost:8000

Uses the admin account to issue enrolment tokens for the seeded demo sites (only when a site
isn't already enrolled with the key in its folder), enrols each agent, registers its dataset by
schema, then runs all three until stopped. Each hospital's CSV is written under --folder and
never uploaded."""
import argparse
import csv
import logging
import threading
from pathlib import Path

import httpx

from flipml import synth

from .core import Agent, AgentState

HOSPITALS = [("St Marys Hospital", 11, 700, 0.0, 1.0), ("Riverside Hospital", 12, 520, 6.0, 1.25),
             ("Northgate Medical", 13, 430, -5.0, 0.8)]
log = logging.getLogger("flip_agent.demo")


def write_csv(path: Path, cols: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    names = list(cols)
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(names)
        for i in range(len(cols[names[0]])):
            w.writerow([cols[n][i] for n in names])


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="flip_agent.demo")
    ap.add_argument("--server", default="http://localhost:8000")
    ap.add_argument("--admin-email", default="admin@flip.demo")
    ap.add_argument("--admin-password", default="admin123")
    ap.add_argument("--folder", default=".flip-demo-sites")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    root = Path(args.folder).resolve()

    admin = httpx.Client(base_url=args.server, timeout=30)
    r = admin.post("/api/auth/login", json={"email": args.admin_email, "password": args.admin_password, "portal": "admin"})
    r.raise_for_status()
    if r.json().get("mfa_required"):
        raise SystemExit("The demo admin has two-factor authentication on; enrol the sites by hand instead.")
    admin.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    sites = {s["name"]: s for s in admin.get("/api/sites").json()}

    agents = []
    for name, seed, n, age_shift, severity in HOSPITALS:
        if name not in sites:
            log.warning("Site '%s' is not registered on the server; skipping", name)
            continue
        folder = root / name.replace(" ", "_")
        data_path = folder / "data" / "readmissions.csv"
        if not data_path.exists():
            write_csv(data_path, synth.readmission_site(seed, n, age_shift, severity))
        state = AgentState.load(folder / "agent")
        state.server = args.server
        agent = Agent(state)
        needs_enrol = sites[name]["status"] != "Active" or state.site_id != sites[name]["site_id"] or not state.key_path.exists()
        if not needs_enrol:
            try:
                agent.heartbeat()
            except RuntimeError:
                needs_enrol = True
        if needs_enrol:
            token = admin.post(f"/api/sites/{sites[name]['site_id']}/token").json()["enrolment_token"]
            agent.enrol(token)
            log.info("Enrolled %s", name)
        schema = agent.add_dataset("readmissions", data_path)
        log.info("%s registered 'readmissions' (%s rows); the CSV stays in %s", name, schema["rows"], data_path.parent)
        agents.append(agent)

    stop = threading.Event()
    threads = [threading.Thread(target=a.run_forever, args=(stop,), daemon=True) for a in agents]
    for t in threads:
        t.start()
    log.info("%d hospital agents running. Press Ctrl+C to stop.", len(threads))
    try:
        while any(t.is_alive() for t in threads):
            for t in threads:
                t.join(timeout=1)
    except KeyboardInterrupt:
        stop.set()


if __name__ == "__main__":
    main()
