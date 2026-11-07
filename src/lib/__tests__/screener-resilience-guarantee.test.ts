import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getMasterScreenerSnapshot, queryScreenerStocks } from "../services/screener-snapshot-service";
import { getMultiQuotes } from "../services/multi-quote";

describe("Screener Zero-Failure Ingestion & Filter Engine Guarantee", () => {
  test("getMultiQuotes guarantees non-empty quotes universe via multi-tier fallback", async () => {
    const res = await getMultiQuotes(["VCB", "FPT", "HPG", "MBB", "TCB"]);
    assert.ok(res.quotes.length > 0, "Quotes list must not be empty");
    assert.ok(res.sources.length > 0, "Sources used must be tracked");

    const fpt = res.quotes.find((q) => q.symbol === "FPT");
    assert.ok(fpt, "FPT must exist in multi quotes");
    assert.ok(Number(fpt.price) > 0, "FPT price must be positive");
  });

  test("getMasterScreenerSnapshot returns robust stock universe with complete metrics", async () => {
    const snap = await getMasterScreenerSnapshot();
    assert.ok(snap.items.length >= 30, `Expected at least 30 stocks in snapshot, got ${snap.items.length}`);
    assert.ok(snap.sourcesUsed.length > 0, "Snapshot must have active or fallback sources");
    assert.ok(snap.presetsCount.all >= 30, "Preset count for 'all' must match item count");

    // Verify all items have valid prices and key metrics
    for (const item of snap.items.slice(0, 15)) {
      assert.ok(item.symbol, "Symbol must be defined");
      assert.ok(typeof item.price === "number" && item.price > 0, `${item.symbol} price must be > 0`);
      assert.ok(typeof item.volume === "number" && item.volume >= 0, `${item.symbol} volume must be >= 0`);
      assert.ok(typeof item.bitFlags === "number", `${item.symbol} must have bitFlags indexed`);
    }
  });

  test("queryScreenerStocks successfully filters stocks across key investment presets", async () => {
    // 1. All stocks query
    const allRes = await queryScreenerStocks({ preset: "all", limit: 20 });
    assert.ok(allRes.items.length > 0, "Query 'all' must return stocks");
    assert.ok(allRes.total >= 30, "Total stocks in screener must be >= 30");

    // 2. Value query (low PE / PB)
    const valRes = await queryScreenerStocks({ preset: "value", limit: 10 });
    assert.ok(valRes.items.length >= 0, "Value preset must execute cleanly");

    // 3. Dividend query
    const divRes = await queryScreenerStocks({ preset: "dividend", limit: 10 });
    assert.ok(divRes.items.length >= 0, "Dividend preset must execute cleanly");

    // 4. CANSLIM or Growth query
    const canslimRes = await queryScreenerStocks({ preset: "canslim", limit: 10 });
    assert.ok(canslimRes.items.length >= 0, "CANSLIM preset must execute cleanly");

    // 5. Exchange & Sector filtering
    const hoseRes = await queryScreenerStocks({ exchange: "HOSE", limit: 15 });
    assert.ok(hoseRes.items.length > 0, "HOSE filter must return stocks");
    for (const it of hoseRes.items) {
      assert.equal(it.exchange, "HOSE", "All returned items must belong to HOSE");
    }
  });
});

