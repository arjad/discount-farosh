"""Database models.

    banks 1──* cards                 one bank has many card types (Platinum, Gold, Silver...)
    banks 1──* offers                every offer is published by one bank
    offers *──* cards   (offer_cards)       one card has many offers; one offer covers many cards,
                                            each card can get its own discount % / cap on the same offer
    offers *──* businesses (offer_businesses) one offer applies to many businesses
    businesses ⇢ cards                   which cards a business accepts = derived through its offers
    businesses: one location each (address, city, lat/lng columns)
    users *──* offers (user_favourite_offers) a user saves many favourite offers
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------- users

class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    # profile picture — a small JPEG data URL (the browser resizes it to 256px before upload)
    avatar: Mapped[str | None] = mapped_column(Text)
    # saved places — a label the user types, plus optional coordinates ("pin to my current location")
    home_label: Mapped[str | None] = mapped_column(String(300))
    home_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    home_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    work_label: Mapped[str | None] = mapped_column(String(300))
    work_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    work_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    cards: Mapped[list["UserCard"]] = relationship(cascade="all, delete-orphan", order_by="UserCard.id")
    visits: Mapped[list["UserVisit"]] = relationship(cascade="all, delete-orphan",
                                                     order_by="UserVisit.visited_at.desc()")

    favourite_offers: Mapped[list["Offer"]] = relationship(
        secondary="user_favourite_offers", back_populates="favourited_by"
    )


# ---------------------------------------------------------------- banks & cards

class Bank(TimestampMixin, Base):
    __tablename__ = "banks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True)  # matches scraper slug, e.g. "meezan"
    name: Mapped[str] = mapped_column(String(150))
    base_url: Mapped[str | None] = mapped_column(String(500))
    discounts_url: Mapped[str | None] = mapped_column(String(500))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cards: Mapped[list["Card"]] = relationship(back_populates="bank", cascade="all, delete-orphan")
    offers: Mapped[list["Offer"]] = relationship(back_populates="bank", cascade="all, delete-orphan")


class Card(TimestampMixin, Base):
    __tablename__ = "cards"
    __table_args__ = (UniqueConstraint("bank_id", "name", name="uq_cards_bank_name"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("banks.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))  # "Visa Platinum Debit"
    tier: Mapped[str | None] = mapped_column(String(40))  # platinum, gold, silver, signature, infinite, world...
    card_type: Mapped[str | None] = mapped_column(String(20))  # debit, credit, prepaid
    network: Mapped[str | None] = mapped_column(String(30))  # visa, mastercard, unionpay, paypak, amex
    image_url: Mapped[str | None] = mapped_column(String(500))

    bank: Mapped[Bank] = relationship(back_populates="cards")
    offer_links: Mapped[list["OfferCard"]] = relationship(back_populates="card", cascade="all, delete-orphan")


# ---------------------------------------------------------------- businesses

class Business(TimestampMixin, Base):
    """Restaurants, cafes, shops, clinics... `category` tells them apart. One location each."""

    __tablename__ = "businesses"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_businesses_slug"),
        Index("ix_businesses_city_category", "city", "category"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_businesses_lat"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_businesses_lng"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    slug: Mapped[str] = mapped_column(String(200))  # "cafe-flo-karachi"
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(40), default="restaurant", server_default="restaurant")
    phone: Mapped[str | None] = mapped_column(String(30))
    website: Mapped[str | None] = mapped_column(String(500))
    logo_url: Mapped[str | None] = mapped_column(String(500))

    # location (one per business)
    address: Mapped[str | None] = mapped_column(Text)
    area: Mapped[str | None] = mapped_column(String(120))
    city: Mapped[str | None] = mapped_column(String(80))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))

    hours: Mapped[dict | None] = mapped_column(JSONB)  # {"Monday": "12:30PM-11:00PM", ...}
    menu_images: Mapped[list[str] | None] = mapped_column(ARRAY(String(1000)))
    rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    rating_count: Mapped[int | None] = mapped_column(Integer)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(40)))  # food tags: Cafe, Desi, Italian...

    offers: Mapped[list["Offer"]] = relationship(secondary="offer_businesses", back_populates="businesses")


# ---------------------------------------------------------------- offers

class Offer(TimestampMixin, Base):
    __tablename__ = "offers"
    __table_args__ = (
        UniqueConstraint("bank_id", "fingerprint", name="uq_offers_bank_fingerprint"),
        Index("ix_offers_active_valid_till", "is_active", "valid_till"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("banks.id", ondelete="CASCADE"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64))  # stable hash from scraped data, used for upserts

    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    terms: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(40))  # dining, fashion, health, travel...

    # default discount — a card can override these in offer_cards
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    max_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="PKR", server_default="PKR")
    valid_days: Mapped[list[str] | None] = mapped_column(ARRAY(String(3)))  # ["Fri","Sat","Sun"]
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_till: Mapped[date | None] = mapped_column(Date)

    source_url: Mapped[str | None] = mapped_column(String(1000))
    image_url: Mapped[str | None] = mapped_column(String(1000))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    bank: Mapped[Bank] = relationship(back_populates="offers")
    card_links: Mapped[list["OfferCard"]] = relationship(back_populates="offer", cascade="all, delete-orphan")
    businesses: Mapped[list[Business]] = relationship(secondary="offer_businesses", back_populates="offers")
    favourited_by: Mapped[list[User]] = relationship(
        secondary="user_favourite_offers", back_populates="favourite_offers"
    )


class OfferCard(Base):
    """Which cards an offer is valid for, with an optional per-card discount.

    e.g. one Cafe Flo offer: Platinum 40% (cap 7000), Gold 25%, Silver 15%.
    """

    __tablename__ = "offer_cards"

    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id", ondelete="CASCADE"), primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("cards.id", ondelete="CASCADE"), primary_key=True, index=True)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    max_discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    offer: Mapped[Offer] = relationship(back_populates="card_links")
    card: Mapped[Card] = relationship(back_populates="offer_links")


class OfferBusiness(Base):
    __tablename__ = "offer_businesses"

    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id", ondelete="CASCADE"), primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class UserFavouriteOffer(Base):
    __tablename__ = "user_favourite_offers"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id", ondelete="CASCADE"), primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserSession(Base):
    """A logged-in browser. The cookie holds a random token; only its SHA-256 hash is stored here,
    so a database leak can't be used to log in. Logging out deletes the row."""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class UserCard(Base):
    """A card the user owns — bank + card type only (never card numbers)."""

    __tablename__ = "user_cards"
    __table_args__ = (UniqueConstraint("user_id", "bank_slug", "card_name", name="uq_user_cards"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bank_slug: Mapped[str] = mapped_column(String(50))
    bank_name: Mapped[str] = mapped_column(String(150))
    card_name: Mapped[str] = mapped_column(String(150))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserVisit(Base):
    """A restaurant the user marked as visited. Keeps the place name even if the offer later disappears."""

    __tablename__ = "user_visits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id", ondelete="SET NULL"))
    place_name: Mapped[str] = mapped_column(String(200))
    place_address: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(1000))
    bank_name: Mapped[str | None] = mapped_column(String(150))
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- pre-launch

class WaitlistSignup(TimestampMixin, Base):
    """Pre-launch sign-ups from the homepage."""

    __tablename__ = "waitlist_signups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(30))
    city: Mapped[str | None] = mapped_column(String(80))
    banks: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)))  # bank slugs the user has cards with
    source: Mapped[str | None] = mapped_column(String(50))  # e.g. "homepage-hero"
