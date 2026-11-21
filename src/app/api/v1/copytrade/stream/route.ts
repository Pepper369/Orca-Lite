import { getSessionUser } from "@/lib/auth";
import { eventBus } from "@/lib/events";
import {
  BOT_TELEMETRY_CHANNEL,
  buildBotLiveTelemetrySnapshot,
} from "@/lib/services/bot-live-telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * REAL-TIME AUTO-TRADE BOT TELEMETRY & PER-ACCOUNT PNL STREAM (SSE).
 * Pushes live equity, unrealized PnL, ROI %, open positions & worker events every 2.5s
 * plus immediate push on any execution, worker tick, account toggle, or position close.
 */
export async function GET(req: Request) {
  const session = await getSessionUser(req);
  const userId = session?.id ?? null;
  const encoder = new TextEncoder();

  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let offBus: (() => void) | null = null;
  let inflight = false;
  let pendingPush = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const sendEvent = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const pushSnapshot = async () => {
        if (closed) return;
        if (inflight) {
          pendingPush = true;
          return;
        }
        inflight = true;
        try {
          const snapshot = await buildBotLiveTelemetrySnapshot(userId);
          sendEvent("telemetry", snapshot);
        } catch (err) {
          sendEvent("error", {
            message: err instanceof Error ? err.message : "Telemetry sync error",
            ts: Date.now(),
          });
        } finally {
          inflight = false;
          if (pendingPush && !closed) {
            pendingPush = false;
            void pushSnapshot();
          }
        }
      };

      // Initial immediate snapshot
      void pushSnapshot();

      // Instant push on any bot execution / worker / account event
      offBus = eventBus.on(BOT_TELEMETRY_CHANNEL, () => {
        void pushSnapshot();
      });

      // Periodic 2.5s mark-to-market live PnL heartbeat
      timer = setInterval(() => {
        void pushSnapshot();
      }, 2_500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        offBus?.();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      offBus?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
