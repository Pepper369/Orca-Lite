# Feature Specification: Unified Cross-Asset Quantitative Trading Architecture

**Feature ID**: `003-unified-cross-asset-quant-enhancement`  
**Date**: 2026-11-20  
**Methodology**: GitHub Spec Kit (SDD) + Compound Engineering + Multi-Asset Market Microstructure  
**Status**: Formalized & Planned  
**Target Domains**: Cổ Phiếu (VN Equities), Phái Sinh (VN30F & Commodity Futures), Ngoại Hối & Kim Loại (Forex & Metals), Tiền Mã Hóa (Crypto Spot & Perpetuals)

---

## 1. Executive Summary & System-Wide Quantitative Audit

Orca-Lite has established high-performance screener engines, TA/FA purification pipelines, and SMC/order-flow analytical tools. However, a quantitative audit reveals that algorithmic execution and risk management across the four asset classes are operating in heterogeneous silos with disparate assumptions, hardcoded heuristics, and unmodeled microstructure frictions:

```
+--------------------------------------------------------------------------------------------------+
|                            UNIFIED QUANTITATIVE FOUNDATION BACKPLANE                             |
|  [Statistical Arbitrage]  [Triple-Barrier Horizons]  [Fractional Kelly]  [Cornish-Fisher CVaR]   |
+-------------------+--------------------+-------------------------+-------------------------------+
                    |                    |                         |                               |
                    v                    v                         v                               v
         +--------------------+ +------------------+     +-------------------+   +--------------------+
         |   1. EQUITIES      | |  2. DERIVATIVES  |     | 3. FOREX & METALS |   |     4. CRYPTO      |
         |  (VN30 & Midcaps)  | | (VN30F / Futures)|     | (Currencies & Gold|   | (Binance Spot/Perp)|
         +--------------------+ +------------------+     +-------------------+   +--------------------+
         | * T+2 Drift VaR    | | * OU Basis Rev.  |     | * Spread Circuit  |   | * Liquidation Clust|
         | * Vol Targeting    | | * Micro OFI Q    |     | * Currency Basket |   | * OI vs CVD Diverg |
         | * Ceiling/Floor Sli| | * Roll-Over Dec. |     | * Session Killzone|   | * Vol Leverage Cap |
         +--------------------+ +------------------+     +-------------------+   +--------------------+
```

### Specific Asset-Class Deficiencies Identified

1. **Cổ Phiếu (Vietnam Equities - HoSE, HNX, UPCoM)**:
   - **Static Capital Allocation**: Position sizing currently defaults to fixed percentage brackets ($10\%$, $20\%$) regardless of individual asset volatility, market regime, or win-rate/payoff ratios.
   - **Unmodeled T+2 Liquidity Lag**: The mandatory T+2 settlement cycle in Vietnam creates an unhedged holding period risk. Standard daily VaR underestimates 2-day cumulative tail risk during limit-down gap events.
   - **Boundary Execution Slippage**: Traditional slippage ignores the statutory price limits ($\pm 7\%$ HoSE, $\pm 10\%$ HNX). Signals entering near ceiling ($\ge +6.2\%$) suffer severe fill degradation and adverse selection.

2. **Phái Sinh (Derivatives - VN30 Index Futures VN30F1M/VN30F2M)**:
   - **Static Contango/Backwardation Heuristics**: Basis is currently classified by static thresholds ($\pm 3$ pts, $\pm 8$ pts) without dynamic continuous Ornstein-Uhlenbeck (OU) mean-reversion parameter estimation.
   - **Absence of High-Frequency Order Flow Imbalance (OFI)**: Intraday scalping on VN30F relies on past candle closes rather than continuous queue dynamics at the best 3 bid/ask book levels.
   - **Unpriced Roll-Over Calendar Decays**: During expiration week (3rd Thursday of the month), liquidity migrates from VN30F1M to VN30F2M, distorting basis signals without automated roll-over risk modeling.

3. **Ngoại Hối & Kim Loại Quý (Forex & Precious Metals - EURUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD)**:
   - **Unprotected Spread Expansion**: FX & Gold scalping algorithms execute fixed-pip stop losses without measuring real-time bid-ask spread expansion during Asian rollovers (21:00-23:00 UTC) or high-impact macroeconomic data releases.
   - **Isolated Pair Bias**: Currency pairs are traded in isolation without calculating the global currency strength basket (USD, EUR, GBP, JPY, AUD, CAD, CHF) and beta decomposition against the synthetic Dollar Index (DXY).
   - **Heuristic Session Killzones**: Session killzones (London Open, New York AM) lack empirical probability distributions of expansion range completion.

4. **Tiền Mã Hóa (Crypto - Binance Spot & USDT-M Perpetuals)**:
   - **Unmodeled Liquidation Cascade Clusters**: Algorithms read current order books but lack estimation of hidden liquidation debt pools clustered above/below swing highs/lows where high-leverage positions trigger margin stop-outs.
   - **Disjointed OI & CVD Metrics**: Open Interest and Cumulative Volume Delta are monitored separately, failing to detect institutional absorption vs retail chase divergence.
   - **Static Leverage Risks**: Users often apply fixed leverage ($10\times$, $20\times$) during both compressed consolidation and extreme volatility spikes, exposing portfolios to black-swan liquidation wicks.

---

## 2. Quantitative Personas & Use Cases

- **User Story 1 (Multi-Asset Systematic Trader)**: As a quantitative trader running strategies across VN stocks, VN30F, Gold, and Crypto, I want a unified risk framework (Kelly fraction, VaR/CVaR, Deflated Sharpe) so that portfolio allocation dynamically shifts capital to highest risk-adjusted edges without blowing up drawdown limits.
- **User Story 2 (VN Equity Swing Trader)**: As a VN stock swing trader, I want an asymmetric execution model that accounts for HoSE $\pm 7\%$ ceiling/floor price limits and T+2 settlement drift so that I avoid entering near ceiling exhaustion or being trapped in illiquid down-gaps.
- **User Story 3 (VN30F Scalper & Arbitrageur)**: As an intraday derivatives trader, I want continuous Ornstein-Uhlenbeck basis mean-reversion signals and Order Flow Imbalance (OFI) metrics so that I can capture high-probability basis convergence and front-run intraday momentum shifts.
- **User Story 4 (Forex & Gold Scalper)**: As a high-frequency FX/XAUUSD scalper, I want a Spread-Spike Circuit Breaker and Currency Basket Strength matrix so that my bot ceases trading during abnormal spread widening and only trades pairs aligned with macro currency flow.
- **User Story 5 (Crypto Perpetual Trader)**: As a crypto derivatives trader, I want Liquidation Cascade Heatmaps and dynamic volatility-adjusted leverage capping so that I enter ahead of short/long squeezes while keeping liquidation distances mathematically safe.

---

## 3. Functional & Quantitative Requirements

### Domain 1: Vietnam Equities Quantitative Engine (`QUANT-EQ`)

- **`QUANT-EQ-01` (Dynamic Fractional Kelly & Volatility Targeting)**:
  - Implement dynamic position sizing based on rolling trade expectancy:
    $$f^* = \text{clamp}\left(\frac{p \cdot b - (1 - p)}{b} \times \kappa,\, 0.02,\, 0.25\right)$$
    where $p$ is win rate, $b$ is profit-to-loss ratio, and $\kappa = 0.5$ (Half-Kelly safety ceiling).
  - Scale position size inversely to annualized asset volatility:
    $$\text{TargetAllocation} = f^* \times \frac{\sigma_{\text{target}}}{\sigma_{\text{realized}}}$$
    where $\sigma_{\text{target}} = 18\%$ (annualized target volatility) and $\sigma_{\text{realized}} = \sqrt{252} \times \text{std}(\text{returns}_{20})$.

- **`QUANT-EQ-02` (T+2 Settlement Drift Cornish-Fisher VaR)**:
  - Compute cumulative 2-day holding risk using Cornish-Fisher expansion adjusted for skewness ($S$) and kurtosis ($K$):
    $$z_{\text{CF}} = z_\alpha + \frac{S}{6}(z_\alpha^2 - 1) + \frac{K - 3}{24}(z_\alpha^3 - 3z_\alpha) - \frac{S^2}{36}(2z_\alpha^3 - 5z_\alpha)$$
  - Calculate $\text{VaR}_{95\%}(T+2) = -(\mu_{2D} + z_{\text{CF}} \cdot \sigma_{2D})$.
  - Signals with $\text{VaR}_{95\%}(T+2) > 6.0\%$ MUST trigger a mandatory warning flag `T2_EXCESSIVE_TAIL_RISK` and reduce position sizing by $50\%$.

- **`QUANT-EQ-03` (Boundary Price Ceiling/Floor Liquidity Cushion)**:
  - Calculate remaining headroom to statutory ceiling:
    $$\Delta_{\text{ceiling}} = \frac{P_{\text{ceiling}} - P_{\text{last}}}{P_{\text{last}}}$$
  - If $\Delta_{\text{ceiling}} < 1.5\%$, trigger `CEILING_EXHAUSTION_BLOCK`: prohibit new long entries due to adverse selection risk (risk of buying at peak with zero upside remaining in current session).
  - If $\Delta_{\text{floor}} < 1.5\%$, trigger `FLOOR_LIQUIDITY_VACUUM`: prohibit bottom-fishing unless confirmed by institutional volume surge $> 2.5\times \text{MA20}$.

---

### Domain 2: VN30F & Derivatives Quantitative Engine (`QUANT-DER`)

- **`QUANT-DER-01` (Continuous Ornstein-Uhlenbeck Basis Mean-Reversion)**:
  - Model intraday basis $X_t = P_{\text{VN30F}} - P_{\text{VN30}}$ as an Ornstein-Uhlenbeck process:
    $$dX_t = \theta (\mu - X_t) dt + \sigma dW_t$$
  - Discretize via linear regression $X_t - X_{t-1} = a + b X_{t-1} + \epsilon_t$:
    - Mean reversion speed $\theta = -\ln(1 + b) / \Delta t$
    - Long-term mean $\mu = -a / b$
    - Half-life $t_{1/2} = \frac{\ln(2)}{\theta}$
    - Equilibrium volatility $\sigma_{\text{eq}} = \frac{\sigma_\epsilon}{\sqrt{2\theta}}$
  - Arbitrage trigger condition: When basis deviates $|X_t - \mu| > 2.0 \times \sigma_{\text{eq}}$ and $t_{1/2} < 180\text{ minutes}$, emit `HIGH_CONVICTION_BASIS_REVERSION` signal.

- **`QUANT-DER-02` (Order Flow Imbalance - OFI at Level 2 Book)**:
  - Given bid/ask quotes and sizes across top 3 price levels $(P_b, Q_b, P_a, Q_a)$ at discrete time steps $n-1 \to n$:
    $$\text{OFI}_n = \sum_{k=1}^3 \left[ I_{\{P_{b,k}^n \ge P_{b,k}^{n-1}\}} Q_{b,k}^n - I_{\{P_{b,k}^n \le P_{b,k}^{n-1}\}} Q_{b,k}^{n-1} - I_{\{P_{a,k}^n \le P_{a,k}^{n-1}\}} Q_{a,k}^n + I_{\{P_{a,k}^n \ge P_{a,k}^{n-1}\}} Q_{a,k}^{n-1} \right]$$
  - Normalize by 5-period average book depth: $\text{NOFI}_n = \frac{\text{OFI}_n}{\text{Depth}_{n}}$.
  - When $\text{NOFI} > +0.45$, intraday scalping engine classifies market as aggressive institutional buying pressure.

- **`QUANT-DER-03` (Calendar Spread & Roll-Over Migration Model)**:
  - Track calendar basis between prompt contract $F_1$ and next-month contract $F_2$:
    $$S_{1,2} = F_2 - F_1$$
  - Predict fair calendar spread: $S_{1,2}^{\text{fair}} = P_{\text{VN30}} \times \left(e^{(r - q)\Delta t_2} - e^{(r - q)\Delta t_1}\right)$
  - When days to expiry $D \le 4$, activate `EXPIRY_ROLL_OVER_REGIME`, monitoring open interest migration ratio $\text{OIMR} = \frac{\text{OI}_{F2}}{\text{OI}_{F1} + \text{OI}_{F2}}$. If $\text{OIMR} > 0.40$, automatically transition execution benchmark to $F_2$.

---

### Domain 3: Forex & Precious Metals Quantitative Engine (`QUANT-FX`)

- **`QUANT-FX-01` (Real-Time Spread-Spike Circuit Breaker)**:
  - Measure rolling median spread $\widetilde{S}_{20}$ in pips.
  - If current spread $S_{\text{current}} > 2.2 \times \widetilde{S}_{20}$ or $S_{\text{current}} > S_{\text{max\_allowed}}$ ($1.5$ pips for EURUSD, $4.0$ pips for XAUUSD), enter `SPREAD_SPIKE_LOCKOUT`.
  - Block all sniper entries and widen trailing stop buffer dynamically to prevent slippage sweeps.

- **`QUANT-FX-02` (Global Currency Basket Beta Decomposition)**:
  - Maintain real-time matrix of 8 major currency indices (USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF):
    $$C_i = \frac{1}{7} \sum_{j \ne i} w_{ij} \cdot R_{ij}$$
  - Calculate relative momentum $M_i = \text{EMA}(C_i, 8) - \text{EMA}(C_i, 21)$.
  - Any pair signal (e.g. BUY EURUSD) MUST have positive currency divergence:
    $$\Delta M = M_{\text{base}} - M_{\text{quote}} > 0$$
    Signals conflicting with macro currency divergence are automatically downgraded or vetoed.

- **`QUANT-FX-03` (Empirical Session Liquidity Sweep Probability)**:
  - Quantify Asian Range (00:00 - 07:00 UTC) High/Low extremes ($H_{\text{Asia}}, L_{\text{Asia}}$).
  - During London Open (07:00 - 10:00 UTC), compute sweep probability:
    - If price sweeps $H_{\text{Asia}}$ by $5 - 15$ pips and immediately prints a bearish displacement candle ($RSI_{\text{M5}} < 45$, Bearish Fair Value Gap), classify as `JUDAS_HIGH_SWEEP_CONFIRMED` with target $L_{\text{Asia}}$.
    - Probability score calibrated dynamically based on historical 60-day Asian range reversal statistics.

---

### Domain 4: Crypto Spot & Perpetuals Quantitative Engine (`QUANT-CRYPTO`)

- **`QUANT-CRYPTO-01` (Liquidation Cascade Heat-Cluster Prediction)**:
  - Model estimated liquidation density clusters using cumulative open interest and leverage distributions ($20\times, 50\times, 100\times$):
    $$P_{\text{liq, long}}(L) = P_{\text{entry}} \times \left(1 - \frac{1}{L} + \text{MMR}\right)$$
    $$P_{\text{liq, short}}(L) = P_{\text{entry}} \times \left(1 + \frac{1}{L} - \text{MMR}\right)$$
    where $\text{MMR} = 0.5\%$ is maintenance margin rate.
  - Formulate Liquidation Magnet Zones (LMZ): Identify price bands where cumulative liquidation volume exceeds $\$10M$ on BTC or $\$3M$ on ETH/SOL.

- **`QUANT-CRYPTO-02` (Perpetual Open Interest vs Cumulative Volume Delta Divergence)**:
  - Construct 4-quadrant crypto flow state matrix:
    1. **Price $\uparrow$, OI $\uparrow$, CVD $\uparrow$**: Aggressive Long Accumulation (Strong Bullish Continuation).
    2. **Price $\uparrow$, OI $\downarrow$, CVD $\approx 0$**: Short Squeeze Exhaustion (Vulnerable to violent pullback).
    3. **Price $\downarrow$, OI $\uparrow$, CVD $\downarrow$**: Aggressive Short Buildup (Strong Bearish Breakdown).
    4. **Price $\downarrow$, OI $\downarrow$, CVD $\approx 0$**: Long Liquidation Cascade (Potential capitulation bottom).
  - Require quadrant alignment before confirming breakout signals.

- **`QUANT-CRYPTO-03` (Volatility-Conditioned Dynamic Leverage Governor)**:
  - Calculate rolling 24-hour Garman-Klass volatility:
    $$\sigma_{\text{GK}}^2 = \frac{1}{24} \sum_{h=1}^{24} \left[ 0.5 \left(\ln\frac{H_h}{L_h}\right)^2 - (2\ln 2 - 1) \left(\ln\frac{C_h}{O_h}\right)^2 \right]$$
  - Cap maximum allowed leverage dynamically:
    $$\text{MaxLeverage} = \text{clamp}\left(\frac{0.15}{\sqrt{365} \times \sigma_{\text{GK}}},\, 2,\, 20\right)$$
  - During flash volatility shocks ($\sigma_{\text{GK}} > 80\%$ annualized), leverage is hard-capped at $3\times$ to guarantee survival against exchange wick liquidations.

---

### Domain 5: Core Quantitative Engine Infrastructure (`QUANT-CORE`)

- **`QUANT-CORE-01` (Unified Quantitative Math Adapter)**:
  - Create `src/lib/engines/unified-cross-asset-quant.ts` importing directly from canonical `unified-ta-kernel.ts` and `advanced-quant-math.ts`.
  - Expose standardized interfaces: `calculateAssetExpectedShortfall`, `calculateDynamicKelly`, `evaluateTripleBarrierHorizons`, `estimateMeanReversionHalfLife`.
- **`QUANT-CORE-02` (Zero Code Duplication)**:
  - All asset engines (Equities, Derivatives, Forex, Crypto) MUST delegate quantitative metrics to the shared engine adapter. No custom unverified statistical approximations allowed.
- **`QUANT-CORE-03` (Strict Causal Invariance)**:
  - No bar index $t+k$ ($k \ge 1$) may be referenced in any signal, risk metric, or feature computation at bar $t$.
- **`QUANT-CORE-04` (Microsecond Latency Budget)**:
  - All single-asset quantitative assessments MUST complete within $\le 5\text{ms}$ in Node.js runtime, and full universe screens (100+ assets) MUST finish within $\le 250\text{ms}$.

---

## 4. Measurable Success Criteria (`SC-001`..`SC-008`)

- **`SC-001` (Cross-Asset Metric Consistency)**: Passing identical normalized return distributions into Equities, Derivatives, Forex, and Crypto engines yields mathematically identical VaR, CVaR, DSR, and Kelly fractions.
- **`SC-002` (Zero T+2 Gap Traps in Equities)**: Eliminates long entries within $1.5\%$ of HoSE/HNX statutory ceiling, reducing adverse gap-down openings on T+2 by $\ge 40\%$ in walk-forward backtests.
- **`SC-003` (VN30F Basis Profit Factor Lift)**: OU basis mean-reversion with $t_{1/2} < 180\text{m}$ improves intraday basis arbitrage win-rate to $\ge 72\%$ with Profit Factor $\ge 2.5$.
- **`SC-004` (Forex Spread Defense Zero Slippage)**: Zero executed trades during spread expansion spikes $> 2.2\times$ median spread.
- **`SC-005` (Crypto Liquidation Cascade Avoidance)**: Dynamic leverage governor prevents $100\%$ of simulated liquidation events across historical 2024-2026 crypto flash dumps ($>15\%$ single-day moves).
- **`SC-006` (Deflated Sharpe Ratio (DSR) Non-Overfitting Gate)**: All active quantitative strategies MUST achieve $\text{DSR} \ge 0.95$ when adjusted for multiple testing over $N \ge 250$ signal iterations.
- **`SC-007` (Performance SLA)**: Comprehensive cross-asset quantitative pipeline executes in $< 15\text{ms}$ per symbol.
- **`SC-008` (Zero Regressions)**: Full test suite passes (`npm test`, all `node:test` suites, `npx tsc --noEmit`, and `npm run build`).
