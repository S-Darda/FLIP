import re
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..audit import notify, notify_admins, record
from ..config import MAX_UPLOAD_MB, STORAGE_DIR
from ..database import get_db
from ..deps import admin_only, developer_only, get_current_user, get_visible_project
from ..federated import profile_csv
from ..models import (JOB_ACTIVE, PROJECT_APPROVED, PROJECT_PENDING, PROJECT_REJECTED,
                      ROLE_ADMIN, Dataset, ModelTraining, Project, User, utcnow)
from ..realtime import manager
from ..schemas import DOMAINS, MODEL_TYPES, ProjectUpdate, ReviewIn, dataset_out, project_out

router = APIRouter(prefix="/api/projects", tags=["projects"])

ALLOWED_EXT = {".csv", ".txt", ".json", ".zip", ".parquet"}


def _safe_name(name: str) -> str:
    base = Path(name or "dataset").name
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120] or "dataset"


def _store_upload(project: Project, upload: UploadFile) -> Dataset:
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{upload.filename}: only {', '.join(sorted(ALLOWED_EXT))} files are accepted")
    folder = STORAGE_DIR / "projects" / str(project.project_id)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{uuid.uuid4().hex[:10]}_{_safe_name(upload.filename)}"
    limit = MAX_UPLOAD_MB * 1024 * 1024
    size = 0
    with open(target, "wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                    f"{upload.filename} is larger than {MAX_UPLOAD_MB} MB")
            out.write(chunk)
    info = profile_csv(target) if ext in (".csv", ".txt") else {
        "rows": 0, "columns": 0, "label_column": None, "classes": 0, "trainable": False,
        "note": "Stored for reference. Only CSV files can be used for training."}
    return Dataset(project_id=project.project_id, filename=_safe_name(upload.filename),
                   stored_path=str(target), size_bytes=size, **info)


def _check_fields(name: str, domain: str, model_type: str, cohort_size: int) -> None:
    if len(name.strip()) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Project name must be at least 3 characters")
    if domain not in DOMAINS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown domain")
    if model_type not in MODEL_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown model type")
    if not 2 <= cohort_size <= 20:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Cohort size must be between 2 and 20 nodes")


def _name_taken(db: Session, name: str, exclude: int | None = None) -> bool:
    q = db.query(Project).filter(Project.project_name.ilike(name.strip()))
    if exclude:
        q = q.filter(Project.project_id != exclude)
    return q.first() is not None


@router.get("/options")
def options():
    return {"domains": DOMAINS, "model_types": [{"value": k, "label": v} for k, v in MODEL_TYPES.items()]}


@router.get("")
def list_projects(status_: str | None = Query(default=None, alias="status"), q: str | None = None,
                  archived: bool = False, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
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
def create_project(
    project_name: str = Form(...),
    description: str = Form(""),
    objectives: str = Form(""),
    domain: str = Form("Research"),
    cohort_size: int = Form(4),
    model_type: str = Form("logreg"),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(developer_only),
    db: Session = Depends(get_db),
):
    _check_fields(project_name, domain, model_type, cohort_size)
    if _name_taken(db, project_name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project with this name already exists")
    project = Project(project_name=project_name.strip(), description=description, objectives=objectives,
                      domain=domain, cohort_size=cohort_size, model_type=model_type,
                      created_by=user.user_id, status=PROJECT_PENDING)
    db.add(project)
    db.flush()
    try:
        for f in files:
            if f.filename:
                db.add(_store_upload(project, f))
        db.commit()
    except HTTPException:
        db.rollback()
        shutil.rmtree(STORAGE_DIR / "projects" / str(project.project_id), ignore_errors=True)
        raise
    db.refresh(project)
    record(db, "project.create", f"{user.username} submitted '{project.project_name}' for approval",
           user=user, project_id=project.project_id, owner_id=user.user_id)
    notify_admins(db, f"New project awaiting approval: {project.project_name}",
                  f"/admin/projects/{project.project_id}")
    manager.publish({"type": "project", "project": project_out(project)}, users=[user.user_id], admins=True)
    return project_out(project, detail=True)


@router.get("/{project_id}")
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return project_out(get_visible_project(project_id, db, user), detail=True)


@router.patch("/{project_id}")
def update_project(project_id: int, body: ProjectUpdate, user: User = Depends(developer_only),
                   db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    data = body.model_dump(exclude_unset=True)
    if not data:
        return project_out(project, detail=True)
    if "project_name" in data and _name_taken(db, data["project_name"], exclude=project_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Project with this name already exists")
    # Approved projects may tweak description/objectives; scope changes need a new review.
    resubmit = project.status == PROJECT_REJECTED
    scope_fields = {"cohort_size", "model_type", "domain", "project_name"}
    if project.status == PROJECT_APPROVED and scope_fields & data.keys():
        changed = [k for k in scope_fields & data.keys() if data[k] != getattr(project, k)]
        if changed:
            resubmit = True
    for k, v in data.items():
        setattr(project, k, v.strip() if isinstance(v, str) and k == "project_name" else v)
    if resubmit:
        project.status, project.reviewed_at, project.reviewed_by = PROJECT_PENDING, None, None
    db.commit()
    db.refresh(project)
    msg = f"{user.username} updated '{project.project_name}'"
    if resubmit:
        msg += " and resubmitted it for approval"
        notify_admins(db, f"Project resubmitted: {project.project_name}", f"/admin/projects/{project_id}")
    record(db, "project.update", msg, user=user, project_id=project_id, owner_id=user.user_id)
    manager.publish({"type": "project", "project": project_out(project)}, users=[user.user_id], admins=True)
    return project_out(project, detail=True)


@router.post("/{project_id}/review")
def review_project(project_id: int, body: ReviewIn, admin: User = Depends(admin_only),
                   db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, admin)
    if body.decision == PROJECT_REJECTED and not (body.feedback or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "Give the developer feedback explaining the rejection")
    project.status = body.decision
    project.feedback = (body.feedback or "").strip() or None
    project.reviewed_by, project.reviewed_at = admin.user_id, utcnow()
    db.commit()
    db.refresh(project)
    record(db, "project.review", f"{admin.username} {body.decision.lower()} '{project.project_name}'"
           + (f": {project.feedback}" if project.feedback else ""),
           user=admin, project_id=project_id, owner_id=project.created_by,
           level="info" if body.decision == PROJECT_APPROVED else "warning")
    approved = body.decision == PROJECT_APPROVED
    notify(db, project.created_by,
           f"'{project.project_name}' was {body.decision.lower()}"
           + (". You can start training now." if approved else f": {project.feedback}"),
           f"/app/projects/{project_id}", kind="success" if approved else "warning")
    manager.publish({"type": "project", "project": project_out(project)},
                    users=[project.created_by], admins=True)
    return project_out(project, detail=True)


@router.post("/{project_id}/archive")
def archive_project(project_id: int, archived: bool = True, admin: User = Depends(admin_only),
                    db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, admin)
    project.archived = archived
    db.commit()
    record(db, "project.archive", f"{admin.username} {'archived' if archived else 'restored'} "
           f"'{project.project_name}'", user=admin, project_id=project_id)
    return project_out(project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    if any(t.status in JOB_ACTIVE for t in project.trainings):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancel the running training job first")
    if user.role != ROLE_ADMIN and project.status == PROJECT_APPROVED and project.trainings:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Projects with training history can only be removed by an admin")
    name, owner = project.project_name, project.created_by
    db.delete(project)
    db.commit()
    shutil.rmtree(STORAGE_DIR / "projects" / str(project_id), ignore_errors=True)
    record(db, "project.delete", f"{user.username} deleted project '{name}'", user=user,
           level="warning", owner_id=owner)


@router.post("/{project_id}/datasets", status_code=201)
def add_datasets(project_id: int, files: list[UploadFile] = File(...),
                 user: User = Depends(developer_only), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    added = []
    for f in files:
        if f.filename:
            ds = _store_upload(project, f)
            db.add(ds)
            added.append(ds)
    db.commit()
    for ds in added:
        db.refresh(ds)
    record(db, "dataset.upload", f"{user.username} uploaded {', '.join(d.filename for d in added)} "
           f"to '{project.project_name}'", user=user, project_id=project_id, owner_id=user.user_id)
    return [dataset_out(d) for d in added]


@router.delete("/{project_id}/datasets/{dataset_id}", status_code=204)
def delete_dataset(project_id: int, dataset_id: int, user: User = Depends(developer_only),
                   db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project.project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    if db.query(ModelTraining).filter(ModelTraining.dataset_id == dataset_id,
                                      ModelTraining.status.in_(JOB_ACTIVE)).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "This dataset is being used by a running job")
    Path(ds.stored_path).unlink(missing_ok=True)
    name = ds.filename
    db.delete(ds)
    db.commit()
    record(db, "dataset.delete", f"{user.username} removed {name} from '{project.project_name}'",
           user=user, project_id=project_id, owner_id=user.user_id)
