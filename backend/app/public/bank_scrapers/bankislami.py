"""BankIslami discounts scraper — NOT IMPLEMENTED YET.

BankIslami doesn't use Peekaboo Guru: its card discounts are published as a standard PDF linked from
its card-discounts page (see variables/bankislami.py). A scraper for it will need to download the
current PDF every run and parse + clean the offers out of it. Until then scraping is switched off
(scrape_enabled = False), so Sync and "all" runs skip this bank; only its URL is recorded.
"""
from playwright.async_api import Page

from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods.errors import ScraperError
from app.public.bank_scrapers.variables import bankislami as v
from app.schemas import Offer


class BankIslamiScraper(BaseBankScraper):
    slug = v.BANK_SLUG
    name = v.BANK_NAME
    base_url = v.BASE_URL
    discounts_url = v.DISCOUNTS_URL
    scrape_enabled = v.SCRAPE_ENABLED  # off: PDF-based, no scraper yet

    async def scrape(self, page: Page) -> list[Offer]:
        # TODO: open discounts_url, find the PDF link, download it, parse + clean the offers.
        raise ScraperError("BankIslami publishes discounts as a PDF — PDF scraper not written yet", page_url=self.discounts_url)
