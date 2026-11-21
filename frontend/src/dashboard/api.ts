export type DashCard = {
  name: string;
  tier?: string | null;
  card_type?: string | null;
  network?: string | null;
  discount_percent?: number | null;
  max_discount_amount?: number | null;
};

export type DashBranch = {
  id: number;
  address?: string | null;
  area?: string | null;
  city?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** weekly opening hours, e.g. {"Monday": "12:30PM-11:00PM"} (Pakistan time) */
  hours?: Record<string, string> | null;
};

export type DashOffer = {
  id: number;
  title: string;
  description?: string | null;
  terms?: string | null;
  category?: string | null;
  discount_percent?: number | null;
  max_discount_amount?: number | null;
  currency: string;
  valid_days?: string[] | null;
  valid_from?: string | null;
  valid_till?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  last_seen_at: string;
  bank: { slug: string; name: string };
  business?: {
    name: string;
    category?: string | null;
    logo_url?: string | null;
    website?: string | null;
    /** 0–5 rating from the bank's deals site */
    rating?: number | null;
    rating_count?: number | null;
    menu_images?: string[];
    /** food tags, e.g. ["Cafe", "Coffee", "Italian"] — a restaurant can have several */
    tags?: string[];
  } | null;
  branches: DashBranch[];
  cards: DashCard[];
};

export type DashboardData = { total: number; last_synced_at: string | null; offers: DashOffer[] };

export type JobScraper = {
  type: string;
  slug: string;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  offers: number;
  saved: number;
  error?: string | null;
  duration_s?: number | null;
};

export type ScrapeJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  created_at: string;
  finished_at?: string | null;
  scrapers: JobScraper[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()) || res.statusText}`);
  return res.json();
}

export const dashApi = {
  offers: () => request<DashboardData>("/api/public/dashboard/offers"),
  startSync: () => request<ScrapeJob>("/api/public/scrape?type=all&save=true", { method: "POST" }),
  job: (id: string) => request<ScrapeJob>(`/api/public/scrape/jobs/${id}`),
  jobs: () => request<ScrapeJob[]>("/api/public/scrape/jobs"),
};
