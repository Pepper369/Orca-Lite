import { detectCandlePatterns, type DetectedCandlePattern } from "./candlestick-patterns";
import { sma } from "../technical";
import { getSecurity, sectorOf } from "../vn/master";
import type { OhlcvBar, Quote } from "../types";

export type MaCandleScenario =
  | "ALL"
  | "MA50_BOUNCE"          // Nảy hỗ trợ MA50 (Tổ chức bảo vệ)
  | "MA20_BOUNCE"          // Nảy hỗ trợ MA20 (Uptrend sóng ngắn)
  | "MA200_RECLAIM"        // Lấy lại MA200 (Thoát đáy dài hạn)
  | "GOLDEN_CROSS_CONFIRM" // Nến nổ xác nhận Golden Cross
  | "MA_SQUEEZE_BREAKOUT"  // Nén chặt MA bung nổ
  | "TREND_PULLBACK";      // Điều chỉnh retest kênh tăng

export interface MaCandleConfluenceRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  exchange: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  volRatio: number | null;

  // MA Context
  scenario: MaCandleScenario;
  scenarioLabel: string;
  scenarioBadgeTone: "emerald" | "blue" | "purple" | "amber" | "cyan";
  anchorMa: "MA20" | "MA50" | "MA200" | "MA10" | "CROSS";
  anchorMaPrice: number | null;
  distToMaPct: number | null;
  maSlope: "UP" | "FLAT" | "DOWN";
  maAlignment: "BULLISH_RIBBON" | "NEUTRAL" | "BEARISH";

  // Candlestick Trigger
  topPattern: DetectedCandlePattern;
  allPatterns: DetectedCandlePattern[];
  candleName: string;
  candleNameVi: string;
  candleReliability: string;
  patternAgeBars: number;
  confirmation: string;

  // Confluence Score & Quality
  confluenceScore: number;
  setupQuality: "A+" | "A" | "B";
  confluenceTags: string[];

  // Trade Setup Calculator
  entryPrice: number;
  stopLoss: number;
  stopLossType: "BELOW_MA" | "BELOW_CANDLE_LOW";
  target1: number;
  target2: number;
  riskReward: number;
  riskPercent: number;
  rewardPercent: number;
  alertWorthy: boolean;
}

function roundPrice(val: number, refPrice: number): number {
  if (!Number.isFinite(val) || !Number.isFinite(refPrice)) return 0;
  if (refPrice < 2) return +val.toFixed(4);
  if (refPrice < 20) return +val.toFixed(3);
  return +val.toFixed(2);
}

function lastSma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const series = sma(closes, period);
  const v = series[series.length - 1];
  return v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2));
}

function prevSma(closes: number[], period: number, barsAgo = 1): number | null {
  if (closes.length < period + barsAgo) return null;
  const series = sma(closes, period);
  const v = series[series.length - 1 - barsAgo];
  return v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2));
}

function avgVol(bars: OhlcvBar[], n = 20): number | null {
  if (bars.length < n) return null;
  const slice = bars.slice(-n);
  const sum = slice.reduce((s, b) => s + (b.volume ?? 0), 0);
  return sum / n;
}

export function analyzeMaCandleRow(
  symbol: string,
  bars: OhlcvBar[],
  quote?: Quote,
): MaCandleConfluenceRow | null {
  if (!bars || bars.length < 25) return null;

  const closes = bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
  if (closes.length < 25) return null;

  const effectiveCloses = [...closes];
  if (quote?.price && quote.price > 0 && effectiveCloses.length > 0) {
    effectiveCloses[effectiveCloses.length - 1] = quote.price;
  }
  const close = quote?.price && quote.price > 0 ? quote.price : effectiveCloses[effectiveCloses.length - 1]!;

  // 1. Candlestick Patterns
  const rawPatterns = detectCandlePatterns(bars, {
    assetClass: "stock",
    recentBars: 3,
    reversalOnly: true,
    maxAgeBars: 3,
  });

  const bullPatterns = rawPatterns.filter((p) => p.type === "bullish" && p.category === "bullish_reversal");
  if (!bullPatterns.length) return null;
  const topPattern = bullPatterns[0]!;

  // 2. Moving Averages
  const sma10 = lastSma(effectiveCloses, 10);
  const sma20 = lastSma(effectiveCloses, 20);
  const sma50 = lastSma(effectiveCloses, 50);
  const sma200 = lastSma(effectiveCloses, 200);

  const prevSma20Val = prevSma(effectiveCloses, 20, 1);
  const prevSma50Val = prevSma(effectiveCloses, 50, 1);
  const prev3Sma20Val = prevSma(effectiveCloses, 20, 3);
  const prev3Sma50Val = prevSma(effectiveCloses, 50, 3);

  const slope20 = sma20 && prevSma20Val ? ((sma20 - prevSma20Val) / prevSma20Val) * 100 : 0;
  const slope50 = sma50 && prevSma50Val ? ((sma50 - prevSma50Val) / prevSma50Val) * 100 : 0;

  const v20 = avgVol(bars, 20);
  const curVol = quote?.volume ?? bars[bars.length - 1]?.volume ?? 0;
  const volRatio = v20 && v20 > 0 ? Number((curVol / v20).toFixed(2)) : null;

  const candleCount = Math.max(1, Math.min(topPattern.candles || 2, 4));
  const patternSlice = bars.slice(-candleCount);
  const patternLow = Math.min(...patternSlice.map((b) => b.low));
  const patternHigh = Math.max(...patternSlice.map((b) => b.high));

  // 3. Scenario Classification
  let scenario: MaCandleScenario = "TREND_PULLBACK";
  let scenarioLabel = "Điều Chỉnh Retest Kênh Tăng";
  let scenarioBadgeTone: "emerald" | "blue" | "purple" | "amber" | "cyan" = "emerald";
  let anchorMa: "MA20" | "MA50" | "MA200" | "MA10" | "CROSS" = "MA20";
  let anchorMaPrice: number | null = sma20;
  const confluenceTags: string[] = [];

  // Check MA200 Reclaim
  const testedBelow200 = sma200 != null && bars.slice(-5).some((b) => b.low <= sma200 * 1.005 || b.close < sma200);
  const reclaimed200 = sma200 != null && close >= sma200 * 0.995;

  // Check MA50 Bounce
  const near50 =
    sma50 != null &&
    (Math.abs(patternLow - sma50) / sma50 <= 0.02 || (patternLow <= sma50 * 1.015 && close >= sma50 * 0.992));

  // Check Golden Cross (MA20 x MA50 in last 0-3 bars)
  const isGoldenCross =
    sma20 != null &&
    sma50 != null &&
    sma20 >= sma50 &&
    prev3Sma20Val != null &&
    prev3Sma50Val != null &&
    prev3Sma20Val <= prev3Sma50Val;

  // Check Squeeze
  const isSqueeze =
    sma10 != null && sma20 != null && sma50 != null && Math.abs(sma10 - sma50) / sma50 <= 0.022;

  // Check MA20 Bounce
  const near20 =
    sma20 != null &&
    (Math.abs(patternLow - sma20) / sma20 <= 0.018 || (patternLow <= sma20 * 1.015 && close >= sma20 * 0.992));

  if (testedBelow200 && reclaimed200) {
    scenario = "MA200_RECLAIM";
    scenarioLabel = "Lấy Lại MA200 (Thoát Đáy)";
    scenarioBadgeTone = "purple";
    anchorMa = "MA200";
    anchorMaPrice = sma200;
    confluenceTags.push("Lấy lại MA200 dài hạn");
  } else if (near50) {
    scenario = "MA50_BOUNCE";
    scenarioLabel = "Nảy Hỗ Trợ MA50 (Tổ Chức)";
    scenarioBadgeTone = "blue";
    anchorMa = "MA50";
    anchorMaPrice = sma50;
    confluenceTags.push("Hỗ trợ MA50 Quỹ");
  } else if (isGoldenCross) {
    scenario = "GOLDEN_CROSS_CONFIRM";
    scenarioLabel = "Xác Nhận Golden Cross";
    scenarioBadgeTone = "amber";
    anchorMa = "CROSS";
    anchorMaPrice = sma50;
    confluenceTags.push("Golden Cross + Nến nổ");
  } else if (isSqueeze) {
    scenario = "MA_SQUEEZE_BREAKOUT";
    scenarioLabel = "Nén Chặt MA Bung Nổ";
    scenarioBadgeTone = "cyan";
    anchorMa = "MA10";
    anchorMaPrice = sma20;
    confluenceTags.push("Nén MA bứt phá");
  } else if (near20) {
    scenario = "MA20_BOUNCE";
    scenarioLabel = "Nảy Hỗ Trợ MA20 (Sóng Tăng)";
    scenarioBadgeTone = "emerald";
    anchorMa = "MA20";
    anchorMaPrice = sma20;
    confluenceTags.push("Hỗ trợ MA20 ngắn hạn");
  } else if (sma20 != null && close >= sma20 * 0.985) {
    scenario = "TREND_PULLBACK";
    scenarioLabel = "Retest Kênh Tăng";
    scenarioBadgeTone = "emerald";
    anchorMa = "MA20";
    anchorMaPrice = sma20;
    confluenceTags.push("Retest xu hướng");
  } else {
    return null;
  }

  confluenceTags.push(topPattern.nameVi);

  // 4. Confluence Scoring (0-100)
  let score = Math.round(topPattern.score * 0.35);

  if (scenario === "MA50_BOUNCE") score += 28;
  else if (scenario === "MA200_RECLAIM") score += 30;
  else if (scenario === "GOLDEN_CROSS_CONFIRM") score += 28;
  else if (scenario === "MA_SQUEEZE_BREAKOUT") score += 25;
  else if (scenario === "MA20_BOUNCE") score += 24;
  else score += 18;

  if (slope20 > 0.1 && slope50 > 0.05) {
    score += 15;
    confluenceTags.push("MA20/50 dốc lên");
  } else if (slope20 > 0) {
    score += 8;
  }

  if (volRatio != null) {
    if (volRatio >= 1.5) {
      score += 15;
      confluenceTags.push("Vol bùng nổ");
    } else if (volRatio >= 1.15) {
      score += 10;
    } else if (volRatio <= 0.65) {
      score += 6;
      confluenceTags.push("Cạn cung test MA");
    }
  }

  const isRibbon =
    sma10 != null && sma20 != null && sma50 != null && close > sma10 && sma10 >= sma20 && sma20 > sma50;
  if (isRibbon) {
    score += 8;
    confluenceTags.push("Trật tự MA Ribbon");
  }

  const confluenceScore = Math.max(10, Math.min(100, Math.round(score)));

  // 5. Trade Setup
  const distToMaPct =
    anchorMaPrice && anchorMaPrice > 0 ? Number((((close - anchorMaPrice) / anchorMaPrice) * 100).toFixed(1)) : null;

  const supportPrice = anchorMaPrice != null ? Math.min(patternLow, anchorMaPrice) : patternLow;
  const buffer = Math.max(close * 0.005, (patternHigh - patternLow) * 0.2);
  const stopLoss = roundPrice(Math.max(0.01, supportPrice - buffer), close);
  const risk = close - stopLoss;
  if (risk <= 0) return null;

  const riskPercent = Number(((risk / close) * 100).toFixed(1));
  const target1 = roundPrice(close + risk * 1.5, close);
  const target2 = roundPrice(close + risk * 2.5, close);
  const rewardPercent = Number((((target1 - close) / close) * 100).toFixed(1));
  const riskReward = Number((rewardPercent / Math.max(0.1, riskPercent)).toFixed(1));

  const isAplus =
    confluenceScore >= 78 &&
    (volRatio ?? 0) >= 1.15 &&
    (scenario === "MA50_BOUNCE" || scenario === "MA200_RECLAIM" || scenario === "GOLDEN_CROSS_CONFIRM");
  const setupQuality: "A+" | "A" | "B" = isAplus ? "A+" : confluenceScore >= 68 ? "A" : "B";

  const sec = getSecurity(symbol);

  return {
    symbol,
    name: sec?.name ?? quote?.name ?? null,
    sector: sectorOf(symbol) ?? sec?.sector ?? null,
    exchange: sec?.exchange ?? null,
    price: close,
    changePercent: quote?.changePercent ?? null,
    volume: curVol || null,
    volRatio,

    scenario,
    scenarioLabel,
    scenarioBadgeTone,
    anchorMa,
    anchorMaPrice,
    distToMaPct,
    maSlope: slope20 > 0.05 ? "UP" : slope20 < -0.05 ? "DOWN" : "FLAT",
    maAlignment: isRibbon ? "BULLISH_RIBBON" : close < (sma50 ?? 0) ? "BEARISH" : "NEUTRAL",

    topPattern,
    allPatterns: bullPatterns,
    candleName: topPattern.name,
    candleNameVi: topPattern.nameVi,
    candleReliability: topPattern.reliability,
    patternAgeBars: topPattern.ageBars ?? 0,
    confirmation: topPattern.confirmation,

    confluenceScore,
    setupQuality,
    confluenceTags,

    entryPrice: roundPrice(close, close),
    stopLoss,
    stopLossType: supportPrice === anchorMaPrice ? "BELOW_MA" : "BELOW_CANDLE_LOW",
    target1,
    target2,
    riskReward,
    riskPercent,
    rewardPercent,
    alertWorthy: confluenceScore >= 75 && setupQuality !== "B",
  };
}
