import { screenFundamental } from "@/lib/services/fundamental-screener";
import { getMasterScreenerSnapshot, type ScreenerStockItem } from "@/lib/services/screener-snapshot-service";
import { evaluateFourM, type FourMScore } from "@/lib/engines/four-m";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { getSecurity } from "@/lib/vn/master";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 18;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minScore = Number(url.searchParams.get("minScore") ?? 40);
  const minPillars = Number(url.searchParams.get("minPillars") ?? 0);
  const gradeFilter = url.searchParams.get("grade")?.toLowerCase();
  const sector = url.searchParams.get("sector") ?? undefined;
  const symbols = url.searchParams.get("symbols")?.split(/[ ,\s;]+/).filter(Boolean);

  return safeApi({
    label: "screener-four-m",
    guard: {
      wallMs: WORKERS_BUDGET.techScreenWallMs,
      maxSubrequests: 26,
      maxConcurrent: 3,
    },
    produce: async () => {
      const [fundResult, masterSnap] = await Promise.all([
        screenFundamental({
          symbols: symbols?.length ? symbols : undefined,
          sector,
          excludeSyntheticFa: true,
        }),
        getMasterScreenerSnapshot().catch(() => null),
      ]);

      if (!fundResult || !fundResult.rows) {
        return {
          data: {
            rows: [],
            scanned: 0,
            summary: { diamondCount: 0, goldCount: 0, silverCount: 0, bronzeCount: 0 },
          },
        };
      }

      const masterItems = ((masterSnap as { items?: ScreenerStockItem[] } | null)?.items ?? []);
      const masterMap = new Map<string, ScreenerStockItem>(masterItems.map((it) => [it.symbol, it]));

      const scoredRows: FourMScore[] = fundResult.rows.map((r) => {
        const sec = getSecurity(r.symbol);
        const master = masterMap.get(r.symbol);
        return evaluateFourM({
          symbol: r.symbol,
          name: sec?.name,
          sector: r.sector,
          price: r.price ?? master?.price ?? null,
          roe: r.roe,
          roic: r.roic,
          grossMargin: r.grossMargin,
          debtEquity: r.debtEquity,
          currentRatio: r.currentRatio,
          revenueYoyPct: r.revenueYoyPct,
          niYoyPct: r.niYoyPct,
          pe: master?.pe ?? null,
          pb: master?.pb ?? null,
        });
      });

      // Filter by minScore, minPillars and grade
      const filtered = scoredRows.filter((row) => {
        if (row.totalScore < minScore) return false;
        if (row.passedPillarsCount < minPillars) return false;
        if (gradeFilter && row.grade.toLowerCase() !== gradeFilter) return false;
        return true;
      });

      // Sort descending by totalScore
      filtered.sort((a, b) => b.totalScore - a.totalScore);

      return {
        data: {
          rows: filtered,
          scanned: fundResult.scanned,
          summary: {
            diamondCount: filtered.filter((r) => r.grade === "Diamond").length,
            goldCount: filtered.filter((r) => r.grade === "Gold").length,
            silverCount: filtered.filter((r) => r.grade === "Silver").length,
            bronzeCount: filtered.filter((r) => r.grade === "Bronze").length,
          },
        },
      };
    },
  });
}
