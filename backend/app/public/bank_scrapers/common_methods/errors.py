class ScraperError(Exception):
    """Base error for all scraper failures."""

    kind = "scraper_error"

    def __init__(self, message: str, *, page_url: str | None = None, screenshot: str | None = None):
        super().__init__(message)
        self.message = message
        self.page_url = page_url
        self.screenshot = screenshot


class TagNotFoundError(ScraperError):
    """A selector didn't match / wasn't actionable — the site probably changed."""

    kind = "tag_not_found"

    def __init__(self, selector: str, action: str, *, page_url: str | None = None,
                 screenshot: str | None = None, cause: Exception | None = None):
        msg = f"[{action}] selector not found or not actionable: {selector!r} url={page_url}"
        if cause:
            msg += f" | cause: {type(cause).__name__}: {str(cause).splitlines()[0]}"
        super().__init__(msg, page_url=page_url, screenshot=screenshot)
        self.selector = selector
        self.action = action
        self.tag_name: str | None = None  # filled in by BaseBankScraper from tags/<bank>.py


class NavigationError(ScraperError):
    kind = "navigation_failed"


class NoOffersFoundError(ScraperError):
    """Page loaded and selectors matched, but nothing was extracted."""

    kind = "no_offers_found"
