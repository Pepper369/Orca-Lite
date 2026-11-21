import { createHmac } from "node:crypto";
import { calculateAlmgrenChrissExecution } from "./advanced-quant-math";
import { generateMakerPeggingGuide } from "./quant-reversal-pace";

export interface BrokerCredentialsInput {
  apiKey: string;
  apiSecret: string;
  passphrase?: string | null;
  isTestnet: boolean;
}

export interface BrokerVerificationResult {
  verified: boolean;
  platform: "BINANCE_FUTURES" | "OKX_FUTURES" | "MT5_EXNESS" | "MT5_XM" | "MT5_EA";
  isTestnet: boolean;
  balanceUsd: number | null;
  availableMarginUsd: number | null;
  canTrade: boolean;
  positionMode?: string;
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
}

const SLIPPAGE_TELEMETRY_BUFFER: ExecutionSlippageSample[] = [];
const MAX_SLIPPAGE_TELEMETRY_SAMPLES = 250;

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

  const n = list.length;
  if (n === 0) {
    return {
      sampleCount: 0,
      avgSlippageBps: 0,
      p95SlippageBps: 0,
      empiricalFrictionR: 0.06,
      recommendedFrictionROverride: null,
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
    sampleCount: n,
    avgSlippageBps,
    p95SlippageBps,
    empiricalFrictionR,
    recommendedFrictionROverride: n >= 3 ? empiricalFrictionR : null,
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

function getBinanceBaseUrl(isTestnet: boolean): string {
  return isTestnet ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
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

export async function verifyBinanceFuturesAccount(
  creds: BrokerCredentialsInput,
): Promise<BrokerVerificationResult> {
  const started = Date.now();
  const baseUrl = getBinanceBaseUrl(creds.isTestnet);
  const qs = `timestamp=${Date.now()}&recvWindow=5000`;
  const sig = signBinanceQuery(qs, creds.apiSecret);

  try {
    const res = await fetch(`${baseUrl}/fapi/v2/account?${qs}&signature=${sig}`, {
      method: "GET",
      headers: { "X-MBX-APIKEY": creds.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const latencyMs = Date.now() - started;

    if (!res.ok || typeof json.code === "number") {
      return {
        verified: false,
        platform: "BINANCE_FUTURES",
        isTestnet: creds.isTestnet,
        balanceUsd: null,
        availableMarginUsd: null,
        canTrade: false,
        latencyMs,
        rawMessage: String(json.msg ?? `Binance HTTP ${res.status}`),
      };
    }

    const totalWallet = Number(json.totalWalletBalance ?? json.totalMarginBalance ?? 0);
    const available = Number(json.availableBalance ?? 0);
    const canTrade = Boolean(json.canTrade);

    return {
      verified: true,
      platform: "BINANCE_FUTURES",
      isTestnet: creds.isTestnet,
      balanceUsd: Number.isFinite(totalWallet) ? totalWallet : 0,
      availableMarginUsd: Number.isFinite(available) ? available : 0,
      canTrade,
      latencyMs,
      rawMessage: canTrade
        ? `Binance ${creds.isTestnet ? "Testnet" : "Mainnet"} Futures sẵn sàng giao dịch`
        : "Kết nối thành công nhưng API Key chưa bật quyền Enable Futures Trading",
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
  const baseUrl = getBinanceBaseUrl(req.credentials.isTestnet);
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
    const levQs = `symbol=${symbol}&leverage=${lev}&timestamp=${Date.now()}&recvWindow=5000`;
    await fetch(`${baseUrl}/fapi/v1/leverage?${levQs}&signature=${signBinanceQuery(levQs, req.credentials.apiSecret)}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": req.credentials.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const clientOrderId = sanitizeClientOrderId(req.idempotencyKey, 32);
    const entryParams = new URLSearchParams({
      symbol,
      side: req.direction,
      type: "MARKET",
      quantity: String(qty),
      newClientOrderId: clientOrderId,
      timestamp: String(Date.now()),
      recvWindow: "5000",
    });
    const entryQs = entryParams.toString();
    const entryRes = await fetch(
      `${baseUrl}/fapi/v1/order?${entryQs}&signature=${signBinanceQuery(entryQs, req.credentials.apiSecret)}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": req.credentials.apiKey },
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
      const p = new URLSearchParams({
        symbol,
        side: exitSide,
        type: "STOP_MARKET",
        stopPrice: String(stopPrice),
        closePosition: "true",
        workingType: "MARK_PRICE",
        timestamp: String(Date.now()),
        recvWindow: "5000",
      });
      const q = p.toString();
      const r = await fetch(
        `${baseUrl}/fapi/v1/order?${q}&signature=${signBinanceQuery(q, req.credentials.apiSecret)}`,
        {
          method: "POST",
          headers: { "X-MBX-APIKEY": req.credentials.apiKey },
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
      const p = new URLSearchParams({
        symbol,
        side: exitSide,
        type: "TAKE_PROFIT_MARKET",
        stopPrice: String(chunk.price),
        workingType: "MARK_PRICE",
        timestamp: String(Date.now()),
        recvWindow: "5000",
      });
      if (chunk.closePosition) {
        p.set("closePosition", "true");
      } else {
        p.set("quantity", String(chunk.qty));
        p.set("reduceOnly", "true");
      }
      const q = p.toString();
      const r = await fetch(
        `${baseUrl}/fapi/v1/order?${q}&signature=${signBinanceQuery(q, req.credentials.apiSecret)}`,
        {
          method: "POST",
          headers: { "X-MBX-APIKEY": req.credentials.apiKey },
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
  const baseUrl = getBinanceBaseUrl(params.credentials.isTestnet);
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
      const cancelQs = `symbol=${symbol}&orderId=${params.previousSlOrderId}&timestamp=${Date.now()}&recvWindow=5000`;
      await fetch(
        `${baseUrl}/fapi/v1/order?${cancelQs}&signature=${signBinanceQuery(cancelQs, params.credentials.apiSecret)}`,
        {
          method: "DELETE",
          headers: { "X-MBX-APIKEY": params.credentials.apiKey },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      ).catch(() => null);
    }

    const exitSide = params.direction === "BUY" ? "SELL" : "BUY";
    const p = new URLSearchParams({
      symbol,
      side: exitSide,
      type: "STOP_MARKET",
      stopPrice: String(nextSl),
      closePosition: "true",
      workingType: "MARK_PRICE",
      timestamp: String(Date.now()),
      recvWindow: "5000",
    });
    const q = p.toString();
    const res = await fetch(
      `${baseUrl}/fapi/v1/order?${q}&signature=${signBinanceQuery(q, params.credentials.apiSecret)}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": params.credentials.apiKey },
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
  platform: "MT5_EXNESS" | "MT5_XM" | "MT5_EA" = "MT5_EXNESS",
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
  platform: "MT5_EXNESS" | "MT5_XM" | "MT5_EA" = "MT5_EXNESS",
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
  const symbol = toMt5BrokerSymbol(req.symbol, req.credentials.passphrase);
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
