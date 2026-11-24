/**
 * Address lookup — OpenStreetMap Nominatim through our backend (/api/geo/*). Free, no API key.
 * The backend adds the identifying User-Agent, keeps to 1 request/second and caches results, as
 * Nominatim's usage policy requires. This file + links.ts + MapPicker.tsx are the only map code.
 */
import { useEffect, useState } from "react";

/** A readable address at a point. */
export type Address = {
  address: string;              // full readable address
  house_number: string | null;
  street: string | null;
  area: string | null;          // neighbourhood / suburb, e.g. "Chauburji"
  city: string | null;
  lat: number;
  lng: number;
};

/** What the location picker hands back when a place is saved (kept for existing callers). */
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

/** A Lahore area / housing society from our local list (instant suggestions). */
export type PlaceHit = { name: string; area: string | null; address: string; lat: number; lng: number };

export const geoApi = {
  /** Lahore areas & societies matching what's typed — our own list, so it's fine on every keystroke. */
  places: (q: string) => get<PlaceHit[]>(`/api/geo/places?q=${encodeURIComponent(q)}`),
  /** Places for a typed address — call on submit only (no autocomplete on the public Nominatim service). */
  search: (q: string) => get<Address[]>(`/api/geo/search?q=${encodeURIComponent(q)}`),
  /** Readable address at a point — call after the marker stops moving. */
  reverse: (lat: number, lng: number) => get<Address>(`/api/geo/reverse?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`),
};

/** "293B New Chauburji Park, Chauburji" — the short form shown in the top bar. */
export function shortAddress(a: Pick<Address, "house_number" | "street" | "area" | "city" | "address">) {
  const first = [a.house_number, a.street].filter(Boolean).join(" ");
  const parts = [first, a.area].filter(Boolean);
  return parts.length ? parts.join(", ") : a.address.split(",").slice(0, 2).join(",").trim();
}

const reverseCache = new Map<string, Promise<Address | null>>();
/** My current position as a readable address (null while unknown). Cached per ~10 m in the page too. */
export function useCurrentAddress(coords?: { lat: number; lng: number }) {
  const [addr, setAddr] = useState<Address | null>(null);
  const key = coords ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : "";
  useEffect(() => {
    if (!coords) return setAddr(null);
    let alive = true;
    if (!reverseCache.has(key)) reverseCache.set(key, geoApi.reverse(coords.lat, coords.lng).catch(() => null));
    reverseCache.get(key)!.then((a) => alive && setAddr(a));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return addr;
}
