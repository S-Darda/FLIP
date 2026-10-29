"""Runtime settings, read from environment variables with development defaults."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# SQLite out of the box; set FLIP_DATABASE_URL=mysql+pymysql://user:pass@host/flip for MySQL.
DATABASE_URL = os.getenv("FLIP_DATABASE_URL", f"sqlite:///{(BASE_DIR / 'flip.db').as_posix()}")

SECRET_KEY = os.getenv("FLIP_SECRET_KEY", "dev-only-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("FLIP_TOKEN_MINUTES", "120"))

STORAGE_DIR = Path(os.getenv("FLIP_STORAGE_DIR", str(BASE_DIR / "storage")))
MAX_UPLOAD_MB = int(os.getenv("FLIP_MAX_UPLOAD_MB", "50"))

CORS_ORIGINS = [o for o in os.getenv("FLIP_CORS_ORIGINS", "http://localhost:5180").split(",") if o]

# Lock an account for LOCKOUT_MINUTES after this many failed sign-ins in a row.
LOCKOUT_THRESHOLD = int(os.getenv("FLIP_LOCKOUT_THRESHOLD", "5"))
LOCKOUT_MINUTES = int(os.getenv("FLIP_LOCKOUT_MINUTES", "15"))

# Seconds to pause between federated rounds so progress is visible live. 0 in tests.
TRAINING_ROUND_DELAY = float(os.getenv("FLIP_ROUND_DELAY", "0.35"))

SEED_DEMO_DATA = os.getenv("FLIP_SEED", "1") == "1"

# Admins must enrol TOTP before using admin APIs when this is on (recommended outside demos).
REQUIRE_ADMIN_MFA = os.getenv("FLIP_REQUIRE_ADMIN_MFA", "0") == "1"

# How long the coordinator waits for a site agent to answer a task before treating it as a dropout.
AGENT_TASK_TIMEOUT = float(os.getenv("FLIP_AGENT_TIMEOUT", "60"))
ENROLMENT_TOKEN_HOURS = int(os.getenv("FLIP_ENROLMENT_TOKEN_HOURS", "24"))

# Per-site metrics computed on fewer rows than this are suppressed in reports.
MIN_REPORT_ROWS = int(os.getenv("FLIP_MIN_REPORT_ROWS", "20"))

# Optional: ship audit logs to Elasticsearch (view them in Kibana).
ELASTICSEARCH_URL = os.getenv("FLIP_ELASTICSEARCH_URL", "")
ELASTICSEARCH_INDEX = os.getenv("FLIP_ELASTICSEARCH_INDEX", "flip-logs")
