"""SQLAlchemy models. Core tables follow the FLIP data dictionary (thesis §4.5.6); Phase 1 adds
organisations, enrolled sites, site dataset schemas, agent tasks and signed model artefacts.

No table holds training rows: sites register only a dataset's schema and row count."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

SCHEMA_VERSION = "phase1-v1"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


ROLE_ADMIN = "Admin"
ROLE_DEVELOPER = "Developer"
ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)

PROJECT_PENDING = "Pending"
PROJECT_APPROVED = "Approved"
PROJECT_REJECTED = "Rejected"
PROJECT_STATUSES = (PROJECT_PENDING, PROJECT_APPROVED, PROJECT_REJECTED)

# Training modes, named as in the architecture document.
MODE_SIMULATION = "simulation"   # synthetic data, sites simulated in-process; a demo, not FL
MODE_FEDERATED = "federated"     # enrolled site agents train locally; the coordinator aggregates
MODE_LOCAL = "local"             # one site agent trains on its own data; private local ML, not FL
MODES = (MODE_SIMULATION, MODE_FEDERATED, MODE_LOCAL)

JOB_QUEUED = "Queued"
JOB_RUNNING = "In Progress"
JOB_COMPLETED = "Completed"
JOB_FAILED = "Failed"
JOB_CANCELLED = "Cancelled"
JOB_ACTIVE = (JOB_QUEUED, JOB_RUNNING)

SITE_PENDING = "Pending enrolment"
SITE_ACTIVE = "Active"
SITE_REVOKED = "Revoked"

SUBMISSION_STATUSES = ("Pending", "In Review", "Approved", "Rejected")


class Meta(Base):
    __tablename__ = "meta"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255))


class Organisation(Base):
    __tablename__ = "organisations"

    org_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="org")
    sites: Mapped[list["Site"]] = relationship(back_populates="org")


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default=ROLE_DEVELOPER)
    organisation_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organisations.org_id"), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bumped to invalidate every token issued before it (admin "revoke sessions").
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # TOTP secret, encrypted at rest; enabled only after the user proves a working code.
    mfa_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_last_step: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    org: Mapped[Optional[Organisation]] = relationship(back_populates="users")
    projects: Mapped[list["Project"]] = relationship(back_populates="owner", foreign_keys="Project.created_by")

    @property
    def organisation(self) -> Optional[str]:
        return self.org.name if self.org else None


class Site(Base):
    """A data-owner site running the FLIP agent. Authenticates with an Ed25519 key it generated itself."""
    __tablename__ = "sites"

    site_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organisations.org_id"), index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    status: Mapped[str] = mapped_column(String(32), default=SITE_PENDING)
    public_key: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_request_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    agent_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    enrolled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    org: Mapped[Organisation] = relationship(back_populates="sites")
    datasets: Mapped[list["SiteDataset"]] = relationship(back_populates="site", cascade="all, delete-orphan")


class SiteDataset(Base):
    """Schema of a dataset held at a site. Never contains rows."""
    __tablename__ = "site_datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.site_id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    schema: Mapped[str] = mapped_column(Text)  # JSON from flipml.site.profile
    rows: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    site: Mapped[Site] = relationship(back_populates="datasets")
    __table_args__ = (UniqueConstraint("site_id", "name"),)


class Project(Base):
    """A study: what to predict, from which features, at which sites, under which privacy policy."""
    __tablename__ = "projects"

    project_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_name: Mapped[str] = mapped_column(String(255), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    objectives: Mapped[str] = mapped_column(Text, default="")
    domain: Mapped[str] = mapped_column(String(50), default="Research")
    mode: Mapped[str] = mapped_column(String(20), default=MODE_SIMULATION)
    task_type: Mapped[str] = mapped_column(String(20), default="classification")
    dataset_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    target: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    features: Mapped[str] = mapped_column(Text, default="[]")   # JSON list
    site_ids: Mapped[str] = mapped_column(Text, default="[]")   # JSON list of eligible sites
    cohort_size: Mapped[int] = mapped_column(Integer, default=4)  # simulated sites (simulation mode)
    min_sites: Mapped[int] = mapped_column(Integer, default=2)
    families: Mapped[str] = mapped_column(Text, default='["linear"]')
    max_trials: Mapped[int] = mapped_column(Integer, default=4)
    dp_required: Mapped[bool] = mapped_column(Boolean, default=False)
    max_epsilon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"), index=True)
    status: Mapped[str] = mapped_column(String(50), default=PROJECT_PENDING, index=True)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.user_id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="projects", foreign_keys=[created_by])
    reviewer: Mapped[Optional[User]] = relationship(foreign_keys=[reviewed_by])
    trainings: Mapped[list["ModelTraining"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    submissions: Mapped[list["ModelAwaiting"]] = relationship(back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_projects_owner_status", "created_by", "status"),)


class Log(Base):
    __tablename__ = "logs"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.project_id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    level: Mapped[str] = mapped_column(String(20), default="info")
    log_message: Mapped[str] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    user: Mapped[Optional[User]] = relationship()
    project: Mapped[Optional[Project]] = relationship()


class ModelTraining(Base):
    __tablename__ = "model_training"

    training_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), index=True)
    started_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    status: Mapped[str] = mapped_column(String(50), default=JOB_QUEUED, index=True)
    mode: Mapped[str] = mapped_column(String(20), default=MODE_SIMULATION)
    task_type: Mapped[str] = mapped_column(String(20), default="classification")
    model_type: Mapped[str] = mapped_column(String(50), default="linear")  # model family
    algorithm: Mapped[str] = mapped_column(String(20), default="FedAvg")
    rounds: Mapped[int] = mapped_column(Integer, default=20)
    num_nodes: Mapped[int] = mapped_column(Integer, default=4)
    client_fraction: Mapped[float] = mapped_column(Float, default=1.0)
    local_epochs: Mapped[int] = mapped_column(Integer, default=2)
    batch_size: Mapped[int] = mapped_column(Integer, default=32)
    learning_rate: Mapped[float] = mapped_column(Float, default=0.1)
    mu: Mapped[float] = mapped_column(Float, default=0.0)
    dp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    clip_norm: Mapped[float] = mapped_column(Float, default=1.0)
    noise_multiplier: Mapped[float] = mapped_column(Float, default=0.0)
    data_source: Mapped[str] = mapped_column(String(255), default="Synthetic")
    sites: Mapped[str] = mapped_column(Text, default="[]")    # JSON [{site_id, name}] that took part
    group_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)  # AutoML search
    trial_index: Mapped[int] = mapped_column(Integer, default=1)
    trial_count: Mapped[int] = mapped_column(Integer, default=1)
    is_best: Mapped[bool] = mapped_column(Boolean, default=False)
    current_round: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rmse: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    selection_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # validation metric
    report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    weights: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="trainings")
    starter: Mapped[User] = relationship()
    round_metrics: Mapped[list["TrainingRound"]] = relationship(
        back_populates="training", cascade="all, delete-orphan", order_by="TrainingRound.round")
    artefact: Mapped[Optional["ModelArtefact"]] = relationship(back_populates="training", uselist=False, cascade="all, delete-orphan")


class TrainingRound(Base):
    __tablename__ = "training_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("model_training.training_id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rmse: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loss: Mapped[float] = mapped_column(Float)
    nodes: Mapped[str] = mapped_column(Text)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)

    training: Mapped[ModelTraining] = relationship(back_populates="round_metrics")


class AgentTask(Base):
    """A unit of work queued for one site agent. Payloads hold weights and study config, never rows."""
    __tablename__ = "agent_tasks"

    task_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.site_id", ondelete="CASCADE"), index=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("model_training.training_id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    round: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ModelArtefact(Base):
    """A versioned, signed record of a trained model."""
    __tablename__ = "model_artefacts"

    artefact_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("model_training.training_id", ondelete="CASCADE"), unique=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    signature: Mapped[str] = mapped_column(String(256))
    key_id: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    training: Mapped[ModelTraining] = relationship(back_populates="artefact")


class ModelAwaiting(Base):
    """A trained model put forward for deployment approval."""
    __tablename__ = "model_awaiting"

    awaiting_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), index=True)
    training_id: Mapped[Optional[int]] = mapped_column(ForeignKey("model_training.training_id", ondelete="SET NULL"), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), default="Pending")
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="submissions")
    requester: Mapped[User] = relationship()
    training: Mapped[Optional[ModelTraining]] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(String(500))
    link: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
