/**
 * "Choose your location" — a delivery-app-style picker on OpenStreetMap (Leaflet + React Leaflet).
 *   • search an address and press Enter (no autocomplete — Nominatim's policy) → the marker moves there
 *   • "Use My Current Location" → browser geolocation (high accuracy) + an accuracy circle
 *   • drag the marker, or tap the map, to the exact door → lat/lng update at once; the address is looked
 *     up once the marker stops moving
 *   • optional house / flat no. · optionally save as Home / Office · Confirm Location
 * Browser location accuracy varies: phones with GPS are usually within metres, laptops often use Wi-Fi and
 * can be off by 50 m or more — so the accuracy is shown and the marker can always be moved.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { geoApi, shortAddress, type Address, type PlaceHit } from "./api";
import "./mapPicker.css";

type Coords = { lat: number; lng: number };
type Saved = { label: string | null; lat: number | null; lng: number | null } | null | undefined;
export type PickedLocation = {
  label: string;           // short: "293B New Chauburji Park, Chauburji"
  full: string;            // full readable address
  coords: Coords;
  accuracy: number | null; // metres, when it came from "Use My Current Location"
  saveAs: "home" | "work" | null;
};

/** Starting view before any position is known: the city the app covers (Lahore). Not the user's location. */
const DEFAULT_VIEW = { center: [31.5204, 74.3587] as [number, number], zoom: 12 };

// Our own pin (an inline SVG) — avoids Leaflet's default marker images, which bundlers don't resolve.
const PIN = L.divIcon({
  className: "mp-leaflet-pin",
  html: '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 22s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12Z" fill="#5b02a5"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>',
  iconSize: [40, 40],
  iconAnchor: [20, 38],
});

function geoError(e: GeolocationPositionError | null): string {
  if (!e) return "Your browser doesn't support location. Search your address or tap the map instead.";
  if (e.code === e.PERMISSION_DENIED)
    return "Location permission was denied. To allow it: click the lock / tune icon left of the address bar → Site settings → Location → Allow, then try again. (Phone: Settings → your browser → Location.) You can also search your address or tap the map.";
  if (e.code === e.POSITION_UNAVAILABLE)
    return "Your position isn't available right now (location services may be off). Search your address or tap the map instead.";
  if (e.code === e.TIMEOUT) return "Finding your location took too long. Try again, or search your address / tap the map.";
  return "Couldn't get your location. Search your address or tap the map instead.";
}

/** Map helpers: fly to a target, report taps, and re-measure after the dialog lays out. */
function FlyTo({ target }: { target: { c: Coords; zoom: number; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.c.lat, target.c.lng], target.zoom, { duration: 0.6 });
  }, [target, map]);
  return null;
}
function TapToMove({ onTap }: { onTap: (c: Coords) => void }) {
  useMapEvents({ click: (e) => onTap({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

export function MapPicker({ start, gps, home, work, loggedIn, onClose, onConfirm }: {
  start?: Coords;          // where the marker starts (my chosen / last known position)
  gps?: Coords;            // last known browser position (only a starting point)
  askGps?: () => void;     // kept for existing callers
  home?: Saved;
  work?: Saved;
  loggedIn: boolean;
  onClose: () => void;
  onConfirm: (p: PickedLocation) => void;
}) {
  const initial = start ?? gps ?? null;
  const [pos, setPos] = useState<Coords | null>(initial);
  const [target, setTarget] = useState<{ c: Coords; zoom: number; n: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [addr, setAddr] = useState<Address | null>(null);
  const [addrState, setAddrState] = useState<"idle" | "loading" | "none" | "error">("idle");
  const [locating, setLocating] = useState(false);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Address[]>([]);
  const [suggest, setSuggest] = useState<PlaceHit[]>([]); // Lahore areas as you type (local list)
  const [noLocal, setNoLocal] = useState(false);            // typed text matched nothing in the list
  const suggestSeq = useRef(0);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  // the three address inputs — filled from the map, always editable
  const [house, setHouse] = useState("");
  const [street, setStreet] = useState("");      // block or street
  const [fullAddr, setFullAddr] = useState("");  // full address
  const [saveAs, setSaveAs] = useState<"home" | "work" | null>(null);
  const lookupTimer = useRef<number | undefined>(undefined);
  const lookupSeq = useRef(0);

  const goTo = (c: Coords, zoom = 18) => {
    setPos(c);
    setTarget({ c, zoom, n: Date.now() });
  };

  // reverse-geocode once the marker has stopped (debounced; the backend also keeps to 1 request/second)
  const lookupSoon = (c: Coords, delay = 700) => {
    window.clearTimeout(lookupTimer.current);
    setAddrState("loading");
    lookupTimer.current = window.setTimeout(async () => {
      const seq = ++lookupSeq.current;
      try {
        const a = await geoApi.reverse(c.lat, c.lng);
        if (seq !== lookupSeq.current) return; // a newer move happened meanwhile
        setAddr(a);
        setAddrState("idle");
        setHouse(a.house_number ?? "");
        setStreet(a.street ?? a.area ?? "");
        setFullAddr(a.address);
      } catch (e) {
        if (seq !== lookupSeq.current) return;
        setAddr(null);
        setAddrState(/no address/i.test(e instanceof Error ? e.message : "") ? "none" : "error");
      }
    }, delay);
  };

  useEffect(() => {
    if (initial) lookupSoon(initial, 0);
    return () => window.clearTimeout(lookupTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // marker dragged / map tapped -> coordinates change at once, address after it stops
  const moveMarker = (c: Coords) => {
    setPos(c);
    setAccuracy(null); // a hand-placed marker has no GPS accuracy
    setHouse("");
    setStreet("");
    setFullAddr("");
    lookupSoon(c);
  };
  const moveRef = useRef(moveMarker);
  moveRef.current = moveMarker;
  const markerEvents = useMemo(
    () => ({
      dragend: (e: L.DragEndEvent) => {
        const ll = (e.target as L.Marker).getLatLng();
        moveRef.current({ lat: ll.lat, lng: ll.lng });
      },
    }),
    [],
  );

  // ---- "Use My Current Location"
  const useMyLocation = () => {
    setMsg(null);
    if (!window.isSecureContext) {
      return setMsg({ kind: "err", text: "Location only works on https:// or http://localhost. Open the app at http://localhost:5173 or over HTTPS." });
    }
    if (!("geolocation" in navigator)) return setMsg({ kind: "err", text: geoError(null) });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude };
        const acc = Math.round(p.coords.accuracy);
        setLocating(false);
        setAccuracy(acc);
        setHouse("");
        goTo(c, acc > 300 ? 15 : acc > 80 ? 17 : 18);
        lookupSoon(c, 0);
        setMsg({
          kind: "ok",
          text: acc > 100
            ? `Found you, but only to about ±${acc} m (common on laptops using Wi-Fi). Drag the pin to your exact door.`
            : `Found you (±${acc} m). Drag the pin if it's not exactly on your door.`,
        });
      },
      (e) => {
        setLocating(false);
        setMsg({ kind: "err", text: geoError(e) });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  // ---- Lahore areas as you type (our own list — never the public map service)
  useEffect(() => {
    const text = q.trim();
    setNoLocal(false);
    if (text.length < 2 || results.length) return setSuggest([]);
    const seq = ++suggestSeq.current;
    const t = window.setTimeout(() => {
      geoApi.places(text)
        .then((h) => {
          if (seq !== suggestSeq.current) return;
          setSuggest(h);
          setNoLocal(h.length === 0);
        })
        .catch(() => setSuggest([]));
    }, 120);
    return () => window.clearTimeout(t);
  }, [q, results.length]);

  const pickPlace = (p: PlaceHit) => {
    setSuggest([]);
    setNoLocal(false);
    suggestSeq.current++;
    setQ(p.name);
    setResults([]);
    setAccuracy(null);
    setHouse("");
    setStreet(p.name);
    setFullAddr([p.name, p.area, "Lahore"].filter(Boolean).join(", "));
    setAddr({ address: p.address, house_number: null, street: null, area: p.name, city: "Lahore", lat: p.lat, lng: p.lng });
    setAddrState("idle");
    goTo({ lat: p.lat, lng: p.lng }, 16); // an area, not a door — zoom out a little
    setMsg({ kind: "ok", text: `Moved to ${p.name}. Now drag the pin (or tap the map) to your exact door.` });
  };

  // ---- address search (on submit only)
  const pickResult = (a: Address) => {
    setResults([]);
    setSuggest([]);
    setAccuracy(null);
    setHouse(a.house_number ?? "");
    setStreet(a.street ?? a.area ?? "");
    setFullAddr(a.address);
    goTo({ lat: a.lat, lng: a.lng });
    setAddr(a);
    setAddrState("idle");
    setMsg({ kind: "ok", text: "Moved the pin to that address — drag it to your exact door if needed." });
  };
  const search = async (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (text.length < 3) return;
    setSearching(true);
    setMsg(null);
    setResults([]);
    setSuggest([]);
    setNoLocal(false);
    suggestSeq.current++;
    try {
      const hits = await geoApi.search(text);
      if (!hits.length) setMsg({ kind: "err", text: "No match on the map for that address. Try the area name (e.g. “Chauburji, Lahore”) or tap the map." });
      else if (hits.length === 1) pickResult(hits[0]);
      else setResults(hits);
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSearching(false);
    }
  };

  const useSaved = (s: Saved) => {
    if (!s || s.lat == null || s.lng == null) return;
    const c = { lat: s.lat, lng: s.lng };
    setAccuracy(null);
    goTo(c);
    lookupSoon(c, 0);
  };

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

  // what the user sees + what Confirm saves
  // full = house + block/street + full address (without repeating what the full address already says)
  const lowerFull = fullAddr.toLowerCase();
  const full = [
    house && !lowerFull.includes(house.toLowerCase()) ? `House ${house}` : null,
    street && !lowerFull.includes(street.toLowerCase()) ? street : null,
    fullAddr || null,
  ].filter(Boolean).join(", ");
  const label = house || street || fullAddr
    ? shortAddress({ house_number: house || null, street: street || null, area: addr?.area ?? null, city: addr?.city ?? null, address: fullAddr })
    : pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "";

  const hasHome = !!home && home.lat != null;
  const hasWork = !!work && work.lat != null;

  // Rendered at the end of <body> (portal): the top bar uses backdrop-filter, which would otherwise trap
  // this fixed-position window inside the 64px-tall header.
  return createPortal(
    <div className="mp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="mp" role="dialog" aria-label="Choose your location">
        <header className="mp-head">
          <b>Choose your location</b>
          <button className="mp-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {/* search (submit only) */}
        <form className="mp-search-wrap" onSubmit={search} role="search">
          <span className="mp-search-box">
            <input
              className="mp-search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (results.length) setResults([]); // typing again -> back to the as-you-type list
              }}
              placeholder="Type an area or address, e.g. DHA Phase 8, Paragon City"
              onKeyDown={(e) => e.key === "Escape" && suggest.length && (e.stopPropagation(), setSuggest([]))}
              aria-label="Search for an address"
              autoFocus
            />
            {searching && <span className="mp-spin dark mp-searching" aria-label="Searching…" />}
            {q && !searching && (
              <button
                type="button"
                className="mp-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQ("");
                  setResults([]);
                  setSuggest([]);
                  setMsg(null);
                }}
              >
                ✕
              </button>
            )}
          </span>
          {suggest.length > 0 && results.length === 0 && (
            <ul className="mp-hits" role="listbox" aria-label="Lahore areas">
              <li className="mp-hits-head">Areas in Lahore</li>
              {suggest.map((p) => (
                <li key={p.name}>
                  <button type="button" onClick={() => pickPlace(p)}>
                    <b>{p.name}</b>
                    <small>{[p.area, "Lahore"].filter(Boolean).join(", ")}</small>
                  </button>
                </li>
              ))}
              <li className="mp-hits-foot">Not listed? Type the full address and press <b>Enter</b>.</li>
            </ul>
          )}
          {suggest.length === 0 && results.length === 0 && !searching && q.trim().length >= 3 && noLocal && (
            <ul className="mp-hits" role="status">
              <li className="mp-hits-foot first">No area called “{q.trim()}” in our Lahore list. Press <b>Enter</b> to look up this address on the map.</li>
            </ul>
          )}
          {results.length > 0 && (
            <ul className="mp-hits" role="listbox" aria-label="Matching places">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lng},${i}`}>
                  <button type="button" onClick={() => pickResult(r)}>
                    <b>{shortAddress(r)}</b>
                    <small>{r.address}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="mp-quick">
          <button className="mp-addme" onClick={useMyLocation} disabled={locating} aria-busy={locating}>
            {locating ? <><span className="mp-spin" aria-hidden="true" /> Finding you…</> : "◎ Use My Current Location"}
          </button>
          {hasHome && <button onClick={() => useSaved(home)}>⌂ Home</button>}
          {hasWork && <button onClick={() => useSaved(work)}>▣ Office</button>}
        </div>

        {msg && <p className={`mp-msg ${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>{msg.text}</p>}

        {/* the map */}
        <div className="mp-map-wrap">
          <MapContainer
            className="mp-map"
            center={initial ? [initial.lat, initial.lng] : DEFAULT_VIEW.center}
            zoom={initial ? 17 : DEFAULT_VIEW.zoom}
            scrollWheelZoom
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              maxZoom={19}
            />
            <FixSize />
            <FlyTo target={target} />
            <TapToMove onTap={(c) => moveRef.current(c)} />
            {pos && accuracy != null && (
              <Circle center={[pos.lat, pos.lng]} radius={accuracy}
                pathOptions={{ color: "#2b6ef2", weight: 1, fillColor: "#2b6ef2", fillOpacity: 0.12 }} />
            )}
            {pos && <Marker position={[pos.lat, pos.lng]} draggable icon={PIN} eventHandlers={markerEvents} />}
          </MapContainer>
          <p className="mp-hint">{pos ? "Drag the pin or tap the map to adjust" : "Tap the map to drop your pin"}</p>
        </div>

        <div className="mp-body">
          {/* selected address */}
          <div className="mp-selected" aria-live="polite">
            <b>
              {!pos ? "No location selected yet"
                : addrState === "loading" ? "Finding the address…"
                : addr ? full
                : addrState === "none" ? "No street address found for this spot — the coordinates will be saved."
                : addrState === "error" ? "Couldn't look up the address right now — the coordinates will be saved."
                : "—"}
            </b>
            {pos && (
              <span>
                {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}
                {accuracy != null && ` · accurate to about ±${accuracy} m`}
              </span>
            )}
          </div>

          {/* three inputs: house no. · block / street · full address */}
          <div className="mp-fields">
            <label className="mp-field"><span>House no.</span>
              <input value={house} onChange={(e) => setHouse(e.target.value)} placeholder="e.g. 293B" autoComplete="address-line1" />
            </label>
            <label className="mp-field"><span>Block / street</span>
              <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="e.g. Block C / Lake Road" autoComplete="address-line2" />
            </label>
            <label className="mp-field mp-field-full"><span>Full address</span>
              <input value={fullAddr} onChange={(e) => setFullAddr(e.target.value)} placeholder="e.g. New Chauburji Park, Lahore" autoComplete="street-address" />
            </label>
          </div>

          {/* tag: Home or Office (tap again to remove the tag) */}
          {loggedIn && (
            <div className="mp-save" role="group" aria-label="Tag this address">
              <span>Tag</span>
              {([["home", "⌂ Home"], ["work", "▣ Office"]] as const).map(([k, t]) => (
                <button key={k} type="button" aria-pressed={saveAs === k} className={saveAs === k ? "on" : ""} onClick={() => setSaveAs(saveAs === k ? null : k)}>{t}</button>
              ))}
            </div>
          )}
        </div>

        <footer className="mp-foot">
          {!pos && <span className="mp-small">Pick a spot on the map first</span>}
          <button
            className="mp-btn"
            disabled={!pos || addrState === "loading" || !(house || street || fullAddr)}
            onClick={() => pos && onConfirm({ label: label || full, full: full || label, coords: pos, accuracy, saveAs })}
          >
            Confirm Location
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
