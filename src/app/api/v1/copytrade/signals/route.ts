import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { getMasterTraderPerformance } from "@/lib/engines/copy-trade-engine";
import { dispatchSignalWithVault, type DispatchableSignalInput } from "@/lib/services/auto-trade-dispatcher";
import { listBotExecutionOrders } from "@/lib/services/broker-vault-store";
import { getCryptoSignalsHubData } from "@/lib/services/crypto-signals-hub";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [fxRes, crRes, logs] = await Promise.allSettled([
      getForexSignalsHubData(),
      getCryptoSignalsHubData(),
      listBotExecutionOrders(50),
    ]);

    const copyableSignals: Array<{
      id: string;
      symbol: string;
      assetType: "FOREX" | "CRYPTO";
      direction: "BUY" | "SELL";
      entryPrice: number;
      stopLossPrice: number;
      tp1: number;
      tp2: number | null;
      tp3: number | null;
      winrateScore: number;
      setupGrade: string | null;
      expectancyR: number | null;
      recommendedLeverage: number;
      status: string;
      recommendedLotsOrMargin: string;
      masterLotsOrQty: number;
      updatedAt: number;
    }> = [];

    if (fxRes.status === "fulfilled") {
      for (const s of fxRes.value.data.signals) {
        if (
          s.status === "ACTIVE" &&
          (s.direction === "BUY" || s.direction === "SELL") &&
          s.entryPrice &&
          s.stopLossPrice &&
          s.tp1
        ) {
          copyableSignals.push({
            id: `fx_${s.pair}_${s.direction}`,
            symbol: s.pair,
            assetType: "FOREX",
            direction: s.direction,
            entryPrice: s.entryPrice,
            stopLossPrice: s.stopLossPrice,
            tp1: s.tp1,
            tp2: s.tp2,
            tp3: s.tp3,
            winrateScore: s.winrateScore ?? s.probability,
            setupGrade: s.setupGrade ?? null,
            expectancyR: s.expectancyR ?? null,
            recommendedLeverage: 1,
            status: s.status,
            recommendedLotsOrMargin: `${s.recommendedLots} Lots`,
            masterLotsOrQty: Math.max(0.01, s.recommendedLots || 0.25),
            updatedAt: s.updatedAt,
          });
        }
      }
    }

    if (crRes.status === "fulfilled") {
      for (const s of crRes.value.data.signals) {
        if (
          s.status === "ACTIVE" &&
          (s.direction === "BUY" || s.direction === "SELL") &&
          s.entryPrice &&
          s.stopLossPrice &&
          s.tp1 &&
          !s.circuitBreakerLockout
        ) {
          const baseQty =
            s.entryPrice > 0
              ? Math.max(0.001, (s.recommendedMarginUsd * Math.max(1, s.recommendedLeverage)) / s.entryPrice)
              : 0.05;
          copyableSignals.push({
            id: `cr_${s.pair}_${s.direction}`,
            symbol: s.pair,
            assetType: "CRYPTO",
            direction: s.direction,
            entryPrice: s.entryPrice,
            stopLossPrice: s.stopLossPrice,
            tp1: s.tp1,
            tp2: s.tp2,
            tp3: s.tp3,
            winrateScore: s.winrateScore ?? s.probability,
            setupGrade: s.setupGrade ?? null,
            expectancyR: s.expectancyR ?? null,
            recommendedLeverage: s.recommendedLeverage,
            status: s.status,
            recommendedLotsOrMargin: `$${s.recommendedMarginUsd} (${s.recommendedLeverage}x)`,
            masterLotsOrQty: Number(baseQty.toFixed(4)),
            updatedAt: s.updatedAt,
          });
        }
      }
    }

    copyableSignals.sort((a, b) => b.winrateScore - a.winrateScore);

    return ok(
      {
        signals: copyableSignals,
        executionLogs: logs.status === "fulfilled" ? logs.value : [],
        performance: getMasterTraderPerformance(),
      },
      undefined,
      { "Cache-Control": "no-store" },
    );
  } catch (err) {
    return fail("COPYTRADE_ERROR", err instanceof Error ? err.message : "Failed to fetch copytrade signals", 500);
  }
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-dispatch-post",
    binding: "RL_AUTH",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const body = (await req.json()) as {
      signal?: DispatchableSignalInput;
      currentMarketPrice?: number;
      manualOverride?: boolean;
      targetFollowerIds?: string[];
      targetEnvironment?: "REAL" | "DEMO" | "ALL";
    };

    if (!body.signal || !body.signal.symbol || !body.signal.entryPrice || !body.signal.stopLossPrice || !body.signal.takeProfit1) {
      return badRequest("Dữ liệu tín hiệu Master thiếu entryPrice, stopLossPrice hoặc takeProfit1");
    }

    const targetEnvironment =
      body.targetEnvironment === "REAL" || body.targetEnvironment === "DEMO" || body.targetEnvironment === "ALL"
        ? body.targetEnvironment
        : "ALL";

    const orders = await dispatchSignalWithVault({
      signal: body.signal,
      currentMarketPrice: body.currentMarketPrice,
      manualOverride: body.manualOverride ?? true,
      userId: session?.id ?? null,
      targetFollowerIds: body.targetFollowerIds,
      targetEnvironment,
    });

    const recentLogs = await listBotExecutionOrders(50);

    return ok({
      dispatchedOrders: orders,
      executionLogs: recentLogs,
      filledCount: orders.filter((o) => o.status === "FILLED" || o.status === "FILLED_PAPER").length,
      pendingEaCount: orders.filter((o) => o.status === "PENDING_EA").length,
      rejectedCount: orders.filter((o) => o.status !== "FILLED" && o.status !== "FILLED_PAPER" && o.status !== "PENDING_EA").length,
    });
  } catch (err) {
    return fail("DISPATCH_ERROR", err instanceof Error ? err.message : "Lỗi đẩy lệnh Copy Trade", 500);
  }
}
