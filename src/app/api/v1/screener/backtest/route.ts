import { NextRequest, NextResponse } from "next/server";
import { runScreenerBacktest, StrategyType, MarketRegimeType } from "@/lib/engines/screener-backtest-engine";
import { rateLimit } from "@/lib/rate-limit";
import { isValidTradingSymbol } from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const revalidate = 300; // Cache for 5 mins

const VALID_STRATEGIES = new Set<string>([
  "apex_buy_now",
  "orca_apex_quant",
  "price_action_trained",
  "orca_master",
  "smart_money",
  "quant_edge",
  "breakout",
  "canslim",
  "ma_cross",
  "value",
  "piotroski_diamonds",
  "buffett_compounder",
  "earnings_quality",
  "deep_value",
]);

const VALID_REGIMES = new Set<string>([
  "all",
  "uptrend_2020_2021",
  "downtrend_2022",
  "sideway_2023_2024",
  "recent_2025_2026",
]);

function sanitizeBacktestParams(raw: Record<string, unknown>) {
  const strategy = typeof raw.strategy === "string" && VALID_STRATEGIES.has(raw.strategy)
    ? (raw.strategy as StrategyType)
    : "orca_apex_quant";
  const marketRegime = typeof raw.marketRegime === "string" && VALID_REGIMES.has(raw.marketRegime)
    ? (raw.marketRegime as MarketRegimeType)
    : "all";
  const holdingDays = Number.isFinite(Number(raw.holdingDays))
    ? Math.max(1, Math.min(250, Math.round(Number(raw.holdingDays))))
    : 20;
  const stopLossPct = Number.isFinite(Number(raw.stopLossPct))
    ? Math.max(0.5, Math.min(50, Number(raw.stopLossPct)))
    : 7;
  const takeProfitPct = Number.isFinite(Number(raw.takeProfitPct))
    ? Math.max(0.5, Math.min(200, Number(raw.takeProfitPct)))
    : 15;
  const bars = raw.bars !== undefined && Number.isFinite(Number(raw.bars))
    ? Math.max(30, Math.min(1500, Math.round(Number(raw.bars))))
    : undefined;
  let symbols: string[] | undefined;
  if (Array.isArray(raw.symbols)) {
    symbols = raw.symbols
      .filter((s): s is string => typeof s === "string" && isValidTradingSymbol(s))
      .map((s) => s.trim().toUpperCase())
      .slice(0, 60);
  }
  return { strategy, marketRegime, holdingDays, stopLossPct, takeProfitPct, symbols, bars };
}

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { name: "screener_backtest_get", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;
  try {
    const { searchParams } = new URL(req.url);
    const rawSymbols = searchParams.get("symbols");
    const parsed = sanitizeBacktestParams({
      strategy: searchParams.get("strategy") || undefined,
      marketRegime: searchParams.get("marketRegime") || undefined,
      holdingDays: searchParams.get("holdingDays") || undefined,
      stopLossPct: searchParams.get("stopLossPct") || undefined,
      takeProfitPct: searchParams.get("takeProfitPct") || undefined,
      symbols: rawSymbols ? rawSymbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined,
      bars: searchParams.get("bars") || undefined,
    });

    const result = await runScreenerBacktest(parsed);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("[api/v1/screener/backtest] Error running backtest:", error);
    return NextResponse.json(
      { error: "Failed to run screener backtest" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { name: "screener_backtest_post", binding: "RL_AI", limit: 20, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid backtest payload" }, { status: 400 });
    }
    const result = await runScreenerBacktest(sanitizeBacktestParams(body));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/v1/screener/backtest POST] Error running backtest:", error);
    return NextResponse.json(
      { error: "Failed to run screener backtest" },
      { status: 500 }
    );
  }
}
