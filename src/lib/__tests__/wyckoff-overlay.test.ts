import test from "node:test";
import assert from "node:assert/strict";
import { buildWyckoffOverlay } from "../../chart/wyckoff-overlay";
import type { OhlcvBar } from "../types";

test("buildWyckoffOverlay returns null when bars < 30", () => {
  const bars: OhlcvBar[] = Array.from({ length: 15 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: 1000,
  }));
  const res = buildWyckoffOverlay(bars);
  assert.equal(res, null);
});

test("buildWyckoffOverlay generates Ice, Creek, Midline, SL, Targets and Markers", () => {
  const bars: OhlcvBar[] = [];
  // Giai đoạn rơi tạo SC
  for (let i = 0; i < 20; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 30 - i * 0.7,
      high: 30.5 - i * 0.7,
      low: 29 - i * 0.7,
      close: 29.5 - i * 0.7,
      volume: i === 19 ? 5000 : 1500,
    });
  }
  // Giai đoạn hồi AR lên 20 rồi dao động trong vùng 16 - 20 (60 nến)
  for (let i = 20; i < 80; i++) {
    const isHigh = i % 10 < 5;
    bars.push({
      time: 1700000000 + i * 86400,
      open: isHigh ? 19 : 16.5,
      high: isHigh ? 20 : 17.5,
      low: isHigh ? 18.5 : 16,
      close: isHigh ? 19.5 : 16.8,
      volume: 800,
    });
  }

  const res = buildWyckoffOverlay(bars);
  assert.ok(res);
  assert.ok(res.levels.length >= 3);
  assert.ok(res.levels.some((l) => l.title.includes("ICE")));
  assert.ok(res.levels.some((l) => l.title.includes("CREEK")));
  assert.ok(res.levels.some((l) => l.title.includes("MID")));
  assert.ok(res.snapshot.trModel === "Base");
  assert.ok(res.markers.length > 0);
});
