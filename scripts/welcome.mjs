// Runs alongside the servers in `npm start`: waits until all three answer, prints the local links
// and opens the customer site and the admin in the browser (set NO_OPEN=1 to skip opening).
import { exec } from "node:child_process";
import { SERVERS } from "./ports.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (url) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
};

const started = Date.now();
const pending = new Set(SERVERS.map((s) => s.url));
while (pending.size && Date.now() - started < 90_000) {
  for (const url of [...pending]) if (await up(url)) pending.delete(url);
  if (pending.size) await wait(700);
}

const P = "\x1b[35m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", R = "\x1b[0m";
const line = "─".repeat(52);
console.log(`\n${P}${line}${R}`);
console.log(`  ${B}Welcome to Discount فرویش${R}  ${D}— everything is running locally${R}\n`);
for (const s of SERVERS) {
  const ok = !pending.has(s.url);
  console.log(`  ${ok ? `${Y}●${R}` : "\x1b[31m✖\x1b[0m"} ${s.name.padEnd(15)} ${B}${s.url}${R}${ok ? "" : `  ${D}(not answering yet — see its log above)${R}`}`);
}
console.log(`\n  ${D}Stop everything: Ctrl+C   ·   or from another terminal: npm run stop${R}`);
console.log(`${P}${line}${R}\n`);

if (!process.env.NO_OPEN) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? 'start ""' : "xdg-open";
  for (const s of SERVERS.filter((x) => x.port !== 8000 && !pending.has(x.url))) exec(`${cmd} ${s.url}`);
}
