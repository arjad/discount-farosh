import { useMemo } from "react";
import { api, ago, device, fmtDate, fmtN, pct, rs, roleLabel, type Deal, type Place } from "../api";
import { I } from "../icons";
import { Link } from "../router";
import { Avatar, Empty, Field, Loading, Section, Stat, Th, sortRows, useLoad, useSort } from "../ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const t12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
};

export function UserPage({ id }: { id: number }) {
  const { data: d, err, retry } = useLoad(() => api.user(id), [id]);
  if (err) return <><Back /><section className="ad-card">{err.startsWith("User not found")
        ? <Empty text="User not found" />
        : <Empty err={err} onRetry={retry} text="No records found" />}</section></>;
  if (!d) return <><Back /><Loading /></>;
  const u = d.row;
  const isRest = u.role === "restaurant";
  const name = isRest ? u.restaurant_name || u.full_name || u.email : u.full_name || u.email;

  return (
    <>
      <Back />
      <section className={`ad-card ad-hero ${isRest ? "" : "plain"}`}>
        {isRest && <div className="ad-cover" style={d.cover ? { backgroundImage: `url(${d.cover}), linear-gradient(135deg, #3d0a70, #5b02a5 55%, #8b3fd1)` } : undefined} />}
        <div className="ad-hero-body">
          <Avatar src={d.avatar} name={name} size={84} square={isRest} />
          <div className="ad-grow">
            <h1>{name}</h1>
            <p className="muted">
              <span className={`ad-badge ${u.role}`}>{roleLabel(u.role)}</span>{" "}
              {!u.is_active && <span className="ad-badge off">Disabled</span>} · joined {fmtDate(u.created_at)} · last active {ago(u.last_seen_at)}
            </p>
          </div>
        </div>
      </section>

      <div className="ad-stats">
        {isRest ? (
          <>
            <Stat icon={I.pin} label="Branches" value={d.branches.length} />
            <Stat icon={I.tag} label="Discounts" value={d.deals.length} sub={`${d.deals.filter((x) => x.live).length} live now`} />
            <Stat icon={I.heart} label="Favourites" value={fmtN(d.deals.reduce((n, x) => n + x.favourites, 0))} sub="on its discounts" />
            <Stat icon={I.eye} label="Views" value={fmtN(d.deals.reduce((n, x) => n + x.views, 0))} sub="on its discounts" />
          </>
        ) : (
          <>
            <Stat icon={I.card} label="Cards" value={u.cards} />
            <Stat icon={I.heart} label="Favourites" value={u.favourites} sub="offers saved" />
            <Stat icon={I.eye} label="Views" value={u.views} sub="offers opened" />
            <Stat icon={I.shop} label="Visits" value={u.visits} sub="restaurants marked visited" />
          </>
        )}
      </div>

      <div className="ad-two">
        <Section title="Details">
          <dl className="ad-kvs">
            <Field k="User ID" v={`#${u.id}`} />
            {isRest && <Field k="Restaurant name" v={u.restaurant_name} />}
            <Field k={isRest ? "Owner / manager" : "Full name"} v={u.full_name} />
            <Field k="Email" v={<a href={`mailto:${u.email}`}>{u.email}</a>} />
            <Field k="Phone" v={u.phone ? <a href={`tel:${u.phone}`}>{u.phone}</a> : null} />
            <Field k="City" v={u.city} />
            <Field k="Country" v={u.country} />
            <Field k="Account type" v={roleLabel(u.role)} />
            <Field k="Status" v={u.is_active ? "Active" : "Disabled"} />
            <Field k="Profile picture" v={d.avatar ? "Uploaded" : "None"} />
            <Field k="Joined" v={fmtDate(u.created_at, true)} />
            <Field k="Profile last updated" v={fmtDate(d.updated_at, true)} />
            <Field k="Last active" v={u.last_seen_at ? fmtDate(u.last_seen_at, true) : "Never"} />
            <Field k="Password" v={<span className="muted">Hidden — stored only as a secure hash</span>} />
          </dl>
        </Section>

        {isRest ? (
          <Section title="Branches" count={d.branches.length}>
            {d.branches.length === 0 ? <p className="muted">No branches added yet — its discounts aren't shown to customers.</p> : (
              <ul className="ad-list">
                {d.branches.map((b, i) => (
                  <li key={i} className="ad-list-row static">
                    <span className="ad-ic">{I.pin}</span>
                    <span className="ad-grow"><b>{b.name}</b><small className="muted">{b.address}</small>
                      <small><a href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`} target="_blank" rel="noreferrer">{b.lat.toFixed(5)}, {b.lng.toFixed(5)} {I.ext}</a>{b.phone && <> · {b.phone}</>}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="ad-pad-t"><Link to={`/restaurants/${slug(u.restaurant_name || u.full_name || u.email)}`}>See it as a restaurant →</Link></p>
          </Section>
        ) : (
          <Section title="Saved places">
            <dl className="ad-kvs">
              <Field k="Home" v={<PlaceV p={d.home} />} />
              <Field k="Office" v={<PlaceV p={d.work} />} />
            </dl>
            <h3 className="ad-h3">Cards <small className="muted">(bank + card type only — never card numbers)</small></h3>
            {d.cards.length === 0 ? <p className="muted">No cards added.</p> : (
              <ul className="ad-chips">{d.cards.map((c, i) => <li key={i}>{I.card}<b>{c.bank}</b> {c.card}</li>)}</ul>
            )}
          </Section>
        )}
      </div>

      {isRest && (
        <Section title="Discounts" count={d.deals.length}>
          {d.deals.length === 0 ? <p className="muted">No discounts added yet.</p> : (
            <DealsTable rows={d.deals} />
          )}
        </Section>
      )}

      {!isRest && (
        <div className="ad-two">
          <Section title="Favourite offers" count={d.favourites.length}>
            {d.favourites.length === 0 ? <p className="muted">No favourites saved while logged in.</p> : (
              <ul className="ad-list">
                {d.favourites.map((f) => (
                  <li key={f.offer_id} className="ad-list-row static">
                    <span className="ad-ic">{I.heart}</span>
                    <span className="ad-grow"><b>{f.place ?? f.title}</b><small className="muted">{pct(f.discount_percent)} · {f.bank} · {f.title}</small></span>
                    <small className="muted ad-nowrap">{ago(f.saved_at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Recently viewed" count={d.recent_views.length}>
            {d.recent_views.length === 0 ? <p className="muted">No offers opened while logged in.</p> : (
              <ul className="ad-list">
                {d.recent_views.map((v, i) => (
                  <li key={i} className="ad-list-row static">
                    <span className="ad-ic">{I.eye}</span>
                    <span className="ad-grow"><b>{v.place ?? v.title}</b><small className="muted">{v.title} · from {v.source === "link" ? "a link" : "the sidebar"}</small></span>
                    <small className="muted ad-nowrap">{ago(v.viewed_at)}</small>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {!isRest && d.visits.length > 0 && (
        <Section title="Restaurants visited" count={d.visits.length}>
          <ul className="ad-list">
            {d.visits.map((v, i) => (
              <li key={i} className="ad-list-row static">
                <span className="ad-ic">{I.shop}</span>
                <span className="ad-grow"><b>{v.place}</b><small className="muted">{v.address ?? ""}{v.bank ? ` · ${v.bank}` : ""}{v.discount_percent != null ? ` · ${pct(v.discount_percent)}` : ""}</small></span>
                <small className="muted ad-nowrap">{fmtDate(v.visited_at)}</small>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Logged-in devices" count={d.sessions.length}>
        {d.sessions.length === 0 ? <p className="muted">Not logged in anywhere right now.</p> : (
          <ul className="ad-list">
            {d.sessions.map((s, i) => (
              <li key={i} className="ad-list-row static">
                <span className="ad-ic">{I.device}</span>
                <span className="ad-grow"><b>{device(s.device)}</b><small className="muted">logged in {fmtDate(s.created_at, true)} · session ends {fmtDate(s.expires_at)}</small></span>
                <small className="muted ad-nowrap">active {ago(s.last_seen_at)}</small>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed";

function PlaceV({ p }: { p: Place }) {
  if (!p.label && p.lat == null) return <span className="muted">Not set</span>;
  return (
    <span>
      {p.label || "Pinned on map"}
      {p.lat != null && p.lng != null && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">map {I.ext}</a></>}
    </span>
  );
}

function Back() {
  return <Link to="/users" className="ad-back">{I.back} All users</Link>;
}

const STATUS_RANK = (x: Deal) => (x.live ? 0 : x.status === "upcoming" ? 1 : x.status === "active" ? 2 : 3);
const DEAL_COLS: Record<string, (x: Deal) => string | number | null> = {
  code: (x) => x.code,
  discount: (x) => x.discount_percent,
  days: (x) => (x.days.length ? x.days.length : 7),
  dates: (x) => x.start_date,
  cards: (x) => (x.cards.length ? x.cards.map((c) => c.bank_name).join(", ") : "No card needed"),
  status: (x) => STATUS_RANK(x),
  favourites: (x) => x.favourites,
  views: (x) => x.views,
};

function DealsTable({ rows }: { rows: Deal[] }) {
  const { sort, toggle } = useSort({ key: "status", dir: 1 });
  const sorted = useMemo(() => sortRows(rows, sort, DEAL_COLS), [rows, sort]);
  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead>
          <tr>
            <Th k="code" label="Code" sort={sort} onSort={toggle} />
            <Th k="discount" label="Discount" sort={sort} onSort={toggle} firstDir={-1} />
            <Th k="days" label="Days · time" sort={sort} onSort={toggle} firstDir={-1} title="Sort by number of days" />
            <Th k="dates" label="Dates" sort={sort} onSort={toggle} firstDir={-1} title="Sort by start date" />
            <Th k="cards" label="Cards" sort={sort} onSort={toggle} />
            <Th k="status" label="Status" sort={sort} onSort={toggle} title="Live, starts later, not live, expired" />
            <Th k="favourites" label={I.heart} num sort={sort} onSort={toggle} title="Sort by favourites" />
            <Th k="views" label={I.eye} num sort={sort} onSort={toggle} title="Sort by views" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((x) => (
            <tr key={x.id}>
              <td className="ad-mono">{x.code}</td>
              <td><b>{pct(x.discount_percent)}</b>{x.max_discount != null && <small className="muted"> up to {rs(x.max_discount)}</small>}{x.is_family && <small className="ad-src account"> family{x.family_size ? ` · ${x.family_size}` : ""}</small>}<br /><small className="muted">{x.title}</small></td>
              <td>{x.days.length ? x.days.map((i) => DAYS[i]).join(", ") : "Every day"}<br /><small className="muted">{x.start_time && x.end_time ? `${t12(x.start_time)} – ${t12(x.end_time)}` : "All day"}</small></td>
              <td className="ad-nowrap">{fmtDate(x.start_date)}<br /><small className="muted">→ {x.end_date ? fmtDate(x.end_date) : "no end"}</small></td>
              <td>{x.cards.length ? x.cards.map((c) => (c.card_name ? `${c.bank_name} ${c.card_name}` : `All ${c.bank_name}`)).join(", ") : "No card needed"}</td>
              <td><span className={`ad-badge ${x.live ? "on" : x.status === "expired" ? "off" : "soon"}`}>{x.live ? "Live" : x.status === "expired" ? "Expired" : x.status === "upcoming" ? "Starts later" : "Not live"}</span></td>
              <td className="num"><b>{x.favourites}</b></td>
              <td className="num">{x.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
