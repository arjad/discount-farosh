export type Place = { label: string | null; lat: number | null; lng: number | null };
export type UserCard = { id: number; bank_slug: string; bank_name: string; card_name: string };
export type Visit = {
  id: number;
  offer_id: number | null;
  place_name: string;
  place_address: string | null;
  image_url: string | null;
  bank_name: string | null;
  discount_percent: number | null;
  visited_at: string;
};
export type Profile = {
  id: number;
  email: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  avatar: string | null;
  home: Place;
  work: Place;
  member_since: string;
  cards: UserCard[];
  visits: Visit[];
};

export class NotLoggedIn extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 401) throw new NotLoggedIn("Not logged in");
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

type PlaceIn = { label?: string | null; lat?: number | null; lng?: number | null } | null;

export const profileApi = {
  get: () => call<Profile>("GET", "/api/profile"),
  update: (patch: Partial<{ full_name: string; phone: string | null; city: string | null; avatar: string | null; home: PlaceIn; work: PlaceIn }>) =>
    call<Profile>("PATCH", "/api/profile", patch),
  addCard: (c: { bank_slug: string; bank_name: string; card_name: string }) => call<Profile>("POST", "/api/profile/cards", c),
  removeCard: (id: number) => call<Profile>("DELETE", `/api/profile/cards/${id}`),
  addVisit: (offer_id: number) => call<Profile>("POST", "/api/profile/visits", { offer_id }),
  removeVisit: (id: number) => call<Profile>("DELETE", `/api/profile/visits/${id}`),
};
