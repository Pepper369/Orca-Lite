/**
 * Dynamic Investment Thesis & Signal Falsification Tracker Engine
 * (RKiding/Awesome-finance-skills alphaear-signal-tracker Parity)
 *
 * Implements a state-machine tracking the lifecycle of an investment thesis against incoming
 * real-time market microstructure, macro surprises, order flow shifts, and structural breaks.
 *
 * Lifecycle States:
 * 1. STRENGTHENED: Market dynamics & order flow validate and exceed initial thesis assumptions.
 * 2. UNCHANGED: Thesis remains statistically valid within normal market noise.
 * 3. WEAKENED: Mild counter-flow, momentum exhaustion, or warning signs detected (tightens SL).
 * 4. FALSIFIED: Core premise fundamentally broken (adverse sweep, structure break, opposite macro shock).
 *    -> Triggers EMERGENCY_EXIT before full Stop-Loss is hit, minimizing drawdown.
 */

import { roundPrice, type PrecisionAssetType } from "./asset-precision";

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ThesisState =
  | "STRENGTHENED"
  | "UNCHANGED"
  | "WEAKENED"
  | "FALSIFIED";

export type ThesisActionDirective =
  | "HOLD_AGGRESSIVE"
  | "HOLD_NORMAL"
  | "TIGHTEN_STOP"
  | "EMERGENCY_EXIT";

export interface InvestmentThesisContext {
  orderId: string;
  symbol: string;
  assetType: PrecisionAssetType;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1Price?: number;
  openedTimestampMs: number;
  initialThesis: string;
  initialConvictionScore?: number;
  keyAssumptions?: string[];
}

export interface LiveMarketEvidence {
  currentPrice: number;
  /** Level 2 Order Book Imbalance in [-1.0, 1.0] (positive = buy heavy, negative = sell heavy) */
  orderBookImbalance?: number;
  /** Short term 5-min percentage return relative to entry */
  recentReturnPct?: number;
  /** Whether an adverse institutional sweep / liquidation spike was detected */
  adverseSweepDetected?: boolean;
  /** Macro economic surprise / news shock direction */
  macroNewsShockDirection?: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** Whether the underlying market structure / trend was broken (MSS Reversal) */
  structureBroken?: boolean;
  /** Time held in minutes */
  holdingMinutes?: number;
  /** Asset ATR for distance normalization */
  atr?: number;
}

export interface ThesisEvaluationResult {
  orderId: string;
  symbol: string;
  direction: "BUY" | "SELL";
  status: ThesisState;
  actionDirective: ThesisActionDirective;
  convictionScore: number; // [0, 100]
  falsificationReasons: string[];
  recommendedSlAdjustment?: number;
  narrativeVi: string;
}

// ============================================================================
// 1. Core Thesis Evaluation State Machine
// ============================================================================

/**
 * Evaluates whether an open trade's initial thesis remains sound or has been falsified.
 */
export function evaluateSignalThesisState(
  thesis: InvestmentThesisContext,
  evidence: LiveMarketEvidence,
): ThesisEvaluationResult {
  const {
    orderId,
    symbol,
    assetType,
    direction,
    entryPrice,
    stopLossPrice,
    takeProfit1Price,
  } = thesis;

  const {
    currentPrice,
    orderBookImbalance = 0.0,
    recentReturnPct,
    adverseSweepDetected = false,
    macroNewsShockDirection = "NEUTRAL",
    structureBroken = false,
    holdingMinutes = 0,
    atr,
  } = evidence;

  const isBuy = direction === "BUY";
  const falsificationReasons: string[] = [];
  let convictionScore = thesis.initialConvictionScore ?? 75;

  // 1. Check Fundamental Structural Invalidation (Hard Falsification)
  if (structureBroken) {
    falsificationReasons.push("Cấu trúc thị trường bị phá vỡ (Market Structure Shift ngược chiều lệnh)");
    convictionScore -= 50;
  }

  // 2. Adverse Liquidity Sweep (Stop Hunt / Liquidation Cascade against position)
  if (adverseSweepDetected) {
    falsificationReasons.push("Quét thanh khoản đối kháng quy mô lớn (Adverse Institutional Sweep)");
    convictionScore -= 35;
  }

  // 3. Macro News Shock Conflict
  if (isBuy && macroNewsShockDirection === "BEARISH") {
    falsificationReasons.push("Cú sốc tin tức vĩ mô tiêu cực đối kháng lệnh Mua (Macro News Shock: Bearish)");
    convictionScore -= 30;
  } else if (!isBuy && macroNewsShockDirection === "BULLISH") {
    falsificationReasons.push("Cú sốc tin tức vĩ mô tích cực đối kháng lệnh Bán (Macro News Shock: Bullish)");
    convictionScore -= 30;
  }

  // 4. Order Book Microstructure Flow
  // For BUY: severe negative imbalance (e.g. < -0.45) indicates aggressive sell walls
  if (isBuy && orderBookImbalance <= -0.45) {
    falsificationReasons.push(`Áp lực bán đè áp đảo trên sổ lệnh L2: ${(orderBookImbalance * 100).toFixed(1)}%`);
    convictionScore -= 20;
  } else if (!isBuy && orderBookImbalance >= 0.45) {
    falsificationReasons.push(`Áp lực mua gom áp đảo trên sổ lệnh L2: +${(orderBookImbalance * 100).toFixed(1)}%`);
    convictionScore -= 20;
  }

  // 5. Price Momentum vs Adverse Drift
  const priceMovePct =
    entryPrice > 0
      ? isBuy
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100
      : 0;

  // In-flight confirmation boost
  if (priceMovePct >= 1.5) {
    convictionScore += 20;
  } else if (priceMovePct <= -1.8) {
    convictionScore -= 25;
    falsificationReasons.push(`Giá trượt sâu ngược chiều phân tích: ${priceMovePct.toFixed(2)}%`);
  }

  // Positive macro alignment boost
  if ((isBuy && macroNewsShockDirection === "BULLISH") || (!isBuy && macroNewsShockDirection === "BEARISH")) {
    convictionScore += 15;
  }

  // Favorable orderbook alignment boost
  if ((isBuy && orderBookImbalance >= 0.35) || (!isBuy && orderBookImbalance <= -0.35)) {
    convictionScore += 15;
  }

  convictionScore = Math.max(0, Math.min(100, Math.round(convictionScore)));

  // Determine State Transition
  let status: ThesisState = "UNCHANGED";
  let actionDirective: ThesisActionDirective = "HOLD_NORMAL";
  let recommendedSlAdjustment: number | undefined;

  // Critical Hard Falsification Condition:
  // Either structure is broken, or 2+ severe counter-arguments, or conviction plunged below 30
  if (structureBroken || falsificationReasons.length >= 2 || convictionScore <= 28) {
    status = "FALSIFIED";
    actionDirective = "EMERGENCY_EXIT";
  } else if (falsificationReasons.length === 1 || convictionScore < 50) {
    status = "WEAKENED";
    actionDirective = "TIGHTEN_STOP";

    // Tighten SL conservatively (retain 65% of structural stop room instead of slashing 50% into noise)
    // and only when trade has matured (>= 20m) or already suffered >= 0.35% adverse drift
    if (stopLossPrice > 0 && (holdingMinutes >= 20 || priceMovePct <= -0.35)) {
      const currentSlDist = Math.abs(entryPrice - stopLossPrice);
      const tightenedDist = currentSlDist * 0.65;
      const safeAtr = atr != null && atr > 0 ? atr * 0.85 : tightenedDist;
      const slDistToUse = Math.min(currentSlDist, safeAtr);

      const newSl = isBuy ? entryPrice - slDistToUse : entryPrice + slDistToUse;
      recommendedSlAdjustment = roundPrice(newSl, symbol, assetType);
    }
  } else if (convictionScore >= 82 && priceMovePct > 0.5) {
    status = "STRENGTHENED";
    actionDirective = "HOLD_AGGRESSIVE";
  } else {
    status = "UNCHANGED";
    actionDirective = "HOLD_NORMAL";
  }

  // Compose narrative
  let narrativeVi = "";
  switch (status) {
    case "FALSIFIED":
      narrativeVi = `BÁC BỎ LUẬN ĐIỂM (FALSIFIED): ${falsificationReasons.join("; ")}. Chỉ thị: THOÁT LỆNH KHẨN CẤP để bảo toàn vốn.`;
      break;
    case "WEAKENED":
      narrativeVi = `LUẬN ĐIỂM SUY YẾU (WEAKENED): ${falsificationReasons.join("; ")}. Chỉ thị: SIẾT CHẶT STOP LOSS (dời về ${recommendedSlAdjustment ?? "ngưỡng an toàn"}).`;
      break;
    case "STRENGTHENED":
      narrativeVi = `LUẬN ĐIỂM ĐƯỢC CỦNG CỐ (STRENGTHENED): Dòng tiền và động lượng xác nhận vững chắc (${priceMovePct.toFixed(1)}%). Chỉ thị: TIẾP TỤC NẮM GIỮ TỐI ĐA LỢI NHUẬN.`;
      break;
    case "UNCHANGED":
    default:
      narrativeVi = `LUẬN ĐIỂM KHÔNG ĐỔI (UNCHANGED): Biến động trong giới hạn dung sai thống kê. Chỉ thị: DUY TRÌ VỊ THẾ BÌNH THƯỜNG.`;
      break;
  }

  return {
    orderId,
    symbol,
    direction,
    status,
    actionDirective,
    convictionScore,
    falsificationReasons,
    recommendedSlAdjustment,
    narrativeVi,
  };
}

// ============================================================================
// 2. Batch Position Evaluation Helper
// ============================================================================

export interface MinimalOrderForThesis {
  orderId: string;
  symbol: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice?: number;
  takeProfit1?: number;
  timestamp: number;
  message?: string;
}

/**
 * Creates a baseline InvestmentThesisContext from an execution order.
 */
export function createDefaultThesisContext(
  order: MinimalOrderForThesis,
  assetType: PrecisionAssetType = "FOREX",
): InvestmentThesisContext {
  const initialThesis = order.message && order.message.length > 5
    ? order.message
    : `Quantitative Precision Entry (${order.direction} ${order.symbol})`;

  return {
    orderId: order.orderId,
    symbol: order.symbol,
    assetType,
    direction: order.direction,
    entryPrice: order.entryPrice,
    stopLossPrice: order.stopLossPrice ?? 0,
    takeProfit1Price: order.takeProfit1,
    openedTimestampMs: order.timestamp,
    initialThesis,
    initialConvictionScore: 75,
  };
}
