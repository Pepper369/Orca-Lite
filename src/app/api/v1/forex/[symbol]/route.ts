import { badRequest } from "@/lib/envelope";
import { getForexDetail } from "@/lib/services/forex";
import { ensureCryptoForexRealtime } from "@/lib/realtime/crypto-forex-boot";
import { safeApi } from "@/lib/safe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 25;

const ALIASES: Record<string, string> = {
  OILUSD: "OILUSD",
  WTIUSD: "USOIL",
  WTI: "USOIL",
  BRENT: "UKOIL",
  BRENTUSD: "UKOIL",
  GOLD: "XAUUSD",
  XAU: "XAUUSD",
  SILVER: "XAGUSD",
  XAG: "XAGUSD",
  PLATINUM: "XPTUSD",
  PALLADIUM: "XPDUSD",
};

/**
 * GET /api/v1/forex/:symbol
 * EURUSD · XAUUSD · XAGUSD · OILUSD · USOIL · UKOIL · …
 * Returns current + OHLC series + technical + patterns.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  try {
    ensureCryptoForexRealtime();
  } catch {
    /* */
  }

  const { symbol } = await ctx.params;
  const raw = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const clean = ALIASES[raw] ?? raw;

  if (!clean || clean.length < 4 || clean.length > 10) {
    return badRequest("Cặp không hợp lệ — ví dụ EURUSD, XAUUSD, OILUSD");
  }

  return safeApi({
    label: `forex-detail:${clean}`,
    guard: { wallMs: 18_000, maxSubrequests: 22, maxConcurrent: 3 },
    produce: async () => {
      const r = await getForexDetail(clean);
      if (!r) return null;
      return {
        data: r.detail,
        meta: r.meta,
        headers: {
          "Cache-Control": r.meta.stale
            ? "private, max-age=8, stale-while-revalidate=60"
            : "private, max-age=15, stale-while-revalidate=45",
        },
      };
    },
    fallback: async () => {
      let current: any = null;
      try {
        const { getBiquoteLiveTick } = await import("@/lib/realtime/biquote-poll");
        const tick = getBiquoteLiveTick(clean, 60_000);
        if (tick && tick.price > 0) {
          current = {
            pair: clean,
            base: clean.slice(0, 3),
            quote: clean.slice(3) || "USD",
            price: tick.price,
            change: null,
            changePercent: null,
            high: tick.high ?? null,
            low: tick.low ?? null,
            updatedAt: new Date(tick.ts).toISOString(),
          };
        }
      } catch {
        /* */
      }
      return {
        data: {
          pair: clean,
          base: clean.slice(0, 3),
          quote: clean.slice(3) || "USD",
          current,
          series: [],
          technical: null,
          patterns: [],
          referenceNote: current ? "Khôi phục tỷ giá qua bộ đệm Biquote" : "Đang kết nối lại nguồn FX/metals",
        },
        meta: {
          source: current ? "biquote-fallback" : "forex-shell",
          partial: true,
          stale: true,
          note: `${clean} đang phục hồi`,
        },
      };
    },
    unavailableSource: "forex",
    unavailableNote: `Không lấy được ${clean}`,
  });
}
