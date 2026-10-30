"""Organisations and data-owner sites.

An admin registers a site for an organisation and receives a one-time enrolment token (shown
once, stored only as a hash, expiring). The site's agent exchanges it for enrolment by sending
an Ed25519 public key it generated locally; the private key never leaves the site."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..audit import record
from ..config import ENROLMENT_TOKEN_HOURS
from ..database import get_db
from ..deps import admin_only, get_current_user
from ..models import ROLE_ADMIN, SITE_ACTIVE, SITE_PENDING, SITE_REVOKED, Organisation, Site, User, utcnow
from ..schemas import OrgIn, SiteIn, org_out, site_out
from ..security import hash_token, new_enrolment_token

router = APIRouter(prefix="/api", tags=["organisations and sites"])


@router.get("/orgs/public")
def public_orgs(db: Session = Depends(get_db)):
    """Names for the sign-up form."""
    return [{"org_id": o.org_id, "name": o.name} for o in db.query(Organisation).order_by(Organisation.name)]


@router.get("/orgs")
def list_orgs(admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [org_out(o) for o in db.query(Organisation).order_by(Organisation.name)]


@router.post("/orgs", status_code=201)
def create_org(body: OrgIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    name = body.name.strip()
    if db.query(Organisation).filter(func.lower(Organisation.name) == name.lower()).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An organisation with this name already exists")
    org = Organisation(name=name)
    db.add(org)
    db.commit()
    db.refresh(org)
    record(db, "org.create", f"{admin.username} created organisation '{name}'", user=admin)
    return org_out(org)


@router.get("/sites")
def list_sites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admins see every site with enrolment details. Developers see active sites and their dataset
    schemas, which they need to design a study, but no keys or tokens."""
    q = db.query(Site).order_by(Site.name)
    if user.role != ROLE_ADMIN:
        q = q.filter(Site.status == SITE_ACTIVE)
    return [site_out(s, admin=user.role == ROLE_ADMIN) for s in q]


def _issue_token(site: Site) -> str:
    token = new_enrolment_token()
    site.token_hash, site.token_expires = hash_token(token), utcnow() + timedelta(hours=ENROLMENT_TOKEN_HOURS)
    return token


@router.post("/sites", status_code=201)
def create_site(body: SiteIn, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    if not db.get(Organisation, body.org_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation not found")
    if db.query(Site).filter(func.lower(Site.name) == body.name.strip().lower()).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A site with this name already exists")
    site = Site(org_id=body.org_id, name=body.name.strip(), status=SITE_PENDING)
    token = _issue_token(site)
    db.add(site)
    db.commit()
    db.refresh(site)
    record(db, "site.create", f"{admin.username} registered site '{site.name}' for {site.org.name}", user=admin)
    return {**site_out(site, admin=True), "enrolment_token": token}


@router.post("/sites/{site_id}/token")
def reissue_token(site_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    """New one-time token. The site must enrol again; its old key stops working immediately."""
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    token = _issue_token(site)
    site.public_key, site.status, site.last_request_ms = None, SITE_PENDING, 0
    db.commit()
    record(db, "site.token", f"{admin.username} issued a new enrolment token for '{site.name}' (previous key revoked)",
           user=admin, level="warning")
    return {**site_out(site, admin=True), "enrolment_token": token}


@router.post("/sites/{site_id}/revoke")
def revoke_site(site_id: int, admin: User = Depends(admin_only), db: Session = Depends(get_db)):
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    site.status, site.public_key, site.token_hash = SITE_REVOKED, None, None
    db.commit()
    record(db, "site.revoke", f"{admin.username} revoked site '{site.name}'", user=admin, level="warning")
    return site_out(site, admin=True)
