"""Dubai Islamic Bank discounts scraper — Vouch365 (dib.vouch365.club), NOT Peekaboo.

Flow per city:
  1. open /city/<City>; every place card has onclick="redirectToDetail('<City>', <id>, <categoryId>)"
     plus a cover photo — keep only Food (category 7)
  2. open each /<City>/detail/<id> and read its text:
       ... Cards | 50% off | Visa Infinite | Available at 1 Outlets | Terms Apply | 30% off | VISA Signature | ...
       Outlets | Gulberg | <address> | Open Now | Socialize ...
     Same % for several cards -> one offer listing all those cards.
Vouch365 has no coordinates or opening hours, so those stay empty.

Run it directly, from the backend folder:
  python -m app.cli dib --save
"""
import asyncio
import logging
import re

from playwright.async_api import BrowserContext, Page

from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods.errors import NoOffersFoundError, ScraperError
from app.public.bank_scrapers.common_methods.food_tags import food_tags
from app.public.bank_scrapers.common_methods.parsing import card_attributes
from app.public.bank_scrapers.variables import dib as v
from app.schemas import Branch, CardDiscount, Offer

logger = logging.getLogger(__name__)

_CARD_RE = re.compile(r"redirectToDetail\('([^']+)',\s*(\d+),\s*(\d+)\)")
_PCT_RE = re.compile(r"^(\d{1,3}(?:\.\d+)?)\s*%\s*off$", re.I)
_UI_WORDS = {"arrow_back", "back", "location_on", "keyboard_arrow_down", "keyboard_arrow_left", "keyboard_arrow_right",
             "phone", "store", "credit_cards", "credit_card", "payment", "terms apply", "card discounts", "select outlet",
             "cards", "outlets", "up to", "open now", "closed", "closed now"}


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.split("\n") if ln.strip()]


def fix_text(s: str) -> str:
    """The site double-encodes some UTF-8 text ("7AØŒ 3" should be "7A، 3"). Repair it when we can."""
    if any(ch in s for ch in "ØÙÃâ"):
        try:
            return s.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            try:
                return s.encode("latin-1").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                return s
    return s


def clean_card(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"(Credit|Debit|Prepaid)Card\b", r"\1 Card", name)).strip()


class DibScraper(BaseBankScraper):
    slug = v.BANK_SLUG
    name = v.BANK_NAME
    base_url = v.BASE_URL
    discounts_url = v.DISCOUNTS_URL

    async def scrape(self, page: Page) -> list[Offer]:
        offers: list[Offer] = []
        for city in v.CITIES:
            merchants = await self.collect_merchants(page, city)
            logger.info("dib/%s: %d food places", city, len(merchants))
            offers += await self.scrape_merchants(page.context, city, merchants)
        return offers

    # ---------- step 1: city listing ----------

    async def collect_merchants(self, page: Page, city: str) -> dict[int, dict]:
        url = self.base_url + v.CITY_PATH.format(city=city)
        await page.goto(url, wait_until="domcontentloaded", timeout=v.PAGE_TIMEOUT_MS)
        try:
            await page.wait_for_selector("[onclick*='redirectToDetail']", timeout=v.PAGE_TIMEOUT_MS)
        except Exception as e:  # noqa: BLE001
            raise NoOffersFoundError(f"dib: no places listed on {url}", page_url=url) from e
        cards = await page.eval_on_selector_all(
            "[onclick*='redirectToDetail']",
            """els => els.map(e => {
                 const cover = e.querySelector('.cover, [style*="background-image"]');
                 const m = cover && (cover.getAttribute('style') || '').match(/url\\(([^)]+)\\)/);
                 return { onclick: e.getAttribute('onclick'), cover: m ? m[1].replace(/["']/g, '') : null };
               })""",
        )
        merchants: dict[int, dict] = {}
        for c in cards:
            m = _CARD_RE.search(c["onclick"] or "")
            if not m:
                continue
            mid, cat = int(m.group(2)), int(m.group(3))
            if cat in v.FOOD_CATEGORY_IDS:
                merchants.setdefault(mid, {"cover": c["cover"]})
        limit = self.limit or v.MAX_MERCHANTS
        if limit:
            merchants = dict(list(merchants.items())[:limit])
        return merchants

    # ---------- step 2: detail pages ----------

    async def scrape_merchants(self, context: BrowserContext, city: str, merchants: dict[int, dict]) -> list[Offer]:
        queue: asyncio.Queue = asyncio.Queue()
        for item in merchants.items():
            queue.put_nowait(item)
        offers: list[Offer] = []

        async def worker() -> None:
            page = await context.new_page()
            try:
                while not queue.empty():
                    mid, info = queue.get_nowait()
                    try:
                        offers.extend(await self.scrape_merchant(page, city, mid, info))
                    except Exception as e:  # noqa: BLE001 — one bad page shouldn't stop the run
                        logger.warning("dib: place %s failed: %s", mid, e)
                    await page.wait_for_timeout(v.DELAY_BETWEEN_PAGES_MS)
            finally:
                await page.close()

        await asyncio.gather(*(worker() for _ in range(v.DETAIL_PAGE_CONCURRENCY)))
        return offers

    async def scrape_merchant(self, page: Page, city: str, mid: int, info: dict) -> list[Offer]:
        url = self.base_url + v.DETAIL_PATH.format(city=city, id=mid)
        await page.goto(url, wait_until="domcontentloaded", timeout=v.PAGE_TIMEOUT_MS)
        await page.wait_for_function("document.body && document.body.innerText.includes('% off')", timeout=v.PAGE_TIMEOUT_MS)
        lines = _lines(await page.inner_text("body"))
        logo_alt = await page.eval_on_selector_all(
            "img[alt$=' Logo']", "els => els.map(e => e.getAttribute('alt'))")

        # name + description: the first two real text lines after the location picker
        start = next((i for i, ln in enumerate(lines) if ln.lower() == "keyboard_arrow_down"), 0) + 1
        head = [ln for ln in lines[start:start + 6] if ln.lower() not in _UI_WORDS and not ln.lower().endswith("outlets")]
        name = head[0] if head else f"Place {mid}"
        description = head[1] if len(head) > 1 and not _PCT_RE.match(head[1]) and head[1] != "Up to" else None

        # deals: "<n>% off" followed by the card name
        by_pct: dict[float, list[str]] = {}
        try:
            cards_at = lines.index("Cards")
        except ValueError:
            cards_at = 0
        outlets_at = next((i for i, ln in enumerate(lines) if ln == "Outlets" and i > cards_at), len(lines))
        sect = lines[cards_at:outlets_at]
        for i, ln in enumerate(sect):
            m = _PCT_RE.match(ln)
            if m and i + 1 < len(sect):
                card = clean_card(sect[i + 1])
                if card and not card.lower().startswith("available"):
                    by_pct.setdefault(float(m.group(1)), [])
                    if card not in by_pct[float(m.group(1))]:
                        by_pct[float(m.group(1))].append(card)

        # outlets: "<area>" then "<address>" then open status, until "Socialize"
        branches: list[Branch] = []
        tail = lines[outlets_at + 1:]
        stop = next((i for i, ln in enumerate(tail) if ln.lower() in ("socialize", "powered by entertainer asia - www.entertainerasia.com")), len(tail))
        tail = [ln for ln in tail[:stop] if ln.lower() not in _UI_WORDS]
        for j in range(0, len(tail) - 1, 2):
            area, address = fix_text(tail[j]), fix_text(tail[j + 1])
            branches.append(Branch(name=f"{name} {area}", area=area, address=address, city=city))

        logo = None
        if logo_alt:
            path = logo_alt[0].rsplit(" Logo", 1)[0].strip()  # "public/images/xyz.jpg"
            logo = f"{self.base_url}/storage/{path.split('public/', 1)[-1]}" if path else None
        cover = info.get("cover")
        tags = food_tags(name, None, None, description)

        offers = []
        for pct, cards in sorted(by_pct.items(), key=lambda kv: -kv[0]):
            pct_txt = int(pct) if pct.is_integer() else pct
            offers.append(Offer(
                source=self.slug,
                external_id=f"vouch365:dib:{mid}:{pct_txt}",
                title=f"{pct_txt}% off",
                description=f"{name}: {pct_txt}% off",
                url=url,
                image_url=cover or logo,
                category="dining",
                business_name=name,
                business_category="restaurant",
                business_logo=logo,
                business_tags=tags,
                city=city,
                branches=branches,
                discount_percent=pct,
                terms="Terms apply — see Dubai Islamic Bank's Vouch365 page for details.",
                cards=[CardDiscount(name=c, discount_percent=pct, **card_attributes(c)) for c in cards],
            ))
        if not offers:
            raise ScraperError(f"dib: no card discounts found on {url}", page_url=url)
        return offers
