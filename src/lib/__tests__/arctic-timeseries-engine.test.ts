import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import { ArcticTimeSeriesEngine } from "../engines/arctic-timeseries-engine";

describe("High-Throughput Columnar Time-Series Engine (ArcticDB Parity)", () => {
  it("writeBars & chunking: splits large OHLCV datasets into bounded columnar chunks", () => {
    const store = new ArcticTimeSeriesEngine();
    const bars: OhlcvBar[] = [];

    // Generate 2,500 bars with 60-second intervals
    const baseTime = 1700000000;
    for (let i = 0; i < 2500; i++) {
      bars.push({
        time: baseTime + i * 60,
        open: 100 + i * 0.1,
        high: 101 + i * 0.1,
        low: 99 + i * 0.1,
        close: 100.5 + i * 0.1,
        volume: 5000 + (i % 10) * 100,
      });
    }

    const res = store.writeBars("BTCUSDT", bars, { chunkSize: 1000 });
    assert.equal(res.totalBars, 2500);
    assert.equal(res.chunksWritten, 3, "2500 bars with chunkSize 1000 should write 3 chunks");

    const stats = store.getStorageStats();
    assert.equal(stats.totalSymbols, 1);
    assert.equal(stats.totalChunks, 3);
    assert.equal(stats.totalBars, 2500);
    assert.ok(stats.memoryEstimatedBytes > 0);
  });

  it("readBars & readColumnar: retrieves exact range slices and pure columnar vectors", () => {
    const store = new ArcticTimeSeriesEngine();
    const baseTime = 1000;
    const bars: OhlcvBar[] = Array.from({ length: 100 }, (_, i) => ({
      time: baseTime + i * 10,
      open: 50 + i,
      high: 52 + i,
      low: 49 + i,
      close: 51 + i,
      volume: 1000 * (i + 1),
    }));

    store.writeBars("VN30F1M", bars, { chunkSize: 30 });

    // Range query: time [1200, 1500] -> indices 20 to 50 = 31 bars
    const queried = store.readBars("VN30F1M", { startTime: 1200, endTime: 1500 });
    assert.equal(queried.length, 31);
    assert.equal(queried[0]!.time, 1200);
    assert.equal(queried[queried.length - 1]!.time, 1500);

    // Vectorized Columnar Read
    const columnar = store.readColumnar("VN30F1M", { startTime: 1200, endTime: 1500 });
    assert.equal(columnar.count, 31);
    assert.equal(columnar.closes.length, 31);
    assert.equal(columnar.volumes.length, 31);
    assert.equal(columnar.timestamps[0], 1200);
  });

  it("Point-in-Time asOf & verifyZeroLookahead: eliminates future data leakage during backtesting", () => {
    const store = new ArcticTimeSeriesEngine();
    const bars: OhlcvBar[] = Array.from({ length: 200 }, (_, i) => ({
      time: 1000 + i * 60,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 2000,
    }));

    store.writeBars("ETHUSDT", bars, { chunkSize: 50 });

    // Historical cutoff at bar 100 (time = 1000 + 100 * 60 = 7000)
    const asOfTime = 7000;
    const historicalBars = store.readBars("ETHUSDT", { asOfTimestamp: asOfTime });
    assert.equal(historicalBars.length, 101); // bars 0 to 100

    // Strict Zero-Lookahead Audit
    const auditPass = store.verifyZeroLookahead("ETHUSDT", asOfTime, historicalBars);
    assert.equal(auditPass.isPure, true);
    assert.equal(auditPass.leakedCount, 0);
    assert.equal(auditPass.maxObservedTimestamp, asOfTime);

    // Deliberate Look-ahead violation test: querying without asOf returns future bars
    const unconstrainedBars = store.readBars("ETHUSDT");
    const auditFail = store.verifyZeroLookahead("ETHUSDT", asOfTime, unconstrainedBars);
    assert.equal(auditFail.isPure, false);
    assert.equal(auditFail.leakedCount, 99);
  });

  it("createSnapshot: allows Point-In-Time rollback and historical state isolation", () => {
    const store = new ArcticTimeSeriesEngine();

    // Batch 1: 50 bars
    const batch1: OhlcvBar[] = Array.from({ length: 50 }, (_, i) => ({
      time: 1000 + i * 10,
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
    }));
    store.writeBars("SSI", batch1, { chunkSize: 25, snapshotName: "Q1_SNAPSHOT" });

    // Batch 2: Append 50 more bars
    const batch2: OhlcvBar[] = Array.from({ length: 50 }, (_, i) => ({
      time: 1500 + i * 10,
      open: 20,
      high: 22,
      low: 19,
      close: 21,
      volume: 200,
    }));
    store.writeBars("SSI", batch2, { chunkSize: 25, snapshotName: "Q2_SNAPSHOT" });

    const snapshots = store.listSnapshots();
    const q1Snap = snapshots.find((s) => s.name === "Q1_SNAPSHOT");
    assert.ok(q1Snap !== undefined);

    // Query state under Q1_SNAPSHOT
    const q1Bars = store.readBars("SSI", { versionId: q1Snap!.versionId });
    assert.equal(q1Bars.length, 50, "Snapshot Q1 must strictly see only the first 50 bars");

    // Query current latest state
    const latestBars = store.readBars("SSI");
    assert.equal(latestBars.length, 100, "Latest state must see all 100 bars");
  });
});
