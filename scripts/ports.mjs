// The three dev servers `npm start` runs — one list shared by the start / stop / welcome scripts.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SERVERS = [
  { port: 8000, name: "API (FastAPI)", url: "http://localhost:8000/docs" },
  { port: 5173, name: "Customer site", url: "http://localhost:5173" },
  { port: 5174, name: "Admin", url: "http://localhost:5174" },
];

/** PID listening on a port (or null). */
export function pidOn(port) {
  try {
    return execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8" }).trim().split("\n")[0] || null;
  } catch {
    return null;
  }
}

/** Full command line of a PID ("" if gone). */
export function commandOf(pid) {
  try {
    return execSync(`ps -o command= -p ${pid}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Working folder of a PID ("" if unknown). */
export function cwdOf(pid) {
  try {
    const out = execSync(`lsof -a -p ${pid} -d cwd -Fn`, { encoding: "utf8" });
    return (out.split("\n").find((l) => l.startsWith("n")) ?? "").slice(1);
  } catch {
    return "";
  }
}

/** Is this PID one of this project's own dev servers (safe to stop)? Checks the command line and the
 *  working folder — uvicorn's reload worker ("multiprocessing.spawn …") only shows up by its folder. */
export const isOurs = (pid) => {
  const cmd = commandOf(pid);
  const cwd = cwdOf(pid);
  return cmd.includes(ROOT) || /uvicorn app\.main:app/.test(cmd) || cwd === ROOT || cwd.startsWith(ROOT + "/");
};

/** Leftover `concurrently` runners from an earlier `npm start` of this project. */
export function oldRunners() {
  try {
    return execSync("ps -axo pid=,command=", { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
      .filter((m) => m && m[2].includes(`${ROOT}/node_modules/.bin/concurrently`) && Number(m[1]) !== process.pid)
      .map((m) => m[1]);
  } catch {
    return [];
  }
}

/** Stop a process for good: SIGTERM + SIGCONT (a run paused with Ctrl+Z ignores signals until resumed),
 *  then SIGKILL if it's still there after `graceMs`. */
export async function terminate(pids, graceMs = 2000) {
  const send = (pid, sig) => {
    try {
      process.kill(Number(pid), sig);
      return true;
    } catch {
      return false;
    }
  };
  for (const pid of pids) {
    send(pid, "SIGTERM");
    send(pid, "SIGCONT");
  }
  const alive = () => pids.filter((pid) => send(pid, 0));
  for (let t = 0; t < graceMs && alive().length; t += 200) await new Promise((r) => setTimeout(r, 200));
  for (const pid of alive()) send(pid, "SIGKILL");
}

/** Every process of an earlier run: old `concurrently` runners, the shells and `npm start` under/above them. */
export function oldRunTree() {
  try {
    const rows = execSync("ps -axo pid=,ppid=,command=", { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: m[1], ppid: m[2], cmd: m[3] }));
    const roots = new Set(oldRunners());
    const out = new Set(roots);
    // children (shells -> uvicorn / vite) of the old runners
    let grew = true;
    while (grew) {
      grew = false;
      for (const r of rows) if (out.has(r.ppid) && !out.has(r.pid)) { out.add(r.pid); grew = true; }
    }
    // the `npm start` that launched an old runner
    for (const r of rows) if (roots.has(r.pid)) {
      const parent = rows.find((x) => x.pid === r.ppid);
      if (parent && /\bnpm( run)? start\b/.test(parent.cmd) && Number(parent.pid) !== process.ppid) out.add(parent.pid);
    }
    out.delete(String(process.pid));
    out.delete(String(process.ppid));
    return [...out];
  } catch {
    return [];
  }
}
