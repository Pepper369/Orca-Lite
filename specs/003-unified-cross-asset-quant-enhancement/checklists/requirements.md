# Spec Kit Checklist: Cross-Asset Quantitative Enhancement

## 1. Mathematical & Statistical Precision
- [x] Discrete AR(1) autoregression root $\phi = 1 + b \in (0, 1)$ strictly verified for OU diffusion.
- [x] Abramowitz & Stegun rational approximations for $\Phi(z)$ and $\Phi^{-1}(p)$ maintain error bounds $< 10^{-4}$.
- [x] Cornish-Fisher expansion handles skewness and excess kurtosis safely without quantile inversion for moderate non-normality.
- [x] Dynamic Kelly fraction is strictly bounded by Half-Kelly ($\kappa = 0.5$) with lower bound $2\%$ and upper bound $25\%$.
- [x] Garman-Klass volatility computation handles zero range ($H = L$) safely without NaN.

## 2. Market Microstructure Invariants
- [x] Vietnam Equities: Statutory ceiling/floor bounds ($\pm 7\%$ HoSE, $\pm 10\%$ HNX) guard against adverse ceiling exhaustion fills.
- [x] Vietnam Derivatives: Basis is modeled continuously with Ornstein-Uhlenbeck mean-reversion parameter estimation.
- [x] Forex/Gold: Spread-Spike Circuit Breaker actively prevents trades when spread exceeds $2.2\times$ rolling median.
- [x] Crypto: Dynamic leverage governor automatically clamps leverage between $2\times$ and $20\times$ based on 24h rolling volatility.

## 3. Architecture & Zero Duplication
- [x] All 4 asset classes consume shared primitives from `unified-cross-asset-quant.ts` and `unified-ta-kernel.ts`.
- [x] Zero duplicate indicator algorithms or custom unverified mathematical approximations.
- [x] Pure functions with immutable inputs; zero unintended state mutations.

## 4. Performance & Test Verification
- [x] Single-symbol quantitative assessment completes in $< 5\text{ms}$.
- [x] Universe scan (100+ assets) completes in $< 250\text{ms}$.
- [x] Zero look-ahead bias: Bar $t+1$ cannot alter signals at bar $t$.
- [x] TypeScript clean check (`npx tsc --noEmit`) exits 0.
- [x] Production build (`npm run build`) completes with zero errors.
