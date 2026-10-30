def _create(client, headers, name, **fields):
    body = {"project_name": name, "description": "A test project", "domain": "Healthcare",
            "mode": "simulation", "cohort_size": 3, **fields}
    return client.post("/api/projects", headers=headers, json=body)


def _wait(client, headers, training_id, timeout=30):
    from conftest import wait_for
    return wait_for(client, headers, training_id, timeout)


# ---------------------------------------------------------------- auth

def test_register_and_me(client):
    r = client.post("/api/auth/register", json={"username": "New Dev", "email": "New@Test.io", "password": "longenough"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "new@test.io" and me["role"] == "Developer"
    assert client.post("/api/auth/register", json={"username": "x", "email": "new@test.io", "password": "longenough"}).status_code in (400, 422)


def test_bad_password_and_lockout(client):
    client.post("/api/auth/register", json={"username": "Locky", "email": "lock@test.io", "password": "rightpass1"})
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "lock@test.io", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "lock@test.io", "password": "rightpass1"})
    assert r.status_code == 423


def test_admin_portal_rejects_developer(client):
    r = client.post("/api/auth/login", json={"email": "dev1@test.io", "password": "devpass111", "portal": "admin"})
    assert r.status_code == 403


def test_rbac(client, dev1, admin):
    assert client.get("/api/users", headers=dev1).status_code == 403
    assert client.get("/api/dashboard/admin", headers=dev1).status_code == 403
    assert client.get("/api/users", headers=admin).status_code == 200
    assert client.get("/api/projects").status_code == 401
    # Admins don't create projects; developers can't review them.
    assert _create(client, admin, "Admin Project").status_code == 403


def test_revoked_sessions_are_rejected(client, admin):
    r = client.post("/api/auth/register", json={"username": "Rev", "email": "rev@test.io", "password": "revpass123"})
    token, uid = r.json()["access_token"], r.json()["user"]["user_id"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=h).status_code == 200
    client.post(f"/api/users/{uid}/revoke-sessions", headers=admin)
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_cannot_remove_last_admin(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    r = client.patch(f"/api/users/{me['user_id']}", headers=admin, json={"role": "Developer"})
    assert r.status_code == 400


# ---------------------------------------------------------------- projects

def test_project_review_lifecycle(client, dev1, dev2, admin):
    r = _create(client, dev1, "Lifecycle Project")
    assert r.status_code == 201
    pid = r.json()["project_id"]
    assert r.json()["status"] == "Pending"
    assert _create(client, dev1, "lifecycle project").status_code == 400  # name is case-insensitive unique

    # Other developers can't see it.
    assert client.get(f"/api/projects/{pid}", headers=dev2).status_code == 404
    assert all(p["project_id"] != pid for p in client.get("/api/projects", headers=dev2).json())

    # Training isn't allowed before approval.
    assert client.post(f"/api/projects/{pid}/training", headers=dev1, json={}).status_code == 409

    # Rejection needs feedback; editing a rejected project resubmits it.
    assert client.post(f"/api/projects/{pid}/review", headers=admin, json={"decision": "Rejected"}).status_code == 422
    r = client.post(f"/api/projects/{pid}/review", headers=admin, json={"decision": "Rejected", "feedback": "Add objectives"})
    assert r.json()["status"] == "Rejected"
    r = client.patch(f"/api/projects/{pid}", headers=dev1, json={"objectives": "Reach 80%"})
    assert r.json()["status"] == "Pending"

    r = client.post(f"/api/projects/{pid}/review", headers=admin, json={"decision": "Approved"})
    assert r.json()["status"] == "Approved"
    notes = client.get("/api/notifications", headers=dev1).json()
    assert any("approved" in n["message"] for n in notes["items"])

    # Changing the cohort of an approved project sends it back for review.
    r = client.patch(f"/api/projects/{pid}", headers=dev1, json={"cohort_size": 5})
    assert r.json()["status"] == "Pending"


def test_training_synthetic_mlp_fedprox_with_dp(client, dev1, admin):
    pid = _create(client, dev1, "Synthetic MLP", families=["mlp"]).json()["project_id"]
    client.post(f"/api/projects/{pid}/review", headers=admin, json={"decision": "Approved"})
    r = client.post(f"/api/projects/{pid}/training", headers=dev1, json={
        "rounds": 6, "algorithm": "FedProx", "mu": 0.05, "dp_enabled": True, "noise_multiplier": 0.8,
        "client_fraction": 0.67, "learning_rate": 0.05})
    job = _wait(client, dev1, r.json()["training_id"])
    assert job["status"] == "Completed", job["error"]
    assert job["model_type"] == "mlp" and job["num_nodes"] == 3 and job["mode"] == "simulation"
    assert job["report"]["privacy"]["guarantee"] and job["report"]["privacy"]["unit"] == "client"
    # With a 2/3 client fraction exactly two of the three nodes train each round.
    assert all(sum(n["selected"] for n in r["nodes"]) == 2 for r in job["round_metrics"])


# ---------------------------------------------------------------- logs

def test_logs_scoping_and_export(client, dev1, admin):
    admin_logs = client.get("/api/logs?page_size=500", headers=admin).json()
    assert any(l["action"] == "auth.login_failed" for l in admin_logs["items"])
    dev_logs = client.get("/api/logs?page_size=500", headers=dev1).json()
    me = client.get("/api/auth/me", headers=dev1).json()
    assert dev_logs["total"] < admin_logs["total"]
    assert all(l["user_id"] == me["user_id"] or l["project_id"] for l in dev_logs["items"])
    exact = client.get("/api/logs?action=auth.login", headers=admin).json()["items"]
    assert exact and all(l["action"] == "auth.login" for l in exact)

    r = client.get("/api/logs/export.csv?action=project.", headers=admin)
    assert r.status_code == 200 and r.text.startswith("log_id,timestamp_utc")


def test_public_stats_needs_no_login(client):
    r = client.get("/api/public/stats")
    assert r.status_code == 200
    assert {"projects", "training_runs", "node_updates", "best_accuracy"} <= r.json().keys()


def test_websocket_requires_auth_and_streams(client, dev1):
    with client.websocket_connect("/ws") as ws:
        ws.send_text('{"type":"auth","token":"nope"}')
        assert ws.receive_json()["type"] == "error"
    token = dev1["Authorization"].split()[1]
    with client.websocket_connect("/ws") as ws:
        ws.send_text(f'{{"type":"auth","token":"{token}"}}')
        assert ws.receive_json()["type"] == "hello"
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"
