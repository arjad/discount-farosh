"""Single shared async Playwright browser for the whole app.

Each scrape gets its own BrowserContext (isolated cookies/storage), so scrapers
never leak state into each other.
"""
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright

from app.core.config import get_settings

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


class BrowserManager:
    def __init__(self) -> None:
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._semaphore: asyncio.Semaphore | None = None
        self._lock = asyncio.Lock()

    async def start(self, headless: bool | None = None) -> None:
        async with self._lock:
            if self._browser:
                return
            settings = get_settings()
            self._semaphore = asyncio.Semaphore(settings.max_concurrent_scrapes)
            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                headless=settings.headless if headless is None else headless,
                slow_mo=settings.slow_mo_ms,
                proxy=settings.proxy,
            )

    async def stop(self) -> None:
        async with self._lock:
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
            self._browser = None
            self._playwright = None

    @asynccontextmanager
    async def new_context(self, *, headed: bool = False, slow_mo_ms: int | None = None,
                          **kwargs) -> AsyncIterator[BrowserContext]:
        """Isolated context on the shared headless browser.

        headed=True launches a separate, visible Chromium window for this run only
        (so you can watch a scraper) and closes it when the run ends.
        """
        if not self._browser or not self._semaphore or not self._playwright:
            await self.start()
        assert self._browser and self._semaphore and self._playwright
        settings = get_settings()
        async with self._semaphore:
            own_browser: Browser | None = None
            browser = self._browser
            if headed:
                own_browser = browser = await self._playwright.chromium.launch(
                    headless=False, slow_mo=slow_mo_ms if slow_mo_ms is not None else settings.slow_mo_ms,
                    proxy=settings.proxy,
                )
            context = await browser.new_context(
                user_agent=kwargs.pop("user_agent", DEFAULT_USER_AGENT),
                locale=kwargs.pop("locale", "en-PK"),
                viewport=kwargs.pop("viewport", {"width": 1366, "height": 900}),
                **kwargs,
            )
            context.set_default_timeout(settings.default_timeout_ms)
            context.set_default_navigation_timeout(settings.navigation_timeout_ms)
            try:
                yield context
            finally:
                await context.close()
                if own_browser:
                    await own_browser.close()


browser_manager = BrowserManager()
