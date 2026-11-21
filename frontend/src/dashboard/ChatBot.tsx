import { useEffect, useRef, useState, type FormEvent } from "react";
import { dashApi, type DashOffer } from "./api";
import { CUISINE_LABEL, cuisineOf, daysText, placeName, type Cuisine } from "../shared/offers";
import { offerPath } from "../shared/links";
import "./chatbot.css";

/**
 * Deal assistant (bottom-right). FRONTEND ONLY for now: replies come from `localReply`, which
 * searches the deals already loaded on the page. When the AI backend exists, replace `localReply`
 * with a call to it — the rest of the widget stays the same.
 */

const GREETING =
  "Tell me what type of food you want to eat and when you have time to go — I'll find the best discounts for you.";
const SUGGESTIONS = ["Desi food tonight", "Pizza this weekend", "Coffee tomorrow", "Chinese on Friday"];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type Day = (typeof DAYS)[number];

type Msg = { id: number; from: "bot" | "me"; text: string; deals?: DashOffer[] };

export type ChatHelpers = {
  cuisineOf: (o: DashOffer) => string | null;
  cuisineLabel: (id: string) => string;
  placeName: (o: DashOffer) => string;
  daysText: (days?: string[] | null) => string;
};

// ---------------------------------------------------------------- understanding the message

const CUISINE_WORDS: [string, RegExp][] = [
  ["icecream", /ice ?cream|gelato|dessert|sweet|kulfi|froyo/],
  ["cafe", /caf[eé]|coffee|tea|chai|bakery|cake|brunch|breakfast/],
  ["italian", /italian|pizza|pasta|lasagn/],
  ["chinese", /chinese|noodle|wok|dim ?sum|manchurian|asian|japanese|sushi|thai/],
  ["desi", /desi|biryani|karahi|bbq|tikka|nihari|haleem|kabab|kebab|handi|pakistani|paratha/],
  ["dining", /dinner|lunch|dine|dining|restaurant|steak|burger|buffet/],
];

function todayIdx(now = new Date()) {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "short" }).format(now);
  return Math.max(0, DAYS.indexOf(wd as Day));
}

/** Which days the user means: "tonight", "tomorrow", "weekend", "friday"... (empty = any day). */
function parseDays(t: string): { days: Day[]; label: string } {
  const today = todayIdx();
  if (/\b(today|tonight|now|this evening)\b/.test(t)) return { days: [DAYS[today]], label: "today" };
  if (/\btomorrow\b/.test(t)) return { days: [DAYS[(today + 1) % 7]], label: "tomorrow" };
  if (/week ?end/.test(t)) return { days: ["Sat", "Sun"], label: "this weekend" };
  const names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const picked = names.map((n, i) => (t.includes(n) || new RegExp(`\\b${n.slice(0, 3)}\\b`).test(t) ? DAYS[i] : null)).filter(Boolean) as Day[];
  if (picked.length) return { days: picked, label: `on ${picked.join(", ")}` };
  return { days: [], label: "" };
}

function localReply(text: string, offers: DashOffer[], h: ChatHelpers): Omit<Msg, "id" | "from"> {
  const t = text.toLowerCase();
  const cuisine = CUISINE_WORDS.find(([, re]) => re.test(t))?.[0] ?? null;
  const { days, label } = parseDays(t);

  if (!cuisine && !days.length) {
    return { text: "What are you in the mood for — desi, pizza, Chinese, café or dessert? And when can you go (today, tomorrow, the weekend)?" };
  }

  const works = (o: DashOffer) => {
    if (cuisine && h.cuisineOf(o) !== cuisine) return false;
    const valid = o.valid_days?.length ? o.valid_days : DAYS;
    return !days.length || days.some((d) => valid.includes(d));
  };
  // best discount per restaurant
  const best = new Map<string, DashOffer>();
  for (const o of offers.filter(works)) {
    const k = h.placeName(o).toLowerCase();
    const cur = best.get(k);
    if (!cur || (o.discount_percent ?? 0) > (cur.discount_percent ?? 0)) best.set(k, o);
  }
  const top = [...best.values()].sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0)).slice(0, 4);

  const what = cuisine ? h.cuisineLabel(cuisine).toLowerCase() : "food";
  if (!top.length) {
    return { text: `I couldn't find ${what} deals ${label || "right now"}. Try another day or a different kind of food?` };
  }
  return {
    text: `Here are the best ${what} discounts${label ? ` ${label}` : ""} (${best.size} place${best.size > 1 ? "s" : ""} found):`,
    deals: top,
  };
}

// ---------------------------------------------------------------- widget

const ICON = {
  chat: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  send: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z" /></svg>,
  spark: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>,
};

/** Chat for pages other than the dashboard: loads the deals itself the first time it's opened,
 *  and a suggested deal opens that restaurant's page (with the offer highlighted). */
export function GlobalChatBot() {
  const [offers, setOffers] = useState<DashOffer[]>([]);
  const loading = useRef(false);
  const load = () => {
    if (loading.current) return;
    loading.current = true;
    dashApi.offers().then((d) => setOffers(d.offers)).catch(() => (loading.current = false));
  };
  return (
    <ChatBot
      offers={offers}
      helpers={SHARED_HELPERS}
      onFirstOpen={load}
      onOpenOffer={(o) => {
        const name = placeName(o);
        const key = name.trim().toLowerCase();
        window.location.assign(offerPath(o, name, offers.filter((x) => placeName(x).trim().toLowerCase() === key)));
      }}
    />
  );
}

export const SHARED_HELPERS: ChatHelpers = {
  cuisineOf: (o) => cuisineOf(o),
  cuisineLabel: (id) => CUISINE_LABEL[id as Cuisine] ?? id,
  placeName,
  daysText,
};

export function ChatBot({ offers, helpers, onOpenOffer, onFirstOpen }: {
  offers: DashOffer[];
  helpers: ChatHelpers;
  onOpenOffer: (o: DashOffer) => void;
  onFirstOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, from: "bot", text: GREETING }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const offersRef = useRef(offers);
  offersRef.current = offers;
  const waited = useRef(0);

  useEffect(() => {
    if (open) {
      onFirstOpen?.();
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    setMsgs((m) => [...m, { id: nextId.current++, from: "me", text: q }]);
    setInput("");
    setTyping(true);
    // small pause so it reads like a reply (a little longer while the deals are still loading)
    const reply = () => {
      if (!offersRef.current.length && waited.current < 10) {
        waited.current++;
        return window.setTimeout(reply, 400);
      }
      waited.current = 0;
      setMsgs((m) => [...m, { id: nextId.current++, from: "bot", ...localReply(q, offersRef.current, helpers) }]);
      setTyping(false);
    };
    window.setTimeout(reply, 550);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className={`cb ${open ? "open" : ""}`}>
      {open && (
        <section className="cb-panel" role="dialog" aria-label="Deal assistant">
          <header className="cb-head">
            <span className="cb-avatar">{ICON.spark}</span>
            <div>
              <b>Deal assistant</b>
              <small>Finds the best discounts for you</small>
            </div>
            <button className="cb-x" onClick={() => setOpen(false)} aria-label="Close chat">{ICON.close}</button>
          </header>

          <div className="cb-list" ref={listRef} aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`cb-msg ${m.from}`}>
                <p>{m.text}</p>
                {m.deals && (
                  <ul className="cb-deals">
                    {m.deals.map((o) => (
                      <li key={o.id}>
                        <button onClick={() => onOpenOffer(o)}>
                          <span className="cb-deal-img">
                            {o.business?.logo_url ? <img src={o.business.logo_url} alt="" /> : helpers.placeName(o).charAt(0)}
                          </span>
                          <span className="cb-deal-text">
                            <b>{helpers.placeName(o)}</b>
                            <small>{helpers.daysText(o.valid_days)} · {o.bank.name}</small>
                          </span>
                          <span className="cb-deal-pct">{o.discount_percent != null ? `${o.discount_percent}%` : "Deal"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {typing && (
              <div className="cb-msg bot"><p className="cb-typing" aria-label="Typing"><i /><i /><i /></p></div>
            )}
            {msgs.length === 1 && (
              <div className="cb-suggest">
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
          </div>

          <form className="cb-form" onSubmit={submit}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Biryani tonight, pizza on Friday…"
              aria-label="Message"
              maxLength={300}
            />
            <button disabled={!input.trim() || typing} aria-label="Send">{ICON.send}</button>
          </form>
        </section>
      )}

      <button className="cb-fab" onClick={() => setOpen(!open)} aria-label={open ? "Close deal assistant" : "Open deal assistant"} aria-expanded={open}>
        {open ? ICON.close : ICON.chat}
      </button>
    </div>
  );
}
