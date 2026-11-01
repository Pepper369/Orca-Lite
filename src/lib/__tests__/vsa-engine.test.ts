import test from "node:test";
import assert from "node:assert/strict";
import { analyzeVsaBars } from "../engines/vsa-engine";
import type { OhlcvBar } from "../types";

test("analyzeVsaBars nhận diện No Supply Bar (Cạn Cung)", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 30; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 20,
      high: 21,
      low: 19,
      close: 20.2,
      volume: 1000,
    });
  }
  // Bar cuối: Nến giảm biên hẹp (20.0 -> 19.8), vol cạn (300 < 800), đóng ở giữa/trên
  bars.push({
    time: 1700000000 + 30 * 86400,
    open: 20.0,
    high: 20.1,
    low: 19.7,
    close: 19.9,
    volume: 350,
  });

  const res = analyzeVsaBars(bars);
  assert.ok(res.latestSignal);
  assert.equal(res.latestSignal.code, "NO_SUPPLY");
  assert.equal(res.latestSignal.nature, "BULLISH");
});

test("analyzeVsaBars nhận diện No Demand Bar (Cạn Cầu)", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 30; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 20,
      high: 21,
      low: 19,
      close: 20.0,
      volume: 1000,
    });
  }
  // Bar cuối: Nến tăng biên hẹp, vol cạn kiệt, đóng ở nửa dưới
  bars.push({
    time: 1700000000 + 30 * 86400,
    open: 20.0,
    high: 20.4,
    low: 19.9,
    close: 20.1,
    volume: 300,
  });

  const res = analyzeVsaBars(bars);
  assert.ok(res.latestSignal);
  assert.equal(res.latestSignal.code, "NO_DEMAND");
  assert.equal(res.latestSignal.nature, "BEARISH");
});

test("analyzeVsaBars nhận diện Upthrust Bar (Bẫy giá vượt đỉnh)", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 30; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 20,
      high: 21,
      low: 19,
      close: 20.0,
      volume: 1000,
    });
  }
  // Bar cuối: Vượt đỉnh (high 24 > 21) nhưng bị dội ngược đóng cửa 19.5 (nửa dưới), vol cực cao (2500)
  bars.push({
    time: 1700000000 + 30 * 86400,
    open: 21.0,
    high: 24.0,
    low: 19.2,
    close: 19.5,
    volume: 2500,
  });

  const res = analyzeVsaBars(bars);
  assert.ok(res.latestSignal);
  assert.equal(res.latestSignal.code, "UPTHRUST");
  assert.equal(res.latestSignal.nature, "BEARISH");
});

test("analyzeVsaBars nhận diện Shakeout (Rũ bỏ gom hàng)", () => {
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 30; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 20,
      high: 21,
      low: 19,
      close: 20.0,
      volume: 1000,
    });
  }
  // Bar cuối: Đâm thủng đáy (low 16 < 19) nhưng kéo ngược đóng cửa 22.0 (cao nhất phiên), vol lớn (2500)
  bars.push({
    time: 1700000000 + 30 * 86400,
    open: 19.0,
    high: 22.5,
    low: 16.0,
    close: 22.0,
    volume: 2500,
  });

  const res = analyzeVsaBars(bars);
  assert.ok(res.latestSignal);
  assert.equal(res.latestSignal.code, "SHAKEOUT");
  assert.equal(res.latestSignal.nature, "BULLISH");
});
