/**
 * The address in the middle of the top bar. Clicking it opens the map (shared/maps/MapPicker) straight
 * away — search, move the pin to your door, check house no. / street / area, confirm — like Foodpanda.
 */
import { useState } from "react";
import type { Coords, LocState } from "../shared/geo";
import type { PlaceDetails } from "../shared/maps/api";
import { MapPicker } from "../shared/maps/MapPicker";
import "./addressPicker.css";
import type { Place } from "../profile/api";

/** Where distances are measured from. */
export type ActiveLoc =
  | { source: "current" }
  | { source: "home" | "work" | "search"; label: string; coords: Coords; full?: string; accuracy?: number | null };

const ICON = {
  pin: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  chev: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>,
};

export function AddressPicker({
  active,
  label,
  onPick,
  loc,
  askLocation,
  home,
  work,
  loggedIn,
  onSave,
}: {
  active: ActiveLoc;
  label: string;
  onPick: (a: ActiveLoc) => void;
  loc: LocState;
  currentLabel?: string | null;
  askLocation: () => void;
  home?: Place | null;
  work?: Place | null;
  loggedIn: boolean;
  onSave: (kind: "home" | "work", p: PlaceDetails) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ap">
      <button className="ap-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" title={label}>
        {ICON.pin}
        <span className="ap-label">{label}</span>
        {ICON.chev}
      </button>

      {open && (
        <MapPicker
          start={active.source !== "current" ? active.coords : loc.coords}
          gps={loc.coords}
          askGps={askLocation}
          home={home}
          work={work}
          loggedIn={loggedIn}
          onClose={() => setOpen(false)}
          onConfirm={async (p) => {
            setOpen(false);
            // address, lat/lng and accuracy are kept in the app's location state (and in localStorage)
            onPick({ source: p.saveAs ?? "search", label: p.label, coords: p.coords, full: p.full, accuracy: p.accuracy });
            if (p.saveAs) {
              await onSave(p.saveAs, {
                place_id: "manual", name: null, address: p.full, short_address: p.label, lat: p.coords.lat, lng: p.coords.lng,
              });
            }
          }}
        />
      )}
    </div>
  );
}
