# FLIP: Federated Learning Infrastructure Platform

A web platform where organisations train machine learning models together without sharing raw data. It implements the system described in *Federated Learning Infrastructure Platform (FLIP) with FastAPI and React* (S. D. Rahman, MSc thesis).

| Part | Who it's for | What it does |
|---|---|---|
| Home `/` | Anyone | Overview of the platform, how federated learning works, sign-up |
| Admin console `/admin` | Platform admins | Dashboard, project approvals with feedback, users and roles, logs, training control, model approvals, security, live event feed |
| Developer portal `/app` | Model developers | Apply for approval (with dataset upload), your projects, start and watch federated training live, training reports, model submissions, activity logs |

**Highlights:** glass-and-gradient theme with light and dark modes · animated live federation view (nodes send updates, the global model broadcasts back) · run leaderboard and side-by-side comparison · Ctrl+K command palette · count-up stats, animated charts and page transitions (all respect *reduce motion*).

**Stack:** React 18 + Vite + React Router · FastAPI · SQLAlchemy 2 · SQLite (dev) or MySQL · JWT + bcrypt · WebSockets · numpy

## What actually happens when you train

Training is real, not a mock-up. `backend/app/federated.py` runs federated learning across simulated nodes:

1. The project's data is split across *N* nodes (Hospital A, Hospital B, ...). An uploaded CSV is split with a label-skewed (non-IID) partition; without a CSV, each node gets its own synthetic data with a different class mix and feature shift.
2. Each round, the coordinator sends the global weights to the selected nodes. Every node trains locally with mini-batch SGD and returns only a weight update.
3. Updates are aggregated with **FedAvg** (sample-weighted) or **FedProx** (adds a proximal term for non-IID nodes).
4. Optional **differential privacy** clips each node's update and adds Gaussian noise to the aggregate. The report shows an indicative ε.
5. Each node evaluates the global model on its own held-out split. Round metrics stream to the browser over WebSocket.
6. The final report includes accuracy, macro precision, recall and F1, a confusion matrix, per-class and per-node results, and feature importance for linear models. Results and weights can be downloaded as JSON.

Models: softmax logistic regression and a one-hidden-layer MLP, written directly in numpy, so the platform has no GPU or framework dependency.

**CSV format:** a header row, numeric feature columns, and the label in the **last** column (for example `yes`/`no` or a class name). Missing numeric values are filled with the column mean.

## Run it locally

You need Python 3.12+ and Node 20+.

**Backend** (port 8000):

```bash
cd flip/backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

On macOS or Linux use `.venv/bin/python`. API docs are at <http://localhost:8000/docs>.

**Frontend** (port 5180, proxies `/api` and `/ws` to the backend):

```bash
cd flip/frontend
npm install
npm run dev
```

Open <http://localhost:5180>.

The first start creates `backend/flip.db` and seeds demo data, including three completed training runs. Delete `flip.db` and the `storage/` folder to start fresh.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@flip.demo` | `admin123` |
| Model developer | `dev@flip.demo` | `dev12345` |
| Model developer | `tom@flip.demo` | `dev12345` |

Admins sign in at `/admin/signin`; developers at `/signin`. These are seeded test credentials. Set `FLIP_SEED=0` to skip seeding.

**Trying both roles at once:** sessions are kept per browser origin, so open the admin at `http://localhost:5180` and the developer at a second dev server on `http://127.0.0.1:5181` (`npm run dev -- --port 5181 --host 127.0.0.1`). Approving a project in one window updates the other instantly.

## Run with Docker

```bash
cd flip
docker compose up --build
```

Website on <http://localhost:3000>, API on <http://localhost:8000>, MySQL as the database.

To add Elasticsearch and Kibana for log analytics, as described in the thesis:

```bash
FLIP_ELASTICSEARCH_URL=http://elasticsearch:9200 docker compose --profile monitoring up --build
```

Every audit event is then also indexed in `flip-logs`; open Kibana on <http://localhost:5601>.

## Tests

```bash
cd flip/backend
.venv/Scripts/python -m pytest -q
```

16 tests cover sign-in and lockout, RBAC, session revocation, the project approve/reject/resubmit lifecycle, upload validation, training on an uploaded CSV, FedProx + DP + partial participation, model submissions, log scoping and export, the WebSocket handshake, the public stats endpoint, and the FL engine itself.

## Configuration

All settings are environment variables (see `backend/app/config.py`):

| Variable | Default | Purpose |
|---|---|---|
| `FLIP_DATABASE_URL` | SQLite file in `backend/` | e.g. `mysql+pymysql://user:pass@host/flip` |
| `FLIP_SECRET_KEY` | dev value | **Set this in production.** Signs JWTs |
| `FLIP_TOKEN_MINUTES` | `120` | Session length |
| `FLIP_STORAGE_DIR` | `backend/storage` | Uploaded datasets |
| `FLIP_MAX_UPLOAD_MB` | `50` | Per-file upload limit |
| `FLIP_LOCKOUT_THRESHOLD` / `FLIP_LOCKOUT_MINUTES` | `5` / `15` | Account lockout after failed sign-ins |
| `FLIP_ROUND_DELAY` | `0.35` | Pause between rounds so progress is watchable. `0` for full speed |
| `FLIP_ELASTICSEARCH_URL` | empty | Mirror audit logs to Elasticsearch |
| `FLIP_SEED` | `1` | Seed demo data into an empty database |

## How it maps to the thesis

| Thesis | Implementation |
|---|---|
| Users, Projects, Logs, Model Training, Model Awaiting (§4.5.6) | `users`, `projects`, `logs`, `model_training`, `model_awaiting` tables, plus `datasets`, `training_rounds` and `notifications` |
| JWT authentication, RBAC, `admin_only` dependency (§4.7.4) | `security.py`, `deps.py`. Tokens carry a version so admins can revoke sessions |
| `AdminRoute.js` / `DeveloperRoute.js` (§4.6.1) | `components/RouteGuards.jsx` |
| Real-time WebSocket updates (§4.7.5) | `/ws`; the token is sent as the first message, never in the URL |
| Log monitoring with filters and export (§6.1) | Monitoring and Logging page, CSV export, optional Elasticsearch/Kibana |
| Security management: failed sign-ins, tokens (§6.1) | Security page: lockout, unlock, revoke sessions, disable account |
| Model training report (Figure 15) | Training report page with metrics and confusion matrix |
| Final models deployed or refined (§6.3) | Model submissions reviewed on Model Approvals |

## Limits of this build

- Nodes are simulated inside one server process; there is no remote client agent yet. The aggregation, privacy and reporting code is written so a real node agent could send the same weight updates.
- Training jobs run in the API process, so run a single worker (as the Dockerfile does). A job that is running when the server stops is marked failed on restart.
- Uploaded CSVs are stored on the server to drive the simulation. In a real deployment raw data would stay on each node.
- The MySQL configuration is provided for Docker but the test suite runs on SQLite.
