from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..audit import notify_admins, record
from ..config import LOCKOUT_MINUTES, LOCKOUT_THRESHOLD, REQUIRE_ADMIN_MFA
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..models import ROLE_ADMIN, ROLE_DEVELOPER, Organisation, User, utcnow
from ..schemas import (ChangePasswordIn, LoginIn, MfaCodeIn, MfaDisableIn, MfaVerifyIn, ProfileIn, RegisterIn,
                       user_out)
from ..security import (create_access_token, create_mfa_challenge, decode_token, decrypt_secret, encrypt_secret,
                        hash_password, new_totp_secret, otpauth_uri, verify_password, verify_totp)

router = APIRouter(prefix="/api/auth", tags=["auth"])

BAD_CREDENTIALS = "Incorrect email or password"


def _session(user: User) -> dict:
    return {"access_token": create_access_token(user.user_id, user.role, user.token_version),
            "token_type": "bearer", "user": user_out(user),
            "mfa_setup_required": REQUIRE_ADMIN_MFA and user.role == ROLE_ADMIN and not user.mfa_enabled}


def _failed(db: Session, user: User, email: str, ip: str | None, what: str = "sign-in") -> None:
    user.failed_logins += 1
    if user.failed_logins >= LOCKOUT_THRESHOLD:
        user.locked_until = utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
    db.commit()
    record(db, "auth.login_failed", f"Failed {what} for {email} (attempt {user.failed_logins})", user=user, level="warning", ip=ip)
    if user.locked_until and user.failed_logins == LOCKOUT_THRESHOLD:
        notify_admins(db, f"Account {email} locked after {LOCKOUT_THRESHOLD} failed attempts", "/admin/security", kind="warning")


def _check_locked(db: Session, user: User, ip: str | None) -> None:
    if user.locked_until and user.locked_until > utcnow():
        record(db, "auth.login_blocked", f"Sign-in blocked for locked account {user.email}", user=user, level="warning", ip=ip)
        mins = max(1, int((user.locked_until - utcnow()).total_seconds() // 60) + 1)
        raise HTTPException(status.HTTP_423_LOCKED, f"Too many failed attempts. Try again in {mins} minute(s).")


def _finish(db: Session, user: User, ip: str | None, how: str) -> dict:
    user.failed_logins, user.locked_until, user.last_login_at = 0, None, utcnow()
    db.commit()
    record(db, "auth.login", f"{user.username} signed in ({user.role}{', ' + how if how else ''})", user=user, ip=ip)
    return _session(user)


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    email = body.email.lower()
    user = db.query(User).filter(User.email == email).first()
    if user:
        _check_locked(db, user, ip)
    if not user or not verify_password(body.password, user.password_hash):
        if user:
            _failed(db, user, email, ip)
        else:
            record(db, "auth.login_failed", f"Failed sign-in for unknown email {email}", level="warning", ip=ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)
    if not user.is_active:
        record(db, "auth.login_blocked", f"Sign-in attempt on disabled account {email}", user=user, level="warning", ip=ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been disabled. Contact an administrator.")
    if body.portal == "admin" and user.role != ROLE_ADMIN:
        record(db, "auth.login_denied", f"{email} tried the admin sign-in without the Admin role", user=user, level="warning", ip=ip)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This sign-in is for administrators. Use the developer sign-in instead.")
    if user.mfa_enabled:
        # Password is right, but no session until a valid one-time code arrives.
        return {"mfa_required": True, "mfa_token": create_mfa_challenge(user.user_id, user.token_version)}
    return _finish(db, user, ip, "")


@router.post("/mfa/verify")
def mfa_verify(body: MfaVerifyIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    payload = decode_token(body.mfa_token, typ="mfa")
    user = db.get(User, int(payload["sub"])) if payload else None
    if not user or not user.is_active or payload.get("ver") != user.token_version or not user.mfa_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign-in expired. Enter your password again.")
    _check_locked(db, user, ip)
    secret = decrypt_secret(user.mfa_secret or "")
    step = verify_totp(secret, body.code, user.mfa_last_step) if secret else None
    if step is None:
        _failed(db, user, user.email, ip, "two-factor code")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That code is not valid. Check your authenticator app.")
    user.mfa_last_step = step
    return _finish(db, user, ip, "with two-factor code")


@router.post("/mfa/setup")
def mfa_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Start enrolment: a fresh secret, not active until confirmed with a code."""
    if user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Two-factor authentication is already on")
    secret = new_totp_secret()
    user.mfa_secret = encrypt_secret(secret)
    db.commit()
    return {"secret": secret, "otpauth_uri": otpauth_uri(secret, user.email)}


@router.post("/mfa/enable")
def mfa_enable(body: MfaCodeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = decrypt_secret(user.mfa_secret or "")
    step = verify_totp(secret, body.code, user.mfa_last_step) if secret else None
    if step is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code is not valid. Check the time on your device and try again.")
    user.mfa_enabled, user.mfa_last_step = True, step
    user.token_version += 1  # other sessions must sign in again with the second factor
    db.commit()
    record(db, "security.mfa_enabled", f"{user.username} turned on two-factor authentication", user=user)
    return _session(user)


@router.post("/mfa/disable")
def mfa_disable(body: MfaDisableIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Two-factor authentication is not on")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password is incorrect")
    step = verify_totp(decrypt_secret(user.mfa_secret or "") or "", body.code, user.mfa_last_step)
    if step is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code is not valid")
    user.mfa_enabled, user.mfa_secret, user.mfa_last_step = False, None, 0
    db.commit()
    record(db, "security.mfa_disabled", f"{user.username} turned off two-factor authentication", user=user, level="warning")
    return user_out(user)


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    if body.organisation_id is not None and not db.get(Organisation, body.organisation_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown organisation")
    user = User(username=body.username.strip(), email=email, password_hash=hash_password(body.password),
                role=ROLE_DEVELOPER, organisation_id=body.organisation_id, last_login_at=utcnow())
    db.add(user)
    db.commit()
    db.refresh(user)
    record(db, "user.register", f"New model developer registered: {user.username} <{email}>", user=user, ip=client_ip(request))
    notify_admins(db, f"New developer account: {user.username}", "/admin/users")
    return _session(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.username = body.username.strip()
    db.commit()
    record(db, "user.profile", f"{user.username} updated their profile", user=user)
    return user_out(user)


@router.post("/change-password")
def change_password(body: ChangePasswordIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.commit()
    record(db, "auth.password_change", f"{user.username} changed their password", user=user, ip=client_ip(request))
    return _session(user)


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record(db, "auth.logout", f"{user.username} signed out", user=user, ip=client_ip(request))
    return {"ok": True}
