"""Dashboard endpoint — every active offer with its bank, cards and branches, in one call.

The dashboard filters on the client, so this returns everything (a few hundred offers).
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Bank, Offer, OfferCard
from app.db.session import get_session

router = APIRouter(prefix="/api/public/dashboard", tags=["dashboard"])


class DashBank(BaseModel):
    slug: str
    name: str


class DashCard(BaseModel):
    name: str
    tier: str | None = None
    card_type: str | None = None
    network: str | None = None
    discount_percent: float | None = None
    max_discount_amount: float | None = None


class DashBranch(BaseModel):
    id: int
    address: str | None = None
    area: str | None = None
    city: str | None = None
    phone: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    hours: dict[str, str] | None = None


class DashBusiness(BaseModel):
    name: str
    category: str | None = None
    logo_url: str | None = None
    website: str | None = None
    rating: float | None = None
    rating_count: int | None = None
    menu_images: list[str] = []
    tags: list[str] = []


class DashOffer(BaseModel):
    id: int
    title: str
    description: str | None = None
    terms: str | None = None
    category: str | None = None
    discount_percent: float | None = None
    max_discount_amount: float | None = None
    currency: str
    valid_days: list[str] | None = None
    valid_from: date | None = None
    valid_till: date | None = None
    source_url: str | None = None
    image_url: str | None = None
    last_seen_at: datetime
    bank: DashBank
    business: DashBusiness | None = None
    branches: list[DashBranch]
    cards: list[DashCard]


class DashboardData(BaseModel):
    total: int
    last_synced_at: datetime | None
    offers: list[DashOffer]


def _f(v) -> float | None:
    return float(v) if v is not None else None


@router.get("/offers", response_model=DashboardData)
async def dashboard_offers(session: AsyncSession = Depends(get_session)) -> DashboardData:
    today = datetime.now(ZoneInfo("Asia/Karachi")).date()
    stmt = (
        select(Offer)
        .where(Offer.is_active.is_(True))
        # restaurants' own deals: only between their start and end dates (they expire by themselves)
        .where(or_(Offer.restaurant_deal_id.is_(None), and_(
            or_(Offer.valid_from.is_(None), Offer.valid_from <= today),
            or_(Offer.valid_till.is_(None), Offer.valid_till >= today))))
        .options(
            selectinload(Offer.bank),
            selectinload(Offer.businesses),
            selectinload(Offer.card_links).selectinload(OfferCard.card),
        )
        .order_by(Offer.discount_percent.desc().nulls_last(), Offer.title)
    )
    offers = list((await session.scalars(stmt)).all())
    last_synced = await session.scalar(select(func.max(Bank.last_scraped_at)))

    out: list[DashOffer] = []
    for o in offers:
        branches = sorted(o.businesses, key=lambda b: (b.city or "", b.address or ""))
        first = branches[0] if branches else None
        out.append(DashOffer(
            id=o.id, title=o.title, description=o.description, terms=o.terms, category=o.category,
            discount_percent=_f(o.discount_percent), max_discount_amount=_f(o.max_discount_amount),
            currency=o.currency, valid_days=o.valid_days, valid_from=o.valid_from, valid_till=o.valid_till,
            source_url=o.source_url, image_url=o.image_url, last_seen_at=o.last_seen_at,
            bank=DashBank(slug=o.bank.slug, name=o.bank.name),
            business=DashBusiness(
                name=first.name, category=first.category, logo_url=first.logo_url, website=first.website,
                rating=_f(first.rating), rating_count=first.rating_count,
                menu_images=next((b.menu_images for b in branches if b.menu_images), None) or [],
                tags=list(dict.fromkeys(t for b in branches for t in (b.tags or []))),
            ) if first else None,
            branches=[DashBranch(id=b.id, address=b.address, area=b.area, city=b.city, phone=b.phone,
                                 latitude=_f(b.latitude), longitude=_f(b.longitude), hours=b.hours)
                      for b in branches],
            cards=[DashCard(name=l.card.name, tier=l.card.tier, card_type=l.card.card_type,
                            network=l.card.network, discount_percent=_f(l.discount_percent),
                            max_discount_amount=_f(l.max_discount_amount))
                   for l in sorted(o.card_links, key=lambda l: -(l.discount_percent or 0))],
        ))
    return DashboardData(total=len(out), last_synced_at=last_synced, offers=out)
