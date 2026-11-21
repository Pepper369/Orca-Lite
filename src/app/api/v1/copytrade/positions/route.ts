import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { closeTrackedBotPosition } from "@/lib/services/bot-live-telemetry";
import { rateLimit } from "@/lib/rate-limit";

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
    const body = (await req.json()) as { action?: string; orderId?: string };
    if (body.action !== "close" || !body.orderId?.trim()) {
      return badRequest("Cần cung cấp action='close' và orderId vị thế cần chốt");
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
      err instanceof Error ? err.message : "Lỗi khi đóng vị thế",
      500,
    );
  }
}
