/**
 * INSTITUTIONAL FOREX ORDER FLOW & LIQUIDITY QUANT ENGINE (PRO)
 *
 * Implements hedge-fund grade order flow & liquidity reading:
 * 1. Volume Profile (VPOC - Point of Control & 70% Value Area VAH/VAL)
 * 2. Anchored Institutional VWAP with ±1σ / ±2σ Standard Deviation Bands
 * 3. Cumulative Volume Delta (CVD) Divergence & Institutional Absorption
 * 4. Liquidity Pools Hunter (Equal Highs EQH / Equal Lows EQL / Round Numbers)
 * 5. Order Flow Imbalance Ratio (Buying vs Selling Delta Surge)
 * 6. Flow Intensity Index (FII [-100 to +100]) & Sniper Signal Generation
 */

import type { OhlcvBar } from "../types";
import {
  evaluateForexSpreadSafety,
  type SpreadSafetyResult,
} from "./unified-cross-asset-quant";

export interface VolumeProfileBin {
  price: number;
  priceFormatted: string;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  isVpoc: boolean;
  isInValueArea: boolean;
  isHighVolumeNode: boolean;
  isLowVolumeNode: boolean;
}

export interface VolumeProfileResult {
  vpocPrice: number;
  vahPrice: number; // Value Area High (70% Volume Boundary)
  valPrice: number; // Value Area Low (70% Volume Boundary)
  totalVolume: number;
  valueAreaVolume: number;
  bins: VolumeProfileBin[];
}

export interface VwapBandsResult {
  vwap: number;
  upperBand1: number; // +1 std dev
  lowerBand1: number; // -1 std dev
  upperBand2: number; // +2 std dev (Extreme Overbought)
  lowerBand2: number; // -2 std dev (Extreme Oversold)
  position: "ABOVE_UPPER2" | "ABOVE_VWAP" | "BELOW_VWAP" | "BELOW_LOWER2";
  distanceToVwapPips: number;
}

export interface CvdPoint {
  time: number;
  price: number;
  delta: number;
  cvd: number;
}

export interface AbsorptionEvent {
  detected: boolean;
  type: "BULLISH_ABSORPTION" | "BEARISH_ABSORPTION" | "NONE";
  price: number;
  time: number;
  conviction: "ULTRA_HIGH" | "HIGH" | "MODERATE";
  detail: string;
}

export interface LiquidityPool {
  type: "BSL_POOL" | "SSL_POOL" | "ROUND_NUMBER";
  price: number;
  strengthPips: number;
  touches: number;
  distancePips: number;
  status: "UNTOUCHED" | "SWEPT" | "TESTED";
  label: string;
}

export interface InstitutionalFlowSignal {
  pair: string;
  bias: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  flowIntensityIndex: number; // -100 (Extreme Selling) to +100 (Extreme Accumulation)
  flowState:
    | "INSTITUTIONAL_ACCUMULATION"
    | "INSTITUTIONAL_DISTRIBUTION"
    | "ABSORPTION_IN_PROGRESS"
    | "LIQUIDITY_EXPANSION"
    | "LOW_LIQUIDITY_CHOP";
  confidenceScore: number; // 0 - 100%
  absorption: AbsorptionEvent;
  volumeProfile: VolumeProfileResult;
  vwap: VwapBandsResult;
  liquidityTargets: {
    bslTargets: LiquidityPool[];
    sslTargets: LiquidityPool[];
  };
  sniperSetup: {
    direction: "BUY" | "SELL" | "STAND_ASIDE";
    optimalEntry: number | null;
    tightStopLoss: number | null;
    stopPips: number | null;
    targetTP1: number | null;
    targetTP2: number | null;
    targetTP3: number | null;
    riskRewardRatio: number | null;
    rationale: string[];
    riskAdvice: string;
  };
  lastDelta: number;
  cvdDivergence: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE";
  spreadSafety?: SpreadSafetyResult;
  summary: string;
}

import { getAssetPipSize, getPriceDecimals, roundPrice } from "./asset-precision";
import { extractCausalLiquidityPools } from "./ict-smc-liquidity-engine";

/**
 * Helper to get pip scale for a pair.
 */
function getPipScale(pair: string): number {
  return getAssetPipSize(pair);
}

/**
 * 1. VOLUME PROFILE & VALUE AREA (70% Volume Boundary)
 */
export function computeVolumeProfile(
  bars: OhlcvBar[],
  numBins = 24
): VolumeProfileResult {
  if (bars.length === 0) {
    return {
      vpocPrice: 0,
      vahPrice: 0,
      valPrice: 0,
      totalVolume: 0,
      valueAreaVolume: 0,
      bins: [],
    };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVolume = 0;

  for (const b of bars) {
    if (b.low < minPrice) minPrice = b.low;
    if (b.high > maxPrice) maxPrice = b.high;
    totalVolume += b.volume ?? 1;
  }

  const range = Math.max(1e-8, maxPrice - minPrice);
  const binStep = range / numBins;

  // Initialize bins
  const rawBins: {
    price: number;
    volume: number;
    buyVolume: number;
    sellVolume: number;
  }[] = Array.from({ length: numBins }, (_, i) => ({
    price: minPrice + (i + 0.5) * binStep,
    volume: 0,
    buyVolume: 0,
    sellVolume: 0,
  }));

  // Distribute volume across all overlapped price bins in [b.low, b.high] with body weighting
  for (const b of bars) {
    const v = b.volume ?? 1;
    const candleRange = Math.max(1e-8, b.high - b.low);
    const clv = ((b.close - b.low) - (b.high - b.close)) / candleRange;
    const buyRatio = Math.min(1, Math.max(0, 0.5 + clv * 0.5));
    const buyPart = v * buyRatio;
    const sellPart = v - buyPart;

    const startBin = Math.min(
      numBins - 1,
      Math.max(0, Math.floor((b.low - minPrice) / binStep)),
    );
    const endBin = Math.min(
      numBins - 1,
      Math.max(startBin, Math.floor((b.high - minPrice) / binStep)),
    );

    if (startBin === endBin) {
      rawBins[startBin].volume += v;
      rawBins[startBin].buyVolume += buyPart;
      rawBins[startBin].sellVolume += sellPart;
      continue;
    }

    const bodyLow = Math.min(b.open, b.close);
    const bodyHigh = Math.max(b.open, b.close);
    const weights: number[] = [];
    let weightSum = 0;
    for (let idx = startBin; idx <= endBin; idx++) {
      const binLow = minPrice + idx * binStep;
      const binHigh = binLow + binStep;
      const rangeOverlap = Math.max(0, Math.min(b.high, binHigh) - Math.max(b.low, binLow));
      const bodyOverlap = Math.max(0, Math.min(bodyHigh, binHigh) - Math.max(bodyLow, binLow));
      const w = Math.max(1e-6, rangeOverlap * 0.4 + bodyOverlap * 0.6);
      weights.push(w);
      weightSum += w;
    }

    for (let idx = startBin; idx <= endBin; idx++) {
      const share = weightSum > 0 ? weights[idx - startBin]! / weightSum : 1 / (endBin - startBin + 1);
      rawBins[idx].volume += v * share;
      rawBins[idx].buyVolume += buyPart * share;
      rawBins[idx].sellVolume += sellPart * share;
    }
  }

  // Find VPOC (Bin with maximum volume)
  let maxVol = 0;
  let pocIdx = 0;
  for (let i = 0; i < rawBins.length; i++) {
    if (rawBins[i].volume > maxVol) {
      maxVol = rawBins[i].volume;
      pocIdx = i;
    }
  }

  const vpocPrice = rawBins[pocIdx].price;

  // Compute 70% Value Area (VAH & VAL) expanding symmetrically from VPOC
  const targetVaVolume = totalVolume * 0.7;
  let currentVaVolume = rawBins[pocIdx].volume;
  let upIdx = pocIdx;
  let downIdx = pocIdx;

  while (currentVaVolume < targetVaVolume && (upIdx < numBins - 1 || downIdx > 0)) {
    const nextUpVol = upIdx < numBins - 1 ? rawBins[upIdx + 1].volume : 0;
    const nextDownVol = downIdx > 0 ? rawBins[downIdx - 1].volume : 0;

    if (nextUpVol >= nextDownVol && upIdx < numBins - 1) {
      upIdx++;
      currentVaVolume += rawBins[upIdx].volume;
    } else if (downIdx > 0) {
      downIdx--;
      currentVaVolume += rawBins[downIdx].volume;
    } else if (upIdx < numBins - 1) {
      upIdx++;
      currentVaVolume += rawBins[upIdx].volume;
    } else {
      break;
    }
  }

  const vahPrice = rawBins[upIdx].price;
  const valPrice = rawBins[downIdx].price;
  const avgBinVol = totalVolume / numBins;

  const bins: VolumeProfileBin[] = rawBins.map((b, idx) => ({
    price: b.price,
    priceFormatted: b.price >= 100 ? b.price.toFixed(2) : b.price.toFixed(4),
    volume: Math.round(b.volume),
    buyVolume: Math.round(b.buyVolume),
    sellVolume: Math.round(b.sellVolume),
    isVpoc: idx === pocIdx,
    isInValueArea: idx >= downIdx && idx <= upIdx,
    isHighVolumeNode: b.volume >= avgBinVol * 1.5,
    isLowVolumeNode: b.volume <= avgBinVol * 0.4,
  }));

  return {
    vpocPrice,
    vahPrice,
    valPrice,
    totalVolume: Math.round(totalVolume),
    valueAreaVolume: Math.round(currentVaVolume),
    bins,
  };
}

/**
 * 2. ANCHORED INSTITUTIONAL VWAP & STD DEV BANDS (±1σ, ±2σ)
 */
export function computeSessionVwap(pair: string, bars: OhlcvBar[]): VwapBandsResult {
  const pip = getPipScale(pair);
  if (bars.length === 0) {
    return {
      vwap: 0,
      upperBand1: 0,
      lowerBand1: 0,
      upperBand2: 0,
      lowerBand2: 0,
      position: "ABOVE_VWAP",
      distanceToVwapPips: 0,
    };
  }

  let cumVol = 0;
  let cumVwapVol = 0;
  const lastPrice = bars[bars.length - 1].close;

  for (const b of bars) {
    const v = b.volume ?? 1;
    const typicalPrice = (b.high + b.low + b.close) / 3;
    cumVol += v;
    cumVwapVol += typicalPrice * v;
  }

  const vwap = cumVwapVol / (cumVol || 1);

  // Compute variance for standard deviation bands
  let cumVariance = 0;
  for (const b of bars) {
    const v = b.volume ?? 1;
    const typicalPrice = (b.high + b.low + b.close) / 3;
    const diff = typicalPrice - vwap;
    cumVariance += diff * diff * v;
  }

  const stdDev = Math.sqrt(cumVariance / (cumVol || 1));
  const upperBand1 = vwap + stdDev;
  const lowerBand1 = vwap - stdDev;
  const upperBand2 = vwap + 2 * stdDev;
  const lowerBand2 = vwap - 2 * stdDev;

  let position: VwapBandsResult["position"] = "ABOVE_VWAP";
  if (lastPrice >= upperBand2) {
    position = "ABOVE_UPPER2";
  } else if (lastPrice <= lowerBand2) {
    position = "BELOW_LOWER2";
  } else if (lastPrice < vwap) {
    position = "BELOW_VWAP";
  }

  const distanceToVwapPips =
    Math.round((Math.abs(lastPrice - vwap) / pip) * 10) / 10;

  return {
    vwap,
    upperBand1,
    lowerBand1,
    upperBand2,
    lowerBand2,
    position,
    distanceToVwapPips,
  };
}

/**
 * 3. CVD (CUMULATIVE VOLUME DELTA) & ABSORPTION DETECTION
 */
export function detectCvdAndAbsorption(
  pair: string,
  bars: OhlcvBar[]
): {
  cvdTimeline: CvdPoint[];
  lastDelta: number;
  cvdDivergence: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE";
  absorption: AbsorptionEvent;
} {
  const pip = getPipScale(pair);
  const n = bars.length;
  if (n < 10) {
    return {
      cvdTimeline: [],
      lastDelta: 0,
      cvdDivergence: "NONE",
      absorption: {
        detected: false,
        type: "NONE",
        price: 0,
        time: 0,
        conviction: "MODERATE",
        detail: "Chưa đủ dữ liệu.",
      },
    };
  }

  let cumDelta = 0;
  const cvdTimeline: CvdPoint[] = [];

  for (const b of bars) {
    const v = b.volume ?? 1;
    const candleRange = Math.max(1e-8, b.high - b.low);
    const clv = ((b.close - b.low) - (b.high - b.close)) / candleRange;
    const buyPart = v * (0.5 + clv * 0.5);
    const sellPart = v - buyPart;
    const delta = buyPart - sellPart;
    cumDelta += delta;

    cvdTimeline.push({
      time: b.time,
      price: b.close,
      delta: Math.round(delta),
      cvd: Math.round(cumDelta),
    });
  }

  const lastDelta = cvdTimeline[n - 1]?.delta ?? 0;

  // Check CVD Divergence between structural pivots in recent 20 bars
  const checkWindow = Math.min(20, n);
  const recentBars = bars.slice(-checkWindow);
  const recentCvd = cvdTimeline.slice(-checkWindow);

  // Recent trough / peak in the last 4 bars
  const tailStart = Math.max(3, checkWindow - 4);
  let recentLowIdx = tailStart;
  let recentHighIdx = tailStart;
  for (let i = tailStart; i < checkWindow; i++) {
    if (recentBars[i].low <= recentBars[recentLowIdx].low) recentLowIdx = i;
    if (recentBars[i].high >= recentBars[recentHighIdx].high) recentHighIdx = i;
  }

  // Prior distinct swing trough / peak at least 3 bars earlier
  const priorEnd = Math.max(1, tailStart - 2);
  let priorLowIdx = 0;
  let priorHighIdx = 0;
  for (let i = 1; i < priorEnd; i++) {
    if (recentBars[i].low < recentBars[priorLowIdx].low) priorLowIdx = i;
    if (recentBars[i].high > recentBars[priorHighIdx].high) priorHighIdx = i;
  }

  let cvdDivergence: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" = "NONE";
  let absorption: AbsorptionEvent = {
    detected: false,
    type: "NONE",
    price: bars[n - 1].close,
    time: bars[n - 1].time,
    conviction: "MODERATE",
    detail: "Không có hấp thụ bất thường.",
  };

  // Bullish Absorption: Price makes lower/equal low vs prior swing low (within 2 pips), but CVD makes higher low
  if (
    recentLowIdx - priorLowIdx >= 3 &&
    recentBars[recentLowIdx].low <= recentBars[priorLowIdx].low + pip * 2 &&
    recentCvd[recentLowIdx].cvd > recentCvd[priorLowIdx].cvd
  ) {
    cvdDivergence = "BULLISH_DIVERGENCE";
    absorption = {
      detected: true,
      type: "BULLISH_ABSORPTION",
      price: bars[n - 1].close,
      time: bars[n - 1].time,
      conviction: "ULTRA_HIGH",
      detail:
        "HẤP THỤ MUA (Bullish Absorption): Khối lượng bán xả mạnh nhưng giá không tạo đáy sâu mới. Cá mập đặt Limit Buy hấp thụ sạch thanh khoản bán tháo.",
    };
  }
  // Bearish Absorption: Price makes higher/equal high vs prior swing high, but CVD makes lower high
  else if (
    recentHighIdx - priorHighIdx >= 3 &&
    recentBars[recentHighIdx].high >= recentBars[priorHighIdx].high - pip * 2 &&
    recentCvd[recentHighIdx].cvd < recentCvd[priorHighIdx].cvd
  ) {
    cvdDivergence = "BEARISH_DIVERGENCE";
    absorption = {
      detected: true,
      type: "BEARISH_ABSORPTION",
      price: bars[n - 1].close,
      time: bars[n - 1].time,
      conviction: "ULTRA_HIGH",
      detail:
        "HẤP THỤ BÁN (Bearish Absorption): Lực mua chủ động FOMO đẩy lên nhưng bị tường Limit Sell tổ chức hấp thụ hoàn toàn. Báo hiệu nhịp đảo chiều xả hàng.",
    };
  }

  return {
    cvdTimeline,
    lastDelta,
    cvdDivergence,
    absorption,
  };
}

/**
 * 4. LIQUIDITY POOLS HUNTER (SSOT-delegated EQH / EQL + Asset-Aware Round Numbers)
 */
export function detectLiquidityPools(pair: string, bars: OhlcvBar[]): {
  bslTargets: LiquidityPool[];
  sslTargets: LiquidityPool[];
} {
  const n = bars.length;
  if (n < 20) return { bslTargets: [], sslTargets: [] };

  const currentPrice = bars[n - 1].close;
  const pip = getAssetPipSize(pair, "FOREX", currentPrice);
  const dec = getPriceDecimals(currentPrice, pair, "FOREX");
  const { allBslPools, allSslPools } = extractCausalLiquidityPools(bars, pip);

  const bslTargets: LiquidityPool[] = [];
  const sslTargets: LiquidityPool[] = [];

  for (const p of allBslPools) {
    if (p.status !== "UNTOUCHED" || p.price <= currentPrice) continue;
    const distPips = Math.round(((p.price - currentPrice) / pip) * 10) / 10;
    const isEqh = p.type === "EQH";
    bslTargets.push({
      type: "BSL_POOL",
      price: roundPrice(p.price, pair, "FOREX"),
      strengthPips: isEqh ? 2.5 : 1.0,
      touches: isEqh ? 2 : 1,
      distancePips: distPips,
      status: "UNTOUCHED",
      label: isEqh ? `EQH Buy-Side Pool (+${distPips} pips)` : `BSL Swing Pool (+${distPips} pips)`,
    });
  }

  for (const p of allSslPools) {
    if (p.status !== "UNTOUCHED" || p.price >= currentPrice) continue;
    const distPips = Math.round(((currentPrice - p.price) / pip) * 10) / 10;
    const isEql = p.type === "EQL";
    sslTargets.push({
      type: "SSL_POOL",
      price: roundPrice(p.price, pair, "FOREX"),
      strengthPips: isEql ? 2.5 : 1.0,
      touches: isEql ? 2 : 1,
      distancePips: distPips,
      status: "UNTOUCHED",
      label: isEql ? `EQL Sell-Side Pool (-${distPips} pips)` : `SSL Swing Pool (-${distPips} pips)`,
    });
  }

  // Adaptive institutional psychological round level (EURUSD 0.005, JPY 0.50, XAU 10.0, OIL 1.0)
  const clean = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const roundStep = clean.startsWith("XAU")
    ? 10.0
    : clean.includes("OIL")
      ? 1.0
      : clean.includes("JPY")
        ? 0.5
        : pip * 50;
  const roundAbove = roundPrice(Math.ceil(currentPrice / roundStep) * roundStep, pair, "FOREX");
  const roundBelow = roundPrice(Math.floor(currentPrice / roundStep) * roundStep, pair, "FOREX");

  if (roundAbove > currentPrice) {
    const dist = Math.round(((roundAbove - currentPrice) / pip) * 10) / 10;
    bslTargets.push({
      type: "ROUND_NUMBER",
      price: roundAbove,
      strengthPips: 0,
      touches: 1,
      distancePips: dist,
      status: "UNTOUCHED",
      label: `Round Level ${roundAbove.toFixed(dec)} (+${dist} pips)`,
    });
  }

  if (roundBelow < currentPrice) {
    const dist = Math.round(((currentPrice - roundBelow) / pip) * 10) / 10;
    sslTargets.push({
      type: "ROUND_NUMBER",
      price: roundBelow,
      strengthPips: 0,
      touches: 1,
      distancePips: dist,
      status: "UNTOUCHED",
      label: `Round Level ${roundBelow.toFixed(dec)} (-${dist} pips)`,
    });
  }

  bslTargets.sort((a, b) => a.distancePips - b.distancePips);
  sslTargets.sort((a, b) => a.distancePips - b.distancePips);

  return {
    bslTargets: bslTargets.slice(0, 3),
    sslTargets: sslTargets.slice(0, 3),
  };
}

/**
 * 5. INSTITUTIONAL FLOW INTENSITY INDEX (FII) & SNIPER SETUP GENERATOR
 */
export function generateDeepFlowSignal(
  pair: string,
  bars: OhlcvBar[],
  spreadOptions?: { currentSpreadPips: number; historicalSpreadsPips?: number[] }
): InstitutionalFlowSignal {
  const cleanPair = pair.toUpperCase().replace("/", "").replace("-", "");
  const pip = getPipScale(cleanPair);

  if (bars.length < 25) {
    return {
      pair: cleanPair,
      bias: "NEUTRAL",
      flowIntensityIndex: 0,
      flowState: "LOW_LIQUIDITY_CHOP",
      confidenceScore: 50,
      absorption: {
        detected: false,
        type: "NONE",
        price: 0,
        time: 0,
        conviction: "MODERATE",
        detail: "Dữ liệu không đủ để phân tích dòng tiền chuyên sâu.",
      },
      volumeProfile: {
        vpocPrice: 0,
        vahPrice: 0,
        valPrice: 0,
        totalVolume: 0,
        valueAreaVolume: 0,
        bins: [],
      },
      vwap: {
        vwap: 0,
        upperBand1: 0,
        lowerBand1: 0,
        upperBand2: 0,
        lowerBand2: 0,
        position: "ABOVE_VWAP",
        distanceToVwapPips: 0,
      },
      liquidityTargets: { bslTargets: [], sslTargets: [] },
      sniperSetup: {
        direction: "STAND_ASIDE",
        optimalEntry: null,
        tightStopLoss: null,
        stopPips: null,
        targetTP1: null,
        targetTP2: null,
        targetTP3: null,
        riskRewardRatio: null,
        rationale: ["Cần tối thiểu 25 nến OHLCV."],
        riskAdvice: "Chờ phiên chính London/NY mở cửa.",
      },
      lastDelta: 0,
      cvdDivergence: "NONE",
      summary: "Dữ liệu chưa đủ.",
    };
  }

  const currentPrice = bars[bars.length - 1].close;

  // Run all sub-engines
  const profile = computeVolumeProfile(bars, 24);
  const vwap = computeSessionVwap(cleanPair, bars);
  const { cvdTimeline, lastDelta, cvdDivergence, absorption } =
    detectCvdAndAbsorption(cleanPair, bars);
  const liquidity = detectLiquidityPools(cleanPair, bars);

  // Calculate Flow Intensity Index (FII) [-100 to +100]
  let fii = 0;

  // Factor 1: Position relative to VPOC & Value Area (-25 to +25)
  if (currentPrice > profile.vahPrice) fii += 20;
  else if (currentPrice > profile.vpocPrice) fii += 10;
  else if (currentPrice < profile.valPrice) fii -= 20;
  else if (currentPrice < profile.vpocPrice) fii -= 10;

  // Factor 2: Position relative to VWAP (-25 to +25)
  if (currentPrice > vwap.upperBand1) fii += 20;
  else if (currentPrice > vwap.vwap) fii += 10;
  else if (currentPrice < vwap.lowerBand1) fii -= 20;
  else if (currentPrice < vwap.vwap) fii -= 10;

  // Factor 3: CVD Delta & Divergence (-30 to +30)
  if (cvdDivergence === "BULLISH_DIVERGENCE") fii += 30;
  else if (cvdDivergence === "BEARISH_DIVERGENCE") fii -= 30;
  else if (lastDelta > 0) fii += 10;
  else if (lastDelta < 0) fii -= 10;

  // Factor 4: Absorption boost (±20)
  if (absorption.type === "BULLISH_ABSORPTION") fii += 20;
  if (absorption.type === "BEARISH_ABSORPTION") fii -= 20;

  // Clamp FII between -100 and +100
  fii = Math.max(-100, Math.min(100, fii));

  let bias: InstitutionalFlowSignal["bias"] = "NEUTRAL";
  let flowState: InstitutionalFlowSignal["flowState"] = "LOW_LIQUIDITY_CHOP";

  if (fii >= 60) {
    bias = "STRONG_BUY";
    flowState = "INSTITUTIONAL_ACCUMULATION";
  } else if (fii >= 25) {
    bias = "BUY";
    flowState = "LIQUIDITY_EXPANSION";
  } else if (fii <= -60) {
    bias = "STRONG_SELL";
    flowState = "INSTITUTIONAL_DISTRIBUTION";
  } else if (fii <= -25) {
    bias = "SELL";
    flowState = "LIQUIDITY_EXPANSION";
  } else if (absorption.detected) {
    flowState = "ABSORPTION_IN_PROGRESS";
  }

  const confidenceScore = Math.min(
    95,
    Math.max(48, Math.round(50 + Math.abs(fii) * 0.42))
  );

  // Formulation of Sniper Setup
  let direction: "BUY" | "SELL" | "STAND_ASIDE" = "STAND_ASIDE";
  let optimalEntry: number | null = null;
  let tightStopLoss: number | null = null;
  let targetTP1: number | null = null;
  let targetTP2: number | null = null;
  let targetTP3: number | null = null;
  const rationale: string[] = [];

  if (bias === "STRONG_BUY" || bias === "BUY") {
    direction = "BUY";
    // Optimal entry: Pullback to VWAP or VPOC (whichever is closer below price)
    optimalEntry = Math.max(profile.valPrice, Math.min(currentPrice, vwap.vwap));
    // Tight Stop Loss: Just below VAL (Value Area Low) or VWAP Lower Band
    tightStopLoss = Math.min(profile.valPrice, vwap.lowerBand1) - 4 * pip;

    // Targets aim directly at Buy-Side Liquidity Pools (BSL)
    const targetBsl = liquidity.bslTargets[0]?.price;
    const risk = optimalEntry - tightStopLoss;
    targetTP1 = optimalEntry + risk * 1.5;
    targetTP2 = targetBsl && targetBsl > targetTP1 ? targetBsl : optimalEntry + risk * 2.5;
    targetTP3 = optimalEntry + risk * 3.8;

    rationale.push(
      `Dòng tiền tích lũy FII: +${fii} | Khối lượng mua áp đảo Value Area.`
    );
    if (absorption.detected) {
      rationale.push(absorption.detail);
    }
    if (liquidity.bslTargets[0]) {
      rationale.push(`Mục tiêu quét thanh khoản: ${liquidity.bslTargets[0].label}.`);
    }
  } else if (bias === "STRONG_SELL" || bias === "SELL") {
    direction = "SELL";
    // Optimal entry: Pullback to VWAP or VPOC above
    optimalEntry = Math.min(profile.vahPrice, Math.max(currentPrice, vwap.vwap));
    // Tight Stop Loss: Just above VAH or VWAP Upper Band
    tightStopLoss = Math.max(profile.vahPrice, vwap.upperBand1) + 4 * pip;

    const targetSsl = liquidity.sslTargets[0]?.price;
    const risk = tightStopLoss - optimalEntry;
    targetTP1 = optimalEntry - risk * 1.5;
    targetTP2 = targetSsl && targetSsl < targetTP1 ? targetSsl : optimalEntry - risk * 2.5;
    targetTP3 = optimalEntry - risk * 3.8;

    rationale.push(
      `Dòng tiền phân phối FII: ${fii} | Khối lượng bán áp đảo Value Area.`
    );
    if (absorption.detected) {
      rationale.push(absorption.detail);
    }
    if (liquidity.sslTargets[0]) {
      rationale.push(`Mục tiêu săn thanh khoản: ${liquidity.sslTargets[0].label}.`);
    }
  }

  const stopPips =
    optimalEntry && tightStopLoss
      ? Math.round((Math.abs(optimalEntry - tightStopLoss) / pip) * 10) / 10
      : null;

  const rrRatio =
    optimalEntry && tightStopLoss && targetTP2
      ? Math.round(
          (Math.abs(targetTP2 - optimalEntry) /
            Math.abs(optimalEntry - tightStopLoss)) *
            10
        ) / 10
      : 2.2;

  const riskAdvice =
    stopPips && stopPips > 35
      ? "Khoảng cắt lỗ khá rộng (>35 pips). Khuyến nghị chia nhỏ lệnh thành 2 phần (50% Market, 50% Limit tại VWAP)."
      : "Khoảng cắt lỗ đạt chuẩn Sniper (<25 pips). Đi đúng khối lượng tính toán.";

  let spreadSafety: SpreadSafetyResult | undefined;
  if (spreadOptions) {
    const isGold = cleanPair.includes("XAU") || cleanPair.includes("GOLD");
    const isSilver = cleanPair.includes("XAG") || cleanPair.includes("SILVER");
    const assetType = isGold ? "GOLD" : isSilver ? "SILVER" : "FX_MAJOR";
    spreadSafety = evaluateForexSpreadSafety(
      spreadOptions.currentSpreadPips,
      spreadOptions.historicalSpreadsPips ?? [],
      assetType
    );

    if (!spreadSafety.isSafe && spreadSafety.lockoutReason) {
      direction = "STAND_ASIDE";
      rationale.unshift(`[CIRCUIT BREAKER SPREAD] ${spreadSafety.lockoutReason}`);
    }
  }

  const summary = `Flow Index: ${fii > 0 ? "+" : ""}${fii} (${flowState}) | VPOC: ${profile.vpocPrice >= 100 ? profile.vpocPrice.toFixed(2) : profile.vpocPrice.toFixed(4)} | VWAP: ${vwap.vwap >= 100 ? vwap.vwap.toFixed(2) : vwap.vwap.toFixed(4)}`;

  return {
    pair: cleanPair,
    bias,
    flowIntensityIndex: fii,
    flowState,
    confidenceScore,
    absorption,
    volumeProfile: profile,
    vwap,
    liquidityTargets: liquidity,
    sniperSetup: {
      direction,
      optimalEntry,
      tightStopLoss,
      stopPips,
      targetTP1,
      targetTP2,
      targetTP3,
      riskRewardRatio: rrRatio,
      rationale,
      riskAdvice,
    },
    lastDelta,
    cvdDivergence,
    spreadSafety,
    summary,
  };
}

