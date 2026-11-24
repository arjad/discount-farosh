"""Publish a restaurant account's own discounts to customers.

Each restaurant branch  -> one `businesses` row (name = restaurant name, exact lat/lng, logo).
Each restaurant deal    -> one `offers` row per bank on the deal (so bank/card filters and "works with
                           my cards" keep working); a deal for everyone goes under the "No card needed" bank.
Offers keep their ids when a deal is edited (fingerprint "rd:<deal id>:<bank slug>"), so customers'
favourites and view counts survive edits. Deleting a deal or branch removes its rows (FK cascade).

Call `sync_owner` after anything the customer copy depends on changes: branches, deals, restaurant
name, phone, city, logo or cover photo.
"""
import hashlib
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Bank, Business, Card, Offer, OfferCard, RestaurantBranch, RestaurantDeal, User

DIRECT_BANK = ("direct", "No card needed")
PK = ZoneInfo("Asia/Karachi")
DAY3 = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:80] or "restaurant"


def media_url(user: User, kind: str) -> str | None:
    """Logo / cover are stored as data URLs on the user; customers load them from a small public endpoint.
    The ?v= hash changes when the picture changes, so browsers can cache it for long."""
    data = user.avatar if kind == "logo" else user.cover
    if not data:
        return None
    v = hashlib.sha1(data[-200:].encode()).hexdigest()[:10]
    return f"/api/public/restaurant-media/{user.id}/{kind}?v={v}"


def _fmt_time(t) -> str:
    h12 = t.hour % 12 or 12
    return f"{h12}:{t.minute:02d} {'pm' if t.hour >= 12 else 'am'}" if t.minute else f"{h12} {'pm' if t.hour >= 12 else 'am'}"


def _pct(v) -> str:
    f = float(v)
    return f"{int(f)}%" if f == int(f) else f"{f:.1f}%"


def _description(d: RestaurantDeal) -> str:
    parts = [f"Code {d.code}"]
    if d.start_time and d.end_time:
        parts.append(f"{_fmt_time(d.start_time)} – {_fmt_time(d.end_time)}")
    else:
        parts.append("All day")
    if d.is_family:
        parts.append(f"Family deal for {d.family_size} people" if d.family_size else "Family deal")
    if not d.cards:
        parts.append("No card needed")
    return " · ".join(parts)


async def _bank(session: AsyncSession, cache: dict, slug: str, name: str) -> Bank:
    if slug in cache:
        return cache[slug]
    b = await session.scalar(select(Bank).where(Bank.slug == slug))
    if not b:
        b = Bank(slug=slug, name=name)
        session.add(b)
        await session.flush()
    cache[slug] = b
    return b


async def _card(session: AsyncSession, bank: Bank, name: str) -> Card:
    c = await session.scalar(select(Card).where(Card.bank_id == bank.id, Card.name == name))
    if not c:
        c = Card(bank_id=bank.id, name=name)
        session.add(c)
        await session.flush()
    return c


async def sync_owner(session: AsyncSession, owner: User) -> None:
    if owner.role != "restaurant":
        return
    name = (owner.restaurant_name or owner.full_name or "Restaurant").strip()
    logo = media_url(owner, "logo")
    cover = media_url(owner, "cover")

    # ---- branches -> businesses
    branches = list(await session.scalars(
        select(RestaurantBranch).where(RestaurantBranch.owner_id == owner.id).order_by(RestaurantBranch.id)))
    existing = {b.restaurant_branch_id: b for b in await session.scalars(
        select(Business).where(Business.restaurant_branch_id.in_([b.id for b in branches] or [-1])))}
    biz_for: dict[int, Business] = {}
    for br in branches:
        biz = existing.get(br.id) or Business(restaurant_branch_id=br.id, slug=f"rb-{br.id}-{_slug(name)}")
        biz.slug = f"rb-{br.id}-{_slug(name)}"
        biz.name = name
        biz.category = "restaurant"
        biz.phone = br.phone or owner.phone
        biz.logo_url = logo
        biz.address = br.address
        biz.city = owner.city
        biz.latitude, biz.longitude = br.lat, br.lng
        if br.id not in existing:
            session.add(biz)
        biz_for[br.id] = biz
    await session.flush()

    # ---- deals -> offers (one per bank)
    deals = list(await session.scalars(select(RestaurantDeal).where(RestaurantDeal.owner_id == owner.id)))
    offers = list(await session.scalars(
        select(Offer).where(Offer.restaurant_deal_id.in_([d.id for d in deals] or [-1]))
        .options(selectinload(Offer.businesses), selectinload(Offer.card_links))))
    by_fp = {o.fingerprint: o for o in offers}
    keep: set[str] = set()
    banks: dict[str, Bank] = {}
    today = datetime.now(PK).date()

    for d in deals:
        groups: dict[tuple[str, str], list[str | None]] = {}
        for c in d.cards or []:
            groups.setdefault((c["bank_slug"], c["bank_name"]), []).append(c.get("card_name"))
        if not groups:
            groups[DIRECT_BANK] = [None]
        where = [biz_for[i] for i in (d.branch_ids or []) if i in biz_for] or list(biz_for.values())
        live = d.expired_at is None and (d.end_date is None or d.end_date >= today) and bool(where)

        for (slug, bank_name), names in groups.items():
            bank = await _bank(session, banks, slug, bank_name)
            fp = f"rd:{d.id}:{slug}"
            keep.add(fp)
            o = by_fp.get(fp)
            if o is None:
                o = Offer(bank_id=bank.id, fingerprint=fp, restaurant_deal_id=d.id, title="", businesses=[], card_links=[])
                session.add(o)
                by_fp[fp] = o
            o.title = d.title or f"{_pct(d.discount_percent)} off the bill"
            o.description = _description(d)
            o.terms = d.terms
            o.category = "dining"
            o.discount_percent = d.discount_percent
            o.max_discount_amount = d.max_discount
            o.valid_days = [DAY3[i] for i in sorted(d.days)] if d.days else None
            o.valid_from, o.valid_till = d.start_date, d.end_date
            o.image_url = cover
            o.is_active = live
            o.businesses = where
            # cards: none listed = every card of that bank (or no card at all for "No card needed")
            want = [] if None in names else [await _card(session, bank, n) for n in dict.fromkeys(names)]
            want_ids = {c.id for c in want}
            o.card_links = [l for l in o.card_links if l.card_id in want_ids] + [
                OfferCard(card_id=c.id) for c in want if c.id not in {l.card_id for l in o.card_links}]

    for fp, o in by_fp.items():
        if fp not in keep and o.id is not None:
            await session.delete(o)
    await session.commit()
    from app.admin.snapshot import invalidate  # the admin's cached copy of offers is now out of date
    invalidate()
