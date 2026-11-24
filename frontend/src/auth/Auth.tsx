import { useEffect, useState, type FormEvent } from "react";
import logo from "../assets/logo.png";
import { CITIES, COUNTRIES } from "../home/data";
import { authApi, type Me, type Role } from "./api";
import { saveKind } from "../shared/role";
import "./auth.css";

type Mode = "login" | "signup";

const COVER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=75&auto=format&fit=crop";

/** Where to go after logging in: ?next=/somewhere (same-site paths only), else the dashboard
 *  (/dashboard shows restaurant accounts their own discount manager). */
function nextPath(u?: Me | null) {
  const n = new URLSearchParams(window.location.search).get("next");
  if (n && n.startsWith("/") && !n.startsWith("//")) return n;
  return "/dashboard"; // the same URL shows the right dashboard for customers and restaurants
}

/** ?as=restaurant opens the sign-up form on the Restaurant tab. */
const startRole = (): Role => (new URLSearchParams(window.location.search).get("as") === "restaurant" ? "restaurant" : "client");

export default function Auth() {
  const mode: Mode = window.location.pathname.startsWith("/signup") ? "signup" : "login";
  const [role, setRoleState] = useState<Role>(startRole);
  const [form, setForm] = useState({ full_name: "", restaurant_name: "", email: "", password: "", phone: "", city: "", country: "Pakistan" });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${mode === "login" ? "Log in" : "Sign up"} · Discount فرویش`;
    // already logged in? skip the form
    authApi.me().then((u) => u && window.location.replace(nextPath(u)));
  }, [mode]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const other = mode === "login" ? "/signup" : "/login";
  const keepNext = (() => {
    const q = new URLSearchParams(window.location.search);
    q.delete("as");
    const s = q.toString();
    return s ? `?${s}` : "";
  })();
  const isRest = mode === "signup" && role === "restaurant";

  /** Switch Client / Restaurant — same /signup URL, the choice is kept in ?as= so it survives a reload. */
  function setRole(r: Role) {
    setRoleState(r);
    setError(null);
    const q = new URLSearchParams(window.location.search);
    if (r === "restaurant") q.set("as", "restaurant");
    else q.delete("as");
    const s = q.toString();
    window.history.replaceState(null, "", `/signup${s ? `?${s}` : ""}`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u =
        mode === "login"
          ? await authApi.login(form.email, form.password)
          : await authApi.signup({ ...form, role, restaurant_name: isRest ? form.restaurant_name : undefined });
      saveKind(u.role === "restaurant" ? "restaurant" : "customer");
      window.location.assign(nextPath(u));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-left">
        <a href="/" className="auth-brand" aria-label="Discount فرویش home">
          <img src={logo} alt="Discount فرویش" />
        </a>

        <div className="auth-form-wrap">
          <h1>{mode === "login" ? "Welcome back" : isRest ? "List your restaurant" : "Create your account"}</h1>
          <p className="auth-lead">
            {mode === "login"
              ? "Log in to your customer or restaurant account."
              : isRest
                ? "Create a restaurant account to manage how your restaurant and its bank deals appear."
                : "Save your cards and favourite restaurants, and see which deals work for you today."}
          </p>

          {mode === "signup" && (
            <div className="auth-role" role="tablist" aria-label="Sign up as">
              <button type="button" role="tab" aria-selected={role === "client"} className={role === "client" ? "on" : ""} onClick={() => setRole("client")}>
                Sign up as a client
              </button>
              <button type="button" role="tab" aria-selected={role === "restaurant"} className={role === "restaurant" ? "on" : ""} onClick={() => setRole("restaurant")}>
                Sign up as a restaurant
              </button>
            </div>
          )}

          <form className="auth-form" onSubmit={submit} noValidate>
            {isRest && (
              <label className="field">
                <span>Restaurant name</span>
                <input value={form.restaurant_name} onChange={set("restaurant_name")} autoComplete="organization" placeholder="e.g. Café Aylanto" required minLength={2} />
              </label>
            )}
            {mode === "signup" && (
              <label className="field">
                <span>{isRest ? "Your name" : "Full name"}</span>
                <input value={form.full_name} onChange={set("full_name")} autoComplete="name" placeholder="Ali Khan" required minLength={2} />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label className="field">
              <span>Password</span>
              <span className="pw">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  required
                  minLength={mode === "signup" ? 8 : 1}
                />
                <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {mode === "signup" && (
              <div className="field-row">
                <label className="field">
                  <span>Phone {!isRest && <small>(optional)</small>}</span>
                  <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" placeholder="03xx xxxxxxx" />
                </label>
                <label className="field">
                  <span>City <small>(optional)</small></span>
                  <select value={form.city} onChange={set("city")}>
                    <option value="">Select city</option>
                    {CITIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            )}
            {mode === "signup" && (
              <label className="field">
                <span>Country</span>
                <select value={form.country} onChange={set("country")} autoComplete="country-name">
                  {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Log in" : isRest ? "Create restaurant account" : "Create account"}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <a href={other + keepNext}>{mode === "login" ? "Create an account" : "Log in"}</a>
          </p>
          {mode === "login" && (
            <p className="auth-switch auth-switch-sub">
              Own a restaurant? <a href={`/signup${keepNext ? keepNext + "&" : "?"}as=restaurant`}>Sign up as a restaurant</a>
            </p>
          )}
          <p className="auth-fine">We never ask for card numbers, PINs or bank logins.</p>
        </div>
      </section>

      <aside className="auth-right" style={{ backgroundImage: `url(${COVER})` }}>
        <div className="auth-right-shade" />
        <div className="auth-deal deal-a">
          <b>40% OFF</b>
          <span>Dinner · Fri–Sun</span>
          <small>Meezan Visa Platinum</small>
        </div>
        <div className="auth-deal deal-b">
          <b>25% OFF</b>
          <span>Coffee & desserts · Mon–Thu</span>
          <small>HBL Mastercard Gold</small>
        </div>
        <div className="auth-right-copy">
          <h2>Every card discount, in one place.</h2>
          <ul>
            <li>Restaurant & café deals from Pakistan's banks, updated daily</li>
            <li>See only the deals that work with the cards you own</li>
            <li>Find what's on today and how far it is from you</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
