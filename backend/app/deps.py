import time

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import REQUIRE_ADMIN_MFA
from .database import get_db
from .models import ROLE_ADMIN, ROLE_DEVELOPER, SITE_ACTIVE, Project, Site, User, utcnow
from .security import MAX_CLOCK_SKEW_MS, decode_token, signing_message, verify_agent_signature

bearer = HTTPBearer(auto_error=False)


def user_from_token(db: Session, token: str) -> User | None:
    payload = decode_token(token)
    if not payload:
        return None
    user = db.get(User, int(payload.get("sub", 0)))
    if not user or not user.is_active or payload.get("ver") != user.token_version:
        return None
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in", headers={"WWW-Authenticate": "Bearer"})
    user = user_from_token(db, creds.credentials)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or revoked",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def admin_only(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    if REQUIRE_ADMIN_MFA and not user.mfa_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Set up two-factor authentication before using admin tools")
    return user


def developer_only(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_DEVELOPER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only model developers can do this")
    return user


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def get_visible_project(project_id: int, db: Session, user: User) -> Project:
    """Admins see every project; developers only their own (404 rather than 403 to avoid leaking ids)."""
    project = db.get(Project, project_id)
    if not project or (user.role != ROLE_ADMIN and project.created_by != user.user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def site_auth(request: Request, db: Session = Depends(get_db)) -> Site:
    """Authenticate a site agent by its Ed25519 signature over method, path, timestamp and body.
    Timestamps must be fresh and strictly increasing per site, which blocks replayed requests."""
    try:
        site_id = int(request.headers["x-flip-site"])
        ts = int(request.headers["x-flip-timestamp"])
        sig = request.headers["x-flip-signature"]
    except (KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing agent signature headers")
    site = db.get(Site, site_id)
    if not site or site.status != SITE_ACTIVE or not site.public_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown or inactive site")
    now_ms = int(time.time() * 1000)
    if abs(now_ms - ts) > MAX_CLOCK_SKEW_MS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Request timestamp outside the allowed clock skew")
    if ts <= site.last_request_ms:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Replayed or out-of-order request")
    body = await request.body()
    path = request.url.path + (f"?{request.url.query}" if request.url.query else "")
    if not verify_agent_signature(site.public_key, sig, signing_message(request.method, path, ts, body)):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad signature")
    site.last_request_ms, site.last_seen = ts, utcnow()
    db.commit()
    return site
