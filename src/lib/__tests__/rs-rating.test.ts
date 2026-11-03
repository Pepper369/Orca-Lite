import test from "node:test";
import assert from "node:assert/strict";
import { calculateRawRsScore, calculateUniverseRsRatings } from "../engines/rs-rating";
import type { OhlcvBar } from "../types";

function generateMockBars(count: number, startPrice: number, dailyReturn: number): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = startPrice;
  const now = Date.now();
  const oneDay = 86400 * 1000;

  for (let i = 0; i < count; i++) {
    price = price * (1 + dailyReturn);
    bars.push({
      time: Math.floor((now - (count - i) * oneDay) / 1000),
      open: price * 0.99,
      high: price * 1.02,
      low: price * 0.98,
      close: price,
      volume: 500_000,
    });
  }
  return bars;
}

test("calculateRawRsScore evaluates quarterly weighted performance accurately", () => {
  // A stock growing 0.2% daily over 260 days (approx +68% 1Y)
  const strongBars = generateMockBars(260, 10, 0.002);
  const result = calculateRawRsScore(strongBars);

  assert.ok(result.rawScore > 0, "Strong stock raw score should be positive");
  assert.ok(result.q1PerfPct > 0, "Q1 performance should be positive");
  assert.ok(result.oneYearPerfPct > 40, "1Y performance should exceed +40%");
});

test("calculateUniverseRsRatings ranks stocks from 1 to 99 percentile", () => {
  const mockUniverse: Record<string, OhlcvBar[]> = {
    LEADER: generateMockBars(260, 10, 0.003), // +117% 1Y
    RUNNER: generateMockBars(260, 10, 0.0015), // +47% 1Y
    AVERAGE: generateMockBars(260, 10, 0.0002), // +5% 1Y
    LAGGARD: generateMockBars(260, 10, -0.0015), // -32% 1Y
    WORST: generateMockBars(260, 10, -0.003), // -54% 1Y
  };

  const rsMap = calculateUniverseRsRatings(mockUniverse);

  assert.equal(rsMap.size, 5, "Should rank all 5 stocks");

  const leader = rsMap.get("LEADER")!;
  const worst = rsMap.get("WORST")!;

  assert.ok(leader.rsRating >= 90, `Leader RS should be >= 90, got ${leader.rsRating}`);
  assert.equal(leader.category, "ELITE_LEADER");
  assert.equal(leader.isMarketLeader, true);

  assert.ok(worst.rsRating <= 10, `Worst RS should be <= 10, got ${worst.rsRating}`);
  assert.equal(worst.category, "LAGGARD");
  assert.equal(worst.isMarketLeader, false);
});
