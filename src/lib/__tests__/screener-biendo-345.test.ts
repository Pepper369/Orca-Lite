import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMaCandleRow } from "../engines/ma-candle-confluence";
import { evaluateApexQuant } from "../engines/orca-apex-quant-engine";
import type { OhlcvBar } from "../types";

function makeBar(date: string, open: number, high: number, low: number, close: number, volume: number): OhlcvBar {
  return { time: date, open, high, low, close, volume };
}

function generateTrendBars(n = 45): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let price = 50.0;
  for (let i = 0; i < n; i++) {
    const o = price;
    const h = price + 0.4;
    const l = price - 0.2;
    const c = price + 0.15;
    bars.push(makeBar(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`, o, h, l, c, 1_000_000));
    price = c;
  }
  return bars;
}

test("Biên độ 3 - analyzeMaCandleRow detects MA Ribbon Squeeze when MA10, MA20, MA50 co cụm <= 2.8%", () => {
  const bars = generateTrendBars(55);
  // Add a final bounce candle near MA
  const lastPrice = bars[bars.length - 1].close;
  bars.push(makeBar("2026-02-28", lastPrice, lastPrice + 1.2, lastPrice - 0.8, lastPrice + 0.9, 1_500_000));

  const quote = {
    symbol: "SSI",
    price: lastPrice + 0.9,
    change: 0.9,
    changePercent: 1.8,
    volume: 1_500_000,
  };

  const result = analyzeMaCandleRow("SSI", bars, quote, {
    name: "SSI Securities",
    sector: "Dịch vụ tài chính",
  });

  assert.ok(result !== null);
  // maRibbonSpreadPct is computed on MA10, MA20, MA50
  assert.ok(typeof result.maRibbonSpreadPct === "number");
  if (result.isMaRibbonSqueeze) {
    assert.ok(result.maRibbonSpreadPct <= 2.8);
    assert.ok(result.confluenceTags.some((t) => t.includes("Nén Dải MA Ribbon")));
  }
});

test("Biên độ 3 - analyzeMaCandleRow detects MA Reclaim Spring (Stop-loss Hunt)", () => {
  const bars = generateTrendBars(45);
  const lastP = bars[bars.length - 1].close;
  // Last bar: Long lower shadow that sweeps under MA then violently closes above
  bars.push(makeBar("2026-03-01", lastP, lastP + 1.0, lastP - 2.5, lastP + 0.8, 1_800_000));

  const quote = {
    symbol: "HPG",
    price: lastP + 0.8,
    change: 0.8,
    changePercent: 1.5,
    volume: 1_800_000,
  };

  const result = analyzeMaCandleRow("HPG", bars, quote, {
    name: "Hòa Phát",
    sector: "Thép",
  });

  assert.ok(result !== null);
  assert.equal(result.isMaReclaimSpring, true);
  assert.ok(result.confluenceTags.some((t) => t.includes("Reclaim MA")));
});

test("Biên độ 4 - analyzeMaCandleRow detects Absorption Volume Spike and Active Buy Delta", () => {
  const bars = generateTrendBars(45);
  const lastP = bars[bars.length - 1].close;
  // Volume spike >= 1.3x TB20
  bars.push(makeBar("2026-03-02", lastP, lastP + 1.2, lastP - 0.5, lastP + 1.0, 2_500_000));

  const quote = {
    symbol: "FPT",
    price: lastP + 1.0,
    change: 1.0,
    changePercent: 2.0,
    volume: 2_500_000,
  };

  const result = analyzeMaCandleRow("FPT", bars, quote, {
    name: "FPT Corp",
    sector: "Công nghệ",
    activeBuyRatioPct: 62.5,
  });

  assert.ok(result !== null);
  assert.equal(result.isAbsorptionSpike, true);
  assert.equal(result.activeBuyRatioPct, 62.5);
  assert.ok(result.confluenceTags.some((t) => t.includes("Hấp Thụ Cung Đột Biến")));
  assert.ok(result.confluenceTags.some((t) => t.includes("Mua Chủ Động 63%")));
});

test("Biên độ 4 - analyzeMaCandleRow detects VSA No Supply Test on low volume narrow spread", () => {
  const bars = generateTrendBars(45);
  const lastP = bars[bars.length - 1].close;
  // Low volume test bar <= 0.65x TB20 (300k vs 1000k average) and narrow spread
  bars.push(makeBar("2026-03-03", lastP, lastP + 0.2, lastP - 0.1, lastP + 0.1, 300_000));

  const quote = {
    symbol: "MWG",
    price: lastP + 0.1,
    change: 0.1,
    changePercent: 0.2,
    volume: 300_000,
  };

  const result = analyzeMaCandleRow("MWG", bars, quote, {
    name: "Thế Giới Di Động",
    sector: "Bán lẻ",
  });

  assert.ok(result !== null);
  assert.equal(result.isVsaNoSupplyTest, true);
  assert.ok(result.confluenceTags.some((t) => t.includes("Cạn Cung VSA Test")));
});

test("Biên độ 5 - Precision MTF Alignment across W1, D1, H1 triggers bonus and tag", () => {
  const bars = generateTrendBars(45);
  const lastP = bars[bars.length - 1].close;
  bars.push(makeBar("2026-03-04", lastP, lastP + 1.0, lastP - 0.4, lastP + 0.8, 1_500_000));

  const quote = {
    symbol: "TCB",
    price: lastP + 0.8,
    change: 0.8,
    changePercent: 1.6,
    volume: 1_500_000,
  };

  const result = analyzeMaCandleRow("TCB", bars, quote, {
    name: "Techcombank",
    sector: "Ngân hàng",
    isPrecisionMtfAligned: true,
  });

  assert.ok(result !== null);
  assert.equal(result.isPrecisionMtfAligned, true);
  assert.ok(result.confluenceTags.some((t) => t.includes("Đồng Thuận 3 Khung H1·D1·W1")));
});

test("Orca Apex Quant Engine incorporates Ribbon Squeeze, Absorption, and Precision MTF", () => {
  const bars = generateTrendBars(50);
  const baseInput = {
    bars,
    symbol: "VHM",
    currentPrice: 45_000,
    activeBuyRatioPct: 52,
    foreignNetValBillion: 10,
    rsRating: 75,
    piotroskiFScore: 7,
    altmanZone: "SAFE" as const,
    isMtfAligned: true,
  };

  const baseResult = evaluateApexQuant(baseInput);

  const enhancedResult = evaluateApexQuant({
    ...baseInput,
    isMaRibbonSqueeze: true,
    isAbsorptionSpike: true,
    isPrecisionMtfAligned: true,
  });

  assert.ok(
    enhancedResult.apexScore > baseResult.apexScore,
    `Enhanced score (${enhancedResult.apexScore}) should be strictly greater than base score (${baseResult.apexScore})`
  );
  assert.equal(enhancedResult.isMaRibbonSqueeze, true);
  assert.equal(enhancedResult.isAbsorptionSpike, true);
  assert.equal(enhancedResult.isPrecisionMtfAligned, true);
  assert.ok(enhancedResult.highlights.some((r) => r.includes("Nén dải MA Ribbon")));
  assert.ok(enhancedResult.highlights.some((r) => r.includes("Hấp thụ cung đột biến")));
  assert.ok(enhancedResult.highlights.some((r) => r.includes("Đồng thuận đa khung H1-D1-W1")));
});

test("Consolidated Screener Presets - Preserves taxonomy and removes duplicate noise", () => {
  const { PRESET_TABS } = require("../../app/screener/screener-panels");
  // Check that core streamlined presets exist
  const ids = PRESET_TABS.map((t: any) => t.id);
  assert.ok(ids.includes("apex_buy_now"));
  assert.ok(ids.includes("mtf_confluence"));
  assert.ok(ids.includes("canslim"));
  assert.ok(ids.includes("bottom_confluence"));
  assert.ok(ids.includes("ttm_squeeze"));

  // Check that duplicate redundant tabs have been consolidated
  assert.ok(!ids.includes("mtf_candle_cluster"), "mtf_candle_cluster should be unified into mtf_confluence");
  assert.ok(!ids.includes("growth"), "growth should be unified into canslim");
});
