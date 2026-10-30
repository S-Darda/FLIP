"""Demo data for a fresh database. Contains no real records.

Three hospital sites are registered but not enrolled: start them with the demo launcher
(`python -m flip_agent.demo`), which enrols one agent per hospital with its own synthetic data."""
import json
import random
from datetime import timedelta

from .audit import record
from .database import SessionLocal
from .models import (JOB_QUEUED, MODE_FEDERATED, MODE_SIMULATION, PROJECT_APPROVED, PROJECT_PENDING,
                     PROJECT_REJECTED, ROLE_ADMIN, ROLE_DEVELOPER, SITE_PENDING, Log, ModelTraining, Notification,
                     Organisation, Project, Site, User, utcnow)
from .security import hash_password
from .training_runner import run_group

ORGS = ["FLIP Operations", "St Mary's Health Trust", "Riverside Hospital Trust", "Northgate Medical Centre",
        "Northbank Financial"]
DEMO_USERS = [
    ("Platform Admin", "admin@flip.demo", "admin123", ROLE_ADMIN, "FLIP Operations"),
    ("Aisha Khan", "dev@flip.demo", "dev12345", ROLE_DEVELOPER, "St Mary's Health Trust"),
    ("Tom Becker", "tom@flip.demo", "dev12345", ROLE_DEVELOPER, "Northbank Financial"),
]
DEMO_SITES = [("St Marys Hospital", "St Mary's Health Trust"), ("Riverside Hospital", "Riverside Hospital Trust"),
              ("Northgate Medical", "Northgate Medical Centre")]
READMISSION_FEATURES = ["age", "length_of_stay", "prior_admissions", "num_medications", "hba1c", "bmi"]


async def seed_if_empty() -> bool:
    db = SessionLocal()
    try:
        if db.query(User).count():
            return False
        orgs = {name: Organisation(name=name) for name in ORGS}
        db.add_all(orgs.values())
        db.commit()
        users = {}
        for name, email, pw, role, org in DEMO_USERS:
            users[email] = User(username=name, email=email, password_hash=hash_password(pw), role=role,
                                organisation_id=orgs[org].org_id)
        db.add_all(users.values())
        sites = [Site(name=n, org_id=orgs[o].org_id, status=SITE_PENDING) for n, o in DEMO_SITES]
        db.add_all(sites)
        db.commit()
        admin, aisha, tom = users["admin@flip.demo"], users["dev@flip.demo"], users["tom@flip.demo"]
        site_ids = json.dumps([s.site_id for s in sites])
        now = utcnow()

        def study(owner, name, status, **kw):
            p = Project(project_name=name, created_by=owner.user_id, status=status, **kw)
            if status != PROJECT_PENDING:
                p.reviewed_by, p.reviewed_at = admin.user_id, now
            db.add(p)
            db.commit()
            db.refresh(p)
            record(db, "project.create", f"{owner.username} submitted '{name}' for approval", user=owner, project_id=p.project_id)
            if status != PROJECT_PENDING:
                record(db, "project.review", f"{admin.username} {status.lower()} '{name}'", user=admin, project_id=p.project_id)
            return p

        study(aisha, "Hospital Readmission Risk", PROJECT_APPROVED, domain="Healthcare", mode=MODE_FEDERATED,
              task_type="classification", dataset_name="readmissions", target="readmitted",
              features=json.dumps(READMISSION_FEATURES), site_ids=site_ids, min_sites=2,
              families=json.dumps(["linear", "mlp"]), max_trials=4, max_epsilon=60.0,
              description="Predict 30-day readmission across three hospitals. Each hospital's agent keeps its "
                          "records on site; only model updates and aggregate statistics reach FLIP.",
              objectives="Beat 70% accuracy and identify the strongest risk factors.")
        study(aisha, "Length of Stay Forecast", PROJECT_PENDING, domain="Healthcare", mode=MODE_FEDERATED,
              task_type="regression", dataset_name="readmissions", target="discharge_los_days",
              features=json.dumps(READMISSION_FEATURES), site_ids=site_ids, min_sites=2,
              families=json.dumps(["linear"]), max_trials=3,
              description="Regression study: forecast length of stay in days from admission data at each hospital.")
        sepsis = study(aisha, "Early Sepsis Detection (simulation)", PROJECT_APPROVED, domain="Healthcare",
                       mode=MODE_SIMULATION, task_type="classification", cohort_size=4,
                       families=json.dumps(["mlp", "linear"]),
                       description="Synthetic simulation comparing a neural network with a linear baseline.")
        fraud = study(tom, "Cross-Bank Fraud Signals (simulation)", PROJECT_APPROVED, domain="Finance",
                      mode=MODE_SIMULATION, task_type="classification", cohort_size=6, dp_required=True,
                      description="Synthetic simulation of client-level DP across six banks.")
        study(tom, "Credit Scoring Pilot", PROJECT_REJECTED, domain="Finance", mode=MODE_SIMULATION,
              description="Shared credit scoring model.",
              feedback="Please add a fairness assessment plan and confirm each bank's data-sharing agreement.")

        jobs = [
            ModelTraining(project_id=sepsis.project_id, started_by=aisha.user_id, status=JOB_QUEUED, mode=MODE_SIMULATION,
                          task_type="classification", model_type="mlp", algorithm="FedProx", mu=0.01, rounds=30,
                          num_nodes=4, local_epochs=2, learning_rate=0.05, data_source="Synthetic simulation"),
            ModelTraining(project_id=fraud.project_id, started_by=tom.user_id, status=JOB_QUEUED, mode=MODE_SIMULATION,
                          task_type="classification", model_type="linear", rounds=20, num_nodes=6, local_epochs=1,
                          learning_rate=0.1, dp_enabled=True, clip_norm=1.0, noise_multiplier=1.0,
                          data_source="Synthetic simulation"),
        ]
        db.add_all(jobs)
        db.commit()
        for j in jobs:
            await run_group([j.training_id], delay=0)

        for ip in ("203.0.113.24", "203.0.113.24", "198.51.100.7"):
            record(db, "auth.login_failed", "Failed sign-in for tom@flip.demo", user=tom, level="warning", ip=ip)

        # Spread the seeded history over the past fortnight so the dashboards have shape.
        rnd = random.Random(3)
        logs = db.query(Log).order_by(Log.log_id).all()
        for log, hours in zip(logs, sorted((rnd.uniform(0, 13 * 24) for _ in logs), reverse=True)):
            log.timestamp = now - timedelta(hours=hours)
        for p in db.query(Project).all():
            p.created_at = now - timedelta(days=rnd.randint(4, 13))
        db.query(Notification).delete()
        db.commit()
        return True
    finally:
        db.close()
