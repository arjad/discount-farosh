import { useEffect, useState } from "react";
import { api, ScrapeResult, Source } from "../api";
import "./admin.css";

export default function Admin() {
  const [banks, setBanks] = useState<Source[]>([]);
  const [results, setResults] = useState<Record<string, ScrapeResult>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.banks().then(setBanks).catch((e) => setError(String(e)));
    api
      .results()
      .then((rs) => setResults(Object.fromEntries(rs.map((r) => [r.source, r]))))
      .catch(() => {});
  }, []);

  const run = async (slug: string) => {
    setRunning((s) => new Set(s).add(slug));
    try {
      const r = await api.scrapeBank(slug);
      setResults((prev) => ({ ...prev, [slug]: r }));
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(slug);
        return n;
      });
    }
  };

  return (
    <main className="admin">
      <header>
        <h1>Offerwala admin</h1>
        <p className="muted">Bank offer scrapers</p>
      </header>
      {error && <div className="banner">{error}</div>}

      <section className="grid">
        {banks.map((b) => {
          const r = results[b.slug];
          const busy = running.has(b.slug);
          return (
            <article key={b.slug} className="card">
              <div className="card-head">
                <div>
                  <h2>{b.name}</h2>
                  <a className="muted small" href={b.base_url} target="_blank" rel="noreferrer">
                    {b.base_url.replace("https://", "")}
                  </a>
                </div>
                <button onClick={() => run(b.slug)} disabled={busy}>
                  {busy ? "Running…" : "Run scraper"}
                </button>
              </div>

              {r && (
                <div className="result">
                  <span className={`pill ${r.status}`}>{r.status}</span>
                  <span className="muted small">
                    {r.offers.length} offers ·{" "}
                    {((+new Date(r.finished_at) - +new Date(r.started_at)) / 1000).toFixed(1)}s
                  </span>
                </div>
              )}

              {r?.error && (
                <dl className="error">
                  <dt>Kind</dt><dd>{r.error.kind}</dd>
                  {r.error.tag_name && (<><dt>Tag</dt><dd><code>{r.error.tag_name}</code></dd></>)}
                  {r.error.selector && (<><dt>Selector</dt><dd><code>{r.error.selector}</code></dd></>)}
                  {r.error.action && (<><dt>Action</dt><dd>{r.error.action}</dd></>)}
                  <dt>Message</dt><dd>{r.error.message}</dd>
                  {r.error.screenshot && (<><dt>Screenshot</dt><dd className="small">{r.error.screenshot}</dd></>)}
                </dl>
              )}

              {r && r.offers.length > 0 && (
                <ul className="offers">
                  {r.offers.map((o, i) => (
                    <li key={i}>
                      {o.url ? <a href={o.url} target="_blank" rel="noreferrer">{o.title}</a> : o.title}
                      {o.description && <div className="muted small">{o.description}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
