/**
 * Offers tab — every offer, with filters (search, bank, status, source, discount, day, distance) and
 * an option to group them by restaurant. Everything filters in the browser; the data loads once.
 */
import { useEffect, useMemo, useState } from "react";
import { api, fmtDate, fmtN, pct, rs, type OfferRow } from "../api";
import { ORIGINS, fmtKm, km, type Coords } from "../geo";
import { I } from "../icons";
import { Link } from "../router";
import { Avatar, EmptyRow, Loading, Th, sortRows, useLoad, useSort, type SortState } from "../ui";

/** Quick sorts for the dropdown (the grouped view has no column headers). Each is a column + direction. */
const PRESETS: { id: string; label: string; sort: SortState }[] = [
  { id: "discount", label: "Highest discount", sort: { key: "discount", dir: -1 } },
  { id: "favourites", label: "Most favourites", sort: { key: "favourites", dir: -1 } },
  { id: "views", label: "Most views", sort: { key: "views", dir: -1 } },
  { id: "distance", label: "Nearest first", sort: { key: "distance", dir: 1 } },
  { id: "newest", label: "Newest first", sort: { key: "seen", dir: -1 } },
  { id: "restaurant", label: "Restaurant (A–Z)", sort: { key: "restaurant", dir: 1 } },
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KMS = [0, 2, 5, 10, 15];
const PAGE = 60;

type Status = "active" | "ended" | "all";
type F = {
  q: string; banks: string[]; status: Status; source: "" | "bank" | "account"; minPct: number;
  day: string; maxKm: number; origin: string; grouped: boolean;
};
const START: F = { q: "", banks: [], status: "active", source: "", minPct: 0, day: "", maxKm: 0, origin: "centre", grouped: false };

/** What each column sorts by. */
const columns = (nearest: Map<number, number | null>): Record<string, (o: OfferRow) => string | number | null | undefined> => ({
  restaurant: (o) => o.restaurant,
  discount: (o) => o.pct,
  bank: (o) => o.bank,
  days: (o) => (o.days.length ? o.days.length : 7), // every day = 7 days
  till: (o) => o.till,
  distance: (o) => nearest.get(o.id),
  favourites: (o) => o.favs,
  views: (o) => o.views,
  seen: (o) => o.seen,
});

export function Offers() {
  const { data, err, retry, loading } = useLoad(api.offers);
  const [f, setF] = useState<F>(START);
  const [shown, setShown] = useState(PAGE);
  const { sort, toggle, setSort } = useSort({ key: "discount", dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false); // tablet / phone: filters slide in from the left
  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFiltersOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("ad-noscroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("ad-noscroll");
    };
  }, [filtersOpen]);
  const [me, setMe] = useState<{ at?: Coords; state: "idle" | "asking" | "ok" | "denied" }>({ state: "idle" });
  const set = (p: Partial<F>) => {
    setF((x) => ({ ...x, ...p }));
    setShown(PAGE);
  };

  // "My location" uses the browser's location (asked only when chosen)
  useEffect(() => {
    if (f.origin !== "me" || me.state !== "idle") return;
    if (!navigator.geolocation) return setMe({ state: "denied" });
    setMe({ state: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => setMe({ state: "ok", at: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      () => setMe({ state: "denied" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, [f.origin, me.state]);
  const origin: Coords | undefined = f.origin === "me" ? me.at : ORIGINS.find((o) => o.id === f.origin)?.at;

  const banks = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const o of data?.offers ?? []) {
      const e = m.get(o.bank_slug) ?? { name: o.bank, n: 0 };
      e.n += o.active ? 1 : 0;
      m.set(o.bank_slug, e);
    }
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [data]);

  /** Nearest branch of an offer to the chosen point (null = no branch on the map). */
  const nearest = useMemo(() => {
    const out = new Map<number, number | null>();
    if (!data || !origin) return out;
    for (const o of data.offers) {
      let best: number | null = null;
      for (const id of o.b) {
        const br = data.branches[id];
        if (!br || br[0] == null || br[1] == null) continue;
        const d = km(origin, br[0], br[1]);
        if (best == null || d < best) best = d;
      }
      out.set(o.id, best);
    }
    return out;
  }, [data, origin]);

  const list = useMemo(() => {
    if (!data) return [];
    const t = f.q.trim().toLowerCase();
    const rows = data.offers
      .filter((o) => f.status === "all" || (f.status === "active" ? o.active : !o.active))
      .filter((o) => !f.banks.length || f.banks.includes(o.bank_slug))
      .filter((o) => !f.source || o.source === f.source)
      .filter((o) => !f.minPct || (o.pct ?? 0) >= f.minPct)
      .filter((o) => !f.day || !o.days.length || o.days.includes(f.day))
      .filter((o) => {
        if (!f.maxKm || !origin) return true;
        const d = nearest.get(o.id);
        return d != null && d <= f.maxKm;
      })
      .filter((o) => !t || `${o.restaurant} ${o.title} ${o.bank} ${o.cards.join(" ")}`.toLowerCase().includes(t))
      .sort((a, b) => a.restaurant.localeCompare(b.restaurant)); // ties stay grouped by restaurant
    return sortRows(rows, sort, columns(nearest));
  }, [data, f, nearest, origin, sort]);

  const groups = useMemo(() => {
    if (!f.grouped) return [];
    const m = new Map<string, OfferRow[]>();
    for (const o of list) m.set(o.key, [...(m.get(o.key) ?? []), o]);
    return [...m.values()]; // keeps the sort order of each group's first (best) offer
  }, [list, f.grouped]);

  const nFilters = (f.q.trim() ? 1 : 0) + f.banks.length + (f.status !== "active" ? 1 : 0) + (f.source ? 1 : 0) + (f.minPct ? 1 : 0) + (f.day ? 1 : 0) + (f.maxKm ? 1 : 0);
  const total = f.grouped ? groups.length : list.length;

  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Offers</h1>
          <p className="muted">Every offer from the banks and from restaurant accounts — with favourites and views.</p>
        </div>
        <span className="ad-seg ad-view">
          <button className={!f.grouped ? "on" : ""} onClick={() => set({ grouped: false })}>All offers</button>
          <button className={f.grouped ? "on" : ""} onClick={() => set({ grouped: true })}>Group by restaurant</button>
        </span>
      </header>

      <button className="ad-btn ghost ad-filters-btn" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        Filters{nFilters > 0 && <b className="ad-filters-n">{nFilters}</b>}
      </button>

      <div className="ad-offers-layout">
        {filtersOpen && <div className="ad-scrim" onClick={() => setFiltersOpen(false)} aria-hidden="true" />}
        <aside className={`ad-filters ${filtersOpen ? "open" : ""}`} aria-label="Filters">
          <div className="ad-f-head">
            <b>Filters</b>
            {nFilters > 0 && <button className="ad-link" onClick={() => set({ ...START, grouped: f.grouped, origin: f.origin })}>Clear all</button>}
            <button className="ad-f-close" onClick={() => setFiltersOpen(false)} aria-label="Close filters">✕</button>
          </div>
          <input className="ad-search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Restaurant, offer, bank, card…" />

          <div className="ad-f-sec">
            <h4>Status</h4>
            <div className="ad-f-chips">
              {(["active", "ended", "all"] as Status[]).map((s) => (
                <button key={s} className={f.status === s ? "on" : ""} onClick={() => set({ status: s })}>{s === "active" ? "Active" : s === "ended" ? "Ended" : "All"}</button>
              ))}
            </div>
          </div>

          <div className="ad-f-sec">
            <h4>Distance</h4>
            <select value={f.origin} onChange={(e) => set({ origin: e.target.value })} aria-label="Distance from">
              {ORIGINS.map((o) => <option key={o.id} value={o.id}>From {o.label}</option>)}
            </select>
            {f.origin === "me" && me.state !== "ok" && (
              <p className="ad-f-note">{me.state === "denied" ? "Location is blocked in this browser — pick an area instead." : "Finding your location…"}</p>
            )}
            <div className="ad-f-chips">
              {KMS.map((k) => (
                <button key={k} className={f.maxKm === k ? "on" : ""} disabled={!origin && k > 0} onClick={() => set({ maxKm: k })}>{k ? `${k} km` : "Any"}</button>
              ))}
            </div>
          </div>

          <div className="ad-f-sec">
            <h4>Bank</h4>
            <div className="ad-f-list">
              {banks.map(([slug, b]) => (
                <label key={slug} className="ad-f-row">
                  <input type="checkbox" checked={f.banks.includes(slug)}
                    onChange={() => set({ banks: f.banks.includes(slug) ? f.banks.filter((x) => x !== slug) : [...f.banks, slug] })} />
                  <span>{b.name}</span><small>{b.n}</small>
                </label>
              ))}
            </div>
          </div>

          <div className="ad-f-sec">
            <h4>Day</h4>
            <div className="ad-f-days">
              {DAYS.map((d) => <button key={d} className={f.day === d ? "on" : ""} onClick={() => set({ day: f.day === d ? "" : d })}>{d}</button>)}
            </div>
          </div>

          <div className="ad-f-sec">
            <h4>Minimum discount</h4>
            <div className="ad-f-chips">
              {[0, 10, 20, 30, 40, 50].map((p) => <button key={p} className={f.minPct === p ? "on" : ""} onClick={() => set({ minPct: p })}>{p ? `${p}%+` : "Any"}</button>)}
            </div>
          </div>

          <div className="ad-f-sec">
            <h4>Added by</h4>
            <div className="ad-f-chips">
              {([["", "Anyone"], ["bank", "Banks"], ["account", "Restaurants"]] as const).map(([k, l]) => (
                <button key={k} className={f.source === k ? "on" : ""} onClick={() => set({ source: k })}>{l}</button>
              ))}
            </div>
          </div>
          <div className="ad-f-foot">
            <button className="ad-btn" onClick={() => setFiltersOpen(false)}>
              Show {f.grouped ? `${fmtN(total)} restaurant${total === 1 ? "" : "s"}` : `${fmtN(list.length)} offer${list.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </aside>

        <section className="ad-offers-main">
          {loading ? <Loading /> : (
            <>
              <div className="ad-results-bar">
                <span className="ad-count">
                  {data && <><b>{fmtN(total)}</b> {f.grouped ? `restaurant${total === 1 ? "" : "s"} · ${fmtN(list.length)} offers` : `of ${fmtN(data.offers.length)} offers`}</>}
                </span>
                <label>Sort
                  <select
                    value={PRESETS.find((p) => p.sort.key === sort.key && p.sort.dir === sort.dir)?.id ?? ""}
                    onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) setSort(p.sort); }}
                  >
                    {!PRESETS.some((p) => p.sort.key === sort.key && p.sort.dir === sort.dir) && <option value="">By column (click headers)</option>}
                    {PRESETS.map((p) => <option key={p.id} value={p.id} disabled={p.id === "distance" && !origin}>{p.label}</option>)}
                  </select>
                </label>
              </div>

              {total === 0 ? (
                <OfferTable rows={[]} nearest={nearest} showPlace sort={sort} onSort={toggle}
                  empty={<EmptyRow cols={8} err={err} onRetry={retry} text={err ? "No records found" : "No offers match these filters"} />} />
              ) : f.grouped ? (
                <div className="ad-groups">
                  {groups.slice(0, shown).map((g) => {
                    const o = g[0];
                    const best = Math.max(...g.map((x) => x.pct ?? 0));
                    const near = origin ? Math.min(...g.map((x) => nearest.get(x.id) ?? Infinity)) : Infinity;
                    const isOpen = open === o.key;
                    return (
                      <div key={o.key} className={`ad-group ${isOpen ? "open" : ""}`}>
                        <button className="ad-group-head" onClick={() => setOpen(isOpen ? null : o.key)} aria-expanded={isOpen}>
                          <Avatar src={o.logo} name={o.restaurant} square />
                          <span className="ad-grow">
                            <b>{o.restaurant}</b>
                            <small className="muted">{g.length} offer{g.length === 1 ? "" : "s"} · {[...new Set(g.map((x) => x.bank))].join(", ")}</small>
                          </span>
                          {Number.isFinite(near) && <span className="ad-chip">{I.pin}{fmtKm(near)}</span>}
                          <span className="ad-chip strong">up to {pct(best || null)}</span>
                          <span className="ad-chip">{I.heart}{fmtN(g.reduce((n, x) => n + x.favs, 0))}</span>
                          <span className="ad-chip">{I.eye}{fmtN(g.reduce((n, x) => n + x.views, 0))}</span>
                          <span className="ad-caret">{I.chev}</span>
                        </button>
                        {isOpen && (
                          <div className="ad-group-body">
                            <GroupTable rows={g} nearest={nearest} />
                            <Link to={`/restaurants/${o.key}`} className="ad-group-link">Open restaurant details →</Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <OfferTable rows={list.slice(0, shown)} nearest={nearest} showPlace sort={sort} onSort={toggle} />
              )}
              {shown < total && (
                <button className="ad-btn ghost ad-more" onClick={() => setShown(shown + PAGE)}>Show more ({fmtN(total - shown)} left)</button>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

/** ["Mon","Tue","Wed","Thu"] -> "Mon–Thu"; ["Fri","Sun"] -> "Fri, Sun"; [] -> "Every day". */
function daysText(days: string[]) {
  const idx = DAYS.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length || idx.length === 7) return "Every day";
  const runs: string[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    runs.push(j - i >= 2 ? `${DAYS[idx[i]]}–${DAYS[idx[j]]}` : idx.slice(i, j + 1).map((k) => DAYS[k]).join(", "));
    i = j + 1;
  }
  return runs.join(", ");
}

/** The offers of one restaurant (grouped view) — sortable on its own. */
function GroupTable({ rows, nearest }: { rows: OfferRow[]; nearest: Map<number, number | null> }) {
  const { sort, toggle } = useSort({ key: "discount", dir: -1 });
  const sorted = useMemo(() => sortRows(rows, sort, columns(nearest)), [rows, sort, nearest]);
  return <OfferTable rows={sorted} nearest={nearest} showPlace={false} sort={sort} onSort={toggle} />;
}

function OfferTable({ rows, nearest, showPlace, sort, onSort, empty }: {
  rows: OfferRow[]; nearest: Map<number, number | null>; showPlace: boolean; sort: SortState; onSort: (k: string, d?: 1 | -1) => void;
  empty?: JSX.Element;
}) {
  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead>
          <tr>
            {showPlace && <Th k="restaurant" label="Restaurant" sort={sort} onSort={onSort} />}
            <Th k="discount" label="Offer" sort={sort} onSort={onSort} firstDir={-1} title="Sort by discount" />
            <Th k="bank" label="Bank · cards" sort={sort} onSort={onSort} />
            <Th k="days" label="Days" sort={sort} onSort={onSort} firstDir={-1} title="Sort by number of days" />
            <Th k="till" label="Valid till" sort={sort} onSort={onSort} />
            <Th k="distance" label="Distance" num sort={sort} onSort={onSort} firstDir={1} />
            <Th k="favourites" label={I.heart} num sort={sort} onSort={onSort} title="Sort by favourites" />
            <Th k="views" label={I.eye} num sort={sort} onSort={onSort} title="Sort by views" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const d = nearest.get(o.id);
            return (
              <tr key={o.id} className={o.active ? "" : "off"}>
                {showPlace && (
                  <td>
                    <Link to={`/restaurants/${o.key}`} className="ad-row-link">
                      <Avatar src={o.logo} name={o.restaurant} square size={32} />
                      <span><b>{o.restaurant}</b>{o.source === "account" && <small className="ad-src account">added by restaurant</small>}</span>
                    </Link>
                  </td>
                )}
                <td className="ad-offer-cell">
                  <span className="ad-pct sm">{pct(o.pct)}</span>
                  <span>
                    <b>{o.title}</b>
                    <small className="muted">{o.cap != null ? `up to ${rs(o.cap)}` : "no cap"}{!o.active && " · ended"}</small>
                  </span>
                </td>
                <td className="ad-wrap-sm"><b>{o.bank}</b><small className="muted ad-cards">{o.cards.length ? o.cards.join(", ") : o.bank_slug === "direct" ? "no card needed" : "any card"}</small></td>
                <td className="ad-days">{daysText(o.days)}</td>
                <td className="ad-nowrap">{o.till ? fmtDate(o.till) : <span className="muted">—</span>}</td>
                <td className="num">{d != null ? fmtKm(d) : <span className="muted">—</span>}</td>
                <td className="num"><b>{fmtN(o.favs)}</b></td>
                <td className="num">{fmtN(o.views)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && empty}
        </tbody>
      </table>
    </div>
  );
}
