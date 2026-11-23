/**
 * Prediction Market Leading Macro Radar & Odds Engine
 * (agiprolabs/claude-trading-skills Polymarket & Kalshi Parity)
 *
 * Implements real-money prediction market probability extraction and forward-looking
 * macro bias modeling inspired by `agiprolabs/claude-trading-skills`:
 *
 * 1. Event Probability Modeling:
 *    - Binary outcome probability p in [0, 1] and log-odds ratio ln(p / (1 - p)).
 *    - Polymarket & Kalshi contract categories:
 *      * Fed Interest Rate policy (Rate Cut vs Hike / Pause odds)
 *      * US Inflation (CPI surprise odds)
 *      * Crypto barrier ranges (BTC upside vs downside threshold odds)
 *      * Geopolitical risk / Safe haven tension odds
 *
 * 2. Cross-Asset Leading Indicator Transmission:
 *    - Prediction market probability spikes lead spot market repricing by hours.
 *    - High Rate-Cut odds (> 65%) -> Risk-On: Bullish Crypto & Gold, Bearish USD.
 *    - High Geopolitical Stress odds (> 55%) -> Flight to Quality: Bullish Gold (XAUUSD), Bearish High-Beta FX.
 *
 * 3. Pre-Trade Probability Alignment & Contrarian Penalty:
 *    - Calculates alignment between candidate trade setup and market-implied odds.
 *    - Penalizes or vetoes trades taking aggressive positions against overwhelming prediction consensus.
 */

import { type PrecisionAssetType } from "./asset-precision";

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PredictionPlatform = "POLYMARKET" | "KALSHI" | "CONSENSUS_SYNTHETIC";

export type PredictionCategory =
  | "FED_RATES"
  | "INFLATION_CPI"
  | "CRYPTO_RANGE"
  | "GEOPOLITICS"
  | "MACRO_GROWTH";

export interface PredictionMarketContract {
  id: string;
  platform: PredictionPlatform;
  title: string;
  category: PredictionCategory;
  /** Implied event probability in [0.0, 1.0] */
  impliedProbability: number;
  /** 24h probability change in percentage points (e.g. +8.5%) */
  probabilityChange24hPct?: number;
  /** Rolling 24h traded volume in USD */
  volume24hUsd?: number;
  lastUpdatedTimestamp: number;
}

export type PredictionRadarDataSource =
  | "LIVE_POLYMARKET"
  | "BASELINE_FALLBACK"
  | "CUSTOM_INPUT";

export interface MacroRadarSnapshot {
  timestamp: number;
  dataSource: PredictionRadarDataSource;
  riskRegime: "RISK_ON" | "RISK_OFF" | "NEUTRAL_CHOP";
  fedRateCutOdds: number; // [0, 1]
  inflationSurpriseOdds: number; // [0, 1]
  cryptoBullishRangeOdds: number; // [0, 1]
  geopoliticalStressOdds: number; // [0, 1]
  currencyBiasOverrides: Map<string, number>; // Currency -> bias score in [-5, 5]
  cryptoLeadingBiasScore: number; // [-100, 100]
  contracts: PredictionMarketContract[];
  summaryVi: string;
}

export interface PredictionBiasAlignmentResult {
  symbol: string;
  direction: "BUY" | "SELL";
  assetType: PrecisionAssetType;
  alignment: "ALIGNED_LEADING_TAILWIND" | "NEUTRAL_TOLERANCE" | "CONTRARIAN_HEADWIND";
  alignmentScore: number; // [-100, 100] (positive = tailwind, negative = headwind)
  recommendedSizeMultiplier: number; // [0.0, 1.25]
  warningMessage?: string;
  keyProbabilityDrivers: string[];
}

// ============================================================================
// 1. In-Memory Prediction Market Store & Registry
// ============================================================================

let cachedRadarSnapshot: { snapshot: MacroRadarSnapshot; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export function clearPredictionRadarCache(): void {
  cachedRadarSnapshot = null;
}

/**
 * Baseline institutional contracts tracking current macro distribution.
 */
export const DEFAULT_PREDICTION_CONTRACTS: PredictionMarketContract[] = [
  {
    id: "poly_fed_rate_cut_q1",
    platform: "POLYMARKET",
    title: "Fed cuts interest rates at next FOMC meeting",
    category: "FED_RATES",
    impliedProbability: 0.68, // 68% probability of rate cut
    probabilityChange24hPct: 4.2,
    volume24hUsd: 14_500_000,
    lastUpdatedTimestamp: Date.now(),
  },
  {
    id: "kalshi_cpi_hot",
    platform: "KALSHI",
    title: "US Core CPI exceeds consensus forecast (+0.3% MoM)",
    category: "INFLATION_CPI",
    impliedProbability: 0.32, // 32% probability of hot inflation
    probabilityChange24hPct: -2.1,
    volume24hUsd: 5_200_000,
    lastUpdatedTimestamp: Date.now(),
  },
  {
    id: "poly_btc_month_end_high",
    platform: "POLYMARKET",
    title: "Bitcoin trades above upper target range by month-end",
    category: "CRYPTO_RANGE",
    impliedProbability: 0.62, // 62% bullish range odds
    probabilityChange24hPct: 5.5,
    volume24hUsd: 22_000_000,
    lastUpdatedTimestamp: Date.now(),
  },
  {
    id: "poly_geopolitical_escalation",
    platform: "POLYMARKET",
    title: "Middle East / Global trade tariff escalation in next 30 days",
    category: "GEOPOLITICS",
    impliedProbability: 0.38, // 38% elevated geopolitical stress
    probabilityChange24hPct: 1.0,
    volume24hUsd: 8_700_000,
    lastUpdatedTimestamp: Date.now(),
  },
];

// ============================================================================
// 2. Synthesize Prediction Market Macro Radar
// ============================================================================

/**
 * Computes forward-looking macroeconomic bias from prediction market probability contracts.
 */
export function computePredictionMarketMacroRadar(
  contracts: PredictionMarketContract[] = DEFAULT_PREDICTION_CONTRACTS,
  nowMs: number = Date.now(),
  dataSource?: PredictionRadarDataSource,
): MacroRadarSnapshot {
  const resolvedSource: PredictionRadarDataSource =
    dataSource ?? (contracts === DEFAULT_PREDICTION_CONTRACTS ? "BASELINE_FALLBACK" : "CUSTOM_INPUT");

  if (
    cachedRadarSnapshot &&
    cachedRadarSnapshot.expiresAt > nowMs &&
    contracts === DEFAULT_PREDICTION_CONTRACTS &&
    !dataSource
  ) {
    return cachedRadarSnapshot.snapshot;
  }

  const findProb = (cat: PredictionCategory, defaultVal: number): number => {
    const matching = contracts.filter((c) => c.category === cat);
    if (matching.length === 0) return defaultVal;
    // Volume-weighted probability if available
    let totalVol = 0;
    let weightedSum = 0;
    for (const c of matching) {
      if (!Number.isFinite(c.impliedProbability)) continue;
      const prob = Math.max(0, Math.min(1, c.impliedProbability));
      const vol = c.volume24hUsd && Number.isFinite(c.volume24hUsd) && c.volume24hUsd > 0 ? c.volume24hUsd : 1_000_000;
      weightedSum += prob * vol;
      totalVol += vol;
    }
    return totalVol > 0 ? Number((weightedSum / totalVol).toFixed(3)) : defaultVal;
  };

  const fedRateCutOdds = findProb("FED_RATES", 0.60);
  const inflationSurpriseOdds = findProb("INFLATION_CPI", 0.35);
  const cryptoBullishRangeOdds = findProb("CRYPTO_RANGE", 0.55);
  const geopoliticalStressOdds = findProb("GEOPOLITICS", 0.35);

  // Determine Overall Risk Regime
  // High rate cut odds (> 0.60) + moderate geopolitical (< 0.50) -> RISK_ON
  // High geopolitical stress (> 0.55) or hot inflation (> 0.55) -> RISK_OFF
  let riskRegime: MacroRadarSnapshot["riskRegime"] = "NEUTRAL_CHOP";
  if (geopoliticalStressOdds >= 0.55 || (inflationSurpriseOdds >= 0.55 && fedRateCutOdds < 0.40)) {
    riskRegime = "RISK_OFF";
  } else if (fedRateCutOdds >= 0.60 && cryptoBullishRangeOdds >= 0.55 && geopoliticalStressOdds < 0.45) {
    riskRegime = "RISK_ON";
  }

  // Derive Currency Bias Scores in [-5.0, 5.0]
  const currencyBiasOverrides = new Map<string, number>();

  // USD: Rate cut odds pull USD down, hot inflation pulls USD up
  const usdBias = Number(((inflationSurpriseOdds - fedRateCutOdds) * 6.0).toFixed(1));
  currencyBiasOverrides.set("USD", Math.max(-5.0, Math.min(5.0, usdBias)));

  // EUR & GBP: Inverted against USD bias, with growth discount
  const eurBias = Number((-usdBias * 0.75).toFixed(1));
  const gbpBias = Number((-usdBias * 0.80).toFixed(1));
  currencyBiasOverrides.set("EUR", Math.max(-5.0, Math.min(5.0, eurBias)));
  currencyBiasOverrides.set("GBP", Math.max(-5.0, Math.min(5.0, gbpBias)));

  // JPY & CHF: Safe havens surge when geopolitical stress rises
  const safeHavenBoost = (geopoliticalStressOdds - 0.35) * 6.0;
  currencyBiasOverrides.set("JPY", Number(Math.max(-5.0, Math.min(5.0, -usdBias * 0.5 + safeHavenBoost)).toFixed(1)));
  currencyBiasOverrides.set("CHF", Number(Math.max(-5.0, Math.min(5.0, -usdBias * 0.5 + safeHavenBoost)).toFixed(1)));

  // Gold (XAU): High geopolitical stress + Rate cut odds = Massive tailwind
  const goldBoost = (fedRateCutOdds * 4.0 + geopoliticalStressOdds * 4.0) - 3.5;
  currencyBiasOverrides.set("XAU", Number(Math.max(-5.0, Math.min(5.0, goldBoost)).toFixed(1)));

  // Crypto Leading Bias Score in [-100, 100]
  // Bullish crypto range odds + rate cuts - geopolitical stress
  const rawCryptoScore = (cryptoBullishRangeOdds * 50 + fedRateCutOdds * 50 - geopoliticalStressOdds * 40 - inflationSurpriseOdds * 20);
  const cryptoLeadingBiasScore = Math.max(-100, Math.min(100, Math.round((rawCryptoScore - 20) * 1.6)));

  const summaryVi =
    `Radar Thị trường Dự đoán [${riskRegime}]: Xác suất Fed cắt lãi suất ${(fedRateCutOdds * 100).toFixed(0)}%, ` +
    `Lạm phát CPI nóng ${(inflationSurpriseOdds * 100).toFixed(0)}%, Căng thẳng địa chính trị ${(geopoliticalStressOdds * 100).toFixed(0)}%, ` +
    `Kỳ vọng bứt phá Crypto ${(cryptoBullishRangeOdds * 100).toFixed(0)}% (Điểm dẫn dắt: ${cryptoLeadingBiasScore > 0 ? "+" : ""}${cryptoLeadingBiasScore}).`;

  const snapshot: MacroRadarSnapshot = {
    timestamp: nowMs,
    dataSource: resolvedSource,
    riskRegime,
    fedRateCutOdds,
    inflationSurpriseOdds,
    cryptoBullishRangeOdds,
    geopoliticalStressOdds,
    currencyBiasOverrides,
    cryptoLeadingBiasScore,
    contracts,
    summaryVi,
  };

  if (contracts === DEFAULT_PREDICTION_CONTRACTS || resolvedSource === "LIVE_POLYMARKET") {
    cachedRadarSnapshot = { snapshot, expiresAt: nowMs + CACHE_TTL_MS };
  }
  return snapshot;
}

// ============================================================================
// 2b. Live Polymarket Gamma API Fetcher (Public, Zero API Key, TTL-Cached)
// ============================================================================

const POLYMARKET_GAMMA_URL =
  "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=50";

/**
 * Parses raw Polymarket Gamma API market objects into categorized macro contracts.
 * Pure function for deterministic unit testing and live ingestion.
 */
export function parsePolymarketGammaMarkets(rawMarkets: unknown[]): PredictionMarketContract[] {
  if (!Array.isArray(rawMarkets)) return [];
  const nowMs = Date.now();
  const out: PredictionMarketContract[] = [];

  for (const item of rawMarkets) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    const title = typeof m.question === "string" ? m.question.trim() : "";
    if (!title) continue;

    // Parse outcomePrices (Polymarket returns JSON string like '["0.65", "0.35"]' or array)
    let yesProb: number | null = null;
    try {
      const rawPrices =
        typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices;
      if (Array.isArray(rawPrices) && rawPrices.length >= 1) {
        const p = Number(rawPrices[0]);
        if (Number.isFinite(p) && p > 0 && p < 1) yesProb = p;
      }
    } catch {
      continue;
    }
    if (yesProb == null) continue;

    let category: PredictionCategory | null = null;
    if (/\b(fed|fomc|rate cut|interest rate|basis points|bps)\b/i.test(title) && /\b(cut|lower|decrease|reduce)\b/i.test(title)) {
      category = "FED_RATES";
    } else if (/\b(cpi|inflation|pce)\b/i.test(title) && /\b(above|exceed|higher|over|beat|hot)\b/i.test(title)) {
      category = "INFLATION_CPI";
    } else if (/\b(bitcoin|btc|ethereum|eth|crypto)\b/i.test(title) && /\b(above|hit|reach|exceed|ath|higher|over)\b/i.test(title)) {
      category = "CRYPTO_RANGE";
    } else if (/\b(war|invasion|strike|conflict|ceasefire|missile|iran|israel|ukraine|taiwan|nato)\b/i.test(title)) {
      // Invert probability if market is about peace/ceasefire
      if (/\b(ceasefire|peace|truce|deal)\b/i.test(title)) {
        yesProb = Number((1 - yesProb).toFixed(3));
      }
      category = "GEOPOLITICS";
    }

    if (!category) continue;
    const vol = Number(m.volume24hr ?? m.volumeNum ?? m.volume ?? 0);
    out.push({
      id: `poly_live_${String(m.id ?? out.length)}`,
      platform: "POLYMARKET",
      title,
      category,
      impliedProbability: Number(yesProb.toFixed(3)),
      volume24hUsd: Number.isFinite(vol) && vol > 0 ? Math.round(vol) : 500_000,
      lastUpdatedTimestamp: nowMs,
    });
  }

  return out;
}

/**
 * Fetches live macro probabilities from Polymarket Gamma API with 10-minute TTL cache.
 * Falls back transparently to BASELINE_FALLBACK if offline or timeout occurs.
 */
export async function refreshPredictionMarketRadarLive(opts?: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<MacroRadarSnapshot> {
  const nowMs = Date.now();
  if (!opts?.force && cachedRadarSnapshot && cachedRadarSnapshot.expiresAt > nowMs) {
    return cachedRadarSnapshot.snapshot;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 2_500);
    timer.unref?.();
    const res = await fetch(POLYMARKET_GAMMA_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      return computePredictionMarketMacroRadar(DEFAULT_PREDICTION_CONTRACTS, nowMs, "BASELINE_FALLBACK");
    }

    const raw = (await res.json()) as unknown[];
    const liveContracts = parsePolymarketGammaMarkets(raw);
    if (liveContracts.length === 0) {
      return computePredictionMarketMacroRadar(DEFAULT_PREDICTION_CONTRACTS, nowMs, "BASELINE_FALLBACK");
    }

    // Backfill any unrepresented macro category from baseline so all 4 pillars remain populated
    const coveredCategories = new Set(liveContracts.map((c) => c.category));
    const merged = [
      ...liveContracts,
      ...DEFAULT_PREDICTION_CONTRACTS.filter((d) => !coveredCategories.has(d.category)),
    ];

    return computePredictionMarketMacroRadar(merged, nowMs, "LIVE_POLYMARKET");
  } catch {
    return computePredictionMarketMacroRadar(DEFAULT_PREDICTION_CONTRACTS, nowMs, "BASELINE_FALLBACK");
  }
}

// ============================================================================
// 3. Pre-Trade Probability Alignment & Contrarian Guard
// ============================================================================

export interface EvaluatePredictionBiasParams {
  symbol: string;
  assetType: PrecisionAssetType;
  direction: "BUY" | "SELL";
  radar?: MacroRadarSnapshot;
}

/**
 * Checks if a candidate trade is supported by prediction market odds or trading into a dangerous macro headwind.
 */
export function evaluatePredictionBiasAlignment(
  params: EvaluatePredictionBiasParams,
): PredictionBiasAlignmentResult {
  const { symbol, assetType, direction } = params;
  const radar = params.radar ?? computePredictionMarketMacroRadar();
  const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isBuy = direction === "BUY";
  const keyDrivers: string[] = [];

  let alignmentScore = 0;

  if (assetType === "CRYPTO") {
    // Score based on crypto leading bias
    alignmentScore = isBuy ? radar.cryptoLeadingBiasScore : -radar.cryptoLeadingBiasScore;

    if (radar.fedRateCutOdds >= 0.65) {
      keyDrivers.push(`Xác suất Fed cắt lãi suất cao (${(radar.fedRateCutOdds * 100).toFixed(0)}%): Dòng tiền mở rộng`);
    }
    if (radar.cryptoBullishRangeOdds >= 0.60) {
      keyDrivers.push(`Hợp đồng Polymarket dự báo kịch bản tăng trưởng ${(radar.cryptoBullishRangeOdds * 100).toFixed(0)}%`);
    }
    if (radar.geopoliticalStressOdds >= 0.55 && isBuy) {
      keyDrivers.push(`Cảnh báo: Căng thẳng địa chính trị ${(radar.geopoliticalStressOdds * 100).toFixed(0)}% gây áp lực rút ròng tài sản rủi ro`);
    }
  } else {
    // FOREX / GOLD
    if (cleanSym.startsWith("XAU") || cleanSym.includes("GOLD")) {
      const xauBias = radar.currencyBiasOverrides.get("XAU") ?? 1.5;
      alignmentScore = isBuy ? xauBias * 18 : -xauBias * 18;
      if (radar.geopoliticalStressOdds >= 0.40) {
        keyDrivers.push(`Nhu cầu trú ẩn Vàng tăng do rủi ro vĩ mô ${(radar.geopoliticalStressOdds * 100).toFixed(0)}%`);
      }
    } else {
      // Standard FX pair: Base vs Quote bias
      const baseCurr = cleanSym.slice(0, 3);
      const quoteCurr = cleanSym.slice(3, 6);
      const baseBias = radar.currencyBiasOverrides.get(baseCurr) ?? 0;
      const quoteBias = radar.currencyBiasOverrides.get(quoteCurr) ?? 0;
      const netPairBias = baseBias - quoteBias;

      alignmentScore = isBuy ? netPairBias * 16 : -netPairBias * 16;
      keyDrivers.push(`Độ lệch xác suất cặp tiền: ${baseCurr} (${baseBias > 0 ? "+" : ""}${baseBias}) vs ${quoteCurr} (${quoteBias > 0 ? "+" : ""}${quoteBias})`);
    }
  }

  alignmentScore = Math.max(-100, Math.min(100, Math.round(alignmentScore)));

  let alignment: PredictionBiasAlignmentResult["alignment"] = "NEUTRAL_TOLERANCE";
  let recommendedSizeMultiplier = 1.0;
  let warningMessage: string | undefined;

  if (alignmentScore >= 35) {
    alignment = "ALIGNED_LEADING_TAILWIND";
    recommendedSizeMultiplier = 1.15; // +15% size bonus for trades backed by prediction odds
  } else if (alignmentScore <= -35) {
    // Severe contrarian headwind (e.g. going short into overwhelming rate cut consensus)
    alignment = "CONTRARIAN_HEADWIND";
    recommendedSizeMultiplier = 0.50; // Cut size in half to protect capital
    warningMessage = `Nguy cơ bơi ngược dòng xác suất thị trường dự đoán (Điểm đối kháng: ${alignmentScore}). Khuyến nghị giảm 50% khối lượng.`;
  } else {
    alignment = "NEUTRAL_TOLERANCE";
    recommendedSizeMultiplier = 1.0;
  }

  return {
    symbol,
    direction,
    assetType,
    alignment,
    alignmentScore,
    recommendedSizeMultiplier,
    warningMessage,
    keyProbabilityDrivers: keyDrivers,
  };
}
