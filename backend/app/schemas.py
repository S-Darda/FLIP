"""Request bodies (validated with Pydantic) and the dict serialisers used for responses."""
import json
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from flipml import FAMILIES

from .models import (MODES, ModelAwaiting, ModelTraining, Organisation, Project, Site, SiteDataset,
                     User)

DOMAINS = ("Healthcare", "Finance", "Research", "Retail", "Public Sector", "Other")
MODE_LABELS = {"simulation": "Simulation (synthetic data)", "federated": "Federated AutoML",
               "local": "Local AutoML (one site)"}


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() + "Z" if dt else None


def jl(text: str | None, default=None):
    try:
        return json.loads(text) if text else default
    except ValueError:
        return default


# ---------- auth ----------

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)
    portal: Literal["admin", "developer"] = "developer"


class MfaVerifyIn(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=8)


class MfaCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class MfaDisableIn(BaseModel):
    code: str = Field(min_length=6, max_length=8)
    password: str


class RegisterIn(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    organisation_id: Optional[int] = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ProfileIn(BaseModel):
    username: str = Field(min_length=2, max_length=100)


# ---------- users, organisations, sites ----------

class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    role: Literal["Admin", "Developer"] = "Developer"
    organisation_id: Optional[int] = None


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[Literal["Admin", "Developer"]] = None
    organisation_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=200)


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=255)


class SiteIn(BaseModel):
    org_id: int
    name: str = Field(min_length=2, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9 ._'-]*$")


# ---------- agent protocol ----------

class EnrolIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    public_key: str = Field(pattern=r"^[0-9a-f]{64}$")
    agent_version: str = Field(default="unknown", max_length=64)


class DatasetIn(BaseModel):
    name: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
    schema_: dict = Field(alias="schema")


class TaskResultIn(BaseModel):
    result: Optional[dict] = None
    error: Optional[str] = Field(default=None, max_length=2000)


# ---------- studies (projects) ----------

class ProjectIn(BaseModel):
    project_name: str = Field(min_length=3, max_length=255)
    description: str = Field(default="", max_length=10000)
    objectives: str = Field(default="", max_length=5000)
    domain: Literal[DOMAINS] = "Research"  # type: ignore[valid-type]
    mode: Literal[MODES] = "simulation"  # type: ignore[valid-type]
    task_type: Literal["classification", "regression"] = "classification"
    dataset_name: Optional[str] = Field(default=None, max_length=120)
    target: Optional[str] = Field(default=None, max_length=255)
    features: list[str] = Field(default_factory=list, max_length=200)
    site_ids: list[int] = Field(default_factory=list, max_length=50)
    cohort_size: int = Field(default=4, ge=2, le=20)
    min_sites: int = Field(default=2, ge=1, le=50)
    families: list[Literal["linear", "mlp"]] = Field(default_factory=lambda: ["linear"], min_length=1)
    max_trials: int = Field(default=4, ge=1, le=20)
    dp_required: bool = False
    max_epsilon: Optional[float] = Field(default=None, gt=0, le=1000)


class ProjectUpdate(BaseModel):
    """Description and objectives can change freely; scope fields send an approved study back for review."""
    project_name: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = Field(default=None, max_length=10000)
    objectives: Optional[str] = Field(default=None, max_length=5000)
    domain: Optional[Literal[DOMAINS]] = None  # type: ignore[valid-type]
    mode: Optional[Literal[MODES]] = None  # type: ignore[valid-type]
    task_type: Optional[Literal["classification", "regression"]] = None
    dataset_name: Optional[str] = Field(default=None, max_length=120)
    target: Optional[str] = Field(default=None, max_length=255)
    features: Optional[list[str]] = None
    site_ids: Optional[list[int]] = None
    cohort_size: Optional[int] = Field(default=None, ge=2, le=20)
    min_sites: Optional[int] = Field(default=None, ge=1, le=50)
    families: Optional[list[Literal["linear", "mlp"]]] = None
    max_trials: Optional[int] = Field(default=None, ge=1, le=20)
    dp_required: Optional[bool] = None
    max_epsilon: Optional[float] = Field(default=None, gt=0, le=1000)


class ReviewIn(BaseModel):
    decision: Literal["Approved", "Rejected"]
    feedback: Optional[str] = Field(default=None, max_length=5000)


class TrainingIn(BaseModel):
    family: Optional[Literal["linear", "mlp"]] = None
    algorithm: Literal["FedAvg", "FedProx"] = "FedAvg"
    rounds: int = Field(default=20, ge=1, le=200)
    num_nodes: Optional[int] = Field(default=None, ge=2, le=20)  # simulation only
    client_fraction: float = Field(default=1.0, gt=0, le=1)
    local_epochs: int = Field(default=2, ge=1, le=20)
    batch_size: int = Field(default=32, ge=4, le=1024)
    learning_rate: float = Field(default=0.1, gt=0, le=5)
    mu: float = Field(default=0.01, ge=0, le=10)
    dp_enabled: bool = False
    clip_norm: float = Field(default=1.0, gt=0, le=100)
    noise_multiplier: float = Field(default=1.0, ge=0, le=20)
    trials: int = Field(default=1, ge=1, le=20)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    kind: Literal["comment", "feedback"] = "comment"


class NotesIn(BaseModel):
    notes: str = Field(default="", max_length=20000)


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
        "organisation_id": u.organisation_id, "organisation": u.organisation, "is_active": u.is_active,
        "failed_logins": u.failed_logins, "locked_until": iso(u.locked_until), "mfa_enabled": u.mfa_enabled,
        "last_login_at": iso(u.last_login_at), "created_at": iso(u.created_at),
    }


def org_out(o: Organisation) -> dict:
    return {"org_id": o.org_id, "name": o.name, "created_at": iso(o.created_at),
            "users": len(o.users), "sites": len(o.sites)}


def dataset_out(d: SiteDataset) -> dict:
    return {"id": d.id, "name": d.name, "rows": d.rows, "schema": jl(d.schema, {}), "updated_at": iso(d.updated_at)}


def site_out(s: Site, admin: bool = False) -> dict:
    data = {"site_id": s.site_id, "name": s.name, "org_id": s.org_id, "organisation": s.org.name if s.org else None,
            "status": s.status, "last_seen": iso(s.last_seen), "agent_version": s.agent_version,
            "datasets": [dataset_out(d) for d in s.datasets]}
    if admin:
        data.update(enrolled_at=iso(s.enrolled_at), created_at=iso(s.created_at),
                    key_fingerprint=s.public_key[:16] if s.public_key else None,
                    token_expires=iso(s.token_expires) if s.token_hash else None)
    return data


def project_out(p: Project, detail: bool = False) -> dict:
    trainings = sorted(p.trainings, key=lambda t: t.training_id, reverse=True)
    done = [t for t in trainings if t.status == "Completed"]
    best = max((t.accuracy for t in done if t.accuracy is not None), default=None)
    best_rmse = min((t.rmse for t in done if t.rmse is not None), default=None)
    families = jl(p.families, ["linear"])
    data = {
        "project_id": p.project_id, "project_name": p.project_name,
        "description": p.description, "objectives": p.objectives, "domain": p.domain,
        "mode": p.mode, "mode_label": MODE_LABELS.get(p.mode, p.mode), "task_type": p.task_type,
        "dataset_name": p.dataset_name, "target": p.target, "features": jl(p.features, []),
        "site_ids": jl(p.site_ids, []), "cohort_size": p.cohort_size, "min_sites": p.min_sites,
        "families": families, "family_labels": [FAMILIES[f] for f in families if f in FAMILIES],
        "max_trials": p.max_trials, "dp_required": p.dp_required, "max_epsilon": p.max_epsilon,
        "status": p.status, "feedback": p.feedback, "archived": p.archived,
        "created_by": p.created_by, "owner_name": p.owner.username if p.owner else None,
        "owner_email": p.owner.email if p.owner else None,
        "owner_organisation": p.owner.organisation if p.owner else None,
        "reviewed_by_name": p.reviewer.username if p.reviewer else None, "reviewed_at": iso(p.reviewed_at),
        "created_at": iso(p.created_at), "updated_at": iso(p.updated_at),
        "training_count": len(trainings), "best_accuracy": best, "best_rmse": best_rmse,
        "latest_training_status": trainings[0].status if trainings else None,
    }
    if detail:
        data["trainings"] = [training_out(t) for t in trainings]
        data["submissions"] = [submission_out(s) for s in p.submissions]
    return data


def training_out(t: ModelTraining, rounds: bool = False) -> dict:
    data = {
        "training_id": t.training_id, "project_id": t.project_id,
        "project_name": t.project.project_name if t.project else None,
        "owner_id": t.project.created_by if t.project else None,
        "started_by_name": t.starter.username if t.starter else None,
        "status": t.status, "mode": t.mode, "mode_label": MODE_LABELS.get(t.mode, t.mode), "task_type": t.task_type,
        "model_type": t.model_type, "model_label": FAMILIES.get(t.model_type, t.model_type),
        "algorithm": t.algorithm, "rounds": t.rounds, "num_nodes": t.num_nodes,
        "client_fraction": t.client_fraction, "local_epochs": t.local_epochs,
        "batch_size": t.batch_size, "learning_rate": t.learning_rate, "mu": t.mu,
        "dp_enabled": t.dp_enabled, "clip_norm": t.clip_norm, "noise_multiplier": t.noise_multiplier,
        "data_source": t.data_source, "sites": jl(t.sites, []), "current_round": t.current_round,
        "group_id": t.group_id, "trial_index": t.trial_index, "trial_count": t.trial_count, "is_best": t.is_best,
        "accuracy": t.accuracy, "loss": t.loss, "rmse": t.rmse, "selection_score": t.selection_score,
        "error": t.error, "created_at": iso(t.created_at), "started_at": iso(t.started_at),
        "finished_at": iso(t.finished_at),
        "artefact": {"version": t.artefact.version, "sha256": t.artefact.sha256, "key_id": t.artefact.key_id}
        if t.artefact else None,
    }
    if rounds:
        data["round_metrics"] = [round_out(r) for r in t.round_metrics]
        data["report"] = jl(t.report)
        data["notes"] = t.notes
        data["comments"] = [comment_out(c) for c in t.comments]
    return data


def comment_out(c) -> dict:
    return {"comment_id": c.comment_id, "kind": c.kind, "body": c.body, "user_id": c.user_id,
            "author": c.author.username if c.author else "Deleted user", "role": c.author.role if c.author else None,
            "created_at": iso(c.created_at)}


def round_out(r) -> dict:
    return {"round": r.round, "accuracy": r.accuracy, "rmse": r.rmse, "loss": r.loss,
            "nodes": jl(r.nodes, []), "duration_ms": r.duration_ms}


def submission_out(s: ModelAwaiting) -> dict:
    return {
        "awaiting_id": s.awaiting_id, "project_id": s.project_id,
        "project_name": s.project.project_name if s.project else None, "training_id": s.training_id,
        "accuracy": s.training.accuracy if s.training else None, "rmse": s.training.rmse if s.training else None,
        "model_name": s.model_name, "status": s.status, "comments": s.comments,
        "admin_comment": s.admin_comment, "requested_by": s.requested_by,
        "requested_by_name": s.requester.username if s.requester else None,
        "requested_at": iso(s.requested_at), "reviewed_at": iso(s.reviewed_at),
    }
