"""Bank scrapers registry (Pakistani banks).

To add a bank:
  1. variables/<slug>.py  — BANK_SLUG, BANK_NAME, BASE_URL, DISCOUNTS_PATH, DISCOUNTS_URL
  2. tags/<slug>.py       — selector strings, e.g. OFFER_CARD = ".deal-card"
  3. <slug>.py            — scraper class extending BaseBankScraper
  4. register it in BANKS below
"""
from app.public.bank_scrapers.base import BaseBankScraper
from app.public.bank_scrapers.alfalah import AlfalahScraper
from app.public.bank_scrapers.askari import AskariScraper
from app.public.bank_scrapers.bank_al_habib import BankAlHabibScraper
from app.public.bank_scrapers.faysal import FaysalScraper
from app.public.bank_scrapers.hbl import HblScraper
from app.public.bank_scrapers.hbl_islamic import HblIslamicScraper
from app.public.bank_scrapers.js import JsBankScraper
from app.public.bank_scrapers.habib_metro import HabibMetroScraper
from app.public.bank_scrapers.abl import AlliedBankScraper
from app.public.bank_scrapers.bankislami import BankIslamiScraper
from app.public.bank_scrapers.bop import BankOfPunjabScraper
from app.public.bank_scrapers.dib import DibScraper
from app.public.bank_scrapers.al_baraka import AlBarakaScraper
from app.public.bank_scrapers.silk import SilkbankScraper
from app.public.bank_scrapers.mcb import McbScraper
from app.public.bank_scrapers.mcb_islamic import McbIslamicScraper
from app.public.bank_scrapers.meezan import MeezanScraper
from app.public.bank_scrapers.standard_chartered import StandardCharteredScraper
from app.public.bank_scrapers.ubl import UblScraper

BANKS: dict[str, type[BaseBankScraper]] = {
    HblScraper.slug: HblScraper,
    HblIslamicScraper.slug: HblIslamicScraper,
    MeezanScraper.slug: MeezanScraper,
    AlfalahScraper.slug: AlfalahScraper,
    UblScraper.slug: UblScraper,
    McbScraper.slug: McbScraper,
    McbIslamicScraper.slug: McbIslamicScraper,
    BankAlHabibScraper.slug: BankAlHabibScraper,
    StandardCharteredScraper.slug: StandardCharteredScraper,
    AskariScraper.slug: AskariScraper,
    FaysalScraper.slug: FaysalScraper,
    JsBankScraper.slug: JsBankScraper,
    HabibMetroScraper.slug: HabibMetroScraper,
    AlliedBankScraper.slug: AlliedBankScraper,
    BankIslamiScraper.slug: BankIslamiScraper,
    BankOfPunjabScraper.slug: BankOfPunjabScraper,
    DibScraper.slug: DibScraper,
    AlBarakaScraper.slug: AlBarakaScraper,
    SilkbankScraper.slug: SilkbankScraper,
}

BANK_NAMES: dict[str, str] = {slug: cls.name for slug, cls in BANKS.items()}


def get_bank_scraper(slug: str) -> BaseBankScraper:
    try:
        return BANKS[slug]()
    except KeyError:
        raise KeyError(f"Unknown bank '{slug}'. Available: {', '.join(BANKS)}") from None
