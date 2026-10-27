import { NextRequest } from "next/server";
import { badRequest, fail, ok } from "@/lib/envelope";
import { requireInternalSession } from "@/lib/internal-api-auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  initSheetsSchema,
  isSheetsConfigured,
  pullAlerts,
  pullTrades,
  pullWatchlist,
  pushAlerts,
  pushTrades,
  pushWatchlist,
  sheetsStatus,
} from "@/lib/services/sheets-backend";
import type { PortfolioTrade, PortfolioWatchItem } from "@/lib/portfolio";
import type { PriceAlert } from "@/lib/alerts-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const action = new URL(req.url).searchParams.get("action") || "status";

    if (action === "status") {
      return ok(sheetsStatus());
    }

    const limited = await rateLimit(req, { name: "sheets_get", binding: "RL_AUTH", limit: 30, windowSec: 60 });
    if (limited) return limited;

    const authError = await requireInternalSession();
    if (authError) return authError;

    if (!isSheetsConfigured()) {
      return fail(
        "SHEETS_NOT_CONFIGURED",
        "Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_ID",
        503,
      );
    }

    if (action === "init") {
      const r = await initSheetsSchema();
      return ok(r);
    }

    if (action === "pull") {
      const [trades, watchlist, alerts] = await Promise.all([
        pullTrades(),
        pullWatchlist(),
        pullAlerts(),
      ]);
      return ok({ trades, watchlist, alerts, at: new Date().toISOString() });
    }

    return badRequest("action must be status | init | pull");
  } catch (e) {
    return fail("SHEETS_ERROR", e instanceof Error ? e.message : "unknown", 502);
  }
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { name: "sheets_post", binding: "RL_AUTH", limit: 20, windowSec: 60 });
  if (limited) return limited;

  try {
    const authError = await requireInternalSession();
    if (authError) return authError;

    if (!isSheetsConfigured()) {
      return fail("SHEETS_NOT_CONFIGURED", "Google Sheets env missing", 503);
    }
    const body = (await req.json()) as {
      action?: string;
      trades?: PortfolioTrade[];
      watchlist?: PortfolioWatchItem[];
      alerts?: PriceAlert[];
    };
    if ((body.action || "push") !== "push") return badRequest("action must be push");

    if (body.trades) await pushTrades(body.trades);
    if (body.watchlist) await pushWatchlist(body.watchlist);
    if (body.alerts) await pushAlerts(body.alerts);

    return ok({
      pushed: {
        trades: body.trades?.length ?? 0,
        watchlist: body.watchlist?.length ?? 0,
        alerts: body.alerts?.length ?? 0,
      },
    });
  } catch (e) {
    return fail("SHEETS_PUSH_FAILED", e instanceof Error ? e.message : "unknown", 502);
  }
}
