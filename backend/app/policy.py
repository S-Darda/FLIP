"""Study and run policy. Unsupported combinations are rejected with a reason, never silently
downgraded (architecture §04: "the UI should prohibit unsupported algorithm/security combinations")."""
import json

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import privacy
from .models import (JOB_ACTIVE, JOB_COMPLETED, MODE_FEDERATED, MODE_LOCAL, MODE_SIMULATION, SITE_ACTIVE,
                     ModelTraining, Project, Site)


def _fail(msg: str, code: int = status.HTTP_422_UNPROCESSABLE_ENTITY):
    raise HTTPException(code, msg)


def _column(schema: dict, name: str) -> dict | None:
    return next((c for c in schema.get("columns", []) if c["name"] == name), None)


def check_study(db: Session, s: dict) -> dict:
    """Validate and normalise a study definition (a dict of Project fields). Returns the cleaned dict."""
    mode = s["mode"]
    if mode == MODE_SIMULATION:
        # Synthetic data only: there is no real dataset, target or site to choose.
        s.update(dataset_name=None, target=None, features=[], site_ids=[], min_sites=2)
        return s

    if not s.get("dataset_name"):
        _fail("Choose the site dataset this study trains on")
    if not s.get("target"):
        _fail("Choose a target column")
    if not s.get("features"):
        _fail("Choose at least one feature column")
    if s["target"] in s["features"]:
        _fail("The target cannot also be a feature")
    if len(set(s["features"])) != len(s["features"]):
        _fail("Features are listed more than once")
    sites = db.query(Site).filter(Site.site_id.in_(s["site_ids"])).all() if s["site_ids"] else []
    if len(sites) != len(set(s["site_ids"])):
        _fail("One or more selected sites do not exist")

    if mode == MODE_LOCAL:
        if len(sites) != 1:
            _fail("Local AutoML runs on exactly one site. Choose Federated AutoML to combine several sites.")
        if s.get("dp_required"):
            _fail("Client-level differential privacy needs at least two sites; it cannot protect a single-site run")
        s["min_sites"] = 1
    elif mode == MODE_FEDERATED:
        if s["min_sites"] < 2:
            _fail("A federated study needs a minimum cohort of at least 2 sites")
        if len(sites) < s["min_sites"]:
            _fail(f"Select at least {s['min_sites']} sites (the study's minimum cohort)")

    for site in sites:
        ds = next((d for d in site.datasets if d.name == s["dataset_name"]), None)
        if ds is None:
            continue  # a site that hasn't registered the dataset yet is checked again when training starts
        schema = json.loads(ds.schema)
        for f in s["features"]:
            col = _column(schema, f)
            if col is None:
                _fail(f"{site.name}: dataset '{ds.name}' has no column '{f}'")
            if col["type"] != "numeric":
                _fail(f"Feature '{f}' is not numeric at {site.name}. Phase 1 supports numeric features only.")
        tcol = _column(schema, s["target"])
        if tcol is None:
            _fail(f"{site.name}: dataset '{ds.name}' has no column '{s['target']}'")
        if s["task_type"] == "regression" and tcol["type"] != "numeric":
            _fail(f"Regression needs a numeric target; '{s['target']}' is categorical at {site.name}")
        if s["task_type"] == "classification" and not tcol.get("values"):
            _fail(f"'{s['target']}' at {site.name} has too many distinct values (or rare values) to use as a class label")
    return s


def released(db: Session, project: Project) -> list[tuple[float, int]]:
    """(noise multiplier, rounds) for every DP run of the study that has released, or is releasing, models."""
    rows = db.query(ModelTraining).filter(ModelTraining.project_id == project.project_id,
                                          ModelTraining.dp_enabled.is_(True)).all()
    return [(r.noise_multiplier, r.current_round if r.status not in JOB_ACTIVE else r.rounds)
            for r in rows if r.status in (JOB_COMPLETED, *JOB_ACTIVE) or r.current_round]


def check_run(db: Session, project: Project, body) -> dict:
    """Validate a training request against the study policy. Returns budget figures for the response."""
    if project.mode == MODE_LOCAL and body.dp_enabled:
        _fail("Client-level DP is not available for a single-site Local AutoML run")
    if project.dp_required and (not body.dp_enabled or body.noise_multiplier <= 0):
        _fail("This study requires differential privacy with a noise multiplier above 0")
    if body.trials > project.max_trials:
        _fail(f"This study allows at most {project.max_trials} AutoML trial(s)")
    families = json.loads(project.families or '["linear"]')
    if body.family and body.family not in families:
        _fail(f"The study only allows these model families: {', '.join(families)}")

    spent = privacy.epsilon_for_releases(released(db, project)) if project.max_epsilon else None
    projected = None
    if project.max_epsilon is not None:
        planned = (body.noise_multiplier if body.dp_enabled else 0.0, body.rounds * body.trials)
        projected = privacy.epsilon_for_releases(released(db, project) + [planned])
        if projected is None:
            _fail(f"This study has a privacy budget of ε = {project.max_epsilon}; runs without DP noise would exceed it")
        if projected > project.max_epsilon:
            _fail(f"This run would bring the study's privacy spend to ε = {projected:.2f}, above its limit of "
                  f"ε = {project.max_epsilon}. Use more noise, fewer rounds or fewer trials.")

    if project.mode != MODE_SIMULATION:
        ids = json.loads(project.site_ids or "[]")
        ready = [s for s in db.query(Site).filter(Site.site_id.in_(ids)).all()
                 if s.status == SITE_ACTIVE and any(d.name == project.dataset_name for d in s.datasets)] if ids else []
        need = 1 if project.mode == MODE_LOCAL else max(2, project.min_sites)
        if len(ready) < need:
            _fail(f"{len(ready)} of the study's sites are enrolled with dataset '{project.dataset_name}'; "
                  f"at least {need} are needed to start", status.HTTP_409_CONFLICT)
    return {"epsilon_spent": spent, "epsilon_projected": projected}
