"""BaseBankScraper — handles browser context, timing, and error reporting.

A bank scraper only needs to implement `scrape(page) -> list[Offer]`.
"""
import logging
from abc import ABC, abstractmethod
from types import ModuleType
from datetime import datetime, timezone
from urllib.parse import urljoin

from playwright.async_api import Locator, Page

from app.core.browser import browser_manager
from app.public.bank_scrapers.common_methods import actions
from app.public.bank_scrapers.common_methods.errors import NoOffersFoundError, ScraperError, TagNotFoundError
from app.public.bank_scrapers.common_methods.food import keep_food
from app.schemas import Offer, ScrapeErrorDetail, ScrapeResult, ScrapeStatus

logger = logging.getLogger(__name__)


class BaseBankScraper(ABC):
    category = "bank"
    slug: str
    name: str
    base_url: str
    discounts_url: str | None = None
    # False = keep the bank (and its URLs) in the list but never scrape it in "all"/Sync runs
    scrape_enabled: bool = True
    tags: ModuleType | None = None  # the bank's tags module, used to name failing selectors

    @abstractmethod
    async def scrape(self, page: Page) -> list[Offer]:
        """Navigate and return offers. Use `actions.*` with Tags from `tags/<bank>.py`."""

    limit: int | None = None  # max items (e.g. merchants) to scrape — handy while developing

    async def run(self, *, headed: bool = False, slow_mo_ms: int | None = None,
                  limit: int | None = None) -> ScrapeResult:
        """headed=True opens a visible browser window so you can watch the scrape."""
        self.limit = limit
        started = datetime.now(timezone.utc)
        try:
            async with browser_manager.new_context(headed=headed, slow_mo_ms=slow_mo_ms) as context:
                page = await context.new_page()
                offers = await self.scrape(page)
                if not offers:
                    raise NoOffersFoundError(f"{self.slug}: page loaded but 0 offers extracted", page_url=page.url)
            # food only — restaurants, cafés etc. Health, shopping, e-commerce... are dropped here.
            offers, dropped = keep_food(offers)
            logger.info("%s: scraped %d food offers (%d non-food dropped)", self.slug, len(offers), dropped)
            return self._result(started, ScrapeStatus.success, offers=offers)
        except TagNotFoundError as e:
            tag_name = self.tag_name_for(e.selector)
            message = f"{tag_name}: {e.message}" if tag_name else e.message
            logger.warning("%s: %s", self.slug, message)
            return self._result(started, ScrapeStatus.failed, error=ScrapeErrorDetail(
                kind=e.kind, message=message, tag_name=tag_name, selector=e.selector,
                action=e.action, page_url=e.page_url, screenshot=e.screenshot,
            ))
        except ScraperError as e:
            logger.warning("%s: %s", self.slug, e.message)
            return self._result(started, ScrapeStatus.failed, error=ScrapeErrorDetail(
                kind=e.kind, message=e.message, page_url=e.page_url, screenshot=e.screenshot,
            ))
        except Exception as e:  # noqa: BLE001 — never let one bank crash the batch
            logger.exception("%s: unexpected error", self.slug)
            return self._result(started, ScrapeStatus.failed, error=ScrapeErrorDetail(
                kind="unexpected", message=f"{type(e).__name__}: {e}",
            ))

    def _result(self, started: datetime, status: ScrapeStatus, *, offers: list[Offer] | None = None,
                error: ScrapeErrorDetail | None = None) -> ScrapeResult:
        return ScrapeResult(
            source=self.slug, category=self.category, status=status, offers=offers or [],
            error=error, started_at=started, finished_at=datetime.now(timezone.utc),
        )

    # ---------- helpers shared by bank scrapers ----------

    async def extract_card(
        self,
        card: Locator,
        *,
        title: str,
        description: str | None = None,
        link: str | None = None,
        image: str | None = None,
        validity: str | None = None,
    ) -> Offer | None:
        """Pull common offer fields out of one card. Title is required; the rest are optional."""
        title_text = await actions.get_text(card, title)
        if not title_text:
            return None
        href = await actions.get_attribute(card, link, "href", optional=True) if link else None
        src = await actions.get_attribute(card, image, "src", optional=True) if image else None
        return Offer(
            source=self.slug,
            title=title_text,
            description=await actions.get_text(card, description, optional=True) if description else None,
            url=self.absolute(href),
            image_url=self.absolute(src),
            valid_till=await actions.get_text(card, validity, optional=True) if validity else None,
        )

    def tag_name_for(self, selector: str) -> str | None:
        """Find the variable name in tags/<bank>.py that holds this selector, e.g. 'meezan.OFFER_CARD'."""
        if not self.tags:
            return None
        for name, value in vars(self.tags).items():
            if name.isupper() and value == selector:
                return f"{self.slug}.{name}"
        return None

    def absolute(self, url: str | None) -> str | None:
        return urljoin(self.base_url, url) if url else None
