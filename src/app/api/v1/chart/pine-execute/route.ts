import { NextRequest, NextResponse } from "next/server";
import { getChartHistory } from "@/lib/services/chart";
import { executePineScript } from "@/lib/engines/pine-runner";
import { rateLimit } from "@/lib/rate-limit";
import type { OhlcvBar } from "@/lib/types";
import { isValidTradingSymbol, safeInternalErrorMessage } from "@/app/api/_security";

export const dynamic = "force-dynamic";

const ALLOWED_TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
const MAX_PINE_SCRIPT_CHARS = 16_000;
const MAX_PINE_SCRIPT_LINES = 200;

/**
 * POST /api/v1/chart/pine-execute
 * Executes user Pine Script v5 against historical candles
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { name: "pine_execute", binding: "RL_AI", limit: 20, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
    }
    const symbol = typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim().toUpperCase() : "SSI";
    if (!isValidTradingSymbol(symbol)) {
      return NextResponse.json({ ok: false, error: "Invalid symbol" }, { status: 400 });
    }
    const timeframe = typeof body.timeframe === "string" ? body.timeframe.trim() : "1d";
    if (!ALLOWED_TIMEFRAMES.has(timeframe)) {
      return NextResponse.json({ ok: false, error: "Invalid timeframe" }, { status: 400 });
    }
    const script = typeof body.script === "string" ? body.script : "";

    if (!script.trim()) {
      return NextResponse.json({ ok: false, error: "Empty Pine Script" }, { status: 400 });
    }
    if (script.length > MAX_PINE_SCRIPT_CHARS || script.split("\n").length > MAX_PINE_SCRIPT_LINES) {
      return NextResponse.json(
        { ok: false, error: "Pine Script exceeds maximum allowed length (16,000 chars / 200 lines)" },
        { status: 400 },
      );
    }

    const history = await getChartHistory({
      symbol,
      assetType: "stock",
      timeframe,
      limit: 300,
    });

    const candles = history?.data?.candles || [];
    if (!candles || candles.length === 0) {
      return NextResponse.json({ ok: false, error: `No candle data for ${symbol}` }, { status: 404 });
    }

    const ohlcvBars: OhlcvBar[] = candles.map((c) => ({
      time: typeof c.time === "number" && c.time < 1e11 ? c.time * 1000 : Number(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));

    const result = executePineScript(script, ohlcvBars);

    return NextResponse.json({
      ok: result.ok,
      data: result,
    });
  } catch (err: unknown) {
    const msg = safeInternalErrorMessage(err, "Error executing Pine Script");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

