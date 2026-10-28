import type { OhlcvBar } from "../types";
import { sma } from "./oscillators";

/**
 * Chart Pattern & Volume Spread Analysis (VSA) Engine.
 * Multi-bar geometric formations and smart money flow signals.
 */

export type ChartPatternKind =
  | "vcp"
  | "cup_with_handle"
  | "double_bottom"
  | "bull_flag"
  | "no_supply"
  | "shakeout"
  | "pocket_pivot";

export type PatternReliability = "very_high" | "high" | "medium";

export interface DetectedChartPattern {
  kind: ChartPatternKind;
  name: string;
  nameVi: string;
  type: "bullish" | "bearish";
  score: number; // 0 - 100
  reliability: PatternReliability;
  breakoutPrice: number | null;
  stopLossPrice: number | null;
  targetPrice: number | null;
  description: string;
  confirmation: string;
  ageBars: number; // Bars since pattern completed / triggered
  contractions?: number; // For VCP
  volumeDrying?: boolean;
}

export interface ChartPatternOptions {
  lookback?: number; // Total bars to analyze (default: 90)
  minScore?: number; // Filter low confidence patterns (default: 55)
}

function findLocalPivots(bars: OhlcvBar[], span = 3): {
  highs: { index: number; price: number; bar: OhlcvBar }[];
  lows: { index: number; price: number; bar: OhlcvBar }[];
} {
  const highs: { index: number; price: number; bar: OhlcvBar }[] = [];
  const lows: { index: number; price: number; bar: OhlcvBar }[] = [];

  for (let i = span; i < bars.length - span; i++) {
    const cur = bars[i]!;
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= span; j++) {
      if (bars[i - j]!.high >= cur.high || bars[i + j]!.high >= cur.high) isHigh = false;
      if (bars[i - j]!.low <= cur.low || bars[i + j]!.low <= cur.low) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: cur.high, bar: cur });
    if (isLow) lows.push({ index: i, price: cur.low, bar: cur });
  }

  return { highs, lows };
}

/**
 * 1. Volatility Contraction Pattern (VCP - Mark Minervini)
 * Successive wave pullbacks getting shallower with volume drying up.
 */
function detectVcp(bars: OhlcvBar[], volMa20: (number | null)[]): DetectedChartPattern | null {
  const n = bars.length;
  if (n < 35) return null;

  const { highs, lows } = findLocalPivots(bars, 2);
  if (highs.length < 2 || lows.length < 2) return null;

  // Take recent pivot pairs
  const recentHighs = highs.slice(-4);
  const recentLows = lows.slice(-4);
  if (recentHighs.length < 2 || recentLows.length < 2) return null;

  // Contraction depths: (High - Low) / High
  const depths: number[] = [];
  const hPoints: number[] = [];
  for (let i = 0; i < Math.min(recentHighs.length, recentLows.length); i++) {
    const h = recentHighs[i]!.price;
    const l = recentLows[i]!.price;
    if (h > l) {
      depths.push((h - l) / h);
      hPoints.push(h);
    }
  }

  if (depths.length < 2) return null;

  // Check if contractions are narrowing
  let narrowing = true;
  for (let i = 1; i < depths.length; i++) {
    if (depths[i]! >= depths[i - 1]! * 0.85) {
      narrowing = false;
      break;
    }
  }
  if (!narrowing) return null;

  const lastBar = bars[n - 1]!;
  const pivotHigh = Math.max(...hPoints);
  const lastLow = recentLows[recentLows.length - 1]!.price;
  const lastDepth = depths[depths.length - 1]!;

  // The final contraction should be tight (< 10%)
  if (lastDepth > 0.12) return null;

  // Price should be within 6% of the pivot breakout level
  if (lastBar.close < pivotHigh * 0.94) return null;

  // Volume verification: last few bars should have low volume
  const curVolMa = volMa20[n - 1] ?? 0;
  const recentAvgVol = bars.slice(-3).reduce((acc, b) => acc + b.volume, 0) / 3;
  const volDry = curVolMa > 0 && recentAvgVol < curVolMa * 0.9;

  let score = 70;
  if (depths.length >= 3) score += 10;
  if (volDry) score += 12;
  if (lastDepth < 0.05) score += 8;

  return {
    kind: "vcp",
    name: "Volatility Contraction Pattern",
    nameVi: `Mẫu hình VCP (${depths.length} lần thu hẹp)`,
    type: "bullish",
    score: Math.min(96, score),
    reliability: score >= 80 ? "very_high" : "high",
    breakoutPrice: Math.round(pivotHigh * 100) / 100,
    stopLossPrice: Math.round(lastLow * 0.985 * 100) / 100,
    targetPrice: Math.round((pivotHigh * (1 + depths[0]!)) * 100) / 100,
    description: `Biến động co hẹp liên tiếp từ ${(depths[0]! * 100).toFixed(1)}% về ${(lastDepth * 100).toFixed(1)}%, cung cạn kiệt chuẩn bị bứt phá.`,
    confirmation: volDry ? "Khối lượng cạn kiệt đạt chuẩn Minervini" : "Cần khối lượng bùng nổ khi vượt đỉnh",
    ageBars: n - 1 - recentHighs[recentHighs.length - 1]!.index,
    contractions: depths.length,
    volumeDrying: volDry,
  };
}

/**
 * 2. Cup with Handle (Cốc tay cầm - William O'Neil)
 */
function detectCupWithHandle(bars: OhlcvBar[], volMa20: (number | null)[]): DetectedChartPattern | null {
  const n = bars.length;
  if (n < 45) return null;

  const window = bars.slice(-65);
  const m = window.length;
  const closes = window.map((b) => b.close);

  // Left cup rim: search between start and first 35% of window
  let leftRimIdx = 0;
  let leftRimPrice = -Infinity;
  const leftBound = Math.floor(m * 0.35);
  for (let i = 0; i < leftBound; i++) {
    if (window[i]!.high > leftRimPrice) {
      leftRimPrice = window[i]!.high;
      leftRimIdx = i;
    }
  }

  // Cup bottom: search between leftRim and 75% of window
  let bottomIdx = leftRimIdx;
  let bottomPrice = Infinity;
  const midBound = Math.floor(m * 0.75);
  for (let i = leftRimIdx + 5; i < midBound; i++) {
    if (window[i]!.low < bottomPrice) {
      bottomPrice = window[i]!.low;
      bottomIdx = i;
    }
  }

  // Cup depth: 12% to 35%
  const depth = (leftRimPrice - bottomPrice) / leftRimPrice;
  if (depth < 0.12 || depth > 0.38) return null;

  // Right rim: between bottom and 85% of window
  let rightRimIdx = bottomIdx;
  let rightRimPrice = -Infinity;
  for (let i = bottomIdx + 5; i < m - 3; i++) {
    if (window[i]!.high > rightRimPrice) {
      rightRimPrice = window[i]!.high;
      rightRimIdx = i;
    }
  }

  // Right rim should be within 6% of left rim
  if (Math.abs(rightRimPrice - leftRimPrice) / leftRimPrice > 0.08) return null;

  // Handle: from rightRim to current bar (3 to 12 bars)
  const handleBars = window.slice(rightRimIdx);
  if (handleBars.length < 3 || handleBars.length > 15) return null;

  const handleLow = Math.min(...handleBars.map((b) => b.low));
  const handleDepth = (rightRimPrice - handleLow) / rightRimPrice;

  // Handle shouldn't drop more than 12% and must stay in upper half of cup
  const cupMid = (rightRimPrice + bottomPrice) / 2;
  if (handleDepth > 0.14 || handleLow < cupMid) return null;

  // Last bar close should be near handle top
  const lastClose = window[m - 1]!.close;
  if (lastClose < rightRimPrice * 0.93) return null;

  const curVolMa = volMa20[n - 1] ?? 0;
  const handleVol = handleBars.reduce((acc, b) => acc + b.volume, 0) / handleBars.length;
  const volDry = curVolMa > 0 && handleVol < curVolMa * 0.85;

  let score = 72;
  if (volDry) score += 12;
  if (handleDepth <= 0.08) score += 8;

  return {
    kind: "cup_with_handle",
    name: "Cup with Handle",
    nameVi: "Mẫu hình Cốc tay cầm",
    type: "bullish",
    score: Math.min(95, score),
    reliability: score >= 82 ? "very_high" : "high",
    breakoutPrice: Math.round(rightRimPrice * 100) / 100,
    stopLossPrice: Math.round(handleLow * 0.985 * 100) / 100,
    targetPrice: Math.round((rightRimPrice + (rightRimPrice - bottomPrice) * 0.8) * 100) / 100,
    description: `Thân cốc sâu ${(depth * 100).toFixed(1)}%, tay cầm rũ bỏ ${(handleDepth * 100).toFixed(1)}% tạo điểm nổ Pivot tại ${rightRimPrice.toFixed(1)}.`,
    confirmation: volDry ? "Vol tay cầm siết chặt đạt chuẩn O'Neil" : "Chờ nến bứt phá kèm khối lượng vượt trội",
    ageBars: handleBars.length - 1,
    volumeDrying: volDry,
  };
}

/**
 * 3. Double Bottom (Mô hình 2 đáy - W)
 */
function detectDoubleBottom(bars: OhlcvBar[]): DetectedChartPattern | null {
  const n = bars.length;
  if (n < 30) return null;

  const { lows, highs } = findLocalPivots(bars, 3);
  if (lows.length < 2 || highs.length < 1) return null;

  const l2 = lows[lows.length - 1]!;
  const l1 = lows[lows.length - 2]!;

  // Filter out if too far apart or too close (between 7 and 35 bars)
  const dist = l2.index - l1.index;
  if (dist < 7 || dist > 40) return null;

  // L2 is within ±3.5% of L1 (or slight undercut for shakeout)
  const diffPct = Math.abs(l2.price - l1.price) / l1.price;
  if (diffPct > 0.04) return null;

  // Find peak between L1 and L2
  const intermediateHighs = highs.filter((h) => h.index > l1.index && h.index < l2.index);
  if (!intermediateHighs.length) return null;
  const midPeak = intermediateHighs.reduce((prev, cur) => (cur.price > prev.price ? cur : prev));

  const peakHeight = (midPeak.price - Math.min(l1.price, l2.price)) / midPeak.price;
  if (peakHeight < 0.05 || peakHeight > 0.25) return null;

  const lastBar = bars[n - 1]!;
  // Price has recovered from L2 towards midPeak
  if (lastBar.close < l2.price * 1.02) return null;

  // Check volume at L2 vs L1
  const volL1 = l1.bar.volume;
  const volL2 = l2.bar.volume;
  const volHealthy = volL2 <= volL1 * 1.1;

  let score = 68;
  if (l2.price < l1.price && l2.price > l1.price * 0.98) {
    score += 8; // Undercut spring bonus
  }
  if (volHealthy) score += 8;
  if (lastBar.close >= midPeak.price * 0.97) score += 10;

  return {
    kind: "double_bottom",
    name: "Double Bottom",
    nameVi: "Mẫu hình Hai đáy (W)",
    type: "bullish",
    score: Math.min(94, score),
    reliability: score >= 80 ? "very_high" : "high",
    breakoutPrice: Math.round(midPeak.price * 100) / 100,
    stopLossPrice: Math.round(Math.min(l1.price, l2.price) * 0.985 * 100) / 100,
    targetPrice: Math.round((midPeak.price + (midPeak.price - Math.min(l1.price, l2.price))) * 100) / 100,
    description: `Hai đáy tạo nền tại vùng ${l2.price.toFixed(1)}, đỉnh trung tâm ${midPeak.price.toFixed(1)} đóng vai trò kích hoạt.`,
    confirmation: "Đang hồi phục từ đáy 2, cần vượt đỉnh viền cổ để xác nhận",
    ageBars: n - 1 - l2.index,
  };
}

/**
 * 4. Bull Flag (Cờ tăng)
 */
function detectBullFlag(bars: OhlcvBar[], volMa20: (number | null)[]): DetectedChartPattern | null {
  const n = bars.length;
  if (n < 25) return null;

  // Flag pole: 5 to 14 bars before recent consolidation
  const flagBarsCount = 4;
  if (n < flagBarsCount + 10) return null;

  const flagSlice = bars.slice(-flagBarsCount);
  const poleSlice = bars.slice(-flagBarsCount - 12, -flagBarsCount);
  if (poleSlice.length < 5) return null;

  const poleStart = poleSlice[0]!.low;
  const poleEnd = Math.max(...poleSlice.map((b) => b.high));
  const poleGain = (poleEnd - poleStart) / poleStart;

  // Pole gain at least 9%
  if (poleGain < 0.09) return null;

  // Flag retracement: max 7% from pole high
  const flagMin = Math.min(...flagSlice.map((b) => b.low));
  const flagMax = Math.max(...flagSlice.map((b) => b.high));
  const retrace = (poleEnd - flagMin) / poleEnd;
  if (retrace > 0.08 || flagMin < poleStart) return null;

  // Flag volume should be lower than pole volume
  const poleVolAvg = poleSlice.reduce((a, b) => a + b.volume, 0) / poleSlice.length;
  const flagVolAvg = flagSlice.reduce((a, b) => a + b.volume, 0) / flagSlice.length;
  const volContracted = flagVolAvg < poleVolAvg * 0.75;

  let score = 70;
  if (poleGain >= 0.15) score += 8;
  if (volContracted) score += 12;

  return {
    kind: "bull_flag",
    name: "Bull Flag",
    nameVi: "Mẫu hình Cờ tăng (Bull Flag)",
    type: "bullish",
    score: Math.min(94, score),
    reliability: score >= 80 ? "very_high" : "high",
    breakoutPrice: Math.round(poleEnd * 100) / 100,
    stopLossPrice: Math.round(flagMin * 0.985 * 100) / 100,
    targetPrice: Math.round((poleEnd + (poleEnd - poleStart) * 0.75) * 100) / 100,
    description: `Cột cờ bứt phá +${(poleGain * 100).toFixed(1)}%, lá cờ tích lũy chặt chẽ ${(retrace * 100).toFixed(1)}% với vol hạ nhiệt.`,
    confirmation: volContracted ? "Thanh khoản lá cờ siết cạn kiệt" : "Chờ nến vượt đỉnh cột cờ",
    ageBars: 0,
    volumeDrying: volContracted,
  };
}

/**
 * 5. VSA Signals (Volume Spread Analysis)
 */
function detectVsaSignals(bars: OhlcvBar[], volMa20: (number | null)[]): DetectedChartPattern[] {
  const n = bars.length;
  if (n < 15) return [];

  const results: DetectedChartPattern[] = [];
  const last = bars[n - 1]!;
  const prev = bars[n - 2]!;
  const prev2 = bars[n - 3]!;
  const curVolMa = volMa20[n - 1] ?? 0;

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const avgRange = bars.slice(-14).reduce((acc, b) => acc + (b.high - b.low), 0) / 14;

  // Signal A: No Supply Bar (Cạn cung)
  // Narrow spread, low volume, closing in lower/middle half, volume less than previous 2 bars & < 0.75 MA20
  if (
    range < avgRange * 0.7 &&
    curVolMa > 0 &&
    last.volume < curVolMa * 0.75 &&
    last.volume < prev.volume &&
    last.volume < prev2.volume
  ) {
    results.push({
      kind: "no_supply",
      name: "No Supply Bar",
      nameVi: "Nến cạn cung (No Supply)",
      type: "bullish",
      score: 78,
      reliability: "high",
      breakoutPrice: Math.round(last.high * 100) / 100,
      stopLossPrice: Math.round(last.low * 0.99 * 100) / 100,
      targetPrice: null,
      description: "Biên độ giá hẹp kèm thanh khoản kiệt quệ, cho thấy áp lực bán từ nhà đầu tư đã cạn kiệt.",
      confirmation: "Cần một phiên tăng điểm kèm vol xác nhận cung đã kiểm định xong.",
      ageBars: 0,
      volumeDrying: true,
    });
  }

  // Signal B: Shakeout / Spring (Rũ bỏ rút chân)
  // Lower shadow >= 2x body, close in top 35% of bar range, volume > 1.25 MA20 Vol
  const lowerShadow = Math.min(last.open, last.close) - last.low;
  const closePosition = range > 0 ? (last.close - last.low) / range : 0;

  if (
    range > avgRange * 0.8 &&
    lowerShadow >= body * 1.8 &&
    closePosition >= 0.65 &&
    curVolMa > 0 &&
    last.volume >= curVolMa * 1.2
  ) {
    results.push({
      kind: "shakeout",
      name: "Shakeout / Spring",
      nameVi: "Rũ bỏ rút chân (Shakeout)",
      type: "bullish",
      score: 84,
      reliability: "very_high",
      breakoutPrice: Math.round(last.high * 100) / 100,
      stopLossPrice: Math.round(last.low * 0.985 * 100) / 100,
      targetPrice: Math.round((last.close + range * 1.5) * 100) / 100,
      description: "Lực ép bán trong phiên đã bị dòng tiền lớn gom sạch và kéo rút chân mạnh mẽ với thanh khoản lớn.",
      confirmation: "Rút chân đóng cửa cao nhất phiên kèm khối lượng lớn xác nhận tạo đáy rũ bỏ.",
      ageBars: 0,
    });
  }

  // Signal C: Pocket Pivot (Điểm mua sớm trong nền)
  // Up bar, close > open and close > prev.close
  // Volume > highest down-day volume in the previous 10 days
  if (last.close > last.open && last.close > prev.close) {
    let maxDownVol = 0;
    const lookbackBars = bars.slice(-11, -1);
    for (const b of lookbackBars) {
      if (b.close < b.open || b.close < prev.close) {
        if (b.volume > maxDownVol) maxDownVol = b.volume;
      }
    }
    if (maxDownVol > 0 && last.volume > maxDownVol && last.volume > curVolMa * 1.1) {
      results.push({
        kind: "pocket_pivot",
        name: "Pocket Pivot",
        nameVi: "Điểm mua trong nền (Pocket Pivot)",
        type: "bullish",
        score: 82,
        reliability: "high",
        breakoutPrice: Math.round(last.high * 100) / 100,
        stopLossPrice: Math.round(last.low * 0.985 * 100) / 100,
        targetPrice: Math.round((last.close * 1.08) * 100) / 100,
        description: "Khối lượng mua hôm nay nuốt trọn mọi phiên bán giảm trong 10 ngày qua, cho tín hiệu tích lũy kết thúc.",
        confirmation: "Dòng tiền lớn vào hàng ngay tại nền giá trước khi bùng nổ.",
        ageBars: 0,
      });
    }
  }

  return results;
}

/**
 * Main detection pipeline for chart patterns and VSA signals.
 */
export function detectChartPatterns(
  bars: OhlcvBar[],
  options: ChartPatternOptions = {},
): DetectedChartPattern[] {
  if (!bars || bars.length < 20) return [];

  const lookback = Math.min(bars.length, options.lookback ?? 90);
  const slice = bars.slice(-lookback);
  const minScore = options.minScore ?? 55;

  const vols = slice.map((b) => (Number.isFinite(b.volume) ? b.volume : 0));
  const volMa20 = sma(vols, 20);

  const patterns: DetectedChartPattern[] = [];

  const vcp = detectVcp(slice, volMa20);
  if (vcp && vcp.score >= minScore) patterns.push(vcp);

  const cup = detectCupWithHandle(slice, volMa20);
  if (cup && cup.score >= minScore) patterns.push(cup);

  const doubleBottom = detectDoubleBottom(slice);
  if (doubleBottom && doubleBottom.score >= minScore) patterns.push(doubleBottom);

  const bullFlag = detectBullFlag(slice, volMa20);
  if (bullFlag && bullFlag.score >= minScore) patterns.push(bullFlag);

  const vsa = detectVsaSignals(slice, volMa20);
  for (const sig of vsa) {
    if (sig.score >= minScore) patterns.push(sig);
  }

  // Sort by score desc
  return patterns.sort((a, b) => b.score - a.score);
}
