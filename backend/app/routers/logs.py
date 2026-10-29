import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from ..audit import record, serialize_log
from ..database import get_db
from ..deps import get_current_user
from ..models import ROLE_ADMIN, Log, Project, User

router = APIRouter(prefix="/api/logs", tags=["logs"])


def _parse_date(value: str | None, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        d = datetime.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(422, f"Invalid date: {value}")
    return d + timedelta(days=1) if end else d


def _filtered(db: Session, user: User, user_id, project_id, action, level, date_from, date_to, q):
    query = db.query(Log).options(joinedload(Log.user), joinedload(Log.project))
    if user.role != ROLE_ADMIN:
        own_projects = db.query(Project.project_id).filter(Project.created_by == user.user_id)
        query = query.filter(or_(Log.user_id == user.user_id, Log.project_id.in_(own_projects)))
        # Developers never see sign-in noise or other people's security events.
        query = query.filter(~Log.action.like("security.%"))
    if user_id:
        query = query.filter(Log.user_id == user_id)
    if project_id:
        query = query.filter(Log.project_id == project_id)
    if action:
        # "auth." selects a whole family; "auth.login" matches only that exact action.
        query = query.filter(Log.action.like(f"{action}%") if action.endswith(".") else Log.action == action)
    if level:
        query = query.filter(Log.level == level)
    if (start := _parse_date(date_from)):
        query = query.filter(Log.timestamp >= start)
    if (end := _parse_date(date_to, end=True)):
        query = query.filter(Log.timestamp < end)
    if q:
        query = query.filter(Log.log_message.ilike(f"%{q}%"))
    return query


@router.get("")
def list_logs(user_id: int | None = None, project_id: int | None = None, action: str | None = None,
              level: str | None = None, date_from: str | None = None, date_to: str | None = None,
              q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500),
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = _filtered(db, user, user_id, project_id, action, level, date_from, date_to, q)
    total = query.count()
    rows = query.order_by(Log.timestamp.desc(), Log.log_id.desc()) \
        .offset((page - 1) * page_size).limit(page_size).all()
    return {"total": total, "page": page, "page_size": page_size, "items": [serialize_log(l) for l in rows]}


@router.get("/actions")
def list_actions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Log.action, func.count(Log.log_id)).group_by(Log.action).order_by(Log.action).all()
    return [{"action": a, "count": c} for a, c in rows
            if user.role == ROLE_ADMIN or not a.startswith("security.")]


@router.get("/export.csv")
def export_logs(user_id: int | None = None, project_id: int | None = None, action: str | None = None,
                level: str | None = None, date_from: str | None = None, date_to: str | None = None,
                q: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = _filtered(db, user, user_id, project_id, action, level, date_from, date_to, q) \
        .order_by(Log.timestamp.desc()).limit(100_000).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["log_id", "timestamp_utc", "level", "action", "user", "project", "ip_address", "message"])
    for l in rows:
        w.writerow([l.log_id, l.timestamp.isoformat(), l.level, l.action,
                    l.user.username if l.user else "", l.project.project_name if l.project else "",
                    l.ip_address or "", l.log_message])
    record(db, "logs.export", f"{user.username} exported {len(rows)} log entries", user=user)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="flip-logs-{stamp}.csv"'})
