/**
 * Market Regime Classification & Crisis Sub-type Detection.
 * Categorizes market conditions into:
 *   - STABLE: Thị trường ổn định, biến động bình thường
 *   - VOLATILE: Biến động cao, cần thận trọng
 *   - EUPHORIA: Hưng phấn cực độ (FOMA đỉnh)
 *   - CRISIS: Khủng hoảng (CRISIS_PANIC vs CRISIS_FUNDAMENTAL)
 * Ported from lotusmarket (Go/Python deterministic market engine).
 */

export type MarketRegimeType = "STABLE" | "VOLATILE" | "CRISIS" | "EUPHORIA";
export type CrisisSubType = "CRISIS_PANIC" | "CRISIS_FUNDAMENTAL" | "";

export interface RegimeSignals {
  vix: number;
  vixScore: number;
  vnindexChange: number;
  vnindexScore: number;
  foreignFlowBillions: number;
  flowScore: number;
  newsTier: number; // 1 = arrest/circuit breaker, 2 = Fed/tariffs, 3+ = minor, 0 = none
  newsScore: number;
  newsDetail: string;
  globalMaxDropPct: number;
  globalScore: number;
  compositeScore: number;
  direction: "up" | "down" | "mixed";
}

export interface MarketRegimeResult {
  regime: MarketRegimeType;
  subType: CrisisSubType;
  labelVi: string;
  subTypeVi: string;
  descriptionVi: string;
  triggerSource: string;
  triggerDetail: string;
  signals: RegimeSignals;
}

const FUNDAMENTAL_CRISIS_KEYWORDS = [
  "bắt giữ",
  "khởi tố",
  "truy tố",
  "lừa đảo",
  "rút ruột",
  "bank run",
  "vỡ nợ",
  "phá sản",
  "hủy niêm yết",
  "kiểm soát đặc biệt",
  "đình chỉ giao dịch",
  "thanh tra đột xuất",
  "sai phạm nghiêm trọng",
];

export function computeRegimeSignals(params: {
  vix?: number;
  vnindexChange?: number;
  foreignFlowBillions?: number;
  newsTier?: number;
  newsDetail?: string;
  globalMaxDropPct?: number;
}): RegimeSignals {
  const vix = params.vix ?? 16;
  const vnindexChange = params.vnindexChange ?? 0;
  const foreignFlowBillions = params.foreignFlowBillions ?? 0;
  const newsTier = params.newsTier ?? 0;
  const newsDetail = params.newsDetail ?? "";
  const globalMaxDropPct = params.globalMaxDropPct ?? 0;

  // 1. VIX score
  let vixScore = 0;
  if (vix >= 30) vixScore = 80;
  else if (vix >= 25) vixScore = 50;
  else if (vix >= 20) vixScore = 25;

  // 2. VN-Index score
  const absChange = Math.abs(vnindexChange);
  let vnindexScore = 0;
  if (absChange >= 3.0) vnindexScore = 80;
  else if (absChange >= 2.0) vnindexScore = 50;
  else if (absChange >= 1.0) vnindexScore = 25;

  let direction: "up" | "down" | "mixed" = "mixed";
  if (vnindexChange < -1.0) direction = "down";
  else if (vnindexChange > 1.0) direction = "up";

  // 3. Foreign flow score
  let flowScore = 0;
  if (foreignFlowBillions < -2000) flowScore = 80;
  else if (foreignFlowBillions < -1000) flowScore = 50;
  else if (foreignFlowBillions < -500) flowScore = 25;

  // 4. News score
  let newsScore = 0;
  if (newsTier === 1) newsScore = 100;
  else if (newsTier === 2) newsScore = 50;

  // 5. Global contagion score
  let globalScore = 0;
  if (globalMaxDropPct <= -5.0) globalScore = 80;
  else if (globalMaxDropPct <= -3.0) globalScore = 50;

  const compositeScore = Math.max(
    vixScore,
    vnindexScore,
    flowScore,
    newsScore,
    globalScore
  );

  return {
    vix,
    vixScore,
    vnindexChange,
    vnindexScore,
    foreignFlowBillions,
    flowScore,
    newsTier,
    newsScore,
    newsDetail,
    globalMaxDropPct,
    globalScore,
    compositeScore,
    direction,
  };
}

export function classifyMarketRegime(params: {
  vix?: number;
  vnindexChange?: number;
  foreignFlowBillions?: number;
  newsTier?: number;
  newsDetail?: string;
  globalMaxDropPct?: number;
}): MarketRegimeResult {
  const s = computeRegimeSignals(params);

  let regime: MarketRegimeType = "STABLE";
  let subType: CrisisSubType = "";

  if (s.compositeScore >= 80) {
    if (s.direction === "up") {
      regime = "EUPHORIA";
    } else {
      regime = "CRISIS";
      // Sub-type detection
      const newsLower = s.newsDetail.toLowerCase();
      const isFundamental = FUNDAMENTAL_CRISIS_KEYWORDS.some((kw) =>
        newsLower.includes(kw)
      );

      subType = isFundamental ? "CRISIS_FUNDAMENTAL" : "CRISIS_PANIC";
    }
  } else if (s.compositeScore >= 50) {
    regime = "VOLATILE";
  } else {
    regime = "STABLE";
  }

  // Identify trigger
  let triggerSource = "composite";
  let triggerDetail = "Diễn biến cân bằng liên thị trường";

  if (s.newsScore >= s.compositeScore && s.newsScore > 0) {
    triggerSource = "news_tier1";
    triggerDetail = s.newsDetail || "Sự kiện tin tức cấp 1";
  } else if (s.vnindexScore >= s.compositeScore && s.vnindexScore > 0) {
    triggerSource = "vnindex_change";
    triggerDetail = `VN-Index biến động mạnh ${s.vnindexChange > 0 ? "+" : ""}${s.vnindexChange.toFixed(1)}%`;
  } else if (s.globalScore >= s.compositeScore && s.globalScore > 0) {
    triggerSource = "global_contagion";
    triggerDetail = `Chỉ số tài chính toàn cầu sụt giảm ${s.globalMaxDropPct.toFixed(1)}%`;
  } else if (s.vixScore >= s.compositeScore && s.vixScore > 0) {
    triggerSource = "vix";
    triggerDetail = `Chỉ số sợ hãi VIX tăng vọt lên mức ${s.vix.toFixed(1)}`;
  } else if (s.flowScore >= s.compositeScore && s.flowScore > 0) {
    triggerSource = "foreign_flow";
    triggerDetail = `Khối ngoại bán ròng đột biến ${s.foreignFlowBillions.toFixed(0)} tỷ VND`;
  }

  const REGIME_META: Record<
    MarketRegimeType,
    { labelVi: string; descVi: string }
  > = {
    STABLE: {
      labelVi: "Ổn định (STABLE)",
      descVi: "Thị trường vận động bình thường, thanh khoản và tâm lý ở mức cân bằng.",
    },
    VOLATILE: {
      labelVi: "Biến động mạnh (VOLATILE)",
      descVi: "Biên độ dao động mở rộng, dòng tiền phân hóa mạnh giữa các nhóm ngành.",
    },
    EUPHORIA: {
      labelVi: "Hưng phấn tột độ (EUPHORIA)",
      descVi: "Tâm lý FOMO diện rộng, thị trường tăng nóng có nguy cơ quá mua ngắn hạn.",
    },
    CRISIS: {
      labelVi: "Khủng hoảng (CRISIS)",
      descVi: "Áp lực bán tháo lan tỏa toàn thị trường, cần ưu tiên quản trị tiền mặt.",
    },
  };

  const subTypeVi =
    subType === "CRISIS_FUNDAMENTAL"
      ? "Rủi ro Pháp lý / Cốt lõi hệ thống"
      : subType === "CRISIS_PANIC"
      ? "Hoảng loạn ngắn hạn tâm lý"
      : "";

  return {
    regime,
    subType,
    labelVi: REGIME_META[regime].labelVi,
    subTypeVi,
    descriptionVi: REGIME_META[regime].descVi,
    triggerSource,
    triggerDetail,
    signals: s,
  };
}
