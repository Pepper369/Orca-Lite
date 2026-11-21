import { NextResponse } from "next/server";
import {
  listBotExecutionOrders,
  recordVaultAuditLog,
  saveBotExecutionOrder,
  updateBrokerConnectionState,
  verifyEaBearerToken,
} from "@/lib/services/broker-vault-store";
import { recordBotActivity } from "@/lib/services/bot-live-telemetry";
import { rateLimit } from "@/lib/rate-limit";
import { safeInternalErrorMessage, sanitizePlainText } from "@/app/api/_security";

export const dynamic = "force-dynamic";

function extractEaToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const custom = req.headers.get("x-orca-ea-token");
  return custom?.trim() || null;
}

/**
 * Callback xác nhận khớp lệnh hoặc đóng lệnh từ OrcaCopyTradeSlave.mq5 (XM / Exness MT5).
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "copytrade_ea_ack", binding: "RL_AUTH", limit: 60, windowSec: 60 });
  if (limited) return limited;

  const token = extractEaToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized MT5 EA token" }, { status: 401 });
  }

  const conn = await verifyEaBearerToken(token);
  if (!conn) {
    return NextResponse.json({ ok: false, error: "Invalid MT5 EA token" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      ticketId?: string;
      mt5Ticket?: string | number;
      status?: "FILLED" | "REJECTED" | "CLOSED";
      executionPrice?: number;
      lots?: number;
      profitUsd?: number;
      balanceUsd?: number;
      message?: string;
    };

    if (!body.ticketId || typeof body.ticketId !== "string" || body.ticketId.length > 64) {
      return NextResponse.json({ ok: false, error: "Invalid ticketId" }, { status: 400 });
    }
    const cleanMessage = body.message ? sanitizePlainText(body.message, 240) : "";

    const orders = await listBotExecutionOrders(100);
    const existing = orders.find((o) => o.orderId === body.ticketId && o.followerId === conn.id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Order not found for this EA account" }, { status: 404 });
    }

    const mt5Id = body.mt5Ticket ? String(body.mt5Ticket) : existing.exchangeOrderId ?? null;
    const isRejected = body.status === "REJECTED";
    const nextStatus = isRejected ? "REJECTED_EXCHANGE" : "FILLED";

    await saveBotExecutionOrder({
      ...existing,
      status: nextStatus,
      executionPrice: Number(body.executionPrice) > 0 ? Number(body.executionPrice) : existing.executionPrice,
      copiedLotsOrQty: Number(body.lots) > 0 ? Number(body.lots) : existing.copiedLotsOrQty,
      exchangeOrderId: mt5Id,
      message:
        cleanMessage ||
        (isRejected
          ? `${conn.platform} từ chối vào lệnh MT5`
          : `${conn.platform} MT5 đã khớp ticket #${mt5Id ?? "N/A"}`),
    });

    const patch: Parameters<typeof updateBrokerConnectionState>[1] = {
      connectionStatus: "CONNECTED_VERIFIED",
      lastVerifiedAt: Date.now(),
      lastError: isRejected ? cleanMessage || "MT5 OrderSend failed" : null,
    };

    if (!isRejected && existing.status === "PENDING_EA") {
      patch.totalCopiedTrades = conn.totalCopiedTrades + 1;
    }
    if (typeof body.balanceUsd === "number" && Number.isFinite(body.balanceUsd) && body.balanceUsd > 0) {
      patch.balanceUsd = Number(body.balanceUsd.toFixed(2));
    }
    if (typeof body.profitUsd === "number" && Number.isFinite(body.profitUsd)) {
      patch.totalPnlUsd = Number((conn.totalPnlUsd + body.profitUsd).toFixed(2));
      patch.dailyRealizedPnlUsd = Number(((conn.dailyRealizedPnlUsd ?? 0) + body.profitUsd).toFixed(2));
      patch.dailyPnlDate = new Date().toISOString().slice(0, 10);
    }

    await updateBrokerConnectionState(conn.id, patch);
    await recordVaultAuditLog(null, "MT5_EA_ACK", {
      connectionId: conn.id,
      ticketId: body.ticketId,
      mt5Ticket: mt5Id,
      status: nextStatus,
    });

    recordBotActivity({
      level: isRejected ? "warn" : "ok",
      category: "EXECUTION",
      symbol: existing.symbol,
      accountName: conn.name,
      platform: conn.platform,
      message: isRejected
        ? `${conn.platform} MT5 EA từ chối ticket #${mt5Id ?? "N/A"}`
        : `${conn.platform} MT5 EA xác nhận khớp ${existing.direction} ${existing.symbol} (#${mt5Id ?? "N/A"})`,
    });

    return NextResponse.json({ ok: true, status: nextStatus, mt5Ticket: mt5Id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: safeInternalErrorMessage(err, "Failed to acknowledge EA order") },
      { status: 500 },
    );
  }
}
