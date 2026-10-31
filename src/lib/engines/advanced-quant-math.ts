/**
 * Advanced Quantitative Mathematical Suite (OQuant Institutional Lab)
 * Implements core models from institutional quantitative literature:
 * 1. Hierarchical Risk Parity (HRP) - Marcos López de Prado (2016)
 * 2. Ornstein-Uhlenbeck (OU) Mean Reversion & Half-Life Estimation
 * 3. Almgren-Chriss (2000) Optimal Execution & Market Impact Trajectory
 * 4. Deflated Sharpe Ratio (DSR) & Multiple Testing Adjustment
 * 5. Triple-Barrier Method Volatility Horizons - Marcos López de Prado (AFML)
 * 6. Value-at-Risk (VaR) & Conditional VaR (Expected Shortfall)
 */

// ============================================================================
// Mathematical Helpers & Statistical Distributions
// ============================================================================

/**
 * Standard Normal Cumulative Distribution Function Phi(z)
 * Accurate Abramowitz & Stegun approximation (error < 7.5e-8)
 */
export function normCdf(z: number): number {
  if (isNaN(z)) return 0.5;
  if (z === 0) return 0.5;
  if (z > 8) return 1.0;
  if (z < -8) return 0.0;

  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c2 = 0.3989422804014327; // 1 / sqrt(2 * pi)

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z);
  const t = 1.0 / (1.0 + p * x);
  const pdf = c2 * Math.exp(-0.5 * x * x);
  const cdf = 1.0 - pdf * ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;

  return sign < 0 ? 1.0 - cdf : cdf;
}

/**
 * Standard Normal Quantile / Inverse CDF Function Phi^{-1}(p)
 * Abramowitz & Stegun 26.2.23 rational approximation (error < 4.5e-4)
 */
export function normInv(p: number): number {
  if (isNaN(p) || p <= 0) return -8.0;
  if (p >= 1) return 8.0;
  if (p === 0.5) return 0.0;

  const pLow = p > 0.5 ? 1.0 - p : p;
  const t = Math.sqrt(-2.0 * Math.log(pLow));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const num = c0 + c1 * t + c2 * t * t;
  const den = 1.0 + d1 * t + d2 * t * t + d3 * t * t * t;
  const z = t - num / den;

  return p > 0.5 ? z : -z;
}

// ============================================================================
// 1. Hierarchical Risk Parity (HRP)
// ============================================================================

export interface HRPResult {
  weights: Record<string, number>;
  orderedSymbols: string[];
  stages: {
    distanceMatrix: number[][];
    quasiDiagIndices: number[];
  };
}

/**
 * Hierarchical Risk Parity (HRP) - Marcos López de Prado (2016)
 * Solves Markowitz singularity and assigns weights without inverting the covariance matrix.
 */
export function calculateHRP(
  symbols: string[],
  covMatrix: number[][],
  corrMatrix?: number[][]
): HRPResult {
  const n = symbols.length;
  if (n === 0) return { weights: {}, orderedSymbols: [], stages: { distanceMatrix: [], quasiDiagIndices: [] } };
  if (n === 1) {
    return {
      weights: { [symbols[0]]: 1.0 },
      orderedSymbols: [symbols[0]],
      stages: { distanceMatrix: [[0]], quasiDiagIndices: [0] },
    };
  }

  // Derive correlation matrix if not supplied
  const corr: number[][] = corrMatrix || [];
  if (!corrMatrix) {
    const stds = symbols.map((_, i) => Math.sqrt(Math.max(1e-8, covMatrix[i][i])));
    for (let i = 0; i < n; i++) {
      corr[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) corr[i][j] = 1.0;
        else {
          const val = covMatrix[i][j] / (stds[i] * stds[j]);
          corr[i][j] = Math.max(-1.0, Math.min(1.0, isNaN(val) ? 0 : val));
        }
      }
    }
  }

  // Stage 1: Tree Clustering (Correlation to Distance matrix d_ij = sqrt(0.5 * (1 - r_ij)))
  const dist: number[][] = [];
  for (let i = 0; i < n; i++) {
    dist[i] = [];
    for (let j = 0; j < n; j++) {
      dist[i][j] = Math.sqrt(Math.max(0, 0.5 * (1.0 - corr[i][j])));
    }
  }

  // Hierarchical Agglomerative Single-Linkage Clustering
  interface Cluster {
    id: number;
    items: number[];
    left?: Cluster;
    right?: Cluster;
  }

  let clusters: Cluster[] = symbols.map((_, i) => ({ id: i, items: [i] }));
  let nextId = n;

  while (clusters.length > 1) {
    let minDist = Infinity;
    let bestA = 0;
    let bestB = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Single-linkage distance between cluster i and j
        let minPair = Infinity;
        for (const u of clusters[i].items) {
          for (const v of clusters[j].items) {
            if (dist[u][v] < minPair) minPair = dist[u][v];
          }
        }
        if (minPair < minDist) {
          minDist = minPair;
          bestA = i;
          bestB = j;
        }
      }
    }

    const merged: Cluster = {
      id: nextId++,
      items: [...clusters[bestA].items, ...clusters[bestB].items],
      left: clusters[bestA],
      right: clusters[bestB],
    };

    clusters = clusters.filter((_, idx) => idx !== bestA && idx !== bestB);
    clusters.push(merged);
  }

  const root = clusters[0];

  // Stage 2: Quasi-Diagonalization (Traversal of dendrogram)
  function getQuasiDiagOrder(node: Cluster): number[] {
    if (!node.left || !node.right) return node.items;
    return [...getQuasiDiagOrder(node.left), ...getQuasiDiagOrder(node.right)];
  }

  const orderedIndices = getQuasiDiagOrder(root);
  const orderedSymbols = orderedIndices.map((i) => symbols[i]);

  // Stage 3: Recursive Bisection
  const weightsArray = new Array<number>(n).fill(1.0);

  function getClusterVariance(indices: number[]): number {
    if (indices.length === 1) return covMatrix[indices[0]][indices[0]];
    // Inverse-variance allocation inside cluster
    const invVars = indices.map((idx) => 1.0 / Math.max(1e-8, covMatrix[idx][idx]));
    const sumInv = invVars.reduce((a, b) => a + b, 0);
    const subW = invVars.map((v) => v / sumInv);

    let v = 0;
    for (let i = 0; i < indices.length; i++) {
      for (let j = 0; j < indices.length; j++) {
        v += subW[i] * subW[j] * covMatrix[indices[i]][indices[j]];
      }
    }
    return Math.max(1e-8, v);
  }

  function recursiveBisection(items: number[]) {
    if (items.length <= 1) return;

    const mid = Math.floor(items.length / 2);
    const leftItems = items.slice(0, mid);
    const rightItems = items.slice(mid);

    const varLeft = getClusterVariance(leftItems);
    const varRight = getClusterVariance(rightItems);

    const alpha = 1.0 - varLeft / (varLeft + varRight);

    for (const idx of leftItems) weightsArray[idx] *= alpha;
    for (const idx of rightItems) weightsArray[idx] *= 1.0 - alpha;

    recursiveBisection(leftItems);
    recursiveBisection(rightItems);
  }

  recursiveBisection(orderedIndices);

  // Normalize weights
  const sumW = weightsArray.reduce((a, b) => a + b, 0);
  const weights: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    weights[symbols[i]] = Number((weightsArray[i] / sumW).toFixed(4));
  }

  return {
    weights,
    orderedSymbols,
    stages: {
      distanceMatrix: dist,
      quasiDiagIndices: orderedIndices,
    },
  };
}

// ============================================================================
// 2. Ornstein-Uhlenbeck (OU) Mean Reversion & Half-Life
// ============================================================================

export interface OUResult {
  theta: number; // Speed of mean reversion
  mu: number; // Long-term equilibrium mean
  sigma: number; // Volatility of the process
  halfLife: number; // Half-life of mean reversion in periods (ln(2) / theta)
  currentZScore: number; // Current deviation in std dev
  isStationary: boolean;
  actionRecommendation: "BUY_OVERSOLD" | "SELL_OVERBOUGHT" | "MEAN_REVERTED_NEUTRAL" | "NON_MEAN_REVERTING";
}

/**
 * Fit an Ornstein-Uhlenbeck (OU) process to a price series or spread:
 * dS_t = theta * (mu - S_t) * dt + sigma * dW_t
 * Solved via discrete AR(1) OLS regression: (S_t - S_{t-1}) = a + b * S_{t-1} + e
 */
export function estimateOrnsteinUhlenbeck(series: number[], dt: number = 1.0): OUResult {
  const n = series.length;
  if (n < 5) {
    return {
      theta: 0,
      mu: series[n - 1] || 0,
      sigma: 0,
      halfLife: Infinity,
      currentZScore: 0,
      isStationary: false,
      actionRecommendation: "NON_MEAN_REVERTING",
    };
  }

  // Regression Y = S_t - S_{t-1}, X = S_{t-1}
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  const count = n - 1;

  for (let i = 1; i < n; i++) {
    const x = series[i - 1];
    const y = series[i] - series[i - 1];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = count * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) {
    return {
      theta: 0,
      mu: series[n - 1],
      sigma: 0,
      halfLife: Infinity,
      currentZScore: 0,
      isStationary: false,
      actionRecommendation: "NON_MEAN_REVERTING",
    };
  }

  const b = (count * sumXY - sumX * sumY) / denominator;
  const a = (sumY - b * sumX) / count;

  // Stationarity check: b must be negative for mean reversion (AR(1) coeff phi = 1 + b < 1)
  const isStationary = b < 0;
  const phi = Math.max(1e-4, 1.0 + b);
  const theta = isStationary ? -Math.log(phi) / dt : 0;
  const mu = isStationary ? -a / b : series[n - 1];
  const halfLife = theta > 0 ? Number((Math.log(2.0) / theta).toFixed(2)) : Infinity;

  // Compute residuals variance
  let resSumSq = 0;
  for (let i = 1; i < n; i++) {
    const x = series[i - 1];
    const y = series[i] - series[i - 1];
    const pred = a + b * x;
    resSumSq += (y - pred) ** 2;
  }
  const resVar = resSumSq / (count - 2);
  const sigma = theta > 0 ? Math.sqrt(Math.max(1e-8, (resVar * 2 * theta) / (1 - Math.exp(-2 * theta * dt)))) : Math.sqrt(resVar);
  const eqStd = theta > 0 ? sigma / Math.sqrt(2 * theta) : Math.sqrt(resVar);

  const currentVal = series[n - 1];
  const currentZScore = eqStd > 0 ? Number(((currentVal - mu) / eqStd).toFixed(2)) : 0;

  let actionRecommendation: OUResult["actionRecommendation"] = "MEAN_REVERTED_NEUTRAL";
  if (!isStationary || halfLife > 60) {
    actionRecommendation = "NON_MEAN_REVERTING";
  } else if (currentZScore <= -1.8) {
    actionRecommendation = "BUY_OVERSOLD";
  } else if (currentZScore >= 1.8) {
    actionRecommendation = "SELL_OVERBOUGHT";
  }

  return {
    theta: Number(theta.toFixed(4)),
    mu: Number(mu.toFixed(2)),
    sigma: Number(sigma.toFixed(4)),
    halfLife,
    currentZScore,
    isStationary,
    actionRecommendation,
  };
}

// ============================================================================
// 3. Almgren-Chriss (2000) Optimal Execution & Market Impact Trajectory
// ============================================================================

export interface AlmgrenChrissParams {
  totalShares: number; // Total shares X
  totalTimeHours: number; // Horizon T (e.g., 4.5 hours for VN stock session)
  intervalsCount: number; // Number of slices N (e.g., 9 slices of 30 mins)
  riskAversion: number; // Lambda: 0 = risk neutral (pure TWAP), > 0 = risk averse
  dailyVolatilityPct: number; // Sigma (e.g., 2.5%)
  tempImpactFactor: number; // Eta (e.g. 2.5e-6)
  currentPrice: number; // Starting asset price S_0
}

export interface ExecutionSlice {
  interval: number;
  timeLabel: string;
  sharesRemaining: number;
  sharesToTrade: number;
  pctOfTotal: number;
}

export interface AlmgrenChrissResult {
  kappa: number; // Urgency parameter
  halfLifeHours: number;
  schedule: ExecutionSlice[];
  twapComparison: ExecutionSlice[];
  summary: {
    urgencyType: "AGGRESSIVE_FRONT_LOADED" | "MODERATE_BALANCED" | "LINEAR_TWAP";
    expectedImpactCostVnd: number;
    timingRiskVnd: number;
  };
}

/**
 * Compute optimal execution trajectory under Almgren-Chriss framework:
 * x_j = X * sinh(kappa * (T - t_j)) / sinh(kappa * T)
 */
export function calculateAlmgrenChrissExecution(
  params: AlmgrenChrissParams
): AlmgrenChrissResult {
  const {
    totalShares,
    totalTimeHours,
    intervalsCount,
    riskAversion,
    dailyVolatilityPct,
    tempImpactFactor,
    currentPrice,
  } = params;

  const X = totalShares;
  const T = totalTimeHours;
  const N = Math.max(2, intervalsCount);
  const dt = T / N;

  const sigmaDaily = dailyVolatilityPct / 100;
  const sigmaPerHour = sigmaDaily / Math.sqrt(4.5); // 4.5 trading hours/day
  const eta = Math.max(1e-8, tempImpactFactor);
  const lambda = Math.max(0, riskAversion);

  // Urgency parameter kappa = sqrt(lambda * sigma^2 / eta)
  const kappa = Math.sqrt((lambda * sigmaPerHour * sigmaPerHour) / eta);
  const halfLifeHours = kappa > 0 ? Math.log(2.0) / kappa : T / 2;

  const schedule: ExecutionSlice[] = [];
  const twapComparison: ExecutionSlice[] = [];

  let prevX = X;
  let prevTwapX = X;
  const twapSlice = X / N;

  for (let j = 0; j <= N; j++) {
    const t = j * dt;
    let x_j: number;

    if (kappa < 1e-4) {
      // Linear TWAP limit as kappa -> 0
      x_j = X * (1.0 - t / T);
    } else {
      x_j = X * (Math.sinh(kappa * (T - t)) / Math.sinh(kappa * T));
    }
    x_j = Math.max(0, Math.round(x_j));

    const twapX_j = Math.max(0, Math.round(X * (1.0 - t / T)));

    if (j > 0) {
      const tradeAC = prevX - x_j;
      const tradeTWAP = prevTwapX - twapX_j;

      const hour = Math.floor(t);
      const min = Math.round((t - hour) * 60);
      const timeLabel = `T+${hour}h${min > 0 ? min + "m" : ""}`;

      schedule.push({
        interval: j,
        timeLabel,
        sharesRemaining: x_j,
        sharesToTrade: tradeAC,
        pctOfTotal: Number(((tradeAC / X) * 100).toFixed(1)),
      });

      twapComparison.push({
        interval: j,
        timeLabel,
        sharesRemaining: twapX_j,
        sharesToTrade: tradeTWAP,
        pctOfTotal: Number(((tradeTWAP / X) * 100).toFixed(1)),
      });
    }

    prevX = x_j;
    prevTwapX = twapX_j;
  }

  // Impact cost estimate
  const expectedImpactCostVnd = Math.round(
    schedule.reduce((sum, s) => sum + eta * s.sharesToTrade * s.sharesToTrade * currentPrice, 0)
  );
  const timingRiskVnd = Math.round(
    0.5 * lambda * sigmaPerHour * sigmaPerHour * currentPrice * X * dt
  );

  let urgencyType: AlmgrenChrissResult["summary"]["urgencyType"] = "LINEAR_TWAP";
  if (kappa > 0.8) urgencyType = "AGGRESSIVE_FRONT_LOADED";
  else if (kappa > 0.15) urgencyType = "MODERATE_BALANCED";

  return {
    kappa: Number(kappa.toFixed(4)),
    halfLifeHours: Number(halfLifeHours.toFixed(2)),
    schedule,
    twapComparison,
    summary: {
      urgencyType,
      expectedImpactCostVnd,
      timingRiskVnd,
    },
  };
}

// ============================================================================
// 4. Deflated Sharpe Ratio (DSR) & Multiple Testing Adjustment
// ============================================================================

export interface DSRParams {
  observedSharpe: number; // SR_hat (e.g., 1.85)
  trialsCount: number; // N: number of strategies/parameters tested
  sampleLengthBars: number; // T: sample bars (e.g., 252 days)
  skewness?: number; // Returns skewness (e.g. -0.2)
  kurtosis?: number; // Returns kurtosis (e.g. 3.8)
  varSharpeEstimates?: number; // Variance of Sharpe trials
}

export interface DSRResult {
  observedSharpe: number;
  expectedMaxSharpeNull: number; // SR* under data snooping null
  deflatedSharpeRatio: number; // DSR in [0, 1]
  isStatisticallySignificant: boolean; // DSR >= 0.95
  pValue: number;
  haircutPct: number; // % reduction from observed to benchmark
}

/**
 * Deflated Sharpe Ratio (DSR) - Marcos López de Prado (2014)
 * Penalizes Sharpe ratios for selection bias, multiple testing and non-normal skewness/kurtosis.
 */
export function calculateDeflatedSharpeRatio(params: DSRParams): DSRResult {
  const {
    observedSharpe,
    trialsCount,
    sampleLengthBars,
    skewness = 0,
    kurtosis = 3.0,
    varSharpeEstimates = 0.25,
  } = params;

  const N = Math.max(1, trialsCount);
  const T = Math.max(10, sampleLengthBars);
  const gammaEuler = 0.5772156649; // Euler-Mascheroni constant

  // Expected Maximum Sharpe Ratio under Null Hypothesis (pure luck over N trials)
  let srStar = 0;
  if (N > 1) {
    const sqrt2LnN = Math.sqrt(2.0 * Math.log(N));
    srStar = Math.sqrt(varSharpeEstimates) * (sqrt2LnN + gammaEuler / sqrt2LnN);
  }

  // Standard Error of Sharpe Ratio under non-normality:
  // SE(SR) = sqrt((1 - skew * SR + ((kurt - 1) / 4) * SR^2) / (T - 1))
  const varianceFactor =
    1.0 - skewness * observedSharpe + ((kurtosis - 1.0) / 4.0) * (observedSharpe * observedSharpe);
  const seSr = Math.sqrt(Math.max(1e-8, varianceFactor / (T - 1)));

  // Test statistic Z = (SR_hat - SR*) / SE(SR)
  const z = (observedSharpe - srStar) / seSr;
  const dsr = normCdf(z);
  const pValue = 1.0 - dsr;

  const haircutPct = observedSharpe > 0 ? Math.min(100, Math.max(0, ((observedSharpe - srStar) / observedSharpe) * 100)) : 0;

  return {
    observedSharpe: Number(observedSharpe.toFixed(2)),
    expectedMaxSharpeNull: Number(srStar.toFixed(2)),
    deflatedSharpeRatio: Number(dsr.toFixed(4)),
    isStatisticallySignificant: dsr >= 0.95,
    pValue: Number(pValue.toFixed(4)),
    haircutPct: Number(haircutPct.toFixed(1)),
  };
}

// ============================================================================
// 5. Triple-Barrier Method & Risk Levels
// ============================================================================

export interface TripleBarrierLevels {
  currentPrice: number;
  upperBarrierPrice: number; // Take-Profit (Horizontal)
  lowerBarrierPrice: number; // Stop-Loss (Horizontal)
  verticalBarrierBars: number; // Max holding horizon
  targetReturnPct: number;
  stopLossReturnPct: number;
  riskRewardRatio: number;
}

/**
 * Triple-Barrier Method - Marcos López de Prado (AFML)
 * Sets dynamic horizontal profit & loss barriers scaled by volatility, bounded by a time barrier.
 */
export function calculateTripleBarrierLevels(
  currentPrice: number,
  atrPct: number,
  ptMultiplier: number = 3.0,
  slMultiplier: number = 2.0,
  maxBars: number = 10
): TripleBarrierLevels {
  const dynamicVolatility = Math.max(1.0, atrPct);
  const targetReturnPct = Number((ptMultiplier * dynamicVolatility).toFixed(1));
  const stopLossReturnPct = Number((slMultiplier * dynamicVolatility).toFixed(1));

  const upperBarrierPrice = Math.round(currentPrice * (1.0 + targetReturnPct / 100));
  const lowerBarrierPrice = Math.round(currentPrice * (1.0 - stopLossReturnPct / 100));
  const riskRewardRatio = Number((targetReturnPct / stopLossReturnPct).toFixed(2));

  return {
    currentPrice,
    upperBarrierPrice,
    lowerBarrierPrice,
    verticalBarrierBars: maxBars,
    targetReturnPct,
    stopLossReturnPct,
    riskRewardRatio,
  };
}

// ============================================================================
// 6. Value-at-Risk (VaR) & Conditional VaR (Expected Shortfall)
// ============================================================================

export interface RiskMetricsResult {
  var95Pct: number; // 95% 1-day VaR
  var99Pct: number; // 99% 1-day VaR
  cvar95Pct: number; // Expected Shortfall at 95%
  cvar99Pct: number; // Expected Shortfall at 99%
  cornishFisherVaR95Pct: number; // Skew/Kurtosis adjusted
  skewness: number;
  kurtosis: number;
}

/**
 * Value-at-Risk (VaR) & Conditional VaR (CVaR / Expected Shortfall)
 * Computes parametric, historical, and Cornish-Fisher non-Gaussian VaR.
 */
export function calculateVaRAndCVaR(returns: number[]): RiskMetricsResult {
  const n = returns.length;
  if (n < 5) {
    return {
      var95Pct: 2.5,
      var99Pct: 3.8,
      cvar95Pct: 3.2,
      cvar99Pct: 4.5,
      cornishFisherVaR95Pct: 2.7,
      skewness: 0,
      kurtosis: 3,
    };
  }

  // Mean & Std
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  // Skewness & Kurtosis
  const m3 = returns.reduce((sum, r) => sum + (r - mean) ** 3, 0) / n;
  const m4 = returns.reduce((sum, r) => sum + (r - mean) ** 4, 0) / n;
  const skewness = std > 0 ? m3 / (std ** 3) : 0;
  const kurtosis = std > 0 ? m4 / (std ** 4) : 3;

  // Sorted returns for historical VaR/CVaR
  const sorted = [...returns].sort((a, b) => a - b);
  const idx95 = Math.floor(n * 0.05);
  const idx99 = Math.floor(n * 0.01);

  const histVaR95 = -sorted[idx95];
  const histVaR99 = -sorted[idx99];

  // CVaR = Average of losses exceeding VaR
  const tail95 = sorted.slice(0, idx95 + 1);
  const tail99 = sorted.slice(0, Math.max(1, idx99 + 1));
  const cvar95 = -(tail95.reduce((a, b) => a + b, 0) / tail95.length);
  const cvar99 = -(tail99.reduce((a, b) => a + b, 0) / tail99.length);

  // Cornish-Fisher VaR 95%
  // z_cf = z + (z^2 - 1) * S / 6 + (z^3 - 3z) * (K - 3) / 24 - (2z^3 - 5z) * S^2 / 36
  const z95 = normInv(0.95); // ~1.64485
  const zCf =
    z95 +
    ((z95 ** 2 - 1) * skewness) / 6.0 +
    ((z95 ** 3 - 3 * z95) * (kurtosis - 3.0)) / 24.0 -
    ((2 * z95 ** 3 - 5 * z95) * (skewness ** 2)) / 36.0;
  const cfVaR95 = -(mean - zCf * std);

  return {
    var95Pct: Number((histVaR95 * 100).toFixed(2)),
    var99Pct: Number((histVaR99 * 100).toFixed(2)),
    cvar95Pct: Number((cvar95 * 100).toFixed(2)),
    cvar99Pct: Number((cvar99 * 100).toFixed(2)),
    cornishFisherVaR95Pct: Number((cfVaR95 * 100).toFixed(2)),
    skewness: Number(skewness.toFixed(2)),
    kurtosis: Number(kurtosis.toFixed(2)),
  };
}
