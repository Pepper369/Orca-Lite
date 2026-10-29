import type { OhlcvBar } from "@/lib/types";
import { sma, ema, rsi, macd, adx, superTrend } from "./oscillators";

export interface PinePlotOutput {
  title: string;
  color: string;
  data: { time: number; value: number }[];
}

export interface PineExecutionResult {
  ok: boolean;
  title: string;
  overlay: boolean;
  plots: PinePlotOutput[];
  error?: string;
}

/**
 * Lightweight Pine Script v5 Engine for Orca-Lite
 * Executes custom Pine Script indicator calculations against OHLCV series.
 */
export function executePineScript(script: string, bars: OhlcvBar[]): PineExecutionResult {
  if (!bars || bars.length === 0) {
    return { ok: false, title: "Empty", overlay: true, plots: [], error: "No OHLCV bars provided" };
  }

  const times = bars.map((b) => b.time);
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  let scriptTitle = "Pine Indicator";
  let isOverlay = true;
  const plots: PinePlotOutput[] = [];

  try {
    const lines = script
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("//"));

    // Check indicator(...) statement
    const indLine = lines.find((l) => l.startsWith("indicator(") || l.startsWith("study("));
    if (indLine) {
      const titleMatch = indLine.match(/(?:title\s*=\s*)?["']([^"']+)["']/);
      if (titleMatch?.[1]) scriptTitle = titleMatch[1];
      if (indLine.includes("overlay=false") || indLine.includes("overlay = false")) {
        isOverlay = false;
      }
    }

    // Context series store
    const vars: Record<string, (number | null)[]> = {
      close: closes,
      open: bars.map((b) => b.open),
      high: highs,
      low: lows,
      volume: bars.map((b) => b.volume || 0),
    };

    for (const line of lines) {
      // 1. Variable assignments: name = expression
      const assignMatch = line.match(/^([a-zA-Z_0-9]+)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varName = assignMatch[1]!;
        const expr = assignMatch[2]!.trim();

        // ta.sma(series, length)
        const smaMatch = expr.match(/ta\.sma\(\s*([a-zA-Z_0-9]+)\s*,\s*(\d+)\s*\)/);
        if (smaMatch) {
          const src = vars[smaMatch[1]!] || closes;
          const len = parseInt(smaMatch[2]!, 10);
          vars[varName] = sma(src.map((v) => v ?? 0), len);
          continue;
        }

        // ta.ema(series, length)
        const emaMatch = expr.match(/ta\.ema\(\s*([a-zA-Z_0-9]+)\s*,\s*(\d+)\s*\)/);
        if (emaMatch) {
          const src = vars[emaMatch[1]!] || closes;
          const len = parseInt(emaMatch[2]!, 10);
          vars[varName] = ema(src.map((v) => v ?? 0), len);
          continue;
        }

        // ta.rsi(series, length)
        const rsiMatch = expr.match(/ta\.rsi\(\s*([a-zA-Z_0-9]+)\s*,\s*(\d+)\s*\)/);
        if (rsiMatch) {
          const src = vars[rsiMatch[1]!] || closes;
          const len = parseInt(rsiMatch[2]!, 10);
          vars[varName] = rsi(src.map((v) => v ?? 0), len);
          continue;
        }

        // ta.supertrend(factor, atrPeriod)
        const stMatch = expr.match(/ta\.supertrend\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+)\s*\)/);
        if (stMatch) {
          const factor = parseFloat(stMatch[1]!);
          const period = parseInt(stMatch[2]!, 10);
          const st = superTrend(highs, lows, closes, period, factor);
          vars[varName] = st.superTrend;
          continue;
        }
      }

      // 2. plot(series, ...)
      const plotMatch = line.match(/plot\(\s*([a-zA-Z_0-9]+)(?:,\s*.*)?\)/);
      if (plotMatch) {
        const seriesName = plotMatch[1]!;
        const seriesData = vars[seriesName];

        if (seriesData) {
          // Extract title if present
          const titleMatch = line.match(/title\s*=\s*["']([^"']+)["']/);
          const plotTitle = titleMatch?.[1] || seriesName;

          // Extract color if present
          let plotColor = "#38bdf8";
          if (line.includes("color.red") || line.includes("color.rose")) plotColor = "#f43f5e";
          else if (line.includes("color.green") || line.includes("color.emerald")) plotColor = "#10b981";
          else if (line.includes("color.orange") || line.includes("color.amber")) plotColor = "#f59e0b";
          else if (line.includes("color.purple") || line.includes("color.violet")) plotColor = "#a855f7";

          const cleanPoints: { time: number; value: number }[] = [];
          for (let i = 0; i < seriesData.length; i++) {
            const val = seriesData[i];
            if (val != null && !isNaN(val)) {
              cleanPoints.push({
                time: times[i]!,
                value: val,
              });
            }
          }

          plots.push({
            title: plotTitle,
            color: plotColor,
            data: cleanPoints,
          });
        }
      }
    }

    return {
      ok: true,
      title: scriptTitle,
      overlay: isOverlay,
      plots,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Pine Script parse error";
    return {
      ok: false,
      title: scriptTitle,
      overlay: isOverlay,
      plots: [],
      error: errorMsg,
    };
  }
}

