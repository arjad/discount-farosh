/** Admin API client (backend: app/admin/routes.py). The admin cookie is HttpOnly and sent automatically. */

export class NotLoggedIn extends Error {}

/** Plain-language messages instead of the browser's "Failed to fetch". */
export const OFFLINE = "Can't reach the server right now. Check that it's running (npm start), then try again.";
const SERVER_ERROR = "Something went wrong on the server. Please try again in a moment.";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new Error(navigator.onLine === false ? "You're offline. Check your internet connection, then try again." : OFFLINE);
  }
  // API not running: gateways answer 502/503/504, and the dev proxy answers 500 with an empty body
  if ([502, 503, 504].includes(res.status)) throw new Error(OFFLINE);
  if (res.status === 500 && (await res.clone().text()).trim() === "") throw new Error(OFFLINE);
  if (res.status === 401 && !path.endsWith("/auth/login")) throw new NotLoggedIn("Not logged in");
  if (!res.ok) {
    let msg = res.status >= 500 ? SERVER_ERROR : res.statusText || "Something went wrong. Please try again.";
    try {
      const j = await res.json();
      if (typeof j.detail === "string" && res.status < 500) msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail[0]?.loc?.includes("email") ? "Please enter a valid email address." : "Please check the form.";
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export type AdminMe = { id: number; email: string; full_name: string | null };

export type RestaurantRow = {
  key: string;
  name: string;
  source: "bank" | "account" | "both";
  logo_url: string | null;
  cities: string[];
  areas: string[];
  branches: number;
  offers: number;
  active_offers: number;
  banks: string[];
  best_discount: number | null;
  favourites: number;
  views: number;
  rating: number | null;
  rating_count: number | null;
  tags: string[];
  owner_email: string | null;
};

export type UserRow = {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  role: "client" | "restaurant";
  restaurant_name: string | null;
  home_address: string | null;
  office_address: string | null;
  is_active: boolean;
  has_avatar: boolean;
  avatar_url: string | null; // the profile picture (served by the admin API)
  created_at: string;
  last_seen_at: string | null;
  cards: number;
  visits: number;
  favourites: number;
  views: number;
  branches: number;
  deals: number;
};

export type Overview = {
  customers: number;
  restaurant_accounts: number;
  restaurants: number;
  offers: number;
  active_offers: number;
  favourites: number;
  views: number;
  views_7d: number;
  signups_7d: number;
  top_restaurants: RestaurantRow[];
  newest_users: UserRow[];
};

/** One offer in the Offers tab (compact). `b` = ids into OffersData.branches. */
export type OfferRow = {
  id: number;
  title: string;
  key: string;          // restaurant key (same as /restaurants/<key>)
  restaurant: string;
  logo: string | null;
  bank: string;
  bank_slug: string;
  pct: number | null;
  cap: number | null;
  cards: string[];
  days: string[];       // ["Mon", …]; empty = every day
  from: string | null;
  till: string | null;
  active: boolean;
  source: "bank" | "account";
  favs: number;
  views: number;
  b: number[];
  seen: string;
};
export type OffersData = { branches: Record<string, [number | null, number | null, string | null]>; offers: OfferRow[] };

export type Branch = {
  id: number;
  address: string | null;
  area: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: Record<string, string> | null;
  rating: number | null;
  rating_count: number | null;
  tags: string[];
  menu_images: string[];
  from_account: boolean;
};

export type Offer = {
  id: number;
  title: string;
  description: string | null;
  terms: string | null;
  bank: string;
  bank_slug: string;
  discount_percent: number | null;
  max_discount_amount: number | null;
  valid_days: string[] | null;
  valid_from: string | null;
  valid_till: string | null;
  is_active: boolean;
  source: "bank" | "account";
  source_url: string | null;
  image_url: string | null;
  cards: { name: string; discount_percent: number | null; max_discount_amount: number | null }[];
  branches: number;
  favourites: number;
  views: number;
  first_seen_at: string;
  last_seen_at: string;
};

export type RestaurantDetail = {
  row: RestaurantRow;
  cover_url: string | null;
  branches: Branch[];
  offers: Offer[];
  owners: { id: number; email: string; full_name: string | null; phone: string | null; restaurant_name: string | null }[];
};

export type Place = { label: string | null; lat: number | null; lng: number | null };
export type Deal = {
  id: number; code: string; title: string | null; discount_percent: number; max_discount: number | null;
  cards: { bank_name: string; card_name: string | null }[]; days: number[]; start_date: string; end_date: string | null;
  start_time: string | null; end_time: string | null; is_family: boolean; family_size: number | null;
  terms: string | null; status: "active" | "upcoming" | "expired"; favourites: number; views: number; live: boolean;
};
export type UserDetail = {
  row: UserRow;
  avatar: string | null;
  cover: string | null;
  home: Place;
  work: Place;
  updated_at: string;
  cards: { bank: string; card: string; added_at: string }[];
  visits: { place: string; address: string | null; bank: string | null; discount_percent: number | null; visited_at: string }[];
  favourites: { offer_id: number; title: string; place: string | null; bank: string; discount_percent: number | null; saved_at: string }[];
  recent_views: { offer_id: number; title: string; place: string | null; source: string; viewed_at: string }[];
  sessions: { device: string | null; created_at: string; last_seen_at: string; expires_at: string }[];
  branches: { name: string; address: string; lat: number; lng: number; phone: string | null }[];
  deals: Deal[];
};

export const api = {
  me: () => call<AdminMe>("GET", "/api/admin/auth/me"),
  login: (email: string, password: string) => call<AdminMe>("POST", "/api/admin/auth/login", { email, password }),
  logout: () => call<void>("POST", "/api/admin/auth/logout"),
  overview: () => call<Overview>("GET", "/api/admin/overview"),
  restaurants: () => call<RestaurantRow[]>("GET", "/api/admin/restaurants"),
  restaurant: (key: string) => call<RestaurantDetail>("GET", `/api/admin/restaurants/${encodeURIComponent(key)}`),
  offers: () => call<OffersData>("GET", "/api/admin/offers"),
  users: () => call<UserRow[]>("GET", "/api/admin/users"),
  user: (id: number) => call<UserDetail>("GET", `/api/admin/users/${id}`),
};

// ---------------------------------------------------------------- formatting

export const fmtN = (n: number) => n.toLocaleString("en-PK");
export const pct = (n: number | null) => (n == null ? "—" : `${Number.isInteger(n) ? n : n.toFixed(1)}%`);
export const rs = (n: number | null) => (n == null ? null : `Rs ${Math.round(n).toLocaleString("en-PK")}`);
export function fmtDate(iso: string | null, withTime = false) {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleString("en-GB", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}
export function ago(iso: string | null) {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(iso);
}
export const roleLabel = (r: string) => (r === "restaurant" ? "Restaurant" : "Customer");
export const sourceLabel = (s: RestaurantRow["source"]) => (s === "account" ? "Restaurant account" : s === "both" ? "Bank deals + account" : "Bank deals");
/** A short device name from a browser's user-agent string. */
export function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}
