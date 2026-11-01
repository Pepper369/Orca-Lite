import test from "node:test";
import assert from "node:assert/strict";
import { calculatePositionSizing } from "../engines/wyckoff-position-sizing";

test("calculatePositionSizing tính đúng tỷ trọng và số cổ phiếu lô 100", () => {
  // NAV = 200,000,000 đ
  // Entry = 35,000 đ
  // StopLoss = 33,250 đ (Lỗ 1,750 đ = 5%)
  // Target 1 = 40,250 đ (Lãi 5,250 đ = 15%, R:R = 5,250 / 1,750 = 3.0)
  // Max risk NAV = 1.25%
  const res = calculatePositionSizing({
    nav: 200_000_000,
    entryPrice: 35_000,
    stopLossPrice: 33_250,
    target1Price: 40_250,
    maxRiskNavPct: 1.25,
  });

  assert.ok(res);
  assert.equal(res.riskPercent, 5);
  // recommendedWeightPct = 1.25 / 5 * 100 = 25% NAV
  assert.equal(res.recommendedWeightPct, 25);
  // maxAllocationVnd = 200M * 25% = 50,000,000 đ
  assert.equal(res.maxAllocationVnd, 50_000_000);
  // raw shares = 50M / 35,000 = 1428 -> round to 1400 CP
  assert.equal(res.sharesToBuy, 1400);
  // actual investment = 1400 * 35,000 = 49,000,000 đ
  assert.equal(res.actualInvestmentVnd, 49_000_000);
  // max loss = 1400 * 1750 = 2,450,000 đ (< 2,500,000 đ = 1.25% NAV)
  assert.equal(res.maxLossVnd, 2_450_000);
  assert.ok(res.actualRiskNavPct <= 1.25);
  // R:R = 3.0 -> OPTIMAL
  assert.equal(res.rr1, 3.0);
  assert.equal(res.rating, "OPTIMAL");
});

test("calculatePositionSizing tự động chuẩn hóa giá đơn vị ngàn đồng (VN30)", () => {
  // Entry 35 (nghĩa là 35,000 đ), SL 33.25, T1 40.25
  const res = calculatePositionSizing({
    nav: 100_000_000,
    entryPrice: 35,
    stopLossPrice: 33.25,
    target1Price: 40.25,
  });

  assert.ok(res);
  assert.equal(res.entryPrice, 35000);
  assert.equal(res.stopLossPrice, 33250);
  assert.ok(res.sharesToBuy > 0);
  assert.ok(res.sharesToBuy % 100 === 0);
});

test("calculatePositionSizing cảnh báo rủi ro cao khi StopLoss quá xa hoặc R:R < 1.5", () => {
  // Entry 50,000, SL 44,000 (Lỗ 12% > 9%), T1 53,000 (R:R < 1.5)
  const res = calculatePositionSizing({
    nav: 100_000_000,
    entryPrice: 50_000,
    stopLossPrice: 44_000,
    target1Price: 53_000,
  });

  assert.ok(res);
  assert.equal(res.rating, "HIGH_RISK");
});

test("calculatePositionSizing trả về null khi dữ liệu không hợp lệ (SL >= Entry hoặc NAV <= 0)", () => {
  assert.equal(
    calculatePositionSizing({ nav: 0, entryPrice: 50_000, stopLossPrice: 45_000 }),
    null
  );
  assert.equal(
    calculatePositionSizing({ nav: 100_000_000, entryPrice: 50_000, stopLossPrice: 52_000 }),
    null
  );
});
