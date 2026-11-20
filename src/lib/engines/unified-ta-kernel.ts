/**
 * UNIFIED TECHNICAL & QUANTITATIVE KERNEL (SINGLE SOURCE OF TRUTH)
 *
 * Eliminates duplicate/divergent indicator implementations across screeners,
 * quant engines, and backtest modules, and provides a single-pass O(N)
 * precomputed feature bundle for high-throughput multi-asset screening.
 */

import type { OhlcvBar } from "../types";
import {
  sma,
  ema,
  rsi,
  macd,
  stochastic,
  adx,
  keltner,
  ttmSqueeze,
  superTrend,
  atrSeries,
} from "./oscillators";
import { bollinger, atr } from "../technical";

export {
  sma,
  ema,
  rsi,
  macd,
  stochastic,
  adx,
  keltner,
  ttmSqueeze,
  superTrend,
  atrSeries,
  bollinger,
  atr,
};

export function lastFinite(arr: (number | null | undefined)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Zero-allocation O(period) scalar Simple Moving Average at `barsAgo` from the end of `values`.
 * Eliminates full O(N) array allocations when only single point-in-time SMA values are needed.
 */
export function scalarSmaAt(
  values: number[],
  period: number,
  barsAgo = 0,
  decimals?: number,
): number | null {
  const endIdx = values.length - 1 - barsAgo;
  if (period <= 0 || endIdx < period - 1) return null;
  let sum = 0;
  const startIdx = endIdx - period + 1;
  for (let i = startIdx; i <= endIdx; i++) {
    sum += values[i]!;
  }
  const avg = sum / period;
  if (!Number.isFinite(avg)) return null;
  if (decimals != null) {
    const f = 10 ** decimals;
    return Math.round(avg * f) / f;
  }
  return avg;
}

/**
 * Zero-allocation O(N) scalar Exponential Moving Average at the latest bar.
 */
export function scalarEmaLast(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
  }
  return Number.isFinite(prev) ? prev : null;
}

/**
 * Zero-allocation O(period) average volume ending at `endInclusive`.
 */
export function scalarAvgVolume(
  bars: OhlcvBar[],
  period = 20,
  endInclusive = bars.length - 1,
): number | null {
  if (!bars.length || endInclusive < 0) return null;
  const end = Math.min(bars.length - 1, endInclusive);
  const start = Math.max(0, end - period + 1);
  const count = end - start + 1;
  if (count <= 0) return null;
  let sum = 0;
  for (let i = start; i <= end; i++) {
    sum += bars[i]?.volume ?? 0;
  }
  return sum / count;
}

/**
 * Zero-allocation O(1) percentage return over `lookback` bars.
 */
export function scalarPctReturn(values: number[], lookback: number): number | null {
  if (values.length < lookback + 1) return null;
  const a = values[values.length - 1 - lookback];
  const b = values[values.length - 1];
  if (a == null || b == null || a <= 0) return null;
  return ((b - a) / a) * 100;
}

/**
 * Canonical scale-aware price rounding across VN Equities, Forex, and Crypto.
 */
export function roundAdaptivePrice(val: number, refPrice = val): number {
  if (!Number.isFinite(val) || !Number.isFinite(refPrice)) return 0;
  if (refPrice < 0.05) return +val.toFixed(6);
  if (refPrice < 2) return +val.toFixed(5);
  if (refPrice < 20) return +val.toFixed(3);
  return +val.toFixed(2);
}

/**
 * Canonical Wilder RSI scalar value (0..100, rounded to 0.1).
 */
export function calcRsiScalar(values: number[], period = 14, fallback = 50): number {
  if (values.length < period + 1) return fallback;
  const series = rsi(values, period);
  const val = lastFinite(series);
  return val != null ? Math.round(val * 10) / 10 : fallback;
}

/**
 * Canonical MACD snapshot using proper firstValid-sliced EMA signal line (never zero-padding NaNs).
 */
export function calcMacdSnapshot(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): {
  macd: number;
  signal: number;
  hist: number;
  crossAbove: boolean;
} {
  if (values.length < slow) {
    return { macd: 0, signal: 0, hist: 0, crossAbove: false };
  }
  const m = macd(values, fast, slow, signalPeriod);
  const n = values.length;
  const macdVal = m.macd[n - 1] ?? 0;
  const signalVal = m.signal[n - 1] ?? macdVal;
  const prevMacd = n >= 2 ? (m.macd[n - 2] ?? macdVal) : macdVal;
  const prevSignal = n >= 2 ? (m.signal[n - 2] ?? signalVal) : signalVal;
  const hist = macdVal - signalVal;
  const crossAbove = prevMacd <= prevSignal && macdVal > signalVal;

  return {
    macd: Math.round(macdVal * 100) / 100,
    signal: Math.round(signalVal * 100) / 100,
    hist: Math.round(hist * 100) / 100,
    crossAbove,
  };
}

/**
 * Canonical Bollinger Bands snapshot at latest bar.
 */
export function calcBollingerSnapshot(
  values: number[],
  period = 20,
  stdDev = 2,
): {
  upper: number;
  middle: number;
  lower: number;
  percentB: number;
  isBreakout: boolean;
} {
  if (values.length < period) {
    const last = values[values.length - 1] || 10000;
    return {
      upper: last * 1.05,
      middle: last,
      lower: last * 0.95,
      percentB: 0.5,
      isBreakout: false,
    };
  }
  const bb = bollinger(values, period, stdDev);
  const n = values.length;
  const middle = Math.round(bb.mid[n - 1] ?? values[n - 1]);
  const upper = Math.round(bb.upper[n - 1] ?? middle * 1.05);
  const lower = Math.round(bb.lower[n - 1] ?? middle * 0.95);
  const current = values[n - 1];
  const percentB =
    upper !== lower ? Math.round(((current - lower) / (upper - lower)) * 100) / 100 : 0.5;
  const isBreakout = current >= upper;

  return { upper, middle, lower, percentB, isBreakout };
}

/**
 * Canonical Money Flow Index (MFI 14) scalar value (0..100).
 */
export function calcMfiScalar(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  period = 14,
  fallback = 45,
): number {
  if (closes.length < period + 1) return fallback;
  let posMoney = 0;
  let negMoney = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const prevTp = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
    const rawMoney = tp * (volumes[i] ?? 0);
    if (tp >= prevTp) posMoney += rawMoney;
    else negMoney += rawMoney;
  }
  if (negMoney === 0) return posMoney > 0 ? 100 : fallback;
  const moneyRatio = posMoney / negMoney;
  return Math.round((100 - 100 / (1 + moneyRatio)) * 10) / 10;
}

export interface PrecomputedTaBundle {
  closes: number[];
  highs: number[];
  lows: number[];
  vols: number[];
  ohlcvBars: OhlcvBar[];
  sma10Series: (number | null)[];
  sma20Series: (number | null)[];
  sma50Series: (number | null)[];
  volSma20Series: (number | null)[];
  atr14: number | null;
}

/**
 * Single-pass O(N) extraction and shared indicator precomputation for a stock's OHLCV history.
 */
export function buildPrecomputedTaBundle(
  bars?: {
    open?: number;
    high?: number;
    low?: number;
    close: number;
    volume: number;
    time?: number;
  }[],
): PrecomputedTaBundle {
  const n = bars ? bars.length : 0;
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const vols: number[] = [];
  const rawVolumes: number[] = [];
  const ohlcvBars: OhlcvBar[] = [];

  let trSum14 = 0;
  let trCount14 = 0;

  for (let i = 0; i < n; i++) {
    const b = bars![i];
    const c = b.close;
    if (!Number.isFinite(c) || c <= 0) continue;
    const h = b.high != null && Number.isFinite(b.high) && b.high > 0 ? b.high : c;
    const l = b.low != null && Number.isFinite(b.low) && b.low > 0 ? b.low : c;
    const o = b.open != null && Number.isFinite(b.open) && b.open > 0 ? b.open : c;
    const v = b.volume ?? 0;
    const t = b.time ?? i;

    const idx = closes.length;
    if (idx > 0 && idx >= n - 14) {
      const prevC = closes[idx - 1];
      trSum14 += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      trCount14++;
    }

    closes.push(c);
    highs.push(h);
    lows.push(l);
    rawVolumes.push(v);
    if (v > 0) vols.push(v);
    ohlcvBars.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
  }

  const sma10Series = closes.length >= 10 ? sma(closes, 10) : new Array(closes.length).fill(null);
  const sma20Series = closes.length >= 20 ? sma(closes, 20) : new Array(closes.length).fill(null);
  const sma50Series = closes.length >= 50 ? sma(closes, 50) : new Array(closes.length).fill(null);
  const volSma20Series =
    rawVolumes.length >= 20 ? sma(rawVolumes, 20) : new Array(rawVolumes.length).fill(null);
  const atr14 = trCount14 > 0 ? trSum14 / trCount14 : null;

  return {
    closes,
    highs,
    lows,
    vols,
    ohlcvBars,
    sma10Series,
    sma20Series,
    sma50Series,
    volSma20Series,
    atr14,
  };
}

export interface SharedBarContext {
  bars: OhlcvBar[];
  n: number;
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  ema9: (number | null)[];
  ema21: (number | null)[];
  atr14Series: (number | null)[];
  atr14: number | null;
  rsi14Series: (number | null)[];
  rsi14: number | null;
  adx14Series: (number | null)[];
  adx14: number | null;
  macdFull: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
  efficiencyRatio14: number;
}

/**
 * Single-pass O(N) shared microstructure & oscillator bundle for FX, Crypto & Derivatives.
 * Eliminates repeated .map() passes and O(N^2) rolling indicator recalculations across gates.
 */
export function buildSharedBarContext(bars: OhlcvBar[]): SharedBarContext {
  const n = bars.length;
  const closes = new Array<number>(n);
  const highs = new Array<number>(n);
  const lows = new Array<number>(n);
  const volumes = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    closes[i] = b.close;
    highs[i] = b.high;
    lows[i] = b.low;
    volumes[i] = b.volume ?? 0;
  }

  const ema9 = n >= 9 ? ema(closes, 9) : new Array(n).fill(null);
  const ema21 = n >= 21 ? ema(closes, 21) : new Array(n).fill(null);
  const atr14Series = n >= 15 ? atrSeries(highs, lows, closes, 14) : new Array(n).fill(null);
  const rsi14Series = n >= 15 ? rsi(closes, 14) : new Array(n).fill(null);
  const adxPeriod = n >= 28 ? 14 : Math.max(5, Math.floor(n / 2) - 1);
  const adx14Series = n >= 10 ? adx(highs, lows, closes, adxPeriod).adx : new Array(n).fill(null);
  const macdFull = n >= 26 ? macd(closes) : {
    macd: new Array(n).fill(null),
    signal: new Array(n).fill(null),
    histogram: new Array(n).fill(null),
  };

  let efficiencyRatio14 = 0.35;
  if (n >= 15) {
    const start = n - 15;
    const netChange = Math.abs(closes[n - 1]! - closes[start]!);
    let pathSum = 0;
    for (let i = start + 1; i < n; i++) {
      pathSum += Math.abs(closes[i]! - closes[i - 1]!);
    }
    efficiencyRatio14 = pathSum > 0 ? Math.min(1, netChange / pathSum) : 0;
  }

  return {
    bars,
    n,
    closes,
    highs,
    lows,
    volumes,
    ema9,
    ema21,
    atr14Series,
    atr14: n > 0 ? (atr14Series[n - 1] ?? null) : null,
    rsi14Series,
    rsi14: n > 0 ? (rsi14Series[n - 1] ?? null) : null,
    adx14Series,
    adx14: n > 0 ? (adx14Series[n - 1] ?? null) : null,
    macdFull,
    efficiencyRatio14,
  };
}
