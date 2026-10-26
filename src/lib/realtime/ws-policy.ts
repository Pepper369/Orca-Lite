import "server-only";

/**
 * Realtime WebSocket policy for serverless.
 *
 * Cloudflare Workers invocations cannot keep long-lived WS across requests.
 * Default:
 *  - Cloudflare Workers (CLOUDFLARE_WORKERS=1, set in wrangler.jsonc): WS OFF unless explicitly enabled (*_WS_DISABLED=false)
 *  - Local / long-running Node: WS ON unless explicitly disabled (*_WS_DISABLED=true)
 *
 * forceEnable() on the engine still allows one-shot order-book cron paths.
 */
export type WsDisableEnv = "VNDIRECT_WS_DISABLED" | "SSI_WS_DISABLED" | "BINANCE_WS_DISABLED";

export function isRealtimeWsDisabled(envKey: WsDisableEnv): boolean {
  const raw = process.env[envKey]?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  // Unset → disable on serverless runtimes (Vercel, Cloudflare Workers, Lambda)
  return isServerlessRuntime();
}

/** True when running inside Vercel, Cloudflare Workers, AWS Lambda (or similar) serverless. */
export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.CLOUDFLARE_WORKERS === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME != null ||
    process.env.NEXT_RUNTIME === "edge"
  );
}
