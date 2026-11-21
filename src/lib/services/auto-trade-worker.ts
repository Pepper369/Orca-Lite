import "server-only";
import { getAssetPipSize, resampleOhlcvBars, roundPrice } from "@/lib/engines/asset-precision";
import { analyzeFundingRate, evaluateTrueLevel2Dom } from "@/lib/engines/crypto-derivatives-engine";
import { evaluateCryptoShield } from "@/lib/engines/crypto-news-shield";
import { calculateCurrencyStrengthMatrix, type PairPriceInput } from "@/lib/engines/forex-currency-strength";
import { evaluateNewsCircuitBreaker } from "@/lib/engines/forex-news-shield";
import { generateDeepFlowSignal } from "@/lib/engines/forex-order-flow-pro";
import {
  evaluatePrecisionTradeSetup,
  type SetupGrade,
} from "@/lib/engines/fx-crypto-precision-engine";
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
] as const;

const CORE_REALTIME_FOREX_PAIRS = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCAD",
  "AUDUSD",
] as const;

interface WorkerGlobalState {
  started: boolean;
  isTickRunning: boolean;
  lastTickAt: number | null;
  lastDispatchedCount: number;
  lastScannedSignalsCount: number;
  lastScanStatus: string;
  timer: ReturnType<typeof setInterval> | null;
}

const g = globalThis as typeof globalThis & {
  __orcaAutoTradeWorkerState?: WorkerGlobalState;
};

const STATE: WorkerGlobalState =
  g.__orcaAutoTradeWorkerState ??
  (g.__orcaAutoTradeWorkerState = {
    started: false,
    isTickRunning: false,
    lastTickAt: null,
    lastDispatchedCount: 0,
    lastScannedSignalsCount: 0,
    lastScanStatus: "Khởi tạo Real-Time Quant Engine (chu kỳ 10s)...",
    timer: null,
  });

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
}): Promise<Array<{ signal: DispatchableSignalInput; marketPrice: number }>> {
  const out: Array<{ signal: DispatchableSignalInput; marketPrice: number }> = [];
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
          const bestBid = book.bids[0]?.price ?? 0;
          const bestAsk = book.asks[0]?.price ?? 0;
          const liveSpreadPct =
            bestBid > 0 && bestAsk >= bestBid ? (bestAsk - bestBid) / ((bestAsk + bestBid) / 2) : null;
          const bars1h = resampleOhlcvBars(htfBars, 4);
          const fundingRate = funding?.fundingRate ?? null;
          const oiUsd = oi.openInterest > 0 ? oi.openInterest * livePrice : 0;
          const prelimAtr = calcAtr(execBars, 14) ?? livePrice * 0.012;
          const liqClusters =
            oiUsd > 0
              ? detectCryptoLiquidationClusters(livePrice, oiUsd, prelimAtr, {
                  symbol: pair,
                  fundingRate,
                  priceChange24hPct: Number(spot?.priceChangePercent) || null,
                  orderBookImbalance: dom.imbalanceRatio,
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
            orderBookImbalance: dom.imbalanceRatio,
            fundingRate,
            liquidationClusterAligned,
            externalMagnets,
            isNewsOrCascadeLockout: shield.isLockout,
            lockoutReason: shield.warningMessage,
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

          return {
            signal: {
              id: `rt_cr_${pair}_${precision.direction}_${bucket5m}`,
              symbol: pair,
              assetType: "CRYPTO" as const,
              direction: precision.direction,
              entryPrice: roundPrice(livePrice, pair, "CRYPTO"),
              stopLossPrice: roundPrice(precision.stopLoss, pair, "CRYPTO"),
              takeProfit1: roundPrice(precision.tp1, pair, "CRYPTO"),
              takeProfit2: precision.tp2 != null ? roundPrice(precision.tp2, pair, "CRYPTO") : undefined,
              takeProfit3: precision.tp3 != null ? roundPrice(precision.tp3, pair, "CRYPTO") : undefined,
              masterLotsOrQty: Number(baseQty.toFixed(4)),
              masterCapitalUsd: 10_000,
              winrateScore: precision.precisionScore,
              setupGrade: precision.grade,
              recommendedLeverage,
              timestamp: Date.now(),
            },
            marketPrice: roundPrice(livePrice, pair, "CRYPTO"),
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
          const execBars = intraday15m.length >= 30 ? intraday15m : dailySeries;
          const bqTick = getBiquoteLiveTick(pair, 45_000);
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

          return {
            signal: {
              id: `rt_fx_${pair}_${precision.direction}_${bucket5m}`,
              symbol: pair,
              assetType: "FOREX" as const,
              direction: precision.direction,
              entryPrice,
              stopLossPrice,
              takeProfit1: roundPrice(precision.tp1, pair, "FOREX"),
              takeProfit2: precision.tp2 != null ? roundPrice(precision.tp2, pair, "FOREX") : undefined,
              takeProfit3: precision.tp3 != null ? roundPrice(precision.tp3, pair, "FOREX") : undefined,
              masterLotsOrQty: Math.max(0.01, riskPlan.recommendedLotsOrQty),
              masterCapitalUsd: 10_000,
              winrateScore: precision.precisionScore,
              setupGrade: precision.grade,
              recommendedLeverage: 1,
              timestamp: Date.now(),
            },
            marketPrice: entryPrice,
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
    if (!IS_TEST_RUNNER) {
      ensureBinanceWsStarted();
      ensureBiquoteCoreWatch();
      for (const t of getBiquoteLiveAll()) {
        if (t.price > 0) updateLivePriceReference(t.symbol, t.price);
      }
    }

    const accounts = await listBrokerConnections();
    const autoEnabled = accounts.filter(
      (a) => a.isActive && a.autoExecuteEnabled && !a.killSwitched,
    );
    activeAutoAccounts = autoEnabled.length;

    const [fxRes, crRes] = await Promise.allSettled([
      withTimeout(getForexSignalsHubData(), 4_200, null),
      withTimeout(getCryptoSignalsHubData(), 4_200, null),
    ]);

    const reversals = new Map<string, "BUY" | "SELL">();
    const signalsToDispatch: Array<{ signal: DispatchableSignalInput; marketPrice: number }> = [];
    const seenCrypto = new Set<string>();
    const seenForex = new Set<string>();
    const bucket5m = Math.floor(Date.now() / (5 * 60 * 1000));

    if (fxRes.status === "fulfilled" && fxRes.value) {
      for (const s of fxRes.value.data.signals) {
        if (s.lastPrice > 0) updateLivePriceReference(s.pair, s.lastPrice);
        if ((s.setupGrade === "A+" || s.setupGrade === "A") && (s.direction === "BUY" || s.direction === "SELL")) {
          reversals.set(s.pair.toUpperCase(), s.direction);
        }
      }

      const fxCandidates = fxRes.value.data.signals
        .filter(
          (s) =>
            (s.status === "ACTIVE" || s.status === "AWAITING_BREAKOUT") &&
            (s.direction === "BUY" || s.direction === "SELL") &&
            s.entryPrice != null &&
            s.stopLossPrice != null &&
            s.tp1 != null &&
            !s.newsLockout &&
            isEligibleGrade(s.setupGrade, s.winrateScore ?? s.probability),
        )
        .slice(0, 3);

      for (const s of fxCandidates) {
        seenForex.add(s.pair);
        const liveTick = getBiquoteLiveTick(s.pair, 30_000)?.price;
        const marketPrice = liveTick && liveTick > 0 ? liveTick : s.lastPrice || s.entryPrice!;
        signalsToDispatch.push({
          signal: {
            id: `fx_${s.pair}_${s.direction}_${bucket5m}`,
            symbol: s.pair,
            assetType: "FOREX",
            direction: s.direction as "BUY" | "SELL",
            entryPrice: marketPrice,
            stopLossPrice: s.stopLossPrice!,
            takeProfit1: s.tp1!,
            takeProfit2: s.tp2 ?? undefined,
            takeProfit3: s.tp3 ?? undefined,
            masterLotsOrQty: Math.max(0.01, s.recommendedLots || 0.2),
            masterCapitalUsd: 10_000,
            winrateScore: s.winrateScore ?? s.probability,
            setupGrade: s.setupGrade,
            timestamp: s.updatedAt,
          },
          marketPrice,
        });
      }
    }

    if (crRes.status === "fulfilled" && crRes.value) {
      for (const s of crRes.value.data.signals) {
        if (s.lastPrice > 0) updateLivePriceReference(s.pair, s.lastPrice);
        if ((s.setupGrade === "A+" || s.setupGrade === "A") && (s.direction === "BUY" || s.direction === "SELL")) {
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
        .slice(0, 3);

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
        signalsToDispatch.push({
          signal: {
            id: `cr_${s.pair}_${s.direction}_${bucket5m}`,
            symbol: s.pair,
            assetType: "CRYPTO",
            direction: s.direction as "BUY" | "SELL",
            entryPrice: marketPrice,
            stopLossPrice: s.stopLossPrice!,
            takeProfit1: s.tp1!,
            takeProfit2: s.tp2 ?? undefined,
            takeProfit3: s.tp3 ?? undefined,
            masterLotsOrQty: Number(baseQty.toFixed(4)),
            masterCapitalUsd: 10_000,
            winrateScore: s.winrateScore ?? s.probability,
            setupGrade: s.setupGrade,
            recommendedLeverage: s.recommendedLeverage,
            timestamp: s.updatedAt,
          },
          marketPrice,
        });
      }
    }

    // 1) Evaluate Auto TP1, Auto SL, Dynamic Trailing Stop & Signal Reversal on all open positions
    const exitStats = await evaluateRealtimePositionExits({ reversals });

    if (autoEnabled.length === 0) {
      STATE.lastTickAt = Date.now();
      STATE.lastScannedSignalsCount = signalsToDispatch.length;
      STATE.lastScanStatus = "Đang chờ — chưa có tài khoản bật AUTO ON";
      eventBus.emit("bot:telemetry", { type: "worker_idle", ts: STATE.lastTickAt });
      return {
        dispatched: 0,
        closedPositions: exitStats.closedCount,
        trailedPositions: exitStats.trailedCount,
        scannedAt: STATE.lastTickAt,
        activeAutoAccounts: 0,
      };
    }

    // 2) Augment with SSOT 7-Gate Precision setups on remaining core pairs
    const needCrypto = Math.max(0, 3 - seenCrypto.size);
    const needForex = Math.max(0, 3 - seenForex.size);
    if (needCrypto > 0 || needForex > 0) {
      const precisionSetups = await scanLivePrecisionSetups({
        existingCryptoSymbols: seenCrypto,
        existingForexSymbols: seenForex,
        needCryptoCount: needCrypto,
        needForexCount: needForex,
      });
      signalsToDispatch.push(...precisionSetups);
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

    const actionParts: string[] = [`Quét ${signalsToDispatch.length} tín hiệu Quant Real-Time`];
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

export function initAutoTradeWorker(): void {
  if (IS_TEST_RUNNER) return;
  if (STATE.started && STATE.timer) return;
  STATE.started = true;
  ensureBinanceWsStarted();
  ensureBiquoteCoreWatch();

  // Trigger initial real-time quant scan immediately on startup
  const bootTimer = setTimeout(() => {
    void runAutoTradeTick();
  }, 300);
  bootTimer.unref?.();

  STATE.timer = setInterval(() => {
    void runAutoTradeTick();
  }, POLL_INTERVAL_MS);
  STATE.timer.unref?.();
}

export function getAutoTradeWorkerStatus() {
  return {
    started: STATE.started,
    isTickRunning: STATE.isTickRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastTickAt: STATE.lastTickAt,
    lastDispatchedCount: STATE.lastDispatchedCount,
    lastScannedSignalsCount: STATE.lastScannedSignalsCount,
    lastScanStatus: STATE.lastScanStatus,
  };
}
