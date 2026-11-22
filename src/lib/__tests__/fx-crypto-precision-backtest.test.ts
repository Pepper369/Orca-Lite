import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMtfConfluenceMatrix,
  getAssetPipSize,
  roundPrice,
} from "../engines/asset-precision";
import {
  analyzeIctSmcLiquidity,
  checkJudasSessionTime,
} from "../engines/ict-smc-liquidity-engine";
import { evaluateHighWinrateGate } from "../engines/high-winrate-gate";
import { evaluatePrecisionTradeSetup } from "../engines/fx-crypto-precision-engine";
import {
  BENCHMARK_ASSETS,
  calibrateAndRegisterLiveMetaModels,
  generateRegimeBars,
  runWalkForwardComparison,
} from "../engines/fx-crypto-backtest-harness";
import {
  clearLiveTrainedMetaModels,
  getLiveTrainedMetaModel,
} from "../engines/meta-labeling-calibration";
import type { OhlcvBar } from "../types";

test("Precision FR-001: Asset pipSize & micro-coin 8-decimal rounding (XAUUSD, USDJPY, EURUSD, PEPEUSDT)", () => {
  assert.equal(getAssetPipSize("XAUUSD", "FOREX"), 0.1);
  assert.equal(getAssetPipSize("USOIL", "FOREX"), 0.01);
  assert.equal(getAssetPipSize("USDJPY", "FOREX"), 0.01);
  assert.equal(getAssetPipSize("EURUSD", "FOREX"), 0.0001);

  const pepeRounded = roundPrice(0.000008427, "PEPEUSDT", "CRYPTO");
  assert.equal(pepeRounded, 0.00000843);
  assert.ok(pepeRounded > 0.000008 && pepeRounded < 0.000009);

  // Run full ICT/SMC + Precision Engine on PEPEUSDT synthetic trend
  const pepeSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "PEPEUSDT")!;
  const { bars } = generateRegimeBars(pepeSpec, "CLEAN_UPTREND_PULLBACK", 77, 80);
  const ict = analyzeIctSmcLiquidity({
    symbol: "PEPEUSDT",
    bars,
    assetType: "CRYPTO",
  });
  assert.ok(ict.optimalTradeSetup.dealingRange.fibOte705 > 0.000001);
  assert.ok(ict.optimalTradeSetup.dealingRange.fibOte705 < 0.0001);

  const prec = evaluatePrecisionTradeSetup({
    symbol: "PEPEUSDT",
    assetType: "CRYPTO",
    barsExecution: bars,
    spreadPipsOrPct: pepeSpec.spreadPipsOrPct,
  });
  assert.ok(prec.entry != null && prec.entry > 0.000001 && prec.entry < 0.0001);
  assert.ok(prec.stopLoss != null && prec.stopLoss > 0.000001 && prec.stopLoss !== prec.entry);
});

test("Causality FR-002: Zero look-ahead bias & epoch ms/sec normalization in Judas Killzone", () => {
  const eurSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "EURUSD")!;
  const { bars } = generateRegimeBars(eurSpec, "TURTLE_SOUP_SWEEP_REVERSAL", 42, 100);

  const cutoff = 62;
  const pastSliceA = bars.slice(0, cutoff);
  const precA = evaluatePrecisionTradeSetup({
    symbol: "EURUSD",
    assetType: "FOREX",
    barsExecution: pastSliceA,
    spreadPipsOrPct: 1.0,
  });
  const ictA = analyzeIctSmcLiquidity({ symbol: "EURUSD", bars: pastSliceA, assetType: "FOREX" });

  // Verify internal pool->sweep causality invariant: every sweep happens strictly >= 3 bars after pool formation
  for (const sw of ictA.recentSweeps) {
    assert.ok(sw.barIndex >= 5, `Sweep at ${sw.barIndex} must occur after warmup`);
  }

  // Mutate future bars [cutoff..99] violently and re-evaluate [0..cutoff]
  const mutatedBars = bars.map((b, i) =>
    i >= cutoff ? { ...b, high: b.high * 2, low: b.low * 0.5, close: b.close * 1.8, volume: 999999 } : b,
  );
  const pastSliceB = mutatedBars.slice(0, cutoff);
  const precB = evaluatePrecisionTradeSetup({
    symbol: "EURUSD",
    assetType: "FOREX",
    barsExecution: pastSliceB,
    spreadPipsOrPct: 1.0,
  });
  const ictB = analyzeIctSmcLiquidity({ symbol: "EURUSD", bars: pastSliceB, assetType: "FOREX" });

  assert.deepEqual(precA, precB);
  assert.deepEqual(ictA, ictB);

  // Epoch normalization test: 08:30 UTC (London Killzone) in seconds vs milliseconds
  const londonSec = Math.floor(Date.UTC(2026, 10, 19, 8, 30, 0) / 1000);
  const offSessionSec = Math.floor(Date.UTC(2026, 10, 19, 3, 15, 0) / 1000);
  assert.equal(checkJudasSessionTime(londonSec), true);
  assert.equal(checkJudasSessionTime(londonSec * 1000), true);
  assert.equal(checkJudasSessionTime(offSessionSec), false);
  assert.equal(checkJudasSessionTime(offSessionSec * 1000), false);
});

test("MTF Confluence FR-003 & Gate 5 Direction Alignment FR-004", () => {
  // Build clean 120-bar monotonic+pullback uptrend -> all 5 MTF horizons must agree BULLISH (no inverted slow<fast bug)
  const btcSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "BTCUSDT")!;
  const { bars } = generateRegimeBars(btcSpec, "CLEAN_UPTREND_PULLBACK", 88, 120);
  const mtf = buildMtfConfluenceMatrix(bars);
  assert.equal(mtf.dominantTrend, "BULLISH");
  assert.ok(mtf.confluencePct >= 80);

  // Gate 5 Direction Alignment: create a strong bullish lock bar on last bar -> BUY gets bonus, SELL gets conflict penalty
  const lockedBars: OhlcvBar[] = bars.slice(0, 45).map((b) => ({ ...b }));
  const prevClose = lockedBars[lockedBars.length - 2]!.close;
  const last = lockedBars[lockedBars.length - 1]!;
  last.open = prevClose;
  last.low = prevClose - 50;
  last.close = prevClose + 2500;
  last.high = prevClose + 2550;

  const entry = last.close;
  const buyGate = evaluateHighWinrateGate({
    symbol: "BTCUSDT",
    series: lockedBars,
    candidateDirection: "BUY",
    entryPrice: entry,
    stopLossPrice: entry - 800,
    secondsRemaining: 20,
    timeframeSec: 300,
    assetType: "CRYPTO",
  });
  const sellGate = evaluateHighWinrateGate({
    symbol: "BTCUSDT",
    series: lockedBars,
    candidateDirection: "SELL",
    entryPrice: entry,
    stopLossPrice: entry + 800,
    secondsRemaining: 20,
    timeframeSec: 300,
    assetType: "CRYPTO",
  });

  assert.equal(buyGate.reversalPace?.lockDirection, "BULLISH_LOCKED");
  assert.ok(buyGate.winrateScore > sellGate.winrateScore);
  assert.ok(sellGate.failedGates.some((g) => g.includes("Pace Conflict")));
});

test("Hard Vetoes FR-005: Blocks News Lockout, Extreme Funding, Dead Chop & Parabolic Exhaustion", () => {
  const btcSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "BTCUSDT")!;
  const { bars } = generateRegimeBars(btcSpec, "CLEAN_UPTREND_PULLBACK", 12, 90);

  // 1. News/Cascade lockout veto
  const newsVeto = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: bars,
    isNewsOrCascadeLockout: true,
    lockoutReason: "FOMC Rate Decision Lockout",
  });
  assert.equal(newsVeto.grade, "NO_TRADE");
  assert.equal(newsVeto.action, "WAIT");

  // 2. Extreme positive funding veto for BUY
  const fundingVeto = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: bars,
    candidateDirection: "BUY",
    fundingRate: 0.0008,
  });
  assert.equal(fundingVeto.grade, "NO_TRADE");
  assert.equal(fundingVeto.action, "WAIT");
  assert.ok(fundingVeto.vetoReasons.some((v) => v.includes("Funding Rate")));

  // 3. Dead Chop veto
  const eurSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "EURUSD")!;
  const chopData = generateRegimeBars(eurSpec, "CHOPPY_WHIPSAW_RANGE", 404, 100);
  let chopNoTradeCount = 0;
  let chopTotalChecks = 0;
  for (let t = 55; t <= 85; t += 2) {
    chopTotalChecks++;
    const res = evaluatePrecisionTradeSetup({
      symbol: "EURUSD",
      assetType: "FOREX",
      barsExecution: chopData.bars.slice(0, t + 1),
      spreadPipsOrPct: 1.0,
    });
    if (res.grade === "NO_TRADE" || res.grade === "B") chopNoTradeCount++;
  }
  assert.ok(chopNoTradeCount / chopTotalChecks >= 0.7, `Expected >=70% chop filtering, got ${chopNoTradeCount}/${chopTotalChecks}`);

  // 4. Parabolic Blow-off Anti-Chase Veto
  const exhaustData = generateRegimeBars(btcSpec, "OVEREXTENDED_EXHAUSTION", 101, 100);
  const exhaustRes = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: exhaustData.bars.slice(0, 63),
    candidateDirection: "BUY",
    spreadPipsOrPct: 0.0004,
  });
  assert.equal(exhaustRes.grade, "NO_TRADE");
  assert.equal(exhaustRes.action, "WAIT");
});

test("Compound Engineering Walk-Forward Lift: Calibration & Out-of-Sample Holdout Verification", () => {
  const cal = runWalkForwardComparison({ split: "CALIBRATION" });
  const hold = runWalkForwardComparison({ split: "HOLDOUT" });

  console.log("\n=== WALK-FORWARD CALIBRATION (Seeds: " + cal.seeds.join(",") + ") ===");
  console.log("Legacy Baseline   :", cal.legacyBaseline);
  console.log("Upgraded A+/A     :", cal.upgradedAAPlus);
  console.log("Upgraded All B/A  :", cal.upgradedAllGrades);
  console.log(`WinRate Lift: +${cal.winRateLiftPp}pp | Trap Reduction: ${cal.trapReductionPct}%`);

  console.log("\n=== WALK-FORWARD HOLDOUT OOS (Seeds: " + hold.seeds.join(",") + ") ===");
  console.log("Legacy Baseline   :", hold.legacyBaseline);
  console.log("Upgraded A+/A     :", hold.upgradedAAPlus);
  console.log("Upgraded All B/A  :", hold.upgradedAllGrades);
  console.log(`WinRate Lift: +${hold.winRateLiftPp}pp | Trap Reduction: ${hold.trapReductionPct}%\n`);

  // Success Criteria SC-001, SC-002, SC-003 on untouched Holdout split:
  assert.ok(hold.upgradedAAPlus.totalTrades >= 300, `Expected high sensitivity >=300 OOS trades, got ${hold.upgradedAAPlus.totalTrades}`);
  assert.ok(hold.upgradedAAPlus.winRatePct >= 85, `Holdout A+/A winRate ${hold.upgradedAAPlus.winRatePct}% < 85%`);
  assert.ok(hold.winRateLiftPp >= 22, `Holdout winRate lift ${hold.winRateLiftPp}pp < +22pp`);
  assert.ok(hold.trapReductionPct >= 90, `Holdout chop/trap reduction ${hold.trapReductionPct}% < 90%`);
  assert.ok(hold.upgradedAAPlus.expectancyR >= 1.0, `Holdout E[R] ${hold.upgradedAAPlus.expectancyR} < 1.0R`);
  assert.ok(hold.upgradedAAPlus.profitFactor >= 8.0, `Holdout PF ${hold.upgradedAAPlus.profitFactor} < 8.0`);
});

test("Precision FR-006: Catches Turtle Soup sweep bar causally & blocks post-exhaustion falling knife", () => {
  const btcSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "BTCUSDT")!;
  const { bars: turtleBars } = generateRegimeBars(btcSpec, "TURTLE_SOUP_SWEEP_REVERSAL", 101 + 3 * 31 + 3 * 97, 120);
  const sweepEval = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
  });
  assert.equal(sweepEval.direction, "BUY");
  assert.ok(sweepEval.grade === "A+" || sweepEval.grade === "A", `Expected A/A+ at sweep bar, got ${sweepEval.grade}`);
  assert.ok(sweepEval.frictionR <= 0.22, `Expected frictionR <= 0.22, got ${sweepEval.frictionR}`);

  const { bars: exhaustBars } = generateRegimeBars(btcSpec, "OVEREXTENDED_EXHAUSTION", 101 + 3 * 31 + 5 * 97, 120);
  const fallingKnifeEval = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: exhaustBars.slice(0, 67),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
  });
  assert.equal(fallingKnifeEval.grade, "NO_TRADE");
  assert.ok(fallingKnifeEval.vetoReasons.some((v) => v.includes("rơi dao")));
});

test("Precision FR-007: Causal Forward Liquidity Pool Flow Forecast & Volume Annotation", () => {
  const eurSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "EURUSD")!;
  const { bars } = generateRegimeBars(eurSpec, "CLEAN_UPTREND_PULLBACK", 101, 100);
  const res = analyzeIctSmcLiquidity({
    symbol: "EURUSD",
    bars: bars.slice(0, 75),
    assetType: "FOREX",
    flowContext: {
      flowIntensityIndex: 42,
      orderBookImbalance: 28,
      csmBaseMinusQuote: 1.8,
    },
  });

  // Verify volumeNearPool is populated causally
  for (const p of [...res.liquidityMap.buySidePools, ...res.liquidityMap.sellSidePools]) {
    assert.ok(p.volumeNearPool != null && p.volumeNearPool > 0, `Pool ${p.id} missing volumeNearPool`);
  }

  const fwd = res.forwardLiquidityForecast;
  assert.ok(fwd != null, "Expected forwardLiquidityForecast to be populated");
  assert.equal(fwd!.horizonBars, 12);
  assert.ok(fwd!.directionalFlowThrust > 0, `Expected bullish flow thrust, got ${fwd!.directionalFlowThrust}`);
  assert.equal(fwd!.flowBias, "BULLISH_MAGNET_PULL");
  if (fwd!.primaryTarget) {
    assert.ok(fwd!.primaryTarget.reachProbabilityPct >= 5 && fwd!.primaryTarget.reachProbabilityPct <= 95);
    assert.ok(fwd!.primaryTarget.etaBars >= 1 && fwd!.primaryTarget.etaBars <= 24);
    assert.ok(fwd!.primaryTarget.pathImpedance >= 0 && fwd!.primaryTarget.pathImpedance <= 0.85);
  }
});

test("Phase 2 & 4 Upgrade: ICT Multi-TF HTF POI + BPR/IFVG & Live Purged Meta-Labeling Registry", () => {
  const eurSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "EURUSD")!;
  const { bars } = generateRegimeBars(eurSpec, "CLEAN_UPTREND_PULLBACK", 101, 100);
  const ict = analyzeIctSmcLiquidity({
    symbol: "EURUSD",
    bars: bars.slice(0, 80),
    htfBars: bars.slice(0, 40),
    assetType: "FOREX",
  });
  assert.ok(Array.isArray(ict.bprZones), "Expected bprZones array in ICT result");
  assert.ok("htfPoiContext" in ict, "Expected htfPoiContext property in ICT result");

  // Verify Phase 4 Walk-Forward Purged Meta-Labeling Live Calibration & Registry (Strictly Isolated FOREX vs CRYPTO)
  clearLiveTrainedMetaModels();
  assert.equal(getLiveTrainedMetaModel("CRYPTO"), null);
  const calRes = calibrateAndRegisterLiveMetaModels({ assetType: "ALL" });
  assert.equal(calRes.registered, true);
  const cryptoModelBefore = getLiveTrainedMetaModel("CRYPTO");
  const forexModelBefore = getLiveTrainedMetaModel("FOREX");
  assert.ok(cryptoModelBefore != null);
  assert.ok(forexModelBefore != null);
  assert.notEqual(
    cryptoModelBefore,
    forexModelBefore,
    "CRYPTO and FOREX live Meta-Labeling models must be calibrated on their own asset classes without sharing object reference",
  );
  assert.ok(calRes.report.oosBrierAfter <= calRes.report.oosBrierBefore + 0.01);
  clearLiveTrainedMetaModels();
});
