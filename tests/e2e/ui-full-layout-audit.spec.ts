import { test, expect, type Page } from "playwright/test";

interface RouteUiAudit {
  route: string;
  viewport: string;
  loadMs: number;
  pageErrors: string[];
  consoleErrors: string[];
  failedApiCount: number;
  failedApis: string[];
  hasHorizontalOverflow: boolean;
  overflowPx: number;
  scrollHeight: number;
  viewportHeight: number;
  scrollScreens: number;
  domNodes: number;
  h1Count: number;
  firstHeadingText: string;
  emptyMain: boolean;
  overlappingFixedCount: number;
  tinyTextCount: number;
  sidebarVisible: boolean;
}

const ALL_ROUTES = [
  "/",
  "/terminal",
  "/stocks",
  "/stocks/sectors",
  "/stocks/FPT",
  "/stocks/FPT/financials",
  "/stocks/FPT/fundamentals",
  "/stocks/FPT/valuation",
  "/stocks/FPT/profile",
  "/derivatives",
  "/forex",
  "/forex/XAUUSD",
  "/crypto",
  "/crypto/BTCUSDT",
  "/commodities",
  "/macro-economic",
  "/currency-interest-rate",
  "/screener",
  "/heatmap",
  "/quant",
  "/copytrade",
  "/earnings",
  "/news",
  "/reports",
  "/agent",
  "/portfolio",
  "/watchlist",
  "/journal",
  "/personal-finance",
  "/market",
  "/system",
  "/settings",
  "/login",
  "/register",
];

const MOBILE_PRIORITY_ROUTES = [
  "/",
  "/stocks",
  "/stocks/FPT",
  "/screener",
  "/derivatives",
  "/forex",
  "/forex/XAUUSD",
  "/crypto",
  "/crypto/BTCUSDT",
  "/quant",
  "/portfolio",
  "/personal-finance",
  "/agent",
  "/terminal",
];

async function auditRoute(page: Page, route: string, viewportLabel: string): Promise<RouteUiAudit> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedApis: string[] = [];

  const onPageError = (err: Error) => pageErrors.push(err.message.slice(0, 160));
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text().slice(0, 160));
    }
  };
  const onResponse = (res: { url: () => string; status: () => number }) => {
    const url = res.url();
    if (url.includes("/api/") && res.status() >= 500) {
      failedApis.push(`${res.status()} ${new URL(url).pathname}`);
    }
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("response", onResponse);

  const t0 = performance.now();
  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 });
  // Wait briefly for lazy chunk + initial paint/layout
  await page.waitForTimeout(900);
  const loadMs = Math.round(performance.now() - t0);

  const metrics = await page.evaluate(() => {
    const docEl = document.documentElement;
    const main = document.querySelector("main") || document.body;
    const mainRect = main.getBoundingClientRect();
    const docOverflow = docEl.scrollWidth - docEl.clientWidth;
    const mainOverflow = main.scrollWidth - main.clientWidth;
    const overflowPx = Math.max(docOverflow, mainOverflow);

    const scrollHeight = Math.max(main.scrollHeight, document.body.scrollHeight);
    const viewportHeight = window.innerHeight;

    const headings = Array.from(document.querySelectorAll("h1, h2"));
    const h1Count = document.querySelectorAll("h1").length;
    const firstHeadingText = (headings[0]?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);

    const textLen = (main.textContent || "").trim().length;
    const emptyMain = textLen < 20;

    // Count elements with font-size < 10px that are visible
    let tinyTextCount = 0;
    const allEls = Array.from(main.querySelectorAll("span, p, div, td, th, button, a"));
    for (let i = 0; i < Math.min(allEls.length, 600); i++) {
      const el = allEls[i];
      if (el.children.length === 0 && (el.textContent || "").trim().length > 0) {
        const style = window.getComputedStyle(el);
        const fs = parseFloat(style.fontSize);
        if (fs > 0 && fs < 10 && style.display !== "none" && style.visibility !== "hidden") {
          tinyTextCount++;
        }
      }
    }

    // Check overlapping fixed elements (e.g. bottom nav vs floating widget)
    const fixedEls = Array.from(document.querySelectorAll("*")).filter((el) => {
      const st = window.getComputedStyle(el);
      if (st.position !== "fixed" || st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 20 && r.height > 20 && r.width < window.innerWidth * 0.98;
    });
    let overlappingFixedCount = 0;
    const bottomNav = document.querySelector(".orca-bottom-nav");
    if (bottomNav) {
      const bnRect = bottomNav.getBoundingClientRect();
      if (bnRect.height > 0) {
        for (const el of fixedEls) {
          if (el === bottomNav || bottomNav.contains(el)) continue;
          const r = el.getBoundingClientRect();
          const overlaps = !(r.right < bnRect.left || r.left > bnRect.right || r.bottom < bnRect.top || r.top > bnRect.bottom);
          if (overlaps) overlappingFixedCount++;
        }
      }
    }

    const aside = document.querySelector("aside.orca-aside");
    const sidebarVisible = aside ? window.getComputedStyle(aside).display !== "none" : false;

    return {
      overflowPx: Math.max(0, Math.round(overflowPx)),
      hasHorizontalOverflow: overflowPx > 4,
      scrollHeight: Math.round(scrollHeight),
      viewportHeight,
      scrollScreens: Math.round((scrollHeight / Math.max(1, viewportHeight)) * 10) / 10,
      domNodes: document.querySelectorAll("*").length,
      h1Count,
      firstHeadingText,
      emptyMain,
      overlappingFixedCount,
      tinyTextCount,
      sidebarVisible,
      mainWidth: Math.round(mainRect.width),
    };
  });

  page.off("pageerror", onPageError);
  page.off("console", onConsole);
  page.off("response", onResponse);

  return {
    route,
    viewport: viewportLabel,
    loadMs,
    pageErrors,
    consoleErrors,
    failedApiCount: failedApis.length,
    failedApis: [...new Set(failedApis)],
    hasHorizontalOverflow: metrics.hasHorizontalOverflow,
    overflowPx: metrics.overflowPx,
    scrollHeight: metrics.scrollHeight,
    viewportHeight: metrics.viewportHeight,
    scrollScreens: metrics.scrollScreens,
    domNodes: metrics.domNodes,
    h1Count: metrics.h1Count,
    firstHeadingText: metrics.firstHeadingText,
    emptyMain: metrics.emptyMain,
    overlappingFixedCount: metrics.overlappingFixedCount,
    tinyTextCount: metrics.tinyTextCount,
    sidebarVisible: metrics.sidebarVisible,
  };
}

test.describe("Orca-Lite Full UI & Layout Audit (All Pages)", () => {
  test("Desktop 1440x900 — Audit all 34 routes", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const results: RouteUiAudit[] = [];
    for (const route of ALL_ROUTES) {
      const r = await auditRoute(page, route, "desktop-1440");
      results.push(r);
    }

    console.log("\n=== DESKTOP 1440x900 FULL UI AUDIT ===");
    for (const r of results) {
      const flags = [
        r.pageErrors.length ? `PAGE_ERR(${r.pageErrors.length})` : "",
        r.failedApiCount ? `API_5XX(${r.failedApiCount})` : "",
        r.hasHorizontalOverflow ? `H_OVERFLOW(${r.overflowPx}px)` : "",
        r.emptyMain ? "EMPTY_MAIN" : "",
        r.scrollScreens > 4.5 ? `LONG_SCROLL(${r.scrollScreens}x)` : "",
        r.domNodes > 2500 ? `HEAVY_DOM(${r.domNodes})` : "",
        r.h1Count === 0 ? "NO_H1" : "",
      ].filter(Boolean);
      console.log(
        `${r.route.padEnd(28)} | ${String(r.loadMs).padStart(4)}ms | DOM:${String(r.domNodes).padStart(4)} | ${String(r.scrollScreens).padStart(4)}xH | H1:${r.h1Count} | ${flags.length ? flags.join(", ") : "OK"}`,
      );
      if (r.pageErrors.length) console.log(`   -> pageErrors: ${r.pageErrors.join(" ; ")}`);
      if (r.failedApis.length) console.log(`   -> failedApis: ${r.failedApis.join(" ; ")}`);
    }

    const totalPageErrors = results.reduce((s, r) => s + r.pageErrors.length, 0);
    const emptyPages = results.filter((r) => r.emptyMain).map((r) => r.route);
    console.log(`\n[SUMMARY DESKTOP] Routes: ${results.length} | PageErrors: ${totalPageErrors} | EmptyPages: ${emptyPages.length} | H-Overflow: ${results.filter((r) => r.hasHorizontalOverflow).length}`);

    expect(totalPageErrors, "Zero uncaught page errors across all desktop routes").toBe(0);
    expect(emptyPages, "No empty page renders").toEqual([]);
  });

  test("Mobile 390x844 — Audit 14 priority routes", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });

    const results: RouteUiAudit[] = [];
    for (const route of MOBILE_PRIORITY_ROUTES) {
      const r = await auditRoute(page, route, "mobile-390");
      results.push(r);
    }

    console.log("\n=== MOBILE 390x844 UI AUDIT ===");
    for (const r of results) {
      const flags = [
        r.pageErrors.length ? `PAGE_ERR(${r.pageErrors.length})` : "",
        r.hasHorizontalOverflow ? `H_OVERFLOW(${r.overflowPx}px)` : "",
        r.overlappingFixedCount ? `FIXED_OVERLAP(${r.overlappingFixedCount})` : "",
        r.emptyMain ? "EMPTY_MAIN" : "",
        r.scrollScreens > 6 ? `LONG_SCROLL(${r.scrollScreens}x)` : "",
      ].filter(Boolean);
      console.log(
        `${r.route.padEnd(24)} | ${String(r.loadMs).padStart(4)}ms | DOM:${String(r.domNodes).padStart(4)} | ${String(r.scrollScreens).padStart(4)}xH | ${flags.length ? flags.join(", ") : "OK"}`,
      );
    }

    const totalPageErrors = results.reduce((s, r) => s + r.pageErrors.length, 0);
    console.log(`\n[SUMMARY MOBILE] Routes: ${results.length} | PageErrors: ${totalPageErrors} | H-Overflow: ${results.filter((r) => r.hasHorizontalOverflow).length} | FixedOverlap: ${results.filter((r) => r.overlappingFixedCount > 0).length}`);

    expect(totalPageErrors, "Zero uncaught page errors across mobile routes").toBe(0);
  });
});
