import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_ALLOWED_PLATFORMS,
  detectBrokerCredentialsPattern,
  getCryptoBrokerCatalog,
  getForexBrokerCatalog,
  getBrokerMeta,
  resolveBrokerDefaultSuffix,
} from "../engines/broker-registry";
import {
  classifyBrokerAssetClass,
  summarizeLinkedTradingAccounts,
} from "../engines/bot-telemetry-types";
import {
  verifyBrokerCredentials,
  verifyBrokerDualEnvironment,
  toMt5BrokerSymbol,
} from "../engines/exchange-execution-client";
import { calculateUnifiedTradeRiskPlan } from "../engines/unified-cross-asset-quant";
import { evaluateHighWinrateGate } from "../engines/high-winrate-gate";
import { analyzeIctSmcLiquidity } from "../engines/ict-smc-liquidity-engine";
import { BENCHMARK_ASSETS, generateRegimeBars } from "../engines/fx-crypto-backtest-harness";

describe("Broker Registry Split (Crypto vs Forex), API Key Recognition & SSOT Quant Parity", () => {
  it("separates Crypto exchanges and Forex brokers cleanly and updates trading account inventory", () => {
    const crypto = getCryptoBrokerCatalog();
    const forex = getForexBrokerCatalog();

    assert.ok(crypto.length >= 8, `Expected >= 8 crypto hubs, got ${crypto.length}`);
    assert.ok(forex.length >= 10, `Expected >= 10 forex hubs, got ${forex.length}`);
    assert.ok(crypto.every((b) => b.category === "CRYPTO"));
    assert.ok(forex.every((b) => b.category === "FOREX"));

    for (const plat of ALL_ALLOWED_PLATFORMS) {
      const meta = getBrokerMeta(plat);
      const cls = classifyBrokerAssetClass(plat);
      if (meta.category === "CRYPTO") assert.equal(cls, "CRYPTO");
      if (meta.category === "FOREX") assert.equal(cls, "FOREX");
    }

    // Default MT5 broker symbol suffixes
    assert.equal(resolveBrokerDefaultSuffix("MT5_EXNESS"), "m");
    assert.equal(resolveBrokerDefaultSuffix("MT5_XM"), "#");
    assert.equal(toMt5BrokerSymbol("XAU/USD", resolveBrokerDefaultSuffix("MT5_EXNESS")), "XAUUSDm");
    assert.equal(toMt5BrokerSymbol("EURUSD", resolveBrokerDefaultSuffix("MT5_XM")), "EURUSD#");
    assert.equal(toMt5BrokerSymbol("EURUSD", resolveBrokerDefaultSuffix("MT5_ICMARKETS")), "EURUSD");

    const summary = summarizeLinkedTradingAccounts([
      {
        id: "c1",
        name: "Bybit Unified (REAL)",
        platform: "BYBIT_FUTURES",
        accountNumberMasked: "byb***01",
        balanceUsd: 2500,
        riskMultiplier: 1,
        maxAllowedSlippagePips: 2,
        isTestnet: false,
        isActive: true,
        autoExecuteEnabled: true,
        killSwitched: false,
        connectionStatus: "CONNECTED_VERIFIED",
        hasApiKey: true,
        hasEaToken: false,
      },
      {
        id: "c2",
        name: "Bybit Unified (DEMO)",
        platform: "BYBIT_FUTURES",
        accountNumberMasked: "byb***01",
        balanceUsd: 10000,
        riskMultiplier: 1,
        maxAllowedSlippagePips: 2,
        isTestnet: true,
        isActive: true,
        autoExecuteEnabled: false,
        killSwitched: false,
        connectionStatus: "CONNECTED_VERIFIED",
        hasApiKey: true,
        hasEaToken: false,
      },
      {
        id: "f1",
        name: "OANDA fxTrade",
        platform: "OANDA_V20",
        accountNumberMasked: "oan***99",
        balanceUsd: 5000,
        riskMultiplier: 1,
        maxAllowedSlippagePips: 1,
        isTestnet: false,
        isActive: true,
        autoExecuteEnabled: true,
        killSwitched: false,
        connectionStatus: "CONNECTED_VERIFIED",
        hasApiKey: true,
        hasEaToken: false,
      },
      {
        id: "f2",
        name: "IC Markets Raw MT5",
        platform: "MT5_ICMARKETS",
        accountNumberMasked: "icm***12",
        balanceUsd: 3500,
        riskMultiplier: 1,
        maxAllowedSlippagePips: 1,
        isTestnet: false,
        isActive: true,
        autoExecuteEnabled: true,
        killSwitched: false,
        connectionStatus: "CONNECTED_VERIFIED",
        hasApiKey: true,
        hasEaToken: false,
      },
    ]);

    assert.equal(summary.cryptoAccountsCount, 1); // Same keyId real+demo counts as 1 trading account with 2 environments
    assert.equal(summary.forexAccountsCount, 2);
    assert.equal(summary.totalApiAccounts, 3);
    assert.equal(summary.accounts[0]?.environments.length, 2);
  });

  it("accurately recognizes API key formats across Crypto & Forex venues and flags missing fields", () => {
    const oanda = detectBrokerCredentialsPattern({
      apiKey: "0123456789abcdef0123456789abcdef-fedcba9876543210fedcba9876543210",
      apiSecret: "101-001-12345678-001",
    });
    assert.equal(oanda.bestMatch?.platform, "OANDA_V20");
    assert.ok((oanda.bestMatch?.confidence ?? 0) >= 95);

    const metaApi = detectBrokerCredentialsPattern({
      apiKey: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.signaturepart_12345",
      apiSecret: "1a2b3c4d-5e6f-7890-abcd-ef1234567890",
    });
    assert.equal(metaApi.bestMatch?.category, "FOREX");
    assert.ok(metaApi.detectedHints.looksLikeJwt);

    const hyper = detectBrokerCredentialsPattern({
      apiKey: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    });
    assert.equal(hyper.bestMatch?.platform, "HYPERLIQUID");

    const bitgetNoPass = detectBrokerCredentialsPattern({
      apiKey: "bg_abcdef1234567890abcd",
      apiSecret: "secretvalue123",
    });
    assert.equal(bitgetNoPass.bestMatch?.platform, "BITGET_FUTURES");
    assert.ok(bitgetNoPass.warningsVi.some((w) => w.includes("Passphrase")));

    const gate = detectBrokerCredentialsPattern({
      apiKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      apiSecret: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    });
    assert.equal(gate.bestMatch?.platform, "GATE_FUTURES");

    const binance = detectBrokerCredentialsPattern({
      apiKey: " " + "A1b2C3d4".repeat(8) + " ",
      apiSecret: "Z9y8X7w6".repeat(8),
    });
    assert.equal(binance.bestMatch?.platform, "BINANCE_FUTURES");
    assert.equal(binance.detectedHints.hasWhitespace, true);

    const bybit = detectBrokerCredentialsPattern({
      apiKey: "k9X2pLq7Wm4Rz8Vb3T",
      apiSecret: "SecretBybitUnifiedV5Key123456789012",
    });
    assert.equal(bybit.bestMatch?.platform, "BYBIT_FUTURES");

    const okx = detectBrokerCredentialsPattern({
      apiKey: "123e4567-e89b-12d3-a456-426614174000",
      apiSecret: "ABCDEF1234567890ABCDEF1234567890",
      passphrase: "my-pass",
    });
    assert.equal(okx.bestMatch?.platform, "OKX_FUTURES");
  });

  it("verifies Bybit v5 & OANDA v20 Dual REAL+DEMO via HTTP mocks without fabricating credentials", async () => {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        if (url.includes("api.bybit.com/v5/account/wallet-balance")) {
          assert.ok(headers.get("X-BAPI-SIGN"), "Expected Bybit HMAC signature");
          return new Response(
            JSON.stringify({
              retCode: 0,
              retMsg: "OK",
              result: { list: [{ totalEquity: "4250.50", totalAvailableBalance: "4100.00" }] },
            }),
            { status: 200 },
          );
        }
        if (url.includes("api-testnet.bybit.com/v5/account/wallet-balance")) {
          return new Response(
            JSON.stringify({
              retCode: 0,
              retMsg: "OK",
              result: { list: [{ totalEquity: "15000.00", totalAvailableBalance: "15000.00" }] },
            }),
            { status: 200 },
          );
        }
        if (url.includes("api-fxtrade.oanda.com/v3/accounts")) {
          assert.equal(headers.get("Authorization"), "Bearer oanda-tok");
          return new Response(
            JSON.stringify({ account: { balance: "8800", NAV: "8850", marginAvailable: "8500", currency: "USD" } }),
            { status: 200 },
          );
        }
        if (url.includes("api-fxpractice.oanda.com/v3/accounts")) {
          return new Response(JSON.stringify({ errorMessage: "Authorization failed" }), { status: 401 });
        }
        return new Response(JSON.stringify({ error: "Not mocked" }), { status: 404 });
      }) as typeof fetch;

      const bybitDual = await verifyBrokerDualEnvironment({
        platform: "BYBIT_FUTURES",
        apiKey: "k9X2pLq7Wm4Rz8Vb3T",
        apiSecret: "SecretBybitUnifiedV5Key123456789012",
      });
      assert.equal(bybitDual.real.verified, true);
      assert.equal(bybitDual.demo.verified, true);
      assert.deepEqual(bybitDual.connectedEnvironments, ["REAL", "DEMO"]);
      assert.equal(bybitDual.real.balanceUsd, 4250.5);

      const oandaDual = await verifyBrokerDualEnvironment({
        platform: "OANDA_V20",
        apiKey: "oanda-tok",
        apiSecret: "101-001-12345678-001",
      });
      assert.equal(oandaDual.real.verified, true);
      assert.equal(oandaDual.demo.verified, false);
      assert.deepEqual(oandaDual.connectedEnvironments, ["REAL"]);

      // Bitget missing passphrase must fail cleanly without network call
      const bitgetFail = await verifyBrokerCredentials("BITGET_FUTURES", {
        apiKey: "bg_1234567890abcdef",
        apiSecret: "sec",
        passphrase: "",
        isTestnet: true,
      });
      assert.equal(bitgetFail.verified, false);
      assert.ok(bitgetFail.rawMessage.includes("Passphrase"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("maintains SSOT parity for calculateUnifiedTradeRiskPlan and HighWinrateGate ICT delegation", () => {
    const cryptoPlan = calculateUnifiedTradeRiskPlan({
      assetType: "CRYPTO",
      symbol: "BTCUSDT",
      direction: "BUY",
      winRatePct: 82,
      payoffRatio: 2.1,
      sizeMultiplier: 1.0,
      entryPrice: 90000,
      stopLossPrice: 89100,
      leverage: 5,
    });
    assert.ok(cryptoPlan.riskAmountUsd > 0 && cryptoPlan.recommendedLotsOrQty > 0);
    assert.ok(cryptoPlan.recommendedMarginUsd > 0 && cryptoPlan.estimatedLiquidationPrice !== null);

    const forexPlan = calculateUnifiedTradeRiskPlan({
      assetType: "FOREX",
      symbol: "EURUSD",
      direction: "BUY",
      winRatePct: 82,
      payoffRatio: 2.1,
      sizeMultiplier: 1.0,
      entryPrice: 1.085,
      stopLossPrice: 1.083,
    });
    assert.ok(forexPlan.recommendedLotsOrQty >= 0.01);
    assert.equal(forexPlan.estimatedLiquidationPrice, null);

    // SSOT check: HighWinrateGate yields identical results whether passed precomputed ICT or computed internally
    const btc = BENCHMARK_ASSETS.find((a) => a.symbol === "BTCUSDT")!;
    const { bars } = generateRegimeBars(btc, "TURTLE_SOUP_SWEEP_REVERSAL", 101 + 3 * 31 + 3 * 97, 120);
    const slice = bars.slice(0, 58);
    const ict = analyzeIctSmcLiquidity({ symbol: "BTCUSDT", bars: slice, assetType: "CRYPTO" });

    const gDirect = evaluateHighWinrateGate({
      symbol: "BTCUSDT",
      series: slice,
      candidateDirection: "BUY",
      entryPrice: slice[slice.length - 1]!.close,
      stopLossPrice: slice[slice.length - 1]!.low * 0.995,
      assetType: "CRYPTO",
    });
    const gShared = evaluateHighWinrateGate({
      symbol: "BTCUSDT",
      series: slice,
      candidateDirection: "BUY",
      entryPrice: slice[slice.length - 1]!.close,
      stopLossPrice: slice[slice.length - 1]!.low * 0.995,
      assetType: "CRYPTO",
      ictResult: ict,
    });
    assert.equal(gShared.winrateScore, gDirect.winrateScore);
    assert.equal(gShared.liquiditySweepDetected, gDirect.liquiditySweepDetected);
    assert.deepEqual(gShared.oteLevel, gDirect.oteLevel);
  });
});
