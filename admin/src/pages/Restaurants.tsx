import { useMemo, useState } from "react";
import { api, fmtN, pct, type RestaurantRow } from "../api";
import { I } from "../icons";
import { Link } from "../router";
import { Avatar, Empty, EmptyRow, Loading, SortSelect, Th, ViewToggle, sortRows, useLoad, useSort, useView } from "../ui";

const COLS: Record<string, (r: RestaurantRow) => string | number | null> = {
  name: (r) => r.name,
  owner: (r) => r.owner_email,
  areas: (r) => r.areas[0] ?? null,
  branches: (r) => r.branches,
  offers: (r) => r.active_offers,
  best: (r) => r.best_discount,
  favourites: (r) => r.favourites,
  views: (r) => r.views,
  banks: (r) => r.banks.length,
};
/** Sort choices for the grid (the table sorts by clicking its headers). */
const SORT_OPTIONS = [
  { k: "favourites", label: "Favourites", down: "most first", up: "fewest first" },
  { k: "views", label: "Views", down: "most first", up: "fewest first" },
  { k: "offers", label: "Active offers", down: "most first", up: "fewest first" },
  { k: "best", label: "Best discount", down: "highest first", up: "lowest first" },
  { k: "branches", label: "Branches", down: "most first", up: "fewest first" },
  { k: "name", label: "Name", up: "A → Z", down: "Z → A" },
];
const PAGE = 60;

export function Restaurants() {
  const { data, err, retry, loading } = useLoad(api.restaurants);
  const [q, setQ] = useState("");
  const [bank, setBank] = useState("");
  const { sort, toggle, setSort } = useSort({ key: "favourites", dir: -1 });
  const { view, choose, narrow } = useView("restaurants");
  const [shown, setShown] = useState(PAGE);

  const banks = useMemo(() => [...new Set((data ?? []).flatMap((r) => r.banks))].sort(), [data]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = (data ?? [])
      .filter((r) => !t || `${r.name} ${r.areas.join(" ")} ${r.cities.join(" ")} ${r.owner_email ?? ""} ${r.tags.join(" ")}`.toLowerCase().includes(t))
      .filter((r) => !bank || r.banks.includes(bank));
    return sortRows([...rows].sort((a, b) => a.name.localeCompare(b.name)), sort, COLS);
  }, [data, q, bank, sort]);

  const reset = () => setShown(PAGE);
  const emptyText = err ? "No records found" : data?.length ? "No restaurants match these filters" : "No restaurant has signed up yet";
  return (
    <>
      <header className="ad-head">
        <div>
          <h1>Restaurants</h1>
          <p className="muted">Restaurants that signed up on Discount فرویش with their own account. (Restaurants that only appear in bank deals are in the Offers tab.)</p>
        </div>
        {!narrow && <ViewToggle view={view} onChange={choose} />}
      </header>

      <div className="ad-toolbar">
        <input className="ad-search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Search name, area, owner email…" />
        <select value={bank} onChange={(e) => { setBank(e.target.value); reset(); }} aria-label="Bank">
          <option value="">All banks</option>
          {banks.map((b) => <option key={b}>{b}</option>)}
        </select>
        {view === "grid" && <SortSelect sort={sort} setSort={setSort} options={SORT_OPTIONS} />}
      </div>

      {loading ? <Loading /> : (
        <>
          {data && <p className="ad-count"><b>{fmtN(list.length)}</b> of {fmtN(data.length)} restaurants</p>}

          {view === "grid" ? (
            list.length === 0 ? (
              <div className="ad-card"><Empty err={err} onRetry={retry} text={emptyText} /></div>
            ) : (
              <div className="ad-cards-grid">
                {list.slice(0, shown).map((r) => <RestaurantCard key={r.key} r={r} />)}
              </div>
            )
          ) : (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <Th k="name" label="Restaurant" sort={sort} onSort={toggle} />
                    <Th k="owner" label="Owner account" sort={sort} onSort={toggle} />
                    <Th k="areas" label="Areas" sort={sort} onSort={toggle} />
                    <Th k="branches" label="Branches" num sort={sort} onSort={toggle} />
                    <Th k="offers" label="Offers" num sort={sort} onSort={toggle} title="Sort by active offers" />
                    <Th k="best" label="Best" num sort={sort} onSort={toggle} title="Sort by best discount" />
                    <Th k="favourites" label={<>{I.heart} Favourites</>} num sort={sort} onSort={toggle} />
                    <Th k="views" label={<>{I.eye} Views</>} num sort={sort} onSort={toggle} />
                    <Th k="banks" label="Banks" sort={sort} onSort={toggle} firstDir={-1} title="Sort by number of banks" />
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, shown).map((r) => (
                    <tr key={r.key}>
                      <td>
                        <Link to={`/restaurants/${r.key}`} className="ad-row-link">
                          <Avatar src={r.logo_url} name={r.name} square />
                          <span><b>{r.name}</b>{r.source === "both" && <small className="ad-src both">also in bank deals</small>}</span>
                        </Link>
                      </td>
                      <td className="ad-nowrap">{r.owner_email ? <a href={`mailto:${r.owner_email}`}>{r.owner_email}</a> : <span className="muted">—</span>}</td>
                      <td className="ad-areas">{r.areas.length ? r.areas.slice(0, 3).join(", ") : <span className="muted">—</span>}{r.areas.length > 3 && <span className="muted"> +{r.areas.length - 3}</span>}</td>
                      <td className="num">{r.branches}</td>
                      <td className="num">{r.active_offers}<small className="muted"> / {r.offers}</small></td>
                      <td className="num">{pct(r.best_discount)}</td>
                      <td className="num"><b>{fmtN(r.favourites)}</b></td>
                      <td className="num">{fmtN(r.views)}</td>
                      <td className="ad-banks">{r.banks.slice(0, 3).join(", ")}{r.banks.length > 3 && <span className="muted"> +{r.banks.length - 3}</span>}</td>
                    </tr>
                  ))}
                  {list.length === 0 && <EmptyRow cols={9} err={err} onRetry={retry} text={emptyText} />}
                </tbody>
              </table>
            </div>
          )}
          {shown < list.length && (
            <button className="ad-btn ghost ad-more" onClick={() => setShown(shown + PAGE)}>Show more ({fmtN(list.length - shown)} left)</button>
          )}
        </>
      )}
    </>
  );
}

function RestaurantCard({ r }: { r: RestaurantRow }) {
  return (
    <Link to={`/restaurants/${r.key}`} className="ad-gcard">
      <div className="ad-gcard-head">
        <Avatar src={r.logo_url} name={r.name} size={44} square />
        <span className="ad-grow">
          <b>{r.name}</b>
          <small className="muted">{r.owner_email ?? "—"}</small>
        </span>
      </div>
      <p className="ad-gcard-line">{I.pin}<span>{r.areas.length ? r.areas.slice(0, 3).join(", ") : "No branch added yet"}</span></p>
      <dl className="ad-gcard-stats">
        <div><dt>Offers</dt><dd>{r.active_offers}<small> / {r.offers}</small></dd></div>
        <div><dt>Best</dt><dd>{pct(r.best_discount)}</dd></div>
        <div><dt>Branches</dt><dd>{r.branches}</dd></div>
        <div><dt>{I.heart}</dt><dd>{fmtN(r.favourites)}</dd></div>
        <div><dt>{I.eye}</dt><dd>{fmtN(r.views)}</dd></div>
      </dl>
      {r.banks.length > 0 && <p className="ad-gcard-foot muted">{r.banks.slice(0, 3).join(", ")}{r.banks.length > 3 && ` +${r.banks.length - 3}`}</p>}
    </Link>
  );
}
