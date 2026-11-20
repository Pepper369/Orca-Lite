import "server-only";
import { buildMeta } from "../freshness";
import { cached } from "../cache";
import * as binance from "../providers/binance";
import { analyzeScalpMulti } from "../engines/scalp";
import { analyzeFundingRate, evaluateTrueLevel2Dom } from "../engines/crypto-derivatives-engine";
import { evaluateCryptoShield } from "../engines/crypto-news-shield";
import { calculateCryptoPositionSize } from "../engines/crypto-position-sizer";
import { atr as calcAtr } from "../technical";
import { resampleOhlcvBars } from "../engines/asset-precision";
import {
  calculateCrossAssetKelly,
  computeGarmanKlassLeverageCap,
  detectCryptoLiquidationClusters,
} from "../engines/unified-cross-asset-quant";
import { evaluatePrecisionTradeSetup, type SetupGrade } from "../engines/fx-crypto-precision-engine";
import { getGlobalMacroShieldEvents } from "../providers/economic-calendar";
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
  isHighWinrateVerified?: boolean;
  winrateScore?: number;
  liquiditySweepDetected?: boolean;
  setupGrade?: SetupGrade;
  expectancyR?: number;
  entryMode?: "LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT";
  vetoReasons?: string[];
  netRiskReward?: number | null;
  recommendedSizeMultiplier?: number;
  recommendedMarginUsd: number;
  riskAmountUsd: number;
  garmanKlassVolPct?: number;
  volatilityRegime?: string;
  liquidationMagnetPrice?: number | null;
  liquidationExposure?: string;
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

const GRADE_RANK: Record<SetupGrade, number> = {
  "A+": 4,
  A: 3,
  B: 2,
  NO_TRADE: 1,
};

async function scanSingleCryptoPair(
  pair: string,
  calendarEvents: { name: string; currency: string; time: string; importance: string }[] = [],
): Promise<CryptoQuantSignalItem | null> {
  try {
    const [klines15m, klines5m, ticker, funding, book, oi] = await Promise.all([
      binance.getKlines(pair, "15m", 120).catch(() => []),
      binance.getKlines(pair, "5m", 120).catch(() => []),
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
      binance.getOpenInterest(pair).catch(() => ({ openInterest: 0, time: Date.now() })),
    ]);

    const execBars = klines5m.length >= 60 ? klines5m : klines15m;
    const htfBars = klines15m.length >= 40 ? klines15m : execBars;
    if (!execBars || execBars.length < 30 || !ticker) {
      return null;
    }

    const lastPrice = Number(ticker.lastPrice) || execBars[execBars.length - 1]!.close;
    const quoteVol = Number((ticker as { quoteVolume?: string }).quoteVolume ?? 0) || null;

    // L2 DOM & Funding Rate Analysis
    const dom = evaluateTrueLevel2Dom(book, 5);
    const domImbalance = dom.imbalanceRatio;
    const fundingAnalysis = analyzeFundingRate(funding.fundingRate);

    // News & Liquidation Cascade Shield Check (wired with Economic Calendar)
    const nExec = execBars.length;
    const recent5mPct =
      nExec >= 2 && execBars[nExec - 2]!.close > 0
        ? ((lastPrice - execBars[nExec - 2]!.close) / execBars[nExec - 2]!.close) * 100
        : 0;

    const shield = evaluateCryptoShield({
      symbol: pair,
      fundingRate: funding.fundingRate,
      recentPriceChangePct5m: recent5mPct,
      calendarEvents,
    });

    // Multi-TF Scalp + Precision Engine
    const scalp =
      execBars.length >= 60
        ? analyzeScalpMulti({
            symbol: pair,
            barsM15: htfBars,
            barsM5: execBars,
            quoteVolume24h: quoteVol,
            fundingRate: funding.fundingRate,
            orderBookImbalance: domImbalance,
            isLockout: shield.isLockout,
            lockoutReason: shield.warningMessage,
          })
        : null;

    const precision =
      scalp?.precision ??
      evaluatePrecisionTradeSetup({
        symbol: pair,
        assetType: "CRYPTO",
        barsExecution: execBars,
        barsHtf: htfBars !== execBars ? htfBars : null,
        orderBookImbalance: domImbalance,
        fundingRate: funding.fundingRate,
        isNewsOrCascadeLockout: shield.isLockout,
        lockoutReason: shield.warningMessage,
      });

    const primarySetup = scalp?.primarySetup ?? null;
    const vetoReasons = [...precision.vetoReasons];
    if (shield.isLockout && shield.warningMessage && !vetoReasons.includes(shield.warningMessage)) {
      vetoReasons.unshift(shield.warningMessage);
    }

    let setupGrade: SetupGrade = precision.grade;
    if (shield.isLockout || vetoReasons.length > 0 || precision.direction === "NEUTRAL") {
      setupGrade = "NO_TRADE";
    }

    let direction: "BUY" | "SELL" | "NEUTRAL" = setupGrade === "NO_TRADE" ? "NEUTRAL" : precision.direction;
    let probability = precision.calibratedWinRatePct;
    const evidence: string[] = scalp?.evidence ? [...scalp.evidence] : [...precision.gatesPassed.slice(0, 4)];
    const riskNotes: string[] = scalp?.riskNotes ? [...scalp.riskNotes] : [...vetoReasons];

    if (direction === "BUY" && dom.institutionalBias === "STRONG_BUY_WALL") {
      probability = Math.min(86, probability + 4);
      evidence.push(`Bức tường mua L2 DOM (+${domImbalance}%) bảo vệ lực đỡ`);
    } else if (direction === "SELL" && dom.institutionalBias === "STRONG_SELL_WALL") {
      probability = Math.min(86, probability + 4);
      evidence.push(`Bức tường bán L2 DOM (${domImbalance}%) đè nặng áp lực xả`);
    }

    if (fundingAnalysis.fundingBias === "EXTREME_LONG_OVERHEAT" && direction === "BUY") {
      riskNotes.push("Funding Rate dương cao: Cảnh giác bẫy quét thanh lý Long");
    } else if (fundingAnalysis.fundingBias === "EXTREME_SHORT_SQUEEZE" && direction === "BUY") {
      probability = Math.min(88, probability + 4);
      evidence.push("Funding Rate âm sâu: Kích hoạt nhịp Short Squeeze");
    }

    const bars1h = resampleOhlcvBars(htfBars, 4);
    const leverageGov = computeGarmanKlassLeverageCap(
      bars1h.length >= 5 ? bars1h : execBars.slice(-24),
      true,
    );
    const openInterestUsd = oi.openInterest > 0 ? Math.round(oi.openInterest * lastPrice) : 0;
    const atrExec = scalp?.atr ?? calcAtr(execBars, 14) ?? lastPrice * 0.015;
    const liqClusters =
      openInterestUsd > 0 ? detectCryptoLiquidationClusters(lastPrice, openInterestUsd, atrExec) : null;

    const gradeFactor = setupGrade === "A+" ? 1.0 : setupGrade === "A" ? 0.8 : 0.6;
    const pairLevCap = pair === "BTCUSDT" || pair === "ETHUSDT" ? 15 : 8;
    const recommendedLeverage = shield.isLockout
      ? 1
      : Math.max(1, Math.min(pairLevCap, Math.round(leverageGov.maxRecommendedLeverage * gradeFactor)));

    if (leverageGov.volatilityRegime === "FLASH_CRASH_SHOCK" || leverageGov.volatilityRegime === "EXPANDING_RISK") {
      riskNotes.push(leverageGov.governorAdvisoryVi);
    }
    if (liqClusters?.primaryMagnetPrice != null) {
      evidence.push(liqClusters.insightVi);
    }

    let entry: number | null = precision.entry ?? primarySetup?.entry ?? lastPrice;
    let sl: number | null = precision.stopLoss ?? primarySetup?.stopLoss ?? null;
    let tp1: number | null = precision.tp1 ?? null;
    let tp2: number | null = precision.tp2 ?? null;
    let tp3: number | null = precision.tp3 ?? null;

    const stopPct =
      entry && sl && entry > 0 ? Math.round((Math.abs(entry - sl) / entry) * 100 * 100) / 100 : null;

    const isHighWinrateVerified =
      direction !== "NEUTRAL" && ((precision.isHighWinrateVerified ?? false) || setupGrade === "A+");
    const winrateScore = Math.max(precision.precisionScore, precision.winrateScore ?? 0);
    const liquiditySweepDetected = precision.liquiditySweepDetected ?? false;

    if (isHighWinrateVerified) {
      probability = Math.max(probability, Math.min(88, winrateScore));
      evidence.unshift("🎯 Siêu tín hiệu Winrate cao (HTF Trend + OTE Sweep)");
    }

    const action: "BUY" | "SELL" | "WAIT" = direction === "NEUTRAL" ? "WAIT" : direction;
    let status: CryptoQuantSignalItem["status"] =
      shield.isLockout
        ? "FILTERED_OUT"
        : action === "WAIT"
          ? "NEUTRAL"
          : setupGrade === "A+" || setupGrade === "A" || primarySetup?.status === "TRIGGERED" || primarySetup?.status === "ACTIVE"
            ? "ACTIVE"
            : "AWAITING_BREAKOUT";

    if (action === "WAIT") {
      entry = null;
      sl = null;
      tp1 = null;
      tp2 = null;
      tp3 = null;
      if (shield.isLockout) probability = 0;
    }

    const sizeMult = action === "WAIT" ? 0 : precision.recommendedSizeMultiplier;
    const kellySizing =
      action !== "WAIT" && sizeMult > 0
        ? calculateCrossAssetKelly({
            winRate: probability / 100,
            payoffRatio: Math.max(1.0, precision.netRiskReward ?? precision.grossRiskReward ?? 1.8),
            isCrypto: true,
            maxCapitalPerTrade: 0.02,
          })
        : null;
    const effectiveRiskPct =
      kellySizing && kellySizing.recommendedAllocation > 0
        ? Number((Math.min(1.5, Math.max(0.25, kellySizing.recommendedAllocation * 100)) * sizeMult).toFixed(2))
        : Number((1.0 * sizeMult).toFixed(2));

    let recommendedMarginUsd = 0;
    if (entry && sl && action !== "WAIT" && effectiveRiskPct > 0) {
      const sizer = calculateCryptoPositionSize({
        accountBalance: 10_000,
        riskPercent: effectiveRiskPct,
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
      direction,
      action,
      timeframe: klines5m.length >= 60 ? "M15/M5" : "15m",
      status,
      strength: action === "WAIT" ? Math.min(35, winrateScore) : scalp?.strength ?? winrateScore,
      probability,
      lastPrice,
      entryPrice: entry,
      stopLossPrice: sl,
      tp1,
      tp2,
      tp3,
      stopPct: action === "WAIT" ? null : stopPct,
      riskReward: precision.netRiskReward ?? precision.grossRiskReward ?? null,
      recommendedLeverage,
      fundingRate: funding.fundingRate,
      fundingBias: fundingAnalysis.fundingBias,
      domImbalance,
      circuitBreakerLockout: shield.isLockout,
      circuitBreakerWarning: shield.warningMessage ?? undefined,
      isHighWinrateVerified,
      winrateScore,
      liquiditySweepDetected,
      setupGrade,
      expectancyR: precision.expectancyR,
      entryMode: action === "WAIT" ? "WAIT" : precision.entryMode,
      vetoReasons,
      netRiskReward: precision.netRiskReward,
      recommendedSizeMultiplier: sizeMult,
      recommendedMarginUsd,
      riskAmountUsd: action === "WAIT" ? 0 : Math.round(100 * effectiveRiskPct),
      garmanKlassVolPct: Math.round(leverageGov.garmanKlassVolAnnualized * 1000) / 10,
      volatilityRegime: leverageGov.volatilityRegime,
      liquidationMagnetPrice: liqClusters?.primaryMagnetPrice ?? null,
      liquidationExposure: liqClusters?.dominantExposure,
      evidence: [...new Set(evidence)].slice(0, 8),
      riskNotes: [...new Set([...vetoReasons, ...riskNotes])].slice(0, 8),
      updatedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

export async function getCryptoSignalsHubData(): Promise<{ data: CryptoSignalsHubData; meta: Meta } | null> {
  const res = await cached("crypto-signals-hub-live-v2", {
    ttlMs: 15_000,
    staleMs: 30_000,
    producer: async () => {
      const calendarEvents = await getGlobalMacroShieldEvents().catch(() => []);
      const results = await Promise.all(MONITORED_CRYPTO_PAIRS.map((p) => scanSingleCryptoPair(p, calendarEvents)));
      const signals: CryptoQuantSignalItem[] = results.filter((s): s is CryptoQuantSignalItem => s !== null);

      // Sort strictly by Setup Grade (A+ > A > B > NO_TRADE), Expectancy E[R], then probability
      signals.sort((a, b) => {
        const ga = GRADE_RANK[a.setupGrade ?? "NO_TRADE"];
        const gb = GRADE_RANK[b.setupGrade ?? "NO_TRADE"];
        if (ga !== gb) return gb - ga;
        return (b.expectancyR ?? -1) - (a.expectancyR ?? -1) || b.probability - a.probability;
      });

      const buyCount = signals.filter((s) => s.direction === "BUY").length;
      const sellCount = signals.filter((s) => s.direction === "SELL").length;
      const neutralCount = signals.filter((s) => s.direction === "NEUTRAL").length;
      const topPick = signals.find((s) => s.action !== "WAIT") ?? signals[0] ?? null;

      const meta = buildMeta({
        source: "Orca Crypto Precision Engine v2 + L2 DOM + Macro Shield",
        sourceTimestampMs: Date.now(),
        note: `Đã quét M15+M5 ${signals.length}/${MONITORED_CRYPTO_PAIRS.length} cặp Binance Futures qua 7 Cổng Precision.`,
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
