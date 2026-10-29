from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import ROLE_ADMIN, ROLE_DEVELOPER, Project, User
from .security import decode_token

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
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in",
                            headers={"WWW-Authenticate": "Bearer"})
    user = user_from_token(db, creds.credentials)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or revoked",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def admin_only(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
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
