from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..audit import notify_admins, record
from ..config import LOCKOUT_MINUTES, LOCKOUT_THRESHOLD
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..models import ROLE_ADMIN, ROLE_DEVELOPER, User, utcnow
from ..schemas import ChangePasswordIn, LoginIn, ProfileIn, RegisterIn, user_out
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

BAD_CREDENTIALS = "Incorrect email or password"


def _session(user: User) -> dict:
    return {"access_token": create_access_token(user.user_id, user.role, user.token_version),
            "token_type": "bearer", "user": user_out(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    email = body.email.lower()
    user = db.query(User).filter(User.email == email).first()

    if user and user.locked_until and user.locked_until > utcnow():
        record(db, "auth.login_blocked", f"Sign-in blocked for locked account {email}",
               user=user, level="warning", ip=ip)
        mins = max(1, int((user.locked_until - utcnow()).total_seconds() // 60) + 1)
        raise HTTPException(status.HTTP_423_LOCKED,
                            f"Too many failed attempts. Try again in {mins} minute(s).")

    if not user or not verify_password(body.password, user.password_hash):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= LOCKOUT_THRESHOLD:
                user.locked_until = utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
            db.commit()
            record(db, "auth.login_failed",
                   f"Failed sign-in for {email} (attempt {user.failed_logins})",
                   user=user, level="warning", ip=ip)
            if user.locked_until and user.failed_logins == LOCKOUT_THRESHOLD:
                notify_admins(db, f"Account {email} locked after {LOCKOUT_THRESHOLD} failed sign-ins",
                              "/admin/security", kind="warning")
        else:
            record(db, "auth.login_failed", f"Failed sign-in for unknown email {email}",
                   level="warning", ip=ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)

    if not user.is_active:
        record(db, "auth.login_blocked", f"Sign-in attempt on disabled account {email}",
               user=user, level="warning", ip=ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled. Contact an administrator.")

    if body.portal == "admin" and user.role != ROLE_ADMIN:
        record(db, "auth.login_denied", f"{email} tried the admin sign-in without the Admin role",
               user=user, level="warning", ip=ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This sign-in is for administrators. Use the developer sign-in instead.")

    user.failed_logins, user.locked_until, user.last_login_at = 0, None, utcnow()
    db.commit()
    record(db, "auth.login", f"{user.username} signed in ({user.role})", user=user, ip=ip)
    return _session(user)


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    user = User(username=body.username.strip(), email=email, password_hash=hash_password(body.password),
                role=ROLE_DEVELOPER, organisation=body.organisation)
    user.last_login_at = utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    record(db, "user.register", f"New model developer registered: {user.username} <{email}>",
           user=user, ip=client_ip(request))
    notify_admins(db, f"New developer account: {user.username}", "/admin/users")
    return _session(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.username, user.organisation = body.username.strip(), body.organisation
    db.commit()
    record(db, "user.profile", f"{user.username} updated their profile", user=user)
    return user_out(user)


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1  # sign out other sessions
    db.commit()
    record(db, "auth.password_change", f"{user.username} changed their password",
           user=user, ip=client_ip(request))
    return _session(user)


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record(db, "auth.logout", f"{user.username} signed out", user=user, ip=client_ip(request))
    return {"ok": True}
