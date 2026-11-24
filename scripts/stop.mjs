// `npm run stop` — stops this project's dev servers (API, customer site, admin), including a run that
// was paused with Ctrl+Z. Leaves other programs alone.
import { SERVERS, isOurs, oldRunTree, pidOn, terminate } from "./ports.mjs";

const tree = oldRunTree();
const onPorts = SERVERS.map((s) => ({ ...s, pid: pidOn(s.port) })).filter((s) => s.pid);
for (const s of onPorts.filter((s) => !isOurs(s.pid))) console.log(`– Port ${s.port} is used by another program (PID ${s.pid}) — not touching it.`);
const ours = onPorts.filter((s) => isOurs(s.pid));
await terminate([...new Set([...tree, ...ours.map((s) => s.pid)])]);
for (const s of ours) console.log(`✔ Stopped ${s.name} (port ${s.port})`);
console.log(ours.length || tree.length ? "All stopped." : "Nothing was running.");
