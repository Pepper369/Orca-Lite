/**
 * CRYPTO DERIVATIVES & TRUE LEVEL 2 DOM ENGINE
 *
 * Real-time analytics for Binance USDT-M Perpetual Futures:
 * 1. True Level 2 Depth of Market (L2 DOM 10-20 Bids x Asks) & Order Book Imbalance (OBI)
 * 2. Institutional Buy/Sell Limit Walls detection
 * 3. Open Interest (OI) & Price Trend confluence (Long Accumulation vs Short Squeeze)
 * 4. Funding Rate & Squeeze Risk assessment
 */

import type { OrderBookSnapshot } from "../providers/binance";
import {
  computeGarmanKlassLeverageCap,
  detectCryptoLiquidationClusters,
  type LeverageGovernorResult,
  type LiquidationClusterResult,
  type OhlcScalarBar,
} from "./unified-cross-asset-quant";

export interface CryptoDomLevel {
  level: number;
  bidPrice: number;
  bidQty: number;
  bidNotionalUsd: number;
  askPrice: number;
  askQty: number;
  askNotionalUsd: number;
}

export interface CryptoDerivativesMetrics {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  annualizedFundingPct: number;
  fundingBias: "EXTREME_LONG_OVERHEAT" | "MODERATE_LONG_BIAS" | "NEUTRAL" | "MODERATE_SHORT_BIAS" | "EXTREME_SHORT_SQUEEZE";
  openInterest: number;
  openInterestUsd: number;
  oiState: "LONG_ACCUMULATION" | "SHORT_SQUEEZE" | "SHORT_BUILDUP" | "LONG_LIQUIDATION" | "NEUTRAL";
  orderBook: {
    levels: CryptoDomLevel[];
    totalBidNotional: number;
    totalAskNotional: number;
    imbalanceRatio: number; // -100% to +100%
    institutionalBias: "STRONG_BUY_WALL" | "BALANCED" | "STRONG_SELL_WALL";
    nearestBuyWallPrice: number | null;
    nearestSellWallPrice: number | null;
  };
  squeezeRiskScore: number; // 0 to 100
  leverageGovernor?: LeverageGovernorResult;
  liquidationClusters?: LiquidationClusterResult;
  commentary: string;
}

/**
 * Analyzes Funding Rate and classifies market crowding sentiment.
 * Typical 8h Funding Rate on Binance:
 * - 0.01% (baseline normal)
 * - > 0.03%: Longs are heavily paying Shorts (Long crowding)
 * - > 0.06%: Extreme Long overheat (High cascade liquidation risk)
 * - < -0.02%: Shorts are paying Longs (Short crowding, prime for squeeze)
 */
export function analyzeFundingRate(fundingRate: number): {
  fundingBias: CryptoDerivativesMetrics["fundingBias"];
  annualizedPct: number;
  squeezeRiskScore: number;
} {
  // 3 funding intervals per day * 365 = 1095 intervals/year
  const annualizedPct = Math.round(fundingRate * 1095 * 100 * 10) / 10;

  if (fundingRate >= 0.0006) {
    return { fundingBias: "EXTREME_LONG_OVERHEAT", annualizedPct, squeezeRiskScore: 85 };
  }
  if (fundingRate >= 0.0003) {
    return { fundingBias: "MODERATE_LONG_BIAS", annualizedPct, squeezeRiskScore: 60 };
  }
  if (fundingRate <= -0.0005) {
    return { fundingBias: "EXTREME_SHORT_SQUEEZE", annualizedPct, squeezeRiskScore: 85 };
  }
  if (fundingRate <= -0.0002) {
    return { fundingBias: "MODERATE_SHORT_BIAS", annualizedPct, squeezeRiskScore: 60 };
  }
  return { fundingBias: "NEUTRAL", annualizedPct, squeezeRiskScore: 20 };
}

/**
 * Confluence of Price Action & Open Interest (OI) changes.
 */
export function analyzeOpenInterestTrend(
  priceChange24hPct: number,
  oiChange24hPct: number
): CryptoDerivativesMetrics["oiState"] {
  const priceUp = priceChange24hPct > 1.0;
  const priceDown = priceChange24hPct < -1.0;
  const oiUp = oiChange24hPct > 2.0;
  const oiDown = oiChange24hPct < -2.0;

  if (priceUp && oiUp) return "LONG_ACCUMULATION"; // New money entering long
  if (priceUp && oiDown) return "SHORT_SQUEEZE"; // Price up fueled by short covering
  if (priceDown && oiUp) return "SHORT_BUILDUP"; // New aggressive short selling
  if (priceDown && oiDown) return "LONG_LIQUIDATION"; // Longs flushed out
  return "NEUTRAL";
}

/**
 * Evaluates real Level 2 Depth of Market from Binance.
 */
export function evaluateTrueLevel2Dom(
  orderBook: OrderBookSnapshot,
  depth = 5
): CryptoDerivativesMetrics["orderBook"] {
  const levels: CryptoDomLevel[] = [];
  let totalBidNotional = 0;
  let totalAskNotional = 0;

  const count = Math.min(depth, Math.min(orderBook.bids.length, orderBook.asks.length));

  let maxBidNotional = 0;
  let maxAskNotional = 0;
  let nearestBuyWallPrice: number | null = null;
  let nearestSellWallPrice: number | null = null;

  for (let i = 0; i < count; i++) {
    const b = orderBook.bids[i] ?? { price: 0, qty: 0 };
    const a = orderBook.asks[i] ?? { price: 0, qty: 0 };

    const bidNotional = Math.round(b.price * b.qty);
    const askNotional = Math.round(a.price * a.qty);

    totalBidNotional += bidNotional;
    totalAskNotional += askNotional;

    if (bidNotional > maxBidNotional) {
      maxBidNotional = bidNotional;
      nearestBuyWallPrice = b.price;
    }
    if (askNotional > maxAskNotional) {
      maxAskNotional = askNotional;
      nearestSellWallPrice = a.price;
    }

    levels.push({
      level: i + 1,
      bidPrice: b.price,
      bidQty: b.qty,
      bidNotionalUsd: bidNotional,
      askPrice: a.price,
      askQty: a.qty,
      askNotionalUsd: askNotional,
    });
  }

  const sum = totalBidNotional + totalAskNotional || 1;
  const imbalanceFraction = (totalBidNotional - totalAskNotional) / sum;
  const imbalanceRatio = Math.round(imbalanceFraction * 100);

  let institutionalBias: CryptoDerivativesMetrics["orderBook"]["institutionalBias"] = "BALANCED";
  if (imbalanceRatio >= 20) {
    institutionalBias = "STRONG_BUY_WALL";
  } else if (imbalanceRatio <= -20) {
    institutionalBias = "STRONG_SELL_WALL";
  }

  return {
    levels,
    totalBidNotional,
    totalAskNotional,
    imbalanceRatio,
    institutionalBias,
    nearestBuyWallPrice: maxBidNotional > totalBidNotional * 0.35 ? nearestBuyWallPrice : null,
    nearestSellWallPrice: maxAskNotional > totalAskNotional * 0.35 ? nearestSellWallPrice : null,
  };
}

/**
 * Builds complete derivatives metric profile for a crypto perpetual symbol.
 */
export function buildCryptoDerivativesMetrics(params: {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  openInterest: number;
  priceChange24hPct?: number;
  oiChange24hPct?: number;
  orderBook: OrderBookSnapshot;
  recentBars?: OhlcScalarBar[];
  atr?: number;
}): CryptoDerivativesMetrics {
  const { symbol, markPrice, indexPrice, fundingRate, openInterest, priceChange24hPct = 0, oiChange24hPct = 0, orderBook, recentBars, atr } = params;

  const fundingAnalysis = analyzeFundingRate(fundingRate);
  const oiState = analyzeOpenInterestTrend(priceChange24hPct, oiChange24hPct);
  const domAnalysis = evaluateTrueLevel2Dom(orderBook, 5);

  const openInterestUsd = Math.round(openInterest * markPrice);

  const leverageGovernor = recentBars && recentBars.length >= 5
    ? computeGarmanKlassLeverageCap(recentBars, true)
    : undefined;

  const liquidationClusters = openInterestUsd > 0
    ? detectCryptoLiquidationClusters(markPrice, openInterestUsd, atr ?? markPrice * 0.02, {
        symbol,
        fundingRate,
        priceChange24hPct,
        oiChange24hPct,
        orderBookImbalance: domAnalysis.imbalanceRatio,
      })
    : undefined;

  let commentary = "";
  if (fundingAnalysis.fundingBias === "EXTREME_LONG_OVERHEAT") {
    commentary = `⚠️ Cảnh báo hưng phấn cực đại: Funding rate ${(fundingRate * 100).toFixed(4)}% (+${fundingAnalysis.annualizedPct}%/năm). Rủi ro Long liquidation cascade rất cao.`;
  } else if (fundingAnalysis.fundingBias === "EXTREME_SHORT_SQUEEZE") {
    commentary = `🔥 Cơ hội Short Squeeze: Phe bán đang chịu phí âm nặng ${(fundingRate * 100).toFixed(4)}%. Khả năng kích hoạt nhịp giật quét Stop Loss phe Short lên cao.`;
  } else if (domAnalysis.institutionalBias === "STRONG_BUY_WALL") {
    commentary = `Bức tường mua (Buy Wall) dày với độ lệch +${domAnalysis.imbalanceRatio}% tổng thanh khoản L2. Đang có lực hấp thụ mua bảo vệ giá.`;
  } else if (domAnalysis.institutionalBias === "STRONG_SELL_WALL") {
    commentary = `Bức tường bán (Sell Wall) đè nặng với độ lệch ${domAnalysis.imbalanceRatio}% tổng thanh khoản L2. Áp lực cản giá phía trên lớn.`;
  } else {
    commentary = "Thị trường phái sinh cân bằng, thanh khoản hai chiều và funding ổn định.";
  }

  return {
    symbol,
    markPrice,
    indexPrice,
    fundingRate,
    annualizedFundingPct: fundingAnalysis.annualizedPct,
    fundingBias: fundingAnalysis.fundingBias,
    openInterest,
    openInterestUsd,
    oiState,
    orderBook: domAnalysis,
    squeezeRiskScore: fundingAnalysis.squeezeRiskScore,
    leverageGovernor,
    liquidationClusters,
    commentary,
  };
}

