"""JS Bank discounts scraper (jsb-web.peekaboo.guru).

Same Peekaboo Guru platform as MCB, HBL, Bank AL Habib, MCB Islamic, Faysal and Askari, so this reuses
the MCB scraper as-is: only the site constants (variables/js.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli js --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import js as js_vars


class JsBankScraper(McbScraper):
    slug = js_vars.BANK_SLUG
    name = js_vars.BANK_NAME
    base_url = js_vars.BASE_URL
    discounts_url = js_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = js_vars
    t = peekaboo_tags
