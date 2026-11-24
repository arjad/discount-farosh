/**
 * /dashboard for restaurant accounts (dashboard/DashboardGate picks this page) — where a restaurant account adds and manages its own discounts.
 * Every discount gets a code (DF-XXXXXX). Status: active / upcoming / expired — expired when the owner
 * presses "Expire now" or when the end date has passed (worked out on the server, Pakistan time).
 */
import { useEffect, useMemo, useState } from "react";
import logo from "../assets/logo.png";
import { authApi, type Me } from "../auth/api";
import { NotLoggedIn } from "../profile/api";
import { DealForm } from "./DealForm";
import {
  DAY_SHORT, cardsLabel, dateLabel, daysLabel, fmtDay, partnerApi, pct, rs, timeLabel, todayPk,
  type Branch, type Deal, type DealIn, type DealStatus,
} from "./api";
import "./partner.css";

export const ICON = {
  cal: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  clock: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  card: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>,
  pin: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  family: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="7" r="2.5" /><circle cx="16" cy="7" r="2.5" /><circle cx="12" cy="13" r="2" /><path d="M3.5 20v-3a4 4 0 0 1 4-4h1M20.5 20v-3a4 4 0 0 0-4-4h-1M9 20v-1.5a3 3 0 0 1 6 0V20" /></svg>,
  range: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg>,
  copy: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>,
  plus: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  tag: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.5" /></svg>,
  shop: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M9 20v-6h6v6" /></svg>,
  heart: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>,
  eye: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>,
  filter: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>,
  live: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" /></svg>,
};

const fmtN = (n: number) => n.toLocaleString("en-PK");

type Tab = "all" | DealStatus;
const STATUS_TEXT: Record<DealStatus, string> = { active: "Active", upcoming: "Starts later", expired: "Expired" };

export default function Partner() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState<Deal | "new" | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    document.title = "Dashboard";
    authApi.me().then((u) => {
      if (!u) return window.location.replace("/login?next=/dashboard");
      setMe(u);
      if (u.role !== "restaurant") return;
      Promise.all([partnerApi.deals(), partnerApi.branches()])
        .then(([d, b]) => {
          setDeals(d);
          setBranches(b);
        })
        .catch(fail);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === "err" ? 6000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function fail(e: unknown) {
    if (e instanceof NotLoggedIn) return window.location.replace("/login?next=/dashboard");
    setToast({ kind: "err", text: e instanceof Error ? e.message : String(e) });
  }

  const put = (d: Deal) => setDeals((l) => (l ? (l.some((x) => x.id === d.id) ? l.map((x) => (x.id === d.id ? d : x)) : [d, ...l]) : [d]));

  const counts = useMemo(() => {
    const c = { all: 0, active: 0, upcoming: 0, expired: 0 } as Record<Tab, number>;
    for (const d of deals ?? []) {
      c.all++;
      c[d.status]++;
    }
    return c;
  }, [deals]);
  const shown = useMemo(() => applyFilters(deals ?? [], f), [deals, f]);
  const totals = useMemo(() => ({
    views: (deals ?? []).reduce((n, d) => n + d.views, 0),
    favourites: (deals ?? []).reduce((n, d) => n + d.favourites, 0),
    live: (deals ?? []).filter((d) => d.live).length,
  }), [deals]);
  const activeFilters = countFilters(f);

  const logout = async () => {
    await authApi.logout().catch(() => {});
    window.location.assign("/");
  };

  async function save(body: DealIn) {
    const d = form && form !== "new" ? await partnerApi.editDeal(form.id, body) : await partnerApi.addDeal(body);
    put(d);
    setForm(null);
    setToast({ kind: "ok", text: form === "new" ? `Discount added — code ${d.code}` : "Discount saved." });
    if (form === "new") setF(NO_FILTERS);
  }
  async function expire(d: Deal) {
    if (!window.confirm(`Expire ${pct(d.discount_percent)} off (${d.code}) now? Customers won't see it any more.`)) return;
    try {
      put(await partnerApi.expireDeal(d.id));
      setToast({ kind: "ok", text: "Discount expired." });
    } catch (e) {
      fail(e);
    }
  }
  async function restore(d: Deal) {
    try {
      put(await partnerApi.restoreDeal(d.id));
      setToast({ kind: "ok", text: "Discount is running again." });
    } catch (e) {
      fail(e);
    }
  }
  async function remove(d: Deal) {
    if (!window.confirm(`Delete this discount (${d.code}) for good?`)) return;
    try {
      await partnerApi.deleteDeal(d.id);
      setDeals((l) => l?.filter((x) => x.id !== d.id) ?? null);
      setToast({ kind: "ok", text: "Discount deleted." });
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="rd">
      <header className="rd-top">
        <div className="rd-top-inner">
          <a href="/dashboard" className="rd-brand"><img src={logo} alt="Discount فرویش" /></a>
          <nav className="rd-nav">
            <a href="/dashboard" aria-current="page">My discounts</a>
            <a href="/profile">Profile &amp; branches</a>
          </nav>
          <div className="rd-top-right">
            {me && (
              <a href="/profile" className="rd-who" title="Logo, cover photo and branches">
                <span className="rd-logo">{me.avatar ? <img src={me.avatar} alt="" /> : (me.restaurant_name || me.full_name || "R").charAt(0).toUpperCase()}</span>
                <span className="rd-who-name">{me.restaurant_name || me.full_name}</span>
              </a>
            )}
            <button className="rd-btn ghost" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>

      <main className="rd-main">
        {me === undefined ? (
          <p className="rd-loading">Loading…</p>
        ) : me && me.role !== "restaurant" ? (
          <div className="rd-empty big">
            {ICON.shop}
            <h2>This page is for restaurant accounts</h2>
            <p>You're logged in as a customer. To list a restaurant, create a restaurant account.</p>
            <div className="rd-row">
              <a className="rd-btn" href="/dashboard">See deals</a>
              <a className="rd-btn ghost" href="/signup?as=restaurant">Sign up as a restaurant</a>
            </div>
          </div>
        ) : (
          <>
            <div className="rd-head">
              <div>
                <h1>Your discounts</h1>
                <p className="muted">Add a discount in a minute — customers see the code, days, times and the cards it works with.</p>
              </div>
              <button className="rd-btn big" onClick={() => setForm("new")}>{ICON.plus} Add a discount</button>
            </div>

            {deals && branches.length === 0 && (
              <div className="rd-alert">
                {ICON.pin}
                <span><b>Add a branch to go live.</b> Customers only see your discounts once you've added at least one branch with its exact location.</span>
                <a className="rd-btn small" href="/profile">Add branches</a>
              </div>
            )}

            <div className="rd-stats">
              <div><span>{ICON.eye} Views</span><b>{deals ? fmtN(totals.views) : "–"}</b><small>times customers opened your offers</small></div>
              <div><span>{ICON.heart} Favourites</span><b>{deals ? fmtN(totals.favourites) : "–"}</b><small>saves by customers</small></div>
              <div><span>{ICON.live} Live now</span><b>{deals ? totals.live : "–"}</b><small>of {counts.all} discount{counts.all === 1 ? "" : "s"} shown to customers</small></div>
            </div>

            <button className="rd-btn ghost rd-filter-toggle" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
              {ICON.filter} Filters{activeFilters ? ` (${activeFilters})` : ""}
            </button>

            <div className="rd-layout">
            <FilterPanel f={f} setF={setF} deals={deals ?? []} branches={branches} counts={counts} open={showFilters} />
            <section className="rd-results">
            {deals && (
              <div className="rd-results-bar">
                <span><b>{shown.length}</b> of {deals.length} discount{deals.length === 1 ? "" : "s"}</span>
                <label>Sort by
                  <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as Sort })}>
                    {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
            )}
            {deals === null ? (
              <div className="rd-grid">{[0, 1, 2].map((i) => <div key={i} className="rd-deal sk" />)}</div>
            ) : shown.length === 0 ? (
              <div className="rd-empty">
                {ICON.tag}
                {deals.length === 0 ? (
                  <>
                    <h2>No discounts yet</h2>
                    <p>Add your first discount — choose the %, the days, the time and the cards. It takes about a minute.</p>
                    <button className="rd-btn big" onClick={() => setForm("new")}>{ICON.plus} Add your first discount</button>
                  </>
                ) : (
                  <>
                    <p>No discounts match these filters.</p>
                    <button className="rd-btn ghost" onClick={() => setF(NO_FILTERS)}>Clear filters</button>
                  </>
                )}
              </div>
            ) : (
              <div className="rd-grid">
                {shown.map((d) => (
                  <DealCard
                    key={d.id}
                    d={d}
                    branches={branches}
                    onEdit={() => setForm(d)}
                    onExpire={() => expire(d)}
                    onRestore={() => restore(d)}
                    onDelete={() => remove(d)}
                    onCopied={() => setToast({ kind: "ok", text: `Code ${d.code} copied.` })}
                  />
                ))}
              </div>
            )}
            </section>
            </div>
          </>
        )}
      </main>

      {form && (
        <DealForm
          start={form === "new" ? null : form}
          branches={branches}
          onClose={() => setForm(null)}
          onSave={save}
        />
      )}

      {toast && (
        <div key={toast.text} className={`rd-toast ${toast.kind}`} role="status"
          style={{ ["--life" as string]: `${toast.kind === "err" ? 6000 : 3000}ms` } as React.CSSProperties}>
          {toast.text}
          <button onClick={() => setToast(null)} aria-label="Dismiss">{ICON.close}</button>
        </div>
      )}
    </div>
  );
}

function DealCard({ d, branches, onEdit, onExpire, onRestore, onDelete, onCopied }: {
  d: Deal; branches: Branch[]; onEdit: () => void; onExpire: () => void; onRestore: () => void; onDelete: () => void; onCopied: () => void;
}) {
  const [terms, setTerms] = useState(false);
  const where = d.branch_ids.length === 0
    ? "All branches"
    : d.branch_ids.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean).join(", ") || "All branches";
  const copy = () => navigator.clipboard?.writeText(d.code).then(onCopied).catch(() => {});
  const endedByDate = d.status === "expired" && d.end_date != null && d.end_date < todayPk();

  return (
    <article className={`rd-deal ${d.status}`}>
      <div className="rd-deal-top">
        <div className="rd-pct">
          <b>{pct(d.discount_percent)} OFF</b>
          {d.max_discount != null && <span>up to {rs(d.max_discount)}</span>}
        </div>
        <span className={`rd-status ${d.status}`}>
          {STATUS_TEXT[d.status]}
          {d.status === "upcoming" && <> · {fmtDay(d.start_date)}</>}
        </span>
      </div>

      <h3>{d.title || `${pct(d.discount_percent)} off the bill`}</h3>

      <div className="rd-deal-stats">
        <span title="Customers who saved this deal">{ICON.heart}<b>{fmtN(d.favourites)}</b> favourite{d.favourites === 1 ? "" : "s"}</span>
        <span title="Times customers opened it — from a shared link or the dashboard sidebar">{ICON.eye}<b>{fmtN(d.views)}</b> view{d.views === 1 ? "" : "s"}</span>
        {d.live ? <span className="rd-live">Live for customers</span> : d.status !== "expired" && <span className="rd-notlive">{d.status === "upcoming" ? "Goes live on the start date" : "Not live — add a branch"}</span>}
      </div>

      <button className="rd-code" onClick={copy} title="Copy code">
        <span>Code</span><b>{d.code}</b>{ICON.copy}
      </button>

      <ul className="rd-facts">
        <li>{ICON.cal}<span><b>{daysLabel(d.days)}</b></span></li>
        <li>{ICON.clock}<span>{timeLabel(d)}</span></li>
        <li>{ICON.range}<span>{dateLabel(d)}</span></li>
        <li>{ICON.card}<span>{cardsLabel(d.cards)}</span></li>
        <li>{ICON.pin}<span>{where}</span></li>
        {d.is_family && <li className="fam">{ICON.family}<span><b>Family deal</b>{d.family_size ? ` · for ${d.family_size} people` : ""}</span></li>}
      </ul>

      {d.terms && (
        <div className="rd-terms">
          <button onClick={() => setTerms(!terms)} aria-expanded={terms}>Terms &amp; conditions {terms ? "▴" : "▾"}</button>
          {terms && <p>{d.terms}</p>}
        </div>
      )}

      {d.status === "expired" && (
        <p className="rd-exp-note">{endedByDate ? `Ended on ${fmtDay(d.end_date!)}.` : "You expired this discount."}</p>
      )}

      <div className="rd-actions">
        <button className="rd-btn small ghost" onClick={onEdit}>Edit</button>
        {d.status !== "expired" ? (
          <button className="rd-btn small warn" onClick={onExpire}>Expire now</button>
        ) : d.expired_by_owner && !endedByDate ? (
          <button className="rd-btn small ghost" onClick={onRestore}>Run again</button>
        ) : (
          <button className="rd-btn small ghost" onClick={onEdit}>Change dates</button>
        )}
        <button className="rd-icon-btn" onClick={onDelete} aria-label="Delete discount" title="Delete">{ICON.close}</button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- filters (left side)

type Sort = "newest" | "views" | "favourites" | "discount" | "ending";
const SORTS: Record<Sort, string> = {
  newest: "Newest first", views: "Most viewed", favourites: "Most favourites", discount: "Highest discount", ending: "Ending soonest",
};
type Filters = {
  q: string; status: Tab; days: number[]; branches: number[]; banks: string[];
  family: boolean; time: "any" | "allday" | "hours"; sort: Sort;
};
const NO_FILTERS: Filters = { q: "", status: "all", days: [], branches: [], banks: [], family: false, time: "any", sort: "newest" };
const countFilters = (f: Filters) =>
  (f.q.trim() ? 1 : 0) + (f.status !== "all" ? 1 : 0) + f.days.length + f.branches.length + f.banks.length + (f.family ? 1 : 0) + (f.time !== "any" ? 1 : 0);
const DIRECT = "__none";
const bankKeys = (d: Deal) => (d.cards.length ? [...new Set(d.cards.map((c) => c.bank_slug))] : [DIRECT]);

function applyFilters(deals: Deal[], f: Filters) {
  const q = f.q.trim().toLowerCase();
  const out = deals.filter((d) => {
    if (f.status !== "all" && d.status !== f.status) return false;
    if (q && !`${d.code} ${d.title ?? ""} ${d.terms ?? ""} ${pct(d.discount_percent)}`.toLowerCase().includes(q)) return false;
    if (f.days.length && d.days.length && !f.days.some((x) => d.days.includes(x))) return false; // no days = every day
    if (f.branches.length && d.branch_ids.length && !f.branches.some((x) => d.branch_ids.includes(x))) return false; // none = all
    if (f.banks.length && !bankKeys(d).some((b) => f.banks.includes(b))) return false;
    if (f.family && !d.is_family) return false;
    if (f.time === "allday" && d.start_time) return false;
    if (f.time === "hours" && !d.start_time) return false;
    return true;
  });
  const by: Record<Sort, (a: Deal, b: Deal) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    views: (a, b) => b.views - a.views,
    favourites: (a, b) => b.favourites - a.favourites,
    discount: (a, b) => b.discount_percent - a.discount_percent,
    ending: (a, b) => (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999"),
  };
  return out.sort((a, b) => by[f.sort](a, b) || b.created_at.localeCompare(a.created_at));
}

function FilterPanel({ f, setF, deals, branches, counts, open }: {
  f: Filters; setF: (f: Filters) => void; deals: Deal[]; branches: Branch[]; counts: Record<Tab, number>; open: boolean;
}) {
  const banks = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>();
    for (const d of deals) {
      const seen = new Set<string>();
      for (const c of d.cards.length ? d.cards : [{ bank_slug: DIRECT, bank_name: "No card needed" }]) {
        if (seen.has(c.bank_slug)) continue;
        seen.add(c.bank_slug);
        const e = m.get(c.bank_slug) ?? { name: c.bank_name, n: 0 };
        e.n++;
        m.set(c.bank_slug, e);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [deals]);
  const toggleN = (list: number[], v: number) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleS = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const n = countFilters(f);

  return (
    <aside className={`rd-filters ${open ? "open" : ""}`} aria-label="Filters">
      <div className="rd-f-head">
        <b>Filters</b>
        {n > 0 && <button className="rd-link" onClick={() => setF({ ...NO_FILTERS, sort: f.sort })}>Clear all</button>}
      </div>

      <input className="rd-f-search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search code or name" aria-label="Search discounts" />

      <div className="rd-f-sec">
        <h4>Status</h4>
        {(["all", "active", "upcoming", "expired"] as Tab[]).map((t) => (
          <label key={t} className="rd-f-row">
            <input type="radio" name="rd-status" checked={f.status === t} onChange={() => setF({ ...f, status: t })} />
            <span>{t === "all" ? "All" : STATUS_TEXT[t]}</span><small>{counts[t]}</small>
          </label>
        ))}
      </div>

      <div className="rd-f-sec">
        <h4>Days</h4>
        <div className="rd-f-days">
          {DAY_SHORT.map((d, i) => (
            <button key={d} className={f.days.includes(i) ? "on" : ""} aria-pressed={f.days.includes(i)} onClick={() => setF({ ...f, days: toggleN(f.days, i) })}>{d}</button>
          ))}
        </div>
      </div>

      <div className="rd-f-sec">
        <h4>Time</h4>
        <div className="rd-f-chips">
          {([["any", "Any"], ["allday", "All day"], ["hours", "Set hours"]] as const).map(([k, label]) => (
            <button key={k} className={f.time === k ? "on" : ""} onClick={() => setF({ ...f, time: k })}>{label}</button>
          ))}
        </div>
      </div>

      {branches.length > 0 && (
        <div className="rd-f-sec">
          <h4>Branch</h4>
          {branches.map((b) => (
            <label key={b.id} className="rd-f-row">
              <input type="checkbox" checked={f.branches.includes(b.id)} onChange={() => setF({ ...f, branches: toggleN(f.branches, b.id) })} />
              <span>{b.name}</span>
            </label>
          ))}
        </div>
      )}

      {banks.length > 0 && (
        <div className="rd-f-sec">
          <h4>Cards</h4>
          {banks.map(([slug, { name, n: count }]) => (
            <label key={slug} className="rd-f-row">
              <input type="checkbox" checked={f.banks.includes(slug)} onChange={() => setF({ ...f, banks: toggleS(f.banks, slug) })} />
              <span>{name}</span><small>{count}</small>
            </label>
          ))}
        </div>
      )}

      <div className="rd-f-sec">
        <h4>Type</h4>
        <label className="rd-f-row">
          <input type="checkbox" checked={f.family} onChange={() => setF({ ...f, family: !f.family })} />
          <span>Family deals only</span><small>{deals.filter((d) => d.is_family).length}</small>
        </label>
      </div>
    </aside>
  );
}
