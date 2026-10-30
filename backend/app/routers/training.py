import json
import uuid

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import training_runner
from ..audit import notify, notify_admins, record
from ..database import get_db
from ..deps import admin_only, developer_only, get_current_user, get_visible_project
from ..models import (JOB_ACTIVE, JOB_CANCELLED, JOB_COMPLETED, JOB_QUEUED, JOB_RUNNING, MODE_SIMULATION, PROJECT_APPROVED,
                      ROLE_ADMIN, ModelAwaiting, ModelTraining, Project, User, utcnow)
from ..policy import check_run
from ..realtime import manager
from ..schemas import SubmissionIn, SubmissionReviewIn, TrainingIn, submission_out, training_out
from ..security import artefact_key_id, artefact_public_key_hex

router = APIRouter(prefix="/api", tags=["training"])

LR_GRID = {"linear": [0.3, 0.1, 0.03], "mlp": [0.1, 0.05, 0.02]}
EPOCH_GRID = [1, 2, 3]


def _visible_job(db: Session, training_id: int, user: User) -> ModelTraining:
    job = db.get(ModelTraining, training_id)
    if not job or (user.role != ROLE_ADMIN and job.project.created_by != user.user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Training job not found")
    return job


def trial_configs(base: dict, families: list[str], n: int, seed: int) -> list[dict]:
    """Bounded AutoML search: trial 1 is exactly what the user asked for; the rest are a seeded
    sample of the family x learning-rate x local-epochs grid, without repeats."""
    grid = [(f, lr, ep) for f in families for lr in LR_GRID[f] for ep in EPOCH_GRID]
    first = (base["model_type"], base["learning_rate"], base["local_epochs"])
    rest = [g for g in grid if g != first]
    order = np.random.default_rng(seed).permutation(len(rest))
    picks = [first] + [rest[i] for i in order[: max(0, n - 1)]]
    return [{**base, "model_type": f, "learning_rate": lr, "local_epochs": ep} for f, lr, ep in picks]


@router.post("/projects/{project_id}/training", status_code=201)
def start_training(project_id: int, body: TrainingIn, user: User = Depends(developer_only), db: Session = Depends(get_db)):
    project = get_visible_project(project_id, db, user)
    if project.status != PROJECT_APPROVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Training can start only after an admin approves the study")
    if project.archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "This study is archived")
    if db.query(ModelTraining).filter(ModelTraining.project_id == project_id, ModelTraining.status.in_(JOB_ACTIVE)).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "A training job is already running for this study")
    budget = check_run(db, project, body)

    families = json.loads(project.families or '["linear"]')
    base = {"model_type": body.family or families[0], "algorithm": body.algorithm, "rounds": body.rounds,
            "num_nodes": (body.num_nodes or project.cohort_size) if project.mode == MODE_SIMULATION else 0,
            "client_fraction": body.client_fraction, "local_epochs": body.local_epochs, "batch_size": body.batch_size,
            "learning_rate": body.learning_rate, "mu": body.mu if body.algorithm == "FedProx" else 0.0,
            "dp_enabled": body.dp_enabled, "clip_norm": body.clip_norm,
            "noise_multiplier": body.noise_multiplier if body.dp_enabled else 0.0}
    configs = trial_configs(base, families, body.trials, seed=project_id * 97 + len(project.trainings))
    group = uuid.uuid4().hex if len(configs) > 1 else None
    source = "Synthetic simulation" if project.mode == MODE_SIMULATION else f"Site dataset '{project.dataset_name}'"
    jobs = [ModelTraining(project_id=project_id, started_by=user.user_id, status=JOB_QUEUED, mode=project.mode,
                          task_type=project.task_type, data_source=source, group_id=group, trial_index=i + 1,
                          trial_count=len(configs), **cfg) for i, cfg in enumerate(configs)]
    db.add_all(jobs)
    db.commit()
    for j in jobs:
        db.refresh(j)
    what = f"an AutoML search of {len(jobs)} trials" if group else f"training #{jobs[0].training_id}"
    record(db, "training.queue", f"{user.username} queued {what} for '{project.project_name}'",
           user=user, project_id=project_id, owner_id=user.user_id)
    training_runner.start([j.training_id for j in jobs])
    return {**training_out(jobs[0]), "trial_ids": [j.training_id for j in jobs], **budget}


@router.get("/training")
def list_training(project_id: int | None = None, status_: str | None = Query(default=None, alias="status"),
                  group_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(ModelTraining).join(Project)
    if user.role != ROLE_ADMIN:
        q = q.filter(Project.created_by == user.user_id)
    if project_id:
        q = q.filter(ModelTraining.project_id == project_id)
    if status_:
        q = q.filter(ModelTraining.status == status_)
    if group_id:
        q = q.filter(ModelTraining.group_id == group_id)
    return [training_out(t) for t in q.order_by(ModelTraining.training_id.desc()).limit(500)]


@router.get("/training/{training_id}")
def get_training(training_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _visible_job(db, training_id, user)
    out = training_out(job, rounds=True)
    if job.group_id:
        siblings = db.query(ModelTraining).filter(ModelTraining.group_id == job.group_id).order_by(ModelTraining.trial_index)
        out["trials"] = [training_out(t) for t in siblings]
    return out


@router.post("/training/{training_id}/cancel")
def cancel_training(training_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = _visible_job(db, training_id, user)
    if job.status not in JOB_ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Job is already {job.status.lower()}")
    # Cancelling one trial stops the rest of its AutoML search too.
    targets = (db.query(ModelTraining).filter(ModelTraining.group_id == job.group_id, ModelTraining.status.in_(JOB_ACTIVE)).all()
               if job.group_id else [job])
    for t in targets:
        if t.status == JOB_RUNNING and training_runner.is_running(t.training_id):
            training_runner.request_cancel(t.training_id)  # stops after the current step
        else:
            t.status, t.finished_at = JOB_CANCELLED, utcnow()  # queued trials never start
    db.commit()
    record(db, "training.cancel_request", f"{user.username} asked to stop training #{training_id}",
           user=user, project_id=job.project_id, level="warning", owner_id=job.project.created_by)
    return training_out(job)


@router.get("/training/{training_id}/download")
def download_results(training_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Signed model artefact plus the run's metrics. Logged, and limited to the study owner and admins."""
    job = _visible_job(db, training_id, user)
    if job.status != JOB_COMPLETED or not job.artefact:
        raise HTTPException(status.HTTP_409_CONFLICT, "Results are available once training completes")
    payload = {"artefact": json.loads(job.weights), "sha256": job.artefact.sha256, "signature": job.artefact.signature,
               "key_id": job.artefact.key_id, "public_key": artefact_public_key_hex(), "signature_algorithm": "Ed25519",
               "run": training_out(job, rounds=True)}
    record(db, "artefact.download", f"{user.username} downloaded artefact v{job.artefact.version} of training #{training_id}",
           user=user, project_id=job.project_id, owner_id=job.project.created_by)
    name = f"flip-model-{job.project_id}-v{job.artefact.version}.json"
    return JSONResponse(payload, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/artefacts/public-key")
def public_key():
    return {"algorithm": "Ed25519", "public_key": artefact_public_key_hex(), "key_id": artefact_key_id(),
            "signed_bytes": "canonical JSON of the artefact: sorted keys, no whitespace, UTF-8"}


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
    if job.mode == MODE_SIMULATION:
        raise HTTPException(status.HTTP_409_CONFLICT, "Simulation models were trained on synthetic data and cannot be deployed")
    if db.query(ModelAwaiting).filter(ModelAwaiting.training_id == job.training_id,
                                      ModelAwaiting.status.in_(("Pending", "In Review", "Approved"))).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "This model has already been submitted")
    sub = ModelAwaiting(project_id=job.project_id, training_id=job.training_id, model_name=body.model_name.strip(),
                        comments=body.comments, requested_by=user.user_id)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    record(db, "model.submit", f"{user.username} submitted model '{sub.model_name}' (training #{job.training_id}) for deployment",
           user=user, project_id=job.project_id, owner_id=user.user_id)
    notify_admins(db, f"Model awaiting approval: {sub.model_name}", "/admin/models")
    manager.publish({"type": "submission", "submission": submission_out(sub)}, users=[user.user_id], admins=True)
    return submission_out(sub)


@router.post("/submissions/{awaiting_id}/review")
def review_submission(awaiting_id: int, body: SubmissionReviewIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
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
    manager.publish({"type": "submission", "submission": submission_out(sub)}, users=[sub.requested_by], admins=True)
    return submission_out(sub)
