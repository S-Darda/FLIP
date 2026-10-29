"""Runs federated training jobs in the background and streams each round over WebSocket."""
import asyncio
import json
import logging
from pathlib import Path

from .audit import notify, record
from .config import TRAINING_ROUND_DELAY
from .database import SessionLocal
from .federated import (DatasetError, FederatedSession, TrainingConfig, csv_nodes,
                        synthetic_nodes)
from .models import (JOB_CANCELLED, JOB_COMPLETED, JOB_FAILED, JOB_RUNNING, Dataset,
                     ModelTraining, TrainingRound, utcnow)
from .realtime import manager

logger = logging.getLogger("flip.training")

_tasks: dict[int, asyncio.Task] = {}
_cancel_requested: set[int] = set()


def _event(job: ModelTraining, **extra) -> dict:
    return {"type": "training", "training_id": job.training_id, "project_id": job.project_id,
            "status": job.status, "current_round": job.current_round, "rounds": job.rounds,
            "accuracy": job.accuracy, "loss": job.loss, **extra}


def _build_session(job: ModelTraining, domain: str, dataset_path: str | None) -> FederatedSession:
    cfg = TrainingConfig(
        model_type=job.model_type, algorithm=job.algorithm, rounds=job.rounds,
        num_nodes=job.num_nodes, client_fraction=job.client_fraction,
        local_epochs=job.local_epochs, batch_size=job.batch_size,
        learning_rate=job.learning_rate, mu=job.mu, dp_enabled=job.dp_enabled,
        clip_norm=job.clip_norm, noise_multiplier=job.noise_multiplier,
        seed=1000 + job.training_id,
    )
    if dataset_path:
        nodes, features, classes = csv_nodes(Path(dataset_path), job.num_nodes, domain, cfg.seed)
    else:
        nodes, features, classes = synthetic_nodes(job.num_nodes, domain, seed=job.project_id * 31 + 5)
    return FederatedSession(cfg, nodes, features, classes)


def request_cancel(training_id: int) -> None:
    _cancel_requested.add(training_id)


def is_running(training_id: int) -> bool:
    task = _tasks.get(training_id)
    return task is not None and not task.done()


def start(training_id: int) -> None:
    loop = manager.loop
    if loop is None:
        raise RuntimeError("Event loop not bound")
    def _spawn():
        _tasks[training_id] = loop.create_task(run_training(training_id))
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is loop:
        _spawn()
    else:
        loop.call_soon_threadsafe(_spawn)


async def run_training(training_id: int, delay: float | None = None) -> None:
    delay = TRAINING_ROUND_DELAY if delay is None else delay
    db = SessionLocal()
    try:
        job = db.get(ModelTraining, training_id)
        if job is None:
            return
        project = job.project
        owner_id = project.created_by
        dataset = db.get(Dataset, job.dataset_id) if job.dataset_id else None

        job.status, job.started_at = JOB_RUNNING, utcnow()
        db.commit()
        record(db, "training.start",
               f"Training #{job.training_id} started: {job.algorithm}, {job.num_nodes} nodes, "
               f"{job.rounds} rounds on {job.data_source}",
               user=job.started_by, project_id=job.project_id, owner_id=owner_id)
        manager.publish(_event(job), users=[owner_id], admins=True)

        try:
            session = await asyncio.to_thread(
                _build_session, job, project.domain, dataset.stored_path if dataset else None)
        except DatasetError as exc:
            raise RuntimeError(f"Dataset problem: {exc}") from exc

        for rnd in range(1, job.rounds + 1):
            if training_id in _cancel_requested:
                _cancel_requested.discard(training_id)
                job.status, job.finished_at = JOB_CANCELLED, utcnow()
                db.commit()
                record(db, "training.cancel", f"Training #{job.training_id} cancelled at round {rnd - 1}",
                       user=owner_id, project_id=job.project_id, level="warning", owner_id=owner_id)
                manager.publish(_event(job), users=[owner_id], admins=True)
                return
            result = await asyncio.to_thread(session.run_round, rnd)
            db.add(TrainingRound(training_id=job.training_id, round=rnd, accuracy=result["accuracy"],
                                 loss=result["loss"], nodes=json.dumps(result["nodes"]),
                                 duration_ms=result["duration_ms"]))
            job.current_round, job.accuracy, job.loss = rnd, result["accuracy"], result["loss"]
            db.commit()
            manager.publish(_event(job, round_metrics=result), users=[owner_id], admins=True)
            if delay:
                await asyncio.sleep(delay)

        report = await asyncio.to_thread(session.report)
        job.report = json.dumps(report)
        job.weights = json.dumps(session.export_weights())
        job.accuracy, job.loss = report["accuracy"], report["loss"]
        job.status, job.finished_at = JOB_COMPLETED, utcnow()
        db.commit()
        record(db, "training.complete",
               f"Training #{job.training_id} completed with accuracy {report['accuracy']:.1%} "
               f"(F1 {report['f1']:.3f})",
               user=owner_id, project_id=job.project_id, owner_id=owner_id)
        notify(db, owner_id, f"Training #{job.training_id} for '{project.project_name}' finished: "
                             f"{report['accuracy']:.1%} accuracy", f"/app/training/{job.training_id}",
               kind="success")
        manager.publish(_event(job), users=[owner_id], admins=True)
    except Exception as exc:  # noqa: BLE001 - surface any failure on the job itself
        logger.exception("Training %s failed", training_id)
        db.rollback()
        job = db.get(ModelTraining, training_id)
        if job:
            job.status, job.error, job.finished_at = JOB_FAILED, str(exc), utcnow()
            db.commit()
            owner_id = job.project.created_by
            record(db, "training.fail", f"Training #{training_id} failed: {exc}",
                   user=owner_id, project_id=job.project_id, level="error", owner_id=owner_id)
            notify(db, owner_id, f"Training #{training_id} failed: {exc}",
                   f"/app/training/{training_id}", kind="error")
            manager.publish(_event(job), users=[owner_id], admins=True)
    finally:
        _tasks.pop(training_id, None)
        db.close()
