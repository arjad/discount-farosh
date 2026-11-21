/** Google Maps — every call goes through our backend (/api/places/*), so the server key stays private.
 *  This file + links.ts + loader.ts + MapPicker.tsx are the only places that know about Google Maps. */
import { useEffect, useState } from "react";

export type Suggestion = { place_id: string; main: string; secondary: string | null };
export type PlaceDetails = { place_id: string; name: string | null; address: string; short_address: string | null; lat: number; lng: number };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.json();
}

/** An exact street address (from Google geocoding). */
export type Address = {
  address: string;
  house_number: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  lat: number;
  lng: number;
};

export type MapsStatus = { enabled: boolean; map: boolean };
let statusPromise: Promise<MapsStatus> | null = null;

/** Google Places search + geocoding, through our backend. */
export const placesApi = {
  /** What's set up: search/geocoding (server key) and the interactive map (browser key). Cached. */
  status: () =>
    (statusPromise ??= get<MapsStatus>("/api/places/status").catch(() => ({ enabled: false, map: false }))),
  enabled: () => placesApi.status().then((s) => s.enabled),
  browserKey: () => get<{ browser_key: string | null }>("/api/places/config").then((r) => r.browser_key).catch(() => null),
  /** Exact address (house number, street, area) at a point. */
  reverse: (lat: number, lng: number) => get<Address>(`/api/places/reverse?lat=${lat}&lng=${lng}`),
  /** Points for a typed address. */
  geocode: (q: string) => get<Address[]>(`/api/places/geocode?q=${encodeURIComponent(q)}`),
  autocomplete: (q: string, session: string, near?: { lat: number; lng: number }) => {
    const p = new URLSearchParams({ q, session });
    if (near) {
      p.set("lat", String(near.lat));
      p.set("lng", String(near.lng));
    }
    return get<Suggestion[]>(`/api/places/autocomplete?${p}`);
  },
  details: (placeId: string, session: string) =>
    get<PlaceDetails>(`/api/places/${encodeURIComponent(placeId)}?session=${encodeURIComponent(session)}`),
};

export const newSession = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** "House 12, Lake Road, Chauburji" — the short form shown in the top bar. */
export function shortAddress(a: Pick<Address, "house_number" | "street" | "area" | "city" | "address">) {
  const first = [a.house_number, a.street].filter(Boolean).join(" ");
  const parts = [first, a.area].filter(Boolean);
  return parts.length ? parts.join(", ") : a.address.split(",").slice(0, 2).join(",").trim();
}

const reverseCache = new Map<string, Promise<Address | null>>();
/** My current position as an exact address (null while unknown, or when Google isn't set up).
 *  Cached per ~10 m so moving the map or re-rendering doesn't call Google again. */
export function useCurrentAddress(coords?: { lat: number; lng: number }) {
  const [addr, setAddr] = useState<Address | null>(null);
  const key = coords ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : "";
  useEffect(() => {
    if (!coords) return setAddr(null);
    let alive = true;
    if (!reverseCache.has(key)) {
      reverseCache.set(
        key,
        placesApi.status().then((s) => (s.enabled ? placesApi.reverse(coords.lat, coords.lng).catch(() => null) : null)),
      );
    }
    reverseCache.get(key)!.then((a) => alive && setAddr(a));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return addr;
}
