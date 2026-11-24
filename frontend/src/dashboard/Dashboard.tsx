import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import logo from "../assets/logo.png";
import { dashApi, type DashBranch, type DashOffer, type DashboardData } from "./api";
import { CATEGORIES } from "../home/data";
import { CUISINE_LABEL, cuisineOf, daysText, placeName, type Cuisine } from "../shared/offers";
export { daysText, placeName }; // used by the restaurant page
import { ALL_BANKS, cardKey, cardMatches, splitCardKey } from "../shared/banks";
import type { UserCard } from "../profile/api";
import { type Coords, fmtKm, nearestBranch, placeOf, useMyLocation } from "../shared/geo";
import { mapsDirectionsUrl, mapsPlaceUrl } from "../shared/maps/links";
import { shortAddress, useCurrentAddress } from "../shared/maps/api";
import { authApi, type Me } from "../auth/api";
import { profileApi, type Profile } from "../profile/api";
import { AddressPicker, type ActiveLoc } from "./AddressPicker";
import { recordViews, saveFavourite } from "../shared/views";
import { ACTIVE_KEY, readActive } from "../shared/activeLocation";
import { ChatBot, SHARED_HELPERS } from "./ChatBot";
import { openStatus, weekRows, type OpenStatus } from "../shared/hours";
import { areaOf, OTHER_AREA } from "../shared/areas";
import { offerPath, parsePath, resolveDeep, restaurantPath, shareLink } from "../shared/links";
import "./dashboard.css";

// ---------------------------------------------------------------- helpers

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const TODAY = DAYS[(new Date().getDay() + 6) % 7];

const CATEGORY_LABEL: Record<string, string> = {
  dining: "Dining",
  health: "Health",
  entertainment: "Entertainment",
  online: "Online",
  education: "Education",
  self_care: "Self care",
  lifestyle: "Lifestyle",
  services: "Services",
  other: "Other",
};
const catLabel = (c?: string | null) => (c ? CATEGORY_LABEL[c] ?? c.replace(/_/g, " ") : "Other");


const money = (n?: number | null, cur = "PKR") => (n == null ? null : `${cur} ${n.toLocaleString("en-PK")}`);
export const pct = (n?: number | null) => (n == null ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)}%`);

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}


function daysLeft(iso?: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso + "T23:59:59").getTime() - Date.now()) / 86_400_000);
}

const offerDays = (o: DashOffer) => (o.valid_days && o.valid_days.length ? o.valid_days : [...DAYS]);


function initials(name: string) {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ---------------------------------------------------------------- filters

type Sort = "discount" | "expiring" | "place" | "nearest" | "rating";
type Filters = {
  q: string;
  offCards: number[]; // ids of my saved cards I've switched off (all of them are on by default)
  openState: "any" | "open" | "closed";
  favsOnly: boolean; // only deals I've hearted
  maxKm: 0 | 5 | 10 | 15; // only restaurants within this many km of my location (0 = any distance)
  areas: string[]; // neighbourhoods, e.g. "Gulberg", "DHA" — a deal matches if any branch is there // open right now (Pakistan time), by the branch shown on the card
  banks: string[];
  cards: string[];
  places: string[];
  categories: string[]; // cuisines = restaurant food tags ("Cafe", "Desi", "Italian"…); a deal matches if its restaurant has any
  days: string[];
  city: string;
  minDiscount: number;
  sort: Sort;
};
const EMPTY: Filters = { q: "", offCards: [], openState: "any", favsOnly: false, maxKm: 0, areas: [], banks: [], cards: [], places: [], categories: [], days: [], city: "", minDiscount: 0, sort: "discount" };

const toggleId = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** An offer works with my cards if one of its cards matches a saved card — or it lists no cards
 *  (= any card of that bank) and I have a card from that bank. */
const worksWithMyCards = (o: DashOffer, mine: UserCard[]) =>
  o.bank.slug === "direct" // a restaurant's own deal for everyone — no card needed
    ? true
    : o.cards.length
    ? o.cards.some((c) => mine.some((m) => cardMatches(m, o.bank.slug, c.name)))
    : mine.some((m) => m.bank_slug === o.bank.slug);

/** Open right now? Uses the branch the card shows (closest one); null = hours unknown. */
const isOpenNow = (o: DashOffer, me: Coords | undefined, now: Date) =>
  branchStatus(nearestBranch(o, me).branch, o.branches, now).open;

function applyFilters(offers: DashOffer[], f: Filters, me?: Coords, myCards: UserCard[] = [], now = new Date(), favs: number[] = []) {
  const q = f.q.trim().toLowerCase();
  const out = offers.filter((o) => {
    if (f.favsOnly && !favs.includes(o.id)) return false;
    if (f.maxKm && me) {
      // nearest branch must be within range; branches without map coordinates can't be checked
      const km = nearestBranch(o, me).km;
      if (km == null || km > f.maxKm) return false;
    }
    if (f.openState !== "any" && isOpenNow(o, me, now) !== (f.openState === "open")) return false;
    if (myCards.length && !worksWithMyCards(o, myCards)) return false;
    if (q && !`${o.title} ${placeName(o)} ${o.bank.name} ${o.description ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.banks.length && !f.banks.includes(o.bank.slug)) return false;
    if (f.cards.length && !o.cards.some((c) => f.cards.includes(cardKey(o.bank.slug, c.name)))) return false;
    if (f.places.length && !f.places.includes(placeName(o))) return false;
    if (f.areas.length && !o.branches.some((b) => f.areas.includes(areaOf(b.address)))) return false;
    if (f.categories.length && !(o.business?.tags ?? []).some((t) => f.categories.includes(t))) return false;
    if (f.days.length && !f.days.some((d) => offerDays(o).includes(d))) return false;
    if (f.city && !o.branches.some((b) => b.city === f.city)) return false;
    if (f.minDiscount && (o.discount_percent ?? 0) < f.minDiscount) return false;
    return true;
  });
  const sorters: Record<Sort, (a: DashOffer, b: DashOffer) => number> = {
    discount: (a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0) || placeName(a).localeCompare(placeName(b)),
    expiring: (a, b) => (a.valid_till ?? "9999").localeCompare(b.valid_till ?? "9999"),
    place: (a, b) => placeName(a).localeCompare(placeName(b)),
    nearest: (a, b) =>
      (nearestBranch(a, me).km ?? Infinity) - (nearestBranch(b, me).km ?? Infinity) ||
      (b.discount_percent ?? 0) - (a.discount_percent ?? 0),
    // unrated places go last
    rating: (a, b) =>
      (b.business?.rating ?? -1) - (a.business?.rating ?? -1) ||
      (b.business?.rating_count ?? 0) - (a.business?.rating_count ?? 0) ||
      (b.discount_percent ?? 0) - (a.discount_percent ?? 0),
  };
  return out.sort(sorters[f.sort]);
}

/** Same restaurant = same business name (case and spacing ignored). */
export const placeKey = (o: DashOffer) => placeName(o).trim().replace(/\s+/g, " ").toLowerCase();

/** Offers grouped by restaurant, in the order the restaurants first appear in the (sorted) list.
 *  Inside a group the best discount comes first. */
function groupByPlace(list: DashOffer[]) {
  const m = new Map<string, DashOffer[]>();
  for (const o of list) {
    const k = placeKey(o);
    (m.get(k) ?? (m.set(k, []), m.get(k)!)).push(o);
  }
  return [...m.entries()].map(([key, items]) => ({
    key,
    offers: [...items].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0)),
  }));
}

/** TEMPORARY: the "Sync now" button is hidden. Set to true to bring it back (or delete it for good). */
const SHOW_SYNC_BUTTON = false;

export { ACTIVE_KEY, readActive } from "../shared/activeLocation"; // used by the restaurant page


/** How many restaurants (or offers) are shown at once; more are added as you scroll. */
const PAGE = 50;

const GROUP_KEY = "df:group-by-place";
function readGrouped() {
  try {
    return localStorage.getItem(GROUP_KEY) !== "0";
  } catch {
    return true;
  }
}

function countBy<T>(items: T[], keys: (t: T) => string[]) {
  const m = new Map<string, number>();
  for (const it of items) for (const k of new Set(keys(it))) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

// ---------------------------------------------------------------- icons

const I = {
  sync: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4" /></svg>
  ),
  search: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  pin: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
  ),
  card: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>,
  cal: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>,
  bank: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>,
  expand: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>,
  globe: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  share: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>,
  ext: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
  phone: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
  ),
  nav: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-8-8 18-2-8-8-2Z" /></svg>,
  filter: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M7 12h10M10 19h4" /></svg>,
  heart: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4Z" /></svg>
  ),
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>,
  user: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  star: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>,
};

// ---------------------------------------------------------------- page

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [selected, setSelected] = useState<DashOffer | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pollRef = useRef<number | null>(null);
  const jobRef = useRef<string | null>(null);
  const { favs, toggle: toggleFav } = useFavourites();
  const { loc, ask: askLocation } = useMyLocation();
  const [grouped, setGrouped] = useState(readGrouped);
  // re-check open/closed every minute
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const toggleGrouped = () => {
    setGrouped((g) => {
      try {
        localStorage.setItem(GROUP_KEY, g ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !g;
    });
  };
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [active, setActiveState] = useState<ActiveLoc>(readActive);
  const setActive = (a: ActiveLoc) => {
    setActiveState(a);
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    if (me) profileApi.get().then(setProfile).catch(() => {});
    else setProfile(null);
  }, [me]);
  const saveAddress = async (kind: "home" | "work", p: { address: string; short_address: string | null; lat: number; lng: number }) => {
    try {
      setProfile(await profileApi.update({ [kind]: { label: p.address, lat: p.lat, lng: p.lng } }));
      setToast({ kind: "ok", text: `Saved as your ${kind === "home" ? "home" : "office"} address.` });
      return true;
    } catch (e) {
      setToast({ kind: "err", text: `Couldn't save the address: ${e instanceof Error ? e.message : e}` });
      return false;
    }
  };
  useEffect(() => {
    authApi.me().then(setMe);
  }, []);
  const markVisited = async (o: DashOffer) => {
    try {
      await profileApi.addVisit(o.id);
      setToast({ kind: "ok", text: `${placeName(o)} added to the places you've visited.` });
    } catch (e) {
      setToast({ kind: "err", text: `Couldn't save the visit: ${e instanceof Error ? e.message : e}` });
    }
  };

  const load = useCallback(async () => {
    try {
      setData(await dashApi.offers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // ---- sync (scrape all sources again) — runs quietly in the background.
  // The user only sees a short "sync started" toast; when it finishes the offers are reloaded silently.
  const watchJob = useCallback(
    (id: string) => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      jobRef.current = id;
      pollRef.current = window.setInterval(async () => {
        try {
          const j = await dashApi.job(id);
          if (j.status === "done" || j.status === "failed") {
            window.clearInterval(pollRef.current!);
            pollRef.current = null;
            jobRef.current = null;
            await load();
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    },
    [load],
  );

  const startSync = async () => {
    if (jobRef.current) {
      setToast({ kind: "ok", text: "Sync is already running — deals will update when it's done." });
      return;
    }
    try {
      const j = await dashApi.startSync();
      watchJob(j.id);
      setToast({ kind: "ok", text: "Sync started — deals will update automatically." });
    } catch (e) {
      setToast({ kind: "err", text: `Could not start sync: ${e instanceof Error ? e.message : e}` });
    }
  };

  useEffect(() => {
    load();
    // keep watching a sync that is already running (e.g. after a page refresh)
    dashApi
      .jobs()
      .then((jobs) => {
        const running = jobs.find((j) => j.status === "running" || j.status === "queued");
        if (running) watchJob(running.id);
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load, watchJob]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Dashboard";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === "err" ? 7000 : 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (closePlaceRef.current(), setFiltersOpen(false));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = selected || filtersOpen ? "hidden" : "";
  }, [selected, filtersOpen]);

  const offers = data?.offers ?? [];
  // distances are measured from the address picked in the top bar (or the live location)
  const origin = active.source === "current" ? loc.coords : active.coords;
  const myCards = useMemo(() => profile?.cards ?? [], [profile]);
  // my saved cards are selected by default — except cards that have no deals at all, which would
  // only empty the list. Worked out once, when both my cards and the offers have loaded.
  const cardsInitDone = useRef(false);
  useEffect(() => {
    if (cardsInitDone.current || !profile || !data) return;
    cardsInitDone.current = true;
    // All my saved cards start ticked (deals for ANY ticked card show, so a card with no deals hides nothing).
    // Only if none of my cards has a deal here do they all start unticked — otherwise the list would be empty.
    const anyDeals = profile.cards.some((c) => offers.some((o) => worksWithMyCards(o, [c])));
    const noDeals = anyDeals ? [] : profile.cards.map((c) => c.id);
    // bank buttons: pre-select the banks of my saved cards (only banks that have deals here)
    const haveDeals = new Set(offers.map((o) => o.bank.slug));
    const myBanks = [...new Set(profile.cards.map((c) => c.bank_slug))].filter((b) => haveDeals.has(b));
    setFilters((f) => ({
      ...f,
      offCards: noDeals.length ? noDeals : f.offCards,
      banks: f.banks.length ? f.banks : myBanks,
    }));
  }, [profile, data, offers]);
  const allCardsOff = useMemo(() => myCards.map((c) => c.id), [myCards]);
  /** Clearing filters also switches my cards off, so every deal shows. */
  const clearAll = () => setFilters({ ...EMPTY, sort: filters.sort, offCards: allCardsOff });
  const selectedCards = useMemo(() => myCards.filter((c) => !filters.offCards.includes(c.id)), [myCards, filters.offCards]);
  const visible = useMemo(
    () => applyFilters(offers, filters, origin, selectedCards, now, favs),
    [offers, filters, origin, selectedCards, now, favs],
  );
  const groups = useMemo(() => groupByPlace(visible), [visible]);

  // ---- infinite scroll: show 50 at a time, add 50 more when the bottom comes into view
  const total = grouped ? groups.length : visible.length;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [filters, grouped, origin]); // new list -> start from the top
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setShown((n) => Math.min(n + PAGE, total)),
      { rootMargin: "400px 0px" }, // start a little before the bottom so it feels seamless
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, total]);
  // every offer at the selected restaurant (ignoring filters), for the drawer's "all offers here" list
  const siblings = useMemo(
    () => (selected ? groupByPlace(offers.filter((o) => placeKey(o) === placeKey(selected)))[0]?.offers ?? [] : []),
    [offers, selected],
  );
  // ---- shareable links: /dashboard/restaurant/<id>-<name> and /dashboard/offer/<id>-<name>
  const [focusOfferId, setFocusOfferId] = useState<number | null>(null);
  const restaurantOffers = (o: DashOffer) => offers.filter((x) => placeKey(x) === placeKey(o));
  const go = (path: string) => {
    if (window.location.pathname + window.location.search !== path) window.history.pushState(null, "", path);
  };
  /** Open a restaurant's sidebar (optionally pointing at one offer) and put its link in the address bar. */
  const openPlace = (o: DashOffer, offerId: number | null = null) => {
    setSelected(o);
    setFocusOfferId(offerId);
    const all = restaurantOffers(o);
    recordViews(offerId ? [offerId] : all.map((x) => x.id), "sidebar");
    const target = offerId ? all.find((x) => x.id === offerId) ?? o : o;
    go(offerId ? offerPath(target, placeName(o), all, "/dashboard") : restaurantPath(placeName(o), all.length ? all : [o], "/dashboard"));
  };
  const closePlace = () => {
    setSelected(null);
    setFocusOfferId(null);
    go("/dashboard");
  };
  const closePlaceRef = useRef(closePlace);
  closePlaceRef.current = closePlace;

  /** Show whatever the address bar points at (on first load, and on browser back/forward). */
  const applyPath = useCallback(() => {
    if (!data) return;
    const d = parsePath(window.location.pathname, window.location.search);
    if (!d) {
      setSelected(null);
      setFocusOfferId(null);
      return;
    }
    const hit = resolveDeep(d, data.offers, placeKey);
    if (!hit) return setToast({ kind: "warn", text: "That link has expired or isn't available — showing all deals instead." });
    if (d.kind === "restaurant" && d.offer && hit.focus == null)
      setToast({ kind: "warn", text: "That offer has expired or isn't available — here are the restaurant's current offers." });
    setSelected(hit.offers[0]);
    setFocusOfferId(hit.focus);
    recordViews(hit.focus != null ? [hit.focus] : hit.offers.map((x) => x.id), "link");
  }, [data]);
  useEffect(() => {
    applyPath();
    window.addEventListener("popstate", applyPath);
    return () => window.removeEventListener("popstate", applyPath);
  }, [applyPath]);

  const share = async (path: string, title: string, text: string) => {
    const res = await shareLink(window.location.origin + path, title, text);
    if (res === "copied") setToast({ kind: "ok", text: "Link copied — paste it to share." });
    else if (res === "failed") setToast({ kind: "warn", text: `Copy this link: ${window.location.origin + path}` });
  };
  const shareRestaurant = () => {
    if (!selected) return;
    const name = placeName(selected);
    share(restaurantPath(name, siblings.length ? siblings : [selected]), name, `Card discounts at ${name}`);
  };
  const shareOffer = (o: DashOffer) => {
    const name = placeName(o);
    const what = o.discount_percent != null ? `${pct(o.discount_percent)} off` : o.title;
    share(offerPath(o, name, restaurantOffers(o)), `${what} at ${name}`, `${what} at ${name} with ${o.bank.name} cards — ${daysText(o.valid_days)}`);
  };

  // my exact address from Google (house no., street, area) — no more guessing from nearby restaurants
  const myAddress = useCurrentAddress(loc.coords);
  // exact address (house no., street, area) — or ask for it; never a vague "Lahore"
  const myPlace = myAddress ? shortAddress(myAddress) : "Set your exact address";
  const addressLabel =
    active.source === "current"
      ? loc.status === "ok"
        ? myPlace
        : loc.status === "denied" || loc.status === "unsupported"
          ? "Set your exact address"
          : "Locating…"
      : `${active.source === "home" ? "Home · " : active.source === "work" ? "Office · " : ""}${active.label}`;
  const activeCount =
    filters.banks.length + filters.cards.length + filters.places.length + filters.categories.length +
    (filters.favsOnly ? 1 : 0) + (filters.maxKm && origin ? 1 : 0) + (filters.openState !== "any" ? 1 : 0) + filters.areas.length + filters.days.length + (filters.city ? 1 : 0) + (filters.minDiscount ? 1 : 0) + (filters.q ? 1 : 0) +
    (selectedCards.length ? 1 : 0);
  // would anything show if my cards weren't limiting the list?
  const hiddenByCards = useMemo(
    () => (selectedCards.length && visible.length === 0 ? applyFilters(offers, filters, origin, [], now, favs).length : 0),
    [selectedCards, visible, offers, filters, origin],
  );


  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-top-inner">
        <a href="/" className="dash-brand">
          <img src={logo} alt="Discount فرویش" />
        </a>
        <AddressPicker
          active={active}
          label={addressLabel}
          onPick={setActive}
          loc={loc}
          currentLabel={loc.status === "ok" ? myPlace : null}
          askLocation={askLocation}
          home={profile?.home}
          work={profile?.work}
          loggedIn={!!me}
          onSave={saveAddress}
        />
        <div className="dash-top-right">
          {me ? (
            <a href="/profile" className="dash-user" title="My profile">
              <span className="dash-avatar" aria-hidden="true">
                {me.avatar ? <img src={me.avatar} alt="" /> : (me.full_name || me.email).charAt(0).toUpperCase()}
              </span>
              <span className="dash-user-text">
                <b className="dash-user-name">{me.full_name || me.email}</b>
              </span>
            </a>
          ) : (
            <a href="/login?next=/dashboard" className="dash-login">
              <span className="dash-login-icon">{I.user}</span>
              <span className="dash-login-text">Log in</span>
            </a>
          )}
        </div>
        </div>
      </header>


      <div className="dash-body">
        <FilterPanel
          offers={offers}
          filters={filters}
          setFilters={setFilters}
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          resultCount={visible.length}
          loggedIn={!!me}
          myCards={myCards}
          origin={origin}
          now={now}
          loading={!data}
          favCount={offers.filter((o) => favs.includes(o.id)).length}
        />

        <main className="dash-main">
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Dashboard</span>
          </nav>
          <div className="toolbar">
            <label className="search">
              {I.search}
              <input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                placeholder="Search restaurant, offer or bank…"
                aria-label="Search offers"
              />
              {filters.q && (
                <button className="icon-btn sm" onClick={() => setFilters({ ...filters, q: "" })} aria-label="Clear search">
                  {I.close}
                </button>
              )}
            </label>
            <div className="sort-pills" role="group" aria-label="Sort by">
              <span className="sort-label">Sort by</span>
              {([
                ["nearest", "Distance"],
                ["discount", "Discount"],
                ["rating", "Ratings"],
              ] as [Sort, string][]).map(([k, label]) => (
                <button
                  key={k}
                  className={`pill ${filters.sort === k ? "on" : ""}`}
                  aria-pressed={filters.sort === k}
                  onClick={() => {
                    if (k === "nearest" && !origin) askLocation();
                    setFilters({ ...filters, sort: k });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn-filters" onClick={() => setFiltersOpen(true)}>
              {I.filter} Filters{activeCount ? <b>{activeCount}</b> : null}
            </button>
            <div className="sync-group">
              <span className="dash-synced" title={data?.last_synced_at ?? ""}>
                <i className="dot" />
                Last synced {timeAgo(data?.last_synced_at)}
              </span>
              {SHOW_SYNC_BUTTON && <button className="btn-sync" onClick={startSync}>
                {I.sync}
                Sync now
              </button>}
            </div>
          </div>

          <div className="result-line">
            <span>
              {!data ? (
                <span className="sk sk-inline" style={{ width: 210 }} aria-label="Loading counts" />
              ) : grouped ? (
                <><b>{groups.length}</b> restaurants · {visible.length} of {offers.length} offers</>
              ) : (
                <><b>{visible.length}</b> of {offers.length} offers</>
              )}
              {filters.places.length === 1 ? ` at ${filters.places[0]}` : ""}
            </span>
            <label className="group-toggle">
              <input type="checkbox" checked={grouped} onChange={toggleGrouped} />
              <span className="switch" aria-hidden="true" />
              Group by restaurant
            </label>
            {activeCount > 0 && (
              <button className="link-btn" onClick={clearAll}>
                Clear all filters
              </button>
            )}
          </div>


          <ActiveChips
            filters={filters}
            setFilters={setFilters}
            offers={offers}
            selectedCards={selectedCards.length}
            onCardsOff={() => setFilters({ ...filters, offCards: allCardsOff })}
          />

          {error && (
            <div className="state err">
              <b>Couldn't load offers.</b> Is the backend running on port 8000?
              <code>{error}</code>
              <button className="btn-ghost" onClick={load}>Try again</button>
            </div>
          )}

          {!data && !error && (
            <div className="grid" aria-busy="true" aria-label="Loading deals">
              {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {data && visible.length === 0 && (
            <div className="state">
              {hiddenByCards > 0 ? (
                <>
                  <b>None of your selected cards have deals here yet.</b>
                  <span className="muted">
                    {hiddenByCards} deals match your other filters, but they need cards from{" "}
                    {[...new Set(offers.map((o) => o.bank.name))].join(", ")}.
                  </span>
                  <button className="btn-ghost" onClick={() => setFilters({ ...filters, offCards: allCardsOff })}>
                    Show all deals
                  </button>
                </>
              ) : (
                <>
                  <b>No offers match these filters.</b>
                  <button className="btn-ghost" onClick={clearAll}>Clear filters</button>
                </>
              )}
            </div>
          )}

          <div className="grid">
            {grouped && groups.slice(0, shown).map((g) =>
              g.offers.length > 1 ? (
                <GroupCard
                  key={g.key}
                  offers={g.offers}
                  onOpen={() => openPlace(g.offers[0])}
                  active={!!selected && g.offers.some((o) => o.id === selected.id)}
                  fav={g.offers.some((o) => favs.includes(o.id))}
                  onToggleFav={() => {
                    const on = g.offers.filter((o) => favs.includes(o.id));
                    (on.length ? on : [g.offers[0]]).forEach((o) => toggleFav(o.id));
                  }}
                  me={origin}
                  now={now}
                />
              ) : (
                <OfferCard
                  key={g.key}
                  o={g.offers[0]}
                  count={1}
                  onOpen={() => openPlace(g.offers[0])}
                  active={selected?.id === g.offers[0].id}
                  fav={favs.includes(g.offers[0].id)}
                  onToggleFav={() => toggleFav(g.offers[0].id)}
                  me={origin}
                  now={now}
                />
              ),
            )}
            {!grouped && visible.slice(0, shown).map((o) => (
              <OfferCard
                key={o.id}
                o={o}
                onOpen={() => openPlace(o)}
                active={selected?.id === o.id}
                fav={favs.includes(o.id)}
                onToggleFav={() => toggleFav(o.id)}
                me={origin}
                now={now}
              />
            ))}
          </div>

          {/* infinite scroll: when this comes into view, the next 50 are added */}
          {data && shown < total && (
            <div ref={moreRef} className="grid more" aria-busy="true" aria-label="Loading more restaurants">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}
          {data && total > PAGE && shown >= total && (
            <p className="list-end">You've seen all {total} {grouped ? "restaurants" : "offers"}.</p>
          )}
        </main>
      </div>

      <Drawer offer={selected} siblings={siblings} onPickOffer={setSelected} loggedIn={!!me} onVisited={markVisited} onClose={closePlace}
        focusOfferId={focusOfferId} onShareRestaurant={shareRestaurant} onShareOffer={shareOffer} onPickPlace={(p) => {
        setFilters({ ...filters, places: [p] });
        closePlace();
      }} />

      <ChatBot offers={offers} helpers={SHARED_HELPERS} onOpenOffer={(o) => openPlace(o, o.id)} />

      {toast && (
        <div
          key={toast.text}
          className={`toast ${toast.kind}`}
          role="status"
          style={{ ["--life" as string]: `${toast.kind === "err" ? 7000 : 4000}ms` } as React.CSSProperties}
        >
          {toast.text}
          <button className="icon-btn sm" onClick={() => setToast(null)} aria-label="Dismiss">{I.close}</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- filter panel

function FilterPanel({
  offers,
  filters,
  setFilters,
  open,
  onClose,
  resultCount,
  loggedIn,
  myCards,
  origin,
  now,
  loading,
  favCount,
}: {
  offers: DashOffer[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  open: boolean;
  onClose: () => void;
  resultCount: number;
  loggedIn: boolean;
  myCards: UserCard[];
  origin?: Coords;
  now: Date;
  loading: boolean;
  favCount: number;
}) {
  // deals within 5 / 10 / 15 km of my location
  const kmCounts = useMemo(() => {
    const c = { 0: offers.length, 5: 0, 10: 0, 15: 0 } as Record<0 | 5 | 10 | 15, number>;
    if (!origin) return c;
    for (const o of offers) {
      const km = nearestBranch(o, origin).km;
      if (km == null) continue;
      if (km <= 5) c[5]++;
      if (km <= 10) c[10]++;
      if (km <= 15) c[15]++;
    }
    return c;
  }, [offers, origin]);
  const openCounts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const o of offers) {
      const s = isOpenNow(o, origin, now);
      if (s === true) open++;
      else if (s === false) closed++;
    }
    return { any: offers.length, open, closed };
  }, [offers, origin, now]);
  // every bank (ones with deals first), with how many deals each has here
  const bankList = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>(ALL_BANKS.map((b) => [b.slug, { name: b.name, n: 0 }]));
    for (const o of offers) m.set(o.bank.slug, { name: o.bank.name, n: (m.get(o.bank.slug)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));
  }, [offers]);

  // how many deals each saved card unlocks
  const perCard = useMemo(
    () => new Map(myCards.map((c) => [c.id, offers.filter((o) => worksWithMyCards(o, [c])).length])),
    [offers, myCards],
  );
  // show the scrollbar only while scrolling (here and in the inner lists)
  const timers = useRef(new Map<Element, number>());
  const onScroll = (e: UIEvent) => {
    const el = e.target as Element;
    el.classList.add("scrolling");
    window.clearTimeout(timers.current.get(el));
    timers.current.set(el, window.setTimeout(() => el.classList.remove("scrolling"), 900));
  };
  const [placeQuery, setPlaceQuery] = useState("");
  const places = useMemo(() => [...countBy(offers, (o) => [placeName(o)])].sort((a, b) => a[0].localeCompare(b[0])), [offers]);
  // cuisines: every food tag in the deals, most deals first
  const cats = useMemo(
    () => [...countBy(offers, (o) => o.business?.tags ?? [])].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [offers],
  );
  const [allCuisines, setAllCuisines] = useState(false);
  const CUISINES_SHOWN = 12;
  const shownCats = allCuisines ? cats : cats.filter(([c], i) => i < CUISINES_SHOWN || filters.categories.includes(c));
  const cities = useMemo(() => [...countBy(offers, (o) => o.branches.map((b) => b.city ?? "").filter(Boolean))].sort(), [offers]);
  const shownPlaces = places.filter(([p]) => p.toLowerCase().includes(placeQuery.toLowerCase()));
  // area -> number of deals with a branch there (most deals first, "Other" last)
  const [areaQuery, setAreaQuery] = useState("");
  const areas = useMemo(
    () =>
      [...countBy(offers, (o) => o.branches.map((b) => areaOf(b.address)))].sort((a, b) =>
        a[0] === OTHER_AREA ? 1 : b[0] === OTHER_AREA ? -1 : b[1] - a[1] || a[0].localeCompare(b[0]),
      ),
    [offers],
  );
  const shownAreas = areas.filter(([a]) => a.toLowerCase().includes(areaQuery.toLowerCase()));

  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  return (
    <>
      <div className={`scrim ${open ? "show" : ""} only-mobile`} onClick={onClose} />
      <aside className={`filters ${open ? "open" : ""}`} aria-label="Filters" onScrollCapture={onScroll}>
        <div className="filters-head">
          <h2>Filters</h2>
          <button className="icon-btn only-mobile" onClick={onClose} aria-label="Close filters">{I.close}</button>
        </div>

        <section>
          <h3>Favourites</h3>
          <Check label="Only my favourites ♥" count={favCount} on={filters.favsOnly} onChange={() => set({ favsOnly: !filters.favsOnly })} />
        </section>

        <section>
          <h3>Distance</h3>
          <div className={`chip-row ${origin ? "" : "chips-off"}`} role="radiogroup" aria-label="Distance from my location">
            {([
              [0, "Any"],
              [5, "5 km"],
              [10, "10 km"],
              [15, "15 km"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={filters.maxKm === k}
                className={`chip ${filters.maxKm === k ? "on" : ""}`}
                disabled={!origin && k !== 0}
                onClick={() => set({ maxKm: k })}
                title={k ? `Restaurants within ${k} km of your location` : "Any distance"}
              >
                {label} {origin && !loading && k !== 0 && <small>{kmCounts[k]}</small>}
              </button>
            ))}
          </div>
          {!origin && <p className="muted small hint">Set your location in the top bar to filter by distance.</p>}
        </section>

        <section>
          <h3>Open now</h3>
          <div className="chip-row" role="radiogroup" aria-label="Open or closed">
            {([
              ["any", "All"],
              ["open", "Open"],
              ["closed", "Closed"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={filters.openState === k}
                className={`chip ${filters.openState === k ? "on" : ""}`}
                onClick={() => set({ openState: k })}
              >
                {label} {loading ? <span className="sk sk-num" /> : <small>{openCounts[k]}</small>}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Day you're going</h3>
          <div className="day-row">
            {DAYS.map((d) => (
              <button
                key={d}
                className={`day ${filters.days.includes(d) ? "on" : ""} ${d === TODAY ? "today" : ""}`}
                onClick={() => set({ days: toggle(filters.days, d) })}
                aria-pressed={filters.days.includes(d)}
                title={d === TODAY ? "Today" : undefined}
              >
                {d.slice(0, 2)}
              </button>
            ))}
          </div>
          <button className="link-btn" onClick={() => set({ days: filters.days.join() === TODAY ? [] : [TODAY] })}>
            {filters.days.join() === TODAY ? "Any day" : "Only today's deals"}
          </button>
        </section>

        <section>
          <h3>Area</h3>
          {areas.length > 8 && (
            <input
              className="mini-search"
              value={areaQuery}
              onChange={(e) => setAreaQuery(e.target.value)}
              placeholder="Search areas…"
              aria-label="Search areas"
            />
          )}
          <div className="scroll-list">
            {loading && <span className="sk sk-line" style={{ width: "70%" }} />}
            {shownAreas.map(([a, n]) => (
              <Check key={a} label={a} count={n} on={filters.areas.includes(a)} onChange={() => set({ areas: toggle(filters.areas, a) })} />
            ))}
            {!loading && shownAreas.length === 0 && <p className="muted small">No area matches “{areaQuery}”.</p>}
          </div>
        </section>

        <section>
          <h3>Restaurant / place</h3>
          <input
            className="mini-search"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            placeholder={loading ? "Search places…" : `Search ${places.length} places…`}
            aria-label="Search places"
          />
          <div className="scroll-list tall">
            {shownPlaces.map(([name, n]) => (
              <Check key={name} label={name} count={n} on={filters.places.includes(name)} onChange={() => set({ places: toggle(filters.places, name) })} />
            ))}
            {shownPlaces.length === 0 && <p className="muted small">No place matches “{placeQuery}”.</p>}
          </div>
        </section>

        <section>
          <h3>Cuisine {cats.length > 0 && <small className="h3-note">{cats.length}</small>}</h3>
          <div className="chip-row">
            {loading && [60, 48, 70, 54, 64].map((w, i) => <span key={i} className="sk sk-chip" style={{ width: w }} />)}
            {shownCats.map(([c, n]) => (
              <button
                key={c}
                className={`chip ${filters.categories.includes(c) ? "on" : ""}`}
                onClick={() => set({ categories: toggle(filters.categories, c) })}
                aria-pressed={filters.categories.includes(c)}
              >
                {c} <small>{n}</small>
              </button>
            ))}
          </div>
          {cats.length > CUISINES_SHOWN && (
            <button className="link-btn more-cuisines" onClick={() => setAllCuisines(!allCuisines)}>
              {allCuisines ? "Show fewer" : `Show all ${cats.length} cuisines`}
            </button>
          )}
        </section>

        <section>
          <h3>Minimum discount <b className="accent-num">{filters.minDiscount ? `${filters.minDiscount}%+` : "Any"}</b></h3>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={filters.minDiscount}
            onChange={(e) => set({ minDiscount: Number(e.target.value) })}
            aria-label="Minimum discount"
          />
          <div className="range-scale"><span>0%</span><span>25%</span><span>50%</span></div>
        </section>

        {cities.length > 1 && (
          <section>
            <h3>City</h3>
            <select className="select" value={filters.city} onChange={(e) => set({ city: e.target.value })}>
              <option value="">All cities</option>
              {cities.map(([c, n]) => (
                <option key={c} value={c}>{c} ({n})</option>
              ))}
            </select>
          </section>
        )}

        <section>
          <h3>Banks <small className="h3-note">{bankList.length}</small></h3>
          <Check
            label="All banks"
            count={offers.length}
            on={filters.banks.length === 0}
            onChange={() => set({ banks: [] })}
          />
          <div className="scroll-list">
            {bankList.map(([slug, { name, n }]) => (
              <Check
                key={slug}
                label={myCards.some((c) => c.bank_slug === slug) ? `${name} ★` : name}
                count={n}
                on={filters.banks.includes(slug)}
                onChange={() => set({ banks: toggle(filters.banks, slug) })}
              />
            ))}
          </div>
          {myCards.length > 0 && <p className="muted small hint">★ = a bank you have a card from</p>}
        </section>

        <section className="my-cards">
          <h3>Your cards</h3>
          {loggedIn && myCards.length > 0 ? (
            <>
              <div className="my-card-list">
                {myCards.map((c) => {
                  const on = !filters.offCards.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      className={`my-card ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() => set({ offCards: toggleId(filters.offCards, c.id) })}
                      title={on ? "Showing deals for this card — click to hide them" : "Click to show deals for this card"}
                    >
                      <span className="my-card-check" aria-hidden="true" />
                      <span className="my-card-text">
                        <b>{c.card_name}</b>
                        <small>{c.bank_name} · {perCard.get(c.id) ?? 0} deals</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="muted small hint">
                {myCards.some((c) => !filters.offCards.includes(c.id)) ? "Showing deals for the selected cards." : "No card selected — showing every deal."}{" "}
                <a href="/profile">Edit cards</a>
              </p>
            </>
          ) : (
            <p className="muted small hint">
              {loggedIn ? (
                <>Add the cards you own in your <a href="/profile">profile</a> — they'll show here, already selected.</>
              ) : (
                <><a href="/login?next=/dashboard">Log in</a> and add your cards to see only the deals you can use.</>
              )}
            </p>
          )}
        </section>

        <div className="filters-foot only-mobile">
          <button className="btn-ghost" onClick={() => setFilters({ ...EMPTY, sort: filters.sort, offCards: myCards.map((c) => c.id) })}>Reset</button>
          <button className="btn-primary" onClick={onClose}>Show {resultCount} offers</button>
        </div>
      </aside>
    </>
  );
}

function Check({ label, count, on, onChange }: { label: string; count: number; on: boolean; onChange: () => void }) {
  return (
    <label className={`check ${on ? "on" : ""}`}>
      <input type="checkbox" checked={on} onChange={onChange} />
      <span className="box" aria-hidden="true" />
      <span className="check-label">{label}</span>
      <span className="count">{count}</span>
    </label>
  );
}

function ActiveChips({ filters, setFilters, offers, selectedCards, onCardsOff }: {
  filters: Filters; setFilters: (f: Filters) => void; offers: DashOffer[]; selectedCards: number; onCardsOff: () => void;
}) {
  const bankName = (slug: string) =>
    offers.find((o) => o.bank.slug === slug)?.bank.name ?? ALL_BANKS.find((b) => b.slug === slug)?.name ?? slug;
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.maxKm ? [{ key: "km", label: `Within ${filters.maxKm} km`, remove: () => setFilters({ ...filters, maxKm: 0 }) }] : []),
    ...(filters.favsOnly ? [{ key: "favs", label: "Favourites", remove: () => setFilters({ ...filters, favsOnly: false }) }] : []),
    ...(filters.openState !== "any"
      ? [{ key: "open", label: filters.openState === "open" ? "Open now" : "Closed now", remove: () => setFilters({ ...filters, openState: "any" }) }]
      : []),
    ...(selectedCards ? [{ key: "mycards", label: `Your cards (${selectedCards})`, remove: onCardsOff }] : []),
    ...filters.days.map((d) => ({ key: "d" + d, label: d === TODAY ? `${d} (today)` : d, remove: () => setFilters({ ...filters, days: toggle(filters.days, d) }) })),
    ...filters.cards.map((c) => ({ key: "c" + c, label: `${splitCardKey(c).card} (${bankName(splitCardKey(c).bank)})`, remove: () => setFilters({ ...filters, cards: toggle(filters.cards, c) }) })),
    ...filters.areas.map((a) => ({ key: "a" + a, label: a, remove: () => setFilters({ ...filters, areas: toggle(filters.areas, a) }) })),
    ...filters.places.map((p) => ({ key: "p" + p, label: p, remove: () => setFilters({ ...filters, places: toggle(filters.places, p) }) })),
    ...filters.categories.map((c) => ({ key: "k" + c, label: c, remove: () => setFilters({ ...filters, categories: toggle(filters.categories, c) }) })),
    ...(filters.city ? [{ key: "city", label: filters.city, remove: () => setFilters({ ...filters, city: "" }) }] : []),
    ...(filters.minDiscount ? [{ key: "min", label: `${filters.minDiscount}%+ off`, remove: () => setFilters({ ...filters, minDiscount: 0 }) }] : []),
  ];
  if (!chips.length) return null;
  return (
    <div className="active-chips">
      {chips.map((c) => (
        <button key={c.key} className="active-chip" onClick={c.remove} aria-label={`Remove filter ${c.label}`}>
          {c.label} {I.close}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- offer card

function Logo({ src, name, size = "md" }: { src?: string | null; name: string; size?: "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`logo ${size}`}>
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <span>{initials(name)}</span>}
    </span>
  );
}

// Favourites: kept in this browser, and sent to the server so restaurants can see how many people saved a deal.
const FAV_KEY = "df:favourites";
function readFavs(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function useFavourites() {
  const [favs, setFavs] = useState<number[]>(readFavs);
  const favsRef = useRef(favs);
  favsRef.current = favs;
  const toggle = useCallback((id: number) => {
    const cur = favsRef.current;
    const on = !cur.includes(id);
    const next = on ? [...cur, id] : cur.filter((x) => x !== id);
    favsRef.current = next;
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep in memory */
    }
    saveFavourite(id, on); // so restaurants can see how many people saved their deal
  }, []);
  return { favs, toggle };
}

/** Restaurant photo across the top, with the round logo sitting half on the photo, half below it. */
/** Grey placeholder shaped like a deal card, shown while the deals load. */
function SkeletonCard() {
  return (
    <div className="offer sk-card" aria-hidden="true">
      <div className="offer-top">
        <div className="offer-cover sk" />
        <span className="offer-logo sk-logo"><span className="sk sk-round" /></span>
      </div>
      <div className="offer-body">
        <div className="offer-head">
          <span className="sk sk-line" style={{ width: "62%", height: 16 }} />
          <span className="sk sk-line" style={{ width: "30%" }} />
          <span className="sk sk-line" style={{ width: "44%" }} />
        </div>
        <span className="sk sk-line" style={{ width: "55%" }} />
        <span className="sk sk-line" style={{ width: "48%" }} />
        <div className="sk-deal">
          <span className="sk sk-line" style={{ width: "34%", height: 16 }} />
          <span className="sk sk-line" style={{ width: "40%" }} />
        </div>
      </div>
    </div>
  );
}

/** ★★★★☆ 4.2 (31) — partial stars fill in; "No ratings yet" when unrated. */
function Stars({ value, count }: { value?: number | null; count?: number | null }) {
  if (value == null) return <span className="stars none">No ratings yet</span>;
  const v = Math.max(0, Math.min(5, value));
  return (
    <span className="stars" aria-label={`Rated ${v.toFixed(1)} out of 5${count ? ` from ${count} reviews` : ""}`}>
      <span className="stars-row" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="star">
            {I.star}
            <span className="star-fill" style={{ width: `${Math.max(0, Math.min(1, v - i)) * 100}%` }}>{I.star}</span>
          </span>
        ))}
      </span>
      <b className="stars-num">{v.toFixed(1)}</b>
      {count ? <span className="stars-count">({count.toLocaleString("en-PK")})</span> : null}
    </span>
  );
}

/** Open/closed for the branch shown on the card; falls back to any branch that has hours. */
function branchStatus(branch: DashBranch | undefined, all: DashBranch[], now: Date): OpenStatus {
  const s = openStatus(branch?.hours, now);
  if (s.open !== null) return s;
  const known = all.map((b) => openStatus(b.hours, now)).filter((x) => x.open !== null);
  return known.find((x) => x.open) ?? known[0] ?? s;
}

function CoverImage({ src, logo, name, status }: { src?: string | null; logo?: string | null; name: string; status?: OpenStatus }) {
  const [broken, setBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const photo = src && src !== logo && !broken ? src : null; // never stretch the logo across the top
  return (
    <div className="offer-top">
      <div className="offer-cover">
        {photo ? (
          <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <span className="offer-cover-fallback" aria-hidden="true" />
        )}
        {status?.open === false && (
          <div className="offer-closed">
            <b>CLOSED</b>
            <small>{status.text.replace(/^Closed · /, "")}</small>
          </div>
        )}
      </div>
      <span className="offer-logo">
        {logo && !logoBroken ? (
          <img src={logo} alt={`${name} logo`} loading="lazy" onError={() => setLogoBroken(true)} />
        ) : (
          <span>{initials(name)}</span>
        )}
      </span>
    </div>
  );
}

function OfferCard({
  o,
  onOpen,
  active,
  fav,
  onToggleFav,
  me,
  now,
  count,
}: {
  o: DashOffer;
  onOpen: () => void;
  active: boolean;
  fav: boolean;
  onToggleFav: () => void;
  me?: Coords;
  now: Date;
  count?: number; // grouped view: how many offers this restaurant has
}) {
  const name = placeName(o);
  const { branch, km } = nearestBranch(o, me);
  const status = branchStatus(branch, o.branches, now);
  const where = o.branches.length === 0 ? "Online" : placeOf(branch) ?? "Address not listed";
  const cuisine = cuisineOf(o);
  const offerText = o.discount_percent != null ? `${pct(o.discount_percent)} OFF` : o.title;
  const days = daysText(o.valid_days);
  const cardText = o.cards.length ? `${o.cards.length} card${o.cards.length > 1 ? "s" : ""}` : "All cards";
  return (
    <div
      role="button"
      tabIndex={0}
      className={`offer ${active ? "active" : ""} ${status.open === false ? "closed" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <CoverImage src={o.image_url} logo={o.business?.logo_url} name={name} status={status} />
      <button
        type="button"
        className={`fav ${fav ? "on" : ""}`}
        aria-pressed={fav}
        aria-label={fav ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
      >
        {I.heart}
      </button>

      <div className="offer-body">
        <div className="offer-head">
          <strong className="offer-name">{name}</strong>
          <span className="offer-sub">{cuisine ? CUISINE_LABEL[cuisine] : catLabel(o.category)}</span>
          <Stars value={o.business?.rating} count={o.business?.rating_count} />
        </div>

        <span className="offer-loc" title={branch?.address ?? where}>
          {I.pin}
          <span className="offer-loc-place">{where}</span>
          {km != null && <b className="offer-km">{fmtKm(km)} away</b>}
        </span>

        <span className="offer-card" title={o.cards.map((c) => c.name).join(", ")}>
          {I.card}
          <b>{o.bank.name}</b>
          <span>· {cardText}</span>
        </span>

        <div className="offer-deal">
          <span className="offer-pct">{offerText}</span>
          {count != null && <OfferCount n={count} />}
          <span className="offer-deal-meta">
            on {days === "Every day" ? "every day" : days}
            {o.max_discount_amount != null ? ` · up to ${money(o.max_discount_amount, o.currency)}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "(12)" next to the discount; hover (or tap / focus) shows "12 offers available". */
function OfferCount({ n }: { n: number }) {
  const tip = `${n} offer${n === 1 ? "" : "s"} available`;
  return (
    <span className="offer-count" tabIndex={0} aria-label={tip} data-tip={tip}>
      ({n})
    </span>
  );
}

function GroupCard({
  offers,
  onOpen,
  active,
  fav,
  onToggleFav,
  me,
  now,
}: {
  offers: DashOffer[];
  onOpen: () => void;
  active: boolean;
  fav: boolean;
  onToggleFav: () => void;
  me?: Coords;
  now: Date;
}) {
  const best = offers[0];
  const name = placeName(best);
  // nearest branch across every offer at this restaurant
  const near = offers
    .map((o) => nearestBranch(o, me))
    .reduce((a, b) => (b.km != null && (a.km == null || b.km < a.km) ? b : a));
  const branch = near.branch ?? best.branches[0];
  const where = branch ? placeOf(branch) ?? "Address not listed" : "Online";
  const status = branchStatus(branch, offers.flatMap((o) => o.branches), now);
  const cuisine = cuisineOf(best);
  const banks = [...new Set(offers.map((o) => o.bank.name))];
  const cardCount = new Set(offers.flatMap((o) => o.cards.map((c) => `${o.bank.slug}|${c.name}`))).size;
  return (
    <div
      role="button"
      tabIndex={0}
      className={`offer group ${active ? "active" : ""} ${status.open === false ? "closed" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <CoverImage src={offers.find((x) => x.image_url && x.image_url !== x.business?.logo_url)?.image_url ?? best.image_url} logo={best.business?.logo_url} name={name} status={status} />
      <button
        type="button"
        className={`fav ${fav ? "on" : ""}`}
        aria-pressed={fav}
        aria-label={fav ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
      >
        {I.heart}
      </button>

      <div className="offer-body">
        <div className="offer-head">
          <strong className="offer-name">{name}</strong>
          <span className="offer-sub">{cuisine ? CUISINE_LABEL[cuisine] : catLabel(best.category)}</span>
          <Stars value={best.business?.rating} count={best.business?.rating_count} />
        </div>

        <span className="offer-loc" title={branch?.address ?? where}>
          {I.pin}
          <span className="offer-loc-place">{where}</span>
          {near.km != null && <b className="offer-km">{fmtKm(near.km)} away</b>}
        </span>

        <span className="offer-card">
          {I.card}
          <b>{banks.length === 1 ? banks[0] : `${banks.length} banks`}</b>
          <span>· {cardCount ? `${cardCount} card${cardCount > 1 ? "s" : ""}` : "All cards"}</span>
        </span>

        <div className="offer-deal">
          <span className="offer-pct">
            {best.discount_percent != null ? `${pct(best.discount_percent)} OFF` : best.title}
          </span>
          <OfferCount n={offers.length} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one offer in the sidebar list

function OfferItem({ o, focused, onShare }: { o: DashOffer; focused: boolean; onShare: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);
  const terms = (o.terms ?? "")
    .split(/\n+/)
    .map((t) => t.replace(/^[*•\-\s]+/, "").trim())
    .filter(Boolean);
  const pctText = o.discount_percent != null ? `${pct(o.discount_percent)} OFF` : null;
  const showTitle = !pctText || !o.title.toLowerCase().startsWith(String(o.discount_percent ?? "").toLowerCase());
  return (
    <li className={`oi ${focused ? "focused" : ""}`} ref={ref} id={`offer-${o.id}`}>
      <div className="oi-top">
        <b className="oi-pct">{pctText ?? o.title}</b>
        <span className="oi-days">{daysText(o.valid_days)}</span>
        <button className="oi-share" onClick={onShare} aria-label="Share this offer" title="Share this offer">{I.share}</button>
      </div>
      {showTitle && pctText && <p className="oi-title">{o.title}</p>}
      <dl className="oi-facts">
        <div><dt>Valid</dt><dd>{fmtDate(o.valid_from)} – {fmtDate(o.valid_till)}</dd></div>
        {o.max_discount_amount != null && <div><dt>Max discount</dt><dd>{money(o.max_discount_amount, o.currency)}</dd></div>}
      </dl>
      <div className="oi-cards">
        <span className="oi-label">{o.bank.name} · {o.cards.length ? `${o.cards.length} card${o.cards.length > 1 ? "s" : ""}` : "All cards"}</span>
        {o.cards.length > 0 && (
          <span className="oi-chips">
            {o.cards.map((c) => (
              <span key={c.name} className="oi-chip" title={c.max_discount_amount != null ? `cap ${money(c.max_discount_amount, o.currency)}` : undefined}>
                {c.name}
                {c.discount_percent != null && c.discount_percent !== o.discount_percent && <b> {pct(c.discount_percent)}</b>}
              </span>
            ))}
          </span>
        )}
      </div>
      {terms.length > 0 && (
        <details className="oi-terms">
          <summary>Terms &amp; conditions</summary>
          <ul>{terms.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </details>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- menu photos

function MenuGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (!["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.stopImmediatePropagation(); // Escape closes the photo, not the whole sidebar
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft") setOpen((i) => (i! - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setOpen((i) => (i! + 1) % images.length);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, images.length]);

  return (
    <section className="d-section">
      <h3>Menu <small>{images.length}</small></h3>
      <div className="menu-grid">
        {images.map((src, i) => (
          <button key={src} className="menu-thumb" onClick={() => setOpen(i)} aria-label={`Open menu page ${i + 1}`}>
            <img src={src} alt={`${name} menu page ${i + 1}`} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="lightbox" role="dialog" aria-label={`${name} menu`} onClick={() => setOpen(null)}>
          <img src={images[open]} alt={`${name} menu page ${open + 1}`} onClick={(e) => e.stopPropagation()} />
          <button className="lb-close" onClick={() => setOpen(null)} aria-label="Close">{I.close}</button>
          {images.length > 1 && (
            <>
              <button className="lb-nav prev" aria-label="Previous page" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + images.length) % images.length); }}>‹</button>
              <button className="lb-nav next" aria-label="Next page" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % images.length); }}>›</button>
              <span className="lb-count">{open + 1} / {images.length}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- drawer

export type DrawerProps = {
  /** true = render as its own page (/restaurant/…) instead of the slide-in sidebar */
  page?: boolean;
  focusOfferId: number | null;
  onShareRestaurant: () => void;
  onShareOffer: (o: DashOffer) => void;
  siblings: DashOffer[];
  onPickOffer: (o: DashOffer) => void;
  loggedIn: boolean;
  onVisited: (o: DashOffer) => void;
  onClose: () => void;
  onPickPlace: (p: string) => void;
};

function Drawer({ offer, ...rest }: DrawerProps & { offer: DashOffer | null }) {
  const [last, setLast] = useState<DashOffer | null>(offer);
  useEffect(() => {
    if (offer) setLast(offer);
  }, [offer]);
  const o = offer ?? last; // keep content while sliding out
  const open = !!offer;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, offer?.id]);

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={rest.onClose} />
      <aside
        className={`drawer ${open ? "open" : ""}`}
        aria-hidden={!open}
        aria-label="Offer details"
        role="dialog"
        tabIndex={-1}
        ref={panelRef}
      >
        {o && <DrawerBody o={o} {...rest} />}
      </aside>
    </>
  );
}

export function DrawerBody({ o, siblings, loggedIn, onVisited, onClose, onPickPlace, focusOfferId, onShareRestaurant, onShareOffer, page }: DrawerProps & { o: DashOffer }) {
  const name = placeName(o);
  const first = o.branches[0];
  const list = siblings.length ? siblings : [o]; // every offer at this restaurant
  const status = branchStatus(first, o.branches, new Date());
  // food tags across every offer at this restaurant (Cafe, Desi, Italian…)
  const tags = [...new Set(list.flatMap((x) => x.business?.tags ?? []))];
  const tagPills = tags.length > 0 && (
    <ul className="tag-pills" aria-label="Food">
      {tags.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
  const fullPageHref = focusOfferId ? offerPath(list.find((x) => x.id === focusOfferId) ?? o, name, list) : restaurantPath(name, list);

  // ---- pieces shared by the sidebar and the full page
  const linkRow = (
    <div className="link-row">
      {!page && (
        <a className="btn-ghost" href={fullPageHref}>
          {I.expand} View full page
        </a>
      )}
      <a className="btn-primary maps-btn" href={mapsPlaceUrl(name, first)} target="_blank" rel="noreferrer">
        {I.pin} View on Google Maps
      </a>
      {o.source_url && (
        <a
          className="icon-btn lg"
          href={o.source_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Check this offer on ${o.bank.name}'s site`}
          title={`Check on ${o.bank.name.split(" (")[0]}`}
        >
          {I.ext}
        </a>
      )}
      {o.business?.website && (
        <a className="icon-btn lg" href={o.business.website} target="_blank" rel="noreferrer" aria-label={`${name} website`} title="Website">
          {I.globe}
        </a>
      )}
      {page && (
        <button className="icon-btn lg" onClick={onShareRestaurant} aria-label={`Share ${name}`} title="Share this restaurant">
          {I.share}
        </button>
      )}
    </div>
  );

  const offersSec = (
    <section className="d-section offers-sec">
      <h3>Offers <small>{list.length}</small></h3>
      <ul className="offer-list">
        {list.map((x) => <OfferItem key={x.id} o={x} focused={x.id === focusOfferId} onShare={() => onShareOffer(x)} />)}
      </ul>
    </section>
  );

  const branchesSec = (
    <section className="d-section">
      <h3>{o.branches.length > 1 ? "Branches" : "Location"} <small>{o.branches.length}</small></h3>
      {o.branches.map((b) => (
        <div key={b.id} className="branch">
          <p className="branch-addr">{I.pin}<span>{b.address ?? b.city ?? "Address not listed"}</span></p>
          <div className="branch-links">
            {b.phone && <a className="branch-phone" href={`tel:${b.phone}`}>{I.phone} {b.phone}</a>}
            <a className="branch-icon" href={mapsPlaceUrl(name, b)} target="_blank" rel="noreferrer" aria-label="Open in Google Maps" title="Google Maps">
              {I.pin}
            </a>
            <a className="branch-icon" href={mapsDirectionsUrl(b, name)} target="_blank" rel="noreferrer" aria-label="Get directions" title="Directions">
              {I.nav}
            </a>
          </div>
          {b.hours && Object.keys(b.hours).length > 0 && (
            <details className="branch-hours">
              <summary>{openStatus(b.hours).text || "Opening hours"}</summary>
              <table>
                <tbody>
                  {weekRows(b.hours).map((r) => (
                    <tr key={r.day} className={r.today ? "today" : ""}>
                      <th>{r.day}</th>
                      <td>{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      ))}
      {o.branches.length === 0 && <p className="muted small">No branch listed — it may be an online offer.</p>}
    </section>
  );

  const menuSec = (o.business?.menu_images?.length ?? 0) > 0 && <MenuGallery images={o.business!.menu_images!} name={name} />;
  const updated = <p className="muted small updated">Last seen on {o.bank.name}'s site {timeAgo(o.last_seen_at)}.</p>;

  // ---- full page: restaurant (photo, details, menu, branches) on the left, offers on the right
  if (page) {
    return (
      <div className="rp-grid">
        <aside className="rp-left">
          <div className="rp-panel rp-info">
            <div className="rp-hero">
              <CoverImage
                src={list.find((x) => x.image_url && x.image_url !== x.business?.logo_url)?.image_url ?? o.image_url}
                logo={o.business?.logo_url}
                name={name}
                status={status}
              />
            </div>
            <div className="rp-title">
              <span className="eyebrow">
                {(cuisineOf(o) && CUISINE_LABEL[cuisineOf(o)!]) || catLabel(o.category)} · {[...new Set(list.map((x) => x.bank.name))].join(" · ")}
              </span>
              <h1>{name}</h1>
              <Stars value={o.business?.rating} count={o.business?.rating_count} />
              {tagPills}
              {first?.address && <p className="muted rp-addr">{I.pin}{first.address}</p>}
              {status.open !== null && <span className={`open-badge ${status.open ? "open" : "shut"}`}>{status.text}</span>}
            </div>
            <div className="rp-pad">{linkRow}</div>
          </div>
          {/* on tablet / phone these two move below the offers (see restaurant.css) */}
          {menuSec && <div className="rp-panel rp-pad rp-menu">{menuSec}</div>}
          <div className="rp-panel rp-pad rp-branches">{branchesSec}</div>
        </aside>

        <section className="rp-right">
          <div className="rp-panel rp-pad">
            {offersSec}
            {updated}
          </div>
        </section>
      </div>
    );
  }

  // ---- sidebar
  return (
    <>
      <div className="drawer-head">
        <Logo src={o.business?.logo_url ?? o.image_url} name={name} size="lg" />
        <div className="drawer-title">
          <span className="eyebrow">{catLabel(o.category)} · {o.bank.name}</span>
          <h2>{name}</h2>
          {tagPills}
          {first?.address && <p className="muted">{I.pin}{first.address}</p>}
          {status.open !== null && <span className={`open-badge ${status.open ? "open" : "shut"}`}>{status.text}</span>}
        </div>
        <a className="icon-btn" href={fullPageHref} aria-label={`Open ${name} on its own page`} title="Open on its own page">
          {I.expand}
        </a>
        <button className="icon-btn" onClick={onShareRestaurant} aria-label={`Share ${name}`} title="Share this restaurant">{I.share}</button>
        <button className="icon-btn" onClick={onClose} aria-label="Close details">{I.close}</button>
      </div>

      <div className="drawer-scroll">
        {linkRow}
        {offersSec}
        {branchesSec}
        {menuSec}
        <button className="link-btn see-all" onClick={() => onPickPlace(name)}>
          See all offers at {name} →
        </button>
        {updated}
      </div>
    </>
  );
}
