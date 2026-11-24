/** Restaurant accounts: branches + their own discounts (backend: app/public/partner.py). */
import { NotLoggedIn } from "../profile/api";

export type Branch = { id: number; name: string; address: string; lat: number; lng: number; phone: string | null };
export type BranchIn = Omit<Branch, "id">;

export type DealCard = { bank_slug: string; bank_name: string; card_name: string | null }; // null = all cards of the bank
export type DealStatus = "active" | "upcoming" | "expired";
export type Deal = {
  id: number;
  code: string;
  title: string | null;
  discount_percent: number;
  max_discount: number | null;
  cards: DealCard[];
  days: number[];            // 0 = Mon … 6 = Sun; empty = every day
  start_date: string;        // YYYY-MM-DD
  end_date: string | null;
  start_time: string | null; // HH:MM:SS; null = all day
  end_time: string | null;
  is_family: boolean;
  family_size: number | null;
  branch_ids: number[];      // empty = all branches
  terms: string | null;
  status: DealStatus;
  expired_by_owner: boolean;
  created_at: string;
  favourites: number; // customers who saved it
  views: number;      // times customers opened it (shared link or the dashboard sidebar)
  live: boolean;      // shown to customers right now
};
export type DealIn = Omit<Deal, "id" | "code" | "status" | "expired_by_owner" | "created_at" | "favourites" | "views" | "live">;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 401) throw new NotLoggedIn("Not logged in");
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = String(j.detail[0]?.msg ?? msg).replace(/^Value error,\s*/i, "");
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const partnerApi = {
  branches: () => call<Branch[]>("GET", "/api/partner/branches"),
  addBranch: (b: BranchIn) => call<Branch>("POST", "/api/partner/branches", b),
  editBranch: (id: number, b: BranchIn) => call<Branch>("PATCH", `/api/partner/branches/${id}`, b),
  deleteBranch: (id: number) => call<void>("DELETE", `/api/partner/branches/${id}`),

  deals: () => call<Deal[]>("GET", "/api/partner/deals"),
  addDeal: (d: DealIn) => call<Deal>("POST", "/api/partner/deals", d),
  editDeal: (id: number, d: DealIn) => call<Deal>("PATCH", `/api/partner/deals/${id}`, d),
  expireDeal: (id: number) => call<Deal>("POST", `/api/partner/deals/${id}/expire`),
  restoreDeal: (id: number) => call<Deal>("POST", `/api/partner/deals/${id}/restore`),
  deleteDeal: (id: number) => call<void>("DELETE", `/api/partner/deals/${id}`),
};

// ---------------------------------------------------------------- plain-language text for a deal

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function daysLabel(days: number[]) {
  if (!days.length || days.length === 7) return "Every day";
  const s = [...days].sort((a, b) => a - b).join(",");
  if (s === "0,1,2,3,4") return "Mon – Fri";
  if (s === "5,6") return "Sat & Sun";
  if (days.length === 1) return `Every ${DAY_LONG[days[0]]}`;
  return [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(", ");
}

/** "19:30:00" -> "7:30 pm" */
export function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
}

export function timeLabel(d: Pick<Deal, "start_time" | "end_time">) {
  if (!d.start_time || !d.end_time) return "All day";
  return `${fmtTime(d.start_time)} – ${fmtTime(d.end_time)}`;
}

/** "2026-11-22" -> "22 Nov 2026" (read as a calendar date, no time-zone shift) */
export function fmtDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function dateLabel(d: Pick<Deal, "start_date" | "end_date">) {
  return d.end_date ? `${fmtDay(d.start_date)} → ${fmtDay(d.end_date)}` : `From ${fmtDay(d.start_date)} · no end date`;
}

export const rs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;
export const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

export function cardsLabel(cards: DealCard[]) {
  if (!cards.length) return "All customers (no card needed)";
  return cards.map((c) => (c.card_name ? `${c.bank_name} ${c.card_name}` : `All ${c.bank_name} cards`)).join(" · ");
}

/** Today's date in Pakistan as YYYY-MM-DD. */
export function todayPk() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}
export function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
