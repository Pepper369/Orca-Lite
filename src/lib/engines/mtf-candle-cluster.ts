import type { OhlcvBar, Quote } from "../types";
import { detectCandlePatterns, type DetectedCandlePattern } from "./candlestick-patterns";
import { resampleWeeklyBars } from "./mtf-consensus";

export type MtfCandleClusterStatus = "TRIPLE_BULL" | "DUAL_BULL" | "CONFIRMED_D1" | "NO_CLUSTER";
export type VsaSignalType = "NO_SUPPLY" | "STOPPING_VOLUME" | "ABSORPTION" | null;

export interface MtfCandleClusterResult {
  clusterStatus: MtfCandleClusterStatus;
  clusterScore: number; // 0 - 100
  clusterBadgeVi: string;
  d1Pattern: DetectedCandlePattern | null;
  w1Pattern: DetectedCandlePattern | null;
  h1PatternName: string | null;
  h1Bias: "BULL" | "NEUTRAL" | "BEAR";
  vsaSignal: VsaSignalType;
  vsaSignalVi: string | null;
  overheadRoomPct: number | null;
  nearestResistance: number | null;
  ageBars: number; // 0 = today, 1 = T+1, etc.
}

export type MtfCandleQuoteInput = {
  price?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  changePercent?: number | null;
  [key: string]: any;
};

export interface MtfCandleInput {
  dailyBars: OhlcvBar[];
  quote?: MtfCandleQuoteInput | null;
  ma20?: number | null;
  ma50?: number | null;
}

/**
 * Evaluates Multi-Timeframe Candlestick & VSA Clusters on the latest sessions (T+0 to T+2).
 */
export function evaluateMtfCandleCluster(input: MtfCandleInput): MtfCandleClusterResult {
  const { dailyBars, quote, ma20 } = input;
  const n = dailyBars?.length ?? 0;

  if (n < 10) {
    return {
      clusterStatus: "NO_CLUSTER",
      clusterScore: 30,
      clusterBadgeVi: "Chưa đủ nến",
      d1Pattern: null,
      w1Pattern: null,
      h1PatternName: null,
      h1Bias: "NEUTRAL",
      vsaSignal: null,
      vsaSignalVi: null,
      overheadRoomPct: null,
      nearestResistance: null,
      ageBars: 99,
    };
  }

  const currentPrice = quote?.price && quote.price > 0 ? quote.price : dailyBars[n - 1].close;

  // 1. Detect D1 (Daily) Candlestick Patterns in the latest 1-3 bars
  const d1Patterns = detectCandlePatterns(dailyBars, {
    assetClass: "stock",
    recentBars: 3,
    maxAgeBars: 3,
  });

  const bestD1 = d1Patterns.find((p) => p.type === "bullish") ?? null;
  const d1Age = bestD1?.ageBars ?? 0;

  // 2. Resample & Detect W1 (Weekly) Candlestick Patterns in the latest 1-2 weeks
  const weeklyBars = resampleWeeklyBars(dailyBars);
  let bestW1: DetectedCandlePattern | null = null;
  if (weeklyBars.length >= 4) {
    const w1Patterns = detectCandlePatterns(weeklyBars, {
      assetClass: "stock",
      recentBars: 2,
      maxAgeBars: 2,
    });
    bestW1 = w1Patterns.find((p) => p.type === "bullish") ?? null;
  }

  // 3. Intraday / H1 Candle Shape and Execution Trigger
  let h1PatternName: string | null = null;
  let h1Bias: "BULL" | "NEUTRAL" | "BEAR" = "NEUTRAL";

  if (quote && quote.price && quote.open && quote.high && quote.low) {
    const p = quote.price;
    const o = quote.open;
    const h = quote.high;
    const l = quote.low;
    const range = Math.max(0.01, h - l);
    const body = Math.abs(p - o);
    const lowerShadow = Math.min(p, o) - l;
    const upperShadow = h - Math.max(p, o);

    if (p > o && lowerShadow >= 1.5 * body && lowerShadow / range >= 0.45) {
      h1PatternName = "H1 Pinbar Rút Chân";
      h1Bias = "BULL";
    } else if (p >= h * 0.995 && (quote.changePercent ?? 0) >= 1.2) {
      h1PatternName = "H1 Bứt Phá Đỉnh Phiên";
      h1Bias = "BULL";
    } else if (p > o && (quote.changePercent ?? 0) > 0) {
      h1PatternName = "H1 Nến Xanh Tăng Điểm";
      h1Bias = "BULL";
    } else if (p < o && upperShadow >= 1.8 * body) {
      h1PatternName = "H1 Bị Từ Chối Đỉnh (Râu Trên)";
      h1Bias = "BEAR";
    } else if (p < o && (quote.changePercent ?? 0) <= -1.5) {
      h1PatternName = "H1 Áp Lực Bán Đỏ";
      h1Bias = "BEAR";
    }
  } else {
    // Fallback using last closed bar
    const lastBar = dailyBars[n - 1];
    if (lastBar.close > lastBar.open) {
      h1Bias = "BULL";
      h1PatternName = "D1 Nến Tăng";
    }
  }

  // 4. VSA (Volume Spread Analysis) Signal Detection on latest bar (T+0 / T+1)
  let vsaSignal: VsaSignalType = null;
  let vsaSignalVi: string | null = null;

  if (n >= 20) {
    const curBar = dailyBars[n - 1];
    const prevBar = dailyBars[n - 2];
    const curSpread = curBar.high - curBar.low;

    // Average 20-day volume and spread
    let sumVol20 = 0;
    let sumSpread20 = 0;
    for (let i = n - 20; i < n; i++) {
      sumVol20 += dailyBars[i].volume ?? 0;
      sumSpread20 += dailyBars[i].high - dailyBars[i].low;
    }
    const avgVol20 = sumVol20 / 20;
    const avgSpread20 = sumSpread20 / 20;
    const curVol = quote?.volume ?? curBar.volume ?? 0;

    // Condition A: No Supply Test (Kiểm tra cạn cung)
    // Thân nến hẹp (< 0.75x avgSpread), Vol cạn (< 0.65x avgVol), giá giữ vững trên MA20
    const isAboveMa = ma20 ? currentPrice >= ma20 * 0.98 : true;
    if (
      curSpread <= avgSpread20 * 0.78 &&
      curVol <= avgVol20 * 0.68 &&
      curVol > 0 &&
      isAboveMa
    ) {
      vsaSignal = "NO_SUPPLY";
      vsaSignalVi = "Cạn cung (No Supply Test)";
    }
    // Condition B: Stopping Volume (Lực cầu hấp thụ bắt đáy)
    // Nến giảm sâu nhưng rút chân mạnh, volume đột biến > 1.35x avgVol20
    else if (
      curBar.low < prevBar.low &&
      curBar.close >= (curBar.high + curBar.low) / 2 &&
      curVol >= avgVol20 * 1.35
    ) {
      vsaSignal = "STOPPING_VOLUME";
      vsaSignalVi = "Cầu hấp thụ đáy (Stopping Vol)";
    }
    // Condition C: Absorption Breakout (Bứt phá dứt khoát)
    else if (
      curBar.close > prevBar.high &&
      curBar.close > curBar.open &&
      curVol >= avgVol20 * 1.25
    ) {
      vsaSignal = "ABSORPTION";
      vsaSignalVi = "Hấp thụ bứt phá (SOS Breakout)";
    }
  }

  // 5. Overhead Resistance Room Calculation (Dư địa tăng đến cản)
  let nearestResistance: number | null = null;
  let overheadRoomPct: number | null = null;

  if (n >= 15) {
    const lookback = Math.min(n, 60);
    let maxHigh = 0;
    for (let i = n - lookback; i < n; i++) {
      if (dailyBars[i].high > maxHigh) {
        maxHigh = dailyBars[i].high;
      }
    }
    // If current price is near or breaking 60-day high, check 120-day high
    if (currentPrice >= maxHigh * 0.98 && n >= 100) {
      const lookback120 = Math.min(n, 120);
      let maxHigh120 = 0;
      for (let i = n - lookback120; i < n; i++) {
        if (dailyBars[i].high > maxHigh120) maxHigh120 = dailyBars[i].high;
      }
      nearestResistance = maxHigh120 > maxHigh ? maxHigh120 : Number((currentPrice * 1.15).toFixed(2));
    } else {
      nearestResistance = maxHigh;
    }

    if (nearestResistance && nearestResistance > 0 && currentPrice > 0) {
      overheadRoomPct = Number((((nearestResistance - currentPrice) / currentPrice) * 100).toFixed(1));
    }
  }

  // 6. Synthesize Multi-Timeframe Candlestick Cluster Status & Score
  let clusterStatus: MtfCandleClusterStatus = "NO_CLUSTER";
  let clusterScore = 40;
  let clusterBadgeVi = "Không có cụm nến";

  const isD1Bull = Boolean(bestD1);
  const isW1Bull = Boolean(bestW1);
  const isH1Bull = h1Bias === "BULL";

  if (isD1Bull && isW1Bull && isH1Bull) {
    clusterStatus = "TRIPLE_BULL";
    clusterScore = 95;
    clusterBadgeVi = "Cụm 3 Khung H1+D1+W1 (Tối ưu)";
  } else if ((isD1Bull && isW1Bull) || (isD1Bull && isH1Bull)) {
    clusterStatus = "DUAL_BULL";
    clusterScore = 80;
    clusterBadgeVi = isW1Bull ? "Đồng thuận D1+W1" : "Đồng thuận H1+D1";
  } else if (isD1Bull) {
    clusterStatus = "CONFIRMED_D1";
    clusterScore = 65;
    clusterBadgeVi = `Đảo chiều D1 (T+${d1Age})`;
  } else if (vsaSignal === "NO_SUPPLY") {
    clusterScore = 60;
    clusterBadgeVi = "Cạn cung tại hỗ trợ";
  }

  // Bonus for VSA confirmation
  if (vsaSignal) {
    clusterScore = Math.min(100, clusterScore + 8);
  }

  return {
    clusterStatus,
    clusterScore,
    clusterBadgeVi,
    d1Pattern: bestD1,
    w1Pattern: bestW1,
    h1PatternName,
    h1Bias,
    vsaSignal,
    vsaSignalVi,
    overheadRoomPct,
    nearestResistance,
    ageBars: d1Age,
  };
}
