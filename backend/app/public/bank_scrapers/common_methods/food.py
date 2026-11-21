"""Food-only filter — we keep restaurant / café / food offers and drop everything else.

Used in two places so non-food offers never reach the DB:
  * BaseBankScraper.run()            — drops them from every scrape result
  * repository.save_scrape_result()  — safety net right before writing

Decision order for one offer:
  1. category says food (restaurant, dining, cafe...)          -> keep
  2. category is clearly non-food (health, online, fashion...)   -> drop
     (lifestyle / entertainment are NOT here — hotels and clubs there often have dining deals)
  3. name/title/description has a non-food word (clinic, salon, daraz, grocery...) -> drop
  4. name/title/description has a food word (pizza, biryani, coffee...)            -> keep
  5. nothing tells us it is food                                -> drop
"""
import re

from app.schemas import Offer

FOOD_CATEGORIES = {
    "restaurant", "restaurants", "dining", "food", "foods", "food_beverage", "food & beverage", "f&b",
    "cafe", "cafes", "café", "bakery", "bakeries", "dessert", "desserts", "ice_cream", "icecream",
    "fast_food", "fine_dining", "buffet", "eatery",
}
NON_FOOD_CATEGORIES = {
    "health", "healthcare", "medical", "pharmacy", "hospital", "clinic", "wellness", "self_care", "beauty",
    "salon", "spa", "fitness", "gym", "fashion", "apparel", "clothing", "footwear", "jewellery",
    "jewelry", "electronics", "mobile", "online", "ecommerce", "e-commerce", "shopping", "retail", "grocery",
    "groceries", "supermarket", "education", "school", "services", "travel", "hotel_stay", "airline",
    "automotive", "fuel", "home", "furniture", "insurance", "utilities", "telecom",
}

_NON_FOOD_WORDS = re.compile(
    r"\b("
    # health / healthcare
    r"hospital|clinic|clinics|medical|medicine|pharmacy|pharma|chemist|dental|dentist|diagnostic|laborator(?:y|ies)|"
    r"lab test|healthcare|health care|physio|optical|optician|eye care|skin care|dermatolog\w*|"
    # self care / lifestyle
    r"salon|saloon|spa|barber|parlou?r|gym|fitness|yoga|cosmetics?|makeup|fragrance|perfume|"
    # retail / e-commerce
    r"fashion|apparel|clothing|garments?|boutique|footwear|shoes|jewel\w*|watches|electronics?|appliances?|"
    r"mobile phones?|laptops?|furniture|home decor|e-?commerce|online shopping|online store|daraz|"
    r"grocery|groceries|supermarket|hypermarket|departmental store|"
    # other services
    r"school|university|academy|tuition|courses?|travel|airlines?|flights?|tours?|car rental|car wash|"
    r"insurance|fuel|petrol|cinema|cineplex|gaming zone|laundry|dry clean\w*"
    r")\b"
)

_FOOD_WORDS = re.compile(
    r"\b("
    r"restaurants?|dining|dine|dine-in|eatery|eateries|food|foods|kitchen|grill|grills|bbq|barbe?que|buffet|"
    r"brunch|breakfast|lunch|dinner|hi-?tea|high tea|takeaway|take-away|menu|a ?la carte|"
    r"caf[eé]s?|coffee|espresso|bakery|bakers|bake|patisserie|cakes?|donuts?|doughnuts?|desserts?|sweets|mithai|"
    r"ice ?cream|gelato|froyo|kulfi|juices?|shakes?|smoothies?|tea|chai|"
    r"pizza|pizzeria|pasta|italian|burgers?|fries|sandwich\w*|subs|wraps?|shawarma|steaks?|steakhouse|"
    r"chinese|wok|noodles?|dim ?sum|sushi|thai|asian|oriental|"
    r"desi|biryani|karahi|nihari|haleem|tikka|kababs?|kebabs?|sajji|handi|tandoor\w*|paratha|halwa puri|dhaba|"
    r"chicken|broast|seafood|fish|"
    r"kfc|mcdonald'?s|subway|hardee'?s|domino'?s|pizza hut|burger king|ocean basket|gloria jean'?s|starbucks|"
    r"tim hortons|dunkin|baskin robbins|cold stone|foodpanda"
    r")\b"
)


def _norm(v: str | None) -> str:
    return (v or "").strip().lower().replace(" ", "_")


def is_food_offer(o: Offer) -> bool:
    cats = {_norm(o.category), _norm(o.business_category)} - {""}
    if cats & {_norm(c) for c in FOOD_CATEGORIES}:
        return True
    if cats & NON_FOOD_CATEGORIES:
        return False

    text = " ".join(filter(None, (
        o.business_name, o.title, o.description, o.business_category, o.category, o.extra.get("cuisine"),
    ))).lower()
    if _NON_FOOD_WORDS.search(text):
        return False
    return bool(_FOOD_WORDS.search(text))


def keep_food(offers: list[Offer]) -> tuple[list[Offer], int]:
    """Return (food offers, number dropped)."""
    kept = [o for o in offers if is_food_offer(o)]
    return kept, len(offers) - len(kept)
