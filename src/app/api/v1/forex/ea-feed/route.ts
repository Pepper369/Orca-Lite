import { NextResponse } from "next/server";
import { getForexSignalsHub } from "@/lib/services/forex-signals-hub";
import { buildMt5EaOrder } from "@/lib/services/forex-webhook-dispatcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * METATRADER 4 / METATRADER 5 EA FEED
 * Polling endpoint for Expert Advisors (EAs) via WebRequest.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const magic = Number(searchParams.get("magic")) || 888369;

    const hub = await getForexSignalsHub();
    const signals = hub?.data?.signals ?? [];

    const activeTrades = signals
      .filter((s) => s.action !== "WAIT" && s.probability >= 60)
      .map((s) => buildMt5EaOrder(s, magic));

    return NextResponse.json(
      {
        status: "OK",
        serverTime: Date.now(),
        count: activeTrades.length,
        orders: activeTrades,
      },
      {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "EA Feed error";
    return NextResponse.json({ status: "ERROR", message }, { status: 500 });
  }
}

