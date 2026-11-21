import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import {
  verifyBinanceFuturesAccount,
  verifyBrokerDualEnvironment,
  verifyMetaApiMt5Account,
  verifyOkxAccount,
  type BrokerVerificationResult,
} from "@/lib/engines/exchange-execution-client";
import {
  getBrokerConnectionById,
  getBrokerConnectionSecrets,
  listBrokerConnections,
  recordVaultAuditLog,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import { rateLimit } from "@/lib/rate-limit";
import { safeInternalErrorMessage } from "@/app/api/_security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await rateLimit(req, {
    name: "copytrade-test-connection",
    binding: "RL_AUTH",
    limit: 20,
    windowSec: 60,
  });
  if (limited) return limited;

  try {
    const session = await getSessionUser(req);
    const body = (await req.json()) as {
      connectionId?: string;
      platform?: "BINANCE_FUTURES" | "OKX_FUTURES" | "MT5_EXNESS" | "MT5_XM" | "MT5_EA";
      apiKey?: string;
      apiSecret?: string;
      passphrase?: string;
      isTestnet?: boolean;
    };

    if (body.connectionId) {
      if (!session && (process.env.NODE_ENV === "production" || !body.connectionId.startsWith("paper-"))) {
        return fail("UNAUTHENTICATED", "Đăng nhập để kiểm tra kết nối Broker Vault", 401);
      }

      const acct = await getBrokerConnectionById(body.connectionId);
      if (!acct) return fail("NOT_FOUND", "Không tìm thấy kết nối trong Vault", 404);

      if (session) {
        const owned = await listBrokerConnections(session.id);
        if (!owned.some((a) => a.id === body.connectionId)) {
          return fail("FORBIDDEN", "Không có quyền truy cập kết nối của tài khoản khác", 403);
        }
      }

      const isMt5 = acct.platform === "MT5_EXNESS" || acct.platform === "MT5_XM" || acct.platform === "MT5_EA";
      const supportsDirectTest =
        acct.platform === "BINANCE_FUTURES" || acct.platform === "OKX_FUTURES" || (isMt5 && acct.hasApiKey);

      if (!supportsDirectTest) {
        return ok({
          verification: {
            verified: acct.connectionStatus === "CONNECTED_VERIFIED",
            platform: acct.platform,
            isTestnet: acct.isTestnet ?? true,
            balanceUsd: acct.balanceUsd,
            availableMarginUsd: acct.balanceUsd,
            canTrade: acct.hasEaToken ?? false,
            latencyMs: 0,
            rawMessage: isMt5
              ? "XM / Exness đang dùng EA MT5 Bridge (bật OrcaCopyTradeSlave.mq5 trên MT5 để gửi heartbeat, hoặc gắn MetaApi Key để test trực tiếp)"
              : "Tài khoản chế độ Paper Simulation",
          },
          account: acct,
        });
      }

      if (!session) {
        return fail("UNAUTHENTICATED", "Đăng nhập để kiểm tra kết nối có khóa API", 401);
      }

      const secrets = await getBrokerConnectionSecrets(acct.id);
      if (!secrets) {
        return badRequest("Kết nối này đang ở chế độ Paper Sandbox và chưa có API Key thật để kiểm tra");
      }

      const verification: BrokerVerificationResult =
        acct.platform === "BINANCE_FUTURES"
          ? await verifyBinanceFuturesAccount(secrets)
          : acct.platform === "OKX_FUTURES"
            ? await verifyOkxAccount(secrets)
            : await verifyMetaApiMt5Account(secrets, acct.platform as "MT5_EXNESS" | "MT5_XM" | "MT5_EA");

      const updated = await updateBrokerConnectionState(acct.id, {
        connectionStatus:
          verification.verified && verification.canTrade
            ? "CONNECTED_VERIFIED"
            : verification.verified
              ? "UNVERIFIED"
              : "ERROR",
        balanceUsd:
          verification.verified && verification.balanceUsd !== null && verification.balanceUsd > 0
            ? Number(verification.balanceUsd.toFixed(2))
            : acct.balanceUsd,
        lastVerifiedAt: verification.verified ? Date.now() : acct.lastVerifiedAt,
        lastError: verification.verified && verification.canTrade ? null : verification.rawMessage,
      });

      await recordVaultAuditLog(session?.id ?? null, "BROKER_TEST_CONNECTION", {
        connectionId: acct.id,
        platform: acct.platform,
        verified: verification.verified,
        canTrade: verification.canTrade,
      });

      return ok({ verification, account: updated });
    }

    if (!session && process.env.NODE_ENV === "production") {
      return fail("UNAUTHENTICATED", "Đăng nhập để kiểm tra kết nối Broker", 401);
    }

    if (!body.platform || !body.apiKey?.trim() || !body.apiSecret?.trim()) {
      return badRequest("Cần cung cấp platform, API Key và API Secret để kiểm tra kết nối");
    }

    if (body.platform === "BINANCE_FUTURES" || body.platform === "OKX_FUTURES") {
      const dualVerification = await verifyBrokerDualEnvironment({
        platform: body.platform,
        apiKey: body.apiKey.trim(),
        apiSecret: body.apiSecret.trim(),
        passphrase: body.passphrase?.trim() || null,
      });
      return ok({
        verification: dualVerification.primary,
        dualVerification,
      });
    }

    const verification = await verifyMetaApiMt5Account(
      {
        apiKey: body.apiKey.trim(),
        apiSecret: body.apiSecret.trim(),
        passphrase: body.passphrase?.trim() || null,
        isTestnet: body.isTestnet !== false,
      },
      body.platform,
    );

    return ok({ verification });
  } catch (err) {
    return fail("BAD_REQUEST", safeInternalErrorMessage(err, "Lỗi kiểm tra API kết nối"), 400);
  }
}
