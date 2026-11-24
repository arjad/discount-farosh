import { useMemo, useState } from "react";
import { ago, api, fmtDate, fmtN, type UserRow } from "../api";
import { I } from "../icons";
import { Link } from "../router";
import { Avatar, Empty, EmptyRow, Loading, SortSelect, Th, ViewToggle, sortRows, useLoad, useSort, useView } from "../ui";

const PAGE = 100;
const nameOf = (u: UserRow) => u.full_name || u.email;
const COLS: Record<string, (u: UserRow) => string | number | null> = {
  name: (u) => nameOf(u),
  address: (u) => u.home_address || u.office_address,
  joined: (u) => u.created_at,
  seen: (u) => u.last_seen_at,
  cards: (u) => u.cards,
  favourites: (u) => u.favourites,
  views: (u) => u.views,
};
/** Sort choices for the grid (the table sorts by clicking its headers). */
const SORT_OPTIONS = [
  { k: "joined", label: "Joined", down: "newest first", up: "oldest first" },
  { k: "seen", label: "Last active", down: "most recent first", up: "least recent first" },
  { k: "name", label: "Name", up: "A → Z", down: "Z → A" },
  { k: "favourites", label: "Favourites", down: "most first", up: "fewest first" },
  { k: "views", label: "Views", down: "most first", up: "fewest first" },
  { k: "cards", label: "Cards", down: "most first", up: "fewest first" },
];

export function Users() {
  const { data, err, retry, loading } = useLoad(api.users);
  const [q, setQ] = useState("");
  const { sort, toggle, setSort } = useSort({ key: "joined", dir: -1 });
  const { view, choose, narrow } = useView("users");
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = (data ?? [])
      .filter((u) => !t || `${u.full_name ?? ""} ${u.email} ${u.phone ?? ""} ${u.restaurant_name ?? ""} ${u.home_address ?? ""} ${u.office_address ?? ""}`.toLowerCase().includes(t))
      .filter((u) => u.role === "client"); // customers only — restaurant accounts are in the Restaurants tab
    return sortRows(rows, sort, COLS);
  }, [data, q, sort]);

  const customers = data?.filter((u) => u.role === "client").length ?? 0;
  const reset = () => setShown(PAGE);
  const emptyText = err ? "No records found" : customers ? "No users match these filters" : "No customer has signed up yet";
  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Customers who have signed up. (Restaurant accounts are in the Restaurants tab.) Passwords are never shown or stored in readable form.</p>
        </div>
        {!narrow && <ViewToggle view={view} onChange={choose} />}
      </header>

      <div className="ad-toolbar">
        <input className="ad-search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search name, email, phone, address…" />
        {view === "grid" && <SortSelect sort={sort} setSort={setSort} options={SORT_OPTIONS} />}
      </div>

      {loading ? <Loading /> : (
        <>
          {data && <p className="ad-count"><b>{fmtN(list.length)}</b> of {fmtN(customers)} users</p>}
          {view === "grid" ? (
            list.length === 0 ? (
              <div className="ad-card"><Empty err={err} onRetry={retry} text={emptyText} /></div>
            ) : (
              <div className="ad-cards-grid">
                {list.slice(0, shown).map((u) => <UserCard key={u.id} u={u} />)}
              </div>
            )
          ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <Th k="name" label="User" sort={sort} onSort={toggle} title="Sort by name" />
                  <th>Phone</th>
                  <Th k="address" label="Address" sort={sort} onSort={toggle} />
                  <Th k="joined" label="Joined" sort={sort} onSort={toggle} firstDir={-1} />
                  <Th k="seen" label="Last active" sort={sort} onSort={toggle} firstDir={-1} />
                  <Th k="cards" label={I.card} num sort={sort} onSort={toggle} title="Sort by cards" />
                  <Th k="favourites" label={I.heart} num sort={sort} onSort={toggle} title="Sort by favourites" />
                  <Th k="views" label={I.eye} num sort={sort} onSort={toggle} title="Sort by views" />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, shown).map((u) => (
                  <tr key={u.id} className={u.is_active ? "" : "off"}>
                    <td>
                      <Link to={`/users/${u.id}`} className="ad-row-link">
                        <Avatar src={u.avatar_url} name={nameOf(u)} />
                        <span><b>{nameOf(u)}{!u.is_active && <span className="ad-badge off ad-ml">Disabled</span>}</b><small className="muted">{u.email}</small></span>
                      </Link>
                    </td>
                    <td className="ad-nowrap">{u.phone || <span className="muted">—</span>}</td>
                    <td className="ad-addr"><Address u={u} /></td>
                    <td className="ad-nowrap" title={fmtDate(u.created_at, true)}>{fmtDate(u.created_at)}</td>
                    <td className="ad-nowrap">{ago(u.last_seen_at)}</td>
                    <td className="num" title="Cards">{u.cards}</td>
                    <td className="num" title="Favourites">{u.favourites}</td>
                    <td className="num" title="Views">{u.views}</td>
                  </tr>
                ))}
                {list.length === 0 && <EmptyRow cols={8} err={err} onRetry={retry} text={emptyText} />}
              </tbody>
            </table>
          </div>
          )}
          {shown < list.length && <button className="ad-btn ghost ad-more" onClick={() => setShown(shown + PAGE)}>Show more ({fmtN(list.length - shown)} left)</button>}
        </>
      )}
    </>
  );
}

/** Home address (or office), as the customer saved it on the map. */
function Address({ u }: { u: UserRow }) {
  if (!u.home_address && !u.office_address) return <span className="muted">—</span>;
  return (
    <span className="ad-addr-list">
      {u.home_address && <span title={u.home_address}><small className="ad-addr-tag">Home</small>{u.home_address}</span>}
      {u.office_address && <span title={u.office_address}><small className="ad-addr-tag">Office</small>{u.office_address}</span>}
    </span>
  );
}

function UserCard({ u }: { u: UserRow }) {
  return (
    <Link to={`/users/${u.id}`} className={`ad-gcard ${u.is_active ? "" : "off"}`}>
      <div className="ad-gcard-head">
        <Avatar src={u.avatar_url} name={nameOf(u)} size={44} />
        <span className="ad-grow">
          <b>{nameOf(u)}{!u.is_active && <span className="ad-badge off ad-ml">Disabled</span>}</b>
          <small className="muted">{u.email}</small>
        </span>
      </div>
      {u.phone && <p className="ad-gcard-line">{I.phone}<span>{u.phone}</span></p>}
      <p className="ad-gcard-line">{I.pin}<span>{u.home_address || u.office_address || "No address saved"}</span></p>
      <dl className="ad-gcard-stats">
        <div><dt>{I.card}</dt><dd>{u.cards}</dd></div>
        <div><dt>{I.heart}</dt><dd>{u.favourites}</dd></div>
        <div><dt>{I.eye}</dt><dd>{u.views}</dd></div>
        <div><dt>Joined</dt><dd className="sm">{fmtDate(u.created_at)}</dd></div>
      </dl>
      <p className="ad-gcard-foot muted">Last active {ago(u.last_seen_at)}</p>
    </Link>
  );
}
