"""Reusable async Playwright actions.

Every action takes a selector string from `tags/<bank>.py` and turns Playwright
timeouts into `TagNotFoundError` (selector, action, page URL, screenshot).
Pass `optional=True` when a missing element is fine — you get None/False back.
"""
import asyncio
import re
import time
from pathlib import Path

from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Locator, Page
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.core.config import get_settings
from app.public.bank_scrapers.common_methods.errors import NavigationError, TagNotFoundError


async def _screenshot(page: Page, label: str) -> str | None:
    settings = get_settings()
    if not settings.screenshot_on_failure:
        return None
    try:
        settings.failure_dir.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[^a-zA-Z0-9_.-]+", "_", label)[:60]
        host = re.sub(r"[^a-zA-Z0-9]+", "_", page.url.split("//")[-1].split("/")[0])
        path: Path = settings.failure_dir / f"{time.strftime('%Y%m%d-%H%M%S')}_{time.time_ns() % 10**6}_{host}_{safe}.png"
        # hard cap: a screenshot of a half-loaded page can otherwise hang for minutes
        await asyncio.wait_for(page.screenshot(path=str(path), full_page=True, timeout=10_000,
                                               animations="disabled"), 15)
        return str(path)
    except (PlaywrightError, asyncio.TimeoutError):
        return None


async def _fail(page: Page, selector: str, action: str, cause: Exception) -> TagNotFoundError:
    shot = await _screenshot(page, action)
    return TagNotFoundError(selector, action, page_url=page.url, screenshot=shot, cause=cause)


def _page(scope: Page | Locator) -> Page:
    return scope if isinstance(scope, Page) else scope.page


# ---------- navigation ----------

async def goto(page: Page, url: str, *, wait_until: str = "domcontentloaded") -> None:
    try:
        response = await page.goto(url, wait_until=wait_until)
    except (PlaywrightTimeoutError, PlaywrightError) as e:
        shot = await _screenshot(page, "goto")
        raise NavigationError(f"Could not open {url}: {e}", page_url=url, screenshot=shot) from e
    if response is not None and response.status >= 400:
        shot = await _screenshot(page, "goto_status")
        raise NavigationError(f"{url} returned HTTP {response.status}", page_url=url, screenshot=shot)


async def wait_for_network_idle(page: Page, timeout_ms: int = 10_000) -> None:
    """Best effort — many sites never go fully idle (analytics), so don't fail."""
    try:
        await page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightTimeoutError:
        pass


# ---------- waiting ----------

async def wait_for(page: Page, selector: str, *, state: str = "visible",
                   timeout_ms: int | None = None, optional: bool = False) -> Locator | None:
    loc = page.locator(selector).first
    try:
        await loc.wait_for(state=state, timeout=timeout_ms)
        return loc
    except PlaywrightTimeoutError as e:
        if optional:
            return None
        raise await _fail(page, selector, "wait_for", e) from e


async def exists(page: Page, selector: str, *, timeout_ms: int = 3_000) -> bool:
    try:
        await page.locator(selector).first.wait_for(state="attached", timeout=timeout_ms)
        return True
    except PlaywrightTimeoutError:
        return False


# ---------- interactions ----------

async def click(page: Page, selector: str, *, timeout_ms: int | None = None,
                force: bool = False, optional: bool = False) -> bool:
    try:
        await page.locator(selector).first.click(timeout=timeout_ms, force=force)
        return True
    except PlaywrightTimeoutError as e:
        if optional:
            return False
        raise await _fail(page, selector, "click", e) from e


async def input_text(page: Page, selector: str, value: str, *, clear: bool = True,
                     type_delay_ms: int = 0, timeout_ms: int | None = None) -> None:
    """Fill an input. Use type_delay_ms > 0 for sites that listen to keystrokes."""
    loc = page.locator(selector).first
    try:
        if clear:
            await loc.fill("", timeout=timeout_ms)
        if type_delay_ms:
            await loc.press_sequentially(value, delay=type_delay_ms, timeout=timeout_ms)
        else:
            await loc.fill(value, timeout=timeout_ms)
    except PlaywrightTimeoutError as e:
        raise await _fail(page, selector, "input_text", e) from e


async def press_enter(page: Page, selector: str | None = None, *, timeout_ms: int | None = None) -> None:
    """Press Enter on a selector, or on whatever is focused if none given."""
    if selector is None:
        await page.keyboard.press("Enter")
        return
    try:
        await page.locator(selector).first.press("Enter", timeout=timeout_ms)
    except PlaywrightTimeoutError as e:
        raise await _fail(page, selector, "press_enter", e) from e


async def select_option(page: Page, selector: str, value: str, *, timeout_ms: int | None = None) -> None:
    try:
        await page.locator(selector).first.select_option(value, timeout=timeout_ms)
    except PlaywrightTimeoutError as e:
        raise await _fail(page, selector, "select_option", e) from e


async def hover(page: Page, selector: str, *, timeout_ms: int | None = None) -> None:
    try:
        await page.locator(selector).first.hover(timeout=timeout_ms)
    except PlaywrightTimeoutError as e:
        raise await _fail(page, selector, "hover", e) from e


async def dismiss_if_present(page: Page, selector: str, *, timeout_ms: int = 3_000) -> bool:
    """Close cookie banners / popups if they show up. Never raises."""
    try:
        await page.locator(selector).first.click(timeout=timeout_ms)
        return True
    except (PlaywrightTimeoutError, PlaywrightError):
        return False


async def scroll_to_bottom(page: Page, *, max_rounds: int = 20, pause_ms: int = 800) -> None:
    """Scroll until page height stops growing (for lazy-loaded lists)."""
    last_height = 0
    for _ in range(max_rounds):
        height = await page.evaluate("document.body.scrollHeight")
        if height == last_height:
            break
        last_height = height
        await page.mouse.wheel(0, height)
        await page.wait_for_timeout(pause_ms)


async def click_load_more_until_gone(page: Page, selector: str, *, max_clicks: int = 30, pause_ms: int = 1_000,
                                     count_selector: str | None = None, stale_clicks: int = 2,
                                     wait_new_ms: int = 0) -> int:
    """Keep clicking a 'Load more' button until it disappears. Returns click count.

    If `count_selector` is given, also stop once `stale_clicks` clicks in a row add no new
    matches — some sites keep the button visible after everything has loaded.
    """
    clicks = stale = 0
    count = await page.locator(count_selector).count() if count_selector else 0
    for _ in range(max_clicks):
        if not await exists(page, selector, timeout_ms=2_000):
            break
        try:
            await page.locator(selector).first.click(timeout=3_000)
        except (PlaywrightTimeoutError, PlaywrightError):
            break
        clicks += 1
        await page.wait_for_timeout(pause_ms)
        if count_selector and wait_new_ms:  # slow sites: keep waiting (up to wait_new_ms) for the new items
            waited = 0
            while waited < wait_new_ms and await page.locator(count_selector).count() <= count:
                await page.wait_for_timeout(500)
                waited += 500
        if count_selector:
            new_count = await page.locator(count_selector).count()
            stale = stale + 1 if new_count <= count else 0
            count = new_count
            if stale >= stale_clicks:
                break
    return clicks


# ---------- reading ----------

async def get_all(page: Page, selector: str, *, wait: bool = True) -> list[Locator]:
    if wait:
        await wait_for(page, selector, state="attached")
    return await page.locator(selector).all()


async def get_text(scope: Page | Locator, selector: str, *, timeout_ms: int = 2_000,
                   optional: bool = False) -> str | None:
    """Text of the first match inside `scope` (a page or a card)."""
    try:
        text = await scope.locator(selector).first.inner_text(timeout=timeout_ms)
        return " ".join(text.split()) or None
    except PlaywrightTimeoutError as e:
        if optional:
            return None
        raise await _fail(_page(scope), selector, "get_text", e) from e


async def get_attribute(scope: Page | Locator, selector: str, attr: str, *, timeout_ms: int = 2_000,
                        optional: bool = False) -> str | None:
    try:
        return await scope.locator(selector).first.get_attribute(attr, timeout=timeout_ms)
    except PlaywrightTimeoutError as e:
        if optional:
            return None
        raise await _fail(_page(scope), selector, f"get_attribute:{attr}", e) from e


# ---------- reading data the page itself loads ----------

async def goto_and_capture(page: Page, url: str, responses: dict[str, str], *,
                           timeout_ms: int = 30_000, optional: set[str] | None = None) -> dict:
    """Open `url` like a visitor and return the JSON bodies the page loads while rendering.

    `responses` maps a name to a substring of the response URL, e.g.
    {"DEALS_RESPONSE": "ksbolruu..."}. If a required one never arrives the error
    names it, so you know which value in variables/<bank>.py to update.
    """
    optional = optional or set()
    captured: dict = {}

    async def on_response(resp) -> None:
        for name, marker in responses.items():
            if name not in captured and marker in resp.url:
                try:
                    captured[name] = await resp.json()
                except Exception:  # noqa: BLE001 — non-JSON or aborted
                    pass

    page.on("response", on_response)
    try:
        await goto(page, url, wait_until="domcontentloaded")
        deadline = time.monotonic() + timeout_ms / 1000
        required = set(responses) - optional
        while time.monotonic() < deadline and not required <= captured.keys():
            await page.wait_for_timeout(200)
        await wait_for_network_idle(page, timeout_ms=3_000)  # give optional ones a chance
    finally:
        page.remove_listener("response", on_response)

    missing = (set(responses) - optional) - captured.keys()
    if missing:
        shot = await _screenshot(page, "capture_" + "_".join(sorted(missing)))
        raise NavigationError(
            f"Expected data not loaded on {url}: {', '.join(sorted(missing))} "
            f"(markers: {', '.join(responses[m] for m in sorted(missing))}) — the site's API may have changed",
            page_url=url, screenshot=shot,
        )
    return captured
