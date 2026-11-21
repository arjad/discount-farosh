"""MCB Islamic discounts scraper (mcb-islamic-web.peekaboo.guru).

Same Peekaboo Guru platform as MCB, HBL and Bank AL Habib, so this reuses the MCB scraper as-is:
only the site constants (variables/mcb_islamic.py) differ. Selectors are shared.

Run it directly, from the backend folder:
  python -m app.cli mcb_islamic --save
"""
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.tags import mcb as peekaboo_tags
from app.public.bank_scrapers.variables import mcb_islamic as mcbi_vars


class McbIslamicScraper(McbScraper):
    slug = mcbi_vars.BANK_SLUG
    name = mcbi_vars.BANK_NAME
    base_url = mcbi_vars.BASE_URL
    discounts_url = mcbi_vars.DISCOUNTS_URL
    tags = peekaboo_tags
    v = mcbi_vars
    t = peekaboo_tags
