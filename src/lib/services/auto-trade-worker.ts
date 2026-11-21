import "server-only";
import {
  computeEfficiencyRatio,
  estimateClvOrderFlowImbalance,
  getAssetPipSize,
  roundPrice,
} from "@/lib/engines/asset-precision";
import type { SetupGrade } from "@/lib/engines/fx-crypto-precision-engine";
import { buildSharedBarContext } from "@/lib/engines/unified-ta-kernel";
import { eventBus } from "@/lib/events";
import * as binance from "@/lib/providers/binance";
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
import { getForexDetail } from "@/lib/services/forex";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";
import type { OhlcvBar } from "@/lib/types";

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
 * Đánh giá nhân quả (Causal Micro-Momentum + CLV Order Flow + ATR Structure) trên chuỗi OHLCV thực
 * kết hợp giá tick WebSocket/Biquote trực tiếp khi khung lớn đang đứng chờ.
 */
function evaluateCausalMicroMomentumBarSeries(params: {
  symbol: string;
  assetType: "CRYPTO" | "FOREX";
  bars: OhlcvBar[];
  livePrice: number;
}): {
  direction: "BUY" | "SELL";
  grade: SetupGrade;
  winrateScore: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1: number;
  takeProfit2: number;
  recommendedLeverage: number;
} | null {
  const { symbol, assetType, bars, livePrice } = params;
  if (!bars || bars.length < 28 || !Number.isFinite(livePrice) || livePrice <= 0) {
    return null;
  }

  const ctx = buildSharedBarContext(bars);
  const n = bars.length;
  const closes = ctx.closes;
  const e9 = ctx.ema9[n - 1] ?? livePrice;
  const e21 = ctx.ema21[n - 1] ?? livePrice;
  const e9Prev = ctx.ema9[n - 2] ?? e9;
  const e21Prev = ctx.ema21[n - 2] ?? e21;
  const rsi14 = ctx.rsi14 ?? 50;
  const macdHist = ctx.macdFull.histogram;
  const histNow = macdHist[n - 1] ?? 0;
  const histPrev = macdHist[n - 2] ?? 0;
  const pip = getAssetPipSize(symbol);
  const atr14 = Math.max(pip * 6, ctx.atr14 || livePrice * (assetType === "CRYPTO" ? 0.0045 : 0.0018));
  const clvOfi = estimateClvOrderFlowImbalance(bars, 10);
  const er10 = computeEfficiencyRatio(closes.slice(-12), 10);

  const lastBar = bars[n - 1]!;
  const prevBar = bars[n - 2]!;
  const barImpulse = (livePrice - lastBar.open) / Math.max(1e-9, atr14);

  // Veto extreme overextension / flash spike
  if (Math.abs(livePrice - e21) > atr14 * 2.6) return null;

  let bullPts = 0;
  let bearPts = 0;

  // 1) EMA9 vs EMA21 structure & slope
  if (e9 > e21) bullPts += 20;
  else if (e9 < e21) bearPts += 20;

  if (e9 > e9Prev && e21 >= e21Prev) bullPts += 10;
  else if (e9 < e9Prev && e21 <= e21Prev) bearPts += 10;

  // 2) Live Price vs EMA9/EMA21 value zone
  if (livePrice >= e9 && livePrice >= e21) bullPts += 12;
  else if (livePrice <= e9 && livePrice <= e21) bearPts += 12;

  // 3) MACD Histogram momentum & acceleration
  if (histNow > 0) bullPts += 12;
  else if (histNow < 0) bearPts += 12;
  if (histNow > histPrev) bullPts += 8;
  else if (histNow < histPrev) bearPts += 8;

  // 4) Causal Order Flow Imbalance (CLV)
  if (clvOfi >= 10) bullPts += 14;
  else if (clvOfi <= -10) bearPts += 14;

  // 5) Live Candle Impulse & Micro Structure Break
  if (barImpulse >= 0.15 || livePrice > prevBar.high) bullPts += 12;
  else if (barImpulse <= -0.15 || livePrice < prevBar.low) bearPts += 12;

  // 6) RSI regime sweet spot (avoid chasing >76 or <24)
  if (rsi14 >= 51 && rsi14 <= 72) bullPts += 10;
  else if (rsi14 <= 49 && rsi14 >= 28) bearPts += 10;
  else if (rsi14 > 76) bearPts += 14;
  else if (rsi14 < 24) bullPts += 14;

  const diff = Math.abs(bullPts - bearPts);
  if (diff < 14) return null;

  const direction: "BUY" | "SELL" = bullPts > bearPts ? "BUY" : "SELL";
  const isBuy = direction === "BUY";
  const rawScore = Math.min(94, Math.round(64 + diff * 0.45 + er10 * 14));
  if (rawScore < 75) return null;

  const grade: SetupGrade = rawScore >= 85 ? "A+" : "A";
  const slDist = Math.max(pip * 8, atr14 * 1.15);
  const tp1Dist = slDist * 1.55;
  const tp2Dist = slDist * 2.35;

  const entryPrice = roundPrice(livePrice, symbol);
  const stopLossPrice = roundPrice(isBuy ? livePrice - slDist : livePrice + slDist, symbol);
  const takeProfit1 = roundPrice(isBuy ? livePrice + tp1Dist : livePrice - tp1Dist, symbol);
  const takeProfit2 = roundPrice(isBuy ? livePrice + tp2Dist : livePrice - tp2Dist, symbol);

  if (stopLossPrice <= 0 || takeProfit1 <= 0 || stopLossPrice === entryPrice) {
    return null;
  }

  return {
    direction,
    grade,
    winrateScore: rawScore,
    entryPrice,
    stopLossPrice,
    takeProfit1,
    takeProfit2,
    recommendedLeverage: assetType === "CRYPTO" ? (symbol === "BTCUSDT" || symbol === "ETHUSDT" ? 5 : 4) : 1,
  };
}

async function scanLiveMicroMomentumSetups(params: {
  existingCryptoSymbols: Set<string>;
  existingForexSymbols: Set<string>;
  needCryptoCount: number;
  needForexCount: number;
}): Promise<Array<{ signal: DispatchableSignalInput; marketPrice: number }>> {
  const out: Array<{ signal: DispatchableSignalInput; marketPrice: number }> = [];
  const bucket5m = Math.floor(Date.now() / (5 * 60 * 1000));

  if (params.needCryptoCount > 0) {
    const candidates = CORE_REALTIME_CRYPTO_PAIRS.filter(
      (p) => !params.existingCryptoSymbols.has(p),
    ).slice(0, params.needCryptoCount + 2);

    const scanned = await Promise.all(
      candidates.map(async (pair) => {
        try {
          const [bars5m, spot] = await Promise.all([
            binance.getKlines(pair, "5m", 64).catch(() => []),
            binance.getSpotTicker(pair).catch(() => null),
          ]);
          const wsMark = binanceWs.getMark(pair, 20_000)?.markPrice ?? binanceWs.getTicker(pair, 20_000)?.price;
          const livePrice =
            wsMark && wsMark > 0
              ? wsMark
              : Number(spot?.lastPrice ?? 0) || (bars5m.length > 0 ? bars5m[bars5m.length - 1]!.close : 0);
          if (livePrice <= 0 || bars5m.length < 28) return null;
          updateLivePriceReference(pair, livePrice);

          const setup = evaluateCausalMicroMomentumBarSeries({
            symbol: pair,
            assetType: "CRYPTO",
            bars: bars5m,
            livePrice,
          });
          if (!setup) return null;

          const baseQty = Number(Math.max(0.001, (220 * setup.recommendedLeverage) / setup.entryPrice).toFixed(4));
          return {
            signal: {
              id: `rt_cr_${pair}_${setup.direction}_${bucket5m}`,
              symbol: pair,
              assetType: "CRYPTO" as const,
              direction: setup.direction,
              entryPrice: setup.entryPrice,
              stopLossPrice: setup.stopLossPrice,
              takeProfit1: setup.takeProfit1,
              takeProfit2: setup.takeProfit2,
              masterLotsOrQty: baseQty,
              masterCapitalUsd: 10_000,
              winrateScore: setup.winrateScore,
              setupGrade: setup.grade,
              recommendedLeverage: setup.recommendedLeverage,
              timestamp: Date.now(),
            },
            marketPrice: setup.entryPrice,
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

    const scannedFx = await Promise.all(
      fxCandidates.map(async (pair) => {
        try {
          const detail = await getForexDetail(pair).catch(() => null);
          const series = detail?.detail?.series ?? [];
          const bqTick = getBiquoteLiveTick(pair, 45_000);
          const livePrice =
            bqTick && bqTick.price > 0
              ? bqTick.price
              : detail?.detail?.price || (series.length > 0 ? series[series.length - 1]!.close : 0);
          if (livePrice <= 0 || series.length < 28) return null;
          updateLivePriceReference(pair, livePrice);

          const setup = evaluateCausalMicroMomentumBarSeries({
            symbol: pair,
            assetType: "FOREX",
            bars: series,
            livePrice,
          });
          if (!setup) return null;

          return {
            signal: {
              id: `rt_fx_${pair}_${setup.direction}_${bucket5m}`,
              symbol: pair,
              assetType: "FOREX" as const,
              direction: setup.direction,
              entryPrice: setup.entryPrice,
              stopLossPrice: setup.stopLossPrice,
              takeProfit1: setup.takeProfit1,
              takeProfit2: setup.takeProfit2,
              masterLotsOrQty: pair === "XAUUSD" ? 0.1 : 0.2,
              masterCapitalUsd: 10_000,
              winrateScore: setup.winrateScore,
              setupGrade: setup.grade,
              recommendedLeverage: 1,
              timestamp: Date.now(),
            },
            marketPrice: setup.entryPrice,
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

    // 2) Augment with Causal Real-Time Micro-Momentum & Order-Flow Setups so the engine trades continuously
    const needCrypto = Math.max(0, 3 - seenCrypto.size);
    const needForex = Math.max(0, 3 - seenForex.size);
    if (needCrypto > 0 || needForex > 0) {
      const microSetups = await scanLiveMicroMomentumSetups({
        existingCryptoSymbols: seenCrypto,
        existingForexSymbols: seenForex,
        needCryptoCount: needCrypto,
        needForexCount: needForex,
      });
      signalsToDispatch.push(...microSetups);
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
