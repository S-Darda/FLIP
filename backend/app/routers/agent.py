"""API used by site agents. Every call except enrolment is signed with the site's Ed25519 key
(see deps.site_auth). Sites receive only their own tasks and can only answer their own tasks."""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from flipml import PROTOCOL_VERSION

from ..audit import record
from ..database import get_db
from ..deps import client_ip, site_auth
from ..models import SITE_ACTIVE, SITE_PENDING, AgentTask, Site, SiteDataset, utcnow
from ..schemas import DatasetIn, EnrolIn, TaskResultIn
from ..security import hash_token

router = APIRouter(prefix="/api/agent", tags=["site agent"])

MAX_COLUMNS = 500


@router.post("/enrol")
def enrol(body: EnrolIn, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.token_hash == hash_token(body.token)).first()
    if not site or site.status != SITE_PENDING or not site.token_expires or site.token_expires < utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Enrolment token is invalid, used or expired")
    site.public_key, site.status, site.token_hash = body.public_key, SITE_ACTIVE, None
    site.agent_version, site.enrolled_at, site.last_seen, site.last_request_ms = body.agent_version, utcnow(), utcnow(), 0
    db.commit()
    record(db, "site.enrol", f"Site '{site.name}' enrolled (key {body.public_key[:16]}…, agent {body.agent_version})")
    return {"site_id": site.site_id, "site_name": site.name, "organisation": site.org.name,
            "protocol_version": PROTOCOL_VERSION}


@router.post("/heartbeat")
def heartbeat(site: Site = Depends(site_auth)):
    return {"ok": True, "site": site.name, "protocol_version": PROTOCOL_VERSION}


@router.post("/datasets")
def register_dataset(body: DatasetIn, site: Site = Depends(site_auth), db: Session = Depends(get_db)):
    """Store a dataset's schema. Anything that looks like row data is refused."""
    schema = body.schema_
    cols = schema.get("columns")
    if not isinstance(cols, list) or not cols or len(cols) > MAX_COLUMNS or not isinstance(schema.get("rows"), int):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Schema must list columns and a row count")
    allowed = {"name", "type", "missing", "distinct", "values"}
    for c in cols:
        if not isinstance(c, dict) or set(c) - allowed or c.get("type") not in ("numeric", "categorical"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unexpected schema content")
        if c.get("values") is not None and (not isinstance(c["values"], list) or len(c["values"]) > 20):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "At most 20 category values per column")
    clean = {"rows": schema["rows"], "columns": [{k: c.get(k) for k in allowed} for c in cols]}
    ds = db.query(SiteDataset).filter(SiteDataset.site_id == site.site_id, SiteDataset.name == body.name).first()
    if ds is None:
        ds = SiteDataset(site_id=site.site_id, name=body.name)
        db.add(ds)
    ds.schema, ds.rows, ds.updated_at = json.dumps(clean), clean["rows"], utcnow()
    db.commit()
    record(db, "site.dataset", f"Site '{site.name}' registered dataset '{body.name}' "
           f"({clean['rows']} rows, {len(cols)} columns; schema only)")
    return {"ok": True, "dataset": body.name}


@router.get("/tasks")
async def poll_tasks(wait: float = Query(20, ge=0, le=30), site: Site = Depends(site_auth), db: Session = Depends(get_db)):
    """Long-poll for this site's pending tasks."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + wait
    while True:
        db.expire_all()
        rows = db.query(AgentTask).filter(AgentTask.site_id == site.site_id, AgentTask.status == "pending") \
            .order_by(AgentTask.task_id).limit(10).all()
        if rows or loop.time() >= deadline:
            break
        await asyncio.sleep(0.2)
    for t in rows:
        t.status = "sent"
    db.commit()
    return {"tasks": [{"task_id": t.task_id, "kind": t.kind, "training_id": t.training_id, "round": t.round,
                       "payload": json.loads(t.payload)} for t in rows]}


@router.post("/tasks/{task_id}/result")
def submit_result(task_id: int, body: TaskResultIn, site: Site = Depends(site_auth), db: Session = Depends(get_db)):
    task = db.get(AgentTask, task_id)
    if not task or task.site_id != site.site_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if task.status not in ("sent", "pending"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Task is already {task.status}")
    if body.error:
        task.status, task.error = "failed", body.error[:2000]
    elif body.result is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Send a result or an error")
    else:
        task.status, task.result = "done", json.dumps(body.result)
    db.commit()
    return {"ok": True}
