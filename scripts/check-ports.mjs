// Runs before `npm start`. If an earlier `npm start` of this project is still holding a port, it is
// stopped automatically so the new one can start. Another program on a port is never touched —
// then we stop and say how to free it.
import { SERVERS, isOurs, oldRunTree, pidOn, terminate } from "./ports.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = (pid, sig) => {
  try {
    process.kill(Number(pid), sig);
  } catch {
    /* already gone */
  }
};

const old = [];
let blocked = false;
for (const { port, name } of SERVERS) {
  const pid = pidOn(port);
  if (!pid) continue;
  if (isOurs(pid)) old.push({ port, name, pid });
  else {
    blocked = true;
    console.error(`✖ Port ${port} (${name}) is used by another program (PID ${pid}). Stop it with:  kill ${pid}`);
  }
}
if (blocked) {
  console.error("\nThen run `npm start` again.\n");
  process.exit(1);
}

const tree = oldRunTree();
if (old.length || tree.length) {
  console.log(old.length
    ? `↻ Stopping the earlier run still using port${old.length > 1 ? "s" : ""} ${old.map((o) => o.port).join(", ")}…`
    : "↻ Stopping a leftover earlier run…");
  // the old runner and everything under it, plus whatever holds the ports (e.g. a stuck uvicorn worker)
  await terminate([...new Set([...tree, ...old.map((o) => o.pid)])]);
  for (let i = 0; i < 10 && SERVERS.some((x) => pidOn(x.port) && isOurs(pidOn(x.port))); i++) {
    await terminate(SERVERS.map((x) => pidOn(x.port)).filter((p) => p && isOurs(p)), 500);
  }
  const still = SERVERS.filter((x) => pidOn(x.port));
  if (still.length) {
    console.error(`✖ Couldn't free port ${still.map((x) => x.port).join(", ")}. Run  npm run stop  and try again.`);
    process.exit(1);
  }
  console.log("✔ Freed — starting fresh.\n");
}
