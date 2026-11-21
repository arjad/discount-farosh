"""Silkbank — URLs and constants for the silk scraper.

NOTE: Silkbank's card discounts are currently NOT WORKING — the URL for the discount section on
Silkbank's website is broken (the page doesn't load), so there is nothing to scrape.
Check the link again later; when Silkbank fixes it, set BASE_URL to the working discounts page,
find out whether it's a Peekaboo portal (then reuse the MCB scraper like HBL does), Vouch365
(like Dubai Islamic Bank), a PDF (like BankIslami) or a normal web page, and switch SCRAPE_ENABLED on.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "silk"
BANK_NAME = "Silkbank"
BASE_URL = "https://www.silkbank.com.pk/"  # bank home page — its discount section URL is currently broken

DISCOUNTS_PATH = ""
DISCOUNTS_URL = BASE_URL

# Not scraped — the discount section URL is broken. Kept out of "all" runs and Sync.
SCRAPE_ENABLED = False
