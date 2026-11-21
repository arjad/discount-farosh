"""Every scraper in the app, grouped by type. The scrape endpoint and CLI resolve names here."""
from app.public.bank_scrapers import BANKS
from app.public.other_scrapers import OTHERS
from app.public.restaurant_scrapers import RESTAURANTS

SCRAPERS: dict[str, dict] = {
    "bank": BANKS,
    "restaurant": RESTAURANTS,
    "other": OTHERS,
}
SCRAPER_TYPES = list(SCRAPERS)


def _norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


def resolve(scraper_type: str = "all", name: str | None = None) -> list[tuple[str, str, type]]:
    """Return [(type, slug, class)] matching the request.

    name matches a slug or display name, loosely: "mcb", "MCB Bank", "mcb-bank" all hit `mcb`.
    Raises KeyError with the available choices when nothing matches.
    """
    types = SCRAPER_TYPES if scraper_type == "all" else [scraper_type]
    if scraper_type != "all" and scraper_type not in SCRAPERS:
        raise KeyError(f"Unknown type '{scraper_type}'. Use one of: all, {', '.join(SCRAPER_TYPES)}")

    found = [(t, slug, cls) for t in types for slug, cls in SCRAPERS[t].items()
             if name or getattr(cls, "scrape_enabled", True)]  # "all" skips banks switched off
    if name:
        n = _norm(name)
        exact = [f for f in found if n in (_norm(f[1]), _norm(getattr(f[2], "name", "")))]
        found = exact or [f for f in found if _norm(f[1]).startswith(n)]
        if not found:
            available = ", ".join(f"{t}:{s}" for t in types for s in SCRAPERS[t])
            raise KeyError(f"No scraper named '{name}'. Available: {available or 'none'}")
        if len(found) > 1 and not exact:
            raise KeyError(f"'{name}' is ambiguous: {', '.join(s for _, s, _ in found)}")
    return found
