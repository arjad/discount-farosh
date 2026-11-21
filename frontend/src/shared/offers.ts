/** Small helpers about offers, shared by the dashboard, restaurant pages and the chat assistant.
 *  (Kept out of Dashboard.tsx so other pages can use them without loading the dashboard's styles.) */
import type { DashOffer } from "../dashboard/api";
import { CATEGORIES } from "../home/data";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const placeName = (o: DashOffer) => o.business?.name ?? o.title;

export function daysText(days?: string[] | null) {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  const ordered = DAYS.filter((d) => days.includes(d));
  if (ordered.join() === "Fri,Sat,Sun") return "Weekends (Fri–Sun)";
  if (ordered.join() === "Sat,Sun") return "Weekends";
  if (ordered.join() === "Mon,Tue,Wed,Thu") return "Mon–Thu";
  return ordered.join(", ");
}

// ---------------------------------------------------------------- cuisine (filter categories)

export type Cuisine = (typeof CATEGORIES)[number]["id"];
export const CUISINE_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label])) as Record<Cuisine, string>;
const CUISINE_WORDS: [Cuisine, RegExp][] = [
  ["icecream", /ice ?cream|gelato|froyo|frozen yogh?urt|kulfi|sundae|creamery|baskin|cold stone|scoop/],
  ["cafe", /caf[eé]|coffee|espresso|bakery|bakers|patisserie|donut|doughnut|cake|brew|roaster|tea house|chai|starbucks|gloria jean|tim hortons|dunkin/],
  ["italian", /italian|pizza|pizzeria|pasta|trattoria|lasagn|risotto|domino|papa john|broadway|california pizza/],
  ["chinese", /chinese|wok|dim ?sum|noodle|szechuan|sichuan|chow ?mein|manchurian|oriental|pan.?asian|panda|ginsoy|ho lee/],
  ["desi", /desi|biryani|karahi|nihari|haleem|tikka|kabab|kebab|bbq|barbeque|sajji|handi|tandoor|paratha|halwa|dhaba|mughlai|lahori|peshawari|pakistani|savour/],
];
const DINING_CATS = /dining|food|restaurant|eat/;

/** Map an offer to one of the six dashboard categories (desi, italian, chinese, ice cream, café, dining). */
export function cuisineOf(o: DashOffer): Cuisine | null {
  const text = `${o.business?.name ?? ""} ${o.title} ${o.description ?? ""} ${o.business?.category ?? ""}`.toLowerCase();
  for (const [id, re] of CUISINE_WORDS) if (re.test(text)) return id;
  return DINING_CATS.test(`${o.category ?? ""} ${o.business?.category ?? ""}`.toLowerCase()) ? "dining" : null;
}

