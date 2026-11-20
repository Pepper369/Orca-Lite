# Implementation Plan: Project-Wide Core Algorithm, Numerical Precision & Money-Flow Purification

**Spec**: `specs/002-core-algorithm-moneyflow-purification/spec.md`  
**Date**: 2026-11-20

---

## Phase 1: Money-Flow, Order-Flow, ICT/SMC & VSA Core Purification (`MF-01`..`MF-07`)
1. **`src/lib/engines/money-flow.ts`**:
   - Fix `buildLiquidity`: filter unswept `BUY_SIDE` with `l.price > last.close` and unswept `SELL_SIDE` with `l.price < last.close`; check sweep against `confirmedAtIndex = maxSwingIndexInCluster + halfWindow`; evaluate active sweep on `last` bar before excluding swept pools from `nearestBuySide`/`nearestSellSide`.
   - Fix `detectOrderBlocks`: use causal rolling 30-bar median spread up to bar `i`; require price to first leave the OB (`j > i`) before checking mitigation overlap; require `swing.confirmedAtIndex <= obIndex` for `hadLiquiditySweep`.
   - Fix `analyzeVsa`: compute `avgVolume` and `avgSpread` from prior `cfg.volumePeriod` bars excluding `last`; guard zero-volume series (`avgVolume <= 0 || last.volume <= 0`).
2. **`src/lib/engines/vsa-engine.ts`**:
   - Compute rolling prior-20-bar `volAvg` and `avgSpread` at each bar `i`; guard `volAvg <= 0 || b.volume <= 0` (return `null` instead of false `NO_SUPPLY`/`NO_DEMAND`); fix `isUpBar = b.close > prev.close` and `isDownBar = b.close < prev.close`.
3. **`src/lib/engines/forex-order-flow-pro.ts` & `src/components/forex-order-flow.tsx`**:
   - Distribute each bar's volume proportionally across all bins overlapped by `[b.low, b.high]` in `computeVolumeProfile`.
   - Compare CVD at the current swing low/high against the *previous local price swing low/high* within lookback in `detectCvdAndAbsorption`.
   - Replace local `getPipScale` with `getAssetPipSize(pair, "FOREX")`.
   - Fix `deriveOrderFlow` (`src/components/forex-order-flow.tsx`): compute `rawAvgVol = vols.reduce(...) / vols.length; const hasVolume = rawAvgVol > 0;`.
4. **`src/lib/services/screener-snapshot-service.ts` & `src/lib/services/sector-flow.ts`**:
   - Pass genuine `q?.activeBuyRatio` (normalized to `0..100`%) instead of `foreignRow?.buyRatioPct` into `activeBuyRatioPct` for `evaluateSmartMoneyFootprint` and `evaluateApexQuant`.
   - In `rankSectorsByFlow` (`src/lib/services/sector-flow.ts`), normalize `totalVolumeVND` instead of raw share `totalVolume`, and sort `topStocks` by signed `netForeignVnd` matching sector flow direction.

---

## Phase 2: Quantitative Math, Statistical Risk & Scale-Invariant Signal Engines (`QM-01`..`QM-06`, `TA-01`..`TA-05`)
1. **`src/lib/engines/advanced-quant-math.ts`**:
   - `estimateOrnsteinUhlenbeck`: enforce `const isStationary = b < -1e-5 && b > -1.0;` so $\phi = 1 + b \in (0, 1)$ strictly.
   - `calculateDeflatedSharpeRatio`: convert annualized `observedSharpe` to per-period Sharpe (`srPerBar = observedSharpe / Math.sqrt(annualizationFactor)`) when computing non-normal `seSr` and `srStar`, or scale `srStar` and `seSr` consistently in annualized units.
   - `calculateVaRAndCVaR`: clamp `histVaR95`/`histVaR99`/`cvar95`/`cvar99` at `Math.max(0, ...)` and use interpolated empirical quantile when `n < 40`.
2. **`src/lib/engines/trade-signal.ts` & `src/lib/engines/divergence.ts`**:
   - `techBiasFromSnapshot`: normalize `macdHistogram` by `price` or `atr` (when available) or scale adaptively across asset magnitudes.
   - `detectDivergences`: scale pivot breakdown (`1.2 * atr` instead of fixed `1.5%`) and `playing_out` threshold (`1.8 * atr` / `3.2 * atr` instead of fixed `2.0%` / `4.5%`).
3. **`src/lib/engines/mtf-consensus.ts`, `src/lib/engines/wyckoff-elliott.ts` & `src/lib/engines/historical-price-action-trainer.ts`**:
   - `evaluateHourlyBias`: normalize `avgPrice = quote.quoteVolume / quote.volume` when `avgPrice > p * 100` (`avgPrice /= 1000`).
   - `analyzeWyckoff`: normalize `candSlope` by `scPrice` (`candSlopePct = candSlope / scPrice` in `[-0.003, 0.008]`) and match benchmark RS by bar timestamp/nearest date.
   - `trainHistoricalPriceAction`: enter at `bars[i + 1].open || closes[i]` and evaluate intra-bar stops/targets starting reliably without same-bar close look-ahead.

---

## Phase 3: Stock Screener, Asymmetric Plan, Multi-Factor & Quant Studio Integrity (`SC-01`..`SC-06`, `QM-01`..`QM-02`)
1. **`src/lib/services/screener-snapshot-service.ts` & `src/lib/engines/asymmetric-quant-engine.ts`**:
   - Extract real swing supports/resistances via `supportResistance(parsed.ohlcvBars)` in `calculateBuyPointPlan` instead of pushing all 25 raw bar highs/lows.
   - Compute real stock Beta against `indexBars` (`VNINDEX`) returns covariance in `analyzeQuantFeatures`.
   - Cap `takeProfit` in `computeAsymmetricPlan` when a strong resistance ceiling sits below `3.5R` (expose truthful `riskReward` instead of forcing `>= 3.5R`).
2. **`src/lib/engines/orca-apex-quant-engine.ts`, `src/lib/engines/multi-factor-quant-composite.ts` & `src/lib/engines/orca-master-composite.ts`**:
   - Anchor `isWyckoffSpring` in `analyzeBottomReversal` to bars whose low is within `2.5%` of `lowestLow20` or pierces a prior 5-bar low; reuse `rev.isFreshBullishDivergence` instead of running `detectDivergences` twice.
   - Fix `scoreFundamentalPillar` additive weighting and re-sync `category`/`categoryVi`/`summaryVi` after percentile calibration in `calculateUniverseMultiFactor`.
   - Treat `altmanZone === "EXEMPT_FINANCIAL"` neutrally in `computeRawOrcaScore`.
3. **`src/lib/engines/miquant-quant-engine.ts`, `src/lib/quant/fireant-screener-engine.ts` & `src/lib/quant/quant-engine.ts`**:
   - Replace ASCII-hash fabrication in `computeQuantAttributes` with deterministic derivation from available metrics/volatility (and honest fallbacks).
   - Fix `calcRsi` (Wilder RMA) and `calcMacd` (true EMA 12/26/9) in `fireant-screener-engine.ts`.
   - Upgrade `executeBacktest` in `quant-engine.ts` to evaluate real strategy parameter rules over historical/deterministic multi-regime bar trajectories rather than parameter-blind Box-Muller white noise.

---

## Phase 4: Verification & Regression Suite
- Add comprehensive unit test suite `src/lib/__tests__/core-algorithm-purification.test.ts` covering all 24 defects (`MF-01`..`MF-07`, `SC-01`..`SC-06`, `QM-01`..`QM-06`, `TA-01`..`TA-05`).
- Run `npx tsc --noEmit`, `npx tsx --conditions=react-server --test ...`, `npx vitest run ...`, and `npm run build` (`vite build`).
