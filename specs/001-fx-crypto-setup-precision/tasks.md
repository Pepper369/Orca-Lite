# Tasks: Forex & Crypto Setup Precision Upgrade

- [x] **T001** Create Spec Kit artifacts (`spec.md`, `checklists/requirements.md`, `plan.md`, `tasks.md`, `.specify/feature.json`)
- [x] **T002** Create shared asset precision & causal resampling utility `src/lib/engines/asset-precision.ts`
- [x] **T003** Fix root-cause bugs in `forex-scalp-modules.ts` & `scalp-modules.ts` (XAU/OIL pipScale, ADX+ER chop regime, monotonic structure, conflicting indicator penalties, Crypto strategyTech)
- [x] **T004** Fix causality, precision, timestamp normalization & OTE catalyst bugs in `ict-smc-liquidity-engine.ts`
- [x] **T005** Fix HTF resampling, multi-bar sweep detection, direction-aligned Reversal Pace Gate 5, and anti-chase in `high-winrate-gate.ts`
- [x] **T006** Fix inverted MTF EMA periods & fake OBI in `src/components/quant/quant-terminal-panel.tsx`
- [x] **T007** Build unified 7-gate Precision Engine `src/lib/engines/fx-crypto-precision-engine.ts`
- [x] **T008** Wire Precision Engine, multi-TF fetching, Economic Calendar & CSM into `forex-scalp-types.ts`, `forex-scalp.ts`, `services/forex-scalp.ts`, `scalp-types.ts`, `scalp.ts`, `services/intelligence.ts`, `services/forex-signals-hub.ts`, `services/crypto-signals-hub.ts`
- [x] **T009** Upgrade Forex & Crypto UI panels (`forex-signals-panel.tsx`, `crypto-signals-panel.tsx`, `forex-scalp-panel.tsx`, `scalp-panel.tsx`) with Setup Grade, `E[R]`, structural SL preservation, and veto transparency
- [x] **T010** Build strictly causal walk-forward backtest harness `src/lib/engines/fx-crypto-backtest-harness.ts` and test suite `src/lib/__tests__/fx-crypto-precision-backtest.test.ts`
- [x] **T011** Run full verification (`tsc`, `tsx --test`, `vitest`, `npm run build`), review diff, capture learnings in `docs/solutions/quant-engines/fx-crypto-setup-precision-and-anti-overfit.md`
- [x] **T012** Commit and push directly to `origin main`
