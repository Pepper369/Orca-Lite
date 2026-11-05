/**
 * 6-Dimensional Star Ratings for VN Stocks (Deterministic).
 * Mirrors SSI iResearch's "Đánh giá kỹ thuật" panel:
 *   - Price strength (1-5 stars)
 *   - Trend strength (1-5 stars)
 *   - Short-term position / RSI (1-5 stars)
 *   - Money flow (1-5 stars)
 *   - Volatility (1-5 stars)
 *   - Base range (1-5 stars)
 * Plus an overall 0-100 gauge and verdict (Outperform / Neutral / Underperform).
 */

export interface StarRatings {
  priceStrength: number;
  trendStrength: number;
  shortTermPos: number;
  moneyFlow: number;
  volatilityRating: number;
  baseRange: number;
  overallGauge: number; // 0 - 100
  overallVerdict: "Outperform" | "Neutral" | "Underperform";
  verdictVi: string;
}

export function computeStarRatings(params: {
  closes: number[];
  volumes?: number[];
  score?: number; // 0 - 100 technical score
  rsi?: number;
  ma20?: number | null;
  ma50?: number | null;
  ma200?: number | null;
}): StarRatings {
  const { closes, volumes, ma20, ma50, ma200 } = params;

  if (!closes || closes.length < 20) {
    return {
      priceStrength: 3,
      trendStrength: 3,
      shortTermPos: 3,
      moneyFlow: 3,
      volatilityRating: 3,
      baseRange: 3,
      overallGauge: 50,
      overallVerdict: "Neutral",
      verdictVi: "Trung lập",
    };
  }

  const current = closes[closes.length - 1];
  const score = params.score ?? 50;
  const rsi = params.rsi ?? 50;

  // 1. Price strength (1-5 stars)
  const ps =
    score >= 80 ? 5 : score >= 60 ? 4 : score >= 40 ? 3 : score >= 20 ? 2 : 1;

  // 2. Trend strength (1-5 stars)
  let ts = 1;
  if (!ma20) {
    ts = 3;
  } else {
    const above20 = current > ma20;
    const above50 = ma50 != null && current > ma50;
    const above200 = ma200 != null && current > ma200;
    const stacked =
      ma50 != null && ma200 != null && ma20 > ma50 && ma50 > ma200;

    if (above20 && above50 && above200 && stacked) ts = 5;
    else if (above20 && above50 && above200) ts = 4;
    else if (above20 && above50) ts = 3;
    else if (above20) ts = 2;
    else ts = 1;
  }

  // 3. Short-term RSI position (1-5 stars)
  let sp = 3;
  if (rsi >= 50 && rsi <= 65) sp = 5;
  else if ((rsi >= 45 && rsi < 50) || (rsi > 65 && rsi <= 70)) sp = 4;
  else if ((rsi >= 35 && rsi < 45) || (rsi > 70 && rsi <= 75)) sp = 3;
  else if ((rsi >= 25 && rsi < 35) || (rsi > 75 && rsi <= 80)) sp = 2;
  else sp = 1;

  // 4. Money flow (1-5 stars)
  let mf = 3;
  if (volumes && volumes.length >= 21 && closes.length >= 6) {
    const slice20 = volumes.slice(-21, -1);
    const avg20 = slice20.reduce((a, b) => a + b, 0) / 20;
    if (avg20 > 0) {
      const ratio = volumes[volumes.length - 1] / avg20;
      const c5 = closes[closes.length - 6];
      const ret5 = c5 > 0 ? ((current - c5) / c5) * 100 : 0;
      const priceUp = ret5 > 0.5;
      const priceDown = ret5 < -0.5;

      if (ratio >= 1.5 && priceUp) mf = 5;
      else if (ratio >= 1.2 && priceUp) mf = 4;
      else if (ratio >= 0.8 && ratio < 1.2) mf = 3;
      else if (ratio >= 1.2 && priceDown) mf = 1; // Phân phối
      else if (ratio < 0.8) mf = 2;
      else mf = 3;
    }
  }

  // 5. Volatility rating (1-5 stars)
  let vol = 3;
  const n = closes.length;
  if (n >= 21) {
    const rets: number[] = [];
    for (let i = n - 20; i < n; i++) {
      if (closes[i - 1] > 0) {
        rets.push(Math.log(closes[i] / closes[i - 1]));
      }
    }
    if (rets.length >= 5) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance =
        rets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (rets.length - 1);
      const annualized = Math.sqrt(variance) * Math.sqrt(252) * 100;

      if (annualized >= 15 && annualized <= 25) vol = 5;
      else if ((annualized >= 10 && annualized < 15) || (annualized > 25 && annualized <= 35)) vol = 4;
      else if (annualized > 35 && annualized <= 45) vol = 3;
      else if (annualized > 45 && annualized <= 60) vol = 2;
      else vol = 1;
    }
  }

  // 6. Base range (1-5 stars)
  let br = 3;
  if (ma20 && ma20 > 0) {
    const dist = (Math.abs(current - ma20) / ma20) * 100;
    if (dist <= 2) br = 5;
    else if (dist <= 4) br = 4;
    else if (dist <= 7) br = 3;
    else if (dist <= 12) br = 2;
    else br = 1;
  }

  const total = ps + ts + sp + mf + vol + br;
  const overallGauge = Math.round((total * 100) / 30);

  let overallVerdict: "Outperform" | "Neutral" | "Underperform" = "Neutral";
  let verdictVi = "Trung lập";

  if (overallGauge >= 60) {
    overallVerdict = "Outperform";
    verdictVi = "Vượt trội";
  } else if (overallGauge <= 40) {
    overallVerdict = "Underperform";
    verdictVi = "Kém khả quan";
  }

  return {
    priceStrength: ps,
    trendStrength: ts,
    shortTermPos: sp,
    moneyFlow: mf,
    volatilityRating: vol,
    baseRange: br,
    overallGauge,
    overallVerdict,
    verdictVi,
  };
}
