import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { getMultiSourceScreenerData } from "../services/multi-source-screener";
import { fetchOhlcvResilient } from "../services/screener-ohlcv";
import { screenFundamental } from "../services/fundamental-screener";
import { screenValuation } from "../services/valuation-screener";
import { getHot } from "../hot-snapshot";

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

  test("supports server-side pagination and compact projection", async () => {
    const paged = await getMultiSourceScreenerData({ limit: 10, offset: 0, compact: true });
    assert.ok(paged.data.length <= 10, "data length must be <= limit");
    assert.ok((paged.total ?? 0) >= paged.data.length, "total must be >= returned slice");
    const first = paged.data[0];
    assert.ok(first.symbol, "Symbol must exist");
    assert.ok(typeof first.price === "number", "Price must exist");
  });

  test("enforces cross-pillar technical guard on fundamental and valuation screeners", async () => {
    const testSyms = ["VCB", "TCB", "FPT", "HPG", "VHM"];

    // 1. Fundamental Screener with tech guard
    const fundSafe = await screenFundamental({ symbols: testSyms, techGuardOnly: true, limit: 10 });
    for (const row of fundSafe.rows) {
      assert.notEqual(row.techStatus, "BLOCKED", `Stock ${row.symbol} in techGuardOnly must not be BLOCKED`);
    }

    // 2. Valuation Screener with tech guard
    const valSafe = await screenValuation({ symbols: testSyms, techGuardOnly: true, limit: 10 });
    for (const row of valSafe.rows) {
      assert.notEqual(row.techStatus, "BLOCKED", `Stock ${row.symbol} in techGuardOnly must not be BLOCKED`);
    }
  });

  test("verifies L2 persistent hot snapshot persistence for zero cold-start latency", async () => {
    const hotMaster = await getHot("screener-master");
    assert.ok(hotMaster, "screener-master slot must be populated in Hot Snapshot");
    assert.ok(hotMaster.data, "Hot snapshot data must exist");
  });

  test("fetchOhlcvResilient provides resilient cached retrieval", async () => {
    // Benchmark index fetch
    const t0 = Date.now();
    const hit1 = await fetchOhlcvResilient("VNINDEX", 60);
    const elapsed1 = Date.now() - t0;

    assert.ok(Array.isArray(hit1.bars), "bars must be an array");

    // Second call should hit in-memory L1 cache and return near-instantaneously (< 100ms)
    const t1 = Date.now();
    const hit2 = await fetchOhlcvResilient("VNINDEX", 60);
    const elapsed2 = Date.now() - t1;

    assert.ok(Array.isArray(hit2.bars), "cached bars must be an array");
    assert.equal(hit2.bars.length, hit1.bars.length, "Cached bars length must match");
    assert.ok(elapsed2 < 100, `Second fetch should be fast from L1 cache (took ${elapsed2}ms)`);
  });
});

