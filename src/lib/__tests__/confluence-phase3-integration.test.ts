import test from "node:test";
import assert from "node:assert/strict";
import type { OhlcvBar } from "../types";
import { analyzeMaCandleRow } from "../engines/ma-candle-confluence";

test("Phase 3 Confluence: Detail page integration data payload contract", () => {
  const bars: OhlcvBar[] = [];
  const now = 1700000000;
  for (let i = 0; i < 35; i++) {
    const p = 25 + i * 0.2;
    bars.push({
      time: now + i * 86400,
      open: p,
      high: p + 0.5,
      low: p - 0.2,
      close: p + 0.3,
      volume: 120000,
    });
  }

  const confluence = analyzeMaCandleRow("FPT", bars);
  assert.ok(confluence, "Must produce confluence row for stock detail");

  // Contract check for ConfluenceRadarCard
  assert.ok(typeof confluence.confluenceScore === "number");
  assert.ok(["A+", "A", "B", "C"].includes(confluence.setupGrade));
  assert.ok(typeof confluence.orthogonalPillarsPassed === "number");
  assert.ok(confluence.orthogonalPillarsPassed >= 1 && confluence.orthogonalPillarsPassed <= 5);

  assert.ok(typeof confluence.orthogonalPillarDetails === "object");
  assert.equal(typeof confluence.orthogonalPillarDetails.structureTrend, "boolean");
  assert.equal(typeof confluence.orthogonalPillarDetails.valueZone, "boolean");
  assert.equal(typeof confluence.orthogonalPillarDetails.liquidityFlow, "boolean");
  assert.equal(typeof confluence.orthogonalPillarDetails.momentumTrigger, "boolean");
  assert.equal(typeof confluence.orthogonalPillarDetails.mtfMacro, "boolean");

  assert.ok(Array.isArray(confluence.confluenceTags));
  assert.ok(typeof confluence.entryPrice === "number");
  assert.ok(typeof confluence.stopLoss === "number");
  assert.ok(typeof confluence.target1 === "number");
  assert.ok(typeof confluence.riskReward === "number");
});
