import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import {
  getMasterTraderPerformance,
  type BrokerPlatform,
  type FollowerAccount,
} from "@/lib/engines/copy-trade-engine";
import {
  classifyAccountEnvironment,
  summarizeLinkedTradingAccounts,
} from "@/lib/engines/bot-telemetry-types";
import {
  ALL_ALLOWED_PLATFORMS,
  detectBrokerCredentialsPattern,
  getBrokerMeta,
  isMt5BrokerPlatform,
  resolveBrokerDefaultSuffix,
} from "@/lib/engines/broker-registry";
import {
  verifyBrokerCredentials,
  verifyBrokerDualEnvironment,
  type BrokerVerificationResult,
  type DualEnvironmentVerificationResult,
} from "@/lib/engines/exchange-execution-client";
import {
  createBrokerConnection,
  deleteBrokerConnection,
  getBrokerConnectionById,
  listBrokerConnections,
  rotateBrokerCredentials,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import {
  getAutoTradeWorkerStatus,
  initAutoTradeWorker,
  triggerImmediateAutoTradeScan,
} from "@/lib/services/auto-trade-worker";
import { notifyBotTelemetryChanged } from "@/lib/services/bot-live-telemetry";
import { rateLimit } from "@/lib/rate-limit";
import { safeInternalErrorMessage, sanitizeIdentityName, sanitizePlainText } from "@/app/api/_security";

export const dynamic = "force-dynamic";

const ALLOWED_PLATFORMS: BrokerPlatform[] = ALL_ALLOWED_PLATFORMS;

export async function GET(req: Request) {
  initAutoTradeWorker();
  const session = await getSessionUser(req);
  if (!session && process.env.NODE_ENV === "production") {
    return fail("UNAUTHENTICATED", "Đăng nhập để xem kết nối Broker Vault", 401);
  }
  const rawAccounts = await listBrokerConnections(session?.id ?? null);
  const accounts = session ? rawAccounts : rawAccounts.filter((a) => a.id.startsWith("paper-"));
  const realAccounts = accounts.filter((a) => classifyAccountEnvironment(a).environment === "REAL");
  const demoAccounts = accounts.filter((a) => classifyAccountEnvironment(a).environment === "DEMO");

  const realNavUsd = Number(realAccounts.reduce((sum, a) => sum + a.balanceUsd, 0).toFixed(2));
  const demoNavUsd = Number(demoAccounts.reduce((sum, a) => sum + a.balanceUsd, 0).toFixed(2));
  const totalManagedCapitalUsd = accounts
    .filter((a) => a.isActive)
    .reduce((sum, a) => sum + a.balanceUsd, 0);

  const tradingAccountSummary = summarizeLinkedTradingAccounts(accounts);

  return ok(
    {
      accounts,
      tradingAccountSummary,
      performance: getMasterTraderPerformance(),
      workerStatus: getAutoTradeWorkerStatus(),
      realNavUsd,
      demoNavUsd,
      realAccountCount: realAccounts.length,
      demoAccountCount: demoAccounts.length,
      activeRealCount: realAccounts.filter((a) => a.isActive && !a.killSwitched).length,
      activeDemoCount: demoAccounts.filter((a) => a.isActive && !a.killSwitched).length,
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
    if (!session && process.env.NODE_ENV === "production") {
      return fail("UNAUTHENTICATED", "Đăng nhập để tạo kết nối Broker Vault", 401);
    }
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

    const nameCheck = sanitizeIdentityName(body.name, 80);
    if (!nameCheck.ok || !body.platform) {
      return badRequest((!nameCheck.ok ? nameCheck.reason : undefined) ?? "Vui lòng nhập tên kết nối và chọn sàn giao dịch");
    }
    if (!ALLOWED_PLATFORMS.includes(body.platform)) {
      return badRequest("Nền tảng giao dịch không được hỗ trợ");
    }

    const cleanAccountNumber = body.accountNumber ? sanitizePlainText(body.accountNumber, 64) : undefined;
    const brokerMeta = getBrokerMeta(body.platform);
    const trimmedKey = body.apiKey?.trim() ?? "";
    const trimmedSecret = body.apiSecret?.trim() ?? "";
    const effectivePassphrase =
      isMt5BrokerPlatform(body.platform)
        ? resolveBrokerDefaultSuffix(body.platform, body.passphrase) || undefined
        : body.passphrase?.trim() || undefined;
    const hasApiCreds = brokerMeta.fields.requiresSecret
      ? Boolean(trimmedKey && trimmedSecret)
      : Boolean(trimmedKey);

    if (brokerMeta.fields.requiresPassphrase && hasApiCreds && !effectivePassphrase) {
      return badRequest(`${brokerMeta.shortName} API yêu cầu bắt buộc phải có Passphrase`);
    }

    const isDirectDualVerify = brokerMeta.supportsDirectRestVerify && brokerMeta.supportsDualEnv && !brokerMeta.isMt5Broker;
    const isDirectSingleVerify = brokerMeta.supportsDirectRestVerify && !brokerMeta.supportsDualEnv && !brokerMeta.isMt5Broker;
    const isMt5Platform = isMt5BrokerPlatform(body.platform);

    // Unified Dual-Environment onboarding for Crypto & Forex REST Hubs:
    // 1 API Key/Token automatically probes BOTH REAL and DEMO and creates verified connections for every authorized environment.
    if (hasApiCreds && isDirectDualVerify) {
      const dualVerification: DualEnvironmentVerificationResult = await verifyBrokerDualEnvironment({
        platform: body.platform,
        apiKey: trimmedKey,
        apiSecret: trimmedSecret,
        passphrase: effectivePassphrase ?? null,
      });

      const baseName = nameCheck.value ?? "";
      const targets: Array<{
        isTestnet: boolean;
        label: string;
        v: BrokerVerificationResult;
      }> = [];

      if (dualVerification.real.verified && dualVerification.demo.verified) {
        targets.push(
          { isTestnet: false, label: `${baseName} (REAL)`, v: dualVerification.real },
          { isTestnet: true, label: `${baseName} (DEMO)`, v: dualVerification.demo },
        );
      } else if (dualVerification.real.verified) {
        targets.push({ isTestnet: false, label: baseName, v: dualVerification.real });
      } else if (dualVerification.demo.verified) {
        targets.push({ isTestnet: true, label: baseName, v: dualVerification.demo });
      } else {
        const fallbackIsTestnet = body.isTestnet !== false;
        targets.push({
          isTestnet: fallbackIsTestnet,
          label: baseName,
          v: fallbackIsTestnet ? dualVerification.demo : dualVerification.real,
        });
      }

      const createdAccounts: FollowerAccount[] = [];
      for (const t of targets) {
        const { connection } = await createBrokerConnection({
          userId: session?.id ?? null,
          name: t.label,
          platform: body.platform,
          accountNumber: cleanAccountNumber,
          balanceUsd:
            t.v.verified && t.v.balanceUsd !== null && t.v.balanceUsd > 0
              ? Number(t.v.balanceUsd.toFixed(2))
              : Number.isFinite(Number(body.balanceUsd)) && Number(body.balanceUsd) > 0
                ? Number(body.balanceUsd)
                : 1000,
          riskMultiplier: Number.isFinite(Number(body.riskMultiplier)) ? Number(body.riskMultiplier) : 1.0,
          maxAllowedSlippagePips: Number.isFinite(Number(body.maxAllowedSlippagePips))
            ? Number(body.maxAllowedSlippagePips)
            : 2.0,
          leverageCap: Number.isFinite(Number(body.leverageCap)) ? Number(body.leverageCap) : 5,
          isTestnet: t.isTestnet,
          autoExecuteEnabled: body.autoExecuteEnabled !== false,
          maxDailyLossUsd: Number.isFinite(Number(body.maxDailyLossUsd)) ? Number(body.maxDailyLossUsd) : 500,
          maxOpenPositions: Number.isFinite(Number(body.maxOpenPositions)) ? Number(body.maxOpenPositions) : 3,
          apiKey: body.apiKey,
          apiSecret: body.apiSecret,
          passphrase: body.passphrase,
        });

        const updated = await updateBrokerConnectionState(connection.id, {
          connectionStatus:
            t.v.verified && t.v.canTrade
              ? "CONNECTED_VERIFIED"
              : t.v.verified
                ? "UNVERIFIED"
                : "ERROR",
          balanceUsd:
            t.v.verified && t.v.balanceUsd !== null && t.v.balanceUsd > 0
              ? Number(t.v.balanceUsd.toFixed(2))
              : connection.balanceUsd,
          lastVerifiedAt: t.v.verified ? Date.now() : null,
          lastError: t.v.verified && t.v.canTrade ? null : t.v.rawMessage,
        });
        createdAccounts.push(updated ?? connection);
      }

      initAutoTradeWorker();
      triggerImmediateAutoTradeScan();
      notifyBotTelemetryChanged("account_created");
      return ok({
        account: createdAccounts[0],
        accounts: createdAccounts,
        verification: dualVerification.primary,
        dualVerification,
        oneTimeEaToken: null,
      });
    }

    const { connection, oneTimeEaToken } = await createBrokerConnection({
      userId: session?.id ?? null,
      name: nameCheck.value ?? "",
      platform: body.platform,
      accountNumber: cleanAccountNumber,
      balanceUsd: Number.isFinite(Number(body.balanceUsd)) && Number(body.balanceUsd) > 0 ? Number(body.balanceUsd) : 1000,
      riskMultiplier: Number.isFinite(Number(body.riskMultiplier)) ? Number(body.riskMultiplier) : 1.0,
      maxAllowedSlippagePips: Number.isFinite(Number(body.maxAllowedSlippagePips)) ? Number(body.maxAllowedSlippagePips) : 2.0,
      leverageCap: Number.isFinite(Number(body.leverageCap)) ? Number(body.leverageCap) : 5,
      isTestnet: body.isTestnet !== false,
      autoExecuteEnabled: body.autoExecuteEnabled !== false,
      maxDailyLossUsd: Number.isFinite(Number(body.maxDailyLossUsd)) ? Number(body.maxDailyLossUsd) : 500,
      maxOpenPositions: Number.isFinite(Number(body.maxOpenPositions)) ? Number(body.maxOpenPositions) : 3,
      apiKey: trimmedKey || undefined,
      apiSecret: trimmedSecret || (!brokerMeta.fields.requiresSecret && trimmedKey ? "read-only" : undefined),
      passphrase: effectivePassphrase,
    });

    let verification: BrokerVerificationResult | null = null;
    let finalAccount = connection;

    if (hasApiCreds && (isMt5Platform || isDirectSingleVerify)) {
      verification = await verifyBrokerCredentials(body.platform, {
        apiKey: trimmedKey,
        apiSecret: trimmedSecret,
        passphrase: effectivePassphrase ?? null,
        isTestnet: body.isTestnet !== false,
      });

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

    const recognition = hasApiCreds
      ? detectBrokerCredentialsPattern({
          apiKey: trimmedKey,
          apiSecret: trimmedSecret,
          passphrase: effectivePassphrase,
        })
      : null;

    initAutoTradeWorker();
    triggerImmediateAutoTradeScan();
    notifyBotTelemetryChanged("account_created");
    return ok({
      account: finalAccount,
      accounts: [finalAccount],
      verification,
      recognition,
      oneTimeEaToken,
    });
  } catch (err) {
    return fail(
      "BAD_REQUEST",
      safeInternalErrorMessage(err, "Không thể khởi tạo kết nối Broker Vault"),
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
    if (!session && process.env.NODE_ENV === "production") {
      return fail("UNAUTHENTICATED", "Đăng nhập để chỉnh sửa kết nối Broker Vault", 401);
    }
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

    if (!session) {
      if (!body.id.startsWith("paper-")) {
        return fail("UNAUTHENTICATED", "Đăng nhập để chỉnh sửa kết nối Broker Vault", 401);
      }
    } else {
      const all = await listBrokerConnections(session.id);
      if (!all.some((a) => a.id === body.id)) {
        return fail("FORBIDDEN", "Không có quyền chỉnh sửa kết nối của tài khoản khác", 403);
      }
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
    if (updated.autoExecuteEnabled && updated.isActive && !updated.killSwitched) {
      initAutoTradeWorker();
      triggerImmediateAutoTradeScan();
    }
    notifyBotTelemetryChanged("account_updated");
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
    if (!session) {
      return fail("UNAUTHENTICATED", "Đăng nhập để xoay vòng khóa kết nối Broker Vault", 401);
    }
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

    const all = await listBrokerConnections(session.id);
    if (!all.some((a) => a.id === body.id)) {
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
    const putMeta = getBrokerMeta(existing.platform);
    const hasNewCreds = putMeta.fields.requiresSecret
      ? Boolean(body.apiKey?.trim() && body.apiSecret?.trim())
      : Boolean(body.apiKey?.trim());

    if (hasNewCreds && putMeta.supportsDirectRestVerify) {
      verification = await verifyBrokerCredentials(existing.platform, {
        apiKey: body.apiKey!.trim(),
        apiSecret: body.apiSecret?.trim() || "",
        passphrase: body.passphrase?.trim() || null,
        isTestnet: body.isTestnet ?? existing.isTestnet ?? true,
      });

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

    notifyBotTelemetryChanged("credentials_rotated");
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
    if (!session && process.env.NODE_ENV === "production") {
      return fail("UNAUTHENTICATED", "Đăng nhập để xóa kết nối Broker Vault", 401);
    }
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

    if (!session) {
      if (!id.startsWith("paper-")) {
        return fail("UNAUTHENTICATED", "Đăng nhập để xóa kết nối Broker Vault", 401);
      }
    } else {
      const all = await listBrokerConnections(session.id);
      if (!all.some((a) => a.id === id)) {
        return fail("FORBIDDEN", "Không có quyền xóa kết nối của tài khoản khác", 403);
      }
    }

    const removed = await deleteBrokerConnection(id, session?.id ?? null);
    if (!removed) return fail("NOT_FOUND", "Không tìm thấy kết nối trong Vault", 404);

    notifyBotTelemetryChanged("account_deleted");
    return ok({ deletedId: id });
  } catch (err) {
    return fail("BAD_REQUEST", err instanceof Error ? err.message : "Không thể xóa kết nối", 400);
  }
}
