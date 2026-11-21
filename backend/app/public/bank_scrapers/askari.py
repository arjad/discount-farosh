"""Askari Bank discounts scraper (askari-web.peekaboo.guru).

Same Peekaboo Guru platform as MCB, HBL, Bank AL Habib, MCB Islamic and Faysal, so this reuses the MCB
scraper as-is: only the site constants (variables/askari.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli askari --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import askari as askari_vars


class AskariScraper(McbScraper):
    slug = askari_vars.BANK_SLUG
    name = askari_vars.BANK_NAME
    base_url = askari_vars.BASE_URL
    discounts_url = askari_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = askari_vars
    t = peekaboo_tags
