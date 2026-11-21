"""Bank AL Habib — URLs and constants for the bank_al_habib scraper.

Bank AL Habib's deals portal is hosted by Peekaboo Guru (bahl-web.peekaboo.guru) — the same platform
as MCB and HBL, so this bank reuses the MCB scraper and only these values differ.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "bank_al_habib"
BANK_NAME = "Bank AL Habib"
BASE_URL = "https://bahl-web.peekaboo.guru"

DISCOUNTS_PATH = "/lahore/places/_all/all"
DISCOUNTS_URL = f"{BASE_URL}{DISCOUNTS_PATH}"

# The bank's own page where the Peekaboo portal is embedded (reference only)
BANK_PAGE_URL = "https://www.bankalhabib.com/deals-and-discounts"

# Cities to scrape (site slugs). Also available: karachi, islamabad, rawalpindi, peshawar, faisalabad, multan
CITIES = ["lahore"]

# Listing pages — {city} is filled in. Category pages tell us what kind of business each merchant is.
CITY_ALL_PATH = "/{city}/places/_all/all"
CATEGORY_PATHS = {
    # site category -> our business category (same category ids as the other Peekaboo portals)
    "/{city}/places/1/Food": "restaurant",
    "/{city}/places/18/Lifestyle": "lifestyle",
    "/{city}/places/10/Entertainment": "entertainment",
    "/{city}/places/28/Self Care": "self_care",
    "/{city}/places/22/Education": "education",
    "/{city}/places/27/Health": "health",
    "/{city}/places/23/Online Services": "online",
    "/{city}/places/29/Services": "services",
}
# Merchants in these categories are never food, so their pages are not opened.
SKIP_CATEGORIES = {"health", "self_care", "education", "online", "services"}
# offer category per business category
OFFER_CATEGORY = {"restaurant": "dining"}

# JSON the merchant detail page loads while rendering (substring of the request URL) — same as MCB/HBL.
DEALS_RESPONSE = "ksbolruuahrndcjchshjhejgj"
BRANCHES_RESPONSE = "kbprosamdmnioblcruahnhdcj"
MERCHANT_RESPONSE = "mklasjnkjsandnkajsdujasnd"

# This portal is slow: its place lists take ~20–30s to appear and "See More" is slow too.
LISTING_TIMEOUT_MS = 75_000
LOAD_MORE_WAIT_MS = 30_000
DETAIL_TIMEOUT_MS = 60_000

# Politeness / limits
DETAIL_PAGE_CONCURRENCY = 3
DELAY_BETWEEN_PAGES_MS = 500
MAX_MERCHANTS: int | None = None  # set e.g. 5 while developing
