import type { OhlcvBar } from "../types";
import { ema, macd, rsi } from "./oscillators";

export interface MtfMatrixRow {
  tf: string;
  trend: "BULLISH" | "BEARISH" | "RANGING";
  rsiVal: number;
  macdState: "EXPANDING" | "CONTRACTING" | "NEUTRAL";
  structure: string;
  confluencePct: number;
}

export type PrecisionAssetType = "FOREX" | "CRYPTO" | "STOCK";

/**
 * Computes asset-accurate pip / tick increment for FX majors, JPY, metals, energy, stocks, and micro-cap crypto.
 */
export function getAssetPipSize(
  symbol: string,
  assetType: PrecisionAssetType = "FOREX",
  refPrice?: number | null,
): number {
  const clean = symbol.toUpperCase().replace("/", "").replace("-", "");

  if (assetType === "FOREX") {
    if (clean.startsWith("XAU") || clean.includes("GOLD")) return 0.1;
    if (
      clean.startsWith("XAG") ||
      clean.startsWith("XPT") ||
      clean.startsWith("XPD") ||
      clean.startsWith("OIL") ||
      clean === "USOIL" ||
      clean === "UKOIL"
    ) {
      return 0.01;
    }
    if (clean.endsWith("JPY") || clean.startsWith("JPY")) return 0.01;
    if (clean.endsWith("VND")) return 1;
    return 0.0001;
  }

  const price = refPrice != null && Number.isFinite(refPrice) && refPrice > 0 ? refPrice : null;

  if (assetType === "STOCK") {
    return Math.max(0.05, (price ?? 10) * 0.002);
  }

  // CRYPTO dynamic price-scaled pip/tick
  if (price == null) return 0.01;
  if (price >= 1000) return 0.1;
  if (price >= 10) return 0.01;
  if (price >= 0.1) return 0.0001;
  if (price >= 0.001) return 0.000001;
  return Math.max(1e-10, price * 0.0001);
}

/**
 * Returns appropriate decimal places to prevent truncation on micro-coins (e.g. PEPEUSDT) or over-rounding on Gold/JPY.
 */
export function getPriceDecimals(
  price: number,
  symbol = "",
  assetType: PrecisionAssetType = "FOREX",
): number {
  const clean = symbol.toUpperCase().replace("/", "").replace("-", "");

  if (assetType === "FOREX") {
    if (clean.endsWith("VND")) return 0;
    if (clean.startsWith("XAU") || clean.includes("GOLD") || clean.includes("OIL")) return 2;
    if (clean.includes("JPY") || clean.startsWith("XAG")) return 3;
    return 5;
  }

  if (assetType === "STOCK") return 2;

  if (!Number.isFinite(price) || price <= 0) return 4;
  if (price < 0.0001) return 8;
  if (price < 0.01) return 6;
  if (price < 1) return 4;
  if (price < 100) return 3;
  return 2;
}

/**
 * Rounds a price using asset-accurate precision instead of fixed 5 decimals.
 */
export function roundPrice(
  price: number,
  symbol = "",
  assetType: PrecisionAssetType = "FOREX",
): number {
  if (!Number.isFinite(price)) return 0;
  const decimals = getPriceDecimals(price, symbol, assetType);
  return Number(price.toFixed(decimals));
}

/**
 * Normalizes Unix epoch timestamps (handles both seconds and milliseconds safely).
 */
export function normalizeEpochMs(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts < 1e11 ? Math.round(ts * 1000) : Math.round(ts);
}

/**
 * Normalizes Unix epoch timestamps to seconds.
 */
export function normalizeEpochSec(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts < 1e11 ? Math.round(ts) : Math.floor(ts / 1000);
}

/**
 * Causally resamples consecutive `factor` OHLCV bars into higher-timeframe bars.
 * Aggregates forward from index 0 so historical HTF candles remain invariant as new bars arrive.
 */
export function resampleOhlcvBars(bars: OhlcvBar[], factor: number): OhlcvBar[] {
  if (!bars.length || factor <= 1) return [...bars];

  const out: OhlcvBar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const end = Math.min(bars.length, i + factor);
    const first = bars[i];
    const last = bars[end - 1];
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (let j = i; j < end; j++) {
      const b = bars[j];
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += Number.isFinite(b.volume) ? b.volume : 0;
    }

    out.push({
      time: last.time,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
    });
  }
  return out;
}

/**
 * Kaufman Efficiency Ratio (ER) in [0, 1].
 * Low ER (< 0.22) indicates noisy chop/whipsaw; high ER (> 0.35) indicates directional efficiency.
 */
export function computeEfficiencyRatio(closes: number[], period = 14): number {
  if (closes.length < 2) return 0;
  const p = Math.min(period, closes.length - 1);
  if (p < 1) return 0;

  const n = closes.length;
  const netChange = Math.abs(closes[n - 1] - closes[n - 1 - p]);
  let pathLength = 0;
  for (let i = n - p; i < n; i++) {
    pathLength += Math.abs(closes[i] - closes[i - 1]);
  }

  if (pathLength <= 1e-12) return 0;
  return Math.min(1, Math.max(0, netChange / pathLength));
}

/**
 * Estimates volume-weighted Close Location Value (CLV) order flow imbalance in [-100, +100].
 * Serves as an objective proxy when live L2 order book depth is unavailable.
 */
export function estimateClvOrderFlowImbalance(bars: OhlcvBar[], lookback = 12): number {
  if (!bars.length) return 0;
  const slice = bars.slice(-lookback);
  let weightedDelta = 0;
  let totalWeight = 0;

  for (const b of slice) {
    const vol = b.volume != null && Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 1;
    const range = b.high - b.low;
    const clv =
      range > 1e-12
        ? ((b.close - b.low) - (b.high - b.close)) / range
        : b.close > b.open
          ? 0.5
          : b.close < b.open
            ? -0.5
            : 0;
    weightedDelta += clv * vol;
    totalWeight += vol;
  }

  if (totalWeight <= 0) return 0;
  const imbalance = (weightedDelta / totalWeight) * 100;
  return Math.round(Math.max(-100, Math.min(100, imbalance)));
}

/**
 * Computes a causal Multi-Timeframe Confluence Matrix by resampling bars across [1x, 3x, 6x, 12x, 24x]
 * with guaranteed monotonic EMA ordering (fast < slow) so trends across timeframes align accurately.
 */
export function buildMtfConfluenceMatrix(series: OhlcvBar[]): {
  rows: MtfMatrixRow[];
  dominantTrend: "BULLISH" | "BEARISH" | "RANGING";
  confluencePct: number;
} {
  const horizons: { tf: string; factor: number; fallbackFast: number; fallbackSlow: number }[] = [
    { tf: "M1 / M5", factor: 1, fallbackFast: 7, fallbackSlow: 16 },
    { tf: "M15", factor: 3, fallbackFast: 10, fallbackSlow: 24 },
    { tf: "H1", factor: 6, fallbackFast: 14, fallbackSlow: 34 },
    { tf: "H4", factor: 12, fallbackFast: 18, fallbackSlow: 45 },
    { tf: "D1 (Macro)", factor: 24, fallbackFast: 24, fallbackSlow: 60 },
  ];

  const rows: MtfMatrixRow[] = horizons.map(({ tf, factor, fallbackFast, fallbackSlow }) => {
    const resampled = resampleOhlcvBars(series, factor);
    const useResampled = resampled.length >= 16;
    const workBars = useResampled ? resampled : series;
    const closes = workBars.map((b) => b.close);
    const n = closes.length;

    const rawFast = useResampled ? 9 : fallbackFast;
    const rawSlow = useResampled ? 21 : fallbackSlow;
    const slowP = Math.max(6, Math.min(rawSlow, n - 1));
    const fastP = Math.max(3, Math.min(rawFast, slowP - 2));

    const fastArr = ema(closes, fastP);
    const slowArr = ema(closes, slowP);
    const curFast = fastArr[n - 1] ?? closes[n - 1] ?? 0;
    const curSlow = slowArr[n - 1] ?? curFast;
    const lastClose = closes[n - 1] ?? 0;

    let trend: MtfMatrixRow["trend"] = "RANGING";
    if (curFast > curSlow && lastClose >= curFast * 0.999) {
      trend = "BULLISH";
    } else if (curFast < curSlow && lastClose <= curFast * 1.001) {
      trend = "BEARISH";
    }

    const rsiPeriod = Math.max(5, Math.min(14, n - 2));
    const rsiArr = rsi(closes, rsiPeriod);
    const rsiVal = rsiArr[n - 1] ?? 50;

    let macdState: MtfMatrixRow["macdState"] = "NEUTRAL";
    if (n >= 28) {
      const hist = macd(closes).histogram;
      const hCur = hist[n - 1];
      const hPrev = hist[n - 2];
      if (hCur != null && hPrev != null) {
        macdState = hCur > hPrev && hCur > 0 ? "EXPANDING" : hCur < hPrev && hCur < 0 ? "CONTRACTING" : curFast > curSlow ? "EXPANDING" : curFast < curSlow ? "CONTRACTING" : "NEUTRAL";
      }
    } else if (curFast > curSlow) {
      macdState = "EXPANDING";
    } else if (curFast < curSlow) {
      macdState = "CONTRACTING";
    }

    const structSlice = workBars.slice(-Math.min(30, workBars.length));
    const maxHigh = Math.max(...structSlice.map((b) => b.high));
    const minLow = Math.min(...structSlice.map((b) => b.low));
    const range = maxHigh - minLow;
    const pos = range > 0 ? (lastClose - minLow) / range : 0.5;
    const structure = pos > 0.65 ? "Premium Zone" : pos < 0.35 ? "Discount (OTE)" : "Equilibrium";

    const confluencePct = Math.min(
      95,
      Math.round(52 + (trend !== "RANGING" ? 24 : 0) + (rsiVal > 45 && rsiVal < 70 && trend === "BULLISH" ? 16 : rsiVal < 55 && rsiVal > 30 && trend === "BEARISH" ? 16 : 8)),
    );

    return { tf, trend, rsiVal, macdState, structure, confluencePct };
  });

  const bullishCount = rows.filter((r) => r.trend === "BULLISH").length;
  const bearishCount = rows.filter((r) => r.trend === "BEARISH").length;
  const dominantTrend = bullishCount >= 3 ? "BULLISH" : bearishCount >= 3 ? "BEARISH" : "RANGING";
  const confluencePct = Math.round((Math.max(bullishCount, bearishCount) / rows.length) * 100);

  return { rows, dominantTrend, confluencePct };
}
