import { env } from "../env";
import { ssiFcConfigured } from "../providers/ssi-fcdata";

export function vnProviderLayout() {
  const ssiLive = ssiFcConfigured();
  return {
    market: { primary: "vndirect", fallback: ssiLive ? "ssi-fcdata" : "vndirect" },
    financial: {
      primary: "vndirect",
      fallback: env.vnstockApiKey && env.vnstockBaseUrl ? "vnstock-financial" : "vndirect",
    },
  } as const;
}

