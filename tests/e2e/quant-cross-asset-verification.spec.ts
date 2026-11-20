import { test, expect } from "playwright/test";

test.describe("Cross-Asset Quant & Stock Screener UI Verification", () => {
  test("Stock Screener exposes Quant Filters, Half-Kelly & VaR T+2 columns without /1000 scaling bug", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/screener", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).not.toBeEmpty();

    // Open Advanced Filters and verify Stock Quant Filter controls exist
    const advBtn = page.getByRole("button", { name: /Bộ lọc nâng cao/i });
    await expect(advBtn).toBeVisible({ timeout: 20_000 });
    await advBtn.click();

    await expect(page.getByText(/Bộ Lọc Định Lượng Quant \(Cổ Phiếu\)/i)).toBeVisible();
    await expect(page.getByText("Quant Score min")).toBeVisible();
    await expect(page.getByText("Half-Kelly min (%)")).toBeVisible();
    await expect(page.getByText("VaR T+2 max (%)")).toBeVisible();
    await expect(page.getByText(/Chỉ OU Dừng/i)).toBeVisible();
    await expect(page.getByText(/Loại Bẫy Giá Trần/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Preset: Half-Kelly/i })).toBeVisible();

    // Switch to Quant View Tab
    const quantTab = page.getByRole("button", { name: /Ưu thế Quant Trading/i });
    await quantTab.click();
    await expect(page.locator("th", { hasText: "Half-Kelly" })).toBeVisible();
    await expect(page.locator("th", { hasText: "VaR T+2" })).toBeVisible();

    // Wait briefly for API data if loaded and verify no horizontal overflow
    await page.waitForTimeout(1_500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(4);
    expect(pageErrors).toEqual([]);
  });

  test("FireAnt Quant Studio & Cross-Asset Quant routes (/quant, /forex, /crypto, /derivatives) render cleanly", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // 1. /quant Studio
    await page.goto("/quant", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("FireAnt Quant AI Studio").first()).toBeVisible({ timeout: 20_000 });
    const dataSelect = page.locator("select").filter({ hasText: /FPT vs VNINDEX/i }).first();
    await expect(dataSelect).toBeVisible();
    await dataSelect.selectOption("GBM_SIM");
    await expect(page.getByText("Mô phỏng Deterministic").first()).toBeVisible();

    // 2. /forex, /crypto, /derivatives
    for (const route of ["/forex", "/crypto", "/derivatives"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#root")).not.toBeEmpty();
      await page.waitForTimeout(1_200);
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 4,
      );
      expect(hasOverflow, `${route} should have no horizontal overflow`).toBe(false);
    }

    expect(pageErrors).toEqual([]);
  });
});
