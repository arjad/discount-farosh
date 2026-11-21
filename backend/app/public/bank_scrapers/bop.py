"""Bank of Punjab (BOP) discounts scraper — NOT WORKING.

BOP's card discounts link is broken, so there is nothing to scrape yet (see variables/bop.py).
Scraping is switched off (scrape_enabled = False), so Sync and "all" runs skip this bank.
"""
from playwright.async_api import Page

from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods.errors import ScraperError
from app.public.bank_scrapers.variables import bop as v
from app.schemas import Offer


class BankOfPunjabScraper(BaseBankScraper):
    slug = v.BANK_SLUG
    name = v.BANK_NAME
    base_url = v.BASE_URL
    discounts_url = v.DISCOUNTS_URL
    scrape_enabled = v.SCRAPE_ENABLED  # off: card discounts link is broken

    async def scrape(self, page: Page) -> list[Offer]:
        raise ScraperError("Bank of Punjab's card discounts link is broken — nothing to scrape", page_url=self.discounts_url)
