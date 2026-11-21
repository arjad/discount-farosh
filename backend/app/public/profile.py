"""Logged-in user's profile: details, picture, home/work places, cards they own, restaurants visited."""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Offer, User, UserCard, UserVisit
from app.db.session import get_session
from app.public.auth import current_user

router = APIRouter(prefix="/api/profile", tags=["profile"])

MAX_AVATAR_CHARS = 400_000  # ~300 KB image as a data URL; the browser sends ~30 KB


class Place(BaseModel):
    label: str | None = None
    lat: float | None = None
    lng: float | None = None


class CardOut(BaseModel):
    id: int
    bank_slug: str
    bank_name: str
    card_name: str


class VisitOut(BaseModel):
    id: int
    offer_id: int | None
    place_name: str
    place_address: str | None
    image_url: str | None
    bank_name: str | None
    discount_percent: float | None
    visited_at: datetime


class Profile(BaseModel):
    id: int
    email: str
    full_name: str | None
    phone: str | None
    city: str | None
    avatar: str | None
    home: Place
    work: Place
    member_since: datetime
    cards: list[CardOut]
    visits: list[VisitOut]


def _f(v: Decimal | None) -> float | None:
    return float(v) if v is not None else None


def _profile(u: User) -> Profile:
    return Profile(
        id=u.id, email=u.email, full_name=u.full_name, phone=u.phone, city=u.city, avatar=u.avatar,
        home=Place(label=u.home_label, lat=_f(u.home_lat), lng=_f(u.home_lng)),
        work=Place(label=u.work_label, lat=_f(u.work_lat), lng=_f(u.work_lng)),
        member_since=u.created_at,
        cards=[CardOut(id=c.id, bank_slug=c.bank_slug, bank_name=c.bank_name, card_name=c.card_name) for c in u.cards],
        visits=[VisitOut(id=v.id, offer_id=v.offer_id, place_name=v.place_name, place_address=v.place_address,
                         image_url=v.image_url, bank_name=v.bank_name, discount_percent=_f(v.discount_percent),
                         visited_at=v.visited_at) for v in u.visits],
    )


async def _load(session: AsyncSession, user_id: int) -> User:
    session.expire_all()
    return await session.scalar(
        select(User).where(User.id == user_id).options(selectinload(User.cards), selectinload(User.visits))
    )


@router.get("", response_model=Profile)
async def get_profile(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)) -> Profile:
    return _profile(await _load(session, user.id))


class ProfileUpdate(BaseModel):
    """Only the fields sent are changed. Send null to clear one."""
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=80)
    avatar: str | None = None
    home: Place | None = None
    work: Place | None = None


def _check_coord(p: Place) -> None:
    if (p.lat is None) != (p.lng is None) or (p.lat is not None and not (-90 <= p.lat <= 90 and -180 <= p.lng <= 180)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid location coordinates.")


@router.patch("", response_model=Profile)
async def update_profile(body: ProfileUpdate, user: User = Depends(current_user),
                         session: AsyncSession = Depends(get_session)) -> Profile:
    sent = body.model_fields_set
    for k in ("full_name", "phone", "city"):
        if k in sent:
            v = (getattr(body, k) or "").strip() or None
            if k == "full_name" and not v:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Name can't be empty.")
            setattr(user, k, v)
    if "avatar" in sent:
        a = body.avatar
        if a and (not a.startswith("data:image/") or len(a) > MAX_AVATAR_CHARS):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Profile picture must be an image under 300 KB.")
        user.avatar = a or None
    for key in ("home", "work"):
        if key in sent:
            p = getattr(body, key) or Place()
            _check_coord(p)
            setattr(user, f"{key}_label", (p.label or "").strip()[:300] or None)
            setattr(user, f"{key}_lat", Decimal(str(round(p.lat, 6))) if p.lat is not None else None)
            setattr(user, f"{key}_lng", Decimal(str(round(p.lng, 6))) if p.lng is not None else None)
    await session.commit()
    return _profile(await _load(session, user.id))


# ---------------------------------------------------------------- cards

class CardIn(BaseModel):
    bank_slug: str = Field(min_length=1, max_length=50)
    bank_name: str = Field(min_length=1, max_length=150)
    card_name: str = Field(min_length=1, max_length=150)


@router.post("/cards", response_model=Profile, status_code=201)
async def add_card(body: CardIn, user: User = Depends(current_user),
                   session: AsyncSession = Depends(get_session)) -> Profile:
    exists = await session.scalar(select(UserCard.id).where(
        UserCard.user_id == user.id, UserCard.bank_slug == body.bank_slug, UserCard.card_name == body.card_name))
    if not exists:
        session.add(UserCard(user_id=user.id, **body.model_dump()))
        await session.commit()
    return _profile(await _load(session, user.id))


@router.delete("/cards/{card_id}", response_model=Profile)
async def remove_card(card_id: int, user: User = Depends(current_user),
                      session: AsyncSession = Depends(get_session)) -> Profile:
    await session.execute(delete(UserCard).where(UserCard.id == card_id, UserCard.user_id == user.id))
    await session.commit()
    return _profile(await _load(session, user.id))


# ---------------------------------------------------------------- visits

class VisitIn(BaseModel):
    offer_id: int


@router.post("/visits", response_model=Profile, status_code=201)
async def add_visit(body: VisitIn, user: User = Depends(current_user),
                    session: AsyncSession = Depends(get_session)) -> Profile:
    offer = await session.scalar(
        select(Offer).where(Offer.id == body.offer_id).options(selectinload(Offer.bank), selectinload(Offer.businesses))
    )
    if not offer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Offer not found.")
    b = offer.businesses[0] if offer.businesses else None
    session.add(UserVisit(
        user_id=user.id, offer_id=offer.id, place_name=(b.name if b else offer.title)[:200],
        place_address=b.address if b else None, image_url=offer.image_url or (b.logo_url if b else None),
        bank_name=offer.bank.name, discount_percent=offer.discount_percent,
    ))
    await session.commit()
    return _profile(await _load(session, user.id))


@router.delete("/visits/{visit_id}", response_model=Profile)
async def remove_visit(visit_id: int, user: User = Depends(current_user),
                       session: AsyncSession = Depends(get_session)) -> Profile:
    await session.execute(delete(UserVisit).where(UserVisit.id == visit_id, UserVisit.user_id == user.id))
    await session.commit()
    return _profile(await _load(session, user.id))
