import { ok, badRequest } from "@/lib/envelope";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";
import { getCryptoSignalsHubData } from "@/lib/services/crypto-signals-hub";
import {
  dispatchSignalToFollowers,
  getCopyExecutionLogs,
  type MasterTradeSignal,
} from "@/lib/engines/copy-trade-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [forexHub, cryptoHub] = await Promise.all([
    getForexSignalsHubData().catch(() => null),
    getCryptoSignalsHubData().catch(() => null),
  ]);

  const copyableForex = (forexHub?.data?.signals ?? [])
    .filter((s) => s.action !== "WAIT" && !s.newsLockout)
    .map((s) => ({
      id: `sig-fx-${s.pair}`,
      symbol: s.symbol,
      pair: s.pair,
      assetType: "FOREX" as const,
      direction: s.direction as "BUY" | "SELL",
      entryPrice: s.entryPrice ?? s.lastPrice,
      stopLossPrice: s.stopLossPrice ?? s.lastPrice,
      takeProfit1: s.tp1 ?? s.lastPrice,
      takeProfit2: s.tp2 ?? s.lastPrice,
      takeProfit3: s.tp3 ?? s.lastPrice,
      recommendedLots: s.recommendedLots,
      winrateScore: s.winrateScore ?? s.probability,
      isHighWinrateVerified: s.isHighWinrateVerified ?? false,
      liquiditySweep: s.liquiditySweepDetected ?? false,
      evidence: s.evidence,
    }));

  const copyableCrypto = (cryptoHub?.data?.signals ?? [])
    .filter((s) => s.action !== "WAIT" && !s.circuitBreakerLockout)
    .map((s) => ({
      id: `sig-cr-${s.pair}`,
      symbol: s.symbol,
      pair: s.pair,
      assetType: "CRYPTO" as const,
      direction: s.direction as "BUY" | "SELL",
      entryPrice: s.entryPrice ?? s.lastPrice,
      stopLossPrice: s.stopLossPrice ?? s.lastPrice,
      takeProfit1: s.tp1 ?? s.lastPrice,
      takeProfit2: s.tp2 ?? s.lastPrice,
      takeProfit3: s.tp3 ?? s.lastPrice,
      recommendedLeverage: s.recommendedLeverage,
      recommendedMarginUsd: s.recommendedMarginUsd,
      winrateScore: s.winrateScore ?? s.probability,
      isHighWinrateVerified: s.isHighWinrateVerified ?? false,
      liquiditySweep: s.liquiditySweepDetected ?? false,
      evidence: s.evidence,
    }));

  const logs = getCopyExecutionLogs();

  return ok({
    availableSignals: [...copyableForex, ...copyableCrypto],
    executionLogs: logs,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const signal: MasterTradeSignal = body.signal;
    const currentPrice = body.currentMarketPrice;

    if (!signal || !signal.symbol || !signal.entryPrice || !signal.direction) {
      return badRequest("Thiếu thông tin MasterTradeSignal hợp lệ.");
    }

    const executedOrders = dispatchSignalToFollowers(signal, currentPrice);

    return ok({
      dispatchedCount: executedOrders.length,
      orders: executedOrders,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lỗi khi phân phối tín hiệu Copy Trade";
    return badRequest(msg);
  }
}
