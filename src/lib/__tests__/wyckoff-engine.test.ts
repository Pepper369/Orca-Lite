import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWyckoff, computeWyckoffRS, computeMarketRoro } from "../engines/wyckoff-elliott";
import type { OhlcvBar } from "../types";

test("analyzeWyckoff trả về unknown khi dưới 30 nến", () => {
  const bars: OhlcvBar[] = Array.from({ length: 20 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: 1000,
  }));
  const res = analyzeWyckoff(bars);
  assert.equal(res.phase, "unknown");
  assert.equal(res.confidence, 0);
});

test("analyzeWyckoff nhận diện VSA volume (Ultra High, High, Low)", () => {
  const bars: OhlcvBar[] = Array.from({ length: 60 }, (_, i) => ({
    time: 1700000000 + i * 86400,
    open: 20,
    high: 21,
    low: 19,
    close: 20,
    volume: 1000,
  }));
  // Bar cuối có volume gấp 2.5 lần MA -> Ultra High
  bars[bars.length - 1] = {
    time: 1700000000 + 60 * 86400,
    open: 20,
    high: 22,
    low: 19.5,
    close: 21.8,
    volume: 2500,
  };
  const res = analyzeWyckoff(bars);
  assert.equal(res.vsaTag, "ultra-high");
});

test("analyzeWyckoff tính toán Base TR, Ice, Creek, CauseWeeks và Targets", () => {
  // Tạo mô hình tích lũy: rơi xuống SC rồi đi ngang tích lũy
  const bars: OhlcvBar[] = [];
  // Giai đoạn rơi tạo SC
  for (let i = 0; i < 20; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 30 - i * 0.7,
      high: 30.5 - i * 0.7,
      low: 29 - i * 0.7,
      close: 29.5 - i * 0.7,
      volume: i === 19 ? 5000 : 1500, // SC vol lớn
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

  const res = analyzeWyckoff(bars);
  assert.equal(res.trModel, "Base");
  assert.ok(res.creekLevel && res.creekLevel > 0);
  assert.ok(res.iceLevel && res.iceLevel > 0);
  assert.ok(res.creekLevel >= res.iceLevel);
  assert.ok(res.causeWeeks && res.causeWeeks > 0);
  assert.ok(res.stopLoss && res.stopLoss > 0);
  assert.ok(res.target1 && res.target1 >= res.iceLevel);
  assert.ok(res.target2 && res.target2 >= res.target1);
  assert.ok(res.rr1 != null && res.rr1 >= 0);
  assert.ok(res.rr2 != null && res.rr2 >= 0);
});

test("analyzeWyckoff nhận diện Top Distribution khi cổ phiếu tăng mạnh và neo đỉnh", () => {
  const bars: OhlcvBar[] = [];
  // Giai đoạn giảm tạo đáy SC tại 10
  for (let i = 0; i < 10; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 15 - i * 0.5,
      high: 15.5 - i * 0.5,
      low: 14.5 - i * 0.5,
      close: 14.8 - i * 0.5,
      volume: 1500,
    });
  }
  // Giai đoạn tăng mạnh từ 10 lên 31 (tăng 200%)
  for (let i = 10; i < 50; i++) {
    bars.push({
      time: 1700000000 + i * 86400,
      open: 10 + (i - 10) * 0.5,
      high: i === 49 ? 31.0 : 10.5 + (i - 10) * 0.5,
      low: 9.8 + (i - 10) * 0.5,
      close: 10.3 + (i - 10) * 0.5,
      volume: i === 49 ? 4000 : 2000,
    });
  }
  // Sau đỉnh BC, đi ngang phân phối neo cao quanh 26-29 trong 35 nến
  for (let i = 50; i < 85; i++) {
    const isHigh = i % 8 < 4;
    bars.push({
      time: 1700000000 + i * 86400,
      open: isHigh ? 28 : 26.5,
      high: isHigh ? 29.0 : 27.5,
      low: isHigh ? 27.5 : 26.0,
      close: isHigh ? 28.5 : 26.8,
      volume: 1200,
    });
  }

  const res = analyzeWyckoff(bars);
  assert.equal(res.trModel, "Top");
  assert.ok(res.bias === "neutral" || res.bias === "bearish");
});

test("computeWyckoffRS & Cá Mập Leader ITF", () => {
  const stockBars: OhlcvBar[] = [];
  const indexBars: OhlcvBar[] = [];
  for (let i = 0; i < 100; i++) {
    const t = 1700000000 + i * 86400;
    indexBars.push({
      time: t,
      open: 1200 - i * 0.5,
      high: 1205 - i * 0.5,
      low: 1195 - i * 0.5,
      close: 1200 - i * 0.5,
      volume: 500000,
    });
    stockBars.push({
      time: t,
      open: 20 + i * 0.2,
      high: 20.5 + i * 0.2,
      low: 19.8 + i * 0.2,
      close: 20.3 + i * 0.2,
      volume: 10000,
    });
  }

  const res = analyzeWyckoff(stockBars, { benchmarkBars: indexBars });
  assert.ok(res.rsScore != null && res.rsScore > 0);
  assert.equal(res.isRsAboveMa49, true);
  assert.equal(res.isLeaderITF, true);
  assert.ok(res.marketRoro);
  assert.ok(res.marketRoro.environment === "RISK_ON" || res.marketRoro.environment === "RISK_OFF");
});

test("computeMarketRoro nhận diện chính xác trạng thái Risk-On và Risk-Off", () => {
  // Kịch bản Index tăng tốc mạnh (Risk-On)
  const bullIndex: OhlcvBar[] = [];
  for (let i = 0; i < 80; i++) {
    bullIndex.push({
      time: 1700000000 + i * 86400,
      open: 1000 + i * 5,
      high: 1005 + i * 5,
      low: 995 + i * 5,
      close: 1002 + i * 5,
      volume: 600000,
    });
  }
  const bullRoro = computeMarketRoro(bullIndex);
  assert.ok(bullRoro);
  assert.equal(bullRoro.environment, "RISK_ON");
  assert.ok(bullRoro.roroValue >= 0);

  // Kịch bản Index cắm đầu giảm (Risk-Off)
  const bearIndex: OhlcvBar[] = [];
  for (let i = 0; i < 80; i++) {
    bearIndex.push({
      time: 1700000000 + i * 86400,
      open: 1500 - i * 6,
      high: 1505 - i * 6,
      low: 1490 - i * 6,
      close: 1492 - i * 6,
      volume: 800000,
    });
  }
  const bearRoro = computeMarketRoro(bearIndex);
  assert.ok(bearRoro);
  assert.equal(bearRoro.environment, "RISK_OFF");
  assert.ok(bearRoro.roroValue <= 0);
});
