/** Opening hours like {"Monday": "12:30PM-11:00PM", "Friday": "12:30PM-1:00AM", "Sunday": "Closed"}.
 *  Times are Pakistan time, whatever the viewer's own time zone is. */
export type Hours = Record<string, string>;

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TZ = "Asia/Karachi";

/** Day index (0 = Monday) and minutes since midnight, in Pakistan. */
function pkNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: WEEK.indexOf(get("weekday")), min: Number(get("hour")) * 60 + Number(get("minute")) };
}

function toMin(h: string, m: string | undefined, ap: string | undefined) {
  let hour = Number(h) % 24;
  const a = ap?.toUpperCase();
  if (a === "PM" && hour < 12) hour += 12;
  if (a === "AM" && hour === 12) hour = 0;
  return hour * 60 + Number(m ?? 0);
}

/** "12:30PM-11:00PM, 1:00AM-2:00AM" -> [[750, 1380], ...]; overnight ranges end after 1440. null = unknown. */
function ranges(text: string | undefined): [number, number][] | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (/closed|off/.test(t)) return [];
  if (/24\s*h|24\/7|all day|open 24/.test(t)) return [[0, 1440]];
  const out: [number, number][] = [];
  const re = /(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?/gi;
  for (const m of text.matchAll(re)) {
    const start = toMin(m[1], m[2], m[3] ?? m[6]);
    let end = toMin(m[4], m[5], m[6]);
    if (end <= start) end += 1440; // closes after midnight
    out.push([start, end]);
  }
  return out.length ? out : null;
}

const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export type OpenStatus = { open: boolean | null; text: string };

/** Is it open right now? `open: null` when we don't know the hours. */
export function openStatus(hours: Hours | null | undefined, now = new Date()): OpenStatus {
  if (!hours || !Object.keys(hours).length) return { open: null, text: "" };
  const { day, min } = pkNow(now);
  const dayRanges = (d: number) => ranges(hours[WEEK[(d + 7) % 7]]);

  const today = dayRanges(day) ?? [];
  const yesterday = dayRanges(day - 1) ?? [];
  const current =
    today.find(([s, e]) => min >= s && min < e) ??
    yesterday.filter(([, e]) => e > 1440).map(([s, e]) => [s - 1440, e - 1440] as [number, number]).find(([s, e]) => min >= s && min < e);
  if (current) return { open: true, text: current[1] - current[0] >= 1440 ? "Open 24 hours" : `Open · closes ${fmt(current[1])}` };

  if (dayRanges(day) === null && dayRanges(day - 1) === null) return { open: null, text: "" };
  const later = today.filter(([s]) => s > min).sort((a, b) => a[0] - b[0])[0];
  if (later) return { open: false, text: `Closed · opens ${fmt(later[0])}` };
  for (let i = 1; i <= 7; i++) {
    const next = (dayRanges(day + i) ?? []).sort((a, b) => a[0] - b[0])[0];
    if (next) return { open: false, text: `Closed · opens ${i === 1 ? "tomorrow" : WEEK[(day + i) % 7].slice(0, 3)} ${fmt(next[0])}` };
  }
  return { open: false, text: "Closed" };
}

/** Week as rows for display, Monday first, with today marked. */
export function weekRows(hours: Hours, now = new Date()) {
  const { day } = pkNow(now);
  return WEEK.map((d, i) => ({ day: d, text: hours[d] ?? "—", today: i === day }));
}
