/**
 * Comprehensive Market Pulse & Systemic Risk Engine.
 * Evaluates market breadth, foreign flow pressure, volume intensity, and global macro risks.
 * Ported from lotusmarket (Go/Python market pulse & risk).
 */

export interface MarketPulseBreakdown {
  breadthScore: number;
  foreignFlowScore: number;
  volumeScore: number;
  riskScore: number;
  vixScore: number;
  yieldSpreadScore: number;
  newsSentimentScore: number;
}

export interface MarketPulseResult {
  score: number; // 0 - 100
  signal: "green" | "yellow" | "red";
  signalVi: string;
  headlineVi: string;
  breakdown: MarketPulseBreakdown;
  summaryVi: string;
}

export function scoreBreadth(advancesRatio: number): number {
  if (advancesRatio > 60) return 80;
  if (advancesRatio >= 40) return 50;
  return 20;
}

export function scoreForeignFlow(netTotalVnd: number): number {
  const threshold = 100e9; // 100 tỷ VND
  if (netTotalVnd > threshold) return 90;
  if (netTotalVnd > 0) return Math.round(60 + (netTotalVnd / threshold) * 30);
  if (netTotalVnd === 0) return 50;
  const absVal = Math.abs(netTotalVnd);
  if (absVal > threshold) return 20;
  return Math.round(50 - (absVal / threshold) * 30);
}

export function scoreVix(vix: number): number {
  if (vix < 15) return 10;
  if (vix < 20) return 30;
  if (vix < 25) return 50;
  if (vix < 30) return 70;
  return 90;
}

export function scoreYieldCurve(spread: number): number {
  if (spread > 1.0) return 10;
  if (spread > 0.5) return 30;
  if (spread > 0) return 50;
  return 90; // Inverted yield curve (Recession signal)
}

export function scoreNewsSentiment(negativeCount: number, totalCount: number): number {
  if (totalCount === 0) return 20;
  const ratio = (negativeCount / totalCount) * 100;
  if (ratio > 60) return 80;
  if (ratio > 40) return 50;
  return 20;
}

export function scoreVolume(volumeRatio: number): number {
  if (volumeRatio >= 1.5) return 90;
  if (volumeRatio >= 1.1) return 70;
  if (volumeRatio >= 0.8) return 50;
  return 30;
}

export function computeMarketPulse(params: {
  advancesRatio?: number; // % mã tăng (e.g. 55%)
  foreignNetVnd?: number; // Vốn ngoại ròng (VND)
  volumeRatio?: number; // Volume so với MA20
  vix?: number; // VIX index
  yieldCurveSpread?: number; // US10Y - US2Y
  newsNegativeCount?: number;
  newsTotalCount?: number;
}): MarketPulseResult {
  const advancesRatio = params.advancesRatio ?? 50;
  const foreignNetVnd = params.foreignNetVnd ?? 0;
  const volumeRatio = params.volumeRatio ?? 1.0;
  const vix = params.vix ?? 16;
  const yieldCurveSpread = params.yieldCurveSpread ?? 0.4;
  const newsNegativeCount = params.newsNegativeCount ?? 2;
  const newsTotalCount = params.newsTotalCount ?? 10;

  const breadthScore = scoreBreadth(advancesRatio);
  const foreignFlowScore = scoreForeignFlow(foreignNetVnd);
  const volumeScore = scoreVolume(volumeRatio);

  const vixScore = scoreVix(vix);
  const yieldSpreadScore = scoreYieldCurve(yieldCurveSpread);
  const newsSentimentScore = scoreNewsSentiment(newsNegativeCount, newsTotalCount);

  // Risk composite (higher = riskier)
  const riskRaw = Math.round(vixScore * 0.4 + yieldSpreadScore * 0.3 + newsSentimentScore * 0.3);
  // Invert risk for pulse score: low risk = high health score
  const healthRiskScore = Math.max(0, 100 - riskRaw);

  const score = Math.round(
    (breadthScore * 30 + foreignFlowScore * 25 + volumeScore * 20 + healthRiskScore * 25) / 100
  );

  let signal: "green" | "yellow" | "red" = "green";
  let signalVi = "Tích cực";
  let headlineVi = "Xung lực thị trường khỏe, thanh khoản và dòng tiền đồng thuận.";

  if (score < 40) {
    signal = "red";
    signalVi = "Cảnh báo rủi ro";
    headlineVi = "Thị trường suy yếu, độ rộng thu hẹp và áp lực bán chi phối.";
  } else if (score < 60) {
    signal = "yellow";
    signalVi = "Phân hóa / Giằng co";
    headlineVi = "Dòng tiền chọn lọc cao, thị trường vận động trong pha tích lũy.";
  }

  const foreignBillion = (foreignNetVnd / 1e9).toFixed(0);
  const summaryVi = `Điểm xung lực thị trường ${score}/100 (${signalVi}). Độ rộng ${advancesRatio.toFixed(0)}% mã tăng, Khối ngoại ${foreignNetVnd >= 0 ? "+" : ""}${foreignBillion} tỷ VND.`;

  return {
    score,
    signal,
    signalVi,
    headlineVi,
    breakdown: {
      breadthScore,
      foreignFlowScore,
      volumeScore,
      riskScore: riskRaw,
      vixScore,
      yieldSpreadScore,
      newsSentimentScore,
    },
    summaryVi,
  };
}
