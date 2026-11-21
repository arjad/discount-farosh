import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import logo from "../assets/logo.png";
import { authApi } from "../auth/api";
import { dashApi, type DashOffer } from "../dashboard/api";
import { CITIES } from "../home/data";
import { ALL_BANKS, BANK_CARDS } from "../shared/banks";
import { type Coords, distanceKm, fmtKm, useMyLocation } from "../shared/geo";
import { shortAddress, useCurrentAddress } from "../shared/maps/api";
import { NotLoggedIn, profileApi, type Place, type Profile as P } from "./api";
import "./profile.css";

const I = {
  pin: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  home: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6" /></svg>,
  work: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></svg>,
  card: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>,
  cam: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  back: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>,
  close: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  plate: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></svg>,
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Square-crop and shrink a picked photo to 256px JPEG so it's small enough to store. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That file isn't an image we can read."));
    img.src = URL.createObjectURL(file);
  });
}

export default function Profile() {
  const [p, setP] = useState<P | null>(null);
  const [offers, setOffers] = useState<DashOffer[]>([]);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { loc, ask } = useMyLocation();

  useEffect(() => {
    document.title = "My profile · Discount فرویش";
    profileApi
      .get()
      .then(setP)
      .catch((e) => {
        if (e instanceof NotLoggedIn) window.location.replace("/login?next=/profile");
        else setToast({ kind: "err", text: e.message });
      });
    dashApi.offers().then((d) => setOffers(d.offers)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.kind === "err" ? 6000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** Run a profile change, keep the fresh profile, show a short message. */
  const run = async (fn: () => Promise<P>, ok?: string) => {
    try {
      setP(await fn());
      if (ok) setToast({ kind: "ok", text: ok });
      return true;
    } catch (e) {
      if (e instanceof NotLoggedIn) window.location.replace("/login?next=/profile");
      setToast({ kind: "err", text: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  const logout = async () => {
    await authApi.logout().catch(() => {});
    window.location.assign("/");
  };

  const myAddress = useCurrentAddress(loc.coords);
  const here = myAddress ? shortAddress(myAddress) : null; // exact address from Google; null = not known

  if (!p) {
    return (
      <div className="pf">
        <TopBar onLogout={logout} />
        <div className="pf-loading">Loading your profile…</div>
      </div>
    );
  }

  const name = p.full_name || p.email;

  return (
    <div className="pf">
      <TopBar onLogout={logout} />
      <main className="pf-main">
        <div className="pf-crumb-row">
          <nav className="crumbs" aria-label="Breadcrumb">
            <a href="/">Home</a><span aria-hidden="true">/</span>
            <a href="/dashboard">Dashboard</a><span aria-hidden="true">/</span>
            <span aria-current="page">Profile</span>
          </nav>
          <a href="/dashboard" className="pf-back">{I.back} Back to deals</a>
        </div>

        <Header p={p} name={name} here={loc.status === "ok" ? here : null} run={run} setToast={setToast} />

        <div className="pf-grid">
          <Details p={p} run={run} />
          <Locations p={p} loc={loc} ask={ask} here={here} run={run} />
          <Cards p={p} run={run} offers={offers} />
          <Visits p={p} run={run} />
        </div>
      </main>

      {toast && (
        <div
          key={toast.text}
          className={`pf-toast ${toast.kind}`}
          role="status"
          style={{ ["--life" as string]: `${toast.kind === "err" ? 6000 : 3000}ms` } as React.CSSProperties}
        >
          {toast.text}
          <button onClick={() => setToast(null)} aria-label="Dismiss">{I.close}</button>
        </div>
      )}
    </div>
  );
}

type Run = (fn: () => Promise<P>, ok?: string) => Promise<boolean>;

function TopBar({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="pf-top">
      <div className="pf-top-inner">
        <a href="/dashboard" className="pf-brand"><img src={logo} alt="Discount فرویش" /></a>
        <div className="pf-top-right">
          <button className="pf-btn ghost" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- header: photo + name

function Header({ p, name, here, run, setToast }: {
  p: P; name: string; here: string | null; run: Run; setToast: (t: { kind: "ok" | "err"; text: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    if (!menu && !viewing) return;
    const onDown = (e: MouseEvent) => menu && menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setMenu(false), setViewing(false));
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, viewing]);
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const avatar = await resizeImage(f);
      await run(() => profileApi.update({ avatar }), "Profile picture updated.");
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <section className="pf-card pf-header">
      <div className="pf-avatar-wrap" ref={menuRef}>
        <button
          className="pf-avatar"
          onClick={() => (p.avatar ? setMenu(!menu) : fileRef.current?.click())}
          aria-haspopup={p.avatar ? "menu" : undefined}
          aria-expanded={p.avatar ? menu : undefined}
          aria-label={p.avatar ? "Profile picture options" : "Add a profile picture"}
          title={p.avatar ? "Profile picture options" : "Add a profile picture"}
        >
          {p.avatar ? <img src={p.avatar} alt="" /> : <span>{name.charAt(0).toUpperCase()}</span>}
          <span className="pf-avatar-hover" aria-hidden="true">{I.cam}</span>
        </button>
        {menu && (
          <div className="pf-avatar-menu" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); setViewing(true); }}>View picture</button>
            <button role="menuitem" onClick={() => { setMenu(false); fileRef.current?.click(); }}>Change picture</button>
            <button role="menuitem" className="danger" onClick={() => { setMenu(false); run(() => profileApi.update({ avatar: null }), "Picture deleted."); }}>
              Delete picture
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      </div>
      {viewing && p.avatar && (
        <div className="pf-viewer" role="dialog" aria-label="Profile picture" onClick={() => setViewing(false)}>
          <img src={p.avatar} alt={`${name}'s profile picture`} onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setViewing(false)} aria-label="Close">{I.close}</button>
        </div>
      )}
      <div className="pf-header-text">
        <h1>{name}</h1>
        <p className="muted">{p.email}</p>
        <p className="pf-here">
          {I.pin}
          {here ? <>You're in <b>{here}</b></> : "Current location not shared"}
        </p>
      </div>
      <dl className="pf-stats">
        <div><dt>Cards</dt><dd>{p.cards.length}</dd></div>
        <div><dt>Places visited</dt><dd>{p.visits.length}</dd></div>
        <div><dt>Member since</dt><dd className="sm">{fmtDate(p.member_since)}</dd></div>
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- personal details

function Details({ p, run }: { p: P; run: Run }) {
  const [f, setF] = useState({ full_name: p.full_name ?? "", phone: p.phone ?? "", city: p.city ?? "" });
  const dirty = f.full_name !== (p.full_name ?? "") || f.phone !== (p.phone ?? "") || f.city !== (p.city ?? "");
  const save = (e: FormEvent) => {
    e.preventDefault();
    run(() => profileApi.update({ full_name: f.full_name, phone: f.phone || null, city: f.city || null }), "Details saved.");
  };
  return (
    <section className="pf-card">
      <h2>Personal details</h2>
      <form className="pf-form" onSubmit={save}>
        <label className="pf-field"><span>Full name</span>
          <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required minLength={2} />
        </label>
        <label className="pf-field"><span>Email</span>
          <input value={p.email} disabled />
        </label>
        <div className="pf-row">
          <label className="pf-field"><span>Phone</span>
            <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03xx xxxxxxx" />
          </label>
          <label className="pf-field"><span>City</span>
            <select value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
              <option value="">Select city</option>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <div className="pf-form-foot">
          <button className="pf-btn" disabled={!dirty}>Save details</button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- locations

function Locations({ p, loc, ask, here, run }: {
  p: P; loc: ReturnType<typeof useMyLocation>["loc"]; ask: () => void; here: string | null; run: Run;
}) {
  return (
    <section className="pf-card">
      <h2>My locations</h2>
      <div className="pf-place current">
        <span className="pf-place-icon">{I.pin}</span>
        <div className="pf-place-body">
          <b>Current location</b>
          <span className="muted">
            {loc.status === "ok"
              ? `${here ?? "Location on"} · ${loc.coords!.lat.toFixed(4)}, ${loc.coords!.lng.toFixed(4)}`
              : loc.status === "asking" || loc.status === "idle"
                ? "Locating…"
                : loc.status === "denied"
                  ? "Location is blocked in your browser."
                  : "Your browser can't share location."}
          </span>
        </div>
        {loc.status === "denied" && <button className="pf-btn small ghost" onClick={ask}>Try again</button>}
      </div>
      <SavedPlace kind="home" icon={I.home} title="Home" place={p.home} me={loc.coords} hereLabel={here} run={run} />
      <SavedPlace kind="work" icon={I.work} title="Work" place={p.work} me={loc.coords} hereLabel={here} run={run} />
    </section>
  );
}

function SavedPlace({ kind, icon, title, place, me, hereLabel, run }: {
  kind: "home" | "work"; icon: JSX.Element; title: string; place: Place; me?: Coords; hereLabel: string | null; run: Run;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(place.label ?? "");
  const [coords, setCoords] = useState<Coords | null>(place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null);
  const saved = place.label || place.lat != null;
  const km = me && place.lat != null && place.lng != null ? distanceKm(me, place.lat, place.lng) : null;

  const start = () => {
    setLabel(place.label ?? "");
    setCoords(place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null);
    setEditing(true);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () => profileApi.update({ [kind]: { label: label || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null } }),
      `${title} saved.`,
    );
    if (ok) setEditing(false);
  };

  return (
    <div className="pf-place">
      <span className="pf-place-icon">{icon}</span>
      {editing ? (
        <form className="pf-place-body pf-place-form" onSubmit={save}>
          <b>{title}</b>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`e.g. ${kind === "home" ? "House 12, Block C, Model Town" : "Office, Gulberg III"}`} autoFocus />
          <div className="pf-place-actions">
            <button
              type="button"
              className="pf-btn small ghost"
              disabled={!me}
              title={me ? undefined : "Allow location first"}
              onClick={() => {
                if (!me) return;
                setCoords(me);
                if (!label && hereLabel) setLabel(hereLabel);
              }}
            >
              {I.pin} {coords ? "Re-pin to where I am" : "Pin to where I am now"}
            </button>
            {coords && <span className="muted small">Pinned · {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</span>}
          </div>
          <div className="pf-place-actions">
            <button className="pf-btn small" disabled={!label && !coords}>Save</button>
            <button type="button" className="pf-btn small ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="pf-place-body">
            <b>{title}</b>
            <span className="muted">
              {saved ? place.label || "Pinned on map" : `Add your ${kind} address to see deals near it.`}
              {km != null && <> · <b className="pf-km">{fmtKm(km)} from you</b></>}
            </span>
          </div>
          <div className="pf-place-btns">
            <button className="pf-btn small ghost" onClick={start}>{saved ? "Edit" : "Add"}</button>
            {saved && (
              <button className="pf-icon-btn" aria-label={`Remove ${kind}`} onClick={() => run(() => profileApi.update({ [kind]: null }), `${title} removed.`)}>
                {I.close}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cards

function Cards({ p, run, offers }: { p: P; run: Run; offers: DashOffer[] }) {
  const [bank, setBank] = useState("");
  const [card, setCard] = useState("");
  const [custom, setCustom] = useState("");
  // real card names from this bank's deals first (so they match exactly), then the bank's usual cards
  const options = useMemo(() => {
    if (!bank) return [];
    const fromDeals = [...new Set(offers.filter((o) => o.bank.slug === bank).flatMap((o) => o.cards.map((c) => c.name)))].sort();
    const known = (BANK_CARDS[bank] ?? []).filter((n) => !fromDeals.some((d) => d.toLowerCase().startsWith(n.toLowerCase())));
    return [...fromDeals, ...known];
  }, [bank, offers]);
  const cardName = card === "__other" ? custom.trim() : card;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const b = ALL_BANKS.find((x) => x.slug === bank);
    if (!b || !cardName) return;
    if (await run(() => profileApi.addCard({ bank_slug: b.slug, bank_name: b.name, card_name: cardName }), "Card added.")) {
      setCard("");
      setCustom("");
    }
  };

  return (
    <section className="pf-card">
      <h2>My cards <small>{p.cards.length}</small></h2>
      <p className="muted small pf-note">Only your bank and card type — we never ask for card numbers, PINs or CVVs.</p>
      {p.cards.length > 0 && (
        <ul className="pf-cards">
          {p.cards.map((c) => (
            <li key={c.id} className={`pf-cc tone-${(c.id % 4) + 1}`}>
              <span className="pf-cc-bank">{c.bank_name}</span>
              <span className="pf-cc-name">{c.card_name}</span>
              <span className="pf-cc-chip" aria-hidden="true" />
              <button className="pf-cc-x" aria-label={`Remove ${c.bank_name} ${c.card_name}`} onClick={() => run(() => profileApi.removeCard(c.id), "Card removed.")}>
                {I.close}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="pf-add-card" onSubmit={add}>
        <select value={bank} onChange={(e) => { setBank(e.target.value); setCard(""); }} aria-label="Bank">
          <option value="">Choose bank</option>
          {ALL_BANKS.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        </select>
        <select value={card} onChange={(e) => setCard(e.target.value)} disabled={!bank} aria-label="Card">
          <option value="">Choose card</option>
          {options.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="__other">Other…</option>
        </select>
        {card === "__other" && (
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Card name, e.g. Visa Signature" maxLength={150} />
        )}
        <button className="pf-btn" disabled={!bank || !cardName}>{I.card} Add card</button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- visited restaurants

function Visits({ p, run }: { p: P; run: Run }) {
  return (
    <section className="pf-card">
      <h2>Restaurants I've visited <small>{p.visits.length}</small></h2>
      {p.visits.length === 0 ? (
        <div className="pf-empty">
          {I.plate}
          <p>No visits yet. Open a deal on the dashboard and tap <b>“I've been here”</b> to keep track of places you've tried.</p>
          <a className="pf-btn outline" href="/dashboard">Browse deals</a>
        </div>
      ) : (
        <ul className="pf-visits">
          {p.visits.map((v) => (
            <li key={v.id}>
              <span className="pf-visit-img">
                {v.image_url ? <img src={v.image_url} alt="" loading="lazy" /> : <span>{v.place_name.charAt(0)}</span>}
              </span>
              <div className="pf-visit-body">
                <b>{v.place_name}</b>
                {v.place_address && <span className="muted small pf-visit-addr">{I.pin}{v.place_address}</span>}
                <span className="small">
                  {v.discount_percent != null && <b className="pf-pct">{Number.isInteger(v.discount_percent) ? v.discount_percent : v.discount_percent.toFixed(1)}% OFF</b>}
                  {v.bank_name && <span className="muted"> with {v.bank_name}</span>}
                  <span className="muted"> · {fmtDate(v.visited_at)}</span>
                </span>
              </div>
              <button className="pf-icon-btn" aria-label={`Remove ${v.place_name}`} onClick={() => run(() => profileApi.removeVisit(v.id), "Removed from visited.")}>
                {I.close}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
