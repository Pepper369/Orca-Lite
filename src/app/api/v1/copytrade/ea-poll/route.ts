import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { calculateProportionalCopySize } from "@/lib/engines/copy-trade-engine";
import {
  hasExecutionOrderByIdempotency,
  listPendingEaOrdersForConnection,
  saveBotExecutionOrder,
  updateBrokerConnectionState,
  verifyEaBearerToken,
} from "@/lib/services/broker-vault-store";
import { getForexSignalsHubData } from "@/lib/services/forex-signals-hub";

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
 * Authenticated MT5 EA Polling Endpoint cho Exness & XM.
 * Xác thực qua Bearer Token SHA-256 hash theo từng tài khoản.
 */
export async function GET(req: Request) {
  const token = extractEaToken(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, hasSignal: false, error: "Thiếu Authorization Bearer Token cho MT5 EA" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const conn = await verifyEaBearerToken(token);
  if (!conn) {
    return NextResponse.json(
      { ok: false, hasSignal: false, error: "EA Token không hợp lệ hoặc đã bị thu hồi" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Ghi nhận heartbeat kết nối sống từ MT5 terminal
  await updateBrokerConnectionState(conn.id, {
    lastVerifiedAt: Date.now(),
    ...(conn.connectionStatus === "AWAITING_EA" ? { connectionStatus: "CONNECTED_VERIFIED", lastError: null } : {}),
  });

  if (conn.killSwitched || !conn.isActive) {
    return NextResponse.json(
      {
        ok: true,
        hasSignal: false,
        killSwitched: Boolean(conn.killSwitched),
        connectionId: conn.id,
        reason: conn.killSwitched ? "Kill-Switch đang bật" : "Tài khoản đang tạm dừng",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const maxDailyLoss = Math.max(10, conn.maxDailyLossUsd ?? 500);
  if ((conn.dailyRealizedPnlUsd ?? 0) <= -maxDailyLoss) {
    return NextResponse.json(
      {
        ok: true,
        hasSignal: false,
        reason: `Daily Loss Circuit Breaker đã kích hoạt (-$${Math.abs(conn.dailyRealizedPnlUsd ?? 0).toFixed(2)})`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 1) Ưu tiên các lệnh đã được Dispatch riêng vào hàng đợi PENDING_EA của tài khoản này
  const pending = await listPendingEaOrdersForConnection(conn.id);
  if (pending.length > 0) {
    const order = pending[0];
    return NextResponse.json(
      {
        ok: true,
        hasSignal: true,
        ticketId: order.orderId,
        symbol: order.symbol,
        direction: order.direction,
        entry: order.entryPrice,
        stopLoss: order.stopLossPrice,
        takeProfit1: order.takeProfit1,
        recommendedLots: order.copiedLotsOrQty,
        maxSlippagePips: conn.maxAllowedSlippagePips,
        platform: conn.platform,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // 2) Nếu chưa có lệnh chờ và tài khoản bật Auto-Execute -> quét Top A+/A Forex Signal
  if (!conn.autoExecuteEnabled) {
    return NextResponse.json(
      { ok: true, hasSignal: false, connectionId: conn.id, reason: "Không có lệnh trong hàng đợi (Auto-Trade đang tắt)" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { data } = await getForexSignalsHubData();
    const candidate = data.signals.find(
      (s) =>
        s.status === "ACTIVE" &&
        (s.direction === "BUY" || s.direction === "SELL") &&
        s.entryPrice != null &&
        s.stopLossPrice != null &&
        s.tp1 != null &&
        (s.setupGrade === "A+" || s.setupGrade === "A" || (s.winrateScore ?? s.probability) >= 75),
    );

    if (!candidate) {
      return NextResponse.json(
        { ok: true, hasSignal: false, reason: "Chưa có kèo Forex Grade A+/A đạt chuẩn" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const bucket = Math.floor(candidate.updatedAt / (15 * 60 * 1000));
    const signalId = `fx_${candidate.pair}_${candidate.direction}_${bucket}`;
    const idempotencyKey = `${conn.id}_${signalId}_${candidate.pair}_${candidate.direction}`;
    if (await hasExecutionOrderByIdempotency(idempotencyKey)) {
      return NextResponse.json(
        { ok: true, hasSignal: false, reason: "Tín hiệu hiện tại đã được giao cho EA" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const scaledLots = calculateProportionalCopySize({
      masterLotsOrQty: Math.max(0.01, candidate.recommendedLots || 0.2),
      masterCapitalUsd: 10_000,
      followerBalanceUsd: conn.balanceUsd,
      riskMultiplier: conn.riskMultiplier,
      assetType: "FOREX",
    });
    const ticketId = `ea_${randomUUID().slice(0, 12)}`;

    await saveBotExecutionOrder({
      orderId: ticketId,
      followerId: conn.id,
      followerName: conn.name,
      platform: conn.platform,
      symbol: candidate.pair,
      direction: candidate.direction as "BUY" | "SELL",
      copiedLotsOrQty: scaledLots,
      entryPrice: candidate.entryPrice!,
      executionPrice: candidate.lastPrice || candidate.entryPrice!,
      slippagePips: 0,
      status: "PENDING_EA",
      stopLossPrice: candidate.stopLossPrice!,
      takeProfit1: candidate.tp1!,
      timestamp: Date.now(),
      signalId,
      idempotencyKey,
      isTestnet: conn.isTestnet ?? true,
      message: `Đã gửi lệnh tự động sang ${conn.platform} EA`,
    });

    return NextResponse.json(
      {
        ok: true,
        hasSignal: true,
        ticketId,
        symbol: candidate.pair,
        direction: candidate.direction,
        entry: candidate.entryPrice,
        stopLoss: candidate.stopLossPrice,
        takeProfit1: candidate.tp1,
        recommendedLots: scaledLots,
        maxSlippagePips: conn.maxAllowedSlippagePips,
        winrateScore: candidate.winrateScore ?? candidate.probability,
        setupGrade: candidate.setupGrade ?? "A",
        platform: conn.platform,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, hasSignal: false, error: err instanceof Error ? err.message : "EA poll failed" },
      { status: 500 },
    );
  }
}
