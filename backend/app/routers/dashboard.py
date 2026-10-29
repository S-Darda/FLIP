from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import serialize_log
from ..database import get_db
from ..deps import admin_only, developer_only, get_current_user
from ..models import (JOB_ACTIVE, JOB_COMPLETED, PROJECT_PENDING, PROJECT_STATUSES, ROLES, Log,
                      ModelAwaiting, ModelTraining, Notification, Project, User, utcnow)
from ..realtime import manager
from ..schemas import iso, project_out, training_out, user_out

router = APIRouter(prefix="/api", tags=["dashboard"])


def _daily(db: Session, column, days: int, *filters) -> list[dict]:
    start = (utcnow() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.query(func.date(column), func.count()).filter(column >= start, *filters) \
        .group_by(func.date(column)).all()
    counts = {str(d): c for d, c in rows}
    out = []
    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        out.append({"date": day, "count": counts.get(day, 0)})
    return out


@router.get("/dashboard/admin")
def admin_dashboard(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    users_by_role = dict(db.query(User.role, func.count()).group_by(User.role).all())
    projects_by_status = dict(db.query(Project.status, func.count())
                              .filter(Project.archived.is_(False)).group_by(Project.status).all())
    jobs_by_status = dict(db.query(ModelTraining.status, func.count()).group_by(ModelTraining.status).all())
    avg_acc = db.query(func.avg(ModelTraining.accuracy)).filter(ModelTraining.status == JOB_COMPLETED).scalar()
    since = utcnow() - timedelta(hours=24)
    failed_24h = db.query(Log).filter(Log.action == "auth.login_failed", Log.timestamp >= since).count()
    pending = db.query(Project).filter(Project.status == PROJECT_PENDING, Project.archived.is_(False)) \
        .order_by(Project.created_at).limit(6).all()
    running = db.query(ModelTraining).filter(ModelTraining.status.in_(JOB_ACTIVE)).all()
    recent_done = db.query(ModelTraining).filter(ModelTraining.status == JOB_COMPLETED) \
        .order_by(ModelTraining.finished_at.desc()).limit(8).all()
    recent_logs = db.query(Log).order_by(Log.timestamp.desc(), Log.log_id.desc()).limit(10).all()
    return {
        "users": {r: users_by_role.get(r, 0) for r in ROLES},
        "projects": {s: projects_by_status.get(s, 0) for s in PROJECT_STATUSES},
        "training": jobs_by_status,
        "average_accuracy": avg_acc,
        "pending_models": db.query(ModelAwaiting).filter(ModelAwaiting.status.in_(("Pending", "In Review"))).count(),
        "failed_logins_24h": failed_24h,
        "online_users": manager.online_count(),
        "activity": _daily(db, Log.timestamp, 14),
        "failed_logins": _daily(db, Log.timestamp, 14, Log.action == "auth.login_failed"),
        "pending_projects": [project_out(p) for p in pending],
        "running_jobs": [training_out(t) for t in running],
        "recent_completed": [training_out(t) for t in reversed(recent_done)],
        "recent_logs": [serialize_log(l) for l in recent_logs],
    }


@router.get("/dashboard/developer")
def developer_dashboard(user: User = Depends(developer_only), db: Session = Depends(get_db)):
    projects = db.query(Project).filter(Project.created_by == user.user_id, Project.archived.is_(False)) \
        .order_by(Project.updated_at.desc()).all()
    jobs = db.query(ModelTraining).join(Project).filter(Project.created_by == user.user_id) \
        .order_by(ModelTraining.training_id.desc()).limit(10).all()
    best = max((j.accuracy for j in jobs if j.status == JOB_COMPLETED and j.accuracy is not None), default=None)
    by_status = {s: 0 for s in PROJECT_STATUSES}
    for p in projects:
        by_status[p.status] = by_status.get(p.status, 0) + 1
    return {
        "projects": by_status,
        "project_list": [project_out(p) for p in projects[:6]],
        "jobs": [training_out(j) for j in jobs],
        "running": sum(1 for j in jobs if j.status in JOB_ACTIVE),
        "completed": db.query(ModelTraining).join(Project).filter(
            Project.created_by == user.user_id, ModelTraining.status == JOB_COMPLETED).count(),
        "best_accuracy": best,
        "models_submitted": db.query(ModelAwaiting).filter(ModelAwaiting.requested_by == user.user_id).count(),
    }


@router.get("/security/overview")
def security_overview(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    now = utcnow()
    locked = db.query(User).filter(User.locked_until > now).all()
    at_risk = db.query(User).filter(User.failed_logins > 0).order_by(User.failed_logins.desc()).limit(20).all()
    disabled = db.query(User).filter(User.is_active.is_(False)).all()
    events = db.query(Log).filter(Log.action.in_(("auth.login_failed", "auth.login_blocked", "auth.login_denied"))) \
        .order_by(Log.timestamp.desc()).limit(50).all()
    by_ip = db.query(Log.ip_address, func.count()).filter(
        Log.action == "auth.login_failed", Log.timestamp >= now - timedelta(days=7)) \
        .group_by(Log.ip_address).order_by(func.count().desc()).limit(10).all()
    return {
        "locked": [user_out(u) for u in locked],
        "at_risk": [user_out(u) for u in at_risk],
        "disabled": [user_out(u) for u in disabled],
        "events": [serialize_log(l) for l in events],
        "failed_by_ip": [{"ip": ip or "unknown", "count": c} for ip, c in by_ip],
        "failed_logins": _daily(db, Log.timestamp, 14, Log.action == "auth.login_failed"),
    }


@router.get("/notifications")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Notification).filter(Notification.user_id == user.user_id) \
        .order_by(Notification.created_at.desc(), Notification.id.desc()).limit(30).all()
    unread = db.query(Notification).filter(Notification.user_id == user.user_id,
                                           Notification.is_read.is_(False)).count()
    return {"unread": unread, "items": [
        {"id": n.id, "message": n.message, "link": n.link, "is_read": n.is_read,
         "created_at": iso(n.created_at)} for n in rows]}


@router.post("/notifications/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == user.user_id, Notification.is_read.is_(False)) \
        .update({Notification.is_read: True})
    db.commit()
    return {"ok": True}


@router.get("/search")
def search(q: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    like = f"%{q}%"
    pq = db.query(Project).filter(Project.project_name.ilike(like))
    if user.role != "Admin":
        pq = pq.filter(Project.created_by == user.user_id)
    result = {"projects": [{"project_id": p.project_id, "project_name": p.project_name, "status": p.status}
                           for p in pq.limit(8)]}
    if user.role == "Admin":
        result["users"] = [{"user_id": u.user_id, "username": u.username, "email": u.email}
                           for u in db.query(User).filter((User.username.ilike(like)) | (User.email.ilike(like))).limit(8)]
    return result
