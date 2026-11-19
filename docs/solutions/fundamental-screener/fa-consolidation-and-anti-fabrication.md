---
title: Fundamental Screener Consolidation, Truth-in-Data Math, and Causal FA Backtesting
date: 2026-11-19
spec: specs/002-screener-fa-system-upgrade/spec.md
tags: [fundamental-analysis, screener, truth-in-data, vector-store, backtest, spec-kit]
---

# Fundamental Screener Consolidation, Truth-in-Data Math & Causal Backtest

## Problem & Root Causes Fixed

1. **Cold-start synthetic FA poisoning**: `produceMasterScreenerSnapshotInternal()` in `src/lib/services/screener-snapshot-service.ts` raced fundamental enrichment against a `1,500ms` timeout and silently fell back to hardcoded `pe=12.0`, `pb=1.65`, `marketCap=price*1000*350M`, and sector-baseline clones without marking rows as synthetic. Similarly, `src/app/api/v1/screener/four-m/route.ts` synthesized `pe`/`pb` from ROE.
2. **Mathematical & forensic distortions in FA engines**:
   - Single-period Piotroski checks awarded free points via `?? 0` instead of comparing 2 consecutive periods from `annualHistory`.
   - Altman Z'' penalized Banks/Securities/Insurance instead of exempting financial institutions (`EXEMPT_FINANCIAL`).
   - Book-Tax Difference (`calculateBookTaxDifference`) and Beneish M-Score fabricated missing pretax/assets/year-over-year inputs (`pretax = netProfit / 0.8`, `totalAssets = 1000`, `dsri = 1.0`, `gmi = 0.95`).
   - Cash Realization (`ocf/ebitda`), 3Y ROIIC (`roic*(1+g)`), Reverse DCF (negative FCF substituted by `0.85 * netProfit` and flat `10%` WACC), CCC (currentRatio proxy instead of `DIO + DSO - DPO`), and Graham NCAV (`equity * 0.7` proxy) substituted unavailable inputs with heuristics.
   - `QuantFaVectorStore` lacked `NaN` guards and sat unused in `queryScreenerStocks()`, while an unreachable `else` branch dropped several Tier-4 API parameters (`superCompounderOnly`, `bookTaxSafeOnly`, `minReverseDcfMargin`, `minRoiic`, `minMertonDd`).
3. **Screener taxonomy & UI sprawl**: 49 overlapping preset IDs across 32 fragmented screener tabs diluted filtering discoverability and diverged between `/api/v1/stocks/screener` and `/api/v1/screener`.

## Architectural Invariants Established

1. **Single Pure Taxonomy & FA Math Core (zero `"server-only"` leaks)**:
   - `src/lib/quant/screener-taxonomy.ts` defines 20 orthogonal `CANONICAL_PRESETS` (8 FA + 12 Core/Price/Quant), full `PRESET_ALIASES` (49→20), 12 `WORKSPACE_GROUPS` items (32→12 via `UNIVERSE_ALIASES`), and the 25-bit `FA_BIT` register separate from the 32-bit `SCREENER_BIT`.
   - `src/lib/financial/fa-core.ts` provides pure VND/thousand-VND normalization, average-balance helpers, NOPAT/Invested Capital, realized equity volatility $\sigma_E$, CAPM WACC (`computeDynamicWacc`), and sector percentile rankers shared safely between server services and React client views (`vite build` verified).
2. **Truth-in-Data Provenance Guard (`FaProvenance`)**:
   - Every screener item tracks `faProvenance` (`LIVE_BCTC | CACHED_BCTC | SEED_CALIBRATED | SECTOR_FALLBACK | MISSING`) and `industryTrack` (`FINANCIAL_BANK_SEC_INS | REAL_ESTATE | NON_FINANCIAL`).
   - `excludeSyntheticFa` excludes `SECTOR_FALLBACK`/`MISSING` rows (defaulted `true` on `/api/v1/screener/fundamental`, `/api/v1/screener/four-m`, and gated on strict FA presets in `queryScreenerStocks()`).
   - Missing BCTC fields stay `null` in FA calculations and `Number.NaN` in `QuantFaVectorStore` (`Float32Array`), never `0` or fabricated constants.
3. **Client+Server Vector Filtering & Causal FA Backtesting**:
   - `queryScreenerStocks()` executes bitmask filtering across `SCREENER_BIT` + `FA_BIT`, version-cached `QuantFaVectorStore` range scans, and unified parameter parsing across `/api/v1/stocks/screener` and `/api/v1/screener`.
   - `src/lib/engines/fa-backtest-harness.ts` (`runCausalFaBacktest`) enforces filing lag causality (default `45d` quarterly / `90d` annual via `getLatestAvailableFaAsOf`), splits rebalance dates chronologically into Calibration vs Out-of-Sample Holdout, applies sector-neutral ranking, and integrates into `src/lib/engines/screener-backtest-engine.ts`.

## Verification Ledger (Observed Post-Final-Edit)

- `npx tsc --noEmit`: passed (`exit 0`).
- `npm run lint` (`eslint .`): passed (`exit 0`).
- `npm run build` (`vite build`): built cleanly in `2.79s` (`2295 modules transformed`).
- `npx tsx --conditions=react-server --test` across all 11 Screener/FA/NLP suites (`fundamental-quant-matrix.test.ts`, `piotroski-altman.test.ts`, `screener-fa-enhancements.test.ts`, `fundamental-ratio-regressions.test.ts`, `stock-detail-screener-sync.test.ts`, `fa-core-and-provenance.test.ts`, `screener-consolidation-parity.test.ts`, `screener-apex-buy-now.test.ts`, `screener-enhanced-specialized.test.ts`, `screener-swing-divergence.test.ts`, `fast-screener-hub.test.ts`): **62/62 passed, 0 failed**.
- `npx vitest run src/lib/engines/__tests__/ict-smc-liquidity-engine.test.ts src/lib/engines/__tests__/quant-reversal-pace.test.ts`: `2/2` files, `7/7` tests passed.

## Audit Pass 2 Fixes (Residual Bugs Eliminated)

1. **Valuation Percentile Inversion (`sectorPePercentile` / `sectorPbPercentile` / `sectorEvEbitdaPercentile`)**: Switched `peRankMap`, `pbRankMap`, `evRankMap` back to `{ higherIsBetter: true, requirePositive: true }` (`1` = cheapest P/E, `100` = highest P/E), fixed `"P/E Rẻ Top 20%"` / `FA_BIT.LOW_SECTOR_PE` (`<= 20` / `<= 25`), so `maxSectorPePercentile <= threshold` genuinely returns low-multiple value stocks rather than bubble-multiple stocks.
2. **Removed Remaining Synthetic Fallbacks in `screener-snapshot-service.ts`**: Deleted `generateResilientBars()` random-walk bar synthesis, removed fake `price = 20.0`, `volume = 150_000`, `changePercent = 0.5%`, `qualityScore = 50`, `healthScore = 50`, and `VNINDEX` synthetic benchmark bars; gated `canslim`, `dividend`, `growth`, `value`, `consensus_upside` presets behind `hasAuthenticFa`.
3. **Closed `FA_BIT` Fallback Gap**: Mapped `lynchGrowerOnly`, `grahamNcavOnly`, `workingCapOnly`, `dividendAristocratOnly` into `requiredFaBitMask` and added an explicit `else` branch in `queryScreenerStocks()` when `x.faBitFlags == null`.
4. **Industry-Aware `evaluateFourM` & `valuation-screener.ts`**: Exempted `FINANCIAL_BANK_SEC_INS` from COGS `grossMargin` / `D/E` / `currentRatio` / `ROIC` penalties in `four-m.ts`, removed the 7-sector Meaning bias, added `excludeSyntheticFa` (default `true`) to `/api/v1/screener/valuation` & `valuation-screener.ts`, and attached `bankFairPbGordon` / `rnavUpsidePct`.
5. **UI Consolidation & Honest Strategy Banners (`screener-panels.tsx`)**: Normalized `defaultPreset` via `resolveCanonicalPreset()`, replaced static hardcoded `Win-rate / sampleTrades` numbers in the banner with strategy thesis + backtest action trigger, and deduplicated 4 overlapping Row-3 checkboxes already present in `ScreenerMatrixToolbar`.
6. **NLP Debt Consistency**: Aligned `"nợ thấp"` parser in `response-structure-architect.ts` to `debtEquityMax = 0.8` (`fast-screener-hub.test.ts` 5/5 green).

