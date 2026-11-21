/**
 * "Choose your location" — works like Foodpanda's address screen:
 *   • search box at the top (Google suggestions as you type)
 *   • a map with the pin fixed in the middle — drag the MAP to move it to your exact door
 *   • the address under the pin, split into house no. / street / area / city (editable, filled by Google)
 *   • quick picks: current location, Home, Office · optionally save it as Home / Office
 * Without Google keys there's no map/search: you type the address and we use your phone's GPS position.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "./loader";
import { newSession, placesApi, shortAddress, type Suggestion } from "./api";
import "./mapPicker.css";

type Coords = { lat: number; lng: number };
type Saved = { label: string | null; lat: number | null; lng: number | null } | null | undefined;
export type PickedLocation = { label: string; full: string; coords: Coords; saveAs: "home" | "work" | null };

const LAHORE: Coords = { lat: 31.5204, lng: 74.3587 };

export function MapPicker({ start, gps, askGps, home, work, loggedIn, onClose, onConfirm }: {
  start?: Coords;          // where the pin starts (my chosen / current position)
  gps?: Coords;            // live GPS position
  askGps: () => void;
  home?: Saved;
  work?: Saved;
  loggedIn: boolean;
  onClose: () => void;
  onConfirm: (p: PickedLocation) => void;
}) {
  const [status, setStatus] = useState<{ enabled: boolean; map: boolean } | null>(null);
  const [pin, setPin] = useState<Coords | null>(start ?? gps ?? null);
  const [f, setF] = useState({ house: "", street: "", area: "", city: "Lahore" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [saveAs, setSaveAs] = useState<"home" | "work" | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const edited = useRef(false); // once the user types, the map stops overwriting the fields
  const session = useRef(newSession());
  const lastLookup = useRef("");

  useEffect(() => {
    placesApi.status().then(setStatus);
  }, []);

  // address under the pin -> fields
  const fillFrom = async (c: Coords) => {
    if (!status?.enabled) return;
    const k = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
    if (k === lastLookup.current) return;
    lastLookup.current = k;
    setBusy(true);
    setErr(null);
    try {
      const a = await placesApi.reverse(c.lat, c.lng);
      if (!edited.current) setF({ house: a.house_number ?? "", street: a.street ?? "", area: a.area ?? "", city: a.city ?? "Lahore" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // map with a fixed centre pin: wherever the map stops, that's the location
  useEffect(() => {
    if (!status?.map || !mapEl.current) return;
    let alive = true;
    (async () => {
      const key = await placesApi.browserKey();
      if (!key || !alive) return;
      try {
        const gm = await loadGoogleMaps(key);
        map.current = new gm.Map(mapEl.current, {
          center: pin ?? LAHORE, zoom: pin ? 18 : 12, disableDefaultUI: true, zoomControl: true,
          clickableIcons: false, gestureHandling: "greedy",
        });
        map.current.addListener("dragstart", () => (edited.current = false));
        map.current.addListener("idle", () => {
          const c = map.current.getCenter();
          const p = { lat: c.lat(), lng: c.lng() };
          setPin(p);
          fillFrom(p);
        });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.map]);

  // no map, but geocoding works: still read the address at my position
  useEffect(() => {
    if (status && !status.map && status.enabled && pin) fillFrom(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const moveTo = (c: Coords, zoom = 18) => {
    edited.current = false;
    setPin(c);
    if (map.current) {
      map.current.panTo(c);
      map.current.setZoom(zoom);
    } else {
      fillFrom(c);
    }
  };

  // search as you type (Google suggestions)
  useEffect(() => {
    if (!status?.enabled || q.trim().length < 2) return setHits([]);
    const t = window.setTimeout(async () => {
      try {
        setHits(await placesApi.autocomplete(q.trim(), session.current, pin ?? gps ?? undefined));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status?.enabled]);

  const choose = async (s: Suggestion) => {
    setBusy(true);
    try {
      const d = await placesApi.details(s.place_id, session.current);
      session.current = newSession();
      setHits([]);
      setQ(s.main);
      moveTo({ lat: d.lat, lng: d.lng });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const useSaved = (s: Saved, fallbackName: string) => {
    if (!s || s.lat == null || s.lng == null) return;
    moveTo({ lat: s.lat, lng: s.lng });
    if (!status?.enabled && s.label) {
      edited.current = true;
      setF({ house: "", street: s.label, area: "", city: "Lahore" });
    }
    void fallbackName;
  };

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    edited.current = true;
    setF({ ...f, [k]: e.target.value });
  };

  // short label for the top bar: house no. + street + area (never just "Lahore")
  const label = shortAddress({ house_number: f.house || null, street: f.street || null, area: f.area || null, city: f.city || null, address: "" });
  const full = [f.house && `House ${f.house}`, f.street, f.area, f.city].filter(Boolean).join(", ");
  const coords = pin ?? gps ?? null;
  const missing = !coords ? "a position (allow location or move the map)" : !(f.house || f.street) ? "your house no. or street" : !f.area ? "the area" : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const hasHome = !!home && home.lat != null;
  const hasWork = !!work && work.lat != null;

  return (
    <div className="mp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="mp" role="dialog" aria-label="Choose your location">
        <header className="mp-head">
          <b>Choose your location</b>
          <button className="mp-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {/* search, like Foodpanda */}
        <div className="mp-search-wrap">
          <input
            className="mp-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={status?.enabled ? "Search street, area, building or restaurant…" : "Search needs Google — type your address below"}
            disabled={!status?.enabled}
            aria-label="Search for an address"
            autoFocus
          />
          {hits.length > 0 && (
            <ul className="mp-hits" role="listbox">
              {hits.map((h) => (
                <li key={h.place_id}>
                  <button onClick={() => choose(h)}>
                    <b>{h.main}</b>
                    {h.secondary && <small>{h.secondary}</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mp-quick">
          <button onClick={() => (gps ? moveTo(gps) : askGps())}>◎ {gps ? "Current location" : "Allow current location"}</button>
          {hasHome && <button onClick={() => useSaved(home, "Home")}>⌂ Home</button>}
          {hasWork && <button onClick={() => useSaved(work, "Office")}>▣ Office</button>}
        </div>

        {status?.map ? (
          <div className="mp-map-wrap">
            <div ref={mapEl} className="mp-map" />
            {/* fixed centre pin — move the map underneath it */}
            <span className="mp-center-pin" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 22s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12Z" /><circle cx="12" cy="10" r="2.6" fill="#fff" /></svg>
            </span>
            <p className="mp-hint">Move the map to put the pin on your exact door</p>
          </div>
        ) : (
          status && (
            <p className="mp-note">
              {status.enabled
                ? "The map isn't switched on yet (needs a Google Maps browser key). Type your address below — we'll use your phone's GPS position for distances."
                : "Google Maps isn't set up yet. Type your exact address below — we'll use your phone's GPS position for distances."}
            </p>
          )
        )}

        <div className="mp-body">
          <p className="mp-under">{busy ? "Finding the address…" : full ? `📍 ${full}` : "Your address will appear here"}</p>
          <div className="mp-grid">
            <label className="mp-field"><span>House / flat no.</span>
              <input value={f.house} onChange={set("house")} placeholder="e.g. 12-B" autoComplete="address-line1" />
            </label>
            <label className="mp-field"><span>Street</span>
              <input value={f.street} onChange={set("street")} placeholder="e.g. Lake Road" autoComplete="address-line2" />
            </label>
            <label className="mp-field"><span>Area / block</span>
              <input value={f.area} onChange={set("area")} placeholder="e.g. Chauburji" />
            </label>
            <label className="mp-field"><span>City</span>
              <input value={f.city} onChange={set("city")} placeholder="Lahore" autoComplete="address-level2" />
            </label>
          </div>
          {err && <p className="mp-small err">{err}</p>}

          {loggedIn && (
            <div className="mp-save" role="radiogroup" aria-label="Save this address">
              <span>Save as</span>
              {([[null, "Don't save"], ["home", "Home"], ["work", "Office"]] as const).map(([k, t]) => (
                <button key={t} role="radio" aria-checked={saveAs === k} className={saveAs === k ? "on" : ""} onClick={() => setSaveAs(k)}>{t}</button>
              ))}
            </div>
          )}
        </div>

        <footer className="mp-foot">
          {missing && <span className="mp-small">Add {missing}</span>}
          <button
            className="mp-btn"
            disabled={!!missing}
            onClick={() => coords && onConfirm({ label: label || full, full, coords, saveAs })}
          >
            Confirm location
          </button>
        </footer>
      </section>
    </div>
  );
}
