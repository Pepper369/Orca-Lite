import "server-only";
import { listBrokerConnections } from "@/lib/services/broker-vault-store";
import { dispatchSignalWithVault, type DispatchableSignalInput } from "@/lib/services/auto-trade-dispatcher";
import { getCryptoSignalsHubData } from "@/lib/services/crypto-signals-hub";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";

const POLL_INTERVAL_MS = 45_000;

let workerStarted = false;
let isTickRunning = false;
let lastTickAt: number | null = null;
let lastDispatchedCount = 0;

function isHighGrade(grade?: string, winrateScore?: number): boolean {
  if (grade) return grade === "A+" || grade === "A";
  return (winrateScore ?? 0) >= 75;
}

async function runAutoTradeTick(): Promise<void> {
  if (isTickRunning) return;
  isTickRunning = true;

  try {
    const accounts = await listBrokerConnections();
    const autoEnabled = accounts.filter(
      (a) => a.isActive && a.autoExecuteEnabled && !a.killSwitched,
    );
    if (autoEnabled.length === 0) {
      lastTickAt = Date.now();
      return;
    }

    const [fxRes, crRes] = await Promise.allSettled([
      getForexSignalsHubData(),
      getCryptoSignalsHubData(),
    ]);

    const signalsToDispatch: Array<{ signal: DispatchableSignalInput; marketPrice: number }> = [];

    if (fxRes.status === "fulfilled") {
      const fxCandidates = fxRes.value.data.signals
        .filter(
          (s) =>
            s.status === "ACTIVE" &&
            (s.direction === "BUY" || s.direction === "SELL") &&
            s.entryPrice != null &&
            s.stopLossPrice != null &&
            s.tp1 != null &&
            isHighGrade(s.setupGrade, s.winrateScore ?? s.probability),
        )
        .slice(0, 2);

      for (const s of fxCandidates) {
        const bucket = Math.floor(s.updatedAt / (15 * 60 * 1000));
        signalsToDispatch.push({
          signal: {
            id: `fx_${s.pair}_${s.direction}_${bucket}`,
            symbol: s.pair,
            assetType: "FOREX",
            direction: s.direction as "BUY" | "SELL",
            entryPrice: s.entryPrice!,
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
          marketPrice: s.lastPrice || s.entryPrice!,
        });
      }
    }

    if (crRes.status === "fulfilled") {
      const crCandidates = crRes.value.data.signals
        .filter(
          (s) =>
            s.status === "ACTIVE" &&
            (s.direction === "BUY" || s.direction === "SELL") &&
            s.entryPrice != null &&
            s.stopLossPrice != null &&
            s.tp1 != null &&
            !s.circuitBreakerLockout &&
            isHighGrade(s.setupGrade, s.winrateScore ?? s.probability),
        )
        .slice(0, 3);

      for (const s of crCandidates) {
        const bucket = Math.floor(s.updatedAt / (15 * 60 * 1000));
        const baseQty =
          s.entryPrice && s.entryPrice > 0
            ? Math.max(0.001, (s.recommendedMarginUsd * Math.max(1, s.recommendedLeverage)) / s.entryPrice)
            : 0.05;
        signalsToDispatch.push({
          signal: {
            id: `cr_${s.pair}_${s.direction}_${bucket}`,
            symbol: s.pair,
            assetType: "CRYPTO",
            direction: s.direction as "BUY" | "SELL",
            entryPrice: s.entryPrice!,
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
          marketPrice: s.lastPrice || s.entryPrice!,
        });
      }
    }

    let dispatched = 0;
    for (const item of signalsToDispatch) {
      const orders = await dispatchSignalWithVault({
        signal: item.signal,
        currentMarketPrice: item.marketPrice,
        manualOverride: false,
      });
      dispatched += orders.filter((o) => o.status === "FILLED" || o.status === "PENDING_EA").length;
    }

    lastTickAt = Date.now();
    lastDispatchedCount = dispatched;
  } catch (err) {
    console.warn("[AutoTradeWorker] Tick error:", err instanceof Error ? err.message : String(err));
  } finally {
    isTickRunning = false;
  }
}

export function initAutoTradeWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  const timer = setInterval(() => {
    void runAutoTradeTick();
  }, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

export function getAutoTradeWorkerStatus() {
  return {
    started: workerStarted,
    isTickRunning,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastTickAt,
    lastDispatchedCount,
  };
}
