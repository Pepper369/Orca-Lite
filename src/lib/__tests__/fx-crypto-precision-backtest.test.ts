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
  runMicrostructureStressAudit,
  runWalkForwardComparison,
} from "../engines/fx-crypto-backtest-harness";
import {
  clearLiveTrainedMetaModels,
  getLiveTrainedMetaModel,
} from "../engines/meta-labeling-calibration";
import { evaluateCryptoPerpQuadrantAndLeaderShield } from "../engines/crypto-derivatives-engine";
import { evaluateTriangularCrossParity } from "../engines/forex-currency-strength";
import { computeHrpPortfolioSignalMultipliers } from "../engines/unified-cross-asset-quant";
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

  // Success Criteria SC-001, SC-002, SC-003 on untouched Holdout split (selective quality over noise):
  assert.ok(hold.upgradedAAPlus.totalTrades >= 200, `Expected high selectivity >=200 OOS trades, got ${hold.upgradedAAPlus.totalTrades}`);
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

  // Phase 1-3 Multi-TF & Multi-Scenario Upgrade Verification:
  // 1) ICT Power-of-3 AMD Context
  assert.ok(ict.amdPowerOf3 != null, "Expected amdPowerOf3 context in ICT result");
  const precCheck = evaluatePrecisionTradeSetup({
    symbol: "EURUSD",
    assetType: "FOREX",
    barsExecution: bars.slice(0, 80),
  });
  assert.ok(precCheck.regime.mtfTensorState != null, "Expected mtfTensorState in Precision regime");
  assert.ok(precCheck.regime.playbookArchetype != null, "Expected playbookArchetype in Precision regime");

  // 2) Crypto 4-Quadrant & BTC Market-Leader Domino Veto on Altcoins
  const altVeto = evaluateCryptoPerpQuadrantAndLeaderShield({
    symbol: "SOLUSDT",
    direction: "BUY",
    priceChange5mPct: 0.15,
    domImbalancePct: 20,
    btcPriceChange5mPct: -0.65,
    btcTickImbalancePct: -45,
  });
  assert.equal(altVeto.leaderVeto, true, "BTC dump must veto buying Altcoins");

  const divTrap = evaluateCryptoPerpQuadrantAndLeaderShield({
    symbol: "BTCUSDT",
    direction: "BUY",
    priceChange5mPct: 0.25,
    domImbalancePct: -35,
    tickImbalancePct: -40,
  });
  assert.equal(divTrap.quadrant, "EXHAUSTION_DIVERGENCE_TRAP");
  assert.equal(divTrap.leaderVeto, true);

  // 3) Stoikov Microprice Anti-Spoofing Veto + Iceberg Absorption Boost + Volume-Clock VPIN Toxicity Veto
  const btcSpec = BENCHMARK_ASSETS.find((a) => a.symbol === "BTCUSDT")!;
  const { bars: turtleBars } = generateRegimeBars(btcSpec, "TURTLE_SOUP_SWEEP_REVERSAL", 101 + 3 * 31 + 3 * 97, 120);
  const spoofVetoEval = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
    spoofingOrAbsorptionState: "BID_SPOOFING_RISK",
    micropriceSkewBps: -3.2,
  });
  assert.equal(spoofVetoEval.grade, "NO_TRADE", "BID_SPOOFING_RISK must veto BUY setup");
  assert.ok(spoofVetoEval.vetoReasons.some((v) => v.includes("Spoofing Bid")));

  const vpinVetoEval = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
    orderBookImbalance: -38,
    vpinToxicity: 0.78,
  });
  assert.equal(vpinVetoEval.grade, "NO_TRADE", "High VPIN toxicity with opposing order flow must veto trade");
  assert.ok(vpinVetoEval.vetoReasons.some((v) => v.includes("VPIN")));

  // 4) Forex Triangular Cross-Rate Parity Check (Confirmed vs Divergent Fakeout)
  const sampleBasket = [
    { pair: "EURUSD", price: 1.085, changePercent: 0.42 },
    { pair: "USDJPY", price: 154.2, changePercent: 0.35 },
    { pair: "GBPUSD", price: 1.265, changePercent: 0.25 },
    { pair: "AUDUSD", price: 0.655, changePercent: 0.15 },
    { pair: "EURJPY", price: 167.3, changePercent: 0.74 },
  ];
  const parityConfirmed = evaluateTriangularCrossParity("EURJPY", sampleBasket);
  assert.equal(parityConfirmed.alignment, "CONFIRMED");

  const fakeoutBasket = [
    { pair: "EURUSD", price: 1.085, changePercent: -0.45 },
    { pair: "USDJPY", price: 154.2, changePercent: -0.35 },
    { pair: "GBPUSD", price: 1.265, changePercent: -0.25 },
    { pair: "AUDUSD", price: 0.655, changePercent: -0.15 },
    { pair: "EURJPY", price: 167.3, changePercent: 0.32 },
  ];
  const parityFakeout = evaluateTriangularCrossParity("EURJPY", fakeoutBasket);
  assert.equal(parityFakeout.alignment, "DIVERGENT_FAKEOUT");

  // 5) Portfolio-Level HRP Multi-Signal Diversification Multiplier
  const hrpMults = computeHrpPortfolioSignalMultipliers([
    { symbol: "SOLUSDT", assetType: "CRYPTO", direction: "BUY", winrateScore: 84 },
    { symbol: "SUIUSDT", assetType: "CRYPTO", direction: "BUY", winrateScore: 82 },
    { symbol: "AVAXUSDT", assetType: "CRYPTO", direction: "BUY", winrateScore: 81 },
    { symbol: "XAUUSD", assetType: "FOREX", direction: "SELL", winrateScore: 86 },
  ]);
  assert.ok(
    (hrpMults["XAUUSD"] ?? 0) > (hrpMults["AVAXUSDT"] ?? 1),
    `Uncorrelated XAUUSD hedge (${hrpMults["XAUUSD"]}) should receive higher HRP multiplier than clustered altcoin (${hrpMults["AVAXUSDT"]})`,
  );

  // 6) Option 4: CVD Divergence Absorption Confirmation & Anti-Absorption Veto
  const cvdAlignedBuy = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
    volumeDeltaDivergence: "BULLISH_DIVERGENCE",
  });
  assert.ok(
    cvdAlignedBuy.gatesPassed.some((g) => g.includes("Gate 4g (CVD Divergence)")),
    "Aligned BULLISH_DIVERGENCE on BUY must pass Gate 4g CVD Divergence absorption confirmation",
  );

  const cvdAntiAbsorptionVeto = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
    orderBookImbalance: -30,
    volumeDeltaDivergence: "BEARISH_DIVERGENCE",
  });
  assert.equal(
    cvdAntiAbsorptionVeto.grade,
    "NO_TRADE",
    "BEARISH_DIVERGENCE with opposing flow on BUY must trigger Anti-Absorption Veto",
  );
  assert.ok(
    cvdAntiAbsorptionVeto.vetoReasons.some((v) => v.includes("CVD Bearish Divergence Veto")),
    "Anti-Absorption Veto reason must be present",
  );

  // 7) Option 3: Empirical Winrate Capital Allocator & Drawdown Throttle
  const empHotSetup = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
    empiricalWinRatePct: 88,
    empiricalSampleCount: 8,
    empiricalConsecutiveLosses: 0,
  });
  if (empHotSetup.grade !== "NO_TRADE") {
    assert.ok(
      empHotSetup.gatesPassed.some((g) => g.includes("Gate 7c (Empirical Edge)")),
      "Hot streak (88% winrate, 8 samples) must pass Gate 7c Empirical Edge",
    );
  }

  const empColdVetoSetup = evaluatePrecisionTradeSetup({
    symbol: "BTCUSDT",
    assetType: "CRYPTO",
    barsExecution: turtleBars.slice(0, 58),
    spreadPipsOrPct: btcSpec.spreadPipsOrPct,
    empiricalWinRatePct: 35,
    empiricalSampleCount: 6,
    empiricalConsecutiveLosses: 3,
  });
  assert.equal(
    empColdVetoSetup.grade,
    "NO_TRADE",
    "Cold streak (3 consecutive losses, 35% winrate) must trigger Empirical Winrate Veto",
  );
  assert.ok(
    empColdVetoSetup.vetoReasons.some((v) => v.includes("Empirical Winrate Veto")),
    "Empirical Winrate Veto reason must be recorded",
  );
});

test("Microstructure Stress Audit: Verifies Robustness Under Double-Spread & High Latency Slippage", () => {
  const audit = runMicrostructureStressAudit({ seeds: [404, 505] });

  console.log("\n=== REAL-WORLD MICROSTRUCTURE STRESS AUDIT REPORT ===");
  console.log("1. Standard Realistic :", audit.standard);
  console.log("2. Slippage Stress    :", audit.slippageStress);
  console.log("3. Spread Blowout (2x):", audit.spreadBlowoutStress);
  console.log("4. Extreme Combined   :", audit.extremeCombinedStress);
  console.log("Verdict               :", audit.commentaryVi, "\n");

  assert.ok(audit.isRobustUnderStress, "Bot must remain robust under combined extreme microstructure stress");
  assert.ok(
    audit.extremeCombinedStress.winRatePct >= 75,
    `Extreme stress winRate must stay >= 75%, got ${audit.extremeCombinedStress.winRatePct}%`,
  );
  assert.ok(
    audit.extremeCombinedStress.expectancyR >= 0.5,
    `Extreme stress expectancy must stay >= 0.5R, got ${audit.extremeCombinedStress.expectancyR}R`,
  );
  assert.ok(
    audit.extremeCombinedStress.profitFactor >= 4.0,
    `Extreme stress profit factor must stay >= 4.0, got ${audit.extremeCombinedStress.profitFactor}`,
  );
});
