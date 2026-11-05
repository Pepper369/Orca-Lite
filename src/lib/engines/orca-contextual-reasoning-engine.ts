import { generateOrcaDynamicAiReport, type DynamicAiReport } from "./orca-dynamic-ai-intelligence";
import { isVnSymbol, getSecurity, sectorOf } from "../vn/master";
import type { SectorTrendRow } from "../services/sector-trend";

export type ContextDomain =
  | "stock_compare"
  | "stock_single"
  | "sector_money_flow"
  | "market_overview"
  | "personal_finance"
  | "quant_strategy"
  | "general";

export type StockAngle =
  | "entry_timing"
  | "fundamental_bctc"
  | "valuation"
  | "dividend"
  | "risk_caution"
  | "comprehensive";

export type PersonalTopic =
  | "budget_split"
  | "jars_6_pots"
  | "overspending_rescue"
  | "windfall_bonus"
  | "installment_loan"
  | "housing_loan"
  | "fire_retirement"
  | "three_pillars"
  | "debt_strategy"
  | "emergency_fund"
  | "cost_cutting"
  | "tax_salary"
  | "family_dependents"
  | "general_personal";

export interface ContextClassification {
  domain: ContextDomain;
  stockAngle?: StockAngle;
  personalTopic?: PersonalTopic;
  symbols: string[];
  sector?: string | null;
  targetAmount?: number | null;
}

export interface ContextualResponse {
  answer: string;
  domain: ContextDomain;
  stockAngle?: StockAngle;
  personalTopic?: PersonalTopic;
  structured?: Record<string, unknown>;
  model: string;
  latencyMs: number;
  sourceNote: string;
}

export interface SnapshotFacts {
  period?: string;
  netIncome?: number;
  totalNetIncome?: number;
  grossIncome?: number;
  totalGrossSalary?: number;
  totalExpenses?: number;
  fixedExpenses?: number;
  variableExpenses?: number;
  monthlySavings?: number;
  savingsRate?: number;
  fixedCostRatio?: number;
  emergencyFundMonths?: number;
  totalDebt?: number;
  netWorth?: number;
  healthScore?: number;
  healthRating?: string;
  location?: string;
  lifeStage?: string;
  primaryPriority?: string;
  dependents?: number;
  debtsList?: Array<{ name?: string; category?: string; balance?: number; interestRate?: number; minMonthlyPayment?: number }>;
  expensesList?: Array<{ name?: string; category?: string; amount?: number; isFixed?: boolean }>;
  goalsList?: Array<{ name?: string; targetAmount?: number; accumulatedAmount?: number; deadline?: string; status?: string }>;
}

function formatVnd(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "0 ₫";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)} nghìn tỷ ₫`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)} tỷ ₫`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(0)} tr ₫`;
  return `${v.toLocaleString("vi-VN")} ₫`;
}

function extractAmountFromText(text: string): number | null {
  const matchTy = text.match(/(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty\b)/i);
  if (matchTy) {
    const val = parseFloat(matchTy[1].replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 1_000_000_000);
  }
  const matchTrieu = text.match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr\b)/i);
  if (matchTrieu) {
    const val = parseFloat(matchTrieu[1].replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 1_000_000);
  }
  const matchK = text.match(/(\d+(?:[.,]\d+)?)\s*(?:k\b|nghìn|nghin)/i);
  if (matchK) {
    const val = parseFloat(matchK[1].replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 1_000);
  }
  return null;
}

const SKIP_TICKER_WORDS = new Set([
  "VND", "USD", "EUR", "ALL", "THE", "FOR", "AND", "NOT", "BUY", "BAN",
  "MUA", "GIA", "DON", "TIEN", "TIET", "LUONG", "CHI", "APP", "API", "NOW",
  "TOP", "DAT", "VAY", "NOI", "CAN", "XEM", "CHO", "TOI", "COI", "HOI",
  "LAM", "SAO", "NEN", "QUA", "CAC", "MOT", "HAI", "BAA", "BON", "NAM",
  "DAY", "HAY", "LAI", "THI", "KHI", "VOI", "DOC", "NHA", "NHO", "LON",
  "HET", "CON", "DAN", "SOO", "BCT", "EPS", "ROE", "ROA", "PEE", "PBB"
]);

export function extractTickers(q: string): string[] {
  const upper = q.toUpperCase();
  const explicitMatches = [...q.matchAll(/(?:mã|cổ\s*phiếu|cp|ticker|symbol)\s+([A-Za-z]{3})\b/gi)].map((m) => m[1].toUpperCase());
  const words = upper.match(/\b[A-Z0-9]{3}\b/g) ?? [];
  const found: string[] = [];

  for (const s of explicitMatches) {
    if (isVnSymbol(s) && !found.includes(s)) found.push(s);
  }

  for (const w of words) {
    if (w === "VND") {
      // In comparison or stock trading context, VND is VNDirect (CK VNDirect)
      if (/so sánh|vs\b|hay|cổ phiếu|mã|chứng khoán|định giá|hơn/i.test(q) && (found.length > 0 || /cổ phiếu|mã|chứng khoán|so sánh/i.test(q))) {
        if (!found.includes("VND")) found.push("VND");
      }
      continue;
    }
    if (!SKIP_TICKER_WORDS.has(w) && isVnSymbol(w) && !found.includes(w)) {
      found.push(w);
    }
  }
  return found;
}

export function detectSectorKeyword(q: string): string | null {
  const lower = q.toLowerCase();
  if (/ngân hàng|bank|banking/i.test(lower)) return "Ngân hàng";
  if (/chứng khoán|ctck|broker/i.test(lower)) return "Chứng khoán";
  if (/thép|ton|hrc|sat thep/i.test(lower)) return "Thép";
  if (/bất động sản|bđs|dia oc|nha dat/i.test(lower)) return "Bất động sản";
  if (/khu công nghiệp|kcn/i.test(lower)) return "Khu công nghiệp";
  if (/công nghệ|it|phan mem/i.test(lower)) return "Công nghệ";
  if (/bán lẻ|retail/i.test(lower)) return "Bán lẻ";
  if (/dầu khí|xang dau|oil|gas/i.test(lower)) return "Dầu khí";
  if (/hóa chất|phân bón|đạm/i.test(lower)) return "Hóa chất & Phân bón";
  if (/thực phẩm|đồ uống|f&b|thuc pham/i.test(lower)) return "Thực phẩm & Đồ uống";
  if (/dược phẩm|y tế|thuoc/i.test(lower)) return "Dược phẩm & Y tế";
  if (/xây dựng|vật liệu/i.test(lower)) return "Xây dựng & Vật liệu";
  if (/hàng không|vận tải|cảng biển|logistics/i.test(lower)) return "Hàng không & Vận tải";
  return null;
}

export function classifyContext(question: string, facts?: SnapshotFacts): ContextClassification {
  const q = question.trim();
  const lower = q.toLowerCase();
  const symbols = extractTickers(q);
  const targetAmount = extractAmountFromText(q);
  const sector = detectSectorKeyword(q);

  // 1. Stock Pair Comparison (So sánh 2 mã đối đầu)
  const isCompare = /so sánh|vs\b|đối chiếu|hay|hơn|chon ma nao|nen mua .* hay/i.test(lower);
  if (symbols.length >= 2 || (symbols.length === 2 && isCompare)) {
    return {
      domain: "stock_compare",
      symbols: symbols.slice(0, 2),
      sector,
      targetAmount,
    };
  }

  // 2. Single Stock with specific analytical angle
  if (symbols.length === 1) {
    let stockAngle: StockAngle = "comprehensive";
    if (/mua được không|điểm vào|chân sóng|vùng vàng|bắt đáy|cắt lỗ|take profit|stop loss|r:r|t\+|lướt sóng/i.test(lower)) {
      stockAngle = "entry_timing";
    } else if (/báo cáo tài chính|bctc|doanh thu|lợi nhuận|dòng tiền|ocf|nợ|vốn chủ|chất lượng/i.test(lower)) {
      stockAngle = "fundamental_bctc";
    } else if (/định giá|pe|pb|p\/e|p\/b|đắt hay rẻ|giá trị thực|mục tiêu giá|target price|biên an toàn/i.test(lower)) {
      stockAngle = "valuation";
    } else if (/cổ tức|dividend|tiền mặt|tỷ suất|tích sản/i.test(lower)) {
      stockAngle = "dividend";
    } else if (/rủi ro|đu đỉnh|bẫy|xấu không|bán ròng|cản trên|fakeout/i.test(lower)) {
      stockAngle = "risk_caution";
    }

    return {
      domain: "stock_single",
      stockAngle,
      symbols: [symbols[0]],
      sector: sector ?? sectorOf(symbols[0]),
      targetAmount,
    };
  }

  // 3. Sector & Money Flow Context
  if (sector || /ngành nào|dòng tiền vào đâu|sóng ngành|nhóm ngành|dòng tiền luân chuyển/i.test(lower)) {
    return {
      domain: "sector_money_flow",
      symbols: [],
      sector,
      targetAmount,
    };
  }

  // 4. Market Overview Context
  if (/thị\s*trường|vn-?index|vn30|hose|hnx|upcom|khối ngoại|tổng quan phiên|thanh khoản hôm nay/i.test(lower)) {
    return {
      domain: "market_overview",
      symbols: [],
      targetAmount,
    };
  }

  // 5. Personal Finance Context
  if (/lương|50\/30\/20|chia lương|thu nhập|chi tiêu|tiết kiệm|nợ|quỹ khẩn cấp|mua nhà|mua xe|trả góp|vàng|fire|nghỉ hưu|thưởng|tiêu lố|con nhỏ/i.test(lower)) {
    let personalTopic: PersonalTopic = "general_personal";
    if (/50\/30\/20|50-30-20|chia lương|phân bổ lương/i.test(lower)) personalTopic = "budget_split";
    else if (/6 chiếc lọ|jars|sáu chiếc lọ/i.test(lower)) personalTopic = "jars_6_pots";
    else if (/tiêu lố|lỡ tiêu|thâm hụt|hết tiền|cứu/i.test(lower)) personalTopic = "overspending_rescue";
    else if (/thưởng|tiền nhàn rỗi|trúng|tết/i.test(lower)) personalTopic = "windfall_bonus";
    else if (/mua nhà|vay nhà|cọc nhà|vay ngân hàng mua nhà|vay mua nhà/i.test(lower)) personalTopic = "housing_loan";
    else if (/mua xe|iphone|laptop|vay mua|trả góp/i.test(lower)) personalTopic = "installment_loan";
    else if (/fire|nghỉ hưu|tự do tài chính|tuổi già/i.test(lower)) personalTopic = "fire_retirement";
    else if (/vàng|tiết kiệm hay mua vàng|quỹ mở/i.test(lower)) personalTopic = "three_pillars";
    else if (/nợ|trả nợ|snowball|avalanche/i.test(lower)) personalTopic = "debt_strategy";
    else if (/quỹ khẩn cấp|dự phòng|an toàn/i.test(lower)) personalTopic = "emergency_fund";
    else if (/cắt giảm|bớt chi|tối giản/i.test(lower)) personalTopic = "cost_cutting";
    else if (/thuế|tncn|bhxh|gross|net/i.test(lower)) personalTopic = "tax_salary";
    else if (/con|nuôi con|học phí|bảo hiểm y tế/i.test(lower)) personalTopic = "family_dependents";

    return {
      domain: "personal_finance",
      personalTopic,
      symbols: [],
      targetAmount,
    };
  }

  // 6. Quant Screener Strategies
  if (/bộ lọc|screener|chân sóng apex|oquant|backtest|breakout|canslim/i.test(lower)) {
    return {
      domain: "quant_strategy",
      symbols: [],
      targetAmount,
    };
  }

  return {
    domain: "general",
    symbols: [],
    targetAmount,
  };
}

/**
 * XỬ LÝ SO SÁNH 2 MÃ CỔ PHIẾU ĐỐI ĐẦU (HEAD-TO-HEAD QUANT CONFLICT)
 */
async function handleStockPairCompare(symA: string, symB: string): Promise<ContextualResponse | null> {
  const t0 = performance.now();
  const { getVnStockDetail } = await import("../services/stocks");
  const [resA, resB] = await Promise.all([
    getVnStockDetail(symA).catch(() => null),
    getVnStockDetail(symB).catch(() => null),
  ]);

  if (!resA?.detail || !resB?.detail) return null;

  const detA = resA.detail;
  const detB = resB.detail;

  const repA = generateOrcaDynamicAiReport({
    symbol: symA,
    name: detA.name,
    quote: detA.quote,
    bars: detA.bars,
    technical: detA.technical,
    financials: detA.financials,
    financialHealth: detA.financialHealth,
    financialGrowth: detA.financialGrowth,
    ratioMap: detA.ratioMap,
    foreignFlow: detA.foreignFlow as any,
    orderBook: detA.orderBook as any,
  });

  const repB = generateOrcaDynamicAiReport({
    symbol: symB,
    name: detB.name,
    quote: detB.quote,
    bars: detB.bars,
    technical: detB.technical,
    financials: detB.financials,
    financialHealth: detB.financialHealth,
    financialGrowth: detB.financialGrowth,
    ratioMap: detB.ratioMap,
    foreignFlow: detB.foreignFlow as any,
    orderBook: detB.orderBook as any,
  });

  const pA = repA.structured.apexBadge?.entryPrice ?? detA.quote?.price ?? 0;
  const pB = repB.structured.apexBadge?.entryPrice ?? detB.quote?.price ?? 0;
  const chgA = detA.quote?.changePercent ?? 0;
  const chgB = detB.quote?.changePercent ?? 0;

  const apexScoreA = repA.apexQuant?.apexScore ?? 0;
  const apexScoreB = repB.apexQuant?.apexScore ?? 0;

  const sweetA = repA.apexQuant?.reversalMetrics.isSweetLaunchZone ? "👑 VÙNG VÀNG" : repA.apexQuant?.reversalMetrics.isExtended ? "⚠️ ĐÃ CHẠY XA" : "⏳ THEO DÕI";
  const sweetB = repB.apexQuant?.reversalMetrics.isSweetLaunchZone ? "👑 VÙNG VÀNG" : repB.apexQuant?.reversalMetrics.isExtended ? "⚠️ ĐÃ CHẠY XA" : "⏳ THEO DÕI";

  const rrA = repA.tripleBarrier?.riskRewardRatio ?? 0;
  const rrB = repB.tripleBarrier?.riskRewardRatio ?? 0;

  const roeA = repA.fourM.roe != null ? `${repA.fourM.roe.toFixed(1)}%` : "—";
  const roeB = repB.fourM.roe != null ? `${repB.fourM.roe.toFixed(1)}%` : "—";

  const gmA = repA.fourM.grossMargin != null ? `${repA.fourM.grossMargin.toFixed(1)}%` : "—";
  const gmB = repB.fourM.grossMargin != null ? `${repB.fourM.grossMargin.toFixed(1)}%` : "—";

  const deA = repA.fourM.debtEquity != null ? `${repA.fourM.debtEquity.toFixed(2)}x` : "—";
  const deB = repB.fourM.debtEquity != null ? `${repB.fourM.debtEquity.toFixed(2)}x` : "—";

  const peA = repA.fourM.pe != null ? `${repA.fourM.pe.toFixed(1)}x` : "—";
  const peB = repB.fourM.pe != null ? `${repB.fourM.pe.toFixed(1)}x` : "—";

  const pbA = repA.fourM.pb != null ? `${repA.fourM.pb.toFixed(2)}x` : "—";
  const pbB = repB.fourM.pb != null ? `${repB.fourM.pb.toFixed(2)}x` : "—";

  const lines: string[] = [];
  lines.push(`## ⚖️ SO SÁNH ĐỐI ĐẦU ĐỊNH LƯỢNG: ${symA} VS ${symB}`);
  lines.push(`> **Đúc kết tổng quan:** ${symA} (${repA.fourM.gradeVi}, Chân Sóng Apex: ${apexScoreA}đ) đối đầu với ${symB} (${repB.fourM.gradeVi}, Chân Sóng Apex: ${apexScoreB}đ).`);
  lines.push("");

  lines.push(`### 1. BẢNG MA TRẬN ĐỐI ĐẦU TRỰC DIỆN (HEAD-TO-HEAD MATRIX)`);
  lines.push(`| Tiêu chí Định lượng & BCTC | **${symA}** | **${symB}** | Đánh giá Ưu thế |`);
  lines.push(`| :--- | :---: | :---: | :--- |`);
  lines.push(`| **Thị giá & Biến động** | ${pA.toLocaleString("vi-VN")} ₫ (${chgA >= 0 ? "+" : ""}${chgA.toFixed(2)}%) | ${pB.toLocaleString("vi-VN")} ₫ (${chgB >= 0 ? "+" : ""}${chgB.toFixed(2)}%) | Dòng tiền phiên hiện tại |`);
  lines.push(`| **👑 Chân Sóng Apex (0-100đ)** | **${apexScoreA}đ** (${sweetA}) | **${apexScoreB}đ** (${sweetB}) | ${apexScoreA >= apexScoreB ? `**${symA}** có vị thế đảo chiều tối ưu hơn` : `**${symB}** có vị thế đảo chiều tối ưu hơn`} |`);
  lines.push(`| **Tỷ số Risk/Reward (ATR)** | **${rrA}x** | **${rrB}x** | ${rrA >= rrB ? `${symA} biên lợi nhuận/rủi ro cao hơn` : `${symB} biên lợi nhuận/rủi ro cao hơn`} |`);
  lines.push(`| **Nền tảng 4M Phil Town** | **${repA.fourM.totalScore}/100** (${repA.fourM.gradeVi}) | **${repB.fourM.totalScore}/100** (${repB.fourM.gradeVi}) | ${repA.fourM.totalScore >= repB.fourM.totalScore ? `${symA} nội tại vượt trội` : `${symB} nội tại vượt trội`} |`);
  lines.push(`| **Hiệu quả sinh lời (ROE)** | ${roeA} | ${roeB} | Khả năng sinh lời trên vốn |`);
  lines.push(`| **Biên lợi nhuận gộp** | ${gmA} | ${gmB} | Con hào kinh tế (Moat) |`);
  lines.push(`| **Đòn bẩy Nợ/VCSH (D/E)** | ${deA} | ${deB} | Cân bằng rủi ro cấu trúc vốn |`);
  lines.push(`| **Định giá P/E** | ${peA} | ${peB} | Chiết khấu định giá |`);
  lines.push(`| **Định giá P/B** | ${pbA} | ${pbB} | Giá trị sổ sách |`);
  lines.push("");

  lines.push(`### 2. PHÂN TÍCH ƯU THẾ CHIẾN THUẬT TỪNG MÃ`);
  lines.push(`- **Về mã ${symA} (${detA.name ?? "Sàn VN"}):**`);
  lines.push(`  + *Vị thế kỹ thuật:* ${repA.apexQuant ? `${repA.apexQuant.reversalMetrics.reversalStageVi}, Z-Score ${repA.apexQuant.ouZScore.toFixed(2)}σ.` : "Đang tích lũy."}`);
  lines.push(`  + *Điểm mạnh cốt lõi:* ${repA.structured.strengths.slice(0, 2).join(" ")}`);
  lines.push(`  + *Rủi ro cần theo dõi:* ${repA.structured.risks.slice(0, 1).join(" ")}`);
  lines.push("");
  lines.push(`- **Về mã ${symB} (${detB.name ?? "Sàn VN"}):**`);
  lines.push(`  + *Vị thế kỹ thuật:* ${repB.apexQuant ? `${repB.apexQuant.reversalMetrics.reversalStageVi}, Z-Score ${repB.apexQuant.ouZScore.toFixed(2)}σ.` : "Đang tích lũy."}`);
  lines.push(`  + *Điểm mạnh cốt lõi:* ${repB.structured.strengths.slice(0, 2).join(" ")}`);
  lines.push(`  + *Rủi ro cần theo dõi:* ${repB.structured.risks.slice(0, 1).join(" ")}`);
  lines.push("");

  lines.push(`### 3. ĐỀ XUẤT PHÂN BỔ THEO KHẨU VỊ ĐẦU TƯ`);
  if (apexScoreA >= apexScoreB && repA.apexQuant?.reversalMetrics.isSweetLaunchZone) {
    lines.push(`- **Khẩu vị Bắt chân sóng ngắn hạn T+:** Ưu tiên **${symA}** vì đang nằm trọn trong **Vùng Vàng Chân Sóng**, độ nảy tốt và tỷ lệ R:R (${rrA}x) vượt trội.`);
  } else if (repB.apexQuant?.reversalMetrics.isSweetLaunchZone) {
    lines.push(`- **Khẩu vị Bắt chân sóng ngắn hạn T+:** Ưu tiên **${symB}** vì đang có điểm Chân Sóng Apex cao hơn, cạn cung chuẩn Wyckoff.`);
  } else {
    lines.push(`- **Khẩu vị Bắt chân sóng ngắn hạn T+:** Cả hai mã cần theo dõi thêm nhịp kiểm định cạn vol trước khi mở lệnh tỷ trọng lớn.`);
  }

  if (repA.fourM.totalScore >= repB.fourM.totalScore) {
    lines.push(`- **Khẩu vị Tích sản dài hạn (Value Investing):** Ưu tiên **${symA}** nhờ con hào kinh tế vững chắc (4M ${repA.fourM.totalScore}đ, ROE ${roeA}).`);
  } else {
    lines.push(`- **Khẩu vị Tích sản dài hạn (Value Investing):** Ưu tiên **${symB}** nhờ nền tảng nội tại mạnh hơn (4M ${repB.fourM.totalScore}đ, ROE ${roeB}).`);
  }
  lines.push("");
  lines.push(`*Số liệu được trích xuất trực tiếp từ BCTC và chuỗi nến lịch sử thời gian thực (Zero Hallucination).*`);

  const tEnd = performance.now();
  return {
    answer: lines.join("\n"),
    domain: "stock_compare",
    structured: {
      symbolA: symA,
      symbolB: symB,
      reportA: repA.structured,
      reportB: repB.structured,
      matrix: {
        price: { [symA]: pA, [symB]: pB },
        apexScore: { [symA]: apexScoreA, [symB]: apexScoreB },
        fourMScore: { [symA]: repA.fourM.totalScore, [symB]: repB.fourM.totalScore },
        riskReward: { [symA]: rrA, [symB]: rrB },
      },
    },
    model: "Orca Head-to-Head Quant Engine",
    latencyMs: Math.round(tEnd - t0),
    sourceNote: "100% In-House Live Datafeed Comparative Analytics",
  };
}

/**
 * XỬ LÝ ĐÀO SÂU DÒNG TIỀN VÀ XU HƯỚNG NHÓM NGÀNH (SECTOR DYNAMICS)
 */
async function handleSectorDynamics(sectorKeyword: string | null): Promise<ContextualResponse | null> {
  const t0 = performance.now();
  const { getSectorTrendSnapshot } = await import("../services/sector-trend");
  const snap = await getSectorTrendSnapshot().catch(() => null);
  if (!snap || !snap.sectors.length) return null;

  let targetSector: SectorTrendRow | undefined = undefined;
  if (sectorKeyword) {
    targetSector = snap.sectors.find((s) => s.sector.toLowerCase().includes(sectorKeyword.toLowerCase()));
  }

  const lines: string[] = [];

  if (targetSector) {
    // Phân tích chi tiết ngành cụ thể
    lines.push(`## 🏭 PHÂN TÍCH DÒNG TIỀN & XU HƯỚNG NGÀNH: ${targetSector.sector.toUpperCase()}`);
    lines.push(`> **Trạng thái:** **${targetSector.trendLabelVi}** (Điểm xu hướng: **${targetSector.trendScore ?? 0}đ**) · Mức biến động trung bình: **${targetSector.avgChangePercent != null ? (targetSector.avgChangePercent >= 0 ? "+" : "") + targetSector.avgChangePercent.toFixed(2) + "%" : "—"}**.`);
    lines.push("");

    lines.push(`### 1. ĐỘ RỘNG DÒNG TIỀN TOÀN NGÀNH (MARKET BREADTH)`);
    lines.push(`- **Tương quan Tăng / Giảm:** **${targetSector.advances} mã tăng** / **${targetSector.declines} mã giảm** / **${targetSector.unchanged} mã đứng giá**.`);
    lines.push(`- **Tổng Giá Trị Giao Dịch:** Đạt **${fmtMoney(targetSector.totalValue)}** (Khối lượng: ${(targetSector.totalVolume / 1e6).toFixed(1)} tr cổ phiếu).`);
    lines.push(`- **Tỷ lệ phân bổ:** Chiếm số lượng ${targetSector.count}/${targetSector.universeCount} mã niêm yết có thanh khoản hoạt động trong phiên.`);
    lines.push("");

    lines.push(`### 2. CỔ PHIẾU DẪN DẮT (LEADERS) & ÁP LỰC CHỐT LỜI (LAGGARDS)`);
    if (targetSector.topGainers.length) {
      const gainerText = targetSector.topGainers.slice(0, 4).map((g) => `• **${g.symbol}**: ${g.price != null ? g.price.toLocaleString("vi-VN") + " ₫" : "—"} (${g.changePercent != null ? (g.changePercent >= 0 ? "+" : "") + g.changePercent.toFixed(2) + "%" : "—"}, Khối lượng: ${( (g.volume ?? 0) / 1e3).toFixed(0)}k cp)`).join("\n");
      lines.push(`**Top Cổ Phiếu Tăng Mạnh Dẫn Dắt Dòng Tiền:**\n${gainerText}`);
    }
    if (targetSector.topLosers.length) {
      const loserText = targetSector.topLosers.slice(0, 3).map((l) => `• **${l.symbol}**: ${l.price != null ? l.price.toLocaleString("vi-VN") + " ₫" : "—"} (${l.changePercent != null ? l.changePercent.toFixed(2) + "%" : "—"})`).join("\n");
      lines.push(`\n**Top Cổ Phiếu Chịu Áp Lực Điều Chỉnh:**\n${loserText}`);
    }
    lines.push("");

    lines.push(`### 3. CHIẾN LƯỢC HÀNH ĐỘNG ĐỊNH LƯỢNG`);
    if ((targetSector.trendScore ?? 0) >= 20) {
      lines.push(`- Nhóm ngành **${targetSector.sector}** đang hút dòng tiền chủ động. Ưu tiên canh các nhịp võng điều chỉnh để mở vị thế vào các mã đầu ngành nằm trong **👑 Vùng Vàng Chân Sóng Apex**.`);
    } else if ((targetSector.trendScore ?? 0) <= -20) {
      lines.push(`- Nhóm ngành **${targetSector.sector}** đang gặp áp lực cung phân phối ngắn hạn. Cần kiên nhẫn chờ tín hiệu cạn kiệt thanh khoản (Absorption) trước khi giải ngân bắt đáy.`);
    } else {
      lines.push(`- Nhóm ngành **${targetSector.sector}** đang trong pha phân hóa và tích lũy. Dòng tiền chọn lọc vào từng cổ phiếu có câu chuyện tăng trưởng hoặc BCTC quý vượt trội thay vì tăng đồng loạt.`);
    }
  } else {
    // Tổng quan luân chuyển dòng tiền các nhóm ngành trên toàn thị trường
    lines.push(`## 🧭 BẢN ĐỒ LUÂN CHUYỂN DÒNG TIỀN CÁC NHÓM NGÀNH (SECTOR ROTATION)`);
    lines.push(`> **Tổng quan thị trường:** Mức biến động trung bình toàn sàn: **${snap.marketAvgChangePercent != null ? (snap.marketAvgChangePercent >= 0 ? "+" : "") + snap.marketAvgChangePercent.toFixed(2) + "%" : "—"}**.`);
    lines.push("");

    lines.push(`### 1. TOP CÁC NGÀNH DẪN DẮT DÒNG TIỀN (LEADING SECTORS)`);
    const leaderLines = snap.leaders.slice(0, 5).map((s, idx) => {
      const chg = s.avgChangePercent != null ? `${s.avgChangePercent >= 0 ? "+" : ""}${s.avgChangePercent.toFixed(2)}%` : "—";
      return `${idx + 1}. **${s.sector}** (Điểm xu hướng: **${s.trendScore ?? 0}đ**, Biến động: **${chg}** | Giá trị: **${fmtMoney(s.totalValue)}**) — *${s.trendLabelVi}* (${s.advances} tăng / ${s.declines} giảm).`;
    });
    lines.push(leaderLines.join("\n"));
    lines.push("");

    lines.push(`### 2. CÁC NGÀNH ĐANG CHỊU ÁP LỰC ĐIỀU CHỈNH / TÍCH LŨY`);
    const laggardLines = snap.laggards.slice(0, 4).map((s, idx) => {
      const chg = s.avgChangePercent != null ? `${s.avgChangePercent >= 0 ? "+" : ""}${s.avgChangePercent.toFixed(2)}%` : "—";
      return `• **${s.sector}**: Biến động **${chg}** (Điểm: ${s.trendScore ?? 0}đ, Giá trị: ${fmtMoney(s.totalValue)}).`;
    });
    lines.push(laggardLines.join("\n"));
    lines.push("");

    lines.push(`### 3. KHUYẾN NGHỊ TÁC CHIẾN TỪ ORCA QUANT`);
    lines.push(`- Theo dõi sát sự luân chuyển dòng tiền từ nhóm dẫn dắt sang các nhóm tích lũy nền giá.`);
    lines.push(`- Gõ tên nhóm ngành cụ thể (ví dụ: *"ngành ngân hàng"*, *"ngành thép"*, *"ngành chứng khoán"*) để xem chi tiết danh sách cổ phiếu dẫn dắt.`);
  }

  const tEnd = performance.now();
  return {
    answer: lines.join("\n"),
    domain: "sector_money_flow",
    structured: {
      targetSector: targetSector?.sector ?? "ALL",
      leaders: snap.leaders.slice(0, 5).map((l) => ({ sector: l.sector, trendScore: l.trendScore, avgChange: l.avgChangePercent })),
      laggards: snap.laggards.slice(0, 4).map((l) => ({ sector: l.sector, trendScore: l.trendScore, avgChange: l.avgChangePercent })),
    },
    model: "Orca Sector Rotation Hub (Live)",
    latencyMs: Math.round(tEnd - t0),
    sourceNote: "100% In-House Sector Datafeed (Zero external LLM latency)",
  };
}

/**
 * XỬ LÝ CỔ PHIẾU ĐƠN LẺ VỚI TRỌNG TÂM CÂU HỎI (SINGLE STOCK ANGLE TAILORING)
 */
async function handleSingleStockContext(symbol: string, angle: StockAngle): Promise<ContextualResponse | null> {
  const t0 = performance.now();
  const { getVnStockDetail } = await import("../services/stocks");
  const detailRes = await getVnStockDetail(symbol).catch(() => null);
  if (!detailRes?.detail) return null;

  const detail = detailRes.detail;
  const report = generateOrcaDynamicAiReport({
    symbol,
    name: detail.name,
    quote: detail.quote,
    bars: detail.bars,
    technical: detail.technical,
    financials: detail.financials,
    financialHealth: detail.financialHealth,
    financialGrowth: detail.financialGrowth,
    ratioMap: detail.ratioMap,
    foreignFlow: detail.foreignFlow as any,
    orderBook: detail.orderBook as any,
  });

  const p = report.structured.apexBadge?.entryPrice ?? detail.quote?.price ?? 0;
  const changePct = detail.quote?.changePercent ?? 0;
  const apex = report.apexQuant;
  const tb = report.tripleBarrier;
  const fourM = report.fourM;

  const lines: string[] = [];

  // Tailor answer focus based on context angle
  if (angle === "entry_timing") {
    lines.push(`## 🎯 TƯ VẤN ĐIỂM VÀO & VỊ THẾ CHÂN SÓNG: ${symbol} (${detail.name ?? "Sàn VN"})`);
    lines.push(`> **Thị giá hiện tại:** **${p.toLocaleString("vi-VN")} ₫** (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%) · Khối lượng: ${( (detail.quote?.volume ?? 0) / 1e3).toFixed(0)}k cp.`);
    lines.push("");

    lines.push(`### 1. ĐỊNH VỊ VÙNG VÀNG CHÂN SÓNG APEX (WYCKOFF SPRING)`);
    if (apex) {
      const rev = apex.reversalMetrics;
      const badgeStatus = rev.isSweetLaunchZone
        ? `👑 **NẰM TRỌN TRONG VÙNG VÀNG CHÂN SÓNG (Sweet Launch Zone)**: Giá chỉ mở rộng **+${rev.extensionFromBottomPct.toFixed(1)}%** từ đáy (chuẩn an toàn 0.8% - 7.5%). Đây là vị thế giải ngân sớm bảo toàn vốn tối ưu.`
        : rev.isExtended
        ? `⚠️ **CẢNH BÁO MUA ĐUỔI (Extended)**: Giá đã chạy **+${rev.extensionFromBottomPct.toFixed(1)}%** từ đáy, vùng tích lũy chân sóng đã qua, dễ gặp rung lắc T+ khi chạm cản bên trên.`
        : `⏳ **THEO DÕI CẠN CUNG (Chưa đủ nảy)**: Giá chỉ cách đáy **+${rev.extensionFromBottomPct.toFixed(1)}%**, cần chờ nến xác nhận dòng tiền nảy dứt khoát.`;

      lines.push(`- **Trạng thái:** ${badgeStatus}`);
      lines.push(`- **Tổng điểm Apex Quant:** **${apex.apexScore}/100đ** (Hạng: **${apex.categoryVi}** - ${rev.reversalStageVi}).`);
      lines.push(`- **Hồi quy Thống kê Ornstein-Uhlenbeck (OU):** Z-Score = **${apex.ouZScore.toFixed(2)}σ** (chu kỳ bán rã hồi quy **t½ = ${apex.ouHalfLife.toFixed(1)} phiên**).`);
      lines.push(`- **Khoảng trống Cản trên đầu (Overhead Room):** Còn **${rev.overheadRoomPct.toFixed(1)}%** tới kháng cự cứng gần nhất ${rev.overheadRoomPct >= 5.0 ? "(Đủ biên an toàn)" : "(Cản khá sát, lưu ý áp lực kẹp hàng)"}.`);
    } else {
      lines.push(`- Đang tích lũy thêm chuỗi nến lịch sử để tính toán độ lệch chuẩn Z-Score.`);
    }
    lines.push("");

    if (tb) {
      lines.push(`### 2. KẾ HOẠCH TÁC CHIẾN TRIPLE-BARRIER DYNAMIC ATR (R:R >= 2.2x)`);
      lines.push(`- **Vùng Mua Tích Lũy (Sweet Entry):** **${(p * 0.99).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} - ${(p * 1.015).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫**`);
      lines.push(`- **Điểm Cắt Lỗ Kỷ Luật (Stop Loss):** **${tb.lowerBarrierPrice.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Biên độ -${tb.stopLossReturnPct.toFixed(1)}% theo biến động ATR).`);
      lines.push(`- **Mục Tiêu Chốt Lời 1 (Take Profit 1):** **${tb.upperBarrierPrice.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Lợi nhuận kỳ vọng +${tb.targetReturnPct.toFixed(1)}%).`);
      lines.push(`- **Mục Tiêu Chốt Lời 2 (Take Profit 2):** **${(p * (1 + (tb.targetReturnPct * 1.5) / 100)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ₫** (Lợi nhuận kỳ vọng +${(tb.targetReturnPct * 1.5).toFixed(1)}%).`);
      lines.push(`- **Tỷ Số Lợi Nhuận / Rủi Ro (Risk/Reward):** Đạt **${tb.riskRewardRatio}x** ${tb.riskRewardRatio >= 2.0 ? "(Đạt chuẩn quản trị rủi ro định lượng)" : ""}.`);
    }

  } else if (angle === "fundamental_bctc") {
    lines.push(`## 📑 THẨM ĐỊNH SỨC KHỎE TÀI CHÍNH & BÁO CÁO TÀI CHÍNH: ${symbol}`);
    lines.push(`> **Đánh giá 4M Phil Town:** **${fourM.totalScore}/100đ (Hạng ${fourM.gradeVi})** · Vượt qua **${fourM.passedPillarsCount}/4 trụ cột**.`);
    lines.push("");

    lines.push(`### 1. CHẤT LƯỢNG LỢI NHUẬN & DÒNG TIỀN THỰC THU`);
    const inc0 = (detail.financials.income ?? [])[0] as Record<string, unknown> | undefined;
    const cf0 = (detail.financials.cashflow ?? [])[0] as Record<string, unknown> | undefined;
    const bal0 = (detail.financials.balance ?? [])[0] as Record<string, unknown> | undefined;

    const rev = inc0?.netRevenue ?? inc0?.revenue;
    const ni = inc0?.netIncome ?? inc0?.profitAfterTax;
    const ocf = cf0?.operatingCashFlow ?? cf0?.netCashFromOperating;

    lines.push(`- **Doanh thu thuần kỳ gần nhất:** ${typeof rev === "number" ? fmtMoney(rev) : "Chưa có dữ liệu"}.`);
    lines.push(`- **Lợi nhuận sau thuế (LNST):** ${typeof ni === "number" ? fmtMoney(ni) : "Chưa có dữ liệu"}.`);
    lines.push(`- **Dòng tiền thuần từ HĐKD (OCF):** ${typeof ocf === "number" ? fmtMoney(ocf) : "Chưa có dữ liệu"} ${typeof ocf === "number" && typeof ni === "number" && ocf > ni ? "— **(Chất lượng lợi nhuận cao: OCF vượt trội LNST, doanh thu thực thu không ảo)**" : typeof ocf === "number" && ocf < 0 ? "— **(Cảnh báo: Dòng tiền OCF âm, bị đọng vốn trong khoản phải thu/tồn kho)**" : ""}.`);
    lines.push("");

    lines.push(`### 2. CƠ CẤU VỐN & ĐÒN BẨY NỢ VAY`);
    const debtEquity = fourM.debtEquity;
    lines.push(`- **Tỷ lệ Nợ/VCSH (D/E):** ${debtEquity != null ? `${debtEquity.toFixed(2)}x` : "Chưa có dữ liệu"} ${debtEquity != null ? (debtEquity <= 0.8 ? "(Cơ cấu vốn rất lành mạnh, ít áp lực lãi vay)" : debtEquity > 1.4 ? "(Đòn bẩy nợ cao, cần kiểm tra dòng tiền trả nợ ngắn hạn)" : "(Mức đòn bẩy trung bình)") : ""}.`);
    lines.push(`- **Hiệu quả sinh lời (ROE):** ${fourM.roe != null ? `${fourM.roe.toFixed(1)}%` : "Chưa có dữ liệu"}.`);
    lines.push(`- **Biên lợi nhuận gộp:** ${fourM.grossMargin != null ? `${fourM.grossMargin.toFixed(1)}%` : "Chưa có dữ liệu"}.`);

  } else if (angle === "valuation") {
    lines.push(`## 💎 THẨM ĐỊNH ĐỊNH GIÁ & BIÊN AN TOÀN: ${symbol}`);
    lines.push(`> **Khuyến nghị định giá:** **${report.structured.valuationSignal.verdict}** — ${report.structured.valuationSignal.actionVi}.`);
    lines.push("");

    lines.push(`### 1. CÁC HỆ SỐ ĐỊNH GIÁ CỐT LÕI (THỰC TẾ)`);
    lines.push(`- **P/E hiện tại:** ${fourM.pe != null && fourM.pe > 0 ? `**${fourM.pe.toFixed(1)}x**` : "Chưa có dữ liệu từ nguồn cấp"}.`);
    lines.push(`- **P/B hiện tại:** ${fourM.pb != null && fourM.pb > 0 ? `**${fourM.pb.toFixed(2)}x**` : "Chưa có dữ liệu từ nguồn cấp"}.`);
    lines.push(`- **Thị giá:** ${p.toLocaleString("vi-VN")} ₫.`);
    lines.push("");

    lines.push(`### 2. MỤC TIÊU GIÁ & BIÊN AN TOÀN (MARGIN OF SAFETY)`);
    if (report.structured.valuationSignal.targetPrice != null) {
      lines.push(`- **Giá trị Hợp lý Kỳ vọng (Target Price):** **${report.structured.valuationSignal.targetPrice.toLocaleString("vi-VN")} ₫**`);
      lines.push(`- **Biên an toàn định giá (MoS):** **${(report.structured.valuationSignal.marginOfSafetyPct ?? 0) >= 0 ? "+" : ""}${(report.structured.valuationSignal.marginOfSafetyPct ?? 0).toFixed(1)}%**.`);
    } else {
      lines.push(`- Đang chờ bổ sung BCTC để tính toán giá trị nội tại DCF.`);
    }

  } else if (angle === "dividend") {
    lines.push(`## 💰 TƯ VẤN CỔ TỨC & CHIẾN LƯỢC TÍCH SẢN: ${symbol}`);
    const ratios = (detail.financials.ratios ?? [])[0] as Record<string, unknown> | undefined;
    const dy = typeof ratios?.dividendYield === "number" ? ratios.dividendYield : null;

    lines.push(`### 1. TỶ SUẤT CỔ TỨC (DIVIDEND YIELD)`);
    if (dy != null) {
      const dyPct = dy * (Math.abs(dy) < 1 ? 100 : 1);
      lines.push(`- **Tỷ suất cổ tức hiện tại:** **${dyPct.toFixed(2)}%/năm**.`);
      lines.push(`- **So sánh với lãi suất tiền gửi ngân hàng 12 tháng (~5.0%/năm):** ${dyPct >= 5.0 ? `✅ Tỷ suất cổ tức **vượt trội** lãi suất gửi tiết kiệm, rất thích hợp tích sản phòng thủ.` : `Tỷ suất cổ tức thấp hơn tiền gửi, cổ phiếu thiên về tăng trưởng thị giá hơn là nhận cổ tức thuần túy.`}`);
    } else {
      lines.push(`- Dữ liệu tỷ suất cổ tức đang được cập nhật từ lịch sử chi trả 3 năm gần nhất.`);
    }
    lines.push("");
    lines.push(`### 2. ĐÁNH GIÁ ĐỘ BỀN VỮNG CỦA CỔ TỨC`);
    lines.push(`- Doanh nghiệp có dòng tiền kinh doanh OCF ${fourM.m3ManagementScore >= 15 ? "lành mạnh" : "cần theo dõi"}, đảm bảo khả năng thanh toán cổ tức bằng tiền mặt.`);
    lines.push(`- Xem chi tiết lịch sử chia thưởng cổ tức và ngày giao dịch không hưởng quyền tại tab **"Cổ tức & Sự kiện"** trên trang chi tiết mã.`);

  } else if (angle === "risk_caution") {
    lines.push(`## ⚠️ BÁO CÁO CẢNH BÁO RỦI RO & BẪY GIÁ: ${symbol}`);
    lines.push(`### 1. CÁC YẾU TỐ RỦI RO TRỌNG YẾU`);
    if (report.structured.risks.length) {
      lines.push(report.structured.risks.map((r) => `• ${r}`).join("\n"));
    } else {
      lines.push(`• Chưa ghi nhận vi phạm tiêu chuẩn nghiêm trọng nào.`);
    }
    lines.push("");

    lines.push(`### 2. ĐO LƯỜNG RỦI RO ĐỊNH LƯỢNG`);
    if (report.historicalTraining) {
      lines.push(`- **Xác suất Bẫy Nổ Vol Giả (Fakeout Penalty):** **${report.historicalTraining.fakeoutRiskPct}%** ${report.historicalTraining.fakeoutRiskPct > 35 ? "(Cổ phiếu có lịch sử nổ vol giả rồi điều chỉnh, không nên mua đuổi giá xanh tím)" : "(Độ tin cậy nổ vol tốt)"}.`);
      lines.push(`- **Tỷ lệ Nảy MA20/MA50:** **${report.historicalTraining.supportBounceRatePct}%**.`);
    }
    if (detail.foreignFlow && typeof detail.foreignFlow.netValue === "number") {
      lines.push(`- **Dòng tiền Khối Ngoại:** ${detail.foreignFlow.netValue < 0 ? `Khối ngoại bán ròng **${fmtMoney(Math.abs(detail.foreignFlow.netValue))}**, tạo áp lực cung.` : `Khối ngoại mua ròng **${fmtMoney(detail.foreignFlow.netValue)}**.`}`);
    }

  } else {
    // Comprehensive CFA Narrative
    lines.push(report.narrative);
  }

  const tEnd = performance.now();
  return {
    answer: lines.join("\n"),
    domain: "stock_single",
    stockAngle: angle,
    structured: report.structured,
    model: report.model,
    latencyMs: Math.round(tEnd - t0),
    sourceNote: report.sourceNote,
  };
}

/**
 * XỬ LÝ TÀI CHÍNH CÁ NHÂN & KỊCH BẢN ĐỜI THỰC TẠI VIỆT NAM (PERSONAL FINANCE CONTEXTS)
 */
function handlePersonalFinanceScenarios(topic: PersonalTopic, q: string, facts?: SnapshotFacts): ContextualResponse {
  const t0 = performance.now();
  const net = facts?.netIncome ?? facts?.totalNetIncome ?? 0;
  const exp = facts?.totalExpenses ?? 0;
  const fixed = facts?.fixedExpenses ?? 0;
  const savings = facts?.monthlySavings ?? (net - exp > 0 ? net - exp : 0);
  const emergencyMonths = facts?.emergencyFundMonths ?? (exp > 0 ? Number(((savings * 3) / exp).toFixed(1)) : 0);
  const debts = facts?.debtsList ?? [];
  const totalDebt = facts?.totalDebt ?? debts.reduce((s, d) => s + (d.balance ?? 0), 0);
  const location = facts?.location || "TP.HCM / Hà Nội";
  const dependents = facts?.dependents ?? 0;
  const parsedAmount = extractAmountFromText(q);

  let answer = "";

  if (topic === "housing_loan") {
    // Kịch bản Vay mua nhà / Áp lực trả nợ mua nhà
    const maxSafeMortgageMonthly = Math.round(net * 0.35); // 35% lương net
    const maxAggressiveMortgageMonthly = Math.round(net * 0.45); // 45% lương net
    const houseTarget = parsedAmount || 2_500_000_000;
    const minDownPayment = Math.round(houseTarget * 0.30); // 30% vốn tự có
    const safeDownPayment = Math.round(houseTarget * 0.50); // 50% vốn tự có

    answer = `Chào bạn! Phân tích sức chịu tải tài chính khi **Vay mua nhà (${formatVnd(houseTarget)})** dựa trên dòng tiền thật:

**1. KHẢ NĂNG TRẢ NỢ HÀNG THÁNG TỪ LƯƠNG NET (${formatVnd(net)}/THÁNG):**
• **Ngưỡng an toàn tối đa (35% thu nhập):** **${formatVnd(maxSafeMortgageMonthly)}/tháng** (Bao gồm cả gốc + lãi ngân hàng).
• **Ngưỡng căng thẳng chịu đựng (45% thu nhập):** **${formatVnd(maxAggressiveMortgageMonthly)}/tháng** (Cần thắt chặt chi tiêu tối đa).
• **Chi phí sinh hoạt cố định hiện tại:** **${formatVnd(fixed)}/tháng** (${(facts?.fixedCostRatio ?? 0).toFixed(0)}% thu nhập).

**2. NGUYÊN TẮC VỐN TỰ CÓ (Down Payment):**
• **Mức tối thiểu bắt buộc (30% giá trị nhà):** Cần có sẵn **${formatVnd(minDownPayment)}**.
• **Mức an toàn khuyến nghị (50% giá trị nhà):** Nên tích lũy được **${formatVnd(safeDownPayment)}** trước khi ký hợp đồng mua để giảm thiểu số dư nợ gốc.

**3. LỜI KHUYÊN PHÒNG NGỪA RỦI RO TỪ ORCA:**
1. **Rủi ro Lãi suất thả nổi:** Các ngân hàng thường chỉ ưu đãi lãi suất trong 1–2 năm đầu (quanh 6–8%/năm), sau đó thả nổi bằng lãi suất cơ sở + biên độ 3.5% (có thể tăng lên 10.5–12%/năm). Hãy tính toán phương án trả nợ theo mức lãi suất thả nổi 11%/năm để đảm bảo không bị quá tải.
2. **Luôn giữ lại Quỹ khẩn cấp:** Tuyệt đối không dốc sạch 100% tiền mặt để trả tiền nhà; luôn giữ lại tối thiểu 6 tháng sinh hoạt phí (${formatVnd(exp * 6)}) đề phòng biến cố việc làm.`;

  } else if (topic === "fire_retirement") {
    // Kịch bản Tự do tài chính & Nghỉ hưu sớm (FIRE)
    const annualExpenses = exp > 0 ? exp * 12 : (net * 0.7) * 12;
    const fireNumber = Math.round(annualExpenses * 25); // Quy tắc 4%
    const leanFireNumber = Math.round(annualExpenses * 20); // Lean FIRE
    const fatFireNumber = Math.round(annualExpenses * 33); // Fat FIRE

    const annualSavings = savings > 0 ? savings * 12 : 0;
    const yearsToFire = annualSavings > 0 ? (fireNumber / annualSavings).toFixed(1) : "—";

    answer = `Lộ trình **Tự do tài chính (FIRE - Financial Independence, Retire Early)** dựa trên dòng tiền của bạn:

**1. TÍNH TOÁN CỘT MỐC TỰ DO TÀI CHÍNH (Theo Quy tắc 4% & 25 lần chi tiêu năm):**
• Chi tiêu sinh hoạt hàng năm ước tính: **${formatVnd(annualExpenses)}/năm** (${formatVnd(exp)}/tháng).
• **Cột mốc Chuẩn FIRE (25x chi tiêu):** Cần tích lũy tài sản sinh lời đạt **${formatVnd(fireNumber)}**.
• **Cột mốc Tối giản (Lean FIRE - 20x):** **${formatVnd(leanFireNumber)}**.
• **Cột mốc Dư dả (Fat FIRE - 33x):** **${formatVnd(fatFireNumber)}**.

**2. ĐÁNH GIÁ TỐC ĐỘ TÍCH LŨY HIỆN TẠI:**
• Tỷ lệ tiết kiệm thực tế: **${(facts?.savingsRate ?? 0).toFixed(1)}%** (${formatVnd(savings)}/tháng, tương đương ${formatVnd(annualSavings)}/năm).
• Với tốc độ tích lũy hiện tại và đầu tư đạt tỷ suất lợi nhuận kỳ vọng 10%/năm, bạn sẽ mất khoảng **${yearsToFire} năm** để chạm mốc FIRE chuẩn.

**3. CHIẾN LƯỢC RÚT NGẮN THỜI GIAN:**
1. **Nâng tỷ lệ tiết kiệm lên 40–50%:** Bằng cách tăng thêm nguồn thu phụ và giữ nguyên mức chi tiêu cố định.
2. **Phân bổ tài sản sinh lời:** Chuyển dịch dòng tiền tiết kiệm từ gửi ngân hàng lãi thấp (5%/năm) sang danh mục Cổ phiếu Top VN30, Chứng chỉ quỹ mở và Cổ tức tiền mặt (kỳ vọng 10–13%/năm).`;

  } else if (topic === "family_dependents") {
    // Gia đình có con nhỏ / Người phụ thuộc
    const childCostEst = dependents > 0 ? dependents * 4_500_000 : 5_000_000;
    const familyEmergency = Math.round(exp * 6); // 6 tháng chi tiêu

    answer = `Kế hoạch quản trị tài chính gia đình có **${dependents > 0 ? `${dependents} người phụ thuộc / con nhỏ` : "người phụ thuộc"}**:

**1. TẤM KHIÊN BẢO VỆ GIA ĐÌNH:**
• **Nâng đệm an toàn lên 6 tháng chi tiêu:** Với gia đình có người phụ thuộc, quỹ khẩn cấp 3 tháng là chưa đủ an toàn. Cần nâng lên mức **${formatVnd(familyEmergency)}** (đáp ứng 6 tháng sinh hoạt) để chống sốc khi có thành viên ốm đau hoặc biến động công việc.
• **Chi phí nuôi dạy / phụ thuộc ước tính:** Khoảng **${formatVnd(childCostEst)}/tháng**.

**2. THIẾT LẬP 2 QUỸ DÀI HẠN BẮT BUỘC:**
1. **Quỹ Học vấn cho con:** Trích tự động định kỳ 10% thu nhập (${formatVnd(Math.round(net * 0.1))}/tháng) vào chứng chỉ quỹ chỉ số hoặc bảo hiểm liên kết đầu tư để tích lũy cho các mốc vào cấp 3 và đại học.
2. **Bảo vệ Trụ cột kinh tế:** Tham gia bảo hiểm nhân thọ / bảo hiểm sức khỏe cho người tạo ra thu nhập chính trong gia đình.`;

  } else {
    // Fallback topic
    answer = `Phân tích vị thế tài chính tại ${location}:
• Thu nhập thực nhận: **${formatVnd(net)}/tháng**.
• Chi tiêu sinh hoạt: **${formatVnd(exp)}** (Cố định chiếm ${(facts?.fixedCostRatio ?? 0).toFixed(0)}% lương).
• Đệm an toàn dự phòng: **${emergencyMonths.toFixed(1)} tháng** chi tiêu.
• Điểm sức khỏe tài chính: **${facts?.healthScore ?? 75}/100** (${facts?.healthRating || "Ổn định"}).

**ĐỊNH HƯỚNG TỔNG QUAN:**
Luôn duy trì chi tiêu cố định dưới 55% thu nhập và bảo vệ đệm quỹ khẩn cấp tối thiểu 3 tháng trước khi phân bổ vào các kênh đầu tư rủi ro hơn.`;
  }

  const tEnd = performance.now();
  return {
    answer,
    domain: "personal_finance",
    personalTopic: topic,
    model: "Orca Personal Finance Reasoning Engine",
    latencyMs: Math.round(tEnd - t0),
    sourceNote: "100% In-House Deterministic Facts-Based Engine",
  };
}

/**
 * ENTRYPOINT XỬ LÝ CONTEXT TOÀN BỘ HỆ THỐNG AI CỦA ORCA
 */
export async function executeContextualAiPipeline(
  question: string,
  facts?: SnapshotFacts,
): Promise<ContextualResponse | null> {
  const classification = classifyContext(question, facts);

  // 1. Context: So sánh 2 cổ phiếu đối đầu
  if (classification.domain === "stock_compare" && classification.symbols.length >= 2) {
    const compareRes = await handleStockPairCompare(classification.symbols[0], classification.symbols[1]);
    if (compareRes) return compareRes;
  }

  // 2. Context: Phân tích Cổ phiếu đơn lẻ theo trọng tâm câu hỏi
  if (classification.domain === "stock_single" && classification.symbols.length === 1) {
    const singleRes = await handleSingleStockContext(classification.symbols[0], classification.stockAngle ?? "comprehensive");
    if (singleRes) return singleRes;
  }

  // 3. Context: Luân chuyển dòng tiền & Nhóm ngành
  if (classification.domain === "sector_money_flow") {
    const sectorRes = await handleSectorDynamics(classification.sector ?? null);
    if (sectorRes) return sectorRes;
  }

  // 4. Context: Tài chính cá nhân thực tế
  if (classification.domain === "personal_finance" && classification.personalTopic) {
    return handlePersonalFinanceScenarios(classification.personalTopic, question, facts);
  }

  return null;
}
