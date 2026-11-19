# Implementation Plan: Forex & Crypto Trade Setup Precision Upgrade

**Feature**: `specs/001-fx-crypto-setup-precision`  
**Created**: 2026-11-19  

---

## 1. Architectural Overview & Defect Fixes

| # | Root Cause Fixed | Module(s) |
|---|---|---|
| 1 | `XAUUSD`/`OIL` pipScale bug (`0.0001` vs `0.1`/`0.01`) & `.toFixed(5)` micro-coin truncation (`PEPEUSDT`) | `asset-precision.ts`, `forex-scalp-modules.ts`, `ict-smc-liquidity-engine.ts`, `high-winrate-gate.ts` |
| 2 | Look-ahead bias in liquidity pool status & sweep scanner (`bars.slice(-10)`) + ms/sec timestamp mismatch in Judas Killzone | `ict-smc-liquidity-engine.ts` |
| 3 | Inverted MTF EMAs (`fast > slow`) & fake hardcoded OrderBook Imbalance (`+22/-18`) in Quant Lab | `quant-terminal-panel.tsx` |
| 4 | Unconditional `BULL` bias & over-triggering in OTE setup without structural catalyst | `ict-smc-liquidity-engine.ts` |
| 5 | Direction-blind Reversal Pace Gate (`Gate 5` boosted setups even when locked in opposite direction) | `high-winrate-gate.ts` |
| 6 | Weak swing check & conflicting indicators adding positive points in `strategyTech` + no ADX/ER chop rejection | `forex-scalp-modules.ts`, `scalp-modules.ts` |
| 7 | Forced `ACTIVE` coin-flip fallback setups in chop + weak `legacyQuant` triggers | `forex-scalp.ts`, `scalp.ts` |
| 8 | Crypto Hub single-TF (`15m` x60 only), `scalp.score` vs `strength` bug, hardcoded `1.5%` SL & unwired Economic Calendar/CSM | `crypto-signals-hub.ts`, `forex-signals-hub.ts`, `forex-scalp.ts`, `intelligence.ts` |
| 9 | Leverage slider shrinking structural Stop Loss inside microstructure noise by default | `forex-scalp-panel.tsx`, `crypto-signals-panel.tsx`, `forex-signals-panel.tsx`, `scalp-panel.tsx` |

---

## 2. Core Data Contracts

### `PrecisionTradeSetup` (`src/lib/engines/fx-crypto-precision-engine.ts`)
- `direction`: `"BUY" | "SELL" | "NEUTRAL"`
- `action`: `"BUY" | "SELL" | "WAIT"`
- `grade`: `"A+" | "A" | "B" | "NO_TRADE"`
- `precisionScore`: `number` (`0..100`)
- `calibratedWinRatePct`: `number` (`38..84`)
- `expectancyR`: `number`
- `recommendedSizeMultiplier`: `number` (`1.0 | 0.85 | 0.5 | 0`)
- `entryMode`: `"LIMIT_PULLBACK" | "MARKET_CONFIRMED" | "WAIT"`
- `entry`, `entryZone`, `stopLoss`, `tp1`, `tp2`, `tp3`
- `grossRiskReward`, `netRiskReward`, `frictionR`
- `regime`: `{ state, adx14, efficiencyRatio, atrRatio }`
- `gatesPassed`, `gatesFailed`, `vetoReasons`
- `breakevenPlan`: `{ tp1ClosePct, moveSlToBeAtTp1, trailingAtrMult }`
- `summaryVi`: `string`

### Client / Server Module Boundary
- **Pure Client+Server Shared (NO `"server-only"`)**:
  - `src/lib/engines/asset-precision.ts`
  - `src/lib/engines/fx-crypto-precision-engine.ts`
  - `src/lib/engines/high-winrate-gate.ts`
  - `src/lib/engines/ict-smc-liquidity-engine.ts`
  - `src/lib/engines/quant-reversal-pace.ts`
  - `src/lib/engines/fx-crypto-backtest-harness.ts`
- **Server-Only Services & Modules**:
  - `src/lib/engines/forex-scalp.ts`, `src/lib/engines/scalp.ts`
  - `src/lib/services/forex-scalp.ts`, `src/lib/services/intelligence.ts`, `src/lib/services/forex-signals-hub.ts`, `src/lib/services/crypto-signals-hub.ts`

---

## 3. Validation & Compound Engineering Loop

1. **Baseline vs Upgraded Simulation**: Run `runWalkForwardComparison()` across 6 regimes x 6 pairs separated into **Calibration (seeds 1..3)** and **Holdout (seeds 4..6)**.
2. **Causal Integrity Tests**: Assert mutating bars `[t+1 .. N]` produces identical past signal outputs.
3. **Full Suite & Build Verification**: Run `tsc --noEmit`, `tsx --test`, `vitest run`, and `vite build`.
4. **Durable Learning Capture**: Persist lessons learned into `docs/solutions/quant-engines/fx-crypto-setup-precision-and-anti-overfit.md`.
