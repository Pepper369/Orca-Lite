import { screenCrypto } from "@/lib/services/crypto";
import { queryScreenerStocks } from "@/lib/services/screener-snapshot-service";
import { resolveCanonicalPreset } from "@/lib/quant/screener-taxonomy";
import { safeApi } from "@/lib/safe-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * Multi-asset screener router.
 * - `universe=crypto`: Live Binance crypto markets.
 * - `universe!=crypto`: Delegates to unified VN Stocks Screener Pro engine.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const universe = url.searchParams.get("universe") ?? "crypto";

  if (universe !== "crypto") {
    const preset = resolveCanonicalPreset(url.searchParams.get("preset") ?? universe);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const sector = url.searchParams.get("sector") ?? undefined;
    return safeApi({
      label: "screener-vn-unified",
      guard: { wallMs: 18_000, maxSubrequests: 20, maxConcurrent: 4 },
      produce: async () => {
        const res = await queryScreenerStocks({ preset, sector, limit });
        return {
          data: { universe, preset, rows: res.items, total: res.total },
          meta: res.meta,
        };
      },
      fallback: async () => ({
        data: { universe, rows: [], total: 0 },
        meta: {
          source: "vnstock-shell",
          partial: true,
          note: "VN Screener đang phục hồi — dùng /api/v1/stocks/screener cho đầy đủ tham số",
        },
      }),
      unavailableSource: "vnstock",
      unavailableNote: "Screener cổ phiếu Việt Nam tạm gián đoạn.",
    });
  }

  const num = (k: string) =>
    url.searchParams.get(k) != null ? Number(url.searchParams.get(k)) : undefined;
  const sort = url.searchParams.get("sort");

  return safeApi({
    label: "screener-crypto",
    guard: { wallMs: 12_000, maxSubrequests: 16, maxConcurrent: 2 },
    produce: async () => {
      const r = await screenCrypto({
        minChange: num("minChange"),
        maxChange: num("maxChange"),
        minQuoteVolume: num("minQuoteVolume"),
        limit: Math.min(num("limit") ?? 40, 100),
        sort: sort === "gainers" || sort === "losers" ? sort : "volume",
      });
      if (!r) return null;
      return { data: { universe, rows: r.rows }, meta: r.meta };
    },
    fallback: async () => ({
      data: { universe, rows: [] },
      meta: {
        source: "crypto-shell",
        partial: true,
        stale: true,
        note: "Binance tạm lỗi — thử lại sau",
      },
    }),
    unavailableSource: "binance",
    unavailableNote: "Binance không khả dụng — screener tạm dừng.",
  });
}
