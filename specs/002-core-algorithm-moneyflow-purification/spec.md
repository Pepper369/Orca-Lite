# Feature Specification: Project-Wide Core Algorithm, Numerical Precision & Money-Flow Purification

**Feature ID**: `002-core-algorithm-moneyflow-purification`  
**Date**: 2026-11-20  
**Methodology**: GitHub Spec Kit (SDD) + Compound Engineering + Graphify AST Dependency Graph (`4,428 nodes · 12,523 edges · 187 communities` in `src/lib`)  
**Status**: Audited & Planned

---

## 1. Problem Statement & Graphify Structural Audit

A full-repository Graphify AST & dependency audit across `src/lib` (`505 files`, `4,428 code nodes`, `12,523 edges`, `187 communities`) and all core engines/services uncovered **24 root-cause defects** across 4 domains:
1. **Money-Flow, Order-Flow, ICT/SMC & VSA Recognition (`MF-01`..`MF-07`)**: Self-canceling liquidity sweep logic, self-mitigating Order Blocks, look-ahead spread/volume baselines, whole-candle single-bin Volume Profile distortion, foreign-only buy share conflated with market-wide active taker buy ratio, and share-volume (vs VND value) bias in sector flow ranking.
2. **Stock & Multi-Asset Screening / Filtering Systems (`SC-01`..`SC-06`)**: Synthetic `Math.sin` screener candidates & broken `calcMacd` (`signal = macd * 0.8`), all-25-bar raw lows passed as static supports into Asymmetric Support Confluence, unanchored hammers classified as Wyckoff Springs, double-counted divergence scans, and post-calibration percentile category desync.
3. **Quantitative Math, Valuation, Risk & Backtest Engines (`QM-01`..`QM-06`)**: ASCII-hashed fake Piotroski F-Score/Beta/ATR% in `MiQuantEngine`, synthetic Box-Muller random walk masquerading as strategy backtests in `quant-engine.ts`, negative oscillating AR(1) roots accepted as stationary Ornstein-Uhlenbeck diffusions, frequency mismatch in Deflated Sharpe Ratio, and unnormalized MACD histogram scaling in `trade-signal.ts`.
4. **Multi-Timeframe, Divergence, Wyckoff & Indicator Consolidation (`TA-01`..`TA-05`)**: Hardcoded stock percentages (`1.5%`/`4.5%`) in divergence lifecycle breaking Forex/Crypto, unit mismatch (`1000x`) in intraday H1 VWAP proxy, raw-price (vs `%`) channel slope in Wyckoff, intra-bar entry time-travel (`entry = closes[i+1]` checked against `highs[i+1]/lows[i+1]`), and 6+ divergent re-implementations of `rsi`/`ema`/`sma`/`macd`/`atr`.

---

## 2. Functional Requirements (`FR-001`..`FR-010`)

- **`FR-001` (Causal & Directional Liquidity/OB/VSA Money Flow)**:
  - `analyzeMoneyFlow` (`src/lib/engines/money-flow.ts`) MUST enforce causal swing confirmation (`confirmedAtIndex = index + halfWindow`), require `price > last.close` for unswept `BUY_SIDE` targets and `price < last.close` for unswept `SELL_SIDE` targets, preserve active last-bar sweep detection before excluding swept levels, and prevent displacement bars from self-mitigating their own Order Blocks before price leaves the zone.
  - `analyzeVsa` (`money-flow.ts`) and `analyzeVsaBars` (`src/lib/engines/vsa-engine.ts`) MUST compute rolling causal prior-N-bar volume/spread baselines (excluding the evaluated bar `i`), require strict `<`/`>` for up/down bars, and guard zero-volume series (`volume === 0`) from emitting false `NO_SUPPLY`/`NO_DEMAND`.
- **`FR-002` (Range-Distributed Volume Profile & Swing-Anchored CVD Absorption)**:
  - `src/lib/engines/forex-order-flow-pro.ts` MUST distribute each candle's volume across all bins overlapped by `[bar.low, bar.high]`, detect CVD divergence against actual prior price swing pivots rather than `recentCvd[0]`, and delegate pip sizing to `getAssetPipSize`.
  - `src/components/forex-order-flow.tsx` (`deriveOrderFlow`) MUST compute `hasVolume` before `|| 1` fallback so zero-volume series report `hasVolume: false`.
- **`FR-003` (Authentic Active Buy Ratio & Value-Weighted Sector Flow)**:
  - `src/lib/services/screener-snapshot-service.ts` MUST NOT pass `foreignRow.buyRatioPct` (foreign-only buy share) as `activeBuyRatioPct`; it must use `quote.activeBuyRatio` (or CLV/orderbook derived active buy ratio) and keep `foreignBuyRatioPct` separate.
  - `src/lib/services/sector-flow.ts` MUST normalize sector volume by `totalVolumeVND` (trading value in VND, not raw share count) and sort `topStocks` directionally (`netForeignVnd` descending for inflow, ascending for outflow).
- **`FR-004` (Authentic FireAnt Screener & Strategy Backtest Execution)**:
  - `src/lib/quant/fireant-screener-engine.ts` MUST compute real Wilder RSI(14), real EMA(12/26/9) MACD crossover, and evaluate real OHLCV/quote snapshots rather than `Math.sin(seed)` fake values.
  - `src/lib/quant/quant-engine.ts` MUST execute causal bar-by-bar / vectorized simulations over real (or deterministic historical) OHLCV series rather than generating a synthetic Box-Muller random walk independent of strategy rules.
- **`FR-005` (True Swing Support Confluence & Resistance-Bounded Asymmetric Plan)**:
  - `calculateBuyPointPlan` (`screener-snapshot-service.ts`) MUST pass confirmed swing supports/resistances (`supportResistance(bars)`) into `computeAsymmetricPlan` instead of all 25 raw daily lows/highs.
  - `computeAsymmetricPlan` (`src/lib/engines/asymmetric-quant-engine.ts`) MUST respect overhead resistance ceilings when computing `takeProfit` and `riskReward` instead of forcing a minimum `+3.5R` floor through resistance.
- **`FR-006` (Support-Anchored Wyckoff Spring & Single-Pass Divergence in Apex/Composite)**:
  - `analyzeBottomReversal` / `evaluateApexQuant` (`src/lib/engines/orca-apex-quant-engine.ts`) MUST anchor Wyckoff Spring detection to actual support/swing-low piercing and reuse `analyzeBottomReversal`'s divergence result without calling `detectDivergences` twice per stock.
  - `calculateUniverseMultiFactor` (`src/lib/engines/multi-factor-quant-composite.ts`) MUST re-derive `category`, `categoryVi`, and `summaryVi` after percentile calibration and avoid double-counting F-Score sub-components; `computeRawOrcaScore` (`src/lib/engines/orca-master-composite.ts`) MUST treat `EXEMPT_FINANCIAL` neutrally vs non-financial Altman zones.
- **`FR-007` (Eliminate ASCII-Hashed Fake Quant Attributes in `MiQuantEngine`)**:
  - `src/lib/engines/miquant-quant-engine.ts` MUST NOT hash symbol characters to fabricate `f_score`, `beta`, and `atr_pct`; it must source real metrics from fundamental/technical snapshots or compute them from price series (returning `null` when unavailable).
- **`FR-008` (Strict Mathematical Invariants in `advanced-quant-math.ts` & `trade-signal.ts`)**:
  - `estimateOrnsteinUhlenbeck` MUST require discrete AR(1) root $\phi = 1 + b \in (0, 1)$ (i.e. $-1 < b < 0$) for valid OU diffusion stationarity.
  - `calculateDeflatedSharpeRatio` MUST normalize `observedSharpe` and `seSr` to the same sampling frequency, and `calculateVaRAndCVaR` MUST clamp/interpolate quantiles accurately for small samples.
  - `techBiasFromSnapshot` (`src/lib/engines/trade-signal.ts`) MUST normalize `macdHistogram` relative to price/ATR so scaling is invariant across VND stocks, USD crypto, and FX pairs.
- **`FR-009` (Scale-Invariant Divergence Lifecycle, Wyckoff Slope, MTF VWAP & Causal Entry)**:
  - `detectDivergences` (`src/lib/engines/divergence.ts`) MUST scale invalidation and `playing_out` thresholds by ATR (with percentage fallback) so Forex, Crypto, and Stocks behave consistently.
  - `evaluateHourlyBias` (`src/lib/engines/mtf-consensus.ts`) MUST normalize `quoteVolume / volume` scale against `currentPrice` (`1000x` VN quote unit guard).
  - `analyzeWyckoff` (`src/lib/engines/wyckoff-elliott.ts`) MUST normalize channel slope by price (`candSlopePct = candSlope / scPrice`) and align benchmark RS by timestamp.
  - `trainHistoricalPriceAction` (`src/lib/engines/historical-price-action-trainer.ts`) MUST enter at `bars[i + 1].open` (or evaluate barriers from `t = i + 2`) to eliminate entry-bar time-travel.
- **`FR-010` (Canonical Indicator Consolidation)**:
  - Consolidate duplicate `sma`, `ema`, `rsi`, `macd`, `atr` helpers across engines to delegate to canonical `src/lib/engines/oscillators.ts` / `src/lib/technical.ts`.

---

## 3. Measurable Success Criteria (`SC-001`..`SC-006`)

- **`SC-001` (100% Zero Look-Ahead & Causal Invariance)**: Mutating future bars `[t+1..n]` produces 0 changes in `analyzeMoneyFlow`, `analyzeVsaBars`, `detectDivergences`, `trainHistoricalPriceAction`, and `evaluatePrecisionTradeSetup` at bar `t`.
- **`SC-002` (Zero Fabricated Hash/Random-Walk Metrics in Production Engines)**: 0 occurrences of symbol-ASCII hashing for financial metrics (`f_score`, `beta`, `atr_pct`) or price-independent `Math.sin` / Box-Muller fake screener/backtest results.
- **`SC-003` (Scale Invariance Across 8 Orders of Magnitude)**: Identical relative OHLCV series scaled at `0.00001` (`PEPEUSDT`), `1.0800` (`EURUSD`), `2650.0` (`XAUUSD`), and `95,000` (`VCB`/`BTCUSDT`) yield identical `trade-signal.ts` bias, `divergence.ts` status, `wyckoff-elliott.ts` channel slope, and `money-flow.ts` VSA/SMC scores.
- **`SC-004` (Money-Flow Signal Purity)**: Disentangling `foreignBuyRatioPct` from `activeBuyRatioPct` and switching Sector Flow to `totalVolumeVND` eliminates false `"HEAVY_ACCUMULATION"` tags on low-volume foreign trades and penny-share sector distortion.
- **`SC-005` (Full Test & Build Verification)**: `npx tsc --noEmit`, all existing + new `node:test` and `vitest` suites, and `npm run build` (`vite build`) pass with 0 errors.
