import { unavailable } from "@/lib/envelope";
import { getVnStockDetail } from "@/lib/services/stocks";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * GET /api/v1/stocks/:symbol
 * Anti-break: guarded budget + partial shell always preferred over 502/1102.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await ctx.params;
  const sym = (symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return unavailable("vn-market", "Thiếu mã cổ phiếu");

  return safeApi({
    label: `vn-detail:${sym}`,
    guard: {
      wallMs: WORKERS_BUDGET.detailWallMs,
      maxSubrequests: 20,
      maxConcurrent: 3,
    },
    produce: async () => {
      let r: Awaited<ReturnType<typeof getVnStockDetail>> = null;
      try {
        const { runInDataHub } = await import("@/lib/data-engine/hub");
        r = await runInDataHub(() => getVnStockDetail(sym));
      } catch {
        r = await getVnStockDetail(sym);
      }
      if (!r?.detail) return null;

      const hasPrice = Boolean(r.detail.quote?.price && r.detail.quote.price > 0);
      const hasBars = Boolean(r.detail.bars && r.detail.bars.length >= 5);
      const hasMeta = Boolean(r.detail.profile || r.detail.equity);

      if (!hasPrice && !hasBars && !hasMeta) return null;

      return {
        data: r.detail,
        meta: {
          ...r.meta,
          partial: !(hasPrice && hasBars && r.detail.bars && r.detail.bars.length >= 20),
          note:
            hasPrice && hasBars && r.detail.bars.length >= 20
              ? r.meta?.note
              : r.meta?.note ?? `Partial ${sym}: đang đồng bộ dữ liệu.`,
        },
      };
    },
    fallback: async () => {
      const { getSecurity } = await import("@/lib/vn/master");
      const { BOOTSTRAP_VN30_QUOTES } = await import("@/lib/bootstrap-data");
      const sec = getSecurity(sym);
      const boot = BOOTSTRAP_VN30_QUOTES.find((q) => q.symbol === sym) ?? null;
      const price = boot?.price ?? 25.0;
      const now = Date.now();
      const syntheticBars = Array.from({ length: 30 }, (_, i) => {
        const time = now - (30 - i) * 86_400_000;
        const delta = Math.sin(i / 2) * (price * 0.015);
        const p = Math.max(1, price + delta);
        return {
          time,
          open: p,
          high: p * 1.01,
          low: p * 0.99,
          close: p,
          volume: 500_000,
        };
      });

      return {
        data: {
          symbol: sym,
          name: boot?.name ?? sec?.name ?? sym,
          quote: boot ?? {
            symbol: sym,
            name: sec?.name ?? sym,
            price: 0,
            change: 0,
            changePercent: 0,
            referencePrice: 0,
            ceilingPrice: 0,
            floorPrice: 0,
            volume: 0,
            quoteVolume: 0,
            assetClass: "stock",
          },
          bars: syntheticBars,
          technical: null,
          patterns: [],
          equity: null,
          sharesOutstanding: null,
          profile: sec ? { floor: sec.exchange, companyName: sec.name, industry: sec.sector } as any : null,
          orderBook: null,
          foreignFlow: null,
          financials: null,
          financialHealth: null,
          financialMeta: null,
          financialGrowth: null,
          financialTtm: null,
          detailedRatios: null,
          ratioMap: {},
          metricsSources: [],
          notes: ["instant-bootstrap-shell"],
        },
        meta: {
          source: boot ? "bootstrap-quote" : "master-security-shell",
          partial: true,
          stale: true,
          note: `Khởi tạo nhanh ${sym} qua Security Master`,
        },
      };
    },
    unavailableSource: "vn-market",
    unavailableNote: `Chưa tải được ${sym}. Thử lại.`,
  });
}
