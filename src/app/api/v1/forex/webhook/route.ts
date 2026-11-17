import { ok, badRequest } from "@/lib/envelope";
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
  try {
    const body = (await req.json()) as { targetUrl?: string; pair?: string; type?: "telegram" | "mt5" };
    const pair = (body.pair ?? "EURUSD").toUpperCase().replace("/", "");

    const hub = await getForexSignalsHub();
    const signal = hub?.data?.signals.find((s) => s.pair === pair) ?? hub?.data?.signals[0];

    if (!signal) {
      return badRequest(`Không tìm thấy tín hiệu cho cặp ${pair}`);
    }

    const telegramText = buildTelegramAlertMessage(signal);
    const mt5Payload = buildMt5EaOrder(signal);

    // If targetUrl provided, execute real dispatch
    if (body.targetUrl) {
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
