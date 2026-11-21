"""HBL (Habib Bank Limited) discounts scraper (hbl-web.peekaboo.guru).

HBL's deals site runs on the same Peekaboo Guru platform as MCB's, so this reuses the MCB
scraper as-is: only the site constants (variables/hbl.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli hbl --save            # full scrape, saves to Postgres
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import hbl as hbl_vars


class HblScraper(McbScraper):
    slug = hbl_vars.BANK_SLUG
    name = hbl_vars.BANK_NAME
    base_url = hbl_vars.BASE_URL
    discounts_url = hbl_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = hbl_vars
    t = peekaboo_tags
