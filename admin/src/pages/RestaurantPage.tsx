import { useMemo, useState } from "react";
import { api, fmtDate, fmtN, pct, rs, sourceLabel, type Branch, type Offer } from "../api";
import { I } from "../icons";
import { Link } from "../router";
import { Avatar, Empty, Field, Loading, Section, Stat, Th, sortRows, useLoad, useSort } from "../ui";

export function RestaurantPage({ rkey }: { rkey: string }) {
  const { data: d, err, retry } = useLoad(() => api.restaurant(rkey), [rkey]);
  const [offerFilter, setOfferFilter] = useState<"all" | "active" | "inactive">("active");
  if (err) return <><Back /><section className="ad-card">{err.startsWith("Restaurant not found")
        ? <Empty text="Restaurant not found" />
        : <Empty err={err} onRetry={retry} text="No records found" />}</section></>;
  if (!d) return <><Back /><Loading /></>;
  const r = d.row;
  const offers = d.offers.filter((o) => offerFilter === "all" || (offerFilter === "active" ? o.is_active : !o.is_active));

  return (
    <>
      <Back />
      <section className="ad-card ad-hero">
        <div className="ad-cover" style={d.cover_url ? { backgroundImage: `url(${d.cover_url}), linear-gradient(135deg, #3d0a70, #5b02a5 55%, #8b3fd1)` } : undefined} />
        <div className="ad-hero-body">
          <Avatar src={r.logo_url} name={r.name} size={84} square />
          <div className="ad-grow">
            <h1>{r.name}</h1>
            <p className="muted">
              <span className={`ad-src ${r.source}`}>{sourceLabel(r.source)}</span>
              {r.rating != null && <> · {I.star} {r.rating.toFixed(1)} ({fmtN(r.rating_count ?? 0)})</>}
            </p>
            {r.tags.length > 0 && <div className="ad-tags">{r.tags.map((t) => <span key={t}>{t}</span>)}</div>}
          </div>
        </div>
      </section>

      <div className="ad-stats">
        <Stat icon={I.heart} label="Favourites" value={fmtN(r.favourites)} sub="on all its offers" />
        <Stat icon={I.eye} label="Views" value={fmtN(r.views)} sub="link + sidebar opens" />
        <Stat icon={I.tag} label="Offers" value={r.active_offers} sub={`active · ${r.offers} in total`} />
        <Stat icon={I.pin} label="Branches" value={r.branches} sub={`best discount ${pct(r.best_discount)}`} />
      </div>

      {d.owners.length > 0 && (
        <Section title="Restaurant account">
          {d.owners.map((u) => (
            <dl key={u.id} className="ad-kvs">
              <Field k="Restaurant name" v={u.restaurant_name} />
              <Field k="Owner / manager" v={u.full_name} />
              <Field k="Email" v={<a href={`mailto:${u.email}`}>{u.email}</a>} />
              <Field k="Phone" v={u.phone} />
              <Field k="Account" v={<Link to={`/users/${u.id}`}>Open full account details →</Link>} />
            </dl>
          ))}
        </Section>
      )}

      <Section title="Offers" count={d.offers.length} right={
        <span className="ad-seg">
          {(["active", "inactive", "all"] as const).map((k) => (
            <button key={k} className={offerFilter === k ? "on" : ""} onClick={() => setOfferFilter(k)}>
              {k === "active" ? "Active" : k === "inactive" ? "Ended" : "All"}
            </button>
          ))}
        </span>
      }>
        {offers.length === 0 ? <p className="muted">No {offerFilter === "all" ? "" : offerFilter === "active" ? "active " : "ended "}offers.</p> : (
          <div className="ad-offers">{offers.map((o) => <OfferCard key={o.id} o={o} />)}</div>
        )}
      </Section>

      <Section title="Branches" count={d.branches.length}>
        {d.branches.length === 0 ? <p className="muted">No branches yet.</p> : (
          <BranchesTable rows={d.branches} />
        )}
        {d.branches.some((b) => b.website) && (
          <p className="ad-pad-t">Website: {[...new Set(d.branches.map((b) => b.website).filter(Boolean))].map((w) => <a key={w} href={w!} target="_blank" rel="noreferrer">{w}</a>)}</p>
        )}
      </Section>

      {d.branches.some((b) => b.menu_images.length) && (
        <Section title="Menu">
          <div className="ad-menu">
            {[...new Set(d.branches.flatMap((b) => b.menu_images))].slice(0, 12).map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Menu page" loading="lazy" /></a>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** The customer site (set VITE_SITE_URL in admin/.env for production). "#preview" = don't count a view. */
const SITE = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "http://localhost:5173";

function Back() {
  return <Link to="/restaurants" className="ad-back">{I.back} All restaurants</Link>;
}

function Hours({ h }: { h: Record<string, string> | null }) {
  const [open, setOpen] = useState(false);
  if (!h || !Object.keys(h).length) return <span className="muted">—</span>;
  return (
    <span className="ad-hours">
      <button className="ad-link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>
      {open && <span>{Object.entries(h).map(([d, t]) => <span key={d}><b>{d.slice(0, 3)}</b> {t}</span>)}</span>}
    </span>
  );
}

function OfferCard({ o }: { o: Offer }) {
  const [terms, setTerms] = useState(false);
  return (
    <article className={`ad-offer ${o.is_active ? "" : "off"}`}>
      <div className="ad-offer-top">
        <span className="ad-pct">{pct(o.discount_percent)} OFF{o.max_discount_amount != null && <small>up to {rs(o.max_discount_amount)}</small>}</span>
        <span className="ad-grow">
          <b>{o.title}</b>
          <small className="muted">{o.bank} · {o.source === "account" ? "added by the restaurant" : "from the bank's site"}</small>
        </span>
        <span className={`ad-badge ${o.is_active ? "on" : "off"}`}>{o.is_active ? "Active" : "Ended"}</span>
      </div>
      <div className="ad-offer-stats">
        <span>{I.heart}<b>{fmtN(o.favourites)}</b> favourite{o.favourites === 1 ? "" : "s"}</span>
        <span>{I.eye}<b>{fmtN(o.views)}</b> view{o.views === 1 ? "" : "s"}</span>
        <span>{I.pin}{o.branches} branch{o.branches === 1 ? "" : "es"}</span>
      </div>
      {o.description && <p className="ad-offer-desc">{o.description}</p>}
      <dl className="ad-kvs compact">
        <Field k="Days" v={o.valid_days?.length ? o.valid_days.join(", ") : "Every day"} />
        <Field k="Valid" v={o.valid_from || o.valid_till ? `${fmtDate(o.valid_from)} → ${o.valid_till ? fmtDate(o.valid_till) : "no end date"}` : "—"} />
        <Field k="Cards" v={o.cards.length ? o.cards.map((c) => `${c.name}${c.discount_percent != null && c.discount_percent !== o.discount_percent ? ` (${pct(c.discount_percent)})` : ""}`).join(", ") : o.bank_slug === "direct" ? "No card needed" : `Any ${o.bank} card`} />
        <Field k="First seen" v={fmtDate(o.first_seen_at)} />
      </dl>
      <div className="ad-offer-foot">
        {o.terms && <button className="ad-link" onClick={() => setTerms(!terms)}>Terms &amp; conditions {terms ? "▴" : "▾"}</button>}
        {o.source_url && <a href={o.source_url} target="_blank" rel="noreferrer">Bank's page {I.ext}</a>}
        <a href={`${SITE}/dashboard/offer/${o.id}#preview`} target="_blank" rel="noreferrer">Open on the site {I.ext}</a>
      </div>
      {terms && o.terms && <p className="ad-terms">{o.terms}</p>}
    </article>
  );
}

const BRANCH_COLS: Record<string, (b: Branch) => string | number | null> = {
  address: (b) => b.address,
  area: (b) => b.area,
  phone: (b) => b.phone,
  hours: (b) => (b.hours ? Object.keys(b.hours).length : null),
  map: (b) => (b.latitude != null ? b.latitude : null),
};

function BranchesTable({ rows }: { rows: Branch[] }) {
  const { sort, toggle } = useSort({ key: "area", dir: 1 });
  const sorted = useMemo(() => sortRows(rows, sort, BRANCH_COLS), [rows, sort]);
  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead>
          <tr>
            <Th k="address" label="Address" sort={sort} onSort={toggle} />
            <Th k="area" label="Area" sort={sort} onSort={toggle} />
            <Th k="phone" label="Phone" sort={sort} onSort={toggle} />
            <Th k="hours" label="Hours" sort={sort} onSort={toggle} firstDir={-1} title="Sort by whether opening hours are known" />
            <Th k="map" label="Map" sort={sort} onSort={toggle} title="Sort by map pin (north to south)" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => (
            <tr key={b.id}>
              <td className="ad-wrap">{b.address || <span className="muted">—</span>}{b.from_account && <small className="ad-src account"> added by restaurant</small>}</td>
              <td>{b.area || <span className="muted">—</span>}</td>
              <td className="ad-nowrap">{b.phone ? <a href={`tel:${b.phone}`}>{b.phone}</a> : <span className="muted">—</span>}</td>
              <td><Hours h={b.hours} /></td>
              <td className="ad-nowrap">
                {b.latitude != null && b.longitude != null
                  ? <a href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`} target="_blank" rel="noreferrer">{b.latitude.toFixed(4)}, {b.longitude.toFixed(4)} {I.ext}</a>
                  : <span className="muted">no pin</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
