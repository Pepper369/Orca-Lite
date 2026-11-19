# Feature Specification: Forex & Crypto Trade Setup Accuracy & Win-Rate Upgrade

**Feature Branch / Directory**: `specs/001-fx-crypto-setup-precision`  
**Created**: 2026-11-19  
**Status**: Approved for Execution  
**Methodology**: GitHub Spec Kit (SDD) + Compound Engineering (Baseline -> Measured Walk-Forward Lift -> Verification -> Durable Learnings)

---

## 1. Executive Summary & User Value

Forex and Crypto traders using Orca-Lite rely on Scalping Panels, Signals Hubs, and the ICT/SMC & Quant Terminal Cockpits for actionable trade setups (`Entry`, `Stop Loss`, `TP1/TP2/TP3`, probability/win rate, and sizing). Currently, 9 verified mathematical, causal, and integration bugs degrade setup win rates, distort risk levels on Gold/Micro-cap Crypto, invent coin-flip setups during choppy markets, and misalign multi-timeframe confluence.

This upgrade unifies Forex and Crypto setup generation through a strictly causal, cost-aware **Institutional Precision Trade Engine** that filters out choppy/low-edge traps, aligns true Multi-Timeframe (MTF) trends, respects asset-accurate precision (`XAUUSD`, `JPY`, `EURUSD`, `BTCUSDT`, `PEPEUSDT`), integrates real macroeconomic calendars & cross-market Currency Strength / Order Flow, and verifies net profitability after trading friction via a walk-forward benchmark harness.

---

## 2. User Scenarios & Testing

### Scenario 1: Forex & Gold Intraday Trader (Detail & Hub)
- **Actor**: Forex / XAUUSD intraday trader reviewing `/forex/[pair]` or the Forex Signals Hub.
- **Flow**: Opens XAUUSD or EURUSD during London/NY session or US CPI release window.
- **Expected Outcome**:
  - XAUUSD pip values (`0.1`) and price precision (`2 decimals`) are computed accurately (no 1000x distortion).
  - During US CPI/NFP blackout windows or dead Asian chop (`ADX < 16`, `ER < 0.20`), the engine issues an honest `NO_TRADE` / `WAIT` with explicit veto reasons rather than forcing an `ACTIVE` coin-flip fallback.
  - High-conviction setups display setup grade (`A+`, `A`, `B`), calibrated win rate, net expectancy (`E[R]`), structural SL (preserved by default when adjusting leverage), and partial TP1 breakeven rules.

### Scenario 2: Crypto Perpetual Futures Trader (Detail & Hub)
- **Actor**: Crypto trader reviewing `/crypto/[symbol]` or Crypto Signals Hub (`BTCUSDT`, `SOLUSDT`, `PEPEUSDT`).
- **Flow**: Inspects both Spot/Perp detail scalp and the multi-pair Crypto Hub.
- **Expected Outcome**:
  - Multi-timeframe candles (`15m` + `5m` + `1h`) + live L2 DOM imbalance + Funding Rate + Macro Calendar are evaluated together.
  - Micro-priced assets like `PEPEUSDT` preserve up to 8 decimals without zero truncation.
  - Crowded positive funding (`>= 0.06%`) blocks long-chase setups; short-squeeze regimes and L2 buy-wall absorptions boost calibrated setup grade.

### Scenario 3: Quant & ICT/SMC Analyst (Terminal Cockpit)
- **Actor**: Institutional-style analyst reviewing the `QuantTerminalPanel` and `IctSmcCockpit`.
- **Expected Outcome**:
  - Multi-timeframe matrix uses true causal OHLCV resampling with monotonic EMAs (`EMA9` vs `EMA21`) across timeframes (fixing the inverted fast > slow bug).
  - Liquidity pools and Turtle Soup / Judas Swing sweeps strictly satisfy causality (`pool.barIndex < sweepBarIndex`) and normalize seconds vs milliseconds timestamps.
  - Reversal Pace Gate awards confluence points only when lock direction agrees with candidate trade direction, penalizing opposing locks.

---

## 3. Functional Requirements

- **FR-001 (Asset-Accurate Pip & Price Precision)**: Centralize pip scale and decimal rounding across Forex majors (`0.0001`), JPY pairs (`0.01`), Precious Metals (`XAUUSD=0.1`, `XAGUSD=0.01`), Energy (`OIL=0.01`), and Crypto dynamic tick scaling down to 8 decimals (`PEPEUSDT`). Eliminate hardcoded `.toFixed(5)` price truncation.
- **FR-002 (Strictly Causal Liquidity & Timestamp Handling)**: Liquidity pool status (`SWEPT`) and sweep detection must operate strictly after pool formation (`sweepIndex > pool.barIndex + 1`). Normalize Unix epoch seconds (`< 1e11`) and milliseconds (`>= 1e11`) uniformly for session/Judas killzone detection.
- **FR-003 (True Multi-Timeframe Resampling & Chop Detection)**: Resample execution bars causally into `4x` and `12x` HTF bars, fix monotonic EMA periods (`fast=9 < slow=21`), compute ADX(14) and Kaufman Efficiency Ratio(14), and classify dead chop as `RANGING`/`CHOPPY` instead of false trend calls.
- **FR-004 (Unified 7-Gate Precision Validator)**: Validate setups through 7 institutional gates:
  1. HTF Trend + Regime Alignment
  2. Recent 1–4 Bar Liquidity Sweep + Reclaim / MSS
  3. Value Zone (`OTE 0.618–0.786` / `FVG` / `VWAP`) + Anti-Chase Overextension Veto
  4. Real Order Flow (CLV / L2 DOM / Synthetic CME DOM), Forex CSM (`base - quote`), and Crypto Funding Squeeze
  5. Direction-Aligned Reversal Pace (bonus when aligned, penalty when opposed)
  6. Structural SL (`[0.75x, 2.2x] ATR`) + Multi-Tier `TP1/TP2/TP3` + Net `R:R >= 1.35` after friction (`frictionR <= 0.22`)
  7. Macro Economic Calendar & Crypto Cascade Circuit Breaker
- **FR-005 (Honest Setup Grading & Anti-Noise Veto)**: Grade every evaluated setup as `A+`, `A`, `B`, or `NO_TRADE` with calibrated win rate (`38%–84%`), expected net `E[R]`, and recommended sizing multiplier (`1.0 / 0.85 / 0.50 / 0`). Eliminate unconditional coin-flip `ACTIVE` fallback trades in choppy/ranging markets.
- **FR-006 (Multi-TF Hub & Real Macro Wiring)**: Upgrade Crypto Signals Hub to fetch both `15m` and `5m` bars (`analyzeScalpMulti`), replace `scalp.score` scale bug with `scalp.strength` & calibrated precision probability, wire real Economic Calendar macro events into both Forex & Crypto hubs, and compute live Currency Strength Matrix diffs for Forex pairs.
- **FR-007 (Structural SL Preservation in UI)**: Preserve structural engine Stop Loss by default in `ForexScalpPanel` (scaling position notional/margin with leverage rather than shrinking SL inside noise), while providing an optional user toggle for tight leverage scalping. Surface Setup Grade, `E[R]`, entry mode, multi-tier TPs, and veto reasons across Forex/Crypto signals & scalp panels.
- **FR-008 (Friction-Aware Walk-Forward Backtest Harness)**: Provide a pure deterministic multi-regime walk-forward benchmark comparing the Legacy Baseline vs Upgraded Precision Engine across Forex and Crypto instruments on distinct calibration and out-of-sample holdout seeds.

---

## 4. Non-Functional & Architectural Boundaries

- **Boundary Constraint**: Client components (`QuantTerminalPanel`, `IctSmcCockpit`, `ForexScalpPanel`, `ScalpPanel`, signals hubs UI) import types or shared precision engines. Core math/precision modules (`asset-precision.ts`, `fx-crypto-precision-engine.ts`, `high-winrate-gate.ts`, `ict-smc-liquidity-engine.ts`, `quant-reversal-pace.ts`, `fx-crypto-backtest-harness.ts`) MUST NOT import `"server-only"`.
- **Backward Compatibility**: Existing `node:test` and `vitest` contracts under `src/lib/__tests__/` and `src/lib/engines/__tests__/` must continue passing without regression.

---

## 5. Success Criteria (Measurable Outcomes)

- **SC-001 (Win Rate Lift)**: On the out-of-sample Holdout multi-regime walk-forward benchmark, Upgraded `A`/`A+` setups achieve `>= 65%` net trade win rate and beat Legacy Baseline win rate by `>= +12` percentage points.
- **SC-002 (Chop Filtering)**: False trade frequency in `CHOPPY_WHIPSAW_RANGE` drops by `>= 60%` compared to Legacy Baseline.
- **SC-003 (Expectancy & Profit Factor)**: Holdout Upgraded `A`/`A+` setups deliver positive net Expectancy `E[R] >= +0.20R` and Profit Factor `>= 1.75` after spread, fee, and slippage friction.
- **SC-004 (Strict Causality)**: Mutating future bars `[t+1 .. N]` leaves bar-`t` outputs bit-identical across `evaluatePrecisionTradeSetup` and `analyzeIctSmcLiquidity`.
- **SC-005 (Precision Integrity)**: `XAUUSD` (`0.1`), `USDJPY` (`0.01`), `EURUSD` (`0.0001`), `BTCUSDT`, and micro-coin `PEPEUSDT` (`0.00000842`) retain exact non-truncated pricing.
- **SC-006 (Zero Regressions)**: `npx tsc --noEmit`, `npm run build` (`vite build`), all 28 existing FX/Crypto `node:test` specs, all 7 Vitest engine specs, and the new precision/backtest suite pass 100%.
