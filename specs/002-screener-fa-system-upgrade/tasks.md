# Tasks: Nâng cấp Tổng thể Hệ thống Lọc & Fundamental Analysis (Screener & FA 2.0)

**Feature**: `specs/002-screener-fa-system-upgrade`  
**Status**: Completed  
**Dependency Order**: Phase 1 (Taxonomy & Contracts) → Phase 2 (Data Pipeline & FA Core Math) → Phase 3 (Industry Scoring & Screener Engine) → Phase 4 (API & UI Consolidation) → Phase 5 (Causal Backtest, Verification & Compound Learnings)

---

## Phase 1: Setup & Orthogonal Taxonomy
- [x] **T001** Create `src/lib/quant/screener-taxonomy.ts` defining the 20 `CanonicalScreenerPreset` IDs, `PRESET_ALIASES` (mapping all 49 legacy presets), 12 UI `WorkspaceId`s, `UNIVERSE_ALIASES` (mapping all 32 legacy tabs), `FA_BIT` (25-bit orthogonal register), and helper resolvers.
- [x] **T002** Create `src/lib/financial/fa-core.ts` (client+server safe, zero `"server-only"`) unifying shared unit normalization (`priceQuoteToVndSafe`, `normalizeToBillionVnd`, `normalizeRatioPct`), ROE/ROA/invested capital, NOPAT-based ROIC, realized OHLCV equity volatility $\sigma_E$, dynamic CAPM WACC, and sector percentile helpers.

## Phase 2: Data Integrity & Multi-Period Snapshot Pipeline
- [x] **T003** Upgrade `src/lib/financial/snapshots.ts` (`FundamentalSnapshot`) to preserve `annualHistory` (up to 4 years) and `quarterlyHistory` (up to 8 quarters) from `FinancialPackage.periods`, extract `retainedEarnings`, `currentAssets`, `currentLiabilities`, `totalLiabilities`, `inventory`, `receivables`, `payables`, `fixedAssets`, `cogs`, `ebit`, `shortTermDebt`, `longTermDebt`, and tag `faProvenance` + `industryTrack` (`fin:snap:v4:*`).
- [x] **T004** Refactor `produceMasterScreenerSnapshotInternal()` in `src/lib/services/screener-snapshot-service.ts` to hydrate from pre-warmed `market-screener-snapshots.ts` before bounded 4,500ms live enrichment—eliminating the `1,500ms` `fundTask` cliff and removing silent hardcoded `pe=12.0`, `pb=1.65`, `marketCap=350M*price`, and sector-baseline clones.
- [x] **T005** Remove synthetic `pe`/`pb` fabrication in `src/app/api/v1/screener/four-m/route.ts` and enforce `excludeSyntheticFa` filtering plus `faProvenance`/`industryTrack` tagging in `src/lib/services/fundamental-screener.ts` and `src/lib/services/valuation-screener.ts`.

## Phase 3: Fundamental Analysis Algorithm Optimization
- [x] **T006** Upgrade `src/lib/engines/piotroski-altman.ts` to compute true 2-period deltas ($\Delta\text{ROA}$, $\Delta\text{LTD/Assets}$, $\Delta\text{CurrentRatio}$, $\Delta\text{Shares}$, $\Delta\text{GM}$, $\Delta\text{AssetTurnover}$), eliminate `?? 0` free-point bugs via `criteriaEvaluated`, use true balance sheet inputs for Altman Z'', and return `EXEMPT_FINANCIAL` for `BANKING | SECURITIES | INSURANCE`.
- [x] **T007** Upgrade `src/lib/engines/fundamental-quant-matrix.ts`:
  - Remove fake `pretax = np/0.8` & `totalAssetsFallback = 1000` in `calculateBookTaxDifference`.
  - Compute true multi-year $\text{ROIIC}_{3Y} = \Delta\text{NOPAT}/\Delta\text{IC}$ with denominator stability guard.
  - Compute true 8-variable Beneish M-Score (`DSRI, GMI, AQI, SGI, LVGI, TATA` with exact `+4.679 * TATA - 0.327 * LVGI`) from 2 consecutive periods (`null` when absent).
  - Compute real $\text{CCC} = \text{DIO} + \text{DSO} - \text{DPO}$ and real Graham NCAV (`(currentAssets - totalLiabilities) / shares`).
  - Fix `solveReverseDcfImpliedGrowth` to use EV vs FCFF, reject FCF $\le 0$, and consume dynamic CAPM WACC.
  - Fix `calculateMertonDistanceToDefault` to accept realized $\sigma_E$ from OHLCV returns and exempt financial institutions.
- [x] **T008** Wire `evaluateBankValuation`, `evaluateRealEstateValuation`, and `computeRealizedEquityVolatility` into `screener-snapshot-service.ts` and `fundamental-screener.ts`, expanding sector-relative Winsorized percentile rankings across 6 factors (`P/E`, `P/B`, `EV/EBITDA`, `ROE`, `ROIC`, `NetMargin`).

## Phase 4: Dual-Bitmask Vector Engine, API & UI Consolidation
- [x] **T009** Refactor `queryScreenerStocks()` in `src/lib/services/screener-snapshot-service.ts` to add `FA_BIT` (`faBitFlags` register alongside `SCREENER_BIT`), remove the unreachable `else` filter block, activate `QuantFaVectorStore` (`NaN`-safe `Float32Array`), and enforce `hasAuthenticFa`/`excludeSyntheticFa` on FA presets.
- [x] **T010** Update `src/app/api/v1/stocks/screener/route.ts` to parse all canonical & advanced FA parameters (`superCompounderOnly`, `bookTaxSafeOnly`, `minRoiic`, `maxImpliedGrowth`, `minReverseDcfMargin`, `mertonSafeOnly`, `minMertonDd`, `excludeSyntheticFa`, `minSectorRoicPercentile`, `maxSectorPbPercentile`), default `excludeSyntheticFa = true` in `src/app/api/v1/screener/fundamental/route.ts`, and unify non-crypto queries in `src/app/api/v1/screener/route.ts` through `queryScreenerStocks()`.
- [x] **T011** Consolidate UI tabs & preset pills in `src/app/screener/page.tsx`, `src/app/screener/screener-constants.ts`, `src/app/screener/screener-panels.tsx`, `src/components/screener-matrix-toolbar.tsx`, and `src/components/fundamental-screener.tsx` (32 → 12 workspaces, 49 → 20 presets, `faProvenance` & `TC` industry track badges, Tier-4 BTD/SuperCompounder/ReverseDCF controls).

## Phase 5: Point-in-Time FA Backtest, Verification & Compound Learnings
- [x] **T012** Build point-in-time causal FA backtest harness `src/lib/engines/fa-backtest-harness.ts` (45d/90d filing lag, Calibration vs Out-of-Sample Holdout, sector-neutral peer ranking) and integrate FA strategies (`piotroski_diamonds`, `buffett_compounder`, `earnings_quality`, `deep_value`) into `src/lib/engines/screener-backtest-engine.ts`.
- [x] **T013** Write deterministic unit, provenance, sector-dispatch, and causal backtest suites (`src/lib/__tests__/fa-core-and-provenance.test.ts`, `src/lib/__tests__/screener-consolidation-parity.test.ts`), and update stale synthetic-fallback assertions in `src/lib/__tests__/screener-fa-enhancements.test.ts`.
- [x] **T014** Run verification suite (`npx tsc --noEmit`, `npm run lint`, `npm run build`, 7 `tsx --conditions=react-server --test` FA/Screener suites, and 2 Vitest engine suites) and verify zero failures.
- [x] **T015** Capture verified architectural invariants and benchmark results into `docs/solutions/fundamental-screener/fa-consolidation-and-anti-fabrication.md` (`/ce-compound`).
- [x] **T016** Commit and push verified changes directly to `origin main`.
