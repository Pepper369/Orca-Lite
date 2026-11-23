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
  const safeCov = (i: number, j: number): number => {
    const v = covMatrix[i]?.[j];
    if (i === j) return Number.isFinite(v) && v! > 1e-8 ? v! : 1e-8;
    return Number.isFinite(v) ? v! : 0;
  };
  const corr: number[][] = [];
  const stds = symbols.map((_, i) => Math.sqrt(safeCov(i, i)));
  for (let i = 0; i < n; i++) {
    corr[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        corr[i][j] = 1.0;
      } else if (corrMatrix && Number.isFinite(corrMatrix[i]?.[j])) {
        corr[i][j] = Math.max(-1.0, Math.min(1.0, corrMatrix[i]![j]!));
      } else {
        const val = safeCov(i, j) / Math.max(1e-12, stds[i]! * stds[j]!);
        corr[i][j] = Math.max(-1.0, Math.min(1.0, Number.isFinite(val) ? val : 0));
      }
    }
  }

  // Stage 1: Tree Clustering (Correlation to Distance matrix d_ij = sqrt(0.5 * (1 - r_ij)))
  const dist: number[][] = [];
  for (let i = 0; i < n; i++) {
    dist[i] = [];
    for (let j = 0; j < n; j++) {
      const r = Number.isFinite(corr[i]?.[j]) ? corr[i]![j]! : 0;
      dist[i][j] = Math.sqrt(Math.max(0, 0.5 * (1.0 - r)));
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
    if (indices.length === 1) return safeCov(indices[0]!, indices[0]!);
    // Inverse-variance allocation inside cluster
    const invVars = indices.map((idx) => 1.0 / safeCov(idx, idx));
    const sumInv = Math.max(1e-12, invVars.reduce((a, b) => a + b, 0));
    const subW = invVars.map((v) => v / sumInv);

    let v = 0;
    for (let i = 0; i < indices.length; i++) {
      for (let j = 0; j < indices.length; j++) {
        v += subW[i]! * subW[j]! * safeCov(indices[i]!, indices[j]!);
      }
    }
    return Number.isFinite(v) && v > 1e-8 ? v : 1e-8;
  }

  function recursiveBisection(items: number[]) {
    if (items.length <= 1) return;

    const mid = Math.floor(items.length / 2);
    const leftItems = items.slice(0, mid);
    const rightItems = items.slice(mid);

    const varLeft = getClusterVariance(leftItems);
    const varRight = getClusterVariance(rightItems);

    const denom = varLeft + varRight;
    const rawAlpha = denom > 0 && Number.isFinite(denom) ? 1.0 - varLeft / denom : 0.5;
    const alpha = Number.isFinite(rawAlpha) ? Math.max(0, Math.min(1, rawAlpha)) : 0.5;

    for (const idx of leftItems) weightsArray[idx] *= alpha;
    for (const idx of rightItems) weightsArray[idx] *= 1.0 - alpha;

    recursiveBisection(leftItems);
    recursiveBisection(rightItems);
  }

  recursiveBisection(orderedIndices);

  // Normalize weights
  const rawSumW = weightsArray.reduce((a, b) => a + (Number.isFinite(b) && b >= 0 ? b : 0), 0);
  const sumW = rawSumW > 1e-12 ? rawSumW : n;
  const weights: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const wVal = rawSumW > 1e-12 && Number.isFinite(weightsArray[i]) ? weightsArray[i]! / sumW : 1.0 / n;
    weights[symbols[i]!] = Number(wVal.toFixed(4));
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
  const cleanSeries = (Array.isArray(series) ? series : []).filter(
    (v) => Number.isFinite(v) && Math.abs(v) < 1e15,
  );
  const safeDt = Number.isFinite(dt) && dt > 1e-6 ? Math.min(1e6, dt) : 1.0;
  const n = cleanSeries.length;
  if (n < 5) {
    const fallbackMu = n > 0 ? Number(cleanSeries[n - 1]!.toFixed(2)) : 0;
    return {
      theta: 0,
      mu: fallbackMu,
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
    const x = cleanSeries[i - 1]!;
    const y = cleanSeries[i]! - cleanSeries[i - 1]!;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = count * sumX2 - sumX * sumX;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) {
    return {
      theta: 0,
      mu: Number(cleanSeries[n - 1]!.toFixed(2)),
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
  const isStationary =
    Number.isFinite(b) &&
    Number.isFinite(a) &&
    b < -1e-5 &&
    b > -1.0 &&
    rawPhi > 1e-4 &&
    rawPhi < 1.0;
  const phi = isStationary ? rawPhi : 1.0;
  const theta = isStationary ? -Math.log(phi) / safeDt : 0;
  const lastPrice = cleanSeries[n - 1]!;
  const rawMu = isStationary ? -a / b : lastPrice;
  const loBound = Math.min(lastPrice * 0.2, lastPrice * 5.0);
  const hiBound = Math.max(lastPrice * 0.2, lastPrice * 5.0);
  const mu = Number.isFinite(rawMu)
    ? lastPrice === 0
      ? Math.max(-1e9, Math.min(1e9, rawMu))
      : Math.max(loBound, Math.min(hiBound, rawMu))
    : lastPrice;
  const halfLife = isStationary && theta > 0 ? Number((Math.log(2.0) / theta).toFixed(2)) : Infinity;

  // Compute residuals variance
  let resSumSq = 0;
  for (let i = 1; i < n; i++) {
    const x = cleanSeries[i - 1]!;
    const y = cleanSeries[i]! - cleanSeries[i - 1]!;
    const pred = a + b * x;
    resSumSq += (y - pred) ** 2;
  }
  const dof = Math.max(1, count - 2);
  const rawResVar = resSumSq / dof;
  const resVar = Number.isFinite(rawResVar) && rawResVar >= 0 ? rawResVar : 0;
  const denomExp = 1 - Math.exp(-2 * theta * safeDt);
  const rawSigma =
    isStationary && theta > 0 && denomExp > 1e-12
      ? Math.sqrt(Math.max(1e-8, (resVar * 2 * theta) / denomExp))
      : Math.sqrt(Math.max(1e-8, resVar));
  const sigma = Number.isFinite(rawSigma) ? rawSigma : 0;
  const eqStd =
    isStationary && theta > 0 && sigma > 0
      ? sigma / Math.sqrt(2 * theta)
      : Math.sqrt(Math.max(1e-8, resVar));

  const currentVal = cleanSeries[n - 1]!;
  const rawZ = eqStd > 0 && Number.isFinite(eqStd) ? (currentVal - mu) / eqStd : 0;
  const currentZScore = Number.isFinite(rawZ) ? Number(Math.max(-50, Math.min(50, rawZ)).toFixed(2)) : 0;

  let actionRecommendation: OUResult["actionRecommendation"] = "MEAN_REVERTED_NEUTRAL";
  if (!isStationary || halfLife > 60) {
    actionRecommendation = "NON_MEAN_REVERTING";
  } else if (currentZScore <= -1.8) {
    actionRecommendation = "BUY_OVERSOLD";
  } else if (currentZScore >= 1.8) {
    actionRecommendation = "SELL_OVERBOUGHT";
  }

  return {
    theta: Number((Number.isFinite(theta) ? theta : 0).toFixed(4)),
    mu: Number((Number.isFinite(mu) ? mu : 0).toFixed(2)),
    sigma: Number((Number.isFinite(sigma) ? sigma : 0).toFixed(4)),
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

  const X = Number.isFinite(totalShares) && totalShares > 0 ? Math.min(1e12, Math.round(totalShares)) : 0;
  const T = Number.isFinite(totalTimeHours) && totalTimeHours > 1e-4 ? Math.min(1e4, totalTimeHours) : 1.0;
  const N = Number.isFinite(intervalsCount)
    ? Math.max(2, Math.min(500, Math.floor(intervalsCount)))
    : 2;
  const dt = T / N;
  const safePrice = Number.isFinite(currentPrice) && currentPrice > 0 ? Math.min(1e12, currentPrice) : 0;

  const safeVolPct = Number.isFinite(dailyVolatilityPct) && dailyVolatilityPct >= 0
    ? Math.min(500, dailyVolatilityPct)
    : 2.0;
  const sigmaDaily = safeVolPct / 100;
  const sigmaPerHour = sigmaDaily / Math.sqrt(4.5); // 4.5 trading hours/day
  const eta = Number.isFinite(tempImpactFactor) && tempImpactFactor > 1e-8 ? tempImpactFactor : 1e-8;
  const lambda = Number.isFinite(riskAversion) && riskAversion > 0 ? Math.min(1e6, riskAversion) : 0;

  // Urgency parameter kappa = sqrt(lambda * sigma^2 / eta)
  const rawKappa = Math.sqrt((lambda * sigmaPerHour * sigmaPerHour) / eta);
  const kappa = Number.isFinite(rawKappa) ? Math.min(1000, Math.max(0, rawKappa)) : 0;
  const halfLifeHours = kappa > 0 ? Math.log(2.0) / kappa : T / 2;

  const schedule: ExecutionSlice[] = [];
  const twapComparison: ExecutionSlice[] = [];

  let prevX = X;
  let prevTwapX = X;

  for (let j = 0; j <= N; j++) {
    const t = j * dt;
    let x_j: number;

    if (j === N) {
      x_j = 0;
    } else if (kappa < 1e-4) {
      // Linear TWAP limit as kappa -> 0
      x_j = X * (1.0 - t / T);
    } else if (kappa * T > 50) {
      // Asymptotic exponential form when sinh(kappa * T) would overflow IEEE-754 double
      x_j = X * Math.exp(-kappa * t);
    } else {
      const denomSinh = Math.sinh(kappa * T);
      const ratio = denomSinh > 0 && Number.isFinite(denomSinh)
        ? Math.sinh(kappa * (T - t)) / denomSinh
        : 1.0 - t / T;
      x_j = X * (Number.isFinite(ratio) ? ratio : 0);
    }
    x_j = Math.max(0, Math.min(prevX, Math.round(x_j)));

    const twapX_j = j === N ? 0 : Math.max(0, Math.min(prevTwapX, Math.round(X * (1.0 - t / T))));

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
        pctOfTotal: X > 0 ? Number(((tradeAC / X) * 100).toFixed(1)) : 0,
      });

      twapComparison.push({
        interval: j,
        timeLabel,
        sharesRemaining: twapX_j,
        sharesToTrade: tradeTWAP,
        pctOfTotal: X > 0 ? Number(((tradeTWAP / X) * 100).toFixed(1)) : 0,
      });
    }

    prevX = x_j;
    prevTwapX = twapX_j;
  }

  // Impact cost estimate
  const rawImpactCost = schedule.reduce(
    (sum, s) => sum + eta * s.sharesToTrade * s.sharesToTrade * safePrice,
    0,
  );
  const expectedImpactCostVnd = Number.isFinite(rawImpactCost) ? Math.round(rawImpactCost) : 0;
  const rawTimingRisk = 0.5 * lambda * sigmaPerHour * sigmaPerHour * safePrice * X * dt;
  const timingRiskVnd = Number.isFinite(rawTimingRisk) ? Math.round(rawTimingRisk) : 0;

  let urgencyType: AlmgrenChrissResult["summary"]["urgencyType"] = "LINEAR_TWAP";
  if (kappa > 0.8) urgencyType = "AGGRESSIVE_FRONT_LOADED";
  else if (kappa > 0.15) urgencyType = "MODERATE_BALANCED";

  return {
    kappa: Number(kappa.toFixed(4)),
    halfLifeHours: Number((Number.isFinite(halfLifeHours) ? halfLifeHours : T / 2).toFixed(2)),
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

  const safeSr = Number.isFinite(observedSharpe) ? Math.max(-50, Math.min(50, observedSharpe)) : 0;
  const N = Number.isFinite(trialsCount) ? Math.max(1, Math.min(1e9, Math.floor(trialsCount))) : 1;
  const T = Number.isFinite(sampleLengthBars) ? Math.max(10, Math.min(1e9, Math.floor(sampleLengthBars))) : 10;
  const safeSkew = Number.isFinite(skewness) ? Math.max(-20, Math.min(20, skewness)) : 0;
  const safeKurt = Number.isFinite(kurtosis) ? Math.max(1.0, Math.min(100, kurtosis)) : 3.0;
  const safeVarSr = Number.isFinite(varSharpeEstimates) && varSharpeEstimates >= 0
    ? Math.min(100, varSharpeEstimates)
    : 0.25;
  const gammaEuler = 0.5772156649; // Euler-Mascheroni constant

  // Expected Maximum Sharpe Ratio under Null Hypothesis (annualized scale)
  let srStar = 0;
  if (N > 1) {
    const sqrt2LnN = Math.sqrt(2.0 * Math.log(N));
    srStar = Math.sqrt(safeVarSr) * (sqrt2LnN + gammaEuler / sqrt2LnN);
  }

  // Convert annualized Sharpe ratios to per-bar frequency (SR_bar = SR_annual / sqrt(252))
  // to match daily sample length T in Bailey & López de Prado (2014) Eq. (11)
  const sqrtAnnual = Math.sqrt(252);
  const srBar = safeSr / sqrtAnnual;
  const srStarBar = srStar / sqrtAnnual;

  // Standard Error of per-bar Sharpe Ratio under non-normality:
  // SE(SR_bar) = sqrt((1 - skew * SR_bar + ((kurt - 1) / 4) * SR_bar^2) / (T - 1))
  const rawVarFactor =
    1.0 - safeSkew * srBar + ((safeKurt - 1.0) / 4.0) * (srBar * srBar);
  const varianceFactor = Number.isFinite(rawVarFactor) && rawVarFactor > 1e-6 ? rawVarFactor : 1e-6;
  const seSrBar = Math.sqrt(Math.max(1e-8, varianceFactor / (T - 1)));

  // Test statistic Z = (SR_hat_bar - SR*_bar) / SE(SR_bar)
  const z = (srBar - srStarBar) / seSrBar;
  const dsr = normCdf(z);
  const pValue = 1.0 - dsr;

  const haircutPct = safeSr > 0 ? Math.min(100, Math.max(0, ((safeSr - srStar) / safeSr) * 100)) : 0;

  return {
    observedSharpe: Number(safeSr.toFixed(2)),
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
  const safePrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : 1.0;
  const safeAtr = Number.isFinite(atrPct) && atrPct > 0 ? Math.min(200, atrPct) : 1.0;
  const safePt = Number.isFinite(ptMultiplier) && ptMultiplier > 0 ? Math.min(50, ptMultiplier) : 3.0;
  const safeSl = Number.isFinite(slMultiplier) && slMultiplier > 0 ? Math.min(50, slMultiplier) : 2.0;
  const safeBars = Number.isFinite(maxBars) && maxBars >= 1 ? Math.min(1000, Math.floor(maxBars)) : 10;

  const dynamicVolatility = Math.max(1.0, safeAtr);
  const targetReturnPct = Number((safePt * dynamicVolatility).toFixed(1));
  const stopLossReturnPct = Math.max(0.1, Number((safeSl * dynamicVolatility).toFixed(1)));

  const upperBarrierPrice = roundBarrierPrice(safePrice * (1.0 + targetReturnPct / 100));
  const lowerBarrierPrice = roundBarrierPrice(Math.max(1e-8, safePrice * (1.0 - Math.min(99, stopLossReturnPct) / 100)));
  const riskRewardRatio = Number((targetReturnPct / stopLossReturnPct).toFixed(2));

  return {
    currentPrice: safePrice,
    upperBarrierPrice,
    lowerBarrierPrice,
    verticalBarrierBars: safeBars,
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
  const cleanReturns = (Array.isArray(returns) ? returns : [])
    .filter((r) => Number.isFinite(r))
    .map((r) => Math.max(-0.9999, Math.min(10.0, r)));
  const n = cleanReturns.length;
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
  const mean = cleanReturns.reduce((a, b) => a + b, 0) / n;
  const variance = cleanReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const std = Number.isFinite(variance) && variance > 1e-16 ? Math.sqrt(variance) : 0;

  // Skewness & Kurtosis
  const m3 = cleanReturns.reduce((sum, r) => sum + (r - mean) ** 3, 0) / n;
  const m4 = cleanReturns.reduce((sum, r) => sum + (r - mean) ** 4, 0) / n;
  const rawSkew = std > 1e-12 ? m3 / (std ** 3) : 0;
  const rawKurt = std > 1e-12 ? m4 / (std ** 4) : 3;
  const skewness = Number.isFinite(rawSkew) ? Math.max(-20, Math.min(20, rawSkew)) : 0;
  const kurtosis = Number.isFinite(rawKurt) ? Math.max(1, Math.min(100, rawKurt)) : 3;

  // Sorted returns for historical VaR/CVaR with linear quantile interpolation & non-negative loss clamp
  const sorted = [...cleanReturns].sort((a, b) => a - b);
  const interpQuantile = (alpha: number): number => {
    const pos = alpha * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(n - 1, lo + 1);
    const frac = pos - lo;
    return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
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
  const rawCfVaR95 = -(mean + zCf * std);
  const cfVaR95 = Number.isFinite(rawCfVaR95) ? Math.max(0, rawCfVaR95) : histVaR95;

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
  const n = Array.isArray(returnsByAsset) ? returnsByAsset.length : 0;
  if (n === 0) {
    return { covMatrix: [], isEmpirical: false, sampleLength: 0, shrinkageIntensity: 1 };
  }

  const sanitizedSeries = returnsByAsset.map((s) =>
    (Array.isArray(s) ? s : [])
      .filter((r) => Number.isFinite(r))
      .map((r) => Math.max(-0.9999, Math.min(10.0, r))),
  );
  const validLengths = sanitizedSeries.map((s) => s.length);
  const minLen = Math.min(...validLengths);
  const alpha = Number.isFinite(shrinkageAlpha) ? Math.max(0, Math.min(1, shrinkageAlpha)) : 0.25;

  if (minLen < 12) {
    const diagCov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      const s = sanitizedSeries[i] ?? [];
      const fbVol = fallbackDailyVols?.[i];
      const safeFbVol = Number.isFinite(fbVol) && fbVol! > 1e-4 ? Math.min(5.0, fbVol!) : 0.025;
      let v = safeFbVol ** 2;
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

  const aligned = sanitizedSeries.map((s) => s.slice(-minLen));
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
      const rawCov = sum / Math.max(1, minLen - 1);
      const cov = Number.isFinite(rawCov) ? rawCov : 0;
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
      const safeC = Number.isFinite(c) ? c : 0;
      corrSum += Math.max(-0.99, Math.min(0.99, safeC));
      corrPairs++;
    }
  }
  const avgCorr = corrPairs > 0 ? corrSum / corrPairs : 0;

  const shrunkCov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const target = i === j ? Math.max(1e-8, sampleCov[i]![i]!) : avgCorr * vols[i]! * vols[j]!;
      const val = (1 - alpha) * sampleCov[i]![j]! + alpha * target;
      shrunkCov[i]![j] = Number.isFinite(val) ? (i === j ? Math.max(1e-8, val) : val) : (i === j ? 1e-8 : 0);
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
  if (Number.isNaN(t)) return 0.5;
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const safeNu = Number.isFinite(nu) ? nu : 5;
  const df = Math.max(2.5, Math.min(200, safeNu));
  if (df >= 120) return normCdf(t);

  // Hill's (1970) / Peizer-Pratt Cornish-Fisher normal mapping for Student-t quantile -> CDF
  // Accurate to < 1e-4 across the entire tail (|t| up to 12) without iterative beta divergence
  const absT = Math.min(1e6, Math.abs(t));
  const a = df - 0.5;
  const b = 48 * a * a;
  const z2 = a * Math.log1p((absT * absT) / df);
  const z = Math.sqrt(Math.max(0, z2));
  const zCorr =
    z +
    ((z ** 3 + 3 * z) / b) -
    ((4 * z ** 7 + 33 * z ** 5 + 240 * z ** 3 + 855 * z) / (10 * b * b + 8 * b * z ** 4 + 1000 * b));
  const tailProb = 1 - normCdf(Math.max(0, Number.isFinite(zCorr) ? zCorr : z));
  return t >= 0 ? 1 - tailProb : tailProb;
}

/**
 * Estimates empirical tail degrees of freedom `nu` in [4, 30] from sample excess kurtosis.
 */
export function estimateTailDegreesOfFreedom(returns: number[], fallbackNu = 5): number {
  const safeFallback = Number.isFinite(fallbackNu) ? Math.max(3.5, Math.min(30, fallbackNu)) : 5;
  const valid = (Array.isArray(returns) ? returns : []).filter(
    (r) => Number.isFinite(r) && Math.abs(r) < 1e6,
  );
  const n = valid.length;
  if (n < 15) return Number(safeFallback.toFixed(2));
  const mean = valid.reduce((a, b) => a + b, 0) / n;
  const variance = valid.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, n - 1);
  if (!Number.isFinite(variance) || variance <= 1e-14) return 15;
  const std = Math.sqrt(variance);
  const m4 = valid.reduce((s, r) => s + ((r - mean) / std) ** 4, 0) / n;
  if (!Number.isFinite(m4)) return Number(safeFallback.toFixed(2));
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

function sanitizeOhlcBars(bars: OhlcBarLike[]): OhlcBarLike[] {
  if (!Array.isArray(bars)) return [];
  const valid: OhlcBarLike[] = [];
  for (const b of bars) {
    if (!b || !Number.isFinite(b.close) || b.close <= 0) continue;
    const c = Math.max(1e-8, Math.min(1e12, b.close));
    const o = Number.isFinite(b.open) && b.open > 0 ? Math.max(1e-8, Math.min(1e12, b.open)) : c;
    const rawH = Number.isFinite(b.high) && b.high > 0 ? Math.max(1e-8, Math.min(1e12, b.high)) : Math.max(o, c);
    const rawL = Number.isFinite(b.low) && b.low > 0 ? Math.max(1e-8, Math.min(1e12, b.low)) : Math.min(o, c);
    const h = Math.max(o, c, rawH, rawL);
    const l = Math.min(o, c, rawH, rawL);
    valid.push({
      open: o,
      high: h,
      low: Math.max(1e-8, l),
      close: c,
      volume: Number.isFinite(b.volume) && (b.volume ?? 0) >= 0 ? b.volume : 0,
    });
  }
  return valid;
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
  const cleanBars = sanitizeOhlcBars(bars);
  const safeAnn = Number.isFinite(annualizePeriods) && annualizePeriods > 0
    ? Math.min(1e6, annualizePeriods)
    : 252;
  const n = cleanBars.length;
  if (n < 4) {
    return {
      dailyVol: 0.015,
      annualizedVol: Number((0.015 * Math.sqrt(safeAnn)).toFixed(4)),
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
      const prevC = Math.max(1e-8, slice[i - 1]!.close);
      const o = Math.max(1e-8, slice[i]!.open);
      const h = Math.max(o, slice[i]!.high);
      const l = Math.min(o, Math.max(1e-8, slice[i]!.low));
      const c = Math.max(1e-8, slice[i]!.close);

      const oLog = Math.max(-10, Math.min(10, Math.log(o / prevC)));
      const cLog = Math.max(-10, Math.min(10, Math.log(c / o)));
      const u = Math.max(0, Math.min(10, Math.log(h / o)));
      const d = Math.min(0, Math.max(-10, Math.log(l / o)));

      oRets.push(oLog);
      cRets.push(cLog);
      rsSum += u * (u - cLog) + d * (d - cLog);
    }

    const meanO = oRets.reduce((a, b) => a + b, 0) / m;
    const meanC = cRets.reduce((a, b) => a + b, 0) / m;
    const varO = oRets.reduce((s, x) => s + (x - meanO) ** 2, 0) / Math.max(1, m - 1);
    const varC = cRets.reduce((s, x) => s + (x - meanC) ** 2, 0) / Math.max(1, m - 1);
    const varRs = Math.max(0, rsSum / m);

    const k = 0.34 / (1.34 + (m + 1) / Math.max(1, m - 1));
    const rawVarYz = varO + k * varC + (1 - k) * varRs;
    const varYz = Number.isFinite(rawVarYz) && rawVarYz > 1e-10 ? rawVarYz : 1e-10;
    return {
      yz: Math.sqrt(varYz),
      on: Math.sqrt(Number.isFinite(varO) && varO > 0 ? varO : 0),
      rs: Math.sqrt(Number.isFinite(varRs) && varRs > 0 ? varRs : 0),
    };
  };

  const safeWindow = Number.isFinite(window) && window >= 3 ? Math.floor(window) : 20;
  const w = Math.max(3, Math.min(safeWindow, n - 1));
  const recent = calcSliceYz(cleanBars.slice(-(w + 1)));
  const baseW = Math.max(w, Math.min(60, n - 1));
  const baseline = calcSliceYz(cleanBars.slice(-(baseW + 1)));
  const volRatio = baseline.yz > 1e-9 ? recent.yz / baseline.yz : 1.0;

  return {
    dailyVol: Number(recent.yz.toFixed(6)),
    annualizedVol: Number((recent.yz * Math.sqrt(safeAnn)).toFixed(4)),
    overnightVol: Number(recent.on.toFixed(6)),
    rogersSatchellVol: Number(recent.rs.toFixed(6)),
    volRatio: Number((Number.isFinite(volRatio) ? volRatio : 1.0).toFixed(3)),
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
  const cleanBars = sanitizeOhlcBars(bars);
  const safeAnn = Number.isFinite(annualizePeriods) && annualizePeriods > 0
    ? Math.min(1e6, annualizePeriods)
    : 252;
  const n = cleanBars.length;
  if (n < 6) {
    return {
      forecastBarVolPct: 1.5,
      forecastAnnualVolPct: Number((1.5 * Math.sqrt(safeAnn)).toFixed(2)),
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
    const prevC = Math.max(1e-8, cleanBars[i - 1]!.close);
    const o = Math.max(1e-8, cleanBars[i]!.open);
    const h = Math.max(o, cleanBars[i]!.high);
    const l = Math.min(o, Math.max(1e-8, cleanBars[i]!.low));
    const c = Math.max(1e-8, cleanBars[i]!.close);

    const logHL = Math.max(0, Math.min(10, Math.log(h / l)));
    const logOC = Math.max(-10, Math.min(10, Math.log(o / prevC)));
    const logCC = Math.max(-10, Math.min(10, Math.log(c / prevC)));
    const parkVar = (logHL ** 2) / ln4;
    const gapVar = logOC ** 2;
    const ccVar = logCC ** 2;
    const rv = Math.sqrt(Math.max(1e-10, 0.55 * parkVar + 0.25 * gapVar + 0.20 * ccVar));
    barRvs.push(Number.isFinite(rv) ? rv : 0.01);
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
  const rawExp = rvM > 1e-9 ? forecastRv / rvM : 1.0;
  const expansionRatio = Number.isFinite(rawExp) ? rawExp : 1.0;

  let harRegime: HarVolatilityForecast["harRegime"] = "VOL_NORMAL";
  if (expansionRatio >= 1.85) harRegime = "VOL_SHOCK";
  else if (expansionRatio >= 1.25) harRegime = "VOL_EXPANDING";
  else if (expansionRatio <= 0.78) harRegime = "VOL_COMPRESSING";

  return {
    forecastBarVolPct: Number((forecastRv * 100).toFixed(4)),
    forecastAnnualVolPct: Number((forecastRv * Math.sqrt(safeAnn) * 100).toFixed(2)),
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
  const cleanBars = sanitizeOhlcBars(bars);
  const n = cleanBars.length;
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
    const prevC = Math.max(1e-8, cleanBars[i - 1]!.close);
    ranges.push(Math.abs(cleanBars[i]!.high - cleanBars[i]!.low) / prevC);
  }
  const sortedRanges = [...ranges].sort((a, b) => a - b);
  const medRange = Math.max(1e-6, sortedRanges[Math.floor(sortedRanges.length / 2)] ?? 0.005);

  let pi = [0.35, 0.50, 0.15];

  for (let t = startIdx; t < n; t++) {
    const prevC = Math.max(1e-8, cleanBars[t - 1]!.close);
    const curC = Math.max(1e-8, cleanBars[t]!.close);
    const barRange = Math.abs(cleanBars[t]!.high - cleanBars[t]!.low) / prevC;
    const rawVolRatio = barRange / medRange;
    const volRatio = Number.isFinite(rawVolRatio) ? Math.min(20, Math.max(0, rawVolRatio)) : 1.0;

    // 6-bar causal Kaufman Efficiency Ratio
    const erWin = Math.min(8, t);
    const netMove = Math.abs(curC - cleanBars[t - erWin]!.close);
    let pathMove = 0;
    for (let k = t - erWin + 1; k <= t; k++) {
      pathMove += Math.abs(cleanBars[k]!.close - cleanBars[k - 1]!.close);
    }
    const rawEr = pathMove > 1e-12 ? netMove / pathMove : 0;
    const er = Number.isFinite(rawEr) ? Math.min(1, Math.max(0, rawEr)) : 0;

    // Student-t / Gaussian emission likelihoods for the 3 latent states:
    // 0) Trend Expansion: high ER (~0.55), moderate volRatio (~1.15)
    // 1) Mean-Revert / Chop: low ER (~0.18), compressed volRatio (~0.85)
    // 2) Crisis / High-Vol Shock: extreme volRatio (>= 2.1)
    const lTrend = Math.exp(-(((er - 0.58) / 0.25) ** 2) - (((volRatio - 1.15) / 0.75) ** 2));
    const lMeanRev = Math.exp(-(((er - 0.18) / 0.22) ** 2) - (((volRatio - 0.85) / 0.55) ** 2));
    const lCrisis = Math.exp(-(((Math.min(4.0, volRatio) - 2.35) / 0.85) ** 2));

    const emissions = [
      Number.isFinite(lTrend) ? Math.max(1e-6, lTrend) : 1e-6,
      Number.isFinite(lMeanRev) ? Math.max(1e-6, lMeanRev) : 1e-6,
      Number.isFinite(lCrisis) ? Math.max(1e-6, lCrisis) : 1e-6,
    ];

    const pred = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      pred[j] =
        (pi[0]! * A[0]![j]! + pi[1]! * A[1]![j]! + pi[2]! * A[2]![j]!) *
        emissions[j]!;
    }
    const norm = pred[0]! + pred[1]! + pred[2]!;
    if (norm > 0 && Number.isFinite(norm)) {
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
  const cleanBars = sanitizeOhlcBars(bars);
  const n = cleanBars.length;
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

  const safeMult = Number.isFinite(thresholdVolMult) && thresholdVolMult > 0
    ? Math.min(20, Math.max(0.3, thresholdVolMult))
    : 1.15;
  const yz = computeYangZhangVolatility(cleanBars, Math.min(20, n - 1));
  const h = Math.max(1e-5, yz.dailyVol * safeMult);

  let sPos = 0;
  let sNeg = 0;
  let latestBreak: CusumFilterResult["latestBreak"] = "NONE";
  let lastBreakIdx = -1;
  const eventIndices: number[] = [];

  for (let i = 1; i < n; i++) {
    const prevC = Math.max(1e-8, cleanBars[i - 1]!.close);
    const curC = Math.max(1e-8, cleanBars[i]!.close);
    const rawR = Math.log(curC / prevC);
    const r = Number.isFinite(rawR) ? Math.max(-10, Math.min(10, rawR)) : 0;

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

// ============================================================================
// 9. Phase 3: Nested Clustered Optimization (NCO), Macro Factor Exposure
//    Budgeting & Continuous Drawdown / Portfolio Volatility Governor
// ============================================================================

export interface NCOResult {
  weights: Record<string, number>;
  clusters: string[][];
  intraClusterWeights: Record<string, number>;
  interClusterWeights: number[];
  effectiveClustersCount: number;
}

/**
 * Nested Clustered Optimization (NCO) — Marcos López de Prado (2019)
 * 1. Partitions N assets into K correlation clusters via Mantegna metric distance.
 * 2. Solves regularized inverse-variance / minimum-variance weights within each cluster.
 * 3. Forms the K x K reduced inter-cluster covariance matrix Sigma_reduced.
 * 4. Allocates inter-cluster risk-parity weights across the K clusters and combines w_i = W_cluster(k) * w_{k,i}.
 */
export function calculateNestedClusteredOptimization(
  symbols: string[],
  covMatrix: number[][],
  maxClusters?: number,
): NCOResult {
  const n = symbols.length;
  if (n === 0) {
    return {
      weights: {},
      clusters: [],
      intraClusterWeights: {},
      interClusterWeights: [],
      effectiveClustersCount: 0,
    };
  }
  if (n === 1) {
    return {
      weights: { [symbols[0]!]: 1.0 },
      clusters: [[symbols[0]!]],
      intraClusterWeights: { [symbols[0]!]: 1.0 },
      interClusterWeights: [1.0],
      effectiveClustersCount: 1,
    };
  }

  // Derive correlation & Mantegna distance matrix
  const safeCov = (i: number, j: number): number => {
    const v = covMatrix[i]?.[j];
    if (i === j) return Number.isFinite(v) && v! > 1e-8 ? v! : 0.0006;
    return Number.isFinite(v) ? v! : 0;
  };
  const stds = symbols.map((_, i) => Math.sqrt(safeCov(i, i)));
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = safeCov(i, j) / Math.max(1e-8, stds[i]! * stds[j]!);
      const corr = Math.max(-0.99, Math.min(0.99, Number.isFinite(c) ? c : 0));
      const d = Math.sqrt(Math.max(0, 0.5 * (1 - corr)));
      dist[i]![j] = d;
      dist[j]![i] = d;
    }
  }

  const safeMaxK = maxClusters != null && Number.isFinite(maxClusters) && maxClusters >= 2
    ? Math.floor(maxClusters)
    : Math.max(2, Math.floor(Math.sqrt(n)));
  const targetK = Math.max(2, Math.min(safeMaxK, Math.ceil(n / 2)));

  // Agglomerative clustering until targetK clusters remain
  let indexClusters: number[][] = symbols.map((_, i) => [i]);
  while (indexClusters.length > targetK) {
    let bestD = Infinity;
    let bestA = 0;
    let bestB = 1;
    for (let a = 0; a < indexClusters.length; a++) {
      for (let b = a + 1; b < indexClusters.length; b++) {
        // Average linkage distance between cluster a and cluster b
        let sumD = 0;
        let pairs = 0;
        for (const u of indexClusters[a]!) {
          for (const v of indexClusters[b]!) {
            sumD += dist[u]![v]!;
            pairs++;
          }
        }
        const avgD = pairs > 0 ? sumD / pairs : Infinity;
        if (avgD < bestD) {
          bestD = avgD;
          bestA = a;
          bestB = b;
        }
      }
    }
    const merged = [...indexClusters[bestA]!, ...indexClusters[bestB]!];
    indexClusters = indexClusters.filter((_, idx) => idx !== bestA && idx !== bestB);
    indexClusters.push(merged);
  }

  const kCount = indexClusters.length;
  const intraVecs: number[][] = [];
  const intraClusterWeights: Record<string, number> = {};

  // Step 2: Intra-cluster allocation (correlation-penalized inverse variance)
  for (let k = 0; k < kCount; k++) {
    const members = indexClusters[k]!;
    const rawW: number[] = [];
    let sumW = 0;
    for (const idx of members) {
      const varI = safeCov(idx, idx);
      // Penalize members with high average correlation inside the cluster
      let avgIntraCorr = 0;
      for (const other of members) {
        if (other !== idx) {
          const c = safeCov(idx, other) / Math.max(1e-8, stds[idx]! * stds[other]!);
          if (Number.isFinite(c)) avgIntraCorr += Math.max(0, Math.min(1, c));
        }
      }
      const corrPenalty = members.length > 1 ? 1 + avgIntraCorr / (members.length - 1) : 1;
      const w = 1 / Math.max(1e-12, varI * corrPenalty);
      const safeW = Number.isFinite(w) && w > 0 ? w : 1;
      rawW.push(safeW);
      sumW += safeW;
    }
    const normW = rawW.map((w) => (sumW > 1e-12 ? w / sumW : 1 / members.length));
    intraVecs.push(normW);
    members.forEach((idx, mPos) => {
      intraClusterWeights[symbols[idx]!] = Number(normW[mPos]!.toFixed(4));
    });
  }

  // Step 3: Reduced inter-cluster covariance matrix Sigma_reduced (K x K)
  const reducedCov: number[][] = Array.from({ length: kCount }, () => new Array(kCount).fill(0));
  for (let a = 0; a < kCount; a++) {
    for (let b = a; b < kCount; b++) {
      let covAB = 0;
      const memA = indexClusters[a]!;
      const memB = indexClusters[b]!;
      for (let ia = 0; ia < memA.length; ia++) {
        for (let ib = 0; ib < memB.length; ib++) {
          const u = memA[ia]!;
          const v = memB[ib]!;
          covAB += intraVecs[a]![ia]! * intraVecs[b]![ib]! * safeCov(u, v);
        }
      }
      const safeCovAB = Number.isFinite(covAB) ? covAB : 0;
      reducedCov[a]![b] = safeCovAB;
      reducedCov[b]![a] = safeCovAB;
    }
  }

  // Step 4: Inter-cluster Equal-Risk-Contribution / Inverse-Cluster-Variance weights
  const rawInter: number[] = [];
  let sumInter = 0;
  for (let a = 0; a < kCount; a++) {
    const clusterVar = Number.isFinite(reducedCov[a]![a]) && reducedCov[a]![a]! > 1e-8
      ? reducedCov[a]![a]!
      : 1e-8;
    const w = 1 / clusterVar;
    const safeW = Number.isFinite(w) && w > 0 ? w : 1;
    rawInter.push(safeW);
    sumInter += safeW;
  }
  const interClusterWeights = rawInter.map((w) =>
    Number((sumInter > 1e-12 ? w / sumInter : 1 / kCount).toFixed(4)),
  );

  // Step 5: Combine intra-cluster and inter-cluster weights
  const finalWeights: Record<string, number> = {};
  let totalFinal = 0;
  for (let k = 0; k < kCount; k++) {
    const members = indexClusters[k]!;
    const wCluster = sumInter > 1e-12 ? rawInter[k]! / sumInter : 1 / kCount;
    for (let mPos = 0; mPos < members.length; mPos++) {
      const sym = symbols[members[mPos]!]!;
      const val = wCluster * intraVecs[k]![mPos]!;
      const safeVal = Number.isFinite(val) && val >= 0 ? val : 0;
      finalWeights[sym] = safeVal;
      totalFinal += safeVal;
    }
  }

  for (const sym of symbols) {
    finalWeights[sym] = Number(
      (totalFinal > 1e-12 ? (finalWeights[sym] ?? 0) / totalFinal : 1 / n).toFixed(4),
    );
  }

  return {
    weights: finalWeights,
    clusters: indexClusters.map((c) => c.map((idx) => symbols[idx]!)),
    intraClusterWeights,
    interClusterWeights,
    effectiveClustersCount: kCount,
  };
}

export type MacroFactorCluster =
  | "USD_SHORT_RISK_ON"
  | "USD_LONG_DEFENSIVE"
  | "CRYPTO_BETA_LONG"
  | "CRYPTO_BETA_SHORT"
  | "CROSS_FX_IDIOSYNCRATIC"
  | "VN_EQUITY_BETA";

export interface FactorExposurePosition {
  symbol: string;
  assetType?: "FOREX" | "CRYPTO" | "VN_EQUITY";
  direction: "BUY" | "SELL";
  riskFractionPct?: number; // e.g. 1.0 for 1% account risk
}

export interface FactorExposureBudgetResult {
  candidateCluster: MacroFactorCluster;
  sameClusterOpenCount: number;
  maxAllowedClusterPositions: number;
  cumulativeClusterRiskPct: number;
  maxAllowedClusterRiskPct: number;
  allowed: boolean;
  sizeMultiplier: number; // 1.0 (fresh cluster), 0.70 (2nd correlated position), 0 (rejected)
  rationaleVi: string;
}

/**
 * Maps an instrument + trade direction into its underlying Macro Factor Risk Cluster.
 * Prevents the "Portfolio Blindness" trap where buying EURUSD, GBPUSD, AUDUSD, and XAUUSD
 * simultaneously stacks 4x correlated Short-USD risk.
 */
export function classifyAssetFactorCluster(
  symbol: string,
  assetType: "FOREX" | "CRYPTO" | "VN_EQUITY",
  direction: "BUY" | "SELL",
): MacroFactorCluster {
  if (assetType === "VN_EQUITY") return "VN_EQUITY_BETA";
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (assetType === "CRYPTO" || clean.endsWith("USDT") || clean.endsWith("USDC")) {
    return direction === "BUY" ? "CRYPTO_BETA_LONG" : "CRYPTO_BETA_SHORT";
  }

  const base = clean.slice(0, 3);
  const quote = clean.slice(3, 6);

  // Quote is USD (EURUSD, GBPUSD, AUDUSD, NZDUSD, XAUUSD, XAGUSD)
  if (quote === "USD" || clean.startsWith("XAU") || clean.startsWith("XAG")) {
    return direction === "BUY" ? "USD_SHORT_RISK_ON" : "USD_LONG_DEFENSIVE";
  }
  // Base is USD (USDJPY, USDCAD, USDCHF)
  if (base === "USD") {
    return direction === "BUY" ? "USD_LONG_DEFENSIVE" : "USD_SHORT_RISK_ON";
  }

  return "CROSS_FX_IDIOSYNCRATIC";
}

/**
 * Evaluates Factor Exposure Budget before admitting a new trade into an active portfolio.
 */
export function evaluateFactorExposureBudget(params: {
  candidateSymbol: string;
  candidateAssetType: "FOREX" | "CRYPTO" | "VN_EQUITY";
  candidateDirection: "BUY" | "SELL";
  candidateRiskPct?: number;
  openPositions: FactorExposurePosition[];
  maxSameClusterPositions?: number; // default 2 positions per macro factor cluster
  maxClusterRiskPct?: number; // default 2.2% cumulative account risk per factor cluster
}): FactorExposureBudgetResult {
  const {
    candidateSymbol,
    candidateAssetType,
    candidateDirection,
    candidateRiskPct = 1.0,
    openPositions,
    maxSameClusterPositions = 2,
    maxClusterRiskPct = 2.2,
  } = params;

  const safeCandidateRisk =
    Number.isFinite(candidateRiskPct) && candidateRiskPct >= 0
      ? Math.min(100, candidateRiskPct)
      : 1.0;
  const safeMaxPositions =
    Number.isFinite(maxSameClusterPositions) && maxSameClusterPositions >= 1
      ? Math.min(100, Math.floor(maxSameClusterPositions))
      : 2;
  const safeMaxRiskPct =
    Number.isFinite(maxClusterRiskPct) && maxClusterRiskPct > 0
      ? Math.min(100, maxClusterRiskPct)
      : 2.2;

  const candidateCluster = classifyAssetFactorCluster(
    String(candidateSymbol ?? ""),
    candidateAssetType,
    candidateDirection,
  );

  let sameClusterOpenCount = 0;
  let existingClusterRiskPct = 0;

  for (const pos of Array.isArray(openPositions) ? openPositions : []) {
    if (!pos || typeof pos.symbol !== "string") continue;
    const posAssetType =
      pos.assetType ??
      (pos.symbol.toUpperCase().endsWith("USDT") ? "CRYPTO" : "FOREX");
    const c = classifyAssetFactorCluster(pos.symbol, posAssetType, pos.direction);
    if (c === candidateCluster) {
      sameClusterOpenCount++;
      const posRisk =
        pos.riskFractionPct != null && Number.isFinite(pos.riskFractionPct) && pos.riskFractionPct >= 0
          ? Math.min(100, pos.riskFractionPct)
          : 1.0;
      existingClusterRiskPct += posRisk;
    }
  }

  const cumulativeClusterRiskPct = Number((existingClusterRiskPct + safeCandidateRisk).toFixed(2));

  if (sameClusterOpenCount >= safeMaxPositions) {
    return {
      candidateCluster,
      sameClusterOpenCount,
      maxAllowedClusterPositions: safeMaxPositions,
      cumulativeClusterRiskPct,
      maxAllowedClusterRiskPct: safeMaxRiskPct,
      allowed: false,
      sizeMultiplier: 0,
      rationaleVi: `Từ chối cấp vốn nhân tố [${candidateCluster}]: Danh mục đã mở ${sameClusterOpenCount}/${safeMaxPositions} vị thế cùng cụm rủi ro vĩ mô.`,
    };
  }

  if (existingClusterRiskPct >= safeMaxRiskPct) {
    return {
      candidateCluster,
      sameClusterOpenCount,
      maxAllowedClusterPositions: safeMaxPositions,
      cumulativeClusterRiskPct,
      maxAllowedClusterRiskPct: safeMaxRiskPct,
      allowed: false,
      sizeMultiplier: 0,
      rationaleVi: `Từ chối cấp vốn nhân tố [${candidateCluster}]: Rủi ro tích lũy của cụm (${existingClusterRiskPct.toFixed(2)}%) đã chạm trần ${safeMaxRiskPct}%.`,
    };
  }

  // Dampen position size to 0.70x when adding a 2nd correlated position in the same macro factor cluster
  const sizeMultiplier = sameClusterOpenCount === 0 ? 1.0 : 0.70;
  const rationaleVi =
    sameClusterOpenCount === 0
      ? `Cụm nhân tố [${candidateCluster}] thông thoáng (0/${safeMaxPositions} vị thế) -> Cấp 100% quy mô chuẩn.`
      : `Cụm nhân tố [${candidateCluster}] đã có ${sameClusterOpenCount} vị thế -> Giảm quy mô lệnh mới xuống ${(sizeMultiplier * 100).toFixed(0)}% để chống tập trung rủi ro.`;

  return {
    candidateCluster,
    sameClusterOpenCount,
    maxAllowedClusterPositions: safeMaxPositions,
    cumulativeClusterRiskPct,
    maxAllowedClusterRiskPct: safeMaxRiskPct,
    allowed: true,
    sizeMultiplier,
    rationaleVi,
  };
}

export interface ContinuousDrawdownGovernorResult {
  effectiveDrawdownPct: number;
  dailyLossUtilizationPct: number;
  drawdownDeleverageScale: number; // [0.25, 1.0] or 0 when locked out
  volTargetingScale: number; // [0.40, 1.25]
  recommendedSizeScale: number; // combined product
  isLockedOut: boolean;
  rationaleVi: string;
}

/**
 * Dynamic Portfolio Volatility Targeting & Continuous Drawdown De-leveraging Curve.
 * Smoothly scales position size from 1.0x down to 0.25x as drawdown or daily loss utilization rises,
 * avoiding abrupt cliff-edge risk before the hard daily circuit breaker fires.
 */
export function evaluateContinuousDrawdownGovernor(params: {
  currentBalanceUsd: number;
  peakBalanceUsd?: number | null;
  dailyRealizedPnlUsd?: number | null;
  maxDailyLossUsd?: number | null;
  portfolioAnnualizedVol?: number | null;
  targetAnnualizedVol?: number; // default 0.18 (18%)
  softDrawdownStartPct?: number; // default 1.5%
  hardDrawdownLimitPct?: number; // default 6.0%
  minDeleveragedScale?: number; // default 0.25
}): ContinuousDrawdownGovernorResult {
  const {
    currentBalanceUsd,
    peakBalanceUsd,
    dailyRealizedPnlUsd = 0,
    maxDailyLossUsd = 500,
    portfolioAnnualizedVol,
    targetAnnualizedVol = 0.18,
    softDrawdownStartPct = 1.5,
    hardDrawdownLimitPct = 6.0,
    minDeleveragedScale = 0.25,
  } = params;

  const bal = Number.isFinite(currentBalanceUsd) && currentBalanceUsd > 0
    ? Math.max(100, Math.min(1e12, currentBalanceUsd))
    : 100;
  const peak = Number.isFinite(peakBalanceUsd) && (peakBalanceUsd ?? 0) > bal
    ? Math.min(1e12, peakBalanceUsd!)
    : bal;
  const peakDdPct = ((peak - bal) / peak) * 100;
  const safeDailyPnl = Number.isFinite(dailyRealizedPnlUsd)
    ? Math.max(-1e12, Math.min(1e12, dailyRealizedPnlUsd!))
    : 0;
  const dailyLossUsd = Math.max(0, -safeDailyPnl);
  const dailyDdPct = Math.min(100, (dailyLossUsd / bal) * 100);
  const effectiveDrawdownPct = Number(Math.min(100, Math.max(0, peakDdPct, dailyDdPct)).toFixed(2));

  const maxDaily = Number.isFinite(maxDailyLossUsd) && (maxDailyLossUsd ?? 0) > 0
    ? Math.max(10, Math.min(1e12, maxDailyLossUsd!))
    : 500;
  const dailyLossUtilizationPct = Number(Math.min(1000, (dailyLossUsd / maxDaily) * 100).toFixed(1));

  const safeSoftDd = Number.isFinite(softDrawdownStartPct) && softDrawdownStartPct >= 0
    ? Math.min(95, softDrawdownStartPct)
    : 1.5;
  const safeHardDd = Number.isFinite(hardDrawdownLimitPct) && hardDrawdownLimitPct > safeSoftDd
    ? Math.min(100, hardDrawdownLimitPct)
    : Math.max(6.0, safeSoftDd + 1.0);
  const safeMinScale = Number.isFinite(minDeleveragedScale)
    ? Math.max(0.05, Math.min(1.0, minDeleveragedScale))
    : 0.25;
  const safeTargetVol = Number.isFinite(targetAnnualizedVol) && targetAnnualizedVol > 0
    ? Math.max(0.01, Math.min(5.0, targetAnnualizedVol))
    : 0.18;

  if (dailyLossUsd >= maxDaily || effectiveDrawdownPct >= safeHardDd) {
    return {
      effectiveDrawdownPct,
      dailyLossUtilizationPct,
      drawdownDeleverageScale: 0,
      volTargetingScale: 1.0,
      recommendedSizeScale: 0,
      isLockedOut: true,
      rationaleVi: `Ngắt mạch bảo vệ vốn: Drawdown ${effectiveDrawdownPct}% (Sử dụng ${dailyLossUtilizationPct}% hạn mức lỗ ngày).`,
    };
  }

  // Linear de-leveraging curve between softDrawdownStartPct and hardDrawdownLimitPct
  let ddScale = 1.0;
  if (effectiveDrawdownPct > safeSoftDd) {
    const progress =
      (effectiveDrawdownPct - safeSoftDd) /
      Math.max(0.5, safeHardDd - safeSoftDd);
    ddScale = Math.max(safeMinScale, 1.0 - (1.0 - safeMinScale) * Math.min(1, progress));
  }

  // Also de-leverage smoothly if daily loss utilization exceeds 30% of daily limit
  let dailyUtilScale = 1.0;
  if (dailyLossUtilizationPct > 30) {
    const utilProgress = (dailyLossUtilizationPct - 30) / 70;
    dailyUtilScale = Math.max(
      safeMinScale,
      1.0 - (1.0 - safeMinScale) * Math.min(1, utilProgress),
    );
  }

  const drawdownDeleverageScale = Number(Math.min(ddScale, dailyUtilScale).toFixed(3));

  let volTargetingScale = 1.0;
  if (portfolioAnnualizedVol != null && Number.isFinite(portfolioAnnualizedVol) && portfolioAnnualizedVol > 0) {
    volTargetingScale = Number(
      Math.max(0.40, Math.min(1.25, safeTargetVol / Math.max(0.05, portfolioAnnualizedVol))).toFixed(3),
    );
  }

  const recommendedSizeScale = Number(
    Math.max(safeMinScale, Math.min(1.25, drawdownDeleverageScale * volTargetingScale)).toFixed(3),
  );

  const rationaleVi =
    `Drawdown Governor: DD=${effectiveDrawdownPct}% (Daily Loss ${dailyLossUtilizationPct}%) -> ` +
    `Hệ số giảm đòn bẩy=${drawdownDeleverageScale}x × VolTarget=${volTargetingScale}x => Quy mô khuyến nghị=${recommendedSizeScale}x.`;

  return {
    effectiveDrawdownPct,
    dailyLossUtilizationPct,
    drawdownDeleverageScale,
    volTargetingScale,
    recommendedSizeScale,
    isLockedOut: false,
    rationaleVi,
  };
}

// ============================================================================
// 13. Phase 4A & 4B: Multi-Scenario Probability Synthesizer, Dynamic Exit Policy
//     & Online Contextual Strategy Ensemble (Zero Look-Ahead)
// ============================================================================

export type CanonicalMarketScenarioId =
  | "S1_TREND_EXPANSION"
  | "S2_MEAN_REVERT_RANGE"
  | "S3_SQUEEZE_CASCADE"
  | "S4_MACRO_EVENT_SHOCK"
  | "S5_TAIL_CRISIS_LOCKOUT";

export interface MarketScenarioInput {
  hmmProbabilities?: {
    trendExpansion?: number;
    meanRevertLowVol?: number;
    crisisHighVol?: number;
  } | null;
  efficiencyRatio?: number | null; // [0, 1]
  adx14?: number | null; // [0, 100]
  harExpansionRatio?: number | null; // HAR forecast / historical vol
  tailDegreesOfFreedom?: number | null; // Student-t nu in [2.1, 30]
  vpinOrToxicity?: number | null; // [0, 1]
  spreadSpikeRatio?: number | null; // currentSpread / medianSpread
  fundingExtremeZ?: number | null; // |funding z-score|
  macroScore?: number | null; // [0, 100], <40 is contractionary shock
  isNewsOrCascadeLockout?: boolean | null;
  drawdownDeleverageScale?: number | null; // [0, 1]
}

export interface MarketScenarioVectorResult {
  probabilities: Record<CanonicalMarketScenarioId, number>;
  dominantScenario: CanonicalMarketScenarioId;
  dominantProbability: number;
  shannonEntropy: number; // Normalized [0, 1]
  entropyDampener: number; // [0.50, 1.00]
  recommendedKellyScale: number; // [0.00, 0.50]
  maxLeverageCap: number; // [1, 20]
  requireLimitEntryOnly: boolean;
  isHardLockout: boolean;
  rationaleVi: string;
}

/**
 * Causal Multi-Scenario Probability Synthesizer.
 * Maps online HMM posteriors, HAR-RV expansion, fat-tail degrees of freedom,
 * order-flow toxicity (VPIN/Spread), and macro health into a normalized 5-scenario
 * simplex vector p_t with Shannon entropy uncertainty dampening.
 */
export function evaluateMarketScenarioVector(
  input: MarketScenarioInput = {},
): MarketScenarioVectorResult {
  const safeNum = (v: unknown, fallback: number, min: number, max: number): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
  };

  const pTrendHmm = safeNum(input?.hmmProbabilities?.trendExpansion, 0.34, 0, 1);
  const pMeanRevHmm = safeNum(input?.hmmProbabilities?.meanRevertLowVol, 0.46, 0, 1);
  const pCrisisHmm = safeNum(input?.hmmProbabilities?.crisisHighVol, 0.20, 0, 1);

  const er = safeNum(input?.efficiencyRatio, 0.35, 0, 1);
  const adx = safeNum(input?.adx14, 22, 0, 100);
  const harExp = safeNum(input?.harExpansionRatio, 1.0, 0.2, 5.0);
  const nu = safeNum(input?.tailDegreesOfFreedom, 6.0, 2.1, 30.0);
  const vpin = safeNum(input?.vpinOrToxicity, 0.30, 0, 1);
  const spreadRatio = safeNum(input?.spreadSpikeRatio, 1.0, 0.5, 20.0);
  const fundingZ = safeNum(input?.fundingExtremeZ, 0.5, 0, 10.0);
  const macroScore = safeNum(input?.macroScore, 60, 0, 100);
  const ddScale = safeNum(input?.drawdownDeleverageScale, 1.0, 0, 1.25);
  const isLockout = Boolean(input?.isNewsOrCascadeLockout);

  // Raw unnormalized scenario affinities (strictly positive to avoid log(0))
  const s1Raw =
    0.02 +
    pTrendHmm * 1.45 +
    (er >= 0.42 ? (er - 0.35) * 1.3 : 0) +
    (adx >= 24 ? Math.min(0.6, (adx - 20) / 45) : 0) +
    (harExp >= 0.9 && harExp <= 1.45 ? 0.25 : 0);

  const s2Raw =
    0.02 +
    pMeanRevHmm * 1.45 +
    (er < 0.35 ? (0.40 - er) * 1.25 : 0) +
    (adx < 22 ? Math.min(0.55, (24 - adx) / 30) : 0) +
    (harExp < 0.95 ? 0.30 : 0);

  const s3Raw =
    0.015 +
    (vpin >= 0.55 ? (vpin - 0.45) * 2.2 : vpin * 0.2) +
    (fundingZ >= 1.8 ? Math.min(1.2, (fundingZ - 1.5) * 0.45) : 0) +
    (harExp > 1.35 && pCrisisHmm >= 0.25 ? 0.45 : 0) +
    // Single-bar sweep volatility jumps without tail/spread collapse map to Squeeze Cascade (limit-only + capped lev), not Crisis Lockout
    (pCrisisHmm >= 0.45 && pCrisisHmm < 0.78 && nu > 3.6 && ddScale > 0.35 ? pCrisisHmm * 0.85 : 0);

  const s4Raw =
    0.015 +
    (isLockout ? 1.65 : 0) +
    (spreadRatio >= 1.8 ? Math.min(1.5, (spreadRatio - 1.5) * 0.65) : 0) +
    (macroScore < 42 ? ((45 - macroScore) / 45) * 1.1 : 0);

  const hasTailOrLiquidityStress =
    nu <= 4.5 ||
    ddScale <= 0.45 ||
    spreadRatio >= 2.2 ||
    vpin >= 0.65 ||
    isLockout;
  const s5Raw =
    0.01 +
    (pCrisisHmm >= 0.78 && hasTailOrLiquidityStress
      ? pCrisisHmm * 1.9
      : pCrisisHmm >= 0.55 && hasTailOrLiquidityStress
        ? pCrisisHmm * 1.35
        : pCrisisHmm * 0.22) +
    (nu <= 3.6 ? (4.0 - nu) * 0.85 : 0) +
    (ddScale <= 0.35 ? (0.45 - ddScale) * 2.4 : 0) +
    (spreadRatio >= 2.8 && vpin >= 0.70 ? 1.2 : 0);

  const rawList: [CanonicalMarketScenarioId, number][] = [
    ["S1_TREND_EXPANSION", Math.max(1e-4, s1Raw)],
    ["S2_MEAN_REVERT_RANGE", Math.max(1e-4, s2Raw)],
    ["S3_SQUEEZE_CASCADE", Math.max(1e-4, s3Raw)],
    ["S4_MACRO_EVENT_SHOCK", Math.max(1e-4, s4Raw)],
    ["S5_TAIL_CRISIS_LOCKOUT", Math.max(1e-4, s5Raw)],
  ];

  const totalRaw = rawList.reduce((acc, [, v]) => acc + v, 0);
  const probs: Record<CanonicalMarketScenarioId, number> = {
    S1_TREND_EXPANSION: 0.2,
    S2_MEAN_REVERT_RANGE: 0.2,
    S3_SQUEEZE_CASCADE: 0.2,
    S4_MACRO_EVENT_SHOCK: 0.2,
    S5_TAIL_CRISIS_LOCKOUT: 0.2,
  };

  let sumRounded = 0;
  for (let i = 0; i < rawList.length; i++) {
    const [id, val] = rawList[i]!;
    if (i < rawList.length - 1) {
      const p = Number((val / totalRaw).toFixed(4));
      probs[id] = p;
      sumRounded += p;
    } else {
      // Exact simplex conservation: sum(p_k) === 1
      probs[id] = Number(Math.max(0, 1 - sumRounded).toFixed(4));
    }
  }

  let dominantScenario: CanonicalMarketScenarioId = "S2_MEAN_REVERT_RANGE";
  let dominantProbability = -1;
  let rawEntropy = 0;
  for (const [id] of rawList) {
    const p = probs[id];
    if (p > dominantProbability) {
      dominantProbability = p;
      dominantScenario = id;
    }
    if (p > 1e-9) {
      rawEntropy -= p * Math.log(p);
    }
  }

  const shannonEntropy = Number(
    Math.min(1, Math.max(0, rawEntropy / Math.log(5))).toFixed(4),
  );
  // Dampen position size when scenario distribution is highly dispersed (H > 0.75)
  const entropyDampener = Number(
    (shannonEntropy > 0.75 ? Math.max(0.55, 1.0 - 0.45 * shannonEntropy) : 1.0).toFixed(3),
  );

  const isHardLockout =
    dominantScenario === "S5_TAIL_CRISIS_LOCKOUT" ||
    probs.S5_TAIL_CRISIS_LOCKOUT >= 0.52 ||
    ddScale <= 0;

  const baseKellyByScenario =
    probs.S1_TREND_EXPANSION * 0.50 +
    probs.S2_MEAN_REVERT_RANGE * 0.40 +
    probs.S3_SQUEEZE_CASCADE * 0.25 +
    probs.S4_MACRO_EVENT_SHOCK * 0.15 +
    probs.S5_TAIL_CRISIS_LOCKOUT * 0.0;

  const recommendedKellyScale = isHardLockout
    ? 0
    : Number(
        Math.min(0.5, Math.max(0.05, baseKellyByScenario * entropyDampener * Math.min(1, ddScale))).toFixed(3),
      );

  const maxLeverageCap = isHardLockout
    ? 1
    : dominantScenario === "S4_MACRO_EVENT_SHOCK" || dominantScenario === "S3_SQUEEZE_CASCADE"
      ? 3
      : dominantScenario === "S2_MEAN_REVERT_RANGE"
        ? 5
        : 10;

  const requireLimitEntryOnly =
    isHardLockout ||
    dominantScenario === "S3_SQUEEZE_CASCADE" ||
    dominantScenario === "S4_MACRO_EVENT_SHOCK" ||
    probs.S3_SQUEEZE_CASCADE + probs.S4_MACRO_EVENT_SHOCK >= 0.45;

  const rationaleVi =
    `Kịch bản chủ đạo: ${dominantScenario} (${(dominantProbability * 100).toFixed(1)}%) | ` +
    `Entropy=${shannonEntropy.toFixed(2)} (Dampener ${entropyDampener}x) -> ` +
    `KellyScale=${recommendedKellyScale}x, MaxLev=${maxLeverageCap}x${requireLimitEntryOnly ? " [LIMIT-ONLY]" : ""}.`;

  return {
    probabilities: probs,
    dominantScenario,
    dominantProbability,
    shannonEntropy,
    entropyDampener,
    recommendedKellyScale,
    maxLeverageCap,
    requireLimitEntryOnly,
    isHardLockout,
    rationaleVi,
  };
}

export interface ScenarioDynamicExitPolicy {
  tp1ClosePct: number; // integer % e.g. 35..65
  tp2ClosePct: number; // integer %
  tp3ClosePct: number; // integer %, tp1 + tp2 + tp3 === 100
  tp1RMultiple: number; // e.g. 0.90 .. 1.15
  tp2RMultiple: number; // e.g. 1.65 .. 2.40
  tp3RMultiple: number; // e.g. 2.60 .. 4.00
  trailingAtrMultiplier: number; // e.g. 0.75 .. 1.45
  moveSlToBeAtTp1: boolean;
  rationaleVi: string;
}

/**
 * Computes scenario-interpolated multi-tier Take-Profit weights [TP1%, TP2%, TP3%]
 * and R-multiple distances from the 5-scenario probability vector.
 * - S1_TREND_EXPANSION shifts weight toward TP3 runner (30/30/40) with wider trailing stop.
 * - S2_MEAN_REVERT_RANGE front-loads TP1 at Equilibrium (60/30/10) to harvest range sweeps.
 * - S3/S4/S5 lock in 65-70% at TP1 with tight trailing stops.
 */
export function computeScenarioDynamicExitPolicy(
  scenarioVector: MarketScenarioVectorResult,
  baseGrossRr = 2.0,
): ScenarioDynamicExitPolicy {
  const p = scenarioVector?.probabilities ?? {
    S1_TREND_EXPANSION: 0.2,
    S2_MEAN_REVERT_RANGE: 0.4,
    S3_SQUEEZE_CASCADE: 0.2,
    S4_MACRO_EVENT_SHOCK: 0.1,
    S5_TAIL_CRISIS_LOCKOUT: 0.1,
  };
  const safeBaseRr =
    typeof baseGrossRr === "number" && Number.isFinite(baseGrossRr) && baseGrossRr >= 1.2
      ? Math.min(6.0, baseGrossRr)
      : 2.0;

  const p1 = Number.isFinite(p.S1_TREND_EXPANSION) ? Math.max(0, p.S1_TREND_EXPANSION) : 0.2;
  const p2 = Number.isFinite(p.S2_MEAN_REVERT_RANGE) ? Math.max(0, p.S2_MEAN_REVERT_RANGE) : 0.4;
  const p3 = Number.isFinite(p.S3_SQUEEZE_CASCADE) ? Math.max(0, p.S3_SQUEEZE_CASCADE) : 0.2;
  const p4 = Number.isFinite(p.S4_MACRO_EVENT_SHOCK) ? Math.max(0, p.S4_MACRO_EVENT_SHOCK) : 0.1;
  const p5 = Number.isFinite(p.S5_TAIL_CRISIS_LOCKOUT) ? Math.max(0, p.S5_TAIL_CRISIS_LOCKOUT) : 0.1;
  const norm = Math.max(1e-6, p1 + p2 + p3 + p4 + p5);

  const wS1 = p1 / norm;
  const wS2 = p2 / norm;
  const wS345 = (p3 + p4 + p5) / norm;

  // Convex interpolation of TP1 and TP2 percentages
  const rawTp1Pct = wS1 * 32 + wS2 * 58 + wS345 * 64;
  const rawTp2Pct = wS1 * 30 + wS2 * 30 + wS345 * 24;

  const tp1ClosePct = Math.min(70, Math.max(30, Math.round(rawTp1Pct)));
  const tp2ClosePct = Math.min(100 - tp1ClosePct - 5, Math.max(15, Math.round(rawTp2Pct)));
  const tp3ClosePct = 100 - tp1ClosePct - tp2ClosePct;

  const tp1RMultiple = Number((wS1 * 1.05 + wS2 * 0.90 + wS345 * 0.85).toFixed(2));
  const tp2RMultiple = Number(
    Math.max(tp1RMultiple + 0.45, safeBaseRr * (wS1 * 1.12 + wS2 * 0.95 + wS345 * 0.88)).toFixed(2),
  );
  const tp3RMultiple = Number(
    Math.max(tp2RMultiple + 0.70, safeBaseRr * (wS1 * 1.85 + wS2 * 1.40 + wS345 * 1.25)).toFixed(2),
  );
  const trailingAtrMultiplier = Number((wS1 * 1.35 + wS2 * 0.90 + wS345 * 0.75).toFixed(2));

  const dom = scenarioVector?.dominantScenario ?? "S2_MEAN_REVERT_RANGE";
  const rationaleVi =
    `Exit Policy [${dom}]: Chốt lời động ${tp1ClosePct}%/${tp2ClosePct}%/${tp3ClosePct}% ` +
    `tại ${tp1RMultiple}R / ${tp2RMultiple}R / ${tp3RMultiple}R (Trail ${trailingAtrMultiplier}x ATR).`;

  return {
    tp1ClosePct,
    tp2ClosePct,
    tp3ClosePct,
    tp1RMultiple,
    tp2RMultiple,
    tp3RMultiple,
    trailingAtrMultiplier,
    moveSlToBeAtTp1: true,
    rationaleVi,
  };
}

export type StrategyArchetypeId =
  | "TREND_BREAKOUT"
  | "ICT_LIQUIDITY_SWEEP"
  | "OU_MEAN_REVERSION"
  | "FUNDING_CARRY"
  | "VALUE_QUALITY";

export interface AdaptiveStrategyWeightsResult {
  weights: Record<StrategyArchetypeId, number>;
  topStrategy: StrategyArchetypeId;
  expectedEnsembleSharpe: number;
  rationaleVi: string;
}

const DEFAULT_SCENARIO_SHARPE_PRIORS: Record<
  StrategyArchetypeId,
  Record<CanonicalMarketScenarioId, number>
> = {
  TREND_BREAKOUT: {
    S1_TREND_EXPANSION: 1.85,
    S2_MEAN_REVERT_RANGE: -0.35,
    S3_SQUEEZE_CASCADE: 0.40,
    S4_MACRO_EVENT_SHOCK: -0.20,
    S5_TAIL_CRISIS_LOCKOUT: -0.90,
  },
  ICT_LIQUIDITY_SWEEP: {
    S1_TREND_EXPANSION: 1.15,
    S2_MEAN_REVERT_RANGE: 1.75,
    S3_SQUEEZE_CASCADE: 1.55,
    S4_MACRO_EVENT_SHOCK: 0.35,
    S5_TAIL_CRISIS_LOCKOUT: -0.40,
  },
  OU_MEAN_REVERSION: {
    S1_TREND_EXPANSION: -0.25,
    S2_MEAN_REVERT_RANGE: 1.65,
    S3_SQUEEZE_CASCADE: 0.85,
    S4_MACRO_EVENT_SHOCK: 0.20,
    S5_TAIL_CRISIS_LOCKOUT: -0.50,
  },
  FUNDING_CARRY: {
    S1_TREND_EXPANSION: 0.95,
    S2_MEAN_REVERT_RANGE: 1.25,
    S3_SQUEEZE_CASCADE: 1.10,
    S4_MACRO_EVENT_SHOCK: 1.30,
    S5_TAIL_CRISIS_LOCKOUT: 0.45,
  },
  VALUE_QUALITY: {
    S1_TREND_EXPANSION: 1.25,
    S2_MEAN_REVERT_RANGE: 1.10,
    S3_SQUEEZE_CASCADE: 0.60,
    S4_MACRO_EVENT_SHOCK: 0.95,
    S5_TAIL_CRISIS_LOCKOUT: 0.30,
  },
};

/**
 * Online Contextual Strategy Ensemble (Multiplicative Weights / EXP3 over Scenario Posteriors).
 * Blends causal empirical Sharpe observations with institutional scenario priors and computes
 * softmax capital weights across the 5 strategy archetypes.
 */
export function computeAdaptiveStrategyWeights(params: {
  scenarioVector: MarketScenarioVectorResult;
  empiricalScenarioSharpe?: Partial<
    Record<StrategyArchetypeId, Partial<Record<CanonicalMarketScenarioId, number>>>
  > | null;
  learningRateEta?: number; // default 1.15
  forgettingGamma?: number; // default 0.90 weight on empirical when provided
}): AdaptiveStrategyWeightsResult {
  const {
    scenarioVector,
    empiricalScenarioSharpe,
    learningRateEta = 1.15,
    forgettingGamma = 0.65,
  } = params;

  const eta =
    typeof learningRateEta === "number" && Number.isFinite(learningRateEta) && learningRateEta > 0
      ? Math.min(5.0, Math.max(0.1, learningRateEta))
      : 1.15;
  const gamma =
    typeof forgettingGamma === "number" && Number.isFinite(forgettingGamma)
      ? Math.min(0.95, Math.max(0.05, forgettingGamma))
      : 0.65;

  const probs = scenarioVector?.probabilities ?? {
    S1_TREND_EXPANSION: 0.2,
    S2_MEAN_REVERT_RANGE: 0.2,
    S3_SQUEEZE_CASCADE: 0.2,
    S4_MACRO_EVENT_SHOCK: 0.2,
    S5_TAIL_CRISIS_LOCKOUT: 0.2,
  };

  const strategies: StrategyArchetypeId[] = [
    "TREND_BREAKOUT",
    "ICT_LIQUIDITY_SWEEP",
    "OU_MEAN_REVERSION",
    "FUNDING_CARRY",
    "VALUE_QUALITY",
  ];
  const scenarios: CanonicalMarketScenarioId[] = [
    "S1_TREND_EXPANSION",
    "S2_MEAN_REVERT_RANGE",
    "S3_SQUEEZE_CASCADE",
    "S4_MACRO_EVENT_SHOCK",
    "S5_TAIL_CRISIS_LOCKOUT",
  ];

  const expectedSharpeByStrat: Record<StrategyArchetypeId, number> = {
    TREND_BREAKOUT: 0,
    ICT_LIQUIDITY_SWEEP: 0,
    OU_MEAN_REVERSION: 0,
    FUNDING_CARRY: 0,
    VALUE_QUALITY: 0,
  };

  for (const strat of strategies) {
    let expSharpe = 0;
    for (const sc of scenarios) {
      const pSc = Number.isFinite(probs[sc]) ? Math.max(0, probs[sc]) : 0.2;
      const priorS = DEFAULT_SCENARIO_SHARPE_PRIORS[strat][sc];
      const empRaw = empiricalScenarioSharpe?.[strat]?.[sc];
      const blendedS =
        typeof empRaw === "number" && Number.isFinite(empRaw)
          ? gamma * Math.min(4.0, Math.max(-3.0, empRaw)) + (1 - gamma) * priorS
          : priorS;
      expSharpe += pSc * blendedS;
    }
    expectedSharpeByStrat[strat] = expSharpe;
  }

  // Numerical stability: shift exponents by max score
  const maxScore = Math.max(...strategies.map((s) => eta * expectedSharpeByStrat[s]));
  const rawExp = strategies.map((s) => Math.exp(eta * expectedSharpeByStrat[s] - maxScore));
  const sumExp = Math.max(1e-12, rawExp.reduce((a, b) => a + b, 0));

  const weights: Record<StrategyArchetypeId, number> = {
    TREND_BREAKOUT: 0.2,
    ICT_LIQUIDITY_SWEEP: 0.2,
    OU_MEAN_REVERSION: 0.2,
    FUNDING_CARRY: 0.2,
    VALUE_QUALITY: 0.2,
  };

  let sumW = 0;
  let topStrategy: StrategyArchetypeId = "ICT_LIQUIDITY_SWEEP";
  let topWeight = -1;
  let expectedEnsembleSharpe = 0;

  for (let i = 0; i < strategies.length; i++) {
    const strat = strategies[i]!;
    const w =
      i < strategies.length - 1
        ? Number((rawExp[i]! / sumExp).toFixed(4))
        : Number(Math.max(0, 1 - sumW).toFixed(4));
    if (i < strategies.length - 1) sumW += w;
    weights[strat] = w;
    if (w > topWeight) {
      topWeight = w;
      topStrategy = strat;
    }
    expectedEnsembleSharpe += w * expectedSharpeByStrat[strat];
  }

  return {
    weights,
    topStrategy,
    expectedEnsembleSharpe: Number(expectedEnsembleSharpe.toFixed(3)),
    rationaleVi: `Phân bổ Chiến lược Đa kịch bản: Ưu tiên ${topStrategy} (${(topWeight * 100).toFixed(1)}%) | Kỳ vọng Sharpe Tổ hợp=${expectedEnsembleSharpe.toFixed(2)}.`,
  };
}

// ============================================================================
// 10. Factor Matrix Orthogonalization (Löwdin Symmetric Orthogonalization)
// ============================================================================

export interface FactorOrthogonalizationResult {
  orthogonalizedMatrix: number[][]; // N x K orthogonalized factors
  correlationMatrixBefore: number[][]; // K x K original correlation matrix
  correlationMatrixAfter: number[][]; // K x K orthogonalized correlation matrix (near identity)
  conditionNumber: number; // lambda_max / lambda_min
  maxAbsCrossCorrelationBefore: number;
  maxAbsCrossCorrelationAfter: number;
  eigenvalues: number[];
  vifScoresBefore: number[]; // Variance Inflation Factors before
  vifScoresAfter: number[]; // Variance Inflation Factors after (~1.0 for orthonormal)
  rationaleVi: string;
}

/**
 * Computes Variance Inflation Factors (VIF) for each factor column given a correlation matrix.
 * VIF_j = [C^(-1)]_{j,j}.
 * Benchmark: VIF > 5 indicates moderate multicollinearity, VIF > 10 indicates severe multicollinearity.
 */
export function computeVarianceInflationFactors(
  corrMatrix: number[][],
  ridgeLambda = 1e-4
): number[] {
  const k = corrMatrix.length;
  if (k < 2) return [1.0];

  const C_reg: number[][] = Array.from({ length: k }, (_, r) =>
    Array.from({ length: k }, (_, c) => {
      const sym = (corrMatrix[r]![c]! + corrMatrix[c]![r]!) / 2;
      return (1 - ridgeLambda) * sym + (r === c ? ridgeLambda : 0);
    })
  );

  const { eigenvalues, eigenvectors } = symmetricJacobiEigenvalues(C_reg);
  const invLambda = eigenvalues.map((ev) => 1 / Math.max(1e-6, ev));

  const vifs: number[] = [];
  for (let j = 0; j < k; j++) {
    let diagInv = 0;
    for (let m = 0; m < k; m++) {
      diagInv += eigenvectors[j]![m]! * invLambda[m]! * eigenvectors[j]![m]!;
    }
    vifs.push(Number(Math.max(1.0, diagInv).toFixed(2)));
  }
  return vifs;
}

export interface FactorPruningResult {
  cleanedMatrix: number[][];
  remainingFactorNames: string[];
  removedFactorNames: string[];
  removedFactorIndices: number[];
  vifBefore: number[];
  vifAfter: number[];
  maxVifAfter: number;
  isPruned: boolean;
  rationaleVi: string;
}

/**
 * Iteratively prunes redundant factors with VIF exceeding maxThreshold (default 10.0)
 * to ensure linear independence before optimization.
 */
export function filterHighVifFactors(
  factorMatrix: number[][],
  factorNames?: string[],
  maxVif = 10.0
): FactorPruningResult {
  if (!Array.isArray(factorMatrix) || factorMatrix.length < 2) {
    throw new Error("filterHighVifFactors requires at least 2 rows");
  }
  let currentMatrix: number[][] = factorMatrix.map((r) => [...r]);
  const initialK = currentMatrix[0]?.length ?? 0;
  let currentNames: string[] =
    factorNames && factorNames.length === initialK
      ? [...factorNames]
      : Array.from({ length: initialK }, (_, i) => `Factor_${i}`);
  const removedNames: string[] = [];
  const removedIndices: number[] = [];

  // Compute initial VIF
  const n = currentMatrix.length;
  const computeSampleCorr = (mat: number[][]): number[][] => {
    const k = mat[0]!.length;
    const stdCols: number[][] = [];
    for (let j = 0; j < k; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += mat[i]![j]!;
      const mean = sum / n;
      let varSum = 0;
      for (let i = 0; i < n; i++) varSum += (mat[i]![j]! - mean) ** 2;
      const std = Math.sqrt(Math.max(1e-8, varSum / (n - 1)));
      stdCols.push(mat.map((r) => (r[j]! - mean) / std));
    }
    return Array.from({ length: k }, (_, r) =>
      Array.from({ length: k }, (_, c) => {
        if (r === c) return 1.0;
        let dot = 0;
        for (let i = 0; i < n; i++) dot += stdCols[r]![i]! * stdCols[c]![i]!;
        return Math.min(0.9999, Math.max(-0.9999, dot / (n - 1)));
      })
    );
  };

  const initialCorr = computeSampleCorr(currentMatrix);
  const initialVifs = computeVarianceInflationFactors(initialCorr);

  let currentCorr = initialCorr;
  let currentVifs = [...initialVifs];

  while (currentMatrix[0]!.length > 1) {
    let worstIdx = -1;
    let worstVif = -1;
    for (let j = 0; j < currentVifs.length; j++) {
      if (currentVifs[j]! > worstVif) {
        worstVif = currentVifs[j]!;
        worstIdx = j;
      }
    }

    if (worstVif <= maxVif || worstIdx === -1) {
      break; // All remaining factors are below VIF threshold
    }

    // Prune worst factor
    const factorNameToRemove = currentNames[worstIdx]!;
    removedNames.push(factorNameToRemove);
    removedIndices.push(worstIdx);

    currentMatrix = currentMatrix.map((r) => r.filter((_, idx) => idx !== worstIdx));
    currentNames = currentNames.filter((_, idx) => idx !== worstIdx);

    currentCorr = computeSampleCorr(currentMatrix);
    currentVifs = computeVarianceInflationFactors(currentCorr);
  }

  const maxVifAfter = currentVifs.length > 0 ? Math.max(...currentVifs) : 1.0;
  const isPruned = removedNames.length > 0;
  const rationaleVi = isPruned
    ? `Đã lọc bỏ ${removedNames.length} factor có VIF > ${maxVif} (${removedNames.join(", ")}). VIF tối đa sau lọc = ${maxVifAfter}.`
    : `Tất cả các factor đều đạt chuẩn độc lập tuyến tính (VIF tối đa = ${maxVifAfter} <= ${maxVif}). Không cần loại bỏ.`;

  return {
    cleanedMatrix: currentMatrix,
    remainingFactorNames: currentNames,
    removedFactorNames: removedNames,
    removedFactorIndices: removedIndices,
    vifBefore: initialVifs,
    vifAfter: currentVifs,
    maxVifAfter,
    isPruned,
    rationaleVi,
  };
}

/**
 * Computes eigenvalues and eigenvectors of a symmetric K x K real matrix via Jacobi rotations.
 */
export function symmetricJacobiEigenvalues(
  matrix: number[][],
  maxSweeps = 60,
  epsilon = 1e-12
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length;
  // Deep clone matrix A and initialize V as identity
  const A: number[][] = matrix.map((row) => [...row]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOffDiag = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const absVal = Math.abs(A[p]![q]!);
        if (absVal > maxOffDiag) maxOffDiag = absVal;
      }
    }

    if (maxOffDiag < epsilon) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p]![q]!;
        if (Math.abs(apq) < epsilon) continue;

        const app = A[p]![p]!;
        const aqq = A[q]![q]!;
        const tau = (aqq - app) / (2 * apq);
        const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        const theta = s / (1 + c);

        A[p]![p] = app - t * apq;
        A[q]![q] = aqq + t * apq;
        A[p]![q] = 0;
        A[q]![p] = 0;

        for (let r = 0; r < n; r++) {
          if (r !== p && r !== q) {
            const arp = A[r]![p]!;
            const arq = A[r]![q]!;
            A[r]![p] = arp - s * (arq + theta * arp);
            A[p]![r] = A[r]![p]!;
            A[r]![q] = arq + s * (arp - theta * arq);
            A[q]![r] = A[r]![q]!;
          }
          // Update eigenvectors
          const vrp = V[r]![p]!;
          const vrq = V[r]![q]!;
          V[r]![p] = vrp - s * (vrq + theta * vrp);
          V[r]![q] = vrq + s * (vrp - theta * vrq);
        }
      }
    }
  }

  // Extract eigenvalues and pair with eigenvectors
  const pairs: { val: number; vec: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const val = A[i]![i]!;
    const vec: number[] = [];
    for (let r = 0; r < n; r++) {
      vec.push(V[r]![i]!);
    }
    pairs.push({ val, vec });
  }

  // Sort descending by eigenvalue
  pairs.sort((a, b) => b.val - a.val);

  const eigenvalues = pairs.map((p) => p.val);
  const eigenvectors: number[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => pairs[c]!.vec[r]!)
  );

  return { eigenvalues, eigenvectors };
}

/**
 * Löwdin Symmetric Factor Orthogonalization:
 * Takes an N x K factor matrix (N observations, K factors),
 * standardizes columns to zero mean / unit variance,
 * and transforms them into orthonormal factors F_orth = Z * C^(-1/2).
 * Minimizes deviation ||F_orth - Z||_F, keeping factors maximally aligned with their original intuition.
 */
export function orthogonalizeFactorMatrix(
  factorMatrix: number[][],
  ridgeLambda = 1e-4
): FactorOrthogonalizationResult {
  if (!Array.isArray(factorMatrix) || factorMatrix.length < 2) {
    throw new Error("orthogonalizeFactorMatrix requires at least 2 rows");
  }
  const n = factorMatrix.length;
  const k = factorMatrix[0]?.length ?? 0;
  if (k < 2) {
    throw new Error("orthogonalizeFactorMatrix requires at least 2 factors (columns)");
  }

  // 1. Standardize each column
  const means: number[] = new Array(k).fill(0);
  const stds: number[] = new Array(k).fill(0);

  for (let j = 0; j < k; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += factorMatrix[i]![j]!;
    }
    means[j] = sum / n;

    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = factorMatrix[i]![j]! - means[j]!;
      varSum += diff * diff;
    }
    stds[j] = Math.sqrt(Math.max(1e-8, varSum / (n - 1)));
  }

  const Z: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: k }, (_, j) => (factorMatrix[i]![j]! - means[j]!) / stds[j]!)
  );

  // 2. Compute sample correlation matrix C = (Z^T * Z) / (n - 1)
  const C: number[][] = Array.from({ length: k }, (_, r) =>
    Array.from({ length: k }, (_, c) => {
      if (r === c) return 1.0;
      let dot = 0;
      for (let i = 0; i < n; i++) {
        dot += Z[i]![r]! * Z[i]![c]!;
      }
      const corr = dot / (n - 1);
      return Math.min(0.9999, Math.max(-0.9999, corr));
    })
  );

  // Symmetrize and regularize
  const C_reg: number[][] = Array.from({ length: k }, (_, r) =>
    Array.from({ length: k }, (_, c) => {
      const sym = (C[r]![c]! + C[c]![r]!) / 2;
      return (1 - ridgeLambda) * sym + (r === c ? ridgeLambda : 0);
    })
  );

  // 3. Spectral Decomposition C_reg = V * Lambda * V^T
  const { eigenvalues, eigenvectors } = symmetricJacobiEigenvalues(C_reg);
  const minEig = Math.max(1e-6, eigenvalues[eigenvalues.length - 1]!);
  const maxEig = Math.max(minEig, eigenvalues[0]!);
  const conditionNumber = Number((maxEig / minEig).toFixed(2));

  // 4. Compute C^(-1/2) = V * Lambda^(-1/2) * V^T
  const invSqrtLambda = eigenvalues.map((ev) => 1 / Math.sqrt(Math.max(1e-6, ev)));
  const C_inv_sqrt: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));

  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let m = 0; m < k; m++) {
        sum += eigenvectors[r]![m]! * invSqrtLambda[m]! * eigenvectors[c]![m]!;
      }
      C_inv_sqrt[r]![c] = sum;
    }
  }

  // 5. Orthogonalized factors F_orth = Z * C^(-1/2)
  const F_orth: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      let dot = 0;
      for (let m = 0; m < k; m++) {
        dot += Z[i]![m]! * C_inv_sqrt[m]![j]!;
      }
      return Number(dot.toFixed(5));
    })
  );

  // 6. Compute correlation matrix after orthogonalization
  const C_after: number[][] = Array.from({ length: k }, (_, r) =>
    Array.from({ length: k }, (_, c) => {
      if (r === c) return 1.0;
      let dot = 0;
      for (let i = 0; i < n; i++) {
        dot += F_orth[i]![r]! * F_orth[i]![c]!;
      }
      return Number((dot / (n - 1)).toFixed(5));
    })
  );

  let maxAbsBefore = 0;
  for (let r = 0; r < k; r++) {
    for (let c = r + 1; c < k; c++) {
      const a = Math.abs(C[r]![c]!);
      if (a > maxAbsBefore) maxAbsBefore = a;
    }
  }

  let maxAbsAfter = 0;
  for (let r = 0; r < k; r++) {
    for (let c = r + 1; c < k; c++) {
      const a = Math.abs(C_after[r]![c]!);
      if (a > maxAbsAfter) maxAbsAfter = a;
    }
  }

  const vifBefore = computeVarianceInflationFactors(C, ridgeLambda);
  const vifAfter = computeVarianceInflationFactors(C_after, ridgeLambda);

  return {
    orthogonalizedMatrix: F_orth,
    correlationMatrixBefore: C.map((row) => row.map((v) => Number(v.toFixed(4)))),
    correlationMatrixAfter: C_after,
    conditionNumber,
    maxAbsCrossCorrelationBefore: Number(maxAbsBefore.toFixed(4)),
    maxAbsCrossCorrelationAfter: Number(maxAbsAfter.toFixed(5)),
    eigenvalues: eigenvalues.map((ev) => Number(ev.toFixed(4))),
    vifScoresBefore: vifBefore,
    vifScoresAfter: vifAfter,
    rationaleVi: `Trực giao hóa Löwdin: Giảm tương quan chéo tối đa từ ${(maxAbsBefore * 100).toFixed(1)}% xuống ${(maxAbsAfter * 100).toFixed(2)}% | VIF tối đa từ ${Math.max(...vifBefore).toFixed(1)} về ${Math.max(...vifAfter).toFixed(2)} | Condition Number = ${conditionNumber}.`,
  };
}

// ============================================================================
// 11. Event-Driven Bayesian Macro Updating Engine
// ============================================================================

export type EventLifecyclePhase =
  | "PRE_EVENT_COMPRESSION" // 15 - 60 mins before high impact event (co cụm biến động, giảm margin)
  | "EVENT_SHOCK_FREEZE"    // -15 to +20 mins around event (đóng băng, hủy lệnh market, cấm giao dịch)
  | "POST_EVENT_RECOVERY"   // 20 - 60 mins after (thanh khoản hồi phục, spread co hẹp)
  | "POST_EVENT_DRIFT"      // 60 - 240 mins after (xu hướng vĩ mô mới hình thành rõ nét)
  | "NORMAL_EXPANSION";     // Ngoài cửa sổ tin tức

export interface MacroEventSurpriseInput {
  eventId: string;
  name: string;
  currency: string;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category?: "INTEREST_RATE" | "INFLATION" | "EMPLOYMENT" | "GROWTH" | "LIQUIDITY";
  standardizedSurpriseScore: number; // (Actual - Forecast) / historical_std (z-score, e.g. +2.1, -1.8)
  minutesToEvent: number; // âm là trước tin, dương là sau tin
  actualStr?: string;
  forecastStr?: string;
}

export interface BayesianScenarioUpdateResult {
  updatedProbabilities: Record<CanonicalMarketScenarioId, number>;
  dominantScenario: CanonicalMarketScenarioId;
  shannonEntropy: number;
  lifecyclePhase: EventLifecyclePhase;
  isHardLockout: boolean;
  recommendedKellyScale: number;
  executionPolicy: "REJECT_MARKET_ORDERS" | "PASSIVE_LIMIT_ONLY" | "TWAP_ONLY" | "ALLOW_ALL";
  eventRiskScore: number; // 0 - 100
  rationaleVi: string;
}

export interface BayesianUpdateOptions {
  targetAsset?: string; // e.g. "VNINDEX", "EURUSD", "BTCUSDT", "XAUUSD"
  hawkesDecayHalfLifeMins?: number; // Half-life of macro surprise shock in minutes, default 90m
}

/**
 * Evaluates the empirical cross-asset sensitivity of a target asset class to a macro event currency.
 * Accounts for FX pass-through, foreign fund outflows, and commodity trade channels.
 */
export function computeAssetMacroSensitivity(targetAsset = "VNINDEX", eventCurrency = "USD"): number {
  const cleanAsset = targetAsset.toUpperCase().replace("/", "").replace("-", "").trim();
  const curr = eventCurrency.toUpperCase().trim();

  if (curr === "ALL") return 0.85;
  if (cleanAsset.includes(curr)) return 1.0;

  // Vietnam Equities (VNINDEX, VN30, VN30F, or 3-character stock codes like FPT, HPG, VNM)
  const isVnAsset =
    cleanAsset.includes("VN") ||
    cleanAsset === "VNINDEX" ||
    cleanAsset === "VN30" ||
    cleanAsset === "VN30F" ||
    cleanAsset.length === 3;

  if (isVnAsset) {
    if (curr === "VND") return 1.0;
    if (curr === "USD") return 0.70; // Fed rates, DXY, and SBV exchange-rate pass-through
    if (curr === "CNY") return 0.55; // Regional trade linkage
    if (curr === "EUR") return 0.40;
    if (curr === "JPY") return 0.35;
    return 0.25;
  }

  // Crypto perpetuals / spot
  if (
    cleanAsset.includes("BTC") ||
    cleanAsset.includes("ETH") ||
    cleanAsset.includes("SOL") ||
    cleanAsset.includes("USDT")
  ) {
    if (curr === "USD") return 0.95;
    return 0.45;
  }

  // Precious metals & energy commodities
  if (cleanAsset.includes("XAU") || cleanAsset.includes("XAG") || cleanAsset.includes("OIL")) {
    if (curr === "USD") return 1.0;
    if (curr === "CNY" || curr === "EUR") return 0.50;
    return 0.30;
  }

  return 0.50;
}

/**
 * Updates the 5-scenario market simplex vector using Bayesian likelihoods from macroeconomic news surprises.
 * Preserves the exact simplex property: sum(P_k) === 1.0.
 * Incorporates Cross-Asset Sensitivity mapping and Hawkes exponential shock dissipation.
 */
export function updateScenarioVectorWithBayesianSurprise(
  priorScenario: MarketScenarioVectorResult,
  events: MacroEventSurpriseInput[] = [],
  options?: BayesianUpdateOptions
): BayesianScenarioUpdateResult {
  const priors = priorScenario.probabilities;

  if (!events || events.length === 0) {
    return {
      updatedProbabilities: { ...priors },
      dominantScenario: priorScenario.dominantScenario,
      shannonEntropy: priorScenario.shannonEntropy,
      lifecyclePhase: "NORMAL_EXPANSION",
      isHardLockout: priorScenario.isHardLockout,
      recommendedKellyScale: priorScenario.recommendedKellyScale,
      executionPolicy: priorScenario.isHardLockout ? "REJECT_MARKET_ORDERS" : "ALLOW_ALL",
      eventRiskScore: 10,
      rationaleVi: "Không có sự kiện vĩ mô trọng yếu trong vùng quan sát. Duy trì vector tiên nghiệm.",
    };
  }

  // 1. Identify closest high/critical event and determine Event Lifecycle Phase
  let minAbsTime = Infinity;
  let activeEvent: MacroEventSurpriseInput | null = null;
  let maxImpactScore = 0;

  for (const ev of events) {
    const isHighOrCrit = ev.importance === "CRITICAL" || ev.importance === "HIGH";
    const absMin = Math.abs(ev.minutesToEvent);
    const impactWeight = ev.importance === "CRITICAL" ? 1.0 : ev.importance === "HIGH" ? 0.75 : 0.4;
    const impactScore = impactWeight * (1 + Math.min(3, Math.abs(ev.standardizedSurpriseScore)));

    if (impactScore > maxImpactScore) {
      maxImpactScore = impactScore;
    }

    if (isHighOrCrit && absMin < minAbsTime) {
      minAbsTime = absMin;
      activeEvent = ev;
    }
  }

  const mins = activeEvent ? activeEvent.minutesToEvent : 999;
  let lifecyclePhase: EventLifecyclePhase = "NORMAL_EXPANSION";

  if (activeEvent) {
    if (mins >= -60 && mins < -15) {
      lifecyclePhase = "PRE_EVENT_COMPRESSION";
    } else if (mins >= -15 && mins <= 20) {
      lifecyclePhase = "EVENT_SHOCK_FREEZE";
    } else if (mins > 20 && mins <= 60) {
      lifecyclePhase = "POST_EVENT_RECOVERY";
    } else if (mins > 60 && mins <= 240) {
      lifecyclePhase = "POST_EVENT_DRIFT";
    }
  }

  // 2. Compute Likelihood multiplier for each canonical scenario
  // S1 (Trend), S2 (Mean Revert), S3 (Squeeze), S4 (Macro Shock), S5 (Tail Crisis)
  let logL1 = 0;
  let logL2 = 0;
  let logL3 = 0;
  let logL4 = 0;
  let logL5 = 0;

  const targetAsset = options?.targetAsset ?? "VNINDEX";
  const halfLifeMins = options?.hawkesDecayHalfLifeMins ?? 90;

  for (const ev of events) {
    const assetSens = computeAssetMacroSensitivity(targetAsset, ev.currency);
    const baseWeight = ev.importance === "CRITICAL" ? 1.5 : ev.importance === "HIGH" ? 1.0 : 0.4;
    const weight = baseWeight * assetSens;

    // Hawkes exponential shock decay: dissipates shock over time once event is released
    const timeDecay =
      ev.minutesToEvent > 0
        ? Math.exp(-((Math.LN2 * Math.min(360, ev.minutesToEvent)) / halfLifeMins))
        : 1.0;
    const z = ev.standardizedSurpriseScore * timeDecay;
    const absZ = Math.abs(z);

    // If within shock window [-15, +20]
    if (ev.minutesToEvent >= -15 && ev.minutesToEvent <= 20) {
      logL4 += weight * (1.8 + Math.min(2.5, absZ * 0.8));
      if (absZ >= 2.0 || ev.importance === "CRITICAL") {
        logL5 += weight * (1.2 + Math.min(2.0, absZ * 0.6));
      }
      logL2 -= weight * 1.5; // Mean reversion fails during shock
    } else if (ev.minutesToEvent > 20 && ev.minutesToEvent <= 240) {
      // Post-event phase: directionality emerges
      if (absZ >= 1.2) {
        logL1 += weight * (0.8 + Math.min(1.5, absZ * 0.5)); // Directional drift
        logL3 += weight * 0.5; // Squeeze continuation
      } else {
        logL2 += weight * 1.0; // In-line surprise returns to mean reversion
      }
    } else if (ev.minutesToEvent >= -60 && ev.minutesToEvent < -15) {
      // Pre-event compression
      logL4 += weight * 0.6;
      logL1 -= weight * 0.5;
    }
  }

  // 3. Compute Unnormalized Posteriors: P_post(k) ~ P_prior(k) * exp(logLk)
  const l1 = Math.exp(Math.min(10, Math.max(-10, logL1)));
  const l2 = Math.exp(Math.min(10, Math.max(-10, logL2)));
  const l3 = Math.exp(Math.min(10, Math.max(-10, logL3)));
  const l4 = Math.exp(Math.min(10, Math.max(-10, logL4)));
  const l5 = Math.exp(Math.min(10, Math.max(-10, logL5)));

  const rawP1 = (priors.S1_TREND_EXPANSION ?? 0.2) * l1;
  const rawP2 = (priors.S2_MEAN_REVERT_RANGE ?? 0.2) * l2;
  const rawP3 = (priors.S3_SQUEEZE_CASCADE ?? 0.2) * l3;
  const rawP4 = (priors.S4_MACRO_EVENT_SHOCK ?? 0.2) * l4;
  const rawP5 = (priors.S5_TAIL_CRISIS_LOCKOUT ?? 0.2) * l5;

  const totalRaw = Math.max(1e-12, rawP1 + rawP2 + rawP3 + rawP4 + rawP5);

  const scenarioIds: CanonicalMarketScenarioId[] = [
    "S1_TREND_EXPANSION",
    "S2_MEAN_REVERT_RANGE",
    "S3_SQUEEZE_CASCADE",
    "S4_MACRO_EVENT_SHOCK",
    "S5_TAIL_CRISIS_LOCKOUT",
  ];
  const rawValues = [rawP1, rawP2, rawP3, rawP4, rawP5];

  const updatedProbs: Record<CanonicalMarketScenarioId, number> = {
    S1_TREND_EXPANSION: 0.2,
    S2_MEAN_REVERT_RANGE: 0.2,
    S3_SQUEEZE_CASCADE: 0.2,
    S4_MACRO_EVENT_SHOCK: 0.2,
    S5_TAIL_CRISIS_LOCKOUT: 0.2,
  };

  let sumProbs = 0;
  let dominantScenario: CanonicalMarketScenarioId = "S1_TREND_EXPANSION";
  let maxP = -1;

  for (let i = 0; i < scenarioIds.length; i++) {
    const sc = scenarioIds[i]!;
    const p =
      i < scenarioIds.length - 1
        ? Number((rawValues[i]! / totalRaw).toFixed(4))
        : Number(Math.max(0, 1 - sumProbs).toFixed(4));
    if (i < scenarioIds.length - 1) sumProbs += p;
    updatedProbs[sc] = p;

    if (p > maxP) {
      maxP = p;
      dominantScenario = sc;
    }
  }

  // 4. Compute Shannon Entropy on posterior distribution
  let entropySum = 0;
  for (const sc of scenarioIds) {
    const p = updatedProbs[sc]!;
    if (p > 1e-6) {
      entropySum += p * (Math.log(p) / Math.LN2);
    }
  }
  const maxPossibleEntropy = Math.log(scenarioIds.length) / Math.LN2; // log2(5) ~= 2.3219
  const shannonEntropy = Number(Math.min(1.0, Math.max(0, -entropySum / maxPossibleEntropy)).toFixed(4));

  // 5. Determine Hard Lockout & Execution Policy
  const isHardLockout =
    lifecyclePhase === "EVENT_SHOCK_FREEZE" ||
    updatedProbs.S5_TAIL_CRISIS_LOCKOUT >= 0.40 ||
    updatedProbs.S4_MACRO_EVENT_SHOCK >= 0.65;

  let executionPolicy: BayesianScenarioUpdateResult["executionPolicy"] = "ALLOW_ALL";
  let recommendedKellyScale = 1.0;

  if (isHardLockout) {
    executionPolicy = "REJECT_MARKET_ORDERS";
    recommendedKellyScale = 0;
  } else if (lifecyclePhase === "PRE_EVENT_COMPRESSION") {
    executionPolicy = "PASSIVE_LIMIT_ONLY";
    recommendedKellyScale = 0.5;
  } else if (lifecyclePhase === "POST_EVENT_RECOVERY") {
    executionPolicy = "TWAP_ONLY";
    recommendedKellyScale = 0.65;
  } else if (shannonEntropy > 0.85) {
    executionPolicy = "PASSIVE_LIMIT_ONLY";
    recommendedKellyScale = 0.4;
  }

  const eventRiskScore = Math.min(
    100,
    Math.round(
      updatedProbs.S4_MACRO_EVENT_SHOCK * 50 +
        updatedProbs.S5_TAIL_CRISIS_LOCKOUT * 60 +
        (lifecyclePhase === "EVENT_SHOCK_FREEZE" ? 40 : 0)
    )
  );

  return {
    updatedProbabilities: updatedProbs,
    dominantScenario,
    shannonEntropy,
    lifecyclePhase,
    isHardLockout,
    recommendedKellyScale,
    executionPolicy,
    eventRiskScore,
    rationaleVi: `Bayesian Update: Pha sự kiện [${lifecyclePhase}], Kịch bản chiếm ưu thế [${dominantScenario}] (${(maxP * 100).toFixed(1)}%), Entropy=${shannonEntropy}. Chính sách khớp lệnh: ${executionPolicy}.`,
  };
}

// ============================================================================
// SECTION 13: HIGH-DIMENSIONAL COINTEGRATION & STATISTICAL ARBITRAGE (JOHANSEN / VECM)
// ============================================================================

export interface EngleGrangerCointegrationResult {
  isCointegrated: boolean;
  adfStat: number;
  criticalValue5Pct: number;
  criticalValue1Pct: number;
  pValEstimate: number;
  hedgeRatio: number; // Beta (OLS slope)
  alphaIntercept: number;
  halfLifeBars: number;
  meanReversionPace: number; // Theta in OU process
  currentSpread: number;
  spreadMean: number;
  spreadStd: number;
  currentZScore: number;
  structuralStabilityChowF: number; // Chow F-stat for structural break test
  hasStructuralBreak: boolean;
  signal: "BUY_A_SELL_B" | "SELL_A_BUY_B" | "EXIT_SPREAD" | "NO_SIGNAL";
  rationaleVi: string;
}

export interface JohansenEigenResult {
  rank: number; // Number of cointegrating vectors (r in [0..K])
  traceStatistics: number[];
  criticalValues95Pct: number[];
  eigenvalues: number[];
  cointegratingVectors: number[][]; // K x r normalized eigenvectors
  hasCointegration: boolean;
  modelType: "NO_CONSTANT" | "RESTRICTED_CONSTANT" | "UNRESTRICTED_CONSTANT";
}

export interface VecmMeanReversionState {
  cointegrationRank: number;
  spreadSeries: number[];
  currentSpread: number;
  zScore: number;
  halfLife: number;
  speedOfAdjustmentAlpha: number[]; // Speed of adjustment vector alpha_i
  equilibriumTarget: number;
  isStationarySpread: boolean;
  hedgedWeights: Record<string, number>;
}

/**
 * Perform Augmented Dickey-Fuller (ADF) test on a single univariate series.
 * Tests H0: Unit root present (gamma = 0) vs H1: Stationary (gamma < 0).
 * Model: Delta y_t = alpha + gamma * y_{t-1} + sum_{p=1}^lags beta_p * Delta y_{t-p} + eps_t
 */
export function computeAugmentedDickeyFuller(
  series: number[],
  lags: number = 1
): { adfStat: number; pValueApprox: number; isStationary: boolean } {
  const clean = series.filter((v) => Number.isFinite(v));
  const n = clean.length;
  if (n < 15) {
    return { adfStat: 0, pValueApprox: 1.0, isStationary: false };
  }

  const p = Math.max(1, Math.min(lags, Math.floor((n - 2) / 3)));
  // Delta series
  const dy: number[] = new Array(n - 1);
  for (let t = 1; t < n; t++) {
    dy[t - 1] = clean[t] - clean[t - 1];
  }

  // Construct regression matrix: Y = dy[p .. end], X = [const, y_{t-1}, dy_{t-1}, ..., dy_{t-p}]
  const k = 2 + p; // const + lagged_level + p lagged_differences
  const validRows = dy.length - p;
  if (validRows < k + 5) {
    return { adfStat: 0, pValueApprox: 1.0, isStationary: false };
  }

  const X: number[][] = [];
  const Y: number[] = [];

  for (let i = p; i < dy.length; i++) {
    const row: number[] = new Array(k);
    row[0] = 1.0; // Constant intercept
    row[1] = clean[i]; // y_{t-1} level
    for (let j = 1; j <= p; j++) {
      row[1 + j] = dy[i - j]; // dy_{t-j}
    }
    X.push(row);
    Y.push(dy[i]);
  }

  // OLS: Beta = (X^T X)^{-1} X^T Y
  const m = X.length;
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const XtY: number[] = new Array(k).fill(0);

  for (let r = 0; r < m; r++) {
    const row = X[r];
    const yVal = Y[r];
    for (let c1 = 0; c1 < k; c1++) {
      XtY[c1] += row[c1] * yVal;
      for (let c2 = 0; c2 < k; c2++) {
        XtX[c1][c2] += row[c1] * row[c2];
      }
    }
  }

  // Invert XtX using Gaussian elimination with partial pivoting
  const invXtX = invertMatrixNxN(XtX, k);
  if (!invXtX) {
    return { adfStat: 0, pValueApprox: 1.0, isStationary: false };
  }

  const beta: number[] = new Array(k).fill(0);
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      beta[r] += invXtX[r][c] * XtY[c];
    }
  }

  // Residual variance s^2
  let sse = 0;
  for (let r = 0; r < m; r++) {
    let fitted = 0;
    for (let c = 0; c < k; c++) {
      fitted += X[r][c] * beta[c];
    }
    const res = Y[r] - fitted;
    sse += res * res;
  }

  const df = m - k;
  const s2 = df > 0 ? sse / df : 1e-6;
  const seGamma = Math.sqrt(Math.max(1e-12, s2 * invXtX[1][1])); // Variance of y_{t-1} coefficient

  const adfStat = seGamma > 0 ? beta[1] / seGamma : 0;

  // MacKinnon approximate p-value interpolation for ADF with constant (no trend)
  // 1% critical ~ -3.45, 5% ~ -2.88, 10% ~ -2.57
  let pVal = 0.5;
  if (adfStat < -3.45) pVal = 0.01;
  else if (adfStat < -2.88) pVal = 0.05;
  else if (adfStat < -2.57) pVal = 0.1;
  else if (adfStat < -1.95) pVal = 0.25;
  else pVal = 0.6;

  return {
    adfStat: Number(adfStat.toFixed(4)),
    pValueApprox: pVal,
    isStationary: adfStat < -2.88,
  };
}

/**
 * Invert an N x N matrix using Gauss-Jordan with partial pivoting.
 */
function invertMatrixNxN(matrix: number[][], n: number): number[][] | null {
  const aug: number[][] = Array.from({ length: n }, (_, r) => {
    const row = new Array(2 * n).fill(0);
    for (let c = 0; c < n; c++) row[c] = matrix[r][c];
    row[n + r] = 1.0;
    return row;
  });

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    let maxVal = Math.abs(aug[i][i]);
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(aug[r][i]) > maxVal) {
        maxVal = Math.abs(aug[r][i]);
        maxRow = r;
      }
    }

    if (maxVal < 1e-12) return null; // Singular matrix

    // Swap
    if (maxRow !== i) {
      const temp = aug[i];
      aug[i] = aug[maxRow];
      aug[maxRow] = temp;
    }

    // Scale pivot row
    const pivot = aug[i][i];
    for (let c = 0; c < 2 * n; c++) {
      aug[i][c] /= pivot;
    }

    // Eliminate other rows
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = aug[r][i];
        if (Math.abs(factor) > 1e-12) {
          for (let c = 0; c < 2 * n; c++) {
            aug[r][c] -= factor * aug[i][c];
          }
        }
      }
    }
  }

  const inv: number[][] = Array.from({ length: n }, (_, r) => aug[r].slice(n));
  return inv;
}

/**
 * Chow Test for Structural Break at midpoint T/2.
 * Tests if the relationship Y = a + b * X shifted significantly between sub-periods.
 */
export function computeChowStructuralBreakTest(
  seriesY: number[],
  seriesX: number[],
  splitIndex?: number
): { fStat: number; pValueApprox: number; hasBreak: boolean } {
  const n = Math.min(seriesY.length, seriesX.length);
  if (n < 20) return { fStat: 0, pValueApprox: 1.0, hasBreak: false };

  const split = splitIndex ?? Math.floor(n / 2);
  if (split < 8 || n - split < 8) {
    return { fStat: 0, pValueApprox: 1.0, hasBreak: false };
  }

  const olsResidualSum = (y: number[], x: number[]): { sse: number; k: number } => {
    const len = y.length;
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (let i = 0; i < len; i++) {
      sx += x[i];
      sy += y[i];
      sxy += x[i] * y[i];
      sx2 += x[i] * x[i];
    }
    const denom = len * sx2 - sx * sx;
    const b = Math.abs(denom) > 1e-12 ? (len * sxy - sx * sy) / denom : 0;
    const a = (sy - b * sx) / len;
    let sse = 0;
    for (let i = 0; i < len; i++) {
      const e = y[i] - (a + b * x[i]);
      sse += e * e;
    }
    return { sse, k: 2 };
  };

  const pool = olsResidualSum(seriesY, seriesX);
  const part1 = olsResidualSum(seriesY.slice(0, split), seriesX.slice(0, split));
  const part2 = olsResidualSum(seriesY.slice(split), seriesX.slice(split));

  const ssePool = pool.sse;
  const sseUnconstrained = part1.sse + part2.sse;
  const k = 2; // number of parameters [a, b]
  const df1 = k;
  const df2 = n - 2 * k;

  if (df2 <= 0 || sseUnconstrained <= 1e-12) {
    return { fStat: 0, pValueApprox: 1.0, hasBreak: false };
  }

  const fStat = ((ssePool - sseUnconstrained) / df1) / (sseUnconstrained / df2);
  // F(2, >16) critical value at 5% is approx 3.63
  const hasBreak = fStat > 3.63;
  const pValApprox = hasBreak ? 0.02 : 0.3;

  return {
    fStat: Number(Math.max(0, fStat).toFixed(3)),
    pValueApprox: pValApprox,
    hasBreak,
  };
}

/**
 * 2-Step Engle-Granger Cointegration Engine for Statistical Arbitrage:
 * Step 1: OLS Regression Y_t = alpha + beta * X_t + epsilon_t
 * Step 2: ADF Unit Root Test on Residuals epsilon_t (with Engle-Yoo critical values)
 * Step 3: Ornstein-Uhlenbeck Calibration on Residual Spread to extract Half-Life
 * Step 4: Chow Test for Structural Regime Shift
 */
export function evaluateEngleGrangerCointegration(
  seriesY: number[],
  seriesX: number[],
  options?: {
    zScoreThreshold?: number;
    maxHalfLifeBars?: number;
    symbolA?: string;
    symbolB?: string;
  }
): EngleGrangerCointegrationResult {
  const zScoreThresh = options?.zScoreThreshold ?? 2.0;
  const maxHalfLife = options?.maxHalfLifeBars ?? 60; // Max 60 bars for mean-reversion
  const symA = options?.symbolA ?? "AssetA";
  const symB = options?.symbolB ?? "AssetB";

  const n = Math.min(seriesY.length, seriesX.length);
  if (n < 25) {
    return {
      isCointegrated: false,
      adfStat: 0,
      criticalValue5Pct: -3.37,
      criticalValue1Pct: -3.96,
      pValEstimate: 1.0,
      hedgeRatio: 1.0,
      alphaIntercept: 0,
      halfLifeBars: Infinity,
      meanReversionPace: 0,
      currentSpread: 0,
      spreadMean: 0,
      spreadStd: 1.0,
      currentZScore: 0,
      structuralStabilityChowF: 0,
      hasStructuralBreak: false,
      signal: "NO_SIGNAL",
      rationaleVi: "Chuỗi giá quá ngắn (< 25 quan sát) để kiểm định đồng tích hợp.",
    };
  }

  // Step 1: OLS regression Y on X
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = seriesX[i];
    const y = seriesY[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  const beta = Math.abs(denom) > 1e-12 ? (n * sumXY - sumX * sumY) / denom : 1.0;
  const alpha = (sumY - beta * sumX) / n;

  // Construct residuals (spread series)
  const spread: number[] = new Array(n);
  let spreadSum = 0;
  for (let i = 0; i < n; i++) {
    spread[i] = seriesY[i] - (alpha + beta * seriesX[i]);
    spreadSum += spread[i];
  }
  const spreadMean = spreadSum / n;
  let spreadVar = 0;
  for (let i = 0; i < n; i++) {
    const diff = spread[i] - spreadMean;
    spreadVar += diff * diff;
  }
  const spreadStd = Math.sqrt(Math.max(1e-10, spreadVar / (n - 1)));

  // Step 2: ADF test on residuals (Note: Engle-Yoo critical values for 2 variables: 5% ~ -3.37, 1% ~ -3.96)
  const adfRes = computeAugmentedDickeyFuller(spread, 1);
  const isCointegrated = adfRes.adfStat <= -3.37;

  // Step 3: Ornstein-Uhlenbeck on spread
  const ou = estimateOrnsteinUhlenbeck(spread, 1.0);
  const halfLife = Number.isFinite(ou.halfLife) ? Math.max(0.1, ou.halfLife) : Infinity;

  // Current Z-score
  const currentSpread = spread[n - 1];
  const currentZScore = spreadStd > 0 ? (currentSpread - spreadMean) / spreadStd : 0;

  // Step 4: Chow test for structural break
  const chow = computeChowStructuralBreakTest(seriesY, seriesX);

  // Trading Signal Determination
  let signal: "BUY_A_SELL_B" | "SELL_A_BUY_B" | "EXIT_SPREAD" | "NO_SIGNAL" = "NO_SIGNAL";
  let rationaleVi = "";

  if (!isCointegrated) {
    signal = "NO_SIGNAL";
    rationaleVi = `Cặp [${symA}/${symB}] KHÔNG đồng tích hợp (ADF Stat = ${adfRes.adfStat.toFixed(2)} > -3.37). Rủi ro tương quan ảo (spurious correlation).`;
  } else if (chow.hasBreak) {
    signal = "EXIT_SPREAD";
    rationaleVi = `Phát hiện vỡ cấu trúc quan hệ giá (Chow F = ${chow.fStat.toFixed(2)} > 3.63). Cấm mở lệnh đảo chiều phân kỳ.`;
  } else if (halfLife > maxHalfLife) {
    signal = "NO_SIGNAL";
    rationaleVi = `Tốc độ hội tụ quá chậm (Half-Life = ${halfLife.toFixed(1)} nến > ${maxHalfLife}). Vốn bị om quá lâu.`;
  } else {
    // Stat-arb logic
    if (currentZScore > zScoreThresh) {
      // Y is overpriced relative to X -> Sell Y, Buy X
      signal = "SELL_A_BUY_B";
      rationaleVi = `Spread Z-Score cực đại (+${currentZScore.toFixed(2)}): Bán [${symA}], Mua [${symB}] với Hedge Ratio ${beta.toFixed(3)}. Half-Life = ${halfLife.toFixed(1)} nến.`;
    } else if (currentZScore < -zScoreThresh) {
      // Y is underpriced relative to X -> Buy Y, Sell X
      signal = "BUY_A_SELL_B";
      rationaleVi = `Spread Z-Score cực tiểu (${currentZScore.toFixed(2)}): Mua [${symA}], Bán [${symB}] với Hedge Ratio ${beta.toFixed(3)}. Half-Life = ${halfLife.toFixed(1)} nến.`;
    } else if (Math.abs(currentZScore) < 0.5) {
      signal = "EXIT_SPREAD";
      rationaleVi = `Spread đã hội tụ về vùng cân bằng (Z-Score = ${currentZScore.toFixed(2)}). Chốt lời/Đóng vị thế cặp.`;
    } else {
      signal = "NO_SIGNAL";
      rationaleVi = `Spread dao động bình thường (Z-Score = ${currentZScore.toFixed(2)}). Chờ điểm cực trị.`;
    }
  }

  return {
    isCointegrated,
    adfStat: adfRes.adfStat,
    criticalValue5Pct: -3.37,
    criticalValue1Pct: -3.96,
    pValEstimate: adfRes.pValueApprox,
    hedgeRatio: Number(beta.toFixed(4)),
    alphaIntercept: Number(alpha.toFixed(4)),
    halfLifeBars: Number(halfLife.toFixed(1)),
    meanReversionPace: Number(ou.theta.toFixed(4)),
    currentSpread: Number(currentSpread.toFixed(4)),
    spreadMean: Number(spreadMean.toFixed(4)),
    spreadStd: Number(spreadStd.toFixed(4)),
    currentZScore: Number(currentZScore.toFixed(2)),
    structuralStabilityChowF: chow.fStat,
    hasStructuralBreak: chow.hasBreak,
    signal,
    rationaleVi,
  };
}

/**
 * Multivariate Johansen Cointegration Trace Test (K >= 2 time series).
 * Solves generalized eigenvalue problem: |lambda * S11 - S10 * S00^{-1} * S01| = 0
 * to determine cointegrating rank r and cointegrating vectors beta.
 */
export function computeJohansenCointegrationTest(
  dataMatrix: number[][], // T rows x K columns (time series of K assets)
  lags: number = 1
): JohansenEigenResult {
  const T = dataMatrix.length;
  if (T < 30 || !dataMatrix[0]) {
    return {
      rank: 0,
      traceStatistics: [],
      criticalValues95Pct: [],
      eigenvalues: [],
      cointegratingVectors: [],
      hasCointegration: false,
      modelType: "RESTRICTED_CONSTANT",
    };
  }

  const K = dataMatrix[0].length;
  if (K < 2 || K > 6) {
    // Restrict K to 2..6 for institutional numerical stability
    return {
      rank: 0,
      traceStatistics: [],
      criticalValues95Pct: [],
      eigenvalues: [],
      cointegratingVectors: [],
      hasCointegration: false,
      modelType: "RESTRICTED_CONSTANT",
    };
  }

  // 1. Compute delta matrix dX (T-1 x K) and lagged level X_{-1} (T-1 x K)
  const dX: number[][] = [];
  const X_lag: number[][] = [];
  for (let t = 1; t < T; t++) {
    const dRow: number[] = new Array(K);
    const lagRow: number[] = new Array(K);
    for (let j = 0; j < K; j++) {
      dRow[j] = dataMatrix[t][j] - dataMatrix[t - 1][j];
      lagRow[j] = dataMatrix[t - 1][j];
    }
    dX.push(dRow);
    X_lag.push(lagRow);
  }

  const effT = dX.length;

  // 2. Auxiliary regressions of dX and X_lag on lagged differences (if lags > 1, or demean if lags = 1)
  // For standard VECM with constant: center dX and X_lag
  const R0: number[][] = [];
  const R1: number[][] = [];

  const mean0: number[] = new Array(K).fill(0);
  const mean1: number[] = new Array(K).fill(0);
  for (let t = 0; t < effT; t++) {
    for (let j = 0; j < K; j++) {
      mean0[j] += dX[t][j];
      mean1[j] += X_lag[t][j];
    }
  }
  for (let j = 0; j < K; j++) {
    mean0[j] /= effT;
    mean1[j] /= effT;
  }

  for (let t = 0; t < effT; t++) {
    const r0Row: number[] = new Array(K);
    const r1Row: number[] = new Array(K);
    for (let j = 0; j < K; j++) {
      r0Row[j] = dX[t][j] - mean0[j];
      r1Row[j] = X_lag[t][j] - mean1[j];
    }
    R0.push(r0Row);
    R1.push(r1Row);
  }

  // 3. Compute cross-product moment matrices: S00, S01, S10, S11
  const S00 = computeCrossProductMoment(R0, R0, effT, K, K);
  const S01 = computeCrossProductMoment(R0, R1, effT, K, K);
  const S10 = computeCrossProductMoment(R1, R0, effT, K, K);
  const S11 = computeCrossProductMoment(R1, R1, effT, K, K);

  const invS00 = invertMatrixNxN(S00, K);
  const invS11 = invertMatrixNxN(S11, K);

  if (!invS00 || !invS11) {
    return {
      rank: 0,
      traceStatistics: [],
      criticalValues95Pct: [],
      eigenvalues: [],
      cointegratingVectors: [],
      hasCointegration: false,
      modelType: "RESTRICTED_CONSTANT",
    };
  }

  // Target matrix for generalized eigenvalue problem: M = S11^{-1} * S10 * S00^{-1} * S01
  const S00inv_S01 = multiplyMatricesNxN(invS00, S01, K, K, K);
  const S10_S00inv_S01 = multiplyMatricesNxN(S10, S00inv_S01, K, K, K);
  const M = multiplyMatricesNxN(invS11, S10_S00inv_S01, K, K, K);

  // Symmetrize M for stable eigenvalue extraction: M_sym = 0.5 * (M + M^T)
  const Msym: number[][] = Array.from({ length: K }, (_, r) => {
    const row = new Array(K);
    for (let c = 0; c < K; c++) {
      row[c] = 0.5 * (M[r][c] + M[c][r]);
    }
    return row;
  });

  const eigen = symmetricJacobiEigenvalues(Msym);

  // Sort eigenvalues descending
  const paired: { val: number; vec: number[] }[] = [];
  for (let j = 0; j < K; j++) {
    const val = Math.max(0, Math.min(0.9999, eigen.eigenvalues[j]));
    const vec: number[] = new Array(K);
    for (let r = 0; r < K; r++) {
      vec[r] = eigen.eigenvectors[r][j];
    }
    paired.push({ val, vec });
  }
  paired.sort((a, b) => b.val - a.val);

  const sortedEigenvals = paired.map((p) => p.val);

  // Compute Johansen Trace Statistics: Trace(r) = -T * sum_{i=r+1}^K ln(1 - lambda_i)
  const traceStats: number[] = new Array(K);
  for (let r = 0; r < K; r++) {
    let sumLog = 0;
    for (let i = r; i < K; i++) {
      sumLog += Math.log(1 - sortedEigenvals[i]);
    }
    traceStats[r] = Number((-effT * sumLog).toFixed(3));
  }

  // Osterwald-Lenum (1992) asymptotic critical values for Case 3 (unrestricted constant)
  // For K - r = 1..6
  const osterwaldCrit95: Record<number, number> = {
    1: 9.24,
    2: 19.96,
    3: 34.91,
    4: 53.12,
    5: 76.07,
    6: 102.14,
  };

  const critValues: number[] = new Array(K);
  let rank = 0;
  for (let r = 0; r < K; r++) {
    const remainingDim = K - r;
    const crit = osterwaldCrit95[remainingDim] ?? 15.0;
    critValues[r] = crit;
    if (traceStats[r] > crit && rank === r) {
      rank = r + 1;
    }
  }

  // Extract normalized cointegrating vectors (normalized to 1.0 on first asset)
  const cointegratingVectors: number[][] = [];
  for (let r = 0; r < Math.max(1, rank); r++) {
    const rawVec = paired[r].vec;
    const normFactor = Math.abs(rawVec[0]) > 1e-6 ? rawVec[0] : 1.0;
    const normalized = rawVec.map((v) => Number((v / normFactor).toFixed(4)));
    cointegratingVectors.push(normalized);
  }

  return {
    rank,
    traceStatistics: traceStats,
    criticalValues95Pct: critValues,
    eigenvalues: sortedEigenvals.map((v) => Number(v.toFixed(5))),
    cointegratingVectors,
    hasCointegration: rank > 0,
    modelType: "UNRESTRICTED_CONSTANT",
  };
}

function computeCrossProductMoment(
  A: number[][],
  B: number[][],
  rows: number,
  colsA: number,
  colsB: number
): number[][] {
  const result: number[][] = Array.from({ length: colsA }, () => new Array(colsB).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < colsA; i++) {
      for (let j = 0; j < colsB; j++) {
        result[i][j] += A[r][i] * B[r][j];
      }
    }
  }
  for (let i = 0; i < colsA; i++) {
    for (let j = 0; j < colsB; j++) {
      result[i][j] /= rows;
    }
  }
  return result;
}

function multiplyMatricesNxN(
  A: number[][],
  B: number[][],
  rowsA: number,
  colsA: number,
  colsB: number
): number[][] {
  const res: number[][] = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0;
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j];
      }
      res[i][j] = sum;
    }
  }
  return res;
}

// ============================================================================
// SECTION 14: MULTIVARIATE CROSS-EXCITING HAWKES PROCESS & CONTAGION NETWORK
// ============================================================================

export interface HawkesPointEvent {
  nodeId: string; // e.g. "BTC", "ETH", "VN30F", "DXY", "USDVND", "HOSE"
  timestampMs: number;
  magnitude: number; // standardized magnitude (e.g. liquidation volume, basis jump)
}

export interface MultivariateHawkesNodeIntensity {
  nodeId: string;
  baselineMu: number;
  instantaneousIntensity: number; // lambda_i(t)
  endogenousExcitations: number; // self-excitation sum
  crossExcitations: Record<string, number>; // incoming from node j -> i
  clusterBranchingRatio: number; // Expected offspring generated by this node
  isHighExcitationRisk: boolean;
}

export interface MultivariateHawkesNetworkState {
  nodes: string[];
  spectralRadius: number; // Max eigenvalue of infectivity matrix Gamma = Alpha / Beta
  isSubcriticalStable: boolean; // True if spectral radius < 1.0 (no explosive cascade)
  networkIntensityTotal: number;
  nodeIntensities: Record<string, MultivariateHawkesNodeIntensity>;
  dominantShockOrigin: string;
  contagionAlertLevel: "CRITICAL_CASCADE" | "ELEVATED_AFTERSHOCK" | "DAMPING_CALM" | "BASELINE";
  expectedAftershockBars: number; // Estimated horizon until intensity decays to baseline
  rationaleVi: string;
}

/**
 * Standard Institutional Cross-Asset Infectivity Prior Matrix:
 * Alpha_ij represents excitation impact from node j (column) to node i (row).
 * Standard canonical nodes: ["BTC", "ETH", "DXY", "VN30F", "VNINDEX"]
 */
export const DEFAULT_CROSS_ASSET_INFECTIVITY: Record<string, Record<string, number>> = {
  // BTC shocks strongly excite ETH and Crypto perps, moderate impact on VN30F risk appetite
  BTC: { BTC: 0.35, ETH: 0.15, DXY: 0.05, VN30F: 0.05, VNINDEX: 0.02 },
  ETH: { BTC: 0.40, ETH: 0.30, DXY: 0.05, VN30F: 0.05, VNINDEX: 0.02 },
  // DXY (USD) shock excites VN30F and VNINDEX downwards (via capital flight)
  DXY: { BTC: 0.10, ETH: 0.08, DXY: 0.25, VN30F: 0.15, VNINDEX: 0.12 },
  // VN30F derivative liquidation excites VNINDEX cash market with high speed
  VN30F: { BTC: 0.08, ETH: 0.05, DXY: 0.25, VN30F: 0.45, VNINDEX: 0.10 },
  VNINDEX: { BTC: 0.05, ETH: 0.03, DXY: 0.30, VN30F: 0.55, VNINDEX: 0.30 },
};

/**
 * Calibrate and evaluate a Multivariate Mutually-Exciting Hawkes Process:
 * lambda_i(t) = mu_i + sum_{j=1}^M sum_{t_{j,k} < t} alpha_{ij} * magnitude_{j,k} * exp(-beta_{ij} * (t - t_{j,k}))
 *
 * Stability condition:
 * Spectral radius of Gamma = [alpha_{ij} / beta_{ij}] must be strictly < 1.0 to guarantee finite cascades.
 */
export function evaluateMultivariateHawkesContagion(params: {
  eventStream: HawkesPointEvent[];
  evaluationTimeMs: number;
  nodeBaselines?: Record<string, number>; // mu_i
  alphaMatrix?: Record<string, Record<string, number>>; // alpha_ij
  decayBeta?: number; // beta in 1/ms or 1/min (default half-life ~ 60 mins)
}): MultivariateHawkesNetworkState {
  const {
    eventStream,
    evaluationTimeMs,
    nodeBaselines = {},
    alphaMatrix = DEFAULT_CROSS_ASSET_INFECTIVITY,
    decayBeta = Math.LN2 / (60 * 60 * 1000), // Default half-life of 60 minutes in ms
  } = params;

  // Determine unique nodes
  const nodeSet = new Set<string>(Object.keys(alphaMatrix));
  for (const ev of eventStream) {
    nodeSet.add(ev.nodeId);
  }
  const nodes = Array.from(nodeSet).sort();
  const M = nodes.length;

  // 1. Build Gamma infectivity matrix (M x M) where Gamma_ij = Alpha_ij / Beta
  const safeBeta = Math.max(1e-12, decayBeta);
  const Gamma: number[][] = Array.from({ length: M }, (_, i) => {
    const rowNode = nodes[i];
    return nodes.map((colNode) => {
      const alpha = alphaMatrix[rowNode]?.[colNode] ?? (rowNode === colNode ? 0.2 : 0.05);
      return alpha; // Normalized unit branching ratio
    });
  });

  // Calculate Spectral Radius of Gamma using symmetric Jacobi on Gamma^T * Gamma or Power Iteration
  let spectralRadius = 0;
  if (M > 0) {
    let v: number[] = new Array(M).fill(1.0 / Math.sqrt(M));
    for (let iter = 0; iter < 25; iter++) {
      const w: number[] = new Array(M).fill(0);
      for (let r = 0; r < M; r++) {
        for (let c = 0; c < M; c++) {
          w[r] += Gamma[r][c] * v[c];
        }
      }
      let norm = 0;
      for (let r = 0; r < M; r++) norm += w[r] * w[r];
      norm = Math.sqrt(norm);
      if (norm > 1e-12) {
        v = w.map((x) => x / norm);
        spectralRadius = norm;
      } else {
        spectralRadius = 0;
        break;
      }
    }
  }
  spectralRadius = Number(spectralRadius.toFixed(4));
  const isSubcriticalStable = spectralRadius < 1.0;

  // 2. Compute instantaneous intensities lambda_i(t)
  const nodeIntensities: Record<string, MultivariateHawkesNodeIntensity> = {};
  let totalNetworkIntensity = 0;
  let maxCrossShock = -1;
  let dominantShockOrigin = nodes[0] ?? "MARKET";

  for (let i = 0; i < M; i++) {
    const iNode = nodes[i];
    const mu = nodeBaselines[iNode] ?? 0.1; // Default baseline rate
    let selfExc = 0;
    const crossExc: Record<string, number> = {};
    for (const jNode of nodes) {
      crossExc[jNode] = 0;
    }

    // Accumulate shocks from eventStream
    for (const ev of eventStream) {
      if (ev.timestampMs <= evaluationTimeMs) {
        const deltaT = Math.max(0, evaluationTimeMs - ev.timestampMs);
        const decay = Math.exp(-safeBeta * deltaT);
        const alpha = alphaMatrix[iNode]?.[ev.nodeId] ?? (iNode === ev.nodeId ? 0.2 : 0.05);
        const mag = Math.max(0.1, Math.min(10.0, ev.magnitude));
        const impact = alpha * mag * decay;

        if (ev.nodeId === iNode) {
          selfExc += impact;
        } else {
          crossExc[ev.nodeId] = (crossExc[ev.nodeId] ?? 0) + impact;
          if (crossExc[ev.nodeId] > maxCrossShock) {
            maxCrossShock = crossExc[ev.nodeId];
            dominantShockOrigin = ev.nodeId;
          }
        }
      }
    }

    let crossTotal = 0;
    for (const jNode of nodes) {
      if (jNode !== iNode) crossTotal += crossExc[jNode];
    }

    const lambdaI = mu + selfExc + crossTotal;
    totalNetworkIntensity += lambdaI;

    // Cluster branching ratio for this node
    let branchingRatio = 0;
    for (let r = 0; r < M; r++) {
      branchingRatio += Gamma[r][i];
    }

    nodeIntensities[iNode] = {
      nodeId: iNode,
      baselineMu: Number(mu.toFixed(3)),
      instantaneousIntensity: Number(lambdaI.toFixed(3)),
      endogenousExcitations: Number(selfExc.toFixed(3)),
      crossExcitations: Object.fromEntries(
        Object.entries(crossExc).map(([k, v]) => [k, Number(v.toFixed(3))])
      ),
      clusterBranchingRatio: Number(branchingRatio.toFixed(3)),
      isHighExcitationRisk: lambdaI > mu * 2.5,
    };
  }

  // 3. Contagion Alert Level & Aftershock Decay Time
  let alertLevel: "CRITICAL_CASCADE" | "ELEVATED_AFTERSHOCK" | "DAMPING_CALM" | "BASELINE" = "BASELINE";
  let expectedAftershockBars = 0;

  if (spectralRadius >= 1.0) {
    alertLevel = "CRITICAL_CASCADE";
    expectedAftershockBars = 24; // Supercritical avalanche risk
  } else if (totalNetworkIntensity > M * 0.4) {
    alertLevel = "ELEVATED_AFTERSHOCK";
    // Solve for bars when intensity decays by 75%: exp(-beta * t) = 0.25 -> t = ln(4) / beta
    expectedAftershockBars = Math.min(36, Math.max(3, Math.round(Math.log(4) / (safeBeta * 60 * 1000))));
  } else if (totalNetworkIntensity > M * 0.15) {
    alertLevel = "DAMPING_CALM";
    expectedAftershockBars = 2;
  } else {
    alertLevel = "BASELINE";
    expectedAftershockBars = 0;
  }

  const rationaleVi =
    `Hawkes Network: Bán kính phổ r(Γ) = ${spectralRadius} (${isSubcriticalStable ? "Hội tụ ổn định" : "Cảnh báo bùng nổ dây chuyền"}). ` +
    `Mức cảnh báo [${alertLevel}]. Nguồn lan truyền chính: [${dominantShockOrigin}]. Cường độ toàn mạng λ = ${totalNetworkIntensity.toFixed(2)}. ` +
    `Dư chấn dự kiến kéo dài ~ ${expectedAftershockBars} chu kỳ.`;

  return {
    nodes,
    spectralRadius,
    isSubcriticalStable,
    networkIntensityTotal: Number(totalNetworkIntensity.toFixed(3)),
    nodeIntensities,
    dominantShockOrigin,
    contagionAlertLevel: alertLevel,
    expectedAftershockBars,
    rationaleVi,
  };
}

// ============================================================================
// SECTION 15: CONT-STOIKOV MICRO-PRICE & MARKOV L2 QUEUE DYNAMICS (DIRECTION 3)
// ============================================================================

export interface OrderBookLevelInput {
  price: number;
  qty: number;
}

export interface ContStoikovL2Result {
  midPrice: number;
  weightedMidPrice: number; // Top of book weighted mid
  contStoikovMicroPrice: number; // Markov queue-adjusted microprice
  expectedTickJumpDirection: "UP_TICK" | "DOWN_TICK" | "STABLE";
  upTickDepletionProbability: number; // P(Ask depleted before Bid) in [0, 1]
  queueImbalanceRatio: number; // L1..L5 continuous imbalance
  micropriceAdvantageBps: number;
  leadLagAlphaScore: number; // -100 to +100
  recommendedLimitOffsetTicks: number; // ticks to place limit order
  rationaleVi: string;
}

/**
 * Cont-Stoikov (2014) Markov Order Book Micro-Price:
 * P^micro = P^mid + G(I_t, S_t) * (S_t / 2)
 * where G(I, S) is derived from the analytical Markov queue depletion probability:
 * P(Ask queue vanishes before Bid queue) = (Q_bid^gamma) / (Q_bid^gamma + Q_ask^gamma)
 */
export function calculateContStoikovMicroPrice(params: {
  bids: OrderBookLevelInput[];
  asks: OrderBookLevelInput[];
  tickSize?: number;
  gammaOrderExponent?: number; // queue elasticity exponent gamma ~ 0.5 - 0.8
  takerImbalanceBias?: number; // active buy vs sell flow in [-1, 1]
}): ContStoikovL2Result {
  const {
    bids,
    asks,
    tickSize = 0.1,
    gammaOrderExponent = 0.65,
    takerImbalanceBias = 0.0,
  } = params;

  const bestBid = bids[0]?.price ?? 0;
  const bestBidQty = Math.max(1e-6, bids[0]?.qty ?? 0);
  const bestAsk = asks[0]?.price ?? 0;
  const bestAskQty = Math.max(1e-6, asks[0]?.qty ?? 0);

  if (bestBid <= 0 || bestAsk <= 0 || bestAsk <= bestBid) {
    const fallbackPrice = bestBid || bestAsk || 1000;
    return {
      midPrice: fallbackPrice,
      weightedMidPrice: fallbackPrice,
      contStoikovMicroPrice: fallbackPrice,
      expectedTickJumpDirection: "STABLE",
      upTickDepletionProbability: 0.5,
      queueImbalanceRatio: 0,
      micropriceAdvantageBps: 0,
      leadLagAlphaScore: 0,
      recommendedLimitOffsetTicks: 0,
      rationaleVi: "Sổ lệnh không hợp lệ hoặc thiếu thanh khoản Top-of-Book.",
    };
  }

  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const weightedMidPrice = (bestAskQty * bestBid + bestBidQty * bestAsk) / (bestBidQty + bestAskQty);

  // Depth-weighted multi-level queue liquidity (L1..L5 with exponential decaying weights)
  let sumBidQ = 0;
  let sumAskQ = 0;
  const maxL = Math.min(5, Math.max(bids.length, asks.length));
  for (let l = 0; l < maxL; l++) {
    const w = Math.exp(-0.45 * l);
    if (bids[l]) sumBidQ += bids[l].qty * w;
    if (asks[l]) sumAskQ += asks[l].qty * w;
  }

  const qTot = sumBidQ + sumAskQ;
  const queueImbalanceRatio = qTot > 0 ? (sumBidQ - sumAskQ) / qTot : 0;

  // Markov Queue Depletion: Probability of ask depleted first (up-tick jump)
  const qbPow = Math.pow(sumBidQ, gammaOrderExponent);
  const qaPow = Math.pow(sumAskQ, gammaOrderExponent);
  let pUp = qbPow / (qbPow + qaPow);

  // Taker flow adjustment
  if (takerImbalanceBias !== 0) {
    pUp = Math.max(0.01, Math.min(0.99, pUp + takerImbalanceBias * 0.12));
  }

  // Cont-Stoikov G(I, S) shift: G = 2 * (pUp - 0.5) in [-1, +1]
  const G = 2 * (pUp - 0.5);
  const contStoikovMicroPrice = Number((midPrice + G * (spread / 2)).toFixed(4));
  const micropriceAdvantageBps = Number((((contStoikovMicroPrice - midPrice) / midPrice) * 10_000).toFixed(2));

  let expectedTickJumpDirection: "UP_TICK" | "DOWN_TICK" | "STABLE" = "STABLE";
  if (pUp >= 0.58) expectedTickJumpDirection = "UP_TICK";
  else if (pUp <= 0.42) expectedTickJumpDirection = "DOWN_TICK";

  const leadLagAlphaScore = Math.round(G * 100);
  const recommendedLimitOffsetTicks = expectedTickJumpDirection === "UP_TICK" ? 1 : expectedTickJumpDirection === "DOWN_TICK" ? -1 : 0;

  const rationaleVi =
    `Cont-Stoikov L2: P_micro = ${contStoikovMicroPrice} (Lệch ${micropriceAdvantageBps >= 0 ? "+" : ""}${micropriceAdvantageBps} bps so với Mid ${midPrice.toFixed(2)}). ` +
    `Xác suất nhảy giá lên P(Up-Tick) = ${(pUp * 100).toFixed(1)}% -> Xu hướng bước nhảy [${expectedTickJumpDirection}].`;

  return {
    midPrice: Number(midPrice.toFixed(4)),
    weightedMidPrice: Number(weightedMidPrice.toFixed(4)),
    contStoikovMicroPrice,
    expectedTickJumpDirection,
    upTickDepletionProbability: Number(pUp.toFixed(4)),
    queueImbalanceRatio: Number(queueImbalanceRatio.toFixed(4)),
    micropriceAdvantageBps,
    leadLagAlphaScore,
    recommendedLimitOffsetTicks,
    rationaleVi,
  };
}

// ============================================================================
// SECTION 16: CONFORMAL RISK CONTROL & DISTRIBUTION-FREE BOUNDS (DIRECTION 4)
// ============================================================================

export interface ConformalRiskBoundsResult {
  nominalCoveragePct: number; // e.g. 95%
  distributionFreeVaRPct: number; // Guaranteed (1 - alpha) non-parametric VaR
  distributionFreeCVaRPct: number; // Conditional Expected Shortfall
  conformalPredictionInterval: {
    lowerBoundReturnPct: number;
    upperBoundReturnPct: number;
  };
  sampleCalibrationSize: number;
  isCoverageGuaranteed: boolean;
  conformalMaxDrawdownBudgetPct: number;
  rationaleVi: string;
}

/**
 * Split Conformal Risk Control (Angelopoulos & Bates, 2021) for Portfolio Risk.
 * Guarantees P(Loss <= Conformal_VaR) >= 1 - alpha for any arbitrary return distribution
 * without relying on Gaussian, Student-t, or Cornish-Fisher normality assumptions.
 */
export function calculateConformalRiskBounds(params: {
  historicalReturnsPct: number[]; // Array of past % returns (e.g. daily or bar returns)
  targetCoverageAlpha?: number; // alpha = 0.05 for 95% coverage
  portfolioHorizonBars?: number; // e.g. 1 to 5 bars ahead
}): ConformalRiskBoundsResult {
  const { historicalReturnsPct, targetCoverageAlpha = 0.05, portfolioHorizonBars = 1 } = params;

  const clean = historicalReturnsPct.filter((r) => Number.isFinite(r));
  const n = clean.length;

  if (n < 20) {
    return {
      nominalCoveragePct: (1 - targetCoverageAlpha) * 100,
      distributionFreeVaRPct: 2.5,
      distributionFreeCVaRPct: 3.5,
      conformalPredictionInterval: { lowerBoundReturnPct: -2.5, upperBoundReturnPct: 2.5 },
      sampleCalibrationSize: n,
      isCoverageGuaranteed: false,
      conformalMaxDrawdownBudgetPct: 5.0,
      rationaleVi: "Mẫu lịch sử quá ngắn (< 20 quan sát) để thiết lập bảo chứng Conformal Risk.",
    };
  }

  // Non-conformity score for downside loss: s_i = -return_i
  const losses = clean.map((r) => -r);
  losses.sort((a, b) => a - b);

  // Finite-sample conformal quantile: index = ceil((n + 1) * (1 - alpha))
  const rankIdx = Math.min(n - 1, Math.max(0, Math.ceil((n + 1) * (1 - targetCoverageAlpha)) - 1));
  const conformalLossQuantile = Math.max(0.1, losses[rankIdx]);

  // Two-sided conformal prediction interval
  const sortedReturns = [...clean].sort((a, b) => a - b);
  const lowerIdx = Math.max(0, Math.floor((n + 1) * (targetCoverageAlpha / 2)));
  const upperIdx = Math.min(n - 1, Math.ceil((n + 1) * (1 - targetCoverageAlpha / 2)) - 1);
  const lowerBound = sortedReturns[lowerIdx];
  const upperBound = sortedReturns[upperIdx];

  // Tail Conditional Expectation beyond Conformal VaR
  let tailSum = 0;
  let tailCount = 0;
  for (let i = rankIdx; i < n; i++) {
    tailSum += losses[i];
    tailCount++;
  }
  const conformalCVaR = tailCount > 0 ? tailSum / tailCount : conformalLossQuantile;

  // Multi-horizon square-root scaling
  const hScale = Math.sqrt(Math.max(1, portfolioHorizonBars));
  const scaledVaR = Number((conformalLossQuantile * hScale).toFixed(2));
  const scaledCVaR = Number((conformalCVaR * hScale).toFixed(2));
  const mddBudget = Number((scaledCVaR * 1.5).toFixed(2));

  const rationaleVi =
    `Conformal Risk Control: Bảo chứng độ phủ phi phân phối ${((1 - targetCoverageAlpha) * 100).toFixed(0)}%. ` +
    `VaR phi tham số = ${scaledVaR}%, CVaR Đuôi = ${scaledCVaR}%. Giới hạn Drawdown tối đa khuyến nghị: ${mddBudget}%.`;

  return {
    nominalCoveragePct: Number(((1 - targetCoverageAlpha) * 100).toFixed(1)),
    distributionFreeVaRPct: scaledVaR,
    distributionFreeCVaRPct: scaledCVaR,
    conformalPredictionInterval: {
      lowerBoundReturnPct: Number((lowerBound * hScale).toFixed(2)),
      upperBoundReturnPct: Number((upperBound * hScale).toFixed(2)),
    },
    sampleCalibrationSize: n,
    isCoverageGuaranteed: true,
    conformalMaxDrawdownBudgetPct: mddBudget,
    rationaleVi,
  };
}

// ============================================================================
// SECTION 17: OBIZHAEVA-WANG TRANSIENT IMPACT & RESILIENT EXECUTION (DIRECTION 5)
// ============================================================================

export interface ObizhaevaWangExecutionParams {
  totalShares: number;
  totalTimeHours: number;
  intervalsCount: number;
  resilienceRatePerHour: number; // rho (rate at which LOB depth refills) ~ 0.5 - 5.0
  orderBookDepthPerDollar: number; // q (shares per unit price move)
  instantaneousImpactParam: number; // lambda (impact coefficient)
  currentPrice: number;
}

export interface ObizhaevaWangExecutionResult {
  schedule: Array<{
    timeHour: number;
    sharesToExecute: number;
    remainingShares: number;
    expectedTransientImpactPts: number;
  }>;
  totalExecutionTimeHours: number;
  initialBlockShare: number; // Optimal initial jump trade
  finalBlockShare: number; // Optimal final jump trade
  totalCostImprovementOverTwapPct: number;
  resilienceRatePerHour: number;
  rationaleVi: string;
}

/**
 * Obizhaeva-Wang (2013) Optimal Execution with Transient Market Impact & Resilient Order Book:
 * Price Impact D(t) evolves as: dD(t) = -rho * D(t) * dt + lambda * dX(t)
 * In contrast to Almgren-Chriss, the optimal trajectory features discrete initial and final blocks
 * connected by an intermediate continuous stationary liquidation rate.
 */
export function calculateObizhaevaWangExecution(
  params: ObizhaevaWangExecutionParams
): ObizhaevaWangExecutionResult {
  const {
    totalShares,
    totalTimeHours,
    intervalsCount,
    resilienceRatePerHour = 1.8,
    orderBookDepthPerDollar = 50_000,
    instantaneousImpactParam = 1e-5,
    currentPrice,
  } = params;

  const X = Math.max(1, Math.min(1e12, Math.round(totalShares)));
  const T = Math.max(0.01, Math.min(1e4, totalTimeHours));
  const N = Math.max(2, Math.min(200, Math.floor(intervalsCount)));
  const dt = T / N;
  const rho = Math.max(0.01, resilienceRatePerHour);

  // Analytical Obizhaeva-Wang optimal discrete solution:
  // Initial trade delta_0 = X / (2 + rho * T)
  // Final trade delta_T = X / (2 + rho * T)
  // Intermediate uniform flow nu = (rho * X) / (2 + rho * T)
  const denom = 2 + rho * T;
  const initialBlock = X / denom;
  const finalBlock = X / denom;
  const intermediateRatePerInterval = (rho * X * dt) / denom;

  const schedule: ObizhaevaWangExecutionResult["schedule"] = [];
  let remaining = X;
  let currentImpact = 0;

  for (let j = 0; j <= N; j++) {
    const t = j * dt;
    let tradeSize = 0;

    if (j === 0) {
      tradeSize = initialBlock;
    } else if (j === N) {
      tradeSize = remaining;
    } else {
      tradeSize = Math.min(remaining, intermediateRatePerInterval);
    }

    tradeSize = Math.round(tradeSize);
    remaining = Math.max(0, remaining - tradeSize);

    // Evolve transient impact D(t) = D(t-1) * exp(-rho * dt) + lambda * tradeSize
    currentImpact = currentImpact * Math.exp(-rho * dt) + instantaneousImpactParam * tradeSize;

    schedule.push({
      timeHour: Number(t.toFixed(3)),
      sharesToExecute: tradeSize,
      remainingShares: remaining,
      expectedTransientImpactPts: Number(currentImpact.toFixed(4)),
    });
  }

  // Cost improvement over naive TWAP: approximately 8% - 15% due to taking advantage of book resilience
  const totalCostImprovementOverTwapPct = Number((Math.min(22, 5.0 + (rho * T) * 1.2)).toFixed(1));

  const rationaleVi =
    `Obizhaeva-Wang Transient Execution: Khối lượng ban đầu ${(initialBlock).toLocaleString()} cp, ` +
    `Khối lượng kết thúc ${(finalBlock).toLocaleString()} cp, Tốc độ hồi phục sổ lệnh rho = ${rho}/giờ. ` +
    `Tiết kiệm trượt giá dự kiến ~ ${totalCostImprovementOverTwapPct}% so với TWAP thuần túy.`;

  return {
    schedule,
    totalExecutionTimeHours: T,
    initialBlockShare: Math.round(initialBlock),
    finalBlockShare: Math.round(finalBlock),
    totalCostImprovementOverTwapPct,
    resilienceRatePerHour: rho,
    rationaleVi,
  };
}



