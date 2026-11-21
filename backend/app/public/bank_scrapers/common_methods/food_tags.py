"""Food tags for a restaurant — e.g. ["Cafe", "Coffee", "Continental", "Italian"]. One place can have many.

Built from what the deals site tells us about the merchant:
  * its own cuisine tags   (Peekaboo: "Continental", "Steaks", "BBQ", "Pakistani"...)  — trusted most
  * its keywords           (dishes it serves: "soup, pasta, burger, kabab"...)          — dish words only
  * its name + description ("Gloria Jean's Coffees", "a boutique cafe")
Menus are photos, so dishes are read from the keywords rather than the menu images.
"""
import re

# canonical tag -> words that mean it. Order = display order.
TAG_RULES: list[tuple[str, str]] = [
    ("Cafe", r"caf[eé]s?|coffee ?shop|bistro|patisserie"),
    ("Coffee", r"coffee|espresso|latte|cappuccino|starbucks|gloria jean|costa|tim hortons|dunkin|roaster"),
    ("Tea", r"\btea\b|chai|tea ?house|high tea|hi-?tea|qahwa|kahwa"),
    ("Breakfast", r"breakfast|brunch|pancake|waffle|egg|omelet|paratha|halwa puri|nashta"),
    ("Desi", r"desi|pakistani|mughlai|karahi|biryani|nihari|haleem|handi|tikka|tandoor|lahori|peshawari|sajji|dhaba|paya|pulao"),
    ("BBQ", r"bbq|barbe?que|grill|kabab|kebab|boti|seekh|tikka"),
    ("Continental", r"continental|european|steak|sandwich|club sandwich|soup|salad|grilled"),
    ("Italian", r"italian|pasta|lasagn|risotto|trattoria|spaghetti|ravioli"),
    ("Pizza", r"pizza|pizzeria|domino|papa john|broadway|california pizza"),
    ("Chinese", r"chinese|chow ?mein|manchurian|szechuan|sichuan|dim ?sum|wonton|kung pao|fried rice"),
    ("Thai", r"\bthai\b|tom yum|pad thai|green curry"),
    ("Japanese", r"japanese|sushi|ramen|teriyaki|tempura|nikkei|yakitori"),
    ("Asian", r"asian|pan.?asian|oriental|wok|korean|vietnamese|noodle"),
    ("Fast Food", r"fast ?food|burger|fries|broast|fried chicken|zinger|nuggets|hot ?dog|shawarma|wrap|kfc|mcdonald|hardee"),
    ("Burgers", r"burger"),
    ("Steak", r"steak|steakhouse"),
    ("Seafood", r"sea ?food|fish|prawn|shrimp|lobster|crab"),
    ("Middle Eastern", r"arabic|lebanese|turkish|middle east|mandi|shawarma|hummus|falafel|kunafa"),
    ("Desserts", r"dessert|sweets?\b|mithai|cake|brownie|cheesecake|waffle|crepe|donut|doughnut|kunafa|chocolate"),
    ("Ice Cream", r"ice ?cream|gelato|froyo|frozen yogh?urt|kulfi|sundae|baskin|cold stone"),
    ("Bakery", r"bakery|bakers|bake|bread|pastr(y|ies)|croissant|patisserie"),
    ("Juices & Shakes", r"juice|shake|smoothie|mocktail"),
    ("Healthy", r"healthy|salad bowl|vegan|vegetarian|keto|organic|poke"),
    ("Buffet", r"buffet|all you can eat"),
    ("Fine Dining", r"fine dining|ambience|rooftop|boutique|lounge"),
]
_COMPILED = [(tag, re.compile(rf"\b(?:{pat})", re.I)) for tag, pat in TAG_RULES]

# keywords on these sites mix dishes with marketing ("Ramadan Deals", "Mother's Day") — drop those
_NOISE = re.compile(r"deal|offer|discount|ramadan|ramzan|iftar|sehri|azadi|march|mother|father|eid|card|bank|silkbank|"
                    r"paypak|visa|mastercard|best|places|near|open-air|restaurants?$", re.I)


def food_tags(name: str | None, site_tags: list[str] | None = None, keywords: str | None = None,
              description: str | None = None, max_tags: int = 8) -> list[str]:
    site = " | ".join(t for t in (site_tags or []) if t)
    words = " | ".join(k.strip() for k in (keywords or "").split(",") if k.strip() and not _NOISE.search(k))
    text_strong = f"{name or ''} | {site}"          # name + the site's own tags
    text_weak = f"{words} | {description or ''}"    # dishes + description

    tags: list[str] = []
    for tag, rx in _COMPILED:
        if rx.search(text_strong) or rx.search(text_weak):
            tags.append(tag)
    # "Burgers" alone implies fast food; keep both but don't let generic BBQ ("grill") swamp a cafe
    if "Cafe" in tags and "BBQ" in tags and not rx_bbq_strong.search(text_strong):
        tags.remove("BBQ")
    return tags[:max_tags]


rx_bbq_strong = re.compile(r"bbq|barbe?que|kabab|kebab|tikka", re.I)
