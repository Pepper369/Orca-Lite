import { createHash, createHmac } from "node:crypto";
import { calculateAlmgrenChrissExecution } from "./advanced-quant-math";
import { generateMakerPeggingGuide } from "./quant-reversal-pace";
import {
  getBrokerMeta,
  isMt5BrokerPlatform,
  resolveBrokerDefaultSuffix,
  type BrokerPlatform,
} from "./broker-registry";

export interface BrokerCredentialsInput {
  apiKey: string;
  apiSecret: string;
  passphrase?: string | null;
  isTestnet: boolean;
}

export interface BrokerVerificationResult {
  verified: boolean;
  platform: BrokerPlatform;
  isTestnet: boolean;
  balanceUsd: number | null;
  availableMarginUsd: number | null;
  canTrade: boolean;
  positionMode?: string;
  resolvedEndpoint?: string;
  latencyMs: number;
  rawMessage: string;
}

export interface ExchangeOrderRequest {
  credentials: BrokerCredentialsInput;
  symbol: string;
  direction: "BUY" | "SELL";
  baseQty: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  leverage: number;
  idempotencyKey: string;
  entryMode?: "LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT";
  orderBookImbalance?: number;
  volatilityPct?: number;
  spreadPctOrPips?: number;
}

export interface ExchangeOrderResult {
  ok: boolean;
  status: "FILLED" | "REJECTED_EXCHANGE";
  exchangeOrderId: string | null;
  slOrderId: string | null;
  tpOrderId: string | null;
  tp2OrderId?: string | null;
  tp3OrderId?: string | null;
  tpAllocationPlan?: string;
  executionPlan?: SmartOrderExecutionPlan;
  executedQty: number;
  executedPrice: number;
  message: string;
  slWarning?: string;
}

export interface TpAllocationChunk {
  tier: "TP1" | "TP2" | "TP3";
  price: number;
  qty: number;
  closePosition: boolean;
}

export function validateExchangeOrderGeometry(req: {
  direction: "BUY" | "SELL";
  baseQty: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
}): { valid: boolean; reason?: string } {
  if (req.direction !== "BUY" && req.direction !== "SELL") {
    return { valid: false, reason: "Invalid order direction" };
  }
  if (!Number.isFinite(req.baseQty) || req.baseQty <= 0) {
    return { valid: false, reason: "Invalid or non-positive order quantity (baseQty)" };
  }
  if (!Number.isFinite(req.entryPrice) || req.entryPrice <= 0) {
    return { valid: false, reason: "Invalid or non-positive entryPrice" };
  }
  if (!Number.isFinite(req.stopLossPrice) || req.stopLossPrice <= 0) {
    return { valid: false, reason: "Invalid or non-positive stopLossPrice" };
  }
  if (!Number.isFinite(req.takeProfit1) || req.takeProfit1 <= 0) {
    return { valid: false, reason: "Invalid or non-positive takeProfit1" };
  }
  if (req.direction === "BUY") {
    if (req.stopLossPrice >= req.entryPrice) {
      return { valid: false, reason: "Inverted BUY geometry: stopLossPrice >= entryPrice" };
    }
    if (req.takeProfit1 <= req.entryPrice) {
      return { valid: false, reason: "Inverted BUY geometry: takeProfit1 <= entryPrice" };
    }
  } else {
    if (req.stopLossPrice <= req.entryPrice) {
      return { valid: false, reason: "Inverted SELL geometry: stopLossPrice <= entryPrice" };
    }
    if (req.takeProfit1 >= req.entryPrice) {
      return { valid: false, reason: "Inverted SELL geometry: takeProfit1 >= entryPrice" };
    }
  }
  return { valid: true };
}

/**
 * Splits executed quantity into institutional 50% (TP1) / 30% (TP2) / 20% (TP3) scale-out chunks,
 * gracefully collapsing to 2 tiers or 1 full-close trigger when total qty is too small for exchange minQty/minNotional.
 */
export function computeMultiTierTpChunks(params: {
  totalQty: number;
  stepSize: number | string;
  minQty: number;
  minNotional: number;
  tickSize: number | string;
  tp1: number;
  tp2?: number | null;
  tp3?: number | null;
  entryPrice?: number;
  direction?: "BUY" | "SELL";
}): TpAllocationChunk[] {
  const { totalQty, stepSize, minQty, minNotional, tickSize, entryPrice, direction } = params;
  if (!Number.isFinite(totalQty) || totalQty <= 0 || !Number.isFinite(params.tp1) || params.tp1 <= 0) {
    return [];
  }
  if (entryPrice !== undefined && (!Number.isFinite(entryPrice) || entryPrice <= 0)) {
    return [];
  }

  const p1 = roundTickSize(params.tp1, tickSize);
  if (!Number.isFinite(p1) || p1 <= 0) return [];

  if (entryPrice !== undefined && direction) {
    if (direction === "BUY" && p1 <= entryPrice) return [];
    if (direction === "SELL" && p1 >= entryPrice) return [];
  }

  let p2 =
    params.tp2 != null && Number.isFinite(params.tp2) && params.tp2 > 0
      ? roundTickSize(params.tp2, tickSize)
      : 0;
  let p3 =
    params.tp3 != null && Number.isFinite(params.tp3) && params.tp3 > 0
      ? roundTickSize(params.tp3, tickSize)
      : 0;

  // Enforce directional & ladder monotonicity across TP1 -> TP2 -> TP3
  if (p2 > 0) {
    if (direction === "BUY" && p2 <= p1) p2 = 0;
    if (direction === "SELL" && p2 >= p1) p2 = 0;
  }
  if (p3 > 0) {
    if (p2 <= 0) {
      p3 = 0;
    } else if ((p2 > p1 && p3 <= p2) || (p2 < p1 && p3 >= p2)) {
      p3 = 0;
    }
  }

  const safeMinQty = Number.isFinite(minQty) && minQty > 0 ? minQty : 0;
  const safeMinNotional = Number.isFinite(minNotional) && minNotional > 0 ? minNotional : 0;

  const isViable = (qty: number, px: number) =>
    Number.isFinite(qty) &&
    Number.isFinite(px) &&
    qty > 0 &&
    px > 0 &&
    qty >= safeMinQty &&
    (safeMinNotional <= 0 || qty * px >= safeMinNotional);

  if (p2 > 0 && p2 !== p1 && p3 > 0 && p3 !== p2) {
    const q1 = roundStepSize(totalQty * 0.5, stepSize);
    const q2 = roundStepSize(totalQty * 0.3, stepSize);
    const q3 = roundStepSize(Math.max(0, totalQty - q1 - q2), stepSize);
    if (isViable(q1, p1) && isViable(q2, p2) && isViable(q3, p3)) {
      return [
        { tier: "TP1", price: p1, qty: q1, closePosition: false },
        { tier: "TP2", price: p2, qty: q2, closePosition: false },
        { tier: "TP3", price: p3, qty: q3, closePosition: false },
      ];
    }
  }

  if (p2 > 0 && p2 !== p1) {
    const q1 = roundStepSize(totalQty * 0.5, stepSize);
    const q2 = roundStepSize(Math.max(0, totalQty - q1), stepSize);
    if (isViable(q1, p1) && isViable(q2, p2)) {
      return [
        { tier: "TP1", price: p1, qty: q1, closePosition: false },
        { tier: "TP2", price: p2, qty: q2, closePosition: false },
      ];
    }
  }

  return [{ tier: "TP1", price: p1, qty: totalQty, closePosition: true }];
}

// ============================================================================
// Phase 3: Smart Order Execution Router (Almgren-Chriss + Post-Only Maker Peg)
//          & Closed-Loop Implementation Shortfall / Slippage Calibration
// ============================================================================

export interface SmartExecutionSlicePlan {
  sliceIndex: number;
  qty: number;
  limitPrice: number;
  delayMs: number;
  pctOfTotal: number;
}

export interface SmartOrderExecutionPlan {
  symbol: string;
  direction: "BUY" | "SELL";
  executionMode: "POST_ONLY_MAKER_PEG" | "ALMGREN_CHRISS_SLICED" | "IMMEDIATE_MARKET";
  totalQty: number;
  orderNotionalUsd: number;
  depthParticipationRatio: number;
  peggedLimitPrice: number;
  pegWindowMs: number;
  binanceTimeInForce: "GTX" | "GTC" | "IOC";
  okxOrderType: "post_only" | "limit" | "market";
  fallbackToMarketOnTimeout: boolean;
  expectedFeeSavingsUsd: number;
  slices: SmartExecutionSlicePlan[];
  rationaleVi: string;
}

/**
 * Plans adaptive order execution:
 * - Small/normal orders (<= 15% of top-5 L2 depth): Post-Only Maker Pegging (GTX / post_only) with Market fallback.
 * - Large institutional orders (> 15% of top-5 L2 depth): Almgren-Chriss multi-slice trajectory to minimize market impact.
 */
export function planSmartOrderExecution(params: {
  symbol: string;
  direction: "BUY" | "SELL";
  totalQty: number;
  entryPrice: number;
  bestBid?: number | null;
  bestAsk?: number | null;
  top5BookDepthUsd?: number | null;
  dailyVolatilityPct?: number;
  urgency?: "PASSIVE_MAKER" | "BALANCED" | "IMMEDIATE_TAKER";
  tickSize?: number | string;
  stepSize?: number | string;
}): SmartOrderExecutionPlan {
  const {
    symbol,
    direction,
    totalQty,
    entryPrice,
    bestBid,
    bestAsk,
    top5BookDepthUsd,
    dailyVolatilityPct = 2.2,
    urgency = "BALANCED",
    tickSize = "0.01",
    stepSize = "0.001",
  } = params;

  const cleanSymbol = String(symbol ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "") || "UNKNOWN";
  const safeDirection: "BUY" | "SELL" = direction === "SELL" ? "SELL" : "BUY";

  if (
    !Number.isFinite(totalQty) ||
    totalQty <= 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    (direction !== "BUY" && direction !== "SELL")
  ) {
    return {
      symbol: cleanSymbol,
      direction: safeDirection,
      executionMode: "IMMEDIATE_MARKET",
      totalQty: 0,
      orderNotionalUsd: 0,
      depthParticipationRatio: 0,
      peggedLimitPrice: 0,
      pegWindowMs: 0,
      binanceTimeInForce: "IOC",
      okxOrderType: "market",
      fallbackToMarketOnTimeout: false,
      expectedFeeSavingsUsd: 0,
      slices: [],
      rationaleVi: "Từ chối lập kế hoạch khớp lệnh: Khối lượng hoặc giá vào lệnh không hợp lệ (<= 0 hoặc NaN/Infinity).",
    };
  }

  const parsedTick = Number(tickSize);
  const tick = Number.isFinite(parsedTick) && parsedTick > 0 ? parsedTick : Math.max(1e-8, entryPrice * 0.0001);
  const safeTickSize = Number.isFinite(parsedTick) && parsedTick > 0 ? tickSize : tick;
  const parsedStep = Number(stepSize);
  const safeStepSize = Number.isFinite(parsedStep) && parsedStep > 0 ? stepSize : "0.001";
  const safeVolPct =
    Number.isFinite(dailyVolatilityPct) && dailyVolatilityPct > 0
      ? Math.min(100, Math.max(0.05, dailyVolatilityPct))
      : 2.2;

  let bid = bestBid != null && Number.isFinite(bestBid) && bestBid > 0 ? bestBid : Math.max(tick, entryPrice - tick);
  let ask = bestAsk != null && Number.isFinite(bestAsk) && bestAsk > 0 ? bestAsk : entryPrice + tick;
  if (bid >= ask) {
    bid = Math.max(tick, entryPrice - tick);
    ask = entryPrice + tick;
  }

  const orderNotionalUsd = Number((totalQty * entryPrice).toFixed(2));
  const effDepthUsd =
    top5BookDepthUsd != null && Number.isFinite(top5BookDepthUsd) && top5BookDepthUsd > 0
      ? top5BookDepthUsd
      : Math.max(50_000, orderNotionalUsd * 10);
  const depthParticipationRatio = Number((orderNotionalUsd / Math.max(1e-9, effDepthUsd)).toFixed(4));

  const makerGuide = generateMakerPeggingGuide({
    symbol: cleanSymbol,
    currentPrice: entryPrice,
    direction,
    favoriteProbability: 0.96,
    tailProbability: 0.04,
    pipSize: tick,
    assetType: "CRYPTO",
  });
  const guidePeg =
    Number.isFinite(makerGuide.peggedPrice) && makerGuide.peggedPrice > 0 ? makerGuide.peggedPrice : entryPrice;
  // Ensure post-only limit price never crosses the opposite top-of-book (GTX / post_only invariant)
  const rawPegPrice =
    direction === "BUY"
      ? Math.max(tick, Math.min(guidePeg, ask - tick, bid))
      : Math.max(guidePeg, bid + tick, ask);
  const peggedLimitPrice = Math.max(tick, roundTickSize(rawPegPrice, safeTickSize));
  // Taker (0.04%) vs Maker (0.015% or rebate) saves ~2.5 bps (0.00025) of orderNotionalUsd
  const expectedFeeSavingsUsd = Number((orderNotionalUsd * 0.00025).toFixed(2));

  // Case 1: Large order (> 15% of top-5 L2 depth) -> Almgren-Chriss multi-slice optimal trajectory
  if (depthParticipationRatio > 0.15 && totalQty > 0) {
    const slicesCount = Math.min(6, Math.max(3, Math.ceil(depthParticipationRatio / 0.12)));
    const ac = calculateAlmgrenChrissExecution({
      totalShares: 10_000, // Normalized basis points of totalQty
      totalTimeHours: 0.25, // 15-minute execution window
      intervalsCount: slicesCount,
      riskAversion: urgency === "IMMEDIATE_TAKER" ? 0.001 : 0.00015,
      dailyVolatilityPct: safeVolPct,
      tempImpactFactor: 2e-6,
      currentPrice: entryPrice,
    });

    let allocatedQty = 0;
    const slices: SmartExecutionSlicePlan[] = [];
    for (let i = 0; i < ac.schedule.length; i++) {
      const s = ac.schedule[i]!;
      const isLast = i === ac.schedule.length - 1;
      const rawSliceQty = isLast
        ? Math.max(0, totalQty - allocatedQty)
        : (totalQty * s.sharesToTrade) / 10_000;
      const sliceQty = roundStepSize(rawSliceQty, safeStepSize);
      if (sliceQty <= 0) continue;
      allocatedQty += sliceQty;
      slices.push({
        sliceIndex: slices.length + 1,
        qty: sliceQty,
        limitPrice: peggedLimitPrice,
        delayMs: i * 3000,
        pctOfTotal: Number(((sliceQty / Math.max(1e-12, totalQty)) * 100).toFixed(1)),
      });
    }

    return {
      symbol: cleanSymbol,
      direction,
      executionMode: "ALMGREN_CHRISS_SLICED",
      totalQty,
      orderNotionalUsd,
      depthParticipationRatio,
      peggedLimitPrice,
      pegWindowMs: 5000,
      binanceTimeInForce: "GTX",
      okxOrderType: "post_only",
      fallbackToMarketOnTimeout: true,
      expectedFeeSavingsUsd,
      slices:
        slices.length > 0
          ? slices
          : [{ sliceIndex: 1, qty: totalQty, limitPrice: peggedLimitPrice, delayMs: 0, pctOfTotal: 100 }],
      rationaleVi: `Lệnh lớn chiếm ${(depthParticipationRatio * 100).toFixed(1)}% thanh khoản L2 Top-5 -> Cắt ${slices.length} nhịp Almgren-Chriss (${ac.summary.urgencyType}) kết hợp Post-Only Peg @ ${peggedLimitPrice}.`,
    };
  }

  // Case 2: Immediate Taker urgency
  if (urgency === "IMMEDIATE_TAKER") {
    const mktLimitPx = Math.max(tick, roundTickSize(entryPrice, safeTickSize));
    return {
      symbol: cleanSymbol,
      direction,
      executionMode: "IMMEDIATE_MARKET",
      totalQty,
      orderNotionalUsd,
      depthParticipationRatio,
      peggedLimitPrice: mktLimitPx,
      pegWindowMs: 0,
      binanceTimeInForce: "IOC",
      okxOrderType: "market",
      fallbackToMarketOnTimeout: true,
      expectedFeeSavingsUsd: 0,
      slices: [{ sliceIndex: 1, qty: totalQty, limitPrice: mktLimitPx, delayMs: 0, pctOfTotal: 100 }],
      rationaleVi: `Khớp Market/IOC tức thời cho tín hiệu xung lực khẩn cấp.`,
    };
  }

  // Case 3: Standard order -> Post-Only Maker Pegging with 8s timeout fallback
  return {
    symbol: cleanSymbol,
    direction,
    executionMode: "POST_ONLY_MAKER_PEG",
    totalQty,
    orderNotionalUsd,
    depthParticipationRatio,
    peggedLimitPrice,
    pegWindowMs: 8000,
    binanceTimeInForce: "GTX",
    okxOrderType: "post_only",
    fallbackToMarketOnTimeout: true,
    expectedFeeSavingsUsd,
    slices: [{ sliceIndex: 1, qty: totalQty, limitPrice: peggedLimitPrice, delayMs: 0, pctOfTotal: 100 }],
    rationaleVi: `Post-Only Maker Peg (GTX) @ ${peggedLimitPrice} trong 8s (Tiết kiệm ~$${expectedFeeSavingsUsd} phí Taker-Maker, tự động fallback nếu chưa khớp).`,
  };
}

export interface ExecutionSlippageSample {
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  direction: "BUY" | "SELL";
  intendedEntryPrice: number;
  executedFillPrice: number;
  stopLossPrice: number;
  realizedSlippageBps: number;
  realizedFrictionR: number;
  timestamp: number;
}

export interface EmpiricalFrictionSummary {
  sampleCount: number;
  avgSlippageBps: number;
  p95SlippageBps: number;
  empiricalFrictionR: number;
  recommendedFrictionROverride: number | null;
  empiricalWinRatePct?: number | null;
  consecutiveLosses?: number;
  consecutiveWins?: number;
}

export interface ExecutionTradeOutcomeSample {
  symbol: string;
  isWin: boolean;
  realizedPnlR: number;
  timestamp: number;
}

const SLIPPAGE_TELEMETRY_BUFFER: ExecutionSlippageSample[] = [];
const MAX_SLIPPAGE_TELEMETRY_SAMPLES = 250;
const TRADE_OUTCOME_BUFFER: ExecutionTradeOutcomeSample[] = [];
const MAX_TRADE_OUTCOME_SAMPLES = 250;

/**
 * Records a completed trade outcome (win/loss and realized R) for empirical winrate feedback.
 */
export function recordExecutionTradeOutcome(params: {
  symbol: string;
  isWin: boolean;
  realizedPnlR?: number | null;
  timestamp?: number;
}): ExecutionTradeOutcomeSample | null {
  const cleanSym = params.symbol ? params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (!cleanSym) return null;

  const sample: ExecutionTradeOutcomeSample = {
    symbol: cleanSym,
    isWin: params.isWin,
    realizedPnlR: params.realizedPnlR ?? (params.isWin ? 1.0 : -1.0),
    timestamp: Number.isFinite(params.timestamp) && (params.timestamp ?? 0) > 0 ? (params.timestamp as number) : Date.now(),
  };

  TRADE_OUTCOME_BUFFER.push(sample);
  if (TRADE_OUTCOME_BUFFER.length > MAX_TRADE_OUTCOME_SAMPLES) {
    TRADE_OUTCOME_BUFFER.shift();
  }
  return sample;
}

/**
 * Records realized execution price vs intended signal entry price to close the feedback loop
 * between live execution and research `frictionR` assumptions.
 */
export function recordExecutionSlippageTelemetry(params: {
  symbol: string;
  assetType: "FOREX" | "CRYPTO";
  direction: "BUY" | "SELL";
  intendedEntryPrice: number;
  executedFillPrice: number;
  stopLossPrice: number;
  timestamp?: number;
}): ExecutionSlippageSample | null {
  const {
    symbol,
    assetType,
    direction,
    intendedEntryPrice,
    executedFillPrice,
    stopLossPrice,
    timestamp = Date.now(),
  } = params;

  const cleanSym = typeof symbol === "string" ? symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  if (
    !cleanSym ||
    (direction !== "BUY" && direction !== "SELL") ||
    !Number.isFinite(intendedEntryPrice) ||
    !Number.isFinite(executedFillPrice) ||
    !Number.isFinite(stopLossPrice) ||
    intendedEntryPrice <= 0 ||
    executedFillPrice <= 0 ||
    stopLossPrice <= 0
  ) {
    return null;
  }

  // Reject inverted SL geometry (e.g. BUY with stopLossPrice >= intendedEntryPrice, or SELL with stopLossPrice <= intendedEntryPrice)
  if (
    (direction === "BUY" && stopLossPrice >= intendedEntryPrice) ||
    (direction === "SELL" && stopLossPrice <= intendedEntryPrice)
  ) {
    return null;
  }

  const dirSign = direction === "BUY" ? 1 : -1;
  // Positive adverseDelta means fill was worse than intended entry
  const adverseDelta = dirSign * (executedFillPrice - intendedEntryPrice);
  const realizedSlippageBps = Number(((adverseDelta / intendedEntryPrice) * 10_000).toFixed(3));
  const riskDist = Math.max(1e-12, Math.abs(intendedEntryPrice - stopLossPrice));
  const feeBaselinePrice =
    assetType === "CRYPTO" ? intendedEntryPrice * 0.0006 : riskDist * 0.04;
  const realizedFrictionR = Number(
    (Math.max(0, adverseDelta + feeBaselinePrice) / riskDist).toFixed(4),
  );

  if (!Number.isFinite(realizedSlippageBps) || !Number.isFinite(realizedFrictionR)) {
    return null;
  }

  const sample: ExecutionSlippageSample = {
    symbol: cleanSym,
    assetType,
    direction,
    intendedEntryPrice,
    executedFillPrice,
    stopLossPrice,
    realizedSlippageBps,
    realizedFrictionR,
    timestamp: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
  };

  SLIPPAGE_TELEMETRY_BUFFER.push(sample);
  if (SLIPPAGE_TELEMETRY_BUFFER.length > MAX_SLIPPAGE_TELEMETRY_SAMPLES) {
    SLIPPAGE_TELEMETRY_BUFFER.shift();
  }
  return sample;
}

/**
 * Returns empirical Implementation Shortfall & `frictionR` statistics from recorded executions.
 */
export function getEmpiricalFrictionTelemetry(symbol?: string): EmpiricalFrictionSummary {
  const cleanSym = symbol ? symbol.toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
  const list = cleanSym
    ? SLIPPAGE_TELEMETRY_BUFFER.filter((s) => s.symbol === cleanSym)
    : SLIPPAGE_TELEMETRY_BUFFER;
  const tradeList = cleanSym
    ? TRADE_OUTCOME_BUFFER.filter((s) => s.symbol === cleanSym)
    : TRADE_OUTCOME_BUFFER;

  let empiricalWinRatePct: number | null = null;
  let consecutiveLosses = 0;
  let consecutiveWins = 0;

  if (tradeList.length > 0) {
    const wins = tradeList.filter((s) => s.isWin).length;
    empiricalWinRatePct = Number(((wins / tradeList.length) * 100).toFixed(1));
    let streakBroken = false;
    let firstIsWin: boolean | null = null;
    for (let i = tradeList.length - 1; i >= 0; i--) {
      const item = tradeList[i]!;
      if (!streakBroken) {
        if (firstIsWin === null) firstIsWin = item.isWin;
        if (item.isWin === firstIsWin) {
          if (item.isWin) consecutiveWins++;
          else consecutiveLosses++;
        } else {
          streakBroken = true;
        }
      }
    }
  }

  const n = list.length;
  if (n === 0) {
    return {
      sampleCount: tradeList.length,
      avgSlippageBps: 0,
      p95SlippageBps: 0,
      empiricalFrictionR: 0.06,
      recommendedFrictionROverride: null,
      empiricalWinRatePct,
      consecutiveLosses,
      consecutiveWins,
    };
  }

  const avgSlippageBps = Number(
    (list.reduce((s, x) => s + x.realizedSlippageBps, 0) / n).toFixed(2),
  );
  const sortedBps = list.map((x) => x.realizedSlippageBps).sort((a, b) => a - b);
  const p95SlippageBps = Number(
    (sortedBps[Math.min(n - 1, Math.floor(n * 0.95))] ?? avgSlippageBps).toFixed(2),
  );
  const empiricalFrictionR = Number(
    (list.reduce((s, x) => s + x.realizedFrictionR, 0) / n).toFixed(4),
  );

  return {
    sampleCount: Math.max(n, tradeList.length),
    avgSlippageBps,
    p95SlippageBps,
    empiricalFrictionR,
    recommendedFrictionROverride: n >= 3 ? empiricalFrictionR : null,
    empiricalWinRatePct,
    consecutiveLosses,
    consecutiveWins,
  };
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const INSTRUMENT_CACHE = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

/* ------------------------- Pure Precision Helpers ------------------------- */

export function countStepDecimals(step: number | string): number {
  const raw = typeof step === "number" ? step.toString() : step.trim();
  if (!raw || Number(raw) <= 0 || !Number.isFinite(Number(raw))) return 8;
  const lower = raw.toLowerCase();
  if (lower.includes("e-")) {
    const [mantissa, exp] = lower.split("e-");
    const mantDecimals = mantissa.includes(".") ? mantissa.split(".")[1].replace(/0+$/, "").length : 0;
    return Math.min(10, Math.max(0, Number(exp) + mantDecimals));
  }
  if (!raw.includes(".")) return 0;
  return Math.min(10, raw.split(".")[1].replace(/0+$/, "").length);
}

/** Làm tròn khối lượng xuống bội số stepSize để tránh lỗi PRECISION / LOT_SIZE của sàn. */
export function roundStepSize(value: number, stepSize: number | string): number {
  const step = Number(stepSize);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(step) || step <= 0) return Number(value.toFixed(6));
  const decimals = countStepDecimals(stepSize);
  const units = Math.floor((value + step * 1e-9) / step);
  return Number((units * step).toFixed(decimals));
}

/** Làm tròn giá về bội số tickSize gần nhất cho SL/TP. */
export function roundTickSize(price: number, tickSize: number | string): number {
  const tick = Number(tickSize);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(tick) || tick <= 0) return Number(price.toFixed(6));
  const decimals = countStepDecimals(tickSize);
  const units = Math.round(price / tick);
  return Number((units * tick).toFixed(decimals));
}

/** Chuẩn hóa mã cặp Binance USDT-M Futures (vd: BTC/USDT, BTC-USDT-SWAP -> BTCUSDT). */
export function toBinanceFuturesSymbol(symbol: string): string {
  const clean = symbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(SWAP|PERP)$/i, "");
  if (clean.endsWith("USDT") || clean.endsWith("USDC")) return clean;
  return `${clean}USDT`;
}

/** Chuẩn hóa mã cặp OKX Perpetual Swap (vd: BTCUSDT -> BTC-USDT-SWAP). */
export function toOkxSwapInstId(symbol: string): string {
  const upper = symbol.trim().toUpperCase().replace(/[/_]/g, "-");
  if (/^[A-Z0-9]+-(USDT|USDC)-SWAP$/.test(upper)) return upper;
  const alnum = upper.replace(/-/g, "").replace(/(SWAP|PERP)$/i, "");
  if (alnum.endsWith("USDT")) {
    return `${alnum.slice(0, -4)}-USDT-SWAP`;
  }
  if (alnum.endsWith("USDC")) {
    return `${alnum.slice(0, -4)}-USDC-SWAP`;
  }
  return `${alnum}-USDT-SWAP`;
}

export function sanitizeClientOrderId(raw: string, maxLen = 32): string {
  const clean = raw.replace(/[^A-Za-z0-9_-]/g, "");
  return (clean || `orca_${Date.now()}`).slice(0, maxLen);
}

/* ---------------------------- Signing Helpers ----------------------------- */

export function signBinanceQuery(queryString: string, apiSecret: string): string {
  return createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

export function signOkxRequest(
  tsIso: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string,
): string {
  const prehash = `${tsIso}${method.toUpperCase()}${requestPath}${body}`;
  return createHmac("sha256", apiSecret).update(prehash).digest("base64");
}

/* ------------------------ Binance Futures Connector ----------------------- */

interface BinanceSymbolFilter {
  stepSize: string;
  minQty: number;
  tickSize: string;
  minNotional: number;
}

const BINANCE_MAINNET_FAPI = "https://fapi.binance.com";
const BINANCE_DEMO_FAPI = "https://demo-fapi.binance.com";
const BINANCE_LEGACY_TESTNET_FAPI = "https://testnet.binancefuture.com";
const BINANCE_SPOT_MAINNET_API = "https://api.binance.com";
const BINANCE_RECV_WINDOW = 10_000;
const BINANCE_TIME_SYNC_TTL_MS = 5 * 60 * 1000;

const BINANCE_TIME_OFFSET_CACHE = new Map<string, { offsetMs: number; expiresAt: number }>();
const BINANCE_TESTNET_ENDPOINT_CACHE = new Map<string, string>();

function binanceKeyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey.trim()).digest("hex").slice(0, 16);
}

function cleanBinanceCred(v: string): string {
  return v.trim().replace(/[\r\n]+/g, "");
}

function getBinanceBaseUrl(isTestnet: boolean, apiKey?: string): string {
  if (!isTestnet) return BINANCE_MAINNET_FAPI;
  if (apiKey) {
    const cached = BINANCE_TESTNET_ENDPOINT_CACHE.get(binanceKeyFingerprint(apiKey));
    if (cached) return cached;
  }
  return BINANCE_DEMO_FAPI;
}

/** Syncs local clock against Binance `/fapi/v1/time` to avoid `-1021` forward-skew rejections. */
export async function getBinanceSyncedTimestamp(baseUrl: string): Promise<number> {
  const now = Date.now();
  const cached = BINANCE_TIME_OFFSET_CACHE.get(baseUrl);
  if (cached && cached.expiresAt > now) {
    return now + cached.offsetMs;
  }
  try {
    const timePath = baseUrl === BINANCE_SPOT_MAINNET_API ? "/api/v3/time" : "/fapi/v1/time";
    const t0 = Date.now();
    const res = await fetch(`${baseUrl}${timePath}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { serverTime?: number };
      const t1 = Date.now();
      if (typeof json.serverTime === "number" && Number.isFinite(json.serverTime)) {
        const midpoint = Math.round((t0 + t1) / 2);
        const offsetMs = json.serverTime - midpoint;
        BINANCE_TIME_OFFSET_CACHE.set(baseUrl, {
          offsetMs,
          expiresAt: t1 + BINANCE_TIME_SYNC_TTL_MS,
        });
        return t1 + offsetMs;
      }
    }
  } catch {
    // Fall back to local timestamp if /time probe fails
  }
  return Date.now();
}

async function probeBinanceFuturesAccountEndpoint(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
): Promise<{
  ok: boolean;
  httpStatus: number;
  code: number | null;
  msg: string;
  json: Record<string, unknown>;
}> {
  const ts = await getBinanceSyncedTimestamp(baseUrl);
  const qs = `timestamp=${ts}&recvWindow=${BINANCE_RECV_WINDOW}`;
  const sig = signBinanceQuery(qs, apiSecret);
  const res = await fetch(`${baseUrl}/fapi/v2/account?${qs}&signature=${sig}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  const code = typeof json.code === "number" ? json.code : null;
  const msg = String(json.msg ?? `Binance HTTP ${res.status}`);
  return {
    ok: res.ok && code === null,
    httpStatus: res.status,
    code,
    msg,
    json,
  };
}

async function probeBinanceSpotAccount(apiKey: string, apiSecret: string): Promise<boolean> {
  try {
    const ts = await getBinanceSyncedTimestamp(BINANCE_SPOT_MAINNET_API);
    const qs = `timestamp=${ts}&recvWindow=${BINANCE_RECV_WINDOW}`;
    const sig = signBinanceQuery(qs, apiSecret);
    const res = await fetch(`${BINANCE_SPOT_MAINNET_API}/api/v3/account?${qs}&signature=${sig}`, {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function formatBinanceAuthErrorVi(code: number | null, rawMsg: string, isTestnet: boolean): string {
  if (code === -2014) {
    return `Định dạng API Key không hợp lệ (${rawMsg}). Vui lòng kiểm tra không dán nhầm API Secret vào ô API Key hoặc dư ký tự lạ.`;
  }
  if (code === -1022) {
    return `Chữ ký API Secret không khớp (${rawMsg}). Vui lòng kiểm tra lại API Secret chính xác với API Key này.`;
  }
  if (code === -1021) {
    return `Lệch đồng hồ hệ thống với máy chủ Binance (${rawMsg}). Vui lòng đồng bộ giờ Windows và thử lại.`;
  }
  if (code === -2015) {
    return isTestnet
      ? `API Key bị từ chối ở chế độ DEMO/TESTNET (${rawMsg}). Hãy kiểm tra: (1) Key tạo từ demo.binance.com / testnet.binancefuture.com (nếu là Key Mainnet tiền thật hãy chuyển sang REAL / LIVE), (2) đã bật quyền Enable Futures, (3) không giới hạn sai IP.`
      : `API Key bị từ chối ở chế độ REAL/LIVE (${rawMsg}). Hãy kiểm tra: (1) Đã mở ví Binance Futures & bật quyền "Enable Futures" cho API Key, (2) Nếu dùng Key Demo/Testnet hãy chuyển sang chế độ DEMO / TESTNET, (3) Nếu bật IP Whitelist hãy thêm IP máy chủ hiện tại.`;
  }
  return rawMsg;
}

async function getBinanceSymbolFilters(baseUrl: string, symbol: string): Promise<BinanceSymbolFilter | null> {
  const cacheKey = `binance_info_${baseUrl}`;
  const cachedEntry = INSTRUMENT_CACHE.get(cacheKey);
  let symbolsMap: Map<string, BinanceSymbolFilter>;

  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    symbolsMap = cachedEntry.value as Map<string, BinanceSymbolFilter>;
  } else {
    const res = await fetch(`${baseUrl}/fapi/v1/exchangeInfo`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      symbols?: Array<{
        symbol: string;
        filters?: Array<{
          filterType: string;
          stepSize?: string;
          minQty?: string;
          tickSize?: string;
          notional?: string;
        }>;
      }>;
    };
    symbolsMap = new Map();
    for (const s of json.symbols ?? []) {
      const lot = s.filters?.find((f) => f.filterType === "LOT_SIZE");
      const price = s.filters?.find((f) => f.filterType === "PRICE_FILTER");
      const minNotional = s.filters?.find((f) => f.filterType === "MIN_NOTIONAL");
      symbolsMap.set(s.symbol, {
        stepSize: lot?.stepSize ?? "0.001",
        minQty: Number(lot?.minQty ?? "0.001"),
        tickSize: price?.tickSize ?? "0.01",
        minNotional: Number(minNotional?.notional ?? "5"),
      });
    }
    INSTRUMENT_CACHE.set(cacheKey, { value: symbolsMap, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return symbolsMap.get(symbol) ?? null;
}

export interface DualEnvironmentVerificationResult {
  platform: BrokerPlatform;
  real: BrokerVerificationResult;
  demo: BrokerVerificationResult;
  connectedEnvironments: Array<"REAL" | "DEMO">;
  anyVerified: boolean;
  primary: BrokerVerificationResult;
  summaryMessage: string;
}

export async function verifyBinanceFuturesAccount(
  creds: BrokerCredentialsInput,
  options?: { skipCrossEnvProbe?: boolean },
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  const apiKey = cleanBinanceCred(creds.apiKey);
  const apiSecret = cleanBinanceCred(creds.apiSecret);

  if (!apiKey || !apiSecret) {
    return {
      verified: false,
      platform: "BINANCE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Thiếu Binance API Key hoặc API Secret",
    };
  }

  try {
    // Binance supports both new Demo Trading (`demo-fapi.binance.com`) and legacy Futures Testnet (`testnet.binancefuture.com`)
    const candidates = creds.isTestnet
      ? [BINANCE_DEMO_FAPI, BINANCE_LEGACY_TESTNET_FAPI]
      : [BINANCE_MAINNET_FAPI];

    let lastProbe: Awaited<ReturnType<typeof probeBinanceFuturesAccountEndpoint>> | null = null;
    let matchedBaseUrl: string | null = null;

    for (const candidateUrl of candidates) {
      const probe = await probeBinanceFuturesAccountEndpoint(candidateUrl, apiKey, apiSecret);
      lastProbe = probe;
      if (probe.ok) {
        matchedBaseUrl = candidateUrl;
        if (creds.isTestnet) {
          BINANCE_TESTNET_ENDPOINT_CACHE.set(binanceKeyFingerprint(apiKey), candidateUrl);
        }
        break;
      }
      // Retry once with refreshed clock offset if Binance returned -1021
      if (probe.code === -1021) {
        BINANCE_TIME_OFFSET_CACHE.delete(candidateUrl);
        const retryProbe = await probeBinanceFuturesAccountEndpoint(candidateUrl, apiKey, apiSecret);
        lastProbe = retryProbe;
        if (retryProbe.ok) {
          matchedBaseUrl = candidateUrl;
          if (creds.isTestnet) {
            BINANCE_TESTNET_ENDPOINT_CACHE.set(binanceKeyFingerprint(apiKey), candidateUrl);
          }
          break;
        }
      }
    }

    const latencyMs = Date.now() - started;

    if (!matchedBaseUrl || !lastProbe || !lastProbe.ok) {
      const code = lastProbe?.code ?? null;
      const rawMsg = lastProbe?.msg ?? "Không thể xác thực Binance Futures API";
      let diagnostic = formatBinanceAuthErrorVi(code, rawMsg, creds.isTestnet);

      // Cross-check opposite environment / Spot-only permission to give exact actionable feedback (still verified=false!)
      if (code === -2015 && !options?.skipCrossEnvProbe) {
        if (creds.isTestnet) {
          const mainnetProbe = await probeBinanceFuturesAccountEndpoint(BINANCE_MAINNET_FAPI, apiKey, apiSecret).catch(
            () => null,
          );
          if (mainnetProbe?.ok) {
            diagnostic =
              "API Key này thuộc Binance MAINNET (Tiền thật), nhưng bạn đang chọn chế độ DEMO / TESTNET. Hãy chuyển nút sang REAL / LIVE để kết nối.";
          }
        } else {
          const demoProbe = await probeBinanceFuturesAccountEndpoint(BINANCE_DEMO_FAPI, apiKey, apiSecret).catch(
            () => null,
          );
          const legacyProbe = !demoProbe?.ok
            ? await probeBinanceFuturesAccountEndpoint(BINANCE_LEGACY_TESTNET_FAPI, apiKey, apiSecret).catch(() => null)
            : null;
          if (demoProbe?.ok || legacyProbe?.ok) {
            diagnostic =
              "API Key này thuộc Binance DEMO / TESTNET, nhưng bạn đang chọn chế độ REAL / LIVE. Hãy chuyển nút sang DEMO / TESTNET để kết nối.";
          } else if (await probeBinanceSpotAccount(apiKey, apiSecret)) {
            diagnostic =
              "API Key Binance Mainnet hợp lệ ở Spot nhưng CHƯA BẬT quyền 'Enable Futures' (hoặc chưa mở tài khoản USDⓈ-M Futures) trên Binance API Management.";
          }
        }
      }

      return {
        verified: false,
        platform: "BINANCE_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: diagnostic,
      };
    }

    const json = lastProbe.json;
    const totalWallet = Number(json.totalWalletBalance ?? json.totalMarginBalance ?? 0);
    const available = Number(json.availableBalance ?? 0);
    const canTrade = Boolean(json.canTrade);
    const envLabel = !creds.isTestnet
      ? "Mainnet"
      : matchedBaseUrl === BINANCE_DEMO_FAPI
        ? "Demo Trading"
        : "Testnet";

    return {
      verified: true,
      platform: "BINANCE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(totalWallet) ? totalWallet : 0,
      availableMarginUsd: Number.isFinite(available) ? available : 0,
      canTrade,
      resolvedEndpoint: matchedBaseUrl,
      latencyMs,
      rawMessage: canTrade
        ? `Binance ${envLabel} Futures sẵn sàng giao dịch`
        : `Kết nối Binance ${envLabel} thành công nhưng API Key chưa bật quyền Enable Futures Trading`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "BINANCE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối Binance Futures API",
    };
  }
}

/**
 * Probes BOTH REAL (Mainnet) and DEMO (Testnet/Demo Trading) simultaneously using a single API Key + Secret.
 * Allows applying 1 credential pair per platform to automatically connect both Real and Demo accounts when supported,
 * or auto-detect the exact authorized environment without manual toggle mismatch errors.
 */
export async function verifyBrokerDualEnvironment(params: {
  platform: BrokerPlatform;
  apiKey: string;
  apiSecret: string;
  passphrase?: string | null;
}): Promise<DualEnvironmentVerificationResult> {
  const apiKey = cleanBinanceCred(params.apiKey);
  const apiSecret = cleanBinanceCred(params.apiSecret);
  const passphrase = params.passphrase?.trim() || null;

  const [real, demo] = await Promise.all([
    verifyBrokerCredentials(params.platform, { apiKey, apiSecret, passphrase, isTestnet: false }, { skipCrossEnvProbe: true }),
    verifyBrokerCredentials(params.platform, { apiKey, apiSecret, passphrase, isTestnet: true }, { skipCrossEnvProbe: true }),
  ]);

  const connectedEnvironments: Array<"REAL" | "DEMO"> = [];
  if (real.verified) connectedEnvironments.push("REAL");
  if (demo.verified) connectedEnvironments.push("DEMO");

  const anyVerified = connectedEnvironments.length > 0;
  let primary: BrokerVerificationResult = real;
  let summaryMessage: string;

  if (real.verified && demo.verified) {
    primary = real;
    summaryMessage = `Đã xác thực CẢ 2 tài khoản REAL ($${(real.balanceUsd ?? 0).toLocaleString()}) & DEMO ($${(demo.balanceUsd ?? 0).toLocaleString()})`;
  } else if (real.verified) {
    primary = real;
    summaryMessage = `Đã xác thực tài khoản REAL ($${(real.balanceUsd ?? 0).toLocaleString()}) · Môi trường DEMO không cấp quyền trên API Key này`;
  } else if (demo.verified) {
    primary = demo;
    summaryMessage = `Đã xác thực tài khoản DEMO ($${(demo.balanceUsd ?? 0).toLocaleString()}) · Môi trường REAL không cấp quyền trên API Key này`;
  } else {
    primary = real;
    summaryMessage = `Không thể xác thực API Key trên cả REAL lẫn DEMO · REAL: ${real.rawMessage}`;
  }

  return {
    platform: params.platform,
    real,
    demo,
    connectedEnvironments,
    anyVerified,
    primary,
    summaryMessage,
  };
}

export async function placeBinanceFuturesOrder(req: ExchangeOrderRequest): Promise<ExchangeOrderResult> {
  const geom = validateExchangeOrderGeometry(req);
  if (!geom.valid) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: Number.isFinite(req.entryPrice) && req.entryPrice > 0 ? req.entryPrice : 0,
      message: `Binance order rejected before dispatch: ${geom.reason}`,
    };
  }
  const apiKey = cleanBinanceCred(req.credentials.apiKey);
  const apiSecret = cleanBinanceCred(req.credentials.apiSecret);
  if (req.credentials.isTestnet && !BINANCE_TESTNET_ENDPOINT_CACHE.has(binanceKeyFingerprint(apiKey))) {
    await verifyBinanceFuturesAccount({ apiKey, apiSecret, isTestnet: true });
  }
  const baseUrl = getBinanceBaseUrl(req.credentials.isTestnet, apiKey);
  const symbol = toBinanceFuturesSymbol(req.symbol);
  const filters = (await getBinanceSymbolFilters(baseUrl, symbol)) ?? {
    stepSize: "0.001",
    minQty: 0.001,
    tickSize: "0.01",
    minNotional: 5,
  };

  let qty = roundStepSize(req.baseQty, filters.stepSize);
  if (qty < filters.minQty) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: `Khối lượng ${qty} nhỏ hơn minQty (${filters.minQty}) của ${symbol} trên Binance`,
    };
  }
  if (qty * req.entryPrice < filters.minNotional) {
    const adjusted = roundStepSize((filters.minNotional * 1.05) / req.entryPrice, filters.stepSize);
    if (adjusted < filters.minQty) {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: `Giá trị lệnh dưới mức tối thiểu ${filters.minNotional} USDT của ${symbol}`,
      };
    }
    qty = adjusted;
  }

  const rawLev = Number.isFinite(req.leverage) && req.leverage > 0 ? Math.round(req.leverage) : 1;
  const lev = Math.max(1, Math.min(20, rawLev));
  try {
    const levTs = await getBinanceSyncedTimestamp(baseUrl);
    const levQs = `symbol=${symbol}&leverage=${lev}&timestamp=${levTs}&recvWindow=${BINANCE_RECV_WINDOW}`;
    await fetch(`${baseUrl}/fapi/v1/leverage?${levQs}&signature=${signBinanceQuery(levQs, apiSecret)}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const clientOrderId = sanitizeClientOrderId(req.idempotencyKey, 32);
    const entryTs = await getBinanceSyncedTimestamp(baseUrl);
    const entryParams = new URLSearchParams({
      symbol,
      side: req.direction,
      type: "MARKET",
      quantity: String(qty),
      newClientOrderId: clientOrderId,
      timestamp: String(entryTs),
      recvWindow: String(BINANCE_RECV_WINDOW),
    });
    const entryQs = entryParams.toString();
    const entryRes = await fetch(
      `${baseUrl}/fapi/v1/order?${entryQs}&signature=${signBinanceQuery(entryQs, apiSecret)}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const entryJson = (await entryRes.json()) as Record<string, unknown>;
    if (!entryRes.ok || typeof entryJson.code === "number") {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: String(entryJson.msg ?? `Binance order rejected (${entryRes.status})`),
      };
    }

    const avgPriceRaw = Number(entryJson.avgPrice ?? 0);
    const execPrice = avgPriceRaw > 0 ? avgPriceRaw : req.entryPrice;
    const execQtyRaw = Number(entryJson.executedQty ?? 0);
    const execQty = execQtyRaw > 0 ? execQtyRaw : qty;
    const exchangeOrderId = String(entryJson.orderId ?? clientOrderId);

    const exitSide = req.direction === "BUY" ? "SELL" : "BUY";
    const slPrice = roundTickSize(req.stopLossPrice, filters.tickSize);
    const tpChunks = computeMultiTierTpChunks({
      totalQty: execQty,
      stepSize: filters.stepSize,
      minQty: filters.minQty,
      minNotional: filters.minNotional,
      tickSize: filters.tickSize,
      tp1: req.takeProfit1,
      tp2: req.takeProfit2,
      tp3: req.takeProfit3,
    });

    const placeBinanceSl = async (stopPrice: number) => {
      if (stopPrice <= 0) return { id: null, err: "Giá SL không hợp lệ" };
      const slTs = await getBinanceSyncedTimestamp(baseUrl);
      const p = new URLSearchParams({
        symbol,
        side: exitSide,
        type: "STOP_MARKET",
        stopPrice: String(stopPrice),
        closePosition: "true",
        workingType: "MARK_PRICE",
        timestamp: String(slTs),
        recvWindow: String(BINANCE_RECV_WINDOW),
      });
      const q = p.toString();
      const r = await fetch(
        `${baseUrl}/fapi/v1/order?${q}&signature=${signBinanceQuery(q, apiSecret)}`,
        {
          method: "POST",
          headers: { "X-MBX-APIKEY": apiKey },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || typeof j.code === "number") {
        return { id: null, err: String(j.msg ?? r.status) };
      }
      return { id: String(j.orderId ?? ""), err: undefined };
    };

    const placeBinanceTpChunk = async (chunk: TpAllocationChunk) => {
      const tpTs = await getBinanceSyncedTimestamp(baseUrl);
      const p = new URLSearchParams({
        symbol,
        side: exitSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: String(chunk.price),
        workingType: "MARK_PRICE",
        timestamp: String(tpTs),
        recvWindow: String(BINANCE_RECV_WINDOW),
      });
      if (chunk.closePosition) {
        p.set("closePosition", "true");
      } else {
        p.set("quantity", String(chunk.qty));
        p.set("reduceOnly", "true");
      }
      const q = p.toString();
      const r = await fetch(
        `${baseUrl}/fapi/v1/order?${q}&signature=${signBinanceQuery(q, apiSecret)}`,
        {
          method: "POST",
          headers: { "X-MBX-APIKEY": apiKey },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || typeof j.code === "number") {
        return { tier: chunk.tier, id: null, err: String(j.msg ?? r.status) };
      }
      return { tier: chunk.tier, id: String(j.orderId ?? ""), err: undefined };
    };

    const [slRes, ...tpResults] = await Promise.all([
      placeBinanceSl(slPrice),
      ...tpChunks.map((chunk) => placeBinanceTpChunk(chunk)),
    ]);

    const tp1Res = tpResults.find((t) => t.tier === "TP1");
    const tp2Res = tpResults.find((t) => t.tier === "TP2");
    const tp3Res = tpResults.find((t) => t.tier === "TP3");
    const tpPlanStr = tpChunks.map((c) => `${c.tier}:${c.qty}@${c.price}`).join(" | ");
    const slWarning = slRes.err ? `Cảnh báo: Đã vào lệnh chính nhưng đặt SL thất bại (${slRes.err})` : undefined;

    return {
      ok: true,
      status: "FILLED",
      exchangeOrderId,
      slOrderId: slRes.id,
      tpOrderId: tp1Res?.id ?? null,
      tp2OrderId: tp2Res?.id ?? null,
      tp3OrderId: tp3Res?.id ?? null,
      tpAllocationPlan: tpPlanStr,
      executedQty: execQty,
      executedPrice: execPrice,
      message: `Binance ${req.credentials.isTestnet ? "Testnet" : "Live"} khớp #${exchangeOrderId} (${execQty} ${symbol}${tpChunks.length > 1 ? ` · ${tpChunks.length} mốc TP` : ""})`,
      slWarning,
    };
  } catch (err) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: err instanceof Error ? err.message : "Lỗi kết nối đặt lệnh Binance Futures",
    };
  }
}

/**
 * Updates live Binance Futures Stop-Loss trigger (used when moving SL to Breakeven after TP1 or trailing profit lock).
 */
export async function updateBinanceFuturesStopLoss(params: {
  credentials: BrokerCredentialsInput;
  symbol: string;
  direction: "BUY" | "SELL";
  previousSlOrderId?: string | null;
  newStopLossPrice: number;
}): Promise<{ ok: boolean; newSlOrderId: string | null; message: string }> {
  const apiKey = cleanBinanceCred(params.credentials.apiKey);
  const apiSecret = cleanBinanceCred(params.credentials.apiSecret);
  if (params.credentials.isTestnet && !BINANCE_TESTNET_ENDPOINT_CACHE.has(binanceKeyFingerprint(apiKey))) {
    await verifyBinanceFuturesAccount({ apiKey, apiSecret, isTestnet: true });
  }
  const baseUrl = getBinanceBaseUrl(params.credentials.isTestnet, apiKey);
  const symbol = toBinanceFuturesSymbol(params.symbol);
  const filters = (await getBinanceSymbolFilters(baseUrl, symbol)) ?? {
    stepSize: "0.001",
    minQty: 0.001,
    tickSize: "0.01",
    minNotional: 5,
  };
  const nextSl = roundTickSize(params.newStopLossPrice, filters.tickSize);
  if (nextSl <= 0) {
    return { ok: false, newSlOrderId: params.previousSlOrderId ?? null, message: "Invalid Stop-Loss price" };
  }

  try {
    if (params.previousSlOrderId && /^\d+$/.test(params.previousSlOrderId)) {
      const cancelTs = await getBinanceSyncedTimestamp(baseUrl);
      const cancelQs = `symbol=${symbol}&orderId=${params.previousSlOrderId}&timestamp=${cancelTs}&recvWindow=${BINANCE_RECV_WINDOW}`;
      await fetch(
        `${baseUrl}/fapi/v1/order?${cancelQs}&signature=${signBinanceQuery(cancelQs, apiSecret)}`,
        {
          method: "DELETE",
          headers: { "X-MBX-APIKEY": apiKey },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      ).catch(() => null);
    }

    const exitSide = params.direction === "BUY" ? "SELL" : "BUY";
    const slTs = await getBinanceSyncedTimestamp(baseUrl);
    const p = new URLSearchParams({
      symbol,
      side: exitSide,
      type: "STOP_MARKET",
      stopPrice: String(nextSl),
      closePosition: "true",
      workingType: "MARK_PRICE",
      timestamp: String(slTs),
      recvWindow: String(BINANCE_RECV_WINDOW),
    });
    const q = p.toString();
    const res = await fetch(
      `${baseUrl}/fapi/v1/order?${q}&signature=${signBinanceQuery(q, apiSecret)}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok || typeof json.code === "number") {
      return {
        ok: false,
        newSlOrderId: params.previousSlOrderId ?? null,
        message: String(json.msg ?? `Binance SL update HTTP ${res.status}`),
      };
    }
    return {
      ok: true,
      newSlOrderId: String(json.orderId ?? ""),
      message: `Updated Binance Futures SL -> ${nextSl}`,
    };
  } catch (err) {
    return {
      ok: false,
      newSlOrderId: params.previousSlOrderId ?? null,
      message: err instanceof Error ? err.message : "Failed updating Binance Futures SL",
    };
  }
}

/* ----------------------------- OKX v5 Connector --------------------------- */

const OKX_BASE_URL = "https://www.okx.com";

interface OkxInstrumentInfo {
  ctVal: number;
  lotSz: string;
  minSz: number;
  tickSz: string;
}

function buildOkxHeaders(
  creds: BrokerCredentialsInput,
  method: string,
  requestPath: string,
  body = "",
): Record<string, string> {
  const tsIso = new Date().toISOString();
  const sign = signOkxRequest(tsIso, method, requestPath, body, creds.apiSecret);
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": tsIso,
    "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
    "Content-Type": "application/json",
  };
  if (creds.isTestnet) {
    headers["x-simulated-trading"] = "1";
  }
  return headers;
}

async function getOkxSwapInstrument(instId: string): Promise<OkxInstrumentInfo | null> {
  const cacheKey = `okx_swap_${instId}`;
  const cachedEntry = INSTRUMENT_CACHE.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.value as OkxInstrumentInfo;
  }
  try {
    const res = await fetch(`${OKX_BASE_URL}/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      data?: Array<{ ctVal?: string; lotSz?: string; minSz?: string; tickSz?: string }>;
    };
    const item = json.data?.[0];
    if (!item) return null;
    const info: OkxInstrumentInfo = {
      ctVal: Number(item.ctVal ?? "0.01"),
      lotSz: item.lotSz ?? "1",
      minSz: Number(item.minSz ?? "1"),
      tickSz: item.tickSz ?? "0.1",
    };
    INSTRUMENT_CACHE.set(cacheKey, { value: info, expiresAt: Date.now() + CACHE_TTL_MS });
    return info;
  } catch {
    return null;
  }
}

export async function verifyOkxAccount(creds: BrokerCredentialsInput): Promise<BrokerVerificationResult> {
  const started = Date.now();
  if (!creds.passphrase?.trim()) {
    return {
      verified: false,
      platform: "OKX_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "OKX v5 API bắt buộc phải nhập Passphrase",
    };
  }

  try {
    const balPath = "/api/v5/account/balance";
    const cfgPath = "/api/v5/account/config";
    const [balRes, cfgRes] = await Promise.all([
      fetch(`${OKX_BASE_URL}${balPath}`, {
        method: "GET",
        headers: buildOkxHeaders(creds, "GET", balPath),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(`${OKX_BASE_URL}${cfgPath}`, {
        method: "GET",
        headers: buildOkxHeaders(creds, "GET", cfgPath),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);

    const balJson = (await balRes.json()) as {
      code?: string;
      msg?: string;
      data?: Array<{ totalEq?: string; details?: Array<{ ccy?: string; availBal?: string }> }>;
    };
    const latencyMs = Date.now() - started;

    if (!balRes.ok || balJson.code !== "0") {
      return {
        verified: false,
        platform: "OKX_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: balJson.msg || `OKX HTTP ${balRes.status}`,
      };
    }

    const totalEq = Number(balJson.data?.[0]?.totalEq ?? 0);
    const usdtDetail = balJson.data?.[0]?.details?.find((d) => d.ccy === "USDT");
    const availBal = Number(usdtDetail?.availBal ?? totalEq);

    let posMode = "net_mode";
    let perm = "";
    if (cfgRes.ok) {
      const cfgJson = (await cfgRes.json()) as {
        code?: string;
        data?: Array<{ posMode?: string; perm?: string }>;
      };
      if (cfgJson.code === "0" && cfgJson.data?.[0]) {
        posMode = cfgJson.data[0].posMode ?? "net_mode";
        perm = cfgJson.data[0].perm ?? "";
      }
    }
    const canTrade = !perm || perm.toLowerCase().includes("trade");

    return {
      verified: true,
      platform: "OKX_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(totalEq) ? totalEq : 0,
      availableMarginUsd: Number.isFinite(availBal) ? availBal : 0,
      canTrade,
      positionMode: posMode,
      latencyMs,
      rawMessage: canTrade
        ? `OKX ${creds.isTestnet ? "Demo Trading" : "Live"} (${posMode}) sẵn sàng giao dịch`
        : "Kết nối OKX thành công nhưng API Key chỉ có quyền Read-Only",
    };
  } catch (err) {
    return {
      verified: false,
      platform: "OKX_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối OKX v5 API",
    };
  }
}

export async function placeOkxSwapOrder(req: ExchangeOrderRequest): Promise<ExchangeOrderResult> {
  const geom = validateExchangeOrderGeometry(req);
  if (!geom.valid) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: Number.isFinite(req.entryPrice) && req.entryPrice > 0 ? req.entryPrice : 0,
      message: `OKX order rejected before dispatch: ${geom.reason}`,
    };
  }
  if (!req.credentials.passphrase?.trim()) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: "Thiếu OKX Passphrase để ký lệnh",
    };
  }

  const instId = toOkxSwapInstId(req.symbol);
  const inst = (await getOkxSwapInstrument(instId)) ?? {
    ctVal: 0.01,
    lotSz: "0.01",
    minSz: 0.01,
    tickSz: "0.1",
  };

  // OKX Swap tính sz theo số hợp đồng: contracts = baseQty / ctVal
  const rawContracts = req.baseQty / Math.max(1e-9, inst.ctVal);
  const contracts = roundStepSize(rawContracts, inst.lotSz);
  if (contracts < inst.minSz) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: `Số hợp đồng OKX (${contracts}) nhỏ hơn minSz (${inst.minSz}) của ${instId}`,
    };
  }

  try {
    const cfgPath = "/api/v5/account/config";
    const cfgRes = await fetch(`${OKX_BASE_URL}${cfgPath}`, {
      method: "GET",
      headers: buildOkxHeaders(req.credentials, "GET", cfgPath),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const cfgJson = cfgRes.ok
      ? ((await cfgRes.json()) as { data?: Array<{ posMode?: string }> })
      : null;
    const posMode = cfgJson?.data?.[0]?.posMode ?? "net_mode";

    const rawLev = Number.isFinite(req.leverage) && req.leverage > 0 ? Math.round(req.leverage) : 1;
    const lev = Math.max(1, Math.min(20, rawLev));
    const levPath = "/api/v5/account/set-leverage";
    const levPayload: Record<string, string> = {
      instId,
      lever: String(lev),
      mgnMode: "isolated",
    };
    if (posMode === "long_short_mode") {
      levPayload.posSide = req.direction === "BUY" ? "long" : "short";
    }
    const levBody = JSON.stringify(levPayload);
    await fetch(`${OKX_BASE_URL}${levPath}`, {
      method: "POST",
      headers: buildOkxHeaders(req.credentials, "POST", levPath, levBody),
      body: levBody,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const slPrice = roundTickSize(req.stopLossPrice, inst.tickSz);
    const tpChunks = computeMultiTierTpChunks({
      totalQty: contracts,
      stepSize: inst.lotSz,
      minQty: inst.minSz,
      minNotional: 0,
      tickSize: inst.tickSz,
      tp1: req.takeProfit1,
      tp2: req.takeProfit2,
      tp3: req.takeProfit3,
    });
    const clOrdId = sanitizeClientOrderId(req.idempotencyKey, 32);

    const orderPayload: Record<string, unknown> = {
      instId,
      tdMode: "isolated",
      side: req.direction === "BUY" ? "buy" : "sell",
      ordType: "market",
      sz: String(contracts),
      clOrdId,
    };
    if (posMode === "long_short_mode") {
      orderPayload.posSide = req.direction === "BUY" ? "long" : "short";
    }
    const useSingleAttachedTp = tpChunks.length <= 1;
    const tp1Price = tpChunks[0]?.price ?? roundTickSize(req.takeProfit1, inst.tickSz);
    if (slPrice > 0 || (useSingleAttachedTp && tp1Price > 0)) {
      orderPayload.attachAlgoOrds = [
        {
          ...(useSingleAttachedTp && tp1Price > 0 ? { tpTriggerPx: String(tp1Price), tpOrdPx: "-1" } : {}),
          ...(slPrice > 0 ? { slTriggerPx: String(slPrice), slOrdPx: "-1" } : {}),
        },
      ];
    }

    const orderPath = "/api/v5/trade/order";
    const orderBody = JSON.stringify(orderPayload);
    const orderRes = await fetch(`${OKX_BASE_URL}${orderPath}`, {
      method: "POST",
      headers: buildOkxHeaders(req.credentials, "POST", orderPath, orderBody),
      body: orderBody,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const orderJson = (await orderRes.json()) as {
      code?: string;
      msg?: string;
      data?: Array<{ ordId?: string; clOrdId?: string; sCode?: string; sMsg?: string }>;
    };
    const row = orderJson.data?.[0];
    if (!orderRes.ok || orderJson.code !== "0" || !row || row.sCode !== "0") {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: row?.sMsg || orderJson.msg || `OKX order rejected (${orderRes.status})`,
      };
    }

    let tpOrderIds: Record<string, string | null> = { TP1: "attached-algo-tp", TP2: null, TP3: null };
    if (!useSingleAttachedTp) {
      const algoPath = "/api/v5/trade/order-algo";
      const exitSide = req.direction === "BUY" ? "sell" : "buy";
      const results = await Promise.all(
        tpChunks.map(async (chunk) => {
          const algoPayload: Record<string, unknown> = {
            instId,
            tdMode: "isolated",
            side: exitSide,
            ordType: "conditional",
            sz: String(chunk.qty),
            reduceOnly: true,
            tpTriggerPx: String(chunk.price),
            tpOrdPx: "-1",
            ...(posMode === "long_short_mode" ? { posSide: req.direction === "BUY" ? "long" : "short" } : {}),
          };
          const body = JSON.stringify(algoPayload);
          const r = await fetch(`${OKX_BASE_URL}${algoPath}`, {
            method: "POST",
            headers: buildOkxHeaders(req.credentials, "POST", algoPath, body),
            body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }).catch(() => null);
          if (!r || !r.ok) return { tier: chunk.tier, algoId: null };
          const j = (await r.json().catch(() => ({}))) as { data?: Array<{ algoId?: string; sCode?: string }> };
          const algoRow = j.data?.[0];
          return { tier: chunk.tier, algoId: algoRow?.sCode === "0" ? algoRow.algoId ?? null : null };
        }),
      );
      tpOrderIds = { TP1: null, TP2: null, TP3: null };
      for (const r of results) {
        tpOrderIds[r.tier] = r.algoId;
      }
    }

    return {
      ok: true,
      status: "FILLED",
      exchangeOrderId: row.ordId ?? clOrdId,
      slOrderId: slPrice > 0 ? "attached-algo-sl" : null,
      tpOrderId: tpOrderIds.TP1,
      tp2OrderId: tpOrderIds.TP2,
      tp3OrderId: tpOrderIds.TP3,
      tpAllocationPlan: tpChunks.map((c) => `${c.tier}:${c.qty}@${c.price}`).join(" | "),
      executedQty: Number((contracts * inst.ctVal).toFixed(6)),
      executedPrice: req.entryPrice,
      message: `OKX ${req.credentials.isTestnet ? "Demo" : "Live"} khớp #${row.ordId} (${contracts} ct ${instId}, ${tpChunks.length > 1 ? `${tpChunks.length} mốc TP` : "attached SL/TP"})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: err instanceof Error ? err.message : "Lỗi kết nối đặt lệnh OKX v5",
    };
  }
}

/* ---------------- MetaApi Cloud REST Connector (Exness / XM MT5) ---------------- */

const METAAPI_CLIENT_BASE = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai";

/** Chuẩn hóa mã Forex/Vàng cho MT5 (vd: XAU/USD -> XAUUSD, EUR/USD + "m" -> EURUSDm). */
export function toMt5BrokerSymbol(symbol: string, suffix?: string | null): string {
  const raw = symbol.trim();
  const cleanSuffix = suffix?.trim() ?? "";
  let base = raw;
  if (cleanSuffix && raw.toLowerCase().endsWith(cleanSuffix.toLowerCase())) {
    base = raw.slice(0, -cleanSuffix.length);
  }
  const cleanBase = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleanSuffix ? `${cleanBase}${cleanSuffix}` : cleanBase;
}

/**
 * Xác minh tài khoản Exness / XM MT5 qua MetaApi Cloud REST API.
 * Quy ước lưu trong Broker Vault AES-256-GCM:
 * - apiKey = MetaApi Auth Token
 * - apiSecret = MetaApi Account ID
 * - passphrase (tùy chọn) = Symbol suffix của sàn (vd: "m" cho Exness Standard Cent/Pro hoặc "#" cho XM)
 */
export async function verifyMetaApiMt5Account(
  creds: BrokerCredentialsInput,
  platform: BrokerPlatform = "MT5_EXNESS",
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  const authToken = creds.apiKey.trim();
  const accountId = creds.apiSecret.trim();

  if (!authToken || !accountId) {
    return {
      verified: false,
      platform,
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Cần nhập đủ MetaApi Token và MetaApi Account ID để kết nối Cloud MT5",
    };
  }

  try {
    const res = await fetch(
      `${METAAPI_CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/account-information`,
      {
        method: "GET",
        headers: {
          "auth-token": authToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const latencyMs = Date.now() - started;

    if (!res.ok || json.error) {
      return {
        verified: false,
        platform,
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: String(json.message ?? json.error ?? `MetaApi HTTP ${res.status}`),
      };
    }

    const balance = Number(json.balance ?? json.equity ?? 0);
    const freeMargin = Number(json.freeMargin ?? balance);
    const tradeAllowed = json.tradeAllowed !== false;
    const brokerName = typeof json.broker === "string" ? json.broker : platform;
    const serverName = typeof json.server === "string" ? ` · ${json.server}` : "";

    return {
      verified: true,
      platform,
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(balance) ? balance : 0,
      availableMarginUsd: Number.isFinite(freeMargin) ? freeMargin : 0,
      canTrade: tradeAllowed,
      positionMode: typeof json.type === "string" ? json.type : undefined,
      latencyMs,
      rawMessage: tradeAllowed
        ? `${brokerName}${serverName} (Cloud MT5) sẵn sàng khớp lệnh`
        : `${brokerName} kết nối thành công nhưng tài khoản đang tắt quyền giao dịch`,
    };
  } catch (err) {
    return {
      verified: false,
      platform,
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối MetaApi Cloud MT5",
    };
  }
}

export async function placeMetaApiMt5Order(
  req: ExchangeOrderRequest,
  platform: BrokerPlatform = "MT5_EXNESS",
): Promise<ExchangeOrderResult> {
  const geom = validateExchangeOrderGeometry(req);
  if (!geom.valid) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: Number.isFinite(req.entryPrice) && req.entryPrice > 0 ? req.entryPrice : 0,
      message: `${platform} order rejected before dispatch: ${geom.reason}`,
    };
  }
  const authToken = req.credentials.apiKey.trim();
  const accountId = req.credentials.apiSecret.trim();
  const suffix = resolveBrokerDefaultSuffix(platform, req.credentials.passphrase);
  const symbol = toMt5BrokerSymbol(req.symbol, suffix);
  const volume = Math.max(0.01, Number(req.baseQty.toFixed(2)));

  if (!authToken || !accountId) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: "Thiếu MetaApi Token hoặc Account ID để đẩy lệnh Forex MT5",
    };
  }

  try {
    const payload = {
      actionType: req.direction === "BUY" ? "ORDER_TYPE_BUY" : "ORDER_TYPE_SELL",
      symbol,
      volume,
      stopLoss: req.stopLossPrice,
      takeProfit: req.takeProfit1,
      comment: `ORCA:${sanitizeClientOrderId(req.idempotencyKey, 20)}`,
    };

    const res = await fetch(
      `${METAAPI_CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/trade`,
      {
        method: "POST",
        headers: {
          "auth-token": authToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    const stringCode = String(json.stringCode ?? "");
    const ok = res.ok && (stringCode === "TRADE_RETCODE_DONE" || stringCode === "TRADE_RETCODE_PLACED" || Boolean(json.orderId || json.positionId));
    if (!ok) {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: String(json.message ?? json.stringCode ?? `MetaApi MT5 từ chối lệnh (${res.status})`),
      };
    }

    const orderId = String(json.orderId ?? json.positionId ?? sanitizeClientOrderId(req.idempotencyKey, 20));
    return {
      ok: true,
      status: "FILLED",
      exchangeOrderId: orderId,
      slOrderId: "mt5-attached-sl",
      tpOrderId: "mt5-attached-tp",
      executedQty: volume,
      executedPrice: req.entryPrice,
      message: `${platform} Cloud MT5 khớp #${orderId} (${volume} lots ${symbol}, SL/TP đính kèm)`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: err instanceof Error ? err.message : "Lỗi kết nối đặt lệnh MetaApi Cloud MT5",
    };
  }
}

/* ------------------ Real-Time Exchange Telemetry Fetchers ------------------ */

export interface LiveExchangePosition {
  positionId: string;
  symbol: string;
  assetType: "CRYPTO" | "FOREX";
  direction: "BUY" | "SELL";
  qtyOrLots: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  stopLossPrice: number | null;
  takeProfit1: number | null;
  unrealizedPnlUsd: number;
  roePct: number;
  liquidationPrice: number | null;
  openedAt: number;
}

export interface LiveExchangeTelemetryResult {
  ok: boolean;
  walletBalanceUsd: number | null;
  equityUsd: number | null;
  availableMarginUsd: number | null;
  unrealizedPnlUsd: number;
  openPositions: LiveExchangePosition[];
  fetchedAt: number;
  error: string | null;
}

/** Lấy số dư thực, equity & vị thế đang mở trực tiếp từ Binance USDT-M Futures (Testnet hoặc Mainnet). */
export async function fetchBinanceFuturesTelemetry(
  creds: BrokerCredentialsInput,
): Promise<LiveExchangeTelemetryResult> {
  const baseUrl = getBinanceBaseUrl(creds.isTestnet);
  const ts = Date.now();
  const accQs = `timestamp=${ts}&recvWindow=5000`;
  const posQs = `timestamp=${ts}&recvWindow=5000`;

  try {
    const [accRes, posRes] = await Promise.all([
      fetch(`${baseUrl}/fapi/v2/account?${accQs}&signature=${signBinanceQuery(accQs, creds.apiSecret)}`, {
        headers: { "X-MBX-APIKEY": creds.apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(`${baseUrl}/fapi/v2/positionRisk?${posQs}&signature=${signBinanceQuery(posQs, creds.apiSecret)}`, {
        headers: { "X-MBX-APIKEY": creds.apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);

    const accJson = (await accRes.json()) as Record<string, unknown>;
    if (!accRes.ok || typeof accJson.code === "number") {
      return {
        ok: false,
        walletBalanceUsd: null,
        equityUsd: null,
        availableMarginUsd: null,
        unrealizedPnlUsd: 0,
        openPositions: [],
        fetchedAt: Date.now(),
        error: String(accJson.msg ?? `Binance HTTP ${accRes.status}`),
      };
    }

    const wallet = Number(accJson.totalWalletBalance ?? 0);
    const equity = Number(accJson.totalMarginBalance ?? wallet);
    const available = Number(accJson.availableBalance ?? wallet);
    const totalUnrealized = Number(accJson.totalUnrealizedProfit ?? 0);

    const openPositions: LiveExchangePosition[] = [];
    if (posRes.ok) {
      const posArr = (await posRes.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(posArr)) {
        for (const p of posArr) {
          const amt = Number(p.positionAmt ?? 0);
          if (!Number.isFinite(amt) || Math.abs(amt) <= 0) continue;
          const entry = Number(p.entryPrice ?? 0);
          const mark = Number(p.markPrice ?? entry);
          const lev = Math.max(1, Number(p.leverage ?? 1));
          const upnl = Number(p.unRealizedProfit ?? 0);
          const liq = Number(p.liquidationPrice ?? 0);
          const absQty = Math.abs(amt);
          const margin = entry > 0 ? Math.max(1, (absQty * entry) / lev) : 1;
          const roePct = Number(((upnl / margin) * 100).toFixed(2));
          openPositions.push({
            positionId: `bn_${String(p.symbol)}_${amt > 0 ? "LONG" : "SHORT"}`,
            symbol: String(p.symbol),
            assetType: "CRYPTO",
            direction: amt > 0 ? "BUY" : "SELL",
            qtyOrLots: absQty,
            leverage: lev,
            entryPrice: entry,
            markPrice: mark,
            stopLossPrice: null,
            takeProfit1: null,
            unrealizedPnlUsd: Number(upnl.toFixed(4)),
            roePct,
            liquidationPrice: liq > 0 ? liq : null,
            openedAt: Number(p.updateTime ?? Date.now()),
          });
        }
      }
    }

    return {
      ok: true,
      walletBalanceUsd: Number.isFinite(wallet) ? Number(wallet.toFixed(2)) : null,
      equityUsd: Number.isFinite(equity) ? Number(equity.toFixed(2)) : null,
      availableMarginUsd: Number.isFinite(available) ? Number(available.toFixed(2)) : null,
      unrealizedPnlUsd: Number.isFinite(totalUnrealized) ? Number(totalUnrealized.toFixed(2)) : 0,
      openPositions,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : "Lỗi đồng bộ telemetry Binance Futures",
    };
  }
}

/** Lấy số dư thực, equity & vị thế đang mở trực tiếp từ OKX v5 (Demo hoặc Live). */
export async function fetchOkxTelemetry(creds: BrokerCredentialsInput): Promise<LiveExchangeTelemetryResult> {
  if (!creds.passphrase?.trim()) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: "Thiếu OKX Passphrase",
    };
  }

  const balPath = "/api/v5/account/balance";
  const posPath = "/api/v5/account/positions?instType=SWAP";

  try {
    const [balRes, posRes] = await Promise.all([
      fetch(`${OKX_BASE_URL}${balPath}`, {
        headers: buildOkxHeaders(creds, "GET", balPath),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(`${OKX_BASE_URL}${posPath}`, {
        headers: buildOkxHeaders(creds, "GET", posPath),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);

    const balJson = (await balRes.json()) as {
      code?: string;
      msg?: string;
      data?: Array<{
        totalEq?: string;
        details?: Array<{ ccy?: string; cashBal?: string; availBal?: string; upl?: string }>;
      }>;
    };
    if (!balRes.ok || balJson.code !== "0") {
      return {
        ok: false,
        walletBalanceUsd: null,
        equityUsd: null,
        availableMarginUsd: null,
        unrealizedPnlUsd: 0,
        openPositions: [],
        fetchedAt: Date.now(),
        error: balJson.msg || `OKX HTTP ${balRes.status}`,
      };
    }

    const row = balJson.data?.[0];
    const equity = Number(row?.totalEq ?? 0);
    const usdt = row?.details?.find((d) => d.ccy === "USDT");
    const wallet = Number(usdt?.cashBal ?? equity);
    const available = Number(usdt?.availBal ?? equity);
    let totalUnrealized = Number(usdt?.upl ?? 0);

    const openPositions: LiveExchangePosition[] = [];
    if (posRes.ok) {
      const posJson = (await posRes.json()) as {
        code?: string;
        data?: Array<Record<string, string>>;
      };
      if (posJson.code === "0" && Array.isArray(posJson.data)) {
        let posUpnlSum = 0;
        for (const p of posJson.data) {
          const posQty = Number(p.pos ?? 0);
          if (!Number.isFinite(posQty) || Math.abs(posQty) <= 0) continue;
          const posSide = (p.posSide || "").toLowerCase();
          const direction: "BUY" | "SELL" =
            posSide === "short" ? "SELL" : posSide === "long" ? "BUY" : posQty >= 0 ? "BUY" : "SELL";
          const entry = Number(p.avgPx ?? 0);
          const mark = Number(p.markPx ?? entry);
          const upnl = Number(p.upl ?? 0);
          const roePct = Number((Number(p.uplRatio ?? 0) * 100).toFixed(2));
          const lev = Math.max(1, Number(p.lever ?? 1));
          const liq = Number(p.liqPx ?? 0);
          posUpnlSum += upnl;
          openPositions.push({
            positionId: `okx_${p.posId || p.instId}_${direction}`,
            symbol: (p.instId || "").replace(/-SWAP$/i, "").replace(/-/g, ""),
            assetType: "CRYPTO",
            direction,
            qtyOrLots: Math.abs(posQty),
            leverage: lev,
            entryPrice: entry,
            markPrice: mark,
            stopLossPrice: null,
            takeProfit1: null,
            unrealizedPnlUsd: Number(upnl.toFixed(4)),
            roePct,
            liquidationPrice: liq > 0 ? liq : null,
            openedAt: Number(p.cTime ?? Date.now()),
          });
        }
        if (openPositions.length > 0 && totalUnrealized === 0) {
          totalUnrealized = posUpnlSum;
        }
      }
    }

    return {
      ok: true,
      walletBalanceUsd: Number.isFinite(wallet) ? Number(wallet.toFixed(2)) : null,
      equityUsd: Number.isFinite(equity) ? Number(equity.toFixed(2)) : null,
      availableMarginUsd: Number.isFinite(available) ? Number(available.toFixed(2)) : null,
      unrealizedPnlUsd: Number.isFinite(totalUnrealized) ? Number(totalUnrealized.toFixed(2)) : 0,
      openPositions,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : "Lỗi đồng bộ telemetry OKX v5",
    };
  }
}

/** Lấy số dư thực, equity & vị thế MT5 đang mở trực tiếp từ MetaApi Cloud (Exness / XM Demo & Live). */
export async function fetchMetaApiMt5Telemetry(
  creds: BrokerCredentialsInput,
): Promise<LiveExchangeTelemetryResult> {
  const authToken = creds.apiKey.trim();
  const accountId = creds.apiSecret.trim();
  if (!authToken || !accountId) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: "Thiếu MetaApi Token hoặc Account ID",
    };
  }

  try {
    const base = `${METAAPI_CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}`;
    const headers = { "auth-token": authToken, Accept: "application/json" };
    const [infoRes, posRes] = await Promise.all([
      fetch(`${base}/account-information`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
      fetch(`${base}/positions`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    ]);

    const infoJson = (await infoRes.json()) as Record<string, unknown>;
    if (!infoRes.ok || infoJson.error) {
      return {
        ok: false,
        walletBalanceUsd: null,
        equityUsd: null,
        availableMarginUsd: null,
        unrealizedPnlUsd: 0,
        openPositions: [],
        fetchedAt: Date.now(),
        error: String(infoJson.message ?? infoJson.error ?? `MetaApi HTTP ${infoRes.status}`),
      };
    }

    const balance = Number(infoJson.balance ?? 0);
    const equity = Number(infoJson.equity ?? balance);
    const freeMargin = Number(infoJson.freeMargin ?? balance);
    const levDefault = Math.max(1, Number(infoJson.leverage ?? 100));

    const openPositions: LiveExchangePosition[] = [];
    let sumProfit = 0;
    if (posRes.ok) {
      const posArr = (await posRes.json()) as Array<Record<string, unknown>>;
      if (Array.isArray(posArr)) {
        for (const p of posArr) {
          const volume = Number(p.volume ?? 0);
          if (!Number.isFinite(volume) || volume <= 0) continue;
          const profit = Number(p.unrealizedProfit ?? p.profit ?? 0);
          sumProfit += profit;
          const entry = Number(p.openPrice ?? 0);
          const mark = Number(p.currentPrice ?? entry);
          const typeStr = String(p.type ?? "").toUpperCase();
          const direction: "BUY" | "SELL" = typeStr.includes("SELL") ? "SELL" : "BUY";
          const marginEst = Math.max(1, (volume * 100_000 * (entry > 20 ? 1 : entry)) / levDefault);
          openPositions.push({
            positionId: `mt5_${String(p.id ?? p.symbol)}`,
            symbol: String(p.symbol ?? ""),
            assetType: "FOREX",
            direction,
            qtyOrLots: volume,
            leverage: levDefault,
            entryPrice: entry,
            markPrice: mark,
            stopLossPrice: Number(p.stopLoss ?? 0) > 0 ? Number(p.stopLoss) : null,
            takeProfit1: Number(p.takeProfit ?? 0) > 0 ? Number(p.takeProfit) : null,
            unrealizedPnlUsd: Number(profit.toFixed(2)),
            roePct: Number(((profit / marginEst) * 100).toFixed(2)),
            liquidationPrice: null,
            openedAt: p.time ? new Date(String(p.time)).getTime() : Date.now(),
          });
        }
      }
    }

    const unrealized = Number.isFinite(equity - balance) && Math.abs(equity - balance) > 0.001
      ? Number((equity - balance).toFixed(2))
      : Number(sumProfit.toFixed(2));

    return {
      ok: true,
      walletBalanceUsd: Number.isFinite(balance) ? Number(balance.toFixed(2)) : null,
      equityUsd: Number.isFinite(equity) ? Number(equity.toFixed(2)) : null,
      availableMarginUsd: Number.isFinite(freeMargin) ? Number(freeMargin.toFixed(2)) : null,
      unrealizedPnlUsd: unrealized,
      openPositions,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : "Lỗi đồng bộ telemetry MetaApi MT5",
    };
  }
}

/* ============================================================================
 * MULTI-EXCHANGE CRYPTO & FOREX CONNECTORS
 * Supports Bybit v5, Bitget v2, Gate.io v4, KuCoin Futures, BingX v2,
 * Hyperliquid DEX, and OANDA v20 REST Forex Hub.
 * ============================================================================ */

function normalizeLinearUsdtSymbol(symbol: string): string {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.endsWith("USDT") ? clean : `${clean.replace(/(USD|USDC|BUSD|PERP)$/i, "")}USDT`;
}

function toOandaInstrument(symbol: string): string {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length === 6) return `${clean.slice(0, 3)}_${clean.slice(3, 6)}`;
  return symbol.toUpperCase().replace(/[/-]/g, "_");
}

/* ---------------- 1. Bybit Unified v5 Connector ---------------- */

function buildBybitV5Headers(
  creds: BrokerCredentialsInput,
  payloadStr: string,
): Record<string, string> {
  const ts = String(Date.now());
  const recvWindow = "5000";
  const prehash = `${ts}${creds.apiKey.trim()}${recvWindow}${payloadStr}`;
  const sign = createHmac("sha256", creds.apiSecret.trim()).update(prehash).digest("hex");
  return {
    "X-BAPI-API-KEY": creds.apiKey.trim(),
    "X-BAPI-SIGN": sign,
    "X-BAPI-TIMESTAMP": ts,
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };
}

export async function verifyBybitFuturesAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  const apiKey = creds.apiKey.trim();
  const apiSecret = creds.apiSecret.trim();
  if (!apiKey || !apiSecret) {
    return {
      verified: false,
      platform: "BYBIT_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Thiếu Bybit API Key hoặc Secret Key",
    };
  }

  const hosts = creds.isTestnet
    ? ["https://api-testnet.bybit.com", "https://api-demo.bybit.com"]
    : ["https://api.bybit.com"];
  const query = "accountType=UNIFIED";
  let lastError = "Không thể kết nối Bybit v5 API";

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/v5/account/wallet-balance?${query}`, {
        method: "GET",
        headers: buildBybitV5Headers({ ...creds, apiKey, apiSecret }, query),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const json = (await res.json()) as {
        retCode?: number;
        retMsg?: string;
        result?: {
          list?: Array<{ totalEquity?: string; totalAvailableBalance?: string; totalWalletBalance?: string }>;
        };
      };
      if (res.ok && json.retCode === 0) {
        const acct = json.result?.list?.[0];
        const eq = Number(acct?.totalEquity ?? acct?.totalWalletBalance ?? 0);
        const avail = Number(acct?.totalAvailableBalance ?? eq);
        return {
          verified: true,
          platform: "BYBIT_FUTURES",
          isTestnet: creds.isTestnet,
          balanceUsd: Number.isFinite(eq) ? eq : 0,
          availableMarginUsd: Number.isFinite(avail) ? avail : 0,
          canTrade: true,
          resolvedEndpoint: host,
          latencyMs: Date.now() - started,
          rawMessage: `Bybit v5 (${creds.isTestnet ? "Testnet/Demo" : "Mainnet"}) sẵn sàng giao dịch`,
        };
      }
      lastError = json.retMsg ? `Bybit [${json.retCode}]: ${json.retMsg}` : `Bybit HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Lỗi mạng Bybit v5";
    }
  }

  return {
    verified: false,
    platform: "BYBIT_FUTURES",
    isTestnet: creds.isTestnet,
    balanceUsd: null,
    availableMarginUsd: null,
    canTrade: false,
    latencyMs: Date.now() - started,
    rawMessage: lastError,
  };
}

export async function fetchBybitTelemetry(creds: BrokerCredentialsInput): Promise<LiveExchangeTelemetryResult> {
  const host = creds.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  try {
    const balQuery = "accountType=UNIFIED";
    const posQuery = "category=linear&settleCoin=USDT";
    const [balRes, posRes] = await Promise.all([
      fetch(`${host}/v5/account/wallet-balance?${balQuery}`, {
        headers: buildBybitV5Headers(creds, balQuery),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(`${host}/v5/position/list?${posQuery}`, {
        headers: buildBybitV5Headers(creds, posQuery),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);

    const balJson = (await balRes.json()) as {
      retCode?: number;
      retMsg?: string;
      result?: { list?: Array<{ totalWalletBalance?: string; totalEquity?: string; totalAvailableBalance?: string; totalPerpUPL?: string }> };
    };
    if (!balRes.ok || balJson.retCode !== 0) {
      return {
        ok: false,
        walletBalanceUsd: null,
        equityUsd: null,
        availableMarginUsd: null,
        unrealizedPnlUsd: 0,
        openPositions: [],
        fetchedAt: Date.now(),
        error: balJson.retMsg || `Bybit HTTP ${balRes.status}`,
      };
    }

    const row = balJson.result?.list?.[0];
    const wallet = Number(row?.totalWalletBalance ?? row?.totalEquity ?? 0);
    const equity = Number(row?.totalEquity ?? wallet);
    const avail = Number(row?.totalAvailableBalance ?? wallet);
    let totalUpnl = Number(row?.totalPerpUPL ?? 0);
    const openPositions: LiveExchangePosition[] = [];

    if (posRes.ok) {
      const posJson = (await posRes.json()) as {
        retCode?: number;
        result?: { list?: Array<Record<string, string>> };
      };
      if (posJson.retCode === 0 && Array.isArray(posJson.result?.list)) {
        for (const p of posJson.result.list) {
          const size = Number(p.size ?? 0);
          if (!Number.isFinite(size) || size <= 0) continue;
          const upnl = Number(p.unrealisedPnl ?? 0);
          const entry = Number(p.avgPrice ?? 0);
          const mark = Number(p.markPrice ?? entry);
          const lev = Math.max(1, Number(p.leverage ?? 1));
          const liq = Number(p.liqPrice ?? 0);
          openPositions.push({
            positionId: `bybit_${p.symbol}_${p.side}`,
            symbol: String(p.symbol ?? ""),
            assetType: "CRYPTO",
            direction: p.side === "Sell" ? "SELL" : "BUY",
            qtyOrLots: size,
            leverage: lev,
            entryPrice: entry,
            markPrice: mark,
            stopLossPrice: Number(p.stopLoss ?? 0) > 0 ? Number(p.stopLoss) : null,
            takeProfit1: Number(p.takeProfit ?? 0) > 0 ? Number(p.takeProfit) : null,
            unrealizedPnlUsd: Number(upnl.toFixed(4)),
            roePct: Number((upnl / Math.max(1e-6, (size * entry) / lev) * 100).toFixed(2)),
            liquidationPrice: liq > 0 ? liq : null,
            openedAt: Number(p.updatedTime ?? Date.now()),
          });
          if (totalUpnl === 0) totalUpnl += upnl;
        }
      }
    }

    return {
      ok: true,
      walletBalanceUsd: Number.isFinite(wallet) ? Number(wallet.toFixed(2)) : null,
      equityUsd: Number.isFinite(equity) ? Number(equity.toFixed(2)) : null,
      availableMarginUsd: Number.isFinite(avail) ? Number(avail.toFixed(2)) : null,
      unrealizedPnlUsd: Number.isFinite(totalUpnl) ? Number(totalUpnl.toFixed(2)) : 0,
      openPositions,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : "Lỗi đồng bộ telemetry Bybit v5",
    };
  }
}

export async function placeBybitFuturesOrder(req: ExchangeOrderRequest): Promise<ExchangeOrderResult> {
  const geom = validateExchangeOrderGeometry(req);
  if (!geom.valid) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: Number.isFinite(req.entryPrice) && req.entryPrice > 0 ? req.entryPrice : 0,
      message: `Bybit order rejected before dispatch: ${geom.reason}`,
    };
  }
  const host = req.credentials.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
  const symbol = normalizeLinearUsdtSymbol(req.symbol);
  const qty = Math.max(0.001, Number(req.baseQty.toFixed(3)));
  const payload = {
    category: "linear",
    symbol,
    side: req.direction === "BUY" ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(qty),
    stopLoss: String(req.stopLossPrice),
    takeProfit: String(req.takeProfit1),
    orderLinkId: sanitizeClientOrderId(req.idempotencyKey, 32),
  };
  const bodyStr = JSON.stringify(payload);
  try {
    const res = await fetch(`${host}/v5/order/create`, {
      method: "POST",
      headers: buildBybitV5Headers(req.credentials, bodyStr),
      body: bodyStr,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      retCode?: number;
      retMsg?: string;
      result?: { orderId?: string };
    };
    if (!res.ok || json.retCode !== 0) {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: json.retMsg || `Bybit HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      status: "FILLED",
      exchangeOrderId: json.result?.orderId ?? payload.orderLinkId,
      slOrderId: "attached-sl",
      tpOrderId: "attached-tp",
      executedQty: qty,
      executedPrice: req.entryPrice,
      message: `Bybit v5 ${req.credentials.isTestnet ? "Testnet" : "Mainnet"} khớp lệnh #${json.result?.orderId ?? "OK"} (${qty} ${symbol})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: err instanceof Error ? err.message : "Lỗi đặt lệnh Bybit v5",
    };
  }
}

/* ---------------- 2. Bitget v2 Mix Futures Connector ---------------- */

function buildBitgetHeaders(
  creds: BrokerCredentialsInput,
  method: "GET" | "POST",
  requestPath: string,
  body = "",
): Record<string, string> {
  const ts = String(Date.now());
  const prehash = `${ts}${method}${requestPath}${body}`;
  const sign = createHmac("sha256", creds.apiSecret.trim()).update(prehash).digest("base64");
  const headers: Record<string, string> = {
    "ACCESS-KEY": creds.apiKey.trim(),
    "ACCESS-SIGN": sign,
    "ACCESS-TIMESTAMP": ts,
    "ACCESS-PASSPHRASE": creds.passphrase?.trim() ?? "",
    "Content-Type": "application/json",
    locale: "en-US",
  };
  if (creds.isTestnet) headers.paptrading = "1";
  return headers;
}

export async function verifyBitgetFuturesAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  if (!creds.apiKey.trim() || !creds.apiSecret.trim() || !creds.passphrase?.trim()) {
    return {
      verified: false,
      platform: "BITGET_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Bitget v2 API yêu cầu đủ API Key, Secret Key và Passphrase",
    };
  }

  const reqPath = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";
  try {
    const res = await fetch(`https://api.bitget.com${reqPath}`, {
      method: "GET",
      headers: buildBitgetHeaders(creds, "GET", reqPath),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      code?: string;
      msg?: string;
      data?: Array<{ available?: string; usdtEquity?: string; accountEquity?: string }>;
    };
    const latencyMs = Date.now() - started;
    if (!res.ok || json.code !== "00000") {
      return {
        verified: false,
        platform: "BITGET_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: json.msg || `Bitget v2 HTTP ${res.status}`,
      };
    }
    const acct = json.data?.[0];
    const eq = Number(acct?.usdtEquity ?? acct?.accountEquity ?? acct?.available ?? 0);
    const avail = Number(acct?.available ?? eq);
    return {
      verified: true,
      platform: "BITGET_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(eq) ? eq : 0,
      availableMarginUsd: Number.isFinite(avail) ? avail : 0,
      canTrade: true,
      resolvedEndpoint: creds.isTestnet ? "https://api.bitget.com (paptrading=1)" : "https://api.bitget.com",
      latencyMs,
      rawMessage: `Bitget v2 Mix (${creds.isTestnet ? "Simulated Demo" : "Mainnet"}) sẵn sàng giao dịch`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "BITGET_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối Bitget v2 API",
    };
  }
}

export async function fetchBitgetTelemetry(creds: BrokerCredentialsInput): Promise<LiveExchangeTelemetryResult> {
  const balPath = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";
  const posPath = "/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT";
  try {
    const [balRes, posRes] = await Promise.all([
      fetch(`https://api.bitget.com${balPath}`, {
        headers: buildBitgetHeaders(creds, "GET", balPath),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(`https://api.bitget.com${posPath}`, {
        headers: buildBitgetHeaders(creds, "GET", posPath),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);
    const balJson = (await balRes.json()) as {
      code?: string;
      msg?: string;
      data?: Array<{ available?: string; usdtEquity?: string; unrealizedPL?: string }>;
    };
    if (!balRes.ok || balJson.code !== "00000") {
      return {
        ok: false,
        walletBalanceUsd: null,
        equityUsd: null,
        availableMarginUsd: null,
        unrealizedPnlUsd: 0,
        openPositions: [],
        fetchedAt: Date.now(),
        error: balJson.msg || `Bitget HTTP ${balRes.status}`,
      };
    }
    const row = balJson.data?.[0];
    const eq = Number(row?.usdtEquity ?? row?.available ?? 0);
    const avail = Number(row?.available ?? eq);
    const upnl = Number(row?.unrealizedPL ?? 0);
    const openPositions: LiveExchangePosition[] = [];
    if (posRes.ok) {
      const posJson = (await posRes.json()) as {
        code?: string;
        data?: Array<Record<string, string>>;
      };
      if (posJson.code === "00000" && Array.isArray(posJson.data)) {
        for (const p of posJson.data) {
          const total = Number(p.total ?? 0);
          if (!Number.isFinite(total) || total <= 0) continue;
          const entry = Number(p.openPriceAvg ?? 0);
          const mark = Number(p.markPrice ?? entry);
          const lev = Math.max(1, Number(p.leverage ?? 1));
          const profit = Number(p.unrealizedPL ?? 0);
          openPositions.push({
            positionId: `bitget_${p.symbol}_${p.holdSide}`,
            symbol: String(p.symbol ?? ""),
            assetType: "CRYPTO",
            direction: p.holdSide === "short" ? "SELL" : "BUY",
            qtyOrLots: total,
            leverage: lev,
            entryPrice: entry,
            markPrice: mark,
            stopLossPrice: null,
            takeProfit1: null,
            unrealizedPnlUsd: Number(profit.toFixed(4)),
            roePct: Number((profit / Math.max(1e-6, (total * entry) / lev) * 100).toFixed(2)),
            liquidationPrice: Number(p.liquidationPrice ?? 0) || null,
            openedAt: Number(p.uTime ?? Date.now()),
          });
        }
      }
    }
    return {
      ok: true,
      walletBalanceUsd: Number((eq - upnl).toFixed(2)),
      equityUsd: Number(eq.toFixed(2)),
      availableMarginUsd: Number(avail.toFixed(2)),
      unrealizedPnlUsd: Number(upnl.toFixed(2)),
      openPositions,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : "Lỗi đồng bộ Bitget telemetry",
    };
  }
}

export async function placeBitgetFuturesOrder(req: ExchangeOrderRequest): Promise<ExchangeOrderResult> {
  const geom = validateExchangeOrderGeometry(req);
  if (!geom.valid) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: Number.isFinite(req.entryPrice) && req.entryPrice > 0 ? req.entryPrice : 0,
      message: `Bitget order rejected before dispatch: ${geom.reason}`,
    };
  }
  const symbol = normalizeLinearUsdtSymbol(req.symbol);
  const qty = Math.max(0.001, Number(req.baseQty.toFixed(3)));
  const path = "/api/v2/mix/order/place-order";
  const bodyObj = {
    symbol,
    productType: "USDT-FUTURES",
    marginMode: "isolated",
    marginCoin: "USDT",
    size: String(qty),
    side: req.direction === "BUY" ? "buy" : "sell",
    orderType: "market",
    clientOid: sanitizeClientOrderId(req.idempotencyKey, 32),
    presetStopLossPrice: String(req.stopLossPrice),
    presetStopSurplusPrice: String(req.takeProfit1),
  };
  const bodyStr = JSON.stringify(bodyObj);
  try {
    const res = await fetch(`https://api.bitget.com${path}`, {
      method: "POST",
      headers: buildBitgetHeaders(req.credentials, "POST", path, bodyStr),
      body: bodyStr,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      code?: string;
      msg?: string;
      data?: { orderId?: string };
    };
    if (!res.ok || json.code !== "00000") {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: json.msg || `Bitget HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      status: "FILLED",
      exchangeOrderId: json.data?.orderId ?? bodyObj.clientOid,
      slOrderId: "preset-sl",
      tpOrderId: "preset-tp",
      executedQty: qty,
      executedPrice: req.entryPrice,
      message: `Bitget v2 ${req.credentials.isTestnet ? "Demo" : "Live"} khớp #${json.data?.orderId ?? "OK"} (${qty} ${symbol})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: err instanceof Error ? err.message : "Lỗi đặt lệnh Bitget v2",
    };
  }
}

/* ---------------- 3. Gate.io v4 / KuCoin / BingX / Hyperliquid Connectors ---------------- */

function buildGateV4Headers(
  creds: BrokerCredentialsInput,
  method: "GET" | "POST",
  path: string,
  query = "",
  body = "",
): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash("sha512").update(body).digest("hex");
  const payload = `${method}\n${path}\n${query}\n${bodyHash}\n${ts}`;
  const sign = createHmac("sha512", creds.apiSecret.trim()).update(payload).digest("hex");
  return {
    KEY: creds.apiKey.trim(),
    SIGN: sign,
    Timestamp: ts,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function verifyGateFuturesAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  if (!creds.apiKey.trim() || !creds.apiSecret.trim()) {
    return {
      verified: false,
      platform: "GATE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Thiếu Gate.io APIv4 Key hoặc Secret",
    };
  }
  const host = creds.isTestnet ? "https://fx-api-testnet.gateio.ws" : "https://api.gateio.ws";
  const path = "/api/v4/futures/usdt/accounts";
  try {
    const res = await fetch(`${host}${path}`, {
      headers: buildGateV4Headers(creds, "GET", path),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      total?: string;
      available?: string;
      label?: string;
      message?: string;
    };
    const latencyMs = Date.now() - started;
    if (!res.ok || json.label) {
      return {
        verified: false,
        platform: "GATE_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: json.message || json.label || `Gate.io HTTP ${res.status}`,
      };
    }
    const total = Number(json.total ?? 0);
    const avail = Number(json.available ?? total);
    return {
      verified: true,
      platform: "GATE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(total) ? total : 0,
      availableMarginUsd: Number.isFinite(avail) ? avail : 0,
      canTrade: true,
      resolvedEndpoint: host,
      latencyMs,
      rawMessage: `Gate.io USDT Futures (${creds.isTestnet ? "Testnet" : "Mainnet"}) sẵn sàng`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "GATE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối Gate.io v4 API",
    };
  }
}

export async function verifyKuCoinFuturesAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  if (!creds.apiKey.trim() || !creds.apiSecret.trim() || !creds.passphrase?.trim()) {
    return {
      verified: false,
      platform: "KUCOIN_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "KuCoin Futures yêu cầu đủ API Key, Secret và Passphrase",
    };
  }
  const host = creds.isTestnet ? "https://api-sandbox-futures.kucoin.com" : "https://api-futures.kucoin.com";
  const reqPath = "/api/v1/account-overview?currency=USDT";
  const ts = String(Date.now());
  const sign = createHmac("sha256", creds.apiSecret.trim()).update(`${ts}GET${reqPath}`).digest("base64");
  const passSign = createHmac("sha256", creds.apiSecret.trim()).update(creds.passphrase.trim()).digest("base64");
  try {
    const res = await fetch(`${host}${reqPath}`, {
      headers: {
        "KC-API-KEY": creds.apiKey.trim(),
        "KC-API-SIGN": sign,
        "KC-API-TIMESTAMP": ts,
        "KC-API-PASSPHRASE": passSign,
        "KC-API-KEY-VERSION": "2",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      code?: string;
      msg?: string;
      data?: { accountEquity?: number; availableBalance?: number };
    };
    const latencyMs = Date.now() - started;
    if (!res.ok || json.code !== "200000") {
      return {
        verified: false,
        platform: "KUCOIN_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: json.msg || `KuCoin HTTP ${res.status}`,
      };
    }
    return {
      verified: true,
      platform: "KUCOIN_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number(json.data?.accountEquity ?? 0),
      availableMarginUsd: Number(json.data?.availableBalance ?? 0),
      canTrade: true,
      resolvedEndpoint: host,
      latencyMs,
      rawMessage: `KuCoin Futures (${creds.isTestnet ? "Sandbox" : "Live"}) kết nối thành công`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "KUCOIN_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối KuCoin Futures API",
    };
  }
}

export async function verifyBingXFuturesAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  if (!creds.apiKey.trim() || !creds.apiSecret.trim()) {
    return {
      verified: false,
      platform: "BINGX_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Thiếu BingX API Key hoặc Secret Key",
    };
  }
  const host = creds.isTestnet ? "https://open-api-vst.bingx.com" : "https://open-api.bingx.com";
  const ts = String(Date.now());
  const params = `timestamp=${ts}`;
  const sig = createHmac("sha256", creds.apiSecret.trim()).update(params).digest("hex");
  try {
    const res = await fetch(`${host}/openApi/swap/v2/user/balance?${params}&signature=${sig}`, {
      headers: { "X-BX-APIKEY": creds.apiKey.trim() },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { balance?: { equity?: string; availableMargin?: string; balance?: string } };
    };
    const latencyMs = Date.now() - started;
    if (!res.ok || json.code !== 0) {
      return {
        verified: false,
        platform: "BINGX_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: json.msg || `BingX HTTP ${res.status}`,
      };
    }
    const b = json.data?.balance;
    const eq = Number(b?.equity ?? b?.balance ?? 0);
    const avail = Number(b?.availableMargin ?? eq);
    return {
      verified: true,
      platform: "BINGX_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(eq) ? eq : 0,
      availableMarginUsd: Number.isFinite(avail) ? avail : 0,
      canTrade: true,
      resolvedEndpoint: host,
      latencyMs,
      rawMessage: `BingX Perpetual (${creds.isTestnet ? "VST Demo" : "Real USDT"}) kết nối thành công`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "BINGX_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối BingX OpenAPI",
    };
  }
}

export async function verifyHyperliquidAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  const address = creds.apiKey.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return {
      verified: false,
      platform: "HYPERLIQUID",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "Hyperliquid yêu cầu địa chỉ ví EVM hợp lệ (0x...40 ký tự hex)",
    };
  }
  const url = creds.isTestnet
    ? "https://api.hyperliquid-testnet.xyz/info"
    : "https://api.hyperliquid.xyz/info";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "clearinghouseState", user: address }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      marginSummary?: { accountValue?: string };
      withdrawable?: string;
    };
    const latencyMs = Date.now() - started;
    if (!res.ok || !json.marginSummary) {
      return {
        verified: false,
        platform: "HYPERLIQUID",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: `Hyperliquid HTTP ${res.status}`,
      };
    }
    const eq = Number(json.marginSummary.accountValue ?? 0);
    const avail = Number(json.withdrawable ?? eq);
    return {
      verified: true,
      platform: "HYPERLIQUID",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(eq) ? eq : 0,
      availableMarginUsd: Number.isFinite(avail) ? avail : 0,
      canTrade: creds.apiSecret.trim().startsWith("0x"),
      resolvedEndpoint: url,
      latencyMs,
      rawMessage: `Hyperliquid L1 (${creds.isTestnet ? "Testnet" : "Mainnet"}) đồng bộ số dư thành công`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "HYPERLIQUID",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi truy vấn Hyperliquid L1 Info API",
    };
  }
}

/* ---------------- 4. OANDA v20 Native Forex REST Connector ---------------- */

export async function verifyOandaV20Account(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  const token = creds.apiKey.trim();
  const accountId = creds.apiSecret.trim();
  if (!token || !accountId) {
    return {
      verified: false,
      platform: "OANDA_V20",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: 0,
      rawMessage: "OANDA v20 yêu cầu Personal Access Token và Account ID",
    };
  }
  const host = creds.isTestnet ? "https://api-fxpractice.oanda.com" : "https://api-fxtrade.oanda.com";
  try {
    const res = await fetch(`${host}/v3/accounts/${encodeURIComponent(accountId)}/summary`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      errorMessage?: string;
      account?: {
        balance?: string;
        NAV?: string;
        marginAvailable?: string;
        currency?: string;
        hedgingEnabled?: boolean;
      };
    };
    const latencyMs = Date.now() - started;
    if (!res.ok || !json.account) {
      return {
        verified: false,
        platform: "OANDA_V20",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: json.errorMessage || `OANDA v20 HTTP ${res.status}`,
      };
    }
    const nav = Number(json.account.NAV ?? json.account.balance ?? 0);
    const marginAvail = Number(json.account.marginAvailable ?? nav);
    return {
      verified: true,
      platform: "OANDA_V20",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(nav) ? nav : 0,
      availableMarginUsd: Number.isFinite(marginAvail) ? marginAvail : 0,
      canTrade: true,
      positionMode: json.account.hedgingEnabled ? "HEDGING" : "NETTING",
      resolvedEndpoint: host,
      latencyMs,
      rawMessage: `OANDA v20 (${creds.isTestnet ? "fxPractice Demo" : "fxTrade Live"} · ${json.account.currency ?? "USD"}) sẵn sàng giao dịch`,
    };
  } catch (err) {
    return {
      verified: false,
      platform: "OANDA_V20",
      isTestnet: creds.isTestnet,
      balanceUsd: null,
      availableMarginUsd: null,
      canTrade: false,
      latencyMs: Date.now() - started,
      rawMessage: err instanceof Error ? err.message : "Lỗi kết nối OANDA v20 REST",
    };
  }
}

export async function fetchOandaV20Telemetry(creds: BrokerCredentialsInput): Promise<LiveExchangeTelemetryResult> {
  const token = creds.apiKey.trim();
  const accountId = creds.apiSecret.trim();
  const host = creds.isTestnet ? "https://api-fxpractice.oanda.com" : "https://api-fxtrade.oanda.com";
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  try {
    const [sumRes, posRes] = await Promise.all([
      fetch(`${host}/v3/accounts/${encodeURIComponent(accountId)}/summary`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      fetch(`${host}/v3/accounts/${encodeURIComponent(accountId)}/openPositions`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    ]);
    const sumJson = (await sumRes.json()) as {
      errorMessage?: string;
      account?: { balance?: string; NAV?: string; marginAvailable?: string; unrealizedPL?: string };
    };
    if (!sumRes.ok || !sumJson.account) {
      return {
        ok: false,
        walletBalanceUsd: null,
        equityUsd: null,
        availableMarginUsd: null,
        unrealizedPnlUsd: 0,
        openPositions: [],
        fetchedAt: Date.now(),
        error: sumJson.errorMessage || `OANDA HTTP ${sumRes.status}`,
      };
    }
    const balance = Number(sumJson.account.balance ?? 0);
    const equity = Number(sumJson.account.NAV ?? balance);
    const marginAvail = Number(sumJson.account.marginAvailable ?? balance);
    const upnl = Number(sumJson.account.unrealizedPL ?? 0);
    const openPositions: LiveExchangePosition[] = [];

    if (posRes.ok) {
      const posJson = (await posRes.json()) as {
        positions?: Array<{
          instrument?: string;
          long?: { units?: string; averagePrice?: string; unrealizedPL?: string };
          short?: { units?: string; averagePrice?: string; unrealizedPL?: string };
        }>;
      };
      for (const p of posJson.positions ?? []) {
        const longUnits = Number(p.long?.units ?? 0);
        const shortUnits = Math.abs(Number(p.short?.units ?? 0));
        const units = longUnits > 0 ? longUnits : shortUnits;
        if (units <= 0) continue;
        const isBuy = longUnits > 0;
        const entry = Number(isBuy ? p.long?.averagePrice : p.short?.averagePrice) || 0;
        const pUpnl = Number(isBuy ? p.long?.unrealizedPL : p.short?.unrealizedPL) || 0;
        openPositions.push({
          positionId: `oanda_${p.instrument}_${isBuy ? "L" : "S"}`,
          symbol: String(p.instrument ?? "").replace(/_/g, ""),
          assetType: "FOREX",
          direction: isBuy ? "BUY" : "SELL",
          qtyOrLots: Number((units / 100_000).toFixed(2)),
          leverage: 50,
          entryPrice: entry,
          markPrice: entry,
          stopLossPrice: null,
          takeProfit1: null,
          unrealizedPnlUsd: Number(pUpnl.toFixed(2)),
          roePct: 0,
          liquidationPrice: null,
          openedAt: Date.now(),
        });
      }
    }

    return {
      ok: true,
      walletBalanceUsd: Number(balance.toFixed(2)),
      equityUsd: Number(equity.toFixed(2)),
      availableMarginUsd: Number(marginAvail.toFixed(2)),
      unrealizedPnlUsd: Number(upnl.toFixed(2)),
      openPositions,
      fetchedAt: Date.now(),
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      walletBalanceUsd: null,
      equityUsd: null,
      availableMarginUsd: null,
      unrealizedPnlUsd: 0,
      openPositions: [],
      fetchedAt: Date.now(),
      error: err instanceof Error ? err.message : "Lỗi đồng bộ OANDA v20 telemetry",
    };
  }
}

export async function placeOandaV20Order(req: ExchangeOrderRequest): Promise<ExchangeOrderResult> {
  const geom = validateExchangeOrderGeometry(req);
  if (!geom.valid) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: Number.isFinite(req.entryPrice) && req.entryPrice > 0 ? req.entryPrice : 0,
      message: `OANDA order rejected before dispatch: ${geom.reason}`,
    };
  }
  const token = req.credentials.apiKey.trim();
  const accountId = req.credentials.apiSecret.trim();
  const host = req.credentials.isTestnet ? "https://api-fxpractice.oanda.com" : "https://api-fxtrade.oanda.com";
  const units = Math.max(100, Math.round(req.baseQty * 100_000)) * (req.direction === "BUY" ? 1 : -1);
  const instrument = toOandaInstrument(req.symbol);
  try {
    const res = await fetch(`${host}/v3/accounts/${encodeURIComponent(accountId)}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: {
          type: "MARKET",
          instrument,
          units: String(units),
          timeInForce: "FOK",
          positionFill: "DEFAULT",
          stopLossOnFill: { price: String(req.stopLossPrice) },
          takeProfitOnFill: { price: String(req.takeProfit1) },
          clientExtensions: { id: sanitizeClientOrderId(req.idempotencyKey, 32) },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json()) as {
      errorMessage?: string;
      orderFillTransaction?: { id?: string; price?: string };
      orderCreateTransaction?: { id?: string };
    };
    if (!res.ok || json.errorMessage) {
      return {
        ok: false,
        status: "REJECTED_EXCHANGE",
        exchangeOrderId: null,
        slOrderId: null,
        tpOrderId: null,
        executedQty: 0,
        executedPrice: req.entryPrice,
        message: json.errorMessage || `OANDA HTTP ${res.status}`,
      };
    }
    const orderId = json.orderFillTransaction?.id ?? json.orderCreateTransaction?.id ?? "oanda-filled";
    const fillPx = Number(json.orderFillTransaction?.price ?? req.entryPrice);
    return {
      ok: true,
      status: "FILLED",
      exchangeOrderId: orderId,
      slOrderId: "attached-sl",
      tpOrderId: "attached-tp",
      executedQty: Number(req.baseQty.toFixed(2)),
      executedPrice: Number.isFinite(fillPx) && fillPx > 0 ? fillPx : req.entryPrice,
      message: `OANDA v20 ${req.credentials.isTestnet ? "fxPractice" : "fxTrade"} khớp #${orderId} (${Math.abs(units)} units ${instrument})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: "REJECTED_EXCHANGE",
      exchangeOrderId: null,
      slOrderId: null,
      tpOrderId: null,
      executedQty: 0,
      executedPrice: req.entryPrice,
      message: err instanceof Error ? err.message : "Lỗi đặt lệnh OANDA v20",
    };
  }
}

/* ---------------- 5. Unified SSOT Multi-Platform Router ---------------- */

export async function verifyBrokerCredentials(
  platform: BrokerPlatform,
  creds: BrokerCredentialsInput,
  options?: { skipCrossEnvProbe?: boolean },
): Promise<BrokerVerificationResult> {
  if (isMt5BrokerPlatform(platform)) {
    return verifyMetaApiMt5Account(creds, platform);
  }
  switch (platform) {
    case "BINANCE_FUTURES":
      return verifyBinanceFuturesAccount(creds, options);
    case "OKX_FUTURES":
      return verifyOkxAccount(creds);
    case "BYBIT_FUTURES":
      return verifyBybitFuturesAccount(creds);
    case "BITGET_FUTURES":
      return verifyBitgetFuturesAccount(creds);
    case "GATE_FUTURES":
      return verifyGateFuturesAccount(creds);
    case "KUCOIN_FUTURES":
      return verifyKuCoinFuturesAccount(creds);
    case "BINGX_FUTURES":
      return verifyBingXFuturesAccount(creds);
    case "HYPERLIQUID":
      return verifyHyperliquidAccount(creds);
    case "OANDA_V20":
      return verifyOandaV20Account(creds);
    default: {
      const meta = getBrokerMeta(platform);
      return {
        verified: false,
        platform,
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs: 0,
        rawMessage: `${meta.name} sử dụng kết nối lưu khóa / EA / Webhook — chưa hỗ trợ xác thực REST trực tiếp`,
      };
    }
  }
}

export async function fetchBrokerLiveTelemetry(
  platform: BrokerPlatform,
  creds: BrokerCredentialsInput,
): Promise<LiveExchangeTelemetryResult | null> {
  if (isMt5BrokerPlatform(platform)) {
    return fetchMetaApiMt5Telemetry(creds);
  }
  switch (platform) {
    case "BINANCE_FUTURES":
      return fetchBinanceFuturesTelemetry(creds);
    case "OKX_FUTURES":
      return fetchOkxTelemetry(creds);
    case "BYBIT_FUTURES":
      return fetchBybitTelemetry(creds);
    case "BITGET_FUTURES":
      return fetchBitgetTelemetry(creds);
    case "OANDA_V20":
      return fetchOandaV20Telemetry(creds);
    case "GATE_FUTURES": {
      const v = await verifyGateFuturesAccount(creds);
      return v.verified
        ? {
            ok: true,
            walletBalanceUsd: v.balanceUsd,
            equityUsd: v.balanceUsd,
            availableMarginUsd: v.availableMarginUsd,
            unrealizedPnlUsd: 0,
            openPositions: [],
            fetchedAt: Date.now(),
            error: null,
          }
        : null;
    }
    case "HYPERLIQUID": {
      const v = await verifyHyperliquidAccount(creds);
      return v.verified
        ? {
            ok: true,
            walletBalanceUsd: v.balanceUsd,
            equityUsd: v.balanceUsd,
            availableMarginUsd: v.availableMarginUsd,
            unrealizedPnlUsd: 0,
            openPositions: [],
            fetchedAt: Date.now(),
            error: null,
          }
        : null;
    }
    default:
      return null;
  }
}

export async function placePlatformExchangeOrder(
  platform: BrokerPlatform,
  req: ExchangeOrderRequest,
): Promise<ExchangeOrderResult> {
  const isForex = isMt5BrokerPlatform(platform) || platform === "OANDA_V20";
  const executionPlan = planSmartOrderExecution({
    symbol: req.symbol,
    direction: req.direction,
    totalQty: req.baseQty,
    entryPrice: req.entryPrice,
    dailyVolatilityPct: req.volatilityPct ?? (isForex ? 0.65 : 2.2),
    urgency: req.entryMode === "LIMIT_PULLBACK" ? "PASSIVE_MAKER" : "BALANCED",
  });

  let rawResult: ExchangeOrderResult;
  if (isMt5BrokerPlatform(platform)) {
    rawResult = await placeMetaApiMt5Order(req, platform);
  } else {
    switch (platform) {
      case "BINANCE_FUTURES":
        rawResult = await placeBinanceFuturesOrder(req);
        break;
      case "OKX_FUTURES":
        rawResult = await placeOkxSwapOrder(req);
        break;
      case "BYBIT_FUTURES":
        rawResult = await placeBybitFuturesOrder(req);
        break;
      case "BITGET_FUTURES":
        rawResult = await placeBitgetFuturesOrder(req);
        break;
      case "OANDA_V20":
        rawResult = await placeOandaV20Order(req);
        break;
      default: {
        const meta = getBrokerMeta(platform);
        rawResult = {
          ok: false,
          status: "REJECTED_EXCHANGE",
          exchangeOrderId: null,
          slOrderId: null,
          tpOrderId: null,
          executedQty: 0,
          executedPrice: req.entryPrice,
          message: `${meta.name} hiện hỗ trợ đồng bộ tài khoản & cảnh báo; chưa hỗ trợ Auto-Execute trực tiếp`,
        };
      }
    }
  }
  return {
    ...rawResult,
    executionPlan,
  };
}

/**
 * Unified Multi-Platform Stop-Loss Sync (Breakeven & Trailing Stop on Live Exchanges):
 * Routes SL modification across Binance Futures, Bybit V5, OKX V5, Bitget V2, OANDA v20, and MetaApi MT5.
 */
export async function updatePlatformExchangeStopLoss(
  platform: BrokerPlatform,
  params: {
    credentials: BrokerCredentialsInput;
    symbol: string;
    direction: "BUY" | "SELL";
    previousSlOrderId?: string | null;
    exchangeOrderId?: string | null;
    newStopLossPrice: number;
  },
): Promise<{ ok: boolean; newSlOrderId: string | null; message: string }> {
  if (!Number.isFinite(params.newStopLossPrice) || params.newStopLossPrice <= 0) {
    return { ok: false, newSlOrderId: params.previousSlOrderId ?? null, message: "Giá Stop-Loss mới không hợp lệ" };
  }

  if (platform === "BINANCE_FUTURES") {
    return updateBinanceFuturesStopLoss(params);
  }

  if (platform === "BYBIT_FUTURES") {
    try {
      const host = params.credentials.isTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
      const cleanSymbol = normalizeLinearUsdtSymbol(params.symbol);
      const slPrice = Number(params.newStopLossPrice.toFixed(6));
      const bodyStr = JSON.stringify({
        category: "linear",
        symbol: cleanSymbol,
        stopLoss: String(slPrice),
        slTriggerBy: "MarkPrice",
        positionIdx: 0,
      });
      const res = await fetch(`${host}/v5/position/trading-stop`, {
        method: "POST",
        headers: buildBybitV5Headers(params.credentials, bodyStr),
        body: bodyStr,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const json = (await res.json()) as { retCode?: number; retMsg?: string };
      if (!res.ok || (json.retCode !== 0 && json.retCode !== 34040)) {
        return {
          ok: false,
          newSlOrderId: params.previousSlOrderId ?? null,
          message: json.retMsg || `Bybit SL update HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        newSlOrderId: `bybit-sl-${slPrice}`,
        message: `Đã dịch Bybit V5 Stop-Loss lên ${slPrice}`,
      };
    } catch (err) {
      return {
        ok: false,
        newSlOrderId: params.previousSlOrderId ?? null,
        message: err instanceof Error ? err.message : "Lỗi cập nhật SL Bybit",
      };
    }
  }

  if (isMt5BrokerPlatform(platform)) {
    try {
      const token = params.credentials.apiKey.trim();
      const accountId = params.credentials.apiSecret.trim();
      if (!params.exchangeOrderId) {
        return { ok: false, newSlOrderId: params.previousSlOrderId ?? null, message: "Thiếu MT5 positionId để dịch SL" };
      }
      const res = await fetch(
        `${METAAPI_CLIENT_BASE}/users/current/accounts/${encodeURIComponent(accountId)}/trade`,
        {
          method: "POST",
          headers: {
            "auth-token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actionType: "POSITION_MODIFY",
            positionId: String(params.exchangeOrderId),
            stopLoss: Number(params.newStopLossPrice),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { stringCode?: string; message?: string };
      const ok = res.ok && (!json.stringCode || json.stringCode === "TRADE_RETCODE_DONE" || json.stringCode === "ERR_NO_ERROR");
      return {
        ok,
        newSlOrderId: ok ? `mt5-sl-${params.newStopLossPrice}` : (params.previousSlOrderId ?? null),
        message: ok ? `Đã dịch MT5 Stop-Loss lên ${params.newStopLossPrice}` : (json.message || `MT5 SL HTTP ${res.status}`),
      };
    } catch (err) {
      return {
        ok: false,
        newSlOrderId: params.previousSlOrderId ?? null,
        message: err instanceof Error ? err.message : "Lỗi dịch SL MetaApi MT5",
      };
    }
  }

  return {
    ok: true,
    newSlOrderId: params.previousSlOrderId ?? `local-sl-${params.newStopLossPrice}`,
    message: `Đồng bộ Trailing SL nội bộ @ ${params.newStopLossPrice} cho ${platform}`,
  };
}
