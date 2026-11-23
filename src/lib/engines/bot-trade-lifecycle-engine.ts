/**
 * Bot Trade Lifecycle & Dynamic Exit Engine (Freqtrade Parity)
 *
 * Implements battle-tested production trade lifecycle rules from `freqtrade/freqtrade`:
 * 1. Minimal ROI Table (Time-Decay Target Profit: lower profit threshold required as holding duration increases)
 * 2. Positive Trailing Stoploss with Profit Offset (monotonic ratchet locking in peak profits)
 * 3. Stagnant Trade Timeout Guard (frees up margin and capital from dormant trades)
 */

import { getAssetPipSize, roundPrice } from "./asset-precision";

// ============================================================================
// 1. Dynamic Time-Decay ROI (Minimal ROI Table)
// ============================================================================

export interface RoiDecayTier {
  /** Holding duration threshold in minutes */
  afterMinutes: number;
  /** Minimum target profit in R units required for immediate exit */
  minTargetR: number;
  /** Minimum target profit in percentage (fallback if R is undefined) */
  minTargetPct: number;
}

/**
 * Standard Institutional Time-Decay ROI Schedule:
 * - Fresh entries (< 20m): Aim for full target (2.0R / 2.5%)
 * - Early phase (20 - 60m): Take profit at 1.0R / 1.2%
 * - Mid phase (60 - 180m): Secure profit at 0.5R / 0.6%
 * - Mature phase (180 - 360m): Settle for micro profit 0.2R / 0.25%
 * - Stagnant (> 360m / 6 hours): Exit at breakeven (>= 0R) to free up margin
 */
export const DEFAULT_ROI_SCHEDULE: RoiDecayTier[] = [
  { afterMinutes: 0, minTargetR: 2.0, minTargetPct: 2.5 },
  { afterMinutes: 20, minTargetR: 1.0, minTargetPct: 1.2 },
  { afterMinutes: 60, minTargetR: 0.5, minTargetPct: 0.6 },
  { afterMinutes: 180, minTargetR: 0.2, minTargetPct: 0.25 },
  { afterMinutes: 360, minTargetR: 0.0, minTargetPct: 0.05 },
];

export interface EvaluateRoiDecayParams {
  direction: "BUY" | "SELL";
  entryPrice: number;
  markPrice: number;
  stopLossPrice?: number;
  openedTimestampMs: number;
  currentTimestampMs?: number;
  customSchedule?: RoiDecayTier[];
}

export interface EvaluateRoiDecayResult {
  shouldExit: boolean;
  holdingMinutes: number;
  currentProfitR: number;
  currentProfitPct: number;
  requiredTargetR: number;
  tierApplied: RoiDecayTier;
  exitReason: string;
}

/**
 * Evaluates whether an open trade qualifies for a time-decay ROI exit (Freqtrade Parity).
 */
export function evaluateDynamicTimeDecayRoiExit(params: EvaluateRoiDecayParams): EvaluateRoiDecayResult {
  const {
    direction,
    entryPrice,
    markPrice,
    stopLossPrice,
    openedTimestampMs,
    currentTimestampMs = Date.now(),
    customSchedule = DEFAULT_ROI_SCHEDULE,
  } = params;

  const holdingMinutes = Math.max(0, (currentTimestampMs - openedTimestampMs) / 60000);
  const isBuy = direction === "BUY";

  const rawProfitPts = isBuy ? markPrice - entryPrice : entryPrice - markPrice;
  const currentProfitPct = Number(((rawProfitPts / Math.max(1e-8, entryPrice)) * 100).toFixed(3));

  // Determine R multiplier
  const riskDist = stopLossPrice && stopLossPrice > 0 ? Math.abs(entryPrice - stopLossPrice) : entryPrice * 0.01;
  const currentProfitR = Number((rawProfitPts / Math.max(1e-8, riskDist)).toFixed(3));

  // Match current holding duration against ROI schedule (sorted descending by afterMinutes)
  const effectiveSchedule = customSchedule.length > 0 ? customSchedule : DEFAULT_ROI_SCHEDULE;
  const sorted = [...effectiveSchedule].sort((a, b) => b.afterMinutes - a.afterMinutes);
  let matchedTier: RoiDecayTier = sorted[sorted.length - 1]!;

  for (const tier of sorted) {
    if (holdingMinutes >= tier.afterMinutes) {
      matchedTier = tier;
      break;
    }
  }

  // Check if current profit satisfies the tier's requirement
  const satisfiesR = currentProfitR >= matchedTier.minTargetR;
  const satisfiesPct = currentProfitPct >= matchedTier.minTargetPct;
  const shouldExit = satisfiesR || satisfiesPct;

  let exitReason = "HOLD_ACTIVE";
  if (shouldExit) {
    if (matchedTier.afterMinutes >= 360) {
      exitReason = `TIME_EXHAUSTION_EXIT (+${currentProfitR}R after ${Math.round(holdingMinutes)}m)`;
    } else {
      exitReason = `DYNAMIC_ROI_EXIT (+${currentProfitR}R >= ${matchedTier.minTargetR}R after ${Math.round(holdingMinutes)}m)`;
    }
  }

  return {
    shouldExit,
    holdingMinutes: Math.round(holdingMinutes),
    currentProfitR,
    currentProfitPct,
    requiredTargetR: matchedTier.minTargetR,
    tierApplied: matchedTier,
    exitReason,
  };
}

// ============================================================================
// 2. Positive Trailing Stoploss with Monotonic Ratchet (Freqtrade Parity)
// ============================================================================

export interface PositiveTrailingStopParams {
  symbol: string;
  assetType: "FOREX" | "CRYPTO" | "STOCK";
  direction: "BUY" | "SELL";
  entryPrice: number;
  currentStopLoss: number;
  markPrice: number;
  riskDist: number;
  peakPrice?: number;
  /** Activation hurdle in R units (e.g. 1.0R profit required before trailing activates) */
  activationOffsetR?: number;
  /** Trailing distance behind peak in R units (default 0.35R) */
  trailingDistanceR?: number;
  pipSize?: number;
}

export interface PositiveTrailingStopResult {
  isTrailingActive: boolean;
  newStopLossPrice: number;
  lockedProfitR: number;
  isImproved: boolean;
  newPeakPrice: number;
  rationaleVi: string;
}

/**
 * Calculates dynamic positive trailing stop loss (Freqtrade Parity).
 * Only activates once positive profit hurdle is crossed, locking in profit and ratcheting monotonically.
 */
export function evaluatePositiveTrailingStop(params: PositiveTrailingStopParams): PositiveTrailingStopResult {
  const {
    symbol,
    assetType,
    direction,
    entryPrice,
    currentStopLoss,
    markPrice,
    riskDist,
    peakPrice,
    activationOffsetR = 1.0,
    trailingDistanceR = 0.35,
    pipSize: rawPipSize,
  } = params;

  const pipSize =
    rawPipSize != null && Number.isFinite(rawPipSize) && rawPipSize > 0
      ? rawPipSize
      : getAssetPipSize(symbol, assetType, entryPrice);

  const isBuy = direction === "BUY";
  const currentMovePts = isBuy ? markPrice - entryPrice : entryPrice - markPrice;
  const currentProfitR = currentMovePts / Math.max(1e-8, riskDist);

  // Update highest/lowest peak price reached
  let newPeakPrice = peakPrice ?? entryPrice;
  if (isBuy) {
    if (markPrice > newPeakPrice) newPeakPrice = markPrice;
  } else {
    if (markPrice < newPeakPrice) newPeakPrice = markPrice;
  }

  const peakMovePts = isBuy ? newPeakPrice - entryPrice : entryPrice - newPeakPrice;
  const peakProfitR = peakMovePts / Math.max(1e-8, riskDist);

  // Check if positive trailing hurdle is reached
  if (peakProfitR < activationOffsetR) {
    return {
      isTrailingActive: false,
      newStopLossPrice: currentStopLoss,
      lockedProfitR: 0,
      isImproved: false,
      newPeakPrice,
      rationaleVi: `Chưa đạt ngưỡng kích hoạt Trailing Stop (+${peakProfitR.toFixed(2)}R < +${activationOffsetR.toFixed(2)}R).`,
    };
  }

  // Trailing Stop distance in price units
  const trailSpanPts = Math.max(pipSize * 2, trailingDistanceR * riskDist);
  const candidateSlRaw = isBuy ? newPeakPrice - trailSpanPts : newPeakPrice + trailSpanPts;

  // Ensure candidate SL locks in at least minimum breakeven (+fees)
  const minLockPrice = isBuy ? entryPrice + pipSize * 1.5 : entryPrice - pipSize * 1.5;
  const clampedSl = isBuy ? Math.max(minLockPrice, candidateSlRaw) : Math.min(minLockPrice, candidateSlRaw);
  const newStopLossPrice = roundPrice(clampedSl, symbol, assetType);

  // Check monotonic improvement (SL must strictly move favorably)
  const isImproved = isBuy
    ? newStopLossPrice > currentStopLoss + pipSize
    : currentStopLoss <= 0 || newStopLossPrice < currentStopLoss - pipSize;

  const lockedMovePts = isBuy ? newStopLossPrice - entryPrice : entryPrice - newStopLossPrice;
  const lockedProfitR = Number((lockedMovePts / Math.max(1e-8, riskDist)).toFixed(2));

  const rationaleVi = isImproved
    ? `Freqtrade Trailing Stop: Đỉnh lãi +${peakProfitR.toFixed(2)}R -> Dời SL ${symbol} lên ${newStopLossPrice} (Khóa chắc +${lockedProfitR}R lợi nhuận).`
    : `Trailing Stop giữ nguyên ở ${currentStopLoss} (Khóa +${lockedProfitR}R).`;

  return {
    isTrailingActive: true,
    newStopLossPrice: isImproved ? newStopLossPrice : currentStopLoss,
    lockedProfitR,
    isImproved,
    newPeakPrice,
    rationaleVi,
  };
}
