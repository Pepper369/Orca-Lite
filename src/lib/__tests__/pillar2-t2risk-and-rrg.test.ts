import test from "node:test";
import assert from "node:assert/strict";
import { computeT2OverextensionRisk } from "../services/t2-risk";
import type { OhlcvBar } from "../types";

function makeBar(time: number, close: number, volume = 1_000_000): OhlcvBar {
  return {
    time,
    open: close * 0.99,
    high: close * 1.01,
    low: close * 0.98,
    close,
    volume,
  };
}

test("Trụ cột 2: T+2 Risk Engine - Nhận diện cổ phiếu tích lũy an toàn (SAFE)", () => {
  const bars: OhlcvBar[] = [];
  const baseTime = Date.now() - 30 * 86_400_000;
  // Cổ phiếu sideway quanh 25.000 VND
  for (let i = 0; i < 25; i++) {
    const c = 25_000 + Math.sin(i) * 300;
    bars.push(makeBar(baseTime + i * 86_400_000, c));
  }

  const result = computeT2OverextensionRisk("SSI", bars);
  assert.equal(result.symbol, "SSI");
  assert.equal(result.level, "SAFE");
  assert.equal(result.isOverextended, false);
  assert.ok(result.score <= 30);
  assert.equal(result.badgeColor, "emerald");
});

test("Trụ cột 2: T+2 Risk Engine - Nhận diện BẪY KẸP HÀNG T+2 khi rướn >= 3 phiên (>7.5%)", () => {
  const bars: OhlcvBar[] = [];
  const baseTime = Date.now() - 25 * 86_400_000;
  // 20 phiên đầu tích lũy giá 30.000
  for (let i = 0; i < 20; i++) {
    bars.push(makeBar(baseTime + i * 86_400_000, 30_000));
  }

  // 4 phiên sau tăng rướn đột biến: 30.500 -> 31.500 -> 32.800 -> 34.000 (+13.3%)
  bars.push(makeBar(baseTime + 20 * 86_400_000, 30_500));
  bars.push(makeBar(baseTime + 21 * 86_400_000, 31_500));
  bars.push(makeBar(baseTime + 22 * 86_400_000, 32_800));
  bars.push(makeBar(baseTime + 23 * 86_400_000, 34_000)); // phiên thứ 4 liên tiếp

  const result = computeT2OverextensionRisk("VIX", bars);
  assert.equal(result.symbol, "VIX");
  assert.equal(result.level, "CRITICAL_T2_TRAP");
  assert.equal(result.isOverextended, true);
  assert.equal(result.consecutiveUpDays, 4);
  assert.ok(result.cumulativeRunGainPct > 10);
  assert.ok(result.distanceFromMa20Pct > 7);
  assert.ok(result.score >= 70);
  assert.equal(result.badgeColor, "rose");
  assert.ok(result.warningMessage.includes("T+2"));
});

test("Trụ cột 2: T+2 Risk Engine - Cảnh giác nhịp rung lắc khi rướn vừa phải (ELEVATED)", () => {
  const bars: OhlcvBar[] = [];
  const baseTime = Date.now() - 25 * 86_400_000;
  for (let i = 0; i < 20; i++) {
    bars.push(makeBar(baseTime + i * 86_400_000, 20_000));
  }

  // 2 phiên tăng nhẹ +6.0%
  bars.push(makeBar(baseTime + 20 * 86_400_000, 20_600));
  bars.push(makeBar(baseTime + 21 * 86_400_000, 21_200));

  const result = computeT2OverextensionRisk("MBB", bars);
  assert.equal(result.level, "ELEVATED");
  assert.equal(result.badgeColor, "amber");
});
