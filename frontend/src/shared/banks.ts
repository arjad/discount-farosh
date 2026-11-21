import { BANKS as HOME_BANKS, SAMPLE_CARDS } from "../home/data";

/** Every bank the filter lists — banks we scrape (from the home page list) plus other major Pakistani banks. */
export const ALL_BANKS: { slug: string; name: string }[] = [
  ...HOME_BANKS,
  { slug: "abl", name: "Allied Bank" },
  { slug: "nbp", name: "National Bank (NBP)" },
  { slug: "js", name: "JS Bank" },
  { slug: "bankislami", name: "BankIslami" },
  { slug: "habib_metro", name: "HabibMetro" },
  { slug: "soneri", name: "Soneri Bank" },
  { slug: "dib", name: "Dubai Islamic Bank" },
  { slug: "bop", name: "Bank of Punjab" },
  { slug: "silk", name: "Silkbank" },
  { slug: "al_baraka", name: "Al Baraka Bank" },
];

/** Cards each bank issues, so a bank's cards show even before an offer lists them. */
export const BANK_CARDS: Record<string, string[]> = {
  ...SAMPLE_CARDS.reduce<Record<string, string[]>>((m, c) => ({ ...m, [c.bank]: [...(m[c.bank] ?? []), c.name] }), {}),
  abl: ["Visa Classic Debit", "Visa Gold Debit", "Mastercard Platinum Debit"],
  nbp: ["Visa Classic Debit", "PayPak Debit", "Mastercard Gold Debit"],
  js: ["Visa Platinum Debit", "Visa Signature Debit", "Mastercard Titanium"],
  bankislami: ["Visa Classic Debit", "Mastercard Platinum Debit"],
  habib_metro: ["Visa Gold Debit", "Visa Platinum Credit"],
  soneri: ["Visa Classic Debit", "Mastercard Titanium Debit"],
  dib: ["Visa Platinum Debit", "Visa Signature Debit"],
  bop: ["Visa Classic Debit", "Mastercard Gold Debit"],
  silk: ["Visa Gold Credit", "Visa Platinum Credit"],
  al_baraka: ["Visa Classic Debit", "Visa Gold Debit"],
};

/** Card filter values are `bank|card name` — the same card name (e.g. "Visa Platinum") exists at many banks. */
export const cardKey = (bank: string, card: string) => `${bank}|${card}`;
export const splitCardKey = (k: string) => {
  const i = k.indexOf("|");
  return { bank: k.slice(0, i), card: k.slice(i + 1) };
};

const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && w !== "card" && w !== "cards");

/** Words that don't tell cards apart: the card network and the bank's own name.
 *  Banks name the same card differently ("Visa Gold Credit" vs "AL Habib Gold Credit Card"). */
const NOISE = new Set(["visa", "mastercard", "master", "bank", "al", "habib", "hbl", "mcb", "ubl", "meezan", "alfalah", "askari", "faysal", "islamic", "limited", "ltd"]);
const keyWords = (s: string) => words(s).filter((w) => !NOISE.has(w));

/** Does a card the user saved ("Visa Gold Credit") cover this offer card ("AL Habib Gold Credit Card") at this bank?
 *  Same bank, and every meaningful word of the saved name (tier, credit/debit…) appears in the offer's card name. */
export function cardMatches(saved: { bank_slug: string; card_name: string }, bankSlug: string, offerCard: string) {
  if (saved.bank_slug !== bankSlug) return false;
  const have = new Set(keyWords(offerCard));
  return keyWords(saved.card_name).every((w) => have.has(w));
}
