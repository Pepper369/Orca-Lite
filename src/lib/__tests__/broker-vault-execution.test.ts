import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  encryptSecret,
  generateEaToken,
  hashEaToken,
  maskSecret,
  timingSafeTokenEqual,
} from "@/lib/security/credential-vault";
import {
  roundStepSize,
  roundTickSize,
  signBinanceQuery,
  signOkxRequest,
  toBinanceFuturesSymbol,
  toMt5BrokerSymbol,
  toOkxSwapInstId,
  verifyMetaApiMt5Account,
} from "@/lib/engines/exchange-execution-client";
import {
  createBrokerConnection,
  deleteBrokerConnection,
  getBrokerConnectionSecrets,
  listBrokerConnections,
  rotateBrokerCredentials,
  triggerGlobalKillSwitch,
  verifyEaBearerToken,
} from "@/lib/services/broker-vault-store";
import { dispatchSignalWithVault, type DispatchableSignalInput } from "@/lib/services/auto-trade-dispatcher";
import type { FollowerAccount } from "@/lib/engines/copy-trade-engine";

test("Credential Vault: AES-256-GCM encrypt/decrypt round-trip, random IV & tamper rejection", () => {
  const secret = "sk_live_binance_super_secret_987654321";
  const key = "unit-test-vault-master-key-32bytes!";

  const enc1 = encryptSecret(secret, key);
  const enc2 = encryptSecret(secret, key);

  assert.ok(enc1.startsWith("v1:"));
  assert.notEqual(enc1, enc2, "Mỗi lần mã hóa phải sinh IV 96-bit ngẫu nhiên khác nhau");
  assert.equal(decryptSecret(enc1, key), secret);
  assert.equal(decryptSecret(enc2, key), secret);

  // Tampering ciphertext/auth tag must fail authentication
  const parts = enc1.split(":");
  const flippedChar = parts[3][0] === "A" ? "B" : "A";
  const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${flippedChar}${parts[3].slice(1)}`;
  assert.throws(() => decryptSecret(tampered, key));

  // Wrong key must reject decryption
  assert.throws(() => decryptSecret(enc1, "wrong-encryption-key-must-fail-32"));
});

test("Credential Vault: Masking and constant-time EA Bearer Token verification", () => {
  assert.equal(maskSecret("abcdefgh12345678"), "abcd****5678");
  assert.equal(maskSecret("short"), "****rt");
  assert.equal(maskSecret(""), "");

  const token = generateEaToken();
  assert.ok(token.startsWith("orca_ea_"));
  const h1 = hashEaToken(token);
  const h2 = hashEaToken(token);
  const hOther = hashEaToken(`${token}x`);
  assert.equal(h1.length, 64);
  assert.equal(timingSafeTokenEqual(h1, h2), true);
  assert.equal(timingSafeTokenEqual(h1, hOther), false);
});

test("Exchange Client: Binance & OKX HMAC-SHA256 signatures, symbol mapping & precision rounding", () => {
  const bnSig = signBinanceQuery("symbol=BTCUSDT&side=BUY&timestamp=1700000000000", "testSecret");
  assert.equal(bnSig.length, 64);
  assert.match(bnSig, /^[0-9a-f]{64}$/);

  const okxSig = signOkxRequest("2026-11-20T10:00:00.000Z", "GET", "/api/v5/account/balance", "", "okxSecret");
  assert.ok(okxSig.length > 20);
  assert.equal(
    okxSig,
    signOkxRequest("2026-11-20T10:00:00.000Z", "GET", "/api/v5/account/balance", "", "okxSecret"),
  );

  assert.equal(toBinanceFuturesSymbol("btc-usdt-swap"), "BTCUSDT");
  assert.equal(toBinanceFuturesSymbol("ETH/USDT"), "ETHUSDT");
  assert.equal(toOkxSwapInstId("BTCUSDT"), "BTC-USDT-SWAP");
  assert.equal(toOkxSwapInstId("SOL-USDT-SWAP"), "SOL-USDT-SWAP");

  assert.equal(roundStepSize(0.123999, "0.001"), 0.123);
  assert.equal(roundStepSize(15.7, "1"), 15);
  assert.equal(roundTickSize(91234.567, "0.1"), 91234.6);
  assert.equal(roundTickSize(1.08496, "0.0001"), 1.085);
});

function makeTestAccount(overrides: Partial<FollowerAccount> = {}): FollowerAccount {
  return {
    id: `test_acct_${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Account",
    platform: "BINANCE_FUTURES",
    accountNumberMasked: "abcd****1234",
    balanceUsd: 5000,
    riskMultiplier: 1.0,
    maxAllowedSlippagePips: 3.0,
    leverageCap: 5,
    isTestnet: true,
    isActive: true,
    autoExecuteEnabled: true,
    killSwitched: false,
    connectionStatus: "PAPER_SIMULATED",
    maxDailyLossUsd: 300,
    dailyRealizedPnlUsd: 0,
    hasApiKey: false,
    totalCopiedTrades: 0,
    winratePct: 0,
    totalPnlUsd: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

const SAMPLE_CRYPTO_SIGNAL: DispatchableSignalInput = {
  id: `sig_btc_${Date.now()}`,
  symbol: "BTCUSDT",
  assetType: "CRYPTO",
  direction: "BUY",
  entryPrice: 90_000,
  stopLossPrice: 88_500,
  takeProfit1: 93_500,
  masterLotsOrQty: 0.05,
  masterCapitalUsd: 10_000,
  winrateScore: 84,
  setupGrade: "A+",
  recommendedLeverage: 5,
  timestamp: Date.now(),
};

test("Auto-Trade Guardrails: Enforces Grade A+/A gate, Kill-Switch, Daily Loss, Asset Mismatch & Idempotency", async () => {
  // 1) Low Grade B rejected in Auto mode
  const autoAcct = makeTestAccount({ id: "guard-auto-1" });
  const lowGradeRes = await dispatchSignalWithVault({
    signal: { ...SAMPLE_CRYPTO_SIGNAL, id: `sig_grade_${Date.now()}`, setupGrade: "B", winrateScore: 68 },
    manualOverride: false,
    overrideAccounts: [autoAcct],
  });
  assert.equal(lowGradeRes[0]?.status, "REJECTED_LOW_GRADE");

  // 2) Kill-Switch blocks even manual execution
  const ksAcct = makeTestAccount({ id: "guard-ks-1", killSwitched: true });
  const ksRes = await dispatchSignalWithVault({
    signal: SAMPLE_CRYPTO_SIGNAL,
    manualOverride: true,
    overrideAccounts: [ksAcct],
  });
  assert.equal(ksRes[0]?.status, "BLOCKED_KILL_SWITCH");

  // 3) Daily Loss Circuit Breaker blocks execution when daily loss >= limit
  const dlAcct = makeTestAccount({
    id: "guard-dl-1",
    maxDailyLossUsd: 250,
    dailyRealizedPnlUsd: -260,
  });
  const dlRes = await dispatchSignalWithVault({
    signal: SAMPLE_CRYPTO_SIGNAL,
    manualOverride: true,
    overrideAccounts: [dlAcct],
  });
  assert.equal(dlRes[0]?.status, "BLOCKED_DAILY_LOSS");

  // 4) Forex signal rejected on Crypto exchange
  const fxMismatchRes = await dispatchSignalWithVault({
    signal: {
      ...SAMPLE_CRYPTO_SIGNAL,
      id: `sig_fx_${Date.now()}`,
      symbol: "EURUSD",
      assetType: "FOREX",
      entryPrice: 1.085,
      stopLossPrice: 1.083,
      takeProfit1: 1.089,
    },
    manualOverride: false,
    overrideAccounts: [autoAcct],
  });
  assert.equal(fxMismatchRes[0]?.status, "REJECTED_ASSET_MISMATCH");

  // 5) Idempotency Lock blocks second identical dispatch on same signal+account
  let execCalls = 0;
  const uniqueSignal: DispatchableSignalInput = {
    ...SAMPLE_CRYPTO_SIGNAL,
    id: `sig_idem_${Date.now()}`,
  };
  const idemAcct = makeTestAccount({ id: `guard-idem-${Date.now()}` });

  const stubExecutor = async (
    acct: FollowerAccount,
    signal: DispatchableSignalInput,
    qtyOrLots: number,
    _leverage: number,
    marketPrice: number,
    slippagePips: number,
    idempotencyKey: string,
  ) => {
    execCalls++;
    return {
      orderId: `ord_stub_${execCalls}`,
      followerId: acct.id,
      followerName: acct.name,
      platform: acct.platform,
      symbol: signal.symbol,
      direction: signal.direction,
      copiedLotsOrQty: qtyOrLots,
      entryPrice: signal.entryPrice,
      executionPrice: marketPrice,
      slippagePips,
      status: "FILLED" as const,
      stopLossPrice: signal.stopLossPrice,
      takeProfit1: signal.takeProfit1,
      timestamp: Date.now(),
      signalId: signal.id,
      idempotencyKey,
      exchangeOrderId: "BINANCE_MOCK_123",
      message: "Testnet stub fill",
    };
  };

  const firstRun = await dispatchSignalWithVault({
    signal: uniqueSignal,
    manualOverride: false,
    overrideAccounts: [idemAcct],
    orderExecutor: stubExecutor,
  });
  assert.equal(firstRun[0]?.status, "FILLED");
  assert.equal(execCalls, 1);

  const secondRun = await dispatchSignalWithVault({
    signal: uniqueSignal,
    manualOverride: false,
    overrideAccounts: [idemAcct],
    orderExecutor: stubExecutor,
  });
  assert.equal(secondRun[0]?.status, "SKIPPED_DUPLICATE");
  assert.equal(execCalls, 1, "Idempotency Lock phải ngăn tuyệt đối không gọi executor lần thứ 2");
});

test("Broker Vault Store: Encrypts secrets, issues one-time MT5 EA token & enforces Kill-Switch", async () => {
  const { connection: binanceConn, oneTimeEaToken: bnEaToken } = await createBrokerConnection({
    name: "Vault Unit Test Binance",
    platform: "BINANCE_FUTURES",
    balanceUsd: 2500,
    riskMultiplier: 1.0,
    isTestnet: true,
    apiKey: "bn_live_key_abcdef123456",
    apiSecret: "bn_secret_xyz987654",
  });

  assert.equal(bnEaToken, null);
  assert.equal(binanceConn.hasApiKey, true);
  assert.equal(binanceConn.accountNumberMasked, "bn_l****3456");
  assert.equal("apiKey" in binanceConn, false);
  assert.equal("apiKeyEnc" in binanceConn, false);
  assert.equal("apiSecret" in binanceConn, false);

  const decrypted = await getBrokerConnectionSecrets(binanceConn.id);
  assert.equal(decrypted?.apiKey, "bn_live_key_abcdef123456");
  assert.equal(decrypted?.apiSecret, "bn_secret_xyz987654");

  const { connection: exnessConn, oneTimeEaToken } = await createBrokerConnection({
    name: "Vault Unit Test Exness MT5",
    platform: "MT5_EXNESS",
    balanceUsd: 1500,
    riskMultiplier: 1.0,
  });
  assert.ok(oneTimeEaToken && oneTimeEaToken.startsWith("orca_ea_"));
  assert.equal(exnessConn.connectionStatus, "AWAITING_EA");

  const verifiedConn = await verifyEaBearerToken(oneTimeEaToken!);
  assert.equal(verifiedConn?.id, exnessConn.id);
  assert.equal(await verifyEaBearerToken("orca_ea_invalid_token_000"), null);

  await triggerGlobalKillSwitch({ engage: true, reason: "Unit test emergency stop" });
  const killedList = await listBrokerConnections();
  const targetAfterKill = killedList.find((c) => c.id === binanceConn.id);
  assert.equal(targetAfterKill?.killSwitched, true);
  assert.equal(targetAfterKill?.autoExecuteEnabled, false);
  assert.equal(targetAfterKill?.connectionStatus, "KILL_SWITCHED");

  await triggerGlobalKillSwitch({ engage: false });
  const unlockedList = await listBrokerConnections();
  const targetAfterRelease = unlockedList.find((c) => c.id === binanceConn.id);
  assert.equal(targetAfterRelease?.killSwitched, false);

  // Clean up test accounts
  assert.equal(await deleteBrokerConnection(binanceConn.id), true);
  assert.equal(await deleteBrokerConnection(exnessConn.id), true);
});

test("MetaApi MT5 Cloud (XM/Exness) + Credential Rotation & Delete Lifecycle", async () => {
  assert.equal(toMt5BrokerSymbol("XAU/USD"), "XAUUSD");
  assert.equal(toMt5BrokerSymbol("EURUSD", "m"), "EURUSDm");
  assert.equal(toMt5BrokerSymbol("XAUUSDm", "m"), "XAUUSDm");
  assert.equal(toMt5BrokerSymbol("GBP/USD", "#"), "GBPUSD#");

  const emptyVerify = await verifyMetaApiMt5Account(
    { apiKey: "", apiSecret: "", isTestnet: true },
    "MT5_XM",
  );
  assert.equal(emptyVerify.verified, false);
  assert.equal(emptyVerify.platform, "MT5_XM");

  const { connection: xmMetaApi, oneTimeEaToken } = await createBrokerConnection({
    name: "XM Cloud MetaApi Test",
    platform: "MT5_XM",
    balanceUsd: 3000,
    riskMultiplier: 1.0,
    isTestnet: true,
    apiKey: "metaapi_jwt_token_test_12345",
    apiSecret: "11111111-2222-3333-4444-555555555555",
    passphrase: "#",
  });
  assert.equal(oneTimeEaToken, null, "MetaApi Cloud mode should not force one-time EA token");
  assert.equal(xmMetaApi.hasApiKey, true);
  assert.equal(xmMetaApi.connectionStatus, "UNVERIFIED");

  const rotated = await rotateBrokerCredentials(xmMetaApi.id, {
    apiKey: "metaapi_jwt_rotated_99999",
    apiSecret: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    regenerateEaToken: true,
  });
  assert.ok(rotated.connection);
  assert.ok(rotated.oneTimeEaToken?.startsWith("orca_ea_"));
  const secretsAfter = await getBrokerConnectionSecrets(xmMetaApi.id);
  assert.equal(secretsAfter?.apiKey, "metaapi_jwt_rotated_99999");

  assert.equal(await deleteBrokerConnection(xmMetaApi.id), true);
  assert.equal(await deleteBrokerConnection(xmMetaApi.id), false);
});
