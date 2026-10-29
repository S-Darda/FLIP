import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import bcrypt
from cryptography.exceptions import InvalidSignature
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from jose import JWTError, jwt

from .config import ACCESS_TOKEN_MINUTES, JWT_ALGORITHM, SECRET_KEY, STORAGE_DIR

# ---------------------------------------------------------------- passwords and sessions


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int, role: str, version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    payload = {"sub": str(user_id), "role": role, "ver": version, "exp": expire, "typ": "session"}
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_mfa_challenge(user_id: int, version: int) -> str:
    """Short-lived token proving the password step passed; only exchangeable for a session with a TOTP code."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    return jwt.encode({"sub": str(user_id), "ver": version, "exp": expire, "typ": "mfa"}, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str, typ: str = "session") -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
    return payload if payload.get("typ", "session") == typ else None


# ---------------------------------------------------------------- TOTP (RFC 6238)

_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"{SECRET_KEY}:mfa".encode()).digest()))


def new_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def encrypt_secret(secret: str) -> str:
    return _fernet.encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def totp(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{code:06d}"


def verify_totp(secret: str, code: str, last_step: int, now: float | None = None) -> int | None:
    """Return the matched time step (to block reuse), or None. Accepts one step of clock drift."""
    code = (code or "").strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return None
    step = int((now or time.time()) // 30)
    for s in (step - 1, step, step + 1):
        if s > last_step and hmac.compare_digest(totp(secret, s), code):
            return s
    return None


def otpauth_uri(secret: str, email: str) -> str:
    return f"otpauth://totp/FLIP:{quote(email)}?secret={secret}&issuer=FLIP&digits=6&period=30"


# ---------------------------------------------------------------- site enrolment tokens

def new_enrolment_token() -> str:
    return "flip_enrol_" + secrets.token_urlsafe(24)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- agent request signatures

MAX_CLOCK_SKEW_MS = 5 * 60 * 1000


def signing_message(method: str, path: str, timestamp_ms: int, body: bytes) -> bytes:
    return f"{method.upper()}\n{path}\n{timestamp_ms}\n{hashlib.sha256(body).hexdigest()}".encode()


def verify_agent_signature(public_key_hex: str, signature_hex: str, message: bytes) -> bool:
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_key_hex)).verify(bytes.fromhex(signature_hex), message)
        return True
    except (InvalidSignature, ValueError):
        return False


# ---------------------------------------------------------------- model artefact signing

_KEY_PATH = STORAGE_DIR / "keys" / "artefact_ed25519.pem"
_signing_key: Ed25519PrivateKey | None = None


def _artefact_key() -> Ed25519PrivateKey:
    global _signing_key
    if _signing_key is None:
        if _KEY_PATH.exists():
            _signing_key = serialization.load_pem_private_key(_KEY_PATH.read_bytes(), password=None)
        else:
            _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
            _signing_key = Ed25519PrivateKey.generate()
            _KEY_PATH.write_bytes(_signing_key.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            try:
                os.chmod(_KEY_PATH, 0o600)
            except OSError:
                pass
    return _signing_key


def artefact_public_key_hex() -> str:
    return _artefact_key().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()


def artefact_key_id() -> str:
    return hashlib.sha256(bytes.fromhex(artefact_public_key_hex())).hexdigest()[:16]


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sign_artefact(document: dict) -> tuple[str, str]:
    """Return (sha256 hex, Ed25519 signature hex) over the canonical JSON of the artefact."""
    body = canonical(document)
    digest = hashlib.sha256(body).hexdigest()
    return digest, _artefact_key().sign(body).hex()


def verify_artefact(document: dict, signature_hex: str, public_key_hex: str) -> bool:
    return verify_agent_signature(public_key_hex, signature_hex, canonical(document))
