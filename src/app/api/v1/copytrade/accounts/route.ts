import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import {
  getMasterTraderPerformance,
  type BrokerPlatform,
} from "@/lib/engines/copy-trade-engine";
import {
  verifyBinanceFuturesAccount,
  verifyMetaApiMt5Account,
  verifyOkxAccount,
  type BrokerVerificationResult,
} from "@/lib/engines/exchange-execution-client";
import {
  createBrokerConnection,
  deleteBrokerConnection,
  getBrokerConnectionById,
  listBrokerConnections,
  rotateBrokerCredentials,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import { getAutoTradeWorkerStatus } from "@/lib/services/auto-trade-worker";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ALLOWED_PLATFORMS: BrokerPlatform[] = [
  "BINANCE_FUTURES",
  "OKX_FUTURES",
  "MT5_EXNESS",
  "MT5_XM",
  "MT5_EA",
  "BYBIT_FUTURES",
  "TELEGRAM_1CLICK",
];

export async function GET(req: Request) {
  const session = await getSessionUser(req);
  const accounts = await listBrokerConnections(session?.id ?? null);
  const totalManagedCapitalUsd = accounts
    .filter((a) => a.isActive)
    .reduce((sum, a) => sum + a.balanceUsd, 0);

  return ok(
    {
      accounts,
      performance: getMasterTraderPerformance(),
      workerStatus: getAutoTradeWorkerStatus(),
      totalManagedCapitalUsd: Math.round(totalManagedCapitalUsd),
      activeCount: accounts.filter((a) => a.isActive).length,
      verifiedLiveCount: accounts.filter((a) => a.connectionStatus === "CONNECTED_VERIFIED").length,
      killSwitchedCount: accounts.filter((a) => a.killSwitched).length,
    },
    undefined,
    { "Cache-Control": "no-store" },
  );
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-accounts-post",
    binding: "RL_AUTH",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const body = (await req.json()) as {
      name?: string;
      platform?: BrokerPlatform;
      accountNumber?: string;
      balanceUsd?: number;
      riskMultiplier?: number;
      maxAllowedSlippagePips?: number;
      leverageCap?: number;
      isTestnet?: boolean;
      autoExecuteEnabled?: boolean;
      maxDailyLossUsd?: number;
      maxOpenPositions?: number;
      apiKey?: string;
      apiSecret?: string;
      passphrase?: string;
    };

    if (!body.name?.trim() || !body.platform) {
      return badRequest("Vui lòng nhập tên kết nối và chọn sàn giao dịch");
    }
    if (!ALLOWED_PLATFORMS.includes(body.platform)) {
      return badRequest("Nền tảng giao dịch không được hỗ trợ");
    }

    const hasApiCreds = Boolean(body.apiKey?.trim() && body.apiSecret?.trim());
    if (body.platform === "OKX_FUTURES" && hasApiCreds && !body.passphrase?.trim()) {
      return badRequest("OKX v5 API yêu cầu bắt buộc phải có Passphrase");
    }

    const { connection, oneTimeEaToken } = await createBrokerConnection({
      userId: session?.id ?? null,
      name: body.name,
      platform: body.platform,
      accountNumber: body.accountNumber,
      balanceUsd: Number(body.balanceUsd) > 0 ? Number(body.balanceUsd) : 1000,
      riskMultiplier: Number(body.riskMultiplier) || 1.0,
      maxAllowedSlippagePips: Number(body.maxAllowedSlippagePips) || 2.0,
      leverageCap: Number(body.leverageCap) || 5,
      isTestnet: body.isTestnet !== false,
      autoExecuteEnabled: Boolean(body.autoExecuteEnabled),
      maxDailyLossUsd: Number(body.maxDailyLossUsd) || 500,
      maxOpenPositions: Number(body.maxOpenPositions) || 3,
      apiKey: body.apiKey,
      apiSecret: body.apiSecret,
      passphrase: body.passphrase,
    });

    let verification: BrokerVerificationResult | null = null;
    let finalAccount = connection;

    const isMt5Platform =
      body.platform === "MT5_EXNESS" || body.platform === "MT5_XM" || body.platform === "MT5_EA";

    if (
      hasApiCreds &&
      (body.platform === "BINANCE_FUTURES" || body.platform === "OKX_FUTURES" || isMt5Platform)
    ) {
      verification =
        body.platform === "BINANCE_FUTURES"
          ? await verifyBinanceFuturesAccount({
              apiKey: body.apiKey!.trim(),
              apiSecret: body.apiSecret!.trim(),
              isTestnet: body.isTestnet !== false,
            })
          : body.platform === "OKX_FUTURES"
            ? await verifyOkxAccount({
                apiKey: body.apiKey!.trim(),
                apiSecret: body.apiSecret!.trim(),
                passphrase: body.passphrase!.trim(),
                isTestnet: body.isTestnet !== false,
              })
            : await verifyMetaApiMt5Account(
                {
                  apiKey: body.apiKey!.trim(),
                  apiSecret: body.apiSecret!.trim(),
                  passphrase: body.passphrase?.trim() || null,
                  isTestnet: body.isTestnet !== false,
                },
                body.platform as "MT5_EXNESS" | "MT5_XM" | "MT5_EA",
              );

      const updated = await updateBrokerConnectionState(connection.id, {
        connectionStatus:
          verification.verified && verification.canTrade
            ? "CONNECTED_VERIFIED"
            : verification.verified
              ? "UNVERIFIED"
              : "ERROR",
        balanceUsd:
          verification.verified && verification.balanceUsd !== null && verification.balanceUsd > 0
            ? Number(verification.balanceUsd.toFixed(2))
            : connection.balanceUsd,
        lastVerifiedAt: verification.verified ? Date.now() : null,
        lastError: verification.verified && verification.canTrade ? null : verification.rawMessage,
      });
      if (updated) finalAccount = updated;
    }

    return ok({
      account: finalAccount,
      verification,
      oneTimeEaToken,
    });
  } catch (err) {
    return fail(
      "BAD_REQUEST",
      err instanceof Error ? err.message : "Không thể khởi tạo kết nối Broker Vault",
      400,
    );
  }
}

export async function PATCH(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-accounts-patch",
    binding: "RL_AUTH",
    limit: 60,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const body = (await req.json()) as {
      id?: string;
      isActive?: boolean;
      autoExecuteEnabled?: boolean;
      killSwitched?: boolean;
      maxDailyLossUsd?: number;
      leverageCap?: number;
    };
    if (!body.id) return badRequest("Thiếu id tài khoản");

    const existing = await getBrokerConnectionById(body.id);
    if (!existing) return fail("NOT_FOUND", "Không tìm thấy tài khoản Follower", 404);

    // Nếu tài khoản có chủ sở hữu rõ ràng và khác user hiện tại -> chặn
    const all = await listBrokerConnections(session?.id ?? null);
    if (session?.id && !all.some((a) => a.id === body.id)) {
      return fail("FORBIDDEN", "Không có quyền chỉnh sửa kết nối của tài khoản khác", 403);
    }

    const isLegacyToggle =
      body.isActive === undefined &&
      body.autoExecuteEnabled === undefined &&
      body.killSwitched === undefined &&
      body.maxDailyLossUsd === undefined &&
      body.leverageCap === undefined;

    const nextKillSwitch = body.killSwitched;
    const updated = await updateBrokerConnectionState(body.id, {
      ...(isLegacyToggle
        ? { isActive: !existing.isActive }
        : body.isActive !== undefined
          ? { isActive: Boolean(body.isActive) }
          : {}),
      ...(body.autoExecuteEnabled !== undefined
        ? { autoExecuteEnabled: existing.killSwitched && !nextKillSwitch ? false : Boolean(body.autoExecuteEnabled) }
        : {}),
      ...(nextKillSwitch !== undefined
        ? {
            killSwitched: Boolean(nextKillSwitch),
            autoExecuteEnabled: nextKillSwitch ? false : body.autoExecuteEnabled,
            connectionStatus: nextKillSwitch
              ? "KILL_SWITCHED"
              : existing.hasApiKey
                ? "CONNECTED_VERIFIED"
                : existing.hasEaToken
                  ? "AWAITING_EA"
                  : "PAPER_SIMULATED",
          }
        : {}),
      ...(body.maxDailyLossUsd !== undefined ? { maxDailyLossUsd: Math.max(10, Number(body.maxDailyLossUsd)) } : {}),
      ...(body.leverageCap !== undefined
        ? { leverageCap: Math.max(1, Math.min(20, Math.round(Number(body.leverageCap)))) }
        : {}),
    });

    if (!updated) return fail("NOT_FOUND", "Không thể cập nhật tài khoản", 404);
    return ok({ account: updated });
  } catch (err) {
    return fail("BAD_REQUEST", err instanceof Error ? err.message : "Invalid PATCH payload", 400);
  }
}

export async function PUT(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-accounts-put",
    binding: "RL_AUTH",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const body = (await req.json()) as {
      id?: string;
      apiKey?: string;
      apiSecret?: string;
      passphrase?: string;
      isTestnet?: boolean;
      regenerateEaToken?: boolean;
    };
    if (!body.id) return badRequest("Thiếu id tài khoản");

    const existing = await getBrokerConnectionById(body.id);
    if (!existing) return fail("NOT_FOUND", "Không tìm thấy kết nối trong Vault", 404);

    const all = await listBrokerConnections(session?.id ?? null);
    if (session?.id && !all.some((a) => a.id === body.id)) {
      return fail("FORBIDDEN", "Không có quyền chỉnh sửa kết nối của tài khoản khác", 403);
    }

    const { connection, oneTimeEaToken } = await rotateBrokerCredentials(body.id, {
      apiKey: body.apiKey,
      apiSecret: body.apiSecret,
      passphrase: body.passphrase,
      isTestnet: body.isTestnet,
      regenerateEaToken: body.regenerateEaToken,
      userId: session?.id ?? null,
    });
    if (!connection) return fail("NOT_FOUND", "Không thể cập nhật khóa kết nối", 404);

    let verification: BrokerVerificationResult | null = null;
    let finalAccount = connection;
    const hasNewCreds = Boolean(body.apiKey?.trim() && body.apiSecret?.trim());
    const isMt5 =
      existing.platform === "MT5_EXNESS" || existing.platform === "MT5_XM" || existing.platform === "MT5_EA";

    if (hasNewCreds && (existing.platform === "BINANCE_FUTURES" || existing.platform === "OKX_FUTURES" || isMt5)) {
      verification =
        existing.platform === "BINANCE_FUTURES"
          ? await verifyBinanceFuturesAccount({
              apiKey: body.apiKey!.trim(),
              apiSecret: body.apiSecret!.trim(),
              isTestnet: body.isTestnet ?? existing.isTestnet ?? true,
            })
          : existing.platform === "OKX_FUTURES"
            ? await verifyOkxAccount({
                apiKey: body.apiKey!.trim(),
                apiSecret: body.apiSecret!.trim(),
                passphrase: body.passphrase?.trim() ?? "",
                isTestnet: body.isTestnet ?? existing.isTestnet ?? true,
              })
            : await verifyMetaApiMt5Account(
                {
                  apiKey: body.apiKey!.trim(),
                  apiSecret: body.apiSecret!.trim(),
                  passphrase: body.passphrase?.trim() || null,
                  isTestnet: body.isTestnet ?? existing.isTestnet ?? true,
                },
                existing.platform as "MT5_EXNESS" | "MT5_XM" | "MT5_EA",
              );

      const updated = await updateBrokerConnectionState(connection.id, {
        connectionStatus:
          verification.verified && verification.canTrade
            ? "CONNECTED_VERIFIED"
            : verification.verified
              ? "UNVERIFIED"
              : "ERROR",
        balanceUsd:
          verification.verified && verification.balanceUsd !== null && verification.balanceUsd > 0
            ? Number(verification.balanceUsd.toFixed(2))
            : connection.balanceUsd,
        lastVerifiedAt: verification.verified ? Date.now() : null,
        lastError: verification.verified && verification.canTrade ? null : verification.rawMessage,
      });
      if (updated) finalAccount = updated;
    }

    return ok({ account: finalAccount, verification, oneTimeEaToken });
  } catch (err) {
    return fail("BAD_REQUEST", err instanceof Error ? err.message : "Invalid PUT payload", 400);
  }
}

export async function DELETE(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-accounts-delete",
    binding: "RL_AUTH",
    limit: 30,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const url = new URL(req.url);
    let id = url.searchParams.get("id");
    if (!id) {
      try {
        const body = (await req.json()) as { id?: string };
        id = body.id ?? null;
      } catch {
        // ignore empty body
      }
    }
    if (!id) return badRequest("Thiếu id tài khoản cần xóa");

    const all = await listBrokerConnections(session?.id ?? null);
    if (session?.id && !all.some((a) => a.id === id)) {
      return fail("FORBIDDEN", "Không có quyền xóa kết nối của tài khoản khác", 403);
    }

    const removed = await deleteBrokerConnection(id, session?.id ?? null);
    if (!removed) return fail("NOT_FOUND", "Không tìm thấy kết nối trong Vault", 404);

    return ok({ deletedId: id });
  } catch (err) {
    return fail("BAD_REQUEST", err instanceof Error ? err.message : "Không thể xóa kết nối", 400);
  }
}
