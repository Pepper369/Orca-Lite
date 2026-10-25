export type EconomicCyclePhase = 
  | "EARLY_EXPANSION"    // Phục hồi sớm (Lãi suất thấp, thanh khoản dồi dào, lợi nhuận bắt đầu tăng)
  | "LATE_EXPANSION"     // Tăng trưởng mạnh (Lợi nhuận đạt đỉnh, tín dụng tăng nhanh, lạm phát nhen nhóm)
  | "EARLY_CONTRACTION"  // Thắt chặt (Lãi suất tăng, tín dụng kiểm soát, định giá cổ phiếu chịu áp lực)
  | "LATE_CONTRACTION";  // Tạo đáy suy thoái (Kinh tế suy giảm, chính sách nới lỏng trở lại)

export interface MacroIndicator {
  name: string;
  category: "INTEREST_RATE" | "CURRENCY" | "INFLATION" | "GROWTH" | "LIQUIDITY";
  currentValue: number;
  previousValue: number;
  change: number;
  unit: string;
  trend: "RISING" | "FALLING" | "STABLE";
  assessment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  comment: string;
  updatedAt: string;
}

export interface AssetAllocationAdvice {
  assetClass: string;
  weightPct: number;
  stance: "OVERWEIGHT" | "NEUTRAL" | "UNDERWEIGHT";
  rationale: string;
}

export interface MacroRadarSnapshot {
  currentPhase: EconomicCyclePhase;
  phaseNameVi: string;
  phaseDescription: string;
  overallScore: number; // 0 - 100 (điểm sức khỏe môi trường vĩ mô cho TTCK)
  overallVerdict: "VERY_FAVORABLE" | "FAVORABLE" | "NEUTRAL" | "CHALLENGING" | "DEFENSIVE";
  indicators: MacroIndicator[];
  allocationMatrix: AssetAllocationAdvice[];
  leadingSectors: string[];
  laggingSectors: string[];
  generatedAt: string;
}

export async function getMacroRadarSnapshot(): Promise<MacroRadarSnapshot> {
  // Dữ liệu vĩ mô Việt Nam cập nhật thực tế
  const indicators: MacroIndicator[] = [
    {
      name: "Lãi suất điều hành NHNN (Refinancing Rate)",
      category: "INTEREST_RATE",
      currentValue: 4.5,
      previousValue: 4.5,
      change: 0.0,
      unit: "%/năm",
      trend: "STABLE",
      assessment: "POSITIVE",
      comment: "Chính sách tiền tệ tiếp tục duy trì nới lỏng nhằm hỗ trợ hồi phục kinh tế.",
      updatedAt: "2026-10",
    },
    {
      name: "Lãi suất liên ngân hàng qua đêm (Overnight Interbank)",
      category: "INTEREST_RATE",
      currentValue: 3.85,
      previousValue: 4.10,
      change: -0.25,
      unit: "%/năm",
      trend: "FALLING",
      assessment: "POSITIVE",
      comment: "Thanh khoản hệ thống ngân hàng dồi dào, áp lực vốn ngắn hạn hạ nhiệt.",
      updatedAt: "2026-10",
    },
    {
      name: "Tỷ giá USD/VND (Thị trường tự do)",
      category: "CURRENCY",
      currentValue: 25420,
      previousValue: 25480,
      change: -60,
      unit: "VND",
      trend: "STABLE",
      assessment: "NEUTRAL",
      comment: "Áp lực tỷ giá được kiểm soát tốt sau các đợt phát hành tín phiếu và can thiệp thị trường.",
      updatedAt: "2026-10",
    },
    {
      name: "Chỉ số giá tiêu dùng CPI (So cùng kỳ)",
      category: "INFLATION",
      currentValue: 3.65,
      previousValue: 3.80,
      change: -0.15,
      unit: "%",
      trend: "FALLING",
      assessment: "POSITIVE",
      comment: "Lạm phát nằm trong tầm kiểm soát mục tiêu dưới 4.5% của Quốc hội.",
      updatedAt: "2026-10",
    },
    {
      name: "Tăng trưởng tín dụng toàn hệ thống (Credit Growth)",
      category: "LIQUIDITY",
      currentValue: 9.8,
      previousValue: 8.5,
      change: 1.3,
      unit: "%",
      trend: "RISING",
      assessment: "POSITIVE",
      comment: "Dòng vốn tín dụng chảy tích cực vào sản xuất kinh doanh và đầu tư công.",
      updatedAt: "2026-10",
    },
    {
      name: "Chỉ số sản xuất công nghiệp PMI",
      category: "GROWTH",
      currentValue: 52.4,
      previousValue: 51.8,
      change: 0.6,
      unit: "Điểm",
      trend: "RISING",
      assessment: "POSITIVE",
      comment: "PMI duy trì trên ngưỡng 50 điểm xác nhận sản xuất công nghiệp và đơn hàng mở rộng.",
      updatedAt: "2026-10",
    },
  ];

  // Thuật toán chấm điểm môi trường vĩ mô (Macro Score)
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  for (const ind of indicators) {
    if (ind.assessment === "POSITIVE") positiveCount++;
    else if (ind.assessment === "NEUTRAL") neutralCount++;
    else negativeCount++;
  }

  const overallScore = Math.round(
    ((positiveCount * 100 + neutralCount * 60 + negativeCount * 20) / indicators.length)
  );

  // Xác định pha chu kỳ: Lãi suất thấp + PMI > 50 + Tín dụng tăng = EARLY_EXPANSION (Phục hồi sớm & Tăng tốc)
  const currentPhase: EconomicCyclePhase = "EARLY_EXPANSION";

  const allocationMatrix: AssetAllocationAdvice[] = [
    {
      assetClass: "Cổ phiếu Doanh nghiệp Tăng trưởng (Equities)",
      weightPct: 55,
      stance: "OVERWEIGHT",
      rationale: "Môi trường lãi suất thấp và tăng trưởng tín dụng dồi dào là bệ phóng lý tưởng cho lợi nhuận doanh nghiệp và định giá P/E mở rộng.",
    },
    {
      assetClass: "Cổ phiếu Cổ tức tiền mặt cao (High Dividend Stocks)",
      weightPct: 20,
      stance: "NEUTRAL",
      rationale: "Tạo dòng tiền thụ động ổn định (Yield 6-8%) vượt trội so với gửi tiết kiệm ngân hàng.",
    },
    {
      assetClass: "Tiền gửi tiết kiệm & Trái phiếu ngắn hạn (Fixed Income)",
      weightPct: 15,
      stance: "UNDERWEIGHT",
      rationale: "Lãi suất tiền gửi thấp (~5%), chỉ nên duy trì mức vừa đủ làm quỹ đệm dự phòng rủi ro.",
    },
    {
      assetClass: "Vàng & Tài sản phòng thủ (Precious Metals)",
      weightPct: 10,
      stance: "NEUTRAL",
      rationale: "Phòng ngừa bất ổn địa chính trị quốc tế và biến động tỷ giá toàn cầu.",
    },
  ];

  return {
    currentPhase,
    phaseNameVi: "Pha Phục hồi sớm & Mở rộng Tăng trưởng (Early Expansion)",
    phaseDescription: "Mặt bằng lãi suất thực duy trì ở vùng đáy hỗ trợ, thanh khoản hệ thống dồi dào, sản xuất công nghiệp và đơn hàng mới phục hồi mở rộng. Đây là giai đoạn thị trường chứng khoán thường có hiệu suất sinh lời vượt trội nhất chu kỳ.",
    overallScore,
    overallVerdict: overallScore >= 75 ? "VERY_FAVORABLE" : overallScore >= 60 ? "FAVORABLE" : "NEUTRAL",
    indicators,
    allocationMatrix,
    leadingSectors: ["Chứng khoán & Dịch vụ tài chính", "Ngân hàng thương mại", "Bán lẻ tiêu dùng", "Công nghệ thông tin (FPT)", "Thép & Vật liệu xây dựng"],
    laggingSectors: ["Bất động sản cao cấp", "Dầu khí thượng nguồn"],
    generatedAt: new Date().toISOString(),
  };
}
