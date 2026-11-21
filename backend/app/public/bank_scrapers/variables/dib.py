"""Dubai Islamic Bank Pakistan — URLs and constants for the dib scraper.

NOTE: DIB does NOT use Peekaboo Guru. Its discounts come from **Vouch365** (by Entertainer Asia),
embedded on DIB's site as an iframe of https://dib.vouch365.club/ . The pages are server-rendered:
  * /city/<City>            every place, each with onclick="redirectToDetail('<City>', <id>, <categoryId>)"
  * /<City>/detail/<id>     one place: name, description, "50% off · <card> · Available at N Outlets", outlets
Vouch365 gives no coordinates and no weekly opening hours, so distance / "Closed" don't work for DIB deals.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "dib"
BANK_NAME = "Dubai Islamic Bank"
BASE_URL = "https://dib.vouch365.club"

DISCOUNTS_PATH = "/city/Lahore"
DISCOUNTS_URL = f"{BASE_URL}{DISCOUNTS_PATH}"

# The bank's own page where the Vouch365 portal is embedded (reference only)
BANK_PAGE_URL = "https://www.dibpak.com/"

# Cities to scrape (as written in the site's URLs)
CITIES = ["Lahore"]
CITY_PATH = "/city/{city}"
DETAIL_PATH = "/{city}/detail/{id}"

# Vouch365 category ids (3rd argument of redirectToDetail). 7 = Food — the only one we keep.
FOOD_CATEGORY_IDS = {7}

# Politeness / limits
DETAIL_PAGE_CONCURRENCY = 3
DELAY_BETWEEN_PAGES_MS = 500
PAGE_TIMEOUT_MS = 45_000
MAX_MERCHANTS: int | None = None  # set e.g. 5 while developing
