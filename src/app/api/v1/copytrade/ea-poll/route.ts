import { ok } from "@/lib/envelope";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * LIGHTWEIGHT POLLING ROUTE FOR METATRADER 5 EA (OrcaCopyTradeSlave.mq5)
 */
export async function GET() {
  try {
    const hub = await getForexSignalsHubData();
    const activeSignals = (hub?.data?.signals ?? []).filter(
      (s) => s.action !== "WAIT" && !s.newsLockout && s.entryPrice && s.stopLossPrice
    );

    const topPick = activeSignals[0] ?? null;

    if (!topPick) {
      return ok({
        hasSignal: false,
        timestamp: Date.now(),
      });
    }

    return ok({
      hasSignal: true,
      ticketId: `sig-${topPick.pair}-${Math.floor(Date.now() / 60000)}`,
      symbol: topPick.pair,
      direction: topPick.direction,
      entry: topPick.entryPrice,
      stopLoss: topPick.stopLossPrice,
      takeProfit1: topPick.tp1,
      takeProfit2: topPick.tp2,
      recommendedLots: topPick.recommendedLots,
      winrateScore: topPick.winrateScore ?? topPick.probability,
      isHighWinrateVerified: topPick.isHighWinrateVerified ?? false,
      timestamp: Date.now(),
    });
  } catch {
    return ok({
      hasSignal: false,
      timestamp: Date.now(),
    });
  }
}
