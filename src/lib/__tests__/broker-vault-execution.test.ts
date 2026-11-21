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
import {
  aggregateTierSummary,
  assignPoolNavShares,
  calculateAccountRoiPct,
  calculateMarkToMarketPnlUsd,
  calculatePositionRoePct,
  classifyAccountEnvironment,
  classifyAccountTier,
  summarizeLinkedTradingAccounts,
} from "@/lib/engines/bot-telemetry-types";
import {
  buildBotLiveTelemetrySnapshot,
  closeTrackedBotPosition,
  getLivePriceReference,
  updateLivePriceReference,
} from "@/lib/services/bot-live-telemetry";
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

test("Real-Time Bot Telemetry Math: Crypto, FX, Gold Mark-to-Market PnL, ROI% & Real/Demo Tier Split", async () => {
  // 1) Crypto BTC long & short exact PnL
  assert.equal(
    calculateMarkToMarketPnlUsd({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
      entryPrice: 90000,
      markPrice: 91000,
      qtyOrLots: 0.5,
    }),
    500,
  );
  assert.equal(
    calculateMarkToMarketPnlUsd({
      symbol: "ETHUSDT",
      assetType: "CRYPTO",
      direction: "SELL",
      entryPrice: 3000,
      markPrice: 2950,
      qtyOrLots: 2,
    }),
    100,
  );

  // 2) Forex EURUSD (100,000 units/lot) & Gold XAUUSD (100 oz/lot) & USDJPY base-USD conversion
  assert.equal(
    calculateMarkToMarketPnlUsd({
      symbol: "EURUSD",
      assetType: "FOREX",
      direction: "BUY",
      entryPrice: 1.08,
      markPrice: 1.085,
      qtyOrLots: 0.1,
    }),
    50,
  );
  assert.equal(
    calculateMarkToMarketPnlUsd({
      symbol: "XAUUSD",
      assetType: "FOREX",
      direction: "BUY",
      entryPrice: 2650,
      markPrice: 2660,
      qtyOrLots: 0.2,
    }),
    200,
  );
  const jpyPnl = calculateMarkToMarketPnlUsd({
    symbol: "USDJPY",
    assetType: "FOREX",
    direction: "BUY",
    entryPrice: 150.0,
    markPrice: 151.5,
    qtyOrLots: 0.1,
  });
  assert.ok(jpyPnl > 95 && jpyPnl < 105, `Expected USDJPY 0.1 lot +1.5 JPY move ≈ $99, got ${jpyPnl}`);

  // 3) ROE% and Account ROI%
  assert.equal(
    calculatePositionRoePct({
      unrealizedPnlUsd: 500,
      entryPrice: 90000,
      qtyOrLots: 0.5,
      leverage: 5,
      assetType: "CRYPTO",
      symbol: "BTCUSDT",
    }),
    5.56,
  );
  assert.equal(calculateAccountRoiPct(250, 5000), 5);
  assert.equal(calculateAccountRoiPct(-100, 0), 0);

  // 4) Real vs Testnet/Demo vs Paper Sandbox classification
  assert.equal(
    classifyAccountTier({ isTestnet: false, hasApiKey: true, connectionStatus: "CONNECTED_VERIFIED" }),
    "LIVE_REAL",
  );
  assert.equal(
    classifyAccountTier({ isTestnet: true, hasApiKey: true, connectionStatus: "CONNECTED_VERIFIED" }),
    "TESTNET_DEMO",
  );
  assert.equal(
    classifyAccountTier({ isTestnet: false, hasApiKey: false, hasEaToken: false, connectionStatus: "PAPER_SIMULATED" }),
    "PAPER_SANDBOX",
  );

  // 5) Snapshot & live position open/close lifecycle on Paper Sandbox
  const paperOrders = await dispatchSignalWithVault({
    signal: {
      ...SAMPLE_CRYPTO_SIGNAL,
      id: `sig_live_telem_${Date.now()}`,
      entryPrice: 90000,
    },
    currentMarketPrice: 90000,
    manualOverride: true,
    targetFollowerIds: ["paper-binance-sandbox"],
  });
  assert.equal(paperOrders[0]?.status, "FILLED_PAPER");

  const snap = await buildBotLiveTelemetrySnapshot();
  assert.ok(snap.accounts.length >= 2, "Snapshot should contain broker accounts");
  assert.equal(snap.liveRealSummary.accountCount + snap.demoSummary.accountCount, snap.summary.accountCount);
  const aggregated = aggregateTierSummary(snap.accounts);
  assert.equal(aggregated.equityUsd, snap.summary.equityUsd);

  const openPos = snap.openPositions.find((p) => p.orderId === paperOrders[0]!.orderId);
  assert.ok(openPos, "Newly filled paper order should appear in real-time openPositions");

  const closed = await closeTrackedBotPosition({ orderId: paperOrders[0]!.orderId });
  assert.equal(closed.ok, true);
  assert.equal(closed.symbol, "BTCUSDT");
});

test("Real vs Demo NAV Separation: Per-account NAV isolation, pool shares & targetEnvironment dispatch guard", async () => {
  // 1) Environment & Demo Subtype classification SSOT
  assert.deepEqual(
    classifyAccountEnvironment({
      isTestnet: false,
      hasApiKey: true,
      connectionStatus: "CONNECTED_VERIFIED",
      platform: "BINANCE_FUTURES",
    }),
    { environment: "REAL", accountTier: "LIVE_REAL", demoSubtype: null },
  );
  assert.deepEqual(
    classifyAccountEnvironment({
      isTestnet: true,
      hasApiKey: true,
      connectionStatus: "CONNECTED_VERIFIED",
      platform: "BINANCE_FUTURES",
    }),
    { environment: "DEMO", accountTier: "TESTNET_DEMO", demoSubtype: "EXCHANGE_TESTNET" },
  );
  assert.deepEqual(
    classifyAccountEnvironment({
      isTestnet: true,
      hasApiKey: true,
      connectionStatus: "CONNECTED_VERIFIED",
      platform: "MT5_EXNESS",
    }),
    { environment: "DEMO", accountTier: "TESTNET_DEMO", demoSubtype: "MT5_DEMO" },
  );
  assert.deepEqual(
    classifyAccountEnvironment({
      isTestnet: false,
      hasApiKey: false,
      connectionStatus: "PAPER_SIMULATED",
      platform: "OKX_FUTURES",
    }),
    { environment: "DEMO", accountTier: "PAPER_SANDBOX", demoSubtype: "PAPER_SANDBOX" },
  );

  // 2) Per-account Real vs Demo NAV isolation + intra-pool share calculation
  const snap = await buildBotLiveTelemetrySnapshot();
  assert.equal(snap.realAccounts.length, snap.realNav.accountCount);
  assert.equal(snap.demoAccounts.length, snap.demoNav.accountCount);
  assert.equal(snap.realNav.totalNavUsd, snap.liveRealSummary.totalNavUsd);
  assert.equal(snap.demoNav.totalNavUsd, snap.demoSummary.totalNavUsd);

  for (const acc of snap.realAccounts) {
    assert.equal(acc.environment, "REAL");
    assert.equal(acc.realNavUsd, acc.navUsd);
    assert.equal(acc.demoNavUsd, 0);
  }
  for (const acc of snap.demoAccounts) {
    assert.equal(acc.environment, "DEMO");
    assert.equal(acc.demoNavUsd, acc.navUsd);
    assert.equal(acc.realNavUsd, 0);
  }
  if (snap.demoAccounts.length > 0) {
    const demoShareSum = snap.demoAccounts.reduce((s, a) => s + a.navShareInPoolPct, 0);
    assert.ok(
      Math.abs(demoShareSum - 100) <= 0.5,
      `Demo pool navShareInPoolPct should sum to ~100%, got ${demoShareSum}`,
    );
  }

  // Synthetic mixed Real + Demo pool check: Real pool shares MUST NOT be diluted by Demo NAV
  const baseDemo = snap.demoAccounts[0]!;
  const mixed = assignPoolNavShares([
    { ...baseDemo, accountId: "r1", environment: "REAL", navUsd: 3000, realNavUsd: 3000, demoNavUsd: 0 },
    { ...baseDemo, accountId: "r2", environment: "REAL", navUsd: 1000, realNavUsd: 1000, demoNavUsd: 0 },
    { ...baseDemo, accountId: "d1", environment: "DEMO", navUsd: 50000, realNavUsd: 0, demoNavUsd: 50000 },
  ]);
  assert.equal(mixed.find((x) => x.accountId === "r1")?.navShareInPoolPct, 75);
  assert.equal(mixed.find((x) => x.accountId === "r2")?.navShareInPoolPct, 25);
  assert.equal(mixed.find((x) => x.accountId === "d1")?.navShareInPoolPct, 100);

  // 3) targetEnvironment dispatcher guardrail: DEMO orders never touch REAL accounts & vice versa
  const realAcct = makeTestAccount({
    id: `env-real-${Date.now()}`,
    name: "Binance Real Live",
    isTestnet: false,
    hasApiKey: true,
    connectionStatus: "CONNECTED_VERIFIED",
  });
  const demoAcct = makeTestAccount({
    id: `env-demo-${Date.now()}`,
    name: "Binance Testnet Demo",
    isTestnet: true,
    hasApiKey: true,
    connectionStatus: "CONNECTED_VERIFIED",
  });
  const touchedIds: string[] = [];
  const stubExec = async (
    acct: FollowerAccount,
    signal: DispatchableSignalInput,
    qtyOrLots: number,
    _lev: number,
    marketPrice: number,
    slippagePips: number,
    idempotencyKey: string,
  ) => {
    touchedIds.push(acct.id);
    return {
      orderId: `ord_env_${touchedIds.length}`,
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
      message: "Stub env order",
    };
  };

  await dispatchSignalWithVault({
    signal: { ...SAMPLE_CRYPTO_SIGNAL, id: `sig_env_demo_${Date.now()}` },
    manualOverride: true,
    targetEnvironment: "DEMO",
    overrideAccounts: [realAcct, demoAcct],
    orderExecutor: stubExec,
  });
  assert.deepEqual(touchedIds, [demoAcct.id], "targetEnvironment=DEMO phải chặn tuyệt đối tài khoản REAL");

  touchedIds.length = 0;
  await dispatchSignalWithVault({
    signal: { ...SAMPLE_CRYPTO_SIGNAL, id: `sig_env_real_${Date.now()}` },
    manualOverride: true,
    targetEnvironment: "REAL",
    overrideAccounts: [realAcct, demoAcct],
    orderExecutor: stubExec,
  });
  assert.deepEqual(touchedIds, [realAcct.id], "targetEnvironment=REAL phải chỉ định riêng tài khoản REAL");

  // 4) Live Price Reference Feed updates Mark-to-Market PnL & NAV in real time
  updateLivePriceReference("BTCUSDT", 92500);
  assert.equal(getLivePriceReference("BTCUSDT"), 92500);
});

test("Linked Trading Accounts Inventory: 1 API Key set = 1 account (dedupes dual REAL+DEMO, splits Crypto vs Forex, ignores Paper)", () => {
  const summary = summarizeLinkedTradingAccounts([
    // Paper Sandbox without API key -> MUST NOT be counted
    makeTestAccount({
      id: "paper-binance-sandbox",
      name: "Binance Paper",
      platform: "BINANCE_FUTURES",
      hasApiKey: false,
      hasEaToken: false,
      connectionStatus: "PAPER_SIMULATED",
    }),
    // Dual-mode Binance key (REAL + DEMO sharing same masked API key) -> counts as 1 Crypto account with both environments
    makeTestAccount({
      id: "conn_bn_real",
      name: "Binance Main (REAL)",
      platform: "BINANCE_FUTURES",
      accountNumberMasked: "bn01****9999",
      isTestnet: false,
      hasApiKey: true,
      connectionStatus: "CONNECTED_VERIFIED",
      balanceUsd: 2000,
    }),
    makeTestAccount({
      id: "conn_bn_demo",
      name: "Binance Main (DEMO)",
      platform: "BINANCE_FUTURES",
      accountNumberMasked: "bn01****9999",
      isTestnet: true,
      hasApiKey: true,
      connectionStatus: "CONNECTED_VERIFIED",
      balanceUsd: 10000,
    }),
    // Distinct 2nd Crypto API key (OKX) -> counts as 2nd Crypto account
    makeTestAccount({
      id: "conn_okx_1",
      name: "OKX Pro",
      platform: "OKX_FUTURES",
      accountNumberMasked: "okx2****1234",
      isTestnet: false,
      hasApiKey: true,
      connectionStatus: "UNVERIFIED",
      balanceUsd: 1500,
    }),
    // Forex Exness MetaApi key -> counts as 1 Forex account
    makeTestAccount({
      id: "conn_exness_1",
      name: "Exness Gold",
      platform: "MT5_EXNESS",
      accountNumberMasked: "meta****7777",
      isTestnet: false,
      hasApiKey: true,
      connectionStatus: "CONNECTED_VERIFIED",
      balanceUsd: 3500,
    }),
    // Forex XM EA Token -> counts as 2nd Forex account
    makeTestAccount({
      id: "conn_xm_ea",
      name: "XM MT5",
      platform: "MT5_XM",
      accountNumberMasked: "MT5-XM01",
      isTestnet: true,
      hasApiKey: false,
      hasEaToken: true,
      connectionStatus: "AWAITING_EA",
      balanceUsd: 1000,
    }),
  ]);

  assert.equal(summary.totalApiAccounts, 4);
  assert.equal(summary.cryptoAccountsCount, 2);
  assert.equal(summary.forexAccountsCount, 2);
  assert.equal(summary.cryptoVerifiedCount, 1);
  assert.equal(summary.forexVerifiedCount, 1);

  const bn = summary.accounts.find((a) => a.credentialMasked === "bn01****9999");
  assert.ok(bn);
  assert.equal(bn.name, "Binance Main");
  assert.deepEqual(bn.environments, ["REAL", "DEMO"]);
  assert.equal(bn.connectionIds.length, 2);
});

test("Per-User Demo Persistence & Logout/Login Isolation: User Demo NAV & orders persist across sessions and never reset or leak", async () => {
  const userA = `user-demo-persist-a-${Date.now()}`;
  const userB = `user-demo-persist-b-${Date.now()}`;

  // 1) User A logs in -> gets persistent per-user Demo accounts starting at $10,000
  const accountsA1 = await listBrokerConnections(userA);
  assert.equal(accountsA1.length, 2);
  const binanceDemoA = accountsA1.find((a) => a.platform === "BINANCE_FUTURES");
  assert.ok(binanceDemoA);
  assert.ok(binanceDemoA.id.startsWith("paper-"));
  assert.equal(binanceDemoA.balanceUsd, 10_000);

  // 2) User A places a Demo trade and closes it at profit
  const ordersA = await dispatchSignalWithVault({
    signal: {
      ...SAMPLE_CRYPTO_SIGNAL,
      id: `sig_userA_${Date.now()}`,
      entryPrice: 90_000,
    },
    currentMarketPrice: 90_000,
    manualOverride: true,
    userId: userA,
    targetFollowerIds: [binanceDemoA.id],
  });
  assert.equal(ordersA[0]?.status, "FILLED_PAPER");

  const closeRes = await closeTrackedBotPosition({
    orderId: ordersA[0]!.orderId,
    userId: userA,
    overrideClosePrice: 92_000,
  });
  assert.equal(closeRes.ok, true);
  assert.ok(closeRes.realizedPnlUsd > 0);

  // 3) User A logs out (guest mode userId=null) -> guest sees $10,000 guest sandbox, NOT User A's account/orders
  const guestSnap = await buildBotLiveTelemetrySnapshot(null);
  assert.equal(guestSnap.accounts.some((a) => a.accountId === binanceDemoA.id), false);
  assert.equal(guestSnap.openPositions.some((p) => p.accountId === binanceDemoA.id), false);

  // 4) Another user B logs in -> isolated from User A and gets their own $10,000 Demo accounts
  const snapB = await buildBotLiveTelemetrySnapshot(userB);
  assert.equal(snapB.demoAccounts.length, 2);
  assert.equal(snapB.demoNav.totalNavUsd, 20_000);
  assert.equal(snapB.accounts.some((a) => a.accountId === binanceDemoA.id), false);

  // 5) User A logs back in -> exact Demo NAV, wallet balance, and realized PnL are preserved (never reset to $10,000)
  const snapA2 = await buildBotLiveTelemetrySnapshot(userA);
  const restoredBinanceA = snapA2.accounts.find((a) => a.accountId === binanceDemoA.id);
  assert.ok(restoredBinanceA);
  assert.ok(
    restoredBinanceA.walletBalanceUsd > 10_000,
    `Expected User A Demo balance > $10,000 after relogin, got ${restoredBinanceA.walletBalanceUsd}`,
  );
  assert.ok(restoredBinanceA.realizedPnlUsd > 0);

  // 6) Deleting a seeded Demo account must not auto-respawn on next listBrokerConnections
  for (const acc of accountsA1) {
    assert.equal(await deleteBrokerConnection(acc.id, userA), true);
  }
  const afterDeleteA = await listBrokerConnections(userA);
  assert.equal(afterDeleteA.length, 0);

  // Clean up User B test accounts
  const accountsB = await listBrokerConnections(userB);
  for (const acc of accountsB) {
    await deleteBrokerConnection(acc.id, userB);
  }
});
