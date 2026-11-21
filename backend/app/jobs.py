"""Background scrape jobs (in memory). Each job runs one or more scrapers and saves results to Postgres."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field

from app.db.repository import save_scrape_result
from app.db.session import SessionLocal
from app.store import result_store

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class JobScraperResult(BaseModel):
    type: str
    slug: str
    name: str
    status: str = "pending"  # pending | running | success | failed | skipped
    offers: int = 0
    saved: int = 0
    error: str | None = None
    failed_tag: str | None = None
    screenshot: str | None = None
    duration_s: float | None = None


class ScrapeJob(BaseModel):
    id: str
    status: JobStatus = JobStatus.queued
    headed: bool = False
    save: bool = True
    limit: int | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: datetime | None = None
    scrapers: list[JobScraperResult]


_jobs: dict[str, ScrapeJob] = {}
_tasks: set[asyncio.Task] = set()


def get_job(job_id: str) -> ScrapeJob | None:
    return _jobs.get(job_id)


def list_jobs(limit: int = 20) -> list[ScrapeJob]:
    return sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)[:limit]


def start_job(targets: list[tuple[str, str, type]], *, headed: bool, save: bool,
              limit: int | None, slow_mo_ms: int | None) -> ScrapeJob:
    job = ScrapeJob(
        id=uuid.uuid4().hex[:12], headed=headed, save=save, limit=limit,
        scrapers=[JobScraperResult(type=t, slug=s, name=getattr(c, "name", s)) for t, s, c in targets],
    )
    _jobs[job.id] = job
    task = asyncio.create_task(_run(job, targets, slow_mo_ms))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return job


async def _run_one(job: ScrapeJob, entry: JobScraperResult, cls: type, slow_mo_ms: int | None) -> None:
    key = f"{entry.type}:{entry.slug}"
    if result_store.is_running(key):
        entry.status, entry.error = "skipped", "already running in another job"
        return
    result_store.mark_running(key, True)
    entry.status = "running"
    try:
        scraper = cls()
        result = await scraper.run(headed=job.headed, slow_mo_ms=slow_mo_ms, limit=job.limit)
        await result_store.save(result)
        entry.status = result.status.value
        entry.offers = len(result.offers)
        entry.duration_s = round(result.duration_s, 1)
        if result.error:
            entry.error, entry.failed_tag, entry.screenshot = result.error.message, result.error.tag_name, result.error.screenshot
        if job.save:
            async with SessionLocal() as session:
                entry.saved = await save_scrape_result(session, scraper, result, partial=job.limit is not None)
    except Exception as e:  # noqa: BLE001
        logger.exception("job %s: %s crashed", job.id, key)
        entry.status, entry.error = "failed", f"{type(e).__name__}: {e}"
    finally:
        result_store.mark_running(key, False)


async def _run(job: ScrapeJob, targets: list[tuple[str, str, type]], slow_mo_ms: int | None) -> None:
    job.status = JobStatus.running
    entries = {(e.type, e.slug): e for e in job.scrapers}
    # concurrency is bounded by MAX_CONCURRENT_SCRAPES inside the browser manager
    await asyncio.gather(*(_run_one(job, entries[(t, s)], c, slow_mo_ms) for t, s, c in targets))
    job.finished_at = datetime.now(timezone.utc)
    job.status = JobStatus.done if any(e.status == "success" for e in job.scrapers) else JobStatus.failed
    logger.info("job %s finished: %s", job.id, [(e.slug, e.status, e.offers) for e in job.scrapers])
