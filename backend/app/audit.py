"""Audit trail: every significant action is written to the logs table, pushed live to
admins, and optionally mirrored to Elasticsearch for Kibana dashboards."""
import logging
from concurrent.futures import ThreadPoolExecutor

import httpx
from sqlalchemy.orm import Session

from .config import ELASTICSEARCH_INDEX, ELASTICSEARCH_URL
from .models import Log, Notification, User
from .realtime import manager

logger = logging.getLogger("flip.audit")
_es_pool = ThreadPoolExecutor(max_workers=2) if ELASTICSEARCH_URL else None


def _ship_to_elasticsearch(doc: dict) -> None:
    try:
        httpx.post(f"{ELASTICSEARCH_URL.rstrip('/')}/{ELASTICSEARCH_INDEX}/_doc", json=doc, timeout=3)
    except httpx.HTTPError as exc:
        logger.warning("Elasticsearch shipping failed: %s", exc)


def serialize_log(log: Log) -> dict:
    return {
        "log_id": log.log_id,
        "timestamp": log.timestamp.isoformat() + "Z",
        "level": log.level,
        "action": log.action,
        "log_message": log.log_message,
        "user_id": log.user_id,
        "username": log.user.username if log.user else None,
        "project_id": log.project_id,
        "project_name": log.project.project_name if log.project else None,
        "ip_address": log.ip_address,
    }


def record(
    db: Session,
    action: str,
    message: str,
    *,
    user: User | int | None = None,
    project_id: int | None = None,
    level: str = "info",
    ip: str | None = None,
    owner_id: int | None = None,
) -> Log:
    """Write a log row and commit. `owner_id` also streams the entry to that developer."""
    user_id = user.user_id if isinstance(user, User) else user
    log = Log(action=action, log_message=message, user_id=user_id, project_id=project_id,
              level=level, ip_address=ip)
    db.add(log)
    db.commit()
    db.refresh(log)
    data = serialize_log(log)
    manager.publish({"type": "log", "log": data}, users=[owner_id] if owner_id else (), admins=True)
    if _es_pool:
        _es_pool.submit(_ship_to_elasticsearch, data)
    return log


def notify(db: Session, user_id: int, message: str, link: str | None = None, kind: str = "info") -> None:
    n = Notification(user_id=user_id, message=message, link=link)
    db.add(n)
    db.commit()
    db.refresh(n)
    manager.publish({
        "type": "notification",
        "kind": kind,
        "notification": {"id": n.id, "message": n.message, "link": n.link, "is_read": False,
                         "created_at": n.created_at.isoformat() + "Z"},
    }, users=[user_id])


def notify_admins(db: Session, message: str, link: str | None = None, kind: str = "info") -> None:
    from .models import ROLE_ADMIN
    for (uid,) in db.query(User.user_id).filter(User.role == ROLE_ADMIN, User.is_active.is_(True)):
        notify(db, uid, message, link, kind)
