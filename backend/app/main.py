import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.browser import browser_manager
from app.core.config import get_settings
from app.isolated.routes import router as isolated_router
from app.public.auth import router as auth_router
from app.public.places import router as places_router
from app.public.profile import router as profile_router
from app.public.dashboard import router as dashboard_router
from app.public.routes import router as public_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # The scraping browser is NOT launched here — it starts on demand the first time a scrape runs
    # (browser_manager.new_context starts it). Launching Chromium on every (re)start used to hang the
    # dev server after code changes, leaving the dashboard with no results.
    yield
    # Never let a stuck browser block shutdown — with --reload that froze the whole dev server.
    try:
        await asyncio.wait_for(browser_manager.stop(), timeout=5)
    except Exception:  # noqa: BLE001
        logging.getLogger(__name__).warning("browser didn't close within 5s; continuing shutdown")


settings = get_settings()
app = FastAPI(title="Offerwala API", version="0.1.0", lifespan=lifespan)
# compress responses (the dashboard's offers list is ~1.9 MB as plain JSON, ~250 KB gzipped)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(places_router)
app.include_router(public_router)
app.include_router(dashboard_router)
app.include_router(isolated_router)
