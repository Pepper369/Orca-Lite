/**
 * CRYPTO MARGIN & FUTURES POSITION SIZER
 *
 * Calculates institutional risk-adjusted position sizing for Crypto Perpetual Futures:
 * - Fixed fractional risk (e.g. 1% account risk = $100 on $10,000)
 * - Isolated Margin required
 * - Liquidation Price estimation & Safety Buffer ratio
 * - Multi-tier Take Profit (TP1 / TP2 / TP3) profit projection
 */

export interface CryptoPositionSizerInput {
  accountBalance: number;
  riskPercent: number; // e.g. 1.0 = 1%
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
  takeProfit3?: number | null;
  leverage?: number; // e.g. 1, 3, 5, 10, 20
  direction?: "BUY" | "SELL";
}

export interface CryptoPositionSizerResult {
  symbolNotionalUsd: number;
  positionQty: number; // Amount of coins
  requiredMarginUsd: number;
  riskAmountUsd: number;
  priceRiskUsd: number;
  riskPercentOfPrice: number;
  leverage: number;
  direction: "BUY" | "SELL";
  estimatedLiquidationPrice: number | null;
  liquidationDistancePct: number | null;
  liquidationSafetyRatio: number | null; // e.g. 3.2x (Safe if > 2.0x)
  isSafeFromEarlyLiquidation: boolean;
  takeProfit1Target: {
    price: number;
    riskRewardRatio: number;
    projectedProfitUsd: number;
  } | null;
  takeProfit2Target: {
    price: number;
    riskRewardRatio: number;
    projectedProfitUsd: number;
  } | null;
  takeProfit3Target: {
    price: number;
    riskRewardRatio: number;
    projectedProfitUsd: number;
  } | null;
  advice: string;
}

export function calculateCryptoPositionSize(input: CryptoPositionSizerInput): CryptoPositionSizerResult {
  const {
    accountBalance,
    riskPercent,
    entryPrice,
    stopLossPrice,
    takeProfit1,
    takeProfit2,
    takeProfit3,
    leverage = 5,
  } = input;

  const lev = Math.max(1, Math.min(125, leverage));
  const isBuy = input.direction ? input.direction === "BUY" : entryPrice > stopLossPrice;
  const direction: "BUY" | "SELL" = isBuy ? "BUY" : "SELL";

  const priceRisk = Math.abs(entryPrice - stopLossPrice);
  const safePriceRisk = Math.max(1e-8, priceRisk);
  const riskAmountUsd = Math.max(1, accountBalance * (riskPercent / 100));

  // Position Quantity in coins
  const positionQty = Number((riskAmountUsd / safePriceRisk).toPrecision(6));
  const symbolNotionalUsd = Math.round(positionQty * entryPrice * 100) / 100;
  const requiredMarginUsd = Math.round((symbolNotionalUsd / lev) * 100) / 100;

  const riskPercentOfPrice = Math.round((priceRisk / entryPrice) * 100 * 100) / 100;

  // Estimated Liquidation Price for Isolated Margin
  // Approx liquidation occurs when losses reach ~90% of margin
  let estimatedLiquidationPrice: number | null = null;
  let liquidationDistancePct: number | null = null;
  let liquidationSafetyRatio: number | null = null;
  let isSafeFromEarlyLiquidation = true;

  if (lev > 1) {
    const liqDropPct = 0.90 / lev;
    estimatedLiquidationPrice = isBuy
      ? entryPrice * (1 - liqDropPct)
      : entryPrice * (1 + liqDropPct);
    estimatedLiquidationPrice = Number(estimatedLiquidationPrice.toPrecision(6));

    const liqDistUsd = Math.abs(entryPrice - estimatedLiquidationPrice);
    liquidationDistancePct = Math.round((liqDistUsd / entryPrice) * 100 * 10) / 10;
    liquidationSafetyRatio = Math.round((liqDistUsd / safePriceRisk) * 10) / 10;

    // Must be at least 1.5x away compared to Stop Loss, otherwise liquidation triggers before SL!
    isSafeFromEarlyLiquidation = liquidationSafetyRatio >= 1.5;
  }

  // Multi-tier Take Profits
  const tp1Price = takeProfit1 ?? (isBuy ? entryPrice + priceRisk * 1.2 : entryPrice - priceRisk * 1.2);
  const tp2Price = takeProfit2 ?? (isBuy ? entryPrice + priceRisk * 2.0 : entryPrice - priceRisk * 2.0);
  const tp3Price = takeProfit3 ?? (isBuy ? entryPrice + priceRisk * 3.0 : entryPrice - priceRisk * 3.0);

  const tp1Target = {
    price: Number(tp1Price.toPrecision(6)),
    riskRewardRatio: 1.2,
    projectedProfitUsd: Math.round(riskAmountUsd * 1.2 * 100) / 100,
  };

  const tp2Target = {
    price: Number(tp2Price.toPrecision(6)),
    riskRewardRatio: 2.0,
    projectedProfitUsd: Math.round(riskAmountUsd * 2.0 * 100) / 100,
  };

  const tp3Target = {
    price: Number(tp3Price.toPrecision(6)),
    riskRewardRatio: 3.0,
    projectedProfitUsd: Math.round(riskAmountUsd * 3.0 * 100) / 100,
  };

  let advice = "";
  if (!isSafeFromEarlyLiquidation) {
    advice = `🚨 NGUY HIỂM: Đòn bẩy ${lev}x quá cao so với độ biến động SL (${riskPercentOfPrice}%). Giá thanh lý (${estimatedLiquidationPrice}) sẽ bị quét TRƯỚC KHI chạm Stop Loss (${stopLossPrice})! Khuyến nghị giảm đòn bẩy về ${Math.max(1, Math.floor(lev * 0.5))}x.`;
  } else if (lev > 20) {
    advice = `⚠️ Đòn bẩy cao (${lev}x): Dễ bị dính quét râu nến (whipsaw). Khuyến nghị chốt lời 50% vị thế tại TP1 (${tp1Price}) để dời SL về hòa vốn.`;
  } else {
    advice = `Vị thế an toàn: Hệ số an toàn thanh lý đạt ${liquidationSafetyRatio ?? "Spot"}x khoảng cách SL. Ký quỹ cần thiết $${requiredMarginUsd} cho rủi ro $${riskAmountUsd}.`;
  }

  return {
    symbolNotionalUsd,
    positionQty,
    requiredMarginUsd,
    riskAmountUsd,
    priceRiskUsd: Math.round(priceRisk * 100) / 100,
    riskPercentOfPrice,
    leverage: lev,
    direction,
    estimatedLiquidationPrice,
    liquidationDistancePct,
    liquidationSafetyRatio,
    isSafeFromEarlyLiquidation,
    takeProfit1Target: tp1Target,
    takeProfit2Target: tp2Target,
    takeProfit3Target: tp3Target,
    advice,
  };
}

