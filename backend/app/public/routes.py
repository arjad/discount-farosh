"""Public endpoints — read-only, no auth. Serve cached scrape results.

Run this file directly (no server needed):
  python app/public/routes.py    -> prints all offers stored in Postgres
  (uncomment `scrape_mcb()` in _main to scrape MCB in a visible browser instead)
"""
import asyncio
import sys
from pathlib import Path
from typing import Literal

if __name__ == "__main__":  # allow `python app/public/routes.py` (and VS Code's ▶ button)
    import os

    _backend = Path(__file__).resolve().parents[2]
    _venv_python = _backend / ".venv" / "bin" / "python"
    # started with the wrong Python (e.g. system python3)? switch to the project's venv
    if _venv_python.exists() and Path(sys.prefix).resolve() != (_backend / ".venv").resolve():
        os.execv(str(_venv_python), [str(_venv_python), __file__, *sys.argv[1:]])
    sys.path.insert(0, str(_backend))

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.repository import list_active_offers, save_waitlist_signup
from app.jobs import ScrapeJob, get_job, list_jobs, start_job
from app.public import registry
from app.db.session import get_session
from app.public.bank_scrapers import BANKS
from app.schemas import ScrapeResult, SourceInfo, StoredOffer, WaitlistIn, WaitlistOut
from app.store import result_store

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/banks", response_model=list[SourceInfo])
async def list_banks() -> list[SourceInfo]:
    return [SourceInfo(slug=s, name=c.name, category="bank", base_url=c.base_url) for s, c in BANKS.items()]


@router.get("/banks/{slug}/offers", response_model=list[StoredOffer])
async def bank_offers(slug: str, session: AsyncSession = Depends(get_session)):
    """Active offers for one bank, from Postgres."""
    if slug not in BANKS:
        raise HTTPException(404, f"Unknown bank '{slug}'")
    return await list_active_offers(session, slug)


@router.get("/offers", response_model=list[StoredOffer])
async def all_offers(session: AsyncSession = Depends(get_session)):
    """Active offers across all banks, from Postgres."""
    return await list_active_offers(session)


@router.get("/results", response_model=list[ScrapeResult])
async def latest_results(category: str | None = None) -> list[ScrapeResult]:
    """Latest run per source, including failure details (which tag broke)."""
    return result_store.all(category)


@router.post("/waitlist", response_model=WaitlistOut)
async def join_waitlist(body: WaitlistIn, session: AsyncSession = Depends(get_session)) -> WaitlistOut:
    """Pre-launch sign-up. Joining again with the same email updates the details."""
    banks = [b for b in body.banks if b in BANKS]
    created = await save_waitlist_signup(session, body.model_copy(update={"banks": banks}))
    return WaitlistOut(already_joined=not created)


# ---------------------------------------------------------------- scraping

@router.get("/scrapers")
async def list_scrapers() -> dict:
    """Every scraper you can run, grouped by type."""
    return {t: [{"slug": slug, "name": getattr(cls, "name", slug)} for slug, cls in items.items()]
            for t, items in registry.SCRAPERS.items()}


@router.post("/scrape", response_model=ScrapeJob, status_code=202)
async def run_scrapers(
    type: Literal["all", "bank", "restaurant", "other"] = Query("all", description="Which group to run"),
    name: str | None = Query(None, description="One scraper by slug or name, e.g. 'mcb' or 'MCB Bank'"),
    headed: bool = Query(False, description="Open a visible browser window to watch (development only)"),
    slow_mo_ms: int | None = Query(None, ge=0, le=5000, description="Slow each browser action down (headed runs)"),
    limit: int | None = Query(None, ge=1, description="Max merchants/items per scraper — for quick test runs"),
    save: bool = Query(True, description="Save results to Postgres"),
) -> ScrapeJob:
    """Start a scrape in the background and return the job. Poll GET /api/public/scrape/jobs/{id}.

    Examples:
      POST /api/public/scrape                              → every scraper
      POST /api/public/scrape?type=bank                    → all banks
      POST /api/public/scrape?type=bank&name=mcb&headed=true&limit=5
    """
    if headed and not get_settings().headed_allowed:
        raise HTTPException(403, "headed=true is only allowed in development (APP_ENV=development)")
    try:
        targets = registry.resolve(type, name)
    except KeyError as e:
        raise HTTPException(404, str(e.args[0])) from None
    if not targets:
        raise HTTPException(404, f"No scrapers registered for type '{type}' yet")
    return start_job(targets, headed=headed, save=save, limit=limit, slow_mo_ms=slow_mo_ms)


@router.get("/scrape/jobs", response_model=list[ScrapeJob])
async def scrape_jobs() -> list[ScrapeJob]:
    return list_jobs()


@router.get("/scrape/jobs/{job_id}", response_model=ScrapeJob)
async def scrape_job(job_id: str) -> ScrapeJob:
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found (jobs are kept in memory until the server restarts)")
    return job


async def scrape_mcb() -> None:
    """Run the scrape endpoint's method directly for MCB — no server, no HTTP call."""
    from app import jobs
    from app.core.browser import browser_manager

    await browser_manager.start()
    try:
        job = await run_scrapers(type="bank", name="mcb", headed=True, slow_mo_ms=None, limit=None, save=True)
        await asyncio.gather(*list(jobs._tasks))  # wait for the background job to finish
        print(job.model_dump_json(indent=2))
    finally:
        await browser_manager.stop()


async def read_all_offers(active_only: bool = True) -> list:
    """Read every offer stored in Postgres (with its bank, cards and businesses) and print it."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.db.models import Offer, OfferCard
    from app.db.session import SessionLocal

    stmt = (
        select(Offer)
        .options(
            selectinload(Offer.bank),
            selectinload(Offer.businesses),
            selectinload(Offer.card_links).selectinload(OfferCard.card),
        )
        .order_by(Offer.bank_id, Offer.title)
    )
    if active_only:
        stmt = stmt.where(Offer.is_active.is_(True))

    async with SessionLocal() as session:
        offers = list((await session.scalars(stmt)).all())

    for i, o in enumerate(offers, 1):
        places = sorted({b.name for b in o.businesses})
        cards = [link.card.name for link in o.card_links]
        print(f"[{i}] {o.bank.name} | {o.title}")
        print(f"     discount : {o.discount_percent or '-'}%   cap: {o.max_discount_amount or '-'} {o.currency}")
        print(f"     days     : {', '.join(o.valid_days or []) or 'any day'}   valid till: {o.valid_till or '-'}")
        print(f"     at       : {', '.join(places) or '-'}  ({len(o.businesses)} branches)")
        print(f"     cards    : {', '.join(cards) or '-'}")
    print(f"\nTotal: {len(offers)} {'active ' if active_only else ''}offers")
    return offers


async def _main() -> None:
    from app.db.session import engine

    try:
        # await scrape_mcb()       # uncomment to scrape MCB again
        await read_all_offers()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
