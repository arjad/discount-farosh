/**
 * Count a view when a customer opens an offer — from a shared link, or in the dashboard's sidebar.
 * The server ignores repeats from the same viewer within 30 minutes; this also skips repeats in the
 * same tab, so re-renders and back/forward don't send anything.
 */
const VIEWER_KEY = "df:viewer";
const sent = new Set<string>();

function viewerId(): string | undefined {
  try {
    let v = localStorage.getItem(VIEWER_KEY);
    if (!v) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(VIEWER_KEY, v);
    }
    return v;
  } catch {
    return undefined; // storage blocked — the server falls back to the network address
  }
}

/** Links opened from the admin app end in #preview — the admin looking isn't a customer view. */
function isPreview() {
  try {
    if (window.location.hash === "#preview") sessionStorage.setItem("df:preview", "1");
    return sessionStorage.getItem("df:preview") === "1";
  } catch {
    return window.location.hash === "#preview";
  }
}

export function recordViews(offerIds: number[], source: "link" | "sidebar") {
  if (isPreview()) return;
  const ids = [...new Set(offerIds)].filter((id) => !sent.has(`${id}`)).slice(0, 30);
  if (!ids.length) return;
  ids.forEach((id) => sent.add(`${id}`));
  fetch("/api/public/offers/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ offer_ids: ids, source, viewer: viewerId() }),
  }).catch(() => {});
}

/** A customer saved / unsaved an offer (♥). Kept in the browser too; this lets restaurants see the count. */
export function saveFavourite(offerId: number, on: boolean) {
  fetch(`/api/public/offers/${offerId}/favourite`, {
    method: on ? "PUT" : "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ viewer: viewerId() }),
  }).catch(() => {});
}
