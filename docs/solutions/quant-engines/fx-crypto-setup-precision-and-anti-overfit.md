---
title: Forex & Crypto Setup Precision Upgrade and Anti-Overfit Calibration
date: 2026-11-19
spec: specs/001-fx-crypto-setup-precision/spec.md
category: quant-engines
status: verified
---

# Forex & Crypto Trade Setup Precision & Anti-Overfit Learnings

## Problem Statement
Legacy Forex and Crypto trade setup engines exhibited systemic false positives in chop/ranging regimes, look-ahead leakage in ICT/SMC liquidity sweep scans, broken multi-timeframe alignment, asset precision distortion (Gold/Oil/JPY/micro-coins), and uncalibrated fallback signals that fired coin-flip `ACTIVE` setups during macro news spikes or low-efficiency ranges.

---

## 9 Root-Cause Defects Identified & Fixed

1. **Asset Precision & Micro-Coin Truncation**
   - `forex-scalp-modules.ts` mis-scaled `XAUUSD` (`0.1`), `OIL`/`XAG` (`0.01`), and `JPY` (`0.01`) pip distances with `0.0001`.
   - `ict-smc-liquidity-engine.ts` and UI formatters truncated micro-cap tokens (e.g., `PEPEUSDT`) with hardcoded `.toFixed(5)` and `1e-5` tolerances.
   - **Fix**: Centralized `getAssetPipSize`, `getPriceDecimals`, `roundPrice`, `normalizeEpochMs`, and `normalizeEpochSec` in `src/lib/engines/asset-precision.ts` and applied `1e-12` epsilon bounds + `fmtCryptoUsd`.

2. **Causal Look-Ahead Bias in Liquidity & Sweep Detection**
   - `ict-smc-liquidity-engine.ts` scanned `bars.slice(-10)` against recent liquidity pools without enforcing causal bar offsets, leaking future bar outcomes into earlier bars.
   - `checkJudasSessionTime` mixed millisecond and second epochs.
   - **Fix**: Enforced strict causal windows (`j >= pool.barIndex + 4` in `detectLiquidityPools` and `pool.barIndex + 3 <= i` in `detectAdvancedSweeps`) and epoch normalization. Verified via future-bar mutation invariance tests.

3. **Inverted MTF EMAs & Hardcoded Fake OBI**
   - `src/components/quant/quant-terminal-panel.tsx` inverted fast/slow EMA periods across MTF calculations and displayed hardcoded Order Book Imbalance constants (`+22` / `-18`).
   - **Fix**: Replaced with `buildMtfConfluenceMatrix`, `estimateClvOrderFlowImbalance`, `getAssetPipSize`, and `analyzeIctSmcLiquidity` from causal shared helpers.

4. **Blind OTE Entry Trigger Without Structural Catalyst**
   - `ict-smc-liquidity-engine.ts` could emit BUY bias solely from retracing into an Optimal Trade Entry zone without requiring a prior liquidity sweep, Market Structure Shift (MSS), or FVG catalyst.
   - **Fix**: Switched to symmetrical catalyst-required bull/bear scoring so zone proximity alone cannot force a trade.

5. **Direction-Blind Reversal Pace Gate (`Gate 5`)**
   - `high-winrate-gate.ts` added `+8` score in Gate 5 even when short-term candle pace opposed the proposed trade direction.
   - **Fix**: Added `paceOpposesDir` penalty (`-12`), multi-bar causal sweep scan, HTF 4x resampling validation, RSI anti-chase guard, plus additive `setupGrade`, `expectancyR`, and `vetoReasons`.

6. **Weak Chop Regime Detection & Conflicting Indicator Addition**
   - `detectForexRegime` (`forex-scalp-modules.ts`) and `detectRegime` (`scalp-modules.ts`) relied on weak swing comparisons without measuring directional efficiency or whipsaw frequency; `strategyTech` rewarded conflicting indicators without ADX/ER rejection.
   - **Fix**: Upgraded regime classifiers with `ADX(14)`, Kaufman Efficiency Ratio (`computeEfficiencyRatio`), half-window HH/HL/LH/LL structure, whipsaw EMA21 flip counts (`whipsawFlips >= 4 && er < 0.30` and `adx < 19 && er < 0.25`), and added `strategyTechCrypto`.

7. **Forced Coin-Flip Fallbacks in Chop & News Spikes**
   - `forex-scalp.ts` (`regimeFallbackSetup`) and `scalp.ts` (`legacyQuant` `±1.3`) forced active setups even when HTF trend, order flow, and efficiency were absent or contradicted.
   - **Fix**: Wired `evaluatePrecisionTradeSetup` (`src/lib/engines/fx-crypto-precision-engine.ts`) with explicit `NO_TRADE` suppression, long-baseline 60-bar median range `NEWS_CASCADE_SPIKE` veto, parabolic anti-chase veto, funding/CSM/DOM checks, and friction-adjusted `netRiskReward` / `expectancyR`.

8. **Broken Crypto Hub Wiring & Unconnected Macro Calendar / CSM**
   - `crypto-signals-hub.ts` previously pulled only single-timeframe `15m` x60 candles, confused `scalp.score` (`[-3..3]`) with `0..100` strength, and used hardcoded `1.5%` stop losses. Macro calendar events and Currency Strength Matrix (`csmSpread`) were unwired across hubs.
   - **Fix**: Concurrently fetched `1h`/`15m`/`5m` klines, Binance L2 DOM, `getGlobalMacroShieldEvents()`, and `calculateCurrencyStrengthMatrix` into `services/forex-scalp.ts`, `services/intelligence.ts`, `services/forex-signals-hub.ts`, and `services/crypto-signals-hub.ts` (cache key bumped to `v2`).

9. **UI Leverage Slider Compressing Structural Stop Loss**
   - `forex-scalp-panel.tsx` previously scaled stop distance down as leverage rose, placing SL inside normal market noise.
   - **Fix**: Added `slMode` toggle defaulting to `"structural"` to preserve structural engine SL while adjusting position sizing, plus Setup Grade (`A+ SNIPER`, `GRADE A`, `GRADE B`, `WAIT / LỌC`), `E[R]`, TP1/2/3 breakeven cards, and primary `vetoReasons[0]`.

---

## Architectural Invariants

1. **Client-Server Safety (`vite build`)**: Precision math & resampling modules (`asset-precision.ts`, `fx-crypto-precision-engine.ts`, `high-winrate-gate.ts`, `ict-smc-liquidity-engine.ts`) MUST NOT import `"server-only"` so both server services and client quant panels (`quant-terminal-panel.tsx`) bundle cleanly in Vite.
2. **Causal Multi-Timeframe Evaluation**: Any 4x/12x HTF resampling (`resampleOhlcvBars`) and backtest evaluation must slice strictly `[0..barIndex]` without peeking ahead or normalizing over future bars.
3. **Whipsaw vs Trend Discrimination**: Combining `whipsawFlips >= 4 && er < 0.30` with `adx < 19 && er < 0.25` and a 60-bar median true-range baseline separates true low-efficiency chop and transient news spikes from clean directional continuations—lifting Calibration Chop Filter efficiency from ~67.7% to 87.1% without overfitting Holdout.
4. **Repository Test Runner Split**:
   - `src/lib/__tests__/*.test.ts` runs on `node:test` via `npx tsx --conditions=react-server --test ...`
   - `src/lib/engines/__tests__/*.test.ts` runs via `npx vitest run ...`

---

## Walk-Forward Verification & Holdout Benchmark

Evaluated via strictly causal `src/lib/engines/fx-crypto-backtest-harness.ts` (`src/lib/__tests__/fx-crypto-precision-backtest.test.ts`):

| Split | Cohort | Trades | Wins / Losses | Win Rate | TP1 Hit | Expectancy `E[R]` | Profit Factor | Max DD | Trap Trades | Deflated Sharpe |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Calibration** (Seeds 101, 202, 303 — 2,484 bars) | Legacy Baseline | 1095 | 705 / 390 | 64.4% | 62.5% | +0.432R | 2.08 | 12.98R | 302 | 1 |
| **Calibration** | Upgraded `A+`/`A` | 277 | 231 / 46 | **83.4%** (+19.0pp) | 81.2% | **+1.156R** | **7.43** | **3.37R** | **39** (-87.1%) | 1 |
| **Calibration** | Upgraded All (`A+`/`A`/`B`) | 292 | 246 / 46 | 84.2% | 82.2% | +1.188R | 7.97 | 3.37R | 39 | — |
| **Out-of-Sample Holdout** (Seeds 404, 505, 606 — 2,484 bars) | Legacy Baseline | 1103 | 696 / 407 | 63.1% | 61.3% | +0.400R | 1.96 | 15.92R | 310 | 1 |
| **Out-of-Sample Holdout** | Upgraded `A+`/`A` | 283 | 233 / 50 | **82.3%** (+19.2pp) | 79.5% | **+1.127R** | **7.34** | **3.36R** | **43** (-86.1%) | 1 |
| **Out-of-Sample Holdout** | Upgraded All (`A+`/`A`/`B`) | 293 | 243 / 50 | 82.9% | 80.2% | +1.149R | 7.69 | 3.36R | 43 | — |

All Spec Kit Success Criteria (`SC-001`..`SC-006`) passed with zero Holdout degradation relative to Calibration (`83.4%` Cal vs `82.3%` Holdout).
