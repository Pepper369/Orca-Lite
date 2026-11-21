import { fail, ok } from "@/lib/envelope";
import { getAutoTradeWorkerStatus, runAutoTradeTick } from "@/lib/services/auto-trade-worker";
import { listBotExecutionOrders } from "@/lib/services/broker-vault-store";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(
    {
      worker: getAutoTradeWorkerStatus(),
    },
    undefined,
    { "Cache-Control": "no-store" },
  );
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-worker-trigger",
    binding: "RL_AUTH",
    limit: 15,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const tick = await runAutoTradeTick();
    const recentLogs = await listBotExecutionOrders(50);
    return ok({
      tick,
      worker: getAutoTradeWorkerStatus(),
      executionLogs: recentLogs,
    });
  } catch (err) {
    return fail("WORKER_ERROR", err instanceof Error ? err.message : "Không thể chạy vòng quét Auto-Trade", 500);
  }
}
