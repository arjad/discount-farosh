"""Run a scraper directly — the fastest loop while working on one.

  python -m app.cli hdfc            # headless
  python -m app.cli hdfc --headed   # watch the browser
  python -m app.cli all
  python -m app.cli meezan --save   # also write offers to Postgres
"""
import argparse
import asyncio
import json

from app.core.browser import browser_manager
from app.db.repository import save_scrape_result
from app.db.session import SessionLocal, engine
from app.public.bank_scrapers import BANKS, get_bank_scraper


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bank", choices=[*BANKS, "all"])
    parser.add_argument("--headed", action="store_true", help="show the browser window")
    parser.add_argument("--json", action="store_true", help="print full result JSON")
    parser.add_argument("--save", action="store_true", help="save results to Postgres")
    args = parser.parse_args()

    await browser_manager.start(headless=not args.headed)
    try:
        slugs = [s for s, c in BANKS.items() if c.scrape_enabled] if args.bank == "all" else [args.bank]
        scrapers = [get_bank_scraper(s) for s in slugs]
        results = await asyncio.gather(*(s.run() for s in scrapers))
        if args.save:
            async with SessionLocal() as session:
                for scraper, result in zip(scrapers, results):
                    saved = await save_scrape_result(session, scraper, result)
                    print(f"saved {saved} offers for {scraper.slug}")
        for result in results:
            if args.json:
                print(result.model_dump_json(indent=2))
                continue
            print(f"\n=== {result.source}: {result.status.value} — {len(result.offers)} offers in {result.duration_s:.1f}s")
            if result.error:
                print(json.dumps(result.error.model_dump(exclude_none=True), indent=2))
            for o in result.offers[:10]:
                print(f"  • {o.title}" + (f"  ({o.url})" if o.url else ""))
    finally:
        await browser_manager.stop()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
