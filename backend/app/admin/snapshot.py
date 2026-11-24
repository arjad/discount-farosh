"""A shared in-memory copy of all restaurants + offers for the admin pages.

Loading ~3,000 offers with their banks, cards and branches takes ~0.5 s, so the admin keeps one copy
and rebuilds it at most once a minute (or right away after a restaurant account changes its deals —
see `invalidate()`, called from public/restaurant_sync.py). Favourites and views are NOT cached; the
pages count them fresh on every request (cheap queries).

The copy holds plain objects with the same attribute names as the ORM rows (b.name, o.bank.slug,
o.card_links[i].card.name, …), so the admin code reads them the same way.
"""
import asyncio
import time
from types import SimpleNamespace as NS

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Business, Offer, OfferCard

TTL_S = 60
_lock = asyncio.Lock()
_state: dict = {"at": 0.0, "data": None}

BIZ_FIELDS = ("id", "name", "address", "area", "city", "phone", "website", "logo_url", "latitude", "longitude",
              "hours", "rating", "rating_count", "tags", "menu_images", "restaurant_branch_id")
OFFER_FIELDS = ("id", "title", "description", "terms", "discount_percent", "max_discount_amount", "valid_days",
                "valid_from", "valid_till", "is_active", "restaurant_deal_id", "source_url", "image_url",
                "first_seen_at", "last_seen_at")


def invalidate() -> None:
    _state["at"] = 0.0


async def snapshot(session: AsyncSession) -> NS:
    if _state["data"] is not None and time.monotonic() - _state["at"] < TTL_S:
        return _state["data"]
    async with _lock:
        if _state["data"] is not None and time.monotonic() - _state["at"] < TTL_S:
            return _state["data"]
        rows = list(await session.scalars(select(Business)))
        biz = {b.id: NS(**{f: getattr(b, f) for f in BIZ_FIELDS}) for b in rows}
        offers = []
        for o in await session.scalars(select(Offer).options(
                selectinload(Offer.bank), selectinload(Offer.businesses),
                selectinload(Offer.card_links).selectinload(OfferCard.card))):
            ns = NS(**{f: getattr(o, f) for f in OFFER_FIELDS})
            ns.bank = NS(slug=o.bank.slug, name=o.bank.name)
            ns.businesses = [biz[b.id] for b in o.businesses if b.id in biz]
            ns.card_links = [NS(card=NS(name=l.card.name), discount_percent=l.discount_percent,
                                max_discount_amount=l.max_discount_amount) for l in o.card_links]
            offers.append(ns)
        data = NS(businesses=list(biz.values()), offers=offers)
        _state.update(at=time.monotonic(), data=data)
        return data
