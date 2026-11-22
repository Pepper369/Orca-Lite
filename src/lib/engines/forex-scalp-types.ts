import type { OhlcvBar } from "../types";
import type { PrecisionTradeSetup, SetupGrade } from "./fx-crypto-precision-engine";

export type ForexTier = "A" | "B" | "C" | "EXCLUDED";
export type ForexVolatilityRegime = "LOW_VOLATILITY" | "NORMAL" | "HIGH_VOLATILITY" | "EXTREME_VOLATILITY";
export type ForexMarketRegime = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "CHAOTIC";
export type ForexScalpDirection = "BUY" | "SELL" | "NONE";
export type ForexSetupStatus =
  | "ACTIVE"
  | "AWAITING_M5_BREAKOUT"
  | "AWAITING_M1_RETEST"
  | "TRIGGERED"
  | "INVALIDATED"
  | "EXPIRED"
  | "FILTERED_OUT"
  | "NO_SETUP";

export interface ForexScalpSetup {
  strategy: "A" | "B" | "C";
  direction: ForexScalpDirection;
  status: ForexSetupStatus;
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
  riskReward1?: number | null;
  riskReward2?: number | null;
  riskReward3?: number | null;
  invalidation: number | null;
  entryZone: [number, number] | null;
  stopPips: number | null;
  rectangle?: { top: number; bottom: number } | null;
  evidence: string[];
  riskNotes: string[];
}

export interface ForexFilterResult {
  eligible: boolean;
  tier: ForexTier;
  spreadOk: boolean;
  sessionOk: boolean;
  newsOk: boolean;
  spreadPips: number | null;
  maxSpreadPips: number;
  sessionLabel: string;
  reasons: string[];
}

export interface ForexRegimeSnapshot {
  volatility: ForexVolatilityRegime;
  market: ForexMarketRegime;
  atrPips: number | null;
  atrRatio: number | null;
  evidence: string[];
}

export interface ForexScalpSignal {
  pair: string;
  timeframe: string;
  direction: "watch-long" | "watch-short" | "neutral";
  strength: number;
  score: number;
  last: number;
  pipSize: number;
  atr: number | null;
  atrPips: number | null;
  entryZone: [number, number] | null;
  invalidation: number | null;
  micro: { support: number[]; resistance: number[] };
  riskNotes: string[];
  evidence: string[];
  filter: ForexFilterResult;
  regime: ForexRegimeSnapshot;
  probability?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  activeSetups: ForexScalpSetup[];
  primarySetup: ForexScalpSetup | null;
  moduleBStatus: "AVAILABLE" | "ORDER_FLOW_UNAVAILABLE";
  precision?: PrecisionTradeSetup;
  flowMetrics?: {
    fii: number;
    absorption: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION" | "NONE";
    cvdDivergence: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE";
    domImbalance: number;
    cmeTicker?: string;
    vpoc?: number | null;
    vwap?: number | null;
  };
  riskHint: {
    recommendedRiskPct: number;
    stopPips: number | null;
    note: string;
  };
}

export interface ForexScalpInput {
  pair: string;
  barsM15: OhlcvBar[];
  barsM5: OhlcvBar[];
  barsM1?: OhlcvBar[] | null;
  barsH1?: OhlcvBar[] | null;
  bid?: number | null;
  ask?: number | null;
  spreadPips?: number | null;
  nowMs?: number;
  calendarEvents?: { name?: string; time?: string; currency?: string; importance?: string }[];
  csmBaseMinusQuote?: number | null;
  triangularParityAligned?: "CONFIRMED" | "DIVERGENT_FAKEOUT" | "NEUTRAL" | null;
  orderBookImbalance?: number | null;
  flowIntensityIndex?: number | null;
  absorptionType?: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION" | "NONE" | null;
  volumeDeltaDivergence?: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" | null;
}
