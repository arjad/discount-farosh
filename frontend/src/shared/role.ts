/** The last known account type on this browser — lets /dashboard pick the right page without waiting.
 *  Only a hint: the server is always asked too, and the page switches if the hint was wrong. */
export type AccountKind = "customer" | "restaurant";
const KEY = "df:account-kind";

export function readKind(): AccountKind | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "customer" || v === "restaurant" ? v : null;
  } catch {
    return null;
  }
}
export function saveKind(k: AccountKind) {
  try {
    localStorage.setItem(KEY, k);
  } catch {
    /* storage blocked — fine, we just ask the server each time */
  }
}
