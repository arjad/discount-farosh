export const BANKS = [
  { slug: "hbl", name: "HBL" },
  { slug: "hbl_islamic", name: "HBL Islamic" },
  { slug: "meezan", name: "Meezan Bank" },
  { slug: "alfalah", name: "Bank Alfalah" },
  { slug: "ubl", name: "UBL" },
  { slug: "mcb", name: "MCB" },
  { slug: "mcb_islamic", name: "MCB Islamic" },
  { slug: "bank_al_habib", name: "Bank AL Habib" },
  { slug: "standard_chartered", name: "Standard Chartered" },
  { slug: "askari", name: "Askari Bank" },
  { slug: "faysal", name: "Faysal Bank" },
];

export const CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Other"];
export const COUNTRIES = ["Pakistan", "United Arab Emirates", "Saudi Arabia", "Qatar", "United Kingdom", "United States", "Canada", "Other"];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Day = (typeof DAYS)[number];

export const CATEGORIES = [
  { id: "desi", label: "Desi" },
  { id: "italian", label: "Italian" },
  { id: "chinese", label: "Chinese" },
  { id: "icecream", label: "Ice cream" },
  { id: "cafe", label: "Café" },
  { id: "dining", label: "Dining" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];

export type SampleCard = { id: string; bank: string; name: string; tone: "plat" | "gold" | "dark" | "silver" };

export type SampleDeal = {
  place: string;
  category: Category;
  area: string;
  km: number;
  card: string; // matches SAMPLE_CARDS id
  pct: number;
  cap?: number;
  days: Day[];
  img: string;
  rating: number;
  reviews: number;
};

/** Demo cards for the "try it" section — a few typical card tiers per bank. `bank` is a BANKS slug. */
export const SAMPLE_CARDS: SampleCard[] = [
  { id: "hbl-gold", bank: "hbl", name: "Mastercard Gold", tone: "gold" },
  { id: "hbl-plat", bank: "hbl", name: "Visa Platinum Credit", tone: "plat" },
  { id: "hblisl-classic", bank: "hbl_islamic", name: "Visa Classic Debit", tone: "silver" },
  { id: "hblisl-titanium", bank: "hbl_islamic", name: "Mastercard Titanium", tone: "dark" },
  { id: "meezan-plat", bank: "meezan", name: "Visa Platinum Debit", tone: "plat" },
  { id: "meezan-titanium", bank: "meezan", name: "Mastercard Titanium Debit", tone: "dark" },
  { id: "alfalah-sig", bank: "alfalah", name: "Visa Signature", tone: "dark" },
  { id: "alfalah-gold", bank: "alfalah", name: "Visa Gold Credit", tone: "gold" },
  { id: "ubl-classic", bank: "ubl", name: "Visa Classic Debit", tone: "silver" },
  { id: "ubl-sig", bank: "ubl", name: "Visa Signature Credit", tone: "dark" },
  { id: "mcb-plat", bank: "mcb", name: "Visa Platinum", tone: "plat" },
  { id: "mcb-gold", bank: "mcb", name: "Visa Gold", tone: "gold" },
  { id: "mcbisl-debit", bank: "mcb_islamic", name: "Visa Debit", tone: "silver" },
  { id: "habib-gold", bank: "bank_al_habib", name: "Visa Gold Credit", tone: "gold" },
  { id: "habib-titanium", bank: "bank_al_habib", name: "Mastercard Titanium Debit", tone: "dark" },
  { id: "scb-plat", bank: "standard_chartered", name: "Visa Platinum", tone: "plat" },
  { id: "scb-infinite", bank: "standard_chartered", name: "Visa Infinite", tone: "dark" },
  { id: "askari-gold", bank: "askari", name: "Visa Gold Debit", tone: "gold" },
  { id: "faysal-plat", bank: "faysal", name: "Visa Platinum", tone: "plat" },
  { id: "faysal-titanium", bank: "faysal", name: "Mastercard Titanium", tone: "dark" },
];

export const bankName = (slug: string) => BANKS.find((b) => b.slug === slug)?.name ?? slug;
export const cardById = (id: string) => SAMPLE_CARDS.find((c) => c.id === id)!;

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&q=70&auto=format&fit=crop`;
const WEEKDAYS: Day[] = ["Mon", "Tue", "Wed", "Thu"];
const WEEKEND: Day[] = ["Fri", "Sat", "Sun"];

/** Illustrative only — fictional places, used to show how the app works. */
export const SAMPLE_DEALS: SampleDeal[] = [
  // desi
  { place: "Saffron House", category: "desi", area: "Clifton", km: 1.2, card: "meezan-plat", pct: 40, cap: 7000, days: WEEKEND, img: img("1563379091339-03b21ab4a4f8"), rating: 4.6, reviews: 1240 },
  { place: "Karahi Corner", category: "desi", area: "Boat Basin", km: 2.0, card: "ubl-classic", pct: 10, days: [...DAYS], img: img("1585937421612-70a008356fbe"), rating: 4.7, reviews: 2103 },
  { place: "Tikka Town", category: "desi", area: "Tariq Road", km: 3.6, card: "mcb-gold", pct: 25, cap: 3500, days: [...DAYS], img: img("1599487488170-d11ec9c172f0"), rating: 4.4, reviews: 860 },
  { place: "Samosa & Co.", category: "desi", area: "Gulshan", km: 5.1, card: "hblisl-classic", pct: 15, days: WEEKDAYS, img: img("1601050690597-df0568f70950"), rating: 4.2, reviews: 318 },
  // italian
  { place: "Pizzeria Uno Mas", category: "italian", area: "Clifton Block 4", km: 3.1, card: "hbl-gold", pct: 35, cap: 4000, days: ["Fri", "Sat"], img: img("1565299624946-b28f40a0ae38"), rating: 4.1, reviews: 645 },
  { place: "Trattoria Verde", category: "italian", area: "Zamzama", km: 1.7, card: "scb-plat", pct: 30, cap: 6000, days: WEEKDAYS, img: img("1621996346565-e3dbc646d9a9"), rating: 4.5, reviews: 534 },
  { place: "Forno Rosso", category: "italian", area: "DHA Phase 8", km: 4.0, card: "alfalah-gold", pct: 20, days: [...DAYS], img: img("1473093295043-cdd812d0e601"), rating: 4.3, reviews: 297 },
  // chinese
  { place: "Noodle Lane", category: "chinese", area: "Zamzama", km: 1.9, card: "meezan-plat", pct: 20, days: WEEKDAYS, img: img("1569718212165-3a8278d5f624"), rating: 4.2, reviews: 388 },
  { place: "Golden Wok", category: "chinese", area: "Shahrah-e-Faisal", km: 4.6, card: "habib-gold", pct: 30, cap: 5000, days: [...DAYS], img: img("1525755662778-989d0524087e"), rating: 4.4, reviews: 1012 },
  { place: "Dim Sum Garden", category: "chinese", area: "Clifton", km: 1.5, card: "faysal-plat", pct: 25, cap: 4000, days: ["Tue", "Sat", "Sun"], img: img("1563245372-f21724e3856d"), rating: 4.6, reviews: 455 },
  { place: "Red Lantern", category: "chinese", area: "Bahadurabad", km: 6.2, card: "askari-gold", pct: 15, days: WEEKDAYS, img: img("1496116218417-1a781b1c416c"), rating: 4.0, reviews: 201 },
  // ice cream
  { place: "Scoop Street", category: "icecream", area: "DHA Phase 6", km: 0.9, card: "hblisl-titanium", pct: 20, days: [...DAYS], img: img("1497034825429-c343d7c6a68f"), rating: 4.5, reviews: 690 },
  { place: "Frost & Cone", category: "icecream", area: "Sea View", km: 3.8, card: "askari-gold", pct: 15, days: WEEKEND, img: img("1501443762994-82bd5dace89a"), rating: 4.3, reviews: 412 },
  { place: "Sundae Club", category: "icecream", area: "Khayaban-e-Shahbaz", km: 2.2, card: "mcbisl-debit", pct: 25, cap: 1500, days: WEEKDAYS, img: img("1563805042-7684c019e1cb"), rating: 4.4, reviews: 266 },
  // cafe
  { place: "Bun & Bean", category: "cafe", area: "DHA Phase 6", km: 0.8, card: "hbl-gold", pct: 25, cap: 3000, days: WEEKDAYS, img: img("1551024601-bec78aea704b"), rating: 4.3, reviews: 512 },
  { place: "The Chai Stop", category: "cafe", area: "Khayaban-e-Ittehad", km: 0.5, card: "ubl-classic", pct: 15, cap: 1500, days: ["Sat", "Sun"], img: img("1495474472287-4d71bcdd2085"), rating: 4.4, reviews: 276 },
  { place: "Brew Theory", category: "cafe", area: "DHA Phase 5", km: 1.4, card: "meezan-titanium", pct: 30, cap: 2500, days: [...DAYS], img: img("1509042239860-f550ce710b93"), rating: 4.5, reviews: 702 },
  // dining
  { place: "Coal & Smoke", category: "dining", area: "Bukhari Commercial", km: 2.4, card: "alfalah-sig", pct: 30, cap: 5000, days: [...DAYS], img: img("1544025162-d76694265947"), rating: 4.5, reviews: 980 },
  { place: "The Terrace", category: "dining", area: "Clifton Block 5", km: 2.7, card: "scb-infinite", pct: 50, cap: 10000, days: ["Wed", "Sun"], img: img("1414235077428-338989a2e8c0"), rating: 4.8, reviews: 431 },
  { place: "Harbour Table", category: "dining", area: "Port Grand", km: 5.4, card: "ubl-sig", pct: 20, cap: 6000, days: ["Tue", "Fri", "Sat"], img: img("1517248135467-4c7edcad34c4"), rating: 4.3, reviews: 389 },
  { place: "Sushi Tide", category: "dining", area: "Sea View", km: 3.3, card: "mcb-plat", pct: 35, cap: 7000, days: WEEKEND, img: img("1579871494447-9811cf80d66c"), rating: 4.6, reviews: 577 },
  { place: "Lantern Rooftop", category: "dining", area: "Saddar", km: 4.9, card: "habib-titanium", pct: 20, days: WEEKDAYS, img: img("1414235077428-338989a2e8c0"), rating: 4.1, reviews: 164 },
  { place: "Olive & Ash", category: "dining", area: "Gizri", km: 2.9, card: "faysal-titanium", pct: 25, cap: 5000, days: [...DAYS], img: img("1517248135467-4c7edcad34c4"), rating: 4.4, reviews: 352 },
  { place: "Copper Kettle", category: "cafe", area: "Bath Island", km: 2.1, card: "hbl-plat", pct: 20, cap: 2000, days: [...DAYS], img: img("1495474472287-4d71bcdd2085"), rating: 4.2, reviews: 240 },
];

export const FAQS = [
  {
    q: "Do I need to share my card number?",
    a: "No. You only tell us which bank and card type you have — for example “Meezan Visa Platinum Debit”. We never ask for card numbers, PINs, CVVs or bank logins.",
  },
  {
    q: "Where do the discounts come from?",
    a: "From the official discount pages of each bank, refreshed regularly so expired deals drop off. Discounts can change at short notice, so it's always worth confirming with the restaurant before you pay.",
  },
  {
    q: "Which banks are included?",
    a: "At launch: HBL, HBL Islamic, Meezan Bank, Bank Alfalah, UBL, MCB, MCB Islamic, Bank AL Habib, Standard Chartered, Askari Bank and Faysal Bank — with more to follow.",
  },
  {
    q: "Which cities will it cover?",
    a: "We start where bank discounts are densest and use waitlist sign-ups to decide which cities come next — so pick your city when you join.",
  },
  {
    q: "What does joining the waitlist do?",
    a: "You get early access before the public launch and a single email when it's ready. Joining is free and doesn't commit you to anything.",
  },
];
