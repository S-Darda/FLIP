import os
import sys
import tempfile
from pathlib import Path

import pytest

# Configure an isolated database and storage before the app is imported.
_tmp = Path(tempfile.mkdtemp(prefix="flip-test-"))
os.environ["FLIP_DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["FLIP_STORAGE_DIR"] = str(_tmp / "storage")
os.environ["FLIP_SEED"] = "0"
os.environ["FLIP_ROUND_DELAY"] = "0"
os.environ["FLIP_AGENT_TIMEOUT"] = "8"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Organisation, User  # noqa: E402
from app.security import hash_password  # noqa: E402

TMP = _tmp


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        db = SessionLocal()
        a, b = Organisation(name="Org A"), Organisation(name="Org B")
        db.add_all([a, b])
        db.commit()
        db.add_all([
            User(username="Ada Admin", email="admin@test.io", password_hash=hash_password("adminpass1"), role="Admin"),
            User(username="Dev One", email="dev1@test.io", password_hash=hash_password("devpass111"), role="Developer", organisation_id=a.org_id),
            User(username="Dev Two", email="dev2@test.io", password_hash=hash_password("devpass222"), role="Developer", organisation_id=b.org_id),
        ])
        db.commit()
        db.close()
        yield c


def _login(client, email, password, portal="developer"):
    r = client.post("/api/auth/login", json={"email": email, "password": password, "portal": portal})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return _login(client, "admin@test.io", "adminpass1", "admin")


@pytest.fixture
def dev1(client):
    return _login(client, "dev1@test.io", "devpass111")


@pytest.fixture
def dev2(client):
    return _login(client, "dev2@test.io", "devpass222")


def wait_for(client, headers, training_id, timeout=60):
    import time
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/api/training/{training_id}", headers=headers).json()
        if job["status"] not in ("Queued", "In Progress"):
            return job
        time.sleep(0.1)
    raise AssertionError("training did not finish")
