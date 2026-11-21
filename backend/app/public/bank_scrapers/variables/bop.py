"""Bank of Punjab (BOP) — URLs and constants for the bop scraper.

NOTE: Bank of Punjab's card discounts are NOT WORKING right now — the card discounts link on
BOP's website is broken (the page doesn't load / leads nowhere), so there is nothing to scrape.
Check the link again later; when BOP fixes it, set BASE_URL to the working discounts page,
find out whether it's a Peekaboo portal (then reuse the MCB scraper like HBL does), a PDF
(like BankIslami) or a normal web page, and switch SCRAPE_ENABLED on.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "bop"
BANK_NAME = "Bank of Punjab"
BASE_URL = "https://www.bop.com.pk/"  # bank home page — its card discounts link is currently broken

DISCOUNTS_PATH = ""
DISCOUNTS_URL = BASE_URL

# Not scraped — the card discounts link is broken. Kept out of "all" runs and Sync.
SCRAPE_ENABLED = False
