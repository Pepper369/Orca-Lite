import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { screenMovingAverages } from "@/lib/services/ma-screener";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/v1/screener/ma-cross
 *
 * Dedicated Moving Average Screener API:
 * Filters stocks by MA Crossovers (Golden Cross, Death Cross),
 * Bullish Alignment, and MA Squeeze compression.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const symbolsRaw = url.searchParams.get("symbols");
  const symbols = symbolsRaw
    ? symbolsRaw
        .split(/[\s,;]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : undefined;

  const signal = (url.searchParams.get("signal") ?? "ALL").toUpperCase() as
    | "ALL"
    | "BULLISH"
    | "GOLDEN_CROSS"
    | "PULLBACK_RETEST"
    | "BREAKOUT_RECLAIM"
    | "BULLISH_ALIGN"
    | "MA_SQUEEZE"
    | "SLOPE_BULLISH"
    | "OVEREXTENDED"
    | "BEARISH"
    | "DEATH_CROSS"
    | "FRESH_CROSS";

  const category = (url.searchParams.get("category")?.toUpperCase() || undefined) as any;
  const horizon = (url.searchParams.get("horizon")?.toUpperCase() || undefined) as any;
  const action = (url.searchParams.get("action")?.toUpperCase() || undefined) as any;

  const sector = url.searchParams.get("sector")?.trim() || undefined;
  const minPrice = num(url.searchParams.get("minPrice"));
  const minVol = num(url.searchParams.get("minVol"));
  const limit = num(url.searchParams.get("limit")) ?? 60;

  return safeApi({
    label: "screener-ma-cross",
    guard: {
      wallMs: WORKERS_BUDGET.techScreenWallMs,
      maxSubrequests: 24,
      maxConcurrent: 4,
    },
    produce: async () => {
      const res = await screenMovingAverages({
        symbols,
        signal,
        category,
        horizon,
        action,
        sector,
        minPrice,
        minVol,
        limit,
      });

      return {
        data: {
          rows: res.rows,
          total: res.total,
        },
        meta: res.meta,
      };
    },
  });
}
