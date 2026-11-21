"""All Google Maps calls, in one place. The server key never reaches the browser.

  GET /api/places/status                          -> what's set up (search, geocoding, interactive map)
  GET /api/places/config                          -> browser key for the interactive map (referrer-restricted key)
  GET /api/places/autocomplete?q=gulberg&lat=31.5&lng=74.3&session=<uuid>
  GET /api/places/reverse?lat=31.55&lng=74.30      -> exact address (house number, street, area) at a point
  GET /api/places/geocode?q=12 Lake Road, Chauburji, Lahore -> point + address for a typed address
  GET /api/places/{place_id}?session=<uuid>      -> exact address + coordinates

Setup (backend/.env):
  GOOGLE_MAPS_API_KEY       server key — enable "Places API (New)" and "Geocoding API"; restrict it to those APIs
                            (and to your server's IP in production)
  GOOGLE_MAPS_BROWSER_KEY   browser key — enable "Maps JavaScript API"; restrict it to your site's domain

Setup: put GOOGLE_MAPS_API_KEY=... in backend/.env. In Google Cloud enable "Places API (New)" for
that key, and restrict the key to that API (and to your server's IP in production).
`session` groups one search's keystrokes + the final details call so Google bills it as one session.
"""
import asyncio
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(prefix="/api/places", tags=["places"])

BASE = "https://places.googleapis.com/v1"
_PLACE_ID = re.compile(r"^[A-Za-z0-9_-]{10,300}$")


class Suggestion(BaseModel):
    place_id: str
    main: str
    secondary: str | None = None


class PlaceDetails(BaseModel):
    place_id: str
    name: str | None = None
    address: str
    short_address: str | None = None
    lat: float
    lng: float


def _key() -> str:
    key = get_settings().google_maps_api_key
    if not key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Address search isn't set up yet (GOOGLE_MAPS_API_KEY is missing).")
    return key


def _call(method: str, url: str, headers: dict[str, str], body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={**headers, **({"Content-Type": "application/json"} if data else {})})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", {}).get("message", "")
        except Exception:  # noqa: BLE001
            msg = ""
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Google address search failed ({e.code}). {msg}".strip()) from None
    except (urllib.error.URLError, TimeoutError):
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Couldn't reach Google address search. Try again.") from None


@router.get("/status")
async def places_status() -> dict[str, bool]:
    """Lets the page know what's available: address search/geocoding (server key) and the map (browser key)."""
    s = get_settings()
    return {"enabled": bool(s.google_maps_api_key), "map": bool(s.google_maps_browser_key)}


@router.get("/config")
async def places_config() -> dict[str, str | None]:
    """Browser key for the interactive map. Only the separate, referrer-restricted browser key is returned."""
    return {"browser_key": get_settings().google_maps_browser_key or None}


class Address(BaseModel):
    address: str                    # full formatted address
    house_number: str | None = None  # street_number / premise
    street: str | None = None        # route
    area: str | None = None          # neighbourhood / sublocality, e.g. "Chauburji"
    city: str | None = None
    lat: float
    lng: float


def _address(result: dict) -> Address:
    comps = result.get("address_components") or []

    def get(*types: str) -> str | None:
        for t in types:
            for c in comps:
                if t in c.get("types", []):
                    return c.get("long_name")
        return None

    loc = (result.get("geometry") or {}).get("location") or {}
    return Address(
        address=result.get("formatted_address", ""),
        house_number=get("street_number", "premise", "subpremise"),
        street=get("route"),
        area=get("neighborhood", "sublocality_level_2", "sublocality_level_1", "sublocality"),
        city=get("locality", "administrative_area_level_2"),
        lat=loc.get("lat"), lng=loc.get("lng"),
    )


def _geocode(params: dict) -> list[dict]:
    url = "https://maps.googleapis.com/maps/api/geocode/json?" + urllib.parse.urlencode({**params, "key": _key()})
    data = _call("GET", url, {})
    status_ = data.get("status")
    if status_ == "ZERO_RESULTS":
        return []
    if status_ != "OK":
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            f"Google geocoding failed ({status_}). {data.get('error_message', '')}".strip())
    return data.get("results") or []


@router.get("/reverse", response_model=Address)
async def reverse_geocode(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)) -> Address:
    """Exact street address at a point (most precise result first: house / street address)."""
    results = await asyncio.to_thread(_geocode, {"latlng": f"{lat},{lng}", "language": "en"})
    if not results:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No address found at that point.")
    best = next((r for r in results if {"street_address", "premise", "subpremise"} & set(r.get("types", []))), results[0])
    a = _address(best)
    return a.model_copy(update={"lat": lat, "lng": lng})  # keep the exact point the user chose


@router.get("/geocode", response_model=list[Address])
async def geocode(q: str = Query(min_length=3, max_length=300)) -> list[Address]:
    """Turn a typed address ("House 12, Lake Road, Chauburji, Lahore") into points on the map."""
    results = await asyncio.to_thread(_geocode, {"address": q, "region": "pk", "language": "en"})
    return [_address(r) for r in results[:5]]


@router.get("/autocomplete", response_model=list[Suggestion])
async def autocomplete(
    q: str = Query(min_length=2, max_length=200),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    session: str | None = Query(default=None, max_length=100),
) -> list[Suggestion]:
    body: dict = {"input": q, "includedRegionCodes": ["pk"], "languageCode": "en"}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 50000.0}}
    if session:
        body["sessionToken"] = session
    data = await asyncio.to_thread(_call, "POST", f"{BASE}/places:autocomplete", {"X-Goog-Api-Key": _key()}, body)
    out = []
    for s in data.get("suggestions", []):
        p = s.get("placePrediction")
        if not p or not p.get("placeId"):
            continue
        fmt = p.get("structuredFormat") or {}
        out.append(Suggestion(
            place_id=p["placeId"],
            main=(fmt.get("mainText") or {}).get("text") or (p.get("text") or {}).get("text", ""),
            secondary=(fmt.get("secondaryText") or {}).get("text"),
        ))
    return out


@router.get("/{place_id}", response_model=PlaceDetails)
async def place_details(place_id: str, session: str | None = Query(default=None, max_length=100)) -> PlaceDetails:
    if not _PLACE_ID.match(place_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid place id.")
    url = f"{BASE}/places/{place_id}"
    if session:
        url += "?" + urllib.parse.urlencode({"sessionToken": session})
    data = await asyncio.to_thread(_call, "GET", url, {
        "X-Goog-Api-Key": _key(),
        "X-Goog-FieldMask": "id,displayName,formattedAddress,shortFormattedAddress,location",
    })
    loc = data.get("location") or {}
    if "latitude" not in loc or not data.get("formattedAddress"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Google didn't return a full address for that place.")
    return PlaceDetails(
        place_id=data.get("id", place_id), name=(data.get("displayName") or {}).get("text"),
        address=data["formattedAddress"], short_address=data.get("shortFormattedAddress"),
        lat=loc["latitude"], lng=loc["longitude"],
    )
