# FLIP: gap analysis against the security architecture (v1.0 draft, 29 Oct 2026)

This compares the codebase with *Technical Concept & Preliminary Security Architecture: FLIP, Security-First Federated AutoML Platform*. It is a planning aid, not a security assessment.

**Status key:** ✅ in place · 🟡 partial or simulated · ❌ not started

## Phase 1 status (30 Oct 2026)

Phase 1 is built on branch `phase1-wip`. Delivered against the exit criterion *"no raw uploads; auth and tenancy tests pass; reproducible baseline"*:

- ✅ No raw uploads: upload routes are removed; sites register schemas only, and tests check both.
- ✅ Signed site agent (`agent/`): it enrols with a one-time token and its own Ed25519 key, signs every request with replay protection, and answers only allowlisted `prepare`, `train` and `eval` tasks.
- ✅ Organisations, sites and tenancy: sites can only fetch and answer their own tasks, and developers can't see other developers' studies, runs or artefacts.
- ✅ Study definitions with a policy matrix that blocks unsupported combinations.
- ✅ Federated and Local AutoML with validation-based selection, plus regression (MAE, RMSE, R²), AUROC and calibration.
- ✅ Admin TOTP MFA (optionally enforced), with secrets encrypted at rest.
- ✅ Signed, versioned model artefacts.
- ✅ A study-wide privacy budget with composition across trials (a Phase 2 item, delivered early).
- ✅ Small-group suppression of per-site metrics (a Phase 2 item, delivered early).
- ✅ Formatted PDF reports.

Still open: secure aggregation, mTLS, robust aggregation, the attack harness, external review. The tables below describe the state **before** Phase 1 and are kept for reference.

## Where the build stood before Phase 1

The current build is a **single-server simulation**. Sites are simulated inside the API process, and a CSV a developer uploads is stored on the server and split across those simulated sites. In the document's terms it demonstrates the federated protocol, but it is **not** the "Federated AutoML: recommended" mode, because raw rows do leave the owner, and the coordinator can see every individual update.

Fixed in this pass, so the product no longer overclaims:

- Replaced "Share nothing", "Data never leaves home" and "raw rows stay with the nodes" with accurate copy, and added a visible prototype notice on the home page and the upload box.
- Replaced the rough ε formula with a Rényi-DP accountant (`backend/app/privacy.py`). It states the protected unit (client), mechanism, δ and the "no subsampling amplification" assumption. Reports say plainly when there is no formal guarantee.
- The training dialog previews the (ε, δ) a run will spend and warns when ε > 10. The default noise multiplier rose from 0.5 to 1.0.

## Section-by-section

### 01 Vision and boundaries

| Requirement | Status | Notes |
|---|---|---|
| Three clearly named modes (local, federated, confidential server) | ❌ | Only the simulated federated mode exists. Runs are not labelled by mode. |
| No-code experiment set-up | 🟡 | Project form plus training dialog. No target/feature selection; the label is always the last CSV column. |
| Data minimisation: raw rows stay at source | ❌ | CSVs are uploaded. Needs the site agent (Phase 1). |
| Confidential updates against a curious coordinator | ❌ | No secure aggregation; the coordinator sees every update. |
| Model governance (export, inference access) | 🟡 | Admin model approval exists; anyone who can see a completed run can download its weights. |
| Data privacy vs model confidentiality stated separately | 🟡 | Now stated in the FAQ and reports; no inference-only access mode. |
| MVP: tabular classification and regression | 🟡 | Classification only. No regression, MAE/RMSE or AUROC. |
| Neural-network FedAvg first; XGBoost/RF kept separate | ✅ | MLP and logistic regression with FedAvg/FedProx; no tree models claimed. |

### 02 System architecture

| Component | Status | Notes |
|---|---|---|
| React dashboard, FastAPI orchestration | ✅ | |
| Federation coordinator with round membership | 🟡 | In-process; client fraction supported. No real remote clients. |
| Identity provider, OIDC, MFA, tenant isolation | ❌ | Local JWT accounts with two roles. No organisations or tenants, no MFA. |
| Signed client/workload policies, consent tracking | ❌ | |
| TLS/mTLS, KMS, encrypted artefacts | ❌ | Plain HTTP in development; weights stored as JSON text. |
| Audit trails | ✅ | Logs table, CSV export, optional Elasticsearch. No tamper evidence. |
| Secure aggregation (SecAgg/SecAgg+) | ❌ | |
| Privacy-accounted DP | 🟡 | Client-level Gaussian mechanism with an RDP accountant. No per-study budget limit yet. |
| Minimum cohort policy | 🟡 | At least 2 nodes. No configurable minimum, no dropout threshold. |
| Signed site agent, local connector, sandboxed training, protected outbound updates | ❌ | The central missing piece. |

### 03 Threat model

| Threat | Current defence | Gap |
|---|---|---|
| Gradient inversion / update inference | Optional clipping and DP | No secure aggregation; individual updates are visible server-side. |
| Membership / model inversion | Optional client-level DP | No membership-inference test harness. |
| Malicious or poisoned client | None (clients are simulated) | Enrolment, signed workloads, anomaly monitoring. |
| Model theft / extraction | Role checks on download | No gated export, encryption at rest or rate limits. |
| Endpoint / supply-chain compromise | n/a (no agent yet) | Signed releases, dependency scanning, sandbox. |
| Metadata and report leakage | Reports are aggregate; per-node accuracy is shown | No small-group suppression. Per-node metrics may need thresholds. |

### 04 Security baseline

| Area | Status |
|---|---|
| Identity and access (OIDC, MFA, org separation, client certificates) | ❌, apart from bcrypt passwords, lockout and session revocation ✅ |
| Communications (TLS 1.3, mTLS, rotation) | ❌ |
| Update privacy (verified SecAgg, minimum clients, dropout/collusion tests) | ❌ |
| Differential privacy (documented mechanism, accountant, hard budget limits) | 🟡 mechanism and accountant ✅, limits ❌ |
| Model protection (encryption, signed artefacts, export approvals) | 🟡 approval workflow only |
| Endpoint controls | ❌ (no agent) |
| Reporting (aggregate-only, group-size threshold, permission checks) | 🟡 permission checks ✅, thresholds ❌ |
| Operational security (vulnerability management, pen tests, incident plan) | ❌ |
| UI blocks unsupported algorithm/security combinations | 🟡 server validates inputs; no policy matrix |

### 05 Roadmap and evaluation

| Measure | Status |
|---|---|
| F1, precision, recall, confusion matrix | ✅ |
| AUROC, calibration, fairness; MAE/RMSE for regression | ❌ |
| ε/δ reporting | ✅ (now accounted) |
| Membership-inference advantage, reconstruction attempts | ❌ |
| Poisoning, dropout and extraction stress tests | ❌ |
| Train time, rounds | ✅ · network bytes, CPU/RAM ❌ |

## Proposed build order for this codebase

### Phase 1: secure local MVP

Exit criterion from the document: *no raw uploads; auth and tenancy tests pass; reproducible baseline.*

1. **Organisations and tenancy.** Add an `organisations` table; users, sites, studies and artefacts are scoped to an organisation; cross-tenant access tests.
2. **Site agent** (`agent/`, a standalone Python package). It enrols with a one-time token and gets an Ed25519 identity. It reads a local CSV through a connector and reports only the **schema and row count**. It trains with an allowlisted model set and never accepts code from the server. The upload path for training data is then removed.
3. **Study definition.** Target, allowed features, task type (classification or regression), algorithm family, maximum trials, privacy policy and eligible sites, with a policy matrix that rejects unsupported combinations.
4. **Local AutoML.** A bounded hyperparameter search per study, with the best configuration chosen on held-out data. Runs on a single site are labelled *Local AutoML*, never federated.
5. **Admin MFA** (TOTP) and signed, versioned model artefacts.
6. **Regression support** with MAE/RMSE, plus AUROC and calibration for classification.

### Phase 2: federated privacy

1. **Secure aggregation** with pairwise masking between agents (SecAgg-style, X25519 key agreement), with a dropout threshold and a minimum cohort size. Alternatively, adopt Flower SecAgg+, as the document suggests. The coordinator then only ever sees the masked sum.
2. **Per-study privacy budget** with a hard ε limit enforced before each round, and Poisson client sampling with an amplification-aware accountant.
3. **Disclosure controls.** Suppress per-site metrics below a group-size threshold; aggregate-only reports by default.
4. **Attack harness.** Membership-inference advantage and gradient-inversion checks against private and non-private baselines (hypothesis H1).

### Phase 3: hardening and research

Robust aggregation against poisoned clients, an encrypted model registry with gated export and rate-limited inference, tamper-evident audit logs, mTLS, an optional TEE study, and an external security review. The document's go/no-go gate applies: **no sensitive real-world data before then.**

## Decisions to record before Phase 1

Recommended defaults are in *italics*; each is the owner's call.

- **Users and data sensitivity:** *university research with synthetic or public datasets until the go/no-go gate.*
- **Meaning of "no data leaves the site":** *raw records only. Individual updates are protected by secure aggregation; aggregates, the final model and metadata are acknowledged residual risks.*
- **Model access:** *participants can download weights (as client-side training requires); no claim of model secrecy from participants.*
- **Federation size:** *3 to 10 sites, tolerating up to 1/3 dropout per round; minimum 3 sites per aggregate.*
- **Threat model:** *honest-but-curious coordinator, possibly malicious external attacker; malicious clients out of scope until Phase 3.*
- **Jurisdiction and DPIA:** *UK, with a DPIA required before any real personal data.*
