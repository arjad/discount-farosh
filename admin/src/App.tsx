import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import logo from "./logo.png";
import { NotLoggedIn, api, type AdminMe } from "./api";
import { Empty } from "./ui";
import { Link, navigate, usePath } from "./router";
import { Overview } from "./pages/Overview";
import { Restaurants } from "./pages/Restaurants";
import { Offers } from "./pages/Offers";
import { RestaurantPage } from "./pages/RestaurantPage";
import { Users } from "./pages/Users";
import { UserPage } from "./pages/UserPage";
import { I } from "./icons";

export default function App() {
  const [me, setMe] = useState<AdminMe | null | undefined>(undefined);
  const path = usePath();

  const [bootErr, setBootErr] = useState<string | null>(null);
  const checkLogin = () => {
    setBootErr(null);
    setMe(undefined);
    api.me().then(setMe).catch((e) => {
      // not logged in -> login form; server unreachable -> say so (don't pretend they're logged out)
      if (e instanceof NotLoggedIn) setMe(null);
      else setBootErr(e instanceof Error ? e.message : String(e));
    });
  };
  useEffect(checkLogin, []);

  // any page that finds the session has ended sends us back to the login form
  useEffect(() => {
    const out = () => setMe(null);
    window.addEventListener("admin:logged-out", out);
    return () => window.removeEventListener("admin:logged-out", out);
  }, []);

  if (bootErr) {
    return (
      <div className="ad-login">
        <div className="ad-login-card">
          <img src={logo} alt="Discount فرویش" className="ad-login-logo" />
          <Empty text="Can't load the admin" err={bootErr} onRetry={checkLogin} />
        </div>
      </div>
    );
  }
  if (me === undefined) return <div className="ad-boot" />;
  if (me === null) return <Login onIn={setMe} />;

  const logout = async () => {
    await api.logout().catch(() => {});
    setMe(null);
    navigate("/", true);
  };

  const m = path.match(/^\/(restaurants|offers|users)(?:\/([^/]+))?\/?$/);
  let page: ReactNode;
  let title = "Overview";
  if (m?.[1] === "restaurants" && m[2]) [page, title] = [<RestaurantPage key={m[2]} rkey={decodeURIComponent(m[2])} />, "Restaurant"];
  else if (m?.[1] === "restaurants") [page, title] = [<Restaurants />, "Restaurants"];
  else if (m?.[1] === "offers") [page, title] = [<Offers />, "Offers"];
  else if (m?.[1] === "users" && m[2]) [page, title] = [<UserPage key={m[2]} id={Number(m[2])} />, "User"];
  else if (m?.[1] === "users") [page, title] = [<Users />, "Users"];
  else [page, title] = [<Overview />, "Overview"];
  document.title = `${title} · Admin`;

  const section = m?.[1] ?? "";
  return (
    <div className="ad">
      <aside className="ad-side">
        <Link to="/" className="ad-brand"><img src={logo} alt="Discount فرویش" /><span>Admin</span></Link>
        <nav>
          <Link to="/" className={section === "" ? "on" : ""}>{I.grid} Overview</Link>
          <Link to="/restaurants" className={section === "restaurants" ? "on" : ""}>{I.shop} Restaurants</Link>
          <Link to="/offers" className={section === "offers" ? "on" : ""}>{I.tag} Offers</Link>
          <Link to="/users" className={section === "users" ? "on" : ""}>{I.users} Users</Link>
        </nav>
        <div className="ad-side-foot">
          <span title={me.email}>{I.shield} {me.email}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="ad-main">{page}</main>
    </div>
  );
}

function Login({ onIn }: { onIn: (m: AdminMe) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Admin log in";
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onIn(await api.login(email, password));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  };
  return (
    <div className="ad-login">
      <form className="ad-login-card" onSubmit={submit}>
        <img src={logo} alt="Discount فرویش" className="ad-login-logo" />
        <h1>Admin</h1>
        <p className="muted">Log in to manage restaurants, offers and users.</p>
        <label className="ad-field"><span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="ad-field"><span>Password</span>
          <span className="ad-pw">
            <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button type="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
          </span>
        </label>
        {err && <p className="ad-err" role="alert">{err}</p>}
        <button className="ad-btn big" disabled={busy || !email || !password}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="ad-fine">{I.shield} Admin access only. There is no sign-up here.</p>
      </form>
    </div>
  );
}
