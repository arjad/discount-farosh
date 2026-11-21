from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class CardDiscount(BaseModel):
    """A card the offer is valid for. Discount fields override the offer's default."""
    name: str  # "Visa Platinum Debit"
    tier: str | None = None  # platinum, gold, silver, signature...
    card_type: str | None = None  # debit, credit
    network: str | None = None  # visa, mastercard, unionpay, paypak
    discount_percent: float | None = None
    max_discount_amount: float | None = None


class Branch(BaseModel):
    """One physical location of a business. Each branch is saved as its own `businesses` row."""
    name: str | None = None  # "MM Alam Rd Lahore Branch"
    address: str | None = None
    area: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    phone: str | None = None
    # weekly opening hours as the site gives them, e.g. {"Monday": "12:30PM-11:00PM", ...}
    hours: dict[str, str] | None = None


class Offer(BaseModel):
    """What a scraper returns. Saved to Postgres by app/db/repository.py."""
    source: str = Field(description="Scraper slug, e.g. 'meezan'")
    external_id: str | None = None  # the site's own deal id, if any — makes re-scrapes match exactly
    title: str
    description: str | None = None
    url: str | None = None
    image_url: str | None = None
    valid_from: str | None = None  # ISO date or raw text
    valid_till: str | None = None  # ISO date or raw text
    category: str | None = None  # dining, fashion, health...

    # business the offer is at (restaurant, shop...)
    business_name: str | None = None
    business_category: str | None = None
    city: str | None = None
    address: str | None = None
    business_logo: str | None = None
    business_rating: float | None = None  # 0–5, from the bank's deals site
    business_rating_count: int | None = None
    menu_images: list[str] = Field(default_factory=list)
    business_tags: list[str] = Field(default_factory=list)  # food tags, e.g. ["Cafe", "Coffee", "Italian"]
    branches: list[Branch] = Field(default_factory=list)  # if set, one business row per branch

    # default discount (cards can override)
    discount_percent: float | None = None
    max_discount_amount: float | None = None
    valid_days: list[str] = Field(default_factory=list)  # ["Fri", "Sat", "Sun"]
    terms: str | None = None
    cards: list[CardDiscount] = Field(default_factory=list)

    extra: dict[str, str] = Field(default_factory=dict)


class ScrapeStatus(str, Enum):
    success = "success"
    failed = "failed"


class ScrapeErrorDetail(BaseModel):
    """Tells you *why* a scraper broke — which named tag/selector failed and where."""
    kind: str
    message: str
    tag_name: str | None = None
    selector: str | None = None
    action: str | None = None
    page_url: str | None = None
    screenshot: str | None = None


class ScrapeResult(BaseModel):
    source: str
    category: str
    status: ScrapeStatus
    offers: list[Offer] = Field(default_factory=list)
    error: ScrapeErrorDetail | None = None
    started_at: datetime
    finished_at: datetime

    @property
    def duration_s(self) -> float:
        return (self.finished_at - self.started_at).total_seconds()


class SourceInfo(BaseModel):
    slug: str
    name: str
    category: str
    base_url: str


class StoredOffer(BaseModel):
    """An offer row as read back from Postgres."""
    model_config = {"from_attributes": True}

    id: int
    bank_id: int
    title: str
    description: str | None = None
    category: str | None = None
    discount_percent: float | None = None
    max_discount_amount: float | None = None
    currency: str
    valid_days: list[str] | None = None
    valid_till: date | None = None
    source_url: str | None = None
    image_url: str | None = None
    last_seen_at: datetime


class WaitlistIn(BaseModel):
    email: EmailStr
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=80)
    banks: list[str] = Field(default_factory=list, max_length=20)
    source: str | None = Field(default=None, max_length=50)


class WaitlistOut(BaseModel):
    ok: bool = True
    already_joined: bool = False
