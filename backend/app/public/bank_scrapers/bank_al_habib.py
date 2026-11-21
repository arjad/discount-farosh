"""Bank AL Habib discounts scraper (bahl-web.peekaboo.guru).

Same Peekaboo Guru platform as MCB and HBL, so this reuses the MCB scraper as-is:
only the site constants (variables/bank_al_habib.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli bank_al_habib --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import bank_al_habib as bahl_vars


class BankAlHabibScraper(McbScraper):
    slug = bahl_vars.BANK_SLUG
    name = bahl_vars.BANK_NAME
    base_url = bahl_vars.BASE_URL
    discounts_url = bahl_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = bahl_vars
    t = peekaboo_tags
