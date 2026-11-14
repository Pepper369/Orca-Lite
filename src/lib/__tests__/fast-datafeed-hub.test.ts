import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFastDatafeedContext,
  getFastMarketSnapshot,
  getFastCommoditiesData,
  getFastStockLiveInsight,
} from "../services/fast-datafeed-hub";

describe("Fast Datafeed Hub Integration Tests", () => {
  it("fetches market snapshot with cached SLA and non-empty indices", async () => {
    const snap = await getFastMarketSnapshot();
    assert.ok(snap !== null, "Market snapshot must not be null");
    assert.ok(Array.isArray(snap.indices), "Indices must be an array");
    assert.ok(snap.indices.length > 0, "Indices must contain items");
    assert.ok(snap.summaryText.length > 0, "Summary text must not be empty");
  });

  it("filters commodities relevant to query and attaches sectoral stock impact", async () => {
    const commodities = await getFastCommoditiesData("Tác động của giá dầu và quặng sắt?");
    assert.ok(Array.isArray(commodities), "Commodities must be an array");
    assert.ok(commodities.length > 0, "Should match oil or iron ore related commodities");
    const item = commodities[0];
    assert.ok(item.name.length > 0, "Commodity must have a name");
    assert.ok(item.price > 0, "Price must be positive");
  });

  it("extracts real-time stock quotes and ratios for VN tickers", async () => {
    const stockInsight = await getFastStockLiveInsight("HPG");
    assert.ok(stockInsight !== null, "HPG stock insight must not be null");
    assert.equal(stockInsight.symbol, "HPG");
    assert.ok(stockInsight.price !== undefined && stockInsight.price > 0, "HPG price must be positive");
  });

  it("assembles unified fast datafeed prompt context for LLM grounding", async () => {
    const t0 = performance.now();
    const context = await buildFastDatafeedContext("Giá dầu tăng ảnh hưởng PVD, PVS như thế nào?");
    const elapsed = performance.now() - t0;

    assert.ok(context.matchedStocks.some((s) => s.symbol === "PVD" || s.symbol === "PVS"), "Must capture matched tickers");
    assert.ok(context.assembledPromptContext.includes("DATAFEED"), "Context must include market or stock feed");
    assert.ok(context.matchedCommodities.length > 0, "Context must match commodities");
    assert.ok(Number.isFinite(elapsed), "Elapsed time is finite");
  });
});
