"""Address lookup with OpenStreetMap Nominatim — free, no API key.

  GET /api/geo/search?q=293B New Chuburji Park, Lahore   -> places matching a typed address (submit only, no autocomplete)
  GET /api/geo/reverse?lat=31.55&lng=74.30                -> readable address at a point
  GET /api/geo/places?q=dha ph                            -> Lahore areas / societies as you type (local list,
                                                             no Nominatim call — see lahore_places.py)

Why through the backend (and not straight from the browser):
  * Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/) requires an
    identifying User-Agent — browsers can't set one;
  * max 1 request per second for the whole app — enforced here with a lock, across all users;
  * results must be cached — repeated lookups are answered from memory (24 h);
  * no autocomplete against the public server — the frontend only calls /search when the user submits.
Set NOMINATIM_USER_AGENT (with a contact URL or email) and optionally NOMINATIM_EMAIL in backend/.env.
"""
import asyncio
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.http import SSL_CONTEXT
from app.public import lahore_places

router = APIRouter(prefix="/api/geo", tags=["geo"])

NOMINATIM = "https://nominatim.openstreetmap.org"
CACHE_TTL_S = 24 * 3600
CACHE_MAX = 2000

_lock = asyncio.Lock()          # one request at a time…
_last_call = 0.0                # …and at least 1 s apart
_cache: "OrderedDict[str, tuple[float, object]]" = OrderedDict()


class Address(BaseModel):
    address: str                    # full readable address (display_name)
    house_number: str | None = None
    street: str | None = None
    area: str | None = None         # neighbourhood / suburb, e.g. "Chauburji"
    city: str | None = None
    lat: float
    lng: float


def _to_address(r: dict) -> Address:
    a = r.get("address") or {}
    return Address(
        address=r.get("display_name", ""),
        house_number=a.get("house_number") or a.get("house_name"),
        street=a.get("road") or a.get("pedestrian") or a.get("residential"),
        area=a.get("neighbourhood") or a.get("suburb") or a.get("quarter") or a.get("city_district"),
        city=a.get("city") or a.get("town") or a.get("village") or a.get("county"),
        lat=float(r["lat"]), lng=float(r["lon"]),
    )


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_S:
        _cache.move_to_end(key)
        return hit[1]
    _cache.pop(key, None)
    return None


def _cache_put(key: str, value) -> None:
    _cache[key] = (time.time(), value)
    _cache.move_to_end(key)
    while len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)


def _fetch(path: str, params: dict) -> object:
    s = get_settings()
    q = {**params, "format": "jsonv2", "addressdetails": 1, "accept-language": "en"}
    if s.nominatim_email:
        q["email"] = s.nominatim_email
    req = urllib.request.Request(f"{NOMINATIM}{path}?{urllib.parse.urlencode(q)}",
                                 headers={"User-Agent": s.nominatim_user_agent, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10, context=SSL_CONTEXT) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Address lookup is busy — try again in a moment.") from None
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Address lookup failed ({e.code}).") from None
    except (urllib.error.URLError, TimeoutError):
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Couldn't reach the address service. Try again.") from None


async def _nominatim(path: str, params: dict, cache_key: str) -> object:
    global _last_call
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached
    async with _lock:
        cached = _cache_get(cache_key)  # another request may have filled it while we waited
        if cached is not None:
            return cached
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            data = await asyncio.to_thread(_fetch, path, params)
        finally:
            _last_call = time.monotonic()
    _cache_put(cache_key, data)
    return data


def _local(q: str, limit: int = 5) -> list[Address]:
    """Matches from our Lahore areas list, as Address rows."""
    return [Address(address=", ".join(x for x in (p["name"], p.get("area"), "Lahore") if x), area=p["name"],
                    city="Lahore", lat=p["lat"], lng=p["lng"]) for p in lahore_places.search(q, limit)]


def _near(a: Address, b: Address, m: float = 150) -> bool:
    return abs(a.lat - b.lat) * 111_000 < m and abs(a.lng - b.lng) * 95_000 < m


class PlaceHit(BaseModel):
    name: str
    area: str | None = None
    address: str
    lat: float
    lng: float


@router.get("/places", response_model=list[PlaceHit])
async def places(q: str = Query(min_length=1, max_length=100)) -> list[PlaceHit]:
    """Lahore areas & housing societies matching what's typed so far. Local list only — safe to call on
    every keystroke (it never reaches Nominatim)."""
    return [PlaceHit(**p) for p in lahore_places.search(q, 8)]


@router.get("/search", response_model=list[Address])
async def search(q: str = Query(min_length=3, max_length=200)) -> list[Address]:
    """Coordinates for a typed address. Call on submit only — never per keystroke.
    Lahore comes first: our Lahore areas list, then Nominatim limited to Lahore, and only if that finds
    nothing, the rest of Pakistan ("DHA Phase 8" -> Lahore's, not Karachi's)."""
    local = _local(q)
    # Nominatim has no fuzzy matching and few house numbers in Pakistan: if "293B New Chuburji Park, Lahore"
    # finds nothing, retry with less detail ("New Chuburji Park, Lahore" -> "Lahore") — at most 2 retries,
    # still one request per second and cached.
    parts = [p.strip() for p in q.split(",") if p.strip()]
    tries = [", ".join(parts[i:]) for i in range(min(3, len(parts)))] or [q]
    found: list[Address] = []
    for bounded in (True, False):
        for attempt in tries:
            key = ("sl:" if bounded else "s:") + " ".join(attempt.lower().split())
            params = {"q": attempt, "limit": 5, "countrycodes": "pk"}
            if bounded:
                params |= {"viewbox": lahore_places.VIEWBOX, "bounded": 1}
            data = await _nominatim("/search", params, key)
            found = [_to_address(r) for r in (data or []) if isinstance(r, dict) and "lat" in r]
            if found:
                break
        if found or local:  # have Lahore results (ours or Nominatim's) -> don't look outside Lahore
            break
    out = list(local)
    for a in found:
        if not any(_near(a, b) for b in out):
            out.append(a)
    return out[:8]


@router.get("/reverse", response_model=Address)
async def reverse(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)) -> Address:
    """Readable address at a point (call after the marker stops moving)."""
    key = f"r:{lat:.5f},{lng:.5f}"  # ~1 m — nearby repeats come from the cache
    data = await _nominatim("/reverse", {"lat": f"{lat:.6f}", "lon": f"{lng:.6f}", "zoom": 18}, key)
    if not isinstance(data, dict) or "lat" not in data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No address found at that point.")
    return _to_address(data).model_copy(update={"lat": lat, "lng": lng})  # keep the exact chosen point
