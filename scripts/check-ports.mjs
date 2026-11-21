// Runs before `npm start`: fails fast with a clear message if a port is already taken.
import { createServer } from "node:net";
import { execSync } from "node:child_process";

const PORTS = { 8000: "backend (uvicorn)", 5173: "frontend (vite)" };

const isFree = (port) =>
  new Promise((resolve) => {
    const srv = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => srv.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });

const owner = (port) => {
  try {
    return execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    return null;
  }
};

let busy = false;
for (const [port, what] of Object.entries(PORTS)) {
  if (await isFree(Number(port))) continue;
  busy = true;
  const pid = owner(port);
  console.error(`\n✖ Port ${port} for the ${what} is already in use${pid ? ` by PID ${pid}` : ""}.`);
  console.error(pid ? `  Stop it with:  kill ${pid}` : `  Find it with:  lsof -i :${port}`);
}
if (busy) {
  console.error("\nThen run `npm start` again.\n");
  process.exit(1);
}
