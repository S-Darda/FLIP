import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import training_runner
from ..audit import notify, notify_admins, record
from ..database import get_db
from ..deps import admin_only, developer_only, get_current_user, get_visible_project
from ..models import (JOB_ACTIVE, JOB_CANCELLED, JOB_COMPLETED, JOB_QUEUED, PROJECT_APPROVED,
                      ROLE_ADMIN, Dataset, ModelAwaiting, ModelTraining, Project, User, utcnow)
from ..realtime import manager
from ..schemas import (SubmissionIn, SubmissionReviewIn, TrainingIn, submission_out,
                       training_out)

router = APIRouter(prefix="/api", tags=["training"])


def _visible_job(db: Session, training_id: int, user: User) -> ModelTraining:
    job = db.get(ModelTraining, training_id)
    if not job or (user.role != ROLE_ADMIN and job.project.created_by != user.user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Training job not found")
    return job


@router.post("/projects/{project_id}/training", status_code=201)
def start_training(project_id: int, body: TrainingIn, user: User = Depends(developer_only),
                   db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    if project.status != PROJECT_APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Training can start only after an admin approves the project")
    if project.archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "This project is archived")
    if db.query(ModelTraining).filter(ModelTraining.project_id == project_id,
                                      ModelTraining.status.in_(JOB_ACTIVE)).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "A training job is already running for this project")

    source = "Synthetic federated cohort"
    if body.dataset_id is not None:
        ds = db.get(Dataset, body.dataset_id)
        if not ds or ds.project_id != project_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
        if not ds.trainable:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{ds.filename} can't be trained on: {ds.note}")
        source = ds.filename

    data = body.model_dump()
    data["model_type"] = data["model_type"] or project.model_type
    data["num_nodes"] = data["num_nodes"] or project.cohort_size
    if data["algorithm"] != "FedProx":
        data["mu"] = 0.0
    job = ModelTraining(project_id=project_id, started_by=user.user_id, status=JOB_QUEUED,
                        data_source=source, **data)
    db.add(job)
    db.commit()
    db.refresh(job)
    record(db, "training.queue", f"{user.username} queued training #{job.training_id} for "
           f"'{project.project_name}'", user=user, project_id=project_id, owner_id=user.user_id)
    training_runner.start(job.training_id)
    return training_out(job)


@router.get("/training")
def list_training(project_id: int | None = None, status_: str | None = Query(default=None, alias="status"),
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(ModelTraining).join(Project)
    if user.role != ROLE_ADMIN:
        q = q.filter(Project.created_by == user.user_id)
    if project_id:
        q = q.filter(ModelTraining.project_id == project_id)
    if status_:
        q = q.filter(ModelTraining.status == status_)
    return [training_out(t) for t in q.order_by(ModelTraining.training_id.desc()).limit(500)]


@router.get("/training/{training_id}")
def get_training(training_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return training_out(_visible_job(db, training_id, user), rounds=True)


@router.post("/training/{training_id}/cancel")
def cancel_training(training_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _visible_job(db, training_id, user)
    if job.status not in JOB_ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Job is already {job.status.lower()}")
    if training_runner.is_running(training_id):
        training_runner.request_cancel(training_id)
    else:
        job.status, job.finished_at = JOB_CANCELLED, utcnow()
        db.commit()
    record(db, "training.cancel_request", f"{user.username} asked to stop training #{training_id}",
           user=user, project_id=job.project_id, level="warning", owner_id=job.project.created_by)
    return training_out(job)


@router.get("/training/{training_id}/download")
def download_results(training_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _visible_job(db, training_id, user)
    if job.status != JOB_COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Results are available once training completes")
    payload = training_out(job, rounds=True)
    payload["model"] = json.loads(job.weights) if job.weights else None
    record(db, "training.download", f"{user.username} downloaded results of training #{training_id}",
           user=user, project_id=job.project_id, owner_id=job.project.created_by)
    name = f"flip-training-{training_id}.json"
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ------------------------------------------------------------ model submissions

@router.get("/submissions")
def list_submissions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(ModelAwaiting)
    if user.role != ROLE_ADMIN:
        q = q.filter(ModelAwaiting.requested_by == user.user_id)
    return [submission_out(s) for s in q.order_by(ModelAwaiting.requested_at.desc())]


@router.post("/submissions", status_code=201)
def submit_model(body: SubmissionIn, user: User = Depends(developer_only), db: Session = Depends(get_db)):
    job = _visible_job(db, body.training_id, user)
    if job.status != JOB_COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only completed training runs can be submitted")
    if db.query(ModelAwaiting).filter(ModelAwaiting.training_id == job.training_id,
                                      ModelAwaiting.status.in_(("Pending", "In Review", "Approved"))).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "This model has already been submitted")
    sub = ModelAwaiting(project_id=job.project_id, training_id=job.training_id, model_name=body.model_name.strip(),
                        comments=body.comments, requested_by=user.user_id)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    record(db, "model.submit", f"{user.username} submitted model '{sub.model_name}' (training "
           f"#{job.training_id}) for deployment", user=user, project_id=job.project_id, owner_id=user.user_id)
    notify_admins(db, f"Model awaiting approval: {sub.model_name}", "/admin/models")
    manager.publish({"type": "submission", "submission": submission_out(sub)}, users=[user.user_id], admins=True)
    return submission_out(sub)


@router.post("/submissions/{awaiting_id}/review")
def review_submission(awaiting_id: int, body: SubmissionReviewIn, admin: User = Depends(admin_only),
                      db: Session = Depends(get_db)):
    sub = db.get(ModelAwaiting, awaiting_id)
    if not sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Submission not found")
    if body.decision == "Rejected" and not (body.comment or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Explain why the model is rejected")
    sub.status, sub.admin_comment, sub.reviewed_at = body.decision, (body.comment or "").strip() or None, utcnow()
    db.commit()
    record(db, "model.review", f"{admin.username} marked model '{sub.model_name}' as {body.decision}",
           user=admin, project_id=sub.project_id, owner_id=sub.requested_by)
    verb = {"Approved": "approved for deployment", "Rejected": "rejected", "In Review": "is now in review"}
    notify(db, sub.requested_by, f"Model '{sub.model_name}' {verb[body.decision]}"
           + (f": {sub.admin_comment}" if sub.admin_comment else ""), "/app/models",
           kind="success" if body.decision == "Approved" else "info")
    manager.publish({"type": "submission", "submission": submission_out(sub)},
                    users=[sub.requested_by], admins=True)
    return submission_out(sub)
