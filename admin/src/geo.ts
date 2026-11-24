/** Distances for the Offers tab. */
export type Coords = { lat: number; lng: number };

/** Where to measure from. Area points are approximate centres of each Lahore area. */
export const ORIGINS: { id: string; label: string; at?: Coords }[] = [
  { id: "me", label: "My location" },
  { id: "centre", label: "Lahore centre (Mall Road)", at: { lat: 31.5546, lng: 74.3293 } },
  { id: "gulberg", label: "Gulberg", at: { lat: 31.5161, lng: 74.3434 } },
  { id: "dha", label: "DHA Phase 5", at: { lat: 31.4627, lng: 74.4083 } },
  { id: "johar", label: "Johar Town", at: { lat: 31.4697, lng: 74.2728 } },
  { id: "model", label: "Model Town", at: { lat: 31.4834, lng: 74.3255 } },
  { id: "bahria", label: "Bahria Town", at: { lat: 31.3676, lng: 74.1836 } },
];

export function km(a: Coords, lat: number, lng: number) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat - a.lat), dLng = rad(lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (k: number) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k < 10 ? k.toFixed(1) : Math.round(k)} km`);
