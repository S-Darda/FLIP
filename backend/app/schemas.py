"""Request bodies (validated with Pydantic) and the dict serialisers used for responses."""
import json
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import Dataset, ModelAwaiting, ModelTraining, Project, User

MODEL_TYPES = {"logreg": "Logistic Regression", "mlp": "Neural Network (MLP)"}
DOMAINS = ("Healthcare", "Finance", "Research", "Retail", "Public Sector", "Other")


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() + "Z" if dt else None


# ---------- auth ----------

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    portal: Literal["admin", "developer"] = "developer"


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    organisation: Optional[str] = Field(default=None, max_length=255)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ProfileIn(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    organisation: Optional[str] = Field(default=None, max_length=255)


# ---------- users ----------

class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role: Literal["Admin", "Developer"] = "Developer"
    organisation: Optional[str] = Field(default=None, max_length=255)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[Literal["Admin", "Developer"]] = None
    organisation: Optional[str] = Field(default=None, max_length=255)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=200)


# ---------- projects ----------

class ProjectUpdate(BaseModel):
    project_name: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = Field(default=None, max_length=10000)
    objectives: Optional[str] = Field(default=None, max_length=5000)
    domain: Optional[str] = None
    cohort_size: Optional[int] = Field(default=None, ge=2, le=20)
    model_type: Optional[str] = None

    @field_validator("model_type")
    @classmethod
    def _model(cls, v):
        if v is not None and v not in MODEL_TYPES:
            raise ValueError("Unknown model type")
        return v

    @field_validator("domain")
    @classmethod
    def _domain(cls, v):
        if v is not None and v not in DOMAINS:
            raise ValueError("Unknown domain")
        return v


class ReviewIn(BaseModel):
    decision: Literal["Approved", "Rejected"]
    feedback: Optional[str] = Field(default=None, max_length=5000)


# ---------- training ----------

class TrainingIn(BaseModel):
    model_type: Optional[str] = None
    algorithm: Literal["FedAvg", "FedProx"] = "FedAvg"
    rounds: int = Field(default=20, ge=1, le=200)
    num_nodes: Optional[int] = Field(default=None, ge=2, le=20)
    client_fraction: float = Field(default=1.0, gt=0, le=1)
    local_epochs: int = Field(default=2, ge=1, le=20)
    batch_size: int = Field(default=32, ge=4, le=1024)
    learning_rate: float = Field(default=0.1, gt=0, le=5)
    mu: float = Field(default=0.01, ge=0, le=10)
    dp_enabled: bool = False
    clip_norm: float = Field(default=1.0, gt=0, le=100)
    noise_multiplier: float = Field(default=0.5, ge=0, le=10)
    dataset_id: Optional[int] = None

    @field_validator("model_type")
    @classmethod
    def _model(cls, v):
        if v is not None and v not in MODEL_TYPES:
            raise ValueError("Unknown model type")
        return v


class SubmissionIn(BaseModel):
    training_id: int
    model_name: str = Field(min_length=2, max_length=255)
    comments: Optional[str] = Field(default=None, max_length=5000)


class SubmissionReviewIn(BaseModel):
    decision: Literal["In Review", "Approved", "Rejected"]
    comment: Optional[str] = Field(default=None, max_length=5000)


# ---------- serialisers ----------

def user_out(u: User) -> dict:
    return {
        "user_id": u.user_id, "username": u.username, "email": u.email, "role": u.role,
        "organisation": u.organisation, "is_active": u.is_active,
        "failed_logins": u.failed_logins, "locked_until": iso(u.locked_until),
        "last_login_at": iso(u.last_login_at), "created_at": iso(u.created_at),
    }


def dataset_out(d: Dataset) -> dict:
    return {
        "dataset_id": d.dataset_id, "filename": d.filename, "size_bytes": d.size_bytes,
        "rows": d.rows, "columns": d.columns, "label_column": d.label_column,
        "classes": d.classes, "trainable": d.trainable, "note": d.note,
        "uploaded_at": iso(d.uploaded_at),
    }


def project_out(p: Project, detail: bool = False) -> dict:
    trainings = sorted(p.trainings, key=lambda t: t.training_id, reverse=True)
    best = max((t.accuracy for t in trainings if t.accuracy is not None), default=None)
    data = {
        "project_id": p.project_id, "project_name": p.project_name,
        "description": p.description, "objectives": p.objectives, "domain": p.domain,
        "cohort_size": p.cohort_size, "model_type": p.model_type,
        "model_label": MODEL_TYPES.get(p.model_type, p.model_type),
        "status": p.status, "feedback": p.feedback, "archived": p.archived,
        "created_by": p.created_by, "owner_name": p.owner.username if p.owner else None,
        "owner_email": p.owner.email if p.owner else None,
        "owner_organisation": p.owner.organisation if p.owner else None,
        "reviewed_by_name": p.reviewer.username if p.reviewer else None,
        "reviewed_at": iso(p.reviewed_at),
        "created_at": iso(p.created_at), "updated_at": iso(p.updated_at),
        "dataset_count": len(p.datasets), "training_count": len(trainings),
        "best_accuracy": best,
        "latest_training_status": trainings[0].status if trainings else None,
    }
    if detail:
        data["datasets"] = [dataset_out(d) for d in p.datasets]
        data["trainings"] = [training_out(t) for t in trainings]
        data["submissions"] = [submission_out(s) for s in p.submissions]
    return data


def training_out(t: ModelTraining, rounds: bool = False) -> dict:
    data = {
        "training_id": t.training_id, "project_id": t.project_id,
        "project_name": t.project.project_name if t.project else None,
        "owner_id": t.project.created_by if t.project else None,
        "started_by_name": t.starter.username if t.starter else None,
        "status": t.status, "model_type": t.model_type,
        "model_label": MODEL_TYPES.get(t.model_type, t.model_type),
        "algorithm": t.algorithm, "rounds": t.rounds, "num_nodes": t.num_nodes,
        "client_fraction": t.client_fraction, "local_epochs": t.local_epochs,
        "batch_size": t.batch_size, "learning_rate": t.learning_rate, "mu": t.mu,
        "dp_enabled": t.dp_enabled, "clip_norm": t.clip_norm,
        "noise_multiplier": t.noise_multiplier, "dataset_id": t.dataset_id,
        "data_source": t.data_source, "current_round": t.current_round,
        "accuracy": t.accuracy, "loss": t.loss, "error": t.error,
        "created_at": iso(t.created_at), "started_at": iso(t.started_at),
        "finished_at": iso(t.finished_at),
    }
    if rounds:
        data["round_metrics"] = [round_out(r) for r in t.round_metrics]
        data["report"] = json.loads(t.report) if t.report else None
    return data


def round_out(r) -> dict:
    return {"round": r.round, "accuracy": r.accuracy, "loss": r.loss,
            "nodes": json.loads(r.nodes), "duration_ms": r.duration_ms}


def submission_out(s: ModelAwaiting) -> dict:
    return {
        "awaiting_id": s.awaiting_id, "project_id": s.project_id,
        "project_name": s.project.project_name if s.project else None,
        "training_id": s.training_id,
        "accuracy": s.training.accuracy if s.training else None,
        "model_name": s.model_name, "status": s.status, "comments": s.comments,
        "admin_comment": s.admin_comment, "requested_by": s.requested_by,
        "requested_by_name": s.requester.username if s.requester else None,
        "requested_at": iso(s.requested_at), "reviewed_at": iso(s.reviewed_at),
    }
