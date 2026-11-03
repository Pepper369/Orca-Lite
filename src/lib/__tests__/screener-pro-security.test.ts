import test from "node:test";
import assert from "node:assert/strict";
import { calculateUniverseRsRatings } from "../engines/rs-rating";
import { calculateUniverseOrcaMaster, type OrcaMasterInput } from "../engines/orca-master-composite";
import { loadCustomPresets, persistCustomPreset, removeCustomPreset, type CustomScreenerPreset } from "@/components/custom-screener-builder";

test("calculateUniverseRsRatings handles identical scores with equal rank", () => {
  const stockHistories: Record<string, { time: string; open: number; high: number; low: number; close: number; volume: number }[]> = {
    STOCK_A: [
      { time: "2026-01-01", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-02", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-03", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-04", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-05", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-06", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
    ],
    STOCK_B: [
      { time: "2026-01-01", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-02", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-03", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-04", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-05", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
      { time: "2026-01-06", open: 10, high: 10, low: 10, close: 10, volume: 1000 },
    ],
  };

  const rsMap = calculateUniverseRsRatings(stockHistories);
  const ratingA = rsMap.get("STOCK_A")?.rsRating;
  const ratingB = rsMap.get("STOCK_B")?.rsRating;

  assert.ok(ratingA != null);
  assert.ok(ratingB != null);
  // Both stocks with identical zero performance curve receive identical percentile rating
  assert.equal(ratingA, ratingB);
});

test("calculateUniverseOrcaMaster clamps bounds within 1 - 99", () => {
  const inputs: OrcaMasterInput[] = [
    {
      symbol: "BEST",
      rsRating: 99,
      smartMoneyScore: 100,
      piotroskiFScore: 9,
      altmanZone: "SAFE",
      roe: 30,
      confluenceScore: 95,
      isNearBuy: true,
      absBuyDiff: 0.5,
      pe: 8,
      pb: 1.0,
      dividendYield: 7.0,
      maSignal: "GOLDEN_CROSS",
      isMtfAligned: true,
    },
    {
      symbol: "WORST",
      rsRating: 1,
      smartMoneyScore: 0,
      piotroskiFScore: 0,
      altmanZone: "DISTRESS",
      roe: -25,
      confluenceScore: 10,
      isNearBuy: false,
      absBuyDiff: 15.0,
      pe: 150,
      pb: 10.0,
      dividendYield: 0,
      maSignal: "DEATH_CROSS",
      isMtfAligned: false,
    },
  ];

  const map = calculateUniverseOrcaMaster(inputs);
  const best = map.get("BEST");
  const worst = map.get("WORST");

  assert.ok(best != null);
  assert.ok(worst != null);
  assert.equal(best.compositeScore, 99);
  assert.equal(worst.compositeScore, 1);
  assert.equal(best.category, "SUPER_ELITE");
  assert.equal(worst.category, "AVOID");
});

test("CSV formula injection neutralization works effectively", () => {
  const toCsvCell = (val: unknown): string => {
    if (val == null) return '""';
    let s = String(val);
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };

  // Malicious spreadsheet inputs designed for DDE or command execution
  assert.equal(toCsvCell("=CMD|' /C calc'!A0"), "\"'=CMD|' /C calc'!A0\"");
  assert.equal(toCsvCell("+1234567890"), "\"'+1234567890\"");
  assert.equal(toCsvCell("-SUM(A1:A10)"), "\"'-SUM(A1:A10)\"");
  assert.equal(toCsvCell("@SUM(A1:A10)"), "\"'@SUM(A1:A10)\"");
  assert.equal(toCsvCell("\tMaliciousTab"), "\"'\tMaliciousTab\"");
  assert.equal(toCsvCell('Normal "Company" Corp'), '"Normal ""Company"" Corp"');
  assert.equal(toCsvCell(null), '""');
});
