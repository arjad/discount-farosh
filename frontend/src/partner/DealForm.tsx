/**
 * Add / edit a discount — one question at a time, mostly tap-able choices, with a plain-language
 * preview of what customers will see. Opened from the restaurant dashboard.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ALL_BANKS, BANK_CARDS } from "../shared/banks";
import {
  DAY_SHORT, addDays, cardsLabel, dateLabel, daysLabel, pct, rs, timeLabel, todayPk,
  type Branch, type Deal, type DealCard, type DealIn,
} from "./api";

const PCTS = [10, 15, 20, 25, 30, 40, 50];
const CAPS = [500, 1000, 2000, 5000];
const PEOPLE = [2, 4, 6, 8];
const TERMS = [
  "Not valid with any other offer.",
  "Dine-in only.",
  "Valid on takeaway and delivery too.",
  "Valid on the total bill.",
  "Not valid on public holidays.",
  "Show the code before ordering.",
  "Taxes as applicable.",
];

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

export function DealForm({ start, branches, onClose, onSave }: {
  start: Deal | null; branches: Branch[]; onClose: () => void; onSave: (d: DealIn) => Promise<void>;
}) {
  const today = todayPk();
  const [f, setF] = useState<DealIn>(() =>
    start
      ? {
          title: start.title, discount_percent: start.discount_percent, max_discount: start.max_discount, cards: start.cards,
          days: start.days, start_date: start.start_date, end_date: start.end_date,
          start_time: start.start_time?.slice(0, 5) ?? null, end_time: start.end_time?.slice(0, 5) ?? null,
          is_family: start.is_family, family_size: start.family_size, branch_ids: start.branch_ids, terms: start.terms,
        }
      : {
          title: null, discount_percent: 20, max_discount: null, cards: [], days: [], start_date: today, end_date: addDays(today, 30),
          start_time: null, end_time: null, is_family: false, family_size: null, branch_ids: [], terms: null,
        },
  );
  const set = <K extends keyof DealIn>(k: K, v: DealIn[K]) => setF((x) => ({ ...x, [k]: v }));
  const [cardMode, setCardMode] = useState<"all" | "some">(start && start.cards.length ? "some" : "all");
  const [customPct, setCustomPct] = useState(!PCTS.includes(f.discount_percent));
  const [customCap, setCustomCap] = useState(f.max_discount != null && !CAPS.includes(f.max_discount));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const allDay = !f.start_time;
  const problems: string[] = [];
  if (!(f.discount_percent > 0 && f.discount_percent <= 100)) problems.push("Choose a discount between 1% and 100%.");
  if (cardMode === "some" && f.cards.length === 0) problems.push("Add at least one card, or choose “All customers”.");
  if (!allDay && (!f.start_time || !f.end_time)) problems.push("Set both times, or choose All day.");
  if (!allDay && f.start_time === f.end_time) problems.push("Start and end time can't be the same.");
  if (f.end_date && f.end_date < f.start_date) problems.push("The end date is before the start date.");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problems.length) return setErr(problems[0]);
    setBusy(true);
    setErr(null);
    try {
      await onSave({ ...f, cards: cardMode === "all" ? [] : f.cards, title: f.title?.trim() || null, terms: f.terms?.trim() || null });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  };

  const toggleDay = (d: number) => set("days", f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort());
  const everyDay = f.days.length === 0 || f.days.length === 7;
  const addTerm = (t: string) => set("terms", f.terms?.includes(t) ? f.terms : [f.terms?.trim(), t].filter(Boolean).join("\n"));

  return createPortal(
    <div className="rdf-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="rdf" onSubmit={submit} role="dialog" aria-modal="true" aria-label={start ? "Edit discount" : "Add a discount"} noValidate>
        <header className="rdf-head">
          <div>
            <b>{start ? "Edit discount" : "Add a discount"}</b>
            {start && <span className="rdf-code">Code {start.code}</span>}
          </div>
          <button type="button" className="rdf-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="rdf-body">
          <Step n={1} title="How much discount?">
            <div className="rdf-pills">
              {PCTS.map((p) => (
                <Pill key={p} on={!customPct && f.discount_percent === p} onClick={() => { setCustomPct(false); set("discount_percent", p); }}>{p}%</Pill>
              ))}
              <Pill on={customPct} onClick={() => setCustomPct(true)}>Other</Pill>
            </div>
            {customPct && (
              <label className="rdf-inline">
                <input type="number" min={1} max={100} step={0.5} value={f.discount_percent || ""} autoFocus
                  onChange={(e) => set("discount_percent", Number(e.target.value))} /> % off
              </label>
            )}
            <p className="rdf-sub">Maximum discount <small>(the most a customer can save)</small></p>
            <div className="rdf-pills">
              <Pill on={f.max_discount == null && !customCap} onClick={() => { setCustomCap(false); set("max_discount", null); }}>No limit</Pill>
              {CAPS.map((c) => (
                <Pill key={c} on={!customCap && f.max_discount === c} onClick={() => { setCustomCap(false); set("max_discount", c); }}>Up to {rs(c)}</Pill>
              ))}
              <Pill on={customCap} onClick={() => setCustomCap(true)}>Other</Pill>
            </div>
            {customCap && (
              <label className="rdf-inline">
                Up to Rs <input type="number" min={1} step={50} value={f.max_discount ?? ""} autoFocus
                  onChange={(e) => set("max_discount", e.target.value ? Number(e.target.value) : null)} />
              </label>
            )}
          </Step>

          <Step n={2} title="Who gets it?">
            <div className="rdf-choice">
              <button type="button" className={cardMode === "all" ? "on" : ""} onClick={() => setCardMode("all")}>
                <b>All customers</b><span>No card needed</span>
              </button>
              <button type="button" className={cardMode === "some" ? "on" : ""} onClick={() => setCardMode("some")}>
                <b>Only certain bank cards</b><span>e.g. HBL Platinum, all Meezan cards</span>
              </button>
            </div>
            {cardMode === "some" && <CardPicker cards={f.cards} onChange={(c) => set("cards", c)} />}
          </Step>

          <Step n={3} title="Which days?">
            <div className="rdf-pills">
              <Pill on={everyDay} onClick={() => set("days", [])}>Every day</Pill>
              <Pill on={sameSet(f.days, [0, 1, 2, 3, 4])} onClick={() => set("days", [0, 1, 2, 3, 4])}>Mon – Fri</Pill>
              <Pill on={sameSet(f.days, [5, 6])} onClick={() => set("days", [5, 6])}>Sat &amp; Sun</Pill>
            </div>
            <p className="rdf-sub">Or tap the days</p>
            <div className="rdf-days">
              {DAY_SHORT.map((d, i) => (
                <button type="button" key={d} className={!everyDay && f.days.includes(i) ? "on" : ""} aria-pressed={!everyDay && f.days.includes(i)}
                  onClick={() => (everyDay ? set("days", [i]) : toggleDay(i))}>{d}</button>
              ))}
            </div>
          </Step>

          <Step n={4} title="What time?">
            <div className="rdf-pills">
              <Pill on={allDay} onClick={() => setF((x) => ({ ...x, start_time: null, end_time: null }))}>All day</Pill>
              <Pill on={f.start_time === "12:00" && f.end_time === "16:00"} onClick={() => setF((x) => ({ ...x, start_time: "12:00", end_time: "16:00" }))}>Lunch 12 – 4 pm</Pill>
              <Pill on={f.start_time === "19:00" && f.end_time === "23:00"} onClick={() => setF((x) => ({ ...x, start_time: "19:00", end_time: "23:00" }))}>Dinner 7 – 11 pm</Pill>
              <Pill on={!allDay && !["12:00", "19:00"].includes(f.start_time!)} onClick={() => setF((x) => ({ ...x, start_time: x.start_time ?? "18:00", end_time: x.end_time ?? "22:00" }))}>Set hours</Pill>
            </div>
            {!allDay && (
              <div className="rdf-two">
                <label className="rdf-field"><span>From</span><input type="time" value={f.start_time ?? ""} onChange={(e) => set("start_time", e.target.value || null)} /></label>
                <label className="rdf-field"><span>To</span><input type="time" value={f.end_time ?? ""} onChange={(e) => set("end_time", e.target.value || null)} /></label>
              </div>
            )}
            {!allDay && f.start_time && f.end_time && f.end_time < f.start_time && (
              <p className="rdf-hint">Runs past midnight ({timeLabel(f)}).</p>
            )}
          </Step>

          <Step n={5} title="From which date, until when?">
            <div className="rdf-two">
              <label className="rdf-field"><span>Starts</span>
                <input type="date" value={f.start_date} onChange={(e) => e.target.value && set("start_date", e.target.value)} />
              </label>
              <label className="rdf-field"><span>Ends</span>
                <input type="date" value={f.end_date ?? ""} min={f.start_date} onChange={(e) => set("end_date", e.target.value || null)} />
              </label>
            </div>
            <div className="rdf-pills">
              <Pill on={f.end_date === addDays(f.start_date, 7)} onClick={() => set("end_date", addDays(f.start_date, 7))}>1 week</Pill>
              <Pill on={f.end_date === addDays(f.start_date, 30)} onClick={() => set("end_date", addDays(f.start_date, 30))}>1 month</Pill>
              <Pill on={f.end_date === addDays(f.start_date, 90)} onClick={() => set("end_date", addDays(f.start_date, 90))}>3 months</Pill>
              <Pill on={f.end_date == null} onClick={() => set("end_date", null)}>No end date</Pill>
            </div>
            <p className="rdf-hint">After the end date it shows as <b>Expired</b> by itself. You can also expire it any time.</p>
          </Step>

          <Step n={6} title="Is it a family deal?">
            <div className="rdf-pills">
              <Pill on={!f.is_family} onClick={() => setF((x) => ({ ...x, is_family: false, family_size: null }))}>No</Pill>
              <Pill on={f.is_family} onClick={() => set("is_family", true)}>Yes, family deal</Pill>
            </div>
            {f.is_family && (
              <>
                <p className="rdf-sub">For how many people? <small>(optional)</small></p>
                <div className="rdf-pills">
                  {PEOPLE.map((n) => <Pill key={n} on={f.family_size === n} onClick={() => set("family_size", f.family_size === n ? null : n)}>{n} people</Pill>)}
                  <label className="rdf-inline small">
                    <input type="number" min={2} max={50} value={f.family_size ?? ""} placeholder="Other"
                      onChange={(e) => set("family_size", e.target.value ? Number(e.target.value) : null)} />
                  </label>
                </div>
              </>
            )}
          </Step>

          {branches.length > 1 && (
            <Step n={7} title="At which branches?">
              <div className="rdf-pills">
                <Pill on={f.branch_ids.length === 0} onClick={() => set("branch_ids", [])}>All branches</Pill>
                {branches.map((b) => (
                  <Pill key={b.id} on={f.branch_ids.includes(b.id)}
                    onClick={() => set("branch_ids", f.branch_ids.includes(b.id) ? f.branch_ids.filter((x) => x !== b.id) : [...f.branch_ids, b.id])}>
                    {b.name}
                  </Pill>
                ))}
              </div>
            </Step>
          )}

          <Step n={branches.length > 1 ? 8 : 7} title="Name and terms" optional>
            <label className="rdf-field"><span>Name of the deal</span>
              <input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} maxLength={150}
                placeholder={`e.g. Weekend dinner deal (shown as “${pct(f.discount_percent)} off the bill” if empty)`} />
            </label>
            <p className="rdf-sub">Terms &amp; conditions — tap to add</p>
            <div className="rdf-pills">
              {TERMS.map((t) => <Pill key={t} on={!!f.terms?.includes(t)} onClick={() => addTerm(t)}>+ {t.replace(/\.$/, "")}</Pill>)}
            </div>
            <textarea value={f.terms ?? ""} onChange={(e) => set("terms", e.target.value)} rows={4} maxLength={3000}
              placeholder="Anything else customers should know, e.g. minimum bill Rs 3,000." />
          </Step>
        </div>

        <footer className="rdf-foot">
          <div className="rdf-preview">
            <span>Customers will see</span>
            <b>
              {pct(f.discount_percent || 0)} OFF{f.max_discount ? ` up to ${rs(f.max_discount)}` : ""}
              {f.is_family ? ` · Family deal${f.family_size ? ` for ${f.family_size}` : ""}` : ""}
            </b>
            <small>
              {daysLabel(f.days)} · {timeLabel(f)} · {dateLabel(f)} · {cardMode === "all" ? cardsLabel([]) : cardsLabel(f.cards) || "—"}
            </small>
          </div>
          {err && <p className="rdf-err" role="alert">{err}</p>}
          <div className="rdf-btns">
            <button type="button" className="rd-btn ghost" onClick={onClose}>Cancel</button>
            <button className="rd-btn big" disabled={busy}>{busy ? "Saving…" : start ? "Save changes" : "Add discount"}</button>
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function Step({ n, title, optional, children }: { n: number; title: string; optional?: boolean; children: ReactNode }) {
  return (
    <section className="rdf-step">
      <h3><span className="rdf-n">{n}</span>{title}{optional && <small>optional</small>}</h3>
      {children}
    </section>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={`rdf-pill ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>{children}</button>;
}

/** Bank -> card (or "All cards of this bank") -> Add. Shown as removable chips. */
function CardPicker({ cards, onChange }: { cards: DealCard[]; onChange: (c: DealCard[]) => void }) {
  const [bank, setBank] = useState("");
  const [card, setCard] = useState("__all");
  const [custom, setCustom] = useState("");
  const options = bank ? BANK_CARDS[bank] ?? [] : [];
  const name = card === "__all" ? null : card === "__other" ? custom.trim() : card;

  const add = () => {
    const b = ALL_BANKS.find((x) => x.slug === bank);
    if (!b || (card === "__other" && !name)) return;
    const next: DealCard = { bank_slug: b.slug, bank_name: b.name, card_name: name };
    // "all cards of a bank" replaces that bank's single cards; skip duplicates
    const rest = name === null ? cards.filter((c) => c.bank_slug !== b.slug) : cards;
    if (rest.some((c) => c.bank_slug === b.slug && (c.card_name === null || c.card_name === name))) return;
    onChange([...rest, next]);
    setCard("__all");
    setCustom("");
  };

  return (
    <div className="rdf-cards">
      {cards.length > 0 && (
        <ul className="rdf-chips">
          {cards.map((c, i) => (
            <li key={`${c.bank_slug}|${c.card_name}`}>
              {c.card_name ? <>{c.bank_name} <b>{c.card_name}</b></> : <>All <b>{c.bank_name}</b> cards</>}
              <button type="button" aria-label="Remove" onClick={() => onChange(cards.filter((_, j) => j !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="rdf-card-add">
        <select value={bank} onChange={(e) => { setBank(e.target.value); setCard("__all"); }} aria-label="Bank">
          <option value="">Choose bank</option>
          {ALL_BANKS.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        </select>
        <select value={card} onChange={(e) => setCard(e.target.value)} disabled={!bank} aria-label="Card">
          <option value="__all">All cards of this bank</option>
          {options.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="__other">Other card…</option>
        </select>
        {card === "__other" && (
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Card name, e.g. Visa Signature" maxLength={150} />
        )}
        <button type="button" className="rd-btn" disabled={!bank || (card === "__other" && !custom.trim())} onClick={add}>+ Add card</button>
      </div>
    </div>
  );
}
