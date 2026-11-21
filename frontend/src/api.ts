export type Offer = {
  source: string;
  title: string;
  description?: string | null;
  url?: string | null;
  image_url?: string | null;
  valid_till?: string | null;
};

export type ScrapeError = {
  kind: string;
  message: string;
  tag_name?: string | null;
  selector?: string | null;
  action?: string | null;
  page_url?: string | null;
  screenshot?: string | null;
};

export type ScrapeResult = {
  source: string;
  category: string;
  status: "success" | "failed";
  offers: Offer[];
  error?: ScrapeError | null;
  started_at: string;
  finished_at: string;
};

export type Source = { slug: string; name: string; category: string; base_url: string };

const API_KEY = import.meta.env.VITE_ISOLATED_API_KEY ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()) || res.statusText}`);
  return res.json();
}

export const api = {
  banks: () => request<Source[]>("/api/public/banks"),
  results: () => request<ScrapeResult[]>("/api/public/results"),
  scrapeBank: (slug: string) =>
    request<ScrapeResult>(`/api/isolated/scrape/banks/${slug}`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
    }),
};

export type WaitlistInput = {
  email: string;
  full_name?: string;
  phone?: string;
  city?: string;
  banks: string[];
  source?: string;
};

export const joinWaitlist = (body: WaitlistInput) =>
  request<{ ok: boolean; already_joined: boolean }>("/api/public/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
