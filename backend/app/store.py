"""In-memory store of the latest scrape result per source.

Swap for a DB (Postgres/SQLite/Redis) later — keep the same interface.
"""
import asyncio

from app.schemas import ScrapeResult


class ResultStore:
    def __init__(self) -> None:
        self._results: dict[str, ScrapeResult] = {}
        self._running: set[str] = set()
        self._lock = asyncio.Lock()

    async def save(self, result: ScrapeResult) -> None:
        async with self._lock:
            self._results[f"{result.category}:{result.source}"] = result

    def get(self, category: str, source: str) -> ScrapeResult | None:
        return self._results.get(f"{category}:{source}")

    def all(self, category: str | None = None) -> list[ScrapeResult]:
        return [r for r in self._results.values() if category is None or r.category == category]

    def is_running(self, key: str) -> bool:
        return key in self._running

    def mark_running(self, key: str, running: bool) -> None:
        (self._running.add if running else self._running.discard)(key)

    @property
    def running(self) -> list[str]:
        return sorted(self._running)


result_store = ResultStore()
