/**
 * HISTORICAL PRICE ACTION TRAINER & EMPIRICAL EDGE ENGINE
 *
 * Scans, back-calibrates, and trains historical OHLCV price action (120 - 180 bars)
 * to strengthen conviction for CURRENT price action and filter out deceptive bull-traps.
 *
 * Core Quantitative & Empirical Principles:
 * 1. Historical Setup Success Rate (Empirical Win-Rate):
 *    Scans rolling historical trade setups (Breakouts, Pullback Rebounds, Pocket Pivots)
 *    and evaluates whether the stock historically reaches profit targets (+7% to +15%)
 *    prior to hitting stop losses (-5% to -7%).
 *
 * 2. Institutional Volume Up/Down Accumulation Ratio (50-bar VR_UD):
 *    Ratio of total volume on accumulation days (Close > PrevClose) vs distribution days.
 *    VR_UD > 1.25 indicates strong institutional accumulation backing current action.
 *    VR_UD < 0.8 indicates stealth institutional distribution / fakeout vulnerability.
 *
 * 3. Moving Average Rebound Fidelity:
 *    Empirical bounce success rate when price retests MA20 or MA50 during uptrends.
 *
 * 4. Fakeout & Noise Penalty:
 *    Measures historical volatility noise and false breakout rate to protect against whipsaws.
 *
 * 5. Composite Historical Edge Score (0 - 100):
 *    Synthesizes historical empirical evidence into a robust conviction multiplier
 *    for real-time stock screening.
 */

export interface HistoricalPriceBar {
  time?: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type HistoricalEdgeBadge =
  | "HIGH_EDGE"          // >= 75: Vượt trội, xác suất thành công thực nghiệm cao
  | "POSITIVE_EDGE"      // 60 - 74: Lợi thế tích cực, dòng tiền lịch sử nâng đỡ
  | "NEUTRAL"            // 45 - 59: Trung tính, hành động giá bình thường
  | "HIGH_FAKEOUT_RISK"; // < 45: Cảnh báo bẫy giá / phân phối ngầm lịch sử

export interface HistoricalEdgeMetrics {
  historicalWinRatePct: number;    // % win rate of past setups (e.g. 68.5%)
  sampleTrades: number;            // Number of historical setups evaluated
  upDownVolRatio: number;          // Accumulation vs distribution volume ratio (e.g. 1.35)
  supportBounceRatePct: number;    // Bounce rate on MA20/MA50 retests (e.g. 75.0%)
  fakeoutRiskPct: number;          // Probability of false breakout (e.g. 18.0%)
  historicalEdgeScore: number;     // Composite 0 - 100 empirical rating
  historicalEdgeBadge: HistoricalEdgeBadge;
  empiricalBonus: number;          // -15 to +15 score adjustment for current setups
  verdictVi: string;               // Concise Vietnamese operational verdict
}

/**
 * Calculates simple moving average array
 */
function calculateSMA(series: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(series.length).fill(null);
  if (series.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += series[i];
  result[period - 1] = sum / period;

  for (let i = period; i < series.length; i++) {
    sum += series[i] - series[i - period];
    result[i] = sum / period;
  }
  return result;
}

/**
 * Analyzes rolling 50-bar Up/Down Volume Accumulation Ratio
 */
export function calculateUpDownVolumeRatio(bars: HistoricalPriceBar[], lookback = 50): number {
  if (!bars || bars.length < 3) return 1.0;
  const startIdx = Math.max(1, bars.length - lookback);

  let upVol = 0;
  let downVol = 0;

  for (let i = startIdx; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (cur.close > prev.close) {
      upVol += cur.volume;
    } else if (cur.close < prev.close) {
      downVol += cur.volume;
    } else {
      upVol += cur.volume * 0.5;
      downVol += cur.volume * 0.5;
    }
  }

  if (downVol === 0) return upVol > 0 ? 2.5 : 1.0;
  const ratio = upVol / downVol;
  return Number(Math.min(3.5, Math.max(0.2, ratio)).toFixed(2));
}

/**
 * Scans historical price action to train and calibrate empirical conviction
 */
export function trainHistoricalPriceAction(
  bars: HistoricalPriceBar[],
  options: {
    targetProfitPct?: number; // default: 10%
    stopLossPct?: number;     // default: 6%
    maxHoldingBars?: number;  // default: 15 bars
  } = {}
): HistoricalEdgeMetrics {
  const targetProfitPct = options.targetProfitPct ?? 10;
  const stopLossPct = options.stopLossPct ?? 6;
  const maxHoldingBars = options.maxHoldingBars ?? 15;

  if (!bars || bars.length < 35) {
    return {
      historicalWinRatePct: 50,
      sampleTrades: 0,
      upDownVolRatio: 1.0,
      supportBounceRatePct: 50,
      fakeoutRiskPct: 30,
      historicalEdgeScore: 50,
      historicalEdgeBadge: "NEUTRAL",
      empiricalBonus: 0,
      verdictVi: "Chưa đủ dữ liệu lịch sử để huấn luyện mô hình thực nghiệm.",
    };
  }

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);

  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  // 1. Simulate historical setup executions (Breakout, MA bounce, Pocket Pivot)
  interface SimTrade {
    entryIdx: number;
    entryPrice: number;
    outcome: "WIN" | "LOSS";
    maxGainPct: number;
  }

  const trades: SimTrade[] = [];
  let inPositionUntil = -1;
  let totalBreakoutAttempts = 0;
  let falseBreakouts = 0;

  let maSupportTests = 0;
  let maSupportBounces = 0;

  for (let i = 25; i < bars.length - 5; i++) {
    const curClose = closes[i];
    const prevClose = closes[i - 1];
    const curVol = volumes[i];

    // Compute 20-bar avg volume prior to i
    let sumV = 0;
    for (let v = i - 20; v < i; v++) sumV += volumes[v];
    const avgVol20 = sumV / 20;

    // Detect 20-day high breakout attempt
    let maxHigh20 = -Infinity;
    for (let h = i - 20; h < i; h++) {
      if (highs[h] > maxHigh20) maxHigh20 = highs[h];
    }

    const isBreakoutAttempt = curClose > maxHigh20 && curVol >= avgVol20 * 1.15;
    if (isBreakoutAttempt) {
      totalBreakoutAttempts++;
      // Check if it collapsed below breakout level within 3 bars
      let brokeDown = false;
      for (let f = i + 1; f <= Math.min(bars.length - 1, i + 3); f++) {
        if (closes[f] < maxHigh20 * 0.98) {
          brokeDown = true;
          break;
        }
      }
      if (brokeDown) falseBreakouts++;
    }

    // Detect MA20 / MA50 support test
    const ma20Val = sma20[i];
    if (ma20Val && Math.abs(curClose - ma20Val) / ma20Val <= 0.02 && curClose >= ma20Val * 0.985) {
      maSupportTests++;
      // Check if price bounced up > 2.5% within 4 bars
      let bounced = false;
      for (let b = i + 1; b <= Math.min(bars.length - 1, i + 4); b++) {
        if (highs[b] >= curClose * 1.025) {
          bounced = true;
          break;
        }
      }
      if (bounced) maSupportBounces++;
    }

    // Trade setup trigger for simulation
    const isMaBounce = ma20Val != null && prevClose <= ma20Val * 1.01 && curClose > ma20Val && curClose > prevClose;
    const isPocketPivot = curClose > prevClose && curVol >= avgVol20 * 1.2 && curClose >= (ma20Val ?? curClose) * 0.98;

    const setupTrigger = (isBreakoutAttempt || isMaBounce || isPocketPivot) && i > inPositionUntil;

    if (setupTrigger) {
      const entryPrice = closes[i + 1] ?? curClose;
      let outcome: "WIN" | "LOSS" = "LOSS";
      let peakGain = 0;

      const evalLimit = Math.min(bars.length - 1, i + 1 + maxHoldingBars);
      for (let t = i + 1; t <= evalLimit; t++) {
        const gainPct = ((highs[t] - entryPrice) / entryPrice) * 100;
        const lossPct = ((entryPrice - lows[t]) / entryPrice) * 100;
        if (gainPct > peakGain) peakGain = gainPct;

        if (lossPct >= stopLossPct) {
          outcome = "LOSS";
          inPositionUntil = t;
          break;
        } else if (gainPct >= targetProfitPct) {
          outcome = "WIN";
          inPositionUntil = t;
          break;
        }

        if (t === evalLimit) {
          const finalRet = ((closes[t] - entryPrice) / entryPrice) * 100;
          outcome = finalRet >= 2.0 ? "WIN" : "LOSS";
          inPositionUntil = t;
        }
      }

      trades.push({
        entryIdx: i,
        entryPrice,
        outcome,
        maxGainPct: peakGain,
      });
    }
  }

  // 2. Metrics aggregation
  const sampleTrades = trades.length;
  const wins = trades.filter(t => t.outcome === "WIN").length;
  const historicalWinRatePct = sampleTrades > 0 ? Number(((wins / sampleTrades) * 100).toFixed(1)) : 50;

  const upDownVolRatio = calculateUpDownVolumeRatio(bars, 50);

  const supportBounceRatePct = maSupportTests > 0
    ? Number(((maSupportBounces / maSupportTests) * 100).toFixed(1))
    : 60.0;

  const fakeoutRiskPct = totalBreakoutAttempts > 0
    ? Number(((falseBreakouts / totalBreakoutAttempts) * 100).toFixed(1))
    : 25.0;

  // 3. Composite Empirical Edge Score Calculation (0 - 100)
  // Weights:
  // - Empirical Win-Rate: 35%
  // - Up/Down Volume Accumulation Ratio: 30%
  // - Support Bounce Fidelity: 20%
  // - Low Fakeout Resilience (100 - fakeoutRiskPct): 15%

  const winRateComp = Math.min(100, Math.max(0, (historicalWinRatePct - 30) * (100 / 50))); // 30%->0, 80%->100
  const volRatioComp = Math.min(100, Math.max(0, (upDownVolRatio - 0.6) * (100 / 1.2)));   // 0.6->0, 1.8->100
  const bounceComp = supportBounceRatePct;
  const fakeoutComp = Math.min(100, Math.max(0, 100 - fakeoutRiskPct * 1.5));

  let rawEdge = (
    winRateComp * 0.35 +
    volRatioComp * 0.30 +
    bounceComp * 0.20 +
    fakeoutComp * 0.15
  );

  // Bonus for consistent samples
  if (sampleTrades >= 5 && historicalWinRatePct >= 65) rawEdge += 5;
  if (upDownVolRatio >= 1.3) rawEdge += 4;
  if (fakeoutRiskPct >= 45) rawEdge -= 10;

  const historicalEdgeScore = Math.min(99, Math.max(10, Math.round(rawEdge)));

  // Badge classification
  let historicalEdgeBadge: HistoricalEdgeBadge = "NEUTRAL";
  let empiricalBonus = 0;

  if (historicalEdgeScore >= 75) {
    historicalEdgeBadge = "HIGH_EDGE";
    empiricalBonus = 12;
  } else if (historicalEdgeScore >= 60) {
    historicalEdgeBadge = "POSITIVE_EDGE";
    empiricalBonus = 6;
  } else if (historicalEdgeScore >= 45) {
    historicalEdgeBadge = "NEUTRAL";
    empiricalBonus = 0;
  } else {
    historicalEdgeBadge = "HIGH_FAKEOUT_RISK";
    empiricalBonus = -12;
  }

  // Verdict explanation in Vietnamese
  let verdictVi = "";
  if (historicalEdgeBadge === "HIGH_EDGE") {
    verdictVi = `🏆 Lợi thế thực nghiệm vượt trội: Tỷ lệ thắng setup quá khứ đạt ${historicalWinRatePct}%, dòng tiền tích lũy Up/Down ${upDownVolRatio}x, độ nảy hỗ trợ ${supportBounceRatePct}%. Cực kỳ tin cậy cho điểm mua hiện tại.`;
  } else if (historicalEdgeBadge === "POSITIVE_EDGE") {
    verdictVi = `✨ Hành động giá tích cực: Tỷ lệ thắng ${historicalWinRatePct}%, Up/Down Vol ${upDownVolRatio}x, bẫy giá thấp (${fakeoutRiskPct}%). Tăng cường xác nhận cho tín hiệu bứt phá.`;
  } else if (historicalEdgeBadge === "HIGH_FAKEOUT_RISK") {
    verdictVi = `⚠️ Cảnh báo rủi ro bẫy giá lịch sử: Tỷ lệ false breakout quá khứ cao (${fakeoutRiskPct}%), dòng tiền yếu (${upDownVolRatio}x). Cần chờ nến xác nhận chặt chẽ hơn.`;
  } else {
    verdictVi = `⚖️ Hành động giá cân bằng: Tỷ lệ thắng ${historicalWinRatePct}%, áp lực cung cầu trung tính (${upDownVolRatio}x). Tuân thủ nguyên tắc quản trị rủi ro cơ bản.`;
  }

  return {
    historicalWinRatePct,
    sampleTrades,
    upDownVolRatio,
    supportBounceRatePct,
    fakeoutRiskPct,
    historicalEdgeScore,
    historicalEdgeBadge,
    empiricalBonus,
    verdictVi,
  };
}
