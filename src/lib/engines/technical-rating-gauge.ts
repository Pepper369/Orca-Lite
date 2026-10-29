import type { OhlcvBar } from "@/lib/types";
import { sma, ema, rsi, macd, adx } from "./oscillators";
import { bollinger } from "@/lib/technical";

export type GaugeVerdict = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

export interface IndicatorVerdict {
  name: string;
  value: number | null;
  action: "BUY" | "SELL" | "NEUTRAL";
}

export interface GaugeSummary {
  verdict: GaugeVerdict;
  score: number; // Normalized -1.0 (Strong Sell) to +1.0 (Strong Buy)
  buy: number;
  sell: number;
  neutral: number;
}

export interface TechnicalGaugeReport {
  symbol: string;
  summary: GaugeSummary;
  oscillators: GaugeSummary & { details: IndicatorVerdict[] };
  movingAverages: GaugeSummary & { details: IndicatorVerdict[] };
}

function resolveSummary(buy: number, sell: number, neutral: number): GaugeSummary {
  const total = buy + sell + neutral;
  if (total === 0) return { verdict: "NEUTRAL", score: 0, buy: 0, sell: 0, neutral: 0 };

  const score = (buy - sell) / total;
  let verdict: GaugeVerdict = "NEUTRAL";

  if (score >= 0.5) verdict = "STRONG_BUY";
  else if (score >= 0.1) verdict = "BUY";
  else if (score <= -0.5) verdict = "STRONG_SELL";
  else if (score <= -0.1) verdict = "SELL";

  return { verdict, score, buy, sell, neutral };
}

/**
 * Computes Commodity Channel Index (CCI)
 */
function computeCci(highs: number[], lows: number[], closes: number[], period = 20): (number | null)[] {
  const n = closes.length;
  const tp: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    tp[i] = (highs[i]! + lows[i]! + closes[i]!) / 3;
  }
  const smaTp = sma(tp, period);
  const out: (number | null)[] = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const mean = smaTp[i];
    if (mean == null) continue;
    let sumDev = 0;
    for (let j = 0; j < period; j++) {
      sumDev += Math.abs(tp[i - j]! - mean);
    }
    const meanDev = sumDev / period;
    if (meanDev === 0) out[i] = 0;
    else out[i] = (tp[i]! - mean) / (0.015 * meanDev);
  }
  return out;
}

/**
 * Computes TradingView 26-Indicator Technical Rating Gauge
 */
export function calculateTechnicalGauge(symbol: string, bars: OhlcvBar[]): TechnicalGaugeReport {
  const n = bars.length;
  if (n < 50) {
    const emptySummary = { verdict: "NEUTRAL" as const, score: 0, buy: 0, sell: 0, neutral: 0 };
    return {
      symbol,
      summary: emptySummary,
      oscillators: { ...emptySummary, details: [] },
      movingAverages: { ...emptySummary, details: [] },
    };
  }

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const lastClose = closes[n - 1]!;

  // -------------------------------------------------------------
  // 1. OSCILLATORS (11 indicators)
  // -------------------------------------------------------------
  const oscDetails: IndicatorVerdict[] = [];

  // 1.1 RSI (14)
  const rsiValues = rsi(closes, 14);
  const lastRsi = rsiValues[n - 1];
  let rsiAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (lastRsi != null) {
    if (lastRsi < 30) rsiAction = "BUY";
    else if (lastRsi > 70) rsiAction = "SELL";
  }
  oscDetails.push({ name: "RSI (14)", value: lastRsi, action: rsiAction });

  // 1.2 Stochastic %K(14, 3)
  const stochK = (() => {
    const lookback = 14;
    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (let i = n - lookback; i < n; i++) {
      if (lows[i]! < minLow) minLow = lows[i]!;
      if (highs[i]! > maxHigh) maxHigh = highs[i]!;
    }
    if (maxHigh === minLow) return 50;
    return ((lastClose - minLow) / (maxHigh - minLow)) * 100;
  })();
  let stochAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (stochK < 20) stochAction = "BUY";
  else if (stochK > 80) stochAction = "SELL";
  oscDetails.push({ name: "Stochastic %K (14, 3, 3)", value: stochK, action: stochAction });

  // 1.3 CCI (20)
  const cciValues = computeCci(highs, lows, closes, 20);
  const lastCci = cciValues[n - 1];
  let cciAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (lastCci != null) {
    if (lastCci < -100) cciAction = "BUY";
    else if (lastCci > 100) cciAction = "SELL";
  }
  oscDetails.push({ name: "CCI (20)", value: lastCci, action: cciAction });

  // 1.4 ADX (14)
  const adxResult = adx(highs, lows, closes, 14);
  const lastAdx = adxResult.adx[n - 1];
  const lastPlusDi = adxResult.plusDi[n - 1];
  const lastMinusDi = adxResult.minusDi[n - 1];
  let adxAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (lastAdx != null && lastAdx > 20 && lastPlusDi != null && lastMinusDi != null) {
    if (lastPlusDi > lastMinusDi) adxAction = "BUY";
    else if (lastPlusDi < lastMinusDi) adxAction = "SELL";
  }
  oscDetails.push({ name: "ADX (14)", value: lastAdx, action: adxAction });

  // 1.5 MACD Level (12, 26)
  const macdData = macd(closes, 12, 26, 9);
  const lastMacdLine = macdData.macd[n - 1];
  const lastSignalLine = macdData.signal[n - 1];
  let macdAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (lastMacdLine != null && lastSignalLine != null) {
    if (lastMacdLine > lastSignalLine) macdAction = "BUY";
    else if (lastMacdLine < lastSignalLine) macdAction = "SELL";
  }
  oscDetails.push({ name: "MACD (12, 26)", value: lastMacdLine, action: macdAction });

  // 1.6 Momentum (10)
  const mom10 = closes[n - 1]! - (closes[n - 11] ?? closes[0]!);
  const momAction: "BUY" | "SELL" | "NEUTRAL" = mom10 > 0 ? "BUY" : mom10 < 0 ? "SELL" : "NEUTRAL";
  oscDetails.push({ name: "Momentum (10)", value: mom10, action: momAction });

  // 1.7 Awesome Oscillator (AO: SMA 5 - SMA 34 of Median Price)
  const medians = bars.map((b) => (b.high + b.low) / 2);
  const sma5Med = sma(medians, 5)[n - 1] ?? 0;
  const sma34Med = sma(medians, 34)[n - 1] ?? 0;
  const ao = sma5Med - sma34Med;
  const aoAction: "BUY" | "SELL" | "NEUTRAL" = ao > 0 ? "BUY" : ao < 0 ? "SELL" : "NEUTRAL";
  oscDetails.push({ name: "Awesome Oscillator", value: ao, action: aoAction });

  // 1.8 Williams %R (14)
  const willR = stochK - 100;
  let willAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (willR < -80) willAction = "BUY";
  else if (willR > -20) willAction = "SELL";
  oscDetails.push({ name: "Williams %R (14)", value: willR, action: willAction });

  // 1.9 Bollinger Bands %B
  const bb = bollinger(closes, 20, 2);
  const bbUpper = bb.upper[n - 1];
  const bbLower = bb.lower[n - 1];
  let bbAction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  if (bbUpper != null && bbLower != null && bbUpper > bbLower) {
    if (lastClose < bbLower) bbAction = "BUY";
    else if (lastClose > bbUpper) bbAction = "SELL";
  }
  oscDetails.push({ name: "Bollinger Bands", value: lastClose, action: bbAction });

  // Summarize Oscillators
  let oscBuy = 0;
  let oscSell = 0;
  let oscNeutral = 0;
  for (const o of oscDetails) {
    if (o.action === "BUY") oscBuy++;
    else if (o.action === "SELL") oscSell++;
    else oscNeutral++;
  }
  const oscillatorsSummary = {
    ...resolveSummary(oscBuy, oscSell, oscNeutral),
    details: oscDetails,
  };

  // -------------------------------------------------------------
  // 2. MOVING AVERAGES (15 indicators)
  // -------------------------------------------------------------
  const maPeriods = [10, 20, 30, 50, 100, 200];
  const maDetails: IndicatorVerdict[] = [];

  for (const p of maPeriods) {
    if (n >= p) {
      // EMA
      const emaArr = ema(closes, p);
      const lastEma = emaArr[n - 1];
      const emaAction: "BUY" | "SELL" | "NEUTRAL" =
        lastEma != null && lastClose > lastEma ? "BUY" : lastEma != null && lastClose < lastEma ? "SELL" : "NEUTRAL";
      maDetails.push({ name: `EMA (${p})`, value: lastEma, action: emaAction });

      // SMA
      const smaArr = sma(closes, p);
      const lastSma = smaArr[n - 1];
      const smaAction: "BUY" | "SELL" | "NEUTRAL" =
        lastSma != null && lastClose > lastSma ? "BUY" : lastSma != null && lastClose < lastSma ? "SELL" : "NEUTRAL";
      maDetails.push({ name: `SMA (${p})`, value: lastSma, action: smaAction });
    }
  }

  // Ichimoku Baseline (26-period midpoint)
  const ichimokuBase = (() => {
    let minL = Infinity;
    let maxH = -Infinity;
    for (let i = n - 26; i < n; i++) {
      if (lows[i]! < minL) minL = lows[i]!;
      if (highs[i]! > maxH) maxH = highs[i]!;
    }
    return (minL + maxH) / 2;
  })();
  const ichiAction: "BUY" | "SELL" | "NEUTRAL" =
    lastClose > ichimokuBase ? "BUY" : lastClose < ichimokuBase ? "SELL" : "NEUTRAL";
  maDetails.push({ name: "Ichimoku Base Line (26)", value: ichimokuBase, action: ichiAction });

  // VWMA (Volume Weighted Moving Average, 20)
  const vwma20 = (() => {
    let sumPv = 0;
    let sumV = 0;
    for (let i = n - 20; i < n; i++) {
      const vol = bars[i]!.volume || 1;
      sumPv += closes[i]! * vol;
      sumV += vol;
    }
    return sumV > 0 ? sumPv / sumV : lastClose;
  })();
  const vwmaAction: "BUY" | "SELL" | "NEUTRAL" =
    lastClose > vwma20 ? "BUY" : lastClose < vwma20 ? "SELL" : "NEUTRAL";
  maDetails.push({ name: "VWMA (20)", value: vwma20, action: vwmaAction });

  // Summarize Moving Averages
  let maBuy = 0;
  let maSell = 0;
  let maNeutral = 0;
  for (const m of maDetails) {
    if (m.action === "BUY") maBuy++;
    else if (m.action === "SELL") maSell++;
    else maNeutral++;
  }
  const movingAveragesSummary = {
    ...resolveSummary(maBuy, maSell, maNeutral),
    details: maDetails,
  };

  // -------------------------------------------------------------
  // 3. OVERALL COMPOSITE SUMMARY
  // -------------------------------------------------------------
  const totalBuy = oscBuy + maBuy;
  const totalSell = oscSell + maSell;
  const totalNeutral = oscNeutral + maNeutral;
  const overallSummary = resolveSummary(totalBuy, totalSell, totalNeutral);

  return {
    symbol,
    summary: overallSummary,
    oscillators: oscillatorsSummary,
    movingAverages: movingAveragesSummary,
  };
}

