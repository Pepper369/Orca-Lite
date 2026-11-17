import "server-only";
import { buildMeta } from "../freshness";
import { cached } from "../cache";
import * as binance from "../providers/binance";
import { analyzeScalp } from "../engines/scalp";
import { analyzeFundingRate, evaluateTrueLevel2Dom } from "../engines/crypto-derivatives-engine";
import { evaluateCryptoShield } from "../engines/crypto-news-shield";
import { calculateCryptoPositionSize } from "../engines/crypto-position-sizer";
import type { Meta } from "../types";

export interface CryptoQuantSignalItem {
  pair: string;
  symbol: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  action: "BUY" | "SELL" | "WAIT";
  timeframe: string;
  status: "ACTIVE" | "AWAITING_BREAKOUT" | "FILTERED_OUT" | "NEUTRAL";
  strength: number;
  probability: number;
  lastPrice: number;
  entryPrice: number | null;
  stopLossPrice: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stopPct: number | null;
  riskReward: number | null;
  recommendedLeverage: number;
  fundingRate: number;
  fundingBias: string;
  domImbalance: number;
  circuitBreakerLockout: boolean;
  circuitBreakerWarning?: string;
  recommendedMarginUsd: number;
  riskAmountUsd: number;
  evidence: string[];
  riskNotes: string[];
  updatedAt: number;
}

export interface CryptoSignalsHubData {
  signals: CryptoQuantSignalItem[];
  stats: {
    totalScanned: number;
    buyCount: number;
    sellCount: number;
    neutralCount: number;
    topPick: CryptoQuantSignalItem | null;
  };
}

export const MONITORED_CRYPTO_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "PEPEUSDT",
];

async function scanSingleCryptoPair(pair: string): Promise<CryptoQuantSignalItem | null> {
  try {
    const [klines, ticker, funding, book] = await Promise.all([
      binance.getKlines(pair, "15m", 60).catch(() => []),
      binance.getSpotTicker(pair).catch(() => null),
      binance.getFundingRate(pair).catch(() => ({
        symbol: pair,
        markPrice: 0,
        indexPrice: 0,
        fundingRate: 0.0001,
        nextFundingTime: Date.now() + 8 * 3600000,
      })),
      binance.getOrderBook(pair, 10).catch(() => ({
        lastUpdateId: 0,
        bids: [],
        asks: [],
      })),
    ]);

    if (!klines || klines.length < 20 || !ticker) {
      return null;
    }

    const lastPrice = Number(ticker.lastPrice) || klines[klines.length - 1].close;
    const priceChange24h = Number(ticker.priceChangePercent) || 0;

    // Technical & Scalp Engine
    const scalp = analyzeScalp(klines, { timeframe: "15m", symbol: pair });

    // L2 DOM Analysis
    const dom = evaluateTrueLevel2Dom(book, 5);
    const domImbalance = dom.imbalanceRatio;

    // Funding Rate Analysis
    const fundingAnalysis = analyzeFundingRate(funding.fundingRate);

    // News & Cascade Shield Check
    const recent5mPct = klines.length >= 2
      ? ((lastPrice - klines[klines.length - 2].close) / klines[klines.length - 2].close) * 100
      : 0;

    const shield = evaluateCryptoShield({
      symbol: pair,
      fundingRate: funding.fundingRate,
      recentPriceChangePct5m: recent5mPct,
    });

    let direction: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
    if (scalp.direction === "watch-long") direction = "BUY";
    else if (scalp.direction === "watch-short") direction = "SELL";

    // Confluence adjustments from L2 DOM & Funding
    let probability = scalp.score ? Math.min(92, Math.max(50, Math.round(50 + scalp.score * 0.4))) : 50;
    const evidence: string[] = scalp.evidence ? [...scalp.evidence] : [];
    const riskNotes: string[] = scalp.riskNotes ? [...scalp.riskNotes] : [];

    if (direction === "BUY" && dom.institutionalBias === "STRONG_BUY_WALL") {
      probability = Math.min(94, probability + 8);
      evidence.push(`Bức tường mua L2 DOM (+${domImbalance}%) bảo vệ lực đỡ`);
    } else if (direction === "SELL" && dom.institutionalBias === "STRONG_SELL_WALL") {
      probability = Math.min(94, probability + 8);
      evidence.push(`Bức tường bán L2 DOM (${domImbalance}%) đè nặng áp lực xả`);
    }

    if (fundingAnalysis.fundingBias === "EXTREME_LONG_OVERHEAT") {
      if (direction === "BUY") {
        probability = Math.max(35, probability - 15);
        riskNotes.push("Funding Rate dương cao: Cảnh giác bẫy quét thanh lý Long");
      }
    } else if (fundingAnalysis.fundingBias === "EXTREME_SHORT_SQUEEZE") {
      if (direction === "BUY") {
        probability = Math.min(95, probability + 6);
        evidence.push("Funding Rate âm sâu: Kích hoạt nhịp Short Squeeze");
      }
    }

    let recommendedLeverage = 5;
    if (pair === "BTCUSDT" || pair === "ETHUSDT") {
      recommendedLeverage = shield.isLockout ? 2 : 10;
    } else {
      recommendedLeverage = shield.isLockout ? 1 : 5;
    }

    // SL and Entry calculation
    const primarySetup = scalp.primarySetup;
    let entry: number | null = primarySetup?.entry ?? lastPrice;
    let sl: number | null = primarySetup?.stopLoss ?? null;
    let tp1: number | null = primarySetup?.takeProfit ?? null;
    let tp2: number | null = null;
    let tp3: number | null = null;

    if (!sl && entry) {
      const defaultAtrDist = lastPrice * 0.015;
      sl = direction === "BUY" ? entry - defaultAtrDist : entry + defaultAtrDist;
    }

    if (entry && sl) {
      const riskDist = Math.abs(entry - sl);
      tp1 = direction === "BUY" ? entry + riskDist * 1.2 : entry - riskDist * 1.2;
      tp2 = direction === "BUY" ? entry + riskDist * 2.0 : entry - riskDist * 2.0;
      tp3 = direction === "BUY" ? entry + riskDist * 3.0 : entry - riskDist * 3.0;
    }

    const stopPct = entry && sl ? Math.round((Math.abs(entry - sl) / entry) * 100 * 10) / 10 : 1.5;

    let action: "BUY" | "SELL" | "WAIT" = direction === "NEUTRAL" ? "WAIT" : direction;
    let status: CryptoQuantSignalItem["status"] =
      primarySetup?.status === "TRIGGERED" || primarySetup?.status === "ACTIVE"
        ? "ACTIVE"
        : primarySetup?.status === "AWAITING_M5_BREAKOUT"
        ? "AWAITING_BREAKOUT"
        : "NEUTRAL";

    if (shield.isLockout) {
      action = "WAIT";
      status = "FILTERED_OUT";
      probability = 0;
      entry = null;
      sl = null;
      tp1 = null;
      tp2 = null;
      tp3 = null;
      if (shield.warningMessage) riskNotes.unshift(shield.warningMessage);
    }

    // Position sizer for $10,000 account, 1% risk ($100)
    let recommendedMarginUsd = 200;
    if (entry && sl && !shield.isLockout) {
      const sizer = calculateCryptoPositionSize({
        accountBalance: 10_000,
        riskPercent: 1.0,
        entryPrice: entry,
        stopLossPrice: sl,
        leverage: recommendedLeverage,
        direction: direction === "SELL" ? "SELL" : "BUY",
      });
      recommendedMarginUsd = sizer.requiredMarginUsd;
    }

    const symbolDisplay = pair.replace("USDT", "/USDT");

    return {
      pair,
      symbol: symbolDisplay,
      direction: shield.isLockout ? "NEUTRAL" : direction,
      action,
      timeframe: "15m",
      status,
      strength: scalp.score ?? 50,
      probability,
      lastPrice,
      entryPrice: entry,
      stopLossPrice: sl,
      tp1,
      tp2,
      tp3,
      stopPct,
      riskReward: 1.5,
      recommendedLeverage,
      fundingRate: funding.fundingRate,
      fundingBias: fundingAnalysis.fundingBias,
      domImbalance,
      circuitBreakerLockout: shield.isLockout,
      circuitBreakerWarning: shield.warningMessage ?? undefined,
      recommendedMarginUsd,
      riskAmountUsd: 100,
      evidence,
      riskNotes,
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function getCryptoSignalsHubData(): Promise<{ data: CryptoSignalsHubData; meta: Meta } | null> {
  const res = await cached("crypto-signals-hub-live", {
    ttlMs: 15_000,
    staleMs: 30_000,
    producer: async () => {
      const results = await Promise.all(MONITORED_CRYPTO_PAIRS.map((p) => scanSingleCryptoPair(p)));
      const signals: CryptoQuantSignalItem[] = results.filter((s): s is CryptoQuantSignalItem => s !== null);

      // Sort signals: actionable first, then descending probability
      signals.sort((a, b) => {
        if (a.action !== "WAIT" && b.action === "WAIT") return -1;
        if (a.action === "WAIT" && b.action !== "WAIT") return 1;
        return b.probability - a.probability;
      });

      const buyCount = signals.filter((s) => s.direction === "BUY").length;
      const sellCount = signals.filter((s) => s.direction === "SELL").length;
      const neutralCount = signals.filter((s) => s.direction === "NEUTRAL").length;
      const topPick = signals.find((s) => s.action !== "WAIT") ?? signals[0] ?? null;

      const meta = buildMeta({
        source: "Orca Crypto Derivatives & Institutional Signals Hub",
        sourceTimestampMs: Date.now(),
        note: `Đã quét ${signals.length}/${MONITORED_CRYPTO_PAIRS.length} cặp Binance Futures. Confluence True L2 DOM & Funding Rate.`,
      });

      return {
        data: {
          signals,
          stats: {
            totalScanned: signals.length,
            buyCount,
            sellCount,
            neutralCount,
            topPick,
          },
        },
        meta,
      };
    },
  });

  return res?.value ?? null;
}
