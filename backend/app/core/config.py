from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_env: str = "development"
    isolated_api_key: str = "change-me"
    # Google Places API (New) — address search on the dashboard. Kept on the server only.
    google_maps_api_key: str | None = None
    # Browser key for the interactive map (Maps JavaScript API). This one IS sent to the browser, so make
    # it a separate key restricted to your site's domain (HTTP referrers) and to Maps JavaScript API only.
    google_maps_browser_key: str | None = None
    cors_origins: str = "http://localhost:5173"
    database_url: str = "postgresql+asyncpg://offerwala:change-me@localhost:5432/offerwala"
    db_echo: bool = False

    # Playwright
    headless: bool = True
    slow_mo_ms: int = 0
    default_timeout_ms: int = 15_000
    navigation_timeout_ms: int = 45_000
    max_concurrent_scrapes: int = 3
    screenshot_on_failure: bool = True
    failure_dir: Path = BASE_DIR / "artifacts" / "failures"
    # Optional proxy (e.g. an Indian IP — bank sites geo-block foreign traffic)
    proxy_server: str | None = None  # e.g. http://in.proxy.example:8080
    proxy_username: str | None = None
    proxy_password: str | None = None

    @property
    def proxy(self) -> dict | None:
        if not self.proxy_server:
            return None
        cfg = {"server": self.proxy_server}
        if self.proxy_username:
            cfg |= {"username": self.proxy_username, "password": self.proxy_password or ""}
        return cfg

    # Allow `headed=true` on scrape endpoints (opens a browser window on the server machine)
    allow_headed_scrapes: bool | None = None  # default: only when APP_ENV=development

    @property
    def headed_allowed(self) -> bool:
        return self.allow_headed_scrapes if self.allow_headed_scrapes is not None else self.app_env == "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
