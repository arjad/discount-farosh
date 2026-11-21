"""MCB Bank discounts scraper (mcb-web.peekaboo.guru).

Flow per city:
  1. open each category page, click "See More" until all merchants show → merchant → category
  2. open the "all" page the same way to catch uncategorised merchants
  3. open each merchant page and read the deals + branches JSON it loads

Run it directly (no server needed), from the backend folder:
  python app/public/bank_scrapers/mcb.py                 # headed browser, saves to Postgres
  python app/public/bank_scrapers/mcb.py --limit 5       # quick test, 5 merchants
  python app/public/bank_scrapers/mcb.py --headless --no-save
"""
import asyncio
import logging
import re
import sys
from pathlib import Path

if __name__ == "__main__":  # allow `python app/public/bank_scrapers/mcb.py`
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from urllib.parse import urlsplit

from playwright.async_api import BrowserContext, Page

from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods import actions
from app.public.bank_scrapers.common_methods.errors import ScraperError
from app.public.bank_scrapers.common_methods.food_tags import food_tags
from app.public.bank_scrapers.common_methods.parsing import card_attributes, iso_date, parse_cap, parse_days
from app.public.bank_scrapers.tags import mcb as t
from app.public.bank_scrapers.variables import mcb as v
from app.schemas import Branch, CardDiscount, Offer

logger = logging.getLogger(__name__)


def clean_card(name: str) -> str:
    """'HBL Visa Infinite CreditCard' -> 'HBL Visa Infinite Credit Card' (HBL's site drops the space)."""
    return re.sub(r"\s+", " ", re.sub(r"(Credit|Debit|Prepaid)Card\b", r"\1 Card", name)).strip()


class McbScraper(BaseBankScraper):
    slug = v.BANK_SLUG
    name = v.BANK_NAME
    base_url = v.BASE_URL
    discounts_url = v.DISCOUNTS_URL
    tags = t
    # The site's constants and selectors. Other banks on the same Peekaboo platform (e.g. HBL)
    # subclass this scraper and only swap these two modules.
    v = v
    t = t

    async def scrape(self, page: Page) -> list[Offer]:
        offers: list[Offer] = []
        for city in self.v.CITIES:
            await self.choose_city(page, city)
            merchants = await self.collect_merchants(page, city)
            logger.info("%s/%s: %d merchants", self.slug, city, len(merchants))
            offers += await self.scrape_merchants(page.context, city, merchants)
        return offers

    async def choose_city(self, page: Page, city: str) -> None:
        """Some Peekaboo sites (HBL) show nothing until a city is picked on the home page once."""
        try:
            await page.goto(self.base_url + "/", wait_until="domcontentloaded")
            link = page.get_by_text(city.title(), exact=True).first
            await link.wait_for(timeout=8_000)
            await link.click()
            await page.wait_for_timeout(1_500)
        except Exception as e:  # noqa: BLE001 — the listing pages may work without it (MCB does)
            logger.info("%s: couldn't pick city %s on the home page (%s)", self.slug, city, type(e).__name__)

    # ---------- step 1+2: listing pages ----------

    async def merchant_links(self, page: Page, path: str) -> list[str]:
        await actions.goto(page, self.base_url + path)
        # slow portals (Bank AL Habib takes ~30s to list places) set LISTING_TIMEOUT_MS / LOAD_MORE_WAIT_MS
        listing_ms = getattr(self.v, "LISTING_TIMEOUT_MS", None)
        if not await actions.wait_for(page, self.t.MERCHANT_LINK, optional=True, timeout_ms=listing_ms):
            logger.info(self.slug + ": %s — no merchants yet, reloading once", path)
            await page.reload(wait_until="domcontentloaded")
            await actions.wait_for(page, self.t.MERCHANT_LINK, timeout_ms=listing_ms)
        clicks = await actions.click_load_more_until_gone(page, self.t.SEE_MORE, max_clicks=100, pause_ms=1_200,
                                                          count_selector=self.t.MERCHANT_LINK,
                                                          wait_new_ms=getattr(self.v, "LOAD_MORE_WAIT_MS", 0))
        hrefs = await page.eval_on_selector_all(self.t.MERCHANT_LINK, "els => els.map(e => e.getAttribute('href'))")
        # "/lahore/detail/59/cafe-zouk?categoryId=_all" -> "/lahore/detail/59/cafe-zouk"
        links = list(dict.fromkeys(urlsplit(h).path for h in hrefs if h))
        logger.info(self.slug + ": %s — %d merchants after %d 'See More' clicks", path, len(links), clicks)
        return links

    async def collect_merchants(self, page: Page, city: str) -> dict[str, str]:
        """Return {merchant path: business category}."""
        merchants: dict[str, str] = {}
        for path, category in self.v.CATEGORY_PATHS.items():
            try:
                for link in await self.merchant_links(page, path.format(city=city)):
                    merchants.setdefault(link, category)
            except ScraperError as e:  # an empty category page is fine
                logger.info(self.slug + "/%s: category %s skipped (%s)", city, path, e.kind)
        for link in await self.merchant_links(page, self.v.CITY_ALL_PATH.format(city=city)):
            merchants.setdefault(link, "other")
        # skip merchants we know are not food (health, lifestyle, online...) — no need to open their pages
        skipped = sum(1 for c in merchants.values() if c in self.v.SKIP_CATEGORIES)
        merchants = {p: c for p, c in merchants.items() if c not in self.v.SKIP_CATEGORIES}
        logger.info(self.slug + "/%s: %d merchants to check, %d non-food skipped", city, len(merchants), skipped)
        limit = self.limit or self.v.MAX_MERCHANTS
        if limit:
            merchants = dict(list(merchants.items())[:limit])
        return merchants

    # ---------- step 3: merchant pages ----------

    async def scrape_merchants(self, context: BrowserContext, city: str, merchants: dict[str, str]) -> list[Offer]:
        queue: asyncio.Queue = asyncio.Queue()
        for item in merchants.items():
            queue.put_nowait(item)
        offers: list[Offer] = []
        failures: list[str] = []

        async def worker() -> None:
            page = await context.new_page()
            try:
                while not queue.empty():
                    path, category = queue.get_nowait()
                    try:
                        offers.extend(await self.scrape_merchant(page, city, path, category))
                    except ScraperError as e:
                        failures.append(path)
                        logger.warning(self.slug + ": %s failed: %s", path, e.message)
                    except Exception as e:  # noqa: BLE001 — one odd merchant page must not stop the whole bank
                        failures.append(path)
                        logger.warning(self.slug + ": %s failed unexpectedly: %s: %s", path, type(e).__name__, e)
                    await page.wait_for_timeout(self.v.DELAY_BETWEEN_PAGES_MS)
            finally:
                await page.close()

        await asyncio.gather(*(worker() for _ in range(self.v.DETAIL_PAGE_CONCURRENCY)))
        if failures:
            logger.warning(self.slug + "/%s: %d/%d merchant pages failed", city, len(failures), len(merchants))
        return offers

    @staticmethod
    def menu_images(entity: dict, merchant: dict) -> list[str]:
        """Photos of the restaurant's menu pages."""
        raw = ((merchant.get("richContent") or {}).get("menu") or {}).get("content") or entity.get("menu") or []
        if isinstance(raw, str):
            raw = raw.split(",")
        return [u.strip() for u in raw if isinstance(u, str) and u.strip().startswith("http")][:30]

    @staticmethod
    def images(entity: dict, merchant: dict) -> tuple[str | None, str | None]:
        """(logo, cover photo). The cover is a wide restaurant/food photo (~1020×380);
        falls back to the first gallery photo."""
        rich = merchant.get("richContent") or {}

        def first(v) -> str | None:
            if isinstance(v, dict):
                v = v.get("content")
            if isinstance(v, list):
                v = v[0] if v else None
            if isinstance(v, str):
                v = v.split(",")[0].strip()
            return v if isinstance(v, str) and v.startswith("http") else None

        logo = first(entity.get("logo")) or first(rich.get("logo"))
        cover = (first(entity.get("cover")) or first(rich.get("cover"))
                 or first(entity.get("gallery")) or first(rich.get("gallery")))
        return logo, cover

    async def scrape_merchant(self, page: Page, city: str, path: str, category: str) -> list[Offer]:
        url = self.base_url + path
        data = await actions.goto_and_capture(
            page, url,
            {"DEALS_RESPONSE": self.v.DEALS_RESPONSE, "BRANCHES_RESPONSE": self.v.BRANCHES_RESPONSE,
             "MERCHANT_RESPONSE": self.v.MERCHANT_RESPONSE},
            optional={"BRANCHES_RESPONSE", "MERCHANT_RESPONSE"},
            timeout_ms=getattr(self.v, "DETAIL_TIMEOUT_MS", 30_000),
        )
        deals = data["DEALS_RESPONSE"] or []
        entity = data.get("BRANCHES_RESPONSE") or {}
        merchant = data.get("MERCHANT_RESPONSE") or {}
        branches_by_id = {str(b["id"]): b for b in entity.get("branches") or []}
        cuisine = ", ".join(x["tag"] for x in merchant.get("tags") or [] if x.get("tag"))
        logo, cover = self.images(entity, merchant)
        menu = self.menu_images(entity, merchant)
        tags = food_tags(
            merchant.get("name") or entity.get("name"),
            [x.get("tag") for x in merchant.get("tags") or [] if isinstance(x, dict)],
            merchant.get("keywords") if isinstance(merchant.get("keywords"), str) else None,
            merchant.get("description") or entity.get("description"),
        )
        rating = merchant.get("rating")
        reviews = (merchant.get("stats") or {}).get("reviews")

        offers = []
        for d in deals:
            pct = d.get("percentageValue")
            terms = (d.get("description") or "").strip() or None
            branch_ids = list((d.get("targetBranches") or {}).keys())
            branches = [self.to_branch(branches_by_id.get(bid), name, city)
                        for bid, name in (d.get("targetBranches") or {}).items()]
            offers.append(Offer(
                source=self.slug,
                # most portals give every deal a dealId; some (Meezan) leave it out on a few deals —
                # then fall back to other ids, else None (the save step fingerprints title+place instead)
                external_id=(f"peekaboo:{deal_id}" if (deal_id := d.get("dealId") or d.get("id") or d.get("_id")) else None),
                title=d.get("title") or f"{pct}% off",
                description=f"{d.get('targetEntityName')}: {d.get('title')}",
                url=url,
                image_url=cover or d.get("targetEntityLogo"),  # restaurant photo for the card; logo if none
                valid_from=iso_date(d.get("startDate")),
                valid_till=iso_date(d.get("endDate")),
                category=self.v.OFFER_CATEGORY.get(category, category),
                business_name=d.get("targetEntityName") or merchant.get("name"),
                business_category=category,
                business_logo=logo or d.get("targetEntityLogo"),
                business_rating=float(rating) if isinstance(rating, (int, float)) and rating > 0 else None,
                business_rating_count=int(reviews) if isinstance(reviews, int) else None,
                menu_images=menu,
                business_tags=tags,
                city=city.title(),
                branches=branches,
                discount_percent=pct,
                max_discount_amount=parse_cap(terms),
                valid_days=parse_days(d.get("title")),
                terms=terms,
                cards=[
                    CardDiscount(name=clean_card(a["name"]), discount_percent=pct, **card_attributes(clean_card(a["name"])))
                    for a in d.get("associations") or [] if a.get("name")
                ],
                extra={k: val for k, val in {
                    "cuisine": cuisine, "branch_ids": ",".join(branch_ids),
                    "online": "true" if merchant.get("online") else "",
                }.items() if val},
            ))
        return offers

    @staticmethod
    def to_branch(b: dict | None, fallback_name: str, city: str) -> Branch:
        if not b:
            return Branch(name=fallback_name, city=city.title())
        return Branch(
            name=b.get("name") or fallback_name,
            address=b.get("address"),
            city=b.get("city") or city.title(),
            latitude=b.get("latitude"),
            longitude=b.get("longitude"),
            phone=(b.get("contactNumber") or "").split(",")[0].strip() or None,
            hours={k: str(val) for k, val in (b.get("everyDayTimngs") or {}).items() if val} or None,
        )


async def _main() -> None:
    import argparse

    from app.core.browser import browser_manager
    from app.db.repository import save_scrape_result
    from app.db.session import SessionLocal, engine

    parser = argparse.ArgumentParser(description="Scrape MCB deals")
    parser.add_argument("--headless", action="store_true", help="hide the browser (default: headed)")
    parser.add_argument("--limit", type=int, help="only scrape the first N merchants")
    parser.add_argument("--slow-mo", type=int, default=0, help="ms delay per browser action")
    parser.add_argument("--no-save", action="store_true", help="don't write offers to Postgres")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    await browser_manager.start(headless=True)
    try:
        scraper = McbScraper()
        result = await scraper.run(headed=not args.headless, slow_mo_ms=args.slow_mo or None, limit=args.limit)
        print(f"\n=== {result.source}: {result.status.value} — {len(result.offers)} offers in {result.duration_s:.1f}s")
        if result.error:
            print(result.error.model_dump_json(indent=2, exclude_none=True))
        for o in result.offers[:10]:
            print(f"  • {o.business_name} — {o.title}")
        if not args.no_save and result.offers:
            async with SessionLocal() as session:
                saved = await save_scrape_result(session, scraper, result, partial=args.limit is not None)
            print(f"saved {saved} offers to Postgres")
    finally:
        await browser_manager.stop()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
