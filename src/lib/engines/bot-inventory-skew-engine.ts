/**
 * Bot Inventory Skew & Asymmetric Risk Engine (Hummingbot Parity)
 *
 * Implements high-frequency market making and inventory management from `hummingbot/hummingbot`:
 * 1. Avellaneda-Stoikov (2008) Reservation Price:
 *    r(s, q, t) = s - q * gamma * sigma^2 * (T - t)
 * 2. Optimal Asymmetric Quoting Spreads:
 *    Calculates dynamic bid/ask skew based on net inventory risk aversion.
 * 3. Inventory-Aware Asymmetric Position Sizing & Dampening:
 *    Automatically scales down order lots in saturated inventory directions (q -> Q_max)
 *    and facilitates inventory rebalancing towards delta-neutral.
 * 4. Hanging Orders & Adverse Selection Guard:
 *    Detects stale resting orders hanging outside safe microprice bounds.
 */

import { roundPrice, type PrecisionAssetType } from "./asset-precision";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AvellanedaStoikovParams {
  /** Current reference or mid price (s) */
  midPrice: number;
  /** Current net inventory position (q: long - short) in base units or contract quantity */
  netInventory: number;
  /** Maximum allowable inventory capacity (Q_max > 0) */
  maxInventoryCapacity: number;
  /** Risk aversion parameter (gamma > 0, default: 0.1) */
  gamma?: number;
  /** Normalized asset return volatility (sigma > 0, e.g. daily/intraday standard deviation, default: 0.02) */
  volatilitySigma?: number;
  /** Normalized time horizon remaining (T - t in [0.01, 1.0], default: 1.0) */
  timeHorizonFraction?: number;
  /** Order book liquidity/intensity parameter (kappa > 0, default: 1.5) */
  orderIntensityKappa?: number;
  /** Optional Level-2 Order Book Imbalance in [-1.0, 1.0] */
  orderBookImbalance?: number;
  /** Asset type for price precision rounding */
  assetType?: PrecisionAssetType;
  /** Symbol for precision decimals */
  symbol?: string;
}

export interface AvellanedaStoikovResult {
  /** Reference mid price */
  midPrice: number;
  /** Skewed Avellaneda-Stoikov reservation price r(s, q, t) */
  reservationPrice: number;
  /** Price shift from mid due to inventory (reservationPrice - midPrice) */
  inventoryPriceShift: number;
  /** Normalized inventory saturation ratio: q / Q_max in [-1.0, 1.0] */
  inventoryRatio: number;
  /** Optimal symmetric base half-spread delta */
  optimalHalfSpread: number;
  /** Skewed optimal bid quote: r - delta */
  optimalBidPrice: number;
  /** Skewed optimal ask quote: r + delta */
  optimalAskPrice: number;
  /** Bid distance from mid (mid - optimalBidPrice) */
  bidSpreadFromMid: number;
  /** Ask distance from mid (optimalAskPrice - mid) */
  askSpreadFromMid: number;
  /** Qualitative inventory regime recommendation */
  inventoryRegime: "LONG_HEAVY_SKEW_DOWN" | "SHORT_HEAVY_SKEW_UP" | "DELTA_NEUTRAL";
}

export interface InventorySizingParams {
  /** Candidate trade direction */
  direction: "BUY" | "SELL";
  /** Base lot size or quantity before skew adjustment */
  baseLotsOrQty: number;
  /** Current net inventory (q) */
  netInventory: number;
  /** Maximum allowable inventory capacity (Q_max) */
  maxInventoryCapacity: number;
  /** Nonlinear dampening exponent (alpha >= 1, default: 1.5) */
  dampeningAlpha?: number;
  /** Maximum allowable inventory ratio before hard cutoff (default: 0.90 = 90%) */
  hardCutoffRatio?: number;
}

export interface InventorySizingResult {
  /** Recommended lot size or quantity after inventory dampening / rebalancing */
  adjustedLotsOrQty: number;
  /** Applied multiplier on base size in [0.0, 1.5] */
  sizeMultiplier: number;
  /** Normalized inventory ratio in [-1.0, 1.0] */
  inventoryRatio: number;
  /** Whether the trade is blocked due to inventory saturation */
  isBlockedByCapacity: boolean;
  /** Explanatory rationale */
  rationale: string;
}

export interface HangingOrderRiskParams {
  /** Order direction */
  orderDirection: "BUY" | "SELL";
  /** Limit order price */
  limitPrice: number;
  /** Current live mark / market price */
  currentPrice: number;
  /** Current asset ATR or expected spread */
  atrOrSpread: number;
  /** Maximum allowable adverse drift multiple (default: 2.5x ATR/spread) */
  maxAdverseRatio?: number;
}

export interface HangingOrderRiskResult {
  /** Whether the resting order should be cancelled immediately */
  shouldCancel: boolean;
  /** Adverse distance in price points */
  adverseDistance: number;
  /** Ratio of adverse drift relative to ATR/spread */
  driftRatio: number;
  /** Reason for action */
  reason: string;
}

export interface AdjustTradeSetupWithInventorySkewParams {
  symbol: string;
  assetType: PrecisionAssetType;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  baseLotsOrQty: number;
  netInventory: number;
  maxInventoryCapacity: number;
  volatilitySigma?: number;
  orderBookImbalance?: number;
  atr?: number;
}

export interface SkewAdjustedTradeSetup {
  symbol: string;
  direction: "BUY" | "SELL";
  originalEntryPrice: number;
  skewedEntryPrice: number;
  originalLotsOrQty: number;
  adjustedLotsOrQty: number;
  sizeMultiplier: number;
  isCapacityBlocked: boolean;
  asymmetricTakeProfit1: number;
  inventoryRatio: number;
  rationale: string;
}

// ============================================================================
// 1. Avellaneda-Stoikov Core Calculation
// ============================================================================

/**
 * Calculates Avellaneda-Stoikov (2008) reservation price and asymmetric bid/ask quotes.
 *
 * Formula:
 * r(s, q, t) = s - q * gamma * sigma^2 * (T - t)
 *
 * Spread*(s, t) = gamma * sigma^2 * (T - t) + (2 / gamma) * ln(1 + gamma / kappa)
 */
export function calculateAvellanedaStoikovSkew(
  params: AvellanedaStoikovParams,
): AvellanedaStoikovResult {
  const {
    midPrice,
    netInventory,
    maxInventoryCapacity,
    gamma = 0.1,
    volatilitySigma = 0.02,
    timeHorizonFraction = 1.0,
    orderIntensityKappa = 1.5,
    orderBookImbalance = 0.0,
    assetType = "CRYPTO",
    symbol = "",
  } = params;

  const safeMid = Number.isFinite(midPrice) && midPrice > 0 ? midPrice : 1.0;
  const safeCapacity = Number.isFinite(maxInventoryCapacity) && maxInventoryCapacity > 0 ? maxInventoryCapacity : 1.0;
  const rawRatio = netInventory / safeCapacity;
  const inventoryRatio = Math.max(-1.0, Math.min(1.0, rawRatio));

  const safeGamma = Math.max(1e-4, Math.min(5.0, gamma));
  const safeSigma = Math.max(1e-4, Math.min(1.0, volatilitySigma));
  const safeTime = Math.max(0.01, Math.min(1.0, timeHorizonFraction));
  const safeKappa = Math.max(0.01, Math.min(50.0, orderIntensityKappa));

  // Variance factor: sigma^2 * (T - t)
  const volVariance = (safeSigma * safeMid) ** 2 * safeTime;

  // Inventory shift: q * gamma * sigma^2 * (T - t)
  // Scaled by inventory ratio so inventory is normalized to mid price scale
  const rawInventoryShift = inventoryRatio * safeGamma * volVariance * 0.05;

  // Level-2 Microprice adjustment from order book imbalance:
  // Imbalance I in [-1, 1], adjusts reservation price slightly towards dominant pressure
  const microAdjustment = (Math.max(-1, Math.min(1, orderBookImbalance)) * (safeMid * safeSigma * 0.05));

  // Reservation Price: r = s - shift + microAdjustment
  const reservationPrice = safeMid - rawInventoryShift + microAdjustment;
  const inventoryPriceShift = reservationPrice - safeMid;

  // Optimal spread width: gamma * sigma^2 * (T - t) + (2 / gamma) * ln(1 + gamma / kappa)
  const baseSpreadTerm = safeGamma * volVariance * 0.05;
  const liquidityTerm = (2.0 / safeGamma) * Math.log(1.0 + safeGamma / safeKappa) * (safeMid * 0.001);
  const totalOptimalSpread = Math.max(safeMid * 0.0005, baseSpreadTerm + liquidityTerm);
  const optimalHalfSpread = totalOptimalSpread / 2.0;

  // Asymmetric optimal quotes
  const optimalBidPrice = roundPrice(reservationPrice - optimalHalfSpread, symbol, assetType);
  const optimalAskPrice = roundPrice(reservationPrice + optimalHalfSpread, symbol, assetType);
  const roundedReservation = roundPrice(reservationPrice, symbol, assetType);

  let inventoryRegime: AvellanedaStoikovResult["inventoryRegime"] = "DELTA_NEUTRAL";
  if (inventoryRatio > 0.15) {
    inventoryRegime = "LONG_HEAVY_SKEW_DOWN";
  } else if (inventoryRatio < -0.15) {
    inventoryRegime = "SHORT_HEAVY_SKEW_UP";
  }

  return {
    midPrice: safeMid,
    reservationPrice: roundedReservation,
    inventoryPriceShift: Number(inventoryPriceShift.toFixed(6)),
    inventoryRatio: Number(inventoryRatio.toFixed(4)),
    optimalHalfSpread: Number(optimalHalfSpread.toFixed(6)),
    optimalBidPrice,
    optimalAskPrice,
    bidSpreadFromMid: Number((safeMid - optimalBidPrice).toFixed(6)),
    askSpreadFromMid: Number((optimalAskPrice - safeMid).toFixed(6)),
    inventoryRegime,
  };
}

// ============================================================================
// 2. Inventory Sizing & Asymmetric Dampening
// ============================================================================

/**
 * Computes asymmetric lot sizing multiplier based on inventory saturation.
 * - Squeezes order size down when accumulating further in an overloaded direction.
 * - Shuts down completely if capacity exceeds hardCutoffRatio (e.g. >= 90%).
 * - Gently boosts sizing (up to 1.35x) when trade direction rebalances inventory towards neutral.
 */
export function calculateInventorySizingMultiplier(
  params: InventorySizingParams,
): InventorySizingResult {
  const {
    direction,
    baseLotsOrQty,
    netInventory,
    maxInventoryCapacity,
    dampeningAlpha = 1.5,
    hardCutoffRatio = 0.90,
  } = params;

  const safeCapacity = Number.isFinite(maxInventoryCapacity) && maxInventoryCapacity > 0 ? maxInventoryCapacity : 1.0;
  const rawRatio = netInventory / safeCapacity;
  const inventoryRatio = Math.max(-1.0, Math.min(1.0, rawRatio));
  const isBuy = direction === "BUY";

  let sizeMultiplier = 1.0;
  let isBlockedByCapacity = false;
  let rationale = "Delta neutral inventory: Standard 1.0x allocation";

  if (isBuy) {
    if (inventoryRatio >= hardCutoffRatio) {
      isBlockedByCapacity = true;
      sizeMultiplier = 0.0;
      rationale = `Long inventory saturation ${(inventoryRatio * 100).toFixed(1)}% >= ${(hardCutoffRatio * 100).toFixed(0)}%: New BUY orders blocked`;
    } else if (inventoryRatio > 0) {
      // Overweight Long: Dampen new Buys nonlinearly: (1 - ratio^alpha)
      sizeMultiplier = Math.max(0.15, 1.0 - Math.pow(inventoryRatio, dampeningAlpha));
      sizeMultiplier = Number(sizeMultiplier.toFixed(3));
      rationale = `Net Long ${(inventoryRatio * 100).toFixed(1)}%: Dampened BUY size to ${(sizeMultiplier * 100).toFixed(1)}%`;
    } else if (inventoryRatio < -0.15) {
      // Underweight / Net Short: Rebalancing BUY! Boost slightly to reach neutral
      const underWeight = Math.abs(inventoryRatio);
      sizeMultiplier = Math.min(1.35, 1.0 + underWeight * 0.35);
      sizeMultiplier = Number(sizeMultiplier.toFixed(3));
      rationale = `Net Short ${(inventoryRatio * 100).toFixed(1)}%: Rebalancing BUY boosted to ${(sizeMultiplier * 100).toFixed(1)}%`;
    }
  } else {
    // SELL direction
    if (inventoryRatio <= -hardCutoffRatio) {
      isBlockedByCapacity = true;
      sizeMultiplier = 0.0;
      rationale = `Short inventory saturation ${(Math.abs(inventoryRatio) * 100).toFixed(1)}% >= ${(hardCutoffRatio * 100).toFixed(0)}%: New SELL orders blocked`;
    } else if (inventoryRatio < 0) {
      // Overweight Short: Dampen new Sells
      const shortRatio = Math.abs(inventoryRatio);
      sizeMultiplier = Math.max(0.15, 1.0 - Math.pow(shortRatio, dampeningAlpha));
      sizeMultiplier = Number(sizeMultiplier.toFixed(3));
      rationale = `Net Short ${(inventoryRatio * 100).toFixed(1)}%: Dampened SELL size to ${(sizeMultiplier * 100).toFixed(1)}%`;
    } else if (inventoryRatio > 0.15) {
      // Net Long: Rebalancing SELL! Boost slightly
      sizeMultiplier = Math.min(1.35, 1.0 + inventoryRatio * 0.35);
      sizeMultiplier = Number(sizeMultiplier.toFixed(3));
      rationale = `Net Long ${(inventoryRatio * 100).toFixed(1)}%: Rebalancing SELL boosted to ${(sizeMultiplier * 100).toFixed(1)}%`;
    }
  }

  const adjustedLotsOrQty = Number((baseLotsOrQty * sizeMultiplier).toFixed(4));

  return {
    adjustedLotsOrQty,
    sizeMultiplier,
    inventoryRatio: Number(inventoryRatio.toFixed(4)),
    isBlockedByCapacity,
    rationale,
  };
}

// ============================================================================
// 3. Hanging Order & Adverse Selection Guard
// ============================================================================

/**
 * Evaluates whether an unfilled resting limit order has drifted into toxic hanging risk.
 * Prevents adverse fills when price violently pulls away or breaks market structure.
 */
export function evaluateHangingOrderRisk(
  params: HangingOrderRiskParams,
): HangingOrderRiskResult {
  const {
    orderDirection,
    limitPrice,
    currentPrice,
    atrOrSpread,
    maxAdverseRatio = 2.5,
  } = params;

  const safeRef = Number.isFinite(atrOrSpread) && atrOrSpread > 0 ? atrOrSpread : currentPrice * 0.005;
  const isBuy = orderDirection === "BUY";

  // For a BUY limit order, adverse drift is when current price drops far BELOW the limit price
  // or runs far ABOVE the limit price leaving it stale
  const adverseDistance = isBuy
    ? currentPrice > limitPrice
      ? currentPrice - limitPrice // Stale lagging behind
      : limitPrice - currentPrice // Plunged through
    : currentPrice < limitPrice
      ? limitPrice - currentPrice
      : currentPrice - limitPrice;

  const driftRatio = adverseDistance / safeRef;
  const shouldCancel = driftRatio > maxAdverseRatio;

  const reason = shouldCancel
    ? `Hanging order drift ${driftRatio.toFixed(2)}x exceeds safety tolerance ${maxAdverseRatio}x`
    : `Order within safe bounds (${driftRatio.toFixed(2)}x <= ${maxAdverseRatio}x)`;

  return {
    shouldCancel,
    adverseDistance: Number(adverseDistance.toFixed(6)),
    driftRatio: Number(driftRatio.toFixed(2)),
    reason,
  };
}

// ============================================================================
// 4. End-to-End Trade Setup Inventory Skew Integration
// ============================================================================

/**
 * Adjusts an incoming trade signal with institutional Avellaneda-Stoikov inventory skewing:
 * - Shifts limit entry deeper into pullback when already long-heavy.
 * - Squeezes position size down in saturated inventory directions.
 * - Asymmetrically tightens take-profit target to accelerate inventory offloading.
 */
export function adjustTradeSetupWithInventorySkew(
  params: AdjustTradeSetupWithInventorySkewParams,
): SkewAdjustedTradeSetup {
  const {
    symbol,
    assetType,
    direction,
    entryPrice,
    stopLossPrice,
    takeProfit1,
    baseLotsOrQty,
    netInventory,
    maxInventoryCapacity,
    volatilitySigma = 0.02,
    orderBookImbalance = 0.0,
    atr = entryPrice * 0.01,
  } = params;

  const asResult = calculateAvellanedaStoikovSkew({
    midPrice: entryPrice,
    netInventory,
    maxInventoryCapacity,
    volatilitySigma,
    orderBookImbalance,
    assetType,
    symbol,
  });

  const sizingResult = calculateInventorySizingMultiplier({
    direction,
    baseLotsOrQty,
    netInventory,
    maxInventoryCapacity,
  });

  const isBuy = direction === "BUY";
  let skewedEntry = entryPrice;
  let asymmetricTp1 = takeProfit1;

  if (isBuy) {
    if (asResult.inventoryRatio > 0.1) {
      // Already long: require a slightly deeper pullback limit entry to enter cheaply
      const pullbackShift = Math.min(atr * 0.25, Math.abs(asResult.inventoryPriceShift));
      skewedEntry = roundPrice(entryPrice - pullbackShift, symbol, assetType);

      // Closer TP1 to offload long inventory sooner
      const tpDist = takeProfit1 - entryPrice;
      if (tpDist > 0) {
        asymmetricTp1 = roundPrice(entryPrice + tpDist * 0.85, symbol, assetType);
      }
    }
  } else {
    // SELL direction
    if (asResult.inventoryRatio < -0.1) {
      // Already short: require higher entry price to short at premium
      const pullbackShift = Math.min(atr * 0.25, Math.abs(asResult.inventoryPriceShift));
      skewedEntry = roundPrice(entryPrice + pullbackShift, symbol, assetType);

      // Closer TP1 to cover short inventory sooner
      const tpDist = entryPrice - takeProfit1;
      if (tpDist > 0) {
        asymmetricTp1 = roundPrice(entryPrice - tpDist * 0.85, symbol, assetType);
      }
    }
  }

  return {
    symbol,
    direction,
    originalEntryPrice: entryPrice,
    skewedEntryPrice: skewedEntry,
    originalLotsOrQty: baseLotsOrQty,
    adjustedLotsOrQty: sizingResult.adjustedLotsOrQty,
    sizeMultiplier: sizingResult.sizeMultiplier,
    isCapacityBlocked: sizingResult.isBlockedByCapacity,
    asymmetricTakeProfit1: asymmetricTp1,
    inventoryRatio: asResult.inventoryRatio,
    rationale: `${sizingResult.rationale} | AS Skew: ${asResult.inventoryRegime} (Shift: ${asResult.inventoryPriceShift})`,
  };
}
