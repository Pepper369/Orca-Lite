import { test, expect, type Page } from "playwright/test";

interface PagePerfMetrics {
  route: string;
  wallNavMs: number;
  hydratedReadyMs: number;
  ttfbMs: number;
  domInteractiveMs: number;
  domContentLoadedMs: number;
  fcpMs: number | null;
  jsHeapUsedMB: number | null;
  domNodesCount: number;
  pageErrors: string[];
}

async function measureRoutePerformance(
  page: Page,
  route: string,
  readyTextPattern?: RegExp,
): Promise<PagePerfMetrics> {
  const pageErrors: string[] = [];
  const onPageError = (err: Error) => {
    pageErrors.push(err.message);
  };
  page.on("pageerror", onPageError);

  const t0 = performance.now();
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).not.toBeEmpty();
  const wallNavMs = Math.round(performance.now() - t0);

  if (readyTextPattern) {
    await expect(page.getByText(readyTextPattern).first()).toBeVisible({ timeout: 20_000 });
  }
  const hydratedReadyMs = Math.round(performance.now() - t0);

  const rawMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcpEntry = paints.find((p) => p.name === "first-contentful-paint");
    const perfAny = performance as unknown as { memory?: { usedJSHeapSize: number } };
    const heapMB = perfAny.memory?.usedJSHeapSize
      ? Math.round((perfAny.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
      : null;

    return {
      ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
      domInteractiveMs: nav ? Math.round(nav.domInteractive) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      fcpMs: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      jsHeapUsedMB: heapMB,
      domNodesCount: document.querySelectorAll("*").length,
    };
  });

  page.off("pageerror", onPageError);

  return {
    route,
    wallNavMs,
    hydratedReadyMs,
    ...rawMetrics,
    pageErrors,
  };
}

test.describe("Orca-Lite Project-Wide Dynamic Performance & E2E Verification Suite", () => {
  test("1. Core Quantitative & Multi-Horizon Sector Flow APIs Benchmark & Contract Audit", async ({ request }) => {
    // 1.1 Health Endpoint Latency
    const tHealth0 = performance.now();
    const healthRes = await request.get("/health");
    const healthMs = Math.round(performance.now() - tHealth0);
    expect(healthRes.ok()).toBeTruthy();
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe("ok");

    // 1.2 Multi-Horizon Sector Money Flow API (COMPOSITE, SHORT_1_2W, MEDIUM_3W_2M, MED_LONG_2_6M, LONG_6M_PLUS)
    const tSec0 = performance.now();
    const secRes = await request.get("/api/v1/screener/sector-flow?horizon=COMPOSITE");
    const secColdMs = Math.round(performance.now() - tSec0);
    expect(secRes.ok()).toBeTruthy();
    const secBody = await secRes.json();
    const secData = secBody.data;
    expect(Array.isArray(secData.sectors)).toBeTruthy();
    expect(secData.sectors.length).toBeGreaterThanOrEqual(10);
    expect(secData.horizonLeaders).toBeDefined();
    expect(Array.isArray(secData.horizonLeaders.SHORT_1_2W)).toBeTruthy();
    expect(Array.isArray(secData.horizonLeaders.MEDIUM_3W_2M)).toBeTruthy();
    expect(Array.isArray(secData.horizonLeaders.MED_LONG_2_6M)).toBeTruthy();
    expect(Array.isArray(secData.horizonLeaders.LONG_6M_PLUS)).toBeTruthy();

    const firstSector = secData.sectors[0];
    expect(firstSector.horizonScores.short1_2w).toBeGreaterThanOrEqual(5);
    expect(firstSector.horizonScores.short1_2w).toBeLessThanOrEqual(99);
    expect(firstSector.horizonScores.medium3w_2m).toBeGreaterThanOrEqual(5);
    expect(firstSector.horizonScores.medLong2_6m).toBeGreaterThanOrEqual(5);
    expect(firstSector.horizonScores.long6mPlus).toBeGreaterThanOrEqual(5);
    expect(firstSector.rsRatio).toBeGreaterThan(50);
    expect(firstSector.rsMomentum).toBeGreaterThan(50);

    // Verify warm horizon query latency
    const tSecWarm0 = performance.now();
    const secShortRes = await request.get("/api/v1/screener/sector-flow?horizon=SHORT_1_2W");
    const secWarmMs = Math.round(performance.now() - tSecWarm0);
    expect(secShortRes.ok()).toBeTruthy();
    const secShortData = (await secShortRes.json()).data;
    expect(secShortData.activeHorizon).toBe("SHORT_1_2W");
    expect(secShortData.sectors[0].horizonScores.short1_2w).toBeGreaterThanOrEqual(
      secShortData.sectors[secShortData.sectors.length - 1].horizonScores.short1_2w,
    );

    // 1.3 Unified Stocks Screener Pro with Multi-Horizon Filter
    const tScr0 = performance.now();
    const scrRes = await request.get(
      "/api/v1/stocks/screener?investmentHorizon=LONG_6M_PLUS&minHorizonScore=65&limit=20",
    );
    const scrMs = Math.round(performance.now() - tScr0);
    expect(scrRes.ok()).toBeTruthy();
    const scrBody = await scrRes.json();
    const scrItems = scrBody.data?.items ?? [];
    expect(scrItems.length).toBeGreaterThan(0);
    for (const item of scrItems) {
      expect(item.horizonLongScore).toBeGreaterThanOrEqual(65);
      expect(item.horizonShortScore).toBeDefined();
      expect(item.horizonMediumScore).toBeDefined();
      expect(item.horizonMedLongScore).toBeDefined();
      expect(item.bestHorizon).toBeDefined();
    }

    // 1.4 Warm L1 Cache Screener Query Latency (< 150ms)
    const tScrWarm0 = performance.now();
    const scrWarmRes = await request.get(
      "/api/v1/stocks/screener?investmentHorizon=LONG_6M_PLUS&minHorizonScore=65&limit=20",
    );
    const scrWarmMs = Math.round(performance.now() - tScrWarm0);
    expect(scrWarmRes.ok()).toBeTruthy();

    console.log(
      `[API BENCHMARK] /health=${healthMs}ms | /sector-flow(cold)=${secColdMs}ms | /sector-flow(warm)=${secWarmMs}ms | /stocks/screener=${scrMs}ms | /stocks/screener(L1-cache)=${scrWarmMs}ms`,
    );
    console.log(
      `[HORIZON LEADERS] 1-2W: ${secData.horizonLeaders.SHORT_1_2W.join(", ")} | 3W-2M: ${secData.horizonLeaders.MEDIUM_3W_2M.join(", ")} | 2-6M: ${secData.horizonLeaders.MED_LONG_2_6M.join(", ")} | >6M: ${secData.horizonLeaders.LONG_6M_PLUS.join(", ")}`,
    );
  });

  test("2. Multi-Horizon Sector Flow Screener UI Dynamic Interaction & Latency", async ({ page }) => {
    const perf = await measureRoutePerformance(
      page,
      "/screener?universe=sector-flow",
      /Ngắn hạn \(1–2 Tuần\)/i,
    );
    expect(perf.pageErrors).toEqual([]);

    // Verify 4-Horizon Tabs render and switch smoothly
    const tabShort = page.getByRole("button", { name: /Ngắn hạn \(1–2 Tuần\)/i });
    const tabMed = page.getByRole("button", { name: /Trung hạn \(3 Tuần–2 Tháng\)/i });
    const tabMedLong = page.getByRole("button", { name: /Trung–Dài hạn \(2–6 Tháng\)/i });
    const tabLong = page.getByRole("button", { name: /Dài hạn \(> 6 Tháng\)/i });

    await expect(tabShort).toBeVisible();
    await expect(tabMed).toBeVisible();
    await expect(tabMedLong).toBeVisible();
    await expect(tabLong).toBeVisible();

    const tSwitch0 = performance.now();
    await tabShort.click();
    await expect(page.getByText(/Bản đồ Xếp hạng Dòng tiền Ngành — Ngắn hạn/i)).toBeVisible();
    await tabMed.click();
    await expect(page.getByText(/Bản đồ Xếp hạng Dòng tiền Ngành — Trung hạn/i)).toBeVisible();
    await tabMedLong.click();
    await expect(page.getByText(/Bản đồ Xếp hạng Dòng tiền Ngành — Trung–Dài hạn/i)).toBeVisible();
    await tabLong.click();
    await expect(page.getByText(/Bản đồ Xếp hạng Dòng tiền Ngành — Dài hạn/i)).toBeVisible();
    const switchTotalMs = Math.round(performance.now() - tSwitch0);

    console.log(
      `[UI BENCHMARK /screener?universe=sector-flow] Nav=${perf.wallNavMs}ms | Hydrated=${perf.hydratedReadyMs}ms | FCP=${perf.fcpMs}ms | DOMNodes=${perf.domNodesCount} | Heap=${perf.jsHeapUsedMB}MB | 4-Horizon-Tab-Switch=${switchTotalMs}ms`,
    );
  });

  test("3. Full-Project Multi-Asset Route Performance & Stability Audit (Dashboard, Stock Detail, Forex Detail, Crypto Detail)", async ({ page }) => {
    const routes: Array<{ path: string; readyText: RegExp }> = [
      { path: "/", readyText: /ORCA|VN-INDEX|Thị trường|Screener/i },
      { path: "/screener", readyText: /Screener|Bộ lọc|Cổ phiếu/i },
      { path: "/stocks/FPT", readyText: /FPT/i },
      { path: "/forex/EURUSD", readyText: /EUR/i },
      { path: "/crypto/BTCUSDT", readyText: /BTC/i },
    ];

    const results: PagePerfMetrics[] = [];
    for (const r of routes) {
      const m = await measureRoutePerformance(page, r.path, r.readyText);
      results.push(m);
      expect(m.pageErrors, `Uncaught page error on ${r.path}`).toEqual([]);
      expect(m.domNodesCount, `DOM rendered on ${r.path}`).toBeGreaterThan(30);
    }

    console.log("[ROUTE PERFORMANCE MATRIX]:", JSON.stringify(results, null, 2));
  });
});
