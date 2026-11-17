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
