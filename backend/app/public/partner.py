"""Restaurant accounts: their branches and the discounts they add themselves.

  GET/POST          /api/partner/branches            list / add a branch (exact spot from the map)
  PATCH/DELETE      /api/partner/branches/{id}
  GET/POST          /api/partner/deals               list / add a discount (gets a code like DF-7K3P9Q)
  PATCH/DELETE      /api/partner/deals/{id}
  POST              /api/partner/deals/{id}/expire   end it now
  POST              /api/partner/deals/{id}/restore  undo "expire now" (if its end date hasn't passed)

Only logged-in users with role "restaurant" can use these, and only on their own rows.
Status is worked out in Pakistan time: expired (ended by hand, or end date passed), upcoming
(start date still ahead) or active.
"""
import secrets
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Offer, OfferFavourite, OfferView, RestaurantBranch, RestaurantDeal, User
from app.db.session import get_session
from app.public.auth import current_user
from app.public.restaurant_sync import sync_owner

router = APIRouter(prefix="/api/partner", tags=["partner"])

PK = ZoneInfo("Asia/Karachi")
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I — easy to read out at the till


def today_pk() -> date:
    return datetime.now(PK).date()


async def restaurant_user(user: User = Depends(current_user)) -> User:
    if user.role != "restaurant":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This is for restaurant accounts only.")
    return user


# ---------------------------------------------------------------- branches

class BranchIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    address: str = Field(min_length=3, max_length=400)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    phone: str | None = Field(default=None, max_length=30)


class BranchOut(BaseModel):
    id: int
    name: str
    address: str
    lat: float
    lng: float
    phone: str | None


def _branch(b: RestaurantBranch) -> BranchOut:
    return BranchOut(id=b.id, name=b.name, address=b.address, lat=float(b.lat), lng=float(b.lng), phone=b.phone)


async def _own_branch(session: AsyncSession, user: User, branch_id: int) -> RestaurantBranch:
    b = await session.get(RestaurantBranch, branch_id)
    if not b or b.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found.")
    return b


@router.get("/branches", response_model=list[BranchOut])
async def list_branches(user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    rows = await session.scalars(select(RestaurantBranch).where(RestaurantBranch.owner_id == user.id).order_by(RestaurantBranch.id))
    return [_branch(b) for b in rows]


@router.post("/branches", response_model=BranchOut, status_code=201)
async def add_branch(body: BranchIn, user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    b = RestaurantBranch(owner_id=user.id, name=body.name.strip(), address=body.address.strip(),
                         lat=Decimal(f"{body.lat:.6f}"), lng=Decimal(f"{body.lng:.6f}"),
                         phone=(body.phone or "").strip() or None)
    session.add(b)
    await session.commit()
    await sync_owner(session, user)
    return _branch(b)


@router.patch("/branches/{branch_id}", response_model=BranchOut)
async def edit_branch(branch_id: int, body: BranchIn, user: User = Depends(restaurant_user),
                      session: AsyncSession = Depends(get_session)):
    b = await _own_branch(session, user, branch_id)
    b.name, b.address = body.name.strip(), body.address.strip()
    b.lat, b.lng = Decimal(f"{body.lat:.6f}"), Decimal(f"{body.lng:.6f}")
    b.phone = (body.phone or "").strip() or None
    await session.commit()
    await sync_owner(session, user)
    return _branch(b)


@router.delete("/branches/{branch_id}", status_code=204)
async def delete_branch(branch_id: int, user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    b = await _own_branch(session, user, branch_id)
    await session.delete(b)
    # drop it from discounts that named it (an empty list then means "all branches")
    for d in await session.scalars(select(RestaurantDeal).where(RestaurantDeal.owner_id == user.id)):
        if branch_id in (d.branch_ids or []):
            d.branch_ids = [x for x in d.branch_ids if x != branch_id]
    await session.commit()
    await sync_owner(session, user)


# ---------------------------------------------------------------- deals

class DealCard(BaseModel):
    bank_slug: str = Field(min_length=1, max_length=50)
    bank_name: str = Field(min_length=1, max_length=150)
    card_name: str | None = Field(default=None, max_length=150)  # None = every card of this bank


class DealIn(BaseModel):
    title: str | None = Field(default=None, max_length=150)
    discount_percent: float = Field(gt=0, le=100)
    max_discount: int | None = Field(default=None, ge=1, le=10_000_000)
    cards: list[DealCard] = Field(default_factory=list, max_length=60)
    days: list[int] = Field(default_factory=list, max_length=7)
    start_date: date
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    is_family: bool = False
    family_size: int | None = Field(default=None, ge=2, le=50)
    branch_ids: list[int] = Field(default_factory=list, max_length=200)
    terms: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def _check(self):
        if any(d < 0 or d > 6 for d in self.days):
            raise ValueError("Days must be Monday to Sunday.")
        self.days = sorted(set(self.days))
        if len(self.days) == 7:
            self.days = []  # every day
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("The end date is before the start date.")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Give both a start and an end time, or choose All day.")
        if self.start_time is not None and self.start_time == self.end_time:
            raise ValueError("Start and end time are the same.")
        if not self.is_family:
            self.family_size = None
        return self


class DealOut(BaseModel):
    id: int
    code: str
    title: str | None
    discount_percent: float
    max_discount: int | None
    cards: list[DealCard]
    days: list[int]
    start_date: date
    end_date: date | None
    start_time: time | None
    end_time: time | None
    is_family: bool
    family_size: int | None
    branch_ids: list[int]
    terms: str | None
    status: Literal["active", "upcoming", "expired"]
    expired_by_owner: bool
    created_at: datetime
    favourites: int = 0   # customers who saved it (♥)
    views: int = 0        # times customers opened it (link or sidebar)
    live: bool = False    # shown to customers right now


def deal_status(d: RestaurantDeal, today: date | None = None) -> str:
    today = today or today_pk()
    if d.expired_at is not None or (d.end_date is not None and d.end_date < today):
        return "expired"
    if d.start_date > today:
        return "upcoming"
    return "active"


def _deal(d: RestaurantDeal, stats: dict | None = None) -> DealOut:
    st = (stats or {}).get(d.id, {})
    return DealOut(
        # live = customers can see it right now (published, has a branch, and between its start and end dates)
        favourites=st.get("favourites", 0), views=st.get("views", 0), live=st.get("live", False) and deal_status(d) == "active",
        id=d.id, code=d.code, title=d.title, discount_percent=float(d.discount_percent), max_discount=d.max_discount,
        cards=[DealCard(**c) for c in (d.cards or [])], days=list(d.days or []), start_date=d.start_date,
        end_date=d.end_date, start_time=d.start_time, end_time=d.end_time, is_family=d.is_family,
        family_size=d.family_size, branch_ids=list(d.branch_ids or []), terms=d.terms,
        status=deal_status(d), expired_by_owner=d.expired_at is not None, created_at=d.created_at,
    )


async def _own_deal(session: AsyncSession, user: User, deal_id: int) -> RestaurantDeal:
    d = await session.get(RestaurantDeal, deal_id)
    if not d or d.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Discount not found.")
    return d


async def _check_branches(session: AsyncSession, user: User, ids: list[int]) -> list[int]:
    ids = sorted(set(ids))
    if ids:
        mine = set(await session.scalars(select(RestaurantBranch.id).where(RestaurantBranch.owner_id == user.id)))
        if not set(ids) <= mine:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "One of the chosen branches doesn't exist any more.")
    return ids


def _apply(d: RestaurantDeal, body: DealIn, branch_ids: list[int]) -> None:
    d.title = (body.title or "").strip() or None
    d.discount_percent = Decimal(str(round(body.discount_percent, 2)))
    d.max_discount = body.max_discount
    d.cards = [c.model_dump() for c in body.cards]
    d.days = body.days
    d.start_date, d.end_date = body.start_date, body.end_date
    d.start_time, d.end_time = body.start_time, body.end_time
    d.is_family, d.family_size = body.is_family, body.family_size
    d.branch_ids = branch_ids
    d.terms = (body.terms or "").strip() or None


async def _new_code(session: AsyncSession) -> str:
    for _ in range(20):
        code = "DF-" + "".join(secrets.choice(CODE_CHARS) for _ in range(6))
        if not await session.scalar(select(RestaurantDeal.id).where(RestaurantDeal.code == code)):
            return code
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Couldn't make a discount code. Try again.")


async def deal_stats(session: AsyncSession, deal_ids: list[int]) -> dict[int, dict]:
    """Favourites (distinct customers) and views per deal, added up over the deal's published offers."""
    if not deal_ids:
        return {}
    out: dict[int, dict] = {i: {"favourites": 0, "views": 0, "live": False} for i in deal_ids}
    fav = await session.execute(
        select(Offer.restaurant_deal_id, func.count(func.distinct(OfferFavourite.viewer)))
        .join(OfferFavourite, OfferFavourite.offer_id == Offer.id)
        .where(Offer.restaurant_deal_id.in_(deal_ids)).group_by(Offer.restaurant_deal_id))
    for did, n in fav:
        out[did]["favourites"] = n
    views = await session.execute(
        select(Offer.restaurant_deal_id, func.count(OfferView.id))
        .join(OfferView, OfferView.offer_id == Offer.id)
        .where(Offer.restaurant_deal_id.in_(deal_ids)).group_by(Offer.restaurant_deal_id))
    for did, n in views:
        out[did]["views"] = n
    live = await session.execute(
        select(Offer.restaurant_deal_id).where(Offer.restaurant_deal_id.in_(deal_ids), Offer.is_active.is_(True)).distinct())
    for (did,) in live:
        out[did]["live"] = True
    return out


async def _one(session: AsyncSession, d: RestaurantDeal) -> DealOut:
    return _deal(d, await deal_stats(session, [d.id]))


@router.get("/deals", response_model=list[DealOut])
async def list_deals(user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    rows = list(await session.scalars(select(RestaurantDeal).where(RestaurantDeal.owner_id == user.id)
                                      .order_by(RestaurantDeal.created_at.desc())))
    stats = await deal_stats(session, [d.id for d in rows])
    return [_deal(d, stats) for d in rows]


@router.post("/deals", response_model=DealOut, status_code=201)
async def add_deal(body: DealIn, user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    d = RestaurantDeal(owner_id=user.id, code=await _new_code(session))
    _apply(d, body, await _check_branches(session, user, body.branch_ids))
    session.add(d)
    await session.commit()
    await sync_owner(session, user)
    await session.refresh(d)
    return await _one(session, d)


@router.patch("/deals/{deal_id}", response_model=DealOut)
async def edit_deal(deal_id: int, body: DealIn, user: User = Depends(restaurant_user),
                    session: AsyncSession = Depends(get_session)):
    d = await _own_deal(session, user, deal_id)
    _apply(d, body, await _check_branches(session, user, body.branch_ids))
    await session.commit()
    await sync_owner(session, user)
    await session.refresh(d)
    return await _one(session, d)


@router.post("/deals/{deal_id}/expire", response_model=DealOut)
async def expire_deal(deal_id: int, user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    d = await _own_deal(session, user, deal_id)
    if d.expired_at is None:
        d.expired_at = datetime.now(timezone.utc)
        await session.commit()
        await sync_owner(session, user)
        await session.refresh(d)
    return await _one(session, d)


@router.post("/deals/{deal_id}/restore", response_model=DealOut)
async def restore_deal(deal_id: int, user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    d = await _own_deal(session, user, deal_id)
    if d.end_date is not None and d.end_date < today_pk():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Its end date has passed — edit the dates to run it again.")
    d.expired_at = None
    await session.commit()
    await sync_owner(session, user)
    await session.refresh(d)
    return await _one(session, d)


@router.delete("/deals/{deal_id}", status_code=204)
async def delete_deal(deal_id: int, user: User = Depends(restaurant_user), session: AsyncSession = Depends(get_session)):
    await session.delete(await _own_deal(session, user, deal_id))
    await session.commit()
    await sync_owner(session, user)
