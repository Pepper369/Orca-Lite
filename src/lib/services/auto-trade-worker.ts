import "server-only";
import { getAssetPipSize, resampleOhlcvBars, roundPrice } from "@/lib/engines/asset-precision";
import {
  evaluateBotTradingTimeline,
  isAccountPausedByTimeline,
  type QuantEngineFeedItem,
} from "@/lib/engines/bot-telemetry-types";
import { analyzeFundingRate, evaluateTrueLevel2Dom } from "@/lib/engines/crypto-derivatives-engine";
import { evaluateCryptoShield } from "@/lib/engines/crypto-news-shield";
import { calculateCurrencyStrengthMatrix, type PairPriceInput } from "@/lib/engines/forex-currency-strength";
import { evaluateNewsCircuitBreaker } from "@/lib/engines/forex-news-shield";
import { generateDeepFlowSignal } from "@/lib/engines/forex-order-flow-pro";
import { calibrateAndRegisterLiveMetaModels } from "@/lib/engines/fx-crypto-backtest-harness";
import { getEmpiricalFrictionTelemetry } from "@/lib/engines/exchange-execution-client";
import {
  evaluatePrecisionTradeSetup,
  type SetupGrade,
} from "@/lib/engines/fx-crypto-precision-engine";
import { getLiveTrainedMetaModel } from "@/lib/engines/meta-labeling-calibration";
import {
  buildCryptoLiquidityContext,
  calculateUnifiedTradeRiskPlan,
  computeGarmanKlassLeverageCap,
  detectCryptoLiquidationClusters,
} from "@/lib/engines/unified-cross-asset-quant";
import { eventBus } from "@/lib/events";
import * as binance from "@/lib/providers/binance";
import { getGlobalMacroShieldEvents } from "@/lib/providers/economic-calendar";
import { getBiquotePublicOhlc } from "@/lib/providers/forex";
import { binanceWs, ensureBinanceWsStarted } from "@/lib/realtime/binance-ws";
import {
  ensureBiquoteCoreWatch,
  getBiquoteLiveAll,
  getBiquoteLiveTick,
  getBiquoteLiveTickAny,
  mergeBarsWithBiquoteLiveTick,
} from "@/lib/realtime/biquote-poll";
import {
  dispatchSignalWithVault,
  type DispatchableSignalInput,
} from "@/lib/services/auto-trade-dispatcher";
import {
  evaluateRealtimePositionExits,
  recordBotActivity,
  updateLivePriceReference,
} from "@/lib/services/bot-live-telemetry";
import { listBrokerConnections } from "@/lib/services/broker-vault-store";
import { getCryptoSignalsHubData } from "@/lib/services/crypto-signals-hub";
import { getForexDetail, getForexMarkets } from "@/lib/services/forex";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";
import { atr as calcAtr } from "@/lib/technical";

const POLL_INTERVAL_MS = 10_000;

const CORE_REALTIME_CRYPTO_PAIRS = [
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
] as const;

const CORE_REALTIME_FOREX_PAIRS = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCAD",
  "AUDUSD",
  "USDCHF",
  "GBPJPY",
  "EURJPY",
  "NZDUSD",
] as const;

interface WorkerGlobalState {
  version?: number;
  started: boolean;
  isTickRunning: boolean;
  lastTickAt: number | null;
  lastDispatchedCount: number;
  lastScannedSignalsCount: number;
  lastScanStatus: string;
  lastQuantFeed: QuantEngineFeedItem[];
  metaModelCalibrated: boolean;
  timer: ReturnType<typeof setInterval> | null;
  latestTickFn?: () => Promise<unknown>;
}

const WORKER_CODE_VERSION = 6;

const g = globalThis as typeof globalThis & {
  __orcaAutoTradeWorkerState?: WorkerGlobalState;
};

const STATE: WorkerGlobalState =
  g.__orcaAutoTradeWorkerState ??
  (g.__orcaAutoTradeWorkerState = {
    version: WORKER_CODE_VERSION,
    started: false,
    isTickRunning: false,
    lastTickAt: null,
    lastDispatchedCount: 0,
    lastScannedSignalsCount: 0,
    lastScanStatus: "Khởi tạo Real-Time Quant Engine (chu kỳ 10s)...",
    lastQuantFeed: [],
    metaModelCalibrated: false,
    timer: null,
  });

// Hot-reload (HMR) Guard: always kill stale interval closures from older module evaluations
if (STATE.version !== WORKER_CODE_VERSION) {
  if (STATE.timer) {
    clearInterval(STATE.timer);
    STATE.timer = null;
  }
  STATE.started = false;
  STATE.isTickRunning = false;
  STATE.metaModelCalibrated = false;
  STATE.version = WORKER_CODE_VERSION;
}

function ensureLiveMetaModelCalibrated(): void {
  if (STATE.metaModelCalibrated) return;
  STATE.metaModelCalibrated = true;
  if (!getLiveTrainedMetaModel("CRYPTO") || !getLiveTrainedMetaModel("FOREX")) {
    try {
      calibrateAndRegisterLiveMetaModels({ assetType: "ALL" });
    } catch {
      /* keep prior weights if calibration throws */
    }
  }
}

export function getLiveQuantEngineFeed(): QuantEngineFeedItem[] {
  return STATE.lastQuantFeed ?? [];
}

const IS_TEST_RUNNER =
  process.argv.includes("--test") ||
  process.execArgv.some((arg) => arg.includes("test")) ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.env.NODE_ENV === "test" ||
  process.env.ORCA_DISABLE_REALTIME_WS === "1";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref?.();
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function isEligibleGrade(grade?: string | null, winrateScore?: number): boolean {
  if (grade) return grade === "A+" || grade === "A";
  return (winrateScore ?? 0) >= 75;
}

function isForexWeekendClosedUtc(nowMs = Date.now()): boolean {
  return !evaluateBotTradingTimeline(nowMs).forexBotActive;
}

/**
 * SSOT Real-Time Precision Scanner (Single Source of Truth):
 * Dùng trực tiếp 7-Gate `evaluatePrecisionTradeSetup` cho các cặp còn lại ngoài Hub,
 * loại bỏ hoàn toàn mô hình momentum riêng lẻ gây sai lệch với Signal Hub và Backtest.
 */
async function scanLivePrecisionSetups(params: {
  existingCryptoSymbols: Set<string>;
  existingForexSymbols: Set<string>;
  needCryptoCount: number;
  needForexCount: number;
}): Promise<Array<{ signal: DispatchableSignalInput; marketPrice: number; feedItem: QuantEngineFeedItem }>> {
  const out: Array<{ signal: DispatchableSignalInput; marketPrice: number; feedItem: QuantEngineFeedItem }> = [];
  const bucket5m = Math.floor(Date.now() / (5 * 60 * 1000));
  const calendarEvents = await withTimeout(getGlobalMacroShieldEvents().catch(() => []), 2_000, []);

  if (params.needCryptoCount > 0) {
    const candidates = CORE_REALTIME_CRYPTO_PAIRS.filter(
      (p) => !params.existingCryptoSymbols.has(p),
    ).slice(0, params.needCryptoCount + 2);

    const scanned = await Promise.all(
      candidates.map(async (pair) => {
        try {
          const [bars5m, bars15m, spot, funding, book, oi] = await Promise.all([
            binance.getKlines(pair, "5m", 120).catch(() => []),
            binance.getKlines(pair, "15m", 96).catch(() => []),
            binance.getSpotTicker(pair).catch(() => null),
            binance.getFundingRate(pair).catch(() => null),
            binance.getOrderBook(pair, 10).catch(() => ({ lastUpdateId: 0, bids: [], asks: [] })),
            binance.getOpenInterest(pair).catch(() => ({ openInterest: 0, time: Date.now() })),
          ]);
          const execBars = bars5m.length >= 60 ? bars5m : bars15m;
          const htfBars = bars15m.length >= 40 ? bars15m : execBars;
          const wsMark = binanceWs.getMark(pair, 20_000)?.markPrice ?? binanceWs.getTicker(pair, 20_000)?.price;
          const livePrice =
            wsMark && wsMark > 0
              ? wsMark
              : Number(spot?.lastPrice ?? 0) || (execBars.length > 0 ? execBars[execBars.length - 1]!.close : 0);
          if (livePrice <= 0 || execBars.length < 30) return null;
          updateLivePriceReference(pair, livePrice);

          const dom = evaluateTrueLevel2Dom(book, 5);
          const wsMicro = binanceWs.getMicroFlow(pair);
          const blendedImbalance =
            wsMicro != null
              ? Math.round(dom.imbalanceRatio * 0.65 + wsMicro.tickImbalancePct * 0.35)
              : dom.imbalanceRatio;
          const bestBid = book.bids[0]?.price ?? 0;
          const bestAsk = book.asks[0]?.price ?? 0;
          const liveSpreadPct =
            bestBid > 0 && bestAsk >= bestBid ? (bestAsk - bestBid) / ((bestAsk + bestBid) / 2) : null;
          const bars1h = resampleOhlcvBars(htfBars, 4);
          const fundingRate = funding?.fundingRate ?? (wsMicro ? wsMicro.fundingRate : null);
          const oiUsd = oi.openInterest > 0 ? oi.openInterest * livePrice : 0;
          const prelimAtr = calcAtr(execBars, 14) ?? livePrice * 0.012;
          const liqClusters =
            oiUsd > 0
              ? detectCryptoLiquidationClusters(livePrice, oiUsd, prelimAtr, {
                  symbol: pair,
                  fundingRate,
                  priceChange24hPct: Number(spot?.priceChangePercent) || null,
                  orderBookImbalance: blendedImbalance,
                })
              : null;
          const { liquidationClusterAligned, externalMagnets } = buildCryptoLiquidityContext(liqClusters);
          const nExec = execBars.length;
          const recent5mPct =
            nExec >= 2 && execBars[nExec - 2]!.close > 0
              ? ((livePrice - execBars[nExec - 2]!.close) / execBars[nExec - 2]!.close) * 100
              : 0;
          const shield = evaluateCryptoShield({
            symbol: pair,
            fundingRate: fundingRate ?? 0,
            recentPriceChangePct5m: recent5mPct,
            calendarEvents,
          });

          const precision = evaluatePrecisionTradeSetup({
            symbol: pair,
            assetType: "CRYPTO",
            barsExecution: execBars,
            barsHtf: htfBars !== execBars ? htfBars : null,
            barsMacro: bars1h.length >= 12 ? bars1h : null,
            spreadPipsOrPct: liveSpreadPct,
            orderBookImbalance: blendedImbalance,
            fundingRate,
            liquidationClusterAligned,
            externalMagnets,
            isNewsOrCascadeLockout: shield.isLockout,
            lockoutReason: shield.warningMessage,
            empiricalFrictionROverride: getEmpiricalFrictionTelemetry(pair).recommendedFrictionROverride,
          });

          if (
            precision.direction === "NEUTRAL" ||
            !isEligibleGrade(precision.grade, precision.precisionScore) ||
            precision.stopLoss == null ||
            precision.tp1 == null ||
            precision.vetoReasons.length > 0
          ) {
            return null;
          }

          const levGov = computeGarmanKlassLeverageCap(
            bars1h.length >= 5 ? bars1h : execBars.slice(-24),
            true,
          );
          const pairLevCap = pair === "BTCUSDT" || pair === "ETHUSDT" ? 15 : 8;
          const gradeFactor = precision.grade === "A+" ? 1.0 : 0.8;
          const recommendedLeverage = Math.max(
            1,
            Math.min(pairLevCap, Math.round(levGov.maxRecommendedLeverage * gradeFactor)),
          );
          const riskPlan = calculateUnifiedTradeRiskPlan({
            assetType: "CRYPTO",
            symbol: pair,
            direction: precision.direction,
            winRatePct: precision.calibratedWinRatePct,
            payoffRatio: Math.max(1.0, precision.netRiskReward ?? precision.grossRiskReward ?? 1.8),
            sizeMultiplier: precision.recommendedSizeMultiplier,
            entryPrice: livePrice,
            stopLossPrice: precision.stopLoss,
            takeProfit1: precision.tp1,
            takeProfit2: precision.tp2,
            takeProfit3: precision.tp3,
            accountBalanceUsd: 10_000,
            leverage: recommendedLeverage,
          });
          const baseQty = Math.max(0.001, riskPlan.recommendedLotsOrQty);

          const roundedEntry = roundPrice(precision.entry ?? livePrice, pair, "CRYPTO");
          const roundedSl = roundPrice(precision.stopLoss, pair, "CRYPTO");
          const roundedTp1 = roundPrice(precision.tp1, pair, "CRYPTO");
          const roundedTp2 = precision.tp2 != null ? roundPrice(precision.tp2, pair, "CRYPTO") : undefined;
          const roundedTp3 = precision.tp3 != null ? roundPrice(precision.tp3, pair, "CRYPTO") : undefined;
          const sigId = `rt_cr_${pair}_${precision.direction}_${bucket5m}`;

          return {
            signal: {
              id: sigId,
              symbol: pair,
              assetType: "CRYPTO" as const,
              direction: precision.direction,
              entryPrice: roundedEntry,
              stopLossPrice: roundedSl,
              takeProfit1: roundedTp1,
              takeProfit2: roundedTp2,
              takeProfit3: roundedTp3,
              masterLotsOrQty: Number(baseQty.toFixed(4)),
              masterCapitalUsd: 10_000,
              winrateScore: precision.precisionScore,
              setupGrade: precision.grade,
              recommendedLeverage,
              entryMode: precision.entryMode,
              entryZone: precision.entryZone,
              expectancyR: precision.expectancyR,
              tp1ClosePct: precision.breakevenPlan.tp1ClosePct,
              tp2ClosePct: precision.breakevenPlan.tp2ClosePct,
              tp3ClosePct: precision.breakevenPlan.tp3ClosePct,
              trailingAtrMult: precision.breakevenPlan.trailingAtrMult,
              spreadPipsOrPct: liveSpreadPct,
              timestamp: Date.now(),
            },
            marketPrice: roundPrice(livePrice, pair, "CRYPTO"),
            feedItem: {
              id: sigId,
              symbol: pair,
              assetType: "CRYPTO" as const,
              direction: precision.direction,
              setupGrade: precision.grade,
              winrateScore: precision.precisionScore,
              calibratedWinRatePct: precision.calibratedWinRatePct,
              expectancyR: precision.expectancyR,
              entryMode: precision.entryMode,
              entryPrice: roundedEntry,
              stopLossPrice: roundedSl,
              takeProfit1: roundedTp1,
              takeProfit2: roundedTp2 ?? null,
              takeProfit3: roundedTp3 ?? null,
              recommendedLeverage,
              masterLotsOrQty: Number(baseQty.toFixed(4)),
              ictSetup: precision.liquiditySweepDetected ? "ICT Sweep + MSS + OTE" : "SMC Order Flow + FVG/BPR",
              regimeState: `${precision.regime.state} (${precision.regime.hmmState ?? "TREND"})`,
              liquiditySweepDetected: precision.liquiditySweepDetected,
              summaryVi: precision.summaryVi,
              updatedAt: Date.now(),
            },
          };
        } catch {
          return null;
        }
      }),
    );

    for (const item of scanned) {
      if (item && out.filter((x) => x.signal.assetType === "CRYPTO").length < params.needCryptoCount) {
        out.push(item);
      }
    }
  }

  if (params.needForexCount > 0) {
    const fxCandidates = CORE_REALTIME_FOREX_PAIRS.filter(
      (p) => !params.existingForexSymbols.has(p),
    ).slice(0, params.needForexCount + 2);

    const marketsRes = await withTimeout(getForexMarkets().catch(() => null), 2_000, null);
    const fxRows = marketsRes?.data?.rows ?? [];
    const csmScoreMap = new Map<string, number>();
    if (fxRows.length >= 4) {
      const csmInputs: PairPriceInput[] = fxRows
        .filter((r) => r.price > 0)
        .map((r) => ({ pair: r.pair, price: r.price, changePercent: r.changePercent ?? 0 }));
      if (csmInputs.length >= 4) {
        const csm = calculateCurrencyStrengthMatrix(csmInputs);
        for (const s of csm.scores) csmScoreMap.set(s.currency, s.score);
      }
    }
    const findFx = (target: string) => fxRows.find((r) => r.pair === target && r.price > 0)?.price ?? null;
    const crossRates = {
      usdJpy: findFx("USDJPY"),
      gbpUsd: findFx("GBPUSD"),
      usdChf: findFx("USDCHF"),
      usdCad: findFx("USDCAD"),
      audUsd: findFx("AUDUSD"),
      nzdUsd: findFx("NZDUSD"),
    };

    const scannedFx = await Promise.all(
      fxCandidates.map(async (pair) => {
        try {
          const [intraday15m, detail] = await Promise.all([
            withTimeout(getBiquotePublicOhlc(pair, "15m", 120).catch(() => []), 2_500, []),
            getForexDetail(pair).catch(() => null),
          ]);
          const dailySeries = detail?.detail?.series ?? [];
          const rawExecBars = intraday15m.length >= 30 ? intraday15m : dailySeries;
          const execBars = mergeBarsWithBiquoteLiveTick(rawExecBars, pair, 900);
          const bqTick = getBiquoteLiveTick(pair, 45_000) ?? getBiquoteLiveTickAny(pair);
          if (isForexWeekendClosedUtc() || bqTick?.marketState === "closed") {
            return null;
          }
          const livePrice =
            bqTick && bqTick.price > 0
              ? bqTick.price
              : detail?.detail?.current?.price || (execBars.length > 0 ? execBars[execBars.length - 1]!.close : 0);
          if (livePrice <= 0 || execBars.length < 30) return null;
          updateLivePriceReference(pair, livePrice);

          const pipSizeFx = getAssetPipSize(pair, "FOREX", livePrice);
          const liveSpreadPips =
            bqTick && bqTick.ask > bqTick.bid && pipSizeFx > 0
              ? Number(((bqTick.ask - bqTick.bid) / pipSizeFx).toFixed(2))
              : null;
          const cb = evaluateNewsCircuitBreaker(pair, Date.now(), calendarEvents);
          const flow = generateDeepFlowSignal(
            pair,
            execBars,
            liveSpreadPips != null ? { currentSpreadPips: liveSpreadPips } : undefined,
          );
          const baseCurr = pair.slice(0, 3);
          const quoteCurr = pair.slice(3, 6);
          const baseScore = csmScoreMap.get(baseCurr);
          const quoteScore = csmScoreMap.get(quoteCurr);
          const csmSpread =
            baseScore != null && quoteScore != null
              ? Number((baseScore - quoteScore).toFixed(1))
              : baseCurr === "XAU" && quoteScore != null
                ? Number((5.0 - quoteScore).toFixed(1))
                : null;

          const htfBars =
            intraday15m.length >= 30 && dailySeries.length >= 30
              ? dailySeries
              : resampleOhlcvBars(execBars, 4);

          const precision = evaluatePrecisionTradeSetup({
            symbol: pair,
            assetType: "FOREX",
            barsExecution: execBars,
            barsHtf: htfBars.length >= 20 ? htfBars : null,
            flowIntensityIndex: flow.flowIntensityIndex,
            absorptionType: flow.absorption.type,
            volumeDeltaDivergence: flow.cvdDivergence,
            csmBaseMinusQuote: csmSpread,
            spreadPipsOrPct: liveSpreadPips,
            isNewsOrCascadeLockout: cb.isLockout || !(flow.spreadSafety?.isSafe ?? true),
            lockoutReason: cb.warningMessage ?? flow.spreadSafety?.lockoutReason ?? null,
            empiricalFrictionROverride: getEmpiricalFrictionTelemetry(pair).recommendedFrictionROverride,
          });

          if (
            precision.direction === "NEUTRAL" ||
            !isEligibleGrade(precision.grade, precision.precisionScore) ||
            precision.stopLoss == null ||
            precision.tp1 == null ||
            precision.vetoReasons.length > 0
          ) {
            return null;
          }

          const entryPrice = roundPrice(livePrice, pair, "FOREX");
          const stopLossPrice = roundPrice(precision.stopLoss, pair, "FOREX");
          const riskPlan = calculateUnifiedTradeRiskPlan({
            assetType: "FOREX",
            symbol: pair,
            direction: precision.direction,
            winRatePct: precision.calibratedWinRatePct,
            payoffRatio: Math.max(1.0, precision.netRiskReward ?? precision.grossRiskReward ?? 1.8),
            sizeMultiplier: precision.recommendedSizeMultiplier,
            entryPrice,
            stopLossPrice,
            takeProfit1: precision.tp1,
            takeProfit2: precision.tp2,
            takeProfit3: precision.tp3,
            accountBalanceUsd: 10_000,
            crossRates,
          });

          const roundedEntryFx = roundPrice(precision.entry ?? entryPrice, pair, "FOREX");
          const roundedTp1Fx = roundPrice(precision.tp1, pair, "FOREX");
          const roundedTp2Fx = precision.tp2 != null ? roundPrice(precision.tp2, pair, "FOREX") : undefined;
          const roundedTp3Fx = precision.tp3 != null ? roundPrice(precision.tp3, pair, "FOREX") : undefined;
          const lotsFx = Math.max(0.01, riskPlan.recommendedLotsOrQty);
          const sigIdFx = `rt_fx_${pair}_${precision.direction}_${bucket5m}`;

          return {
            signal: {
              id: sigIdFx,
              symbol: pair,
              assetType: "FOREX" as const,
              direction: precision.direction,
              entryPrice: roundedEntryFx,
              stopLossPrice,
              takeProfit1: roundedTp1Fx,
              takeProfit2: roundedTp2Fx,
              takeProfit3: roundedTp3Fx,
              masterLotsOrQty: lotsFx,
              masterCapitalUsd: 10_000,
              winrateScore: precision.precisionScore,
              setupGrade: precision.grade,
              recommendedLeverage: 1,
              entryMode: precision.entryMode,
              entryZone: precision.entryZone,
              expectancyR: precision.expectancyR,
              tp1ClosePct: precision.breakevenPlan.tp1ClosePct,
              tp2ClosePct: precision.breakevenPlan.tp2ClosePct,
              tp3ClosePct: precision.breakevenPlan.tp3ClosePct,
              trailingAtrMult: precision.breakevenPlan.trailingAtrMult,
              spreadPipsOrPct: liveSpreadPips,
              timestamp: Date.now(),
            },
            marketPrice: entryPrice,
            feedItem: {
              id: sigIdFx,
              symbol: pair,
              assetType: "FOREX" as const,
              direction: precision.direction,
              setupGrade: precision.grade,
              winrateScore: precision.precisionScore,
              calibratedWinRatePct: precision.calibratedWinRatePct,
              expectancyR: precision.expectancyR,
              entryMode: precision.entryMode,
              entryPrice: roundedEntryFx,
              stopLossPrice,
              takeProfit1: roundedTp1Fx,
              takeProfit2: roundedTp2Fx ?? null,
              takeProfit3: roundedTp3Fx ?? null,
              recommendedLeverage: 1,
              masterLotsOrQty: lotsFx,
              ictSetup: precision.liquiditySweepDetected ? "ICT Judas/Turtle Sweep + OTE" : "SMC Deep Flow + FVG/BPR",
              regimeState: `${precision.regime.state} (${precision.regime.hmmState ?? "TREND"})`,
              liquiditySweepDetected: precision.liquiditySweepDetected,
              summaryVi: precision.summaryVi,
              updatedAt: Date.now(),
            },
          };
        } catch {
          return null;
        }
      }),
    );

    for (const item of scannedFx) {
      if (item && out.filter((x) => x.signal.assetType === "FOREX").length < params.needForexCount) {
        out.push(item);
      }
    }
  }

  return out;
}

export async function runAutoTradeTick(): Promise<{
  dispatched: number;
  closedPositions: number;
  trailedPositions: number;
  scannedAt: number;
  activeAutoAccounts: number;
}> {
  if (STATE.isTickRunning) {
    return {
      dispatched: STATE.lastDispatchedCount,
      closedPositions: 0,
      trailedPositions: 0,
      scannedAt: STATE.lastTickAt ?? Date.now(),
      activeAutoAccounts: 0,
    };
  }
  STATE.isTickRunning = true;
  let activeAutoAccounts = 0;

  try {
    ensureLiveMetaModelCalibrated();
    if (!IS_TEST_RUNNER) {
      ensureBinanceWsStarted();
      ensureBiquoteCoreWatch();
      for (const t of getBiquoteLiveAll()) {
        if (t.price > 0) updateLivePriceReference(t.symbol, t.price);
      }
    }

    const timeline = evaluateBotTradingTimeline(Date.now());
    const accounts = await listBrokerConnections();
    const autoEnabled = accounts.filter(
      (a) =>
        a.isActive &&
        a.autoExecuteEnabled &&
        !a.killSwitched &&
        !isAccountPausedByTimeline(a.platform).paused,
    );
    activeAutoAccounts = autoEnabled.length;

    const [fxRes, crRes] = await Promise.allSettled([
      timeline.forexBotActive
        ? withTimeout(getForexSignalsHubData(), 4_200, null)
        : Promise.resolve(null),
      withTimeout(getCryptoSignalsHubData(), 4_200, null),
    ]);

    const reversals = new Map<string, "BUY" | "SELL">();
    const signalsToDispatch: Array<{ signal: DispatchableSignalInput; marketPrice: number }> = [];
    const quantFeedItems: QuantEngineFeedItem[] = [];
    const seenCrypto = new Set<string>();
    const seenForex = new Set<string>();
    const bucket5m = Math.floor(Date.now() / (5 * 60 * 1000));

    if (fxRes.status === "fulfilled" && fxRes.value) {
      const fxMarketClosed = isForexWeekendClosedUtc();
      for (const s of fxRes.value.data.signals) {
        seenForex.add(s.pair);
        const bqAny = getBiquoteLiveTickAny(s.pair);
        const refPx = bqAny && bqAny.price > 0 ? bqAny.price : s.lastPrice;
        if (refPx > 0) updateLivePriceReference(s.pair, refPx);
        if (
          !fxMarketClosed &&
          bqAny?.marketState !== "closed" &&
          s.status === "ACTIVE" &&
          s.setupGrade === "A+" &&
          (s.winrateScore ?? s.probability) >= 82 &&
          (s.direction === "BUY" || s.direction === "SELL")
        ) {
          reversals.set(s.pair.toUpperCase(), s.direction);
        }
      }

      const fxCandidates = fxRes.value.data.signals
        .filter(
          (s) =>
            !fxMarketClosed &&
            s.session !== "WEEKEND" &&
            s.sessionEligible !== false &&
            (s.status === "ACTIVE" || s.status === "AWAITING_BREAKOUT") &&
            (s.direction === "BUY" || s.direction === "SELL") &&
            s.entryPrice != null &&
            s.stopLossPrice != null &&
            s.tp1 != null &&
            !s.newsLockout &&
            isEligibleGrade(s.setupGrade, s.winrateScore ?? s.probability),
        )
        .slice(0, 5);

      for (const s of fxCandidates) {
        seenForex.add(s.pair);
        const bqLive = getBiquoteLiveTick(s.pair, 30_000) ?? getBiquoteLiveTickAny(s.pair);
        if (bqLive?.marketState === "closed") continue;
        const liveTick = bqLive?.price;
        const marketPrice = liveTick && liveTick > 0 ? liveTick : s.lastPrice || s.entryPrice!;
        const pipFx = getAssetPipSize(s.pair, "FOREX", marketPrice);
        const spreadPips =
          bqLive && bqLive.ask > bqLive.bid && pipFx > 0
            ? Number(((bqLive.ask - bqLive.bid) / pipFx).toFixed(2))
            : null;
        const sigId = `fx_${s.pair}_${s.direction}_${bucket5m}`;
        const wrScore = s.winrateScore ?? s.probability;
        const grade = (s.setupGrade === "A+" || s.setupGrade === "A" ? s.setupGrade : "A") as SetupGrade;
        const lots = Math.max(0.01, s.recommendedLots || 0.2);
        const riskDist = Math.abs((s.entryPrice ?? marketPrice) - s.stopLossPrice!);
        const isBuyFx = s.direction === "BUY";
        const refEntryFx = s.entryPrice ?? marketPrice;
        const pullbackTriggered =
          s.entryMode === "LIMIT_PULLBACK"
            ? riskDist <= 0 || Math.abs(marketPrice - refEntryFx) <= riskDist * 0.35
            : riskDist <= 0 ||
              (isBuyFx
                ? marketPrice >= refEntryFx - riskDist * 0.25
                : marketPrice <= refEntryFx + riskDist * 0.25);

        if (s.status === "ACTIVE" && pullbackTriggered) {
          signalsToDispatch.push({
            signal: {
              id: sigId,
              symbol: s.pair,
              assetType: "FOREX",
              direction: s.direction as "BUY" | "SELL",
              entryPrice: s.entryPrice ?? marketPrice,
              stopLossPrice: s.stopLossPrice!,
              takeProfit1: s.tp1!,
              takeProfit2: s.tp2 ?? undefined,
              takeProfit3: s.tp3 ?? undefined,
              masterLotsOrQty: lots,
              masterCapitalUsd: 10_000,
              winrateScore: wrScore,
              setupGrade: grade,
              entryMode: s.entryMode,
              entryZone: s.entryZone ?? null,
              expectancyR: s.expectancyR,
              tp1ClosePct: s.tp1ClosePct,
              tp2ClosePct: s.tp2ClosePct,
              tp3ClosePct: s.tp3ClosePct,
              trailingAtrMult: s.trailingAtrMult,
              spreadPipsOrPct: spreadPips,
              timestamp: s.updatedAt,
            },
            marketPrice,
          });
        }

        quantFeedItems.push({
          id: sigId,
          symbol: s.pair,
          assetType: "FOREX",
          direction: s.direction as "BUY" | "SELL",
          setupGrade: grade,
          winrateScore: wrScore,
          calibratedWinRatePct: Math.min(92, Math.max(68, Math.round(wrScore))),
          expectancyR: s.expectancyR ?? 1.25,
          entryMode: s.entryMode ?? "MARKET_CONFIRMED",
          entryPrice: s.entryPrice ?? marketPrice,
          stopLossPrice: s.stopLossPrice!,
          takeProfit1: s.tp1!,
          takeProfit2: s.tp2 ?? null,
          takeProfit3: s.tp3 ?? null,
          recommendedLeverage: 1,
          masterLotsOrQty: lots,
          ictSetup: s.liquiditySweepDetected ? "ICT Sweep + MSS + OTE" : "SMC Deep Flow + FVG/BPR",
          regimeState: s.regime ?? "TRENDING",
          liquiditySweepDetected: Boolean(s.liquiditySweepDetected),
          summaryVi: s.evidence?.[0] ?? `${s.pair} ${s.direction} hội tụ 7-Gate Quant`,
          updatedAt: s.updatedAt,
        });
      }
    }

    if (crRes.status === "fulfilled" && crRes.value) {
      for (const s of crRes.value.data.signals) {
        seenCrypto.add(s.pair);
        if (s.lastPrice > 0) updateLivePriceReference(s.pair, s.lastPrice);
        if (
          s.status === "ACTIVE" &&
          s.setupGrade === "A+" &&
          (s.winrateScore ?? s.probability) >= 82 &&
          (s.direction === "BUY" || s.direction === "SELL")
        ) {
          reversals.set(s.pair.toUpperCase(), s.direction);
        }
      }

      const crCandidates = crRes.value.data.signals
        .filter(
          (s) =>
            (s.status === "ACTIVE" || s.status === "AWAITING_BREAKOUT") &&
            (s.direction === "BUY" || s.direction === "SELL") &&
            s.entryPrice != null &&
            s.stopLossPrice != null &&
            s.tp1 != null &&
            !s.circuitBreakerLockout &&
            isEligibleGrade(s.setupGrade, s.winrateScore ?? s.probability),
        )
        .slice(0, 5);

      for (const s of crCandidates) {
        seenCrypto.add(s.pair);
        const wsPrice =
          binanceWs.getMark(s.pair, 20_000)?.markPrice ?? binanceWs.getTicker(s.pair, 20_000)?.price;
        const marketPrice = wsPrice && wsPrice > 0 ? wsPrice : s.lastPrice || s.entryPrice!;
        const baseQty =
          marketPrice > 0
            ? Math.max(
                0.001,
                (Math.max(150, s.recommendedMarginUsd) * Math.max(1, s.recommendedLeverage)) / marketPrice,
              )
            : 0.05;
        const sigId = `cr_${s.pair}_${s.direction}_${bucket5m}`;
        const wrScore = s.winrateScore ?? s.probability;
        const grade = (s.setupGrade === "A+" || s.setupGrade === "A" ? s.setupGrade : "A") as SetupGrade;
        const riskDist = Math.abs((s.entryPrice ?? marketPrice) - s.stopLossPrice!);
        const isBuyCr = s.direction === "BUY";
        const refEntryCr = s.entryPrice ?? marketPrice;
        const wsMicroCr = binanceWs.getMicroFlow(s.pair);
        const microFlowAligned =
          !wsMicroCr ||
          (isBuyCr ? wsMicroCr.tickImbalancePct > -40 : wsMicroCr.tickImbalancePct < 40);
        const pullbackTriggered =
          s.entryMode === "LIMIT_PULLBACK"
            ? riskDist <= 0 || Math.abs(marketPrice - refEntryCr) <= riskDist * 0.35
            : riskDist <= 0 ||
              (isBuyCr
                ? marketPrice >= refEntryCr - riskDist * 0.25
                : marketPrice <= refEntryCr + riskDist * 0.25);

        if (s.status === "ACTIVE" && pullbackTriggered && microFlowAligned) {
          signalsToDispatch.push({
            signal: {
              id: sigId,
              symbol: s.pair,
              assetType: "CRYPTO",
              direction: s.direction as "BUY" | "SELL",
              entryPrice: s.entryPrice ?? marketPrice,
              stopLossPrice: s.stopLossPrice!,
              takeProfit1: s.tp1!,
              takeProfit2: s.tp2 ?? undefined,
              takeProfit3: s.tp3 ?? undefined,
              masterLotsOrQty: Number(baseQty.toFixed(4)),
              masterCapitalUsd: 10_000,
              winrateScore: wrScore,
              setupGrade: grade,
              recommendedLeverage: s.recommendedLeverage,
              entryMode: s.entryMode,
              entryZone: s.entryZone ?? null,
              expectancyR: s.expectancyR,
              tp1ClosePct: s.tp1ClosePct,
              tp2ClosePct: s.tp2ClosePct,
              tp3ClosePct: s.tp3ClosePct,
              trailingAtrMult: s.trailingAtrMult,
              timestamp: s.updatedAt,
            },
            marketPrice,
          });
        }

        quantFeedItems.push({
          id: sigId,
          symbol: s.pair,
          assetType: "CRYPTO",
          direction: s.direction as "BUY" | "SELL",
          setupGrade: grade,
          winrateScore: wrScore,
          calibratedWinRatePct: Math.min(93, Math.max(68, Math.round(wrScore))),
          expectancyR: s.expectancyR ?? 1.3,
          entryMode: s.entryMode ?? "MARKET_CONFIRMED",
          entryPrice: s.entryPrice ?? marketPrice,
          stopLossPrice: s.stopLossPrice!,
          takeProfit1: s.tp1!,
          takeProfit2: s.tp2 ?? null,
          takeProfit3: s.tp3 ?? null,
          recommendedLeverage: s.recommendedLeverage,
          masterLotsOrQty: Number(baseQty.toFixed(4)),
          ictSetup: s.liquiditySweepDetected ? "ICT Sweep + L2 DOM + OTE" : "SMC Order Flow + FVG/BPR",
          regimeState: s.volatilityRegime ?? "TRENDING",
          liquiditySweepDetected: Boolean(s.liquiditySweepDetected),
          summaryVi: s.evidence?.[0] ?? `${s.pair} ${s.direction} hội tụ 7-Gate Quant`,
          updatedAt: s.updatedAt,
        });
      }
    }

    // 1) Always augment with SSOT 7-Gate Precision setups on remaining core pairs (skip Forex on Sat/Sun GMT+7 Timeline)
    const needCrypto = Math.max(2, 5 - seenCrypto.size);
    const needForex = timeline.forexBotActive ? Math.max(2, 5 - seenForex.size) : 0;
    const precisionSetups = await scanLivePrecisionSetups({
      existingCryptoSymbols: seenCrypto,
      existingForexSymbols: seenForex,
      needCryptoCount: needCrypto,
      needForexCount: needForex,
    });
    for (const ps of precisionSetups) {
      signalsToDispatch.push({ signal: ps.signal, marketPrice: ps.marketPrice });
      quantFeedItems.push(ps.feedItem);
    }

    // Sort signals & quant feed by highest winrateScore & expectancyR first
    signalsToDispatch.sort(
      (a, b) =>
        (b.signal.winrateScore ?? 0) - (a.signal.winrateScore ?? 0) ||
        (b.signal.expectancyR ?? 0) - (a.signal.expectancyR ?? 0),
    );
    quantFeedItems.sort((a, b) => b.winrateScore - a.winrateScore || b.expectancyR - a.expectancyR);
    STATE.lastQuantFeed = quantFeedItems.slice(0, 12);

    // 2) Evaluate Auto TP1, Auto SL, Dynamic Trailing Stop & Signal Reversal on all open positions
    const exitStats = await evaluateRealtimePositionExits({ reversals });

    if (autoEnabled.length === 0) {
      STATE.lastTickAt = Date.now();
      STATE.lastScannedSignalsCount = signalsToDispatch.length;
      STATE.lastScanStatus = `Đã phân tích ${signalsToDispatch.length} kèo Quant — bật AUTO ON trên tài khoản để vào lệnh tự động`;
      eventBus.emit("bot:telemetry", { type: "worker_idle", ts: STATE.lastTickAt });
      return {
        dispatched: 0,
        closedPositions: exitStats.closedCount,
        trailedPositions: exitStats.trailedCount,
        scannedAt: STATE.lastTickAt,
        activeAutoAccounts: 0,
      };
    }

    let dispatched = 0;
    for (const item of signalsToDispatch) {
      const orders = await dispatchSignalWithVault({
        signal: item.signal,
        currentMarketPrice: item.marketPrice,
        manualOverride: false,
      });
      dispatched += orders.filter(
        (o) => o.status === "FILLED" || o.status === "FILLED_PAPER" || o.status === "PENDING_EA",
      ).length;
    }

    STATE.lastTickAt = Date.now();
    STATE.lastDispatchedCount = dispatched;
    STATE.lastScannedSignalsCount = signalsToDispatch.length;

    const actionParts: string[] = [
      timeline.isVnWeekend
        ? `[${timeline.vnDayLabelVi} GMT+7: Bot Forex tạm nghỉ · Chỉ chạy Crypto]`
        : `[${timeline.vnDayLabelVi} GMT+7: Crypto + Forex Active]`,
      `Quét ${signalsToDispatch.length} tín hiệu Quant`,
    ];
    if (dispatched > 0) actionParts.push(`vào mới ${dispatched} lệnh`);
    if (exitStats.closedCount > 0) actionParts.push(`auto-chốt ${exitStats.closedCount} vị thế`);
    if (exitStats.trailedCount > 0) actionParts.push(`dịch Trailing SL ${exitStats.trailedCount} lệnh`);
    actionParts.push(`trên ${activeAutoAccounts} bot AUTO`);

    STATE.lastScanStatus = actionParts.join(" · ");

    if (dispatched > 0) {
      recordBotActivity({
        level: "ok",
        category: "WORKER",
        message: `Vòng quét Real-Time 10s: Đẩy tự động ${dispatched} lệnh mới từ ${signalsToDispatch.length} kèo Quant hội tụ.`,
      });
    }

    eventBus.emit("bot:telemetry", {
      type: "worker_tick",
      ts: STATE.lastTickAt,
      dispatched,
      scanned: signalsToDispatch.length,
    });
    return {
      dispatched,
      closedPositions: exitStats.closedCount,
      trailedPositions: exitStats.trailedCount,
      scannedAt: STATE.lastTickAt,
      activeAutoAccounts,
    };
  } catch (err) {
    STATE.lastScanStatus = `Lỗi quét: ${err instanceof Error ? err.message : String(err)}`;
    console.warn("[AutoTradeWorker] Tick error:", err instanceof Error ? err.message : String(err));
    return {
      dispatched: 0,
      closedPositions: 0,
      trailedPositions: 0,
      scannedAt: Date.now(),
      activeAutoAccounts,
    };
  } finally {
    STATE.isTickRunning = false;
  }
}

let microBreakoutDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function triggerImmediateAutoTradeScan(): void {
  if (IS_TEST_RUNNER || STATE.isTickRunning) return;
  if (microBreakoutDebounceTimer) return;
  microBreakoutDebounceTimer = setTimeout(() => {
    microBreakoutDebounceTimer = null;
    void runAutoTradeTick();
  }, 1_500);
  microBreakoutDebounceTimer.unref?.();
}

export function initAutoTradeWorker(): void {
  STATE.latestTickFn = runAutoTradeTick;
  if (IS_TEST_RUNNER) return;
  if (STATE.started && STATE.timer) return;
  STATE.started = true;
  ensureBinanceWsStarted();
  ensureBiquoteCoreWatch();

  eventBus.on("quant:micro-breakout", () => {
    triggerImmediateAutoTradeScan();
  });

  // Trigger initial real-time quant scan immediately on startup
  const bootTimer = setTimeout(() => {
    void (STATE.latestTickFn ?? runAutoTradeTick)();
  }, 300);
  bootTimer.unref?.();

  STATE.timer = setInterval(() => {
    void (STATE.latestTickFn ?? runAutoTradeTick)();
  }, POLL_INTERVAL_MS);
  STATE.timer.unref?.();
}

STATE.latestTickFn = runAutoTradeTick;

export function getAutoTradeWorkerStatus() {
  return {
    started: STATE.started,
    isTickRunning: STATE.isTickRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastTickAt: STATE.lastTickAt,
    lastDispatchedCount: STATE.lastDispatchedCount,
    lastScannedSignalsCount: STATE.lastScannedSignalsCount,
    lastScanStatus: STATE.lastScanStatus,
    quantFeed: STATE.lastQuantFeed,
  };
}
