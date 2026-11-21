"""HBL Islamic — URLs and constants for the hbl_islamic scraper.

The deals portal is hosted by Peekaboo Guru and embedded on the bank's own site
(BANK_PAGE_URL). We scrape the Peekaboo portal directly.
Change URLs here, never inside the scraper file.
"""

BANK_SLUG = "hbl_islamic"
BANK_NAME = "HBL Islamic"
BASE_URL = "https://hbl-islamic-web.peekaboo.guru"

DISCOUNTS_PATH = "/lahore/places/_all/all"
DISCOUNTS_URL = f"{BASE_URL}{DISCOUNTS_PATH}"

# The bank's own page where the Peekaboo portal is embedded (reference only)
BANK_PAGE_URL = "https://www.hbl.com/islamic/islamic-cards/hbl-islamic-deals-and-discounts"
