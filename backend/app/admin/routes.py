"""Admin API — used only by the separate admin app (admin/, port 5174).

There is exactly one admin account (role "admin"), made from the command line:
    .venv/bin/python -m app.admin_cli create --email you@example.com
There is no sign-up. The admin logs in here with its own cookie (df_admin) and can't log in on the
customer site; customers and restaurants can't log in here.

  POST /api/admin/auth/login | /logout      GET /api/admin/auth/me
  GET  /api/admin/overview                  totals + top restaurants + newest users
  GET  /api/admin/restaurants               restaurants that signed up on the app (restaurant accounts)
  GET  /api/admin/restaurants/{key}         branches, offers (with favourites / views), owner account
  GET  /api/admin/offers                    every offer (compact), for the Offers tab — filtered in the browser
  GET  /api/admin/users                     everyone enrolled (customers + restaurant accounts)
  GET  /api/admin/users/{id}                all details except the password
"""
import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.models import (
    Business, Offer, OfferCard, OfferFavourite, OfferView, RestaurantBranch, RestaurantDeal, User, UserCard,
    UserSession, UserVisit,
)
from app.db.session import get_session
from app.public.auth import _DUMMY_HASH, _check_limits, _fails, _hash_token, _record_fail, verify_password
from app.public.partner import _deal, deal_stats
from app.admin.snapshot import snapshot

router = APIRouter(prefix="/api/admin", tags=["admin"])

COOKIE = "df_admin"
SESSION_HOURS = 12


# ---------------------------------------------------------------- auth

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AdminMe(BaseModel):
    id: int
    email: str
    full_name: str | None


async def current_admin(session: AsyncSession = Depends(get_session), df_admin: str | None = Cookie(default=None)) -> User:
    if not df_admin:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    now = datetime.now(timezone.utc)
    row = await session.scalar(select(UserSession).where(UserSession.token_hash == _hash_token(df_admin)))
    user = await session.get(User, row.user_id) if row and row.expires_at > now else None
    if not user or user.role != "admin" or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return user


@router.post("/auth/login", response_model=AdminMe)
async def admin_login(body: LoginIn, request: Request, resp: Response, session: AsyncSession = Depends(get_session)):
    email = body.email.strip().lower()
    ip = request.client.host if request.client else "?"
    _check_limits("admin:" + email, ip)
    user = await session.scalar(select(User).where(func.lower(User.email) == email, User.role == "admin"))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        _record_fail("admin:" + email, ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password.")
    _fails.pop("e:admin:" + email, None)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    session.add(UserSession(user_id=user.id, token_hash=_hash_token(token), expires_at=now + timedelta(hours=SESSION_HOURS),
                            user_agent=(request.headers.get("user-agent") or "")[:300] or None))
    await session.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < now))
    await session.commit()
    resp.set_cookie(COOKIE, token, max_age=SESSION_HOURS * 3600, httponly=True, samesite="strict",
                    secure=get_settings().app_env != "development", path="/api/admin")
    return AdminMe(id=user.id, email=user.email, full_name=user.full_name)


@router.post("/auth/logout", status_code=204)
async def admin_logout(resp: Response, session: AsyncSession = Depends(get_session), df_admin: str | None = Cookie(default=None)):
    if df_admin:
        await session.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(df_admin)))
        await session.commit()
    resp.delete_cookie(COOKIE, path="/api/admin")


@router.get("/auth/me", response_model=AdminMe)
async def admin_me(admin: User = Depends(current_admin)):
    return AdminMe(id=admin.id, email=admin.email, full_name=admin.full_name)


# ---------------------------------------------------------------- shared helpers

def _f(v) -> float | None:
    return float(v) if v is not None else None


def rkey(name: str) -> str:
    """A restaurant = every branch with the same name (the dashboard groups them the same way)."""
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-") or "unnamed"


async def _offer_counts(session: AsyncSession) -> tuple[dict[int, int], dict[int, int]]:
    favs = dict((await session.execute(select(OfferFavourite.offer_id, func.count()).group_by(OfferFavourite.offer_id))).all())
    views = dict((await session.execute(select(OfferView.offer_id, func.count()).group_by(OfferView.offer_id))).all())
    return favs, views


async def _restaurants(session: AsyncSession) -> dict[str, dict]:
    """Every restaurant, keyed by rkey(name): its branches, offers, owner account (if it's a restaurant account)."""
    snap = await snapshot(session)
    businesses, offers = snap.businesses, snap.offers
    favs, views = await _offer_counts(session)
    owners = {b.id: b.owner_id for b in await session.scalars(select(RestaurantBranch))}
    accounts = {u.id: u for u in await session.scalars(select(User).where(User.role == "restaurant"))}

    out: dict[str, dict] = {}

    def entry(name: str) -> dict:
        k = rkey(name)
        if k not in out:
            out[k] = {"key": k, "name": name, "branches": {}, "offers": {}, "owner_ids": set()}
        return out[k]

    for b in businesses:
        e = entry(b.name)
        e["branches"][b.id] = b
        if b.restaurant_branch_id and b.restaurant_branch_id in owners:
            e["owner_ids"].add(owners[b.restaurant_branch_id])
    for o in offers:
        for b in o.businesses:
            entry(b.name)["offers"][o.id] = o
    # restaurant accounts that haven't added a branch yet still show up
    have = {i for e in out.values() for i in e["owner_ids"]}
    for u in accounts.values():
        if u.id not in have:
            entry(u.restaurant_name or u.full_name or u.email)["owner_ids"].add(u.id)
    for e in out.values():
        e["favourites"] = sum(favs.get(i, 0) for i in e["offers"])
        e["views"] = sum(views.get(i, 0) for i in e["offers"])
        e["owners"] = [accounts[i] for i in e["owner_ids"] if i in accounts]
        e["_favs"], e["_views"] = favs, views
    return out


# ---------------------------------------------------------------- overview

class RestaurantRow(BaseModel):
    key: str
    name: str
    source: str                 # "bank" (from bank sites) | "account" (restaurant signed up) | "both"
    logo_url: str | None
    cities: list[str]
    areas: list[str]
    branches: int
    offers: int                 # all offers
    active_offers: int
    banks: list[str]
    best_discount: float | None
    favourites: int
    views: int
    rating: float | None
    rating_count: int | None
    tags: list[str]
    owner_email: str | None


def _row(e: dict) -> RestaurantRow:
    br = list(e["branches"].values())
    offers = list(e["offers"].values())
    rated = next((b for b in br if b.rating is not None), None)
    logo = next((b.logo_url for b in br if b.logo_url), None)
    has_bank = any(o.restaurant_deal_id is None for o in offers) or any(b.restaurant_branch_id is None for b in br)
    src = "both" if has_bank and e["owners"] else "account" if e["owners"] else "bank"
    return RestaurantRow(
        key=e["key"], name=e["name"], source=src, logo_url=logo,
        cities=sorted({b.city for b in br if b.city}), areas=sorted({b.area for b in br if b.area})[:6],
        branches=len(br), offers=len(offers), active_offers=sum(1 for o in offers if o.is_active),
        banks=sorted({o.bank.name for o in offers}),
        best_discount=max((_f(o.discount_percent) for o in offers if o.is_active and o.discount_percent), default=None),  # 0 = not given
        favourites=e["favourites"], views=e["views"],
        rating=_f(rated.rating) if rated else None, rating_count=rated.rating_count if rated else None,
        tags=sorted({t for b in br for t in (b.tags or [])})[:8],
        owner_email=e["owners"][0].email if e["owners"] else None,
    )


class UserRow(BaseModel):
    id: int
    email: str
    full_name: str | None
    phone: str | None
    city: str | None
    country: str | None
    role: str
    restaurant_name: str | None
    home_address: str | None = None
    office_address: str | None = None
    is_active: bool
    has_avatar: bool
    avatar_url: str | None = None   # the user's profile picture (admin-only image link)
    created_at: datetime
    last_seen_at: datetime | None
    cards: int
    visits: int
    favourites: int
    views: int
    branches: int
    deals: int


def _avatar_url(u: User) -> str | None:
    """Link to the profile picture; ?v= changes when the picture does, so the browser can cache it."""
    if not u.avatar:
        return None
    return f"/api/admin/users/{u.id}/avatar?v={hashlib.sha1(u.avatar[-200:].encode()).hexdigest()[:10]}"


async def _user_rows(session: AsyncSession) -> list[UserRow]:
    users = list(await session.scalars(select(User).where(User.role != "admin").order_by(User.created_at.desc())))

    async def per_user(stmt) -> dict[int, int]:
        return dict((await session.execute(stmt)).all())

    cards = await per_user(select(UserCard.user_id, func.count()).group_by(UserCard.user_id))
    visits = await per_user(select(UserVisit.user_id, func.count()).group_by(UserVisit.user_id))
    favs = await per_user(select(OfferFavourite.user_id, func.count()).where(OfferFavourite.user_id.is_not(None)).group_by(OfferFavourite.user_id))
    views = await per_user(select(OfferView.user_id, func.count()).where(OfferView.user_id.is_not(None)).group_by(OfferView.user_id))
    seen = await per_user(select(UserSession.user_id, func.max(UserSession.last_seen_at)).group_by(UserSession.user_id))
    branches = await per_user(select(RestaurantBranch.owner_id, func.count()).group_by(RestaurantBranch.owner_id))
    deals = await per_user(select(RestaurantDeal.owner_id, func.count()).group_by(RestaurantDeal.owner_id))
    return [UserRow(
        id=u.id, email=u.email, full_name=u.full_name, phone=u.phone, city=u.city, country=u.country, role=u.role,
        restaurant_name=u.restaurant_name, home_address=u.home_label, office_address=u.work_label,
        is_active=u.is_active, has_avatar=bool(u.avatar), avatar_url=_avatar_url(u), created_at=u.created_at,
        last_seen_at=seen.get(u.id), cards=cards.get(u.id, 0), visits=visits.get(u.id, 0), favourites=favs.get(u.id, 0),
        views=views.get(u.id, 0), branches=branches.get(u.id, 0), deals=deals.get(u.id, 0),
    ) for u in users]


class Overview(BaseModel):
    customers: int
    restaurant_accounts: int
    restaurants: int
    offers: int
    active_offers: int
    favourites: int
    views: int
    views_7d: int
    signups_7d: int
    top_restaurants: list[RestaurantRow]
    newest_users: list[UserRow]


@router.get("/overview", response_model=Overview)
async def overview(_: User = Depends(current_admin), session: AsyncSession = Depends(get_session)):
    rs = await _restaurants(session)
    rows = [_row(e) for e in rs.values() if e["owners"]]  # restaurants that signed up on the app
    users = await _user_rows(session)
    week = datetime.now(timezone.utc) - timedelta(days=7)
    return Overview(
        customers=sum(1 for u in users if u.role == "client"),
        restaurant_accounts=sum(1 for u in users if u.role == "restaurant"),
        restaurants=len(rows),
        offers=await session.scalar(select(func.count()).select_from(Offer)) or 0,
        active_offers=await session.scalar(select(func.count()).select_from(Offer).where(Offer.is_active.is_(True))) or 0,
        favourites=await session.scalar(select(func.count()).select_from(OfferFavourite)) or 0,
        views=await session.scalar(select(func.count()).select_from(OfferView)) or 0,
        views_7d=await session.scalar(select(func.count()).select_from(OfferView).where(OfferView.created_at > week)) or 0,
        signups_7d=sum(1 for u in users if u.created_at > week),
        top_restaurants=sorted(rows, key=lambda r: (-r.favourites, -r.views, -r.active_offers))[:8],
        newest_users=[u for u in users if u.role == "client"][:8],  # customers; restaurants have their own tab
    )


# ---------------------------------------------------------------- restaurants

@router.get("/restaurants", response_model=list[RestaurantRow])
async def restaurants(_: User = Depends(current_admin), session: AsyncSession = Depends(get_session)):
    """Only restaurants that signed up on the app (have a restaurant account). Restaurants that only appear
    in bank deals are still reachable from the Offers tab (/restaurants/<key> works for every restaurant)."""
    return sorted((_row(e) for e in (await _restaurants(session)).values() if e["owners"]), key=lambda r: r.name.lower())


class BranchOut(BaseModel):
    id: int
    address: str | None
    area: str | None
    city: str | None
    phone: str | None
    website: str | None
    latitude: float | None
    longitude: float | None
    hours: dict | None
    rating: float | None
    rating_count: int | None
    tags: list[str]
    menu_images: list[str]
    from_account: bool


class OfferCardOut(BaseModel):
    name: str
    discount_percent: float | None
    max_discount_amount: float | None


class OfferOut(BaseModel):
    id: int
    title: str
    description: str | None
    terms: str | None
    bank: str
    bank_slug: str
    discount_percent: float | None
    max_discount_amount: float | None
    valid_days: list[str] | None
    valid_from: str | None
    valid_till: str | None
    is_active: bool
    source: str           # "bank" | "account"
    source_url: str | None
    image_url: str | None
    cards: list[OfferCardOut]
    branches: int
    favourites: int
    views: int
    first_seen_at: datetime
    last_seen_at: datetime


class OwnerOut(BaseModel):
    id: int
    email: str
    full_name: str | None
    phone: str | None
    restaurant_name: str | None


class RestaurantDetail(BaseModel):
    row: RestaurantRow
    cover_url: str | None
    branches: list[BranchOut]
    offers: list[OfferOut]
    owners: list[OwnerOut]


@router.get("/restaurants/{key}", response_model=RestaurantDetail)
async def restaurant(key: str, _: User = Depends(current_admin), session: AsyncSession = Depends(get_session)):
    e = (await _restaurants(session)).get(key)
    if not e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found.")
    favs, views = e["_favs"], e["_views"]
    offers = sorted(e["offers"].values(), key=lambda o: (not o.is_active, -(o.discount_percent or 0)))
    return RestaurantDetail(
        row=_row(e),
        cover_url=next((o.image_url for o in offers if o.image_url), None),
        branches=[BranchOut(
            id=b.id, address=b.address, area=b.area, city=b.city, phone=b.phone, website=b.website,
            latitude=_f(b.latitude), longitude=_f(b.longitude), hours=b.hours, rating=_f(b.rating), rating_count=b.rating_count,
            tags=b.tags or [], menu_images=b.menu_images or [], from_account=b.restaurant_branch_id is not None,
        ) for b in sorted(e["branches"].values(), key=lambda b: (b.city or "", b.address or ""))],
        offers=[OfferOut(
            id=o.id, title=o.title, description=o.description, terms=o.terms, bank=o.bank.name, bank_slug=o.bank.slug,
            discount_percent=_f(o.discount_percent), max_discount_amount=_f(o.max_discount_amount), valid_days=o.valid_days,
            valid_from=o.valid_from.isoformat() if o.valid_from else None, valid_till=o.valid_till.isoformat() if o.valid_till else None,
            is_active=o.is_active, source="account" if o.restaurant_deal_id else "bank", source_url=o.source_url, image_url=o.image_url,
            cards=[OfferCardOut(name=l.card.name, discount_percent=_f(l.discount_percent), max_discount_amount=_f(l.max_discount_amount))
                   for l in o.card_links],
            branches=len(o.businesses), favourites=favs.get(o.id, 0), views=views.get(o.id, 0),
            first_seen_at=o.first_seen_at, last_seen_at=o.last_seen_at,
        ) for o in offers],
        owners=[OwnerOut(id=u.id, email=u.email, full_name=u.full_name, phone=u.phone, restaurant_name=u.restaurant_name)
                for u in e["owners"]],
    )


# ---------------------------------------------------------------- offers

@router.get("/offers")
async def offers(_: User = Depends(current_admin), session: AsyncSession = Depends(get_session)) -> JSONResponse:
    """Every offer, compact. Branch locations are sent once (`branches`) and offers point at them by id,
    so distance filters work in the browser without repeating coordinates thousands of times."""
    snap = await snapshot(session)
    favs, views = await _offer_counts(session)
    branches = {b.id: [_f(b.latitude), _f(b.longitude), b.area] for b in snap.businesses}
    out = []
    for o in snap.offers:
        first = o.businesses[0] if o.businesses else None
        name = first.name if first else o.title
        out.append({
            "id": o.id, "title": o.title, "key": rkey(name), "restaurant": name,
            "logo": next((b.logo_url for b in o.businesses if b.logo_url), None),
            "bank": o.bank.name, "bank_slug": o.bank.slug,
            "pct": _f(o.discount_percent), "cap": _f(o.max_discount_amount),
            "cards": [l.card.name for l in o.card_links],
            "days": o.valid_days or [], "from": o.valid_from.isoformat() if o.valid_from else None,
            "till": o.valid_till.isoformat() if o.valid_till else None,
            "active": o.is_active, "source": "account" if o.restaurant_deal_id else "bank",
            "favs": favs.get(o.id, 0), "views": views.get(o.id, 0),
            "b": [b.id for b in o.businesses], "seen": o.first_seen_at.isoformat(),
        })
    return JSONResponse({"branches": branches, "offers": out})


# ---------------------------------------------------------------- users

@router.get("/users", response_model=list[UserRow])
async def users(_: User = Depends(current_admin), session: AsyncSession = Depends(get_session)):
    return await _user_rows(session)


class PlaceOut(BaseModel):
    label: str | None
    lat: float | None
    lng: float | None


class SessionOut(BaseModel):
    device: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime


class FavOut(BaseModel):
    offer_id: int
    title: str
    place: str | None
    bank: str
    discount_percent: float | None
    saved_at: datetime


class UserDetail(BaseModel):
    row: UserRow
    avatar: str | None
    cover: str | None
    home: PlaceOut
    work: PlaceOut
    updated_at: datetime
    cards: list[dict]
    visits: list[dict]
    favourites: list[FavOut]
    recent_views: list[dict]
    sessions: list[SessionOut]
    branches: list[dict]
    deals: list[dict]


@router.get("/users/{user_id}/avatar")
async def user_avatar(user_id: int, _: User = Depends(current_admin), session: AsyncSession = Depends(get_session)):
    """A user's profile picture (stored as a data URL) served as an image — admin only."""
    u = await session.get(User, user_id)
    m = re.match(r"^data:(image/[a-z+.-]+);base64,(.+)$", (u.avatar if u else None) or "", re.S)
    if not m or u.role == "admin":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No picture.")
    return Response(base64.b64decode(m.group(2)), media_type=m.group(1),
                    headers={"Cache-Control": "private, max-age=2592000, immutable"})


@router.get("/users/{user_id}", response_model=UserDetail)
async def user(user_id: int, _: User = Depends(current_admin), session: AsyncSession = Depends(get_session)):
    u = await session.scalar(select(User).where(User.id == user_id, User.role != "admin")
                             .options(selectinload(User.cards), selectinload(User.visits)))
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    row = next(r for r in await _user_rows(session) if r.id == u.id)
    fav_rows = (await session.execute(
        select(OfferFavourite, Offer).join(Offer, Offer.id == OfferFavourite.offer_id)
        .where(OfferFavourite.user_id == u.id).options(selectinload(Offer.bank), selectinload(Offer.businesses))
        .order_by(OfferFavourite.created_at.desc()))).all()
    view_rows = (await session.execute(
        select(OfferView, Offer).join(Offer, Offer.id == OfferView.offer_id)
        .where(OfferView.user_id == u.id).options(selectinload(Offer.businesses))
        .order_by(OfferView.created_at.desc()).limit(30))).all()
    sessions = list(await session.scalars(select(UserSession).where(UserSession.user_id == u.id).order_by(UserSession.last_seen_at.desc())))
    branches = list(await session.scalars(select(RestaurantBranch).where(RestaurantBranch.owner_id == u.id).order_by(RestaurantBranch.id)))
    deals = list(await session.scalars(select(RestaurantDeal).where(RestaurantDeal.owner_id == u.id).order_by(RestaurantDeal.created_at.desc())))
    stats = await deal_stats(session, [d.id for d in deals])
    return UserDetail(
        row=row, avatar=u.avatar, cover=u.cover,
        home=PlaceOut(label=u.home_label, lat=_f(u.home_lat), lng=_f(u.home_lng)),
        work=PlaceOut(label=u.work_label, lat=_f(u.work_lat), lng=_f(u.work_lng)),
        updated_at=u.updated_at,
        cards=[{"bank": c.bank_name, "card": c.card_name, "added_at": c.created_at.isoformat()} for c in u.cards],
        visits=[{"place": v.place_name, "address": v.place_address, "bank": v.bank_name,
                 "discount_percent": _f(v.discount_percent), "visited_at": v.visited_at.isoformat()} for v in u.visits],
        favourites=[FavOut(offer_id=o.id, title=o.title, place=o.businesses[0].name if o.businesses else None, bank=o.bank.name,
                           discount_percent=_f(o.discount_percent), saved_at=f.created_at) for f, o in fav_rows],
        recent_views=[{"offer_id": o.id, "title": o.title, "place": o.businesses[0].name if o.businesses else None,
                       "source": v.source, "viewed_at": v.created_at.isoformat()} for v, o in view_rows],
        sessions=[SessionOut(device=s.user_agent, created_at=s.created_at, last_seen_at=s.last_seen_at, expires_at=s.expires_at)
                  for s in sessions],
        branches=[{"name": b.name, "address": b.address, "lat": float(b.lat), "lng": float(b.lng), "phone": b.phone} for b in branches],
        deals=[_deal(d, stats).model_dump(mode="json") for d in deals],
    )
