import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Context } from "hono";

let llamaProc: ChildProcess | null = null;
const GGUF_PORT = Number(process.env.INTERNAL_GGUF_PORT || 8080);
const GGUF_BASE_URL = `http://127.0.0.1:${GGUF_PORT}`;

export function getInternalGgufUrl(): string {
  return GGUF_BASE_URL;
}

/**
 * Checks if llama-server is healthy on loopback.
 */
export async function isLlamaServerHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${GGUF_BASE_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Automatically boots llama-server in the background if not already running.
 */
export async function ensureLlamaServerRunning(): Promise<boolean> {
  if (await isLlamaServerHealthy()) {
    console.log(`[AI-Runtime] ✅ C++ llama-server already active on internal loopback ${GGUF_BASE_URL}`);
    return true;
  }

  const repoRoot = process.cwd();
  const modelsDir = path.join(repoRoot, "models");
  const preferredModel = path.join(modelsDir, "orca-financial-qwen2.5-3b-q4_k_m.gguf");
  const fallbackModel = path.join(modelsDir, "orca-fa-qwen2.5-3b-q4_k_m.gguf");
  const modelPath = fs.existsSync(preferredModel) ? preferredModel : (fs.existsSync(fallbackModel) ? fallbackModel : null);

  if (!modelPath) {
    console.warn(`[AI-Runtime] ⚠️ No local GGUF model found in ${modelsDir}. AI will fallback to remote cloud LLM.`);
    return false;
  }

  const modelAlias = modelPath.includes("orca-financial") ? "orca-financial-qwen2.5-3b" : "orca-fa-qwen2.5-3b";
  const exePath = path.join(modelsDir, "bin", "llama-server.exe");

  if (!fs.existsSync(exePath)) {
    console.warn(`[AI-Runtime] ⚠️ llama-server.exe not found at ${exePath}.`);
    return false;
  }

  console.log(`[AI-Runtime] 🚀 Auto-booting background C++ Engine...`);
  console.log(`  Model : ${path.basename(modelPath)}`);
  console.log(`  Alias : ${modelAlias}`);
  console.log(`  Target: ${GGUF_BASE_URL}`);

  try {
    llamaProc = spawn(
      exePath,
      [
        "-m", modelPath,
        "--alias", modelAlias,
        "--host", "127.0.0.1",
        "--port", String(GGUF_PORT),
        "-c", "2048",
        "-t", "4",
        "-lm", "auto",
      ],
      {
        stdio: "ignore",
        windowsHide: true,
      }
    );

    llamaProc.on("error", (err) => {
      console.error("[AI-Runtime] llama-server spawn error:", err.message);
    });

    llamaProc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[AI-Runtime] llama-server exited with code ${code}`);
      }
      llamaProc = null;
    });

    // Wait up to 10 seconds for server to be healthy
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isLlamaServerHealthy()) {
        console.log(`[AI-Runtime] ⚡ C++ Inference Engine connected & ready on single gateway!`);
        return true;
      }
    }
  } catch (err) {
    console.error("[AI-Runtime] Failed to auto-launch llama-server:", err);
  }

  return false;
}

/**
 * Proxy handler to forward OpenAI /v1 requests from Port 3000 directly to the internal llama-server.
 */
export async function proxyToLlamaServer(c: Context) {
  const targetPath = c.req.path; // e.g. /v1/chat/completions or /v1/models
  const targetUrl = `${GGUF_BASE_URL}${targetPath}`;

  try {
    const isStream = c.req.method === "POST" && (c.req.header("accept") || "").includes("text/event-stream");
    const body = c.req.method === "POST" || c.req.method === "PUT" ? await c.req.raw.arrayBuffer() : undefined;

    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers: {
        "Content-Type": c.req.header("content-type") || "application/json",
        "Accept": c.req.header("accept") || "*/*",
      },
      body,
      signal: c.req.raw.signal,
    });

    if (isStream && res.body) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const data = await res.arrayBuffer();
    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return c.json(
      {
        error: {
          message: `Local AI Server unreachable on loopback: ${err.message}`,
          type: "local_runtime_error",
        },
      },
      503
    );
  }
}

/**
 * Cleanup function to terminate llama-server when Node stops.
 */
export function cleanupAiRuntime() {
  if (llamaProc) {
    try {
      console.log("[AI-Runtime] Stopping background llama-server...");
      llamaProc.kill();
    } catch {
      // Ignored
    }
    llamaProc = null;
  }
}

process.on("exit", cleanupAiRuntime);
process.on("SIGINT", cleanupAiRuntime);
process.on("SIGTERM", cleanupAiRuntime);
