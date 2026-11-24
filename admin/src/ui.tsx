import { useEffect, useState, type ReactNode } from "react";
import { NotLoggedIn } from "./api";

/** Load data for a page; a lost session bubbles up to App (back to the login form). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(null);
    fn().then((d) => alive && setData(d)).catch((e) => {
      if (!alive) return;
      if (e instanceof NotLoggedIn) return window.dispatchEvent(new Event("admin:logged-out")); // App shows the login form
      setErr(e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, err, retry: () => setTick((t) => t + 1), loading: data === null && err === null };
}

/** "No records found" — and why, with a Try again button when loading failed. */
export function Empty({ err, onRetry, text = "No records found" }: { err?: string | null; onRetry?: () => void; text?: string }) {
  return (
    <div className="ad-empty">
      <b>{text}</b>
      {err && <span className="ad-empty-why">{err}</span>}
      {err && onRetry && <button className="ad-btn ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** The same, as a full-width row inside a table (so the column headers stay visible). */
export function EmptyRow({ cols, err, onRetry, text }: { cols: number; err?: string | null; onRetry?: () => void; text?: string }) {
  return (
    <tr className="ad-empty-row">
      <td colSpan={cols}><Empty err={err} onRetry={onRetry} text={text} /></td>
    </tr>
  );
}

/** Two letters for an avatar without a picture: "Ali Khan" -> "AK", "essora" -> "ES", "ali@x.com" -> "AL". */
export function initials(name: string) {
  const words = (name || "").replace(/@.*/, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return "?";
  const pick = words.length > 1 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join("");
  return pick.toUpperCase();
}

export function Avatar({ src, name, size = 36, square }: { src?: string | null; name: string; size?: number; square?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`ad-av ${square ? "sq" : ""}`} style={{ width: size, height: size, fontSize: size * 0.36 }} title={name}>
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <span className="ad-av-txt">{initials(name)}</span>}
    </span>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="ad-stat">
      <span>{icon}{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Loading({ rows = 6 }: { rows?: number }) {
  return <div className="ad-sk-list">{Array.from({ length: rows }, (_, i) => <div key={i} className="ad-sk" />)}</div>;
}

export function ErrorBox({ text }: { text: string }) {
  return <p className="ad-err big" role="alert">{text}</p>;
}

export function Section({ title, count, children, right }: { title: string; count?: number; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="ad-card">
      <h2>{title}{count != null && <small>{count}</small>}{right && <span className="ad-h2-right">{right}</span>}</h2>
      {children}
    </section>
  );
}

export function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="ad-kv">
      <dt>{k}</dt>
      <dd>{v === null || v === undefined || v === "" ? <span className="muted">—</span> : v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- sortable tables

export type SortState = { key: string; dir: 1 | -1 }; // 1 = A→Z / low→high, -1 = Z→A / high→low
type Val = string | number | null | undefined;

/** Sort state for a table. Clicking a column sorts by it (numbers/dates high→low first, text A→Z);
 *  clicking it again reverses. */
export function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string, firstDir: 1 | -1 = 1) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: firstDir }));
  return { sort, toggle, setSort };
}

/** Sort rows by the chosen column. Empty values always go last; ties keep a stable order. */
export function sortRows<T>(rows: T[], s: SortState, get: Record<string, (r: T) => Val>): T[] {
  const f = get[s.key];
  if (!f) return rows;
  const empty = (v: Val) => v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));
  return rows
    .map((r, i) => ({ r, i, v: f(r) }))
    .sort((a, b) => {
      if (empty(a.v) || empty(b.v)) return empty(a.v) === empty(b.v) ? a.i - b.i : empty(a.v) ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
      return c * s.dir || a.i - b.i;
    })
    .map((x) => x.r);
}

/** A clickable column header with an arrow showing the sort direction. */
export function Th({ k, label, sort, onSort, num, firstDir, title }: {
  k: string; label: ReactNode; sort: SortState; onSort: (k: string, firstDir?: 1 | -1) => void;
  num?: boolean; firstDir?: 1 | -1; title?: string;
}) {
  const on = sort.key === k;
  return (
    <th className={`${num ? "num" : ""} ad-th ${on ? "on" : ""}`} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k, firstDir ?? (num ? -1 : 1))} title={title ?? "Sort"}>
        {label}
        <span className="ad-arrow" aria-hidden="true">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

// ---------------------------------------------------------------- table / grid views

export type View = "table" | "grid";
const NARROW = "(max-width: 900px)"; // tablet & phone: always cards

/** True on tablet / phone widths (follows window resizes). */
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** Table or grid for a list page. Desktop: the admin's choice (remembered). Tablet / phone: always grid. */
export function useView(key: string) {
  const narrow = useNarrow();
  const [chosen, setChosen] = useState<View>(() => {
    try {
      return localStorage.getItem(`ad:view:${key}`) === "grid" ? "grid" : "table";
    } catch {
      return "table";
    }
  });
  const choose = (v: View) => {
    setChosen(v);
    try {
      localStorage.setItem(`ad:view:${key}`, v);
    } catch {
      /* storage blocked — still switches for now */
    }
  };
  return { view: narrow ? ("grid" as View) : chosen, choose, narrow };
}

export function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <span className="ad-seg ad-viewtoggle" role="group" aria-label="Show as">
      <button className={view === "table" ? "on" : ""} aria-pressed={view === "table"} onClick={() => onChange("table")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6h17M3.5 12h17M3.5 18h17" /></svg> Table
      </button>
      <button className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => onChange("grid")}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg> Grid
      </button>
    </span>
  );
}

/** Sorting for card grids (no column headers there): one menu of "column, direction". */
export function SortSelect({ sort, setSort, options }: {
  sort: SortState; setSort: (s: SortState) => void;
  options: { k: string; label: string; up: string; down: string }[];
}) {
  const value = `${sort.key}:${sort.dir}`;
  return (
    <label className="ad-sortsel">
      Sort
      <select value={value} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ key: k, dir: Number(d) as 1 | -1 }); }}>
        {options.flatMap((o) => [
          <option key={`${o.k}:-1`} value={`${o.k}:-1`}>{o.label} — {o.down}</option>,
          <option key={`${o.k}:1`} value={`${o.k}:1`}>{o.label} — {o.up}</option>,
        ])}
      </select>
    </label>
  );
}
