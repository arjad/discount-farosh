"""Bank Alfalah — URLs and constants for the alfalah scraper.

The deals portal is hosted by Peekaboo Guru and embedded on the bank's own site
(BANK_PAGE_URL). We scrape the Peekaboo portal directly.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "alfalah"
BANK_NAME = "Bank Alfalah"
BASE_URL = "https://alfalah-web-deals.peekaboo.guru"

DISCOUNTS_PATH = "/lahore/places/_all/all"
DISCOUNTS_URL = f"{BASE_URL}{DISCOUNTS_PATH}"

# The bank's own page where the Peekaboo portal is embedded (reference only)
BANK_PAGE_URL = "https://www.bankalfalah.com/conventional/discounts-privileges/"
