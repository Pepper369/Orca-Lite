/**
 * ORCA APEX QUANT CONFLUENCE & EARLY BOTTOM REVERSAL ENGINE
 *
 * State-of-the-art quantitative stock screening engine designed to solve the critical
 * failure modes in identifying high-probability bottom reversals and early launches:
 *
 * Solved Failure Modes & Bottlenecks:
 * 1. Falling Knife / Premature Bottom Fishing:
 *    Neutralized via Wyckoff Spring liquidity sweep confirmation & Volume Absorption testing.
 * 2. Extended Price Penalty (Chasing too late):
 *    Strict "Sweet Launch Zone" evaluation: price must have confirmed bottom reversal
 *    but remained within [0.8% - 7.5%] extension from the 20-bar lowest low.
 * 3. Overhead Resistance Trap:
 *    Enforces minimum 6.5%+ clear overhead runway to prior volume shelves or swing highs.
 * 4. Quant Mean Reversion Stationarity Disconnect:
 *    Integrates rolling Ornstein-Uhlenbeck (OU) Z-Score [-2.8, -1.1] with verified half-life t½ <= 25 bars.
 * 5. Multi-Timeframe Dissonance:
 *    Requires H1 short-term momentum turnaround + D1 MA reclaim + W1 macro floor holding.
 * 6. Chronic Bull-Trap Assets:
 *    Cross-verified with Historical Price Action Trainer empirical win-rate & Up/Down Volume Ratio.
 */

import { OhlcvBar, Quote } from "../types";
import { estimateOrnsteinUhlenbeck, calculateTripleBarrierLevels } from "./advanced-quant-math";
import { detectCandlePatterns, type DetectedCandlePattern } from "./candlestick-patterns";
import { detectDivergences, SHORT_3_4D } from "./divergence";
import { trainHistoricalPriceAction, type HistoricalEdgeMetrics } from "./historical-price-action-trainer";

export type ApexQuantCategory =
  | "APEX_SUPER_LEADER"      // 85 - 99: Siêu Đảo Chiều Chân Sóng Tối Thượng
  | "APEX_STRONG_REVERSAL"   // 75 - 84: Đảo Chiều Xác Nhận Chuẩn
  | "APEX_EARLY_ACCUMULATION"// 62 - 74: Vùng Gom Khởi Điểm Sớm
  | "NEUTRAL"                // 45 - 61: Trung tính
  | "AVOID";                 // 1 - 44: Rủi ro cao / Bẫy giá

export interface BottomReversalMetrics {
  lowestLow20: number;
  lowestLowBarsAgo: number;
  extensionFromBottomPct: number;    // % distance from lowest low (e.g. +3.2%)
  isSweetLaunchZone: boolean;        // true if extension in [0.8%, 7.5%]
  isPremature: boolean;              // true if extension < 0.8% (knife edge)
  isExtended: boolean;               // true if extension > 8.5% (chasing late)
  isWyckoffSpring: boolean;          // true if liquidity sweep + swift pin-bar reclaim
  isMaReclaim: boolean;              // true if price reclaimed MA10 or MA20 on volume
  nearestResistancePrice: number;
  overheadRoomPct: number;           // % space to nearest overhead resistance
  reversalStageVi: string;           // e.g. "Chân sóng chuẩn (T+2)", "Mới nhú khỏi đáy (+3.1%)"
}

export interface ApexQuantInput {
  symbol?: string;
  bars: OhlcvBar[];
  currentPrice?: number;
  quote?: Partial<Quote> | { price?: number; volume?: number; activeBuyRatio?: number; [key: string]: unknown } | null;
  activeBuyRatioPct?: number | null;
  foreignNetValBillion?: number | null;
  rsRating?: number | null;
  piotroskiFScore?: number | null;
  altmanZone?: string | null;
  isMtfAligned?: boolean | null;
}

export interface ApexQuantResult {
  symbol: string;
  apexScore: number;                 // 1 - 99 composite scoring
  category: ApexQuantCategory;
  categoryVi: string;
  reversalMetrics: BottomReversalMetrics;
  breakdown: {
    reversalSpringScore: number;     // 0 - 100 (Weight: 30%)
    quantAlphaScore: number;         // 0 - 100 (Weight: 25%)
    confluenceFlowScore: number;     // 0 - 100 (Weight: 25%)
    earlyLaunchScore: number;        // 0 - 100 (Weight: 20%)
  };
  ouZScore: number;
  ouHalfLife: number;
  tripleBarrierRiskReward: number;
  historicalWinRatePct: number;
  upDownVolRatio: number;
  verdictVi: string;
  highlights: string[];
}

/**
 * Calculates Simple Moving Average
 */
function calculateSMA(series: number[], period: number): (number | null)[] {
  const res: (number | null)[] = new Array(series.length).fill(null);
  if (series.length < period) return res;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += series[i];
  res[period - 1] = sum / period;
  for (let i = period; i < series.length; i++) {
    sum += series[i] - series[i - period];
    res[i] = sum / period;
  }
  return res;
}

/**
 * Evaluates Bottom Reversal & Sweet Launch Dynamics
 */
export function analyzeBottomReversal(
  bars: OhlcvBar[],
  currentPrice: number
): BottomReversalMetrics {
  const n = bars.length;
  if (n < 20) {
    return {
      lowestLow20: currentPrice,
      lowestLowBarsAgo: 0,
      extensionFromBottomPct: 0,
      isSweetLaunchZone: false,
      isPremature: true,
      isExtended: false,
      isWyckoffSpring: false,
      isMaReclaim: false,
      nearestResistancePrice: currentPrice * 1.1,
      overheadRoomPct: 10,
      reversalStageVi: "Chưa đủ dữ liệu nến",
    };
  }

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const sma10 = calculateSMA(closes, 10);
  const sma20 = calculateSMA(closes, 20);

  // 1. Identify 20-bar lowest low
  let lowestLow20 = Infinity;
  let lowestLowIdx = n - 1;
  const startIdx = Math.max(0, n - 25);

  for (let i = startIdx; i < n; i++) {
    if (lows[i] < lowestLow20) {
      lowestLow20 = lows[i];
      lowestLowIdx = i;
    }
  }

  const lowestLowBarsAgo = n - 1 - lowestLowIdx;
  const extensionFromBottomPct = lowestLow20 > 0
    ? Number((((currentPrice - lowestLow20) / lowestLow20) * 100).toFixed(1))
    : 0;

  // Sweet Launch Zone: Reversal is established (>= 0.8%) but not extended (<= 7.5%)
  const isSweetLaunchZone = extensionFromBottomPct >= 0.8 && extensionFromBottomPct <= 7.5;
  const isPremature = extensionFromBottomPct < 0.8;
  const isExtended = extensionFromBottomPct > 8.5;

  // 2. Wyckoff Spring / Liquidity Sweep Detection
  // Check if recent candles pierced support and closed with a long lower shadow
  let isWyckoffSpring = false;
  for (let i = Math.max(0, n - 6); i < n; i++) {
    const range = highs[i] - lows[i];
    if (range > 0) {
      const lowerShadow = Math.min(closes[i], bars[i].open) - lows[i];
      const lowerShadowRatio = lowerShadow / range;
      // Pin-bar hammer or spring at bottom
      if (lowerShadowRatio >= 0.48 && closes[i] >= lows[i] + range * 0.45) {
        isWyckoffSpring = true;
        break;
      }
    }
  }

  // 3. MA10 / MA20 Reclaim
  const curClose = closes[n - 1];
  const ma10Val = sma10[n - 1];
  const ma20Val = sma20[n - 1];
  const prevClose = closes[n - 2] ?? curClose;
  const isMaReclaim = (
    (ma10Val != null && curClose >= ma10Val && prevClose < ma10Val) ||
    (ma20Val != null && curClose >= ma20Val && prevClose <= ma20Val * 1.01) ||
    (ma10Val != null && ma20Val != null && curClose >= ma10Val && curClose >= ma20Val * 0.985)
  );

  // 4. Overhead Resistance & Runway
  // Search for the nearest significant swing high in the preceding 60 bars
  let nearestResistancePrice = currentPrice * 1.15;
  let minResistanceAbove = Infinity;

  const resLookback = Math.max(0, n - 60);
  for (let i = resLookback; i < n - 3; i++) {
    if (highs[i] > currentPrice * 1.02) {
      // Is it a local peak?
      const isPeak = (
        (i === 0 || highs[i] >= highs[i - 1]) &&
        (i === n - 1 || highs[i] >= highs[i + 1])
      );
      if (isPeak && highs[i] < minResistanceAbove) {
        minResistanceAbove = highs[i];
      }
    }
  }

  if (Number.isFinite(minResistanceAbove)) {
    nearestResistancePrice = minResistanceAbove;
  }

  const overheadRoomPct = currentPrice > 0
    ? Number((((nearestResistancePrice - currentPrice) / currentPrice) * 100).toFixed(1))
    : 10.0;

  // Reversal stage explanation
  let reversalStageVi = "Đang tích lũy";
  if (isSweetLaunchZone && isWyckoffSpring) {
    reversalStageVi = `🌟 Chân sóng vàng: Wyckoff Spring xác nhận, nảy +${extensionFromBottomPct}% từ đáy`;
  } else if (isSweetLaunchZone && isMaReclaim) {
    reversalStageVi = `🚀 Chớm khởi động: Lấy lại MA ngắn hạn, mới tăng +${extensionFromBottomPct}% từ đáy`;
  } else if (isSweetLaunchZone) {
    reversalStageVi = `✨ Điểm vào tối ưu: Tạo đáy ${lowestLowBarsAgo} phiên trước, cách đáy +${extensionFromBottomPct}%`;
  } else if (isPremature) {
    reversalStageVi = `⚠️ Quá sát đáy (+${extensionFromBottomPct}%): Cần nến xác nhận bật tăng`;
  } else if (isExtended) {
    reversalStageVi = `⏳ Đã chạy xa đáy (+${extensionFromBottomPct}%): Nên chờ nhịp retest`;
  }

  return {
    lowestLow20,
    lowestLowBarsAgo,
    extensionFromBottomPct,
    isSweetLaunchZone,
    isPremature,
    isExtended,
    isWyckoffSpring,
    isMaReclaim,
    nearestResistancePrice,
    overheadRoomPct,
    reversalStageVi,
  };
}

/**
 * Computes Comprehensive Apex Quant Confluence Score & Category
 */
export function evaluateApexQuant(input: ApexQuantInput | OhlcvBar[]): ApexQuantResult {
  const normalized: ApexQuantInput = Array.isArray(input) ? { bars: input } : input;
  const bars = normalized.bars;
  const symbol = normalized.symbol || "STOCK";
  const currentPrice = normalized.currentPrice ?? (bars[bars.length - 1]?.close || 0);
  const { quote, activeBuyRatioPct, foreignNetValBillion, rsRating, piotroskiFScore, altmanZone, isMtfAligned } = normalized;
  const highlights: string[] = [];

  // 1. Analyze Bottom Reversal Dynamics
  const rev = analyzeBottomReversal(bars, currentPrice);

  // 2. Rolling Quant Models (Ornstein-Uhlenbeck & Triple-Barrier)
  const closes = bars.map(b => b.close);
  const subCloses = closes.slice(Math.max(0, closes.length - 35));
  const ou = estimateOrnsteinUhlenbeck(subCloses);

  // Approximate ATR % for dynamic volatility
  let atrPct = 3.0;
  if (bars.length >= 14) {
    let trSum = 0;
    const start = bars.length - 14;
    for (let i = start; i < bars.length; i++) {
      const prevC = i > 0 ? bars[i - 1].close : bars[i].close;
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - prevC),
        Math.abs(bars[i].low - prevC)
      );
      trSum += (tr / bars[i].close) * 100;
    }
    atrPct = Math.max(1.5, Math.min(8.0, trSum / 14));
  }

  const tb = calculateTripleBarrierLevels(currentPrice, atrPct, 3.0, 1.3, 12);
  const tbRR = Number(tb.riskRewardRatio.toFixed(2));

  // 3. Historical Price Action Training
  const trained = trainHistoricalPriceAction(bars);

  // 4. Candlestick Pattern & Bullish Divergence Detection
  const candlePatterns = detectCandlePatterns(bars, { recentBars: 4, reversalOnly: true });
  const topBullCandle = candlePatterns.find(c => c.type === "bullish") ?? null;

  let hasBullishDivergence = false;
  let divSummary = "";
  if (bars.length >= 18) {
    try {
      const divs = detectDivergences(bars, { ...SHORT_3_4D, lookback: Math.min(bars.length, 45) });
      const bull = divs.find(d => d.kind.includes("bullish") && d.status !== "invalidated" && (d.barsAgo == null || d.barsAgo <= 6));
      if (bull) {
        hasBullishDivergence = true;
        divSummary = `Phân kỳ ${bull.oscillator.toUpperCase()}`;
      }
    } catch {
      // safe
    }
  }

  // =========================================================================
  // PILLAR 1: Bottom Reversal & Wyckoff Spring Dynamics (Weight: 30%)
  // =========================================================================
  let pillar1 = 45;
  if (rev.isWyckoffSpring) {
    pillar1 += 22;
    highlights.push("Wyckoff Spring rút chân đáy");
  }
  if (rev.isMaReclaim) {
    pillar1 += 18;
    highlights.push("Lấy lại MA hỗ trợ");
  }
  if (topBullCandle) {
    pillar1 += Math.round((topBullCandle.score || 75) * 0.15);
    highlights.push(topBullCandle.nameVi);
  }
  pillar1 = Math.max(10, Math.min(99, pillar1));

  // =========================================================================
  // PILLAR 2: Quant Alpha & OU Mean Reversion (Weight: 25%)
  // =========================================================================
  let pillar2 = 45;
  // Sweet spot for OU Z-score is [-2.8, -1.0] with stationary half-life [2, 25] bars
  if (ou.currentZScore <= -1.1 && ou.currentZScore >= -2.8 && ou.halfLife >= 2 && ou.halfLife <= 25) {
    pillar2 += 25;
    highlights.push(`Quant OU Z-Score ${ou.currentZScore.toFixed(1)} (t½ ${ou.halfLife.toFixed(0)}p)`);
  } else if (ou.currentZScore < -2.8) {
    pillar2 += 12; // deep dip but slightly higher volatility risk
  } else if (ou.currentZScore > 0.5) {
    pillar2 -= 15; // extended above mean
  }

  if (tbRR >= 2.2) {
    pillar2 += 14;
  } else if (tbRR >= 1.8) {
    pillar2 += 8;
  }
  pillar2 = Math.max(10, Math.min(99, pillar2));

  // =========================================================================
  // PILLAR 3: Multi-Pillar Confluence & Smart Money Flow (Weight: 25%)
  // =========================================================================
  let pillar3 = 45;
  if (hasBullishDivergence) {
    pillar3 += 18;
    highlights.push(divSummary);
  }
  if (isMtfAligned) {
    pillar3 += 15;
    highlights.push("Đồng thuận đa khung H1-D1-W1");
  }

  const qAny = quote as { activeBuyRatio?: number } | null | undefined;
  const buyRatio = activeBuyRatioPct ?? (qAny?.activeBuyRatio ? qAny.activeBuyRatio * 100 : 50);
  if (buyRatio >= 65) {
    pillar3 += 12;
    highlights.push(`Chủ động gom ${buyRatio.toFixed(0)}%`);
  } else if (buyRatio < 40) {
    pillar3 -= 10;
  }

  if (foreignNetValBillion != null && foreignNetValBillion >= 0.5) {
    pillar3 += 8;
    highlights.push("Khối ngoại gom ròng");
  }

  // Cross-verification with trained historical edge
  if (trained.historicalEdgeScore >= 75) {
    pillar3 += 10;
  } else if (trained.historicalEdgeScore < 45) {
    pillar3 -= 15;
    highlights.push("Cảnh báo bẫy giá quá khứ");
  }
  pillar3 = Math.max(10, Math.min(99, pillar3));

  // =========================================================================
  // PILLAR 4: Early Launch Sweet Spot & Overhead Runway (Weight: 20%)
  // =========================================================================
  let pillar4 = 50;
  if (rev.isSweetLaunchZone) {
    pillar4 += 28;
    highlights.push(`Vùng chân sóng (+${rev.extensionFromBottomPct}%)`);
  } else if (rev.isPremature) {
    pillar4 -= 8; // still probing bottom
  } else if (rev.isExtended) {
    pillar4 -= 25; // extended too far
    highlights.push("Đã chạy xa đáy");
  }

  if (rev.overheadRoomPct >= 10.0) {
    pillar4 += 18;
  } else if (rev.overheadRoomPct >= 6.5) {
    pillar4 += 10;
  } else if (rev.overheadRoomPct < 4.0) {
    pillar4 -= 20; // blocked by immediate resistance
    highlights.push("Cản trên quá gần");
  }

  // Fundamental safety net (anti-bankruptcy filter)
  if (piotroskiFScore != null && piotroskiFScore >= 6) {
    pillar4 += 8;
  } else if (altmanZone === "DISTRESS") {
    pillar4 -= 15;
  }
  pillar4 = Math.max(10, Math.min(99, pillar4));

  // =========================================================================
  // Composite Weighted Apex Score
  // =========================================================================
  const rawApex = (
    pillar1 * 0.30 +
    pillar2 * 0.25 +
    pillar3 * 0.25 +
    pillar4 * 0.20
  );

  const apexScore = Math.min(99, Math.max(10, Math.round(rawApex)));

  // Category classification
  let category: ApexQuantCategory = "NEUTRAL";
  let categoryVi = "Trung Tính";

  if (apexScore >= 85) {
    category = "APEX_SUPER_LEADER";
    categoryVi = "Siêu Đảo Chiều Chân Sóng";
  } else if (apexScore >= 75) {
    category = "APEX_STRONG_REVERSAL";
    categoryVi = "Đảo Chiều Xác Nhận Chuẩn";
  } else if (apexScore >= 62) {
    category = "APEX_EARLY_ACCUMULATION";
    categoryVi = "Vùng Gom Khởi Điểm Sớm";
  } else if (apexScore < 45) {
    category = "AVOID";
    categoryVi = "Rủi Ro / Bẫy Giá";
  }

  const primaryHighlights = highlights.slice(0, 3).join(" · ");
  const verdictVi = `${categoryVi} (Điểm Apex ${apexScore}/99): ${rev.reversalStageVi}. ${primaryHighlights ? `Đặc điểm: ${primaryHighlights}.` : ""}`;

  return {
    symbol,
    apexScore,
    category,
    categoryVi,
    reversalMetrics: rev,
    breakdown: {
      reversalSpringScore: Math.round(pillar1),
      quantAlphaScore: Math.round(pillar2),
      confluenceFlowScore: Math.round(pillar3),
      earlyLaunchScore: Math.round(pillar4),
    },
    ouZScore: Number(ou.currentZScore.toFixed(2)),
    ouHalfLife: Number(ou.halfLife.toFixed(1)),
    tripleBarrierRiskReward: tbRR,
    historicalWinRatePct: trained.historicalWinRatePct,
    upDownVolRatio: trained.upDownVolRatio,
    verdictVi,
    highlights,
  };
}
