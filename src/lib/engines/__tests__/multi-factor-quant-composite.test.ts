import test from "node:test";
import assert from "node:assert/strict";
import {
  determineMarketRegime,
  scoreTechnicalPillar,
  scoreFundamentalPillar,
  scoreValuationPillar,
  buildTripleBarrierPlan,
  computeMultiFactorComposite,
  calculateUniverseMultiFactor,
  type MultiFactorInput,
} from "../multi-factor-quant-composite";

test("determineMarketRegime correctly classifies market state", () => {
  // Bull: VN-Index > MA50 > MA200
  const bull = determineMarketRegime(1280, 1250, 1220, 1.0);
  assert.equal(bull, "BULL_EXPANSION");

  // Bear: VN-Index < MA50 < MA200
  const bear = determineMarketRegime(1150, 1190, 1220, 1.0);
  assert.equal(bear, "BEAR_CAPITULATION");

  // Sideway: Moving averages tangled
  const sideway = determineMarketRegime(1240, 1245, 1238, 1.0);
  assert.equal(sideway, "SIDEWAY_CONSOLIDATION");

  // High volatility shock
  const shock = determineMarketRegime(1250, 1240, 1210, 2.2);
  assert.equal(shock, "HIGH_VOLATILITY");
});

test("scoreTechnicalPillar rewards RS, orderflow, and Apex launch zone", () => {
  const strongTech: MultiFactorInput = {
    symbol: "FPT",
    rsRating: 92,
    activeBuyRatio: 0.65,
    volumeAbsorptionRatio: 1.8,
    launchZoneDistancePct: 3.5, // Inside [0.8%, 7.5%]
    overheadRoomPct: 9.0, // >= 6.5%
    ouHalfLifeDays: 12,
  };

  const { score, signals } = scoreTechnicalPillar(strongTech);
  assert.ok(score >= 85, `Technical score should be >= 85, got ${score}`);
  assert.ok(signals.some((s) => s.includes("RS 92/99")));
  assert.ok(signals.some((s) => s.includes("Apex chuẩn")));
});

test("scoreFundamentalPillar penalizes Sloan accruals and DuPont excessive leverage", () => {
  const qualityFund: MultiFactorInput = {
    symbol: "VNM",
    fScore: 8,
    roic: 21.0,
    cfoToNetProfit: 1.15,
    sloanAccrualRatio: 2.5, // Clean <= 5%
    altmanZScore: 3.8, // Safe > 2.6
    interestCoverage: 12.0,
  };

  const qResult = scoreFundamentalPillar(qualityFund);
  assert.ok(qResult.score >= 85, `Quality fundamental should score >= 85, got ${qResult.score}`);

  const badFund: MultiFactorInput = {
    symbol: "RISK",
    fScore: 3,
    roic: 4.0,
    isLeverageDrivenRoe: true,
    cfoToNetProfit: 0.35, // Paper earnings
    sloanAccrualRatio: 14.5, // Dangerous accrual
    altmanZScore: 0.95, // Distress
    interestCoverage: 1.1,
  };

  const bResult = scoreFundamentalPillar(badFund);
  assert.ok(bResult.score <= 35, `Bad fundamental should score <= 35, got ${bResult.score}`);
  assert.ok(bResult.signals.some((s) => s.includes("Dồn tích cao")));
  assert.ok(bResult.signals.some((s) => s.includes("Lợi nhuận trên giấy")));
});

test("scoreValuationPillar rewards deep 5Y P/E discount and high MOS", () => {
  const cheapVal: MultiFactorInput = {
    symbol: "MBB",
    pe: 5.5,
    peMedian5Y: 7.8, // > 25% discount
    pb: 1.05,
    pbTheoreticalGordon: 1.35,
    fcfYieldPct: 8.5,
    marginOfSafetyPct: 22.0,
  };

  const { score, signals } = scoreValuationPillar(cheapVal);
  assert.ok(score >= 80, `Valuation score should be >= 80, got ${score}`);
  assert.ok(signals.some((s) => s.includes("Biên an toàn định giá MOS")));
});

test("buildTripleBarrierPlan enforces R:R >= 2.2x and T+20 time horizon", () => {
  const plan = buildTripleBarrierPlan(50000, 1250, 10.0);
  assert.equal(plan.entryPrice, 50000);
  assert.ok(plan.upperBarrierPrice > plan.entryPrice);
  assert.ok(plan.lowerBarrierPrice < plan.entryPrice);
  assert.ok(plan.riskRewardRatio >= 2.2, `Risk-Reward ratio should be >= 2.2x, got ${plan.riskRewardRatio}`);
  assert.equal(plan.timeHorizonDays, 20);
  assert.equal(plan.isViable, true);
});

test("computeMultiFactorComposite handles elite stocks and hard elimination red flags", () => {
  const eliteStock: MultiFactorInput = {
    symbol: "HPG",
    name: "Tập đoàn Hòa Phát",
    price: 28000,
    rsRating: 88,
    activeBuyRatio: 0.62,
    volumeAbsorptionRatio: 1.6,
    launchZoneDistancePct: 2.5,
    overheadRoomPct: 8.5,
    volume20Avg: 15_000_000,
    atr14: 700,
    roe: 18.5,
    roic: 16.2,
    fScore: 8,
    cfoToNetProfit: 1.1,
    sloanAccrualRatio: 3.5,
    altmanZScore: 2.9,
    interestCoverage: 6.5,
    pe: 10.5,
    peMedian5Y: 13.5,
    pb: 1.4,
    marginOfSafetyPct: 18.0,
  };

  const eliteResult = computeMultiFactorComposite(eliteStock, "BULL_EXPANSION");
  assert.ok(eliteResult.compositeScore >= 80, `Elite stock score should be >= 80, got ${eliteResult.compositeScore}`);
  assert.ok(eliteResult.category === "SUPER_ELITE" || eliteResult.category === "LEADER");
  assert.equal(eliteResult.hardEliminated, false);
  assert.ok(eliteResult.tripleBarrier != null);

  // Stock with illiquid volume (volume20Avg < 80k) -> Hard Eliminated
  const illiquidStock: MultiFactorInput = {
    symbol: "PENNY",
    name: "Cổ phiếu siêu nhỏ",
    price: 3200,
    volume20Avg: 45000, // < 80k shares/day
    rsRating: 90,
    fScore: 6,
  };

  const illiquidResult = computeMultiFactorComposite(illiquidStock, "BULL_EXPANSION");
  assert.equal(illiquidResult.hardEliminated, true);
  assert.ok(illiquidResult.compositeScore <= 35, "Hard-eliminated stock must score <= 35");
  assert.equal(illiquidResult.category, "AVOID");
});

test("calculateUniverseMultiFactor scales multi-stock universe into 1 - 99 percentiles", () => {
  const universe: MultiFactorInput[] = [
    { symbol: "VNM", rsRating: 85, fScore: 8, pe: 14.0, volume20Avg: 2_000_000 },
    { symbol: "MBB", rsRating: 82, fScore: 7, pe: 5.5, volume20Avg: 12_000_000 },
    { symbol: "FPT", rsRating: 95, fScore: 8, pe: 20.0, volume20Avg: 3_000_000 },
    { symbol: "WEAK", rsRating: 25, fScore: 3, pe: 45.0, volume20Avg: 500_000 },
  ];

  const map = calculateUniverseMultiFactor(universe, "BULL_EXPANSION");
  assert.equal(map.size, 4);

  const fpt = map.get("FPT");
  const weak = map.get("WEAK");

  assert.ok(fpt != null);
  assert.ok(weak != null);
  assert.ok(fpt.compositeScore > weak.compositeScore, "Leader FPT must score higher than WEAK");
});
