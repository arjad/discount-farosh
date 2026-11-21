import { useCallback, useEffect, useState } from "react";
import type { DashBranch, DashOffer } from "../dashboard/api";


export type Coords = { lat: number; lng: number };
export type LocState = { status: "idle" | "asking" | "ok" | "denied" | "unsupported"; coords?: Coords };

export function distanceKm(a: Coords, lat: number, lng: number) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat - a.lat);
  const dLng = rad(lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The offer's branch closest to the user (or the first branch when we don't know where the user is). */
export function nearestBranch(o: DashOffer, me?: Coords): { branch?: DashBranch; km: number | null } {
  if (!me) return { branch: o.branches[0], km: null };
  let best: { branch?: DashBranch; km: number | null } = { branch: o.branches[0], km: null };
  for (const b of o.branches) {
    if (b.latitude == null || b.longitude == null) continue;
    const km = distanceKm(me, b.latitude, b.longitude);
    if (best.km == null || km < best.km) best = { branch: b, km };
  }
  return best;
}

export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

const NOT_A_PLACE = /^(near|opp|opposite|behind|adjacent|next to|above|floor|ground|shop|plot|office|suite|unit|food court|street|st\.? ?\d|building|bldg|house|cp\b|cp#|plaza no|\d)/i;
/** "California Pizza - MM Alam Road, Near Hussain Chowk, Block C3, Gulberg III, Lahore - Pakistan" -> "Block C3, Gulberg III" */
export function placeOf(b?: DashBranch) {
  if (!b) return null;
  if (b.area) return b.area;
  const city = (b.city ?? "").toLowerCase();
  const all = (b.address ?? "")
    .split(/[,\n]+/)
    .map((p) => p.replace(/\s*-?\s*pakistan\.?$/i, "").replace(/^.*\s-\s/, "").replace(/\s+/g, " ").trim())
    .filter((p) => p && p.toLowerCase() !== city && p.toLowerCase() !== "pakistan");
  const parts = all.filter((p) => !NOT_A_PLACE.test(p));
  // fall back to the first bit of the address (e.g. "114 G1 Market Near Dr.Hospital Johar Town")
  return parts.length ? parts.slice(-2).join(", ") : all[0] ?? null;
}

export function useMyLocation() {
  const [loc, setLoc] = useState<LocState>({ status: "idle" });
  const ask = useCallback(() => {
    if (!("geolocation" in navigator)) return setLoc({ status: "unsupported" });
    setLoc((l) => ({ ...l, status: "asking" }));
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ status: "ok", coords: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      () => setLoc({ status: "denied" }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  }, []);
  useEffect(() => {
    // ask straight away — the browser shows its "allow location?" prompt
    ask();
  }, [ask]);
  return { loc, ask };
}
