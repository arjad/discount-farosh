"""Meezan Bank discounts scraper (meezan-web.peekaboo.guru).

Same Peekaboo Guru platform as the other Peekaboo banks, so this reuses the MCB scraper as-is:
only the site constants (variables/meezan.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli meezan --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import meezan as meezan_vars


class MeezanScraper(McbScraper):
    slug = meezan_vars.BANK_SLUG
    name = meezan_vars.BANK_NAME
    base_url = meezan_vars.BASE_URL
    discounts_url = meezan_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = meezan_vars
    t = peekaboo_tags
