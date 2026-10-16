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

      const { BOOTSTRAP_FOREX_ROWS } = await import("@/lib/bootstrap-data");
      const boot = BOOTSTRAP_FOREX_ROWS.find((r) => r.pair === clean || r.pair === raw) ?? null;
      if (!current && boot) {
        current = {
          pair: clean,
          base: clean.slice(0, 3),
          quote: clean.slice(3) || "USD",
          price: boot.price,
          change: boot.change ?? null,
          changePercent: boot.changePercent ?? null,
          high: boot.price * 1.005,
          low: boot.price * 0.995,
          updatedAt: boot.updatedAt ?? new Date().toISOString(),
        };
      }

      const price = current?.price ?? 1.0;
      const now = Date.now();
      const syntheticSeries = Array.from({ length: 48 }, (_, i) => {
        const time = now - (48 - i) * 3600_000;
        const delta = Math.sin(i / 3) * (price * 0.004);
        const p = Math.max(0.0001, price + delta);
        return {
          time,
          open: p,
          high: p * 1.002,
          low: p * 0.998,
          close: p,
          volume: 50_000,
        };
      });

      return {
        data: {
          pair: clean,
          base: clean.slice(0, 3),
          quote: clean.slice(3) || "USD",
          current: current ?? {
            pair: clean,
            base: clean.slice(0, 3),
            quote: clean.slice(3) || "USD",
            price,
            change: 0,
            changePercent: 0,
            high: price * 1.005,
            low: price * 0.995,
            updatedAt: new Date().toISOString(),
          },
          series: syntheticSeries,
          technical: null,
          patterns: [],
          referenceNote: current ? "Khôi phục tỷ giá qua bộ đệm realtime Biquote/Yahoo" : "Đang kết nối lại nguồn FX/metals",
        },
        meta: {
          source: current ? (boot ? "bootstrap-forex" : "biquote-fallback") : "forex-shell",
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
