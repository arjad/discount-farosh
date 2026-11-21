"""Standard Chartered Pakistan discounts scraper."""
from playwright.async_api import Page

from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.common_methods import actions
from app.public.bank_scrapers.tags import standard_chartered as t
from app.public.bank_scrapers.variables import standard_chartered as v
from app.schemas import Offer


class StandardCharteredScraper(BaseBankScraper):
    slug = v.BANK_SLUG
    name = v.BANK_NAME
    base_url = v.BASE_URL
    discounts_url = v.DISCOUNTS_URL
    scrape_enabled = v.SCRAPE_ENABLED  # off: only the URL is recorded for now
    tags = t

    async def scrape(self, page: Page) -> list[Offer]:
        await actions.goto(page, v.DISCOUNTS_URL)
        await actions.dismiss_if_present(page, t.COOKIE_ACCEPT)
        await actions.dismiss_if_present(page, t.POPUP_CLOSE)

        await actions.wait_for(page, t.OFFER_CARD)
        await actions.click_load_more_until_gone(page, t.LOAD_MORE)

        offers: list[Offer] = []
        for card in await actions.get_all(page, t.OFFER_CARD):
            offer = await self.extract_card(
                card,
                title=t.OFFER_TITLE,
                description=t.OFFER_DESCRIPTION,
                link=t.OFFER_LINK,
                image=t.OFFER_IMAGE,
                validity=t.OFFER_VALIDITY,
            )
            if offer:
                offers.append(offer)
        return offers
