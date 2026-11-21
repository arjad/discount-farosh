"""Sign up / log in / log out / who am I — all checked on the server.

Passwords  scrypt (stdlib) with a random salt per user; the plain password is never stored.
Sessions   on login/sign-up a random 256-bit token is put in an HttpOnly cookie and its SHA-256 hash
           is stored in `user_sessions`. Every request looks the hash up, so logging out (deleting
           the row) ends the session for real, and expired rows stop working.
Brute force  after 5 wrong passwords for one email (or 20 from one IP) in 15 min, login is
           refused for 15 min (kept in memory, per server process).
"""
import base64
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import User, UserSession
from app.db.session import get_session

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE = "df_session"
SESSION_DAYS = 30


# ---------------------------------------------------------------- passwords

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(key).decode()


def verify_password(password: str, stored: str | None) -> bool:
    try:
        algo, salt_b64, key_b64 = (stored or "").split("$")
        if algo != "scrypt":
            return False
        key = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(key, base64.b64decode(key_b64))
    except ValueError:
        return False


# checked when the email doesn't exist, so a wrong email takes as long as a wrong password
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


# ---------------------------------------------------------------- sessions

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def start_session(session: AsyncSession, resp: Response, request: Request, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    session.add(UserSession(
        user_id=user_id, token_hash=_hash_token(token), expires_at=now + timedelta(days=SESSION_DAYS),
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
    ))
    # tidy up this user's expired sessions
    await session.execute(delete(UserSession).where(UserSession.user_id == user_id, UserSession.expires_at < now))
    await session.commit()
    resp.set_cookie(
        COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax",
        secure=get_settings().app_env != "development", path="/",
    )


# ---------------------------------------------------------------- failed-login limits

_WINDOW_S = 15 * 60
_MAX_PER_EMAIL = 5
_MAX_PER_IP = 20
_fails: dict[str, deque[float]] = defaultdict(deque)


def _recent(key: str) -> deque[float]:
    q = _fails[key]
    cutoff = time.monotonic() - _WINDOW_S
    while q and q[0] < cutoff:
        q.popleft()
    return q


def _check_limits(email: str, ip: str) -> None:
    if len(_recent("e:" + email)) >= _MAX_PER_EMAIL or len(_recent("i:" + ip)) >= _MAX_PER_IP:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many wrong attempts. Please wait 15 minutes and try again.")


def _record_fail(email: str, ip: str) -> None:
    now = time.monotonic()
    _recent("e:" + email).append(now)
    _recent("i:" + ip).append(now)


# ---------------------------------------------------------------- schemas

class SignupIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class Me(BaseModel):
    id: int
    email: str
    full_name: str | None
    phone: str | None
    city: str | None
    avatar: str | None = None


def _me(u: User) -> Me:
    return Me(id=u.id, email=u.email, full_name=u.full_name, phone=u.phone, city=u.city, avatar=u.avatar)


async def current_user(
    session: AsyncSession = Depends(get_session), df_session: str | None = Cookie(default=None),
) -> User:
    if not df_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    now = datetime.now(timezone.utc)
    row = await session.scalar(select(UserSession).where(UserSession.token_hash == _hash_token(df_session)))
    user = await session.get(User, row.user_id) if row and row.expires_at > now else None
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    if now - row.last_seen_at > timedelta(hours=1):  # don't write on every request
        row.last_seen_at = now
        await session.commit()
    return user


# ---------------------------------------------------------------- routes

@router.post("/signup", response_model=Me, status_code=201)
async def signup(body: SignupIn, request: Request, resp: Response,
                 session: AsyncSession = Depends(get_session)) -> Me:
    email = body.email.strip().lower()
    taken = HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Log in instead.")
    if await session.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise taken
    user = User(email=email, full_name=body.full_name.strip(), phone=(body.phone or "").strip() or None,
                city=(body.city or "").strip() or None, password_hash=hash_password(body.password))
    session.add(user)
    try:
        await session.commit()  # the account is saved in the users table here
    except IntegrityError:  # two sign-ups with the same email at the same moment
        await session.rollback()
        raise taken from None
    await start_session(session, resp, request, user.id)
    return _me(user)


@router.post("/login", response_model=Me)
async def login(body: LoginIn, request: Request, resp: Response,
                session: AsyncSession = Depends(get_session)) -> Me:
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "?"
    _check_limits(email, ip)
    user = await session.scalar(select(User).where(func.lower(User.email) == email))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        _record_fail(email, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password.")
    _fails.pop("e:" + email, None)
    await start_session(session, resp, request, user.id)
    return _me(user)


@router.post("/logout", status_code=204)
async def logout(resp: Response, session: AsyncSession = Depends(get_session),
                 df_session: str | None = Cookie(default=None)) -> None:
    if df_session:  # end the session on the server, not just in the browser
        await session.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(df_session)))
        await session.commit()
    resp.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=Me)
async def me(user: User = Depends(current_user)) -> Me:
    return _me(user)


# ---------------------------------------------------------------- change password

class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


@router.post("/password", status_code=204)
async def change_password(body: PasswordChange, user: User = Depends(current_user),
                          session: AsyncSession = Depends(get_session),
                          df_session: str | None = Cookie(default=None)) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is wrong.")
    user.password_hash = hash_password(body.new_password)
    # log out every other device; keep this one
    await session.execute(delete(UserSession).where(
        UserSession.user_id == user.id, UserSession.token_hash != _hash_token(df_session or "")))
    await session.commit()
