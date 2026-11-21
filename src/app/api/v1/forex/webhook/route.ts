import { ok, badRequest, fail } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import { cronUnauthorized } from "@/lib/cron-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getForexSignalsHub } from "@/lib/services/forex-signals-hub";
import {
  buildTelegramAlertMessage,
  buildMt5EaOrder,
  dispatchForexWebhook,
} from "@/lib/services/forex-webhook-dispatcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * FOREX WEBHOOK DISPATCH & PREVIEW API
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "forex_webhook", binding: "RL_AUTH", limit: 15, windowSec: 60 });
  if (limited) return limited;

  try {
    const body = (await req.json()) as { targetUrl?: string; pair?: string; type?: "telegram" | "mt5" };
    const pair = (typeof body.pair === "string" ? body.pair : "EURUSD").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "EURUSD";

    const hub = await getForexSignalsHub();
    const signal = hub?.data?.signals.find((s) => s.pair === pair) ?? hub?.data?.signals[0];

    if (!signal) {
      return badRequest(`Không tìm thấy tín hiệu cho cặp ${pair}`);
    }

    const telegramText = buildTelegramAlertMessage(signal);
    const mt5Payload = buildMt5EaOrder(signal);

    // If targetUrl provided, require auth in production before dispatching
    if (body.targetUrl) {
      if (process.env.NODE_ENV === "production") {
        const session = await getSessionUser(req);
        if (!session && cronUnauthorized(req) !== null) {
          return fail("UNAUTHENTICATED", "Đăng nhập hoặc cung cấp CRON_SECRET để gửi webhook", 401);
        }
      }
      const payloadToSend =
        body.type === "telegram"
          ? { text: telegramText, parse_mode: "Markdown" }
          : { ...mt5Payload };

      const dispatchRes = await dispatchForexWebhook(body.targetUrl, payloadToSend);
      return ok({
        dispatched: true,
        result: dispatchRes,
        preview: { telegramText, mt5Payload },
      });
    }

    // Otherwise return preview
    return ok({
      dispatched: false,
      preview: { telegramText, mt5Payload },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi khi xử lý webhook";
    return badRequest(message);
  }
}

