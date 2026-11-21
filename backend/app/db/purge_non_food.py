"""Delete non-food offers (and businesses left with no offers) that are already in the DB.

  python -m app.db.purge_non_food            # dry run — only prints what would be deleted
  python -m app.db.purge_non_food --delete   # actually delete

Uses the same rule as the scrapers (common_methods/food.py).
"""
import argparse
import asyncio
from collections import Counter

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.db.models import Business, Offer, OfferBusiness
from app.db.session import SessionLocal, engine
from app.public.bank_scrapers.common_methods.food import is_food_offer
from app.schemas import Offer as ScrapedOffer


def _as_scraped(o: Offer) -> ScrapedOffer:
    b = o.businesses[0] if o.businesses else None
    return ScrapedOffer(
        source="db", title=o.title, description=o.description, category=o.category,
        business_name=b.name if b else None, business_category=b.category if b else None,
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", action="store_true", help="delete (default is a dry run)")
    args = parser.parse_args()

    async with SessionLocal() as session:
        offers = (await session.scalars(select(Offer).options(selectinload(Offer.businesses)))).all()
        bad = [o for o in offers if not is_food_offer(_as_scraped(o))]
        print(f"{len(offers)} offers in DB — {len(offers) - len(bad)} food, {len(bad)} non-food")
        print("non-food by category:", dict(Counter(
            (o.businesses[0].category if o.businesses else o.category) or "none" for o in bad)))
        for o in bad[:15]:
            print(f"  • {(o.businesses[0].name if o.businesses else '')!s:30.30} | {o.title[:60]}")
        if len(bad) > 15:
            print(f"  … and {len(bad) - 15} more")

        if not args.delete:
            print("\nDry run — nothing deleted. Re-run with --delete to remove them.")
            return

        ids = [o.id for o in bad]
        if ids:
            await session.execute(delete(Offer).where(Offer.id.in_(ids)))  # offer_cards / offer_businesses cascade
        orphans = select(Business.id).where(~Business.id.in_(select(OfferBusiness.business_id)))
        res = await session.execute(delete(Business).where(Business.id.in_(orphans)))
        await session.commit()
        print(f"\nDeleted {len(ids)} offers and {res.rowcount} businesses with no offers left.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
