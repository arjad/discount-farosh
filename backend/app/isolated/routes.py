"""Isolated endpoints — require X-API-Key. These drive the Playwright scrapers."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import require_api_key
from app.db.repository import save_scrape_result
from app.db.session import SessionLocal
from app.public.bank_scrapers import BANKS, get_bank_scraper
from app.schemas import ScrapeResult
from app.store import result_store

router = APIRouter(prefix="/api/isolated", tags=["isolated"], dependencies=[Depends(require_api_key)])


async def _run_bank(slug: str) -> ScrapeResult:
    key = f"bank:{slug}"
    if result_store.is_running(key):
        raise HTTPException(409, f"Scrape already running for '{slug}'")
    result_store.mark_running(key, True)
    try:
        scraper = get_bank_scraper(slug)
        result = await scraper.run()
        await result_store.save(result)
        async with SessionLocal() as session:
            await save_scrape_result(session, scraper, result)
        return result
    finally:
        result_store.mark_running(key, False)


@router.post("/scrape/banks/{slug}", response_model=ScrapeResult)
async def scrape_bank(slug: str) -> ScrapeResult:
    if slug not in BANKS:
        raise HTTPException(404, f"Unknown bank '{slug}'")
    return await _run_bank(slug)


@router.post("/scrape/banks", response_model=list[ScrapeResult])
async def scrape_all_banks() -> list[ScrapeResult]:
    """Runs all banks concurrently (bounded by MAX_CONCURRENT_SCRAPES)."""
    results = await asyncio.gather(*(_run_bank(s) for s in BANKS), return_exceptions=True)
    return [r for r in results if isinstance(r, ScrapeResult)]


@router.get("/scrape/status")
async def scrape_status() -> dict:
    return {"running": result_store.running}
