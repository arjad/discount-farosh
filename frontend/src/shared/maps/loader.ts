/** Loads the Google Maps JavaScript API once (needs the browser key from /api/places/config). */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    __dfMapsReady?: () => void;
  }
}

let loading: Promise<any> | null = null;

export function loadGoogleMaps(browserKey: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    window.__dfMapsReady = () => resolve(window.google.maps);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(browserKey)}&v=weekly&callback=__dfMapsReady`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load Google Maps."));
    };
    document.head.appendChild(s);
  });
  return loading;
}
