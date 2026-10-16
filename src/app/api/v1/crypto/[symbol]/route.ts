import { badRequest } from "@/lib/envelope";
import { getCryptoDetail } from "@/lib/services/crypto";
import { safeApi } from "@/lib/safe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

const VALID_INTERVALS = new Set(["5m", "15m", "1h", "4h", "1d", "1w"]);

export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const url = new URL(req.url);
  const interval = url.searchParams.get("interval") ?? "1h";
  if (!/^[A-Za-z0-9]{2,20}$/.test(symbol)) return badRequest("Symbol không hợp lệ");
  if (!VALID_INTERVALS.has(interval)) return badRequest("Interval không hợp lệ");

  const sym = symbol.toUpperCase();

  return safeApi({
    label: `crypto-detail:${sym}`,
    guard: { wallMs: 14_000, maxSubrequests: 16, maxConcurrent: 3 },
    produce: async () => {
      const r = await getCryptoDetail(symbol, interval);
      if (!r?.detail) return null;
      const baseAsset = sym.replace(/USDT$/i, "");
      const payload = {
        ...r.detail,
        baseAsset,
        ticker: r.detail.quote,
        klines: r.detail.bars,
      };
      return { data: payload, meta: r.meta };
    },
    fallback: async () => {
      let quote: any = null;
      try {
        const { binanceWs } = await import("@/lib/realtime/binance-ws");
        const live = binanceWs.getTicker(sym, 60_000);
        if (live && live.price > 0) {
          quote = {
            symbol: sym,
            baseAsset: sym.replace(/USDT$/i, ""),
            assetClass: "crypto",
            price: live.price,
            change: null,
            changePercent: null,
            open: null,
            high: null,
            low: null,
            volume: null,
            quoteVolume: null,
            trades24h: null,
            updatedAt: new Date(live.eventTime).toISOString(),
          };
        }
      } catch {
        /* */
      }

      const { BOOTSTRAP_CRYPTO_ROWS } = await import("@/lib/bootstrap-data");
      const cleanBase = sym.replace(/USDT$/i, "");
      const boot = BOOTSTRAP_CRYPTO_ROWS.find((r) => r.symbol === sym || r.baseAsset === cleanBase) ?? null;
      if (!quote && boot) {
        quote = { ...boot };
      }

      const price = quote?.price ?? 100.0;
      const now = Date.now();
      const syntheticBars = Array.from({ length: 48 }, (_, i) => {
        const time = now - (48 - i) * 3600_000;
        const delta = Math.sin(i / 3) * (price * 0.012);
        const p = Math.max(0.00001, price + delta);
        return {
          time,
          open: p,
          high: p * 1.008,
          low: p * 0.992,
          close: p,
          volume: 250_000,
        };
      });

      return {
        data: {
          symbol: sym.endsWith("USDT") ? sym : `${sym}USDT`,
          baseAsset: cleanBase,
          quote: quote ?? {
            symbol: sym,
            baseAsset: cleanBase,
            assetClass: "crypto",
            price,
            change: 0,
            changePercent: 0,
            high: price * 1.02,
            low: price * 0.98,
            volume: 1000000,
            quoteVolume: 1000000 * price,
            trades24h: 50000,
            updatedAt: new Date().toISOString(),
          },
          ticker: quote,
          bars: syntheticBars,
          klines: syntheticBars,
          technical: null,
          patterns: [],
          funding: null,
          openInterest: null,
        },
        meta: {
          source: quote ? (boot ? "bootstrap-crypto" : "binance-ws-fallback") : "crypto-shell",
          partial: true,
          stale: true,
          note: quote ? `Khôi phục giá ${sym} qua bộ đệm realtime` : `Shell ${sym} — nguồn crypto đang phục hồi`,
        },
      };
    },
    unavailableSource: "crypto",
    unavailableNote: `Không lấy được dữ liệu ${sym}`,
  });
}
