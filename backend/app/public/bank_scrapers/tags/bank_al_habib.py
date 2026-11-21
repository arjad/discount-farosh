"""Selectors for the bank_al_habib discounts page. Fix these when the site changes."""

COOKIE_ACCEPT = "button:has-text('Accept'), button:has-text('I Agree'), #onetrust-accept-btn-handler"
POPUP_CLOSE = "[aria-label='Close'], .modal .close, button.close"

# TODO: replace with real class names from the site
OFFER_CARD = "[class*='discount'][class*='card'], [class*='offer'][class*='card'], [class*='deal-item'], [class*='discount-item']"
OFFER_TITLE = "h2, h3, h4, [class*='title'], [class*='name']"
OFFER_DESCRIPTION = "p, [class*='desc']"
OFFER_LINK = "a[href]"
OFFER_IMAGE = "img"
OFFER_VALIDITY = "[class*='valid'], [class*='expiry'], [class*='date']"
LOAD_MORE = "button:has-text('Load More'), button:has-text('View More'), a:has-text('Load More')"
