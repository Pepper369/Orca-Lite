import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  formatBinanceAuthErrorVi,
  verifyBinanceFuturesAccount,
} from "@/lib/engines/exchange-execution-client";

test("Auth Session Cookie: builds valid Set-Cookie & clear headers and safely handles null passwordHash", () => {
  const setCookie = buildSessionCookieHeader("jwt.token.sample");
  assert.match(setCookie, /^orca_session=jwt\.token\.sample;/);
  assert.match(setCookie, /Path=\//);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=604800/);

  const clearCookie = buildClearSessionCookieHeader();
  assert.match(clearCookie, /^orca_session=;/);
  assert.match(clearCookie, /Max-Age=0/);
  assert.match(clearCookie, /HttpOnly/);

  // Null/empty stored hash (e.g. Firebase-only account) must return false without throwing
  assert.equal(verifyPassword("any-password", null), false);
  assert.equal(verifyPassword("any-password", undefined), false);
  assert.equal(verifyPassword("any-password", "malformed-hash"), false);

  const hashed = hashPassword("OrcaSecure#2026");
  assert.equal(verifyPassword("OrcaSecure#2026", hashed), true);
  assert.equal(verifyPassword("WrongPass", hashed), false);
});

test("Binance Futures Verification: supports demo-fapi fallback, detects Mainnet/Testnet mismatch, and formats errors", async () => {
  const originalFetch = globalThis.fetch;

  try {
    // 1) Demo Trading key succeeds on demo-fapi.binance.com
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/fapi/v1/time")) {
        return new Response(JSON.stringify({ serverTime: Date.now() - 1200 }), { status: 200 });
      }
      if (url.startsWith("https://demo-fapi.binance.com/fapi/v2/account")) {
        return new Response(
          JSON.stringify({ totalWalletBalance: "15000.5", availableBalance: "14500.25", canTrade: true }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: -2015, msg: "Invalid API-key, IP, or permissions for action" }), {
        status: 401,
      });
    }) as typeof fetch;

    const demoOk = await verifyBinanceFuturesAccount({
      apiKey: "demo_key_1234567890",
      apiSecret: "demo_secret_1234567890",
      isTestnet: true,
    });
    assert.equal(demoOk.verified, true);
    assert.equal(demoOk.canTrade, true);
    assert.equal(demoOk.balanceUsd, 15000.5);
    assert.equal(demoOk.resolvedEndpoint, "https://demo-fapi.binance.com");

    // 2) Legacy testnet.binancefuture.com key falls back cleanly when demo-fapi rejects with -2015
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/fapi/v1/time")) {
        return new Response(JSON.stringify({ serverTime: Date.now() }), { status: 200 });
      }
      if (url.startsWith("https://testnet.binancefuture.com/fapi/v2/account")) {
        return new Response(
          JSON.stringify({ totalWalletBalance: "5000", availableBalance: "5000", canTrade: true }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: -2015, msg: "Invalid API-key, IP, or permissions for action" }), {
        status: 401,
      });
    }) as typeof fetch;

    const legacyOk = await verifyBinanceFuturesAccount({
      apiKey: "legacy_testnet_key_9999",
      apiSecret: "legacy_testnet_secret_9999",
      isTestnet: true,
    });
    assert.equal(legacyOk.verified, true);
    assert.equal(legacyOk.resolvedEndpoint, "https://testnet.binancefuture.com");

    // 3) Mainnet key submitted while DEMO/TESTNET toggle is ON must fail safely with explicit guidance
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/fapi/v1/time")) {
        return new Response(JSON.stringify({ serverTime: Date.now() }), { status: 200 });
      }
      if (url.startsWith("https://fapi.binance.com/fapi/v2/account")) {
        return new Response(
          JSON.stringify({ totalWalletBalance: "2500", availableBalance: "2500", canTrade: true }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: -2015, msg: "Invalid API-key, IP, or permissions for action" }), {
        status: 401,
      });
    }) as typeof fetch;

    const mismatch = await verifyBinanceFuturesAccount({
      apiKey: "mainnet_real_key_8888",
      apiSecret: "mainnet_real_secret_8888",
      isTestnet: true,
    });
    assert.equal(mismatch.verified, false);
    assert.match(mismatch.rawMessage, /MAINNET/i);
    assert.match(mismatch.rawMessage, /REAL \/ LIVE/i);

    // 4) Error formatter checks
    assert.match(formatBinanceAuthErrorVi(-2014, "API-key format invalid.", true), /Định dạng API Key/i);
    assert.match(formatBinanceAuthErrorVi(-1022, "Signature for this request is not valid.", false), /API Secret/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
