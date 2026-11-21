import { useEffect, useState, type FormEvent } from "react";
import logo from "../assets/logo.png";
import { CITIES } from "../home/data";
import { authApi } from "./api";
import "./auth.css";

type Mode = "login" | "signup";

const COVER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1400&q=75&auto=format&fit=crop";

/** Where to go after logging in: ?next=/somewhere (same-site paths only), else the dashboard. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export default function Auth() {
  const mode: Mode = window.location.pathname.startsWith("/signup") ? "signup" : "login";
  const [form, setForm] = useState({ full_name: "", email: "", password: "", phone: "", city: "" });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${mode === "login" ? "Log in" : "Sign up"} · Discount فرویش`;
    // already logged in? skip the form
    authApi.me().then((u) => u && window.location.replace(nextPath()));
  }, [mode]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const other = mode === "login" ? "/signup" : "/login";
  const keepNext = window.location.search;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await authApi.login(form.email, form.password);
      else await authApi.signup(form);
      window.location.assign(nextPath());
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
          <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="auth-lead">
            {mode === "login"
              ? "Log in to see the card discounts near you."
              : "Save your cards and favourite restaurants, and see which deals work for you today."}
          </p>

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === "signup" && (
              <label className="field">
                <span>Full name</span>
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
                  <span>Phone <small>(optional)</small></span>
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

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? "New here?" : "Already have an account?"}{" "}
            <a href={other + keepNext}>{mode === "login" ? "Create an account" : "Log in"}</a>
          </p>
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
