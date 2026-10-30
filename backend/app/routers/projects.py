"""Studies. Phase 1 removes dataset uploads entirely: a study points at a dataset that each site
agent has registered by schema, and training data never reaches this server."""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from flipml import FAMILIES

from ..audit import notify, notify_admins, record
from ..database import get_db
from ..deps import admin_only, developer_only, get_current_user, get_visible_project
from ..models import (JOB_ACTIVE, MODES, PROJECT_APPROVED, PROJECT_PENDING, PROJECT_REJECTED, ROLE_ADMIN,
                      Project, User, utcnow)
from ..policy import check_study
from ..realtime import manager
from ..schemas import DOMAINS, MODE_LABELS, ProjectIn, ProjectUpdate, ReviewIn, project_out

router = APIRouter(prefix="/api/projects", tags=["projects"])

JSON_FIELDS = ("features", "site_ids", "families")
SCOPE_FIELDS = {"project_name", "domain", "mode", "task_type", "dataset_name", "target", "features", "site_ids",
                "cohort_size", "min_sites", "families", "max_trials", "dp_required", "max_epsilon"}


def _name_taken(db: Session, name: str, exclude: int | None = None) -> bool:
    q = db.query(Project).filter(Project.project_name.ilike(name.strip()))
    if exclude:
        q = q.filter(Project.project_id != exclude)
    return q.first() is not None


def _apply(project: Project, data: dict) -> None:
    for k, v in data.items():
        setattr(project, k, json.dumps(v) if k in JSON_FIELDS else (v.strip() if k == "project_name" else v))


def _current(project: Project) -> dict:
    out = {k: getattr(project, k) for k in SCOPE_FIELDS}
    for k in JSON_FIELDS:
        out[k] = json.loads(getattr(project, k) or "[]")
    return out


@router.get("/options")
def options():
    return {"domains": DOMAINS, "modes": [{"value": m, "label": MODE_LABELS[m]} for m in MODES],
            "families": [{"value": k, "label": v} for k, v in FAMILIES.items()],
            "model_types": [{"value": k, "label": v} for k, v in FAMILIES.items()]}


@router.get("")
def list_projects(status_: str | None = Query(default=None, alias="status"), q: str | None = None,
                  archived: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Project).filter(Project.archived.is_(archived))
    if user.role != ROLE_ADMIN:
        query = query.filter(Project.created_by == user.user_id)
    if status_:
        query = query.filter(Project.status == status_)
    if q:
        like = f"%{q}%"
        query = query.join(User, Project.created_by == User.user_id).filter(
            or_(Project.project_name.ilike(like), Project.description.ilike(like), User.username.ilike(like)))
    return [project_out(p) for p in query.order_by(Project.created_at.desc()).all()]


@router.post("", status_code=201)
def create_project(body: ProjectIn, user: User = Depends(developer_only), db: Session = Depends(get_db)):
    if _name_taken(db, body.project_name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project with this name already exists")
    data = check_study(db, body.model_dump())
    project = Project(created_by=user.user_id, status=PROJECT_PENDING)
    _apply(project, data)
    db.add(project)
    db.commit()
    db.refresh(project)
    record(db, "project.create", f"{user.username} submitted {MODE_LABELS[project.mode]} study '{project.project_name}' for approval",
           user=user, project_id=project.project_id, owner_id=user.user_id)
    notify_admins(db, f"New study awaiting approval: {project.project_name}", f"/admin/projects/{project.project_id}")
    manager.publish({"type": "project", "project": project_out(project)}, users=[user.user_id], admins=True)
    return project_out(project, detail=True)


@router.get("/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return project_out(get_visible_project(project_id, db, user), detail=True)


@router.patch("/{project_id}")
def update_project(project_id: int, body: ProjectUpdate, user: User = Depends(developer_only), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    data = body.model_dump(exclude_unset=True)
    if not data:
        return project_out(project, detail=True)
    if "project_name" in data and _name_taken(db, data["project_name"], exclude=project_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project with this name already exists")
    if any(project.trainings[i].status in JOB_ACTIVE for i in range(len(project.trainings))):
        raise HTTPException(status.HTTP_409_CONFLICT, "Wait for the running training job to finish before editing")
    merged = {**_current(project), **{k: v for k, v in data.items() if k in SCOPE_FIELDS}}
    changed_scope = [k for k in SCOPE_FIELDS & data.keys() if data[k] != _current(project)[k]]
    if changed_scope:
        data.update(check_study(db, merged))
        data = {k: v for k, v in data.items() if k in ProjectUpdate.model_fields}
    resubmit = project.status == PROJECT_REJECTED or (project.status == PROJECT_APPROVED and changed_scope)
    _apply(project, data)
    if resubmit:
        project.status, project.reviewed_at, project.reviewed_by = PROJECT_PENDING, None, None
    db.commit()
    db.refresh(project)
    msg = f"{user.username} updated '{project.project_name}'"
    if resubmit:
        msg += " and resubmitted it for approval"
        notify_admins(db, f"Study resubmitted: {project.project_name}", f"/admin/projects/{project_id}")
    record(db, "project.update", msg, user=user, project_id=project_id, owner_id=user.user_id)
    manager.publish({"type": "project", "project": project_out(project)}, users=[user.user_id], admins=True)
    return project_out(project, detail=True)


@router.post("/{project_id}/review")
def review_project(project_id: int, body: ReviewIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, admin)
    if body.decision == PROJECT_REJECTED and not (body.feedback or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the developer feedback explaining the rejection")
    project.status = body.decision
    project.feedback = (body.feedback or "").strip() or None
    project.reviewed_by, project.reviewed_at = admin.user_id, utcnow()
    db.commit()
    db.refresh(project)
    sites = json.loads(project.site_ids or "[]")
    record(db, "project.review", f"{admin.username} {body.decision.lower()} '{project.project_name}'"
           + (f" for {len(sites)} site(s)" if sites else "") + (f": {project.feedback}" if project.feedback else ""),
           user=admin, project_id=project_id, owner_id=project.created_by,
           level="info" if body.decision == PROJECT_APPROVED else "warning")
    approved = body.decision == PROJECT_APPROVED
    notify(db, project.created_by, f"'{project.project_name}' was {body.decision.lower()}"
           + (". You can start training now." if approved else f": {project.feedback}"),
           f"/app/projects/{project_id}", kind="success" if approved else "warning")
    manager.publish({"type": "project", "project": project_out(project)}, users=[project.created_by], admins=True)
    return project_out(project, detail=True)


@router.post("/{project_id}/archive")
def archive_project(project_id: int, archived: bool = True, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, admin)
    project.archived = archived
    db.commit()
    record(db, "project.archive", f"{admin.username} {'archived' if archived else 'restored'} '{project.project_name}'",
           user=admin, project_id=project_id)
    return project_out(project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    if any(t.status in JOB_ACTIVE for t in project.trainings):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancel the running training job first")
    if user.role != ROLE_ADMIN and project.status == PROJECT_APPROVED and project.trainings:
        raise HTTPException(status.HTTP_409_CONFLICT, "Studies with training history can only be removed by an admin")
    name, owner = project.project_name, project.created_by
    db.delete(project)
    db.commit()
    record(db, "project.delete", f"{user.username} deleted study '{name}'", user=user, level="warning", owner_id=owner)
