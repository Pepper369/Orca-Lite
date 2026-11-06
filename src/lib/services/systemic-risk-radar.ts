/**
 * ============================================================================
 * TRỤ CỘT 3: RADAR CẢNH BÁO RỦI RO PHÁP LÝ & LAN TỎA HỆ THỐNG
 * ============================================================================
 * Hệ thống cảnh báo sớm rủi ro pháp lý, thanh tra và bóc tách mức độ ảnh hưởng
 * dây chuyền giữa Ngân hàng tài trợ và các Tập đoàn Bất động sản/Trái phiếu tại VN.
 */

export interface SystemicExposureLink {
  sourceTicker: string; // Doanh nghiệp tâm điểm (e.g. NVL, VIC, DIG)
  targetTicker: string; // Đơn vị chịu rủi ro lan tỏa (e.g. VPB, MBB, TCB)
  relationshipType: "credit_lender" | "bond_underwriter" | "cross_ownership" | "collateral_holding";
  relationshipVi: string;
  contagionLevel: "HIGH" | "MEDIUM" | "LOW";
  estimatedExposureVndBillions?: number;
  note: string;
}

export interface LegalRiskSignal {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "INSPECTION" | "LEGAL_ARREST" | "BOND_DEFAULT" | "AUDIT_QUALIFIED" | "TRADING_RESTRICTION";
  categoryVi: string;
  primaryTicker: string;
  affectedTickers: string[];
  systemicContagionRisk: "SEVERE" | "ELEVATED" | "LOCALIZED";
  exposureSummaryVi: string;
  aiActionPlanVi: string;
}

/** Bản đồ liên kết tín dụng & bảo lãnh trái phiếu chéo trọng điểm tại TTCK VN */
export const VN_SYSTEMIC_EXPOSURE_MAP: SystemicExposureLink[] = [
  // Nhóm Novaland (NVL)
  {
    sourceTicker: "NVL",
    targetTicker: "VPB",
    relationshipType: "credit_lender",
    relationshipVi: "Ngân hàng tài trợ tín dụng & bảo lãnh dự án lớn",
    contagionLevel: "HIGH",
    note: "Dư nợ tín dụng và trái phiếu dự án Aqua City, NovaWorld",
  },
  {
    sourceTicker: "NVL",
    targetTicker: "MBB",
    relationshipType: "credit_lender",
    relationshipVi: "Chủ nợ tín dụng và quản lý tài khoản dự án",
    contagionLevel: "HIGH",
    note: "Tài trợ các gói thầu hạ tầng và dự án trọng điểm phía Nam",
  },
  {
    sourceTicker: "NVL",
    targetTicker: "TPB",
    relationshipType: "bond_underwriter",
    relationshipVi: "Đại lý lưu ký và bảo lãnh phát hành trái phiếu",
    contagionLevel: "MEDIUM",
    note: "Rủi ro trích lập dự phòng trái phiếu doanh nghiệp chậm trả",
  },

  // Nhóm Vingroup / Vinhomes (VIC / VHM)
  {
    sourceTicker: "VIC",
    targetTicker: "TCB",
    relationshipType: "credit_lender",
    relationshipVi: "Ngân hàng đối tác chiến lược hệ sinh thái",
    contagionLevel: "HIGH",
    note: "Tài trợ chuỗi cung ứng, cho vay mua nhà Vinhomes và bảo lãnh trái phiếu",
  },
  {
    sourceTicker: "VHM",
    targetTicker: "TCB",
    relationshipType: "credit_lender",
    relationshipVi: "Tài trợ tín dụng người mua nhà và dự án đại đô thị",
    contagionLevel: "HIGH",
    note: "Tỷ trọng dư nợ cho vay BĐS và bảo lãnh dự án Ocean Park, Smart City",
  },
  {
    sourceTicker: "VIC",
    targetTicker: "VPB",
    relationshipType: "bond_underwriter",
    relationshipVi: "Đối tác tài trợ vốn lưu động và trái phiếu",
    contagionLevel: "MEDIUM",
    note: "Các khoản cấp hạn mức tín dụng dự án xe điện và bán lẻ",
  },

  // Nhóm Gelex / DIG / PDR
  {
    sourceTicker: "DIG",
    targetTicker: "BID",
    relationshipType: "credit_lender",
    relationshipVi: "Ngân hàng cấp hạn mức dự án khu đô thị Long Tân",
    contagionLevel: "MEDIUM",
    note: "Bảo lãnh thực hiện hợp đồng và vay trung dài hạn",
  },
  {
    sourceTicker: "PDR",
    targetTicker: "MBB",
    relationshipType: "credit_lender",
    relationshipVi: "Cấp tín dụng dự án Nhơn Hội và dự án cao tầng Bình Dương",
    contagionLevel: "MEDIUM",
    note: "PDR đã chủ động mua lại trước hạn phần lớn trái phiếu",
  },
  {
    sourceTicker: "BCG",
    targetTicker: "TPB",
    relationshipType: "credit_lender",
    relationshipVi: "Tài trợ các dự án năng lượng tái tạo (Điện mặt trời, Điện gió)",
    contagionLevel: "HIGH",
    note: "Các gói trái phiếu năng lượng đang trong diện cơ cấu lại dòng tiền FIT",
  },
];

/** Từ điển trọng số nhận diện rủi ro pháp lý & biến cố hệ thống */
const LEGAL_RISK_KEYWORDS: Array<{
  keyword: RegExp;
  category: LegalRiskSignal["category"];
  categoryVi: string;
  severity: LegalRiskSignal["severity"];
}> = [
  {
    keyword: /(?:khởi\s+tố|bắt\s+tạm\s+giam|bị\s+bắt|bắt\s+giữ|khám\s+xét)/i,
    category: "LEGAL_ARREST",
    categoryVi: "Khởi tố & Bắt tạm giam lãnh đạo",
    severity: "CRITICAL",
  },
  {
    keyword: /(?:thanh\s+tra\s+chính\s+phủ|kết\s+luận\s+thanh\s+tra|sai\s+phạm\s+nghiêm\s+trọng|chuyển\s+cơ\s+quan\s+điều\s+tra)/i,
    category: "INSPECTION",
    categoryVi: "Kết luận Thanh tra & Sai phạm",
    severity: "HIGH",
  },
  {
    keyword: /(?:chậm\s+trả\s+(?:gốc|lãi)|vỡ\s+nợ\s+trái\s+phiếu|khất\s+nợ|chậm\s+thanh\s+toán\s+trái\s+phiếu)/i,
    category: "BOND_DEFAULT",
    categoryVi: "Rủi ro Vỡ nợ / Chậm trả Trái phiếu",
    severity: "HIGH",
  },
  {
    keyword: /(?:ý\s+kiến\s+kiểm\s+toán\s+ngoại\s+trừ|từ\s+chối\s+đưa\s+ra\s+ý\s+kiến|nghi\s+ngờ\s+hoạt\s+động\s+liên\s+tục)/i,
    category: "AUDIT_QUALIFIED",
    categoryVi: "Ý kiến Kiểm toán Ngoại trừ / Nghi ngờ",
    severity: "HIGH",
  },
  {
    keyword: /(?:đình\s+chỉ\s+giao\s+dịch|hạn\s+chế\s+giao\s+dịch|cảnh\s+báo\s+ubck|kiểm\s+soát\s+đặc\s+biệt)/i,
    category: "TRADING_RESTRICTION",
    categoryVi: "Đình chỉ / Kiểm soát Đặc biệt từ UBCK",
    severity: "MEDIUM",
  },
];

/**
 * Quét tiêu đề và nội dung tin tức để phát hiện tín hiệu rủi ro pháp lý
 * và tự động bóc tách chuỗi lan tỏa sang các ngân hàng/đối tác liên đới.
 */
export function evaluateSystemicLegalRisk(
  title: string,
  content: string = "",
  targetTicker?: string,
): LegalRiskSignal | null {
  const fullText = `${title} ${content}`;

  let matchedRisk: (typeof LEGAL_RISK_KEYWORDS)[0] | null = null;
  for (const item of LEGAL_RISK_KEYWORDS) {
    if (item.keyword.test(fullText)) {
      matchedRisk = item;
      break;
    }
  }

  if (!matchedRisk) return null;

  // Xác định mã cổ phiếu tâm điểm
  let primaryTicker = targetTicker?.toUpperCase().trim() || "";
  if (!primaryTicker) {
    // Trích xuất từ tiêu đề
    const tickerMatch = title.match(/\b([A-Z]{3})\b/);
    if (tickerMatch) {
      primaryTicker = tickerMatch[1]!;
    }
  }

  // Tìm các ngân hàng / đối tác bị lây lan rủi ro qua O(1) index
  const affectedLinks = CONTAGION_BY_SOURCE.get(primaryTicker) || [];
  const affectedTickers = affectedLinks.map((l) => l.targetTicker);

  let systemicContagionRisk: LegalRiskSignal["systemicContagionRisk"] = "LOCALIZED";
  if (affectedLinks.some((l) => l.contagionLevel === "HIGH") || matchedRisk.severity === "CRITICAL") {
    systemicContagionRisk = "SEVERE";
  } else if (affectedLinks.length > 0) {
    systemicContagionRisk = "ELEVATED";
  }

  let exposureSummaryVi = "";
  if (affectedLinks.length > 0) {
    const listNames = affectedLinks
      .map((l) => `${l.targetTicker} (${l.relationshipVi})`)
      .join(", ");
    exposureSummaryVi = `Biến cố tại ${primaryTicker} có nguy cơ lan tỏa sang các ngân hàng tài trợ lớn: ${listNames}.`;
  } else {
    exposureSummaryVi = `Biến cố cục bộ tại ${primaryTicker}, rủi ro lan tỏa toàn hệ sinh thái ở mức giới hạn.`;
  }

  let aiActionPlanVi = "";
  if (matchedRisk.severity === "CRITICAL" || systemicContagionRisk === "SEVERE") {
    aiActionPlanVi = `Cảnh báo rủi ro thiên nga đen: Tuyệt đối tránh bắt đáy ${primaryTicker}. Thận trọng kiểm tra tỷ trọng nợ xấu/trái phiếu của ${affectedTickers.join(", ")} trước khi mở vị thế nhóm Ngân hàng liên quan.`;
  } else {
    aiActionPlanVi = `Theo dõi sát diễn biến giải trình từ doanh nghiệp và các ngân hàng liên đới.`;
  }

  return {
    id: `risk-${Date.now()}-${primaryTicker || "SYS"}`,
    title,
    source: "Orca Legal & Systemic Risk Radar",
    publishedAt: new Date().toISOString(),
    severity: matchedRisk.severity,
    category: matchedRisk.category,
    categoryVi: matchedRisk.categoryVi,
    primaryTicker: primaryTicker || "THỊ TRƯỜNG CHUNG",
    affectedTickers,
    systemicContagionRisk,
    exposureSummaryVi,
    aiActionPlanVi,
  };
}

// Pre-indexed lookup maps for O(1) systemic contagion checks
const CONTAGION_BY_SOURCE = new Map<string, SystemicExposureLink[]>();
const CONTAGION_BY_PARTICIPANT = new Map<string, SystemicExposureLink[]>();

for (const link of VN_SYSTEMIC_EXPOSURE_MAP) {
  let sArr = CONTAGION_BY_SOURCE.get(link.sourceTicker);
  if (!sArr) {
    sArr = [];
    CONTAGION_BY_SOURCE.set(link.sourceTicker, sArr);
  }
  sArr.push(link);

  for (const sym of [link.sourceTicker, link.targetTicker]) {
    let pArr = CONTAGION_BY_PARTICIPANT.get(sym);
    if (!pArr) {
      pArr = [];
      CONTAGION_BY_PARTICIPANT.set(sym, pArr);
    }
    pArr.push(link);
  }
}

/** Lấy danh sách các ngân hàng và tổ chức chịu rủi ro lan tỏa từ một mã cụ thể (O(1) lookup) */
export function getContagionExposureForTicker(ticker: string): SystemicExposureLink[] {
  const sym = ticker.toUpperCase().trim();
  return CONTAGION_BY_PARTICIPANT.get(sym) || [];
}
