"""Faysal Bank discounts scraper (faysalbank-web.peekaboo.guru).

Same Peekaboo Guru platform as MCB, HBL, Bank AL Habib and MCB Islamic, so this reuses the MCB
scraper as-is: only the site constants (variables/faysal.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli faysal --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import faysal as faysal_vars


class FaysalScraper(McbScraper):
    slug = faysal_vars.BANK_SLUG
    name = faysal_vars.BANK_NAME
    base_url = faysal_vars.BASE_URL
    discounts_url = faysal_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = faysal_vars
    t = peekaboo_tags
