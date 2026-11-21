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
import { normCdf } from "./advanced-quant-math";
import {
  computeGarmanKlassLeverageCap,
  detectCryptoLiquidationClusters,
  type LeverageGovernorResult,
  type LiquidationClusterResult,
  type OhlcScalarBar,
} from "./unified-cross-asset-quant";

export interface MicropriceSpoofingResult {
  midPrice: number;
  microprice: number;
  micropriceSkewBps: number; // (microprice - mid) / mid * 10000
  topOfBookImbalance: number; // [-1, 1]
  deepBookImbalance: number; // [-1, 1] across levels 2..N
  spoofingOrAbsorptionState:
    | "BULLISH_ICEBERG_ABSORPTION"
    | "BEARISH_ICEBERG_ABSORPTION"
    | "BID_SPOOFING_RISK"
    | "ASK_SPOOFING_RISK"
    | "CLEAN_BOOK";
  rationaleVi: string;
}

export interface VolumeClockVpinResult {
  vpin: number; // [0, 1] Volume-Synchronized Probability of Informed Trading
  bucketVolumeUsd: number;
  bucketsEvaluated: number;
  toxicityRegime: "LOW_TOXICITY" | "ELEVATED_FLOW" | "TOXIC_INFORMED_CASCADE";
  advisoryVi: string;
}

export interface FundingOiVelocityRegimeResult {
  state: "LONG_BUILDUP" | "SHORT_SQUEEZE" | "LONG_LIQUIDATION_FLUSH" | "CARRY_CROWDING" | "NEUTRAL";
  fundingZScore: number;
  oiVelocityPct: number;
  cascadeExhausted: boolean;
  canEnterContrarianReversal: boolean;
  rationaleVi: string;
}

export interface DeltaNeutralFundingCarryResult {
  spotPrice: number;
  perpMarkPrice: number;
  perpBasisPct: number;
  fundingRate8h: number;
  annualizedFundingYieldPct: number;
  roundTripFrictionPct: number;
  netAnnualizedCarryYieldPct: number;
  breakevenDays: number;
  strategyAction: "LONG_SPOT_SHORT_PERP" | "SHORT_SPOT_LONG_PERP_REVERSE" | "NO_CARRY_EDGE";
  isViableCarry: boolean;
  rationaleVi: string;
}

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
  micropriceAnalysis?: MicropriceSpoofingResult;
  vpinToxicity?: VolumeClockVpinResult;
  fundingOiVelocityRegime?: FundingOiVelocityRegimeResult;
  fundingCarryArbitrage?: DeltaNeutralFundingCarryResult;
  commentary: string;
}

/**
 * Computes Stoikov (2018) Microprice and compares top-of-book vs deep-book L2 imbalance
 * to detect Iceberg Absorption and Spoofing limit walls.
 */
export function computeMicropriceAndSpoofingSignal(params: {
  orderBook: OrderBookSnapshot;
  aggressiveBuyShare?: number | null; // [0, 1] share of taker buy volume
}): MicropriceSpoofingResult {
  const { orderBook, aggressiveBuyShare = 0.5 } = params;
  const bestBid = orderBook.bids[0]?.price ?? 0;
  const bestBidQty = orderBook.bids[0]?.qty ?? 0;
  const bestAsk = orderBook.asks[0]?.price ?? 0;
  const bestAskQty = orderBook.asks[0]?.qty ?? 0;

  if (bestBid <= 0 || bestAsk <= 0 || bestBidQty + bestAskQty <= 0) {
    return {
      midPrice: bestBid || bestAsk || 0,
      microprice: bestBid || bestAsk || 0,
      micropriceSkewBps: 0,
      topOfBookImbalance: 0,
      deepBookImbalance: 0,
      spoofingOrAbsorptionState: "CLEAN_BOOK",
      rationaleVi: "Sổ lệnh chưa đủ dữ liệu top-of-book để tính Microprice.",
    };
  }

  const midPrice = (bestBid + bestAsk) / 2;
  // Stoikov Microprice: P_micro = (Q_ask * P_bid + Q_bid * P_ask) / (Q_bid + Q_ask)
  const microprice = (bestAskQty * bestBid + bestBidQty * bestAsk) / (bestBidQty + bestAskQty);
  const micropriceSkewBps = Number((((microprice - midPrice) / midPrice) * 10_000).toFixed(3));
  const topOfBookImbalance = Number(
    ((bestBidQty - bestAskQty) / (bestBidQty + bestAskQty)).toFixed(4),
  );

  let deepBidNotional = 0;
  let deepAskNotional = 0;
  const maxDepth = Math.min(10, Math.max(orderBook.bids.length, orderBook.asks.length));
  for (let i = 1; i < maxDepth; i++) {
    const b = orderBook.bids[i];
    const a = orderBook.asks[i];
    if (b) deepBidNotional += b.price * b.qty;
    if (a) deepAskNotional += a.price * a.qty;
  }
  const deepSum = deepBidNotional + deepAskNotional;
  const deepBookImbalance =
    deepSum > 0 ? Number(((deepBidNotional - deepAskNotional) / deepSum).toFixed(4)) : 0;

  const takerFlow = (aggressiveBuyShare ?? 0.5) - 0.5; // [-0.5, +0.5]
  let state: MicropriceSpoofingResult["spoofingOrAbsorptionState"] = "CLEAN_BOOK";
  let rationaleVi = `Microprice ${microprice.toFixed(4)} (Skew ${micropriceSkewBps >= 0 ? "+" : ""}${micropriceSkewBps} bps so với Mid).`;

  if (takerFlow <= -0.12 && topOfBookImbalance >= 0.22) {
    state = "BULLISH_ICEBERG_ABSORPTION";
    rationaleVi =
      "Hấp thụ Iceberg Mua: Lực bán chủ động lớn nhưng Microprice và Bid L1 liên tục tái nạp đỡ giá.";
  } else if (takerFlow >= 0.12 && topOfBookImbalance <= -0.22) {
    state = "BEARISH_ICEBERG_ABSORPTION";
    rationaleVi =
      "Hấp thụ Iceberg Bán: Lực mua chủ động húc vào tường Ask L1 nhưng bị chặn đứng bởi lệnh ẩn.";
  } else if (deepBookImbalance >= 0.42 && topOfBookImbalance <= -0.15) {
    state = "BID_SPOOFING_RISK";
    rationaleVi =
      "Cảnh báo Spoofing Bid: Tường mua lớn treo ở các tầng sâu L3-L10 nhưng Microprice tầng 1 lại nghiêng hẳn về phe bán.";
  } else if (deepBookImbalance <= -0.42 && topOfBookImbalance >= 0.15) {
    state = "ASK_SPOOFING_RISK";
    rationaleVi =
      "Cảnh báo Spoofing Ask: Tường bán ảo treo ở tầng sâu nhưng Microprice tầng 1 đang đẩy giá lên.";
  }

  return {
    midPrice: Number(midPrice.toPrecision(8)),
    microprice: Number(microprice.toPrecision(8)),
    micropriceSkewBps,
    topOfBookImbalance,
    deepBookImbalance,
    spoofingOrAbsorptionState: state,
    rationaleVi,
  };
}

/**
 * Computes Volume-Clock Buckets & VPIN (Volume-Synchronized Probability of Informed Trading)
 * using Easley, López de Prado & O'Hara (2012) Bulk Volume Classification (BVC).
 */
export function computeVolumeClockVpin(
  bars: (OhlcScalarBar & { volume?: number })[],
  targetBucketsCount = 12,
): VolumeClockVpinResult {
  if (!bars || bars.length < 6) {
    return {
      vpin: 0.22,
      bucketVolumeUsd: 0,
      bucketsEvaluated: 0,
      toxicityRegime: "LOW_TOXICITY",
      advisoryVi: "Chưa đủ dữ liệu nến để phân rã Volume-Clock VPIN.",
    };
  }

  const priceChanges: number[] = [];
  let totalNotional = 0;
  const barNotionals: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const prevC = i > 0 ? bars[i - 1]!.close : b.open;
    const dp = b.close - prevC;
    priceChanges.push(dp);
    const vol = b.volume != null && b.volume > 0 ? b.volume : 100;
    const notional = vol * Math.max(1e-8, b.close);
    barNotionals.push(notional);
    totalNotional += notional;
  }

  const meanDp = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
  const varDp =
    priceChanges.reduce((s, x) => s + (x - meanDp) ** 2, 0) / Math.max(1, priceChanges.length - 1);
  const stdDp = Math.sqrt(Math.max(1e-12, varDp));

  const bucketSize = Math.max(1, totalNotional / Math.max(4, targetBucketsCount));
  const bucketImbalances: number[] = [];
  let curBuy = 0;
  let curSell = 0;
  let curFill = 0;

  for (let i = 0; i < bars.length; i++) {
    const z = priceChanges[i]! / stdDp;
    // Bulk Volume Classification (BVC): buy fraction = Phi(Delta P / sigma_DeltaP)
    const buyFrac = normCdf(z);
    let remNotional = barNotionals[i]!;

    while (remNotional > 0) {
      const space = bucketSize - curFill;
      const take = Math.min(space, remNotional);
      curBuy += take * buyFrac;
      curSell += take * (1 - buyFrac);
      curFill += take;
      remNotional -= take;

      if (curFill >= bucketSize * 0.999) {
        bucketImbalances.push(Math.abs(curBuy - curSell) / bucketSize);
        curBuy = 0;
        curSell = 0;
        curFill = 0;
      }
    }
  }

  if (curFill > bucketSize * 0.35 && bucketImbalances.length === 0) {
    bucketImbalances.push(Math.abs(curBuy - curSell) / curFill);
  }

  const vpin =
    bucketImbalances.length > 0
      ? Number(
          Math.max(
            0.05,
            Math.min(
              0.98,
              bucketImbalances.reduce((a, b) => a + b, 0) / bucketImbalances.length,
            ),
          ).toFixed(4),
        )
      : 0.25;

  let toxicityRegime: VolumeClockVpinResult["toxicityRegime"] = "LOW_TOXICITY";
  let advisoryVi = `VPIN = ${(vpin * 100).toFixed(1)}% (Dòng tiền hai chiều ổn định).`;
  if (vpin >= 0.58) {
    toxicityRegime = "TOXIC_INFORMED_CASCADE";
    advisoryVi = `🚨 VPIN Độc tính cao (${(vpin * 100).toFixed(1)}%): Dòng tiền một chiều từ tổ chức/thanh lý đang càn quét sổ lệnh — Cấm đặt Limit ngược xu hướng!`;
  } else if (vpin >= 0.42) {
    toxicityRegime = "ELEVATED_FLOW";
    advisoryVi = `⚠️ VPIN Tăng cao (${(vpin * 100).toFixed(1)}%): Mất cân bằng khối lượng theo Volume-Clock, ưu tiên giao dịch thuận chiều dòng tiền.`;
  }

  return {
    vpin,
    bucketVolumeUsd: Math.round(bucketSize),
    bucketsEvaluated: bucketImbalances.length,
    toxicityRegime,
    advisoryVi,
  };
}

/**
 * Classifies 4-State Funding-OI Velocity Regime and verifies whether a liquidation cascade has exhausted OI.
 */
export function evaluateFundingOiVelocityRegime(params: {
  fundingRate8h: number;
  priceChange24hPct: number;
  oiChange24hPct: number;
  vpin?: number;
}): FundingOiVelocityRegimeResult {
  const { fundingRate8h, priceChange24hPct, oiChange24hPct, vpin = 0.28 } = params;
  // Standardize funding rate against 0.01% baseline and 0.02% std
  const fundingZScore = Number(((fundingRate8h - 0.0001) / 0.0002).toFixed(2));
  const oiVelocityPct = Number(oiChange24hPct.toFixed(2));

  if (fundingZScore >= 2.2 && oiChange24hPct >= 3.0) {
    return {
      state: "CARRY_CROWDING",
      fundingZScore,
      oiVelocityPct,
      cascadeExhausted: false,
      canEnterContrarianReversal: false,
      rationaleVi: `Crowding Long quá mức (Funding Z=+${fundingZScore}, OI +${oiVelocityPct}%). Rủi ro nổ Long Liquidation Cascade cao.`,
    };
  }

  if (priceChange24hPct <= -1.5 && oiChange24hPct <= -2.5) {
    const cascadeExhausted = oiChange24hPct <= -4.5 && vpin < 0.52 && fundingRate8h <= 0.00005;
    return {
      state: "LONG_LIQUIDATION_FLUSH",
      fundingZScore,
      oiVelocityPct,
      cascadeExhausted,
      canEnterContrarianReversal: cascadeExhausted,
      rationaleVi: cascadeExhausted
        ? `Long Liquidation Flush đã cạn đòn bẩy (OI rút ${oiVelocityPct}%, VPIN hạ nhiệt) — Có thể canh đảo chiều.`
        : `Đang xả thanh lý Long (OI ${oiVelocityPct}%, VPIN ${(vpin * 100).toFixed(0)}%) — Chưa cạn đà bán tháo, cấm bắt dao rơi.`,
    };
  }

  if (priceChange24hPct >= 1.2 && (oiChange24hPct <= -1.5 || fundingZScore <= -1.2)) {
    return {
      state: "SHORT_SQUEEZE",
      fundingZScore,
      oiVelocityPct,
      cascadeExhausted: false,
      canEnterContrarianReversal: false,
      rationaleVi: `Short Squeeze kích hoạt (Funding Z=${fundingZScore}, Giá tăng +${priceChange24hPct.toFixed(1)}%). Phe Short buộc phải mua cover.`,
    };
  }

  if (priceChange24hPct >= 1.0 && oiChange24hPct >= 2.0) {
    return {
      state: "LONG_BUILDUP",
      fundingZScore,
      oiVelocityPct,
      cascadeExhausted: false,
      canEnterContrarianReversal: false,
      rationaleVi: `Long Build-up lành mạnh (Giá +${priceChange24hPct.toFixed(1)}%, OI +${oiVelocityPct}%).`,
    };
  }

  return {
    state: "NEUTRAL",
    fundingZScore,
    oiVelocityPct,
    cascadeExhausted: true,
    canEnterContrarianReversal: true,
    rationaleVi: "Funding và tốc độ biến thiên OI ở vùng trung tính.",
  };
}

/**
 * Evaluates Delta-Neutral Funding Carry Arbitrage (Long Spot + Short Perpetual or Reverse)
 * net of round-trip maker/taker fees and spot borrow costs.
 */
export function evaluateDeltaNeutralFundingCarry(params: {
  spotPrice: number;
  perpMarkPrice: number;
  fundingRate8h: number;
  roundTripFeePct?: number; // default 0.14% (spot + perp entry & exit)
}): DeltaNeutralFundingCarryResult {
  const {
    spotPrice,
    perpMarkPrice,
    fundingRate8h,
    roundTripFeePct = 0.14,
  } = params;

  const effSpot = Math.max(1e-8, spotPrice);
  const perpBasisPct = Number((((perpMarkPrice - effSpot) / effSpot) * 100).toFixed(4));
  const annualizedFundingYieldPct = Number((fundingRate8h * 3 * 365 * 100).toFixed(2));
  const dailyFundingPct = Math.abs(fundingRate8h) * 3 * 100;
  const breakevenDays =
    dailyFundingPct > 1e-6 ? Number((roundTripFeePct / dailyFundingPct).toFixed(1)) : 999;

  // Annualized net carry assuming a 30-day holding cycle for fee amortization
  const annualizedFeeDragPct = roundTripFeePct * (365 / 30);

  if (fundingRate8h >= 0.00025 && perpBasisPct >= -0.05) {
    const netAnnualizedCarryYieldPct = Number(
      (annualizedFundingYieldPct + perpBasisPct * (365 / 30) - annualizedFeeDragPct).toFixed(2),
    );
    const isViableCarry = netAnnualizedCarryYieldPct >= roundTripFeePct * 3 * (365 / 30);
    return {
      spotPrice,
      perpMarkPrice,
      perpBasisPct,
      fundingRate8h,
      annualizedFundingYieldPct,
      roundTripFrictionPct: roundTripFeePct,
      netAnnualizedCarryYieldPct,
      breakevenDays,
      strategyAction: isViableCarry ? "LONG_SPOT_SHORT_PERP" : "NO_CARRY_EDGE",
      isViableCarry,
      rationaleVi: isViableCarry
        ? `Delta-Neutral Carry khả thi: MUA Spot + SHORT Perp thu lãi ròng ~${netAnnualizedCarryYieldPct}%/năm (Hòa vốn phí sau ${breakevenDays} ngày).`
        : `Funding dương (+${annualizedFundingYieldPct}%/năm) nhưng chưa vượt ngưỡng 3x phí giao dịch.`,
    };
  }

  if (fundingRate8h <= -0.00035 && perpBasisPct <= 0.05) {
    const borrowCostAnnualPct = 4.5;
    const netAnnualizedCarryYieldPct = Number(
      (Math.abs(annualizedFundingYieldPct) - perpBasisPct * (365 / 30) - annualizedFeeDragPct - borrowCostAnnualPct).toFixed(2),
    );
    const isViableCarry = netAnnualizedCarryYieldPct >= 12.0;
    return {
      spotPrice,
      perpMarkPrice,
      perpBasisPct,
      fundingRate8h,
      annualizedFundingYieldPct,
      roundTripFrictionPct: roundTripFeePct,
      netAnnualizedCarryYieldPct,
      breakevenDays,
      strategyAction: isViableCarry ? "SHORT_SPOT_LONG_PERP_REVERSE" : "NO_CARRY_EDGE",
      isViableCarry,
      rationaleVi: isViableCarry
        ? `Reverse Carry khả thi: LONG Perp nhận Funding âm + SHORT Margin Spot (~${netAnnualizedCarryYieldPct}%/năm sau phí vay).`
        : "Funding âm chưa đủ bù chi phí vay margin Spot.",
    };
  }

  return {
    spotPrice,
    perpMarkPrice,
    perpBasisPct,
    fundingRate8h,
    annualizedFundingYieldPct,
    roundTripFrictionPct: roundTripFeePct,
    netAnnualizedCarryYieldPct: Number((annualizedFundingYieldPct - annualizedFeeDragPct).toFixed(2)),
    breakevenDays,
    strategyAction: "NO_CARRY_EDGE",
    isViableCarry: false,
    rationaleVi: "Biên Funding Rate ở mức trung tính, chưa đủ biên lợi nhuận Cash-and-Carry.",
  };
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

  const micropriceAnalysis = computeMicropriceAndSpoofingSignal({
    orderBook,
  });
  const vpinToxicity =
    recentBars && recentBars.length >= 6 ? computeVolumeClockVpin(recentBars) : undefined;
  const fundingOiVelocityRegime = evaluateFundingOiVelocityRegime({
    fundingRate8h: fundingRate,
    priceChange24hPct,
    oiChange24hPct,
    vpin: vpinToxicity?.vpin,
  });
  const fundingCarryArbitrage = evaluateDeltaNeutralFundingCarry({
    spotPrice: indexPrice > 0 ? indexPrice : markPrice,
    perpMarkPrice: markPrice,
    fundingRate8h: fundingRate,
  });

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
    micropriceAnalysis,
    vpinToxicity,
    fundingOiVelocityRegime,
    fundingCarryArbitrage,
    commentary,
  };
}

