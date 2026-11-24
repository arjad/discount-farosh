/**
 * Restaurant accounts: their branches. Each branch has a name, a phone and its exact spot, set on the
 * same map picker as everywhere else (search, "Use my current location", drag the pin to the door).
 */
import { useEffect, useState, type FormEvent } from "react";
import { MapPicker } from "../shared/maps/MapPicker";
import { partnerApi, type Branch, type BranchIn } from "../partner/api";

type Toast = (t: { kind: "ok" | "err"; text: string }) => void;

const PIN = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>;
const SHOP = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M9 20v-6h6v6" /></svg>;
const PHONE = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>;

export function Branches({ toast, onCount }: { toast: Toast; onCount?: (n: number) => void }) {
  const [list, setList] = useState<Branch[] | null>(null);
  const [editing, setEditing] = useState<Branch | "new" | null>(null);

  useEffect(() => {
    partnerApi.branches().then(setList).catch((e) => toast({ kind: "err", text: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (list) onCount?.(list.length);
  }, [list, onCount]);

  const remove = async (b: Branch) => {
    if (!window.confirm(`Delete the ${b.name} branch?`)) return;
    try {
      await partnerApi.deleteBranch(b.id);
      setList((l) => l?.filter((x) => x.id !== b.id) ?? null);
      toast({ kind: "ok", text: "Branch deleted." });
    } catch (e) {
      toast({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className="pf-card">
      <h2>
        Branches <small>{list?.length ?? 0}</small>
        {editing === null && list && list.length > 0 && (
          <button className="pf-btn small pf-h2-btn" onClick={() => setEditing("new")}>+ Add branch</button>
        )}
      </h2>
      <p className="muted small pf-note">Set each branch's exact spot on the map, so customers see how far it is and can get directions.</p>

      {list === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {list.length === 0 && editing === null && (
            <div className="pf-empty">
              {SHOP}
              <p>No branches yet. Add your restaurant's location — and every other branch you have.</p>
              <button className="pf-btn" onClick={() => setEditing("new")}>+ Add your first branch</button>
            </div>
          )}

          {list.length > 0 && (
            <ul className="pf-branches">
              {list.map((b, i) =>
                editing !== "new" && editing?.id === b.id ? (
                  <li key={b.id} className="editing">
                    <BranchForm
                      start={b}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        const nb = await partnerApi.editBranch(b.id, body);
                        setList((l) => l?.map((x) => (x.id === b.id ? nb : x)) ?? null);
                        setEditing(null);
                        toast({ kind: "ok", text: "Branch saved." });
                      }}
                      toast={toast}
                    />
                  </li>
                ) : (
                  <li key={b.id}>
                    <span className="pf-place-icon">{SHOP}</span>
                    <div className="pf-place-body">
                      <b>{b.name}{i === 0 && <span className="pf-main-tag">Main</span>}</b>
                      <span className="muted">{b.address}</span>
                      <span className="pf-branch-meta muted small">
                        <a href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`} target="_blank" rel="noreferrer">{PIN} {b.lat.toFixed(5)}, {b.lng.toFixed(5)}</a>
                        {b.phone && <span>{PHONE} {b.phone}</span>}
                      </span>
                    </div>
                    <div className="pf-place-btns">
                      <button className="pf-btn small ghost" onClick={() => setEditing(b)}>Edit</button>
                      <button className="pf-icon-btn" aria-label={`Delete ${b.name}`} title="Delete" onClick={() => remove(b)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}

          {editing === "new" && (
            <div className="pf-branch-new">
              <BranchForm
                first={list.length === 0}
                onCancel={() => setEditing(null)}
                onSave={async (body) => {
                  const nb = await partnerApi.addBranch(body);
                  setList((l) => [...(l ?? []), nb]);
                  setEditing(null);
                  toast({ kind: "ok", text: "Branch added." });
                }}
                toast={toast}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BranchForm({ start, first, onSave, onCancel, toast }: {
  start?: Branch; first?: boolean; onSave: (b: BranchIn) => Promise<void>; onCancel: () => void; toast: Toast;
}) {
  const [name, setName] = useState(start?.name ?? (first ? "Main branch" : ""));
  const [phone, setPhone] = useState(start?.phone ?? "");
  const [address, setAddress] = useState(start?.address ?? "");
  const [coords, setCoords] = useState(start ? { lat: start.lat, lng: start.lng } : null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const ok = name.trim().length >= 2 && address.trim().length >= 3 && coords;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), address: address.trim(), lat: coords.lat, lng: coords.lng, phone: phone.trim() || null });
    } catch (err) {
      toast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  };

  return (
    <form className="pf-form pf-branch-form" onSubmit={submit}>
      <div className="pf-row">
        <label className="pf-field"><span>Branch name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gulberg, DHA Phase 5" required minLength={2} maxLength={150} autoFocus />
        </label>
        <label className="pf-field"><span>Branch phone <small>(optional)</small></span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="042 xxxxxxx" maxLength={30} />
        </label>
      </div>

      <div className="pf-field">
        <span>Exact location</span>
        {coords ? (
          <div className="pf-loc-set">
            {PIN}
            <span>Pinned at {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
            <button type="button" className="pf-btn small ghost" onClick={() => setPicking(true)}>Move pin</button>
          </div>
        ) : (
          <button type="button" className="pf-btn outline pf-loc-btn" onClick={() => setPicking(true)}>{PIN} Set the location on the map</button>
        )}
      </div>

      {coords && (
        <label className="pf-field"><span>Address customers will see</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop no., street, area" required minLength={3} maxLength={400} />
        </label>
      )}

      <div className="pf-form-foot pf-gap">
        <button type="button" className="pf-btn ghost" onClick={onCancel}>Cancel</button>
        <button className="pf-btn" disabled={!ok || busy}>{busy ? "Saving…" : start ? "Save branch" : "Add branch"}</button>
      </div>

      {picking && (
        <MapPicker
          start={coords ?? undefined}
          loggedIn={false}
          onClose={() => setPicking(false)}
          onConfirm={(p) => {
            setCoords(p.coords);
            setAddress(p.full || p.label);
            setPicking(false);
          }}
        />
      )}
    </form>
  );
}
