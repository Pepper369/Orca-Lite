import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { getMultiSourceScreenerData } from "../services/multi-source-screener";
import { fetchOhlcvResilient } from "../services/screener-ohlcv";

describe("Multi-Source Screener & Source Connectivity Resilience", () => {
  test("loads multi-source screener data with rich quant & smart money fields", async () => {
    const res = await getMultiSourceScreenerData();
    assert.ok(res, "Result must not be null");
    assert.ok(Array.isArray(res.data), "data must be an array");
    assert.ok(res.meta, "meta must be present");
    assert.ok(res.data.length > 0, "must return non-empty items");

    // Check presence of rich quant & technical fields
    const sample = res.data[0];
    assert.ok(sample.symbol, "Symbol must be defined");
    assert.ok(typeof sample.price === "number", "Price must be number");
    assert.ok("rsRating" in sample, "rsRating field must be defined");
    assert.ok("smartMoneyScore" in sample, "smartMoneyScore field must be defined");
    assert.ok("orcaMasterScore" in sample, "orcaMasterScore field must be defined");
    assert.ok("isTechnicalBuyApproved" in sample, "isTechnicalBuyApproved field must be defined");
  });

  test("enforces Technical Consistency Guard on multi-source screener items", async () => {
    const res = await getMultiSourceScreenerData();
    for (const item of res.data) {
      // If broken support or death cross, isTechnicalBuyApproved MUST be false
      if (item.isBrokenSupport || item.maSignal === "DEATH_CROSS") {
        assert.equal(
          item.isTechnicalBuyApproved,
          false,
          `Stock ${item.symbol} with broken support or death cross must not be approved for buy`,
        );
      }
    }
  });

  test("fetchOhlcvResilient provides resilient cached retrieval", async () => {
    // Benchmark index fetch
    const t0 = Date.now();
    const hit1 = await fetchOhlcvResilient("VNINDEX", 60);
    const elapsed1 = Date.now() - t0;

    assert.ok(Array.isArray(hit1.bars), "bars must be an array");

    // Second call should hit in-memory L1 cache and return near-instantaneously (< 50ms)
    const t1 = Date.now();
    const hit2 = await fetchOhlcvResilient("VNINDEX", 60);
    const elapsed2 = Date.now() - t1;

    assert.ok(Array.isArray(hit2.bars), "cached bars must be an array");
    assert.equal(hit2.bars.length, hit1.bars.length, "Cached bars length must match");
    assert.ok(elapsed2 < 100, `Second fetch should be fast from L1 cache (took ${elapsed2}ms)`);
  });
});
