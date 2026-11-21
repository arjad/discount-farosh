"""Standard Chartered Pakistan — URLs and constants for the standard_chartered scraper.

Not on Peekaboo. 'The Good Life' privileges is SC's own offers page (~153 offers),
so this bank needs its own custom scraper. Scraping is switched OFF for now (SCRAPE_ENABLED) —
only the URL is recorded.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "standard_chartered"
BANK_NAME = "Standard Chartered Pakistan"
BASE_URL = "https://www.sc.com/pk/promotions/the-good-life-privileges/"

DISCOUNTS_PATH = ""
DISCOUNTS_URL = BASE_URL

# Not scraped yet — kept out of "all" runs and Sync until a scraper for SC's own page is written.
SCRAPE_ENABLED = False
