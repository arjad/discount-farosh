"""Al Baraka Bank discounts scraper (albaraka-web.peekaboo.guru).

Same Peekaboo Guru platform as the other Peekaboo banks, so this reuses the MCB scraper as-is:
only the site constants (variables/al_baraka.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli al_baraka --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import al_baraka as albaraka_vars


class AlBarakaScraper(McbScraper):
    slug = albaraka_vars.BANK_SLUG
    name = albaraka_vars.BANK_NAME
    base_url = albaraka_vars.BASE_URL
    discounts_url = albaraka_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = albaraka_vars
    t = peekaboo_tags
