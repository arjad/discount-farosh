/**
 * Standalone restaurant page — the same content as the dashboard sidebar, on its own URL:
 *   /restaurant/<id>-<name>   every offer at the restaurant
 *   /offer/<id>-<name>        same page, that offer highlighted and scrolled into view
 * This is what the Share buttons hand out.
 */
import { recordViews } from "../shared/views";
import { useEffect, useMemo, useState } from "react";
import logo from "../assets/logo.png";
import { authApi, type Me } from "../auth/api";
import { dashApi, type DashOffer } from "../dashboard/api";
import { ACTIVE_KEY, DrawerBody, daysText, pct, placeKey, placeName, readActive } from "../dashboard/Dashboard";
import { AddressPicker, type ActiveLoc } from "../dashboard/AddressPicker";
import { profileApi, type Profile } from "../profile/api";
import { useMyLocation } from "../shared/geo";
import { shortAddress, useCurrentAddress } from "../shared/maps/api";
import { offerPath, parsePath, resolveDeep, restaurantPath, shareLink } from "../shared/links";
import "./restaurant.css";

type Toast = { kind: "ok" | "warn" | "err"; text: string } | null;

const PIN = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
const USER = <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;

export default function RestaurantPage() {
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [offers, setOffers] = useState<DashOffer[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // ---- same top bar as the dashboard: address picker in the middle, my name + area on the right
  const [allOffers, setAllOffers] = useState<DashOffer[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { loc, ask: askLocation } = useMyLocation();
  const [active, setActiveState] = useState<ActiveLoc>(readActive);
  const setActive = (a: ActiveLoc) => {
    setActiveState(a);
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    if (me) profileApi.get().then(setProfile).catch(() => {});
  }, [me]);
  const myAddress = useCurrentAddress(loc.coords);
  // exact address (house no., street, area) — or ask for it; never a vague "Lahore"
  const myPlace = myAddress ? shortAddress(myAddress) : "Set your exact address";
  const addressLabel =
    active.source === "current"
      ? loc.status === "ok"
        ? myPlace
        : loc.status === "denied" || loc.status === "unsupported"
          ? "Set your exact address"
          : "Locating…"
      : `${active.source === "home" ? "Home · " : active.source === "work" ? "Office · " : ""}${active.label}`;
  const saveAddress = async (kind: "home" | "work", p: { address: string; lat: number; lng: number }) => {
    try {
      setProfile(await profileApi.update({ [kind]: { label: p.address, lat: p.lat, lng: p.lng } }));
      setToast({ kind: "ok", text: `Saved as your ${kind === "home" ? "home" : "office"} address.` });
      return true;
    } catch (e) {
      setToast({ kind: "err", text: `Couldn't save the address: ${e instanceof Error ? e.message : e}` });
      return false;
    }
  };

  useEffect(() => {
    authApi.me().then(setMe);
    dashApi
      .offers()
      .then((d) => {
        setAllOffers(d.offers);
        const deep = parsePath(window.location.pathname, window.location.search);
        const hit = resolveDeep(deep, d.offers, placeKey);
        if (!hit || !hit.offers.length) return setState("missing");
        // old /offer/<id> links -> the restaurant link with ?offer=<id>
        const canonical = hit.focus != null ? offerPath(hit.offers.find((x) => x.id === hit.focus)!, placeName(hit.offers[0]), hit.offers) : restaurantPath(placeName(hit.offers[0]), hit.offers);
        if (window.location.pathname + window.location.search !== canonical) window.history.replaceState(null, "", canonical);
        setOffers(hit.offers);
        setFocus(hit.focus);
        setState("ready");
        recordViews(hit.focus != null ? [hit.focus] : hit.offers.map((x) => x.id), "link");
        const name = placeName(hit.offers[0]);
        const f = hit.focus != null ? hit.offers.find((o) => o.id === hit.focus) : null;
        document.title = f && f.discount_percent != null ? `${pct(f.discount_percent)} off at ${name}` : name;
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const share = async (path: string, title: string, text: string) => {
    const url = window.location.origin + path;
    const res = await shareLink(url, title, text);
    if (res === "copied") setToast({ kind: "ok", text: "Link copied — paste it to share." });
    else if (res === "failed") setToast({ kind: "warn", text: `Copy this link: ${url}` });
  };

  const o = offers[0];

  return (
    <div className="dash rp">
      <header className="dash-top">
        <div className="dash-top-inner">
          <a href="/" className="dash-brand"><img src={logo} alt="Discount فرویش" /></a>
          <AddressPicker
            active={active}
            label={addressLabel}
            onPick={setActive}
            loc={loc}
            currentLabel={loc.status === "ok" ? myPlace : null}
            askLocation={askLocation}
            home={profile?.home}
            work={profile?.work}
            loggedIn={!!me}
            onSave={saveAddress}
          />
          <div className="dash-top-right">
            <a className="rp-back" href="/dashboard">See all deals</a>
            {me ? (
              <a href="/profile" className="dash-user" title="My profile">
                <span className="dash-avatar" aria-hidden="true">
                  {me.avatar ? <img src={me.avatar} alt="" /> : (me.full_name || me.email).charAt(0).toUpperCase()}
                </span>
                <span className="dash-user-text">
                  <b className="dash-user-name">{me.full_name || me.email}</b>
                </span>
              </a>
            ) : (
              <a href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="dash-login">
                <span className="dash-login-icon">{USER}</span>
                <span className="dash-login-text">Log in</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="rp-main">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Home</a><span aria-hidden="true">/</span>
          <a href="/dashboard">Deals</a><span aria-hidden="true">/</span>
          <span aria-current="page">{o ? placeName(o) : "Restaurant"}</span>
        </nav>

        {state === "loading" && (
          <div className="rp-card" aria-busy="true">
            <div className="sk rp-sk-cover" />
            <div className="rp-sk-lines">
              <span className="sk sk-line" style={{ width: "40%", height: 22 }} />
              <span className="sk sk-line" style={{ width: "25%" }} />
              <span className="sk sk-line" style={{ width: "60%" }} />
            </div>
          </div>
        )}

        {(state === "missing" || state === "error") && (
          <div className="state">
            <b>{state === "missing" ? "This link has expired or isn't available — the offer may have ended, or the restaurant has no deals right now." : "Couldn't load this page. Please try again."}</b>
            <a className="btn-ghost" href="/dashboard">See all deals</a>
          </div>
        )}

        {state === "ready" && o && (
          <DrawerBody
              page
              o={o}
              siblings={offers}
              focusOfferId={focus}
              loggedIn={!!me}
              onPickOffer={() => {}}
              onClose={() => {}}
              onPickPlace={() => window.location.assign("/dashboard")}
              onVisited={async (x) => {
                try {
                  await profileApi.addVisit(x.id);
                  setToast({ kind: "ok", text: `${placeName(x)} added to the places you've visited.` });
                } catch (e) {
                  setToast({ kind: "err", text: `Couldn't save the visit: ${e instanceof Error ? e.message : e}` });
                }
              }}
              onShareRestaurant={() => {
                const name = placeName(o);
                share(restaurantPath(name, offers), name, `Card discounts at ${name}`);
              }}
              onShareOffer={(x) => {
                const name = placeName(x);
                const what = x.discount_percent != null ? `${pct(x.discount_percent)} off` : x.title;
                share(offerPath(x, name, offers), `${what} at ${name}`, `${what} at ${name} with ${x.bank.name} cards — ${daysText(x.valid_days)}`);
              }}
            />
        )}
      </main>

      {toast && (
        <div key={toast.text} className={`toast ${toast.kind}`} role="status" style={{ ["--life" as string]: "4000ms" } as React.CSSProperties}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
