import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import MetaData, inspect

from .config import CORS_ORIGINS, SEED_DEMO_DATA, STORAGE_DIR
from .database import Base, SessionLocal, engine
from .models import JOB_ACTIVE, JOB_FAILED, SCHEMA_VERSION, AgentTask, Meta, ModelTraining, utcnow
from .realtime import manager
from .routers import agent, auth, dashboard, logs, projects, sites, training, users, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("flip")


def _ensure_schema() -> None:
    """Prototype migration policy: if the stored schema version differs, rebuild the database.
    (A production deployment would use Alembic migrations instead.)"""
    tables = inspect(engine).get_table_names()
    current = None
    if "meta" in tables:
        with engine.connect() as conn:
            row = conn.exec_driver_sql("SELECT value FROM meta WHERE key = 'schema_version'").first()
            current = row[0] if row else None
    if tables and current != SCHEMA_VERSION:
        log.warning("Database schema %s is out of date (need %s); rebuilding it with fresh demo data", current, SCHEMA_VERSION)
        old = MetaData()
        old.reflect(engine)
        old.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if not db.get(Meta, "schema_version"):
            db.add(Meta(key="schema_version", value=SCHEMA_VERSION))
            db.commit()
    finally:
        db.close()


def _fail_orphaned_jobs() -> None:
    """Jobs that were running when the server stopped cannot resume; mark them failed."""
    db = SessionLocal()
    try:
        for job in db.query(ModelTraining).filter(ModelTraining.status.in_(JOB_ACTIVE)):
            job.status, job.finished_at = JOB_FAILED, utcnow()
            job.error = "Server restarted while the job was running"
        db.query(AgentTask).filter(AgentTask.status.in_(("pending", "sent"))).update({AgentTask.status: "expired"})
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager.bind_loop(asyncio.get_running_loop())
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    _ensure_schema()
    _fail_orphaned_jobs()
    if SEED_DEMO_DATA:
        from .seed import seed_if_empty
        if await seed_if_empty():
            log.info("Seeded demo data")
    yield


app = FastAPI(
    title="FLIP API",
    description="Federated Learning Infrastructure Platform: studies, approvals, site agents, federated AutoML, "
                "audit logs and role-based access control. Research prototype.",
    version="2.0.0-phase1",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth, users, sites, agent, projects, training, logs, dashboard):
    app.include_router(r.router)
app.include_router(ws.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "online": manager.online_count(), "schema": SCHEMA_VERSION}
