"""Demo data for a fresh database: accounts, projects in each state and real training runs."""
import csv
import random
from datetime import timedelta

import numpy as np

from .audit import record
from .config import STORAGE_DIR
from .database import SessionLocal
from .federated import profile_csv
from .models import (JOB_QUEUED, PROJECT_APPROVED, PROJECT_PENDING, PROJECT_REJECTED, ROLE_ADMIN,
                     ROLE_DEVELOPER, Dataset, Log, ModelAwaiting, ModelTraining, Notification,
                     Project, User, utcnow)
from .security import hash_password
from .training_runner import run_training

DEMO_USERS = [
    ("Platform Admin", "admin@flip.demo", "admin123", ROLE_ADMIN, "FLIP Operations"),
    ("Aisha Khan", "dev@flip.demo", "dev12345", ROLE_DEVELOPER, "St Mary's Health Trust"),
    ("Tom Becker", "tom@flip.demo", "dev12345", ROLE_DEVELOPER, "Northbank Financial"),
]


def _write_readmission_csv(path):
    """A synthetic hospital-readmission table (no real patients) to demonstrate CSV training."""
    rng = np.random.default_rng(42)
    n = 1800
    age = rng.normal(64, 14, n).clip(18, 98)
    stay = rng.gamma(2.2, 2.0, n).clip(1, 40)
    prior = rng.poisson(1.1, n)
    meds = rng.poisson(9, n)
    hba1c = rng.normal(6.8, 1.3, n).clip(4, 14)
    bmi = rng.normal(28, 5.5, n).clip(15, 55)
    z = -6.2 + 0.03 * age + 0.11 * stay + 0.55 * prior + 0.06 * meds + 0.25 * hba1c + 0.02 * bmi
    y = rng.random(n) < 1 / (1 + np.exp(-z))
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["age", "length_of_stay", "prior_admissions", "num_medications", "hba1c", "bmi", "readmitted"])
        for row in zip(age, stay, prior, meds, hba1c, bmi, y):
            w.writerow([f"{row[0]:.0f}", f"{row[1]:.1f}", row[2], row[3], f"{row[4]:.1f}", f"{row[5]:.1f}",
                        "yes" if row[6] else "no"])


async def seed_if_empty() -> bool:
    db = SessionLocal()
    try:
        if db.query(User).count():
            return False
        users = {}
        for name, email, pw, role, org in DEMO_USERS:
            u = User(username=name, email=email, password_hash=hash_password(pw), role=role, organisation=org)
            db.add(u)
            users[email] = u
        db.commit()
        admin, aisha, tom = users["admin@flip.demo"], users["dev@flip.demo"], users["tom@flip.demo"]
        now = utcnow()

        def project(owner, name, status, **kw):
            p = Project(project_name=name, created_by=owner.user_id, status=status, **kw)
            if status != PROJECT_PENDING:
                p.reviewed_by, p.reviewed_at = admin.user_id, now
            db.add(p)
            db.commit()
            db.refresh(p)
            record(db, "project.create", f"{owner.username} submitted '{name}' for approval",
                   user=owner, project_id=p.project_id)
            if status != PROJECT_PENDING:
                record(db, "project.review", f"{admin.username} {status.lower()} '{name}'",
                       user=admin, project_id=p.project_id)
            return p

        readmit = project(aisha, "Hospital Readmission Risk", PROJECT_APPROVED, domain="Healthcare",
                          cohort_size=5, model_type="logreg",
                          description="Predict 30-day readmission risk across partner hospitals without "
                                      "moving patient records out of each trust.",
                          objectives="Reach at least 70% accuracy; identify the strongest risk factors.")
        sepsis = project(aisha, "Early Sepsis Detection", PROJECT_APPROVED, domain="Healthcare",
                         cohort_size=4, model_type="mlp",
                         description="Multi-class early-warning model trained on ward vitals held at four sites.",
                         objectives="Compare a neural network with the linear baseline.")
        project(aisha, "Medical Imaging Triage", PROJECT_PENDING, domain="Healthcare", cohort_size=6,
                model_type="mlp", description="Prioritise chest X-ray reading queues using federated "
                                              "features extracted at each imaging centre.")
        fraud = project(tom, "Cross-Bank Fraud Signals", PROJECT_APPROVED, domain="Finance", cohort_size=6,
                        model_type="logreg",
                        description="Jointly learn card-fraud patterns across banks without sharing "
                                    "transaction histories.")
        project(tom, "Credit Scoring Pilot", PROJECT_REJECTED, domain="Finance", cohort_size=3,
                model_type="logreg", description="Shared credit scoring model.",
                feedback="Please add a fairness assessment plan and confirm each bank's data-sharing "
                         "agreement before resubmitting.")

        csv_path = STORAGE_DIR / "projects" / str(readmit.project_id) / "seed_readmissions.csv"
        _write_readmission_csv(csv_path)
        ds = Dataset(project_id=readmit.project_id, filename="readmissions.csv", stored_path=str(csv_path),
                     size_bytes=csv_path.stat().st_size, **profile_csv(csv_path))
        db.add(ds)
        db.commit()

        jobs = [
            ModelTraining(project_id=readmit.project_id, started_by=aisha.user_id, status=JOB_QUEUED,
                          model_type="logreg", algorithm="FedAvg", rounds=25, num_nodes=5, local_epochs=2,
                          learning_rate=0.1, dataset_id=ds.dataset_id, data_source=ds.filename),
            ModelTraining(project_id=sepsis.project_id, started_by=aisha.user_id, status=JOB_QUEUED,
                          model_type="mlp", algorithm="FedProx", mu=0.01, rounds=30, num_nodes=4,
                          local_epochs=2, learning_rate=0.05, data_source="Synthetic federated cohort"),
            ModelTraining(project_id=fraud.project_id, started_by=tom.user_id, status=JOB_QUEUED,
                          model_type="logreg", algorithm="FedAvg", rounds=20, num_nodes=6, local_epochs=1,
                          learning_rate=0.1, dp_enabled=True, clip_norm=1.0, noise_multiplier=0.3,
                          data_source="Synthetic federated cohort"),
        ]
        db.add_all(jobs)
        db.commit()
        for j in jobs:
            await run_training(j.training_id, delay=0)

        db.add(ModelAwaiting(project_id=readmit.project_id, training_id=jobs[0].training_id,
                             model_name="Readmission LR v1", requested_by=aisha.user_id,
                             comments="Baseline model for the pilot wards."))
        db.commit()
        record(db, "model.submit", "Aisha Khan submitted model 'Readmission LR v1' for deployment",
               user=aisha, project_id=readmit.project_id)
        for ip in ("203.0.113.24", "203.0.113.24", "198.51.100.7"):
            record(db, "auth.login_failed", "Failed sign-in for tom@flip.demo", user=tom, level="warning", ip=ip)

        # Spread the seeded history over the past fortnight so the dashboards have shape.
        rnd = random.Random(3)
        logs = db.query(Log).order_by(Log.log_id).all()
        offsets = sorted((rnd.uniform(0, 13 * 24) for _ in logs), reverse=True)
        for log, hours in zip(logs, offsets):
            log.timestamp = now - timedelta(hours=hours)
        for p in db.query(Project).all():
            p.created_at = now - timedelta(days=rnd.randint(4, 13))
        db.query(Notification).delete()
        db.commit()
        return True
    finally:
        db.close()
