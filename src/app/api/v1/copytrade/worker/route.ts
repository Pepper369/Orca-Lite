import { fail, ok } from "@/lib/envelope";
import { getAutoTradeWorkerStatus, runAutoTradeTick } from "@/lib/services/auto-trade-worker";
import { listBotExecutionOrders } from "@/lib/services/broker-vault-store";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { cronUnauthorized } from "@/lib/cron-auth";
import { safeInternalErrorMessage } from "@/app/api/_security";

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

  const session = await getSessionUser(req);
  if (process.env.NODE_ENV === "production" && !session && cronUnauthorized(req) !== null) {
    return fail("UNAUTHENTICATED", "Đăng nhập hoặc cung cấp CRON_SECRET để kích hoạt worker", 401);
  }

  try {
    const tick = await runAutoTradeTick();
    const recentLogs = await listBotExecutionOrders(50, session?.id ?? null);
    return ok({
      tick,
      worker: getAutoTradeWorkerStatus(),
      executionLogs: recentLogs,
    });
  } catch (err) {
    return fail("WORKER_ERROR", safeInternalErrorMessage(err, "Không thể chạy vòng quét Auto-Trade"), 500);
  }
}
