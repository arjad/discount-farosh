"""MCB discounts scraper for mcb-web.peekaboo.guru (DOM-based, Playwright sync API).

The site is a React SPA with styled-components: class names carry hashed suffixes,
so every selector below matches a stable *prefix* via [class*="..."].

Usage:
  python scripts/mcb_peekaboo_scraper.py --test                    # one detail page, print parsed result
  python scripts/mcb_peekaboo_scraper.py                           # Food, Lahore
  python scripts/mcb_peekaboo_scraper.py --start-url https://mcb-web.peekaboo.guru/lahore/places/_all/all
  python scripts/mcb_peekaboo_scraper.py --headed --limit 5 --terms
"""
import argparse
import csv
import json
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import Page, sync_playwright
from playwright.sync_api import TimeoutError as PWTimeout

BASE_URL = "https://mcb-web.peekaboo.guru"
DEFAULT_START_URL = f"{BASE_URL}/lahore/places/1/Food"
TEST_URL = f"{BASE_URL}/lahore/detail/59/cafe-zouk?categoryId=1"

# ---------------------------------------------------------------- selectors
# listing
CARD_LINK = 'a[href*="/detail/"]'
CARD_NAME = 'p[class*="Styled__CardHeaderTitle"]'
CARD_LOGO = 'img[class*="Styled__Logo"]'
CARD_DISCOUNT = 'div[class*="Styled__DiscountHolder"]'
SEE_MORE_TEXT = "See More"
# detail
ENTITY_TITLE = 'h1[class*="Styled__EntityTitle"]'
LIST_ITEM = '[class*="Styled__ListItem"]'
OFFER_DATE = '[class*="Styled__Date"]'
PRIMARY_TEXT = '[class*="Styled__PrimaryText"]'
CARD_BUTTON_TEXT = '[class*="Style__CardButton"] p'
INFO_ROW = '[class*="Style__InfoRow"]'
LIST_TEXT_AREA = '[class*="Styled__ListTextArea"]'
DETAIL_READY = f"{LIST_ITEM}, {ENTITY_TITLE}"
OFFER_LINK = 'a[href*="/card-deal/"]'
TERMS_HEADING = "Terms & Conditions"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

DAY_RX = re.compile(
    r"(every\s*day|everyday|daily|weekdays?|weekends?|"
    r"(?:every\s+)?(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*(?:-|–|to|&|and|,)\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*)",
    re.I,
)


# ---------------------------------------------------------------- helpers

def clean(text: str | None) -> str:
    return " ".join((text or "").split())


def first_text(scope, selector: str) -> str:
    loc = scope.locator(selector).first
    try:
        return clean(loc.inner_text(timeout=1_000)) if loc.count() else ""
    except PWTimeout:
        return ""


def place_id_from(href: str) -> str | None:
    m = re.search(r"/detail/(\d+)", href)
    return m.group(1) if m else None


def parse_percent(text: str) -> float | None:
    m = re.search(r"(\d{1,3}(?:\.\d+)?)\s*%", text or "")
    return float(m.group(1)) if m else None


def parse_day_condition(title: str) -> str:
    """'30% off on Every Saturday' -> 'Every Saturday'; '40% off Everyday' -> 'Everyday'."""
    m = DAY_RX.search(title or "")
    return clean(m.group(1)).title().replace("Everyday", "Everyday") if m else ""


def polite_sleep(lo: float = 1.0, hi: float = 2.0) -> None:
    time.sleep(random.uniform(lo, hi))


# ---------------------------------------------------------------- listing

def collect_listing(page: Page, start_url: str, max_rounds: int = 200) -> list[dict]:
    page.goto(start_url, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_selector(CARD_LINK, timeout=30_000)

    last_count, stalls = -1, 0
    for _ in range(max_rounds):
        count = page.locator(CARD_LINK).count()
        print(f"  listing: {count} cards loaded", end="\r", flush=True)
        if count == last_count:
            stalls += 1
            if stalls >= 2:  # clicked twice with no new cards
                break
        else:
            stalls = 0
        last_count = count

        page.mouse.wheel(0, 50_000)
        see_more = page.get_by_text(SEE_MORE_TEXT, exact=True)
        if not see_more.count() or not see_more.first.is_visible():
            break
        try:
            see_more.first.scroll_into_view_if_needed(timeout=3_000)
            see_more.first.click(timeout=5_000)
        except PWTimeout:
            break
        page.wait_for_timeout(1_500)
    print()

    places: dict[str, dict] = {}
    for card in page.locator(CARD_LINK).all():
        href = card.get_attribute("href") or ""
        pid = place_id_from(href)
        if not pid or pid in places:
            continue
        logo = card.locator(CARD_LOGO).first
        places[pid] = {
            "place_id": pid,
            "name": first_text(card, CARD_NAME) or (logo.get_attribute("alt") if logo.count() else ""),
            "logo": logo.get_attribute("src") if logo.count() else None,
            "listing_max_discount": first_text(card, CARD_DISCOUNT),
            "card_text": clean(card.inner_text()),
            "detail_url": urljoin(BASE_URL, href),
        }
    return list(places.values())


# ---------------------------------------------------------------- detail

def read_terms(page: Page, deal_url: str) -> list[str]:
    """Each offer links to /card-deal/...; its page lists terms under 'Terms & Conditions'."""
    page.goto(deal_url, wait_until="domcontentloaded", timeout=60_000)
    try:
        page.get_by_text(TERMS_HEADING, exact=True).first.wait_for(timeout=10_000)
    except PWTimeout:
        return []
    return [clean(t) for t in page.evaluate(
        """heading => {
            const h = [...document.querySelectorAll('body *')].find(e => e.children.length === 0 && e.innerText?.trim() === heading);
            let box = h; for (let i = 0; i < 4 && box && !box.querySelector('li'); i++) box = box.parentElement;
            return box ? [...box.querySelectorAll('li')].map(li => li.innerText) : [];
        }""", TERMS_HEADING) if clean(t)]


def scrape_detail(page: Page, url: str, with_terms: bool = False) -> dict | None:
    page.goto(url, wait_until="domcontentloaded", timeout=60_000)
    try:
        page.wait_for_selector(DETAIL_READY, timeout=15_000)
    except PWTimeout:
        print(f"  ! timed out waiting for detail content: {url}")
        return None
    try:  # the title and the offers list render separately
        page.wait_for_selector(ENTITY_TITLE, timeout=10_000)
        page.wait_for_selector(OFFER_DATE, timeout=8_000)
    except PWTimeout:
        pass
    try:
        page.wait_for_load_state("networkidle", timeout=5_000)
    except PWTimeout:
        pass

    title = page.locator(ENTITY_TITLE).first
    name = clean(title.inner_text()) if title.count() else ""
    description = ""
    if title.count():
        description = clean(title.evaluate(
            "h => { let n = h.nextElementSibling; while (n && n.tagName !== 'P') n = n.nextElementSibling; return n ? n.innerText : ''; }"
        ))

    offers, branches = [], []
    for item in page.locator(LIST_ITEM).all():
        if item.locator(OFFER_DATE).count():
            info = item.locator(INFO_ROW).first
            # InfoRow's direct <span> children: ["Valid Till December 31, 2026", "Available at 1 Branch", "Terms Applied"]
            spans = [clean(x) for x in info.evaluate("e => [...e.children].filter(c => c.tagName === 'SPAN').map(c => c.innerText)")] if info.count() else []
            validity = spans[0] if spans else ""
            available = next((x for x in spans if "Available at" in x), "")
            link = item.locator("xpath=ancestor::a[contains(@href, '/card-deal/')]").first
            deal_href = link.get_attribute("href") if link.count() else None
            offer_title = first_text(item, PRIMARY_TEXT)
            offers.append({
                "title": offer_title,
                "discount_percent": parse_percent(offer_title),
                "day_condition": parse_day_condition(offer_title),
                "eligible_cards": [clean(t) for t in item.locator(CARD_BUTTON_TEXT).all_inner_texts() if clean(t)],
                "valid_till": re.sub(r"^Valid Till\s*", "", validity, flags=re.I),
                "branches_available": available,
                "deal_url": urljoin(BASE_URL, deal_href) if deal_href else None,
                "terms": [],
            })
        else:
            branch_name = first_text(item, PRIMARY_TEXT)
            area = item.locator(LIST_TEXT_AREA).first
            address = ""
            if area.count():
                lines = [clean(x) for x in area.inner_text().split("\n") if clean(x)]
                address = next((l for l in lines if l != branch_name and l not in ("Open Now", "Closed")), "")
            if branch_name and {"name": branch_name, "address": address} not in branches:
                branches.append({"name": branch_name, "address": address})

    if with_terms:  # visit each offer's own page last, so the detail page is fully read first
        for o in offers:
            if o["deal_url"]:
                o["terms"] = read_terms(page, o["deal_url"])
                polite_sleep(0.5, 1.0)

    return {"name": name, "description": description, "offers": offers, "branches": branches}


def scrape_detail_with_retry(page: Page, url: str, with_terms: bool) -> dict | None:
    for attempt in (1, 2):
        try:
            return scrape_detail(page, url, with_terms)
        except Exception as e:  # noqa: BLE001
            print(f"  ! attempt {attempt} failed for {url}: {type(e).__name__}: {str(e).splitlines()[0]}")
            if attempt == 1:
                polite_sleep(2, 3)
    return None


# ---------------------------------------------------------------- output

CSV_COLUMNS = ["place_id", "place_name", "category", "listing_max_discount", "offer_title", "discount_percent",
               "day_condition", "eligible_cards", "valid_till", "branches_available", "detail_url"]


def category_from_url(url: str) -> str:
    parts = urlsplit(url).path.strip("/").split("/")  # lahore/places/1/Food
    return parts[3].replace("%20", " ") if len(parts) >= 4 and parts[3] != "all" else "All"


def write_outputs(places: list[dict], out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path, json_path = out_dir / "mcb_offers.csv", out_dir / "mcb_places.json"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for p in places:
            for o in p.get("offers", []):
                w.writerow({
                    "place_id": p["place_id"], "place_name": p["name"], "category": p["category"],
                    "listing_max_discount": p["listing_max_discount"], "offer_title": o["title"],
                    "discount_percent": o["discount_percent"], "day_condition": o["day_condition"],
                    "eligible_cards": " | ".join(o["eligible_cards"]), "valid_till": o["valid_till"],
                    "branches_available": o["branches_available"], "detail_url": p["detail_url"],
                })
    json_path.write_text(json.dumps(places, indent=2, ensure_ascii=False), encoding="utf-8")
    return csv_path, json_path


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start-url", default=DEFAULT_START_URL)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--test", action="store_true", help=f"scrape only {TEST_URL} and print it")
    ap.add_argument("--terms", action="store_true", help="open each offer's page and capture its terms (slower)")
    ap.add_argument("--limit", type=int, help="only scrape the first N places")
    ap.add_argument("--out", default="output", help="output directory (default: ./output)")
    args = ap.parse_args()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        ctx = browser.new_context(user_agent=UA, locale="en-PK", viewport={"width": 1366, "height": 900})
        ctx.set_default_timeout(15_000)
        page = ctx.new_page()
        try:
            if args.test:
                result = scrape_detail_with_retry(page, TEST_URL, with_terms=args.terms)
                print(json.dumps(result, indent=2, ensure_ascii=False))
                ok = bool(result) and len(result["offers"]) == 3
                print(f"\n{'OK' if ok else 'CHECK SELECTORS'}: {len(result['offers']) if result else 0} offers (expected 3), "
                      f"{len(result['branches']) if result else 0} branches")
                return 0 if ok else 1

            category = category_from_url(args.start_url)
            print(f"Listing {args.start_url}")
            places = collect_listing(page, args.start_url)
            if args.limit:
                places = places[: args.limit]
            print(f"Found {len(places)} places in '{category}'")

            for i, place in enumerate(places, 1):
                detail = scrape_detail_with_retry(page, place["detail_url"], args.terms)
                place["category"] = category
                if detail:
                    place.update(name=detail["name"] or place["name"], description=detail["description"],
                                 offers=detail["offers"], branches=detail["branches"])
                else:
                    place.update(description="", offers=[], branches=[], error="detail page failed")
                print(f"[{i}/{len(places)}] {place['name']} — {len(place['offers'])} offers")
                if i < len(places):
                    polite_sleep()

            csv_path, json_path = write_outputs(places, Path(args.out))
            total = sum(len(p["offers"]) for p in places)
            failed = sum(1 for p in places if p.get("error"))
            print(f"\nDone: {len(places)} places, {total} offers, {failed} failed")
            print(f"  {csv_path}\n  {json_path}")
        finally:
            browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
