import { FormEvent, useMemo, useState } from "react";
import { joinWaitlist } from "../api";
import logo from "../assets/logo.png";
import { BANKS, CATEGORIES, CITIES, Category, DAYS, Day, FAQS, SAMPLE_CARDS, SAMPLE_DEALS, bankName, cardById } from "./data";
import { Icon } from "./icons";
import "./home.css";

const todayShort = (): Day => DAYS[(new Date().getDay() + 6) % 7];
const pkr = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

/** "every day", "Mon–Thu", "Fri, Sat & Sun" … */
function daysLabel(days: Day[]) {
  if (days.length === 7) return "every day";
  const ordered = DAYS.filter((d) => days.includes(d));
  const idx = ordered.map((d) => DAYS.indexOf(d));
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive && ordered.length >= 4) return `${ordered[0]}–${ordered[ordered.length - 1]}`;
  if (ordered.length === 1) return ordered[0];
  return `${ordered.slice(0, -1).join(", ")} & ${ordered[ordered.length - 1]}`;
}

/** Signed-in user, once auth exists. `null` = signed out, so the nav shows "Log in". */
type User = { name: string } | null;
const CURRENT_USER: User = null;

export default function Home() {
  const [prefillEmail, setPrefillEmail] = useState("");

  const goToWaitlist = (email?: string) => {
    if (email) setPrefillEmail(email);
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="home">
      <Nav onJoin={() => goToWaitlist()} />
      <main>
        <Hero onContinue={goToWaitlist} />
        <BankStrip />
        <Benefits />
        <TryIt />
        <HowItWorks />
        <Waitlist prefillEmail={prefillEmail} />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ nav */

function Nav({ onJoin }: { onJoin: () => void }) {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <a href="/" className="brand" aria-label="Discount فرویش home">
          <img src={logo} alt="Discount فرویش" />
        </a>
        <nav className="nav-links" aria-label="Main">
          <a href="#benefits">Benefits</a>
          <a href="#try">Try it</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-actions">
          {CURRENT_USER ? (
            <span className="nav-avatar" title={CURRENT_USER.name}>
              {CURRENT_USER.name.charAt(0).toUpperCase()}
            </span>
          ) : (
            <a href="/login" className="nav-login">
              <span className="nav-login-icon">
                <Icon.User />
              </span>
              <span className="nav-login-text">Log in</span>
            </a>
          )}
          <button className="btn btn-primary btn-sm" onClick={onJoin}>
            Join waitlist
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({ onContinue }: { onContinue: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      await joinWaitlist({ email, banks: [], source: "homepage-hero" });
      setState("done");
    } catch (err) {
      setError(readError(err));
      setState("error");
    }
  };

  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="dot" /> Launching soon in Pakistan · Pre-register now
          </span>
          <h1>
            Every card discount.
            <br />
            <span className="marker">One place.</span>
          </h1>
          <p className="lead">
            Dining discounts from 10+ Pakistani banks, matched to the cards in your wallet, the
            restaurants near you and the day you want to go.
          </p>
          <ul className="hero-stats" aria-label="Coverage">
            <li><b>10+</b><span>banks available</span></li>
            <li><b>50+</b><span>restaurants in Lahore</span></li>
          </ul>

          {state === "done" ? (
            <div className="hero-done" role="status">
              <Icon.Check />
              <div>
                <strong>You're on the list.</strong>
                <span>
                  Tell us which cards you have to get matched deals at launch.{" "}
                  <button className="link" onClick={() => onContinue(email)}>
                    Add my cards →
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <form className="hero-form" onSubmit={submit}>
              <label className="sr-only" htmlFor="hero-email">
                Email address
              </label>
              <input
                id="hero-email"
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn btn-primary" disabled={state === "sending"}>
                {state === "sending" ? "Joining…" : "Get early access"}
              </button>
            </form>
          )}
          {state === "error" && <p className="form-error">{error}</p>}
          <p className="fine">Free to join · No card numbers, ever · One email at launch</p>
        </div>

        <PhoneMock />
      </div>
    </section>
  );
}

function PhoneMock() {
  const deals = SAMPLE_DEALS.filter((d) => d.days.includes("Fri")).sort((a, b) => a.km - b.km).slice(0, 4);
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="blob" />
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="app-top">
            <div>
              <span className="app-label">Near you · Clifton</span>
              <strong>Friday dinner</strong>
            </div>
            <span className="app-avatar">
              <Icon.Pin />
            </span>
          </div>
          <div className="app-chips">
            <span className="chip chip-on">Meezan Platinum</span>
            <span className="chip chip-on">HBL Gold</span>
            <span className="chip">Fri</span>
          </div>
          {deals.map((d) => (
            <MiniDeal key={d.place} deal={d} />
          ))}
        </div>
      </div>
      <div className="float float-a">
        <strong>40%</strong> off on Platinum
      </div>
      <div className="float float-b">
        <Icon.Pin /> 0.8 km away
      </div>
    </div>
  );
}

function MiniDeal({ deal }: { deal: (typeof SAMPLE_DEALS)[number] }) {
  const card = cardById(deal.card);
  return (
    <div className="mini-deal">
      <div className="mini-pct">{deal.pct}%</div>
      <div className="mini-body">
        <strong>{deal.place}</strong>
        <span>
          {bankName(card.bank)} · {deal.km} km
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ banks */

function BankStrip() {
  const row = [...BANKS, ...BANKS];
  return (
    <section className="banks" aria-label="Banks covered at launch">
      <p className="banks-title">Discounts from 10+ banks · 50+ restaurants in Lahore</p>
      <div className="marquee">
        <div className="marquee-track">
          {row.map((b, i) => (
            <span key={i} className="bank-pill" aria-hidden={i >= BANKS.length}>
              {b.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ benefits */

const BENEFITS = [
  {
    icon: Icon.Stack,
    title: "All discounts, one place",
    text: "No more checking 10+ bank websites and apps. Every dining, shopping and lifestyle discount, kept up to date from official bank pages.",
  },
  {
    icon: Icon.Pin,
    title: "Restaurants near you",
    text: "See which places around you give a discount on your card — sorted by distance, so the nearest deal is first.",
  },
  {
    icon: Icon.Card,
    title: "Matched to your cards",
    text: "Add the cards you own — Platinum, Gold, Signature — and see only deals you can use, with the exact % and cap for each card.",
  },
  {
    icon: Icon.Calendar,
    title: "Plan by day",
    text: "Many discounts only run on certain days. Pick Friday dinner or Sunday brunch and see exactly what's on.",
  },
];

function Benefits() {
  return (
    <section id="benefits" className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">Why you'll use it</span>
          <h2>Your cards already give you discounts. You just can't see them.</h2>
          <p>
            Bank deals are scattered across websites, PDFs and apps — and most change by card tier and day of the
            week. We put them all in one place, filtered for you.
          </p>
        </div>
        <div className="benefit-grid">
          {BENEFITS.map(({ icon: I, title, text }) => (
            <article key={title} className="benefit">
              <span className="benefit-icon">
                <I />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ try it */

function TryIt() {
  const [banks, setBanks] = useState<string[]>(["meezan", "hbl"]);
  const [cards, setCards] = useState<string[]>(["meezan-plat", "meezan-titanium", "hbl-gold", "hbl-plat"]);
  const [category, setCategory] = useState<Category | "all">("all");
  const [day, setDay] = useState<Day>(todayShort());
  const [sort, setSort] = useState<"near" | "best">("near");
  const [favs, setFavs] = useState<string[]>([]);
  const toggleFav = (place: string) =>
    setFavs((fs) => (fs.includes(place) ? fs.filter((f) => f !== place) : [...fs, place]));

  const toggleCard = (id: string) =>
    setCards((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));

  // Picking a bank shows (and selects) its cards; dropping a bank drops its cards too.
  const toggleBank = (slug: string) => {
    const bankCards = SAMPLE_CARDS.filter((c) => c.bank === slug).map((c) => c.id);
    if (banks.includes(slug)) {
      setBanks(banks.filter((b) => b !== slug));
      setCards(cards.filter((c) => !bankCards.includes(c)));
    } else {
      setBanks([...banks, slug]);
      setCards([...cards, ...bankCards]);
    }
  };

  const shownCards = SAMPLE_CARDS.filter((c) => banks.includes(c.bank));

  const results = useMemo(
    () =>
      SAMPLE_DEALS.filter(
        (d) =>
          cards.includes(d.card) && d.days.includes(day) && (category === "all" || d.category === category),
      ).sort((a, b) => (sort === "near" ? a.km - b.km : b.pct - a.pct)),
    [cards, day, sort, category],
  );

  return (
    <section id="try" className="section section-tint">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">Try it</span>
          <h2>Pick your cards and a day. See what you'd save.</h2>
          <p>A preview with sample restaurants in Karachi — the real app uses live deals from every bank.</p>
        </div>

        <div className="try">
          <div className="try-controls">
            <fieldset>
              <legend>Your banks</legend>
              <div className="bank-picks">
                {BANKS.map((b) => {
                  const on = banks.includes(b.slug);
                  return (
                    <button
                      key={b.slug}
                      type="button"
                      className={`bank-pick ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleBank(b.slug)}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend>Cards in your wallet</legend>
              {shownCards.length === 0 ? (
                <p className="hint">Pick a bank above to see its cards.</p>
              ) : (
                <div className="card-picks">
                  {shownCards.map((c) => {
                    const on = cards.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`card-pick tone-${c.tone} ${on ? "on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleCard(c.id)}
                      >
                        <span className="card-chip" />
                        <span className="card-bank">{bankName(c.bank)}</span>
                        <span className="card-name">{c.name}</span>
                        <span className="card-check">{on && <Icon.Check />}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend>What are you craving?</legend>
              <div className="bank-picks" role="radiogroup">
                {[{ id: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={category === c.id}
                    className={`bank-pick ${category === c.id ? "on" : ""}`}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>When are you going?</legend>
              <div className="day-picks" role="radiogroup">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={d === day}
                    className={`day ${d === day ? "on" : ""}`}
                    onClick={() => setDay(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="try-results">
            <div className="results-head">
              <strong>
                {results.length} {results.length === 1 ? "deal" : "deals"} for you on {day}
              </strong>
              <div className="seg" role="group" aria-label="Sort">
                <button className={sort === "near" ? "on" : ""} onClick={() => setSort("near")}>
                  Nearest
                </button>
                <button className={sort === "best" ? "on" : ""} onClick={() => setSort("best")}>
                  Biggest %
                </button>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="empty">
                {cards.length === 0
                  ? "Select at least one card to see your deals."
                  : `No sample deals for these filters on ${day} — try another day, category or card.`}
              </div>
            ) : (
              <ul className="deal-list">
                {results.map((d) => {
                  const card = cardById(d.card);
                  const fav = favs.includes(d.place);
                  return (
                    <li key={d.place} className="deal">
                      <div className="deal-cover">
                        <img src={d.img} alt={`Food at ${d.place}`} loading="lazy" />
                        <span className="deal-km">
                          <Icon.Pin /> {d.km} km
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`deal-fav ${fav ? "on" : ""}`}
                        aria-pressed={fav}
                        aria-label={fav ? `Remove ${d.place} from favourites` : `Add ${d.place} to favourites`}
                        onClick={() => toggleFav(d.place)}
                      >
                        <Icon.Heart />
                      </button>
                      <div className="deal-body">
                        <strong className="deal-name">{d.place}</strong>
                        <span className="deal-rating" aria-label={`Rated ${d.rating} out of 5`}>
                          <Icon.Star /> <b>{d.rating.toFixed(1)}</b>
                          <span>({d.reviews.toLocaleString("en-PK")} reviews)</span>
                        </span>
                        <span className="deal-card">
                          <Icon.Card /> {bankName(card.bank)} {card.name}
                        </span>
                        <div className="deal-offer">
                          <span className="deal-pct">{d.pct}% OFF</span>
                          <span className="deal-detail">
                            {d.pct}% off{" "}
                            <span className="deal-cap">{d.days.length === 7 ? "every day" : `on ${daysLabel(d.days)}`}</span>
                            {d.cap ? <span className="deal-cap"> · up to {pkr(d.cap)}</span> : null}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ how */

const STEPS = [
  { title: "Add your cards", text: "Just the bank and card type — never the card number." },
  { title: "Choose a day & area", text: "Use your location or pick a neighbourhood and the day you're going." },
  { title: "Pay with the right card", text: "See the % off and cap before you order, then pay with the card that saves most." },
];

function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="kicker">How it works</span>
          <h2>Three taps to the best deal tonight</h2>
        </div>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ waitlist */

function Waitlist({ prefillEmail }: { prefillEmail: string }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", city: "" });
  const [banks, setBanks] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [again, setAgain] = useState(false);
  const [error, setError] = useState("");

  // pick up the email typed in the hero
  const [lastPrefill, setLastPrefill] = useState("");
  if (prefillEmail && prefillEmail !== lastPrefill) {
    setLastPrefill(prefillEmail);
    setForm((f) => ({ ...f, email: prefillEmail }));
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleBank = (slug: string) =>
    setBanks((bs) => (bs.includes(slug) ? bs.filter((b) => b !== slug) : [...bs, slug]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("sending");
    try {
      const res = await joinWaitlist({
        email: form.email,
        full_name: form.full_name || undefined,
        phone: form.phone || undefined,
        city: form.city || undefined,
        banks,
        source: "homepage-waitlist",
      });
      setAgain(res.already_joined);
      setState("done");
    } catch (err) {
      setError(readError(err));
      setState("error");
    }
  };

  return (
    <section id="waitlist" className="waitlist">
      <div className="wrap waitlist-grid">
        <div className="waitlist-copy">
          <span className="kicker kicker-light">Pre-launch</span>
          <h2>Be first in line when we launch</h2>
          <p>Join the waitlist and tell us which cards you carry. We'll have your deals ready on day one.</p>
          <ul className="perks">
            <li>
              <Icon.Check /> Early access before the public launch
            </li>
            <li>
              <Icon.Check /> Your city and banks help decide what we add first
            </li>
            <li>
              <Icon.Check /> One email at launch — no spam
            </li>
          </ul>
        </div>

        <div className="waitlist-card">
          {state === "done" ? (
            <div className="success" role="status">
              <span className="success-icon">
                <Icon.Check />
              </span>
              <h3>{again ? "Details updated!" : "You're on the list!"}</h3>
              <p>
                We'll email <strong>{form.email}</strong> as soon as early access opens.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="wl-form">
              <div className="row">
                <label>
                  <span className="lbl">Name</span>
                  <input value={form.full_name} onChange={set("full_name")} placeholder="Ayesha Khan" autoComplete="name" />
                </label>
                <label>
                  <span className="lbl">City</span>
                  <select value={form.city} onChange={set("city")}>
                    <option value="">Select city</option>
                    {CITIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row">
                <label>
                  <span className="lbl">
                    Email <span className="req">*</span>
                  </span>
                  <input type="email" required value={form.email} onChange={set("email")} placeholder="you@email.com" autoComplete="email" />
                </label>
                <label>
                  <span className="lbl">
                    Phone <span className="opt">(optional)</span>
                  </span>
                  <input type="tel" value={form.phone} onChange={set("phone")} placeholder="03xx xxxxxxx" autoComplete="tel" />
                </label>
              </div>
              <fieldset>
                <legend>Which banks do you have cards with?</legend>
                <div className="bank-picks">
                  {BANKS.map((b) => (
                    <button
                      key={b.slug}
                      type="button"
                      className={`bank-pick ${banks.includes(b.slug) ? "on" : ""}`}
                      aria-pressed={banks.includes(b.slug)}
                      onClick={() => toggleBank(b.slug)}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </fieldset>
              {state === "error" && <p className="form-error">{error}</p>}
              <button className="btn btn-accent btn-block" disabled={state === "sending"}>
                {state === "sending" ? "Saving your spot…" : "Reserve my spot"}
              </button>
              <p className="fine">We never ask for card numbers, PINs or bank logins.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */

function Faq() {
  return (
    <section id="faq" className="section">
      <div className="wrap faq-wrap">
        <div className="section-head">
          <span className="kicker">FAQ</span>
          <h2>Questions, answered</h2>
        </div>
        <div className="faq">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span className="faq-plus" aria-hidden="true" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <img src={logo} alt="Discount فرویش" className="footer-logo" />
        <p>
          Every bank card discount in Pakistan, in one place.
          <br />
          <span className="fine">
            Bank names belong to their owners. We're independent and not affiliated with any bank. Always confirm a
            discount with the merchant before paying.
          </span>
        </p>
        <span className="fine">© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ utils */

function readError(err: unknown): string {
  const msg = String(err);
  if (msg.includes("422")) return "Please check your email address and try again.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Can't reach the server right now — please try again in a moment.";
  return "Something went wrong — please try again.";
}
