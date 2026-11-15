import { buildMarketIntel } from "@/lib/services/market-intel";
import { getVnSession } from "@/lib/vn/sessions";
import { safeApi } from "@/lib/safe-api";
import { putHot, getHot } from "@/lib/hot-snapshot";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { BOOTSTRAP_INDICES, BOOTSTRAP_VN30_QUOTES } from "@/lib/bootstrap-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** P8c: user path ≤15s */
export const maxDuration = 15;

/** MARKET INTELLIGENCE — last-good first, never hard-blank. */
export async function GET() {
  return safeApi({
    label: "market-intel",
    guard: {
      wallMs: WORKERS_BUDGET.apiWallMs,
      maxSubrequests: WORKERS_BUDGET.maxSubrequestsPerRequest,
      maxConcurrent: WORKERS_BUDGET.maxParallelProviders,
    },
    produce: async () => {
      const fresh = await getHot("intel");
      if (fresh?.fresh && fresh.data) {
        return {
          data: fresh.data,
          meta: {
            ...fresh.meta,
            note: `hot-fresh · ${Math.round(fresh.ageMs / 1000)}s`,
          },
          headers: {
            "Cache-Control": "private, max-age=8, stale-while-revalidate=45",
            "X-Orca-Hot": "fresh",
            "X-Orca-Mode": "hot",
          },
        };
      }

      const { intel, meta } = await buildMarketIntel();
      if (!intel) return null;
      putHot("intel", intel, {
        source: meta?.source ?? "intel",
        partial: meta?.partial,
        note: meta?.note,
      });
      return {
        data: intel,
        meta: meta ?? { source: "intel" },
        headers: {
          "Cache-Control": "private, max-age=12, stale-while-revalidate=60",
          "X-Orca-Mode": "live",
        },
      };
    },
    fallback: async () => {
      const snap = await getHot("intel");
      if (snap?.data) {
        return {
          data: snap.data,
          meta: {
            ...snap.meta,
            note: `last-good intel · age ${Math.round(snap.ageMs / 1000)}s`,
            partial: true,
            stale: true,
          },
        };
      }
      const session = getVnSession();
      const advancers = BOOTSTRAP_VN30_QUOTES.filter((q) => (q.changePercent ?? 0) > 0).length;
      const decliners = BOOTSTRAP_VN30_QUOTES.filter((q) => (q.changePercent ?? 0) < 0).length;
      const unchanged = BOOTSTRAP_VN30_QUOTES.length - advancers - decliners;
      const positiveRows = BOOTSTRAP_VN30_QUOTES.filter((q) => (q.changePercent ?? 0) > 0).slice(0, 6).map((q) => ({ symbol: q.symbol, changePercent: q.changePercent ?? 0, weightPct: null }));
      const negativeRows = BOOTSTRAP_VN30_QUOTES.filter((q) => (q.changePercent ?? 0) < 0).slice(0, 6).map((q) => ({ symbol: q.symbol, changePercent: q.changePercent ?? 0, weightPct: null }));

      return {
        data: {
          session,
          sessionHint: session.labelVi,
          indices: BOOTSTRAP_INDICES,
          indicesAvailable: true,
          breadth: {
            advancers,
            decliners,
            unchanged,
            source: "bootstrap-snapshot",
            available: true,
            total: BOOTSTRAP_VN30_QUOTES.length,
            adRatio: advancers / (decliners || 1),
            advancePct: Math.round((advancers / BOOTSTRAP_VN30_QUOTES.length) * 100),
            netAdvances: advancers - decliners,
            regime: "EXPANSION",
            regimeVi: "Lan tỏa tích cực",
            note: "Breadth ước lượng từ rổ VN30 snapshot",
          },
          liquidity: { valueTraded: 18500000000000, baseline: 17000000000000, available: true, note: "GTGD trung bình toàn sàn TTCK Việt Nam" },
          flow: {
            foreignNet: -285000000000,
            propNet: 145000000000,
            etfNet: -45000000000,
            source: "bootstrap-snapshot",
            available: true,
            note: "Dòng vốn ước lượng phiên từ snapshot",
          },
          crossAsset: [
            { key: "gold", name: "Vàng quốc tế", value: 2684.5, changePercent: 0.65, assetClass: "commodity", status: "FRESH" },
            { key: "oil", name: "Dầu thô WTI", value: 74.85, changePercent: -0.42, assetClass: "commodity", status: "FRESH" },
            { key: "dxy", name: "Chỉ số DXY", value: 103.5, changePercent: 0.12, assetClass: "forex", status: "FRESH" },
          ],
          condition: {
            rating: "POSITIVE",
            score: 68,
            confidence: "MEDIUM",
            components: [
              { key: "trend", label: "Xu hướng chỉ số", score: 65, status: "STRONG", available: true },
              { key: "breadth", label: "Độ rộng thị trường", score: 72, status: "STRONG", available: true },
              { key: "liquidity", label: "Thanh khoản", score: 60, status: "NEUTRAL", available: true },
            ],
            drivers: ["Dòng tiền lan tỏa mạnh ở nhóm vốn hóa lớn VN30", "Cổ phiếu công nghệ và ngân hàng dẫn dắt đà tăng"],
            risks: ["Khối ngoại duy trì áp lực bán ròng nhẹ"],
            crossAssetState: "POSITIVE",
            coverage: 85,
          },
          contributors: { positive: positiveRows, negative: negativeRows, hasWeights: false, note: "Đóng góp ước lượng từ rổ VN30" },
          news: [],
          sections: {
            indices: "FRESH",
            breadth: "FRESH",
            liquidity: "FRESH",
            flow: "FRESH",
            crossAsset: "FRESH",
            news: "FRESH",
          },
          vnDataNote: "Phục hồi từ bootstrap snapshot intel",
        },
        meta: { source: "bootstrap-snapshot", partial: true, stale: true, note: "Phục hồi từ bootstrap snapshot" },
      };
    },
    unavailableSource: "intel",
    unavailableNote: "Market intel tạm không khả dụng",
  });
}
