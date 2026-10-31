import { detectCandlePatterns, type DetectedCandlePattern } from "./candlestick-patterns";
import { sma } from "../technical";
import { ema, rsi, macd } from "./oscillators";
import { getSecurity, sectorOf } from "../vn/master";
import type { OhlcvBar, Quote } from "../types";

export type MaCandleScenario =
  | "ALL"
  | "SMC_SWEEP_RECLAIM"    // Quét thanh khoản & rút chân hỗ trợ (SMC Shakeout)
  | "VSA_NO_SUPPLY_TEST"   // Test cung cạn kiệt thanh khoản tại MA (Wyckoff/VSA)
  | "EMA_RIBBON_ALIGN"     // Retest dải EMA Ribbon đa chu kỳ
  | "MA50_BOUNCE"          // Nảy hỗ trợ MA50 (Tổ chức bảo vệ)
  | "MA20_BOUNCE"          // Nảy hỗ trợ MA20 (Uptrend sóng ngắn)
  | "MA200_RECLAIM"        // Lấy lại MA200 (Thoát đáy dài hạn)
  | "GOLDEN_CROSS_CONFIRM" // Nến nổ xác nhận Golden Cross
  | "MA_SQUEEZE_BREAKOUT"  // Nén chặt MA bung nổ
  | "TREND_PULLBACK";      // Điều chỉnh retest kênh tăng

export interface AnalyzeMaCandleExtra {
  foreign?: {
    buyVolume: number | null;
    sellVolume: number | null;
    netVolume: number | null;
    netValue: number | null;
    buyRatioPct: number;
  } | null;
  indexBars?: OhlcvBar[] | null;
}

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

  // Advanced Confluence Pillars & Momentum (New State-of-the-Art)
  foreignNetVal?: number | null; // in Billion VND
  foreignBuyRatio?: number | null; // in %
  foreignAccumulating?: boolean;
  rsRating20?: number | null; // % relative performance vs VN-Index
  isMarketLeader?: boolean;
  rsi14?: number | null;
  macdHist?: number | null;
  momentumStatus?: "BULLISH_EXPANSION" | "MOMENTUM_REVERSAL" | "NEUTRAL";
  pillars?: {
    trend: number;
    candle: number;
    momentum: number;
    flow: number;
    rs: number;
  };

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

function lastEma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const series = ema(closes, period);
  const v = series[series.length - 1];
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
  extra?: AnalyzeMaCandleExtra,
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

  // 2. Moving Averages & EMAs
  const sma10 = lastSma(effectiveCloses, 10);
  const sma20 = lastSma(effectiveCloses, 20);
  const sma50 = lastSma(effectiveCloses, 50);
  const sma200 = lastSma(effectiveCloses, 200);

  const ema10 = lastEma(effectiveCloses, 10);
  const ema20 = lastEma(effectiveCloses, 20);
  const ema50 = lastEma(effectiveCloses, 50);

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

  // Current Bar Price Action Metrics
  const lastBar = bars[bars.length - 1]!;
  const barRange = Math.max(0.001, lastBar.high - lastBar.low);
  const lowerWick = Math.min(lastBar.open, lastBar.close) - lastBar.low;
  const lowerWickPct = (lowerWick / barRange) * 100;
  const closeNearHighPct = ((lastBar.close - lastBar.low) / barRange) * 100;

  // 3. Advanced Scenario Classification
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

  // Check SMC Liquidity Sweep & Reclaim (Shakeout under MA20/50 then strong wick bounce)
  const sweptBelow20 =
    sma20 != null && lastBar.low < sma20 * 0.99 && close >= sma20 * 0.995;
  const sweptBelow50 =
    sma50 != null && lastBar.low < sma50 * 0.99 && close >= sma50 * 0.995;

  const isSmcSweep =
    (sweptBelow20 || sweptBelow50) &&
    lowerWickPct >= 45 &&
    closeNearHighPct >= 65;

  // Check VSA No Supply Test (Low volume dry-up test at MA support)
  const isVsaNoSupply =
    (near20 || near50) &&
    volRatio != null &&
    volRatio <= 0.70 &&
    Math.abs(lastBar.close - lastBar.open) / (lastBar.open || 1) <= 0.018;

  // Check EMA Ribbon Alignment
  const isEmaRibbon =
    ema10 != null && ema20 != null && ema50 != null && ema10 >= ema20 && ema20 >= ema50;
  const isEmaPullback =
    isEmaRibbon &&
    ema10 != null &&
    ema20 != null &&
    (patternLow <= ema10 * 1.01 || patternLow <= ema20 * 1.01) &&
    close >= ema10 * 0.995;

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
  } else if (isSmcSweep) {
    scenario = "SMC_SWEEP_RECLAIM";
    scenarioLabel = "Quét Rũ Thanh Khoản (SMC Spring)";
    scenarioBadgeTone = "purple";
    anchorMa = sweptBelow50 ? "MA50" : "MA20";
    anchorMaPrice = sweptBelow50 ? sma50 : sma20;
    confluenceTags.push("Quét rũ thanh khoản (SMC)");
  } else if (isVsaNoSupply) {
    scenario = "VSA_NO_SUPPLY_TEST";
    scenarioLabel = "VSA Test Cung Cạn Kiệt";
    scenarioBadgeTone = "cyan";
    anchorMa = near50 ? "MA50" : "MA20";
    anchorMaPrice = near50 ? sma50 : sma20;
    confluenceTags.push("Test cung cạn kiệt (No Supply)");
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
  } else if (isEmaPullback) {
    scenario = "EMA_RIBBON_ALIGN";
    scenarioLabel = "Hợp Lưu Dải EMA Ribbon";
    scenarioBadgeTone = "emerald";
    anchorMa = "MA20";
    anchorMaPrice = ema20;
    confluenceTags.push("Chạm Dải EMA Ribbon");
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

  // 4. Momentum Confluence (RSI + MACD)
  let rsiVal: number | null = null;
  let macdHistVal: number | null = null;
  let momentumStatus: "BULLISH_EXPANSION" | "MOMENTUM_REVERSAL" | "NEUTRAL" = "NEUTRAL";
  let momentumScore = 0; // max 20

  if (effectiveCloses.length >= 20) {
    const rsiSeries = rsi(effectiveCloses, 14);
    const lastRsi = rsiSeries[rsiSeries.length - 1];
    const prevRsi = rsiSeries[rsiSeries.length - 2];
    if (lastRsi != null && Number.isFinite(lastRsi)) {
      rsiVal = Number(lastRsi.toFixed(1));
      if (lastRsi >= 46 && lastRsi <= 68 && prevRsi != null && lastRsi >= prevRsi) {
        momentumScore += 10;
        momentumStatus = "BULLISH_EXPANSION";
        confluenceTags.push("RSI tăng tốc");
      } else if (prevRsi != null && prevRsi < 42 && lastRsi >= 42) {
        momentumScore += 8;
        momentumStatus = "MOMENTUM_REVERSAL";
        confluenceTags.push("RSI hồi phục");
      } else if (lastRsi > 50) {
        momentumScore += 5;
      }
    }
  }

  if (effectiveCloses.length >= 26) {
    const macdData = macd(effectiveCloses, 12, 26, 9);
    const h = macdData.histogram;
    const lastH = h[h.length - 1];
    const prevH = h[h.length - 2];
    if (lastH != null && Number.isFinite(lastH)) {
      macdHistVal = Number(lastH.toFixed(2));
      if (lastH > 0 && prevH != null && lastH > prevH) {
        momentumScore += 10;
        if (momentumStatus === "NEUTRAL") momentumStatus = "BULLISH_EXPANSION";
        confluenceTags.push("MACD mở rộng dương");
      } else if (prevH != null && prevH < 0 && lastH >= 0) {
        momentumScore += 9;
        momentumStatus = "MOMENTUM_REVERSAL";
        confluenceTags.push("MACD cắt lên 0");
      } else if (prevH != null && lastH > prevH) {
        momentumScore += 6;
      }
    }
  }
  momentumScore = Math.min(20, momentumScore);

  // 5. Volume & Foreign Flow Confluence (Pillar 4, max 20)
  let flowScore = 0;
  let foreignNetValBillion: number | null = null;
  let foreignBuyRatio: number | null = null;
  let foreignAccumulating = false;

  // Volume contribution (max 10)
  if (volRatio != null) {
    if (volRatio >= 1.4) {
      flowScore += 10;
      confluenceTags.push("Vol bùng nổ");
    } else if (volRatio >= 1.15) {
      flowScore += 7;
      confluenceTags.push("Vol xác nhận");
    } else if (volRatio <= 0.68) {
      flowScore += 7;
      confluenceTags.push("Cạn cung kiệt quệ");
    }
  }

  // Foreign flow contribution (max 10)
  if (extra?.foreign) {
    const f = extra.foreign;
    foreignBuyRatio = f.buyRatioPct;
    if (f.netValue != null) {
      foreignNetValBillion = Number((f.netValue / 1e9).toFixed(2));
    }

    if ((f.netVolume != null && f.netVolume > 10_000) || f.buyRatioPct >= 58) {
      foreignAccumulating = true;
      flowScore += 10;
      confluenceTags.push("Khối ngoại mua ròng");
    } else if (f.buyRatioPct >= 52 || (f.netVolume != null && f.netVolume > 0)) {
      flowScore += 5;
    }
  }
  flowScore = Math.min(20, flowScore);

  // 6. Relative Strength (RS) vs VN-Index (Pillar 5, max 10)
  let rsRating20: number | null = null;
  let isMarketLeader = false;
  let rsScore = 0;

  if (extra?.indexBars && extra.indexBars.length >= 20 && effectiveCloses.length >= 20) {
    const idx = extra.indexBars;
    const curIdxClose = idx[idx.length - 1]?.close ?? 0;
    const pastIdxClose = idx[idx.length - 20]?.close ?? 0;
    const pastStockClose = effectiveCloses[effectiveCloses.length - 20] ?? 0;

    if (curIdxClose > 0 && pastIdxClose > 0 && pastStockClose > 0) {
      const stockRet20 = ((close - pastStockClose) / pastStockClose) * 100;
      const idxRet20 = ((curIdxClose - pastIdxClose) / pastIdxClose) * 100;
      const diff = Number((stockRet20 - idxRet20).toFixed(1));
      rsRating20 = diff;

      if (diff >= 4.0) {
        isMarketLeader = true;
        rsScore = 10;
        confluenceTags.push("Khỏe hơn VN-Index");
      } else if (diff >= 1.0) {
        rsScore = 6;
      }
    }
  }

  // 7. Trend Pillar (max 25)
  let trendScore = 16;
  if (scenario === "MA200_RECLAIM") trendScore = 24;
  else if (scenario === "SMC_SWEEP_RECLAIM") trendScore = 23;
  else if (scenario === "MA50_BOUNCE") trendScore = 22;
  else if (scenario === "GOLDEN_CROSS_CONFIRM") trendScore = 22;
  else if (scenario === "EMA_RIBBON_ALIGN") trendScore = 21;
  else if (scenario === "VSA_NO_SUPPLY_TEST") trendScore = 21;
  else if (scenario === "MA_SQUEEZE_BREAKOUT") trendScore = 20;
  else if (scenario === "MA20_BOUNCE") trendScore = 19;

  if (slope20 > 0.08 && slope50 > 0.04) {
    trendScore = Math.min(25, trendScore + 3);
    confluenceTags.push("MA dốc lên");
  }

  const isRibbon =
    sma10 != null && sma20 != null && sma50 != null && close > sma10 && sma10 >= sma20 && sma20 > sma50;
  if (isRibbon) {
    trendScore = Math.min(25, trendScore + 2);
    confluenceTags.push("Trật tự MA Ribbon");
  }

  // 8. Candle Pattern Pillar (max 25)
  let candleScore = Math.min(25, Math.round(topPattern.score * 0.25));
  if (topPattern.ageBars === 0) {
    candleScore = Math.min(25, candleScore + 2);
  }

  // 9. Total Confluence Score Calculation (0-100)
  const pillars = {
    trend: Math.min(25, trendScore),
    candle: Math.min(25, candleScore),
    momentum: Math.min(20, momentumScore),
    flow: Math.min(20, flowScore),
    rs: Math.min(10, rsScore),
  };

  const rawSum = pillars.trend + pillars.candle + pillars.momentum + pillars.flow + pillars.rs;
  const confluenceScore = Math.max(10, Math.min(100, Math.round(rawSum)));

  // 10. Trade Setup Calculator
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

  // Setup Quality Classification
  const isAplus =
    confluenceScore >= 78 &&
    ((volRatio ?? 0) >= 1.15 || foreignAccumulating || isMarketLeader) &&
    (scenario === "SMC_SWEEP_RECLAIM" ||
      scenario === "MA50_BOUNCE" ||
      scenario === "MA200_RECLAIM" ||
      scenario === "GOLDEN_CROSS_CONFIRM" ||
      scenario === "VSA_NO_SUPPLY_TEST" ||
      scenario === "EMA_RIBBON_ALIGN");

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

    foreignNetVal: foreignNetValBillion,
    foreignBuyRatio,
    foreignAccumulating,
    rsRating20,
    isMarketLeader,
    rsi14: rsiVal,
    macdHist: macdHistVal,
    momentumStatus,
    pillars,

    entryPrice: roundPrice(close, close),
    stopLoss,
    stopLossType: supportPrice === anchorMaPrice ? "BELOW_MA" : "BELOW_CANDLE_LOW",
    target1,
    target2,
    riskReward,
    riskPercent,
    rewardPercent,
    alertWorthy: confluenceScore >= 74 && setupQuality !== "B",
  };
}
