"""SQLAlchemy models. Table and column names follow the FLIP data dictionary (thesis §4.5.6)."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


ROLE_ADMIN = "Admin"
ROLE_DEVELOPER = "Developer"
ROLES = (ROLE_ADMIN, ROLE_DEVELOPER)

PROJECT_PENDING = "Pending"
PROJECT_APPROVED = "Approved"
PROJECT_REJECTED = "Rejected"
PROJECT_STATUSES = (PROJECT_PENDING, PROJECT_APPROVED, PROJECT_REJECTED)

JOB_QUEUED = "Queued"
JOB_RUNNING = "In Progress"
JOB_COMPLETED = "Completed"
JOB_FAILED = "Failed"
JOB_CANCELLED = "Cancelled"
JOB_ACTIVE = (JOB_QUEUED, JOB_RUNNING)

SUBMISSION_STATUSES = ("Pending", "In Review", "Approved", "Rejected")


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default=ROLE_DEVELOPER)
    organisation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bumped to invalidate every token issued before it (admin "revoke sessions").
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="owner", foreign_keys="Project.created_by"
    )


class Project(Base):
    __tablename__ = "projects"

    project_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_name: Mapped[str] = mapped_column(String(255), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    objectives: Mapped[str] = mapped_column(Text, default="")
    domain: Mapped[str] = mapped_column(String(50), default="Research")
    cohort_size: Mapped[int] = mapped_column(Integer, default=4)
    model_type: Mapped[str] = mapped_column(String(50), default="logreg")
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
    datasets: Mapped[list["Dataset"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    trainings: Mapped[list["ModelTraining"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["ModelAwaiting"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_projects_owner_status", "created_by", "status"),)


class Dataset(Base):
    __tablename__ = "datasets"

    dataset_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    rows: Mapped[int] = mapped_column(Integer, default=0)
    columns: Mapped[int] = mapped_column(Integer, default=0)
    label_column: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    classes: Mapped[int] = mapped_column(Integer, default=0)
    trainable: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped[Project] = relationship(back_populates="datasets")


class Log(Base):
    __tablename__ = "logs"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("projects.project_id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True, index=True
    )
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
    model_type: Mapped[str] = mapped_column(String(50), default="logreg")
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
    dataset_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("datasets.dataset_id", ondelete="SET NULL"), nullable=True
    )
    data_source: Mapped[str] = mapped_column(String(255), default="Synthetic")
    current_round: Mapped[int] = mapped_column(Integer, default=0)
    accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    report: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON
    weights: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="trainings")
    starter: Mapped[User] = relationship()
    round_metrics: Mapped[list["TrainingRound"]] = relationship(
        back_populates="training", cascade="all, delete-orphan", order_by="TrainingRound.round"
    )


class TrainingRound(Base):
    __tablename__ = "training_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    training_id: Mapped[int] = mapped_column(
        ForeignKey("model_training.training_id", ondelete="CASCADE"), index=True
    )
    round: Mapped[int] = mapped_column(Integer)
    accuracy: Mapped[float] = mapped_column(Float)
    loss: Mapped[float] = mapped_column(Float)
    nodes: Mapped[str] = mapped_column(Text)  # JSON list of per-node metrics
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)

    training: Mapped[ModelTraining] = relationship(back_populates="round_metrics")


class ModelAwaiting(Base):
    """A trained model put forward for deployment approval."""
    __tablename__ = "model_awaiting"

    awaiting_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.project_id", ondelete="CASCADE"), index=True)
    training_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("model_training.training_id", ondelete="SET NULL"), nullable=True
    )
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
