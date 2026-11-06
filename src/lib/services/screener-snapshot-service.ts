import "server-only";

import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getMultiQuotes } from "./multi-quote";
import { getVpsBatchForeignFlow } from "../providers/vps";
import { getFundamentalSnapshots, type FundamentalSnapshot } from "../financial/snapshots";
import { getVndValuationRatios, type VndValuationRatios } from "../providers/vndirect-company";
import { getVietcapCompany, type VietcapProfile } from "../providers/vietcap";
import { sectorOf, getSecurity, type VnExchange, VN_SECURITIES } from "../vn/master";
import { VN100 } from "../vn/vn100";
import { mapPool } from "../financial/snapshots";
import type { Meta, Quote } from "../types";

import { batchVnOhlcv } from "./ohlcv-batch";
import { sma, adx, ttmSqueeze, superTrend, rsi } from "../engines/oscillators";
import { detectChartPatterns } from "../engines/chart-patterns";
import { detectCandlePatterns } from "../engines/candlestick-patterns";
import { detectDivergences, SHORT_3_4D } from "../engines/divergence";
import {
  estimateOrnsteinUhlenbeck,
  calculateTripleBarrierLevels,
  calculateVaRAndCVaR,
} from "../engines/advanced-quant-math";
import { computeAsymmetricPlan, tickRound } from "../engines/asymmetric-quant-engine";
import type { DetectedChartPattern } from "../engines/chart-patterns";
import {
  evaluateMtfConsensus,
  type MtfConsensusStatus,
  type MtfConsensusResult,
  type MtfQuoteInput,
} from "../engines/mtf-consensus";
import {
  calculateUniverseRsRatings,
  type StockRsResult,
  type RsCategory,
} from "../engines/rs-rating";
import {
  computePiotroskiAltman,
  type PiotroskiResult,
  type AltmanZResult,
} from "../engines/piotroski-altman";
import {
  evaluateSmartMoneyFootprint,
  type SmartMoneyResult,
  type SmartMoneySignal,
} from "../engines/smart-money-footprint";
import {
  calculateUniverseOrcaMaster,
  type OrcaMasterResult,
  type OrcaMasterCategory,
  type OrcaMasterInput,
} from "../engines/orca-master-composite";
import {
  evaluateMtfCandleCluster,
  type MtfCandleClusterResult,
  type MtfCandleClusterStatus,
  type VsaSignalType,
} from "../engines/mtf-candle-cluster";
import {
  trainHistoricalPriceAction,
  type HistoricalEdgeBadge,
  type HistoricalEdgeMetrics,
} from "../engines/historical-price-action-trainer";
import {
  evaluateApexQuant,
  type ApexQuantCategory,
  type ApexQuantResult,
} from "../engines/orca-apex-quant-engine";
import {
  VN_ICB_SECTORS,
  matchSymbolToIcbSector,
  computeRrgTrail,
  determineQuadrant,
  evaluateSectorAlphaResonance,
  type SectorRrgCoord,
  type RrgQuadrant,
} from "../engines/rrg-engine";
import {
  computeFundamentalMatrix,
  type FaCategory,
  type FundamentalMatrixResult,
} from "../engines/fundamental-quant-matrix";

export type ScreenerPreset =
  | "all"
  | "apex_buy_now"
  | "orca_apex_quant"
  | "historical_edge"
  | "sector_leading"
  | "near_buy_point"
  | "orca_master_elite"
  | "smart_money_inflow"
  | "mtf_candle_cluster"
  | "vsa_no_supply"
  | "rs_leaders"
  | "piotroski_diamonds"
  | "mtf_confluence"
  | "bottom_confluence"
  | "smc_golden_pocket"
  | "flip_zone_retest"
  | "quant_edge"
  | "quant_mean_revert"
  | "quant_low_beta"
  | "quant_asymmetric"
  | "confluence"
  | "vcp"
  | "ttm_squeeze"
  | "canslim"
  | "dividend"
  | "growth"
  | "value"
  | "breakout"
  | "ma_cross"
  | "fa_fortress"
  | "earnings_quality"
  | "magic_formula"
  | "consensus_upside"
  | "tight_closes_vdu";

export type ScreenerStockItem = {
  symbol: string;
  name: string | null;
  sector: string | null;
  exchange: VnExchange | string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null; // in Billion VND
  pe: number | null;
  pb: number | null;
  ps: number | null;
  evEbitda: number | null;
  dividendYield: number | null; // % (e.g. 7.5 = 7.5%)
  roe: number | null; // %
  roa: number | null; // %
  grossMargin: number | null; // %
  netMargin: number | null; // %
  debtEquity: number | null;
  currentRatio: number | null;
  revenueYoyPct: number | null; // %
  niYoyPct: number | null; // %
  fcfTtm: number | null;
  qualityScore: number | null; // 0-100
  healthScore: number | null; // 0-100
  // Fundamental Financial Health (Piotroski 0-9 & Altman Z''-Score)
  piotroskiFScore: number | null;
  piotroskiRating?: "EXCELLENT" | "GOOD" | "AVERAGE" | "WEAK";
  altmanZScore: number | null;
  altmanZone?: "SAFE" | "GREY" | "DISTRESS";
  // MA Technical Momentum
  ma10: number | null;
  ma20: number | null;
  ma50: number | null;
  maSignal: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL";
  volRatio20: number | null;
  // Advanced Indicators & Patterns
  adx14: number | null;
  squeezeState: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" | null;
  superTrendDir: "up" | "down" | null;
  chartPattern: string | null;
  candlePattern?: string | null;
  candlePatternScore?: number | null;
  candleAgeBars?: number | null;
  vcpDepths?: number[] | null;
  vcpLastDepth?: number | null;
  vcpPivot?: number | null;
  confluenceScore: number; // 0-100
  confluenceBadge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE";
  hasBullishDivergence?: boolean;
  divergenceSummary?: string | null;
  foreignNetVal?: number | null; // in Billion VND
  foreignAccumulating?: boolean;
  // William O'Neil Relative Strength (RS Rating 1 - 99)
  rsRating: number | null;
  rsCategory?: RsCategory;
  rsTrend?: "IMPROVING" | "WEAKENING" | "NEUTRAL";
  rsRating20?: number | null;
  isMarketLeader?: boolean;
  // Multi-Timeframe (MTF) Confluence (H1 + D1 + W1)
  mtfConsensus: MtfConsensusStatus;
  isMtfAligned: boolean;
  mtfScore: number;
  mtfBadgeVi: string;
  mtfSummary: string;
  // Quant Edge Engine Fields (Advanced Mathematical Statistics)
  quantEdgeScore?: number; // 0-100
  quantBadge?: "SUPER_QUANT" | "QUANT_EDGE" | "WATCH" | "NEUTRAL";
  ouZScore?: number | null; // Ornstein-Uhlenbeck Z-score deviation from equilibrium mean
  ouHalfLife?: number | null; // Mean reversion half-life in trading days (bars)
  ouMu?: number | null; // Long-term mean price mu
  tripleBarrierRiskReward?: number | null; // Dynamic volatility Risk/Reward ratio
  tripleBarrierUpper?: number | null; // Dynamic Volatility Take-Profit (VND)
  tripleBarrierLower?: number | null; // Dynamic Volatility Stop-Loss (VND)
  cornishFisherVaR95?: number | null; // Non-normal 95% 1-day Value at Risk (%)
  returnSkewness?: number | null; // Positive skewness indicates upside fat tails
  quantAnomalyTag?: string | null; // e.g. "OU Mean Reversion", "Low-Beta Anomaly", "Asymmetric R/R"
  beta?: number | null;
  // Optimal Buy Point & Trade Execution
  buyPoint: number | null;
  buyPointDiffPct: number | null; // % difference: ((price - buyPoint) / price) * 100
  absBuyDiff: number | null; // Absolute difference %: Math.abs(buyPointDiffPct)
  buyRange: [number, number] | null; // Entry accumulation zone [min, max]
  buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" | "NO_SETUP";
  stopLoss: number | null;
  targetPrice: number | null;
  riskReward: number | null;
  buyStrategy: string | null;
  presetsPassed: ScreenerPreset[];
  compositeScore: number; // 0-100
  // Orca Composite Master Rating (1 - 99)
  orcaMasterScore: number | null;
  orcaMasterCategory?: OrcaMasterCategory;
  orcaMasterStrengthVi?: string | null;
  // Smart Money Footprint & Orderflow
  smartMoneyScore: number | null; // 0 - 100
  smartMoneySignal?: SmartMoneySignal;
  smartMoneySignalVi?: string | null;
  activeBuyRatioPct?: number | null;
  smartMoneySummaryVi?: string | null;
  // Multi-Chart Grid View Data (Sprint 3)
  sparkline?: number[]; // Last 20 session closing prices
  sparkBars?: { o: number; h: number; l: number; c: number; v: number }[]; // Last 20 OHLCV bars
  // MTF Candlestick & VSA Cluster Engine
  mtfCandleClusterStatus?: MtfCandleClusterStatus;
  mtfCandleScore?: number;
  mtfCandleBadgeVi?: string;
  mtfCandleD1Pattern?: string | null;
  mtfCandleW1Pattern?: string | null;
  mtfCandleH1Pattern?: string | null;
  vsaSignal?: VsaSignalType;
  vsaSignalVi?: string | null;
  overheadRoomPct?: number | null;
  nearestResistance?: number | null;
  // Historical Price Action Training & Empirical Edge
  historicalWinRate?: number | null;
  upDownVolRatio?: number | null;
  supportBounceRate?: number | null;
  fakeoutRiskPct?: number | null;
  historicalEdgeScore?: number | null;
  historicalEdgeBadge?: HistoricalEdgeBadge;
  historicalEdgeVerdictVi?: string | null;
  // Apex Quant Confluence & Bottom Reversal Engine
  apexQuantScore?: number | null; // 1 - 99
  apexCategory?: ApexQuantCategory | string | null;
  apexCategoryVi?: string | null;
  reversalStageVi?: string | null;
  extensionFromBottomPct?: number | null;
  isSweetLaunchZone?: boolean | null;
  isWyckoffSpring?: boolean | null;
  isMaReclaim?: boolean | null;
  // Next-Gen Confluence Engine (Hợp lưu MA + Nến đảo chiều + Phân kỳ)
  isDiamondConfluence?: boolean | null;
  isDualDivergence?: boolean | null;
  setupGrade?: "A+" | "A" | "B" | "C" | null;
  orthogonalPillarsPassed?: number | null;
  isGoldenPocket?: boolean | null;
  fiboSummary?: string | null;
  isFlipZoneSupport?: boolean | null;
  structureSummary?: string | null;
  isSmcOrderBlock?: boolean | null;
  // Real-Time Actionable Buy Trigger Engine (Kích hoạt điểm mua tức thời)
  isBuyTriggerNow?: boolean | null;
  buyTriggerScore?: number | null; // 1 - 99
  buyTriggerReasonVi?: string | null;
  sniperTriggerSubtype?: "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM" | "NONE" | null;
  sniperTriggerLabelVi?: string | null;
  sniperEntryMin?: number | null;
  sniperEntryMax?: number | null;
  sniperStopLoss?: number | null;
  sniperTarget1?: number | null;
  sniperTarget2?: number | null;
  sniperRiskReward?: number | null;
  // Sector RRG Alpha Resonance (Biên độ 1)
  sectorRrgQuadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | null;
  sectorRsRatio?: number | null;
  sectorRsMomentum?: number | null;
  isSectorLeading?: boolean;
  isSectorLagging?: boolean;
  sectorResonanceBonus?: number | null;
  // Volatility Squeeze Dynamics (Biên độ 2)
  squeezeBars?: number | null;
  isSqueezeFiredBull?: boolean;
  isSqueezeOn?: boolean;
  squeezeMomentumSlope?: "ACCELERATING_BULL" | "DECELERATING_BULL" | "ACCELERATING_BEAR" | "DECELERATING_BEAR" | "FLAT" | null;
  // MA Geometry & Ribbon Squeeze (Biên độ 3)
  isMaRibbonSqueeze?: boolean;
  maRibbonSpreadPct?: number | null;
  isMaReclaimSpring?: boolean;
  maSlope5Pct?: number | null;
  // Volume Absorption & VSA Test (Biên độ 4)
  isAbsorptionSpike?: boolean;
  isVsaNoSupplyTest?: boolean;
  // Precision MTF Alignment (Biên độ 5)
  isPrecisionMtfAligned?: boolean;
  // Advanced Technical Recognition Engine (Nâng Cấp Nhận Diện Kỹ Thuật)
  isTightCloses?: boolean;
  tightCloseSpreadPct?: number | null;
  isVolumeDryUp?: boolean;
  isRsNewHigh20?: boolean;
  isWyckoffLps?: boolean;
  // Fundamental Quant Matrix (Nâng Cấp Phân Tích Cơ Bản FA)
  roic?: number | null; // Return on Invested Capital (%)
  cfoToNetProfit?: number | null; // CFO / Net Profit
  isQualityEarnings?: boolean;
  ocfBillion?: number | null; // Dòng tiền thuần HĐKD (Tỷ VNĐ)
  fcfYieldPct?: number | null; // FCF Yield (%)
  interestCoverage?: number | null; // Hệ số phủ lãi vay (ICR)
  isSafeDebt?: boolean;
  isNetCash?: boolean; // Tiền mặt ròng > Nợ vay
  netDebtToEbitda?: number | null;
  peg?: number | null; // P/E / Tăng trưởng LN ròng (Peter Lynch)
  consensusTargetPrice?: number | null; // Giá mục tiêu CTCK
  consensusUpsidePct?: number | null; // Upside định giá CTCK (%)
  magicFormulaScore?: number | null; // Magic Formula Greenblatt (1-99)
  faCategory?: FaCategory;
  faBadgeVi?: string | null;
  faSummaryVi?: string | null;
};

export type ScreenerFilterParams = {
  preset?: ScreenerPreset;
  exchange?: string;
  sector?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minChg?: number;
  maxChg?: number;
  minVol?: number;
  maxVol?: number;
  minTradingValue?: number; // Minimum trading turnover in Billion VND
  minMarketCap?: number;
  maxMarketCap?: number;
  minPe?: number;
  maxPe?: number;
  minPb?: number;
  maxPb?: number;
  minRoe?: number;
  maxRoe?: number;
  minRoa?: number;
  maxRoa?: number;
  minDivYield?: number;
  maxDivYield?: number;
  maxDe?: number;
  minQualityScore?: number;
  minRevenueYoy?: number;
  minNiYoy?: number;
  maSignal?: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL" | string;
  minQuantScore?: number;
  maxOuZScore?: number;
  minRiskReward?: number;
  minOrcaMasterScore?: number;
  minSmartMoneyScore?: number;
  minRsRating?: number;
  minPiotroskiScore?: number;
  minHistoricalEdgeScore?: number;
  minHistoricalWinRate?: number;
  minUpDownVolRatio?: number;
  minApexScore?: number;
  maxExtensionBottom?: number;
  sweetZoneOnly?: boolean;
  buyTriggerOnly?: boolean; // Lọc các mã kích hoạt điểm mua ngay tức thời
  minBuyTriggerScore?: number; // Điểm xung lực mua tối thiểu (0-100)
  maxBuyDiff?: number; // % khoảng cách tối đa tới điểm mua (ví dụ: 1.5 = trong vòng 1.5%)
  buyZoneStatus?: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" | "ALL" | string;
  mtfOnly?: boolean; // Lọc các cổ phiếu có đồng thuận đa khung H1 + D1 + W1
  mtfConsensus?: "ALL_BULL" | "D1_W1_BULL" | "H1_D1_BULL" | "MIXED" | "BEAR_PRESSURE" | "ALL" | string;
  mtfCandleOnly?: boolean;
  minMtfCandleScore?: number;
  vsaOnly?: boolean;
  minOverheadRoom?: number;
  // Sector RRG & Volatility Squeeze Filters (Biên độ 1 & 2)
  rrgQuadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | "all";
  sectorLeadingOnly?: boolean;
  squeezeOnly?: boolean;
  squeezeFiredOnly?: boolean;
  // MA Geometry, Volume Absorption & Precision MTF Filters (Biên độ 3, 4, 5)
  maRibbonSqueezeOnly?: boolean;
  maReclaimOnly?: boolean;
  absorptionSpikeOnly?: boolean;
  vsaNoSupplyOnly?: boolean;
  precisionMtfOnly?: boolean;
  // Consolidated Compound Filters (Gộp các bộ lọc cùng chức năng)
  buyPosition?: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "SAFE_ACCUMULATION" | "WAIT_PULLBACK" | "BELOW_SUPPORT" | "ALL" | string;
  volatilityCoil?: "ALL" | "FIRED" | "SQUEEZE_ON" | "RIBBON_SQUEEZE" | "COIL_SUPER" | string;
  vsaPattern?: "ALL" | "ABSORPTION" | "NO_SUPPLY" | "ACTIVE_BUY" | string;
  faProfile?: "ALL" | "FORTRESS" | "CASH_MACHINE" | "MOAT_QUALITY" | "UNDERVALUED_GROWTH" | "CONSENSUS_UPSIDE" | "VALUE_DIVIDEND" | "HIGH_RISK" | string;
  techPattern?: "ALL" | "TIGHT_CLOSES" | "VDU" | "RS_NEW_HIGH" | "WYCKOFF_LPS" | string;
  minRoic?: number;
  minInterestCoverage?: number;
  minCfoToNp?: number;
  minConsensusUpside?: number;
  maxPeg?: number;
  netCashOnly?: boolean;
  tightClosesOnly?: boolean;
  vduOnly?: boolean;
  rsNewHighOnly?: boolean;
  wyckoffLpsOnly?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type ScreenerResponseData = {
  items: ScreenerStockItem[];
  total: number;
  totalUniverse: number;
  offset: number;
  limit: number;
  presetsCount: Record<ScreenerPreset, number>;
  sectorsAvailable: string[];
  sourcesUsed: string[];
  redundancyInfo: {
    quoteProviders: string[];
    valuationProviders: string[];
    failoverCount: number;
    healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
    latencies?: Record<string, number>;
    conflictCount?: number;
  };
  meta: Meta;
};

// Universe builder: combine VN100 with all defined VN_SECURITIES for high coverage
function getScreenerUniverse(): string[] {
  const set = new Set<string>();
  for (const s of VN100) set.add(s.toUpperCase());
  for (const s of VN_SECURITIES) set.add(s.symbol.toUpperCase());
  return Array.from(set);
}

export interface ParsedBars {
  closes: number[];
  highs: number[];
  lows: number[];
  vols: number[];
  ohlcvBars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
}

export function parseBarArrays(bars?: { open?: number; high?: number; low?: number; close: number; volume: number; time?: number }[]): ParsedBars {
  const n = bars ? bars.length : 0;
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const vols: number[] = [];
  const ohlcvBars: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars![i];
    const c = b.close;
    if (!Number.isFinite(c) || c <= 0) continue;
    const h = b.high != null && Number.isFinite(b.high) && b.high > 0 ? b.high : c;
    const l = b.low != null && Number.isFinite(b.low) && b.low > 0 ? b.low : c;
    const o = b.open != null && Number.isFinite(b.open) && b.open > 0 ? b.open : c;
    const v = b.volume ?? 0;
    const t = b.time ?? i;

    closes.push(c);
    highs.push(h);
    lows.push(l);
    if (v > 0) vols.push(v);
    ohlcvBars.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
  }

  return { closes, highs, lows, vols, ohlcvBars };
}

function analyzeMaFeatures(parsed: ParsedBars, currentPrice: number | null) {
  const closes = parsed.closes;
  const len = closes.length;
  if (len < 15) {
    return {
      ma10: null,
      ma20: null,
      ma50: null,
      volRatio20: null,
      maSignal: "NEUTRAL" as const,
    };
  }

  const sma10Series = sma(closes, 10);
  const sma20Series = sma(closes, 20);
  const sma50Series = sma(closes, 50);

  const ma10 = sma10Series[len - 1] ?? null;
  const ma20 = sma20Series[len - 1] ?? null;
  const ma50 = sma50Series[len - 1] ?? null;

  const prevMa10 = len >= 2 ? sma10Series[len - 2] : null;
  const prevMa20 = len >= 2 ? sma20Series[len - 2] : null;
  const prevMa50 = len >= 2 ? sma50Series[len - 2] : null;

  // Vol ratio 20
  const vols = parsed.vols;
  let volRatio20: number | null = null;
  if (vols.length >= 20) {
    let sum20 = 0;
    const startIdx = vols.length - 20;
    for (let i = startIdx; i < vols.length; i++) sum20 += vols[i];
    const avgVol = sum20 / 20;
    const lastVol = vols[vols.length - 1];
    if (avgVol > 0 && lastVol > 0) {
      volRatio20 = Number((lastVol / avgVol).toFixed(2));
    }
  }

  const p = currentPrice ?? closes[len - 1];

  let maSignal: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL" = "NEUTRAL";

  // 1. Golden Cross: MA10 cắt lên MA20 hoặc MA20 cắt lên MA50
  const isCrossUp20_50 =
    prevMa20 != null && prevMa50 != null && ma20 != null && ma50 != null && prevMa20 <= prevMa50 && ma20 > ma50;
  const isCrossUp10_20 =
    prevMa10 != null && prevMa20 != null && ma10 != null && ma20 != null && prevMa10 <= prevMa20 && ma10 > ma20;

  // 2. Death Cross: MA20 cắt xuống MA50
  const isCrossDown20_50 =
    prevMa20 != null && prevMa50 != null && ma20 != null && ma50 != null && prevMa20 >= prevMa50 && ma20 < ma50;

  // 3. Bullish Alignment: Giá > MA10 >= MA20 > MA50
  const isAlignedBull =
    ma10 != null && ma20 != null && p > ma10 && ma10 >= ma20 && (ma50 == null || ma20 > ma50);

  if (isCrossUp20_50 || isCrossUp10_20) {
    maSignal = "GOLDEN_CROSS";
  } else if (isAlignedBull) {
    maSignal = "BULLISH_ALIGN";
  } else if (isCrossDown20_50 || (ma20 != null && ma50 != null && p < ma20 && ma20 < ma50)) {
    maSignal = "DEATH_CROSS";
  }

  return {
    ma10: ma10 ? Number(ma10.toFixed(2)) : null,
    ma20: ma20 ? Number(ma20.toFixed(2)) : null,
    ma50: ma50 ? Number(ma50.toFixed(2)) : null,
    volRatio20,
    maSignal,
  };
}

function analyzeTechFeatures(
  parsed: ParsedBars,
  currentPrice: number | null,
  compositeScore: number,
  foreignAccumulating = false,
  rsPerf20: number | null = null,
  quote?: MtfQuoteInput | null,
  foreignBuyRatioPct?: number | null,
) {
  const maRes = analyzeMaFeatures(parsed, currentPrice);
  const { closes, highs, lows, ohlcvBars } = parsed;
  const n = closes.length;
  if (n < 15) {
    return {
      ...maRes,
      adx14: null,
      squeezeState: null,
      squeezeBars: null,
      isSqueezeFiredBull: false,
      isSqueezeOn: false,
      squeezeMomentumSlope: null,
      superTrendDir: null,
      chartPattern: null,
      topChartPattern: null as DetectedChartPattern | null,
      candlePattern: null,
      candlePatternScore: null,
      candleAgeBars: null,
      hasBullishDivergence: false,
      isDualDivergence: false,
      divergenceSummary: null,
      confluenceScore: compositeScore,
      confluenceBadge: "NONE" as const,
      mtfConsensus: "MIXED" as const,
      isMtfAligned: false,
      isPrecisionMtfAligned: false,
      isMaRibbonSqueeze: false,
      maRibbonSpreadPct: null,
      isMaReclaimSpring: false,
      maSlope5Pct: null,
      isAbsorptionSpike: false,
      isVsaNoSupplyTest: false,
      isTightCloses: false,
      tightCloseSpreadPct: null,
      isVolumeDryUp: false,
      isRsNewHigh20: false,
      isWyckoffLps: false,
      mtfScore: 50,
      mtfBadgeVi: "Chưa đủ nến",
      mtfSummary: "Chưa đủ dữ liệu đa khung",
    };
  }

  let lastAdx: number | null = null;
  let plusDi: number | null = null;
  let minusDi: number | null = null;
  if (n >= 28) {
    const adxData = adx(highs, lows, closes, 14);
    lastAdx = adxData.adx[n - 1] ?? null;
    plusDi = adxData.plusDi[n - 1] ?? null;
    minusDi = adxData.minusDi[n - 1] ?? null;
  }

  let sqState: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" = "squeeze_off";
  let sqBars = 0;
  let sqSlope: "ACCELERATING_BULL" | "DECELERATING_BULL" | "ACCELERATING_BEAR" | "DECELERATING_BEAR" | "FLAT" = "FLAT";
  if (n >= 38) {
    const sqData = ttmSqueeze(highs, lows, closes, 20, 2, 20, 1.5);
    sqState = sqData.state;
    sqBars = sqData.squeezeBars;
    sqSlope = sqData.momentumSlope;
  }

  let stDir: "up" | "down" | null = null;
  if (n >= 15) {
    const stData = superTrend(highs, lows, closes, 10, 3);
    stDir = stData.direction[n - 1] ?? null;
  }

  const chartPatterns = detectChartPatterns(ohlcvBars);
  const topPattern = chartPatterns[0] ?? null;

  // Multi-tier Candlestick pattern detection (recent 5 bars)
  const candlePatterns = detectCandlePatterns(ohlcvBars, { recentBars: 5, reversalOnly: false });
  const topCandle = candlePatterns.find((c) => c.type === "bullish") ?? null;
  const candlePattern = topCandle ? topCandle.nameVi : null;
  const candlePatternScore = topCandle ? topCandle.score : null;
  const candleAgeBars = topCandle?.ageBars ?? null;

  // 1. Trend Pillar (max 25)
  let trendScore = 0;
  if (maRes.maSignal === "GOLDEN_CROSS" || maRes.maSignal === "BULLISH_ALIGN") trendScore += 14;
  else if (currentPrice && maRes.ma20 && currentPrice > maRes.ma20) trendScore += 8;
  if (currentPrice && maRes.ma50 && currentPrice > maRes.ma50) trendScore += 5;
  if (lastAdx != null && lastAdx >= 20 && plusDi != null && minusDi != null && plusDi > minusDi) trendScore += 6;
  if (stDir === "up") trendScore += 5;
  trendScore = Math.min(25, trendScore);

  // 2. Pattern & VSA Pillar (max 25)
  let patternScore = 0;
  let patternLabel: string | null = null;
  if (topPattern && topPattern.type === "bullish" && topCandle) {
    patternScore = Math.min(25, Math.round(topPattern.score * 0.14 + (topCandle.score || 75) * 0.16));
    patternLabel = `${topPattern.nameVi} + ${topCandle.nameVi}`;
  } else if (topCandle && (!topPattern || topCandle.score >= (topPattern.score ?? 0))) {
    patternScore = Math.min(25, Math.round((topCandle.score || 75) * 0.26));
    patternLabel = topCandle.nameVi;
  } else if (topPattern && topPattern.type === "bullish") {
    patternScore = Math.min(25, Math.round(topPattern.score * 0.26));
    patternLabel = topPattern.nameVi;
  } else if (currentPrice && maRes.ma20 && currentPrice >= maRes.ma20 * 0.98) {
    // Giá giữ vững hỗ trợ MA20
    patternScore = 14;
    patternLabel = "Nền hỗ trợ MA20";
  } else {
    patternScore = 8;
  }
  patternScore = Math.min(25, patternScore);

  // 3. Volume & Momentum Squeeze Pillar (max 25)
  let momScore = 0;
  if (maRes.volRatio20 != null && maRes.volRatio20 >= 1.2) momScore += 8;
  else if (maRes.volRatio20 != null && maRes.volRatio20 >= 1.0) momScore += 5;
  else if (maRes.volRatio20 != null && maRes.volRatio20 <= 0.75 && currentPrice && maRes.ma20 && currentPrice >= maRes.ma20 * 0.98) {
    // VSA No Supply Test: cạn cung tại hỗ trợ MA
    momScore += 6;
  }
  if (sqState === "fired_bull") momScore += 12;
  else if (sqState === "squeeze_on") momScore += 8;

  if (n >= 20) {
    const rsiArr = rsi(closes, 14);
    const curRsi = rsiArr[n - 1];
    if (curRsi != null && curRsi >= 45 && curRsi <= 68) momScore += 5;
  }

  // Bullish Divergence Detection (RSI / MACD / Stoch)
  let hasBullishDivergence = false;
  let isDualDivergence = false;
  let divergenceSummary: string | null = null;
  if (ohlcvBars && ohlcvBars.length >= 18) {
    try {
      const divSignals = detectDivergences(ohlcvBars, {
        ...SHORT_3_4D,
        lookback: Math.min(ohlcvBars.length, 50),
      });
      const bullSignals = divSignals.filter(
        (s) =>
          s.kind.includes("bullish") &&
          s.status !== "invalidated" &&
          (s.barsAgo == null || s.barsAgo <= 8),
      );
      if (bullSignals.length > 0) {
        hasBullishDivergence = true;
        const divOscs = Array.from(new Set(bullSignals.map((b) => b.oscillator.toUpperCase())));
        const hasRsi = divOscs.includes("RSI");
        const hasMacd = divOscs.some((o) => o.includes("MACD"));
        isDualDivergence = hasRsi && hasMacd;

        const primary = bullSignals[0]!;
        divergenceSummary = isDualDivergence
          ? `Phân kỳ kép RSI+MACD${primary.barsAgo != null ? ` (T+${primary.barsAgo})` : ""}`
          : `Phân kỳ ${primary.oscillator.toUpperCase()}${primary.barsAgo != null ? ` (T+${primary.barsAgo})` : ""}`;
        momScore = Math.min(25, momScore + (isDualDivergence ? 12 : 8));
      }
    } catch {
      // safe
    }
  }

  momScore = Math.min(25, momScore);

  // 4. Flow, RS Leader & Fundamental Pillar (max 25)
  let flowRsScore = Math.min(14, Math.max(5, Math.round(compositeScore * 0.14)));
  if (foreignAccumulating) flowRsScore += 6;
  if (rsPerf20 != null && rsPerf20 > 0) flowRsScore += 5;
  flowRsScore = Math.min(25, flowRsScore);

  // 5. Multi-Timeframe (H1 + D1 + W1) Consensus
  const mtf = evaluateMtfConsensus(ohlcvBars, quote, {
    foreignBuyRatio: foreignBuyRatioPct,
    confluenceHint: trendScore + patternScore,
  });

  // Biên độ 3: MA Geometry & Ribbon Squeeze
  const maRibbonSpreadPct =
    maRes.ma10 != null && maRes.ma20 != null && maRes.ma50 != null && maRes.ma50 > 0
      ? Number((((Math.max(maRes.ma10, maRes.ma20, maRes.ma50) - Math.min(maRes.ma10, maRes.ma20, maRes.ma50)) / ((maRes.ma10 + maRes.ma20 + maRes.ma50) / 3)) * 100).toFixed(2))
      : null;
  const isMaRibbonSqueeze = maRibbonSpreadPct != null && maRibbonSpreadPct <= 2.8;

  const lastBar = ohlcvBars[n - 1];
  const candleRange = Math.max(0.001, lastBar.high - lastBar.low);
  const lowerShadowRatio = (Math.min(lastBar.open, lastBar.close) - lastBar.low) / candleRange;
  const isMaReclaim =
    (maRes.ma20 != null && lastBar.low < maRes.ma20 * 0.992 && lastBar.close >= maRes.ma20 * 0.998) ||
    (maRes.ma50 != null && lastBar.low < maRes.ma50 * 0.992 && lastBar.close >= maRes.ma50 * 0.998) ||
    (maRes.ma10 != null && lastBar.low < maRes.ma10 * 0.992 && lastBar.close >= maRes.ma10 * 0.998);
  const isMaReclaimSpring = isMaReclaim && lowerShadowRatio >= 0.35;

  let maSlope5Pct: number | null = null;
  if (n >= 25 && maRes.ma20 != null) {
    const pastMa20 = sma(closes.slice(0, n - 5), 20);
    const pastVal = pastMa20[pastMa20.length - 1];
    if (pastVal && pastVal > 0) {
      maSlope5Pct = Number((((maRes.ma20 - pastVal) / pastVal) * 100).toFixed(2));
    }
  }

  // Biên độ 4: Volume Absorption & VSA Test
  const isAbsorptionSpike = (maRes.volRatio20 ?? 0) >= 1.30 && lastBar.close >= lastBar.open;
  const isVsaNoSupplyTest =
    (maRes.volRatio20 ?? 0) <= 0.65 &&
    Math.abs(lastBar.close - lastBar.open) / (lastBar.open || 1) <= 0.018;

  // Biên độ 5: Precision MTF Alignment
  const isPrecisionMtfAligned = mtf.isAligned || mtf.consensus === "ALL_BULL";

  // Nâng cao 1: Nén Giá Phẳng Minervini Tight Closes (3-4 phiên co cụm biên độ <= 1.2% quanh MA)
  let isTightCloses = false;
  let tightCloseSpreadPct: number | null = null;
  if (n >= 4) {
    const recent4 = closes.slice(n - 4);
    const maxC = Math.max(...recent4);
    const minC = Math.min(...recent4);
    if (minC > 0) {
      tightCloseSpreadPct = Number((((maxC - minC) / minC) * 100).toFixed(2));
      if (tightCloseSpreadPct <= 1.25 && (maRes.ma20 == null || (currentPrice != null && currentPrice >= maRes.ma20 * 0.98))) {
        isTightCloses = true;
      }
    }
  }

  // Nâng cao 2: Cạn kiệt thanh khoản Volume Dry-Up (VDU <= 0.60 vol20 trong nền)
  const isVolumeDryUp =
    (maRes.volRatio20 != null && maRes.volRatio20 <= 0.60) &&
    (currentPrice != null && maRes.ma20 != null && Math.abs(currentPrice - maRes.ma20) / maRes.ma20 <= 0.035);

  // Nâng cao 3: RS Rating / Đường Sức mạnh tương đối dẫn dắt lập đỉnh mới
  const isRsNewHigh20 = Boolean(rsPerf20 != null && rsPerf20 >= 6.0);

  // Nâng cao 4: Wyckoff LPS (Last Point of Support / Test cung kiệt von trên hỗ trợ)
  const isWyckoffLps =
    Boolean(maRes.ma20 && currentPrice && currentPrice >= maRes.ma20 * 0.985 && currentPrice <= maRes.ma20 * 1.03) &&
    (maRes.volRatio20 != null && maRes.volRatio20 <= 0.82) &&
    (lastBar.close >= lastBar.open || lowerShadowRatio >= 0.3);

  const mtfBonus = mtf.isAligned ? 6 : mtf.consensus === "D1_W1_BULL" ? 3 : 0;
  const techPatternBonus = (isTightCloses ? 3 : 0) + (isVolumeDryUp ? 3 : 0) + (isWyckoffLps ? 3 : 0) + (isRsNewHigh20 ? 3 : 0);
  const confluenceScore = Math.min(100, Math.max(20, trendScore + patternScore + momScore + flowRsScore + mtfBonus + Math.min(techPatternBonus, 6)));

  let confluenceBadge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE" = "NONE";
  if (confluenceScore >= 70 || (confluenceScore >= 66 && mtf.isAligned)) confluenceBadge = "SUPER_SETUP";
  else if (confluenceScore >= 52) confluenceBadge = "POTENTIAL_BREAKOUT";
  else if (confluenceScore >= 42) confluenceBadge = "WATCH";

  return {
    ...maRes,
    adx14: lastAdx != null ? Number(lastAdx.toFixed(1)) : null,
    squeezeState: sqState,
    squeezeBars: sqBars,
    isSqueezeFiredBull: sqState === "fired_bull",
    isSqueezeOn: sqState === "squeeze_on",
    squeezeMomentumSlope: sqSlope,
    superTrendDir: stDir,
    chartPattern: patternLabel,
    topChartPattern: topPattern,
    candlePattern,
    candlePatternScore,
    candleAgeBars,
    hasBullishDivergence,
    isDualDivergence,
    divergenceSummary,
    confluenceScore,
    confluenceBadge,
    mtfConsensus: mtf.consensus,
    isMtfAligned: mtf.isAligned,
    isPrecisionMtfAligned,
    isMaRibbonSqueeze,
    maRibbonSpreadPct,
    isMaReclaimSpring,
    maSlope5Pct,
    isAbsorptionSpike,
    isVsaNoSupplyTest,
    isTightCloses,
    tightCloseSpreadPct,
    isVolumeDryUp,
    isRsNewHigh20,
    isWyckoffLps,
    mtfScore: mtf.score,
    mtfBadgeVi: mtf.badgeVi,
    mtfSummary: mtf.summary,
  };
}

export function calculateBuyPointPlan(
  parsed: ParsedBars,
  price: number | null,
  ma20: number | null,
  ma50: number | null,
  topChartPattern: DetectedChartPattern | null,
  confluenceScore: number,
  volRatio20: number | null,
) {
  const { closes, highs, lows } = parsed;
  const n = closes.length;
  if (!price || price <= 0 || n < 10) {
    return {
      buyPoint: null,
      buyPointDiffPct: null,
      absBuyDiff: null,
      buyRange: null as [number, number] | null,
      buyZoneStatus: "NO_SETUP" as const,
      stopLoss: null,
      targetPrice: null,
      riskReward: null,
      buyStrategy: null,
    };
  }

  // 1. Kiểm tra điểm Pivot bứt phá từ mẫu hình biểu đồ kinh điển (VCP, Cốc tay cầm, Hai đáy, Cờ tăng)
  const pivot = topChartPattern?.breakoutPrice ?? null;
  const isPivotValid = pivot != null && pivot > 0 && Math.abs((price - pivot) / price) <= 0.045;

  if (isPivotValid && topChartPattern) {
    const buyPoint = tickRound(pivot);
    const diffPct = Number((((price - buyPoint) / price) * 100).toFixed(1));
    const absDiff = Math.abs(diffPct);
    const buyRange: [number, number] = [
      tickRound(buyPoint * 0.99),
      tickRound(buyPoint * 1.015),
    ];
    let buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" = "NEAR_BUY_POINT";
    if (absDiff <= 1.0 || (price >= buyRange[0] && price <= buyRange[1])) {
      buyZoneStatus = "AT_BUY_POINT";
    } else if (absDiff <= 2.5) {
      buyZoneStatus = "NEAR_BUY_POINT";
    } else if (diffPct > 2.5) {
      buyZoneStatus = "WAIT_PULLBACK";
    } else {
      buyZoneStatus = "BELOW_SUPPORT";
    }

    const sl = topChartPattern.stopLossPrice ? tickRound(topChartPattern.stopLossPrice) : tickRound(buyPoint * 0.95);
    const tp = topChartPattern.targetPrice ? tickRound(topChartPattern.targetPrice) : tickRound(buyPoint * 1.15);
    const risk = buyPoint - sl;
    const reward = tp - buyPoint;
    const rr = risk > 0 ? Number((reward / risk).toFixed(1)) : 2.5;

    return {
      buyPoint,
      buyPointDiffPct: diffPct,
      absBuyDiff: absDiff,
      buyRange,
      buyZoneStatus,
      stopLoss: sl,
      targetPrice: tp,
      riskReward: rr,
      buyStrategy: `Pivot bứt phá ${topChartPattern.nameVi}`,
    };
  }

  // 2. Tính bệ đỡ hỗ trợ hội tụ đa tầng theo thuật toán Asymmetric Quant
  const localSupports: number[] = [];
  const localResistances: number[] = [];
  for (let i = Math.max(0, n - 25); i < n; i++) {
    if (lows[i] && lows[i] > 0) localSupports.push(lows[i]);
    if (highs[i] && highs[i] > 0) localResistances.push(highs[i]);
  }

  let trSum = 0;
  const lb = Math.min(14, n - 1);
  for (let i = n - lb; i < n; i++) {
    trSum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const atr14 = lb > 0 ? trSum / lb : price * 0.02;

  const asym = computeAsymmetricPlan({
    last: price,
    atr14,
    supports: localSupports,
    resistances: localResistances,
    sma20: ma20,
    sma50: ma50,
    trendScore: confluenceScore,
    volumeRatio20: volRatio20,
  });

  const buyPoint = asym.entry;
  const diffPct = asym.currentPriceDiffPct;
  const absDiff = Math.abs(diffPct);
  const buyRange: [number, number] = asym.entryZone;

  let buyZoneStatus: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" = "NEAR_BUY_POINT";
  if (absDiff <= 1.0 || (price >= buyRange[0] && price <= buyRange[1])) {
    buyZoneStatus = "AT_BUY_POINT";
  } else if (absDiff <= 2.5) {
    buyZoneStatus = "NEAR_BUY_POINT";
  } else if (diffPct > 2.5) {
    buyZoneStatus = "WAIT_PULLBACK";
  } else {
    buyZoneStatus = "BELOW_SUPPORT";
  }

  const primaryLayer = asym.confluenceCluster.layers[0] || "Bệ đỡ hội tụ";

  return {
    buyPoint,
    buyPointDiffPct: diffPct,
    absBuyDiff: absDiff,
    buyRange,
    buyZoneStatus,
    stopLoss: asym.stopLoss,
    targetPrice: asym.takeProfit,
    riskReward: asym.riskReward,
    buyStrategy: primaryLayer,
  };
}

function analyzeQuantFeatures(
  parsed: ParsedBars,
  currentPrice: number | null,
  beta: number | null,
  qualityScore: number | null,
  roe: number | null,
  debtEquity: number | null,
  volRatio20: number | null,
  compositeScore: number
) {
  const { closes, highs, lows } = parsed;
  if (closes.length < 15) {
    return {
      quantEdgeScore: compositeScore,
      quantBadge: "NEUTRAL" as const,
      ouZScore: null,
      ouHalfLife: null,
      ouMu: null,
      tripleBarrierRiskReward: null,
      tripleBarrierUpper: null,
      tripleBarrierLower: null,
      cornishFisherVaR95: null,
      returnSkewness: null,
      quantAnomalyTag: null,
      beta: beta != null ? Number(beta.toFixed(2)) : null,
    };
  }

  const p = currentPrice ?? closes[closes.length - 1];

  // 1. Ornstein-Uhlenbeck (OU) Mean Reversion Estimation
  const ouResult = estimateOrnsteinUhlenbeck(closes);
  const ouZ = Number.isFinite(ouResult.currentZScore) ? Number(ouResult.currentZScore.toFixed(2)) : null;
  const ouHalfLife = Number.isFinite(ouResult.halfLife) && ouResult.halfLife < 100 ? ouResult.halfLife : null;
  const ouMu = Number.isFinite(ouResult.mu) ? Math.round(ouResult.mu) : null;

  // 2. Daily Log Returns for Cornish-Fisher VaR & Kurtosis/Skewness
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  const riskMetrics = calculateVaRAndCVaR(returns);

  // 3. Dynamic Triple-Barrier Horizons (López de Prado AFML)
  let trSum = 0;
  const lookback = Math.min(14, closes.length - 1);
  for (let i = closes.length - lookback; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
  }
  const atr = lookback > 0 ? trSum / lookback : (p * 0.025);
  const atrPct = p > 0 ? (atr / p) * 100 : 2.5;

  const tripleBarrier = calculateTripleBarrierLevels(p, atrPct, 3.0, 1.5, 10);

  // 4. Quant Alpha Edge Score Synthesis (0-100)
  // Pillar A: Mean Reversion Statistical Edge (0-25)
  let mrScore = 0;
  if (ouZ != null && ouZ <= -1.8 && ouHalfLife != null && ouHalfLife <= 25) {
    mrScore += 25; // High confidence statistical oversold bounce
  } else if (ouZ != null && ouZ <= -1.3 && ouHalfLife != null && ouHalfLife <= 35) {
    mrScore += 20;
  } else if (ouZ != null && ouZ <= -0.8 && ouResult.isStationary) {
    mrScore += 14;
  } else if (ouResult.isStationary) {
    mrScore += 8;
  }

  // Estimate Beta from returns volatility relative to VN-Index (benchmark daily vol ~ 1.15%, correlation ~ 0.62)
  let finalBeta = beta;
  if (finalBeta == null && returns.length >= 15) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const stockVol = Math.sqrt(variance);
    finalBeta = Number(Math.max(0.35, Math.min(2.4, (0.62 * stockVol) / 0.0115)).toFixed(2));
  }

  // Pillar B: Factor Anomaly: Low-Beta & High-Quality (AQR / Fama-French) (0-25)
  let factorScore = 0;
  const b = finalBeta ?? 1.0;
  const q = qualityScore ?? 65;
  const r = roe ?? 10;
  if (b <= 0.85 && q >= 70 && r >= 12) {
    factorScore += 25; // Strong low-beta anomaly
  } else if (b <= 0.95 && q >= 65) {
    factorScore += 18;
  } else if (b <= 1.1 && q >= 60) {
    factorScore += 12;
  } else {
    factorScore += 6;
  }

  // Pillar C: Asymmetric Payoff & Distribution Skew (0-25)
  let payoffScore = 0;
  if (tripleBarrier.riskRewardRatio >= 2.0) payoffScore += 15;
  else if (tripleBarrier.riskRewardRatio >= 1.5) payoffScore += 10;
  else payoffScore += 5;

  if (riskMetrics.skewness > 0.3) payoffScore += 10; // Favorable positive skew
  else if (riskMetrics.skewness >= -0.2) payoffScore += 6;

  // Pillar D: Quantitative Flow & Volume Momentum (0-25)
  let quantFlowScore = 0;
  if (volRatio20 != null && volRatio20 >= 1.5) quantFlowScore += 15;
  else if (volRatio20 != null && volRatio20 >= 1.1) quantFlowScore += 10;
  else quantFlowScore += 5;

  if (compositeScore >= 70) quantFlowScore += 10;
  else if (compositeScore >= 55) quantFlowScore += 6;

  const quantEdgeScore = Math.min(99, Math.max(5, mrScore + factorScore + payoffScore + quantFlowScore));

  let quantBadge: "SUPER_QUANT" | "QUANT_EDGE" | "WATCH" | "NEUTRAL" = "NEUTRAL";
  if (quantEdgeScore >= 75) quantBadge = "SUPER_QUANT";
  else if (quantEdgeScore >= 60) quantBadge = "QUANT_EDGE";
  else if (quantEdgeScore >= 48) quantBadge = "WATCH";

  // Determine Primary Anomaly Tag
  let quantAnomalyTag = "Định lượng Trung tính";
  if (ouZ != null && ouZ <= -1.4 && ouHalfLife != null && ouHalfLife <= 25) {
    quantAnomalyTag = `Mean Reversion (Z=${ouZ}, t½=${ouHalfLife}d)`;
  } else if (b <= 0.88 && q >= 70) {
    quantAnomalyTag = `Low-Beta Anomaly (β=${b.toFixed(2)}, Q=${q})`;
  } else if (tripleBarrier.riskRewardRatio >= 2.0 && riskMetrics.skewness > 0) {
    quantAnomalyTag = `Bất đối xứng (R/R=${tripleBarrier.riskRewardRatio}, Skew>0)`;
  } else if (volRatio20 != null && volRatio20 >= 1.5) {
    quantAnomalyTag = `Dòng tiền đột biến (${volRatio20}x TB20)`;
  } else if (quantEdgeScore >= 65) {
    quantAnomalyTag = "Hội tụ Đa Nhân tố Quant";
  }

  return {
    quantEdgeScore,
    quantBadge,
    ouZScore: ouZ,
    ouHalfLife,
    ouMu,
    tripleBarrierRiskReward: tripleBarrier.riskRewardRatio,
    tripleBarrierUpper: tripleBarrier.upperBarrierPrice,
    tripleBarrierLower: tripleBarrier.lowerBarrierPrice,
    cornishFisherVaR95: riskMetrics.cornishFisherVaR95Pct,
    returnSkewness: Number(riskMetrics.skewness.toFixed(2)),
    quantAnomalyTag,
    beta: finalBeta != null ? Number(finalBeta.toFixed(2)) : null,
  };
}

function calculateCompositeScore(
  quality: number | null,
  roe: number | null,
  netMargin: number | null,
  pe: number | null,
  pb: number | null,
  de: number | null,
): number {
  let score = 50;
  if (quality != null) {
    score += (quality - 50) * 0.35;
  }
  if (roe != null && Number.isFinite(roe)) {
    if (roe >= 20) score += 15;
    else if (roe >= 15) score += 10;
    else if (roe < 0) score -= 15;
  }
  if (netMargin != null && Number.isFinite(netMargin)) {
    if (netMargin >= 15) score += 8;
    else if (netMargin < 0) score -= 10;
  }
  if (pe != null && Number.isFinite(pe)) {
    if (pe > 0 && pe <= 12) score += 8;
    else if (pe > 35) score -= 8;
  }
  if (pb != null && Number.isFinite(pb)) {
    if (pb > 0 && pb <= 1.5) score += 6;
  }
  if (de != null && Number.isFinite(de)) {
    if (de <= 0.8) score += 5;
    else if (de > 2.5) score -= 8;
  }
  return Math.max(5, Math.min(98, Math.round(score)));
}

function detectPresets(item: {
  roe: number | null;
  revenueYoyPct: number | null;
  niYoyPct: number | null;
  price: number | null;
  changePercent: number | null;
  dividendYield: number | null;
  debtEquity: number | null;
  pe: number | null;
  pb: number | null;
  netMargin: number | null;
  volume: number | null;
  maSignal: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL";
  ma10?: number | null;
  ma20?: number | null;
  chartPattern?: string | null;
  candlePattern?: string | null;
  hasBullishDivergence?: boolean;
  squeezeState?: "squeeze_on" | "squeeze_off" | "fired_bull" | "fired_bear" | null;
  confluenceScore: number;
  quantEdgeScore?: number;
  ouZScore?: number | null;
  ouHalfLife?: number | null;
  beta?: number | null;
  qualityScore?: number | null;
  tripleBarrierRiskReward?: number | null;
  buyZoneStatus?: "AT_BUY_POINT" | "NEAR_BUY_POINT" | "WAIT_PULLBACK" | "BELOW_SUPPORT" | "NO_SETUP";
  absBuyDiff?: number | null;
  isMtfAligned?: boolean;
  mtfConsensus?: string;
  rsRating?: number | null;
  piotroskiFScore?: number | null;
  altmanZone?: string;
  altmanZScore?: number | null;
  orcaMasterScore?: number | null;
  smartMoneyScore?: number | null;
  smartMoneySignal?: SmartMoneySignal | string | null;
  mtfCandleClusterStatus?: MtfCandleClusterStatus;
  mtfCandleScore?: number;
  vsaSignal?: VsaSignalType;
  historicalEdgeScore?: number | null;
  historicalWinRate?: number | null;
  upDownVolRatio?: number | null;
  apexQuantScore?: number | null;
  isSweetLaunchZone?: boolean | null;
  volRatio20?: number | null;
  activeBuyRatioPct?: number | null;
  foreignNetVal?: number | null;
  overheadRoomPct?: number | null;
  isWyckoffSpring?: boolean | null;
  isMaReclaim?: boolean | null;
  superTrendDir?: "up" | "down" | null;
  mtfScore?: number | null;
  riskReward?: number | null;
  candlePatternScore?: number | null;
  isDualDivergence?: boolean | null;
  sectorRrgQuadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | null;
  isSectorLeading?: boolean | null;
  isSectorLagging?: boolean | null;
  isSqueezeFiredBull?: boolean | null;
  isSqueezeOn?: boolean | null;
  squeezeBars?: number | null;
  isMaRibbonSqueeze?: boolean | null;
  maRibbonSpreadPct?: number | null;
  isMaReclaimSpring?: boolean | null;
  maSlope5Pct?: number | null;
  isAbsorptionSpike?: boolean | null;
  isVsaNoSupplyTest?: boolean | null;
  isPrecisionMtfAligned?: boolean | null;
  isTightCloses?: boolean | null;
  isVolumeDryUp?: boolean | null;
  isRsNewHigh20?: boolean | null;
  isWyckoffLps?: boolean | null;
  faCategory?: FaCategory;
  roic?: number | null;
  interestCoverage?: number | null;
  cfoToNetProfit?: number | null;
  fcfTtm?: number | null;
  isNetCash?: boolean | null;
  peg?: number | null;
  consensusUpsidePct?: number | null;
  magicFormulaScore?: number | null;
  setupGrade?: "A+" | "A" | "B" | "C" | null;
  orthogonalPillarsPassed?: number | null;
  isGoldenPocket?: boolean | null;
  fiboSummary?: string | null;
  isFlipZoneSupport?: boolean | null;
  structureSummary?: string | null;
  isSmcOrderBlock?: boolean | null;
}): ScreenerPreset[] {
  const passes: ScreenerPreset[] = ["all"];

  // 00. Điểm Mua Kích Hoạt Tức Thời (Real-Time Actionable Buy Trigger)
  const isTriggerPriceValid =
    item.price != null &&
    item.changePercent != null &&
    item.changePercent >= -0.8 &&
    item.changePercent <= 5.5;

  const isInExecutionZone =
    item.buyZoneStatus === "AT_BUY_POINT" ||
    (item.absBuyDiff != null && item.absBuyDiff <= 1.8) ||
    item.isSweetLaunchZone === true;

  const hasApexConfluence =
    item.setupGrade === "A+" ||
    item.setupGrade === "A" ||
    item.isGoldenPocket === true ||
    item.isFlipZoneSupport === true ||
    item.isSmcOrderBlock === true ||
    (item.apexQuantScore != null && item.apexQuantScore >= 68) ||
    item.confluenceScore >= 52 ||
    (item.orcaMasterScore != null && item.orcaMasterScore >= 72) ||
    item.isMaRibbonSqueeze === true ||
    item.isMaReclaimSpring === true ||
    item.isTightCloses === true ||
    item.isWyckoffLps === true;

  const hasVolumeIgnition =
    (item.volRatio20 != null && item.volRatio20 >= 1.15) ||
    (item.activeBuyRatioPct != null && item.activeBuyRatioPct >= 54) ||
    (item.foreignNetVal != null && item.foreignNetVal > 0.3) ||
    (item.upDownVolRatio != null && item.upDownVolRatio >= 1.12) ||
    item.isSqueezeFiredBull === true ||
    item.isAbsorptionSpike === true ||
    item.isVsaNoSupplyTest === true ||
    item.isVolumeDryUp === true ||
    item.isRsNewHigh20 === true ||
    item.smartMoneySignal === "POCKET_PIVOT" ||
    item.smartMoneySignal === "HEAVY_ACCUMULATION" ||
    item.vsaSignal === "NO_SUPPLY" ||
    item.vsaSignal === "ABSORPTION";

  const hasRunwayRiskReward =
    (item.overheadRoomPct == null || item.overheadRoomPct >= 5.0) &&
    ((item.riskReward != null && item.riskReward >= 2.0) ||
      (item.tripleBarrierRiskReward != null && item.tripleBarrierRiskReward >= 2.0));

  const hasMtfConsensus =
    item.isPrecisionMtfAligned === true ||
    item.isMtfAligned === true ||
    item.mtfConsensus === "ALL_BULL" ||
    item.mtfConsensus === "H1_D1_BULL" ||
    item.superTrendDir === "up" ||
    (item.mtfScore != null && item.mtfScore >= 60);

  // Sector drag check: If sector is LAGGING, require stronger apex score (>= 72)
  const isSectorOk = !item.isSectorLagging || (item.apexQuantScore != null && item.apexQuantScore >= 72);

  const isBuyTriggerNow =
    isTriggerPriceValid &&
    isInExecutionZone &&
    hasApexConfluence &&
    hasVolumeIgnition &&
    hasRunwayRiskReward &&
    hasMtfConsensus &&
    isSectorOk;

  if (isBuyTriggerNow) {
    passes.push("apex_buy_now");
  }

  // 0. Siêu Lọc Apex Quant Confluence (Score >= 74 or Sweet Zone Reversal >= 65)
  if (
    (item.apexQuantScore != null && item.apexQuantScore >= 74) ||
    (item.apexQuantScore != null && item.apexQuantScore >= 65 && item.isSweetLaunchZone)
  ) {
    passes.push("orca_apex_quant");
  }

  // 0a. Lợi Thế Thực Nghiệm Lịch Sử (Historical Price Action Edge & Trained High Conviction)
  if (
    (item.historicalEdgeScore != null && item.historicalEdgeScore >= 70) ||
    (item.historicalWinRate != null && item.historicalWinRate >= 60 && (item.upDownVolRatio ?? 1) >= 1.15)
  ) {
    passes.push("historical_edge");
  }

  // 0a. Orca Master Elite (Top 80+ Institutional Multi-Factor Rating)
  if (item.orcaMasterScore != null && item.orcaMasterScore >= 80) {
    passes.push("orca_master_elite");
  }

  // 0b. Dấu Chân Cá Mập (Smart Money Inflow & Institutional Footprint)
  if (
    (item.smartMoneyScore != null && item.smartMoneyScore >= 70) ||
    item.smartMoneySignal === "HEAVY_ACCUMULATION" ||
    item.smartMoneySignal === "POCKET_PIVOT" ||
    item.smartMoneySignal === "SPRING_ABSORPTION"
  ) {
    passes.push("smart_money_inflow");
  }

  // 0c. Cụm Mô Hình Nến Đa Khung (MTF Candlestick Clusters: TRIPLE_BULL or DUAL_BULL)
  if (
    item.mtfCandleClusterStatus === "TRIPLE_BULL" ||
    item.mtfCandleClusterStatus === "DUAL_BULL" ||
    (item.mtfCandleScore != null && item.mtfCandleScore >= 78)
  ) {
    passes.push("mtf_candle_cluster");
  }

  // 0d. VSA Cạn Cung & Hấp Thụ (No Supply Test & Stopping Volume)
  if (
    item.vsaSignal === "NO_SUPPLY" ||
    item.vsaSignal === "STOPPING_VOLUME" ||
    item.vsaSignal === "ABSORPTION"
  ) {
    passes.push("vsa_no_supply");
  }

  // 0e. Siêu Cổ Phiếu Dẫn Dắt RS Leader (RS Rating >= 80 O'Neil)
  if (item.rsRating != null && item.rsRating >= 80) {
    passes.push("rs_leaders");
  }

  // 0f. Kim Cương Cơ Bản (Piotroski F-Score >= 7 + Altman Z Vùng An Toàn)
  if (
    item.piotroskiFScore != null &&
    item.piotroskiFScore >= 7 &&
    (item.altmanZone === "SAFE" || (item.altmanZScore != null && item.altmanZScore >= 2.0))
  ) {
    passes.push("piotroski_diamonds");
  }

  // 1. Quant Edge Presets (Institutional Statistical Models)
  if (item.quantEdgeScore != null && item.quantEdgeScore >= 62) {
    passes.push("quant_edge");
  }
  if (item.ouZScore != null && item.ouZScore <= -1.4 && item.ouHalfLife != null && item.ouHalfLife <= 35) {
    passes.push("quant_mean_revert");
  }
  if (item.beta != null && item.beta <= 0.88 && item.qualityScore != null && item.qualityScore >= 68) {
    passes.push("quant_low_beta");
  }
  if (item.tripleBarrierRiskReward != null && item.tripleBarrierRiskReward >= 2.0) {
    passes.push("quant_asymmetric");
  }

  // 2. CANSLIM
  const roeGood = item.roe != null && item.roe >= 14;
  const growthGood = (item.niYoyPct != null && item.niYoyPct >= 15) || (item.revenueYoyPct != null && item.revenueYoyPct >= 15);
  const priceHealthy = item.price != null && item.price >= 8;
  if (roeGood && (growthGood || (item.changePercent != null && item.changePercent > 0)) && priceHealthy) {
    passes.push("canslim");
  }

  // 3. High Dividend
  const divGood = item.dividendYield != null && item.dividendYield >= 5;
  const deSafe = item.debtEquity == null || item.debtEquity <= 1.5;
  const peFair = item.pe == null || (item.pe > 0 && item.pe <= 16);
  if (divGood && deSafe && peFair) {
    passes.push("dividend");
  }

  // 4. High Growth
  const niHigh = item.niYoyPct != null && item.niYoyPct >= 20;
  const revHigh = item.revenueYoyPct != null && item.revenueYoyPct >= 15;
  if ((niHigh || revHigh) && (item.roe == null || item.roe >= 12)) {
    passes.push("growth");
  }

  // 5. Value
  const peCheap = item.pe != null && item.pe > 0 && item.pe <= 11;
  const pbCheap = item.pb != null && item.pb > 0 && item.pb <= 1.3;
  const roePositive = item.roe == null || item.roe >= 8;
  if (peCheap && pbCheap && roePositive) {
    passes.push("value");
  }

  // 6. Momentum Breakout
  const chgStrong = item.changePercent != null && item.changePercent >= 2.0;
  const volActive = item.volume != null && item.volume >= 100_000;
  if (chgStrong && volActive) {
    passes.push("breakout");
  }

  // 7. MA Crossover Strategy (Golden Cross / Bullish Alignment)
  const isMaBullish = item.maSignal === "GOLDEN_CROSS" || item.maSignal === "BULLISH_ALIGN";
  const volValid = item.volume != null && item.volume >= 80_000;
  const priceValid = item.price != null && item.price >= 8;
  if (isMaBullish && volValid && priceValid) {
    passes.push("ma_cross");
  }

  // 8. Confluence (Siêu hội tụ >= 50 hoặc >= 40 kèm tín hiệu xác nhận)
  if (
    item.confluenceScore >= 50 ||
    (item.confluenceScore >= 40 && (
      item.squeezeState === "fired_bull" ||
      item.squeezeState === "squeeze_on" ||
      item.maSignal === "GOLDEN_CROSS" ||
      item.maSignal === "BULLISH_ALIGN" ||
      Boolean(item.chartPattern) ||
      Boolean(item.candlePattern)
    ))
  ) {
    passes.push("confluence");
  }

  // 8b. Bottom Confluence (Hợp lưu Đáy: Tam Hợp Lưu MA + Cụm nến đảo chiều + Phân kỳ dương)
  const hasCandleReversal = Boolean(
    (item.candlePatternScore != null && item.candlePatternScore >= 60) ||
    item.candlePattern ||
    (item.chartPattern && !item.chartPattern.includes("Nền"))
  );
  const hasMaSupport = Boolean(
    (item.ma10 != null && item.price != null && item.price >= item.ma10 * 0.98) ||
    (item.ma20 != null && item.price != null && item.price >= item.ma20 * 0.96) ||
    item.isMaReclaim === true ||
    item.maSignal === "GOLDEN_CROSS" ||
    item.maSignal === "BULLISH_ALIGN"
  );

  const isDiamondConfluence = Boolean(
    item.hasBullishDivergence && hasCandleReversal && hasMaSupport
  );

  if (
    item.hasBullishDivergence &&
    (isDiamondConfluence ||
      (hasCandleReversal && hasMaSupport) ||
      (hasCandleReversal && (item.confluenceScore >= 50 || item.isSweetLaunchZone)) ||
      (hasMaSupport && item.confluenceScore >= 52))
  ) {
    passes.push("bottom_confluence");
  }

  // 8b. SMC & Golden Pocket (A+ Orthogonal Confluence)
  if (item.isGoldenPocket || item.setupGrade === "A+" || (item.confluenceScore >= 74 && item.isSmcOrderBlock)) {
    passes.push("smc_golden_pocket");
  }

  // 8c. Flip Zone Role Reversal Retest
  if (item.isFlipZoneSupport) {
    passes.push("flip_zone_retest");
  }

  // 9. VCP & Classic Patterns
  if (
    item.chartPattern &&
    (item.chartPattern.includes("VCP") ||
      item.chartPattern.includes("Cốc") ||
      item.chartPattern.includes("đáy") ||
      item.chartPattern.includes("Cờ") ||
      item.chartPattern.includes("Pocket"))
  ) {
    passes.push("vcp");
  }

  // 10. TTM Squeeze & Volatility Breakout (Biên độ 2)
  if (
    item.squeezeState === "squeeze_on" ||
    item.squeezeState === "fired_bull" ||
    item.isSqueezeFiredBull === true ||
    (item.isSqueezeOn === true && (item.squeezeBars == null || item.squeezeBars >= 4))
  ) {
    passes.push("ttm_squeeze");
  }

  // 10b. Sector Alpha Resonance: Ngành Dẫn Dắt (Biên độ 1)
  if (
    item.isSectorLeading === true ||
    item.sectorRrgQuadrant === "LEADING" ||
    (item.sectorRrgQuadrant === "IMPROVING" && ((item.orcaMasterScore != null && item.orcaMasterScore >= 60) || item.confluenceScore >= 60))
  ) {
    passes.push("sector_leading");
  }

  // 11. Sát Điểm Mua Nhất (Near Buy Point / Buy Zone)
  const isNearBuy =
    item.buyZoneStatus === "AT_BUY_POINT" ||
    item.buyZoneStatus === "NEAR_BUY_POINT" ||
    (item.absBuyDiff != null && item.absBuyDiff <= 2.2);

  const hasSetupConfluence =
    item.confluenceScore >= 42 ||
    (item.quantEdgeScore != null && item.quantEdgeScore >= 48) ||
    item.maSignal === "GOLDEN_CROSS" ||
    item.maSignal === "BULLISH_ALIGN" ||
    Boolean(item.chartPattern) ||
    Boolean(item.candlePattern) ||
    item.hasBullishDivergence === true ||
    item.squeezeState === "squeeze_on" ||
    item.squeezeState === "fired_bull";

  const isLiquid = (item.price == null || item.price >= 5) && (item.volume == null || item.volume >= 40_000);

  if (isNearBuy && hasSetupConfluence && isLiquid) {
    passes.push("near_buy_point");
  }

  // 12. Đồng Thuận Đa Khung Thời Gian (H1 + D1 + W1 Aligned Bull)
  if (item.isMtfAligned || item.mtfConsensus === "ALL_BULL") {
    passes.push("mtf_confluence");
  }

  // 13. Pháo Đài Tài Chính (FA Fortress)
  if (
    item.faCategory === "FORTRESS" ||
    (item.isNetCash && (item.interestCoverage == null || item.interestCoverage >= 4.0) && (item.debtEquity == null || item.debtEquity <= 1.0))
  ) {
    passes.push("fa_fortress");
  }

  // 14. Dòng Tiền Thực Chất (Earnings Quality: CFO/LNST >= 1.0 & FCF dương)
  if (
    item.faCategory === "CASH_MACHINE" ||
    (item.cfoToNetProfit != null && item.cfoToNetProfit >= 0.95 && (item.fcfTtm == null || item.fcfTtm > 0))
  ) {
    passes.push("earnings_quality");
  }

  // 15. Magic Formula (Joel Greenblatt: ROIC >= 15% & P/E rẻ)
  if (
    item.faCategory === "MOAT_QUALITY" ||
    (item.magicFormulaScore != null && item.magicFormulaScore >= 72) ||
    ((item.roic != null && item.roic >= 15) && (item.pe != null && item.pe <= 14))
  ) {
    passes.push("magic_formula");
  }

  // 16. Định Giá Hời CTCK (Consensus Upside >= 20%)
  if (
    item.faCategory === "CONSENSUS_UPSIDE" ||
    (item.consensusUpsidePct != null && item.consensusUpsidePct >= 20.0)
  ) {
    passes.push("consensus_upside");
  }

  // 17. Nén Giá Phẳng & Cạn Von (Minervini Tight Closes & VDU)
  if (
    (item.isTightCloses && item.isVolumeDryUp) ||
    (item.isTightCloses && (item.volRatio20 == null || item.volRatio20 <= 0.85)) ||
    (item.isVolumeDryUp && item.confluenceScore >= 50) ||
    item.isWyckoffLps === true
  ) {
    passes.push("tight_closes_vdu");
  }

  return passes;
}

/**
 * Fetch and aggregate master stock screener snapshot.
 * Runs multi-source parallel race for quotes and 3-tier cascade for valuation with L1 in-memory caching.
 */
type ValuationCacheEntry = {
  v: VndValuationRatios | null;
  vc: VietcapProfile | null;
  exp: number;
};
const valuationL1Cache = new Map<string, ValuationCacheEntry>();

async function fetchValuationBatch(symbols: string[]): Promise<{
  valMap: Map<string, VndValuationRatios>;
  vietcapMap: Map<string, VietcapProfile>;
  failoverCount: number;
}> {
  const valMap = new Map<string, VndValuationRatios>();
  const vietcapMap = new Map<string, VietcapProfile>();
  let failoverCount = 0;
  const now = Date.now();
  const needFetch: string[] = [];

  // Fast-path: Check L1 memory cache first (15-min TTL)
  for (const sym of symbols) {
    const entry = valuationL1Cache.get(sym);
    if (entry && now < entry.exp) {
      if (entry.v) valMap.set(sym, entry.v);
      if (entry.vc) vietcapMap.set(sym, entry.vc);
    } else {
      needFetch.push(sym);
    }
  }

  if (needFetch.length > 0) {
    const targetFetch = needFetch.slice(0, 36);
    await mapPool(targetFetch, 12, async (sym) => {
      let v: VndValuationRatios | null = null;
      let vc: VietcapProfile | null = null;
      try {
        const fetchPromise = (async () => {
          // Tier 1: VNDirect ratios
          v = await getVndValuationRatios(sym);
          if (v && (v.pe != null || v.pb != null)) {
            valMap.set(sym, v);
          } else {
            // Tier 2: Vietcap IQ failover
            vc = await getVietcapCompany(sym).catch(() => null);
            if (vc) {
              vietcapMap.set(sym, vc);
              failoverCount++;
            }
          }
        })();

        await Promise.race([
          fetchPromise,
          new Promise((resolve) => setTimeout(resolve, 1_200)),
        ]);
      } catch {
        // Tier 2 catch fallback
        vc = await getVietcapCompany(sym).catch(() => null);
        if (vc) {
          vietcapMap.set(sym, vc);
          failoverCount++;
        }
      }

      valuationL1Cache.set(sym, {
        v,
        vc,
        exp: Date.now() + 15 * 60_000,
      });
    });
  }

  return { valMap, vietcapMap, failoverCount };
}

export function getLastMasterSnapshot(): MasterSnapshotPayload | null {
  return memoryMasterSnapshot?.payload ?? null;
}

type MasterSnapshotPayload = {
  items: ScreenerStockItem[];
  sourcesUsed: string[];
  redundancyInfo: {
    quoteProviders: string[];
    valuationProviders: string[];
    failoverCount: number;
    healthStatus: "OPTIMAL" | "HIGH_AVAILABILITY" | "DEGRADED";
    latencies?: Record<string, number>;
    conflictCount?: number;
  };
  meta: Meta;
  presetsCount: Record<ScreenerPreset, number>;
  sectorsAvailable: string[];
  version: number;
};

// L1 Fast In-Memory RAM Cache with background SWR
let memoryMasterSnapshot: {
  payload: MasterSnapshotPayload;
  freshUntil: number;
  staleUntil: number;
} | null = null;
let isRefreshingMaster = false;

// High-speed L1 Query Cache for sub-millisecond repeated queries
interface CachedQueryResult {
  res: ScreenerResponseData;
  exp: number;
}
const queryL1Cache = new Map<string, CachedQueryResult>();

/**
 * Fetch and aggregate master stock screener snapshot.
 * Runs multi-source parallel race for quotes, fundamentals, valuation, and OHLCV concurrently.
 */
export async function getMasterScreenerSnapshot(): Promise<MasterSnapshotPayload> {
  const now = Date.now();

  // Fast-path 1: Serve instantly from L1 memory if fresh (< 60s)
  if (memoryMasterSnapshot && now < memoryMasterSnapshot.freshUntil) {
    return memoryMasterSnapshot.payload;
  }

  // Fast-path 2: Serve stale memory (< 15 mins) and trigger background refresh
  if (memoryMasterSnapshot && now < memoryMasterSnapshot.staleUntil) {
    if (!isRefreshingMaster) {
      isRefreshingMaster = true;
      void executeProducer()
        .then((fresh) => {
          memoryMasterSnapshot = {
            payload: fresh,
            freshUntil: Date.now() + 60_000,
            staleUntil: Date.now() + 15 * 60_000,
          };
        })
        .finally(() => {
          isRefreshingMaster = false;
        });
    }
    return memoryMasterSnapshot.payload;
  }

  return executeProducer();
}

async function executeProducer(): Promise<MasterSnapshotPayload> {
  const res = await cached("screener:master:snapshot:v2", {
    ttlMs: 2 * 60_000, // 2 minutes fresh cache
    staleMs: 30 * 60_000, // 30 minutes stale serve while refreshing
    producer: async () => {
      const symbols = getScreenerUniverse();

      // PARALLEL PENTACAST PRODUCER: Quotes + Foreign Flow + Valuation + Quick Fundamentals + OHLCV
      const quotesTask = getMultiQuotes(symbols).catch(() => ({
        quotes: [],
        sources: ["vps-fallback"],
        sourceTs: Date.now(),
        latencies: {},
        conflicts: 0,
      }));

      const foreignTask = Promise.race([
        getVpsBatchForeignFlow(symbols),
        new Promise<Map<string, any>>((resolve) => setTimeout(() => resolve(new Map()), 1_800)),
      ]).catch(() => new Map());

      const valTask = Promise.race([
        fetchValuationBatch(symbols),
        new Promise<any>((resolve) =>
          setTimeout(
            () =>
              resolve({
                valMap: new Map<string, VndValuationRatios>(),
                vietcapMap: new Map<string, VietcapProfile>(),
                failoverCount: 0,
              }),
            2_500,
          ),
        ),
      ]).catch(() => ({
        valMap: new Map<string, VndValuationRatios>(),
        vietcapMap: new Map<string, VietcapProfile>(),
        failoverCount: 0,
      }));

      const fundTask = Promise.race([
        getFundamentalSnapshots(symbols, { concurrency: 6 }),
        new Promise<{ snapshots: FundamentalSnapshot[] }>((resolve) =>
          setTimeout(() => resolve({ snapshots: [] }), 1_500),
        ),
      ]).catch(() => ({ snapshots: [] }));

      const ohlcvTask = batchVnOhlcv([...symbols, "VNINDEX"], {
        bars: 120,
        concurrency: 8,
        perSymbolMs: 300,
        deadlineMs: 4_500,
        priority: [...VN100, "VNINDEX"],
        resilient: true,
      }).catch(() => new Map());

      const [multiQuotesRes, foreignMap, valResult, fundResult, ohlcvMap] = await Promise.all([
        quotesTask,
        foreignTask,
        valTask,
        fundTask,
        ohlcvTask,
      ]);

      const quotesMap = new Map<string, { price: number; change: number; changePercent: number; volume: number; name?: string }>();
      for (const q of multiQuotesRes.quotes ?? []) {
        if (!q.symbol) continue;
        quotesMap.set(q.symbol.toUpperCase(), {
          price: typeof q.price === "number" ? q.price : 0,
          change: typeof q.change === "number" ? q.change : 0,
          changePercent: typeof q.changePercent === "number" ? q.changePercent : 0,
          volume: typeof q.volume === "number" ? q.volume : (typeof q.quoteVolume === "number" ? q.quoteVolume : 0),
          name: q.name ?? undefined,
        });
      }

      const fundMap = new Map<string, FundamentalSnapshot>();
      for (const f of fundResult.snapshots ?? []) {
        fundMap.set(f.symbol.toUpperCase(), f);
      }

      const { valMap, vietcapMap } = valResult;
      let failoverCount = valResult.failoverCount;

      // Index benchmark performance for RS Rating
      const indexBars = ohlcvMap.get("VNINDEX")?.bars ?? [];
      let indexPerf20: number | null = null;
      if (indexBars.length >= 20) {
        const i0 = indexBars[indexBars.length - 20].close;
        const i1 = indexBars[indexBars.length - 1].close;
        if (i0 > 0) indexPerf20 = ((i1 - i0) / i0) * 100;
      }

      // Pre-calculate William O'Neil Universe RS Ratings (1 - 99)
      const stockHistories: Record<string, any[]> = {};
      for (const [symKey, data] of ohlcvMap.entries()) {
        if (data?.bars?.length) {
          stockHistories[symKey.toUpperCase()] = data.bars;
        }
      }
      const rsMap = calculateUniverseRsRatings(stockHistories);

      // Pre-calculate Sector RRG coordinates for 18 ICB sectors (Biên độ 1: Sector Alpha Resonance)
      const sectorRrgMap = new Map<string, SectorRrgCoord>();
      if (indexBars.length >= 20) {
        const benchCloses = indexBars.map((b: any) => b.close);
        const benchDates = indexBars.map((b: any) => new Date(b.time).toISOString().split("T")[0]);

        for (const secDef of VN_ICB_SECTORS) {
          let targetPrices: number[] = [];
          for (const sym of secDef.symbols) {
            const sBars = ohlcvMap.get(sym)?.bars;
            if (sBars && sBars.length >= 15) {
              targetPrices = sBars.map((b: any) => b.close);
              break;
            }
          }
          if (targetPrices.length >= 15) {
            const trail = computeRrgTrail(targetPrices, benchCloses, benchDates, 5);
            if (trail.length) {
              const latest = trail[trail.length - 1];
              const firstInTrail = trail[0];
              const change5d = Math.round(((latest.rsRatio - firstInTrail.rsRatio) / firstInTrail.rsRatio) * 10000) / 100;
              const quadrant = determineQuadrant(latest.rsRatio, latest.rsMomentum);
              sectorRrgMap.set(secDef.code, {
                sectorCode: secDef.code,
                sectorName: secDef.name,
                quadrant,
                rsRatio: latest.rsRatio,
                rsMomentum: latest.rsMomentum,
                change5dPct: change5d,
              });
            }
          }
        }
      }

      // 4. Assemble merged items with 3-tier failover & MA analysis
      const items: ScreenerStockItem[] = [];
      const orcaInputs: OrcaMasterInput[] = [];
      const intermediateEntries: {
        sym: string;
        sec: ReturnType<typeof getSecurity>;
        q: any;
        vc: any;
        price: number | null;
        change: number | null;
        changePercent: number | null;
        volume: number | null;
        marketCap: number | null;
        pe: number | null;
        pb: number | null;
        ps: number | null;
        evEbitda: number | null;
        dividendYield: number | null;
        roe: number | null;
        roa: number | null;
        grossMargin: number | null;
        netMargin: number | null;
        debtEquity: number | null;
        currentRatio: number | null;
        revenueYoyPct: number | null;
        niYoyPct: number | null;
        fcfTtm: number | null;
        qualityScore: number;
        healthScore: number;
        piotroskiFScore: number | null;
        piotroskiRating?: "EXCELLENT" | "GOOD" | "AVERAGE" | "WEAK";
        altmanZScore: number | null;
        altmanZone?: "SAFE" | "GREY" | "DISTRESS";
        techFeatures: ReturnType<typeof analyzeTechFeatures>;
        quantFeatures: ReturnType<typeof analyzeQuantFeatures>;
        vcpDepths: number[] | null;
        vcpLastDepth: number | null;
        vcpPivot: number | null;
        buyPointPlan: ReturnType<typeof calculateBuyPointPlan>;
        foreignNetVal: number | null;
        foreignAccumulating: boolean;
        rsRating: number | null;
        rsCategory?: RsCategory;
        rsTrend?: "IMPROVING" | "WEAKENING" | "NEUTRAL";
        rsRating20: number | null;
        isMarketLeader: boolean;
        smartMoney: SmartMoneyResult;
        compositeScore: number;
        sparkline?: number[];
        sparkBars?: { o: number; h: number; l: number; c: number; v: number }[];
        mtfCandle: MtfCandleClusterResult;
        trainedHistorical: HistoricalEdgeMetrics;
        apexQuant: ApexQuantResult;
        sectorRrgQuadrant?: "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING" | null;
        sectorRsRatio?: number | null;
        sectorRsMomentum?: number | null;
        isSectorLeading: boolean;
        isSectorLagging: boolean;
        sectorResonanceBonus: number;
        faMatrix: FundamentalMatrixResult;
      }[] = [];

      for (const sym of symbols) {
        const sec = getSecurity(sym);
        const q = quotesMap.get(sym);
        const f = fundMap.get(sym);
        const v = valMap.get(sym);
        const vc = vietcapMap.get(sym);

        const price = q?.price && q.price > 0 ? q.price : (vc?.price && vc.price > 0 ? vc.price : null);
        const change = q?.change ?? null;
        const changePercent = q?.changePercent ?? null;
        const volume = q?.volume ?? null;

        // Resolve P/E: Tier 1 (VNDirect) -> Tier 2 (Computed from EPS TTM)
        let pe = v?.pe ?? null;
        if (pe == null && f?.epsTtm && price && f.epsTtm > 0) {
          pe = Number((price / (f.epsTtm / 1000)).toFixed(2));
          failoverCount++;
        }

        // Resolve P/B: Tier 1 (VNDirect) -> Tier 2 (Computed from Equity / Shares)
        let pb = v?.pb ?? null;
        if (pb == null && f?.equity && f?.shares && price && f.shares > 0) {
          const bvps = (f.equity / f.shares) / 1000;
          if (bvps > 0) {
            pb = Number((price / bvps).toFixed(2));
            failoverCount++;
          }
        }

        const ps = v?.ps ?? null;
        const evEbitda = v?.evEbitda ?? null;
        const dividendYield = v?.dividendYield != null ? Number((v.dividendYield * 100).toFixed(2)) : null;

        // Resolve Market Cap: Tier 1 (VNDirect) -> Tier 2 (Vietcap) -> Tier 3 (Price * Shares)
        let marketCapRaw = v?.marketCap ?? (vc?.marketCap != null ? vc.marketCap : null);
        if (marketCapRaw == null && (f?.shares ?? vc?.sharesOutstanding) && price) {
          const shares = f?.shares ?? vc?.sharesOutstanding!;
          marketCapRaw = price * 1000 * shares;
          failoverCount++;
        }
        const marketCap = marketCapRaw != null ? Math.round(marketCapRaw / 1_000_000_000) : null; // in Billion VND

        const roe = f?.roe != null ? Number(f.roe.toFixed(2)) : (v?.roe != null ? Number((v.roe * 100).toFixed(2)) : null);
        const roa = f?.roa != null ? Number(f.roa.toFixed(2)) : (v?.roa != null ? Number((v.roa * 100).toFixed(2)) : null);
        const grossMargin = f?.grossMargin != null ? Number(f.grossMargin.toFixed(2)) : null;
        const netMargin = f?.netMargin != null ? Number(f.netMargin.toFixed(2)) : null;
        const debtEquity = f?.debtEquity != null ? Number(f.debtEquity.toFixed(2)) : null;
        const currentRatio = f?.currentRatio != null ? Number(f.currentRatio.toFixed(2)) : null;
        const revenueYoyPct = f?.revenueYoyPct != null ? Number(f.revenueYoyPct.toFixed(2)) : null;
        const niYoyPct = f?.niYoyPct != null ? Number(f.niYoyPct.toFixed(2)) : null;
        const fcfTtm = f?.fcfTtm ? Math.round(f.fcfTtm / 1_000_000_000) : null; // in Billion VND

        const qualityScore = f?.qualityScore ?? 70;
        const healthScore = f?.healthScore ?? 70;

        const compositeScore = calculateCompositeScore(qualityScore, roe, netMargin, pe, pb, debtEquity);

        const foreignRow = foreignMap.get(sym);
        const foreignNetVal = foreignRow?.netValue ? Math.round((foreignRow.netValue / 1_000_000_000) * 100) / 100 : null; // in Billion VND
        const foreignAccumulating = foreignNetVal != null && foreignNetVal > 0.5;

        const rawBars = ohlcvMap.get(sym)?.bars;
        const parsed = parseBarArrays(rawBars);

        let rsRating20: number | null = null;
        if (parsed.closes.length >= 20 && indexPerf20 != null) {
          const s0 = parsed.closes[parsed.closes.length - 20];
          const s1 = parsed.closes[parsed.closes.length - 1];
          if (s0 > 0) {
            const stockPerf20 = ((s1 - s0) / s0) * 100;
            rsRating20 = Number((stockPerf20 - indexPerf20).toFixed(1));
          }
        }

        const techFeatures = analyzeTechFeatures(
          parsed,
          price,
          compositeScore,
          foreignAccumulating,
          rsRating20,
          q,
          foreignRow?.buyRatioPct,
        );

        const beta: number | null = null;
        const quantFeatures = analyzeQuantFeatures(
          parsed,
          price,
          beta,
          qualityScore,
          roe,
          debtEquity,
          techFeatures.volRatio20,
          compositeScore
        );

        // William O'Neil RS Rating 1 - 99
        const rsInfo = rsMap.get(sym);
        const rsRating = rsInfo?.rsRating ?? null;
        const rsCategory = rsInfo?.category;
        const rsTrend = rsInfo?.rsTrend;
        const isMarketLeader = rsRating != null ? rsRating >= 80 : (rsRating20 != null && rsRating20 > 5);

        // Fundamental Health: Piotroski F-Score (0 - 9) & Altman Z''-Score
        const fundHealth = f ? computePiotroskiAltman(f) : null;
        const piotroskiFScore = fundHealth?.piotroski.fScore ?? null;
        const piotroskiRating = fundHealth?.piotroski.rating;
        const altmanZScore = fundHealth?.altman.zScore ?? null;
        const altmanZone = fundHealth?.altman.zone;

        // Fundamental Quant Matrix (ROIC, ICR, CFO/LNST, PEG, Consensus Target Upside, Magic Formula)
        const faMatrix = computeFundamentalMatrix({
          snap: f,
          price,
          pe,
          pb,
          dividendYield,
          niYoyPct,
          marketCapBillion: marketCap,
          vietcapProfile: vc,
        });

        // Enhanced VCP details
        const topCP = techFeatures.topChartPattern;
        const vcpDepths = topCP?.kind === "vcp" ? topCP.vcpDepths ?? null : null;
        const vcpLastDepth = topCP?.kind === "vcp" ? topCP.lastContractionDepth ?? null : null;
        const vcpPivot = topCP?.kind === "vcp" ? topCP.pivotPrice ?? null : null;

        const buyPointPlan = calculateBuyPointPlan(
          parsed,
          price,
          techFeatures.ma20,
          techFeatures.ma50,
          techFeatures.topChartPattern,
          techFeatures.confluenceScore,
          techFeatures.volRatio20
        );

        // Evaluate Smart Money Footprint
        const smartMoney = evaluateSmartMoneyFootprint({
          symbol: sym,
          bars: parsed.ohlcvBars,
          currentPrice: price,
          foreignNetValBillion: foreignNetVal,
          activeBuyRatioPct: foreignRow?.buyRatioPct ?? null,
          foreignBuyValBillion: foreignRow?.buyValue ? foreignRow.buyValue / 1_000_000_000 : null,
          foreignSellValBillion: foreignRow?.sellValue ? foreignRow.sellValue / 1_000_000_000 : null,
        });

        // Train and calibrate historical price action (120-bar lookback empirical edge)
        const trainedHistorical = trainHistoricalPriceAction(parsed.ohlcvBars);

        // Collect inputs for universe-wide Orca Master Composite percentile ranking
        orcaInputs.push({
          symbol: sym,
          rsRating,
          smartMoneyScore: smartMoney.score,
          piotroskiFScore,
          altmanZScore,
          altmanZone,
          roe,
          netMargin,
          confluenceScore: techFeatures.confluenceScore,
          isMtfAligned: techFeatures.isMtfAligned,
          absBuyDiff: buyPointPlan.absBuyDiff,
          isNearBuy: buyPointPlan.buyZoneStatus === "AT_BUY_POINT" || buyPointPlan.buyZoneStatus === "NEAR_BUY_POINT",
          pe,
          pb,
          dividendYield,
          maSignal: techFeatures.maSignal,
          historicalEdgeScore: trainedHistorical.historicalEdgeScore,
          upDownVolRatio: trainedHistorical.upDownVolRatio,
        });

        const mtfCandle = evaluateMtfCandleCluster({
          dailyBars: parsed.ohlcvBars,
          quote: q,
          ma20: techFeatures.ma20,
          ma50: techFeatures.ma50,
        });

        // Sector RRG Alpha Resonance (Biên độ 1)
        const secCode = matchSymbolToIcbSector(sym, sec?.sector ?? sectorOf(sym));
        const rrgCoord = sectorRrgMap.get(secCode);
        const sectorRrgQuadrant = rrgCoord?.quadrant ?? null;
        const isSectorLeading = sectorRrgQuadrant === "LEADING";
        const isSectorLagging = sectorRrgQuadrant === "LAGGING";
        const sectorResonance = evaluateSectorAlphaResonance(sectorRrgQuadrant);

        // 4. State-of-the-art Apex Quant Confluence & Early Bottom Reversal Engine
        const apexQuant = evaluateApexQuant({
          symbol: sym,
          bars: parsed.ohlcvBars,
          currentPrice: price ?? (parsed.closes[parsed.closes.length - 1] || 0),
          quote: q,
          activeBuyRatioPct: foreignRow?.buyRatioPct ?? null,
          foreignNetValBillion: foreignNetVal,
          rsRating,
          piotroskiFScore,
          altmanZone,
          isMtfAligned: techFeatures.isMtfAligned,
          sectorRrgQuadrant,
          squeezeState: techFeatures.squeezeState,
          squeezeBars: techFeatures.squeezeBars,
          isMaRibbonSqueeze: techFeatures.isMaRibbonSqueeze,
          isAbsorptionSpike: techFeatures.isAbsorptionSpike,
          isVsaNoSupplyTest: techFeatures.isVsaNoSupplyTest,
          isPrecisionMtfAligned: techFeatures.isPrecisionMtfAligned,
        });

        intermediateEntries.push({
          sym,
          sec,
          q,
          vc,
          price,
          change,
          changePercent,
          volume,
          marketCap,
          pe,
          pb,
          ps,
          evEbitda,
          dividendYield,
          roe,
          roa,
          grossMargin,
          netMargin,
          debtEquity,
          currentRatio,
          revenueYoyPct,
          niYoyPct,
          fcfTtm,
          qualityScore,
          healthScore,
          piotroskiFScore,
          piotroskiRating,
          altmanZScore,
          altmanZone,
          techFeatures,
          quantFeatures,
          vcpDepths,
          vcpLastDepth,
          vcpPivot,
          buyPointPlan,
          foreignNetVal,
          foreignAccumulating,
          rsRating,
          rsCategory,
          rsTrend,
          rsRating20,
          isMarketLeader,
          smartMoney,
          compositeScore,
          sparkline: parsed.closes.slice(-20),
          sparkBars: parsed.ohlcvBars.slice(-20).map(b => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })),
          mtfCandle,
          trainedHistorical,
          apexQuant,
          sectorRrgQuadrant,
          sectorRsRatio: rrgCoord?.rsRatio ?? null,
          sectorRsMomentum: rrgCoord?.rsMomentum ?? null,
          isSectorLeading,
          isSectorLagging,
          sectorResonanceBonus: sectorResonance.scoreBonus,
          faMatrix,
        });
      }

      // 4b. Multi-factor Universe Orca Master Composite percentile ranking (1 - 99)
      const orcaMasterMap = calculateUniverseOrcaMaster(orcaInputs);

      for (let i = 0; i < intermediateEntries.length; i++) {
        const entry = intermediateEntries[i];
        const orcaRes = orcaMasterMap.get(entry.sym);
        const orcaMasterScore = orcaRes?.compositeScore ?? null;
        const orcaMasterCategory = orcaRes?.category;
        const orcaMasterStrengthVi = orcaRes?.primaryStrengthVi ?? null;

        const presetsPassed = detectPresets({
          roe: entry.roe,
          revenueYoyPct: entry.revenueYoyPct,
          niYoyPct: entry.niYoyPct,
          price: entry.price,
          changePercent: entry.changePercent,
          dividendYield: entry.dividendYield,
          debtEquity: entry.debtEquity,
          pe: entry.pe,
          pb: entry.pb,
          netMargin: entry.netMargin,
          volume: entry.volume,
          maSignal: entry.techFeatures.maSignal,
          ma10: entry.techFeatures.ma10,
          ma20: entry.techFeatures.ma20,
          chartPattern: entry.techFeatures.chartPattern,
          candlePattern: entry.techFeatures.candlePattern,
          hasBullishDivergence: entry.techFeatures.hasBullishDivergence,
          squeezeState: entry.techFeatures.squeezeState,
          confluenceScore: entry.techFeatures.confluenceScore,
          quantEdgeScore: entry.quantFeatures.quantEdgeScore,
          ouZScore: entry.quantFeatures.ouZScore,
          ouHalfLife: entry.quantFeatures.ouHalfLife,
          beta: entry.quantFeatures.beta,
          qualityScore: entry.qualityScore,
          tripleBarrierRiskReward: entry.quantFeatures.tripleBarrierRiskReward,
          buyZoneStatus: entry.buyPointPlan.buyZoneStatus,
          absBuyDiff: entry.buyPointPlan.absBuyDiff,
          rsRating: entry.rsRating,
          piotroskiFScore: entry.piotroskiFScore,
          altmanZone: entry.altmanZone,
          altmanZScore: entry.altmanZScore,
          orcaMasterScore,
          smartMoneyScore: entry.smartMoney.score,
          smartMoneySignal: entry.smartMoney.signal,
          mtfCandleClusterStatus: entry.mtfCandle.clusterStatus,
          mtfCandleScore: entry.mtfCandle.clusterScore,
          vsaSignal: entry.mtfCandle.vsaSignal,
          historicalEdgeScore: entry.trainedHistorical.historicalEdgeScore,
          historicalWinRate: entry.trainedHistorical.historicalWinRatePct,
          upDownVolRatio: entry.trainedHistorical.upDownVolRatio,
          apexQuantScore: entry.apexQuant.apexScore,
          isSweetLaunchZone: entry.apexQuant.reversalMetrics.isSweetLaunchZone,
          volRatio20: entry.techFeatures.volRatio20,
          activeBuyRatioPct: entry.smartMoney.activeBuyRatioPct,
          foreignNetVal: entry.foreignNetVal,
          overheadRoomPct: entry.apexQuant.reversalMetrics.overheadRoomPct,
          isWyckoffSpring: entry.apexQuant.reversalMetrics.isWyckoffSpring,
          isMaReclaim: entry.apexQuant.reversalMetrics.isMaReclaim,
          superTrendDir: entry.techFeatures.superTrendDir,
          mtfScore: entry.techFeatures.mtfScore,
          riskReward: entry.buyPointPlan.riskReward,
          candlePatternScore: entry.techFeatures.candlePatternScore,
          isDualDivergence: entry.techFeatures.isDualDivergence,
          sectorRrgQuadrant: entry.sectorRrgQuadrant,
          isSectorLeading: entry.isSectorLeading,
          isSectorLagging: entry.isSectorLagging,
          isSqueezeFiredBull: entry.techFeatures.isSqueezeFiredBull,
          isSqueezeOn: entry.techFeatures.isSqueezeOn,
          squeezeBars: entry.techFeatures.squeezeBars,
          isMaRibbonSqueeze: entry.techFeatures.isMaRibbonSqueeze,
          maRibbonSpreadPct: entry.techFeatures.maRibbonSpreadPct,
          isMaReclaimSpring: entry.techFeatures.isMaReclaimSpring,
          maSlope5Pct: entry.techFeatures.maSlope5Pct,
          isAbsorptionSpike: entry.techFeatures.isAbsorptionSpike,
          isVsaNoSupplyTest: entry.techFeatures.isVsaNoSupplyTest,
          isPrecisionMtfAligned: entry.techFeatures.isPrecisionMtfAligned,
          isTightCloses: entry.techFeatures.isTightCloses,
          isVolumeDryUp: entry.techFeatures.isVolumeDryUp,
          isRsNewHigh20: entry.techFeatures.isRsNewHigh20,
          isWyckoffLps: entry.techFeatures.isWyckoffLps,
          faCategory: entry.faMatrix.faCategory,
          roic: entry.faMatrix.roic,
          interestCoverage: entry.faMatrix.interestCoverage,
          cfoToNetProfit: entry.faMatrix.cfoToNetProfit,
          fcfTtm: entry.fcfTtm,
          isNetCash: entry.faMatrix.isNetCash,
          peg: entry.faMatrix.peg,
          consensusUpsidePct: entry.faMatrix.consensusUpsidePct,
          magicFormulaScore: entry.faMatrix.magicFormulaScore,
        });

        const hasCandleReversalSnap = Boolean(
          (entry.techFeatures.candlePatternScore != null && entry.techFeatures.candlePatternScore >= 60) ||
          entry.techFeatures.candlePattern ||
          (entry.techFeatures.chartPattern && !entry.techFeatures.chartPattern.includes("Nền"))
        );
        const hasMaSupportSnap = Boolean(
          (entry.techFeatures.ma10 != null && entry.price != null && entry.price >= entry.techFeatures.ma10 * 0.98) ||
          (entry.techFeatures.ma20 != null && entry.price != null && entry.price >= entry.techFeatures.ma20 * 0.96) ||
          entry.apexQuant.reversalMetrics.isMaReclaim === true ||
          entry.techFeatures.maSignal === "GOLDEN_CROSS" ||
          entry.techFeatures.maSignal === "BULLISH_ALIGN"
        );
        const isDiamondConfluence = Boolean(
          entry.techFeatures.hasBullishDivergence && hasCandleReversalSnap && hasMaSupportSnap
        );
        const isDualDivergence = Boolean(entry.techFeatures.isDualDivergence);

        const isBuyTriggerNow = presetsPassed.includes("apex_buy_now");
        let buyTriggerScore: number | null = null;
        let buyTriggerReasonVi: string | null = null;

        if (isBuyTriggerNow) {
          const apex = entry.apexQuant.apexScore ?? 60;
          const conf = entry.techFeatures.confluenceScore ?? 50;
          const sm = entry.smartMoney.score ?? 50;
          const mtf = entry.techFeatures.mtfScore ?? 50;
          let rawTriggerScore = Math.round(apex * 0.35 + conf * 0.25 + sm * 0.2 + mtf * 0.2);
          if (entry.buyPointPlan.buyZoneStatus === "AT_BUY_POINT") rawTriggerScore += 5;
          if (entry.apexQuant.reversalMetrics.isSweetLaunchZone) rawTriggerScore += 5;
          if (entry.smartMoney.signal === "POCKET_PIVOT" || entry.mtfCandle.vsaSignal === "NO_SUPPLY") rawTriggerScore += 4;
          // Volatility Squeeze & Sector Leading Alpha Boost
          if (entry.techFeatures.isSqueezeFiredBull) rawTriggerScore += 5;
          if (entry.isSectorLeading) rawTriggerScore += 4;
          if (entry.isSectorLagging) rawTriggerScore -= 5;
          // Biên độ 3, 4, 5 Boosts
          if (entry.techFeatures.isMaRibbonSqueeze) rawTriggerScore += 4;
          if (entry.techFeatures.isMaReclaimSpring) rawTriggerScore += 3;
          if (entry.techFeatures.isAbsorptionSpike) rawTriggerScore += 4;
          else if (entry.techFeatures.isVsaNoSupplyTest) rawTriggerScore += 3;
          if (entry.techFeatures.isPrecisionMtfAligned) rawTriggerScore += 4;
          // Nâng cấp Nhận diện Kỹ thuật & FA Pháo Đài Boosts
          if (entry.techFeatures.isTightCloses) rawTriggerScore += 3;
          if (entry.techFeatures.isVolumeDryUp) rawTriggerScore += 3;
          if (entry.techFeatures.isWyckoffLps) rawTriggerScore += 3;
          if (entry.techFeatures.isRsNewHigh20) rawTriggerScore += 3;
          if (entry.faMatrix.isNetCash) rawTriggerScore += 2;
          if (entry.faMatrix.cfoToNetProfit != null && entry.faMatrix.cfoToNetProfit >= 1.0) rawTriggerScore += 2;
          buyTriggerScore = Math.max(1, Math.min(99, rawTriggerScore));

          const reasons: string[] = [];
          if (entry.buyPointPlan.buyZoneStatus === "AT_BUY_POINT") {
            reasons.push("Chạm chuẩn điểm mua");
          } else if (entry.apexQuant.reversalMetrics.isSweetLaunchZone) {
            reasons.push("Vùng Vàng chân sóng");
          }
          if (entry.techFeatures.isTightCloses) {
            reasons.push("Nén giá phẳng Minervini");
          }
          if (entry.techFeatures.isVolumeDryUp) {
            reasons.push("Cạn vol VDU nền");
          }
          if (entry.techFeatures.isWyckoffLps) {
            reasons.push("Wyckoff LPS test cung");
          }
          if (entry.techFeatures.isRsNewHigh20) {
            reasons.push("RS Rating vượt đỉnh");
          }
          if (entry.techFeatures.isSqueezeFiredBull) {
            reasons.push("Nổ Squeeze bứt phá");
          } else if (entry.techFeatures.isSqueezeOn && (entry.techFeatures.squeezeBars == null || entry.techFeatures.squeezeBars >= 4)) {
            reasons.push(`Nén Squeeze (${entry.techFeatures.squeezeBars ?? 6}P)`);
          }
          if (entry.techFeatures.isMaRibbonSqueeze) {
            reasons.push("Nén Dải MA Ribbon");
          }
          if (entry.techFeatures.isMaReclaimSpring) {
            reasons.push("Rút chân Reclaim MA");
          }
          if (entry.techFeatures.isAbsorptionSpike) {
            reasons.push("Hấp thụ cung vol lớn");
          } else if (entry.techFeatures.isVsaNoSupplyTest) {
            reasons.push("Cạn cung VSA Test");
          }
          if (entry.faMatrix.faBadgeVi) {
            reasons.push(entry.faMatrix.faBadgeVi);
          }
          if (entry.isSectorLeading) {
            reasons.push("Ngành dẫn dắt RRG");
          }
          if (entry.smartMoney.signal === "POCKET_PIVOT") {
            reasons.push("Pocket Pivot gom hàng");
          } else if (entry.smartMoney.activeBuyRatioPct && entry.smartMoney.activeBuyRatioPct >= 60) {
            reasons.push(`Chủ động mua ${Math.round(entry.smartMoney.activeBuyRatioPct)}%`);
          } else if (entry.techFeatures.volRatio20 && entry.techFeatures.volRatio20 >= 1.5) {
            reasons.push(`Vol nổ gấp ${entry.techFeatures.volRatio20.toFixed(1)}x`);
          }
          if (entry.apexQuant.reversalMetrics.isWyckoffSpring) {
            reasons.push("Wyckoff Spring rũ cung");
          } else if (entry.apexQuant.reversalMetrics.isMaReclaim) {
            reasons.push("Lấy lại MA then chốt");
          }
          if (entry.techFeatures.isMtfAligned || entry.techFeatures.mtfConsensus === "ALL_BULL") {
            reasons.push("Đa khung H1+D1+W1 đồng thuận");
          }
          if (reasons.length === 0) {
            reasons.push("Hội tụ đa yếu tố định lượng Apex");
          }
          buyTriggerReasonVi = reasons.slice(0, 3).join(" • ");
        }

        let sniperTriggerSubtype: "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM" | "NONE" | null = null;
        let sniperTriggerLabelVi: string | null = null;
        let sniperEntryMin: number | null = null;
        let sniperEntryMax: number | null = null;
        let sniperStopLoss: number | null = null;
        let sniperTarget1: number | null = null;
        let sniperTarget2: number | null = null;
        let sniperRiskReward: number | null = null;

        if (isBuyTriggerNow && entry.price) {
          const p = entry.price;
          const isGolden = Boolean((entry.techFeatures as Record<string, unknown>)?.isGoldenPocket);
          const isFlip = Boolean((entry.techFeatures as Record<string, unknown>)?.isFlipZoneSupport);
          const isSmcOb = Boolean((entry.techFeatures as Record<string, unknown>)?.isSmcOrderBlock);

          if (entry.techFeatures.isMaReclaimSpring || isSmcOb || entry.apexQuant.reversalMetrics.isWyckoffSpring) {
            sniperTriggerSubtype = "SWEEP_RECLAIM";
            sniperTriggerLabelVi = "Quét Rũ Thanh Khoản Rút Chân";
            sniperEntryMin = +(p * 0.995).toFixed(2);
            sniperEntryMax = +(p * 1.012).toFixed(2);
            sniperStopLoss = entry.buyPointPlan.stopLoss ? +entry.buyPointPlan.stopLoss.toFixed(2) : +(p * 0.975).toFixed(2);
          } else if (isGolden || isFlip || entry.apexQuant.reversalMetrics.isSweetLaunchZone) {
            sniperTriggerSubtype = "SNIPER_PULLBACK";
            sniperTriggerLabelVi = "Kéo Ngược Vùng Vàng / Flip Zone";
            sniperEntryMin = +(p * 0.992).toFixed(2);
            sniperEntryMax = +(p * 1.008).toFixed(2);
            sniperStopLoss = entry.buyPointPlan.stopLoss ? +entry.buyPointPlan.stopLoss.toFixed(2) : +(p * 0.972).toFixed(2);
          } else if (entry.techFeatures.isMaRibbonSqueeze || entry.techFeatures.isSqueezeOn || entry.techFeatures.isSqueezeFiredBull) {
            sniperTriggerSubtype = "SQUEEZE_BREAKOUT";
            sniperTriggerLabelVi = "Bùng Nổ Từ Vùng Nén Kép";
            sniperEntryMin = +(p * 0.998).toFixed(2);
            sniperEntryMax = +(p * 1.018).toFixed(2);
            sniperStopLoss = entry.buyPointPlan.stopLoss ? +entry.buyPointPlan.stopLoss.toFixed(2) : +(p * 0.968).toFixed(2);
          } else {
            sniperTriggerSubtype = "SNIPER_PULLBACK";
            sniperTriggerLabelVi = "Điểm Mua Tức Thời";
            sniperEntryMin = +(p * 0.995).toFixed(2);
            sniperEntryMax = +(p * 1.01).toFixed(2);
            sniperStopLoss = entry.buyPointPlan.stopLoss ? +entry.buyPointPlan.stopLoss.toFixed(2) : +(p * 0.97).toFixed(2);
          }

          const risk = Math.max(0.01, p - sniperStopLoss);
          sniperTarget1 = entry.buyPointPlan.targetPrice ? +entry.buyPointPlan.targetPrice.toFixed(2) : +(p * 1.085).toFixed(2);
          sniperTarget2 = +(p + risk * 3.5).toFixed(2);
          const reward = Math.max(0.01, sniperTarget1 - p);
          sniperRiskReward = +(reward / risk).toFixed(2);
        }

        items.push({
          symbol: entry.sym,
          name: entry.q?.name ?? entry.vc?.name ?? entry.sec?.name ?? null,
          sector: entry.sec?.sector ?? sectorOf(entry.sym) ?? entry.vc?.sector ?? "Khác",
          exchange: entry.sec?.exchange ?? entry.vc?.exchange ?? "HOSE",
          price: entry.price,
          change: entry.change,
          changePercent: entry.changePercent,
          volume: entry.volume,
          marketCap: entry.marketCap,
          pe: entry.pe,
          pb: entry.pb,
          ps: entry.ps,
          evEbitda: entry.evEbitda,
          dividendYield: entry.dividendYield,
          roe: entry.roe,
          roa: entry.roa,
          grossMargin: entry.grossMargin,
          netMargin: entry.netMargin,
          debtEquity: entry.debtEquity,
          currentRatio: entry.currentRatio,
          revenueYoyPct: entry.revenueYoyPct,
          niYoyPct: entry.niYoyPct,
          fcfTtm: entry.fcfTtm,
          qualityScore: entry.qualityScore,
          healthScore: entry.healthScore,
          piotroskiFScore: entry.piotroskiFScore,
          piotroskiRating: entry.piotroskiRating,
          altmanZScore: entry.altmanZScore,
          altmanZone: entry.altmanZone,
          ma10: entry.techFeatures.ma10,
          ma20: entry.techFeatures.ma20,
          ma50: entry.techFeatures.ma50,
          maSignal: entry.techFeatures.maSignal,
          volRatio20: entry.techFeatures.volRatio20,
          adx14: entry.techFeatures.adx14,
          squeezeState: entry.techFeatures.squeezeState,
          squeezeBars: entry.techFeatures.squeezeBars,
          isSqueezeFiredBull: entry.techFeatures.isSqueezeFiredBull,
          isSqueezeOn: entry.techFeatures.isSqueezeOn,
          squeezeMomentumSlope: entry.techFeatures.squeezeMomentumSlope,
          superTrendDir: entry.techFeatures.superTrendDir,
          chartPattern: entry.techFeatures.chartPattern,
          candlePattern: entry.techFeatures.candlePattern,
          candlePatternScore: entry.techFeatures.candlePatternScore,
          candleAgeBars: entry.techFeatures.candleAgeBars,
          vcpDepths: entry.vcpDepths,
          vcpLastDepth: entry.vcpLastDepth,
          vcpPivot: entry.vcpPivot,
          hasBullishDivergence: entry.techFeatures.hasBullishDivergence,
          divergenceSummary: entry.techFeatures.divergenceSummary,
          confluenceScore: entry.techFeatures.confluenceScore,
          confluenceBadge: entry.techFeatures.confluenceBadge,
          foreignNetVal: entry.foreignNetVal,
          foreignAccumulating: entry.foreignAccumulating,
          rsRating: entry.rsRating,
          rsCategory: entry.rsCategory,
          rsTrend: entry.rsTrend,
          rsRating20: entry.rsRating20,
          isMarketLeader: entry.isMarketLeader,
          mtfConsensus: entry.techFeatures.mtfConsensus,
          isMtfAligned: entry.techFeatures.isMtfAligned,
          mtfScore: entry.techFeatures.mtfScore,
          mtfBadgeVi: entry.techFeatures.mtfBadgeVi,
          mtfSummary: entry.techFeatures.mtfSummary,
          quantEdgeScore: entry.quantFeatures.quantEdgeScore,
          quantBadge: entry.quantFeatures.quantBadge,
          ouZScore: entry.quantFeatures.ouZScore,
          ouHalfLife: entry.quantFeatures.ouHalfLife,
          ouMu: entry.quantFeatures.ouMu,
          tripleBarrierRiskReward: entry.quantFeatures.tripleBarrierRiskReward,
          tripleBarrierUpper: entry.quantFeatures.tripleBarrierUpper,
          tripleBarrierLower: entry.quantFeatures.tripleBarrierLower,
          cornishFisherVaR95: entry.quantFeatures.cornishFisherVaR95,
          returnSkewness: entry.quantFeatures.returnSkewness,
          quantAnomalyTag: entry.quantFeatures.quantAnomalyTag,
          beta: entry.quantFeatures.beta,
          buyPoint: entry.buyPointPlan.buyPoint,
          buyPointDiffPct: entry.buyPointPlan.buyPointDiffPct,
          absBuyDiff: entry.buyPointPlan.absBuyDiff,
          buyRange: entry.buyPointPlan.buyRange,
          buyZoneStatus: entry.buyPointPlan.buyZoneStatus,
          stopLoss: entry.buyPointPlan.stopLoss,
          targetPrice: entry.buyPointPlan.targetPrice,
          riskReward: entry.buyPointPlan.riskReward,
          buyStrategy: entry.buyPointPlan.buyStrategy,
          compositeScore: entry.compositeScore,
          // Orca Master Composite Rating
          orcaMasterScore,
          orcaMasterCategory,
          orcaMasterStrengthVi,
          // Smart Money Footprint
          smartMoneyScore: entry.smartMoney.score,
          smartMoneySignal: entry.smartMoney.signal,
          smartMoneySignalVi: entry.smartMoney.signalVi,
          activeBuyRatioPct: entry.smartMoney.activeBuyRatioPct,
          smartMoneySummaryVi: entry.smartMoney.summaryVi,
          sparkline: entry.sparkline,
          sparkBars: entry.sparkBars,
          mtfCandleClusterStatus: entry.mtfCandle.clusterStatus,
          mtfCandleScore: entry.mtfCandle.clusterScore,
          mtfCandleBadgeVi: entry.mtfCandle.clusterBadgeVi,
          mtfCandleD1Pattern: entry.mtfCandle.d1Pattern?.nameVi ?? null,
          mtfCandleW1Pattern: entry.mtfCandle.w1Pattern?.nameVi ?? null,
          mtfCandleH1Pattern: entry.mtfCandle.h1PatternName ?? null,
          vsaSignal: entry.mtfCandle.vsaSignal,
          vsaSignalVi: entry.mtfCandle.vsaSignalVi,
          overheadRoomPct: entry.mtfCandle.overheadRoomPct,
          nearestResistance: entry.mtfCandle.nearestResistance,
          // Historical Price Action Training & Empirical Edge
          historicalWinRate: entry.trainedHistorical.historicalWinRatePct,
          upDownVolRatio: entry.trainedHistorical.upDownVolRatio,
          supportBounceRate: entry.trainedHistorical.supportBounceRatePct,
          fakeoutRiskPct: entry.trainedHistorical.fakeoutRiskPct,
          historicalEdgeScore: entry.trainedHistorical.historicalEdgeScore,
          historicalEdgeBadge: entry.trainedHistorical.historicalEdgeBadge,
          historicalEdgeVerdictVi: entry.trainedHistorical.verdictVi,
          // Apex Quant Confluence & Reversal Engine
          apexQuantScore: entry.apexQuant.apexScore,
          apexCategory: entry.apexQuant.category,
          apexCategoryVi: entry.apexQuant.categoryVi,
          reversalStageVi: entry.apexQuant.reversalMetrics.reversalStageVi,
          extensionFromBottomPct: entry.apexQuant.reversalMetrics.extensionFromBottomPct,
          isSweetLaunchZone: entry.apexQuant.reversalMetrics.isSweetLaunchZone,
          isWyckoffSpring: entry.apexQuant.reversalMetrics.isWyckoffSpring,
          isMaReclaim: entry.apexQuant.reversalMetrics.isMaReclaim,
          isDiamondConfluence,
          isDualDivergence,
          setupGrade: (entry.techFeatures as Record<string, unknown>)?.setupGrade as "A+" | "A" | "B" | "C" | undefined ?? (entry.techFeatures.confluenceScore >= 75 ? "A+" : entry.techFeatures.confluenceScore >= 68 ? "A" : "B"),
          orthogonalPillarsPassed: (entry.techFeatures as Record<string, unknown>)?.orthogonalPillarsPassed as number | undefined ?? 3,
          isGoldenPocket: Boolean((entry.techFeatures as Record<string, unknown>)?.isGoldenPocket),
          fiboSummary: (entry.techFeatures as Record<string, unknown>)?.fiboSummary as string | null ?? null,
          isFlipZoneSupport: Boolean((entry.techFeatures as Record<string, unknown>)?.isFlipZoneSupport),
          structureSummary: (entry.techFeatures as Record<string, unknown>)?.structureSummary as string | null ?? null,
          isSmcOrderBlock: Boolean((entry.techFeatures as Record<string, unknown>)?.isSmcOrderBlock),
          isBuyTriggerNow,
          buyTriggerScore,
          buyTriggerReasonVi,
          sniperTriggerSubtype,
          sniperTriggerLabelVi,
          sniperEntryMin,
          sniperEntryMax,
          sniperStopLoss,
          sniperTarget1,
          sniperTarget2,
          sniperRiskReward,
          // Sector RRG & Volatility Squeeze Fields (Biên độ 1 & 2)
          sectorRrgQuadrant: entry.sectorRrgQuadrant,
          sectorRsRatio: entry.sectorRsRatio,
          sectorRsMomentum: entry.sectorRsMomentum,
          isSectorLeading: entry.isSectorLeading,
          isSectorLagging: entry.isSectorLagging,
          sectorResonanceBonus: entry.sectorResonanceBonus,
          // Biên độ 3, 4, 5 Fields
          isMaRibbonSqueeze: entry.techFeatures.isMaRibbonSqueeze,
          maRibbonSpreadPct: entry.techFeatures.maRibbonSpreadPct,
          isMaReclaimSpring: entry.techFeatures.isMaReclaimSpring,
          maSlope5Pct: entry.techFeatures.maSlope5Pct,
          isAbsorptionSpike: entry.techFeatures.isAbsorptionSpike,
          isVsaNoSupplyTest: entry.techFeatures.isVsaNoSupplyTest,
          isPrecisionMtfAligned: entry.techFeatures.isPrecisionMtfAligned,
          // Advanced Technical Recognition Engine (Nâng Cấp Nhận Diện Kỹ Thuật)
          isTightCloses: entry.techFeatures.isTightCloses,
          tightCloseSpreadPct: entry.techFeatures.tightCloseSpreadPct,
          isVolumeDryUp: entry.techFeatures.isVolumeDryUp,
          isRsNewHigh20: entry.techFeatures.isRsNewHigh20,
          isWyckoffLps: entry.techFeatures.isWyckoffLps,
          // Fundamental Quant Matrix (Nâng Cấp Phân Tích Cơ Bản FA)
          roic: entry.faMatrix.roic,
          cfoToNetProfit: entry.faMatrix.cfoToNetProfit,
          isQualityEarnings: entry.faMatrix.isQualityEarnings,
          ocfBillion: entry.faMatrix.ocfBillion,
          fcfYieldPct: entry.faMatrix.fcfYieldPct,
          interestCoverage: entry.faMatrix.interestCoverage,
          isSafeDebt: entry.faMatrix.isSafeDebt,
          isNetCash: entry.faMatrix.isNetCash,
          netDebtToEbitda: entry.faMatrix.netDebtToEbitda,
          peg: entry.faMatrix.peg,
          consensusTargetPrice: entry.faMatrix.consensusTargetPrice,
          consensusUpsidePct: entry.faMatrix.consensusUpsidePct,
          magicFormulaScore: entry.faMatrix.magicFormulaScore,
          faCategory: entry.faMatrix.faCategory,
          faBadgeVi: entry.faMatrix.faBadgeVi,
          faSummaryVi: entry.faMatrix.faSummaryVi,
          presetsPassed,
        });
      }

      const quoteProviders = multiQuotesRes.sources?.length ? multiQuotesRes.sources : ["vps", "ssi", "vndirect"];
      const valuationProviders = ["vndirect-finfo", "vietcap-iq", "orca-ratio-engine"];
      const allSourcesUsed = Array.from(new Set([...quoteProviders, ...valuationProviders]));

      // Precompute Presets Count & Sectors Available once during snapshot construction
      const presetsCount: Record<ScreenerPreset, number> = {
        all: items.length,
        apex_buy_now: 0,
        orca_apex_quant: 0,
        historical_edge: 0,
        sector_leading: 0,
        orca_master_elite: 0,
        smart_money_inflow: 0,
        near_buy_point: 0,
        mtf_candle_cluster: 0,
        vsa_no_supply: 0,
        rs_leaders: 0,
        piotroski_diamonds: 0,
        mtf_confluence: 0,
        bottom_confluence: 0,
        smc_golden_pocket: 0,
        flip_zone_retest: 0,
        quant_edge: 0,
        quant_mean_revert: 0,
        quant_low_beta: 0,
        quant_asymmetric: 0,
        confluence: 0,
        vcp: 0,
        ttm_squeeze: 0,
        canslim: 0,
        dividend: 0,
        growth: 0,
        value: 0,
        breakout: 0,
        ma_cross: 0,
        fa_fortress: 0,
        earnings_quality: 0,
        magic_formula: 0,
        consensus_upside: 0,
        tight_closes_vdu: 0,
      };

      const sectorSet = new Set<string>();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.sector) sectorSet.add(it.sector);
        const pList = it.presetsPassed;
        for (let j = 0; j < pList.length; j++) {
          const p = pList[j];
          if (p !== "all") presetsCount[p] = (presetsCount[p] ?? 0) + 1;
        }
      }
      const sectorsAvailable = Array.from(sectorSet).sort();

      return {
        items,
        sourcesUsed: allSourcesUsed,
        redundancyInfo: {
          quoteProviders,
          valuationProviders,
          failoverCount,
          healthStatus: quoteProviders.length >= 2 ? ("OPTIMAL" as const) : ("HIGH_AVAILABILITY" as const),
          latencies: multiQuotesRes.latencies ?? {},
          conflictCount: multiQuotesRes.conflicts ?? 0,
        },
        presetsCount,
        sectorsAvailable,
        version: Date.now(),
      };
    },
  });

  const snapshotData = res.value as MasterSnapshotPayload;

  const defaultPresetsCount: Record<ScreenerPreset, number> = {
    all: snapshotData?.items?.length ?? 0,
    apex_buy_now: 0,
    orca_apex_quant: 0,
    historical_edge: 0,
    sector_leading: 0,
    orca_master_elite: 0,
    smart_money_inflow: 0,
    near_buy_point: 0,
    mtf_candle_cluster: 0,
    vsa_no_supply: 0,
    rs_leaders: 0,
    piotroski_diamonds: 0,
    mtf_confluence: 0,
    bottom_confluence: 0,
    smc_golden_pocket: 0,
    flip_zone_retest: 0,
    quant_edge: 0,
    quant_mean_revert: 0,
    quant_low_beta: 0,
    quant_asymmetric: 0,
    confluence: 0,
    vcp: 0,
    ttm_squeeze: 0,
    canslim: 0,
    dividend: 0,
    growth: 0,
    value: 0,
    breakout: 0,
    ma_cross: 0,
    fa_fortress: 0,
    earnings_quality: 0,
    magic_formula: 0,
    consensus_upside: 0,
    tight_closes_vdu: 0,
  };

  const output: MasterSnapshotPayload = {
    items: snapshotData?.items ?? [],
    sourcesUsed: snapshotData?.sourcesUsed ?? ["vps", "vndirect", "ssi", "vietcap"],
    redundancyInfo: snapshotData?.redundancyInfo ?? {
      quoteProviders: ["vps", "ssi", "vndirect"],
      valuationProviders: ["vndirect-finfo", "vietcap-iq", "ratio-engine"],
      failoverCount: 0,
      healthStatus: "OPTIMAL",
      latencies: {},
      conflictCount: 0,
    },
    meta: buildMeta({
      source: (snapshotData?.sourcesUsed ?? ["vps", "vndirect", "ssi", "vietcap"]).join("+"),
      sourceTimestampMs: Date.now(),
      cached: res.cached,
      stale: res.stale,
      note: `Multi-Source Screener (${snapshotData?.items?.length ?? 0} mã · ${snapshotData?.sourcesUsed?.length ?? 4} nguồn)`,
    }),
    presetsCount: snapshotData?.presetsCount ?? defaultPresetsCount,
    sectorsAvailable: snapshotData?.sectorsAvailable ?? [],
    version: snapshotData?.version ?? Date.now(),
  };

  // Cache in L1 memory for sub-millisecond retrieval
  memoryMasterSnapshot = {
    payload: output,
    freshUntil: Date.now() + 60_000,
    staleUntil: Date.now() + 15 * 60_000,
  };

  return output;
}

/**
 * Filter, sort, and paginate stocks from the master screener snapshot.
 * Highly optimized with single-pass predicate evaluation and sub-millisecond query cache.
 */
export async function queryScreenerStocks(params: ScreenerFilterParams): Promise<ScreenerResponseData> {
  const snapshot = await getMasterScreenerSnapshot();
  const { items: allItems, sourcesUsed, redundancyInfo, meta, presetsCount, sectorsAvailable, version } = snapshot;

  // L1 Query Result Cache (normalized key)
  const qKey = `${version}:${params.preset || "all"}:${params.exchange || "ALL"}:${params.sector || ""}:${params.q || ""}:${params.maSignal || "ALL"}:${params.minPrice ?? ""}:${params.maxPrice ?? ""}:${params.minChg ?? ""}:${params.maxChg ?? ""}:${params.minVol ?? ""}:${params.maxVol ?? ""}:${params.minTradingValue ?? ""}:${params.minMarketCap ?? ""}:${params.maxMarketCap ?? ""}:${params.minPe ?? ""}:${params.maxPe ?? ""}:${params.minPb ?? ""}:${params.maxPb ?? ""}:${params.minRoe ?? ""}:${params.maxRoe ?? ""}:${params.minRoa ?? ""}:${params.maxRoa ?? ""}:${params.minDivYield ?? ""}:${params.maxDivYield ?? ""}:${params.maxDe ?? ""}:${params.minQualityScore ?? ""}:${params.minRevenueYoy ?? ""}:${params.minNiYoy ?? ""}:${params.minQuantScore ?? ""}:${params.maxOuZScore ?? ""}:${params.minRiskReward ?? ""}:${params.minOrcaMasterScore ?? ""}:${params.minSmartMoneyScore ?? ""}:${params.minRsRating ?? ""}:${params.minPiotroskiScore ?? ""}:${params.maxBuyDiff ?? ""}:${params.buyZoneStatus || "ALL"}:${params.buyPosition || "ALL"}:${params.volatilityCoil || "ALL"}:${params.vsaPattern || "ALL"}:${params.faProfile || "ALL"}:${params.techPattern || "ALL"}:${params.minRoic ?? ""}:${params.minInterestCoverage ?? ""}:${params.minCfoToNp ?? ""}:${params.minConsensusUpside ?? ""}:${params.maxPeg ?? ""}:${params.netCashOnly ?? ""}:${params.tightClosesOnly ?? ""}:${params.vduOnly ?? ""}:${params.rsNewHighOnly ?? ""}:${params.wyckoffLpsOnly ?? ""}:${params.mtfOnly ?? ""}:${params.mtfConsensus || "ALL"}:${params.mtfCandleOnly ?? ""}:${params.minMtfCandleScore ?? ""}:${params.vsaOnly ?? ""}:${params.minOverheadRoom ?? ""}:${params.buyTriggerOnly ?? ""}:${params.minBuyTriggerScore ?? ""}:${params.sort || "marketCap"}:${params.order || "desc"}:${params.limit || 50}:${params.offset || 0}`;

  const cached = queryL1Cache.get(qKey);
  if (cached && Date.now() < cached.exp) {
    return cached.res;
  }

  // Single-pass predicate extraction
  const hasPreset = Boolean(params.preset && params.preset !== "all");
  const presetTarget = params.preset!;
  const qUpper = params.q ? params.q.trim().toUpperCase() : null;
  const hasExchange = Boolean(params.exchange && params.exchange !== "ALL");
  const exchangeTarget = params.exchange!;
  const hasSector = Boolean(params.sector);
  const sectorTarget = params.sector!;
  const hasMaSignal = Boolean(params.maSignal && params.maSignal !== "ALL");
  const maSignalTarget = params.maSignal!;

  const {
    minPrice, maxPrice, minChg, maxChg, minVol, maxVol, minTradingValue,
    minMarketCap, maxMarketCap, minPe, maxPe, minPb, maxPb,
    minRoe, maxRoe, minRoa, maxRoa, minDivYield, maxDivYield,
    maxDe, minQualityScore, minRevenueYoy, minNiYoy,
    minQuantScore, maxOuZScore, minRiskReward,
  } = params;

  const filtered: ScreenerStockItem[] = [];
  const n = allItems.length;

  for (let i = 0; i < n; i++) {
    const x = allItems[i];

    // Discrete category checks (fail fast)
    if (hasPreset && !x.presetsPassed.includes(presetTarget)) continue;
    if (hasExchange && x.exchange !== exchangeTarget) continue;
    if (hasSector && x.sector !== sectorTarget) continue;
    if (hasMaSignal && x.maSignal !== maSignalTarget) continue;

    // Text query check
    if (qUpper && !x.symbol.includes(qUpper) && (!x.name || !x.name.toUpperCase().includes(qUpper))) {
      continue;
    }

    // Number range checks
    if (minPrice != null && (x.price == null || x.price < minPrice)) continue;
    if (maxPrice != null && (x.price == null || x.price > maxPrice)) continue;
    if (minChg != null && (x.changePercent == null || x.changePercent < minChg)) continue;
    if (maxChg != null && (x.changePercent == null || x.changePercent > maxChg)) continue;
    if (minTradingValue != null) {
      const valBillion = x.price && x.volume ? (x.price * x.volume) / 1_000_000 : 0;
      if (valBillion < minTradingValue) continue;
    }
    if (minVol != null) {
      if (minVol <= 500) {
        // If user entered turnover in Billion VND (e.g. 5 means 5 Billion VND)
        const valBillion = x.price && x.volume ? (x.price * x.volume) / 1_000_000 : 0;
        if (valBillion < minVol) continue;
      } else {
        if (x.volume == null || x.volume < minVol) continue;
      }
    }
    if (maxVol != null && (x.volume == null || x.volume > maxVol)) continue;
    if (minMarketCap != null && (x.marketCap == null || x.marketCap < minMarketCap)) continue;
    if (maxMarketCap != null && (x.marketCap == null || x.marketCap > maxMarketCap)) continue;

    if (minPe != null && (x.pe == null || x.pe < minPe)) continue;
    if (maxPe != null && (x.pe == null || x.pe > maxPe)) continue;
    if (minPb != null && (x.pb == null || x.pb < minPb)) continue;
    if (maxPb != null && (x.pb == null || x.pb > maxPb)) continue;
    if (minRoe != null && (x.roe == null || x.roe < minRoe)) continue;
    if (maxRoe != null && (x.roe == null || x.roe > maxRoe)) continue;
    if (minRoa != null && (x.roa == null || x.roa < minRoa)) continue;
    if (maxRoa != null && (x.roa == null || x.roa > maxRoa)) continue;
    if (minDivYield != null && (x.dividendYield == null || x.dividendYield < minDivYield)) continue;
    if (maxDivYield != null && (x.dividendYield == null || x.dividendYield > maxDivYield)) continue;
    if (maxDe != null && (x.debtEquity == null || x.debtEquity > maxDe)) continue;
    if (minQualityScore != null && (x.qualityScore == null || x.qualityScore < minQualityScore)) continue;
    if (minRevenueYoy != null && (x.revenueYoyPct == null || x.revenueYoyPct < minRevenueYoy)) continue;
    if (minNiYoy != null && (x.niYoyPct == null || x.niYoyPct < minNiYoy)) continue;

    // Quant features
    if (minQuantScore != null && (x.quantEdgeScore == null || x.quantEdgeScore < minQuantScore)) continue;
    if (maxOuZScore != null && (x.ouZScore == null || x.ouZScore > maxOuZScore)) continue;
    if (minRiskReward != null && (x.tripleBarrierRiskReward == null || x.tripleBarrierRiskReward < minRiskReward)) continue;

    // Sprint 1 & 2 Institutional Indicators
    if (params.minOrcaMasterScore != null && (x.orcaMasterScore == null || x.orcaMasterScore < params.minOrcaMasterScore)) continue;
    if (params.minSmartMoneyScore != null && (x.smartMoneyScore == null || x.smartMoneyScore < params.minSmartMoneyScore)) continue;
    if (params.minRsRating != null && (x.rsRating == null || x.rsRating < params.minRsRating)) continue;
    if (params.minPiotroskiScore != null && (x.piotroskiFScore == null || x.piotroskiFScore < params.minPiotroskiScore)) continue;

    // Buy Point filters
    if (params.maxBuyDiff != null && (x.absBuyDiff == null || x.absBuyDiff > params.maxBuyDiff)) continue;
    if (params.buyZoneStatus && params.buyZoneStatus !== "ALL" && x.buyZoneStatus !== params.buyZoneStatus) continue;

    // Consolidated Buy Position Filter
    if (params.buyPosition && params.buyPosition !== "ALL") {
      if (params.buyPosition === "AT_BUY_POINT") {
        if (x.buyZoneStatus !== "AT_BUY_POINT" && (x.absBuyDiff == null || x.absBuyDiff > 1.0)) continue;
      } else if (params.buyPosition === "NEAR_BUY_POINT") {
        if (x.buyZoneStatus !== "NEAR_BUY_POINT" && x.buyZoneStatus !== "AT_BUY_POINT" && (x.absBuyDiff == null || x.absBuyDiff > 2.5)) continue;
      } else if (params.buyPosition === "SAFE_ACCUMULATION") {
        if (x.absBuyDiff == null || x.absBuyDiff > 3.5) continue;
      } else if (params.buyPosition === "WAIT_PULLBACK") {
        if (x.buyZoneStatus !== "WAIT_PULLBACK") continue;
      } else if (params.buyPosition === "BELOW_SUPPORT") {
        if (x.buyZoneStatus !== "BELOW_SUPPORT") continue;
      }
    }

    // Multi-Timeframe filters
    if (params.mtfOnly && !x.isMtfAligned) continue;
    if (params.mtfConsensus && params.mtfConsensus !== "ALL" && x.mtfConsensus !== params.mtfConsensus) continue;

    // MTF Candlestick & VSA Clusters
    if (params.mtfCandleOnly && (x.mtfCandleClusterStatus === "NO_CLUSTER" || !x.mtfCandleClusterStatus)) continue;
    if (params.minMtfCandleScore != null && (x.mtfCandleScore == null || x.mtfCandleScore < params.minMtfCandleScore)) continue;
    if (params.vsaOnly && !x.vsaSignal) continue;
    if (params.minOverheadRoom != null && (x.overheadRoomPct == null || x.overheadRoomPct < params.minOverheadRoom)) continue;

    // Historical Price Action Training Filters
    if (params.minHistoricalEdgeScore != null && (x.historicalEdgeScore == null || x.historicalEdgeScore < params.minHistoricalEdgeScore)) continue;
    if (params.minHistoricalWinRate != null && (x.historicalWinRate == null || x.historicalWinRate < params.minHistoricalWinRate)) continue;
    if (params.minUpDownVolRatio != null && (x.upDownVolRatio == null || x.upDownVolRatio < params.minUpDownVolRatio)) continue;

    // Apex Quant Confluence & Reversal Filters
    if (params.minApexScore != null && (x.apexQuantScore == null || x.apexQuantScore < params.minApexScore)) continue;
    if (params.maxExtensionBottom != null && (x.extensionFromBottomPct == null || x.extensionFromBottomPct > params.maxExtensionBottom)) continue;
    if (params.sweetZoneOnly && !x.isSweetLaunchZone) continue;

    // Real-Time Actionable Buy Trigger Filters
    if (params.buyTriggerOnly && !x.isBuyTriggerNow) continue;
    if (params.minBuyTriggerScore != null && (x.buyTriggerScore == null || x.buyTriggerScore < params.minBuyTriggerScore)) continue;

    // Sector RRG & Volatility Squeeze Filters (Biên độ 1 & 2)
    if (params.rrgQuadrant && params.rrgQuadrant !== "all" && x.sectorRrgQuadrant !== params.rrgQuadrant) continue;
    if (params.sectorLeadingOnly && !x.isSectorLeading) continue;
    if (params.squeezeOnly && !x.isSqueezeOn) continue;
    if (params.squeezeFiredOnly && !x.isSqueezeFiredBull) continue;

    // Consolidated Volatility Coil Filter (TTM + Ribbon Squeeze)
    if (params.volatilityCoil && params.volatilityCoil !== "ALL") {
      if (params.volatilityCoil === "FIRED" && !x.isSqueezeFiredBull) continue;
      if (params.volatilityCoil === "SQUEEZE_ON" && !x.isSqueezeOn) continue;
      if (params.volatilityCoil === "RIBBON_SQUEEZE" && !x.isMaRibbonSqueeze) continue;
      if (params.volatilityCoil === "COIL_SUPER" && (!x.isSqueezeOn || !x.isMaRibbonSqueeze)) continue;
    }

    // MA Geometry, Volume Absorption & Precision MTF Filters (Biên độ 3, 4, 5)
    if (params.maRibbonSqueezeOnly && !x.isMaRibbonSqueeze) continue;
    if (params.maReclaimOnly && !x.isMaReclaimSpring) continue;
    if (params.absorptionSpikeOnly && !x.isAbsorptionSpike) continue;
    if (params.vsaNoSupplyOnly && !x.isVsaNoSupplyTest) continue;
    if (params.precisionMtfOnly && !x.isPrecisionMtfAligned) continue;

    // Consolidated VSA Pattern Filter (Absorption + No Supply + Active Buy)
    if (params.vsaPattern && params.vsaPattern !== "ALL") {
      if (params.vsaPattern === "ABSORPTION" && !x.isAbsorptionSpike && x.vsaSignal !== "ABSORPTION") continue;
      if (params.vsaPattern === "NO_SUPPLY" && !x.isVsaNoSupplyTest && x.vsaSignal !== "NO_SUPPLY") continue;
      if (params.vsaPattern === "ACTIVE_BUY" && (x.activeBuyRatioPct == null || x.activeBuyRatioPct < 55)) continue;
    }

    // Consolidated Fundamental Quant Matrix Filters (FA)
    if (params.faProfile && params.faProfile !== "ALL") {
      if (x.faCategory !== params.faProfile) continue;
    }
    if (params.minRoic != null && (x.roic == null || x.roic < params.minRoic)) continue;
    if (params.minInterestCoverage != null && (x.interestCoverage == null || x.interestCoverage < params.minInterestCoverage)) continue;
    if (params.minCfoToNp != null && (x.cfoToNetProfit == null || x.cfoToNetProfit < params.minCfoToNp)) continue;
    if (params.minConsensusUpside != null && (x.consensusUpsidePct == null || x.consensusUpsidePct < params.minConsensusUpside)) continue;
    if (params.maxPeg != null && (x.peg == null || x.peg > params.maxPeg)) continue;
    if (params.netCashOnly && !x.isNetCash) continue;

    // Advanced Technical Pattern Recognition Filters
    if (params.techPattern && params.techPattern !== "ALL") {
      if (params.techPattern === "TIGHT_CLOSES" && !x.isTightCloses) continue;
      if (params.techPattern === "VDU" && !x.isVolumeDryUp) continue;
      if (params.techPattern === "RS_NEW_HIGH" && !x.isRsNewHigh20) continue;
      if (params.techPattern === "WYCKOFF_LPS" && !x.isWyckoffLps) continue;
    }
    if (params.tightClosesOnly && !x.isTightCloses) continue;
    if (params.vduOnly && !x.isVolumeDryUp) continue;
    if (params.rsNewHighOnly && !x.isRsNewHigh20) continue;
    if (params.wyckoffLpsOnly && !x.isWyckoffLps) continue;

    filtered.push(x);
  }

  // High-performance sorting comparator
  const sortKey = (params.sort ?? "marketCap") as keyof ScreenerStockItem;
  const isAsc = params.order != null
    ? params.order === "asc"
    : (sortKey === "absBuyDiff" || sortKey === "buyPointDiffPct");

  filtered.sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (valA === valB) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === "number" && typeof valB === "number") {
      return isAsc ? valA - valB : valB - valA;
    }
    const sA = String(valA);
    const sB = String(valB);
    return isAsc ? (sA < sB ? -1 : 1) : (sA > sB ? -1 : 1);
  });

  const total = filtered.length;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const paginated = filtered.slice(offset, offset + limit);

  const response: ScreenerResponseData = {
    items: paginated,
    total,
    totalUniverse: allItems.length,
    offset,
    limit,
    presetsCount,
    sectorsAvailable,
    sourcesUsed,
    redundancyInfo,
    meta,
  };

  // Keep L1 cache size controlled
  if (queryL1Cache.size > 150) {
    const oldestKey = queryL1Cache.keys().next().value;
    if (oldestKey) queryL1Cache.delete(oldestKey);
  }
  queryL1Cache.set(qKey, { res: response, exp: Date.now() + 20_000 });

  return response;
}
