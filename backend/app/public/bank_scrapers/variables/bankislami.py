"""BankIslami — URLs and constants for the bankislami scraper.

NOTE: BankIslami does NOT use Peekaboo Guru (unlike MCB, HBL, Askari…). It publishes its card
discounts as a standard PDF linked from the page below. To scrape it we always have to:
  1. open BASE_URL and find the current discounts PDF link (the file name changes with each update),
  2. download that PDF,
  3. extract the merchants / discounts / cards / validity from the PDF text and fix them up
     (PDF tables come out messy — merchant names, % values and card tiers need cleaning)
     before saving them as offers.
Not scraped yet — SCRAPE_ENABLED is off, so "all" runs and Sync skip it. Only the URL is recorded.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "bankislami"
BANK_NAME = "BankIslami"
BASE_URL = "https://bankislami.com.pk/digital-channel/card-discounts/"

DISCOUNTS_PATH = ""
DISCOUNTS_URL = BASE_URL  # the page that links to the discounts PDF

# Not scraped yet (PDF-based) — kept out of "all" runs and Sync until a PDF scraper is written.
SCRAPE_ENABLED = False
