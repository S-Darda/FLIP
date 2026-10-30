from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..audit import record
from ..database import get_db
from ..deps import admin_only
from ..models import ROLE_ADMIN, Organisation, Project, User
from ..schemas import UserCreate, UserUpdate, user_out
from ..security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _get(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _active_admins(db: Session) -> int:
    return db.query(User).filter(User.role == ROLE_ADMIN, User.is_active.is_(True)).count()


@router.get("")
def list_users(q: str | None = None, role: str | None = None,
               status_: str | None = Query(default=None, alias="status"),
               admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    query = db.query(User)
    if q:
        like = f"%{q.lower()}%"
        query = query.outerjoin(Organisation).filter(or_(User.username.ilike(like), User.email.ilike(like),
                                                         Organisation.name.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    if status_ == "active":
        query = query.filter(User.is_active.is_(True))
    elif status_ == "disabled":
        query = query.filter(User.is_active.is_(False))
    users = query.order_by(User.created_at.desc()).all()
    counts = dict(db.query(Project.created_by, func.count(Project.project_id))
                  .group_by(Project.created_by).all())
    return [{**user_out(u), "project_count": counts.get(u.user_id, 0)} for u in users]


@router.post("", status_code=201)
def create_user(body: UserCreate, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    if body.organisation_id is not None and not db.get(Organisation, body.organisation_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown organisation")
    user = User(username=body.username.strip(), email=email, password_hash=hash_password(body.password),
                role=body.role, organisation_id=body.organisation_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    record(db, "user.create", f"{admin.username} created {body.role} account {email}", user=admin)
    return user_out(user)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdate, admin: User = Depends(admin_only),
                db: Session = Depends(get_db)):
    user = _get(db, user_id)
    changes = []
    demoting_last_admin = (
        user.role == ROLE_ADMIN and user.is_active and _active_admins(db) == 1
        and ((body.role and body.role != ROLE_ADMIN) or body.is_active is False)
    )
    if demoting_last_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The platform needs at least one active admin")
    if body.email and body.email.lower() != user.email:
        email = body.email.lower()
        if db.query(User).filter(User.email == email, User.user_id != user_id).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
        user.email = email
        changes.append("email")
    if body.username is not None and body.username != user.username:
        user.username = body.username.strip()
        changes.append("name")
    if "organisation_id" in body.model_fields_set and body.organisation_id != user.organisation_id:
        if body.organisation_id is not None and not db.get(Organisation, body.organisation_id):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown organisation")
        user.organisation_id = body.organisation_id
        changes.append("organisation")
    if body.role and body.role != user.role:
        changes.append(f"role {user.role} → {body.role}")
        user.role = body.role
        user.token_version += 1
    if body.is_active is not None and body.is_active != user.is_active:
        user.is_active = body.is_active
        changes.append("enabled" if body.is_active else "disabled")
        if not body.is_active:
            user.token_version += 1
    if body.password:
        user.password_hash = hash_password(body.password)
        user.token_version += 1
        changes.append("password reset")
    db.commit()
    if changes:
        level = "warning" if "disabled" in changes else "info"
        record(db, "user.update", f"{admin.username} updated {user.email}: {', '.join(changes)}",
               user=admin, level=level)
    return user_out(user)


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = _get(db, user_id)
    if user.user_id == admin.user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    if db.query(Project).filter(Project.created_by == user_id).count():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "This user owns projects. Disable the account instead to keep the audit trail.")
    email = user.email
    db.delete(user)
    db.commit()
    record(db, "user.delete", f"{admin.username} deleted account {email}", user=admin, level="warning")


@router.post("/{user_id}/revoke-sessions")
def revoke_sessions(user_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = _get(db, user_id)
    user.token_version += 1
    db.commit()
    record(db, "security.revoke", f"{admin.username} revoked all sessions for {user.email}",
           user=admin, level="warning")
    return user_out(user)


@router.post("/{user_id}/unlock")
def unlock(user_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = _get(db, user_id)
    user.failed_logins, user.locked_until = 0, None
    db.commit()
    record(db, "security.unlock", f"{admin.username} unlocked {user.email}", user=admin)
    return user_out(user)
