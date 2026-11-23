import { fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { buildBotLiveTelemetrySnapshot } from "@/lib/services/bot-live-telemetry";
import { safeInternalErrorMessage } from "@/app/api/_security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-telemetry-get",
    binding: "RL_AUTH",
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    if (!session && process.env.NODE_ENV === "production") {
      return fail("UNAUTHENTICATED", "Đăng nhập để xem dữ liệu Bot Live Telemetry", 401);
    }
    const snapshot = await buildBotLiveTelemetrySnapshot(session?.id ?? null);
    return ok(snapshot, undefined, { "Cache-Control": "no-store" });
  } catch (err) {
    return fail(
      "TELEMETRY_ERROR",
      safeInternalErrorMessage(err, "Không thể tải dữ liệu Bot Live Telemetry"),
      500,
    );
  }
}
