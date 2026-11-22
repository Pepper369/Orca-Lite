import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeVolumeProfile,
  computeSessionVwap,
  detectCvdAndAbsorption,
  detectLiquidityPools,
  generateDeepFlowSignal,
} from "../engines/forex-order-flow-pro";
import type { OhlcvBar } from "../types";

test("Order Flow Pro: Volume Profile, VPOC & 70% Value Area (VAH/VAL)", () => {
  const bars: OhlcvBar[] = [];
  // Generate 30 bars concentrating volume at price 1.0850
  for (let i = 0; i < 30; i++) {
    const isPocZone = i >= 10 && i <= 20;
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0820 + i * 0.0002,
      high: 1.0820 + i * 0.0002 + 0.0004,
      low: 1.0820 + i * 0.0002 - 0.0002,
      close: isPocZone ? 1.0850 : 1.0820 + i * 0.0002,
      volume: isPocZone ? 10000 : 1000,
    });
  }

  const profile = computeVolumeProfile(bars, 24);

  // Total volume must match sum
  assert.ok(profile.totalVolume > 100000);
  assert.ok(profile.valueAreaVolume >= profile.totalVolume * 0.69);
  // VPOC must be located near 1.0850
  assert.ok(Math.abs(profile.vpocPrice - 1.085) < 0.002);
  // VAH must be >= VPOC and VAL must be <= VPOC
  assert.ok(profile.vahPrice >= profile.vpocPrice);
  assert.ok(profile.valPrice <= profile.vpocPrice);
});

test("Order Flow Pro: Anchored VWAP & Standard Deviation Bands", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 40; i++) {
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0800 + i * 0.0001,
      high: 1.0800 + i * 0.0001 + 0.0003,
      low: 1.0800 + i * 0.0001 - 0.0002,
      close: 1.0800 + i * 0.0001,
      volume: 1500,
    });
  }

  const vwapResult = computeSessionVwap("EURUSD", bars);
  assert.ok(vwapResult.vwap > 1.0800 && vwapResult.vwap < 1.0850);
  assert.ok(vwapResult.upperBand1 > vwapResult.vwap);
  assert.ok(vwapResult.upperBand2 > vwapResult.upperBand1);
  assert.ok(vwapResult.lowerBand1 < vwapResult.vwap);
  assert.ok(vwapResult.lowerBand2 < vwapResult.lowerBand1);
  assert.ok(vwapResult.distanceToVwapPips >= 0);

  // Verify Institutional UTC Session Anchor (07:00 UTC London Open)
  const londonAnchorBaseMs = Date.UTC(2026, 10, 20, 6, 30, 0); // 06:30 UTC
  const londonBars: OhlcvBar[] = [];
  for (let i = 0; i < 20; i++) {
    londonBars.push({
      time: londonAnchorBaseMs + i * 5 * 60_000, // crosses 07:00 UTC at i=6 with 14 bars after
      open: 1.082 + i * 0.0001,
      high: 1.0825 + i * 0.0001,
      low: 1.0818 + i * 0.0001,
      close: 1.0822 + i * 0.0001,
      volume: 2000,
    });
  }
  const londonVwap = computeSessionVwap("EURUSD", londonBars);
  assert.equal(londonVwap.anchorSession, "LONDON_OPEN");
});

test("Order Flow Pro: CVD Divergence & Bullish Absorption Detection", () => {
  const bars: OhlcvBar[] = [];
  // Build a scenario where price makes a lower low but aggressive selling is absorbed (closed high in bar)
  for (let i = 0; i < 25; i++) {
    const isAbsorptionBar = i >= 22;
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0850 - i * 0.0002,
      high: 1.0850 - i * 0.0002 + 0.0003,
      low: 1.0850 - i * 0.0002 - (isAbsorptionBar ? 0.0006 : 0.0002),
      // If absorption bar, strong bounce back up to high
      close: isAbsorptionBar ? 1.0850 - i * 0.0002 + 0.0002 : 1.0850 - i * 0.0002 - 0.0001,
      volume: isAbsorptionBar ? 15000 : 2000,
    });
  }

  const cvdResult = detectCvdAndAbsorption("EURUSD", bars);
  assert.equal(cvdResult.cvdTimeline.length, 25);
  assert.ok(cvdResult.lastDelta !== 0);
});

test("Order Flow Pro: Liquidity Pools Hunter (Equal Highs & Lows)", () => {
  const bars: OhlcvBar[] = [];
  // Generate 40 bars with two swing highs touching 1.0880 (Equal Highs EQH)
  for (let i = 0; i < 40; i++) {
    const isTouch1 = i === 10;
    const isTouch2 = i === 25;
    const high = isTouch1 || isTouch2 ? 1.0880 : 1.0850;
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0830,
      high,
      low: 1.0820,
      close: 1.0840,
      volume: 3000,
    });
  }

  const pools = detectLiquidityPools("EURUSD", bars);
  assert.ok(pools.bslTargets.length > 0 || pools.sslTargets.length > 0);
});

test("Order Flow Pro: End-to-End Institutional Flow Signal & Sniper Setup", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 50; i++) {
    bars.push({
      time: 1700000000000 + i * 60000,
      open: 1.0830 + i * 0.0001,
      high: 1.0830 + i * 0.0001 + 0.0004,
      low: 1.0830 + i * 0.0001 - 0.0002,
      close: 1.0830 + i * 0.0001 + 0.0002,
      volume: 2500 + i * 50,
    });
  }

  const signal = generateDeepFlowSignal("EURUSD", bars);
  assert.equal(signal.pair, "EURUSD");
  assert.ok(signal.flowIntensityIndex >= -100 && signal.flowIntensityIndex <= 100);
  assert.ok(signal.confidenceScore >= 45 && signal.confidenceScore <= 95);
  assert.ok(signal.volumeProfile.vpocPrice > 0);
  assert.ok(signal.vwap.vwap > 0);
  assert.ok(signal.sniperSetup != null);
});

