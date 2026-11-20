# Tasks: Unified Cross-Asset Quantitative Trading Architecture

**Feature ID**: `003-unified-cross-asset-quant-enhancement`  
**Status**: In Progress  
**Dependencies**: Feature `001-fx-crypto-setup-precision` & `002-core-algorithm-moneyflow-purification`

---

## Phase 1: Research, Intake & Mathematical Formalization
- [x] **TASK-001**: Audit existing quantitative models in `advanced-quant-math.ts`, `asymmetric-quant-engine.ts`, `derivatives-arbitrage-engine.ts`, `forex-order-flow-pro.ts`, and `crypto-derivatives-engine.ts`.
- [x] **TASK-002**: Author Spec Kit artifacts: `.specify/feature.json`, `specs/003-unified-cross-asset-quant-enhancement/spec.md`, and `plan.md`.
- [x] **TASK-003**: Establish Spec Kit verification checklist in `checklists/requirements.md`.

---

## Phase 2: Core Unified Quantitative Engine Implementation
- [x] **TASK-004**: Create `src/lib/engines/unified-cross-asset-quant.ts`:
  - [x] Implement `calculateCrossAssetKelly`: Dynamic Half-Kelly fraction with annualized volatility targeting and capital clamping.
  - [x] Implement `calculateT2SettlementRisk`: Cornish-Fisher skewness/kurtosis 2-day holding VaR & tail-risk warning flags.
  - [x] Implement `calibrateBasisOrnsteinUhlenbeck`: Continuous OU parameter calibration ($\theta, \mu, t_{1/2}, \sigma_{\text{eq}}, Z_{\text{basis}}$) with discrete AR(1) stationarity validation.
  - [x] Implement `computeOrderFlowImbalance`: Multi-level (L2/L3) Bid/Ask queue dynamics (OFI and Normalized NOFI).
  - [x] Implement `evaluateForexSpreadSafety`: Dynamic spread-spike detection vs rolling median spread and asset-specific pip thresholds.
  - [x] Implement `computeGarmanKlassLeverageCap`: Rolling 24h Garman-Klass volatility and dynamic leverage limiting.
  - [x] Implement `detectCryptoLiquidationClusters`: Leverage bracket liquidation price clustering and Liquidation Magnet Zones (LMZ).

---

## Phase 3: Cross-Asset Specialized Integration
- [x] **TASK-005 (Equities)**: Integrate `calculateCrossAssetKelly`, `calculateT2SettlementRisk`, and `checkCeilingFloorHeadroom` into `asymmetric-quant-engine.ts` and `screener-snapshot-service.ts`.
- [x] **TASK-006 (Derivatives)**: Integrate `calibrateBasisOrnsteinUhlenbeck` and `computeOrderFlowImbalance` into `derivatives-arbitrage-engine.ts` and `derivatives-scalp.ts`.
- [x] **TASK-007 (Forex & Metals)**: Integrate `evaluateForexSpreadSafety` and multi-currency basket beta divergence into `forex-order-flow-pro.ts` and `forex-currency-strength.ts`.
- [x] **TASK-008 (Crypto)**: Integrate `computeGarmanKlassLeverageCap` and `detectCryptoLiquidationClusters` into `crypto-derivatives-engine.ts` and `crypto-position-sizer.ts`.

---

## Phase 4: Test Harness & Comprehensive Verification
- [x] **TASK-009**: Author comprehensive test suite `src/lib/__tests__/cross-asset-quant-engines.test.ts` covering:
  - Unit math tests: Kelly fraction, CF-VaR, OU stationarity, OFI calculation, Spread spike lockout, Garman-Klass volatility.
  - Edge cases: Zero-volume, non-stationary basis, inverted book, flat spreads, and extreme crypto volatility shocks.
  - Causal invariance: Zero look-ahead bias across all multi-asset quantitative pipelines.
- [x] **TASK-010**: Execute full project regression checks:
  - `npx tsx --conditions=react-server --test src/lib/__tests__/cross-asset-quant-engines.test.ts`
  - `npx tsx --conditions=react-server --test src/lib/__tests__/core-algorithm-purification.test.ts src/lib/__tests__/fx-crypto-precision-backtest.test.ts`
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run build`

---

## Phase 5: Documentation & Mandatory Auto-Sync
- [x] **TASK-011**: Create Compound Engineering solution doc: `docs/solutions/quant-engines/cross-asset-quantitative-trading-architecture.md`.
- [x] **TASK-012**: Mandatory GitHub Auto-Sync (`origin/main`) complying with `RULE[user_global]`.
