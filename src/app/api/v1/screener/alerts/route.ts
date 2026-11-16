import { ok, badRequest } from "@/lib/envelope";
import { getHot } from "@/lib/hot-snapshot";
import {
  runScreenerAlertMonitor,
  ALERT_MONITORED_PRESETS,
} from "@/lib/services/screener-alert-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const prevEntry = await getHot("screener-alerts-prev");
    return ok({
      monitoredPresets: ALERT_MONITORED_PRESETS,
      prevSnapshotMeta: prevEntry?.meta ?? null,
      prevSnapshotTimestamp: prevEntry?.ageMs != null ? Date.now() - prevEntry.ageMs : null,
      cachedTriggersByPreset: (prevEntry?.data as Record<string, string[]>) ?? {},
    });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Lỗi lấy thông tin alert screener");
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { forceDispatch, webhookUrl, provider, secret } = body;

    const result = await runScreenerAlertMonitor({
      forceDispatch: Boolean(forceDispatch),
      webhookUrl: typeof webhookUrl === "string" ? webhookUrl.trim() : undefined,
      provider: provider === "telegram" ? "telegram" : "discord",
      secret: typeof secret === "string" ? secret.trim() : undefined,
    });

    return ok(result);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Lỗi thực thi alert monitor screener");
  }
}
