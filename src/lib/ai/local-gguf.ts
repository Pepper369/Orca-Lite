import "server-only";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env";

export const DEFAULT_LOCAL_GGUF_FILENAME = "orca-financial-qwen2.5-3b-q4_k_m.gguf";
export const FALLBACK_LOCAL_GGUF_FILENAME = "orca-fa-qwen2.5-3b-q4_k_m.gguf";
export const DEFAULT_LOCAL_GGUF_PATH = `models/${DEFAULT_LOCAL_GGUF_FILENAME}`;
export const DEFAULT_LOCAL_GGUF_MODEL = "orca-financial-qwen2.5-3b";

export interface LocalGgufArtifactStatus {
  exists: boolean;
  path: string;
  sizeBytes: number;
  sizeMb: number;
  validMagic: boolean;
  ggufVersion: number | null;
}

export interface LocalGgufEndpointConfig {
  enabled: boolean;
  baseUrl: string | null;
  model: string;
  apiKey: string;
  priority: "primary" | "fallback";
  artifact: LocalGgufArtifactStatus;
}

/**
 * Inspects a local GGUF file on disk and verifies its 4-byte "GGUF" magic header & format version.
 */
export function inspectLocalGgufArtifact(filePath?: string): LocalGgufArtifactStatus {
  let configured = filePath?.trim() || process.env.LOCAL_GGUF_PATH?.trim() || env.localGgufPath;
  if (!configured) {
    const preferred = path.resolve(process.cwd(), DEFAULT_LOCAL_GGUF_PATH);
    const fallback = path.resolve(process.cwd(), `models/${FALLBACK_LOCAL_GGUF_FILENAME}`);
    configured = fs.existsSync(preferred) ? preferred : (fs.existsSync(fallback) ? fallback : preferred);
  }
  const resolved = path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);

  if (!fs.existsSync(resolved)) {
    return {
      exists: false,
      path: resolved,
      sizeBytes: 0,
      sizeMb: 0,
      validMagic: false,
      ggufVersion: null,
    };
  }

  const stat = fs.statSync(resolved);
  let validMagic = false;
  let ggufVersion: number | null = null;

  if (stat.isFile() && stat.size >= 8) {
    const fd = fs.openSync(resolved, "r");
    try {
      const header = Buffer.alloc(8);
      const bytesRead = fs.readSync(fd, header, 0, 8, 0);
      if (bytesRead >= 8 && header.subarray(0, 4).toString("ascii") === "GGUF") {
        validMagic = true;
        ggufVersion = header.readUInt32LE(4);
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  return {
    exists: stat.isFile(),
    path: resolved,
    sizeBytes: stat.size,
    sizeMb: Math.round((stat.size / (1024 * 1024)) * 10) / 10,
    validMagic,
    ggufVersion,
  };
}

/**
 * Returns true if the given model ID targets the fine-tuned Orca local GGUF runtime.
 */
export function isLocalGgufModelId(model: string, configuredModel?: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return false;
  if (
    m === "local-gguf" ||
    m === "orca-fa-local" ||
    m === "orca-financial-local" ||
    m.startsWith("orca-fa-") ||
    m.startsWith("orca-financial-")
  )
    return true;
  if (configuredModel && m === configuredModel.trim().toLowerCase()) return true;
  return false;
}

/**
 * Resolves the local GGUF OpenAI-compatible inference endpoint (llama-server / Ollama) and model artifact status.
 */
export function resolveLocalGgufConfig(artifactPath?: string): LocalGgufEndpointConfig {
  const rawBaseUrl = (process.env.LOCAL_GGUF_BASE_URL ?? env.localGgufBaseUrl)?.trim();
  const model = (process.env.LOCAL_GGUF_MODEL ?? env.localGgufModel ?? DEFAULT_LOCAL_GGUF_MODEL).trim();
  const apiKey = (process.env.LOCAL_GGUF_API_KEY ?? env.localGgufApiKey ?? "local-gguf").trim();
  const rawPriority = (process.env.LOCAL_GGUF_PRIORITY ?? env.localGgufPriority ?? "fallback").trim().toLowerCase();
  const priority: "primary" | "fallback" = rawPriority === "primary" ? "primary" : "fallback";

  return {
    enabled: Boolean(rawBaseUrl),
    baseUrl: rawBaseUrl ? rawBaseUrl.replace(/\/$/, "") : null,
    model,
    apiKey,
    priority,
    artifact: inspectLocalGgufArtifact(artifactPath),
  };
}

let lastHeartbeatTime = 0;
let lastHeartbeatStatus = false;
const HEARTBEAT_TTL_MS = 10_000;

/**
 * Fast non-blocking heartbeat check (500ms timeout) to verify whether llama-server is currently responsive.
 * Caches positive/negative ping results for 10s to minimize socket churn.
 */
export async function checkLocalGgufHeartbeat(timeoutMs = 600): Promise<boolean> {
  const cfg = resolveLocalGgufConfig();
  if (!cfg.enabled || !cfg.baseUrl) return false;

  const now = Date.now();
  if (now - lastHeartbeatTime < HEARTBEAT_TTL_MS) {
    return lastHeartbeatStatus;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${cfg.baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    }).catch(() =>
      fetch(`${cfg.baseUrl}/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: controller.signal,
      })
    );
    clearTimeout(timer);

    lastHeartbeatStatus = Boolean(res && (res.ok || res.status === 200 || res.status === 401));
    lastHeartbeatTime = now;
    return lastHeartbeatStatus;
  } catch {
    lastHeartbeatStatus = false;
    lastHeartbeatTime = now;
    return false;
  }
}


