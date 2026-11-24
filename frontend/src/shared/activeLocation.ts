/** The location picked in the top bar — remembered in this browser and shared by every page. */
import type { ActiveLoc } from "../dashboard/AddressPicker";

export const ACTIVE_KEY = "df:active-location";

export function readActive(): ActiveLoc {
  try {
    const a = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? "null");
    if (a && ["home", "work", "search"].includes(a.source) && typeof a.coords?.lat === "number" && typeof a.label === "string") return a;
  } catch {
    /* ignore */
  }
  return { source: "current" };
}

export function saveActive(a: ActiveLoc) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
  } catch {
    /* storage unavailable */
  }
}

/** Text for the top bar: the picked address, or my current address, or a prompt to set one. */
export function activeLabel(a: ActiveLoc, current: string | null, status: string) {
  if (a.source !== "current") return `${a.source === "home" ? "Home · " : a.source === "work" ? "Office · " : ""}${a.label}`;
  if (current) return current;
  return status === "asking" || status === "idle" ? "Locating…" : "Set your exact address";
}
