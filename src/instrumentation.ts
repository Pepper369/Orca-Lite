/**
 * Next.js server instrumentation — runs once at process boot.
 * Maps SSI_API_* aliases (host env vars) so all SSI readers see SSI_FC_* keys.
 */
export async function register() {
  const { ensureSsiEnvAliases } = await import("./lib/providers/ssi-credentials");
  ensureSsiEnvAliases();

  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.CLOUDFLARE_WORKERS !== "1" &&
    process.env.VERCEL !== "1" &&
    process.env.AWS_LAMBDA_FUNCTION_NAME == null
  ) {
    // Only pre-warm in long-running standalone Node server (Cloudflare Workers & Vercel use request-scoped serverless lifecycle)
    import("./lib/realtime/crypto-forex-boot")
      .then((m) => m.ensureCryptoForexRealtime())
      .catch(() => {});
  }
}
