import { detectCandlePatterns, type DetectedCandlePattern } from "./candlestick-patterns";
import { detectChartPatterns, type DetectedChartPattern } from "./chart-patterns";
import { sma } from "../technical";
import { ema, rsi, macd } from "./oscillators";
import { detectDivergences, SHORT_3_4D } from "./divergence";
import { getSecurity, sectorOf } from "../vn/master";
import type { OhlcvBar, Quote, DivergenceSignal } from "../types";
import {
  evaluateMtfConsensus,
  type MtfConsensusStatus,
  type MtfConsensusResult,
  type MtfTimeframeDetail,
} from "./mtf-consensus";
import { analyzeFibonacciConfluence, type FiboConfluenceResult } from "./fibonacci-confluence";
import { analyzeStructureLevelsConfluence, type StructureConfluenceResult } from "./structure-levels";
import { analyzeMoneyFlow, findSwings, type MoneyFlowAnalysis } from "./money-flow";

export type ConfluenceTier = "DIAMOND_TRIPLE" | "GOLD_DOUBLE" | "SILVER_SINGLE";

export type SetupGrade = "A+" | "A" | "B" | "C";

export type SniperTriggerSubtype = "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM" | "NONE";

export interface SniperBuyTrigger {
  isTriggerNow: boolean;
  subtype: SniperTriggerSubtype;
  subtypeLabelVi: string;
  triggerScore: number;
  entryZone: {
    min: number;
    max: number;
  };
  invalidationStopLoss: number;
  stopLossDistancePct: number;
  target1: number;
  target2: number;
  riskReward: number;
  reasonsVi: string[];
}

export type MaCandleScenario =
  | "ALL"
  | "SMC_GOLDEN_POCKET"        // Hợp lưu Đỉnh Cao: SMC Sweep/OB + Golden Pocket Fibo (0.618 - 0.65)
  | "FLIP_ZONE_RETEST"         // Retest thành công Flip Zone (Kháng cự cũ hoá hỗ trợ mới)
  | "BOTTOM_BULLISH_DIVERGENCE" // Hợp lưu Đáy: MA + Nến đảo chiều + Phân kỳ dương
  | "CHART_PATTERN_BREAKOUT"    // Hợp lưu Bứt phá Mẫu hình Biểu đồ (VCP, Cup & Handle, Vai Đầu Vai Ngược, Tam giác tăng)
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
  h1Bars?: OhlcvBar[] | null;
  sectorRrgQuadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | null;
  sectorRsRatio?: number | null;
  sectorRsMomentum?: number | null;
  squeezeState?: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" | null;
  squeezeBars?: number | null;
  activeBuyRatioPct?: number | null;
  isPrecisionMtfAligned?: boolean | null;
  fiboResult?: FiboConfluenceResult | null;
  structureResult?: StructureConfluenceResult | null;
  moneyFlow?: MoneyFlowAnalysis | null;
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

  // Chart Pattern Confluence (Classical Geometric Formations)
  topChartPattern?: DetectedChartPattern | null;
  chartPatternName?: string | null;
  chartPatternNameVi?: string | null;
  chartPatternScore?: number | null;
  hasMultiLayerConfluence?: boolean;

  // Divergence Engine Integration
  divergenceSignal?: DivergenceSignal | null;
  divergenceSummary?: string | null;
  isBottomReversal?: boolean;
  isDualDivergence?: boolean;
  divergenceOscillators?: string[];

  // Confluence Score, Quality, Tier & Setup Grade
  confluenceScore: number;
  setupQuality: "A+" | "A" | "B";
  setupGrade: SetupGrade;
  orthogonalPillarsPassed: number; // 1 to 5
  orthogonalPillarDetails: {
    structureTrend: boolean; // Trục 1: Cấu trúc & Xu hướng
    valueZone: boolean;      // Trục 2: Vùng Giá trị & Cản (MA/Fibo/Flip Zone)
    liquidityFlow: boolean;  // Trục 3: Thanh khoản & Dòng tiền (SMC/VSA/Khối ngoại)
    momentumTrigger: boolean;// Trục 4: Động lượng & Kích hoạt (Nến/Phân kỳ/Squeeze)
    mtfMacro: boolean;       // Trục 5: Đa khung & Liên thị trường (MTF/RRG/RS)
  };
  confluenceTier?: ConfluenceTier;
  isDiamondTriple?: boolean;
  isMaReclaim?: boolean;
  maSlopeStatus?: "UP" | "FLAT" | "STEEP_DOWN";
  volumeNature?: "ABSORPTION_SPIKE" | "NO_SUPPLY_TEST" | "NORMAL";
  confluenceTags: string[];

  // Phase 1 & 2 Extensions: Fibonacci, Flip Zone, Round Numbers & SMC
  isGoldenPocket?: boolean;
  isFiboCluster?: boolean;
  fiboSummary?: string | null;
  isFlipZoneSupport?: boolean;
  isRoundNumberConfluence?: boolean;
  structureSummary?: string | null;
  isSmcOrderBlock?: boolean;
  isSmcFvgInDiscount?: boolean;

  // Advanced Confluence Pillars & Momentum (New State-of-the-Art)
  foreignNetVal?: number | null; // in Billion VND
  foreignBuyRatio?: number | null; // in %
  foreignAccumulating?: boolean;
  rsRating20?: number | null; // % relative performance vs VN-Index
  isMarketLeader?: boolean;
  sectorRrgQuadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | null;
  sectorRsRatio?: number | null;
  sectorRsMomentum?: number | null;
  isSectorLeading?: boolean;
  isSectorLagging?: boolean;
  rrgBonus?: number;
  squeezeState?: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" | null;
  squeezeBars?: number | null;
  isSqueezeFiredBull?: boolean;
  isSqueezeOn?: boolean;
  squeezeBonus?: number;
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

  // Multi-Timeframe (MTF) Confluence (H1 + D1 + W1)
  mtfConsensus: MtfConsensusStatus;
  isMtfAligned: boolean;
  isPrecisionMtfAligned?: boolean;
  mtfScore: number;
  mtfSummary: string;
  mtfBadgeVi: string;
  mtfDetails: {
    w1: MtfTimeframeDetail;
    d1: MtfTimeframeDetail;
    h1: MtfTimeframeDetail;
  };

  // Biên độ 3: MA Geometry & Ribbon Squeeze
  isMaReclaimSpring?: boolean;
  maRibbonSpreadPct?: number | null;
  isMaRibbonSqueeze?: boolean;
  maSlope5Pct?: number | null;

  // Biên độ 4: Volume Absorption & VSA
  isAbsorptionSpike?: boolean;
  isVsaNoSupplyTest?: boolean;
  activeBuyRatioPct?: number | null;

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

  // Sniper Buy Trigger Plan
  sniperTrigger: SniperBuyTrigger;
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
    recentBars: 4,
    reversalOnly: false,
    maxAgeBars: 4,
  });

  const bullPatterns = rawPatterns.filter(
    (p) =>
      p.type === "bullish" &&
      (p.category === "bullish_reversal" ||
        p.name === "Rising Three Methods" ||
        p.name === "Three White Soldiers" ||
        p.name === "Upside Tasuki Gap"),
  );
  if (!bullPatterns.length) return null;
  const topPattern = bullPatterns[0]!;

  // 1b. Classical Geometric Chart Patterns (VCP, Cup & Handle, Inv H&S, Ascending Triangle, Double Bottom)
  const rawChartPatterns = detectChartPatterns(bars, { lookback: 90, minScore: 60 });
  const topChart = rawChartPatterns.length > 0 ? rawChartPatterns[0]! : null;

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

  const confluenceTags: string[] = [];

  // Phase 1 & 2 Extensions: Fibonacci Confluence, Structure Levels & Money Flow Hydration
  const sharedSwings =
    (!extra?.fiboResult || !extra?.structureResult) && bars.length >= 15
      ? findSwings(bars, 3, "external")
      : undefined;
  const fibo = extra?.fiboResult ?? analyzeFibonacciConfluence(bars, sharedSwings);
  const structure = extra?.structureResult ?? analyzeStructureLevelsConfluence(bars, "stock", sharedSwings);
  const moneyFlow = extra?.moneyFlow ?? (bars.length >= 25 ? analyzeMoneyFlow(bars) : null);

  const isGoldenPocketHit = Boolean(fibo.isGoldenPocketBounce || fibo.goldenPocket?.inPocket);
  const isFiboClusterHit = fibo.hasFiboClusterConfluence;
  const isFlipSupportHit = structure.isAtFlipZoneSupport;
  const isRoundNumHit = structure.roundNumber.isAtRoundNumber;

  const isSmcObHit = Boolean(
    moneyFlow?.smc.orderBlocks.some(
      (ob) => ob.direction === "bullish" && ob.status === "OPEN" && close >= ob.low && close <= ob.high * 1.02,
    ),
  );
  const isFvgDiscount = Boolean(
    moneyFlow?.ict.premiumDiscount === "DISCOUNT" &&
      moneyFlow?.smc.fvgs.some((f) => f.direction === "bullish" && f.status === "OPEN"),
  );

  if (isGoldenPocketHit) {
    confluenceTags.push("Golden Pocket Fibo 0.618 - 0.65");
  }
  if (isFiboClusterHit) {
    confluenceTags.push("Hội tụ Fibo Cluster đa chu kỳ");
  }
  if (isFlipSupportHit && structure.nearestFlipZone) {
    confluenceTags.push(`Flip Zone hỗ trợ ${structure.nearestFlipZone.level}`);
  }
  if (isRoundNumHit) {
    confluenceTags.push(`Số tròn tâm lý ${structure.roundNumber.level}`);
  }
  if (isSmcObHit) {
    confluenceTags.push("Order Block (OB) hỗ trợ");
  }
  if (isFvgDiscount) {
    confluenceTags.push("Fair Value Gap (FVG) vùng Discount");
  }

  // 3. Advanced Scenario Classification
  let scenario: MaCandleScenario = "TREND_PULLBACK";
  let scenarioLabel = "Điều Chỉnh Retest Kênh Tăng";
  let scenarioBadgeTone: "emerald" | "blue" | "purple" | "amber" | "cyan" = "emerald";
  let anchorMa: "MA20" | "MA50" | "MA200" | "MA10" | "CROSS" = "MA20";
  let anchorMaPrice: number | null = sma20;

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

  // Check Bullish Divergence (RSI / MACD / Stoch)
  let bestBullDiv: DivergenceSignal | null = null;
  let allBullDivs: DivergenceSignal[] = [];
  if (bars.length >= 18) {
    try {
      const divSignals = detectDivergences(bars, {
        ...SHORT_3_4D,
        lookback: Math.min(bars.length, 60),
      });
      const bullDivs = divSignals.filter(
        (s) =>
          s.kind.includes("bullish") &&
          s.status !== "invalidated" &&
          (s.barsAgo == null || s.barsAgo <= 10),
      );
      if (bullDivs.length > 0) {
        allBullDivs = bullDivs;
        bestBullDiv = bullDivs[0]!;
      } else {
        const fullDivs = detectDivergences(bars, {
          pivotLeft: 3,
          pivotRight: 2,
          minBarsBetween: 3,
          maxBarsBetween: 40,
          lookback: Math.min(bars.length, 80),
        });
        const bullFull = fullDivs.filter(
          (s) =>
            s.kind.includes("bullish") &&
            s.status !== "invalidated" &&
            (s.barsAgo == null || s.barsAgo <= 25),
        );
        if (bullFull.length > 0) {
          allBullDivs = bullFull;
          bestBullDiv = bullFull[0]!;
        }
      }
    } catch {
      // resilient
    }
  }

  // Next-Gen Confluence Indicators: Multi-Oscillator, MA Reclaim, Geometry & Volume Nature
  const divergenceOscillators = Array.from(new Set(allBullDivs.map((d) => d.oscillator.toUpperCase())));
  const hasRsiDiv = divergenceOscillators.some((o) => o === "RSI");
  const hasMacdDiv = divergenceOscillators.some((o) => o.includes("MACD"));
  const isDualDivergence = hasRsiDiv && hasMacdDiv;

  const isMaReclaim =
    (sma20 != null && lastBar.low < sma20 * 0.992 && close >= sma20 * 0.998) ||
    (sma50 != null && lastBar.low < sma50 * 0.992 && close >= sma50 * 0.998) ||
    (sma10 != null && lastBar.low < sma10 * 0.992 && close >= sma10 * 0.998) ||
    (sma200 != null && lastBar.low < sma200 * 0.992 && close >= sma200 * 0.998);

  // Biên độ 3: Động Học Nến, Rút Chân Reclaim MA & MA Ribbon Squeeze
  const candleRange = Math.max(0.001, lastBar.high - lastBar.low);
  const lowerShadowRatio = (Math.min(lastBar.open, close) - lastBar.low) / candleRange;
  const isMaSpringPinbar = isMaReclaim && lowerShadowRatio >= 0.35;

  const maRibbonSpreadPct =
    sma10 != null && sma20 != null && sma50 != null && sma50 > 0
      ? Number((((Math.max(sma10, sma20, sma50) - Math.min(sma10, sma20, sma50)) / ((sma10 + sma20 + sma50) / 3)) * 100).toFixed(2))
      : null;
  const isMaRibbonSqueeze = maRibbonSpreadPct != null && maRibbonSpreadPct <= 2.8;

  const maSlope5Pct = slope20 != null ? Number((slope20 * 100).toFixed(2)) : null;

  const maSlopeStatus: "UP" | "FLAT" | "STEEP_DOWN" =
    slope20 < -0.15 ? "STEEP_DOWN" : slope20 > 0.05 ? "UP" : "FLAT";

  // Biên độ 4: Xác Nhận Khối Lượng Hấp Thụ & VSA Test
  const isAbsorptionSpike = volRatio != null && volRatio >= 1.30 && close >= (lastBar.open ?? close);
  const isVsaNoSupplyTest =
    volRatio != null && volRatio <= 0.65 && Math.abs(close - (lastBar.open ?? close)) / (lastBar.open || 1) <= 0.018;

  const activeBuyRatioPct =
    extra?.activeBuyRatioPct ??
    extra?.foreign?.buyRatioPct ??
    (quote as { activeBuyRatioPct?: number })?.activeBuyRatioPct ??
    null;

  let volumeNature: "ABSORPTION_SPIKE" | "NO_SUPPLY_TEST" | "NORMAL" = "NORMAL";
  if (isAbsorptionSpike) {
    volumeNature = "ABSORPTION_SPIKE";
  } else if (isVsaNoSupplyTest) {
    volumeNature = "NO_SUPPLY_TEST";
  }

  // Triple-Lock Confluence Tier (Tam Hợp Lưu Tuyệt Đối: MA Lock + Candle Lock + Divergence Lock)
  const hasMaLock =
    near20 ||
    near50 ||
    testedBelow200 ||
    reclaimed200 ||
    isSmcSweep ||
    isMaReclaim ||
    (sma20 != null && close >= sma20 * 0.985);

  const hasCandleLock =
    topPattern.reliability === "high" ||
    topPattern.score >= 70 ||
    ["Bullish Engulfing", "Hammer", "Morning Star", "Piercing", "Dragonfly Doji", "Inverted Hammer"].includes(topPattern.name);

  const hasDivergenceLock =
    bestBullDiv != null && (bestBullDiv.barsAgo == null || bestBullDiv.barsAgo <= 6);

  let confluenceTier: ConfluenceTier = "SILVER_SINGLE";
  let isDiamondTriple = false;

  if (hasMaLock && hasCandleLock && hasDivergenceLock) {
    confluenceTier = "DIAMOND_TRIPLE";
    isDiamondTriple = true;
    confluenceTags.push("Tam Hợp Lưu Kim Cương");
  } else if (
    (hasMaLock && hasCandleLock) ||
    (hasMaLock && hasDivergenceLock) ||
    (hasCandleLock && hasDivergenceLock)
  ) {
    confluenceTier = "GOLD_DOUBLE";
    confluenceTags.push("Song Hợp Lưu Vàng");
  } else {
    confluenceTier = "SILVER_SINGLE";
  }

  if (isDualDivergence) {
    confluenceTags.push("Phân kỳ kép (RSI+MACD)");
  }
  if (isMaReclaim) {
    confluenceTags.push("Quét thủng rút chân lấy lại MA");
  }
  if (volumeNature === "ABSORPTION_SPIKE") {
    confluenceTags.push("Hấp thụ cung vol lớn");
  } else if (volumeNature === "NO_SUPPLY_TEST") {
    confluenceTags.push("Cạn cung kiệt quệ (No Supply)");
  }

  const isBottomDivergence =
    bestBullDiv != null &&
    (near20 ||
      near50 ||
      testedBelow200 ||
      reclaimed200 ||
      isSmcSweep ||
      isMaReclaim ||
      (sma10 != null && close >= sma10 * 0.98) ||
      (sma20 != null && close >= sma20 * 0.94) ||
      close >= patternLow);

  // Priority 1: SMC Liquidity Sweep / Order Block Confluence with Golden Pocket Fibo
  const isSmcGoldenPocket = (isSmcSweep || isSmcObHit) && isGoldenPocketHit;
  const isFlipZoneSetup = isFlipSupportHit && (hasCandleLock || isAbsorptionSpike || isVsaNoSupplyTest);

  if (isSmcGoldenPocket) {
    scenario = "SMC_GOLDEN_POCKET";
    scenarioLabel = "SMC Sweep & Golden Pocket Fibo";
    scenarioBadgeTone = "purple";
    anchorMaPrice = fibo.goldenPocket ? (fibo.goldenPocket.lower + fibo.goldenPocket.upper) / 2 : sma20;
    anchorMa = sweptBelow50 ? "MA50" : "MA20";
    confluenceTags.push("SMC Sweep + Golden Pocket Fibo");
  } else if (isFlipZoneSetup) {
    scenario = "FLIP_ZONE_RETEST";
    scenarioLabel = "Retest Flip Zone Hỗ Trợ Mới";
    scenarioBadgeTone = "blue";
    anchorMaPrice = structure.nearestFlipZone?.level ?? sma20;
    anchorMa = near50 ? "MA50" : "MA20";
    confluenceTags.push("Retest Flip Zone hỗ trợ");
  } else if (isBottomDivergence) {
    scenario = "BOTTOM_BULLISH_DIVERGENCE";
    scenarioLabel = isDiamondTriple
      ? "Tam Hợp Lưu Đáy"
      : isDualDivergence
      ? "Hợp Lưu Đáy (Phân Kỳ Kép)"
      : "Hợp Lưu Đáy (MA + Nến + Phân Kỳ)";
    scenarioBadgeTone = isDiamondTriple ? "amber" : "cyan";
    anchorMa = near50 ? "MA50" : testedBelow200 ? "MA200" : isMaReclaim ? (sweptBelow50 ? "MA50" : "MA20") : sma20 ? "MA20" : "MA10";
    anchorMaPrice = near50 ? sma50 : testedBelow200 ? sma200 : sma20 ?? sma10;
    confluenceTags.push(`Phân kỳ ${bestBullDiv!.oscillator.toUpperCase()}${bestBullDiv!.barsAgo != null ? ` (T+${bestBullDiv!.barsAgo})` : ""}`);
  } else if (testedBelow200 && reclaimed200) {
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
  } else if (
    topChart != null &&
    topChart.score >= 70 &&
    (topChart.kind === "vcp" ||
      topChart.kind === "cup_with_handle" ||
      topChart.kind === "inverse_head_and_shoulders" ||
      topChart.kind === "ascending_triangle" ||
      topChart.kind === "double_bottom" ||
      topChart.kind === "triple_bottom" ||
      topChart.kind === "bull_flag")
  ) {
    scenario = "CHART_PATTERN_BREAKOUT";
    scenarioLabel = `Bứt Phá ${topChart.nameVi.replace(/Mẫu hình /gi, "")}`;
    scenarioBadgeTone = "purple";
    anchorMa = near50 ? "MA50" : near20 ? "MA20" : testedBelow200 ? "MA200" : "MA20";
    anchorMaPrice = near50 ? sma50 : near20 ? sma20 : testedBelow200 ? sma200 : sma20 ?? sma10;
    confluenceTags.push(`Mẫu hình ${topChart.nameVi}`);
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
  if (topChart && !confluenceTags.some((t) => t.includes(topChart.nameVi))) {
    confluenceTags.push(topChart.nameVi);
  }
  if (topChart?.volumeDrying) {
    confluenceTags.push("Vol cạn kiệt mẫu hình");
  }

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

  // Bullish Divergence Supercharge for Momentum
  if (bestBullDiv != null) {
    momentumScore = bestBullDiv.status === "confirmed" ? 20 : 18;
    momentumStatus = "MOMENTUM_REVERSAL";
    confluenceTags.push("Phân kỳ động lượng dương");
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
  if (scenario === "BOTTOM_BULLISH_DIVERGENCE") trendScore = 25;
  else if (scenario === "CHART_PATTERN_BREAKOUT") trendScore = 24;
  else if (scenario === "MA200_RECLAIM") trendScore = 24;
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

  // 8. Candle & Chart Pattern Pillar (max 25)
  let candleScore = Math.min(25, Math.round(topPattern.score * 0.25));
  if (topPattern.ageBars === 0) {
    candleScore = Math.min(25, candleScore + 2);
  }
  // Chart pattern geometric reinforcement
  if (topChart) {
    if (topChart.score >= 80) candleScore = Math.min(25, candleScore + 3);
    else if (topChart.score >= 70) candleScore = Math.min(25, candleScore + 1);
  }

  // Multi-layer Confluence Detection
  const hasMultiLayerConfluence = Boolean(
    topChart &&
      topChart.score >= 70 &&
      (near20 || near50 || testedBelow200 || isEmaPullback || isGoldenCross || isSqueeze),
  );
  if (hasMultiLayerConfluence) {
    confluenceTags.push("Siêu hợp lưu Mẫu hình + MA");
  }

  // 8c. Multi-Timeframe (H1 + D1 + W1) Consensus Evaluation
  const mtf = evaluateMtfConsensus(bars, quote, {
    h1Bars: extra?.h1Bars,
    foreignBuyRatio,
    confluenceHint: trendScore + candleScore,
  });

  if (mtf.isAligned) {
    confluenceTags.push("Đồng thuận Đa Khung H1+D1+W1");
  } else if (mtf.consensus === "D1_W1_BULL") {
    confluenceTags.push("Đồng thuận D1+W1");
  } else if (mtf.consensus === "H1_D1_BULL") {
    confluenceTags.push("Sóng ngắn H1+D1");
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
  // MTF Alignment bonus: +6 for perfect H1+D1+W1 alignment, +3 for D1+W1 alignment
  const mtfBonus = mtf.isAligned ? 6 : mtf.consensus === "D1_W1_BULL" ? 3 : 0;
  // Next-Gen Confluence Tier Bonuses: Diamond Triple +5, Dual Divergence +4, MA Reclaim +3, Steep Down -4
  const tierBonus = (isDiamondTriple ? 5 : 0) + (isDualDivergence ? 4 : 0) + (isMaReclaim ? 3 : 0) + (maSlopeStatus === "STEEP_DOWN" ? -4 : 0);

  // Sector RRG & Volatility Squeeze Bonuses (Biên độ 1 & 2)
  const sectorRrgQuadrant = extra?.sectorRrgQuadrant ?? null;
  const isSectorLeading = sectorRrgQuadrant === "LEADING";
  const isSectorLagging = sectorRrgQuadrant === "LAGGING";
  const squeezeState = extra?.squeezeState ?? null;
  const squeezeBars = extra?.squeezeBars ?? null;
  const isSqueezeFiredBull = squeezeState === "fired_bull";
  const isSqueezeOn = squeezeState === "squeeze_on";

  let rrgBonus = 0;
  if (isSectorLeading) {
    rrgBonus = 5;
    confluenceTags.push("Sóng Ngành Leading");
  } else if (sectorRrgQuadrant === "IMPROVING") {
    rrgBonus = 3;
    confluenceTags.push("Sóng Ngành Đang Lên");
  } else if (isSectorLagging) {
    rrgBonus = -4;
    confluenceTags.push("Cảnh báo Ngành Tụt Hậu");
  }

  let squeezeBonus = 0;
  if (isSqueezeFiredBull) {
    squeezeBonus = 6;
    confluenceTags.push("Nổ Volatility Squeeze");
  } else if (isSqueezeOn && (squeezeBars == null || squeezeBars >= 4)) {
    squeezeBonus = 3;
    confluenceTags.push(`Squeeze Nén (${squeezeBars ?? 6}P)`);
  } else if (squeezeState === "fired_bear") {
    squeezeBonus = -6;
    confluenceTags.push("Cảnh báo Squeeze Xả");
  }

  // Biên độ 3: MA Geometry & Ribbon Squeeze Bonuses
  const maRibbonBonus = isMaRibbonSqueeze ? 4 : 0;
  if (isMaRibbonSqueeze) confluenceTags.push("Nén Dải MA Ribbon");

  const springBonus = isMaSpringPinbar ? 3 : 0;
  if (isMaSpringPinbar) confluenceTags.push("Quét Rũ Reclaim MA");

  // Biên độ 4: Volume Absorption & VSA Test Bonuses
  const absorptionBonus = isAbsorptionSpike ? 4 : 0;
  if (isAbsorptionSpike) confluenceTags.push("Hấp Thụ Cung Đột Biến");

  const vsaBonus = isVsaNoSupplyTest ? 3 : 0;
  if (isVsaNoSupplyTest) confluenceTags.push("Cạn Cung VSA Test");

  const activeBuyBonus = activeBuyRatioPct != null && activeBuyRatioPct >= 55 ? 3 : 0;
  if (activeBuyRatioPct != null && activeBuyRatioPct >= 55) {
    confluenceTags.push(`Mua Chủ Động ${Math.round(activeBuyRatioPct)}%`);
  }

  const isPrecisionMtfAligned = Boolean(extra?.isPrecisionMtfAligned ?? (mtf.isAligned || mtf.consensus === "ALL_BULL"));
  if (isPrecisionMtfAligned && !confluenceTags.includes("Đồng Thuận 3 Khung H1·D1·W1")) {
    confluenceTags.push("Đồng Thuận 3 Khung H1·D1·W1");
  }

  const extraConfluenceBonus = maRibbonBonus + springBonus + absorptionBonus + vsaBonus + activeBuyBonus;
  const confluenceScore = Math.max(10, Math.min(100, Math.round(rawSum + mtfBonus + tierBonus + rrgBonus + squeezeBonus + extraConfluenceBonus)));

  // 10. Trade Setup Calculator
  const distToMaPct =
    anchorMaPrice && anchorMaPrice > 0 ? Number((((close - anchorMaPrice) / anchorMaPrice) * 100).toFixed(1)) : null;

  let supportPrice = anchorMaPrice != null ? Math.min(patternLow, anchorMaPrice) : patternLow;
  if (topChart?.stopLossPrice && topChart.stopLossPrice > 0 && topChart.stopLossPrice < close) {
    supportPrice = Math.min(supportPrice, topChart.stopLossPrice);
  }

  const buffer = Math.max(close * 0.005, (patternHigh - patternLow) * 0.2);
  const stopLoss = roundPrice(Math.max(0.01, supportPrice - buffer), close);
  const risk = close - stopLoss;
  if (risk <= 0) return null;

  const riskPercent = Number(((risk / close) * 100).toFixed(1));
  const target1 = roundPrice(close + risk * 1.5, close);
  let target2 = roundPrice(close + risk * 2.5, close);
  if (topChart?.targetPrice && topChart.targetPrice > target1) {
    target2 = roundPrice(Math.max(target2, topChart.targetPrice), close);
  }
  const rewardPercent = Number((((target1 - close) / close) * 100).toFixed(1));
  const riskReward = Number((rewardPercent / Math.max(0.1, riskPercent)).toFixed(1));

  // 5 Orthogonal Pillars Evaluation (Zero-Redundancy Confluence Matrix)
  // Trục 1: Cấu trúc & Xu hướng (Structure & Trend)
  const hasStructureTrend = Boolean(
    slope20 > 0.04 ||
      isRibbon ||
      moneyFlow?.structure.trend === "bullish" ||
      moneyFlow?.structure.bos === "bullish" ||
      moneyFlow?.structure.choch === "bullish" ||
      (topChart != null && topChart.score >= 70),
  );

  // Trục 2: Vùng Giá trị & Cản (Value Zone & Key Levels: MA / Golden Pocket / Fibo Cluster / Flip Zone / Round Number)
  const hasValueZone = Boolean(
    near20 ||
      near50 ||
      testedBelow200 ||
      reclaimed200 ||
      isEmaPullback ||
      isGoldenPocketHit ||
      isFiboClusterHit ||
      isFlipSupportHit ||
      isRoundNumHit,
  );

  // Trục 3: Thanh khoản & Dòng tiền (Liquidity & Orderflow: SMC Sweep, Order Block, FVG, VSA, Foreign, Active Buy)
  const hasLiquidityFlow = Boolean(
    isSmcSweep ||
      isSmcObHit ||
      isFvgDiscount ||
      isAbsorptionSpike ||
      isVsaNoSupplyTest ||
      foreignAccumulating ||
      (activeBuyRatioPct != null && activeBuyRatioPct >= 55),
  );

  // Trục 4: Động lượng & Kích hoạt (Momentum & Trigger: Reversal Candle, RSI/MACD Divergence, Squeeze Explosion)
  const hasMomentumTrigger = Boolean(
    hasCandleLock ||
      bestBullDiv != null ||
      isSqueezeFiredBull ||
      (rsiVal != null && rsiVal >= 48 && rsiVal <= 68),
  );

  // Trục 5: Đa khung thời gian & Liên thị trường (MTF & Macro: MTF Consensus, Sector Leading/Improving, RS vs VN-Index)
  const hasMtfMacro = Boolean(
    mtf.isAligned ||
      mtf.consensus === "D1_W1_BULL" ||
      isSectorLeading ||
      sectorRrgQuadrant === "IMPROVING" ||
      isMarketLeader,
  );

  const orthogonalPillarsPassed =
    (hasStructureTrend ? 1 : 0) +
    (hasValueZone ? 1 : 0) +
    (hasLiquidityFlow ? 1 : 0) +
    (hasMomentumTrigger ? 1 : 0) +
    (hasMtfMacro ? 1 : 0);

  const orthogonalPillarDetails = {
    structureTrend: hasStructureTrend,
    valueZone: hasValueZone,
    liquidityFlow: hasLiquidityFlow,
    momentumTrigger: hasMomentumTrigger,
    mtfMacro: hasMtfMacro,
  };

  let setupGrade: SetupGrade = "C";
  if (orthogonalPillarsPassed === 5) {
    setupGrade = "A+";
  } else if (orthogonalPillarsPassed === 4) {
    setupGrade = "A";
  } else if (orthogonalPillarsPassed === 3) {
    setupGrade = "B";
  } else {
    setupGrade = "C";
  }

  // Setup Quality Classification (Backward compatible + Orthogonal enhancement)
  const isAplus =
    setupGrade === "A+" ||
    (confluenceScore >= 74 &&
      ((volRatio ?? 0) >= 1.15 ||
        foreignAccumulating ||
        isMarketLeader ||
        bestBullDiv != null ||
        hasMultiLayerConfluence ||
        mtf.isAligned ||
        isSmcGoldenPocket) &&
      (scenario === "SMC_GOLDEN_POCKET" ||
        scenario === "FLIP_ZONE_RETEST" ||
        scenario === "BOTTOM_BULLISH_DIVERGENCE" ||
        scenario === "CHART_PATTERN_BREAKOUT" ||
        scenario === "SMC_SWEEP_RECLAIM" ||
        scenario === "MA50_BOUNCE" ||
        scenario === "MA200_RECLAIM" ||
        scenario === "GOLDEN_CROSS_CONFIRM" ||
        scenario === "VSA_NO_SUPPLY_TEST" ||
        scenario === "EMA_RIBBON_ALIGN"));

  const setupQuality: "A+" | "A" | "B" = isAplus ? "A+" : confluenceScore >= 68 || setupGrade === "A" ? "A" : "B";

  // =========================================================================
  // SNIPER BUY TRIGGER CALCULATION (3 Orthogonal Real-time Execution Subtypes)
  // =========================================================================
  let isTriggerNow = false;
  let sniperSubtype: SniperTriggerSubtype = "NONE";
  let subtypeLabelVi = "Chờ kích hoạt";
  let sniperTriggerScore = 0;
  const sniperReasons: string[] = [];

  const changePct = quote?.changePercent ?? null;
  const isPriceSane = changePct == null || (changePct >= -1.5 && changePct <= 4.5);
  const isHighGrade = setupGrade === "A+" || setupGrade === "A";

  // Subtype 1: SNIPER_PULLBACK (Golden Pocket Fibo 0.618-0.65 / Retest Flip Zone / Cạn cung VSA)
  const isPullbackCandidate =
    (isGoldenPocketHit || isFlipSupportHit || (distToMaPct != null && Math.abs(distToMaPct) <= 1.8)) &&
    (isVsaNoSupplyTest || volumeNature === "NO_SUPPLY_TEST" || lowerWickPct >= 28 || topPattern.type === "bullish");

  // Subtype 2: SQUEEZE_BREAKOUT (Bùng nổ từ vùng nén kép TTM / MA Ribbon)
  const isSqueezeCandidate =
    (isMaRibbonSqueeze || isSqueezeOn || isSqueezeFiredBull) &&
    ((volRatio ?? 0) >= 1.2 || (activeBuyRatioPct != null && activeBuyRatioPct >= 58) || foreignAccumulating) &&
    (changePct == null || changePct >= -0.5);

  // Subtype 3: SWEEP_RECLAIM (Săn thanh khoản Smart Money / Wyckoff Spring quét rũ rồi lấy lại)
  const isSweepCandidate =
    (isMaSpringPinbar || isSmcObHit || topPattern.name.toLowerCase().includes("spring")) &&
    (lowerWickPct >= 35 || isAbsorptionSpike || volumeNature === "ABSORPTION_SPIKE");

  if (isPriceSane && (isHighGrade || confluenceScore >= 65)) {
    if (isSweepCandidate) {
      isTriggerNow = true;
      sniperSubtype = "SWEEP_RECLAIM";
      subtypeLabelVi = "Quét Rũ Thanh Khoản Rút Chân";
      sniperTriggerScore = Math.min(99, Math.round(confluenceScore * 0.45 + (isAbsorptionSpike ? 25 : 18) + (isHighGrade ? 25 : 15)));
      sniperReasons.push("Quét thủng đáy/OB rút chân mạnh");
      if (isAbsorptionSpike) sniperReasons.push("Dòng tiền lớn hấp thụ vol đột biến");
      if (isSmcObHit) sniperReasons.push("Bảo vệ Order Block tổ chức");
    } else if (isPullbackCandidate) {
      isTriggerNow = true;
      sniperSubtype = "SNIPER_PULLBACK";
      subtypeLabelVi = "Kéo Ngược Vùng Vàng / Flip Zone";
      sniperTriggerScore = Math.min(99, Math.round(confluenceScore * 0.45 + (isGoldenPocketHit ? 25 : isFlipSupportHit ? 22 : 18) + (isHighGrade ? 25 : 15)));
      if (isGoldenPocketHit) sniperReasons.push("Test chuẩn Fibo Golden Pocket 0.618 - 0.65");
      else if (isFlipSupportHit) sniperReasons.push("Retest thành công Flip Zone cản cũ");
      if (isVsaNoSupplyTest) sniperReasons.push("Cạn kiệt áp lực bán VSA No Supply");
      if (lowerWickPct >= 28) sniperReasons.push("Râu nến dưới dài hỗ trợ lực cầu");
    } else if (isSqueezeCandidate) {
      isTriggerNow = true;
      sniperSubtype = "SQUEEZE_BREAKOUT";
      subtypeLabelVi = "Bùng Nổ Từ Vùng Nén Kép";
      sniperTriggerScore = Math.min(99, Math.round(confluenceScore * 0.45 + (isSqueezeFiredBull ? 25 : 20) + (isHighGrade ? 25 : 15)));
      if (isMaRibbonSqueeze) sniperReasons.push("Nén dải MA Ribbon co cụm cực đại");
      if (isSqueezeOn || isSqueezeFiredBull) sniperReasons.push("Năng lượng nén TTM Squeeze bung nổ");
      if ((volRatio ?? 0) >= 1.2) sniperReasons.push(`Vol nổ sớm ${(volRatio ?? 0).toFixed(1)}x`);
      if (activeBuyRatioPct != null && activeBuyRatioPct >= 58) sniperReasons.push(`Phe mua chủ động ${Math.round(activeBuyRatioPct)}%`);
    }
  }

  // Refine Invalidation Stop-loss, Entry Zone & Targets
  let sniperMinEntry = roundPrice(close * 0.995, close);
  let sniperMaxEntry = roundPrice(close * 1.01, close);
  let sniperStopLoss = stopLoss;

  if (sniperSubtype === "SWEEP_RECLAIM") {
    sniperStopLoss = roundPrice(lastBar.low * 0.988, close);
    sniperMinEntry = roundPrice(close * 0.995, close);
    sniperMaxEntry = roundPrice(close * 1.012, close);
  } else if (sniperSubtype === "SNIPER_PULLBACK") {
    const refSupport = Math.min(lastBar.low, anchorMaPrice ?? lastBar.low);
    sniperStopLoss = roundPrice(refSupport * 0.985, close);
    sniperMinEntry = roundPrice(close * 0.992, close);
    sniperMaxEntry = roundPrice(close * 1.008, close);
  } else if (sniperSubtype === "SQUEEZE_BREAKOUT") {
    const baseBandLow = Math.min(lastBar.low, anchorMaPrice ?? lastBar.low);
    sniperStopLoss = roundPrice(baseBandLow * 0.978, close);
    sniperMinEntry = roundPrice(close * 0.998, close);
    sniperMaxEntry = roundPrice(close * 1.018, close);
  }

  const sniperRisk = Math.max(0.001, close - sniperStopLoss);
  const sniperStopLossDistPct = Number(((sniperRisk / close) * 100).toFixed(2));
  const sniperTarget1 = roundPrice(Math.max(target1, close * (1 + (sniperStopLossDistPct * 2.0) / 100)), close);
  const sniperTarget2 = roundPrice(Math.max(target2, close * (1 + (sniperStopLossDistPct * 3.5) / 100)), close);
  const sniperReward = Math.max(0.001, sniperTarget1 - close);
  const sniperRR = Number((sniperReward / sniperRisk).toFixed(2));

  const sniperTrigger: SniperBuyTrigger = {
    isTriggerNow,
    subtype: sniperSubtype,
    subtypeLabelVi,
    triggerScore: isTriggerNow ? sniperTriggerScore : 0,
    entryZone: {
      min: sniperMinEntry,
      max: sniperMaxEntry,
    },
    invalidationStopLoss: sniperStopLoss,
    stopLossDistancePct: sniperStopLossDistPct,
    target1: sniperTarget1,
    target2: sniperTarget2,
    riskReward: sniperRR,
    reasonsVi: sniperReasons,
  };

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

    // Chart Pattern Confluence
    topChartPattern: topChart,
    chartPatternName: topChart?.name ?? null,
    chartPatternNameVi: topChart?.nameVi ?? null,
    chartPatternScore: topChart?.score ?? null,
    hasMultiLayerConfluence,

    divergenceSignal: bestBullDiv,
    divergenceSummary: bestBullDiv
      ? `${bestBullDiv.kind === "regular_bullish" ? "Phân kỳ thường" : "Phân kỳ ẩn"} ${bestBullDiv.oscillator.toUpperCase()}${bestBullDiv.barsAgo != null ? ` (T+${bestBullDiv.barsAgo})` : ""}`
      : null,
    isBottomReversal: Boolean(bestBullDiv || scenario === "BOTTOM_BULLISH_DIVERGENCE" || scenario === "MA200_RECLAIM"),
    isDualDivergence,
    divergenceOscillators,

    confluenceScore,
    setupQuality,
    setupGrade,
    orthogonalPillarsPassed,
    orthogonalPillarDetails,
    confluenceTier,
    isDiamondTriple,
    isMaReclaim,
    maSlopeStatus,
    volumeNature,
    confluenceTags,

    // Phase 1 & 2 Confluence Details
    isGoldenPocket: isGoldenPocketHit,
    isFiboCluster: isFiboClusterHit,
    fiboSummary: fibo.summaryVi,
    isFlipZoneSupport: isFlipSupportHit,
    isRoundNumberConfluence: isRoundNumHit,
    structureSummary: structure.summaryVi,
    isSmcOrderBlock: isSmcObHit,
    isSmcFvgInDiscount: isFvgDiscount,

    // Multi-Timeframe (MTF) Confluence (H1 + D1 + W1)
    mtfConsensus: mtf.consensus,
    isMtfAligned: mtf.isAligned,
    isPrecisionMtfAligned,
    mtfScore: mtf.score,
    mtfSummary: mtf.summary,
    mtfBadgeVi: mtf.badgeVi,
    mtfDetails: mtf.details,

    // Biên độ 3: MA Geometry & Ribbon Squeeze
    isMaReclaimSpring: isMaSpringPinbar,
    maRibbonSpreadPct,
    isMaRibbonSqueeze,
    maSlope5Pct,

    // Biên độ 4: Volume Absorption & VSA
    isAbsorptionSpike,
    isVsaNoSupplyTest,
    activeBuyRatioPct,

    foreignNetVal: foreignNetValBillion,
    foreignBuyRatio,
    foreignAccumulating,
    rsRating20,
    isMarketLeader,
    sectorRrgQuadrant,
    sectorRsRatio: extra?.sectorRsRatio ?? null,
    sectorRsMomentum: extra?.sectorRsMomentum ?? null,
    isSectorLeading,
    isSectorLagging,
    rrgBonus,
    squeezeState,
    squeezeBars,
    isSqueezeFiredBull,
    isSqueezeOn,
    squeezeBonus,
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

    // Sniper Buy Trigger Plan
    sniperTrigger,
  };
}
