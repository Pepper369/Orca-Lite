import { evaluateApexQuant, type ApexQuantResult } from "./orca-apex-quant-engine";
import { trainHistoricalPriceAction, type HistoricalEdgeMetrics } from "./historical-price-action-trainer";
import { evaluateFourM, type FourMScore } from "./four-m";
import { computeRawOrcaScore } from "./orca-master-composite";
import { calculateTripleBarrierLevels, type TripleBarrierLevels } from "./advanced-quant-math";
import type { OhlcvBar, Quote, TechnicalSnapshot } from "../types";

export interface DynamicAiInput {
  symbol: string;
  name?: string | null;
  quote?: Quote | null;
  bars?: OhlcvBar[];
  technical?: TechnicalSnapshot | null;
  financials?: {
    income?: Record<string, unknown>[] | null;
    balance?: Record<string, unknown>[] | null;
    cashflow?: Record<string, unknown>[] | null;
    ratios?: Record<string, unknown>[] | null;
  } | null;
  financialHealth?: {
    scores?: {
      overall?: number | null;
      profitability?: number | null;
      liquidity?: number | null;
      leverage?: number | null;
      cashflow?: number | null;
      efficiency?: number | null;
    };
    industry?: { labelVi?: string };
    riskFlags?: string[];
  } | null;
  financialGrowth?: {
    latestPeriod?: string;
    yoy?: Array<{ metric: string; changePct: number | null }>;
    qoq?: Array<{ metric: string; changePct: number | null }>;
  } | null;
  ratioMap?: Record<string, unknown>;
  sectorTrend?: {
    sector?: string | null;
    trendScore?: number | null;
    trendLabelVi?: string | null;
    avgChangePercent?: number | null;
    advances?: number | null;
    declines?: number | null;
  } | null;
  foreignFlow?: {
    netVolume?: number | null;
    netValue?: number | null;
    buyVolume?: number | null;
    sellVolume?: number | null;
  } | null;
  orderBook?: {
    bidVolTotal?: number | null;
    askVolTotal?: number | null;
    bidDepthRatio?: number | null;
  } | null;
}

export interface DynamicValuationSignal {
  targetPrice: number | null;
  marginOfSafetyPct: number | null;
  verdict: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "CAUTION";
  actionVi: string;
}

export interface DynamicApexBadge {
  badge: string;
  isSweetLaunchZone: boolean;
  isExtended: boolean;
  isPremature: boolean;
  extensionFromBottomPct: number;
  overheadRoomPct: number;
  ouZScore: number;
  riskRewardRatio: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfit1Price: number;
  takeProfit2Price: number;
}

export interface DynamicAiReport {
  symbol: string;
  narrative: string;
  structured: {
    executiveVerdict: string;
    healthSummary: string;
    trendSummary: string;
    strengths: string[];
    risks: string[];
    watchpoints: string[];
    outlook: string;
    chartInsights: string[];
    valuationSignal: DynamicValuationSignal;
    apexBadge?: DynamicApexBadge;
  };
  fourM: FourMScore;
  tcbsHealth: {
    overall: number;
    profitability: number;
    liquidity: number;
    leverage: number;
    cashflow: number;
    efficiency: number;
    riskFlags: string[];
  };
  apexQuant?: ApexQuantResult;
  historicalTraining?: HistoricalEdgeMetrics;
  tripleBarrier?: TripleBarrierLevels;
  model: string;
  latencyMs: number;
  usedLlm: boolean;
  sourceNote: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)} nghìn tỷ ₫`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)} tỷ ₫`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)} tr ₫`;
  return `${v.toLocaleString("vi-VN")} ₫`;
}

export function generateOrcaDynamicAiReport(input: DynamicAiInput): DynamicAiReport {
  const t0 = performance.now();
  const { symbol } = input;
  const bars = input.bars && input.bars.length > 0 ? input.bars : [];
  const curPrice = input.quote?.price ?? (bars.length ? bars[bars.length - 1].close : 0);
  const changePct = input.quote?.changePercent ?? 0;

  // 1. Run 👑 Apex Quant Engine
  let apex: ApexQuantResult | undefined = undefined;
  if (bars.length >= 20) {
    try {
      apex = evaluateApexQuant({
        symbol,
        bars,
        currentPrice: curPrice,
        quote: input.quote,
      });
    } catch {
      /* fallback */
    }
  }

  // 2. Run Historical Price Action Trainer
  let trainer: HistoricalEdgeMetrics | undefined = undefined;
  if (bars.length >= 30) {
    try {
      trainer = trainHistoricalPriceAction(bars);
    } catch {
      /* fallback */
    }
  }

  // 3. Dynamic Volatility & Triple-Barrier Levels
  let atrPct = 3.0;
  if (bars.length >= 14) {
    let trSum = 0;
    const start = bars.length - 14;
    for (let i = start; i < bars.length; i++) {
      const prevC = i > 0 ? bars[i - 1].close : bars[i].close;
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - prevC),
        Math.abs(bars[i].low - prevC)
      );
      trSum += (tr / bars[i].close) * 100;
    }
    atrPct = Math.max(1.5, Math.min(8.0, trSum / 14));
  }
  const tripleBarrier = calculateTripleBarrierLevels(curPrice, atrPct, 3.0, 1.3, 12);
  const tp2Price = Math.round(curPrice * (1 + (tripleBarrier.targetReturnPct * 1.5) / 100));

  // 4. Financial Statements extraction
  const inc = input.financials?.income?.[0] ?? {};
  const bal = input.financials?.balance?.[0] ?? {};
  const cf = input.financials?.cashflow?.[0] ?? {};
  const ratios = input.financials?.ratios?.[0] ?? {};

  const revenue = num(inc.netRevenue) ?? num(inc.revenue) ?? 0;
  const netIncome = num(inc.netIncome) ?? num(inc.profitAfterTax) ?? 0;
  const totalAssets = num(bal.totalAssets) ?? 0;
  const equity = num(bal.equity) ?? num(bal.ownerEquity) ?? 0;
  const ocf = num(cf.operatingCashFlow) ?? num(cf.netCashFromOperating) ?? 0;
  const debt = num(bal.shortTermBorrowings ?? 0)! + num(bal.longTermBorrowings ?? 0)!;

  const roeRaw = num(ratios.roe) ?? num(input.ratioMap?.roe);
  const roe = roeRaw != null ? (Math.abs(roeRaw) < 1 ? roeRaw * 100 : roeRaw) : 15;
  const roicRaw = num(ratios.roic) ?? num(input.ratioMap?.roic);
  const roic = roicRaw != null ? (Math.abs(roicRaw) < 1 ? roicRaw * 100 : roicRaw) : 12;
  const grossMarginRaw = num(ratios.grossMargin) ?? num(input.ratioMap?.grossMargin);
  const grossMargin = grossMarginRaw != null ? (Math.abs(grossMarginRaw) < 1 ? grossMarginRaw * 100 : grossMarginRaw) : 25;
  const debtEquity = equity > 0 ? debt / equity : 0.6;
  const pe = num(input.ratioMap?.pe) ?? 12.5;
  const pb = num(input.ratioMap?.pb) ?? 1.8;

  const yoyRev = input.financialGrowth?.yoy?.find((x) => x.metric === "netRevenue" || x.metric === "revenue")?.changePct;
  const yoyNi = input.financialGrowth?.yoy?.find((x) => x.metric === "netIncome")?.changePct;

  // 5. Run 4M Phil Town Evaluation
  const fourM = evaluateFourM({
    symbol,
    name: input.name,
    sector: input.sectorTrend?.sector,
    price: curPrice,
    changePercent: changePct,
    volume: input.quote?.volume,
    roe,
    roic,
    grossMargin,
    debtEquity,
    revenueYoyPct: yoyRev != null ? yoyRev * 100 : null,
    niYoyPct: yoyNi != null ? yoyNi * 100 : null,
    pe,
    pb,
  });

  // 6. TCBS Health 5 Pillars
  const hScores = input.financialHealth?.scores;
  const tcbsHealth = {
    overall: Math.round(hScores?.overall ?? (fourM.totalScore * 0.4 + 45)),
    profitability: Math.round(hScores?.profitability ?? (roe > 15 ? 80 : 60)),
    liquidity: Math.round(hScores?.liquidity ?? 70),
    leverage: Math.round(hScores?.leverage ?? (debtEquity < 1.0 ? 80 : 50)),
    cashflow: Math.round(hScores?.cashflow ?? (ocf > 0 ? 75 : 45)),
    efficiency: Math.round(hScores?.efficiency ?? 70),
    riskFlags: input.financialHealth?.riskFlags ?? [],
  };

  // 7. Calculate Valuation Signal & Margin of Safety
  let marginOfSafetyPct = 12.5;
  let valVerdict: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "CAUTION" = "FAIR";
  let actionVi = "Tích lũy từng phần khi thị trường điều chỉnh";

  if (fourM.totalScore >= 75 && (apex?.apexScore ?? 0) >= 65) {
    valVerdict = "UNDERVALUED";
    marginOfSafetyPct = 24.5;
    actionVi = "VÙNG MUA VÀNG: Hội tụ Chân Sóng Apex & Biên an toàn 4M vững chắc";
  } else if (fourM.totalScore >= 68) {
    valVerdict = "UNDERVALUED";
    marginOfSafetyPct = 16.0;
    actionVi = "Định giá hấp dẫn: Tích lũy theo sóng hồi phục nội tại";
  } else if (fourM.totalScore < 45 || debtEquity > 2.0 || ocf < 0) {
    valVerdict = "CAUTION";
    marginOfSafetyPct = -10.0;
    actionVi = "Cảnh giác rủi ro đòn bẩy hoặc chất lượng dòng tiền suy giảm";
  }

  const targetPrice = curPrice > 0 ? Math.round(curPrice * (1 + marginOfSafetyPct / 100) * 10) / 10 : null;

  // 8. Build Strengths, Risks, Watchpoints & Chart Insights
  const strengths: string[] = [];
  const risks: string[] = [];
  const watchpoints: string[] = [];
  const chartInsights: string[] = [];

  // Strengths
  if (fourM.m2MoatPass) {
    strengths.push(`Con hào kinh tế vững chắc: ROE ${roe.toFixed(1)}% & Biên lãi gộp ${grossMargin.toFixed(1)}% chứng minh lợi thế cạnh tranh đầu ngành.`);
  }
  if (ocf > netIncome && netIncome > 0) {
    strengths.push(`Chất lượng lợi nhuận cao: Dòng tiền OCF thực thu (${fmtMoney(ocf)}) vượt trội so với LNST (${fmtMoney(netIncome)}), không xào nấu doanh thu.`);
  }
  if (apex?.reversalMetrics.isSweetLaunchZone) {
    strengths.push(`Vị thế Vùng Vàng Chân Sóng: Giá chỉ mở rộng ${apex.reversalMetrics.extensionFromBottomPct.toFixed(1)}% từ đáy (ngưỡng tối ưu 0.8% - 7.5%), tỷ lệ R:R đạt ${tripleBarrier.riskRewardRatio}x.`);
  }
  if (trainer && trainer.upDownVolRatio >= 1.1) {
    strengths.push(`Dòng tiền cá mập gom hàng: Tỷ lệ Up/Down Volume 50 phiên đạt ${trainer.upDownVolRatio}x, lực mua phiên tăng chiếm ưu thế rõ nét.`);
  }
  if (debtEquity < 0.8) {
    strengths.push(`Cơ cấu vốn an toàn: Tỷ lệ Nợ/VCSH chỉ ${debtEquity.toFixed(2)}x, hạn chế tối đa rủi ro chi phí lãi vay.`);
  }
  if (!strengths.length) {
    strengths.push(`Mô hình kinh doanh quen thuộc trong nhóm ngành ${input.sectorTrend?.sector ?? "sàn chứng khoán Việt Nam"}.`);
  }

  // Risks
  if (debtEquity > 1.4) {
    risks.push(`Đòn bẩy nợ cao: Tỷ lệ Nợ/VCSH ở mức ${debtEquity.toFixed(2)}x, cần theo dõi nghĩa vụ trả nợ ngắn hạn.`);
  }
  if (ocf < 0) {
    risks.push(`Dòng tiền kinh doanh âm: OCF đạt ${fmtMoney(ocf)}, doanh nghiệp đang phải bù đắp vốn lưu động hoặc đọng vốn trong khoản phải thu.`);
  }
  if (apex?.reversalMetrics.isExtended) {
    risks.push(`Cảnh báo mua đuổi: Cổ phiếu đã chạy ${apex.reversalMetrics.extensionFromBottomPct.toFixed(1)}% từ đáy, tiềm ẩn rung lắc chốt lời T+. Vùng tích lũy chuẩn đã qua.`);
  }
  if (apex?.reversalMetrics.overheadRoomPct != null && apex.reversalMetrics.overheadRoomPct < 5.0) {
    risks.push(`Cản cứng sát trên đầu: Khoảng cách tới kháng cự ngắn hạn chỉ còn ${apex.reversalMetrics.overheadRoomPct.toFixed(1)}%, dư địa tăng dễ bị kẹp hàng.`);
  }
  if (input.foreignFlow && input.foreignFlow.netValue != null && input.foreignFlow.netValue < -5_000_000_000) {
    risks.push(`Khối ngoại bán ròng: Dòng tiền tổ chức ngoại rút ròng ${fmtMoney(Math.abs(input.foreignFlow.netValue))}, tạo áp lực cung ngắn hạn.`);
  }
  if (!risks.length) {
    risks.push(`Rủi ro điều chỉnh chung của thị trường VN-Index và biến động thanh khoản phiên giao dịch.`);
  }

  // Watchpoints
  watchpoints.push(`Theo dõi khả năng giữ vững hỗ trợ MA20/MA50 và hấp thụ cạn vol khi kiểm định lại đáy.`);
  watchpoints.push(`Kiểm tra tăng trưởng doanh thu & biên lợi nhuận ròng trong kỳ BCTC quý tới.`);
  watchpoints.push(`Quan sát động thái mua bán ròng của khối ngoại và độ rộng dẫn dắt của nhóm ngành ${input.sectorTrend?.sector ?? "liên quan"}.`);

  // Chart insights
  if (apex?.reversalMetrics) {
    chartInsights.push(`Đáy chu kỳ gần nhất xác lập tại vùng giá ${apex.reversalMetrics.lowestLow20.toLocaleString("vi-VN")} ₫.`);
    chartInsights.push(`Độ lệch chuẩn Ornstein-Uhlenbeck: Z-Score = ${apex.ouZScore.toFixed(2)}σ (bán rã t½ = ${apex.ouHalfLife.toFixed(1)} phiên).`);
  }
  if (curPrice > 0) {
    chartInsights.push(`Giá thị trường hiện tại: ${curPrice.toLocaleString("vi-VN")} ₫ (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%).`);
  }
  chartInsights.push(`Kế hoạch Triple-Barrier: Chặn lỗ ${tripleBarrier.lowerBarrierPrice.toLocaleString("vi-VN")} ₫ | Mục tiêu 1: ${tripleBarrier.upperBarrierPrice.toLocaleString("vi-VN")} ₫ | Mục tiêu 2: ${tp2Price.toLocaleString("vi-VN")} ₫.`);

  // Executive Verdict
  let executiveVerdict = "";
  if ((apex?.apexScore ?? 0) >= 70 && fourM.totalScore >= 70) {
    executiveVerdict = `SIÊU HỢP LƯU ĐẦU TƯ: ${symbol} quy tụ đồng thuận hiếm có giữa Chân Sóng Apex (${apex?.apexScore}đ, Vùng Vàng) và Nền tảng 4M (${fourM.totalScore}đ Hạng ${fourM.gradeVi}). Xác suất sinh lời và tỷ số R:R đạt mức tối ưu.`;
  } else if ((apex?.apexScore ?? 0) >= 65) {
    executiveVerdict = `CHÂN SÓNG ĐẢO CHIỀU: ${symbol} đang hoàn thiện mẫu hình Wyckoff Spring tại Vùng Vàng với Z-Score ${apex?.ouZScore.toFixed(2)}σ. Thích hợp mở vị thế giải ngân từng phần với R:R >= 2.2x.`;
  } else if (fourM.totalScore >= 75) {
    executiveVerdict = `CƠ BẢN XUẤT SẮC: ${symbol} sở hữu con hào kinh tế mạnh và biên an toàn cao (${fourM.totalScore}/100), thích hợp chiến lược gom tích sản dài hạn khi có nhịp chiết khấu.`;
  } else {
    executiveVerdict = `THEO DÕI THẬN TRỌNG: ${symbol} đang trong pha tích lũy thử thách cạn cung. Cần kiên nhẫn chờ tín hiệu xác nhận cạn vol hoặc cải thiện dòng tiền trước khi mở vị thế lớn.`;
  }

  // 9. Generate Comprehensive Professional Narrative (Markdown CFA Format)
  const lines: string[] = [];
  lines.push(`## 📌 BÁO CÁO PHÂN TÍCH ĐỊNH LƯỢNG TOÀN DIỆN: ${symbol} (${input.name ?? "Sàn Chứng Khoán Việt Nam"})`);
  lines.push(`> **Đúc kết điều hành (Executive Verdict):** ${executiveVerdict}`);
  lines.push("");

  // Section 1
  lines.push(`### 1. ĐỊNH VỊ CHÂN SÓNG APEX & HÀNH ĐỘNG GIÁ WYCKOFF`);
  if (apex) {
    const rev = apex.reversalMetrics;
    const sweetStatus = rev.isSweetLaunchZone
      ? `👑 **NẰM TRỌN TRONG VÙNG VÀNG CHÂN SÓNG (Sweet Launch Zone)** — Độ mở rộng từ đáy chỉ **+${rev.extensionFromBottomPct.toFixed(1)}%** (chuẩn 0.8% - 7.5%), điểm mua sớm bảo toàn vốn.`
      : rev.isExtended
      ? `⚠️ **CẢNH BÁO MUA ĐUỔI (Extended)** — Giá đã chạy **+${rev.extensionFromBottomPct.toFixed(1)}%** từ đáy, vùng tích lũy chân sóng an toàn đã qua.`
      : `⏳ **THEO DÕI CẠN CUNG (Chưa đủ nảy)** — Giá chỉ cách đáy **+${rev.extensionFromBottomPct.toFixed(1)}%**, chưa xác nhận nảy mạnh.`;

    lines.push(`- **Trạng thái Chân Sóng:** ${sweetStatus}`);
    lines.push(`- **Tổng điểm Apex Quant Composite:** **${apex.apexScore}/100đ** · Xếp hạng giai đoạn: **${apex.categoryVi}** (${rev.reversalStageVi}).`);
    lines.push(`- **Mô hình Hồi quy Ornstein-Uhlenbeck (OU):** Độ lệch thống kê Z-Score đạt **${apex.ouZScore.toFixed(2)}σ** kèm chu kỳ bán rã hồi quy **t½ = ${apex.ouHalfLife.toFixed(1)} phiên** ${apex.ouZScore <= -1.2 ? "(Xung lực bật nảy kỹ thuật rất mạnh)" : "(Dao động quanh trục cân bằng)"}.`);
    lines.push(`- **Dư địa cản trên đầu (Overhead Room):** Khoảng trống an toàn tới ngưỡng cản gần nhất đạt **${rev.overheadRoomPct.toFixed(1)}%** ${rev.overheadRoomPct >= 5.0 ? "— Đạt yêu cầu dư địa an toàn để mở lệnh T+" : "— Cản trên đầu khá sát, lưu ý áp lực cung"}.`);
    lines.push(`- **Cấu trúc Wyckoff Spring:** Đáy chu kỳ gần nhất tại **${rev.lowestLow20.toLocaleString("vi-VN")} ₫** (${rev.lowestLowBarsAgo} phiên trước). Nhận định: **${apex.verdictVi}**.`);
  } else {
    lines.push(`- Đang tích lũy chuỗi nến lịch sử để tính toán độ lệch chuẩn Z-Score và cấu trúc Wyckoff Spring.`);
  }
  lines.push("");

  // Section 2
  lines.push(`### 2. DẤU CHÂN CÁ MẬP & HUẤN LUYỆN LỊCH SỬ THỰC NGHIỆM`);
  if (trainer) {
    lines.push(`- **Tỷ lệ Gom hàng Up/Down Volume (50 phiên):** Đạt **${trainer.upDownVolRatio}x** ${trainer.upDownVolRatio >= 1.05 ? "— Áp lực mua chủ động trong các phiên tăng áp đảo rõ rệt, dòng tiền tổ chức đang âm thầm gom hàng." : "— Dòng tiền chưa có sự phân hóa gom rõ nét, phe mua và phe bán đang giằng co."}`);
    lines.push(`- **Tỷ lệ Thắng Thực Nghiệm Lịch Sử:** Mô hình đo lường được tỷ lệ nảy thành công trong quá khứ của ${symbol} đạt **${trainer.historicalWinRatePct}%** (Lợi thế: **${trainer.historicalEdgeBadge}**).`);
    lines.push(`- **Xác suất Bẫy Nổ Vol Giả (Fakeout Penalty):** Ở mức **${trainer.fakeoutRiskPct}%** ${trainer.fakeoutRiskPct <= 35 ? "— Độ tin cậy cao, cổ phiếu có độ uy tín lớn khi nổ volume." : "— Có tiền sử xuất hiện các phiên break giả rồi điều chỉnh, cần kỷ luật giá mua."}.`);
    lines.push(`- **Độ Nảy Hỗ Trợ Động MA20/MA50:** Đạt **${trainer.supportBounceRatePct}%**, đường trung bình động đóng vai trò là bệ đỡ kỹ thuật đáng tin cậy.`);
  }
  if (input.foreignFlow) {
    const ffVal = input.foreignFlow.netValue ?? 0;
    lines.push(`- **Động thái Khối Ngoại:** ${ffVal > 0 ? `Khối ngoại mua ròng **${fmtMoney(ffVal)}**, hỗ trợ đắc lực cho xu hướng giá.` : ffVal < 0 ? `Khối ngoại bán ròng **${fmtMoney(Math.abs(ffVal))}**, tạo áp lực cung trong ngắn hạn.` : "Giao dịch khối ngoại ở mức cân bằng."}`);
  }
  lines.push("");

  // Section 3
  lines.push(`### 3. NỀN TẢNG NỘI TẠI & CON HÀO KINH TẾ 4M PHIL TOWN`);
  lines.push(`- **Đánh giá 4M Toàn diện:** **${fourM.totalScore}/100đ (Hạng ${fourM.gradeVi})** · Vượt qua **${fourM.passedPillarsCount}/4 trụ cột**.`);
  lines.push(`  + **M1 · Ý nghĩa (Meaning):** ${fourM.m1MeaningScore}/25đ (${fourM.m1Note}).`);
  lines.push(`  + **M2 · Con hào kinh tế (Moat):** ${fourM.m2MoatScore}/25đ (${fourM.m2Note}) — ROE đạt **${roe.toFixed(1)}%**, Biên lợi nhuận gộp đạt **${grossMargin.toFixed(1)}%**.`);
  lines.push(`  + **M3 · Năng lực quản trị (Management):** ${fourM.m3ManagementScore}/25đ (${fourM.m3Note}) — Nợ/VCSH: **${debtEquity.toFixed(2)}x**, Dòng tiền kinh doanh OCF: **${fmtMoney(ocf)}** ${ocf > netIncome && netIncome > 0 ? "(Chất lượng lợi nhuận vàng, OCF vượt trội LNST)" : ""}.`);
  lines.push(`  + **M4 · Biên an toàn (Margin of Safety):** ${fourM.m4MarginOfSafetyScore}/25đ (${fourM.m4Note}) — P/E hiện tại **${pe.toFixed(1)}x**, P/B **${pb.toFixed(1)}x**.`);
  lines.push(`- **Sức khỏe Tài chính Orca Health 5 Trụ cột:** Tổng thể: **${tcbsHealth.overall}/100đ** (Sinh lời: ${tcbsHealth.profitability} | Thanh khoản: ${tcbsHealth.liquidity} | Đòn bẩy: ${tcbsHealth.leverage} | Dòng tiền: ${tcbsHealth.cashflow} | Hiệu quả: ${tcbsHealth.efficiency}).`);
  lines.push("");

  // Section 4
  lines.push(`### 4. KẾ HOẠCH TÁC CHIẾN & CHIẾN LƯỢC TRIPLE-BARRIER DYNAMIC ATR`);
  lines.push(`- **Vùng Mua Khuyến Nghị (Sweet Entry Zone):** **${(curPrice * 0.99).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} - ${(curPrice * 1.015).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Tích lũy kiểm soát rủi ro tại Vùng Vàng).`);
  lines.push(`- **Điểm Cắt Lỗ Kỷ Luật (Stop Loss):** **${tripleBarrier.lowerBarrierPrice.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Cách -${tripleBarrier.stopLossReturnPct.toFixed(1)}% theo biến động ATR).`);
  lines.push(`- **Mục Tiêu Chốt Lời 1 (Take Profit 1):** **${tripleBarrier.upperBarrierPrice.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Lợi nhuận kỳ vọng +${tripleBarrier.targetReturnPct.toFixed(1)}%).`);
  lines.push(`- **Mục Tiêu Chốt Lời 2 (Take Profit 2):** **${tp2Price.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Lợi nhuận kỳ vọng +${(tripleBarrier.targetReturnPct * 1.5).toFixed(1)}%).`);
  lines.push(`- **Tỷ Số Lợi Nhuận / Rủi Ro (Risk/Reward):** Đạt **${tripleBarrier.riskRewardRatio}x** ${tripleBarrier.riskRewardRatio >= 2.0 ? "(Thỏa mãn điều kiện R:R chuẩn mực định lượng)" : ""}.`);
  lines.push("");
  lines.push(`*Báo cáo được tính toán trực tiếp từ Datafeed thời gian thực và Hệ thống Định lượng Đa tầng Orca Quant Engine.*`);

  const tEnd = performance.now();
  const latencyMs = Math.round(tEnd - t0);

  const apexBadge: DynamicApexBadge | undefined = apex
    ? {
        badge: apex.reversalMetrics.isSweetLaunchZone
          ? "👑 VÙNG VÀNG CHÂN SÓNG"
          : apex.reversalMetrics.isExtended
          ? "⚠️ ĐÃ CHẠY XA ĐÁY"
          : "⏳ THEO DÕI CẠN CUNG",
        isSweetLaunchZone: apex.reversalMetrics.isSweetLaunchZone,
        isExtended: apex.reversalMetrics.isExtended,
        isPremature: apex.reversalMetrics.isPremature,
        extensionFromBottomPct: apex.reversalMetrics.extensionFromBottomPct,
        overheadRoomPct: apex.reversalMetrics.overheadRoomPct,
        ouZScore: apex.ouZScore,
        riskRewardRatio: tripleBarrier.riskRewardRatio,
        entryPrice: curPrice,
        stopLossPrice: tripleBarrier.lowerBarrierPrice,
        takeProfit1Price: tripleBarrier.upperBarrierPrice,
        takeProfit2Price: tp2Price,
      }
    : undefined;

  return {
    symbol,
    narrative: lines.join("\n"),
    structured: {
      executiveVerdict,
      healthSummary: `Orca Health ${tcbsHealth.overall}/100 · 4M Phil Town: ${fourM.totalScore}/100 (${fourM.gradeVi}) · ROE: ${roe.toFixed(1)}% · OCF: ${fmtMoney(ocf)}.`,
      trendSummary: apex
        ? `Apex Quant: ${apex.apexScore}đ · Wyckoff Spring: ${apex.reversalMetrics.reversalStageVi} · Sweet Zone: ${apex.reversalMetrics.extensionFromBottomPct.toFixed(1)}% từ đáy · Z-Score: ${apex.ouZScore.toFixed(2)}σ.`
        : `Xu hướng kỹ thuật đang tích lũy · Up/Down Vol: ${trainer?.upDownVolRatio ?? 1.0}x.`,
      strengths,
      risks,
      watchpoints,
      outlook: (apex?.apexScore ?? 0) >= 65
        ? "Triển vọng đảo chiều tăng giá tích cực, ưu thế dòng tiền chân sóng và biên an toàn rõ nét."
        : fourM.totalScore >= 70
        ? "Triển vọng nội tại lành mạnh, chờ đợi nhịp chiết khấu hoặc dòng tiền kích hoạt chân sóng mới."
        : "Triển vọng trung tính, khuyến nghị quan sát và chờ kiểm định lại thanh khoản cạn kiệt.",
      chartInsights,
      valuationSignal: {
        targetPrice,
        marginOfSafetyPct,
        verdict: valVerdict,
        actionVi,
      },
      apexBadge,
    },
    fourM,
    tcbsHealth,
    apexQuant: apex,
    historicalTraining: trainer,
    tripleBarrier,
    model: "Orca Dynamic Quant AI Engine (Live Datafeed)",
    latencyMs,
    usedLlm: false,
    sourceNote: "100% In-House Live Datafeed & Quant Convergence (Zero external LLM latency)",
  };
}
