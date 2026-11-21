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

  // Stationarity check for continuous-time Ornstein-Uhlenbeck diffusion:
  // Discrete AR(1) coefficient phi = 1 + b = exp(-theta * dt) MUST lie strictly in (0, 1), i.e., -1 < b < 0.
  // Negative AR(1) roots (-2 < b <= -1, phi <= 0) oscillate sign every bar and cannot come from an OU process.
  const rawPhi = 1.0 + b;
  const isStationary = b < -1e-5 && b > -1.0 && rawPhi > 1e-4 && rawPhi < 1.0;
  const phi = isStationary ? rawPhi : 1.0;
  const theta = isStationary ? -Math.log(phi) / dt : 0;
  const rawMu = isStationary ? -a / b : series[n - 1];
  const lastPrice = series[n - 1];
  const mu = Number.isFinite(rawMu)
    ? Math.max(lastPrice * 0.2, Math.min(lastPrice * 5.0, rawMu))
    : lastPrice;
  const halfLife = isStationary && theta > 0 ? Number((Math.log(2.0) / theta).toFixed(2)) : Infinity;

  // Compute residuals variance
  let resSumSq = 0;
  for (let i = 1; i < n; i++) {
    const x = series[i - 1];
    const y = series[i] - series[i - 1];
    const pred = a + b * x;
    resSumSq += (y - pred) ** 2;
  }
  const dof = Math.max(1, count - 2);
  const resVar = resSumSq / dof;
  const sigma =
    isStationary && theta > 0
      ? Math.sqrt(Math.max(1e-8, (resVar * 2 * theta) / (1 - Math.exp(-2 * theta * dt))))
      : Math.sqrt(Math.max(1e-8, resVar));
  const eqStd =
    isStationary && theta > 0
      ? sigma / Math.sqrt(2 * theta)
      : Math.sqrt(Math.max(1e-8, resVar));

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

  // Expected Maximum Sharpe Ratio under Null Hypothesis (annualized scale)
  let srStar = 0;
  if (N > 1) {
    const sqrt2LnN = Math.sqrt(2.0 * Math.log(N));
    srStar = Math.sqrt(varSharpeEstimates) * (sqrt2LnN + gammaEuler / sqrt2LnN);
  }

  // Convert annualized Sharpe ratios to per-bar frequency (SR_bar = SR_annual / sqrt(252))
  // to match daily sample length T in Bailey & López de Prado (2014) Eq. (11)
  const sqrtAnnual = Math.sqrt(252);
  const srBar = observedSharpe / sqrtAnnual;
  const srStarBar = srStar / sqrtAnnual;

  // Standard Error of per-bar Sharpe Ratio under non-normality:
  // SE(SR_bar) = sqrt((1 - skew * SR_bar + ((kurt - 1) / 4) * SR_bar^2) / (T - 1))
  const varianceFactor =
    1.0 - skewness * srBar + ((kurtosis - 1.0) / 4.0) * (srBar * srBar);
  const seSrBar = Math.sqrt(Math.max(1e-8, varianceFactor / (T - 1)));

  // Test statistic Z = (SR_hat_bar - SR*_bar) / SE(SR_bar)
  const z = (srBar - srStarBar) / seSrBar;
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
function roundBarrierPrice(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return p;
  if (p >= 500) return Math.round(p);
  if (p >= 10) return Number(p.toFixed(2));
  if (p >= 0.5) return Number(p.toFixed(4));
  return Number(p.toFixed(6));
}

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

  const upperBarrierPrice = roundBarrierPrice(currentPrice * (1.0 + targetReturnPct / 100));
  const lowerBarrierPrice = roundBarrierPrice(currentPrice * (1.0 - stopLossReturnPct / 100));
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

  // Sorted returns for historical VaR/CVaR with linear quantile interpolation & non-negative loss clamp
  const sorted = [...returns].sort((a, b) => a - b);
  const interpQuantile = (alpha: number): number => {
    const pos = alpha * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(n - 1, lo + 1);
    const frac = pos - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };

  const q05 = interpQuantile(0.05);
  const q01 = interpQuantile(0.01);
  const histVaR95 = Math.max(0, -q05);
  const histVaR99 = Math.max(histVaR95, -q01);

  // CVaR = Average of losses exceeding VaR quantile
  const cutoff95 = Math.max(1, Math.ceil(n * 0.05));
  const cutoff99 = Math.max(1, Math.ceil(n * 0.01));
  const tail95 = sorted.slice(0, cutoff95);
  const tail99 = sorted.slice(0, cutoff99);
  const rawCvar95 = -(tail95.reduce((a, b) => a + b, 0) / tail95.length);
  const rawCvar99 = -(tail99.reduce((a, b) => a + b, 0) / tail99.length);
  const cvar95 = Math.max(histVaR95, rawCvar95);
  const cvar99 = Math.max(histVaR99, rawCvar99);

  // Cornish-Fisher VaR 95% (left-tail quantile z05 = Phi^-1(0.05) ~ -1.64485)
  // Negative skewness makes zCf more negative, increasing downside crash VaR
  const z05 = normInv(0.05);
  const zCf =
    z05 +
    ((z05 ** 2 - 1) * skewness) / 6.0 +
    ((z05 ** 3 - 3 * z05) * (kurtosis - 3.0)) / 24.0 -
    ((2 * z05 ** 3 - 5 * z05) * (skewness ** 2)) / 36.0;
  const cfVaR95 = Math.max(0, -(mean + zCf * std));

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

// ============================================================================
// 7. Empirical Ledoit-Wolf Shrinkage Covariance Matrix (SSOT for HRP/NCO)
// ============================================================================

export interface EmpiricalCovarianceResult {
  covMatrix: number[][];
  isEmpirical: boolean;
  sampleLength: number;
  shrinkageIntensity: number;
}

/**
 * Estimates a well-conditioned covariance matrix from aligned asset return series
 * using shrinkage toward a constant-correlation target (Ledoit-Wolf style),
 * eliminating arbitrary constant 0.35 correlation assumptions when return data exists.
 */
export function computeEmpiricalShrinkageCovariance(
  returnsByAsset: number[][],
  fallbackDailyVols?: number[],
  shrinkageAlpha = 0.25,
): EmpiricalCovarianceResult {
  const n = returnsByAsset.length;
  if (n === 0) {
    return { covMatrix: [], isEmpirical: false, sampleLength: 0, shrinkageIntensity: 1 };
  }

  const validLengths = returnsByAsset.map((s) => s.length);
  const minLen = Math.min(...validLengths);
  const alpha = Math.max(0, Math.min(1, shrinkageAlpha));

  if (minLen < 12) {
    const diagCov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      const s = returnsByAsset[i] ?? [];
      let v = Math.max(1e-4, fallbackDailyVols?.[i] ?? 0.025) ** 2;
      if (s.length >= 5) {
        const mean = s.reduce((a, b) => a + b, 0) / s.length;
        const empVar = s.reduce((sum, r) => sum + (r - mean) ** 2, 0) / Math.max(1, s.length - 1);
        if (Number.isFinite(empVar) && empVar > 1e-8) v = empVar;
      }
      diagCov[i]![i] = v;
    }
    return {
      covMatrix: diagCov,
      isEmpirical: false,
      sampleLength: minLen,
      shrinkageIntensity: 1,
    };
  }

  const aligned = returnsByAsset.map((s) => s.slice(-minLen));
  const means = aligned.map((s) => s.reduce((a, b) => a + b, 0) / minLen);

  // Sample covariance matrix S
  const sampleCov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const vols = new Array<number>(n).fill(0.025);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0;
      for (let t = 0; t < minLen; t++) {
        sum += (aligned[i]![t]! - means[i]!) * (aligned[j]![t]! - means[j]!);
      }
      const cov = sum / Math.max(1, minLen - 1);
      sampleCov[i]![j] = cov;
      sampleCov[j]![i] = cov;
    }
    vols[i] = Math.sqrt(Math.max(1e-8, sampleCov[i]![i]!));
  }

  // Average pairwise empirical correlation for structured shrinkage target F
  let corrSum = 0;
  let corrPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = sampleCov[i]![j]! / Math.max(1e-8, vols[i]! * vols[j]!);
      corrSum += Math.max(-0.99, Math.min(0.99, c));
      corrPairs++;
    }
  }
  const avgCorr = corrPairs > 0 ? corrSum / corrPairs : 0;

  const shrunkCov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const target = i === j ? Math.max(1e-8, sampleCov[i]![i]!) : avgCorr * vols[i]! * vols[j]!;
      shrunkCov[i]![j] = (1 - alpha) * sampleCov[i]![j]! + alpha * target;
    }
  }

  return {
    covMatrix: shrunkCov,
    isEmpirical: true,
    sampleLength: minLen,
    shrinkageIntensity: alpha,
  };
}

// ============================================================================
// 8. Fat-Tail Student-t Distribution, Yang-Zhang / HAR-RV Volatility,
//    3-State Online HMM Regime Filter & Symmetric CUSUM Structural Break
// ============================================================================

/**
 * Student-t Cumulative Distribution Function P(T <= t) for degrees of freedom `nu >= 2.5`.
 * Captures heavy tails (kurtosis > 3) in intraday FX, Crypto, and Equity returns.
 */
export function studentTCdf(t: number, nu = 5): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const df = Math.max(2.5, Math.min(200, nu));
  if (df >= 120) return normCdf(t);

  // Hill's (1970) / Peizer-Pratt Cornish-Fisher normal mapping for Student-t quantile -> CDF
  // Accurate to < 1e-4 across the entire tail (|t| up to 12) without iterative beta divergence
  const absT = Math.abs(t);
  const a = df - 0.5;
  const b = 48 * a * a;
  const z2 = a * Math.log1p((absT * absT) / df);
  const z = Math.sqrt(z2);
  const zCorr =
    z +
    ((z ** 3 + 3 * z) / b) -
    ((4 * z ** 7 + 33 * z ** 5 + 240 * z ** 3 + 855 * z) / (10 * b * b + 8 * b * z ** 4 + 1000 * b));
  const tailProb = 1 - normCdf(Math.max(0, zCorr));
  return t >= 0 ? 1 - tailProb : tailProb;
}

/**
 * Estimates empirical tail degrees of freedom `nu` in [4, 30] from sample excess kurtosis.
 */
export function estimateTailDegreesOfFreedom(returns: number[], fallbackNu = 5): number {
  const valid = returns.filter((r) => Number.isFinite(r));
  const n = valid.length;
  if (n < 15) return fallbackNu;
  const mean = valid.reduce((a, b) => a + b, 0) / n;
  const variance = valid.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, n - 1);
  if (variance <= 1e-14) return 15;
  const std = Math.sqrt(variance);
  const m4 = valid.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n;
  const excessKurt = Math.max(0, m4 - 3);
  if (excessKurt <= 0.15) return 25;
  // For Student-t(nu), excess kurtosis = 6 / (nu - 4) -> nu = 4 + 6 / excessKurt
  const nu = 4 + 6 / excessKurt;
  return Number(Math.max(3.5, Math.min(30, nu)).toFixed(2));
}

export interface OhlcBarLike {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface YangZhangVolatilityResult {
  dailyVol: number;
  annualizedVol: number;
  overnightVol: number;
  rogersSatchellVol: number;
  volRatio: number; // Current short-window YZ vol vs baseline YZ vol
}

/**
 * Minimum-variance unbiased Yang-Zhang (2000) OHLC Volatility Estimator.
 * Accounts for overnight opening jumps + intraday Rogers-Satchell drift-independent range variance.
 */
export function computeYangZhangVolatility(
  bars: OhlcBarLike[],
  window = 20,
  annualizePeriods = 252,
): YangZhangVolatilityResult {
  const n = bars.length;
  if (n < 4) {
    return {
      dailyVol: 0.015,
      annualizedVol: Number((0.015 * Math.sqrt(annualizePeriods)).toFixed(4)),
      overnightVol: 0.005,
      rogersSatchellVol: 0.012,
      volRatio: 1.0,
    };
  }

  const calcSliceYz = (slice: OhlcBarLike[]): { yz: number; on: number; rs: number } => {
    const m = slice.length - 1;
    if (m < 2) return { yz: 0.015, on: 0.005, rs: 0.012 };
    const oRets: number[] = [];
    const cRets: number[] = [];
    let rsSum = 0;

    for (let i = 1; i < slice.length; i++) {
      const prevC = Math.max(1e-12, slice[i - 1]!.close);
      const o = Math.max(1e-12, slice[i]!.open);
      const h = Math.max(o, slice[i]!.high);
      const l = Math.min(o, Math.max(1e-12, slice[i]!.low));
      const c = Math.max(1e-12, slice[i]!.close);

      oRets.push(Math.log(o / prevC));
      cRets.push(Math.log(c / o));

      const u = Math.log(h / o);
      const d = Math.log(l / o);
      const cLog = Math.log(c / o);
      rsSum += u * (u - cLog) + d * (d - cLog);
    }

    const meanO = oRets.reduce((a, b) => a + b, 0) / m;
    const meanC = cRets.reduce((a, b) => a + b, 0) / m;
    const varO = oRets.reduce((s, x) => s + (x - meanO) ** 2, 0) / Math.max(1, m - 1);
    const varC = cRets.reduce((s, x) => s + (x - meanC) ** 2, 0) / Math.max(1, m - 1);
    const varRs = Math.max(0, rsSum / m);

    const k = 0.34 / (1.34 + (m + 1) / Math.max(1, m - 1));
    const varYz = Math.max(1e-10, varO + k * varC + (1 - k) * varRs);
    return {
      yz: Math.sqrt(varYz),
      on: Math.sqrt(Math.max(0, varO)),
      rs: Math.sqrt(varRs),
    };
  };

  const w = Math.max(3, Math.min(window, n - 1));
  const recent = calcSliceYz(bars.slice(-(w + 1)));
  const baseW = Math.max(w, Math.min(60, n - 1));
  const baseline = calcSliceYz(bars.slice(-(baseW + 1)));
  const volRatio = baseline.yz > 1e-9 ? recent.yz / baseline.yz : 1.0;

  return {
    dailyVol: Number(recent.yz.toFixed(6)),
    annualizedVol: Number((recent.yz * Math.sqrt(annualizePeriods)).toFixed(4)),
    overnightVol: Number(recent.on.toFixed(6)),
    rogersSatchellVol: Number(recent.rs.toFixed(6)),
    volRatio: Number(volRatio.toFixed(3)),
  };
}

export interface HarVolatilityForecast {
  forecastBarVolPct: number;
  forecastAnnualVolPct: number;
  rvDailyPct: number;
  rvWeeklyPct: number;
  rvMonthlyPct: number;
  expansionRatio: number;
  harRegime: "VOL_COMPRESSING" | "VOL_NORMAL" | "VOL_EXPANDING" | "VOL_SHOCK";
}

/**
 * Corsi (2009) Heterogeneous Autoregressive Realized Volatility (HAR-RV) model.
 * Combines short (1-bar), medium (5-bar), and long (22-bar) range-based realized volatilities
 * to forecast next-period volatility causally without look-ahead bias.
 */
export function forecastHarRealizedVolatility(
  bars: OhlcBarLike[],
  annualizePeriods = 252,
): HarVolatilityForecast {
  const n = bars.length;
  if (n < 6) {
    return {
      forecastBarVolPct: 1.5,
      forecastAnnualVolPct: Number((1.5 * Math.sqrt(annualizePeriods)).toFixed(2)),
      rvDailyPct: 1.5,
      rvWeeklyPct: 1.5,
      rvMonthlyPct: 1.5,
      expansionRatio: 1.0,
      harRegime: "VOL_NORMAL",
    };
  }

  // Per-bar Parkinson + Rogers-Satchell combined realized volatility proxy
  const barRvs: number[] = [];
  const ln4 = 4 * Math.LN2;
  for (let i = 1; i < n; i++) {
    const prevC = Math.max(1e-12, bars[i - 1]!.close);
    const o = Math.max(1e-12, bars[i]!.open);
    const h = Math.max(o, bars[i]!.high);
    const l = Math.min(o, Math.max(1e-12, bars[i]!.low));
    const c = Math.max(1e-12, bars[i]!.close);

    const parkVar = (Math.log(h / l) ** 2) / ln4;
    const gapVar = Math.log(o / prevC) ** 2;
    const ccVar = Math.log(c / prevC) ** 2;
    const rv = Math.sqrt(Math.max(1e-10, 0.55 * parkVar + 0.25 * gapVar + 0.20 * ccVar));
    barRvs.push(rv);
  }

  const m = barRvs.length;
  const meanSlice = (endIdxInclusive: number, len: number): number => {
    const start = Math.max(0, endIdxInclusive - len + 1);
    let s = 0;
    let cnt = 0;
    for (let k = start; k <= endIdxInclusive; k++) {
      s += barRvs[k]!;
      cnt++;
    }
    return cnt > 0 ? s / cnt : 0.01;
  };

  const rvD = barRvs[m - 1]!;
  const rvW = meanSlice(m - 1, 5);
  const rvM = meanSlice(m - 1, Math.min(22, m));

  // Causal HAR weights (Corsi multi-scale persistence cascade: 0.36 short + 0.36 medium + 0.28 long)
  const forecastRv = Math.max(1e-6, 0.36 * rvD + 0.36 * rvW + 0.28 * rvM);
  const expansionRatio = rvM > 1e-9 ? forecastRv / rvM : 1.0;

  let harRegime: HarVolatilityForecast["harRegime"] = "VOL_NORMAL";
  if (expansionRatio >= 1.85) harRegime = "VOL_SHOCK";
  else if (expansionRatio >= 1.25) harRegime = "VOL_EXPANDING";
  else if (expansionRatio <= 0.78) harRegime = "VOL_COMPRESSING";

  return {
    forecastBarVolPct: Number((forecastRv * 100).toFixed(4)),
    forecastAnnualVolPct: Number((forecastRv * Math.sqrt(annualizePeriods) * 100).toFixed(2)),
    rvDailyPct: Number((rvD * 100).toFixed(4)),
    rvWeeklyPct: Number((rvW * 100).toFixed(4)),
    rvMonthlyPct: Number((rvM * 100).toFixed(4)),
    expansionRatio: Number(expansionRatio.toFixed(3)),
    harRegime,
  };
}

export type HmmRegimeState = "TREND_EXPANSION" | "MEAN_REVERT_LOWVOL" | "CRISIS_HIGHVOL";

export interface OnlineHmmRegimeResult {
  dominantState: HmmRegimeState;
  probabilities: {
    trendExpansion: number;
    meanRevertLowVol: number;
    crisisHighVol: number;
  };
  entropy: number; // Normalized Shannon entropy in [0, 1] (lower = higher regime certainty)
  transitionConfidence: number; // 1 - entropy
}

/**
 * 3-State Causal Forward-Filtered Hidden Markov Model (Online Baum-Welch / Hamilton Filter).
 * Uses strictly forward filtering pi_t(k) = P(S_t = k | O_{1:t}) over causal bars [0..t]
 * (zero Viterbi look-ahead bias).
 */
export function filterOnlineRegimeHmm(bars: OhlcBarLike[]): OnlineHmmRegimeResult {
  const n = bars.length;
  if (n < 12) {
    return {
      dominantState: "MEAN_REVERT_LOWVOL",
      probabilities: { trendExpansion: 0.33, meanRevertLowVol: 0.50, crisisHighVol: 0.17 },
      entropy: 0.9,
      transitionConfidence: 0.1,
    };
  }

  // Transition matrix A[i][j] = P(S_t = j | S_{t-1} = i)
  // State 0: TREND_EXPANSION, State 1: MEAN_REVERT_LOWVOL, State 2: CRISIS_HIGHVOL
  const A = [
    [0.86, 0.10, 0.04],
    [0.11, 0.85, 0.04],
    [0.10, 0.12, 0.78],
  ];

  // Estimate causal baseline scale on trailing window (up to 60 bars)
  const startIdx = Math.max(6, n - 48);
  const ranges: number[] = [];
  for (let i = 1; i < n; i++) {
    const prevC = Math.max(1e-12, bars[i - 1]!.close);
    ranges.push(Math.abs(bars[i]!.high - bars[i]!.low) / prevC);
  }
  const sortedRanges = [...ranges].sort((a, b) => a - b);
  const medRange = Math.max(1e-6, sortedRanges[Math.floor(sortedRanges.length / 2)] ?? 0.005);

  let pi = [0.35, 0.50, 0.15];

  for (let t = startIdx; t < n; t++) {
    const prevC = Math.max(1e-12, bars[t - 1]!.close);
    const curC = Math.max(1e-12, bars[t]!.close);
    const barRange = Math.abs(bars[t]!.high - bars[t]!.low) / prevC;
    const volRatio = barRange / medRange;

    // 6-bar causal Kaufman Efficiency Ratio
    const erWin = Math.min(8, t);
    const netMove = Math.abs(curC - bars[t - erWin]!.close);
    let pathMove = 0;
    for (let k = t - erWin + 1; k <= t; k++) {
      pathMove += Math.abs(bars[k]!.close - bars[k - 1]!.close);
    }
    const er = pathMove > 1e-12 ? netMove / pathMove : 0;

    // Student-t / Gaussian emission likelihoods for the 3 latent states:
    // 0) Trend Expansion: high ER (~0.55), moderate volRatio (~1.15)
    // 1) Mean-Revert / Chop: low ER (~0.18), compressed volRatio (~0.85)
    // 2) Crisis / High-Vol Shock: extreme volRatio (>= 2.1)
    const lTrend = Math.exp(-(((er - 0.58) / 0.25) ** 2) - (((volRatio - 1.15) / 0.75) ** 2));
    const lMeanRev = Math.exp(-(((er - 0.18) / 0.22) ** 2) - (((volRatio - 0.85) / 0.55) ** 2));
    const lCrisis = Math.exp(-(((Math.min(4.0, volRatio) - 2.35) / 0.85) ** 2));

    const emissions = [
      Math.max(1e-6, lTrend),
      Math.max(1e-6, lMeanRev),
      Math.max(1e-6, lCrisis),
    ];

    const pred = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      pred[j] =
        (pi[0]! * A[0]![j]! + pi[1]! * A[1]![j]! + pi[2]! * A[2]![j]!) *
        emissions[j]!;
    }
    const norm = pred[0]! + pred[1]! + pred[2]!;
    if (norm > 0) {
      pi = [pred[0]! / norm, pred[1]! / norm, pred[2]! / norm];
    }
  }

  const [pTrend, pMeanRev, pCrisis] = pi;
  let dominantState: HmmRegimeState = "MEAN_REVERT_LOWVOL";
  if (pCrisis! >= pTrend! && pCrisis! >= pMeanRev! && pCrisis! >= 0.42) {
    dominantState = "CRISIS_HIGHVOL";
  } else if (pTrend! >= pMeanRev!) {
    dominantState = "TREND_EXPANSION";
  }

  const ln3 = Math.log(3);
  let rawEntropy = 0;
  for (const p of pi) {
    if (p > 1e-9) rawEntropy -= p * Math.log(p);
  }
  const entropy = Number(Math.min(1, Math.max(0, rawEntropy / ln3)).toFixed(3));

  return {
    dominantState,
    probabilities: {
      trendExpansion: Number(pTrend!.toFixed(3)),
      meanRevertLowVol: Number(pMeanRev!.toFixed(3)),
      crisisHighVol: Number(pCrisis!.toFixed(3)),
    },
    entropy,
    transitionConfidence: Number((1 - entropy).toFixed(3)),
  };
}

export interface CusumFilterResult {
  latestBreak: "BULL_BREAK" | "BEAR_BREAK" | "NONE";
  barsSinceLastBreak: number;
  eventIndices: number[];
  cusumPos: number;
  cusumNeg: number;
  adaptiveThreshold: number;
}

/**
 * Marcos López de Prado (2018) Symmetric CUSUM Structural-Break Filter.
 * Detects statistically significant cumulative directional departures exceeding `thresholdVolMult * sigma_t`.
 */
export function applySymmetricCusumFilter(
  bars: OhlcBarLike[],
  thresholdVolMult = 1.15,
): CusumFilterResult {
  const n = bars.length;
  if (n < 6) {
    return {
      latestBreak: "NONE",
      barsSinceLastBreak: n,
      eventIndices: [],
      cusumPos: 0,
      cusumNeg: 0,
      adaptiveThreshold: 0.01,
    };
  }

  const yz = computeYangZhangVolatility(bars, Math.min(20, n - 1));
  const h = Math.max(1e-5, yz.dailyVol * Math.max(0.3, thresholdVolMult));

  let sPos = 0;
  let sNeg = 0;
  let latestBreak: CusumFilterResult["latestBreak"] = "NONE";
  let lastBreakIdx = -1;
  const eventIndices: number[] = [];

  for (let i = 1; i < n; i++) {
    const prevC = Math.max(1e-12, bars[i - 1]!.close);
    const curC = Math.max(1e-12, bars[i]!.close);
    const r = Math.log(curC / prevC);

    sPos = Math.max(0, sPos + r);
    sNeg = Math.min(0, sNeg + r);

    if (sPos >= h) {
      sPos = 0;
      latestBreak = "BULL_BREAK";
      lastBreakIdx = i;
      eventIndices.push(i);
    } else if (sNeg <= -h) {
      sNeg = 0;
      latestBreak = "BEAR_BREAK";
      lastBreakIdx = i;
      eventIndices.push(i);
    }
  }

  return {
    latestBreak,
    barsSinceLastBreak: lastBreakIdx >= 0 ? n - 1 - lastBreakIdx : n,
    eventIndices,
    cusumPos: Number(sPos.toFixed(6)),
    cusumNeg: Number(sNeg.toFixed(6)),
    adaptiveThreshold: Number(h.toFixed(6)),
  };
}
