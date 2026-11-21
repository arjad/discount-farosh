"""Allied Bank (ABL) discounts scraper (allied-web.peekaboo.guru).

Same Peekaboo Guru platform as the other Peekaboo banks, so this reuses the MCB scraper as-is:
only the site constants (variables/abl.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli abl --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import abl as abl_vars


class AlliedBankScraper(McbScraper):
    slug = abl_vars.BANK_SLUG
    name = abl_vars.BANK_NAME
    base_url = abl_vars.BASE_URL
    discounts_url = abl_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = abl_vars
    t = peekaboo_tags
