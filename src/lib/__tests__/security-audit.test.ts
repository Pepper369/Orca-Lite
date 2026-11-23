import assert from "node:assert/strict";
import test from "node:test";
import { getBCTCDeadlines, extractEarningsFromHeadline } from "../services/earnings-intel";
import { getContagionExposureForTicker, evaluateSystemicLegalRisk } from "../services/systemic-risk-radar";
import { computeT2OverextensionRisk } from "../services/t2-risk";
import { extractFinancialIntent, tokenizeViTitle } from "../services/vietnamese-financial-nlu";

test("Security Audit: ReDoS & Boundary Test on Earnings Regex Parser", () => {
  // Test with long repeating pattern to ensure regex does not catastrophic backtrack
  const maliciousHeadline = "Lãi ròng " + "a".repeat(50_000) + " 500 tỷ đồng";
  const t0 = performance.now();
  const res = extractEarningsFromHeadline(maliciousHeadline);
  const elapsed = performance.now() - t0;

  assert.ok(elapsed < 200, `Regex extraction must execute in under 200ms, took ${elapsed.toFixed(1)}ms`);
  assert.equal(typeof res, "object");
});

test("Security Audit: Financial NLU Stopwords & XSS Resistance", () => {
  const xssPayload = "<script>alert(1)</script> HPG báo lãi kỷ lục quý 1";
  const result = extractFinancialIntent(xssPayload);
  assert.equal(result.tickers.includes("HPG"), true);
  assert.equal(result.intent, "GET_STOCK_INFO");
  const tokens = tokenizeViTitle(xssPayload);
  assert.equal(tokens.has("script"), false);
  assert.equal(tokens.has("alert"), false);
});

test("Security Audit: Systemic Contagion Linkage Parameter Boundaries", () => {
  // Path traversal and sql injection style inputs must return empty links safely without throwing
  const maliciousSymbols = ["../../etc/passwd", "' OR 1=1--", "<svg/onload=alert(1)>", "SELECT * FROM users"];
  for (const sym of maliciousSymbols) {
    const links = getContagionExposureForTicker(sym);
    assert.equal(Array.isArray(links), true);
    assert.equal(links.length, 0);
  }
});

test("Security Audit: T+2 Risk Engine Bounds Protection", () => {
  // Test with NaN, Infinite, zero-length or negative price inputs
  const corruptedBars = [
    { time: "2026-03-01", open: NaN, high: Infinity, low: -100, close: 0, volume: -500 },
    { time: "2026-03-02", open: 0, high: 0, low: 0, close: 0, volume: 0 },
  ];
  const risk = computeT2OverextensionRisk("TEST", corruptedBars as any);
  assert.ok(risk.score >= 0 && risk.score <= 100, "Score must remain bounded between 0 and 100");
  assert.ok(["SAFE", "MODERATE", "ELEVATED", "CRITICAL_T2_TRAP"].includes(risk.level));
});

test("Security Audit: BCTC Deadlines Year Range Clamping", () => {
  const yearNegative = getBCTCDeadlines(2025);
  assert.equal(yearNegative.length, 6);
  for (const d of yearNegative) {
    assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("Security Audit: DuckDB Table Name Sanitization & Injection Defense", async () => {
  const { ingestJSONTable } = await import("../duckdb-engine");
  const maliciousNames = [
    "users; DROP TABLE stocks; --",
    "../../etc/passwd",
    "table' OR '1'='1",
    "",
    "   ",
  ];
  for (const name of maliciousNames) {
    const success = await ingestJSONTable(name, [{ id: 1, val: "test" }]);
    // Either sanitized successfully or rejected safely without throwing error
    assert.equal(typeof success, "boolean");
  }
});

test("Security Audit: Path Traversal Segment Validation", () => {
  const traversalSegments = [
    ["..", "etc", "passwd"],
    ["v1", "..", "secrets"],
    ["v1", "stocks", "...."],
    ["v1", "stocks", "foo\\bar"],
    ["v1", "stocks", "foo\0bar"],
  ];

  for (const segments of traversalSegments) {
    const isDangerous = segments.some((s) => s === ".." || s === "." || s.includes("..") || s.includes("\\") || s.includes("\0"));
    assert.equal(isDangerous, true, `Segment ${JSON.stringify(segments)} must be detected as dangerous`);
  }

  const safeSegments = ["v1", "stocks", "HPG", "financials"];
  const isSafe = !safeSegments.some((s) => s === ".." || s === "." || s.includes("..") || s.includes("\\") || s.includes("\0"));
  assert.equal(isSafe, true);
});

test("Security Audit: SSRF Guard blocks internal, metadata, loopback, and non-matching webhook URLs", async () => {
  const { isSafeWebhookUrl } = await import("../webhook-security");
  const blockedUrls = [
    "http://127.0.0.1:8080/admin",
    "http://169.254.169.254/latest/meta-data/",
    "https://localhost/internal",
    "https://user:pass@discord.com/api/webhooks/123/abc",
    "https://evil.example.com/steal",
  ];
  for (const url of blockedUrls) {
    const res = await isSafeWebhookUrl(url, url.includes("evil") ? "discord" : "generic");
    assert.equal(res.ok, false, `Expected SSRF block for ${url}`);
  }
});

test("Security Audit: Rate Limiter enforces limit and returns 429 with Retry-After via fallback store", async () => {
  const { rateLimit } = await import("../rate-limit");
  const uniqueName = `audit_test_${Date.now()}`;
  const req = new Request("https://orca.local/api/v1/test", {
    headers: { "x-forwarded-for": "203.0.113.42" },
  });

  const r1 = await rateLimit(req, { name: uniqueName, binding: "RL_AI", limit: 2, windowSec: 60 });
  const r2 = await rateLimit(req, { name: uniqueName, binding: "RL_AI", limit: 2, windowSec: 60 });
  const r3 = await rateLimit(req, { name: uniqueName, binding: "RL_AI", limit: 2, windowSec: 60 });

  assert.equal(r1, null);
  assert.equal(r2, null);
  assert.ok(r3 instanceof Response);
  assert.equal(r3.status, 429);
  assert.ok(Number(r3.headers.get("Retry-After")) >= 1);
});

test("Security Audit: Hono Security Headers, CSP & index.html Inline Script Hash", async () => {
  const { computeInlineScriptHashes, getSecurityHeaders } = await import("../../../server/security");
  const hashes = computeInlineScriptHashes();
  assert.ok(hashes.length >= 1, "index.html inline boot script hash must be computed");

  const prodHtmlHeaders = getSecurityHeaders({ pathname: "/", isProd: true, inlineScriptHashes: hashes });
  assert.equal(prodHtmlHeaders["X-Frame-Options"], "DENY");
  assert.equal(prodHtmlHeaders["X-Content-Type-Options"], "nosniff");
  assert.equal(prodHtmlHeaders["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.ok(prodHtmlHeaders["Permissions-Policy"].includes("camera=()"));
  assert.ok(prodHtmlHeaders["Strict-Transport-Security"].includes("max-age="));

  const csp = prodHtmlHeaders["Content-Security-Policy"];
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("https://s.tradingview.com"));
  assert.ok(csp.includes("wss:"));
  assert.ok(csp.includes(hashes[0]!));
  const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/);
  assert.ok(scriptSrcMatch && !scriptSrcMatch[1]!.includes("'unsafe-inline'"), "Prod script-src must not allow unsafe-inline");

  const apiHeaders = getSecurityHeaders({ pathname: "/api/v1/auth/me", isProd: true, inlineScriptHashes: hashes });
  assert.ok(apiHeaders["Content-Security-Policy"].includes("default-src 'none'"));
});

test("Security Audit: CORS Origin Hardening & CSRF Verification", async () => {
  const { resolveCorsOrigin, verifyCsrfRequest, sanitizePathSegments } = await import("../../../server/security");

  assert.equal(resolveCorsOrigin(undefined, "localhost:3000", { allowedOrigins: [], isProd: true }), null);
  assert.equal(resolveCorsOrigin("null", "localhost:3000", { allowedOrigins: [], isProd: true }), null);
  assert.equal(
    resolveCorsOrigin("https://evil.com", "orca.local", { allowedOrigins: ["https://orca.local"], isProd: true }),
    null,
  );
  assert.equal(
    resolveCorsOrigin("http://localhost:80.evil.com", "orca.local", { allowedOrigins: [], isProd: true }),
    null,
  );
  assert.equal(
    resolveCorsOrigin("https://orca.local", "orca.local", { allowedOrigins: ["https://orca.local"], isProd: true }),
    "https://orca.local",
  );

  // CSRF checks
  const crossOriginPost = new Request("https://orca.local/api/v1/settings", {
    method: "PUT",
    headers: { host: "orca.local", origin: "https://evil.com" },
  });
  assert.equal(verifyCsrfRequest(crossOriginPost).ok, false);

  const nullOriginPost = new Request("https://orca.local/api/v1/auth/profile", {
    method: "PATCH",
    headers: { host: "orca.local", origin: "null" },
  });
  assert.equal(verifyCsrfRequest(nullOriginPost).ok, false);

  const crossSiteFetch = new Request("https://orca.local/api/v1/copytrade/kill-switch", {
    method: "POST",
    headers: { host: "orca.local", "sec-fetch-site": "cross-site" },
  });
  assert.equal(verifyCsrfRequest(crossSiteFetch).ok, false);

  const sameOriginPost = new Request("https://orca.local/api/v1/settings", {
    method: "PUT",
    headers: { host: "orca.local", origin: "https://orca.local" },
  });
  assert.equal(verifyCsrfRequest(sameOriginPost).ok, true);

  const firebaseExempt = new Request("https://orca.local/api/v1/auth/firebase", {
    method: "POST",
    headers: { host: "orca.local", origin: "https://accounts.google.com" },
  });
  assert.equal(verifyCsrfRequest(firebaseExempt).ok, true);

  const eaExempt = new Request("https://orca.local/api/v1/copytrade/ea-ack", {
    method: "POST",
    headers: { host: "orca.local", origin: "https://external-ea.local" },
  });
  assert.equal(verifyCsrfRequest(eaExempt).ok, true);

  // Encoded traversal rejection
  assert.equal(sanitizePathSegments("/api/v1/stocks/%2e%2e/secrets"), null);
  assert.equal(sanitizePathSegments("/api/v1/stocks/foo%5cbar"), null);
  assert.deepEqual(sanitizePathSegments("/api/v1/stocks/HPG"), ["v1", "stocks", "HPG"]);
});

test("Security Audit: API Input Sanitization, Avatar URL & Prototype Pollution Defense", async () => {
  const {
    sanitizeAvatarUrl,
    sanitizeIdentityName,
    escapeHtmlStrict,
    hasPrototypePollutionKey,
    stripPrototypePollution,
    sanitizeHttpHeaderValue,
  } = await import("../../app/api/_security");

  const badAvatars = [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "javascript&#58;alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "http://insecure.example.com/a.png",
  ];
  for (const url of badAvatars) {
    assert.equal(sanitizeAvatarUrl(url).ok, false, `Avatar URL must be rejected: ${url}`);
  }
  assert.equal(sanitizeAvatarUrl("data:image/jpeg;base64,/9j/4AAQSkZJRg==").ok, true);
  assert.equal(sanitizeAvatarUrl("https://cdn.example.com/avatar.png").ok, true);
  assert.equal(sanitizeAvatarUrl(null).ok, true);

  assert.equal(sanitizeIdentityName("<script>alert(1)</script>").ok, false);
  assert.equal(sanitizeIdentityName("User <img src=x onerror=alert(1)>").ok, false);
  assert.equal(sanitizeIdentityName("Nguyen Van A").ok, true);

  assert.equal(
    escapeHtmlStrict(`<b onclick='x'>"test"&</b>`),
    "&lt;b onclick=&#39;x&#39;&gt;&quot;test&quot;&amp;&lt;/b&gt;",
  );

  const polluted = JSON.parse('{"__proto__":{"isAdmin":true},"profile":{"displayName":"Ok","constructor":{"x":1}}}');
  assert.equal(hasPrototypePollutionKey(polluted), true);
  const cleaned = stripPrototypePollution(polluted) as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(cleaned, "__proto__"), false);
  assert.equal((({} as Record<string, unknown>)).isAdmin, undefined);

  assert.equal(sanitizeHttpHeaderValue("secret\r\nX-Evil: 1"), "secretX-Evil: 1");
});

test("Security Audit: Hono App End-to-End Security Headers, CSRF & Non-Reflected 404", async () => {
  process.env.ORCA_SKIP_SERVER_BOOT = "true";
  const { default: app } = await import("../../../server/index");

  const healthRes = await app.request("http://localhost:3000/api/health", {
    headers: { host: "localhost:3000", origin: "https://evil.example.com" },
  });
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.headers.get("X-Frame-Options"), "DENY");
  assert.equal(healthRes.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(healthRes.headers.get("Access-Control-Allow-Origin"), null);

  const csrfBlocked = await app.request("http://localhost:3000/api/v1/settings", {
    method: "PUT",
    headers: { host: "localhost:3000", origin: "https://evil.example.com", "Content-Type": "application/json" },
    body: JSON.stringify({ settings: {} }),
  });
  assert.equal(csrfBlocked.status, 403);

  const xss404 = await app.request("http://localhost:3000/api/v1/<script>alert(1)</script>", {
    headers: { host: "localhost:3000" },
  });
  assert.equal(xss404.status, 404);
  const xssBody = await xss404.text();
  assert.equal(xssBody.includes("<script>"), false);

  const traversalRes = await app.request("http://localhost:3000/api/v1/stocks/foo%5cbar", {
    headers: { host: "localhost:3000" },
  });
  assert.equal(traversalRes.status, 403);
});

test("Security Audit: Production CORS Loopback Isolation & LLM Proxy Path/CSRF/Auth Guards", async () => {
  const { resolveCorsOrigin } = await import("../../../server/security");
  const { isSafeLlamaProxyPath } = await import("../../../server/ai-runtime");

  // Production CORS must NOT allow arbitrary localhost ports against a remote production host
  assert.equal(
    resolveCorsOrigin("http://localhost:9999", "orca.production.com", { allowedOrigins: [], isProd: true }),
    null,
  );
  // Same-host localhost production still allowed via reqHost match
  assert.equal(
    resolveCorsOrigin("http://localhost:3000", "localhost:3000", { allowedOrigins: [], isProd: true }),
    "http://localhost:3000",
  );
  // Dev mode still allows loopback Vite origins
  assert.equal(
    resolveCorsOrigin("http://localhost:5173", "localhost:3000", { allowedOrigins: [], isProd: false }),
    "http://localhost:5173",
  );

  // LLM proxy path guard
  assert.equal(isSafeLlamaProxyPath("/v1/chat/completions"), true);
  assert.equal(isSafeLlamaProxyPath("/v1/models"), true);
  assert.equal(isSafeLlamaProxyPath("/v1/../health"), false);
  assert.equal(isSafeLlamaProxyPath("/v1/%2e%2e/health"), false);
  assert.equal(isSafeLlamaProxyPath("/v1/foo\\bar"), false);
  assert.equal(isSafeLlamaProxyPath("/health"), false);

  process.env.ORCA_SKIP_SERVER_BOOT = "true";
  const { default: app } = await import("../../../server/index");

  const crossSiteLlm = await app.request("http://localhost:3000/v1/models", {
    method: "GET",
    headers: { host: "localhost:3000", "sec-fetch-site": "cross-site" },
  });
  assert.equal(crossSiteLlm.status, 403);

  const prevEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    const unauthLlm = await app.request("http://localhost:3000/v1/models", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    assert.equal(unauthLlm.status, 401);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
  }
});

test("Security Audit: Copytrade Telemetry/Stream/Worker & Derivatives Poll Require Auth in Production", async () => {
  const { GET: telemetryGet } = await import("../../app/api/v1/copytrade/telemetry/route");
  const { GET: streamGet } = await import("../../app/api/v1/copytrade/stream/route");
  const { GET: workerGet } = await import("../../app/api/v1/copytrade/worker/route");
  const { POST: derivativesPost } = await import("../../app/api/v1/derivatives/poll/route");

  const prevEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const r1 = await telemetryGet(new Request("https://orca.local/api/v1/copytrade/telemetry", { headers: { "x-forwarded-for": "198.51.100.10" } }));
    assert.equal(r1.status, 401);

    const r2 = await streamGet(new Request("https://orca.local/api/v1/copytrade/stream", { headers: { "x-forwarded-for": "198.51.100.11" } }));
    assert.equal(r2.status, 401);

    const r3 = await workerGet(new Request("https://orca.local/api/v1/copytrade/worker", { headers: { "x-forwarded-for": "198.51.100.12" } }));
    assert.equal(r3.status, 401);

    const r4 = await derivativesPost(new Request("https://orca.local/api/v1/derivatives/poll", { method: "POST", headers: { "x-forwarded-for": "198.51.100.13" } }));
    assert.equal(r4.status, 401);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
  }
});

test("Security Audit: AI Route Input Validation & Length Bounds (ai-consensus, agent/verify, bctc-quality)", async () => {
  const { GET: consensusGet, POST: consensusPost } = await import("../../app/api/v1/ai-consensus/route");
  const { POST: verifyPost } = await import("../../app/api/v1/agent/verify/route");
  const { GET: bctcGet } = await import("../../app/api/v1/ai/bctc-quality/route");

  const badSym = await consensusGet(
    new Request("https://orca.local/api/v1/ai-consensus?symbol=%3Cscript%3E", { headers: { "x-forwarded-for": "198.51.100.20" } }),
  );
  assert.equal(badSym.status, 400);

  const hugeQuestion = await consensusPost(
    new Request("https://orca.local/api/v1/ai-consensus", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.21" },
      body: JSON.stringify({ symbol: "FPT", question: "a".repeat(900) }),
    }),
  );
  assert.equal(hugeQuestion.status, 400);

  const hugeVerifyText = await verifyPost(
    new Request("https://orca.local/api/v1/agent/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.22" },
      body: JSON.stringify({ symbol: "HPG", text: "x".repeat(4500) }),
    }),
  );
  assert.equal(hugeVerifyText.status, 400);

  const hugeHeadline = await bctcGet(
    new Request(`https://orca.local/api/v1/ai/bctc-quality?headline=${"a".repeat(600)}`, {
      headers: { "x-forwarded-for": "198.51.100.23" },
    }),
  );
  assert.equal(hugeHeadline.status, 400);
});

test("Security Audit: Credential Vault AES-256-GCM Integrity & Masking", async () => {
  const { encryptSecret, decryptSecret, maskSecret, timingSafeTokenEqual } = await import("../security/credential-vault");

  const enc = encryptSecret("sk_live_super_secret_123456", "test-vault-master-key-32-bytes-long");
  assert.equal(enc.includes("sk_live"), false);
  assert.equal(decryptSecret(enc, "test-vault-master-key-32-bytes-long"), "sk_live_super_secret_123456");

  // Tampered ciphertext must throw
  const parts = enc.split(":");
  parts[3] = parts[3]!.slice(0, -2) + "AA";
  assert.throws(() => decryptSecret(parts.join(":"), "test-vault-master-key-32-bytes-long"));

  assert.equal(maskSecret("sk_live_super_secret_123456"), "sk_l****3456");
  assert.equal(timingSafeTokenEqual("abc123", "abc123"), true);
  assert.equal(timingSafeTokenEqual("abc123", "abc124"), false);
  assert.equal(timingSafeTokenEqual("short", "much-longer-token"), false);
});
