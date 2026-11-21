"""Silkbank discounts scraper — NOT WORKING.

Silkbank's discount section URL is broken, so there is nothing to scrape yet (see variables/silk.py).
Scraping is switched off (scrape_enabled = False), so Sync and "all" runs skip this bank.
"""
from playwright.async_api import Page

from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods.errors import ScraperError
from app.public.bank_scrapers.variables import silk as v
from app.schemas import Offer


class SilkbankScraper(BaseBankScraper):
    slug = v.BANK_SLUG
    name = v.BANK_NAME
    base_url = v.BASE_URL
    discounts_url = v.DISCOUNTS_URL
    scrape_enabled = v.SCRAPE_ENABLED  # off: discount section URL is broken

    async def scrape(self, page: Page) -> list[Offer]:
        raise ScraperError("Silkbank's discount section URL is broken — nothing to scrape", page_url=self.discounts_url)
