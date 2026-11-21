import "server-only";
import { listBrokerConnections } from "@/lib/services/broker-vault-store";
import { dispatchSignalWithVault, type DispatchableSignalInput } from "@/lib/services/auto-trade-dispatcher";
import { getCryptoSignalsHubData } from "@/lib/services/crypto-signals-hub";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";
import { eventBus } from "@/lib/events";

const POLL_INTERVAL_MS = 45_000;

let workerStarted = false;
let isTickRunning = false;
let lastTickAt: number | null = null;
let lastDispatchedCount = 0;
let lastScannedSignalsCount = 0;
let lastScanStatus = "Khởi tạo — chờ bật tài khoản AUTO ON";

function isHighGrade(grade?: string, winrateScore?: number): boolean {
  if (grade) return grade === "A+" || grade === "A";
  return (winrateScore ?? 0) >= 75;
}

export async function runAutoTradeTick(): Promise<{
  dispatched: number;
  scannedAt: number;
  activeAutoAccounts: number;
}> {
  if (isTickRunning) {
    return { dispatched: lastDispatchedCount, scannedAt: lastTickAt ?? Date.now(), activeAutoAccounts: 0 };
  }
  isTickRunning = true;
  let activeAutoAccounts = 0;

  try {
    const accounts = await listBrokerConnections();
    const autoEnabled = accounts.filter(
      (a) => a.isActive && a.autoExecuteEnabled && !a.killSwitched,
    );
    activeAutoAccounts = autoEnabled.length;
    if (autoEnabled.length === 0) {
      lastTickAt = Date.now();
      lastScannedSignalsCount = 0;
      lastScanStatus = "Đang chờ — chưa có tài khoản bật AUTO ON";
      eventBus.emit("bot:telemetry", { type: "worker_idle", ts: lastTickAt });
      return { dispatched: 0, scannedAt: lastTickAt, activeAutoAccounts: 0 };
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
      dispatched += orders.filter(
        (o) => o.status === "FILLED" || o.status === "FILLED_PAPER" || o.status === "PENDING_EA",
      ).length;
    }

    lastTickAt = Date.now();
    lastDispatchedCount = dispatched;
    lastScannedSignalsCount = signalsToDispatch.length;
    lastScanStatus =
      signalsToDispatch.length > 0
        ? `Quét xong ${signalsToDispatch.length} kèo A+/A · Khớp/Đẩy ${dispatched} lệnh trên ${activeAutoAccounts} bot`
        : `Đã quét FX & Crypto Hub (${activeAutoAccounts} bot sẵn sàng, chưa có kèo A+/A mới)`;
    eventBus.emit("bot:telemetry", {
      type: "worker_tick",
      ts: lastTickAt,
      dispatched,
      scanned: signalsToDispatch.length,
    });
    return { dispatched, scannedAt: lastTickAt, activeAutoAccounts };
  } catch (err) {
    lastScanStatus = `Lỗi quét: ${err instanceof Error ? err.message : String(err)}`;
    console.warn("[AutoTradeWorker] Tick error:", err instanceof Error ? err.message : String(err));
    return { dispatched: 0, scannedAt: Date.now(), activeAutoAccounts };
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
    lastScannedSignalsCount,
    lastScanStatus,
  };
}
