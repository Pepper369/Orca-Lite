import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  escapeHtml,
  normalizeExternalWebsite,
  sanitizeHref,
  sanitizeImageSrc,
  sanitizeQuerySymbol,
} from "@/lib/security/xss";

describe("DOM XSS & URL Injection SSOT (src/lib/security/xss.ts)", () => {
  it("contains zero server-only or Node-only imports (client-safe for Vite build)", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/security/xss.ts"), "utf8");
    assert.equal(/["']server-only["']/.test(src), false);
    assert.equal(/from\s+["'](?:node:|fs|path|dns|crypto|child_process)/.test(src), false);
  });

  it("escapeHtml neutralizes &, <, >, \", ' and NUL bytes", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.equal(
      escapeHtml(`<img src="x" onerror='alert(1)'>\u0000 & more`),
      "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp; more",
    );
  });

  it("sanitizeHref blocks javascript:, vbscript:, data:, file:, blob:, entity-encoded, control-char, and protocol-relative bypasses", () => {
    const malicious = [
      "javascript:alert(1)",
      "  JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      "javascript\u0000:alert(1)",
      "javascript&#58;alert(1)",
      "javascript&#x3a;alert(1)",
      "&#106;avascript:alert(1)",
      "javascript&colon;alert(1)",
      "vbscript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "blob:https://evil.com/123",
      "//evil.com/phish",
      "\\\\evil.com\\share",
      "/\\evil.com",
      "",
      "   ",
    ];
    for (const payload of malicious) {
      assert.equal(sanitizeHref(payload), "#", `Expected fallback for ${JSON.stringify(payload)}`);
    }

    assert.equal(sanitizeHref("/stocks/SSI?tab=financials"), "/stocks/SSI?tab=financials");
    assert.equal(sanitizeHref("#section-1"), "#section-1");
    assert.equal(sanitizeHref("https://vnexpress.net/tin-tuc?id=1&a=2"), "https://vnexpress.net/tin-tuc?id=1&a=2");
    assert.equal(sanitizeHref("http://example.com/path"), "http://example.com/path");
    assert.equal(sanitizeHref("/stocks/SSI", { allowRelative: false, fallback: "" }), "");
  });

  it("sanitizeImageSrc blocks SVG data URLs, HTML data URLs, javascript:, and allows only safe raster base64 when opted in", () => {
    const blockedAlways = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
      "data:image/png;charset=utf-8;base64,AAAA",
      "vbscript:1",
      "//evil.com/x.png",
      "/\\evil.com/x.png",
    ];
    for (const payload of blockedAlways) {
      assert.equal(
        sanitizeImageSrc(payload, { allowSafeDataImage: true }),
        "",
        `Expected blocked image src for ${JSON.stringify(payload)}`,
      );
    }

    const rasterDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";
    assert.equal(sanitizeImageSrc(rasterDataUrl), "");
    assert.equal(sanitizeImageSrc(rasterDataUrl, { allowSafeDataImage: true }), rasterDataUrl);
    assert.equal(sanitizeImageSrc("/brand/orca-mark.svg"), "/brand/orca-mark.svg");
    assert.equal(sanitizeImageSrc("https://cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");
  });

  it("sanitizeQuerySymbol prevents parameter/path injection", () => {
    assert.equal(sanitizeQuerySymbol("SSI&studies=evil#x"), "SSIstudiesevilx");
    assert.equal(sanitizeQuerySymbol("HOSE:SSI"), "HOSE:SSI");
    assert.equal(sanitizeQuerySymbol("../../etc/passwd<script>"), "etcpasswdscript");
    assert.equal(sanitizeQuerySymbol("  BTC-USD  "), "BTC-USD");
  });

  it("normalizeExternalWebsite blocks http:alert(1) and javascript: while normalizing bare domains", () => {
    assert.equal(normalizeExternalWebsite("http:alert(1)"), "");
    assert.equal(normalizeExternalWebsite("javascript:alert(1)"), "");
    assert.equal(normalizeExternalWebsite("javascript&#58;alert(1)"), "");
    assert.equal(normalizeExternalWebsite("//evil.com"), "");
    assert.equal(normalizeExternalWebsite("hoaphat.com.vn"), "https://hoaphat.com.vn/");
    assert.equal(normalizeExternalWebsite("https://fpt.com.vn"), "https://fpt.com.vn/");
  });

  it("no inline onerror/onload handlers or local esc() remain in report-print.ts or stock-report.tsx", () => {
    const printSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/report-print.ts"), "utf8");
    const stockReportSrc = fs.readFileSync(path.resolve(process.cwd(), "src/components/stock-report.tsx"), "utf8");
    assert.equal(/onerror=/i.test(printSrc), false);
    assert.equal(/<script>/i.test(printSrc), false);
    assert.equal(/onerror=/i.test(stockReportSrc), false);
    assert.equal(/function esc\(/i.test(printSrc), false);
    assert.equal(/function esc\(/i.test(stockReportSrc), false);
  });
});
