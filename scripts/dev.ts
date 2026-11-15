import { spawn } from "node:child_process";

const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;

console.log(bold(green("\n============================================================")));
console.log(bold(green("  ORCA FINANCIAL — ULTRA-LOW LATENCY FULLSTACK TERMINAL")));
console.log(bold(green("============================================================")));
console.log(`  ${cyan("⚡ Backend:")} Hono High-Performance Engine -> http://localhost:8000`);
console.log(`  ${magenta("⚡ Frontend:")} Vite React 19 Client SPA     -> http://localhost:5173`);
console.log(yellow("  Starting both services in parallel...\n"));

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";

// 1. Launch Hono Server
const honoProcess = spawn(npmCmd, ["run", "server:hono"], {
  stdio: "inherit",
  shell: isWindows,
  env: { ...process.env, PORT: "8000" },
});

// 2. Launch Vite Dev Server
const viteProcess = spawn(npmCmd, ["run", "dev:vite"], {
  stdio: "inherit",
  shell: isWindows,
});

function cleanup() {
  console.log(yellow("\n[ORCA] Gracefully shutting down Hono & Vite..."));
  try {
    if (!honoProcess.killed) honoProcess.kill();
    if (!viteProcess.killed) viteProcess.kill();
  } catch {}
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

honoProcess.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[HONO] Exited with code ${code}`);
  }
});

viteProcess.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[VITE] Exited with code ${code}`);
  }
});
