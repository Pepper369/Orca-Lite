import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import {
  closeTrackedBotPosition,
  resetDemoAccountsAndRestartTrading,
} from "@/lib/services/bot-live-telemetry";
import { rateLimit } from "@/lib/rate-limit";
import { safeInternalErrorMessage } from "@/app/api/_security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-positions-close",
    binding: "RL_AUTH",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    if (!session && process.env.NODE_ENV === "production") {
      return fail("UNAUTHENTICATED", "Đăng nhập để quản lý vị thế bot", 401);
    }
    const body = (await req.json()) as {
      action?: string;
      orderId?: string;
      initialBalanceUsd?: number;
    };

    if (body.action === "reset_demo") {
      const resetRes = await resetDemoAccountsAndRestartTrading(
        session?.id ?? null,
        body.initialBalanceUsd ?? 10_000,
      );
      return ok(resetRes);
    }

    if (body.action !== "close" || !body.orderId?.trim()) {
      return badRequest("Cần cung cấp action='close' (kèm orderId) hoặc action='reset_demo'");
    }

    const res = await closeTrackedBotPosition({
      orderId: body.orderId.trim(),
      userId: session?.id ?? null,
    });
    if (!res.ok) {
      return fail("CLOSE_FAILED", res.message, 404);
    }
    return ok(res);
  } catch (err) {
    return fail(
      "CLOSE_ERROR",
      safeInternalErrorMessage(err, "Lỗi khi đóng vị thế"),
      500,
    );
  }
}
