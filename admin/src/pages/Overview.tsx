import { api, ago, fmtN, pct, roleLabel } from "../api";
import { I } from "../icons";
import { Link } from "../router";
import { Avatar, Empty, Loading, Section, Stat, useLoad } from "../ui";

export function Overview() {
  const { data: o, err, retry, loading } = useLoad(api.overview);
  const n = (v: number | undefined) => (v == null ? "–" : fmtN(v)); // "–" while loading or if it failed
  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Everything on Discount فرویش at a glance.</p>
        </div>
      </header>

      {loading ? <Loading rows={3} /> : (
        <>
          <div className="ad-stats">
            <Stat icon={I.users} label="Customers" value={n(o?.customers)} sub={o ? `+${o.signups_7d} sign-ups in 7 days` : "—"} />
            <Stat icon={I.shop} label="Restaurants" value={n(o?.restaurants)} sub="signed up on the app" />
            <Link to="/offers" className="ad-stat-link"><Stat icon={I.tag} label="Offers" value={n(o?.active_offers)} sub={o ? `active · ${fmtN(o.offers)} in total` : "—"} /></Link>
            <Stat icon={I.heart} label="Favourites" value={n(o?.favourites)} sub="saves by customers" />
            <Stat icon={I.eye} label="Views" value={n(o?.views)} sub={o ? `${fmtN(o.views_7d)} in the last 7 days` : "—"} />
          </div>

          <div className="ad-two">
            <Section title="Most favourited restaurants" right={<Link to="/restaurants">All restaurants</Link>}>
              {!o?.top_restaurants.length ? (
                <Empty err={err} onRetry={retry} text={err ? "No records found" : "No restaurant has signed up yet"} />
              ) : (
                <ul className="ad-list">
                  {o.top_restaurants.map((r) => (
                    <li key={r.key}>
                      <Link to={`/restaurants/${r.key}`} className="ad-list-row">
                        <Avatar src={r.logo_url} name={r.name} square />
                        <span className="ad-grow"><b>{r.name}</b><small className="muted">{r.active_offers} active offer{r.active_offers === 1 ? "" : "s"} · best {pct(r.best_discount)}</small></span>
                        <span className="ad-chip">{I.heart}{fmtN(r.favourites)}</span>
                        <span className="ad-chip">{I.eye}{fmtN(r.views)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Newest users" right={<Link to="/users">All users</Link>}>
              {!o?.newest_users.length ? (
                <Empty err={err} onRetry={retry} text={err ? "No records found" : "No one has signed up yet"} />
              ) : (
                <ul className="ad-list">
                  {o.newest_users.map((u) => (
                    <li key={u.id}>
                      <Link to={`/users/${u.id}`} className="ad-list-row">
                        <Avatar src={u.avatar_url} name={u.restaurant_name || u.full_name || u.email} />
                        <span className="ad-grow"><b>{u.role === "restaurant" ? u.restaurant_name || u.full_name : u.full_name || u.email}</b><small className="muted">{u.email}</small></span>
                        <span className={`ad-badge ${u.role}`}>{roleLabel(u.role)}</span>
                        <small className="muted ad-nowrap">{ago(u.created_at)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        </>
      )}
    </>
  );
}
