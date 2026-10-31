import type { OhlcvBar } from "../types";
import type { DetectedCandlePattern } from "../engines/candlestick-patterns";
import { rsi as rsiSeries, sma, ema } from "../engines/oscillators";
import { bollinger } from "../technical";
import { detectDivergences } from "../engines/divergence";

export type TechContext = {
  rsi14: number | null;
  vsSma20Pct: number | null;
  vsSma50Pct: number | null;
  volRatio: number | null;
  trend: "up" | "down" | "sideways" | "unknown";
  atrPct: number | null;
  macdHist: number | null;
  bodyAtr: number | null;
  distTo20dLowPct: number | null;
  distTo50dLowPct: number | null;
  atLowerBb: boolean;
  atUpperBb: boolean;
  volClimax: boolean;
  volDryUp: boolean;
  rsiBullishDiv: boolean;
  rsiBearishDiv: boolean;
};

function lastFinite(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function atr14(bars: OhlcvBar[]): number | null {
  if (bars.length < 16) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i]!.high;
    const l = bars[i]!.low;
    const pc = bars[i - 1]!.close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < 14) return null;
  let avg = 0;
  for (let i = 0; i < 14; i++) avg += trs[i]!;
  avg /= 14;
  for (let i = 14; i < trs.length; i++) {
    avg = (avg * 13 + trs[i]!) / 14;
  }
  return avg;
}

export function extractTechContext(bars: OhlcvBar[]): TechContext {
  if (!bars.length) {
    return {
      rsi14: null,
      vsSma20Pct: null,
      vsSma50Pct: null,
      volRatio: null,
      trend: "unknown",
      atrPct: null,
      macdHist: null,
      bodyAtr: null,
      distTo20dLowPct: null,
      distTo50dLowPct: null,
      atLowerBb: false,
      atUpperBb: false,
      volClimax: false,
      volDryUp: false,
      rsiBullishDiv: false,
      rsiBearishDiv: false,
    };
  }
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0));
  const close = closes[closes.length - 1]!;
  const last = bars[bars.length - 1]!;

  const rsiArr = rsiSeries(closes, 14);
  const rsi14 = lastFinite(rsiArr);

  const s20 = lastFinite(sma(closes, 20));
  const s50 = lastFinite(sma(closes, 50));
  const vsSma20Pct = s20 != null && s20 > 0 ? ((close - s20) / s20) * 100 : null;
  const vsSma50Pct = s50 != null && s50 > 0 ? ((close - s50) / s50) * 100 : null;

  const volSma = lastFinite(sma(vols, 20));
  const lastVol = vols[vols.length - 1] ?? 0;
  const volRatio = volSma != null && volSma > 0 ? lastVol / volSma : null;

  let trend: TechContext["trend"] = "unknown";
  if (s20 != null && s50 != null) {
    if (close > s20 && s20 > s50) trend = "up";
    else if (close < s20 && s20 < s50) trend = "down";
    else trend = "sideways";
  }

  const atr = atr14(bars);
  const atrPct = atr != null && close > 0 ? (atr / close) * 100 : null;
  const body = Math.abs(last.close - last.open);
  const bodyAtr = atr != null && atr > 0 ? body / atr : null;

  let macdHist: number | null = null;
  if (closes.length >= 35) {
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    const macdLine: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (e12[i] != null && e26[i] != null) macdLine.push((e12[i] as number) - (e26[i] as number));
      else macdLine.push(NaN);
    }
    const sig = ema(
      macdLine.map((v) => (Number.isFinite(v) ? v : 0)),
      9,
    );
    const li = closes.length - 1;
    if (Number.isFinite(macdLine[li]!) && sig[li] != null) {
      macdHist = (macdLine[li] as number) - (sig[li] as number);
    }
  }

  // 1. Khoảng cách tới đáy 20 phiên & 50 phiên
  const slice20 = bars.slice(-20);
  const lows20 = slice20.map((b) => b.low).filter((v) => Number.isFinite(v) && v > 0);
  const low20 = lows20.length ? Math.min(...lows20) : null;
  const distTo20dLowPct = low20 != null && low20 > 0 ? ((close - low20) / low20) * 100 : null;

  const slice50 = bars.slice(-50);
  const lows50 = slice50.map((b) => b.low).filter((v) => Number.isFinite(v) && v > 0);
  const low50 = lows50.length ? Math.min(...lows50) : null;
  const distTo50dLowPct = low50 != null && low50 > 0 ? ((close - low50) / low50) * 100 : null;

  // 2. Chạm dải Bollinger Bands (20, 2)
  let atLowerBb = false;
  let atUpperBb = false;
  if (closes.length >= 20) {
    const { lower: bbLowerArr, upper: bbUpperArr } = bollinger(closes, 20, 2);
    const bbLower = lastFinite(bbLowerArr);
    const bbUpper = lastFinite(bbUpperArr);
    if (bbLower != null) {
      atLowerBb = close <= bbLower * 1.01 || last.low <= bbLower;
    }
    if (bbUpper != null) {
      atUpperBb = close >= bbUpper * 0.99 || last.high >= bbUpper;
    }
  }

  // 3. Khối lượng đột biến gom hàng (Climax) hoặc cạn kiệt cung (Dry-up)
  const volClimax = volRatio != null && volRatio >= 1.8;
  const volDryUp = volRatio != null && volRatio <= 0.65;

  // 4. Phân kỳ động lượng (Divergence confluence)
  let rsiBullishDiv = false;
  let rsiBearishDiv = false;
  if (bars.length >= 25) {
    try {
      const divs = detectDivergences(bars, { window: "short_3_4d", maxSignals: 4, maxAgeBarsFromEnd: 5 });
      rsiBullishDiv = divs.some(
        (d) => d.kind === "regular_bullish" && (d.oscillator === "rsi" || d.oscillator === "macd_hist"),
      );
      rsiBearishDiv = divs.some(
        (d) => d.kind === "regular_bearish" && (d.oscillator === "rsi" || d.oscillator === "macd_hist"),
      );
    } catch {
      // Safe fallback
    }
  }

  return {
    rsi14,
    vsSma20Pct,
    vsSma50Pct,
    volRatio,
    trend,
    atrPct,
    macdHist,
    bodyAtr,
    distTo20dLowPct,
    distTo50dLowPct,
    atLowerBb,
    atUpperBb,
    volClimax,
    volDryUp,
    rsiBullishDiv,
    rsiBearishDiv,
  };
}

export function contextBoostPattern(p: DetectedCandlePattern, ctx: TechContext): number {
  let s = p.score;
  const bull = p.type === "bullish";
  const bear = p.type === "bearish";
  const reversal =
    p.category === "bullish_reversal" || p.category === "bearish_reversal";

  if (reversal) {
    if (bull && ctx.trend === "down") s += 6;
    if (bear && ctx.trend === "up") s += 6;
    if (bull && ctx.trend === "up") s -= 4;
    if (bear && ctx.trend === "down") s -= 4;

    // Confluence tăng cường cho Đảo chiều Tăng từ Đáy (Bullish Bottom Reversals)
    if (bull) {
      // Sát đáy 20 phiên
      if (ctx.distTo20dLowPct != null && ctx.distTo20dLowPct <= 2.5) s += 6;
      else if (ctx.distTo20dLowPct != null && ctx.distTo20dLowPct <= 5.0) s += 3;

      // Phản ứng hỗ trợ dải dưới Bollinger Bands
      if (ctx.atLowerBb) s += 5;

      // Volume gom hàng cao trào hoặc cạn cung tại đáy
      if (ctx.volClimax) s += 7;
      else if (ctx.volDryUp && (p.name.includes("Harami") || p.name.includes("Doji") || p.name.includes("Tweezer"))) s += 5;

      // Phân kỳ dương RSI / MACD đáy
      if (ctx.rsiBullishDiv) s += 8;
    }

    // Confluence tăng cường cho Đảo chiều Giảm từ Đỉnh (Bearish Top Reversals)
    if (bear) {
      if (ctx.atUpperBb) s += 5;
      if (ctx.volClimax) s += 4;
      if (ctx.rsiBearishDiv) s += 8;
    }
  } else if (p.category === "continuation") {
    if (bull && ctx.trend === "up") s += 5;
    if (bear && ctx.trend === "down") s += 5;
  }

  if (ctx.rsi14 != null) {
    if (bull && ctx.rsi14 <= 32) s += 9;
    else if (bull && ctx.rsi14 <= 42) s += 4;
    else if (bull && ctx.rsi14 >= 68) s -= 7;
    if (bear && ctx.rsi14 >= 68) s += 9;
    else if (bear && ctx.rsi14 >= 58) s += 4;
    else if (bear && ctx.rsi14 <= 32) s -= 7;
  }

  if (p.volumeConfirmed) s += 5;
  if (ctx.volRatio != null) {
    if (ctx.volRatio >= 1.5) s += 6;
    else if (ctx.volRatio >= 1.15) s += 3;
    else if (ctx.volRatio < 0.65) s -= 4;
  }

  if (ctx.bodyAtr != null) {
    if (ctx.bodyAtr >= 1.0) s += 4;
    else if (ctx.bodyAtr < 0.25) s -= 5;
  }

  if (ctx.atrPct != null && ctx.atrPct < 0.4) s -= 4;

  if ((p.ageBars ?? 0) === 0) s += 2;
  else if ((p.ageBars ?? 0) >= 3) s -= 4;

  if (ctx.macdHist != null) {
    if (bull && ctx.macdHist > 0) s += 3;
    if (bear && ctx.macdHist < 0) s += 3;
  }

  if (p.reliability === "very_high") s += 3;
  else if (p.reliability === "low") s -= 5;

  return Math.max(0, Math.min(100, Math.round(s)));
}

export function rankPatternsWithContext(
  patterns: DetectedCandlePattern[],
  bars: OhlcvBar[],
): DetectedCandlePattern[] {
  const ctx = extractTechContext(bars);
  const scored = patterns.map((p) => ({
    ...p,
    score: contextBoostPattern(p, ctx),
  }));
  scored.sort((a, b) => {
    const ra = a.category.includes("reversal") ? 1 : 0;
    const rb = b.category.includes("reversal") ? 1 : 0;
    if (rb !== ra) return rb - ra;
    const ageA = a.ageBars ?? 0;
    const ageB = b.ageBars ?? 0;
    if (ageA !== ageB) return ageA - ageB;
    return b.score - a.score;
  });
  return scored;
}
