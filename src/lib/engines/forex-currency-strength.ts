/**
 * CURRENCY STRENGTH MATRIX (CSM) & CORRELATION ENGINE
 *
 * Deconstructs the relative strength of the 8 major world currencies:
 * USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD
 * By analyzing price change rates across all 28 major and cross pairs.
 */

export type MajorCurrency = "USD" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD" | "CHF" | "NZD";

export const MAJOR_CURRENCIES: MajorCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
];

export interface CurrencyStrengthScore {
  currency: MajorCurrency;
  score: number; // 0.0 to 10.0 scale
  rawScore: number;
  status: "SUPER_STRONG" | "STRONG" | "NEUTRAL" | "WEAK" | "SUPER_WEAK";
  tone: "up" | "down" | "neutral";
  changePct: number;
}

export interface PairPriceInput {
  pair: string; // e.g. "EURUSD"
  price: number;
  changePercent: number; // e.g. +0.35 (%)
}

export interface CurrencyStrengthMatrixResult {
  scores: CurrencyStrengthScore[];
  strongest: CurrencyStrengthScore;
  weakest: CurrencyStrengthScore;
  bestPairToTrade: {
    pair: string;
    action: "BUY" | "SELL";
    strengthDiff: number;
    reasoning: string;
  };
  correlations: {
    pairA: string;
    pairB: string;
    correlation: number; // -1.0 to +1.0
    riskWarning?: string;
  }[];
  dxyEstimate: {
    bias: "BULLISH" | "BEARISH" | "NEUTRAL";
    score: number;
    commentary: string;
  };
  timestamp: number;
}

// Standard benchmark correlation coefficients between major pairs
const BENCHMARK_CORRELATIONS: { pairA: string; pairB: string; corr: number }[] = [
  { pairA: "EURUSD", pairB: "GBPUSD", corr: 0.86 },
  { pairA: "EURUSD", pairB: "USDCHF", corr: -0.93 },
  { pairA: "EURUSD", pairB: "USDJPY", corr: -0.45 },
  { pairA: "AUDUSD", pairB: "NZDUSD", corr: 0.91 },
  { pairA: "USDCAD", pairB: "OILUSD", corr: -0.78 },
  { pairA: "XAUUSD", pairB: "EURUSD", corr: 0.65 },
  { pairA: "XAUUSD", pairB: "USDJPY", corr: -0.58 },
  { pairA: "GBPUSD", pairB: "EURGBP", corr: -0.79 },
];

/**
 * Calculates Currency Strength Matrix from pair price changes.
 */
export function calculateCurrencyStrengthMatrix(
  pairs: PairPriceInput[]
): CurrencyStrengthMatrixResult {
  // Map of accumulated points for each currency
  const currencyPoints: Record<MajorCurrency, { totalChange: number; count: number }> = {
    USD: { totalChange: 0, count: 0 },
    EUR: { totalChange: 0, count: 0 },
    GBP: { totalChange: 0, count: 0 },
    JPY: { totalChange: 0, count: 0 },
    AUD: { totalChange: 0, count: 0 },
    CAD: { totalChange: 0, count: 0 },
    CHF: { totalChange: 0, count: 0 },
    NZD: { totalChange: 0, count: 0 },
  };

  for (const item of pairs) {
    const clean = item.pair.toUpperCase().replace("/", "").replace("-", "");
    if (clean.length < 6) continue;
    const base = clean.slice(0, 3) as MajorCurrency;
    const quote = clean.slice(3, 6) as MajorCurrency;

    const chg = Number.isFinite(item.changePercent) ? item.changePercent : 0;

    // Base currency benefits from positive pair change
    if (currencyPoints[base]) {
      currencyPoints[base].totalChange += chg;
      currencyPoints[base].count += 1;
    }
    // Quote currency is inversely affected
    if (currencyPoints[quote]) {
      currencyPoints[quote].totalChange -= chg;
      currencyPoints[quote].count += 1;
    }
  }

  // Calculate raw average change for each currency
  const rawResults: { curr: MajorCurrency; avgChange: number }[] = [];
  for (const curr of MAJOR_CURRENCIES) {
    const data = currencyPoints[curr];
    const avgChange = data.count > 0 ? data.totalChange / data.count : 0;
    rawResults.push({ curr, avgChange });
  }

  // Find min and max for normalization onto 0 - 10 scale
  const avgChanges = rawResults.map((r) => r.avgChange);
  const minChange = Math.min(...avgChanges, -0.8);
  const maxChange = Math.max(...avgChanges, 0.8);
  const range = maxChange - minChange || 1.0;

  const scores: CurrencyStrengthScore[] = rawResults.map(({ curr, avgChange }) => {
    // Normalization onto 0.0 - 10.0 scale, centered at 5.0
    const normalized = ((avgChange - minChange) / range) * 8.0 + 1.0;
    const score = Math.round(Math.min(9.9, Math.max(0.1, normalized)) * 10) / 10;

    let status: CurrencyStrengthScore["status"] = "NEUTRAL";
    let tone: CurrencyStrengthScore["tone"] = "neutral";

    if (score >= 7.8) {
      status = "SUPER_STRONG";
      tone = "up";
    } else if (score >= 6.0) {
      status = "STRONG";
      tone = "up";
    } else if (score <= 2.2) {
      status = "SUPER_WEAK";
      tone = "down";
    } else if (score <= 4.0) {
      status = "WEAK";
      tone = "down";
    }

    return {
      currency: curr,
      score,
      rawScore: Math.round(avgChange * 100) / 100,
      status,
      tone,
      changePct: Math.round(avgChange * 100) / 100,
    };
  });

  // Sort descending by score
  scores.sort((a, b) => b.score - a.score);

  const strongest = scores[0];
  const weakest = scores[scores.length - 1];
  const strengthDiff = Math.round((strongest.score - weakest.score) * 10) / 10;

  // Determine best pair to trade
  let bestPair = `${strongest.currency}${weakest.currency}`;
  let action: "BUY" | "SELL" = "BUY";

  // Check if standard market quote convention is reversed
  // Standard majors: EUR/..., GBP/..., AUD/..., NZD/..., USD/..., CAD/..., CHF/...
  const priorityOrder: MajorCurrency[] = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];
  const strongIdx = priorityOrder.indexOf(strongest.currency);
  const weakIdx = priorityOrder.indexOf(weakest.currency);

  if (strongIdx > weakIdx) {
    // e.g. Weak is EUR (idx 0), Strong is USD (idx 4) -> pair convention is EURUSD -> SELL
    bestPair = `${weakest.currency}${strongest.currency}`;
    action = "SELL";
  } else {
    // e.g. Strong is EUR (idx 0), Weak is USD (idx 4) -> pair convention is EURUSD -> BUY
    bestPair = `${strongest.currency}${weakest.currency}`;
    action = "BUY";
  }

  const bestPairToTrade = {
    pair: bestPair,
    action,
    strengthDiff,
    reasoning: `Đồng mạnh nhất là ${strongest.currency} (${strongest.score}/10) đối đầu với đồng yếu nhất là ${weakest.currency} (${weakest.score}/10). Độ lệch pha lực đẩy: ${strengthDiff} điểm.`,
  };

  // DXY Estimation from USD strength score
  const usdScore = scores.find((s) => s.currency === "USD")?.score ?? 5.0;
  const dxyBias = usdScore >= 6.2 ? "BULLISH" : usdScore <= 3.8 ? "BEARISH" : "NEUTRAL";
  const dxyCommentary =
    dxyBias === "BULLISH"
      ? `USD Index đang tích lũy áp lực tăng mạnh (${usdScore}/10). Ưu tiên SHORT các cặp EUR/USD, GBP/USD, AUD/USD.`
      : dxyBias === "BEARISH"
      ? `USD suy yếu diện rộng (${usdScore}/10). Dòng tiền dịch chuyển sang kim loại quý (XAU) và các đồng tiền hàng hóa.`
      : `USD dao động trung tính (${usdScore}/10). Thị trường phân hóa mạnh tại các cặp tiền chéo (Cross pairs).`;

  // Filter correlations and attach exposure warnings
  const correlations = BENCHMARK_CORRELATIONS.map((c) => {
    let riskWarning: string | undefined;
    if (c.corr >= 0.8) {
      riskWarning = `Tương quan dương cao (+${c.corr}). Không nên vào cùng hướng BUY hoặc SELL cả 2 cặp này để tránh nhân đôi rủi ro (Double Exposure).`;
    } else if (c.corr <= -0.85) {
      riskWarning = `Tương quan nghịch rất mạnh (${c.corr}). Mua ${c.pairA} và Mua ${c.pairB} tạo ra thế phòng vệ (Hedging), triệt tiêu biến động.`;
    }
    return {
      pairA: c.pairA,
      pairB: c.pairB,
      correlation: c.corr,
      riskWarning,
    };
  });

  return {
    scores,
    strongest,
    weakest,
    bestPairToTrade,
    correlations,
    dxyEstimate: {
      bias: dxyBias,
      score: usdScore,
      commentary: dxyCommentary,
    },
    timestamp: Date.now(),
  };
}

export interface PairFactorDecomposition {
  pair: string;
  base: MajorCurrency;
  quote: MajorCurrency;
  observedReturnPct: number;
  baseFactorPct: number;
  quoteFactorPct: number;
  usdFactorContributionPct: number;
  idiosyncraticResidualPct: number;
  usdVarianceSharePct: number;
  driverType: "USD_MACRO_SHOCK" | "IDIOSYNCRATIC_PAIR_ALPHA" | "CROSS_FACTOR_DIVERGENCE";
}

export interface OrthogonalCurrencyFactorResult {
  latentFactorsPct: Record<MajorCurrency, number>; // Zero-sum orthogonal currency factors: sum_c f_c = 0
  usdShockDominancePct: number; // % of total G8 cross-section variance driven by USD factor
  pairDecompositions: PairFactorDecomposition[];
}

/**
 * Orthogonal Currency Factor Decomposition:
 * Solves the zero-sum linear factor system r_{AB} = f_A - f_B + eps_{AB} subject to sum_{c in G8} f_c = 0
 * via pseudoinverse / graph Laplacian least-squares, separating USD macro shocks from pair-specific alpha.
 */
export function decomposeOrthogonalCurrencyFactors(
  pairs: PairPriceInput[],
): OrthogonalCurrencyFactorResult {
  const sumDiff: Record<MajorCurrency, number> = {
    USD: 0,
    EUR: 0,
    GBP: 0,
    JPY: 0,
    AUD: 0,
    CAD: 0,
    CHF: 0,
    NZD: 0,
  };
  const deg: Record<MajorCurrency, number> = {
    USD: 0,
    EUR: 0,
    GBP: 0,
    JPY: 0,
    AUD: 0,
    CAD: 0,
    CHF: 0,
    NZD: 0,
  };
  const adj: Record<MajorCurrency, Partial<Record<MajorCurrency, number>>> = {
    USD: {},
    EUR: {},
    GBP: {},
    JPY: {},
    AUD: {},
    CAD: {},
    CHF: {},
    NZD: {},
  };

  const validPairs: { pair: string; base: MajorCurrency; quote: MajorCurrency; r: number }[] = [];

  for (const item of pairs) {
    const clean = item.pair.toUpperCase().replace(/[^A-Z]/g, "");
    if (clean.length < 6) continue;
    const base = clean.slice(0, 3) as MajorCurrency;
    const quote = clean.slice(3, 6) as MajorCurrency;
    if (!(base in sumDiff) || !(quote in sumDiff) || base === quote) continue;
    const r = Number.isFinite(item.changePercent) ? item.changePercent : 0;

    sumDiff[base] += r;
    sumDiff[quote] -= r;
    deg[base] += 1;
    deg[quote] += 1;
    adj[base][quote] = (adj[base][quote] ?? 0) + 1;
    adj[quote][base] = (adj[quote][base] ?? 0) + 1;
    validPairs.push({ pair: clean.slice(0, 6), base, quote, r });
  }

  // Solve Laplacian system L * f = sumDiff with zero-mean projection (Jacobi relaxation converges in < 25 steps)
  const f: Record<MajorCurrency, number> = {
    USD: 0,
    EUR: 0,
    GBP: 0,
    JPY: 0,
    AUD: 0,
    CAD: 0,
    CHF: 0,
    NZD: 0,
  };

  for (let iter = 0; iter < 30; iter++) {
    const nextF = { ...f };
    for (const c of MAJOR_CURRENCIES) {
      const d = deg[c];
      if (d <= 0) continue;
      let neighborSum = 0;
      for (const nb of MAJOR_CURRENCIES) {
        if (nb !== c && adj[c][nb]) {
          neighborSum += (adj[c][nb] ?? 0) * f[nb];
        }
      }
      nextF[c] = (sumDiff[c] + neighborSum) / d;
    }
    // Enforce strict zero-sum orthogonality constraint: sum_{c in G8} f_c === 0
    const meanF = MAJOR_CURRENCIES.reduce((s, c) => s + nextF[c], 0) / MAJOR_CURRENCIES.length;
    for (const c of MAJOR_CURRENCIES) {
      f[c] = nextF[c] - meanF;
    }
  }

  const latentFactorsPct = {} as Record<MajorCurrency, number>;
  let totalFactorSq = 0;
  for (const c of MAJOR_CURRENCIES) {
    latentFactorsPct[c] = Number(f[c].toFixed(4));
    totalFactorSq += f[c] * f[c];
  }

  const usdFactorSq = f.USD * f.USD;
  const usdShockDominancePct =
    totalFactorSq > 1e-9
      ? Number(Math.min(100, ((usdFactorSq * 2.5) / totalFactorSq) * 100).toFixed(1))
      : 0;

  const pairDecompositions: PairFactorDecomposition[] = validPairs.map(({ pair, base, quote, r }) => {
    const fBase = f[base];
    const fQuote = f[quote];
    const fitted = fBase - fQuote;
    const residual = r - fitted;
    const usdContrib = base === "USD" ? fBase : quote === "USD" ? -fQuote : 0;
    const nonUsdContrib = base === "USD" ? -fQuote : quote === "USD" ? fBase : fBase - fQuote;
    const totalExplain = Math.abs(usdContrib) + Math.abs(nonUsdContrib) + Math.abs(residual) || 1;
    const usdVarianceSharePct = Number(((Math.abs(usdContrib) / totalExplain) * 100).toFixed(1));

    let driverType: PairFactorDecomposition["driverType"] = "CROSS_FACTOR_DIVERGENCE";
    if (usdVarianceSharePct >= 52) {
      driverType = "USD_MACRO_SHOCK";
    } else if (Math.abs(residual) >= Math.abs(fitted) * 0.65 || Math.abs(nonUsdContrib) > Math.abs(usdContrib) * 1.2) {
      driverType = "IDIOSYNCRATIC_PAIR_ALPHA";
    }

    return {
      pair,
      base,
      quote,
      observedReturnPct: Number(r.toFixed(4)),
      baseFactorPct: Number(fBase.toFixed(4)),
      quoteFactorPct: Number(fQuote.toFixed(4)),
      usdFactorContributionPct: Number(usdContrib.toFixed(4)),
      idiosyncraticResidualPct: Number(residual.toFixed(4)),
      usdVarianceSharePct,
      driverType,
    };
  });

  return {
    latentFactorsPct,
    usdShockDominancePct,
    pairDecompositions,
  };
}

/**
 * Filters candidate Forex trade signals to eliminate redundant USD-factor concentration
 * (e.g. simultaneously entering Long EURUSD, GBPUSD, AUDUSD, XAUUSD on a single USD shock).
 */
export function filterRedundantUsdClusterSignals<
  T extends { pair: string; direction: "BUY" | "SELL"; score: number },
>(candidates: T[], maxSameUsdDirection = 2): { accepted: T[]; rejectedUsdDuplicates: T[] } {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const accepted: T[] = [];
  const rejectedUsdDuplicates: T[] = [];
  let longUsdCount = 0;
  let shortUsdCount = 0;

  for (const c of sorted) {
    const clean = c.pair.toUpperCase().replace(/[^A-Z]/g, "");
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    const isUsdPair = base === "USD" || quote === "USD";

    if (!isUsdPair) {
      accepted.push(c);
      continue;
    }

    // Determine effective USD exposure direction (+1 = Long USD, -1 = Short USD)
    const usdDir =
      (base === "USD" && c.direction === "BUY") || (quote === "USD" && c.direction === "SELL")
        ? 1
        : -1;

    if (usdDir === 1) {
      if (longUsdCount >= maxSameUsdDirection) {
        rejectedUsdDuplicates.push(c);
        continue;
      }
      longUsdCount++;
    } else {
      if (shortUsdCount >= maxSameUsdDirection) {
        rejectedUsdDuplicates.push(c);
        continue;
      }
      shortUsdCount++;
    }
    accepted.push(c);
  }

  return { accepted, rejectedUsdDuplicates };
}

export interface TriangularParityCheckResult {
  pair: string;
  alignment: "CONFIRMED" | "DIVERGENT_FAKEOUT" | "NEUTRAL";
  observedReturnPct: number;
  syntheticReturnPct: number;
  parityDiscrepancyPct: number;
  rationaleVi: string;
}

/**
 * Evaluates Triangular Synthetic Cross-Rate Parity & G8 Orthogonal Factor Confirmation.
 * For non-USD cross pairs (e.g. EURJPY, GBPJPY, EURGBP, AUDJPY), compares the observed return r_{AB}
 * against the synthetic USD-leg triangular return (r_{A,USD} - r_{B,USD}) and latent orthogonal factors (f_A - f_B).
 * For USD major pairs, compares observed return against the G8 Laplacian orthogonal factor spread.
 */
export function evaluateTriangularCrossParity(
  pairRaw: string,
  pairs: PairPriceInput[],
): TriangularParityCheckResult {
  const clean = pairRaw.toUpperCase().replace(/[^A-Z]/g, "");
  if (clean.length < 6 || pairs.length < 4) {
    return {
      pair: clean,
      alignment: "NEUTRAL",
      observedReturnPct: 0,
      syntheticReturnPct: 0,
      parityDiscrepancyPct: 0,
      rationaleVi: "Chưa đủ dữ liệu rổ tiền tệ để kiểm định tam giác tỷ giá.",
    };
  }

  const base = clean.slice(0, 3) as MajorCurrency;
  const quote = clean.slice(3, 6) as MajorCurrency;
  if (!MAJOR_CURRENCIES.includes(base) || !MAJOR_CURRENCIES.includes(quote) || base === quote) {
    return {
      pair: clean,
      alignment: "NEUTRAL",
      observedReturnPct: 0,
      syntheticReturnPct: 0,
      parityDiscrepancyPct: 0,
      rationaleVi: "Cặp tài sản ngoài rổ tiền tệ G8 chuẩn.",
    };
  }

  const returnMap = new Map<string, number>();
  for (const item of pairs) {
    const pClean = item.pair.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
    if (pClean.length === 6 && Number.isFinite(item.changePercent)) {
      returnMap.set(pClean, item.changePercent);
    }
  }

  // Signed return of currency C against USD (+% means C appreciated vs USD)
  const getReturnVsUsd = (curr: MajorCurrency): number | null => {
    if (curr === "USD") return 0;
    const direct = returnMap.get(`${curr}USD`);
    if (direct != null) return direct;
    const inverse = returnMap.get(`USD${curr}`);
    if (inverse != null) return -inverse;
    return null;
  };

  const ortho = decomposeOrthogonalCurrencyFactors(pairs);
  const fBase = ortho.latentFactorsPct[base] ?? 0;
  const fQuote = ortho.latentFactorsPct[quote] ?? 0;
  const factorFittedPct = fBase - fQuote;

  const observed =
    returnMap.get(clean) ??
    (returnMap.has(`${quote}${base}`) ? -(returnMap.get(`${quote}${base}`) ?? 0) : factorFittedPct);

  const rBaseUsd = getReturnVsUsd(base);
  const rQuoteUsd = getReturnVsUsd(quote);
  const isCrossPair = base !== "USD" && quote !== "USD";

  // For cross pairs (e.g. EURJPY), synthetic return = r(EUR/USD) - r(JPY/USD) = r(EURUSD) + r(USDJPY)
  const synthetic =
    isCrossPair && rBaseUsd != null && rQuoteUsd != null
      ? Number((rBaseUsd - rQuoteUsd).toFixed(4))
      : Number(factorFittedPct.toFixed(4));

  const discrepancy = Number((observed - synthetic).toFixed(4));
  const absObs = Math.abs(observed);
  const absSyn = Math.abs(synthetic);

  if (absObs >= 0.08 && observed * synthetic > 0 && absSyn >= absObs * 0.45) {
    return {
      pair: clean,
      alignment: "CONFIRMED",
      observedReturnPct: Number(observed.toFixed(4)),
      syntheticReturnPct: synthetic,
      parityDiscrepancyPct: discrepancy,
      rationaleVi: isCrossPair
        ? `Tam giác tỷ giá chéo ${base}/${quote} đồng thuận 2 chân USD gốc (Thực ${observed >= 0 ? "+" : ""}${observed.toFixed(2)}% vs Tổng hợp ${synthetic >= 0 ? "+" : ""}${synthetic.toFixed(2)}%).`
        : `Nhân tố trực giao G8 xác nhận xung lượng ${base}/${quote} (${synthetic >= 0 ? "+" : ""}${synthetic.toFixed(2)}%).`,
    };
  }

  if (absObs >= 0.14 && observed * synthetic < 0 && Math.abs(discrepancy) >= 0.22) {
    return {
      pair: clean,
      alignment: "DIVERGENT_FAKEOUT",
      observedReturnPct: Number(observed.toFixed(4)),
      syntheticReturnPct: synthetic,
      parityDiscrepancyPct: discrepancy,
      rationaleVi: `Bẫy lệch tam giác tỷ giá ${base}/${quote}: Giá nhảy đơn lẻ (${observed >= 0 ? "+" : ""}${observed.toFixed(2)}%) ngược hoàn toàn 2 chân tỷ giá tổng hợp (${synthetic >= 0 ? "+" : ""}${synthetic.toFixed(2)}%).`,
    };
  }

  return {
    pair: clean,
    alignment: "NEUTRAL",
    observedReturnPct: Number(observed.toFixed(4)),
    syntheticReturnPct: synthetic,
    parityDiscrepancyPct: discrepancy,
    rationaleVi: `Tam giác tỷ giá ${base}/${quote} ở trạng thái cân bằng.`,
  };
}


