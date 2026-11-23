/**
 * Multi-Persona AI Investment Committee Engine
 * (AI Hedge Fund & TradingAgents Parity)
 *
 * Implements an institutional multi-agent investment committee debate and governance framework
 * inspired by `virattt/ai-hedge-fund` and `TauricResearch/TradingAgents`:
 *
 * 1. Persona Evaluation Archetypes:
 *    - Warren Buffett: Durable economic moat, high ROIC, disciplined capital allocation, long-term compounding.
 *    - Benjamin Graham: Deep value margin of safety, Net-Net liquidity, conservative P/E & P/B, debt safety.
 *    - Michael Burry: Downside asymmetry, macro tail risk, liquidity fragility, bubble detection & systemic stress.
 *    - Cathie Wood: Disruptive innovation, exponential growth momentum, high-beta upside, TAM expansion.
 *    - Quantitative Analyst: Systematic statistical alphas (Qlib factor scores, order book microprice, regime HMM).
 *
 * 2. Dynamic Regime-Adaptive Consensus:
 *    - Re-weights personas based on market volatility/macro regimes (e.g., Burry & Graham lead during Crisis;
 *      Cathie & Quant lead during Expansion).
 *
 * 3. Chief Risk Officer (CRO) Gate:
 *    - Enforces tail-risk checks, debate disagreement penalties, and capital preservation haircuts.
 */

import { type PrecisionAssetType } from "./asset-precision";
import { type InstitutionalValuationReport } from "./institutional-valuation-suite";

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PersonaRole =
  | "WARREN_BUFFETT"
  | "BEN_GRAHAM"
  | "MICHAEL_BURRY"
  | "CATHIE_WOOD"
  | "QUANT_ANALYST";

export type CommitteeVerdict =
  | "STRONG_BUY"
  | "BUY"
  | "NEUTRAL"
  | "REDUCE"
  | "STRONG_SELL";

export type MacroRegimeType =
  | "TREND_EXPANSION"
  | "MEAN_REVERSION"
  | "CRISIS_HIGH_VOL"
  | "STAGNANT_LOW_VOL";

export interface PersonaVote {
  persona: PersonaRole;
  personaNameVi: string;
  stance: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** Conviction score in [-100, 100] */
  convictionScore: number;
  /** Effective dynamic weight in [0, 1] */
  weight: number;
  /** Core reasoning thesis in Vietnamese */
  thesisVi: string;
  /** Supporting factual arguments */
  keyFactors: string[];
  /** Whether this persona flags a critical veto-worthy risk */
  vetoTriggered: boolean;
}

export interface InvestmentCommitteeInput {
  symbol: string;
  assetType?: PrecisionAssetType;
  price: number;
  peRatio?: number;
  pbRatio?: number;
  roePct?: number;
  roicPct?: number;
  revenueGrowthYoY?: number;
  debtToEquity?: number;
  currentRatio?: number;
  /** Systematic alpha score in [-100, 100] from Qlib / Precision Engine */
  alphaScore?: number;
  /** Return volatility sigma (annualized or daily) */
  volatilitySigma?: number;
  /** Level 2 Orderbook imbalance in [-1.0, 1.0] */
  orderBookImbalance?: number;
  /** HMM market regime state */
  macroRegime?: MacroRegimeType;
  /** Tail risk index in [0, 100] */
  tailRiskScore?: number;
  /** Momentum / 24h change percent */
  priceChangePct?: number;
  /** Institutional Valuation Suite report (DCF, SOTP, Multiples Scorecard) */
  institutionalValuation?: InstitutionalValuationReport;
  /** Explicit DCF Margin of Safety percentage */
  marginOfSafetyPct?: number;
}

export interface ChiefRiskOfficerAssessment {
  approved: boolean;
  recommendedSizeMultiplier: number;
  vetoReason?: string;
  croDirectiveVi: string;
  tailRiskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  disagreementPenalty: number;
}

export interface CommitteeConsensusReport {
  symbol: string;
  generatedAt: string;
  macroRegime: MacroRegimeType;
  consensusScore: number; // [-100, 100]
  verdict: CommitteeVerdict;
  verdictLabelVi: string;
  debateAgreementRatio: number; // [0, 1] (1 = unanimous, 0 = fiercely divided)
  personaVotes: PersonaVote[];
  chiefRiskOfficer: ChiefRiskOfficerAssessment;
  executiveSummaryVi: string;
}

// ============================================================================
// 1. Dynamic Weighting by Market Regime
// ============================================================================

export function calculateDynamicCommitteeWeights(
  regime: MacroRegimeType = "MEAN_REVERSION",
): Record<PersonaRole, number> {
  switch (regime) {
    case "CRISIS_HIGH_VOL":
      // Tail risk & capital preservation dominate
      return {
        MICHAEL_BURRY: 0.35,
        BEN_GRAHAM: 0.25,
        QUANT_ANALYST: 0.20,
        WARREN_BUFFETT: 0.15,
        CATHIE_WOOD: 0.05,
      };
    case "TREND_EXPANSION":
      // Disruption momentum & quantitative alphas dominate
      return {
        CATHIE_WOOD: 0.30,
        QUANT_ANALYST: 0.30,
        WARREN_BUFFETT: 0.20,
        MICHAEL_BURRY: 0.10,
        BEN_GRAHAM: 0.10,
      };
    case "STAGNANT_LOW_VOL":
      // Value & quality compounders dominate
      return {
        WARREN_BUFFETT: 0.30,
        BEN_GRAHAM: 0.30,
        QUANT_ANALYST: 0.20,
        MICHAEL_BURRY: 0.10,
        CATHIE_WOOD: 0.10,
      };
    case "MEAN_REVERSION":
    default:
      // Balanced institutional debate
      return {
        WARREN_BUFFETT: 0.22,
        BEN_GRAHAM: 0.20,
        MICHAEL_BURRY: 0.20,
        QUANT_ANALYST: 0.20,
        CATHIE_WOOD: 0.18,
      };
  }
}

// ============================================================================
// 2. Individual Persona Evaluators
// ============================================================================

/**
 * Warren Buffett: Economic Moat, ROIC, Capital Discipline & Margin of Safety
 */
export function evaluateBuffettPersona(input: InvestmentCommitteeInput, weight: number): PersonaVote {
  const { roePct, roicPct, debtToEquity, peRatio } = input;
  let score = 0;
  const keyFactors: string[] = [];
  let vetoTriggered = false;

  // ROE & ROIC (Quality & Capital efficiency)
  const qualityMetric = roicPct ?? roePct;
  if (qualityMetric != null) {
    if (qualityMetric >= 20) {
      score += 45;
      keyFactors.push(`Lợi thế cạnh tranh con hào kinh tế mạnh: ROIC/ROE ${qualityMetric.toFixed(1)}% >= 20%`);
    } else if (qualityMetric >= 14) {
      score += 25;
      keyFactors.push(`Hiệu quả sinh lời vững chắc: ROIC/ROE ${qualityMetric.toFixed(1)}%`);
    } else if (qualityMetric < 8) {
      score -= 30;
      keyFactors.push(`Thiếu hào kinh tế bảo vệ: ROIC/ROE thấp ${qualityMetric.toFixed(1)}% < 8%`);
    }
  } else {
    // Neutral fallback for macro/crypto assets
    score += (input.alphaScore ?? 0) * 0.2;
  }

  // Debt conservatism
  if (debtToEquity != null) {
    if (debtToEquity <= 0.6) {
      score += 25;
      keyFactors.push(`Cơ cấu nợ rất an toàn: D/E ${debtToEquity.toFixed(2)} <= 0.6`);
    } else if (debtToEquity > 2.0) {
      score -= 40;
      keyFactors.push(`Đòn bẩy tài chính quá cao: D/E ${debtToEquity.toFixed(2)} > 2.0`);
      if (debtToEquity > 3.5) {
        vetoTriggered = true;
      }
    }
  }

  // Sensible valuation (Price paid determines return)
  if (peRatio != null && peRatio > 0) {
    if (peRatio <= 16) {
      score += 25;
      keyFactors.push(`Định giá hợp lý: P/E ${peRatio.toFixed(1)}x`);
    } else if (peRatio > 40) {
      score -= 35;
      keyFactors.push(`Định giá phi lý/quá đắt: P/E ${peRatio.toFixed(1)}x`);
    }
  }

  // Institutional DCF Margin of Safety (Warren Buffett's North Star)
  const mosBuffett = input.institutionalValuation?.marginOfSafetyPct ?? input.marginOfSafetyPct;
  if (mosBuffett != null) {
    if (mosBuffett >= 25) {
      score += 30;
      keyFactors.push(`Biên an toàn Margin of Safety DCF vượt trội (+${mosBuffett.toFixed(1)}%)`);
    } else if (mosBuffett >= 10) {
      score += 15;
      keyFactors.push(`Biên an toàn định giá chiết khấu khả quan (+${mosBuffett.toFixed(1)}%)`);
    } else if (mosBuffett <= -20) {
      score -= 30;
      keyFactors.push(`Thị giá cao hơn giá trị nội tại DCF (${mosBuffett.toFixed(1)}% - Âm biên an toàn)`);
    }
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));
  const stance = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";

  return {
    persona: "WARREN_BUFFETT",
    personaNameVi: "Warren Buffett (Chất lượng & Con hào)",
    stance,
    convictionScore: score,
    weight,
    thesisVi:
      score >= 25
        ? "Doanh nghiệp sở hữu con hào kinh tế bền vững, tỷ suất sinh lời trên vốn cao và nợ thấp."
        : score <= -25
          ? "Thiếu lợi thế cạnh tranh dài hạn, định giá đắt hoặc đòn bẩy nợ vi phạm tiêu chuẩn an toàn."
          : "Doanh nghiệp ở mức trung bình, chưa đủ biên an toàn vượt trội để gom giữ dài hạn.",
    keyFactors,
    vetoTriggered,
  };
}

/**
 * Benjamin Graham: Deep Value Margin of Safety & Liquidation Floor
 */
export function evaluateGrahamPersona(input: InvestmentCommitteeInput, weight: number): PersonaVote {
  const { peRatio, pbRatio, currentRatio, debtToEquity } = input;
  let score = 0;
  const keyFactors: string[] = [];
  let vetoTriggered = false;

  // Graham Number criteria: P/E * P/B <= 22.5
  if (peRatio != null && pbRatio != null && peRatio > 0 && pbRatio > 0) {
    const grahamProduct = peRatio * pbRatio;
    if (grahamProduct <= 22.5 && peRatio <= 15 && pbRatio <= 1.5) {
      score += 55;
      keyFactors.push(`Đạt chuẩn kinh điển Benjamin Graham: P/E*P/B = ${grahamProduct.toFixed(1)} <= 22.5`);
    } else if (grahamProduct > 50) {
      score -= 40;
      keyFactors.push(`P/E*P/B = ${grahamProduct.toFixed(1)} vượt quá xa biên an toàn`);
    }
  }

  // Working Capital & Liquidity test (Current Ratio >= 1.5)
  if (currentRatio != null) {
    if (currentRatio >= 2.0) {
      score += 30;
      keyFactors.push(`Thanh khoản dồi dào: Current Ratio ${currentRatio.toFixed(2)} >= 2.0`);
    } else if (currentRatio < 1.0) {
      score -= 45;
      vetoTriggered = true;
      keyFactors.push(`Báo động thanh khoản ròng: Current Ratio ${currentRatio.toFixed(2)} < 1.0 (âm vốn lưu động)`);
    }
  }

  // Total debt vs Net current assets
  if (debtToEquity != null && debtToEquity > 1.5) {
    score -= 25;
    keyFactors.push(`Nợ vay vượt vốn chủ sở hữu: D/E = ${debtToEquity.toFixed(2)}`);
  }

  // Graham Deep Margin of Safety from Institutional Valuation
  const mosGraham = input.institutionalValuation?.marginOfSafetyPct ?? input.marginOfSafetyPct;
  if (mosGraham != null) {
    if (mosGraham >= 30) {
      score += 35;
      keyFactors.push(`Đạt chuẩn biên an toàn khắt khe của Benjamin Graham (DCF MOS ${mosGraham.toFixed(1)}% >= 30%)`);
    } else if (mosGraham <= -15) {
      score -= 30;
      keyFactors.push(`Không có biên an toàn bảo vệ vốn (MOS âm ${mosGraham.toFixed(1)}%)`);
    }
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));
  const stance = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";

  return {
    persona: "BEN_GRAHAM",
    personaNameVi: "Benjamin Graham (Biên an toàn & Định giá rẻ)",
    stance,
    convictionScore: score,
    weight,
    thesisVi:
      score >= 25
        ? "Cổ phiếu định giá dưới giá trị thanh lý thực tế, biên an toàn bảo vệ vốn cực lớn."
        : score <= -25
          ? "Định giá đầu cơ không có tài sản bảo chứng, rủi ro mất vốn cao nếu suy thoái."
          : "Biên an toàn định giá ở mức trung tính, chưa đủ hấp dẫn để giải ngân giá trị sâu.",
    keyFactors,
    vetoTriggered,
  };
}

/**
 * Michael Burry: Macro Tail Risk, Structural Fragility & Asymmetric Downside
 */
export function evaluateBurryPersona(input: InvestmentCommitteeInput, weight: number): PersonaVote {
  const { tailRiskScore, debtToEquity, volatilitySigma, peRatio, macroRegime } = input;
  let score = 20; // Burry starts cautious/skeptical
  const keyFactors: string[] = [];
  let vetoTriggered = false;

  // Tail Risk Index
  const tailRisk = tailRiskScore ?? 35;
  if (tailRisk >= 75) {
    score -= 75;
    vetoTriggered = true;
    keyFactors.push(`Chỉ số rủi ro đuôi vĩ mô cực cao (${tailRisk}/100): Khả năng sụp đổ thanh khoản dây chuyền`);
  } else if (tailRisk >= 50) {
    score -= 40;
    keyFactors.push(`Rủi ro đuôi biến động leo thang (${tailRisk}/100)`);
  } else {
    score += 20;
    keyFactors.push(`Áp lực rủi ro đuôi vĩ mô thấp (${tailRisk}/100)`);
  }

  // Debt & Insolvency stress
  if (debtToEquity != null && debtToEquity >= 2.5) {
    score -= 45;
    keyFactors.push(`Cấu trúc vốn dễ vỡ trong môi trường lãi suất cao: D/E ${debtToEquity.toFixed(2)}`);
  }

  // Asset Volatility shock
  if (volatilitySigma != null && volatilitySigma > 0.45) {
    score -= 30;
    keyFactors.push(`Biến động tài sản quá lớn (${(volatilitySigma * 100).toFixed(1)}%): Rủi ro trượt giá nặng`);
  }

  // Extreme Bubble Valuation check
  if (peRatio != null && peRatio > 60) {
    score -= 40;
    keyFactors.push(`Định giá bong bóng phi thực tế P/E ${peRatio.toFixed(1)}x`);
  }

  if (macroRegime === "CRISIS_HIGH_VOL") {
    score -= 30;
    keyFactors.push("Thị trường đang trong pha khủng hoảng/rút ròng thanh khoản");
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));
  const stance = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";

  return {
    persona: "MICHAEL_BURRY",
    personaNameVi: "Michael Burry (Rủi ro đuôi & Bong bóng)",
    stance,
    convictionScore: score,
    weight,
    thesisVi:
      score <= -25
        ? "Phát hiện vết nứt cấu trúc vĩ mô, định giá bong bóng hoặc đòn bẩy nợ đe dọa thanh khoản."
        : score >= 25
          ? "Hồ sơ rủi ro đuôi an toàn, không có dấu hiệu bong bóng đầu cơ hoặc tắc nghẽn tín dụng."
          : "Hồ sơ rủi ro ở mức cảnh báo trung bình, cần duy trì quy mô vị thế thận trọng.",
    keyFactors,
    vetoTriggered,
  };
}

/**
 * Cathie Wood: Disruptive Innovation, TAM Exponential Growth & High-Beta Momentum
 */
export function evaluateCathieWoodPersona(input: InvestmentCommitteeInput, weight: number): PersonaVote {
  const { revenueGrowthYoY, priceChangePct, alphaScore, assetType } = input;
  let score = 0;
  const keyFactors: string[] = [];

  // Crypto inherently captures exponential network disruption
  if (assetType === "CRYPTO") {
    score += 25;
    keyFactors.push("Lớp tài sản công nghệ phi tập trung & hiệu ứng mạng lưới số mũ");
  }

  // Revenue / Adoption growth
  if (revenueGrowthYoY != null) {
    if (revenueGrowthYoY >= 35) {
      score += 55;
      keyFactors.push(`Tăng trưởng doanh thu bứt phá: +${revenueGrowthYoY.toFixed(1)}% YoY`);
    } else if (revenueGrowthYoY >= 18) {
      score += 25;
      keyFactors.push(`Tốc độ tăng trưởng mở rộng thị phần: +${revenueGrowthYoY.toFixed(1)}% YoY`);
    } else if (revenueGrowthYoY < 5) {
      score -= 30;
      keyFactors.push(`Tăng trưởng trì trệ thiếu yếu tố đột phá (+${revenueGrowthYoY.toFixed(1)}% YoY)`);
    }
  }

  // Price Momentum & Adoption velocity
  if (priceChangePct != null) {
    if (priceChangePct >= 8.0) {
      score += 30;
      keyFactors.push(`Momentum dòng tiền vào mạnh mẽ: +${priceChangePct.toFixed(1)}%`);
    } else if (priceChangePct <= -15.0) {
      score -= 30;
      keyFactors.push(`Đà sụt giảm mạnh, dòng tiền tháo chạy: ${priceChangePct.toFixed(1)}%`);
    }
  }

  if (alphaScore != null && alphaScore > 40) {
    score += 20;
    keyFactors.push(`Tín hiệu động lượng định lượng tích cực (+${alphaScore.toFixed(0)})`);
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));
  const stance = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";

  return {
    persona: "CATHIE_WOOD",
    personaNameVi: "Cathie Wood (Đột phá & Tăng trưởng số mũ)",
    stance,
    convictionScore: score,
    weight,
    thesisVi:
      score >= 25
        ? "Cổ phiếu/Tài sản nắm bắt xu hướng công nghệ số mũ, mở rộng thị phần với tốc độ cao."
        : score <= -25
          ? "Thiếu động lực tăng trưởng đột phá, nguy cơ bị đào thải bởi các mô hình kinh doanh mới."
          : "Tốc độ mở rộng trung tính, chưa đủ động lượng bứt phá để tạo hiệu ứng đường cong S.",
    keyFactors,
    vetoTriggered: false,
  };
}

/**
 * Quantitative Analyst: Statistical Alphas, Factor Rank, Greeks & Orderbook Imbalance
 */
export function evaluateQuantAnalystPersona(input: InvestmentCommitteeInput, weight: number): PersonaVote {
  const { alphaScore, orderBookImbalance, macroRegime } = input;
  let score = 0;
  const keyFactors: string[] = [];

  // Qlib / Multi-Factor systematic alpha
  const alpha = alphaScore ?? 0;
  if (alpha >= 45) {
    score += 55;
    keyFactors.push(`Qlib Alpha Factor Score vượt trội: +${alpha.toFixed(1)} (Top quantile Rank-IC)`);
  } else if (alpha >= 15) {
    score += 25;
    keyFactors.push(`Tín hiệu Alpha dương ổn định: +${alpha.toFixed(1)}`);
  } else if (alpha <= -45) {
    score -= 55;
    keyFactors.push(`Qlib Alpha tiêu cực nặng: ${alpha.toFixed(1)} (Bottom quantile Rank-IC)`);
  } else if (alpha <= -15) {
    score -= 25;
    keyFactors.push(`Tín hiệu Alpha âm: ${alpha.toFixed(1)}`);
  }

  // Microstructure Orderbook imbalance
  if (orderBookImbalance != null) {
    if (orderBookImbalance >= 0.25) {
      score += 25;
      keyFactors.push(`Orderbook Level-2 nghiên về phe Mua: +${(orderBookImbalance * 100).toFixed(1)}%`);
    } else if (orderBookImbalance <= -0.25) {
      score -= 25;
      keyFactors.push(`Orderbook Level-2 nghiên về phe Bán: ${(orderBookImbalance * 100).toFixed(1)}%`);
    }
  }

  // Regime match
  if (macroRegime === "TREND_EXPANSION") {
    score += 15;
    keyFactors.push("Phù hợp chế độ thị trường Xu hướng mở rộng");
  } else if (macroRegime === "CRISIS_HIGH_VOL") {
    score -= 20;
    keyFactors.push("Chế độ khủng hoảng: Biến động xói mòn Sharpe Ratio");
  }

  score = Math.max(-100, Math.min(100, Math.round(score)));
  const stance = score >= 25 ? "BULLISH" : score <= -25 ? "BEARISH" : "NEUTRAL";

  return {
    persona: "QUANT_ANALYST",
    personaNameVi: "Quantitative Analyst (Alpha Đa nhân tố & L2 Microstructure)",
    stance,
    convictionScore: score,
    weight,
    thesisVi:
      score >= 25
        ? "Mô hình định lượng đa nhân tố xác nhận kỳ vọng lợi nhuận dương với Rank-IC cao."
        : score <= -25
          ? "Yếu tố định lượng xấu, áp lực sổ lệnh tiêu cực hoặc bất lợi từ chế độ thị trường."
          : "Tín hiệu định lượng cân bằng, chưa hình thành lợi thế thống kê rõ rệt.",
    keyFactors,
    vetoTriggered: false,
  };
}

// ============================================================================
// 3. Chief Risk Officer (CRO) Gate & Governance
// ============================================================================

export function evaluateChiefRiskOfficer(
  votes: PersonaVote[],
  input: InvestmentCommitteeInput,
): ChiefRiskOfficerAssessment {
  const tailRisk = input.tailRiskScore ?? 35;
  let approved = true;
  let recommendedSizeMultiplier = 1.0;
  let vetoReason: string | undefined;

  // 1. Calculate Persona Disagreement (Standard Deviation of conviction scores)
  const meanScore = votes.reduce((sum, v) => sum + v.convictionScore, 0) / votes.length;
  const variance = votes.reduce((sum, v) => sum + Math.pow(v.convictionScore - meanScore, 2), 0) / votes.length;
  const stdDev = Math.sqrt(variance);

  // High disagreement penalty (stdDev > 55 means fierce debate / conflicting signals)
  let disagreementPenalty = 0.0;
  if (stdDev >= 55) {
    disagreementPenalty = 0.35;
    recommendedSizeMultiplier *= (1.0 - disagreementPenalty);
  } else if (stdDev >= 40) {
    disagreementPenalty = 0.20;
    recommendedSizeMultiplier *= (1.0 - disagreementPenalty);
  }

  // 2. Veto Triggers
  const burryVote = votes.find((v) => v.persona === "MICHAEL_BURRY");
  const grahamVote = votes.find((v) => v.persona === "BEN_GRAHAM");

  let tailRiskLevel: ChiefRiskOfficerAssessment["tailRiskLevel"] = "LOW";
  if (tailRisk >= 75) {
    tailRiskLevel = "CRITICAL";
  } else if (tailRisk >= 50) {
    tailRiskLevel = "HIGH";
  } else if (tailRisk >= 35) {
    tailRiskLevel = "MODERATE";
  }

  if (burryVote?.vetoTriggered) {
    approved = false;
    recommendedSizeMultiplier = 0.0;
    vetoReason = `CRO VETO: Michael Burry phát hiện rủi ro đuôi nghiêm trọng (${burryVote.keyFactors[0] ?? "Thanh khoản suy kiệt"})`;
  } else if (grahamVote?.vetoTriggered) {
    // Tangible liquidity or current ratio violation -> Haircut 50%
    recommendedSizeMultiplier *= 0.50;
    vetoReason = `CRO CẢNH BÁO: Ben Graham phát hiện rủi ro thanh khoản ròng (${grahamVote.keyFactors[0] ?? "Âm vốn lưu động"})`;
  } else if (tailRiskLevel === "HIGH") {
    recommendedSizeMultiplier *= 0.70;
  }

  recommendedSizeMultiplier = Number(Math.max(0.0, Math.min(1.25, recommendedSizeMultiplier)).toFixed(2));

  let croDirectiveVi = "Phê duyệt phân bổ vốn 100%: Hội đồng đồng thuận cao và rủi ro đuôi trong tầm kiểm soát.";
  if (!approved) {
    croDirectiveVi = `KHÓA GIẢI NGÂN (VETO): ${vetoReason}`;
  } else if (recommendedSizeMultiplier < 1.0) {
    croDirectiveVi = `CẮT GIẢM TỶ TRỌNG CÒN ${(recommendedSizeMultiplier * 100).toFixed(0)}%: ${
      vetoReason ?? (disagreementPenalty > 0 ? "Hội đồng tranh luận gay gắt (độ lệch chuẩn cao)" : "Rủi ro đuôi ở mức cảnh giác")
    }`;
  }

  return {
    approved,
    recommendedSizeMultiplier,
    vetoReason,
    croDirectiveVi,
    tailRiskLevel,
    disagreementPenalty,
  };
}

// ============================================================================
// 4. Convene Investment Committee (Unified SSOT Entrypoint)
// ============================================================================

export function conveneInvestmentCommittee(
  input: InvestmentCommitteeInput,
): CommitteeConsensusReport {
  const regime: MacroRegimeType = input.macroRegime ?? "MEAN_REVERSION";
  const weights = calculateDynamicCommitteeWeights(regime);

  // Gather individual votes
  const votes: PersonaVote[] = [
    evaluateBuffettPersona(input, weights.WARREN_BUFFETT),
    evaluateGrahamPersona(input, weights.BEN_GRAHAM),
    evaluateBurryPersona(input, weights.MICHAEL_BURRY),
    evaluateCathieWoodPersona(input, weights.CATHIE_WOOD),
    evaluateQuantAnalystPersona(input, weights.QUANT_ANALYST),
  ];

  // Weighted Consensus Score
  let consensusScore = 0;
  for (const v of votes) {
    consensusScore += v.convictionScore * v.weight;
  }
  consensusScore = Math.max(-100, Math.min(100, Math.round(consensusScore)));

  // Debate agreement ratio: 1.0 - (stdDev / 100)
  const meanScore = votes.reduce((sum, v) => sum + v.convictionScore, 0) / votes.length;
  const variance = votes.reduce((sum, v) => sum + Math.pow(v.convictionScore - meanScore, 2), 0) / votes.length;
  const stdDev = Math.sqrt(variance);
  const debateAgreementRatio = Number(Math.max(0.0, Math.min(1.0, 1.0 - stdDev / 100)).toFixed(2));

  // Determine Committee Verdict
  let verdict: CommitteeVerdict = "NEUTRAL";
  let verdictLabelVi = "Quan sát / Trung lập";

  if (consensusScore >= 50) {
    verdict = "STRONG_BUY";
    verdictLabelVi = "MUA MẠNH (Đồng thuận cao)";
  } else if (consensusScore >= 20) {
    verdict = "BUY";
    verdictLabelVi = "MUA / Tích lũy";
  } else if (consensusScore <= -50) {
    verdict = "STRONG_SELL";
    verdictLabelVi = "BÁN MẠNH / Thoát vị thế";
  } else if (consensusScore <= -20) {
    verdict = "REDUCE";
    verdictLabelVi = "HẠ TỶ TRỌNG / Bán một phần";
  }

  // Chief Risk Officer Assessment
  const cro = evaluateChiefRiskOfficer(votes, input);

  // If CRO vetos, override verdict
  if (!cro.approved) {
    verdict = "REDUCE";
    verdictLabelVi = "BỊ CHẶN BỞI CRO (Quản trị rủi ro)";
  }

  const bullishCount = votes.filter((v) => v.stance === "BULLISH").length;
  const bearishCount = votes.filter((v) => v.stance === "BEARISH").length;

  const executiveSummaryVi =
    `Hội đồng đầu tư AI [${input.symbol}]: Điểm đồng thuận ${consensusScore}/100 (${verdictLabelVi}). ` +
    `Tỷ lệ thống nhất: ${(debateAgreementRatio * 100).toFixed(0)}% (${bullishCount} Mua, ${bearishCount} Bán). ` +
    `Phán quyết CRO: ${cro.croDirectiveVi}`;

  return {
    symbol: input.symbol,
    generatedAt: new Date().toISOString(),
    macroRegime: regime,
    consensusScore,
    verdict,
    verdictLabelVi,
    debateAgreementRatio,
    personaVotes: votes,
    chiefRiskOfficer: cro,
    executiveSummaryVi,
  };
}
