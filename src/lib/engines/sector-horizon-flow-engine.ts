/**
 * Multi-Horizon Sector Money-Flow & Rotation Quantitative Engine
 *
 * Evaluates Vietnamese equity sectors across 4 distinct institutional horizons:
 * 1. SHORT_1_2W (Ngắn hạn: 1 - 2 tuần / 5 - 10 phiên):
 *    Liquidity surge, Taker/Smart-Money aggression, RRG 5D momentum, Pocket Pivot / Sweep & Squeeze triggers.
 * 2. MEDIUM_3W_2M (Trung hạn: 3 tuần - 2 tháng / 15 - 40 phiên):
 *    20D RRG RS-Ratio & Improving->Leading trajectory, Up/Down Volume accumulation, VCP/Tight-Closes/VDU base, Quarterly earnings inflection.
 * 3. MED_LONG_2_6M (Trung - Dài hạn: 2 - 6 tháng / 45 - 125 phiên):
 *    Stage-2 trend alignment (Price > MA20 > MA50), O'Neil RS Rating, RNAV / Gordon P/B / Reverse DCF valuation upside, Institutional ownership & Foreign accumulation.
 * 4. LONG_6M_PLUS (Dài hạn: > 6 tháng / 125 - 252+ phiên):
 *    Economic Moat (ROIC > WACC, 3Y ROIIC >= 20%), Forensic Earnings Quality (CFO/NI >= 1.0, Sloan <= 5%, Beneish safe), Financial Fortress (Net Cash, Merton DD, Piotroski F-Score >= 7), Sustainable Dividend & Buffett Compounder.
 */

import { VN_ICB_SECTORS, matchSymbolToIcbSector, type RrgQuadrant } from "./rrg-engine";
import { getSectorBaselineFundamentals, INSTITUTIONAL_FUNDAMENTAL_SEEDS } from "../services/institutional-fundamental-seeds";

export type InvestmentHorizon =
  | "SHORT_1_2W"
  | "MEDIUM_3W_2M"
  | "MED_LONG_2_6M"
  | "LONG_6M_PLUS";

export type HorizonFlowSignal =
  | "STRONG_INFLOW"
  | "ACCUMULATION"
  | "NEUTRAL"
  | "DISTRIBUTION"
  | "OUTFLOW";

export type SectorInstitutionalRegime =
  | "DUAL_INFLOW"
  | "SECTOR_VOLUME_IGNITION"
  | "DOMESTIC_SMART_MONEY_LEAD"
  | "FOREIGN_NET_ACCUMULATION"
  | "STEALTH_ACCUMULATION"
  | "BROAD_DISTRIBUTION"
  | "NEUTRAL_ROTATION";

export interface HorizonStockPick {
  symbol: string;
  price: number;
  changePercent: number;
  turnoverBillion: number;
  horizonScore: number;
  reasonVi: string;
  buyZoneStatus?: string | null;
  riskReward?: number | null;
}

export interface SectorHorizonMetrics {
  short1_2w: number;      // 1 - 99
  medium3w_2m: number;    // 1 - 99
  medLong2_6m: number;    // 1 - 99
  long6mPlus: number;     // 1 - 99
  compositeFlowScore: number; // 1 - 99
}

export interface SectorHorizonSignals {
  short1_2w: HorizonFlowSignal;
  short1_2wVi: string;
  medium3w_2m: HorizonFlowSignal;
  medium3w_2mVi: string;
  medLong2_6m: HorizonFlowSignal;
  medLong2_6mVi: string;
  long6mPlus: HorizonFlowSignal;
  long6mPlusVi: string;
}

export interface SectorHorizonFlowInputItem {
  symbol: string;
  sector?: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  turnoverBillion?: number | null;
  marketCap?: number | null;
  foreignNetValBillion?: number | null;
  volRatio20?: number | null;
  upDownVolRatio?: number | null;
  rsRating?: number | null;
  rsRating20?: number | null;
  rsTrend?: "IMPROVING" | "WEAKENING" | "NEUTRAL" | null;
  maSignal?: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL" | string | null;
  mtfConsensus?: string | null;
  isMtfAligned?: boolean | null;
  smartMoneyScore?: number | null;
  smartMoneySignal?: string | null;
  apexQuantScore?: number | null;
  orcaMasterScore?: number | null;
  confluenceScore?: number | null;
  historicalEdgeScore?: number | null;
  isBuyTriggerNow?: boolean | null;
  buyZoneStatus?: string | null;
  absBuyDiff?: number | null;
  riskReward?: number | null;
  isSqueezeFiredBull?: boolean | null;
  isSqueezeOn?: boolean | null;
  isTightCloses?: boolean | null;
  isVolumeDryUp?: boolean | null;
  isWyckoffLps?: boolean | null;
  isWyckoffSpring?: boolean | null;
  ouZScore?: number | null;
  ouHalfLife?: number | null;
  sectorRrgQuadrant?: RrgQuadrant | null;
  sectorRsRatio?: number | null;
  sectorRsMomentum?: number | null;
  // Fundamental & Valuation
  roe?: number | null;
  roic?: number | null;
  roiic3Y?: number | null;
  pe?: number | null;
  pb?: number | null;
  peg?: number | null;
  dividendYield?: number | null;
  niYoyPct?: number | null;
  revenueYoyPct?: number | null;
  isQuarterlyInflection?: boolean | null;
  piotroskiFScore?: number | null;
  altmanZone?: string | null;
  cfoToNetProfit?: number | null;
  sloanAccrualRatio?: number | null;
  isBeneishSafe?: boolean | null;
  isNetCash?: boolean | null;
  isMertonSafe?: boolean | null;
  mertonDistanceToDefault?: number | null;
  isBuffettCompounder?: boolean | null;
  isSuperCompounder?: boolean | null;
  isDividendAristocrat?: boolean | null;
  consensusUpsidePct?: number | null;
  reverseDcfMarginPct?: number | null;
  bankFairPbGordon?: number | null;
  rnavUpsidePct?: number | null;
  isBrokenSupport?: boolean | null;
  /** Optional precomputed horizon scores from unified snapshot pipeline to avoid duplicate evaluation */
  precomputedHorizonScores?: {
    short1_2w: number;
    medium3w_2m: number;
    medLong2_6m: number;
    long6mPlus: number;
    bestHorizon: InvestmentHorizon;
    bestHorizonVi: string;
    reasonsByHorizon?: Record<InvestmentHorizon, string>;
  } | null;
}

export interface IntraSectorStockRank {
  symbol: string;
  sector: string;
  sectorCode: string;
  rankInSector: number;
  isSectorFlowLeader: boolean;
  sectorFlowScore: number;
  sectorShortFlowScore: number;
  sectorMediumFlowScore: number;
  sectorMedLongFlowScore: number;
  sectorLongFlowScore: number;
  sectorFlowSignal: HorizonFlowSignal;
  sectorFlowSignalVi: string;
  sectorInstitutionalRegime: SectorInstitutionalRegime;
  sectorInstitutionalRegimeVi: string;
  sectorVolSurgeRatio: number;
  sectorSmartMoneyBreadthPct: number;
}

export interface SectorHorizonFlowResult {
  sectorCode: string;
  sector: string;
  totalTurnoverBillion: number;
  turnoverSharePct: number;
  foreignNetValBillion: number;
  avgChangePercent: number;
  vwapChangePercent: number;
  gainersCount: number;
  losersCount: number;
  unchangedCount: number;
  totalStocksCount: number;
  breadthRatioPct: number;
  /** Liquidity-weighted 20-day volume surge ratio across sector */
  weightedVolRatio20: number;
  /** Liquidity-weighted 50-day Up/Down volume accumulation ratio */
  weightedUpDownVolRatio: number;
  /** % of stocks in sector showing Smart Money accumulation / Pocket Pivot / Spring */
  smartMoneyBreadthPct: number;
  /** % of stocks in sector forming VCP / Tight Closes / VDU / Wyckoff LPS base */
  vcpTightBreadthPct: number;
  /** Number of stocks in sector currently at or near actionable buy trigger */
  buyTriggerStocksCount: number;
  /** Institutional money-flow regime classification */
  institutionalRegime: SectorInstitutionalRegime;
  institutionalRegimeVi: string;
  /** Short-term vs Medium-Long term flow velocity delta (short1_2w - medLong2_6m) */
  flowVelocityDelta: number;
  flowVelocitySignalVi: string;
  quadrant: "Leading" | "Improving" | "Weakening" | "Lagging";
  quadrantVi: string;
  rsRatio: number;
  rsMomentum: number;
  horizonScores: SectorHorizonMetrics;
  horizonSignals: SectorHorizonSignals;
  bestHorizon: InvestmentHorizon;
  bestHorizonVi: string;
  rotationPhaseVi: string;
  thesisByHorizonVi: Record<InvestmentHorizon, string>;
  topStock: HorizonStockPick | null;
  topPicksByHorizon: Record<InvestmentHorizon, HorizonStockPick[]>;
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.max(5, Math.min(99, Math.round(v)));
}

export function classifyHorizonFlowSignal(score: number): {
  signal: HorizonFlowSignal;
  labelVi: string;
} {
  if (score >= 76) return { signal: "STRONG_INFLOW", labelVi: "Tiền vào mạnh" };
  if (score >= 62) return { signal: "ACCUMULATION", labelVi: "Đang gom tích lũy" };
  if (score >= 45) return { signal: "NEUTRAL", labelVi: "Phân hóa / Cân bằng" };
  if (score >= 32) return { signal: "DISTRIBUTION", labelVi: "Chốt lời / Phân phối" };
  return { signal: "OUTFLOW", labelVi: "Dòng tiền rút ra" };
}

export function horizonLabelVi(h: InvestmentHorizon): string {
  switch (h) {
    case "SHORT_1_2W":
      return "Ngắn hạn (1–2 tuần)";
    case "MEDIUM_3W_2M":
      return "Trung hạn (3 tuần–2 tháng)";
    case "MED_LONG_2_6M":
      return "Trung–Dài hạn (2–6 tháng)";
    case "LONG_6M_PLUS":
      return "Dài hạn (> 6 tháng)";
  }
}

/**
 * Shared zero-copy adapter converting any stock snapshot/entry into SectorHorizonFlowInputItem.
 * Eliminates repetitive 65-field object literal mappings across services and API routes.
 */
export function toSectorHorizonInput(
  src: Record<string, any>,
  overrides?: Partial<SectorHorizonFlowInputItem>,
): SectorHorizonFlowInputItem {
  const hasPrecomputed =
    src.horizonShortScore != null &&
    src.horizonMediumScore != null &&
    src.horizonMedLongScore != null &&
    src.horizonLongScore != null &&
    src.bestHorizon != null;

  return {
    symbol: String(src.symbol ?? src.sym ?? "").toUpperCase(),
    sector: src.sector ?? null,
    price: src.price ?? null,
    changePercent: src.changePercent ?? null,
    volume: src.volume ?? null,
    turnoverBillion: src.turnoverBillion ?? null,
    marketCap: src.marketCap ?? null,
    foreignNetValBillion: src.foreignNetValBillion ?? src.foreignNetVal ?? null,
    volRatio20: src.volRatio20 ?? null,
    upDownVolRatio: src.upDownVolRatio ?? null,
    rsRating: src.rsRating ?? null,
    rsRating20: src.rsRating20 ?? null,
    rsTrend: src.rsTrend ?? null,
    maSignal: src.maSignal ?? null,
    mtfConsensus: src.mtfConsensus ?? null,
    isMtfAligned: src.isMtfAligned ?? null,
    smartMoneyScore: src.smartMoneyScore ?? null,
    smartMoneySignal: src.smartMoneySignal ?? null,
    apexQuantScore: src.apexQuantScore ?? null,
    orcaMasterScore: src.orcaMasterScore ?? null,
    confluenceScore: src.confluenceScore ?? null,
    historicalEdgeScore: src.historicalEdgeScore ?? null,
    isBuyTriggerNow: src.isBuyTriggerNow ?? null,
    buyZoneStatus: src.buyZoneStatus ?? null,
    absBuyDiff: src.absBuyDiff ?? null,
    riskReward: src.riskReward ?? null,
    isSqueezeFiredBull: src.isSqueezeFiredBull ?? null,
    isSqueezeOn: src.isSqueezeOn ?? null,
    isTightCloses: src.isTightCloses ?? null,
    isVolumeDryUp: src.isVolumeDryUp ?? null,
    isWyckoffLps: src.isWyckoffLps ?? null,
    isWyckoffSpring: src.isWyckoffSpring ?? null,
    ouZScore: src.ouZScore ?? null,
    ouHalfLife: src.ouHalfLife ?? null,
    sectorRrgQuadrant: src.sectorRrgQuadrant ?? null,
    sectorRsRatio: src.sectorRsRatio ?? null,
    sectorRsMomentum: src.sectorRsMomentum ?? null,
    roe: src.roe ?? null,
    roic: src.roic ?? null,
    roiic3Y: src.roiic3Y ?? null,
    pe: src.pe ?? null,
    pb: src.pb ?? null,
    peg: src.peg ?? null,
    dividendYield: src.dividendYield ?? null,
    niYoyPct: src.niYoyPct ?? null,
    revenueYoyPct: src.revenueYoyPct ?? null,
    isQuarterlyInflection: src.isQuarterlyInflection ?? null,
    piotroskiFScore: src.piotroskiFScore ?? null,
    altmanZone: src.altmanZone ?? null,
    cfoToNetProfit: src.cfoToNetProfit ?? null,
    sloanAccrualRatio: src.sloanAccrualRatio ?? null,
    isBeneishSafe: src.isBeneishSafe ?? null,
    isNetCash: src.isNetCash ?? null,
    isMertonSafe: src.isMertonSafe ?? null,
    mertonDistanceToDefault: src.mertonDistanceToDefault ?? null,
    isBuffettCompounder: src.isBuffettCompounder ?? null,
    isSuperCompounder: src.isSuperCompounder ?? null,
    isDividendAristocrat: src.isDividendAristocrat ?? null,
    consensusUpsidePct: src.consensusUpsidePct ?? null,
    reverseDcfMarginPct: src.reverseDcfMarginPct ?? null,
    bankFairPbGordon: src.bankFairPbGordon ?? null,
    rnavUpsidePct: src.rnavUpsidePct ?? null,
    isBrokenSupport: src.isBrokenSupport ?? null,
    precomputedHorizonScores: hasPrecomputed
      ? {
          short1_2w: src.horizonShortScore,
          medium3w_2m: src.horizonMediumScore,
          medLong2_6m: src.horizonMedLongScore,
          long6mPlus: src.horizonLongScore,
          bestHorizon: src.bestHorizon,
          bestHorizonVi: src.bestHorizonVi ?? "Đa khung",
        }
      : null,
    ...overrides,
  };
}

/**
 * Computes stock-level score for each of the 4 investment horizons (1 - 99).
 */
export function evaluateStockHorizonScores(item: SectorHorizonFlowInputItem): {
  short1_2w: number;
  medium3w_2m: number;
  medLong2_6m: number;
  long6mPlus: number;
  bestHorizon: InvestmentHorizon;
  bestHorizonVi: string;
  reasonsByHorizon: Record<InvestmentHorizon, string>;
} {
  const seed = INSTITUTIONAL_FUNDAMENTAL_SEEDS.get(item.symbol.toUpperCase()) ??
    getSectorBaselineFundamentals(item.sector ?? "");

  const roe = item.roe ?? seed.roe;
  const roic = item.roic ?? seed.roic ?? (roe * 0.8);
  const fScore = item.piotroskiFScore ?? seed.fScore;
  const niYoy = item.niYoyPct ?? seed.niYoyPct;
  const revYoy = item.revenueYoyPct ?? seed.revenueYoyPct;
  const divYield = item.dividendYield ?? seed.dividendYield;
  const cfoToNi = item.cfoToNetProfit ?? seed.cfoToNetProfit ?? 1.0;
  const isBroken = Boolean(item.isBrokenSupport || item.buyZoneStatus === "BELOW_SUPPORT");
  const isDeathCross = item.maSignal === "DEATH_CROSS";
  const chg = item.changePercent ?? 0;
  const volRatio = item.volRatio20 ?? 1.0;

  // -------------------------------------------------------------------------
  // 1. SHORT_1_2W (Ngắn hạn 1 - 2 tuần: Thanh khoản, Xung lực T+, Sweep/Squeeze)
  // -------------------------------------------------------------------------
  let sShort = 48;
  const shortReasons: string[] = [];

  if (item.isBuyTriggerNow) {
    sShort += 16;
    shortReasons.push("Kích hoạt điểm mua T+");
  } else if (item.buyZoneStatus === "AT_BUY_POINT" || (item.absBuyDiff != null && item.absBuyDiff <= 1.8)) {
    sShort += 10;
    shortReasons.push("Sát điểm mua chuẩn");
  }

  if (volRatio >= 1.35 && chg >= 0) {
    sShort += 14;
    shortReasons.push(`Nổ vol ${volRatio.toFixed(1)}x TB20`);
  } else if (volRatio >= 1.1 && chg >= 0) {
    sShort += 8;
  } else if (volRatio >= 1.4 && chg < -1.5) {
    sShort -= 14; // High volume selloff
  }

  if (item.smartMoneySignal === "HEAVY_ACCUMULATION" || item.smartMoneySignal === "POCKET_PIVOT") {
    sShort += 12;
    shortReasons.push(item.smartMoneySignal === "POCKET_PIVOT" ? "Pocket Pivot" : "Cá mập gom");
  } else if (item.smartMoneySignal === "SPRING_ABSORPTION" || item.isWyckoffSpring) {
    sShort += 10;
    shortReasons.push("Wyckoff Spring rũ cung");
  } else if ((item.smartMoneyScore ?? 50) >= 65) {
    sShort += 7;
  }

  if (item.isSqueezeFiredBull) {
    sShort += 10;
    shortReasons.push("Nổ TTM Squeeze");
  } else if (item.ouZScore != null && item.ouZScore <= -1.4 && (item.ouHalfLife ?? 99) <= 18) {
    sShort += 9;
    shortReasons.push(`Hồi quy OU (Z=${item.ouZScore})`);
  }

  if ((item.foreignNetValBillion ?? 0) >= 5) {
    sShort += 6;
    shortReasons.push(`Ngoại mua +${item.foreignNetValBillion?.toFixed(1)} tỷ`);
  } else if ((item.foreignNetValBillion ?? 0) <= -10) {
    sShort -= 6;
  }

  if (chg >= 1.5 && chg <= 6.2) sShort += 6;
  else if (chg <= -2.5) sShort -= 12;

  if (isBroken || isDeathCross) sShort -= 22;

  // -------------------------------------------------------------------------
  // 2. MEDIUM_3W_2M (Trung hạn 3 tuần - 2 tháng: RRG, Nền VCP/LPS, Điểm uốn Quý)
  // -------------------------------------------------------------------------
  let sMed = 48;
  const medReasons: string[] = [];

  if (item.sectorRrgQuadrant === "LEADING") {
    sMed += 12;
    medReasons.push("Sóng ngành Leading");
  } else if (item.sectorRrgQuadrant === "IMPROVING") {
    sMed += 9;
    medReasons.push("Ngành xoay trục Improving");
  } else if (item.sectorRrgQuadrant === "LAGGING") {
    sMed -= 8;
  }

  if ((item.upDownVolRatio ?? 1) >= 1.2) {
    sMed += 11;
    medReasons.push(`Tích lũy Vol +${item.upDownVolRatio?.toFixed(2)}x`);
  } else if ((item.upDownVolRatio ?? 1) < 0.85) {
    sMed -= 8;
  }

  if (item.isTightCloses || item.isVolumeDryUp || item.isWyckoffLps) {
    sMed += 12;
    medReasons.push(item.isWyckoffLps ? "Nền Wyckoff LPS" : "Nén VCP / VDU cạn cung");
  } else if (item.isSqueezeOn) {
    sMed += 7;
    medReasons.push("Đang nén Volatility Squeeze");
  }

  if (item.isQuarterlyInflection || niYoy >= 22) {
    sMed += 12;
    medReasons.push(`Tăng tốc LNST +${niYoy.toFixed(0)}%`);
  } else if (niYoy >= 14) {
    sMed += 6;
  }

  if (item.peg != null && item.peg > 0 && item.peg <= 1.0) {
    sMed += 8;
    medReasons.push(`PEG hấp dẫn ${item.peg}x`);
  }

  if (item.isMtfAligned || item.mtfConsensus === "ALL_BULL" || item.mtfConsensus === "D1_W1_BULL") {
    sMed += 7;
  }
  if (isBroken) sMed -= 16;

  // -------------------------------------------------------------------------
  // 3. MED_LONG_2_6M (Trung - Dài hạn 2 - 6 tháng: Stage 2 RS, Định giá RNAV/P/B/DCF)
  // -------------------------------------------------------------------------
  let sMedLong = 50;
  const mlReasons: string[] = [];

  const rs = item.rsRating ?? 55;
  if (rs >= 80) {
    sMedLong += 14;
    mlReasons.push(`RS O'Neil dẫn dắt (${rs})`);
  } else if (rs >= 68) {
    sMedLong += 8;
  } else if (rs < 40) {
    sMedLong -= 10;
  }

  if (item.maSignal === "GOLDEN_CROSS" || item.maSignal === "BULLISH_ALIGN") {
    sMedLong += 10;
    mlReasons.push("Xu hướng Stage 2 MA20>MA50");
  } else if (isDeathCross) {
    sMedLong -= 12;
  }

  // Industry-specific valuation upside (Gordon P/B, RNAV, Consensus, Reverse DCF)
  const pbUpside =
    item.bankFairPbGordon != null && item.pb != null && item.pb > 0
      ? ((item.bankFairPbGordon - item.pb) / item.pb) * 100
      : null;
  const bestUpside = Math.max(
    item.consensusUpsidePct ?? -99,
    item.rnavUpsidePct ?? -99,
    pbUpside ?? -99,
    item.reverseDcfMarginPct != null ? item.reverseDcfMarginPct * 1.5 : -99,
  );

  if (bestUpside >= 20) {
    sMedLong += 15;
    mlReasons.push(`Biên định giá +${bestUpside.toFixed(0)}%`);
  } else if (bestUpside >= 10) {
    sMedLong += 9;
    mlReasons.push(`Chiết khấu định giá +${bestUpside.toFixed(0)}%`);
  } else if (item.pe != null && item.pe > 0 && item.pe <= 12.5 && roe >= 15) {
    sMedLong += 10;
    mlReasons.push(`P/E ${item.pe.toFixed(1)}x / ROE ${roe.toFixed(1)}%`);
  }

  if (fScore >= 7) {
    sMedLong += 8;
    mlReasons.push(`Piotroski ${fScore}/9`);
  }
  if ((item.historicalEdgeScore ?? 55) >= 68) {
    sMedLong += 6;
  }

  // -------------------------------------------------------------------------
  // 4. LONG_6M_PLUS (Dài hạn > 6 tháng: ROIC/ROIIC Moat, Forensic Cash, Fortress)
  // -------------------------------------------------------------------------
  let sLong = 50;
  const longReasons: string[] = [];

  if (roic >= 20 || roe >= 22) {
    sLong += 16;
    longReasons.push(`Con hào ROIC ${roic.toFixed(1)}% / ROE ${roe.toFixed(1)}%`);
  } else if (roic >= 15 || roe >= 17) {
    sLong += 11;
    longReasons.push(`Hiệu quả vốn ROE ${roe.toFixed(1)}%`);
  } else if (roe < 8) {
    sLong -= 12;
  }

  if (item.isSuperCompounder || (item.roiic3Y != null && item.roiic3Y >= 22)) {
    sLong += 10;
    longReasons.push(`Siêu tích lũy ROIIC ${item.roiic3Y?.toFixed(0) ?? 25}%`);
  } else if (item.isBuffettCompounder) {
    sLong += 9;
    longReasons.push("Buffett Compounder");
  }

  if (cfoToNi >= 1.1) {
    sLong += 10;
    longReasons.push(`Tiền thật CFO/LNST ${cfoToNi.toFixed(2)}x`);
  } else if (cfoToNi >= 0.85) {
    sLong += 5;
  } else if (cfoToNi < 0.5) {
    sLong -= 12;
  }

  // Forensic Sloan Accrual check
  const sloanPct =
    item.sloanAccrualRatio != null
      ? Math.abs(item.sloanAccrualRatio) <= 1.0
        ? item.sloanAccrualRatio * 100
        : item.sloanAccrualRatio
      : 3.0;
  if (sloanPct <= 5.0) sLong += 5;
  else if (sloanPct > 12.0) sLong -= 14;

  if (item.isNetCash || item.isMertonSafe || item.altmanZone === "SAFE" || item.altmanZone === "EXEMPT_FINANCIAL") {
    sLong += 8;
    if (item.isNetCash) longReasons.push("Pháo đài tiền mặt ròng");
  }

  if (item.isDividendAristocrat || divYield >= 5.0) {
    sLong += 7;
    longReasons.push(`Cổ tức tiền mặt ${divYield.toFixed(1)}%`);
  }

  if (revYoy >= 14 && niYoy >= 14) {
    sLong += 6;
  }

  const short1_2w = clampScore(sShort);
  const medium3w_2m = clampScore(sMed);
  const medLong2_6m = clampScore(sMedLong);
  const long6mPlus = clampScore(sLong);

  const pairs: Array<{ h: InvestmentHorizon; s: number }> = [
    { h: "SHORT_1_2W", s: short1_2w },
    { h: "MEDIUM_3W_2M", s: medium3w_2m },
    { h: "MED_LONG_2_6M", s: medLong2_6m },
    { h: "LONG_6M_PLUS", s: long6mPlus },
  ];
  pairs.sort((a, b) => b.s - a.s);
  const bestHorizon = pairs[0]!.h;

  return {
    short1_2w,
    medium3w_2m,
    medLong2_6m,
    long6mPlus,
    bestHorizon,
    bestHorizonVi: horizonLabelVi(bestHorizon),
    reasonsByHorizon: {
      SHORT_1_2W: shortReasons.slice(0, 2).join(" • ") || "Theo dõi xung lực thanh khoản T+",
      MEDIUM_3W_2M: medReasons.slice(0, 2).join(" • ") || "Tích lũy nền & chờ điểm uốn KQKD quý",
      MED_LONG_2_6M: mlReasons.slice(0, 2).join(" • ") || "Xu hướng Stage 2 & biên an toàn định giá",
      LONG_6M_PLUS: longReasons.slice(0, 2).join(" • ") || "Tích sản doanh nghiệp ROE/ROIC bền vững",
    },
  };
}

/**
 * Evaluates all sectors across the 4 investment horizons with liquidity-weighted & breadth-adjusted scoring.
 */
export function evaluateMultiHorizonSectorFlow(
  items: SectorHorizonFlowInputItem[],
  horizonSort: InvestmentHorizon | "COMPOSITE" = "COMPOSITE",
): {
  sectors: SectorHorizonFlowResult[];
  totalMarketTurnoverBillion: number;
  horizonLeaders: Record<InvestmentHorizon, string[]>;
  stockRankMap: Map<string, IntraSectorStockRank>;
} {
  let totalMarketTurnoverBillion = 0;
  const stockRankMap = new Map<string, IntraSectorStockRank>();

  interface BucketItem {
    raw: SectorHorizonFlowInputItem;
    turnoverBillion: number;
    scores: ReturnType<typeof evaluateStockHorizonScores>;
  }

  const sectorBuckets = new Map<string, { code: string; name: string; list: BucketItem[] }>();

  for (const raw of items) {
    const p = raw.price ?? 0;
    const v = raw.volume ?? 0;
    const stdPrice = p > 1000 ? p : p * 1000;
    const turnover =
      raw.turnoverBillion != null && Number.isFinite(raw.turnoverBillion)
        ? Math.max(0, raw.turnoverBillion)
        : Math.max(0, (stdPrice * v) / 1e9);

    totalMarketTurnoverBillion += turnover;

    const code = matchSymbolToIcbSector(raw.symbol, raw.sector);
    const icbDef = VN_ICB_SECTORS.find((s) => s.code === code);
    const secName = icbDef?.name ?? raw.sector ?? "Khác";
    if (secName === "Khác" || secName === "Others") continue;

    let bucket = sectorBuckets.get(secName);
    if (!bucket) {
      bucket = { code: icbDef?.code ?? code, name: secName, list: [] };
      sectorBuckets.set(secName, bucket);
    }

    // Reuse precomputed horizon scores if already calculated in snapshot pipeline (Zero Algorithmic Overlap)
    const pre = raw.precomputedHorizonScores;
    const scores: ReturnType<typeof evaluateStockHorizonScores> = pre
      ? {
          short1_2w: pre.short1_2w,
          medium3w_2m: pre.medium3w_2m,
          medLong2_6m: pre.medLong2_6m,
          long6mPlus: pre.long6mPlus,
          bestHorizon: pre.bestHorizon,
          bestHorizonVi: pre.bestHorizonVi,
          reasonsByHorizon: pre.reasonsByHorizon ?? {
            SHORT_1_2W: `Xung lực ngắn hạn ${pre.short1_2w}đ`,
            MEDIUM_3W_2M: `Cấu trúc trung hạn ${pre.medium3w_2m}đ`,
            MED_LONG_2_6M: `Định giá & Stage 2 ${pre.medLong2_6m}đ`,
            LONG_6M_PLUS: `Tích sản ROIC/ROE ${pre.long6mPlus}đ`,
          },
        }
      : evaluateStockHorizonScores({ ...raw, sector: secName });

    bucket.list.push({
      raw,
      turnoverBillion: turnover,
      scores,
    });
  }

  const denomTurnover = Math.max(totalMarketTurnoverBillion, 0.01);
  const results: SectorHorizonFlowResult[] = [];

  for (const [, bucket] of sectorBuckets.entries()) {
    const { code, name: sector, list } = bucket;
    if (list.length === 0) continue;

    let secTurnover = 0;
    let secForeignNet = 0;
    let sumChg = 0;
    let weightedChgSum = 0;
    let gainers = 0;
    let losers = 0;
    let unchanged = 0;

    let sumShort = 0;
    let sumMed = 0;
    let sumMedLong = 0;
    let sumLong = 0;
    let wShort = 0;
    let wMed = 0;
    let wMedLong = 0;
    let wLong = 0;
    let weightTotal = 0;

    let wVolRatioSum = 0;
    let wUpDownVolSum = 0;
    let smartMoneyCount = 0;
    let vcpTightCount = 0;
    let buyTriggerCount = 0;

    let rsRatioSum = 0;
    let rsMomSum = 0;
    let rrgCount = 0;

    for (const entry of list) {
      const chg = entry.raw.changePercent ?? 0;
      const t = entry.turnoverBillion;
      const w = Math.max(0.2, Math.sqrt(t + 0.5)); // Dampened liquidity weight prevents 1 mega-cap from distorting the entire sector

      secTurnover += t;
      secForeignNet += entry.raw.foreignNetValBillion ?? 0;
      sumChg += chg;
      weightedChgSum += chg * w;

      if (chg > 0.1) gainers++;
      else if (chg < -0.1) losers++;
      else unchanged++;

      const vr = entry.raw.volRatio20 ?? 1.0;
      const udr = entry.raw.upDownVolRatio ?? 1.0;
      wVolRatioSum += vr * w;
      wUpDownVolSum += udr * w;

      const hasSmartMoney =
        (entry.raw.smartMoneyScore ?? 50) >= 62 ||
        entry.raw.smartMoneySignal === "HEAVY_ACCUMULATION" ||
        entry.raw.smartMoneySignal === "POCKET_PIVOT" ||
        entry.raw.smartMoneySignal === "SPRING_ABSORPTION" ||
        Boolean(entry.raw.isWyckoffSpring) ||
        udr >= 1.22;
      if (hasSmartMoney) smartMoneyCount++;

      const hasVcpTight =
        Boolean(entry.raw.isTightCloses) ||
        Boolean(entry.raw.isVolumeDryUp) ||
        Boolean(entry.raw.isWyckoffLps) ||
        Boolean(entry.raw.isSqueezeOn) ||
        Boolean(entry.raw.isSqueezeFiredBull);
      if (hasVcpTight) vcpTightCount++;

      const hasBuyTrigger =
        Boolean(entry.raw.isBuyTriggerNow) ||
        entry.raw.buyZoneStatus === "AT_BUY_POINT" ||
        entry.raw.buyZoneStatus === "NEAR_BUY_POINT";
      if (hasBuyTrigger) buyTriggerCount++;

      sumShort += entry.scores.short1_2w;
      sumMed += entry.scores.medium3w_2m;
      sumMedLong += entry.scores.medLong2_6m;
      sumLong += entry.scores.long6mPlus;

      wShort += entry.scores.short1_2w * w;
      wMed += entry.scores.medium3w_2m * w;
      wMedLong += entry.scores.medLong2_6m * w;
      wLong += entry.scores.long6mPlus * w;
      weightTotal += w;

      if (entry.raw.sectorRsRatio != null && entry.raw.sectorRsMomentum != null) {
        rsRatioSum += entry.raw.sectorRsRatio;
        rsMomSum += entry.raw.sectorRsMomentum;
        rrgCount++;
      }
    }

    const n = list.length;
    const avgChange = sumChg / n;
    const vwapChange = weightTotal > 0 ? weightedChgSum / weightTotal : avgChange;
    const sharePct = (secTurnover / denomTurnover) * 100;
    const breadthRatioPct = Math.round((gainers / n) * 100);
    const weightedVolRatio20 = Number((weightTotal > 0 ? wVolRatioSum / weightTotal : 1.0).toFixed(2));
    const weightedUpDownVolRatio = Number((weightTotal > 0 ? wUpDownVolSum / weightTotal : 1.0).toFixed(2));
    const smartMoneyBreadthPct = Math.round((smartMoneyCount / n) * 100);
    const vcpTightBreadthPct = Math.round((vcpTightCount / n) * 100);

    // Combine 55% liquidity-weighted score + 45% equal-weighted breadth score + turnover/surge bonus
    const shareBonus = Math.min(8, sharePct * 0.45);
    const breadthBonus = ((breadthRatioPct - 50) / 50) * 6;
    const volIgnitionBonus =
      weightedVolRatio20 >= 1.25 && vwapChange >= 0.5
        ? Math.min(6, (weightedVolRatio20 - 1.0) * 8)
        : 0;
    const smartMoneyBonus = ((smartMoneyBreadthPct - 40) / 60) * 5;

    const short1_2w = clampScore(
      (weightTotal > 0 ? (wShort / weightTotal) * 0.55 + (sumShort / n) * 0.45 : sumShort / n) +
        shareBonus +
        breadthBonus +
        volIgnitionBonus,
    );
    const medium3w_2m = clampScore(
      (weightTotal > 0 ? (wMed / weightTotal) * 0.55 + (sumMed / n) * 0.45 : sumMed / n) +
        shareBonus * 0.6 +
        breadthBonus * 0.5 +
        smartMoneyBonus,
    );
    const medLong2_6m = clampScore(
      weightTotal > 0 ? (wMedLong / weightTotal) * 0.55 + (sumMedLong / n) * 0.45 : sumMedLong / n,
    );
    const long6mPlus = clampScore(
      weightTotal > 0 ? (wLong / weightTotal) * 0.55 + (sumLong / n) * 0.45 : sumLong / n,
    );

    const compositeFlowScore = clampScore(
      short1_2w * 0.28 + medium3w_2m * 0.28 + medLong2_6m * 0.24 + long6mPlus * 0.20,
    );

    // Institutional Sector Money-Flow Regime Classification
    let institutionalRegime: SectorInstitutionalRegime = "NEUTRAL_ROTATION";
    let institutionalRegimeVi = "Phân hóa chọn lọc nội ngành";

    if (secForeignNet >= 15 && smartMoneyBreadthPct >= 50 && compositeFlowScore >= 62) {
      institutionalRegime = "DUAL_INFLOW";
      institutionalRegimeVi = "Nội & Ngoại đồng thuận bơm tiền";
    } else if (weightedVolRatio20 >= 1.22 && vwapChange >= 0.6 && breadthRatioPct >= 55) {
      institutionalRegime = "SECTOR_VOLUME_IGNITION";
      institutionalRegimeVi = `Nổ thanh khoản kích hoạt sóng ngành (${weightedVolRatio20}x)`;
    } else if (smartMoneyBreadthPct >= 55 && weightedUpDownVolRatio >= 1.1) {
      institutionalRegime = "DOMESTIC_SMART_MONEY_LEAD";
      institutionalRegimeVi = `Cá mập & Tổ chức nội dẫn dắt (${smartMoneyBreadthPct}% mã)`;
    } else if (secForeignNet >= 12 && compositeFlowScore >= 58) {
      institutionalRegime = "FOREIGN_NET_ACCUMULATION";
      institutionalRegimeVi = `Khối ngoại gom ròng nâng đỡ (+${secForeignNet.toFixed(1)} tỷ)`;
    } else if (vcpTightBreadthPct >= 35 && weightedUpDownVolRatio >= 1.05 && compositeFlowScore >= 56) {
      institutionalRegime = "STEALTH_ACCUMULATION";
      institutionalRegimeVi = `Gom ngầm nền chặt VCP/VDU (${vcpTightBreadthPct}% mã)`;
    } else if (
      (breadthRatioPct <= 35 && (weightedVolRatio20 >= 1.12 || vwapChange <= -1.0)) ||
      (secForeignNet <= -35 && compositeFlowScore < 52)
    ) {
      institutionalRegime = "BROAD_DISTRIBUTION";
      institutionalRegimeVi = "Áp lực chốt lời / Rút dòng tiền ngắn hạn";
    }

    const flowVelocityDelta = short1_2w - medLong2_6m;
    let flowVelocitySignalVi = "Cân bằng giữa ngắn & trung hạn";
    if (short1_2w >= 66 && flowVelocityDelta >= 6) {
      flowVelocitySignalVi = `Tăng tốc bơm tiền mới (+${flowVelocityDelta}đ Ngắn/Trung-Dài)`;
    } else if (short1_2w >= 68 && medium3w_2m >= 66 && medLong2_6m >= 65) {
      flowVelocitySignalVi = "Đồng thuận dòng tiền toàn chu kỳ (1T -> 6Th)";
    } else if (flowVelocityDelta <= -8 && medLong2_6m >= 65) {
      flowVelocitySignalVi = "Nghỉ nhịp ngắn hạn trên nền xu hướng tăng";
    } else if (short1_2w < 50 && medium3w_2m < 52) {
      flowVelocitySignalVi = "Xung lực dòng tiền suy yếu";
    }

    // True RRG coordinates (from RRG engine when available, otherwise derived from relative breadth & momentum)
    const rsRatio =
      rrgCount > 0
        ? Number((rsRatioSum / rrgCount).toFixed(2))
        : Number((100 + (medLong2_6m - 52) * 0.12 + (sharePct - 5) * 0.15).toFixed(2));
    const rsMomentum =
      rrgCount > 0
        ? Number((rsMomSum / rrgCount).toFixed(2))
        : Number((100 + (short1_2w - 52) * 0.14 + vwapChange * 0.6).toFixed(2));

    let quadrant: SectorHorizonFlowResult["quadrant"] = "Lagging";
    let quadrantVi = "Tụt hậu (Lagging)";
    if (rsRatio >= 100 && rsMomentum >= 100) {
      quadrant = "Leading";
      quadrantVi = "Dẫn dắt (Leading)";
    } else if (rsRatio < 100 && rsMomentum >= 100) {
      quadrant = "Improving";
      quadrantVi = "Cải thiện (Improving)";
    } else if (rsRatio >= 100 && rsMomentum < 100) {
      quadrant = "Weakening";
      quadrantVi = "Suy yếu (Weakening)";
    }

    const sigShort = classifyHorizonFlowSignal(short1_2w);
    const sigMed = classifyHorizonFlowSignal(medium3w_2m);
    const sigMedLong = classifyHorizonFlowSignal(medLong2_6m);
    const sigLong = classifyHorizonFlowSignal(long6mPlus);

    const horizonPairs: Array<{ h: InvestmentHorizon; s: number }> = [
      { h: "SHORT_1_2W", s: short1_2w },
      { h: "MEDIUM_3W_2M", s: medium3w_2m },
      { h: "MED_LONG_2_6M", s: medLong2_6m },
      { h: "LONG_6M_PLUS", s: long6mPlus },
    ];
    horizonPairs.sort((a, b) => b.s - a.s);
    const bestHorizon = horizonPairs[0]!.h;

    let rotationPhaseVi = "Phân hóa chọn lọc";
    if (short1_2w >= 68 && medium3w_2m >= 65) {
      rotationPhaseVi = "Sóng Dẫn Dắt Đa Khung (Ngắn + Trung hạn)";
    } else if (short1_2w >= 65 && medium3w_2m < 62) {
      rotationPhaseVi = "Chân Sóng Bùng Nổ Ngắn Hạn (1–2 Tuần)";
    } else if (medium3w_2m >= 66 && short1_2w < 65) {
      rotationPhaseVi = "Tích Lũy Nền VCP & Điểm Uốn Quý (3T–2Th)";
    } else if (medLong2_6m >= 68) {
      rotationPhaseVi = "Sóng Chu Kỳ & Tái Định Giá (2–6 Tháng)";
    } else if (long6mPlus >= 70) {
      rotationPhaseVi = "Trụ Cột Tích Sản & Con Hào ROIC (> 6 Tháng)";
    }

    const pickForHorizon = (h: InvestmentHorizon): HorizonStockPick[] => {
      const getScore = (b: BucketItem) =>
        h === "SHORT_1_2W"
          ? b.scores.short1_2w
          : h === "MEDIUM_3W_2M"
            ? b.scores.medium3w_2m
            : h === "MED_LONG_2_6M"
              ? b.scores.medLong2_6m
              : b.scores.long6mPlus;

      // Filter out stocks with broken support or heavy selloff when selecting top sector leaders
      const healthy = list.filter(
        (b) => !b.raw.isBrokenSupport && (b.raw.changePercent ?? 0) > -3.5,
      );
      const pool = healthy.length > 0 ? healthy : list;

      return [...pool]
        .sort((a, b) => {
          const diff = getScore(b) - getScore(a);
          if (Math.abs(diff) >= 3) return diff;
          return b.turnoverBillion - a.turnoverBillion;
        })
        .slice(0, 3)
        .map((b) => ({
          symbol: b.raw.symbol,
          price: b.raw.price ?? 0,
          changePercent: Number((b.raw.changePercent ?? 0).toFixed(2)),
          turnoverBillion: Number(b.turnoverBillion.toFixed(2)),
          horizonScore: getScore(b),
          reasonVi: b.scores.reasonsByHorizon[h],
          buyZoneStatus: b.raw.buyZoneStatus ?? null,
          riskReward: b.raw.riskReward ?? null,
        }));
    };

    const topPicksByHorizon: Record<InvestmentHorizon, HorizonStockPick[]> = {
      SHORT_1_2W: pickForHorizon("SHORT_1_2W"),
      MEDIUM_3W_2M: pickForHorizon("MEDIUM_3W_2M"),
      MED_LONG_2_6M: pickForHorizon("MED_LONG_2_6M"),
      LONG_6M_PLUS: pickForHorizon("LONG_6M_PLUS"),
    };

    const activeTopStock =
      (horizonSort !== "COMPOSITE"
        ? topPicksByHorizon[horizonSort][0]
        : topPicksByHorizon[bestHorizon][0]) ??
      topPicksByHorizon.SHORT_1_2W[0] ??
      null;

    const sigComposite = classifyHorizonFlowSignal(compositeFlowScore);

    // Rank all stocks within this sector by composite horizon strength + liquidity to populate stockRankMap
    const rankedWithinSector = [...list].sort((a, b) => {
      const compA =
        a.scores.short1_2w * 0.30 +
        a.scores.medium3w_2m * 0.30 +
        a.scores.medLong2_6m * 0.22 +
        a.scores.long6mPlus * 0.18;
      const compB =
        b.scores.short1_2w * 0.30 +
        b.scores.medium3w_2m * 0.30 +
        b.scores.medLong2_6m * 0.22 +
        b.scores.long6mPlus * 0.18;
      const diff = compB - compA;
      if (Math.abs(diff) >= 2.5) return diff;
      return b.turnoverBillion - a.turnoverBillion;
    });

    const isSectorInflowActive =
      compositeFlowScore >= 60 ||
      short1_2w >= 64 ||
      medium3w_2m >= 64 ||
      institutionalRegime === "DUAL_INFLOW" ||
      institutionalRegime === "SECTOR_VOLUME_IGNITION" ||
      institutionalRegime === "DOMESTIC_SMART_MONEY_LEAD" ||
      institutionalRegime === "STEALTH_ACCUMULATION";

    rankedWithinSector.forEach((b, idx) => {
      const rank = idx + 1;
      const stockComp =
        b.scores.short1_2w * 0.30 +
        b.scores.medium3w_2m * 0.30 +
        b.scores.medLong2_6m * 0.22 +
        b.scores.long6mPlus * 0.18;
      const isLeader =
        isSectorInflowActive &&
        rank <= Math.min(4, Math.max(2, Math.ceil(n * 0.35))) &&
        !b.raw.isBrokenSupport &&
        stockComp >= 58;

      stockRankMap.set(b.raw.symbol.toUpperCase(), {
        symbol: b.raw.symbol.toUpperCase(),
        sector,
        sectorCode: code,
        rankInSector: rank,
        isSectorFlowLeader: isLeader,
        sectorFlowScore: compositeFlowScore,
        sectorShortFlowScore: short1_2w,
        sectorMediumFlowScore: medium3w_2m,
        sectorMedLongFlowScore: medLong2_6m,
        sectorLongFlowScore: long6mPlus,
        sectorFlowSignal: sigComposite.signal,
        sectorFlowSignalVi: sigComposite.labelVi,
        sectorInstitutionalRegime: institutionalRegime,
        sectorInstitutionalRegimeVi: institutionalRegimeVi,
        sectorVolSurgeRatio: weightedVolRatio20,
        sectorSmartMoneyBreadthPct: smartMoneyBreadthPct,
      });
    });

    results.push({
      sectorCode: code,
      sector,
      totalTurnoverBillion: Number(secTurnover.toFixed(2)),
      turnoverSharePct: Number(sharePct.toFixed(2)),
      foreignNetValBillion: Number(secForeignNet.toFixed(2)),
      avgChangePercent: Number(avgChange.toFixed(2)),
      vwapChangePercent: Number(vwapChange.toFixed(2)),
      gainersCount: gainers,
      losersCount: losers,
      unchangedCount: unchanged,
      totalStocksCount: n,
      breadthRatioPct,
      weightedVolRatio20,
      weightedUpDownVolRatio,
      smartMoneyBreadthPct,
      vcpTightBreadthPct,
      buyTriggerStocksCount: buyTriggerCount,
      institutionalRegime,
      institutionalRegimeVi,
      flowVelocityDelta,
      flowVelocitySignalVi,
      quadrant,
      quadrantVi,
      rsRatio,
      rsMomentum,
      horizonScores: {
        short1_2w,
        medium3w_2m,
        medLong2_6m,
        long6mPlus,
        compositeFlowScore,
      },
      horizonSignals: {
        short1_2w: sigShort.signal,
        short1_2wVi: sigShort.labelVi,
        medium3w_2m: sigMed.signal,
        medium3w_2mVi: sigMed.labelVi,
        medLong2_6m: sigMedLong.signal,
        medLong2_6mVi: sigMedLong.labelVi,
        long6mPlus: sigLong.signal,
        long6mPlusVi: sigLong.labelVi,
      },
      bestHorizon,
      bestHorizonVi: horizonLabelVi(bestHorizon),
      rotationPhaseVi,
      thesisByHorizonVi: {
        SHORT_1_2W: `${sigShort.labelVi} (${short1_2w}đ) • ${institutionalRegimeVi} • Vol ${weightedVolRatio20}x, độ rộng ${breadthRatioPct}%`,
        MEDIUM_3W_2M: `${sigMed.labelVi} (${medium3w_2m}đ) • RRG ${quadrantVi} (Mom ${rsMomentum}) • Cá mập ${smartMoneyBreadthPct}% mã`,
        MED_LONG_2_6M: `${sigMedLong.labelVi} (${medLong2_6m}đ) • RS-Ratio ${rsRatio} • Nền VCP/LPS ${vcpTightBreadthPct}% mã`,
        LONG_6M_PLUS: `${sigLong.labelVi} (${long6mPlus}đ) • Hội tụ ROIC/ROE, chất lượng tiền mặt CFO & sức bền BCTC`,
      },
      topStock: activeTopStock,
      topPicksByHorizon,
    });
  }

  results.sort((a, b) => {
    if (horizonSort === "SHORT_1_2W") return b.horizonScores.short1_2w - a.horizonScores.short1_2w;
    if (horizonSort === "MEDIUM_3W_2M") return b.horizonScores.medium3w_2m - a.horizonScores.medium3w_2m;
    if (horizonSort === "MED_LONG_2_6M") return b.horizonScores.medLong2_6m - a.horizonScores.medLong2_6m;
    if (horizonSort === "LONG_6M_PLUS") return b.horizonScores.long6mPlus - a.horizonScores.long6mPlus;
    return b.horizonScores.compositeFlowScore - a.horizonScores.compositeFlowScore;
  });

  const topSectorsFor = (h: InvestmentHorizon) =>
    [...results]
      .sort((a, b) => {
        const sA =
          h === "SHORT_1_2W"
            ? a.horizonScores.short1_2w
            : h === "MEDIUM_3W_2M"
              ? a.horizonScores.medium3w_2m
              : h === "MED_LONG_2_6M"
                ? a.horizonScores.medLong2_6m
                : a.horizonScores.long6mPlus;
        const sB =
          h === "SHORT_1_2W"
            ? b.horizonScores.short1_2w
            : h === "MEDIUM_3W_2M"
              ? b.horizonScores.medium3w_2m
              : h === "MED_LONG_2_6M"
                ? b.horizonScores.medLong2_6m
                : b.horizonScores.long6mPlus;
        return sB - sA;
      })
      .slice(0, 4)
      .map((s) => s.sector);

  return {
    sectors: results,
    totalMarketTurnoverBillion: Number(totalMarketTurnoverBillion.toFixed(2)),
    horizonLeaders: {
      SHORT_1_2W: topSectorsFor("SHORT_1_2W"),
      MEDIUM_3W_2M: topSectorsFor("MEDIUM_3W_2M"),
      MED_LONG_2_6M: topSectorsFor("MED_LONG_2_6M"),
      LONG_6M_PLUS: topSectorsFor("LONG_6M_PLUS"),
    },
    stockRankMap,
  };
}
