"""Save scrape results into Postgres (idempotent upserts)."""
import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Bank, Business, Card, Offer, OfferBusiness, OfferCard, WaitlistSignup
from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods.food import is_food_offer
from app.public.bank_scrapers.common_methods.parsing import to_date
from app.schemas import Branch
from app.schemas import Offer as ScrapedOffer
from app.schemas import ScrapeResult, ScrapeStatus, WaitlistIn


def slugify(*parts: str | None) -> str:
    text = " ".join(p for p in parts if p).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:200]


def fingerprint(o: ScrapedOffer) -> str:
    """Same offer on the next scrape -> same fingerprint -> row is updated, not duplicated."""
    if o.external_id:
        return hashlib.sha256(f"id:{o.external_id}".encode()).hexdigest()
    key = "|".join((o.title or "", o.business_name or "", o.city or "", o.url or "")).lower()
    return hashlib.sha256(re.sub(r"\s+", " ", key).encode()).hexdigest()


def _dec(v: float | None) -> Decimal | None:
    return None if v is None else Decimal(str(v))


async def upsert_bank(session: AsyncSession, scraper: type[BaseBankScraper] | BaseBankScraper) -> int:
    values = dict(slug=scraper.slug, name=scraper.name, base_url=scraper.base_url, discounts_url=scraper.discounts_url)
    stmt = insert(Bank).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Bank.slug],
        set_={k: stmt.excluded[k] for k in ("name", "base_url", "discounts_url")} | {"updated_at": datetime.now(timezone.utc)},
    ).returning(Bank.id)
    return (await session.execute(stmt)).scalar_one()


async def upsert_card(session: AsyncSession, bank_id: int, name: str, tier: str | None,
                      card_type: str | None, network: str | None) -> int:
    stmt = insert(Card).values(bank_id=bank_id, name=name, tier=tier, card_type=card_type, network=network)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_cards_bank_name",
        # keep existing values if the scraper didn't send them
        set_={c: func.coalesce(stmt.excluded[c], getattr(Card, c)) for c in ("tier", "card_type", "network")},
    ).returning(Card.id)
    return (await session.execute(stmt)).scalar_one()


async def upsert_business(session: AsyncSession, o: ScrapedOffer, branch: Branch | None = None) -> int:
    """One row per physical location: '<name> <branch> <city>' is the unique slug."""
    b = branch or Branch(address=o.address, city=o.city)
    city = b.city or o.city
    values = dict(
        slug=slugify(o.business_name, b.name, city), name=o.business_name,
        category=o.business_category or "other", city=city, address=b.address, area=b.area,
        phone=b.phone, logo_url=o.business_logo,
        latitude=_dec(b.latitude), longitude=_dec(b.longitude),
        hours=b.hours or None, menu_images=o.menu_images or None,
        rating=_dec(o.business_rating), rating_count=o.business_rating_count,
        tags=o.business_tags or None,
    )
    stmt = insert(Business).values(**values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_businesses_slug",
        set_={k: func.coalesce(stmt.excluded[k], getattr(Business, k))
              for k in ("category", "address", "area", "phone", "logo_url", "latitude", "longitude",
                        "hours", "menu_images", "rating", "rating_count", "tags")}
             | {"updated_at": datetime.now(timezone.utc)},
    ).returning(Business.id)
    return (await session.execute(stmt)).scalar_one()


async def upsert_offer(session: AsyncSession, bank_id: int, o: ScrapedOffer, seen_at: datetime) -> int:
    values = dict(
        bank_id=bank_id, fingerprint=fingerprint(o), title=o.title[:300], description=o.description,
        terms=o.terms, category=o.category, discount_percent=_dec(o.discount_percent),
        max_discount_amount=_dec(o.max_discount_amount), valid_days=o.valid_days or None,
        valid_from=to_date(o.valid_from), valid_till=to_date(o.valid_till),
        source_url=o.url, image_url=o.image_url, is_active=True, last_seen_at=seen_at,
    )
    stmt = insert(Offer).values(**values)
    updatable = [k for k in values if k not in ("bank_id", "fingerprint")]
    stmt = stmt.on_conflict_do_update(
        constraint="uq_offers_bank_fingerprint",
        set_={k: stmt.excluded[k] for k in updatable} | {"updated_at": seen_at},
    ).returning(Offer.id)
    return (await session.execute(stmt)).scalar_one()


async def save_scrape_result(session: AsyncSession, scraper: BaseBankScraper, result: ScrapeResult,
                             *, partial: bool = False) -> int:
    """Persist one bank's scrape. Returns number of offers saved.

    Offers from this bank that were not seen in this successful run are marked inactive —
    unless `partial` (e.g. a run with a limit), where unseen offers are left alone.
    """
    bank_id = await upsert_bank(session, scraper)
    await session.execute(update(Bank).where(Bank.id == bank_id).values(last_scraped_at=result.finished_at))
    if result.status != ScrapeStatus.success:
        await session.commit()
        return 0

    seen_at = result.started_at
    offers = [o for o in result.offers if is_food_offer(o)]  # never write non-food offers
    for o in offers:
        offer_id = await upsert_offer(session, bank_id, o, seen_at)

        if o.business_name:
            for branch in o.branches or [None]:
                business_id = await upsert_business(session, o, branch)
                await session.execute(
                    insert(OfferBusiness).values(offer_id=offer_id, business_id=business_id).on_conflict_do_nothing()
                )

        for c in o.cards:
            card_id = await upsert_card(session, bank_id, c.name, c.tier, c.card_type, c.network)
            stmt = insert(OfferCard).values(
                offer_id=offer_id, card_id=card_id,
                discount_percent=_dec(c.discount_percent), max_discount_amount=_dec(c.max_discount_amount),
            )
            await session.execute(stmt.on_conflict_do_update(
                index_elements=[OfferCard.offer_id, OfferCard.card_id],
                set_={"discount_percent": stmt.excluded.discount_percent,
                      "max_discount_amount": stmt.excluded.max_discount_amount},
            ))

    if not partial:
        await session.execute(
            update(Offer).where(Offer.bank_id == bank_id, Offer.last_seen_at < seen_at).values(is_active=False)
        )
    await session.commit()
    return len(offers)


async def list_active_offers(session: AsyncSession, bank_slug: str | None = None, limit: int = 200) -> list[Offer]:
    stmt = select(Offer).join(Bank).where(Offer.is_active.is_(True)).order_by(Offer.last_seen_at.desc()).limit(limit)
    if bank_slug:
        stmt = stmt.where(Bank.slug == bank_slug)
    return list((await session.scalars(stmt)).all())



async def save_waitlist_signup(session: AsyncSession, body: WaitlistIn) -> bool:
    """Insert or update by email. Returns True if this is a new sign-up."""
    values = body.model_dump()
    values["email"] = values["email"].lower()
    values["banks"] = values["banks"] or None
    stmt = insert(WaitlistSignup).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[WaitlistSignup.email],
        set_={k: func.coalesce(stmt.excluded[k], getattr(WaitlistSignup, k))
              for k in ("full_name", "phone", "city", "banks")} | {"updated_at": func.now()},
    ).returning(WaitlistSignup.id, WaitlistSignup.created_at == WaitlistSignup.updated_at)
    created = (await session.execute(stmt)).one()[1]
    await session.commit()
    return bool(created)
