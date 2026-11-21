"""Turn messy bank text into clean values. Shared by all bank scrapers."""
import re
from datetime import date, datetime

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_DAY_WORDS = {
    "mon": 0, "monday": 0, "tue": 1, "tues": 1, "tuesday": 1, "wed": 2, "wednesday": 2,
    "thu": 3, "thur": 3, "thurs": 3, "thursday": 3, "fri": 4, "friday": 4,
    "sat": 5, "saturday": 5, "sun": 6, "sunday": 6,
}
_DAY_RX = r"(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)"


def parse_days(text: str | None) -> list[str]:
    """'30% off on Every Saturday' -> ['Sat'];  'Monday to Thursday' -> ['Mon'..'Thu'];  'Everyday' -> all.

    Returns [] when the text doesn't mention days (treat as "not specified").
    """
    if not text:
        return []
    t = text.lower()
    if re.search(r"\bevery\s*day\b|\ball\s+days\b|\bdaily\b|\b7\s*days\b", t):
        return DAYS[:]
    if "weekday" in t:
        return DAYS[:5]
    if "weekend" in t:
        return DAYS[5:]
    found: set[int] = set()
    for a, b in re.findall(_DAY_RX + r"\s*(?:-|–|to|till|through|thru)\s*" + _DAY_RX, t):
        i, j = _DAY_WORDS[a], _DAY_WORDS[b]
        found.update(range(i, j + 1) if i <= j else [*range(i, 7), *range(0, j + 1)])
    for w in re.findall(r"\b" + _DAY_RX + r"\b", t):
        found.add(_DAY_WORDS[w])
    return [DAYS[i] for i in sorted(found)]


def parse_cap(text: str | None) -> float | None:
    """'Discount cap PKR 4,000/-' -> 4000.0"""
    if not text:
        return None
    m = re.search(r"(?:cap(?:ped)?|maximum discount|max(?:imum)? discount)[^\d\n]{0,25}?(?:pkr|rs\.?)?\s*([\d,]+(?:\.\d+)?)", text, re.I)
    return float(m.group(1).replace(",", "")) if m else None


def parse_percent(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"(\d{1,2}(?:\.\d+)?)\s*%", text)
    return float(m.group(1)) if m else None


def iso_date(value: str | None) -> str | None:
    """'2026-12-31T23:59:00' -> '2026-12-31'"""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return None


def to_date(value: str | None) -> date | None:
    iso = iso_date(value) if value and "T" in value else value
    try:
        return date.fromisoformat(iso) if iso else None
    except ValueError:
        return None


_TIERS = ["infinite", "world elite", "world", "signature", "platinum", "titanium", "gold", "silver", "classic", "nayab", "lite", "premium"]


def card_attributes(name: str) -> dict:
    """'Visa Platinum Debit Card' -> {tier: platinum, card_type: debit, network: visa}"""
    n = name.lower()
    tier = next((t for t in _TIERS if t in n), None)
    card_type = "credit" if "credit" in n else "debit" if "debit" in n else "prepaid" if "prepaid" in n else None
    network = next((x for x in ("visa", "mastercard", "unionpay", "paypak", "amex") if x in n.replace("master card", "mastercard")), None)
    return {"tier": tier, "card_type": card_type, "network": network}
