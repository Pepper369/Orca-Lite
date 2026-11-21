import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import {
  ALL_ALLOWED_PLATFORMS,
  detectBrokerCredentialsPattern,
  getBrokerMeta,
  isMt5BrokerPlatform,
  type BrokerPlatform,
} from "@/lib/engines/broker-registry";
import {
  verifyBrokerCredentials,
  verifyBrokerDualEnvironment,
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
      platform?: BrokerPlatform;
      apiKey?: string;
      apiSecret?: string;
      passphrase?: string;
      isTestnet?: boolean;
      autoDetect?: boolean;
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

      const isMt5 = isMt5BrokerPlatform(acct.platform);
      const brokerMeta = getBrokerMeta(acct.platform);
      const supportsDirectTest = brokerMeta.supportsDirectRestVerify && Boolean(acct.hasApiKey);

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
              ? `${brokerMeta.shortName} đang dùng EA MT5 Bridge (bật OrcaCopyTradeSlave.mq5 trên MT5 để gửi heartbeat, hoặc gắn MetaApi Key để test trực tiếp)`
              : "Tài khoản chế độ Paper Sandbox / Lưu khóa",
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

      const verification: BrokerVerificationResult = await verifyBrokerCredentials(acct.platform, secrets);

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

    const recognition = detectBrokerCredentialsPattern({
      apiKey: body.apiKey,
      apiSecret: body.apiSecret,
      passphrase: body.passphrase,
    });

    const targetPlatform: BrokerPlatform | undefined =
      body.platform ?? (body.autoDetect ? recognition.bestMatch?.platform : undefined);

    if (!targetPlatform || !ALL_ALLOWED_PLATFORMS.includes(targetPlatform)) {
      return badRequest("Vui lòng chọn sàn / nhà môi giới hợp lệ hoặc dán API Key để tự nhận diện");
    }

    const meta = getBrokerMeta(targetPlatform);
    const trimmedKey = body.apiKey?.trim() ?? "";
    const trimmedSecret = body.apiSecret?.trim() ?? "";
    if (!trimmedKey || (meta.fields.requiresSecret && !trimmedSecret)) {
      return badRequest(`Cần cung cấp ${meta.fields.apiKeyLabel} để kiểm tra kết nối ${meta.shortName}`);
    }

    if (meta.supportsDirectRestVerify && meta.supportsDualEnv && !meta.isMt5Broker) {
      const dualVerification = await verifyBrokerDualEnvironment({
        platform: targetPlatform,
        apiKey: trimmedKey,
        apiSecret: trimmedSecret,
        passphrase: body.passphrase?.trim() || null,
      });
      return ok({
        verification: dualVerification.primary,
        dualVerification,
        recognition,
        resolvedPlatform: targetPlatform,
      });
    }

    const verification = await verifyBrokerCredentials(targetPlatform, {
      apiKey: trimmedKey,
      apiSecret: trimmedSecret,
      passphrase: body.passphrase?.trim() || null,
      isTestnet: body.isTestnet !== false,
    });

    return ok({ verification, recognition, resolvedPlatform: targetPlatform });
  } catch (err) {
    return fail("BAD_REQUEST", safeInternalErrorMessage(err, "Lỗi kiểm tra API kết nối"), 400);
  }
}
