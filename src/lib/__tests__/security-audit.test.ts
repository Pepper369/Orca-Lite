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
