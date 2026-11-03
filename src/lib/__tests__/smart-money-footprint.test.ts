import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSmartMoneyFootprint,
  checkPocketPivot,
  checkSpringAbsorption,
} from "../engines/smart-money-footprint";
import type { OhlcvBar } from "../types";

function mockBars(count: number, basePrice: number): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    bars.push({
      time: Math.floor((now - (count - i) * 86400 * 1000) / 1000),
      open: basePrice,
      high: basePrice * 1.02,
      low: basePrice * 0.98,
      close: basePrice * 1.005,
      volume: 1_000_000,
    });
  }
  return bars;
}

test("evaluateSmartMoneyFootprint identifies heavy accumulation when buy ratio and foreign inflow are high", () => {
  const bars = mockBars(30, 25);
  // Last bar has high volume and up close
  bars[29]!.volume = 3_500_000;
  bars[29]!.close = 26.5;

  const result = evaluateSmartMoneyFootprint({
    symbol: "SSI",
    bars,
    foreignNetValBillion: 35.0, // +35 billion net buy
    activeBuyRatioPct: 69.5, // 69.5% active buy
  });

  assert.ok(result.score >= 75, `Score should be >= 75, got ${result.score}`);
  assert.equal(result.signal, "HEAVY_ACCUMULATION");
  assert.equal(result.signalVi, "Cá Mập Gom Mạnh");
  assert.equal(result.isVolumeAbsorption, true);
});

test("checkPocketPivot detects volume surge exceeding prior down-days", () => {
  const bars = mockBars(15, 50);
  // Add some down days with modest volume (e.g. 800k)
  for (let i = 5; i < 14; i++) {
    bars[i]!.close = bars[i]!.open * 0.99;
    bars[i]!.volume = 800_000;
  }
  // Current bar is an up-day with volume > 800k * 1.05
  bars[14]!.close = bars[14]!.open * 1.03;
  bars[14]!.volume = 1_500_000;

  const isPivot = checkPocketPivot(bars);
  assert.equal(isPivot, true, "Should trigger Pocket Pivot");
});
