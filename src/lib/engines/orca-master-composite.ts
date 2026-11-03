/**
 * ORCA COMPOSITE MASTER RATING ENGINE (1 - 99)
 *
 * Inspired by MarketSmith's Composite Rating and Bloomberg Factor Models,
 * tailored specifically for the Vietnam Stock Market (VNINDEX / HOSE / HNX).
 *
 * Synthesizes 5 key quantitative dimensions:
 * 1. Technical Relative Strength (RS Rating 1-99 & MA Alignment)        [Weight: 30%]
 * 2. Smart Money Orderflow (Active Buy Ratio, Foreign Flow, Pocket Pivot) [Weight: 25%]
 * 3. Fundamental Quality (Piotroski F-Score 0-9, Altman Z'', ROE)         [Weight: 20%]
 * 4. Timing & Pattern Confluence (Buy Zone Proximity, VCP, MTF Consensus)[Weight: 15%]
 * 5. Valuation & Margin of Safety (P/E, P/B, Dividend Yield)            [Weight: 10%]
 *
 * Scaled into a percentile ranking from 1 (lowest laggard) to 99 (super elite leader).
 */

export type OrcaMasterCategory =
  | "SUPER_ELITE" // 90 - 99 (Top 10% of entire market)
  | "LEADER" // 80 - 89 (Top market leaders)
  | "WATCH" // 60 - 79 (Strong contenders)
  | "NEUTRAL" // 40 - 59 (Average)
  | "AVOID"; // 1 - 39 (Underperforming)

export interface OrcaMasterInput {
  symbol: string;
  rsRating?: number | null; // 1 - 99
  smartMoneyScore?: number | null; // 0 - 100
  piotroskiFScore?: number | null; // 0 - 9
  altmanZScore?: number | null;
  altmanZone?: "SAFE" | "GREY" | "DISTRESS" | string | null;
  roe?: number | null;
  netMargin?: number | null;
  confluenceScore?: number | null; // 0 - 100
  isMtfAligned?: boolean | null;
  absBuyDiff?: number | null; // Distance to buy point in %
  isNearBuy?: boolean | null;
  pe?: number | null;
  pb?: number | null;
  dividendYield?: number | null;
  maSignal?: "GOLDEN_CROSS" | "BULLISH_ALIGN" | "DEATH_CROSS" | "NEUTRAL" | null;
}

export interface OrcaMasterResult {
  symbol: string;
  compositeScore: number; // 1 - 99 percentile
  rawScore: number;
  category: OrcaMasterCategory;
  categoryVi: string;
  breakdown: {
    technicalScore: number; // 0 - 100
    smartMoneyScore: number; // 0 - 100
    fundamentalScore: number; // 0 - 100
    timingScore: number; // 0 - 100
    valuationScore: number; // 0 - 100
  };
  primaryStrengthVi: string;
  summaryVi: string;
}

/**
 * Computes raw unscaled score for a single stock across 5 pillars.
 */
export function computeRawOrcaScore(input: OrcaMasterInput): {
  rawScore: number;
  breakdown: OrcaMasterResult["breakdown"];
} {
  // 1. Pillar 1: Technical & Relative Strength (30%)
  let techScore = 50;
  if (input.rsRating != null) {
    techScore = input.rsRating;
  }
  if (input.maSignal === "GOLDEN_CROSS") techScore += 8;
  else if (input.maSignal === "BULLISH_ALIGN") techScore += 6;
  else if (input.maSignal === "DEATH_CROSS") techScore -= 15;
  techScore = Math.max(5, Math.min(99, techScore));

  // 2. Pillar 2: Smart Money Orderflow (25%)
  let smScore = input.smartMoneyScore ?? 50;
  smScore = Math.max(5, Math.min(99, smScore));

  // 3. Pillar 3: Fundamental Quality (20%)
  let fundScore = 50;
  if (input.piotroskiFScore != null) {
    fundScore = Math.round((input.piotroskiFScore / 9) * 100);
  }
  if (input.altmanZone === "SAFE") fundScore += 8;
  else if (input.altmanZone === "DISTRESS") fundScore -= 18;

  const roe = input.roe ?? 0;
  if (roe >= 20) fundScore += 8;
  else if (roe >= 14) fundScore += 5;
  else if (roe < 0) fundScore -= 12;

  fundScore = Math.max(5, Math.min(99, fundScore));

  // 4. Pillar 4: Timing & Pattern Confluence (15%)
  let timingScore = input.confluenceScore ?? 50;
  if (input.isMtfAligned) timingScore += 12;
  if (input.isNearBuy || (input.absBuyDiff != null && input.absBuyDiff <= 2.0)) {
    timingScore += 10;
  } else if (input.absBuyDiff != null && input.absBuyDiff > 5.0) {
    timingScore -= 8;
  }
  timingScore = Math.max(5, Math.min(99, timingScore));

  // 5. Pillar 5: Valuation & Margin of Safety (10%)
  let valScore = 50;
  const pe = input.pe ?? 15;
  const pb = input.pb ?? 1.5;
  if (pe > 0 && pe <= 12) valScore += 15;
  else if (pe > 35) valScore -= 15;

  if (pb > 0 && pb <= 1.3) valScore += 10;
  else if (pb > 4.5) valScore -= 10;

  if ((input.dividendYield ?? 0) >= 5.0) valScore += 10;

  valScore = Math.max(5, Math.min(99, valScore));

  // Weighted sum
  const rawScore =
    0.3 * techScore +
    0.25 * smScore +
    0.2 * fundScore +
    0.15 * timingScore +
    0.1 * valScore;

  return {
    rawScore: Number(rawScore.toFixed(2)),
    breakdown: {
      technicalScore: Math.round(techScore),
      smartMoneyScore: Math.round(smScore),
      fundamentalScore: Math.round(fundScore),
      timingScore: Math.round(timingScore),
      valuationScore: Math.round(valScore),
    },
  };
}

/**
 * Calculates Universe Orca Composite Master Ratings (1 - 99) percentile rank.
 */
export function calculateUniverseOrcaMaster(
  inputs: OrcaMasterInput[],
): Map<string, OrcaMasterResult> {
  const total = inputs.length;
  const resultMap = new Map<string, OrcaMasterResult>();
  if (total === 0) return resultMap;

  const scored = inputs.map((item) => {
    const { rawScore, breakdown } = computeRawOrcaScore(item);
    return { item, rawScore, breakdown };
  });

  // Sort ascending by raw score
  scored.sort((a, b) => a.rawScore - b.rawScore);

  let lastRaw: number | null = null;
  let lastComposite = 1;
  scored.forEach((s, idx) => {
    let compositeScore = 1;
    if (total > 1) {
      if (lastRaw !== null && Math.abs(s.rawScore - lastRaw) < 1e-9) {
        compositeScore = lastComposite;
      } else {
        compositeScore = Math.round(1 + (98 * idx) / (total - 1));
        lastRaw = s.rawScore;
        lastComposite = compositeScore;
      }
    }
    compositeScore = Math.max(1, Math.min(99, compositeScore));

    let category: OrcaMasterCategory = "NEUTRAL";
    let categoryVi = "Trung Tính";
    if (compositeScore >= 90) {
      category = "SUPER_ELITE";
      categoryVi = "Siêu Cổ Phiếu Elite";
    } else if (compositeScore >= 80) {
      category = "LEADER";
      categoryVi = "Cổ Phiếu Dẫn Dắt";
    } else if (compositeScore >= 60) {
      category = "WATCH";
      categoryVi = "Theo Dõi Tích Cực";
    } else if (compositeScore < 40) {
      category = "AVOID";
      categoryVi = "Kém (Nên Tránh)";
    }

    // Determine primary strength
    const strengths: string[] = [];
    if (s.breakdown.technicalScore >= 80) strengths.push("RS Mạnh");
    if (s.breakdown.smartMoneyScore >= 75) strengths.push("Cá Mập Gom");
    if (s.breakdown.fundamentalScore >= 75) strengths.push("Cơ Bản Tốt");
    if (s.breakdown.timingScore >= 75) strengths.push("Điểm Vào Chuẩn");
    if (s.breakdown.valuationScore >= 70) strengths.push("Định Giá Rẻ");

    const primaryStrengthVi = strengths.length > 0 ? strengths.join(" · ") : "Đa nhân tố cân bằng";
    const summaryVi = `Orca Master ${compositeScore}/99 (${categoryVi}): ${primaryStrengthVi}.`;

    resultMap.set(s.item.symbol, {
      symbol: s.item.symbol,
      compositeScore,
      rawScore: s.rawScore,
      category,
      categoryVi,
      breakdown: s.breakdown,
      primaryStrengthVi,
      summaryVi,
    });
  });

  return resultMap;
}
