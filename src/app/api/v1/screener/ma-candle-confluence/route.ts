import { badRequest } from "@/lib/envelope";
import { screenMaCandleConfluence } from "@/lib/services/ma-candle-confluence-screener";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/v1/screener/ma-candle-confluence */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const scenario = (url.searchParams.get("scenario") ?? "all").toUpperCase();
  const allowedScenarios = new Set([
    "ALL",
    "SMC_SWEEP_RECLAIM",
    "VSA_NO_SUPPLY_TEST",
    "EMA_RIBBON_ALIGN",
    "MA50_BOUNCE",
    "MA20_BOUNCE",
    "MA200_RECLAIM",
    "GOLDEN_CROSS_CONFIRM",
    "MA_SQUEEZE_BREAKOUT",
    "TREND_PULLBACK",
  ]);
  if (!allowedScenarios.has(scenario)) {
    return badRequest("scenario không hợp lệ");
  }

  const rawMinScore = Number(url.searchParams.get("minScore"));
  const minScore = Number.isFinite(rawMinScore)
    ? Math.max(0, Math.min(100, Math.round(rawMinScore)))
    : 60;

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(80, Math.round(rawLimit)))
    : 40;

  const sector = url.searchParams.get("sector") ?? undefined;
  const volumeOnly = url.searchParams.get("volumeOnly") === "1";
  const foreignOnly = url.searchParams.get("foreignOnly") === "1";
  const leaderOnly = url.searchParams.get("leaderOnly") === "1" || url.searchParams.get("rsOnly") === "1";
  const rawQuality = url.searchParams.get("qualityOnly");
  const qualityOnly: "A+" | "A" | "all" =
    rawQuality === "A+" || rawQuality === "A" ? rawQuality : "all";

  const symbolsRaw = (url.searchParams.get("symbols") ?? "").slice(0, 1024);
  const symbols = symbolsRaw
    ? symbolsRaw
        .split(/[,;\s]+/)
        .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9/._-]/g, ""))
        .filter(Boolean)
        .slice(0, 100)
    : undefined;

  return safeApi({
    label: "screener-ma-candle-confluence",
    guard: {
      wallMs: WORKERS_BUDGET.techScreenWallMs,
      maxSubrequests: 24,
      maxConcurrent: 3,
    },
    produce: async () => {
      const r = await screenMaCandleConfluence({
        scenario,
        minScore,
        limit,
        sector,
        qualityOnly,
        volumeOnly,
        foreignOnly,
        leaderOnly,
        symbols,
      });
      if (!r) return null;
      return {
        data: {
          rows: r.rows,
          scanned: r.scanned,
          skipped: r.skipped,
          ruleset: "MA Dynamic Support + Bullish Reversal Candlestick Confluence",
        },
        meta: r.meta,
      };
    },
    fallback: async () => ({
      data: {
        rows: [],
        scanned: 0,
        skipped: 0,
        ruleset: "MA Dynamic Support + Bullish Reversal Candlestick Confluence",
      },
    }),
  });
}
