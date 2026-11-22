import type { OhlcvBar } from "../types";
import type { PrecisionTradeSetup, SetupGrade } from "./fx-crypto-precision-engine";
import type { ExternalLiquidityMagnet } from "./ict-smc-liquidity-engine";

export type AssetTier = "A" | "B" | "C" | "EXCLUDED";
export type VolatilityRegime = "LOW_VOLATILITY" | "NORMAL" | "HIGH_VOLATILITY" | "EXTREME_VOLATILITY";
export type MarketRegime = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "CHAOTIC";
export type ScalpDirection = "BUY" | "SELL" | "NONE";
export type SetupStatus =
  | "ACTIVE"
  | "AWAITING_M5_BREAKOUT"
  | "AWAITING_M1_RETEST"
  | "TRIGGERED"
  | "INVALIDATED"
  | "EXPIRED"
  | "FILTERED_OUT"
  | "NO_SETUP";

export interface ScalpSetup {
  strategy: "A" | "B" | "C";
  direction: ScalpDirection;
  status: SetupStatus;
  grade?: SetupGrade;
  strength: number;
  probability?: number | null;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  riskReward: number | null;
  invalidation: number | null;
  entryZone: [number, number] | null;
  rectangle?: { top: number; bottom: number } | null;
  evidence: string[];
  riskNotes: string[];
}

export interface AssetFilterResult {
  eligible: boolean;
  tier: AssetTier;
  reasons: string[];
  spreadOk: boolean;
  volumeRatio: number | null;
  dataQualityOk: boolean;
}

export interface RegimeSnapshot {
  volatility: VolatilityRegime;
  market: MarketRegime;
  atrPct: number | null;
  atrRatio: number | null;
  evidence: string[];
}

/** Original fields required; v2 fields optional for backward compatibility */
export interface ScalpSignal {
  timeframe: string;
  direction: "watch-long" | "watch-short" | "neutral";
  strength: number;
  score: number;
  last: number;
  vwap: number | null;
  vwapDistPct: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi7: number | null;
  atr: number | null;
  atrPct: number | null;
  momentum: { bars3: number | null; bars6: number | null };
  volume: { ratioVsMedian: number | null; spike: boolean };
  entryZone: [number, number] | null;
  invalidation: number | null;
  micro: { support: number[]; resistance: number[] };
  riskNotes: string[];
  evidence: string[];
  symbol?: string;
  filter?: AssetFilterResult;
  regime?: RegimeSnapshot;
  activeSetups?: ScalpSetup[];
  primarySetup?: ScalpSetup | null;
  moduleBStatus?: "AVAILABLE" | "ORDER_FLOW_UNAVAILABLE";
  precision?: PrecisionTradeSetup;
  probability?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  context?: {
    fundingRate: number | null;
    openInterest: number | null;
    quoteVolume24h: number | null;
  };
}

export interface ScalpAnalyzeInput {
  symbol: string;
  barsM15: OhlcvBar[];
  barsM5: OhlcvBar[];
  barsM1?: OhlcvBar[] | null;
  barsH1?: OhlcvBar[] | null;
  quoteVolume24h?: number | null;
  fundingRate?: number | null;
  openInterest?: number | null;
  spreadPct?: number | null;
  orderBookImbalance?: number | null;
  flowIntensityIndex?: number | null;
  absorptionType?: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION" | "NONE" | null;
  volumeDeltaDivergence?: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" | null;
  liquidationClusterAligned?: "LONG_SQUEEZE_UP" | "SHORT_SQUEEZE_UP" | "LONG_FLUSH_DOWN" | "BALANCED" | null;
  externalMagnets?: ExternalLiquidityMagnet[] | null;
  micropriceSkewBps?: number | null;
  spoofingOrAbsorptionState?:
    | "BULLISH_ICEBERG_ABSORPTION"
    | "BEARISH_ICEBERG_ABSORPTION"
    | "BID_SPOOFING_RISK"
    | "ASK_SPOOFING_RISK"
    | "CLEAN_BOOK"
    | null;
  vpinToxicity?: number | null;
  isLockout?: boolean;
  lockoutReason?: string | null;
}
