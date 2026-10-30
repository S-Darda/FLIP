"""Federation coordinator.

One algorithm, two transports:
  SimTransport    sites simulated in this process on synthetic data (MODE_SIMULATION)
  AgentTransport  enrolled site agents, reached through the agent task queue (federated / local)

Per run: sites prepare splits and report feature moments; the coordinator builds global
standardisation statistics; then for each round the selected sites train locally and return
(clipped) updates, which are aggregated with FedAvg/FedProx and, under DP, Gaussian noise.
Every site then scores the new model on its validation split and returns aggregate statistics
only. The final model is scored on each site's test split, recorded as a signed artefact, and,
within an AutoML search, the best trial is chosen by validation score, never by test score.

Phase 1 has no secure aggregation, so the coordinator can see each site's update; reports say so.
"""
import asyncio
import json
import logging
import time
import uuid

import numpy as np

from flipml import (finalize, finalize_moments, init_params, l2_norm, merge_moments, merge_stats, synth)
from flipml.site import SiteData, TaskRejected, handle

from . import privacy
from .audit import notify, record
from .config import AGENT_TASK_TIMEOUT, MIN_REPORT_ROWS, TRAINING_ROUND_DELAY
from .database import SessionLocal
from .models import (JOB_CANCELLED, JOB_COMPLETED, JOB_FAILED, JOB_RUNNING, MODE_FEDERATED, MODE_LOCAL,
                     MODE_SIMULATION, AgentTask, ModelArtefact, ModelTraining, Site, TrainingRound, utcnow)
from .realtime import manager
from .security import artefact_key_id, sign_artefact

logger = logging.getLogger("flip.coordinator")

_tasks: dict[str, asyncio.Task] = {}
_cancel_requested: set[int] = set()
NODE_PREFIX = {"Healthcare": "Hospital", "Finance": "Bank", "Research": "Lab", "Retail": "Store", "Public Sector": "Agency"}


class RunFailed(RuntimeError):
    pass


class Cancelled(Exception):
    pass


# ---------------------------------------------------------------- transports

class SimTransport:
    def __init__(self, sites: dict[str, SiteData]):
        self.sites = sites

    async def call(self, kind: str, payloads: dict[str, dict]) -> dict:
        async def one(name, p):
            try:
                return name, await asyncio.to_thread(handle, self.sites[name], kind, p)
            except TaskRejected as exc:
                return name, exc
        return dict(await asyncio.gather(*(one(n, p) for n, p in payloads.items())))


class AgentTransport:
    def __init__(self, training_id: int, site_ids: dict[str, int], dataset: str):
        self.training_id, self.site_ids, self.dataset = training_id, site_ids, dataset

    async def call(self, kind: str, payloads: dict[str, dict]) -> dict:
        db = SessionLocal()
        try:
            ids = {}
            for name, p in payloads.items():
                t = AgentTask(site_id=self.site_ids[name], training_id=self.training_id, kind=kind,
                              round=int(p.get("round", 0)), payload=json.dumps({**p, "dataset": self.dataset}))
                db.add(t)
                db.flush()
                ids[name] = t.task_id
            db.commit()
            deadline = time.monotonic() + AGENT_TASK_TIMEOUT
            while True:
                if self.training_id in _cancel_requested:
                    raise Cancelled()
                db.expire_all()
                rows = {t.task_id: t for t in db.query(AgentTask).filter(AgentTask.task_id.in_(ids.values()))}
                if all(rows[i].status in ("done", "failed") for i in ids.values()) or time.monotonic() > deadline:
                    break
                await asyncio.sleep(0.15)
            out = {}
            for name, i in ids.items():
                t = rows[i]
                if t.status == "done":
                    out[name] = json.loads(t.result)
                elif t.status == "failed":
                    out[name] = TaskRejected(t.error or "site rejected the task")
                else:
                    t.status = "expired"
                    out[name] = TimeoutError("no answer before the timeout")
            db.commit()
            return out
        finally:
            db.close()


# ---------------------------------------------------------------- helpers

def _event(job: ModelTraining, **extra) -> dict:
    return {"type": "training", "training_id": job.training_id, "project_id": job.project_id,
            "status": job.status, "current_round": job.current_round, "rounds": job.rounds,
            "accuracy": job.accuracy, "loss": job.loss, "rmse": job.rmse, "task_type": job.task_type,
            "group_id": job.group_id, **extra}


def _classes_from_schemas(schemas: list[dict], target: str) -> list[str]:
    values: set[str] = set()
    for sch in schemas:
        col = next((c for c in sch.get("columns", []) if c["name"] == target), None)
        if not col or col.get("values") is None:
            raise RunFailed(f"Target '{target}' has no shareable category list at every site")
        values.update(col["values"])
    if len(values) < 2:
        raise RunFailed(f"Target '{target}' needs at least two classes")
    return sorted(values)


def _build(db, job: ModelTraining):
    """Return (transport, site list, study base payload, min sites) for the job's mode."""
    project = job.project
    seed = 1000 + job.training_id
    if job.mode == MODE_SIMULATION:
        gen = synth.classification_sites if job.task_type == "classification" else synth.regression_sites
        tables = [SiteData.from_arrays(c) for c in gen(job.num_nodes, seed=project.project_id * 31 + 5)]
        prefix = NODE_PREFIX.get(project.domain, "Node")
        names = [f"{prefix} {chr(65 + i)}" for i in range(len(tables))]
        target = "label" if job.task_type == "classification" else "target"
        features = [h for h in tables[0].header if h != target]
        classes = _classes_from_schemas([t.schema() for t in tables], target) if job.task_type == "classification" else None
        transport = SimTransport(dict(zip(names, tables)))
        sites = [{"name": n, "site_id": None} for n in names]
        min_sites = 2
    else:
        ids = json.loads(project.site_ids or "[]")
        rows = db.query(Site).filter(Site.site_id.in_(ids)).all() if ids else []
        sites, schemas = [], []
        for s in rows:
            ds = next((d for d in s.datasets if d.name == project.dataset_name), None)
            if s.status == "Active" and ds:
                sites.append({"name": s.name, "site_id": s.site_id})
                schemas.append(json.loads(ds.schema))
        features, target = json.loads(project.features or "[]"), project.target
        classes = _classes_from_schemas(schemas, target) if job.task_type == "classification" and schemas else None
        transport = AgentTransport(job.training_id, {s["name"]: s["site_id"] for s in sites}, project.dataset_name)
        min_sites = 1 if job.mode == MODE_LOCAL else max(2, project.min_sites)
    base = {"task": job.task_type, "features": features, "target": target, "classes": classes, "seed": seed}
    return transport, sites, base, min_sites


def _site_metrics(stats: dict, classes) -> dict:
    """Per-site figures for reports, suppressed when computed on too few rows."""
    n = stats.get("n", 0)
    if n < MIN_REPORT_ROWS:
        return {"suppressed": True, "rows": None}
    m = finalize(stats, classes)
    return {"suppressed": False, "rows": n, "accuracy": m.get("accuracy"), "rmse": m.get("rmse"), "loss": m.get("loss")}


def request_cancel(training_id: int) -> None:
    _cancel_requested.add(training_id)


_active_ids: set[int] = set()


def is_running(training_id: int) -> bool:
    return training_id in _active_ids


def start(training_ids: list[int]) -> None:
    """Run one job, or an AutoML group of trials one after another."""
    loop = manager.loop
    if loop is None:
        raise RuntimeError("Event loop not bound")
    key = uuid.uuid4().hex

    def _spawn():
        _tasks[key] = loop.create_task(run_group(training_ids))
        _tasks[key].add_done_callback(lambda _: _tasks.pop(key, None))
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is loop:
        _spawn()
    else:
        loop.call_soon_threadsafe(_spawn)


async def run_group(training_ids: list[int], delay: float | None = None) -> None:
    _active_ids.update(training_ids)
    try:
        for tid in training_ids:
            await run_training(tid, delay)
        if len(training_ids) > 1:
            _pick_best(training_ids)
    finally:
        _active_ids.difference_update(training_ids)


def _pick_best(training_ids: list[int]) -> None:
    db = SessionLocal()
    try:
        jobs = db.query(ModelTraining).filter(ModelTraining.training_id.in_(training_ids)).all()
        done = [j for j in jobs if j.status == JOB_COMPLETED and j.selection_score is not None]
        if not done:
            return
        best = max(done, key=lambda j: j.selection_score)
        best.is_best = True
        db.commit()
        owner = best.project.created_by
        record(db, "automl.select", f"AutoML picked trial {best.trial_index}/{best.trial_count} (run #{best.training_id}) "
               f"for '{best.project.project_name}' by validation score", user=owner, project_id=best.project_id, owner_id=owner)
        notify(db, owner, f"AutoML search finished for '{best.project.project_name}': best is run #{best.training_id}",
               f"/app/training/{best.training_id}", kind="success")
        manager.publish(_event(best, automl_done=True), users=[owner], admins=True)
    finally:
        db.close()


# ---------------------------------------------------------------- the run

async def run_training(training_id: int, delay: float | None = None) -> None:
    delay = TRAINING_ROUND_DELAY if delay is None else delay
    db = SessionLocal()
    t_start = time.perf_counter()
    try:
        job = db.get(ModelTraining, training_id)
        if job is None or job.status != "Queued":
            return
        project = job.project
        owner_id = project.created_by
        job.status, job.started_at = JOB_RUNNING, utcnow()
        db.commit()
        transport, sites, base, min_sites = _build(db, job)
        job.sites = json.dumps(sites)
        job.num_nodes = len(sites)
        db.commit()
        trial = f" (AutoML trial {job.trial_index}/{job.trial_count})" if job.trial_count > 1 else ""
        record(db, "training.start", f"Training #{job.training_id}{trial} started: {job.mode}, {job.algorithm}, "
               f"{len(sites)} site(s), {job.rounds} rounds", user=job.started_by, project_id=job.project_id, owner_id=owner_id)
        manager.publish(_event(job), users=[owner_id], admins=True)
        if len(sites) < min_sites:
            raise RunFailed(f"Only {len(sites)} eligible site(s) are online with the dataset; this study needs {min_sites}")

        # 1. Prepare: local splits and aggregate statistics only.
        prep_results = await transport.call("prepare", {s["name"]: base for s in sites})
        ok = [s for s in sites if not isinstance(prep_results[s["name"]], Exception)]
        for s in sites:
            if isinstance(prep_results[s["name"]], Exception):
                record(db, "training.site_dropout", f"{s['name']} could not prepare: {prep_results[s['name']]}",
                       project_id=job.project_id, level="warning", owner_id=owner_id)
        if len(ok) < min_sites:
            raise RunFailed(f"Only {len(ok)} site(s) could prepare the data; this study needs {min_sites}")
        good = [prep_results[s["name"]] for s in ok]
        mean, std = finalize_moments(merge_moments([g["moments"] for g in good]))
        prep = {"mean": mean, "std": std}
        if job.task_type == "regression":
            tm, ts = finalize_moments(merge_moments([g["target_moments"] for g in good]))
            prep.update(target_mean=tm[0], target_std=ts[0])
        n_train = {s["name"]: prep_results[s["name"]]["n_train"] for s in ok}
        classes = base["classes"]
        out_dim = len(classes) if job.task_type == "classification" else 1
        rng = np.random.default_rng(1000 + job.training_id)
        params = init_params(job.model_type, len(base["features"]), out_dim, 32, rng)
        common = {**base, "prep": prep, "family": job.model_type, "hidden": 32}
        dropped: dict[str, int] = {}
        val_metrics = {}

        # 2. Federated rounds.
        for rnd in range(1, job.rounds + 1):
            if training_id in _cancel_requested:
                raise Cancelled()
            t0 = time.perf_counter()
            m = min(len(ok), max(min_sites, round(job.client_fraction * len(ok))))
            chosen = [ok[i] for i in sorted(rng.choice(len(ok), size=m, replace=False))]
            payload = {**common, "params": [p.tolist() for p in params], "epochs": job.local_epochs,
                       "batch_size": job.batch_size, "lr": job.learning_rate,
                       "mu": job.mu if job.algorithm == "FedProx" else 0.0, "round": rnd,
                       "clip": job.clip_norm if job.dp_enabled else None}
            res = await transport.call("train", {s["name"]: payload for s in chosen})
            updates, weights, norms = [], [], {}
            for s in chosen:
                r = res[s["name"]]
                if isinstance(r, Exception):
                    dropped[s["name"]] = dropped.get(s["name"], 0) + 1
                    record(db, "training.site_dropout", f"{s['name']} missed round {rnd}: {r}",
                           project_id=job.project_id, level="warning", owner_id=owner_id)
                    continue
                delta = [np.asarray(d, float) for d in r["delta"]]
                if [d.shape for d in delta] != [p.shape for p in params]:
                    dropped[s["name"]] = dropped.get(s["name"], 0) + 1
                    continue
                norm = l2_norm(delta)
                # Under DP the coordinator verifies each site really clipped, and discards updates that didn't.
                if job.dp_enabled and norm > job.clip_norm * (1 + 1e-6):
                    record(db, "training.update_rejected", f"{s['name']} sent an unclipped update in round {rnd}",
                           project_id=job.project_id, level="error", owner_id=owner_id)
                    continue
                norms[s["name"]] = norm
                updates.append(delta)
                weights.append(1.0 if job.dp_enabled else float(r["n"]))
            if len(updates) < min_sites:
                raise RunFailed(f"Round {rnd}: only {len(updates)} usable update(s); the minimum cohort is {min_sites}")
            total = sum(weights)
            agg = [sum(w * u[j] for w, u in zip(weights, updates)) / total for j in range(len(params))]
            if job.dp_enabled and job.noise_multiplier > 0:
                sigma = job.noise_multiplier * job.clip_norm / len(updates)
                agg = [a + rng.normal(0, sigma, a.shape) for a in agg]
            params = [p + a for p, a in zip(params, agg)]

            ev = await transport.call("eval", {s["name"]: {**common, "params": [p.tolist() for p in params], "split": "val"} for s in ok})
            site_stats = {n: v for n, v in ev.items() if not isinstance(v, Exception)}
            merged = finalize(merge_stats(list(site_stats.values())), classes)
            if not merged:
                raise RunFailed(f"Round {rnd}: no site returned evaluation statistics")
            val_metrics = merged
            nodes = []
            for s in ok:
                st = site_stats.get(s["name"])
                info = _site_metrics(st, classes) if st else {"suppressed": False, "rows": None, "unavailable": True}
                nodes.append({"name": s["name"], "selected": s in chosen, "dropped": s in chosen and s["name"] not in norms,
                              "train_samples": n_train[s["name"]] if n_train[s["name"]] >= MIN_REPORT_ROWS else None,
                              "test_samples": info.get("rows"), "update_norm": norms.get(s["name"]), **info})
            metrics = {"round": rnd, "accuracy": merged.get("accuracy"), "rmse": merged.get("rmse"), "loss": merged["loss"],
                       "nodes": nodes, "duration_ms": int((time.perf_counter() - t0) * 1000)}
            db.add(TrainingRound(training_id=job.training_id, round=rnd, accuracy=metrics["accuracy"], rmse=metrics["rmse"],
                                 loss=metrics["loss"], nodes=json.dumps(nodes), duration_ms=metrics["duration_ms"]))
            job.current_round, job.accuracy, job.rmse, job.loss = rnd, metrics["accuracy"], metrics["rmse"], metrics["loss"]
            db.commit()
            manager.publish(_event(job, round_metrics=metrics), users=[owner_id], admins=True)
            if delay:
                await asyncio.sleep(delay)

        # 3. Final evaluation on each site's untouched test split.
        ev = await transport.call("eval", {s["name"]: {**common, "params": [p.tolist() for p in params], "split": "test"} for s in ok})
        site_stats = {n: v for n, v in ev.items() if not isinstance(v, Exception)}
        final = finalize(merge_stats(list(site_stats.values())), classes)
        per_site = [{"name": n, **_site_metrics(st, classes)} for n, st in site_stats.items()]
        importance = None
        if job.model_type == "linear":
            mag = np.linalg.norm(params[0], axis=1)
            importance = [{"feature": base["features"][i], "weight": float(mag[i])} for i in np.argsort(-mag)[:12]]
        selection = (val_metrics.get("f1") if job.task_type == "classification" else -val_metrics.get("rmse", 0.0))
        visibility = ("Simulation: every site ran inside the FLIP server on synthetic data. This is a demonstration, "
                      "not federated learning between organisations." if job.mode == MODE_SIMULATION else
                      "Single-site Local AutoML: private local training, not federated learning." if job.mode == MODE_LOCAL else
                      "Raw rows stayed at each site. Individual site updates were visible to the coordinator because "
                      "secure aggregation is not implemented yet (Phase 2).")
        report = {**final, "classes": classes, "features": base["features"], "per_site": per_site,
                  "feature_importance": importance, "validation": {k: val_metrics.get(k) for k in ("accuracy", "f1", "auroc", "rmse", "mae", "r2", "loss")},
                  "selection_metric": "validation macro F1" if job.task_type == "classification" else "validation RMSE (lower is better)",
                  "train_samples": sum(v for v in n_train.values()), "sites": len(ok), "dropouts": dropped,
                  "training_seconds": round(time.perf_counter() - t_start, 2), "mode": job.mode, "update_visibility": visibility,
                  "min_report_rows": MIN_REPORT_ROWS,
                  "privacy": privacy.summary(job.dp_enabled, job.noise_multiplier, job.clip_norm, job.current_round),
                  "parameters": int(sum(p.size for p in params))}
        report["privacy_epsilon"] = report["privacy"]["epsilon"]
        version = db.query(ModelArtefact).filter(ModelArtefact.project_id == job.project_id).count() + 1
        document = {"format": "flip-model/1", "project_id": job.project_id, "training_id": job.training_id,
                    "version": version, "task": job.task_type, "family": job.model_type, "features": base["features"],
                    "classes": classes, "preprocessing": prep, "params": [p.round(6).tolist() for p in params],
                    "privacy": report["privacy"], "created_at": utcnow().isoformat() + "Z"}
        digest, signature = sign_artefact(document)
        db.add(ModelArtefact(training_id=job.training_id, project_id=job.project_id, version=version,
                             sha256=digest, signature=signature, key_id=artefact_key_id()))
        job.report, job.weights = json.dumps(report), json.dumps(document)
        job.accuracy, job.rmse, job.loss = final.get("accuracy"), final.get("rmse"), final.get("loss")
        job.selection_score = selection
        job.status, job.finished_at = JOB_COMPLETED, utcnow()
        db.commit()
        headline = f"accuracy {final['accuracy']:.1%}" if job.task_type == "classification" else f"RMSE {final['rmse']:.3f}"
        record(db, "training.complete", f"Training #{job.training_id}{trial} completed: {headline}; signed artefact v{version}",
               user=owner_id, project_id=job.project_id, owner_id=owner_id)
        if job.trial_count == 1:
            notify(db, owner_id, f"Training #{job.training_id} for '{project.project_name}' finished: {headline}",
                   f"/app/training/{job.training_id}", kind="success")
        manager.publish(_event(job), users=[owner_id], admins=True)
    except Cancelled:
        db.rollback()
        job = db.get(ModelTraining, training_id)
        _cancel_requested.discard(training_id)
        job.status, job.finished_at = JOB_CANCELLED, utcnow()
        db.commit()
        record(db, "training.cancel", f"Training #{training_id} cancelled at round {job.current_round}",
               user=job.project.created_by, project_id=job.project_id, level="warning", owner_id=job.project.created_by)
        manager.publish(_event(job), users=[job.project.created_by], admins=True)
    except Exception as exc:  # noqa: BLE001 - surface any failure on the job itself
        if not isinstance(exc, RunFailed):
            logger.exception("Training %s failed", training_id)
        db.rollback()
        job = db.get(ModelTraining, training_id)
        if job:
            job.status, job.error, job.finished_at = JOB_FAILED, str(exc), utcnow()
            db.commit()
            owner_id = job.project.created_by
            record(db, "training.fail", f"Training #{training_id} failed: {exc}", user=owner_id,
                   project_id=job.project_id, level="error", owner_id=owner_id)
            notify(db, owner_id, f"Training #{training_id} failed: {exc}", f"/app/training/{training_id}", kind="error")
            manager.publish(_event(job), users=[owner_id], admins=True)
    finally:
        db.close()
