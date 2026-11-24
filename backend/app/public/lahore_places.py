"""Lahore areas & housing societies — a local list for instant suggestions in the location picker.

Why: the public map search (Nominatim) mustn't be called on every keystroke, and it doesn't favour
Lahore ("DHA Phase 8" finds Karachi first). This list is searched locally as the customer types,
so DHA phases, Paragon City, Bahria Town, Lake City… show up instantly, and always the Lahore one.

The coordinates come from OpenStreetMap (via Nominatim) — nothing is typed in by hand. Rebuild or
extend the list with (1 lookup per second, as Nominatim's usage policy requires):

    .venv/bin/python -m app.public.lahore_places build

Add a missing area by adding its name to NAMES and running the build again. Places OpenStreetMap
doesn't know are reported and left out.
"""
import json
import re
import sys
import time
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).with_name("data") / "lahore_places.json"

# Lahore district (with a margin): lon 73.95–74.65, lat 31.20–31.75
VIEWBOX = "73.95,31.75,74.65,31.20"
IN_LAHORE = lambda lat, lng: 31.20 <= lat <= 31.75 and 73.95 <= lng <= 74.65  # noqa: E731

NAMES = [
    # DHA
    *[f"DHA Phase {i}" for i in range(1, 14)], "DHA Phase 9 Town", "DHA Phase 9 Prism", "DHA Rahbar", "DHA EME Sector", "DHA Raya",
    # big societies / schemes
    "Bahria Town", "Bahria Orchard", "Bahria Nasheman", "Lake City", "Paragon City", "Park View City", "Valencia Town",
    "Wapda Town", "Johar Town", "Model Town", "Model Town Extension", "Garden Town", "Faisal Town", "Township",
    "Allama Iqbal Town", "Gulshan-e-Ravi", "Sabzazar", "Muslim Town", "Mustafa Town", "Wahdat Colony",
    "Askari 9", "Askari 10", "Askari 11", "EME Society", "State Life Housing Society", "Central Park Housing Scheme",
    "Etihad Town", "Al Rehman Garden", "LDA Avenue", "Eden City", "Eden Gardens", "Sui Gas Society",
    "Punjab Cooperative Housing Society", "Izmir Town", "Formanites Housing Scheme", "NFC Society", "PIA Housing Society",
    "Canal Garden", "Bankers Town", "Canal View", "Punjab University Town", "Jubilee Town", "Pak Arab Housing Society",
    "Revenue Society", "Engineers Town", "Architects Engineers Society", "Tech Society", "Hamza Town", "Green Town",
    "Gulshan-e-Lahore", "Al-Kabir Town", "Kings Town", "New Lahore City", "Lahore Motorway City", "Lahore Smart City",
    "Union Livings", "Divine Gardens", "Super Town", "Ali Town", "Shalimar Town", "Cantt View Society", "Lalazar Colony",
    "Nishtar Colony", "Gulfishan Colony", "Marghzar Colony", "Abdalian Cooperative Housing Society", "Wapda Town Phase 2",
    "Fazaia Housing Scheme", "Air Avenue", "Sukh Chayn Gardens", "Grand Avenues", "Khayaban-e-Amin", "Garden Town Ali Block",
    # central / old Lahore
    "Gulberg", "Gulberg I", "Gulberg II", "Gulberg III", "Gulberg IV", "Gulberg V", "Shadman", "Shah Jamal",
    "Samanabad", "Ichhra", "Mozang", "Anarkali", "Islampura", "Chauburji", "Sanda", "Bilal Ganj",
    "Data Darbar", "Walled City", "Ravi Road", "Shahdara", "Baghbanpura", "Shalimar", "Mughalpura", "Harbanspura",
    "Cavalry Ground", "Saddar", "Lahore Cantt", "Walton", "Bedian Road", "Barki Road", "Raiwind", "Thokar Niaz Baig",
    "Kot Lakhpat", "Township Sector A", "Zaman Park", "Aitchison College", "Garhi Shahu", "Dharampura", "Daroghawala",
    "Ghaziabad", "Misri Shah", "Lakshmi Chowk", "Qila Gujjar Singh", "Gawalmandi", "Bhati Gate", "Lohari Gate",
    "Model Colony", "Rehmanpura", "Ferozepur Road", "Kahna", "Hanjarwal", "Multan Road", "Chung", "Bhobatian",
    "Johar Town Phase 2", "Gulshan Ravi", "Shad Bagh", "Begumpura", "Salamatpura", "Manawan",
    # places people search by
    "MM Alam Road", "Liberty Market", "Main Boulevard Gulberg", "Mall Road", "Jail Road", "Canal Road",
    "Fortress Stadium", "Packages Mall", "Emporium Mall", "Mall of Lahore", "Hafeez Centre",
    "Allama Iqbal International Airport", "Lahore Railway Station", "Badshahi Mosque", "Minar-e-Pakistan",
    "Gaddafi Stadium", "Expo Centre Lahore", "Lahore Zoo", "Jallo Park", "Race Course Park", "Bagh-e-Jinnah",
]

# Other names OpenStreetMap may use for a place: shown as the first name, looked up as any of these.
ALIASES: dict[str, list[str]] = {
    "DHA Phase 9 Prism": ["Prism, DHA Phase 9", "DHA Prism"],
    "DHA Rahbar": ["DHA Rahbar Sector", "Rahbar, DHA Phase 11", "DHA Phase 11 Rahbar"],
    "DHA Phase 11": ["DHA Phase 11 Rahbar", "DHA Rahbar"],
    "Valencia Town": ["Valencia Housing Society", "Valencia"],
    "Central Park Housing Scheme": ["Central Park Housing Society", "Central Park, Ferozepur Road"],
    "Pak Arab Housing Society": ["Pak Arab Society", "Pak Arab Housing Scheme"],
    "Architects Engineers Society": ["Architects Engineers Housing Society", "Architect Engineers Society"],
    "Union Livings": ["Union Living"],
    "Lalazar Colony": ["Lalazar"],
    "Marghzar Colony": ["Marghzar Officers Colony", "Marghzar"],
    "Abdalian Cooperative Housing Society": ["Abdalians Housing Society", "Abdalian Society"],
    "Grand Avenues": ["Grand Avenues Housing Scheme", "Grand Avenue"],
    "Bhati Gate": ["Bhatti Gate"],
    "Bhobatian": ["Bhobtian", "Bhobatian Chowk"],
    "Islampura": ["Krishan Nagar"],  # its old name
    "Gulberg I": ["Gulberg 1"], "Gulberg II": ["Gulberg 2"], "Gulberg III": ["Gulberg 3"],
    "Gulberg IV": ["Gulberg 4"], "Gulberg V": ["Gulberg 5"],
    "Lahore Cantt": ["Lahore Cantonment"],
    "Lahore Railway Station": ["Lahore Junction railway station", "Lahore Junction"],
    "Askari 9": ["Askari IX"], "Askari 10": ["Askari X"], "Askari 11": ["Askari XI"],
    "Johar Town Phase 2": ["Johar Town Phase II"], "Wapda Town Phase 2": ["Wapda Town Phase II"],
    "Cantt View Society": ["Cantt View Housing Society"],
}

# DHA is spelt many ways — "dha ph 8", "defence phase 8", "d.h.a"
SYNONYMS = [(r"\bd\.?h\.?a\.?\b", "dha"), (r"\bdefen[cs]e( housing authority)?\b", "dha"), (r"\bph(?:ase)?\.?\s*(?=\d)", "phase "),
            (r"\bcantt?\b", "cantonment"), (r"\bblk\b", "block"), (r"\bsoc(iety)?\b", "society"), (r"\bcoop(erative)?\b", "cooperative"), (r"-e-", " e "),
            (r"\bgulberg (\d)\b", lambda m: "gulberg " + ["", "i", "ii", "iii", "iv", "v"][int(m.group(1))] if 0 < int(m.group(1)) <= 5 else m.group(0))]


def norm(s: str) -> str:
    s = s.lower()
    for pat, rep in SYNONYMS:
        s = re.sub(pat, rep, s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


@lru_cache(maxsize=1)
def places() -> list[dict]:
    try:
        return json.loads(DATA.read_text())
    except (OSError, ValueError):
        return []


def search(q: str, limit: int = 8) -> list[dict]:
    """Lahore places matching what's typed so far — instant, no network."""
    t = norm(q)
    if len(t) < 2:
        return []
    words = t.split()
    scored = []
    for p in places():
        n = p["_n"]
        if not all(w in n for w in words):
            continue
        # best: name starts with the text; then a word starts with it; then contains it
        score = 0 if n.startswith(t) else 1 if f" {t}" in f" {n}" else 2
        scored.append((score, len(n), p))
    scored.sort(key=lambda x: (x[0], x[1]))
    return [{k: v for k, v in p.items() if not k.startswith("_")} for _, _, p in scored[:limit]]


# ---------------------------------------------------------------- build (one-off, from OpenStreetMap)

_STOP = {"lahore", "town", "society", "housing", "scheme", "colony", "cooperative", "phase", "block", "road",
         "e", "the", "city", "garden", "gardens", "market", "park", "sector", "station"}
_ROMAN = {"1": "i", "2": "ii", "3": "iii", "4": "iv", "5": "v", "6": "vi", "7": "vii", "8": "viii", "9": "ix",
          "10": "x", "11": "xi", "12": "xii", "13": "xiii"}


def _matches(query: str, hit: dict) -> bool:
    """Is this OpenStreetMap result really the place we asked for? Its address must contain the key words
    of the name, and the same number ("DHA Phase 12" must not land on a road in DHA Phase 8)."""
    disp = f" {norm(hit.get('display_name', ''))} "
    for w in norm(query.split(",")[0]).split():
        if w in _STOP:
            continue
        if w.isdigit():
            if f" {w} " not in disp and f" {_ROMAN.get(w, '#')} " not in disp:
                return False
        elif w in _ROMAN.values():  # Gulberg III, Askari IX
            arabic = next((k for k, v in _ROMAN.items() if v == w), "#")
            if f" {w} " not in disp and f" {arabic} " not in disp:
                return False
        elif w not in disp:
            return False
    return True

def dedupe(rows: list[dict], metres: float = 120) -> list[dict]:
    """Drop a place that landed on top of a different, earlier one (e.g. "Askari 11" on Askari 10's point) —
    unless it's a part of that place ("DHA Phase 9 Town" inside "DHA Phase 9")."""
    kept: list[dict] = []
    for r in rows:
        clash = next((k for k in kept if abs(k["lat"] - r["lat"]) * 111_000 < metres and abs(k["lng"] - r["lng"]) * 95_000 < metres), None)
        if clash and not norm(r["name"]).startswith(norm(clash["name"])):
            print(f"  – dropped {r['name']}: same point as {clash['name']}")
            continue
        kept.append(r)
    return kept


def build() -> None:
    from app.public.geo import _fetch  # sends the identifying User-Agent; same as the live search

    out, missing = [], []
    for i, name in enumerate(dict.fromkeys(NAMES)):
        hit = None
        for alt in [name, *ALIASES.get(name, [])]:
            for q in (f"{alt}, Lahore", alt):
                try:
                    rows = _fetch("/search", {"q": q, "limit": 8, "countrycodes": "pk", "viewbox": VIEWBOX, "bounded": 1})
                except Exception as e:  # noqa: BLE001
                    print(f"  ! {name}: {e}", file=sys.stderr)
                    rows = []
                time.sleep(1.1)  # Nominatim: max 1 request per second
                hit = next((r for r in rows or [] if IN_LAHORE(float(r["lat"]), float(r["lon"])) and _matches(alt, r)), None)
                if hit:
                    break
            if hit:
                break
        if not hit:
            missing.append(name)
            print(f"[{i + 1}/{len(NAMES)}] ✖ {name} — not found in OpenStreetMap", flush=True)
            continue
        a = hit.get("address") or {}
        area = a.get("suburb") or a.get("neighbourhood") or a.get("quarter") or a.get("city_district") or a.get("town")
        out.append({
            "name": name, "lat": round(float(hit["lat"]), 6), "lng": round(float(hit["lon"]), 6),
            "address": hit.get("display_name", ""), "area": area if area and norm(area) != norm(name) else None,
            "_n": " | ".join(norm(x) for x in [name, *ALIASES.get(name, [])]),
        })
        print(f"[{i + 1}/{len(NAMES)}] ✔ {name}  ({out[-1]['lat']}, {out[-1]['lng']})", flush=True)
    out = dedupe(out)
    DATA.parent.mkdir(exist_ok=True)
    DATA.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"\nSaved {len(out)} places to {DATA}. Not found: {len(missing)} {missing}")


if __name__ == "__main__":
    if sys.argv[1:] == ["build"]:
        build()
    else:
        print(__doc__)
