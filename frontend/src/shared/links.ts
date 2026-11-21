/**
 * Shareable links — one link per restaurant; an offer is just that link with ?offer=<id>:
 *
 *   /restaurant/<restaurantId>-<name-slug>              e.g. /restaurant/207-salt-n-pepper-restaurant
 *   /restaurant/<restaurantId>-<name-slug>?offer=<id>   same page, that offer highlighted
 *
 * The same paths under /dashboard (/dashboard/restaurant/…) open the dashboard with the sidebar open;
 * the dashboard keeps the address bar in sync that way. Share buttons hand out the standalone pages.
 * Older /offer/<id>-<name> links still work.
 *
 * Only the number matters when a link is opened — the name part is there so the link reads
 * nicely and still works if the restaurant is renamed.
 * A restaurant's id is the smallest branch id across its offers (branches are rows in `businesses`).
 */
import type { DashOffer } from "../dashboard/api";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "restaurant";

/** Restaurant id from all its offers; offers with no branch fall back to "o<offerId>". */
export function restaurantId(offers: DashOffer[]): string {
  const ids = offers.flatMap((o) => o.branches.map((b) => b.id));
  return ids.length ? String(Math.min(...ids)) : `o${Math.min(...offers.map((o) => o.id))}`;
}

/** `base` = "" for the standalone page, "/dashboard" for the dashboard with the sidebar open. */
export const restaurantPath = (name: string, offers: DashOffer[], base = "") => `${base}/restaurant/${restaurantId(offers)}-${slugify(name)}`;
/** The restaurant's link with one offer highlighted. `offers` = every offer at that restaurant. */
export const offerPath = (o: DashOffer, name: string, offers: DashOffer[], base = "") =>
  `${restaurantPath(name, offers.length ? offers : [o], base)}?offer=${o.id}`;

export type Deep = { kind: "restaurant"; id: string; offer: number | null } | { kind: "offer"; id: number } | null;

export function parsePath(path: string, search = ""): Deep {
  const r = path.match(/^(?:\/dashboard)?\/restaurant\/(o?\d+)(?:-[^/]*)?\/?$/);
  const offer = Number(new URLSearchParams(search).get("offer")) || null;
  if (r) return { kind: "restaurant", id: r[1], offer };
  const o = path.match(/^(?:\/dashboard)?\/offer\/(\d+)(?:-[^/]*)?\/?$/);
  if (o) return { kind: "offer", id: Number(o[1]) };
  return null;
}

/** The offers at the restaurant a link points to, plus the offer to highlight (if any). */
export function resolveDeep(d: Deep, all: DashOffer[], groupKey: (o: DashOffer) => string) {
  if (!d) return null;
  const pick = (o: DashOffer | undefined, focus: number | null) => {
    if (!o) return null;
    const k = groupKey(o);
    const offers = all.filter((x) => groupKey(x) === k).sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0));
    return { offers, focus };
  };
  if (d.kind === "offer") return pick(all.find((x) => x.id === d.id), d.id); // old /offer/… links
  const hit = d.id.startsWith("o")
    ? all.find((o) => o.id === Number(d.id.slice(1)))
    : all.find((o) => o.branches.some((b) => b.id === Number(d.id)));
  const res = pick(hit, null);
  if (res && d.offer && res.offers.some((o) => o.id === d.offer)) res.focus = d.offer; // ?offer= highlights one
  return res;
}

/** Native share sheet on phones; copies the link elsewhere. Returns what happened. */
export async function shareLink(url: string, title: string, text: string): Promise<"shared" | "copied" | "failed" | "cancelled"> {
  if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
