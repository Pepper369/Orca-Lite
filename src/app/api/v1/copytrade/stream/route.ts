import { getSessionUser } from "@/lib/auth";
import { fail } from "@/lib/envelope";
import { eventBus } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import {
  BOT_TELEMETRY_CHANNEL,
  buildBotLiveTelemetrySnapshot,
} from "@/lib/services/bot-live-telemetry";
import { safeInternalErrorMessage } from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * REAL-TIME AUTO-TRADE BOT TELEMETRY & PER-ACCOUNT PNL STREAM (SSE).
 * Pushes live equity, unrealized PnL, ROI %, open positions & worker events every 2.5s
 * plus immediate push on any execution, worker tick, account toggle, or position close.
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-stream-get",
    binding: "RL_AUTH",
    limit: 20,
    windowSec: 60,
  });
  if (limited) return limited;

  const session = await getSessionUser(req);
  if (!session && process.env.NODE_ENV === "production") {
    return fail("UNAUTHENTICATED", "Đăng nhập để kết nối luồng Bot Live Telemetry", 401);
  }
  const userId = session?.id ?? null;
  const encoder = new TextEncoder();

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let offBus: (() => void) | null = null;
  let inflight = false;
  let pendingPush = false;
  let lastPayloadSig = "";
  let lastPushAt = 0;

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

      const scheduleNext = (hasOpenPositions: boolean) => {
        if (closed) return;
        if (timer) clearTimeout(timer);
        // Adaptive cadence: 2.5s when positions are open, 5s when idle
        timer = setTimeout(() => {
          void pushSnapshot(false);
        }, hasOpenPositions ? 2_500 : 5_000);
      };

      const pushSnapshot = async (force = false) => {
        if (closed) return;
        if (inflight) {
          pendingPush = true;
          return;
        }
        inflight = true;
        let hasOpen = false;
        try {
          const snapshot = await buildBotLiveTelemetrySnapshot(userId);
          hasOpen = snapshot.openPositions.length > 0;
          const now = Date.now();
          const sig = `${snapshot.realNav.totalNavUsd}|${snapshot.demoNav.totalNavUsd}|${snapshot.openPositions.length}|${snapshot.openPositions.map((p) => `${p.orderId}:${p.markPrice}:${p.positionStage}`).join(",")}|${snapshot.recentEvents[0]?.id ?? ""}|${snapshot.worker.lastTickAt ?? 0}`;
          // Skip redundant identical frames when idle, while keeping >= 15s keepalive heartbeat
          if (force || sig !== lastPayloadSig || now - lastPushAt >= 15_000) {
            lastPayloadSig = sig;
            lastPushAt = now;
            sendEvent("telemetry", snapshot);
          }
        } catch (err) {
          sendEvent("error", {
            message: safeInternalErrorMessage(err, "Telemetry sync error"),
            ts: Date.now(),
          });
        } finally {
          inflight = false;
          if (pendingPush && !closed) {
            pendingPush = false;
            void pushSnapshot(true);
          } else {
            scheduleNext(hasOpen);
          }
        }
      };

      // Initial immediate snapshot
      void pushSnapshot(true);

      // Instant push on any bot execution / worker / account event
      offBus = eventBus.on(BOT_TELEMETRY_CHANNEL, () => {
        void pushSnapshot(true);
      });

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearTimeout(timer);
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
      if (timer) clearTimeout(timer);
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
