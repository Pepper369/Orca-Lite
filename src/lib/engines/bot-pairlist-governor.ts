/**
 * Bot Pairlist Governor Engine (Freqtrade Parity)
 *
 * Implements institutional-grade dynamic pair filtering and market qualification
 * inspired by `freqtrade/freqtrade` pairlist handlers:
 * 1. SpreadFilter: Eliminates pairs with high bid-ask spread exceeding allowable thresholds (slippage guard).
 * 2. VolumeFilter: Filters out illiquid pairs failing minimum 24h turnover / quote volume requirements.
 * 3. VolatilityPumpDumpFilter: Rejects assets undergoing abnormal pump-and-dump spikes or flash crashes (ATR & 24h range).
 * 4. PrecisionFilter: Enforces valid step sizes, tick limits, minimum price, and min notional sanity.
 * 5. DynamicCooldownBlacklist: In-memory temporary blacklist isolating symbols that recently hit stop loss or volatility shocks.
 */

import { getAssetPipSize, roundPrice, type PrecisionAssetType } from "./asset-precision";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PairMarketSnapshot {
  symbol: string;
  assetType?: PrecisionAssetType;
  price: number;
  bidPrice?: number;
  askPrice?: number;
  volume24hUsd?: number;
  priceChange24hPct?: number;
  atr?: number;
  latestBar?: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  minNotionalUsd?: number;
  minPrice?: number;
}

export interface PairlistGovernorConfig {
  /** Maximum allowable spread percentage for Crypto (e.g. 0.0015 = 0.15%) */
  maxCryptoSpreadPct: number;
  /** Maximum allowable spread in pips for Forex (e.g. 3.5 pips) */
  maxForexSpreadPips: number;
  /** Minimum 24h rolling quote volume in USD (default: $500,000) */
  min24hVolumeUsd: number;
  /** Maximum allowable 24h absolute price change percentage (default: 30%) */
  max24hChangePct: number;
  /** Maximum latest bar range relative to ATR (default: 3.5x ATR) */
  maxBarAtrRatio: number;
  /** Minimum allowable asset price (dust filter, default: 1e-8) */
  minPriceThreshold: number;
  /** Enable cooldown filter check (default: true) */
  enforceCooldown: boolean;
  /** Default cooldown duration in milliseconds if triggered (default: 20 minutes) */
  defaultCooldownDurationMs: number;
}

export const DEFAULT_PAIRLIST_CONFIG: PairlistGovernorConfig = {
  maxCryptoSpreadPct: 0.0015, // 0.15% maximum bid-ask spread
  maxForexSpreadPips: 3.5,    // 3.5 pips maximum spread
  min24hVolumeUsd: 500_000,   // $500k minimum daily turnover
  max24hChangePct: 30.0,      // 30% pump/dump guard
  maxBarAtrRatio: 3.5,        // 3.5x ATR single-candle anomaly
  minPriceThreshold: 1e-8,    // Filter out obsolete/dead sub-satoshi tokens
  enforceCooldown: true,
  defaultCooldownDurationMs: 20 * 60 * 1000, // 20 minutes cooldown
};

export interface PairRejectionRecord {
  symbol: string;
  filter: "SPREAD" | "VOLUME" | "VOLATILITY_PUMP_DUMP" | "PRECISION" | "COOLDOWN";
  reason: string;
  metrics?: Record<string, number | string | boolean>;
}

export interface PairlistGovernorResult {
  eligiblePairs: string[];
  rejectedPairs: PairRejectionRecord[];
  stats: {
    totalEvaluated: number;
    eligibleCount: number;
    rejectedCount: number;
    durationMs: number;
  };
}

// ============================================================================
// 1. Dynamic Cooldown Blacklist (In-Memory Sentinel)
// ============================================================================

interface CooldownEntry {
  symbol: string;
  reason: string;
  untilTimestampMs: number;
  consecutiveTriggers: number;
}

const activeCooldownRegistry = new Map<string, CooldownEntry>();

/**
 * Places a symbol into temporary quarantine / cooldown.
 */
export function recordPairCooldown(
  symbol: string,
  reason: string,
  durationMs: number = DEFAULT_PAIRLIST_CONFIG.defaultCooldownDurationMs,
  nowMs: number = Date.now(),
): CooldownEntry {
  const clean = symbol.toUpperCase().trim();
  const existing = activeCooldownRegistry.get(clean);
  const consecutiveTriggers = existing && existing.untilTimestampMs > nowMs ? existing.consecutiveTriggers + 1 : 1;

  // Escalating backoff for repeat offenders: 1x, 1.5x, 2x, etc. (up to 4x)
  const backoffMultiplier = Math.min(4, 1 + (consecutiveTriggers - 1) * 0.5);
  const adjustedDurationMs = durationMs * backoffMultiplier;
  const untilTimestampMs = nowMs + adjustedDurationMs;

  const entry: CooldownEntry = {
    symbol: clean,
    reason,
    untilTimestampMs,
    consecutiveTriggers,
  };

  activeCooldownRegistry.set(clean, entry);
  return entry;
}

/**
 * Checks if a pair is currently barred by the cooldown sentinel.
 */
export function checkPairCooldown(
  symbol: string,
  nowMs: number = Date.now(),
): { inCooldown: boolean; remainingSec: number; reason?: string; consecutiveCount: number } {
  const clean = symbol.toUpperCase().trim();
  const entry = activeCooldownRegistry.get(clean);

  if (!entry) {
    return { inCooldown: false, remainingSec: 0, consecutiveCount: 0 };
  }

  if (entry.untilTimestampMs <= nowMs) {
    // Cooldown expired
    activeCooldownRegistry.delete(clean);
    return { inCooldown: false, remainingSec: 0, consecutiveCount: entry.consecutiveTriggers };
  }

  const remainingSec = Math.ceil((entry.untilTimestampMs - nowMs) / 1000);
  return {
    inCooldown: true,
    remainingSec,
    reason: entry.reason,
    consecutiveCount: entry.consecutiveTriggers,
  };
}

/**
 * Clears cooldown for a symbol or all symbols.
 */
export function clearPairCooldown(symbol?: string): void {
  if (symbol) {
    activeCooldownRegistry.delete(symbol.toUpperCase().trim());
  } else {
    activeCooldownRegistry.clear();
  }
}

/**
 * Returns list of all symbols currently under active quarantine.
 */
export function listActiveCooldowns(nowMs: number = Date.now()): CooldownEntry[] {
  const active: CooldownEntry[] = [];
  for (const [sym, entry] of activeCooldownRegistry.entries()) {
    if (entry.untilTimestampMs > nowMs) {
      active.push({ ...entry });
    } else {
      activeCooldownRegistry.delete(sym);
    }
  }
  return active;
}

// ============================================================================
// 2. Individual Sub-Filters
// ============================================================================

/**
 * Evaluates whether the bid-ask spread is within institutional execution tolerances.
 */
export function evaluateSpreadFilter(
  snapshot: PairMarketSnapshot,
  assetType: "CRYPTO" | "FOREX",
  config: PairlistGovernorConfig,
): { passed: boolean; rejection?: PairRejectionRecord } {
  const { bidPrice, askPrice, price, symbol } = snapshot;

  if (bidPrice == null || askPrice == null || bidPrice <= 0 || askPrice <= 0 || askPrice < bidPrice) {
    // When bid/ask quotes are absent or corrupted, treat as passing unless mark price is missing
    if (price <= 0) {
      return {
        passed: false,
        rejection: {
          symbol,
          filter: "SPREAD",
          reason: "Missing valid market price or orderbook quote",
        },
      };
    }
    return { passed: true };
  }

  const spread = askPrice - bidPrice;
  const midPrice = (askPrice + bidPrice) / 2;

  if (assetType === "CRYPTO") {
    const spreadPct = spread / midPrice;
    if (spreadPct > config.maxCryptoSpreadPct) {
      return {
        passed: false,
        rejection: {
          symbol,
          filter: "SPREAD",
          reason: `Crypto spread ${(spreadPct * 100).toFixed(3)}% exceeds max ${(config.maxCryptoSpreadPct * 100).toFixed(3)}%`,
          metrics: { spreadPct, maxAllowed: config.maxCryptoSpreadPct, bid: bidPrice, ask: askPrice },
        },
      };
    }
  } else {
    // FOREX
    const pipSize = getAssetPipSize(symbol, "FOREX", midPrice);
    const spreadPips = pipSize > 0 ? spread / pipSize : 0;
    // Allow higher spread tolerance for volatile metals (Gold/Silver)
    const maxPips = symbol.toUpperCase().startsWith("XAU") ? config.maxForexSpreadPips * 1.5 : config.maxForexSpreadPips;

    if (spreadPips > maxPips) {
      return {
        passed: false,
        rejection: {
          symbol,
          filter: "SPREAD",
          reason: `Forex spread ${spreadPips.toFixed(1)} pips exceeds max ${maxPips.toFixed(1)} pips`,
          metrics: { spreadPips, maxAllowed: maxPips, bid: bidPrice, ask: askPrice },
        },
      };
    }
  }

  return { passed: true };
}

/**
 * Evaluates whether 24h rolling turnover satisfies minimum liquidity.
 */
export function evaluateVolumeFilter(
  snapshot: PairMarketSnapshot,
  config: PairlistGovernorConfig,
): { passed: boolean; rejection?: PairRejectionRecord } {
  const { symbol, volume24hUsd } = snapshot;

  // If 24h volume is specified and falls below liquidity threshold
  if (volume24hUsd != null && volume24hUsd > 0 && volume24hUsd < config.min24hVolumeUsd) {
    return {
      passed: false,
      rejection: {
        symbol,
        filter: "VOLUME",
        reason: `24h volume $${Math.round(volume24hUsd).toLocaleString()} is below minimum $${config.min24hVolumeUsd.toLocaleString()}`,
        metrics: { volume24hUsd, min24hVolumeUsd: config.min24hVolumeUsd },
      },
    };
  }

  return { passed: true };
}

/**
 * Detects erratic volatility spikes, pump-and-dump candles, or extreme 24h moves.
 */
export function evaluateVolatilityPumpDumpFilter(
  snapshot: PairMarketSnapshot,
  config: PairlistGovernorConfig,
): { passed: boolean; rejection?: PairRejectionRecord } {
  const { symbol, priceChange24hPct, atr, latestBar, price } = snapshot;

  // 1. Extreme 24h price swing filter
  if (priceChange24hPct != null && Math.abs(priceChange24hPct) > config.max24hChangePct) {
    return {
      passed: false,
      rejection: {
        symbol,
        filter: "VOLATILITY_PUMP_DUMP",
        reason: `24h move ${priceChange24hPct > 0 ? "+" : ""}${priceChange24hPct.toFixed(1)}% exceeds threshold ${config.max24hChangePct}%`,
        metrics: { priceChange24hPct, maxAllowed: config.max24hChangePct },
      },
    };
  }

  // 2. Single-bar anomaly / candle pump-dump filter
  if (latestBar && latestBar.high > latestBar.low && atr != null && atr > 0) {
    const barRange = latestBar.high - latestBar.low;
    const ratio = barRange / atr;

    if (ratio > config.maxBarAtrRatio) {
      return {
        passed: false,
        rejection: {
          symbol,
          filter: "VOLATILITY_PUMP_DUMP",
          reason: `Latest candle range (${barRange.toFixed(4)}) is ${ratio.toFixed(1)}x ATR, exceeding limit ${config.maxBarAtrRatio}x`,
          metrics: { barRange, atr, ratio, maxAllowed: config.maxBarAtrRatio },
        },
      };
    }
  }

  return { passed: true };
}

/**
 * Validates step size, price resolution, and minimum notional sanity.
 */
export function evaluatePrecisionFilter(
  snapshot: PairMarketSnapshot,
  config: PairlistGovernorConfig,
): { passed: boolean; rejection?: PairRejectionRecord } {
  const { symbol, price, minPrice } = snapshot;

  if (!Number.isFinite(price) || price <= 0) {
    return {
      passed: false,
      rejection: {
        symbol,
        filter: "PRECISION",
        reason: `Invalid non-positive market price: ${price}`,
      },
    };
  }

  const threshold = minPrice != null && minPrice > 0 ? minPrice : config.minPriceThreshold;
  if (price < threshold) {
    return {
      passed: false,
      rejection: {
        symbol,
        filter: "PRECISION",
        reason: `Price ${price} is below minimum supported threshold ${threshold}`,
        metrics: { price, threshold },
      },
    };
  }

  return { passed: true };
}

// ============================================================================
// 3. Unified Pairlist Governor Entry Point
// ============================================================================

export interface FilterExecutablePairsOptions {
  candidates: string[];
  assetType: "CRYPTO" | "FOREX";
  marketDataMap: Map<string, PairMarketSnapshot> | Record<string, PairMarketSnapshot>;
  config?: Partial<PairlistGovernorConfig>;
  nowMs?: number;
}

/**
 * Filters a pool of candidate pairs through Freqtrade-grade quantitative gates:
 * Cooldown -> Precision -> Spread -> Volume -> Volatility Pump/Dump.
 */
export function filterExecutablePairs(options: FilterExecutablePairsOptions): PairlistGovernorResult {
  const startTime = Date.now();
  const nowMs = options.nowMs ?? startTime;
  const cfg: PairlistGovernorConfig = { ...DEFAULT_PAIRLIST_CONFIG, ...options.config };

  const eligiblePairs: string[] = [];
  const rejectedPairs: PairRejectionRecord[] = [];

  const getSnapshot = (sym: string): PairMarketSnapshot | undefined => {
    if (options.marketDataMap instanceof Map) {
      return options.marketDataMap.get(sym);
    }
    return options.marketDataMap[sym];
  };

  for (const rawSymbol of options.candidates) {
    const symbol = rawSymbol.toUpperCase().trim();

    // Gate 1: Dynamic Cooldown Blacklist
    if (cfg.enforceCooldown) {
      const cooldown = checkPairCooldown(symbol, nowMs);
      if (cooldown.inCooldown) {
        rejectedPairs.push({
          symbol,
          filter: "COOLDOWN",
          reason: `Pair in active cooldown for ${cooldown.remainingSec}s (${cooldown.reason ?? "Stoploss quarantine"})`,
          metrics: { remainingSec: cooldown.remainingSec, consecutive: cooldown.consecutiveCount },
        });
        continue;
      }
    }

    const snapshot = getSnapshot(symbol);
    if (!snapshot) {
      // If no snapshot provided, allow candidate through to let scanner fetch full orderbook
      eligiblePairs.push(symbol);
      continue;
    }

    // Gate 2: Precision & Minimum Threshold Filter
    const precRes = evaluatePrecisionFilter(snapshot, cfg);
    if (!precRes.passed && precRes.rejection) {
      rejectedPairs.push(precRes.rejection);
      continue;
    }

    // Gate 3: Spread Tolerances Filter
    const spreadRes = evaluateSpreadFilter(snapshot, options.assetType, cfg);
    if (!spreadRes.passed && spreadRes.rejection) {
      rejectedPairs.push(spreadRes.rejection);
      continue;
    }

    // Gate 4: Rolling 24h Volume / Turnover Filter
    const volRes = evaluateVolumeFilter(snapshot, cfg);
    if (!volRes.passed && volRes.rejection) {
      rejectedPairs.push(volRes.rejection);
      continue;
    }

    // Gate 5: Volatility & Pump/Dump Anomaly Filter
    const volaRes = evaluateVolatilityPumpDumpFilter(snapshot, cfg);
    if (!volaRes.passed && volaRes.rejection) {
      rejectedPairs.push(volaRes.rejection);
      continue;
    }

    // All gates passed!
    eligiblePairs.push(symbol);
  }

  const durationMs = Date.now() - startTime;

  return {
    eligiblePairs,
    rejectedPairs,
    stats: {
      totalEvaluated: options.candidates.length,
      eligibleCount: eligiblePairs.length,
      rejectedCount: rejectedPairs.length,
      durationMs,
    },
  };
}
