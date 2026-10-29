import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, SEED_DEMO_DATA, STORAGE_DIR
from .database import Base, SessionLocal, engine
from .models import JOB_ACTIVE, JOB_FAILED, ModelTraining, utcnow
from .realtime import manager
from .routers import auth, dashboard, logs, projects, training, users, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _fail_orphaned_jobs() -> None:
    """Jobs that were running when the server stopped cannot resume; mark them failed."""
    db = SessionLocal()
    try:
        for job in db.query(ModelTraining).filter(ModelTraining.status.in_(JOB_ACTIVE)):
            job.status, job.finished_at = JOB_FAILED, utcnow()
            job.error = "Server restarted while the job was running"
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager.bind_loop(asyncio.get_running_loop())
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    _fail_orphaned_jobs()
    if SEED_DEMO_DATA:
        from .seed import seed_if_empty
        if await seed_if_empty():
            logging.getLogger("flip").info("Seeded demo data")
    yield


app = FastAPI(
    title="FLIP API",
    description="Federated Learning Infrastructure Platform: projects, approvals, federated training, "
                "audit logs and role-based access control.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth, users, projects, training, logs, dashboard):
    app.include_router(r.router)
app.include_router(ws.router)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok", "online": manager.online_count()}
