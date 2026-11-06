import test from "node:test";
import assert from "node:assert/strict";
import {
  matchSymbolToIcbSector,
  evaluateSectorAlphaResonance,
  VN_ICB_SECTORS,
} from "../engines/rrg-engine";
import { ttmSqueeze } from "../engines/oscillators";
import { evaluateApexQuant } from "../engines/orca-apex-quant-engine";
import { analyzeMaCandleRow } from "../engines/ma-candle-confluence";
import { PRESET_TABS } from "@/app/screener/screener-constants";
import type { OhlcvBar } from "../types";

function makeBar(date: string, open: number, high: number, low: number, close: number, volume: number): OhlcvBar {
  return { time: date, open, high, low, close, volume };
}

test("Biên độ 1 - matchSymbolToIcbSector maps VN stocks to 18 ICB economic sectors accurately", () => {
  // Banking
  assert.equal(matchSymbolToIcbSector("VCB", "Ngân hàng"), "BANK");
  assert.equal(matchSymbolToIcbSector("TCB", "Tài chính"), "BANK");
  assert.equal(matchSymbolToIcbSector("MBB", null), "BANK");

  // Steel
  assert.equal(matchSymbolToIcbSector("HPG", "Thép & Vật liệu"), "STEEL");
  assert.equal(matchSymbolToIcbSector("HSG", null), "STEEL");

  // Financial Services / Securities
  assert.equal(matchSymbolToIcbSector("SSI", "Dịch vụ Tài chính"), "SEC");
  assert.equal(matchSymbolToIcbSector("VND", null), "SEC");

  // Technology
  assert.equal(matchSymbolToIcbSector("FPT", "Công nghệ"), "TECH");
  assert.equal(matchSymbolToIcbSector("CMG", null), "TECH");

  // Real Estate
  assert.equal(matchSymbolToIcbSector("VHM", "Bất động sản"), "REAL");

  // Fallback to sector name text match if symbol is not in primary list
  assert.equal(matchSymbolToIcbSector("XYZ_DẦU", "Dầu khí"), "OIL");
  assert.equal(matchSymbolToIcbSector("XYZ_HOACHAT", "Hóa chất"), "CHEM");
});

test("Biên độ 1 - evaluateSectorAlphaResonance applies correct score modulation and tags", () => {
  const leading = evaluateSectorAlphaResonance("LEADING");
  assert.equal(leading.scoreBonus, 12);
  assert.equal(leading.isLeading, true);
  assert.equal(leading.isLagging, false);
  assert.equal(leading.tagVi, "Sóng Ngành Leading");

  const improving = evaluateSectorAlphaResonance("IMPROVING");
  assert.equal(improving.scoreBonus, 7);
  assert.equal(improving.isLeading, false);
  assert.equal(improving.isLagging, false);
  assert.equal(improving.tagVi, "Sóng Ngành Đang Lên");

  const weakening = evaluateSectorAlphaResonance("WEAKENING");
  assert.equal(weakening.scoreBonus, 0);
  assert.equal(weakening.isLeading, false);
  assert.equal(weakening.isLagging, false);
  assert.equal(weakening.tagVi, null);

  const lagging = evaluateSectorAlphaResonance("LAGGING");
  assert.equal(lagging.scoreBonus, -8);
  assert.equal(lagging.isLeading, false);
  assert.equal(lagging.isLagging, true);
  assert.equal(lagging.tagVi, "Cảnh báo Ngành Tụt Hậu");

  const nullQuadrant = evaluateSectorAlphaResonance(null);
  assert.equal(nullQuadrant.scoreBonus, 0);
  assert.equal(nullQuadrant.tagVi, null);
});

test("Biên độ 2 - ttmSqueeze calculates compression duration (squeezeBars) and momentumSlope", () => {
  // Create 35 bars with ultra-tight price action (BB inside KC)
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];

  for (let i = 0; i < 35; i++) {
    highs.push(50.2);
    lows.push(50.0);
    closes.push(50.1);
  }

  const tightSqueeze = ttmSqueeze(highs, lows, closes, 20, 2, 20, 1.5);
  assert.equal(tightSqueeze.state, "squeeze_on");
  assert.ok(tightSqueeze.squeezeBars >= 10, `Expected tight squeeze to have at least 10 squeeze bars, got ${tightSqueeze.squeezeBars}`);
  assert.ok(["ACCELERATING_BULL", "DECELERATING_BULL", "ACCELERATING_BEAR", "DECELERATING_BEAR", "FLAT"].includes(tightSqueeze.momentumSlope));

  // Now create an explosion bar that bursts out of the squeeze to the upside
  highs.push(56.0);
  lows.push(51.0);
  closes.push(55.5);

  const firedSqueeze = ttmSqueeze(highs, lows, closes, 20, 2, 20, 1.5);
  assert.equal(firedSqueeze.state, "fired_bull");
  assert.ok(firedSqueeze.squeezeBars >= 10, `Expected fired squeeze to remember compressed duration >= 10 bars, got ${firedSqueeze.squeezeBars}`);
  assert.equal(firedSqueeze.momentumSlope, "ACCELERATING_BULL");
});

test("Biên độ 1 & 2 - evaluateApexQuant incorporates sector RRG resonance and Squeeze dynamics", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 50; i++) {
    bars.push(makeBar(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, 30 + i * 0.1, 30.5 + i * 0.1, 29.8 + i * 0.1, 30.2 + i * 0.1, 2_000_000));
  }

  const baseInput = {
    bars,
    symbol: "TCB",
    currentPrice: 35.0,
    activeBuyRatioPct: 68,
    foreignNetValBillion: 30,
    rsRating: 82,
    piotroskiFScore: 8,
    altmanZone: "SAFE" as const,
    isMtfAligned: true,
  };

  // 1. With Leading sector & Fired Bull Squeeze
  const apexResonant = evaluateApexQuant({
    ...baseInput,
    sectorRrgQuadrant: "LEADING",
    squeezeState: "fired_bull",
    squeezeBars: 6,
  });

  // 2. With Lagging sector & Fired Bear Squeeze
  const apexLagging = evaluateApexQuant({
    ...baseInput,
    sectorRrgQuadrant: "LAGGING",
    squeezeState: "fired_bear",
    squeezeBars: 6,
  });

  assert.ok(
    apexResonant.apexScore > apexLagging.apexScore,
    `Resonant score (${apexResonant.apexScore}) should be strictly greater than lagging score (${apexLagging.apexScore})`
  );
  assert.equal(apexResonant.isSectorLeading, true);
  assert.equal(apexResonant.isSectorLagging, false);
  assert.equal(apexResonant.isSqueezeFiredBull, true);
  assert.equal(apexLagging.isSectorLagging, true);
});

test("Biên độ 1 & 2 - analyzeMaCandleRow incorporates rrgBonus and squeezeBonus into confluenceScore", () => {
  const bars: OhlcvBar[] = [];
  let price = 50.0;
  for (let i = 0; i < 40; i++) {
    const o = price;
    const h = price + 0.5;
    const l = price - 0.3;
    const c = price + 0.2;
    bars.push(makeBar(`2026-01-${String(i + 1).padStart(2, "0")}`, o, h, l, c, 1_000_000));
    price = c;
  }
  bars.push(makeBar("2026-02-15", price, price + 1.5, price - 1.0, price + 1.2, 2_000_000));

  const quote = {
    symbol: "HPG",
    price: price + 1.2,
    change: 1.2,
    changePercent: 2.5,
    volume: 2_000_000,
  };

  // With Leading Sector & Squeeze Fired Bull
  const rowLeading = analyzeMaCandleRow("HPG", bars, quote, {
    sectorRrgQuadrant: "LEADING",
    squeezeState: "fired_bull",
  });

  // With Lagging Sector & Squeeze Fired Bear
  const rowLagging = analyzeMaCandleRow("HPG", bars, quote, {
    sectorRrgQuadrant: "LAGGING",
    squeezeState: "fired_bear",
  });

  assert.ok(rowLeading != null);
  assert.ok(rowLagging != null);
  assert.ok(
    rowLeading.confluenceScore > rowLagging.confluenceScore,
    `Leading confluence score (${rowLeading.confluenceScore}) should be greater than lagging (${rowLagging.confluenceScore})`
  );
  assert.equal(rowLeading.rrgBonus, 5);
  assert.equal(rowLeading.squeezeBonus, 6);
  assert.equal(rowLagging.rrgBonus, -4);
  assert.equal(rowLagging.squeezeBonus, -6);
  assert.ok(rowLeading.confluenceTags.some((t) => t.includes("Sóng Ngành Leading")));
  assert.ok(rowLeading.confluenceTags.some((t) => t.includes("Nổ Volatility Squeeze")));
});

test("Biên độ 1 & 2 - PRESET_TABS contains sector_leading and ttm_squeeze tabs", () => {
  const sectorTab = PRESET_TABS.find((t) => t.id === "sector_leading");
  assert.ok(sectorTab, "sector_leading preset must be registered in PRESET_TABS");
  assert.equal(sectorTab.category, "core");
  assert.ok(sectorTab.label.includes("Ngành Dẫn Dắt RRG"));

  const squeezeTab = PRESET_TABS.find((t) => t.id === "ttm_squeeze");
  assert.ok(squeezeTab, "ttm_squeeze preset must be registered in PRESET_TABS");
  assert.equal(squeezeTab.category, "price_action");
  assert.ok(squeezeTab.label.includes("Nén Squeeze (TTM)"));
});
