import { fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { buildBotLiveTelemetrySnapshot } from "@/lib/services/bot-live-telemetry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSessionUser(req);
    const snapshot = await buildBotLiveTelemetrySnapshot(session?.id ?? null);
    return ok(snapshot, undefined, { "Cache-Control": "no-store" });
  } catch (err) {
    return fail(
      "TELEMETRY_ERROR",
      err instanceof Error ? err.message : "Không thể tải dữ liệu Bot Live Telemetry",
      500,
    );
  }
}
