/**
 * FOREX QUANTITATIVE POSITION SIZER & RISK MATRIX
 *
 * Implements institutional money management:
 * - Dynamic Pip Value calculation (Direct, Indirect, Cross, & Commodities)
 * - Exact position sizing (Standard, Mini, Micro lots) based on account equity & risk tolerance
 * - Multi-tier Take Profit targets (TP1, TP2, TP3) with partial scale-out projection
 * - Margin requirements and leverage check
 */

export interface CrossRateOverrides {
  usdJpy?: number | null;
  gbpUsd?: number | null;
  usdChf?: number | null;
  usdCad?: number | null;
  audUsd?: number | null;
  nzdUsd?: number | null;
}

export type PipValueSource =
  | "DIRECT_USD"
  | "LIVE_CROSS_RATE"
  | "BOOTSTRAP_FALLBACK";

export interface PositionSizerInput {
  accountBalance: number; // e.g. 10000 (USD)
  riskPercent?: number; // e.g. 1.0 (1%)
  riskAmountUsd?: number; // Alternatively specify exact dollar amount to risk, e.g. $100
  pair: string; // e.g. "EURUSD", "USDJPY", "XAUUSD"
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  leverage?: number; // e.g. 100 (1:100)
  crossRates?: CrossRateOverrides;
}

export interface PositionSizerResult {
  pair: string;
  accountBalance: number;
  riskPercent: number;
  riskAmountUsd: number;
  entryPrice: number;
  stopLossPrice: number;
  stopLossPips: number;
  pipSize: number;
  pipValuePerStandardLot: number;
  pipValueSource?: PipValueSource;
  standardLots: number;
  miniLots: number;
  microLots: number;
  units: number;
  marginRequiredUsd: number;
  leverage: number;
  takeProfitLevels: {
    tp1: { price: number; pips: number; rr: number; projectedProfitUsd: number } | null;
    tp2: { price: number; pips: number; rr: number; projectedProfitUsd: number } | null;
    tp3: { price: number; pips: number; rr: number; projectedProfitUsd: number } | null;
  };
  advice: {
    rule: string;
    actionablePlan: string[];
    riskWarning?: string;
  };
}

/**
 * Get pip size for a given pair.
 * JPY pairs: 0.01
 * Gold (XAUUSD): 0.10
 * Silver (XAGUSD): 0.01
 * Other FX majors/crosses: 0.0001
 */
export function getForexPipSize(pair: string): number {
  const p = pair.toUpperCase().replace("/", "").replace("-", "");
  if (p.includes("JPY")) return 0.01;
  if (p.startsWith("XAU") || p === "GOLD") return 0.1;
  if (p.startsWith("XAG") || p === "SILVER") return 0.01;
  if (p.startsWith("OIL") || p === "USOIL" || p === "UKOIL") return 0.01;
  return 0.0001;
}

export function resolvePipValueUsd(
  pair: string,
  currentPrice: number,
  crossRates?: CrossRateOverrides,
): { pipValueUsd: number; source: PipValueSource } {
  const p = pair.toUpperCase().replace("/", "").replace("-", "");
  const pip = getForexPipSize(p);
  const cur = currentPrice > 0 ? currentPrice : 1.0;

  // Gold / Metals / Energy (USD-settled contracts)
  if (p.startsWith("XAU") || p === "GOLD") {
    return { pipValueUsd: 10.0, source: "DIRECT_USD" };
  }
  if (p.startsWith("XAG") || p === "SILVER") {
    return { pipValueUsd: 50.0, source: "DIRECT_USD" };
  }
  if (p.startsWith("OIL") || p === "USOIL" || p === "UKOIL") {
    return { pipValueUsd: 10.0, source: "DIRECT_USD" };
  }

  // Quote is USD (EURUSD, GBPUSD, AUDUSD, NZDUSD)
  if (p.endsWith("USD")) {
    return { pipValueUsd: 100_000 * pip, source: "DIRECT_USD" };
  }

  // Base is USD (USDJPY, USDCAD, USDCHF)
  if (p.startsWith("USD")) {
    return { pipValueUsd: (100_000 * pip) / cur, source: "DIRECT_USD" };
  }

  // Cross pairs: use caller-supplied live USD cross rate before any static bootstrap fallback
  if (p.endsWith("JPY")) {
    const usdJpy = crossRates?.usdJpy;
    if (usdJpy != null && Number.isFinite(usdJpy) && usdJpy > 0) {
      return { pipValueUsd: 1000 / usdJpy, source: "LIVE_CROSS_RATE" };
    }
    return { pipValueUsd: 1000 / 155.0, source: "BOOTSTRAP_FALLBACK" };
  }

  if (p.endsWith("GBP")) {
    const gbpUsd = crossRates?.gbpUsd;
    if (gbpUsd != null && Number.isFinite(gbpUsd) && gbpUsd > 0) {
      return { pipValueUsd: 100_000 * pip * gbpUsd, source: "LIVE_CROSS_RATE" };
    }
    return { pipValueUsd: 100_000 * pip * 1.28, source: "BOOTSTRAP_FALLBACK" };
  }

  if (p.endsWith("CHF")) {
    const usdChf = crossRates?.usdChf;
    if (usdChf != null && Number.isFinite(usdChf) && usdChf > 0) {
      return { pipValueUsd: (100_000 * pip) / usdChf, source: "LIVE_CROSS_RATE" };
    }
    return { pipValueUsd: (100_000 * pip) / 0.885, source: "BOOTSTRAP_FALLBACK" };
  }

  if (p.endsWith("CAD")) {
    const usdCad = crossRates?.usdCad;
    if (usdCad != null && Number.isFinite(usdCad) && usdCad > 0) {
      return { pipValueUsd: (100_000 * pip) / usdCad, source: "LIVE_CROSS_RATE" };
    }
    return { pipValueUsd: (100_000 * pip) / 1.385, source: "BOOTSTRAP_FALLBACK" };
  }

  if (p.endsWith("AUD")) {
    const audUsd = crossRates?.audUsd;
    if (audUsd != null && Number.isFinite(audUsd) && audUsd > 0) {
      return { pipValueUsd: 100_000 * pip * audUsd, source: "LIVE_CROSS_RATE" };
    }
    return { pipValueUsd: 100_000 * pip * 0.658, source: "BOOTSTRAP_FALLBACK" };
  }

  if (p.endsWith("NZD")) {
    const nzdUsd = crossRates?.nzdUsd;
    if (nzdUsd != null && Number.isFinite(nzdUsd) && nzdUsd > 0) {
      return { pipValueUsd: 100_000 * pip * nzdUsd, source: "LIVE_CROSS_RATE" };
    }
    return { pipValueUsd: 100_000 * pip * 0.592, source: "BOOTSTRAP_FALLBACK" };
  }

  return { pipValueUsd: 10.0, source: "BOOTSTRAP_FALLBACK" };
}

/**
 * Calculates the pip value in USD for 1.0 Standard Lot (100,000 units).
 * For XAUUSD, 1 standard lot = 100 oz, $0.10 move = $10.00.
 */
export function calculatePipValueUsd(
  pair: string,
  currentPrice: number,
  crossRates?: CrossRateOverrides,
): number {
  return resolvePipValueUsd(pair, currentPrice, crossRates).pipValueUsd;
}

/**
 * Institutional Position Sizing Engine.
 * Calculates standard lots, margin requirements, and multi-tier P&L.
 */
export function calculateForexPositionSize(input: PositionSizerInput): PositionSizerResult {
  const {
    accountBalance,
    pair,
    entryPrice,
    stopLossPrice,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    leverage = 100,
    crossRates,
  } = input;

  const cleanPair = pair.toUpperCase().replace("/", "").replace("-", "");
  const pipSize = getForexPipSize(cleanPair);
  const { pipValueUsd: pipValuePerLot, source: pipValueSource } = resolvePipValueUsd(
    cleanPair,
    entryPrice,
    crossRates,
  );

  // Determine risk amount in USD
  const riskPercent = input.riskPercent ?? (input.riskAmountUsd ? (input.riskAmountUsd / accountBalance) * 100 : 1.0);
  const riskAmountUsd = input.riskAmountUsd ?? (accountBalance * Math.max(0.1, riskPercent)) / 100;

  // Calculate distance in pips
  const priceRisk = Math.abs(entryPrice - stopLossPrice);
  const rawPips = Math.round((priceRisk / pipSize) * 10) / 10;
  const stopLossPips = Math.max(rawPips, 1.0); // At least 1 pip protection

  // Standard lots formula: Risk / (SL Pips * Pip Value per lot)
  const rawLots = riskAmountUsd / (stopLossPips * pipValuePerLot);
  // Institutional broker lot rounding (2 decimal places, min 0.01)
  const standardLots = Math.max(0.01, Math.round(rawLots * 100) / 100);
  const miniLots = Math.round(standardLots * 10 * 10) / 10;
  const microLots = Math.round(standardLots * 100);
  const units = Math.round(standardLots * 100_000);

  // Margin required in USD = (Units * Price) / Leverage (or contract value / leverage)
  const isBaseUsd = cleanPair.startsWith("USD");
  const contractValueUsd = isBaseUsd ? standardLots * 100_000 : standardLots * 100_000 * entryPrice;
  const marginRequiredUsd = Math.round((contractValueUsd / Math.max(1, leverage)) * 100) / 100;

  // Multi-tier TP projections
  const isBuy = entryPrice >= stopLossPrice;

  const buildTpLevel = (tpPrice: number | null | undefined, defaultRr: number) => {
    const targetPrice = tpPrice ?? (isBuy ? entryPrice + priceRisk * defaultRr : entryPrice - priceRisk * defaultRr);
    if (!targetPrice || targetPrice <= 0) return null;
    const tpDist = Math.abs(targetPrice - entryPrice);
    const tpPips = Math.round((tpDist / pipSize) * 10) / 10;
    const rr = Math.round((tpDist / priceRisk) * 100) / 100;
    const projectedProfitUsd = Math.round(standardLots * tpPips * pipValuePerLot * 100) / 100;
    return {
      price: targetPrice,
      pips: tpPips,
      rr,
      projectedProfitUsd,
    };
  };

  const tp1 = buildTpLevel(takeProfit1, 1.2);
  const tp2 = buildTpLevel(takeProfit2, 2.0);
  const tp3 = buildTpLevel(takeProfit3, 3.0);

  // Plan & advice
  const actionablePlan: string[] = [
    `Khối lượng khuyến nghị: ${standardLots} standard lot (${microLots} micro lots).`,
    `Cắt lỗ (SL): ${stopLossPips.toFixed(1)} pips. Mức rủi ro tối đa cố định $${riskAmountUsd.toFixed(2)} (${riskPercent.toFixed(1)}% vốn).`,
    tp1
      ? `Mốc TP1 (${tp1.pips} pips | R:R 1:${tp1.rr}): Chốt 50% khối lượng (+${(tp1.projectedProfitUsd * 0.5).toFixed(0)}$), đồng thời DỜI STOP LOSS VỀ ENTRY (Hòa vốn).`
      : "Chốt lời phân tầng khi đạt R:R 1:1.2.",
    tp2
      ? `Mốc TP2 (${tp2.pips} pips | R:R 1:${tp2.rr}): Chốt tiếp 30% khối lượng (+${(tp2.projectedProfitUsd * 0.3).toFixed(0)}$).`
      : "Gồng lãi TP2.",
    tp3
      ? `Mốc TP3 (${tp3.pips} pips | R:R 1:${tp3.rr}): Gồng 20% còn lại theo trailing stop của khung M15.`
      : "Mục tiêu dài hạn TP3.",
  ];

  let riskWarning: string | undefined;
  if (marginRequiredUsd > accountBalance * 0.7) {
    riskWarning = `Ký quỹ yêu cầu ($${marginRequiredUsd}) vượt quá 70% số dư tài khoản ($${accountBalance}). Cân nhắc hạ lot hoặc tăng đòn bẩy an toàn.`;
  }

  return {
    pair: cleanPair,
    accountBalance,
    riskPercent,
    riskAmountUsd,
    entryPrice,
    stopLossPrice,
    stopLossPips,
    pipSize,
    pipValuePerStandardLot: Math.round(pipValuePerLot * 100) / 100,
    pipValueSource,
    standardLots,
    miniLots,
    microLots,
    units,
    marginRequiredUsd,
    leverage,
    takeProfitLevels: {
      tp1,
      tp2,
      tp3,
    },
    advice: {
      rule: "Quy tắc 1-2-3 Scale-Out & Breakeven Protection",
      actionablePlan,
      riskWarning,
    },
  };
}
