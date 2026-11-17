/**
 * CRYPTO ANTI-SLIPPAGE & LIQUIDATION CASCADE SHIELD
 *
 * 2-Layer Protection against devastating crypto slippage:
 * Layer 1: Macro News Circuit Breaker (US CPI, FOMC, Fed Rate Decisions affecting BTC/ETH)
 * Layer 2: Liquidation Cascade Shield (Extreme Funding, Sudden Volatility Spikes, Flash Crash)
 */

import { evaluateNewsCircuitBreaker, type NewsCircuitBreakerResult } from "./forex-news-shield";

export interface CryptoCascadeShieldResult {
  isLockout: boolean;
  reason: "MACRO_NEWS_FREEZE" | "LIQUIDATION_CASCADE_ALERT" | "EXTREME_FUNDING_OVERHEAT" | "NONE";
  stage: "NORMAL" | "FREEZE" | "COOLDOWN";
  warningMessage: string | null;
  slippageBufferPct: number; // e.g. 0.05% normal -> 0.8% during cascades
  recommendedAction: "NORMAL_TRADING" | "CANCEL_PENDING_ORDERS" | "REDUCE_LEVERAGE" | "WAIT_VOLATILITY_COOLING";
  nearestMacroEvent: NewsCircuitBreakerResult["relevantEvent"];
}

/**
 * Evaluates both Macro News Circuit Breaker and Crypto-specific Liquidation Cascade risk.
 */
export function evaluateCryptoShield(params: {
  symbol: string;
  nowMs?: number;
  fundingRate?: number;
  recentPriceChangePct5m?: number;
  calendarEvents?: { name?: string; time?: string; currency?: string; importance?: string }[];
}): CryptoCascadeShieldResult {
  const { symbol, nowMs = Date.now(), fundingRate = 0.0001, recentPriceChangePct5m = 0, calendarEvents = [] } = params;

  // 1. Layer 1: Macro News Shield (BTC/ETH react violently to US Macro News)
  const macroCb = evaluateNewsCircuitBreaker("BTCUSD", nowMs, calendarEvents);
  if (macroCb.isLockout) {
    return {
      isLockout: true,
      reason: "MACRO_NEWS_FREEZE",
      stage: macroCb.stage === "PRE_NEWS_FREEZE" ? "FREEZE" : "COOLDOWN",
      warningMessage: `🚨 KHÓA GIAO DỊCH VĨ MÔ: Sự kiện kinh tế Mỹ [${macroCb.relevantEvent?.name}] đang trong cửa sổ biến động mạnh. Đóng băng mở vị thế mới để tránh trượt giá cực mạnh.`,
      slippageBufferPct: 1.0, // 1% dynamic slippage buffer
      recommendedAction: "CANCEL_PENDING_ORDERS",
      nearestMacroEvent: macroCb.relevantEvent,
    };
  }

  // 2. Layer 2: Extreme Funding Rate Overheat (Liquidation cascade imminent)
  if (fundingRate >= 0.0007 || fundingRate <= -0.0006) {
    return {
      isLockout: true,
      reason: "EXTREME_FUNDING_OVERHEAT",
      stage: "FREEZE",
      warningMessage: `⚠️ CẢNH BÁO NỔ THANH LÝ: Funding Rate phái sinh vượt ngưỡng cực đoan (${(fundingRate * 100).toFixed(4)}%). Thị trường đang tích tụ quả bom thanh lý hai đầu. Khuyến nghị hạ đòn bẩy về < 3x.`,
      slippageBufferPct: 0.75,
      recommendedAction: "REDUCE_LEVERAGE",
      nearestMacroEvent: macroCb.relevantEvent,
    };
  }

  // 3. Layer 3: Rapid 5-minute Volatility Spike (Liquidation cascade in progress)
  if (Math.abs(recentPriceChangePct5m) >= 3.5) {
    return {
      isLockout: true,
      reason: "LIQUIDATION_CASCADE_ALERT",
      stage: "COOLDOWN",
      warningMessage: `⚡ CHẶN ĐUỔI GIÁ (CASCADE IN PROGRESS): Biến động ${recentPriceChangePct5m > 0 ? "+" : ""}${recentPriceChangePct5m.toFixed(2)}% trong 5 phút do bão quét thanh lý đòn bẩy. Không đặt lệnh Limit chặn đầu tàu!`,
      slippageBufferPct: 1.2,
      recommendedAction: "WAIT_VOLATILITY_COOLING",
      nearestMacroEvent: macroCb.relevantEvent,
    };
  }

  // Safe normal state
  return {
    isLockout: false,
    reason: "NONE",
    stage: "NORMAL",
    warningMessage: null,
    slippageBufferPct: 0.05, // Normal 0.05% slippage buffer
    recommendedAction: "NORMAL_TRADING",
    nearestMacroEvent: macroCb.relevantEvent,
  };
}

/**
 * Calculates dynamic slippage buffer in USD based on mark price.
 */
export function calculateCryptoSlippageBufferUsd(
  markPrice: number,
  slippageBufferPct: number
): { bufferUsd: number; maxAllowedSlippageUsd: number } {
  const bufferUsd = Math.round(markPrice * (slippageBufferPct / 100) * 100) / 100;
  const maxAllowedSlippageUsd = Math.round(bufferUsd * 2.5 * 100) / 100;
  return { bufferUsd, maxAllowedSlippageUsd };
}

