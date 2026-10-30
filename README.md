# FLIP: Federated Learning Infrastructure Platform

A research prototype of a security-first **federated AutoML** platform. Organisations train shared models while raw records stay at each data-owner site. It implements the system in *Federated Learning Infrastructure Platform (FLIP) with FastAPI and React* (S. D. Rahman, MSc thesis), extended with Phase 1 of the *Technical Concept & Preliminary Security Architecture* (see [docs/security-architecture-gap-analysis.md](docs/security-architecture-gap-analysis.md)).

> **Prototype.** Site agents keep raw rows local, but secure aggregation is not built yet, so the coordinator can see each site's update. Do not use FLIP with real personal or sensitive data.

| Part | Who | What |
|---|---|---|
| Home `/` | Anyone | What FLIP does, live platform statistics, sign-up |
| Admin console `/admin` | Platform admins | Dashboard, study approvals, sites and organisations (agent enrolment), users and roles, training control, model approvals, logs, security, live events |
| Developer portal `/app` | Model developers | Study builder, your studies, federated training with AutoML, run reports with PDF export, comparison and leaderboard, model submissions |
| Site agent `agent/` | Data-owner sites | Keeps data local; answers only allowlisted federated tasks |

**Stack:** React 18 + Vite · FastAPI · SQLAlchemy 2 · SQLite or MySQL · JWT + bcrypt + TOTP · Ed25519 (agents and artefacts) · WebSockets · numpy · ReportLab

## How a federated run works

```
 site agent (St Marys)     site agent (Riverside)     site agent (Northgate)
   CSV stays here            CSV stays here             CSV stays here
        │  signed HTTPS (Ed25519), long-poll for tasks  │
        └───────────────► FLIP coordinator ◄────────────┘
                 prepare → moments only │ train → weight update │ eval → aggregate stats
```

1. **Enrol.** An admin registers a site and gets a one-time token (stored hashed, expires in 24 h). The agent generates its own Ed25519 key and enrols. Every later request is signed over method, path, timestamp and body; stale or replayed timestamps are rejected.
2. **Register data by schema.** The agent profiles a local CSV and sends column names, types, missing counts and row count. Category values are shared only for columns with 20 or fewer values, and only values seen at least 5 times. No rows are ever sent; the server rejects schemas with unexpected content.
3. **Design a study.** Choose the mode, sites, dataset, target, numeric features, model families, AutoML trial budget, minimum cohort and privacy policy (DP required, study-wide ε limit). A policy matrix rejects unsupported combinations, for example DP on a single site or regression on a categorical target.
4. **Train.** Each site splits its rows 70/15/15 locally. The coordinator builds global standardisation from per-site sums, then runs FedAvg or FedProx rounds. Under DP, agents clip their updates, the coordinator verifies the clip and adds Gaussian noise, and an RDP accountant tracks client-level (ε, δ) across every run and trial. Sites that miss a round are dropouts; the run fails if fewer than the minimum cohort respond.
5. **Evaluate on aggregates only.** Sites return confusion counts, score histograms (for AUROC), calibration bins or regression sums. Per-site figures computed on fewer than 20 rows are suppressed.
6. **AutoML.** Trials vary the model family, learning rate and local epochs within the study's budget. The best is chosen on **validation** data; the test split is used once, for the report.
7. **Release.** Every completed run gets a versioned, Ed25519-signed model artefact and a formatted PDF report.

| Mode | Data | What it is |
|---|---|---|
| Federated AutoML | Enrolled site agents | Federated learning between organisations |
| Local AutoML | One site agent | Private local ML, not federated (DP not offered) |
| Simulation | Synthetic, in-process | Demos and teaching only; reports say so |

## Run it locally

You need Python 3.12+ and Node 20+.

```bash
cd flip/backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

`requirements.txt` installs the shared `flipml` package and the agent in editable mode. On macOS or Linux use `.venv/bin/python`.

```bash
cd flip/frontend
npm install
npm run dev
```

Open <http://localhost:5180>. Then start three demo hospital agents in another terminal. Each gets its own synthetic readmissions CSV under `.flip-demo-sites/`, which is never uploaded:

```bash
cd flip
backend/.venv/Scripts/python -m flip_agent.demo --server http://localhost:8000
```

The seeded study **Hospital Readmission Risk** (ε ≤ 60) can then be trained from the developer portal.

### Running an agent at a real site

```bash
python -m flip_agent --state .flip-agent enrol --server https://flip.example.org --token flip_enrol_…
python -m flip_agent --state .flip-agent add-dataset --name readmissions --path ./readmissions.csv
python -m flip_agent --state .flip-agent run
```

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@flip.demo` | `admin123` |
| Model developer | `dev@flip.demo` | `dev12345` |
| Model developer | `tom@flip.demo` | `dev12345` |

These are seeded test credentials. Admins can turn on TOTP two-factor sign-in under Account; set `FLIP_REQUIRE_ADMIN_MFA=1` to make it mandatory.

## Reports

Every completed run has a report page (the one page in the app that scrolls; all other admin and developer pages fit one screen) and a **PDF** export:

1. Summary, generated from the results
2. Study and method, with a configuration table
3. Results, with numbered figures and captioned tables: metric curves, per-site curves and table, confusion matrix, per-class metrics with AUROC, reliability diagram, feature influence, AutoML trials
4. Privacy and security statement
5. Limitations
6. Discussion: the study owner's own notes, written on the report page
7. Comments and feedback: admin feedback, deployment reviews and comments from the report page

An appendix gives the artefact's SHA-256 and signing key ID. Verify a downloaded artefact against `/api/artefacts/public-key`.

## Theme

"Clinical Slate": slate surfaces, a navy rail and one teal accent, chosen for a calm, trustworthy look in regulated settings. Light and dark modes follow the system or the toggle in the top bar.

## Tests

```bash
cd flip/backend
.venv/Scripts/python -m pytest -q
```

26 tests cover authentication, lockout, RBAC, session revocation and TOTP; enrolment, signatures and replay protection; schema-only registration and the absence of upload routes; site task isolation and tenancy; the policy matrix and privacy budget; a full federated AutoML run across three real agents with signed-artefact verification; the PDF report with notes and comments; the aggregate-only evaluation; allowlisted site tasks; and the DP accountant.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `FLIP_DATABASE_URL` | SQLite file in `backend/` | e.g. `mysql+pymysql://user:pass@host/flip` |
| `FLIP_SECRET_KEY` | dev value | **Set in production.** Signs sessions and encrypts TOTP secrets |
| `FLIP_REQUIRE_ADMIN_MFA` | `0` | Block admin tools until two-factor is on |
| `FLIP_AGENT_TIMEOUT` | `60` | Seconds before a silent site counts as a dropout |
| `FLIP_MIN_REPORT_ROWS` | `20` | Per-site figures below this many rows are suppressed |
| `FLIP_ENROLMENT_TOKEN_HOURS` | `24` | Enrolment token lifetime |
| `FLIP_ROUND_DELAY` | `0.35` | Pause between rounds so progress is watchable |
| `FLIP_STORAGE_DIR` | `backend/storage` | Artefact signing key |
| `FLIP_SEED` | `1` | Seed demo data into an empty database |

The schema is versioned. In this prototype a version change rebuilds the database with fresh demo data; production would use migrations.

## Limits

See the gap analysis for the full picture. In short: no secure aggregation yet (Phase 2), no mTLS, no robust aggregation against malicious sites, numeric features only, and the coordinator runs jobs in-process (single worker). There is no external security review, so the document's go/no-go gate still applies.
