import { badRequest, fail, ok } from "@/lib/envelope";
import { getSessionUser } from "@/lib/auth";
import {
  verifyBinanceFuturesAccount,
  verifyOkxAccount,
  type BrokerVerificationResult,
} from "@/lib/engines/exchange-execution-client";
import {
  getBrokerConnectionById,
  getBrokerConnectionSecrets,
  recordVaultAuditLog,
  updateBrokerConnectionState,
} from "@/lib/services/broker-vault-store";
import { rateLimit } from "@/lib/rate-limit";

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
      platform?: "BINANCE_FUTURES" | "OKX_FUTURES";
      apiKey?: string;
      apiSecret?: string;
      passphrase?: string;
      isTestnet?: boolean;
    };

    if (body.connectionId) {
      const acct = await getBrokerConnectionById(body.connectionId);
      if (!acct) return fail("NOT_FOUND", "Không tìm thấy kết nối trong Vault", 404);

      if (acct.platform !== "BINANCE_FUTURES" && acct.platform !== "OKX_FUTURES") {
        return ok({
          verification: {
            verified: acct.connectionStatus === "CONNECTED_VERIFIED",
            platform: acct.platform,
            isTestnet: acct.isTestnet ?? true,
            balanceUsd: acct.balanceUsd,
            availableMarginUsd: acct.balanceUsd,
            canTrade: acct.hasEaToken ?? false,
            latencyMs: 0,
            rawMessage:
              acct.platform === "MT5_EXNESS" || acct.platform === "MT5_XM" || acct.platform === "MT5_EA"
                ? "XM / Exness kết nối qua EA MT5 Bridge (bật Expert Advisor trên MT5 để gửi heartbeat)"
                : "Tài khoản chế độ Paper Simulation",
          },
          account: acct,
        });
      }

      const secrets = await getBrokerConnectionSecrets(acct.id);
      if (!secrets) {
        return badRequest("Kết nối này đang ở chế độ Paper Sandbox và chưa có API Key thật để kiểm tra");
      }

      const verification: BrokerVerificationResult =
        acct.platform === "BINANCE_FUTURES"
          ? await verifyBinanceFuturesAccount(secrets)
          : await verifyOkxAccount(secrets);

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

    if (!body.platform || !body.apiKey?.trim() || !body.apiSecret?.trim()) {
      return badRequest("Cần cung cấp platform, API Key và API Secret để kiểm tra kết nối");
    }

    const verification =
      body.platform === "BINANCE_FUTURES"
        ? await verifyBinanceFuturesAccount({
            apiKey: body.apiKey.trim(),
            apiSecret: body.apiSecret.trim(),
            isTestnet: body.isTestnet !== false,
          })
        : await verifyOkxAccount({
            apiKey: body.apiKey.trim(),
            apiSecret: body.apiSecret.trim(),
            passphrase: body.passphrase?.trim() ?? "",
            isTestnet: body.isTestnet !== false,
          });

    return ok({ verification });
  } catch (err) {
    return fail("BAD_REQUEST", err instanceof Error ? err.message : "Lỗi kiểm tra API kết nối", 400);
  }
}
