import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeCsvCell,
  safeJsonParse,
  sanitizeExternalUrl,
  sanitizeImageUrl,
  sanitizeText,
} from "../sanitize";
import { parseFeedXml } from "../../providers/news";
import { fetchTradingViewIdeas } from "../../providers/tradingview-ideas";
import { mapVndAnalyticReport, mapVndNewsRow } from "../../providers/vndirect-news";
import {
  exportDataAsCsv,
  sanitizeStoredAssumptions,
  sanitizeStoredProfile,
} from "../../../features/personal-finance/storage/financeStore";

test("sanitizeExternalUrl blocks advanced XSS scheme bypasses and allows clean http(s)", () => {
  const blocked = [
    "",
    "   ",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "  javascript&#58;alert(1)",
    "javascript&#0000058;alert(1)",
    "javascript&#58alert(1)",
    "javascript&#x3a;alert(1)",
    "javascript&colon;alert(1)",
    "&amp;#106;avascript:alert(1)",
    "%6a%61%76%61%73%63%72%69%70%74:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "//evil.example/redirect",
    "\\\\evil.example\\share",
    "/\\evil.example",
    "https://user:pass@evil.example/path",
    "http:alert(1)",
  ];
  for (const payload of blocked) {
    assert.equal(sanitizeExternalUrl(payload), null, `Expected null for ${JSON.stringify(payload)}`);
  }

  assert.equal(sanitizeExternalUrl("https://cafef.vn/tin-tuc.chn?a=1"), "https://cafef.vn/tin-tuc.chn?a=1");
  assert.equal(sanitizeExternalUrl("http://example.com/a"), "http://example.com/a");
});

test("sanitizeImageUrl blocks SVG, data:, and javascript: URLs", () => {
  assert.equal(sanitizeImageUrl("https://cdn.example.com/logo.svg"), null);
  assert.equal(sanitizeImageUrl("https://cdn.example.com/logo.svgz"), null);
  assert.equal(sanitizeImageUrl("data:image/svg+xml;utf8,<svg/>"), null);
  assert.equal(sanitizeImageUrl("https://cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");
});

test("sanitizeText removes script/style/svg blocks and entity-encoded tags safely", () => {
  const raw = "<script>alert(1)</script><style>body{}</style>&lt;img src=x onerror=alert(1)&gt;Tin <b>tức</b> &#128640;";
  const clean = sanitizeText(raw);
  assert.ok(!clean.includes("alert(1)"));
  assert.ok(!clean.includes("<"));
  assert.ok(clean.includes("Tin tức"));
  assert.ok(clean.includes("🚀"));
});

test("news parseFeedXml blocks Atom javascript: links and script payloads", () => {
  const xml = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Bản tin XSS bị chặn hoàn toàn</title>
        <link href="  javascript&#58;alert(1)" />
        <summary><![CDATA[<script>alert(1)</script>Nội dung hợp lệ]]></summary>
      </entry>
      <entry>
        <title>Bản tin HPG tăng trưởng quý 3</title>
        <link href="https://cafef.vn/hpg-q3.chn" />
        <summary>Doanh thu HPG tăng mạnh.</summary>
      </entry>
    </feed>
  `;
  const articles = parseFeedXml(
    { name: "TestFeed", url: "https://cafef.vn/rss", category: "market", lang: "vi" },
    xml,
  );
  assert.equal(articles.length, 1);
  assert.equal(articles[0]!.url, "https://cafef.vn/hpg-q3.chn");
});

test("tradingview-ideas sanitizes poisoned RSS links, images, descriptions, and bad dates", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      `<rss><channel><item>
        <title><![CDATA[<script>alert(1)</script>Phân tích FPT]]></title>
        <link>javascript&#58;alert(1)</link>
        <dc:creator><![CDATA[<b>TraderA</b>]]></dc:creator>
        <pubDate>NOT_A_DATE</pubDate>
        <description><![CDATA[<img src="https://evil.example/xss.svg" onerror="alert(1)"><img src="https://s3.tradingview.com/chart.png">Mua FPT]]></description>
      </item></channel></rss>`,
      { status: 200 },
    )) as typeof fetch;

  try {
    const ideas = await fetchTradingViewIdeas("FPT");
    assert.equal(ideas.length, 1);
    assert.equal(ideas[0]!.url, "https://www.tradingview.com/symbols/FPT/ideas/");
    assert.equal(ideas[0]!.previewImageUrl, "https://s3.tradingview.com/chart.png");
    assert.ok(!ideas[0]!.title.includes("alert(1)"));
    assert.ok(!ideas[0]!.author.includes("<"));
    assert.ok(!Number.isNaN(Date.parse(ideas[0]!.timestamp)));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("vndirect-news blocks javascript:alert(1)//.pdf and unsafe attachment URLs", () => {
  const rep = mapVndAnalyticReport("HPG", {
    newsTitle: "Báo cáo phân tích HPG",
    newsSourceLink: "javascript:alert(1)",
    attachments: [{ url: "javascript:alert(1)//.pdf" }],
  });
  assert.ok(rep);
  assert.equal(rep.url, "https://dstock.vndirect.com.vn/tin-tuc-ma/HPG");
  assert.equal(rep.pdfUrl, null);

  const row = mapVndNewsRow("VCB", {
    newsTitle: "Tin VCB",
    url: "data:text/html,<script>alert(1)</script>",
  });
  assert.ok(row);
  assert.equal(row.url, "https://dstock.vndirect.com.vn/tin-tuc-ma/VCB");
});

test("personal-finance safeJsonParse strips __proto__ and exportDataAsCsv neutralizes formulas", () => {
  const polluted = safeJsonParse<Record<string, unknown>>(
    '{"__proto__":{"polluted":true},"constructor":{"x":1},"birthYear":1990}',
  );
  assert.ok(polluted);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(polluted, "__proto__"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(polluted, "constructor"), false);

  const prof = sanitizeStoredProfile({ birthYear: "NaN", dependentsCount: 999, updatedAt: "<script>x</script>01/01" });
  assert.equal(prof.birthYear, 1996);
  assert.equal(prof.dependentsCount, 20);
  assert.equal(prof.updatedAt, "01/01");

  const assump = sanitizeStoredAssumptions({ inflationRate: Infinity, retirementAge: 10 });
  assert.equal(assump.inflationRate, 3.5);
  assert.equal(assump.retirementAge, 40);

  assert.equal(escapeCsvCell("=CMD|'/C calc'!A0"), "'=CMD|'/C calc'!A0");
  assert.equal(escapeCsvCell("+1+1"), "'+1+1");
  assert.equal(escapeCsvCell(-500000), "-500000");

  const csv = exportDataAsCsv([
    {
      period: "=HYPERLINK(\"http://evil\",\"click\")",
      income: { mandatoryInsurance: { total: 1000 }, personalIncomeTax: 500 },
      metrics: {
        totalGrossIncome: 10000,
        totalNetIncome: 8500,
        totalExpenses: 4000,
        fixedExpenses: 2000,
        monthlySavings: 4500,
        savingsRate: 52.9,
        totalAssets: 100000,
        totalDebt: 0,
        netWorth: 100000,
        healthScore: { total: 80 },
        emergencyFundMonths: 6,
      },
    } as never,
  ]);
  assert.ok(csv.includes("\"'=HYPERLINK"));
});
