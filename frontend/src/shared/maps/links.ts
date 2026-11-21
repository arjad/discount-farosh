/** Links that open Google Maps (no API key needed). */
import type { DashBranch } from "../../dashboard/api";

/** Open a place on Google Maps (by name + address, so the right business shows). */
export function mapsPlaceUrl(name: string, b?: Pick<DashBranch, "address" | "city">) {
  const q = [name, b?.address || b?.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Directions to a branch (exact pin when we have coordinates). */
export function mapsDirectionsUrl(b: Pick<DashBranch, "latitude" | "longitude" | "address" | "city">, name: string) {
  const dest = b.latitude != null && b.longitude != null ? `${b.latitude},${b.longitude}` : `${name}, ${b.address ?? b.city ?? ""}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
