import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { queryScreenerStocks } from "@/lib/services/screener-snapshot-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/v1/screener/confluence
 *
 * Super Confluence Screener API:
 * Ranks stocks by 4-Pillar Confluence Score:
 * 1. Trend (MA Alignment, ADX, SuperTrend) - 25%
 * 2. Chart Pattern & VSA (VCP, Cup & Handle, Shakeout, No Supply) - 25%
 * 3. Volume & Momentum (Volume Spike, TTM Squeeze Firing) - 25%
 * 4. Fundamental Quality - 25%
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const minScore = num(url.searchParams.get("minScore")) ?? 55;
  const badge = (url.searchParams.get("badge") ?? "ALL").toUpperCase();
  const sector = url.searchParams.get("sector")?.trim() || undefined;
  const limit = Math.min(num(url.searchParams.get("limit")) ?? 50, 100);

  return safeApi({
    label: "screener-confluence",
    guard: {
      wallMs: WORKERS_BUDGET.techScreenWallMs,
      maxSubrequests: 24,
      maxConcurrent: 3,
    },
    produce: async () => {
      const res = await queryScreenerStocks({
        sector,
        sort: "confluenceScore",
        order: "desc",
        limit: 120,
      });

      let rows = res.items.filter((item) => item.confluenceScore >= minScore);

      if (badge && badge !== "ALL") {
        rows = rows.filter((item) => item.confluenceBadge === badge);
      }

      const paginated = rows.slice(0, limit);

      return {
        data: {
          rows: paginated,
          total: rows.length,
          universeTotal: res.totalUniverse,
          superSetupsCount: res.items.filter((x) => x.confluenceBadge === "SUPER_SETUP").length,
          breakoutCount: res.items.filter((x) => x.confluenceBadge === "POTENTIAL_BREAKOUT").length,
          watchCount: res.items.filter((x) => x.confluenceBadge === "WATCH").length,
          methodology: "4-Pillar Quantitative Confluence (Trend 25%, Pattern 25%, Momentum 25%, Quality 25%)",
        },
        meta: res.meta,
      };
    },
    fallback: async () => ({
      data: {
        rows: [],
        total: 0,
        universeTotal: 0,
        superSetupsCount: 0,
        breakoutCount: 0,
        watchCount: 0,
        methodology: "4-Pillar Quantitative Confluence",
      },
      meta: {
        source: "screener-confluence-fallback",
        partial: true,
      },
    }),
  });
}
