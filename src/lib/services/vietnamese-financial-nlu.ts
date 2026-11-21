/**
 * Vietnamese Financial NLU & Topic Clustering.
 * 1. Jaccard similarity topic clustering with VN financial stopwords to deduplicate news feeds.
 * 2. Ticker extraction with Vietnamese stopword protection.
 * 3. Financial intent classification for query routing.
 * Ported from lotusmarket (Go/Python nlu & sentiment).
 */

const VI_STOPWORDS = new Set([
  "đang",
  "được",
  "này",
  "đó",
  "các",
  "những",
  "một",
  "hai",
  "khi",
  "nếu",
  "nhưng",
  "hơn",
  "như",
  "cùng",
  "vẫn",
  "sau",
  "trước",
  "trong",
  "ngoài",
  "trên",
  "dưới",
  "giữa",
  "bởi",
  "đến",
  "theo",
  "với",
  "không",
  "chưa",
  "đã",
  "sẽ",
  "có",
  "phải",
  "nên",
  "cần",
  "đây",
  "tại",
  "lại",
  "lên",
  "xuống",
  "ra",
  "vào",
  "thêm",
  "bớt",
  "hôm",
  "nay",
  "mai",
  "qua",
  "năm",
  "tháng",
  "tuần",
]);

// False-positive 3-letter words in Vietnamese that resemble stock tickers
const VI_TICKER_EXCLUSIONS = new Set([
  "CAC",
  "CON",
  "CUA",
  "CHO",
  "DAU",
  "DAN",
  "GIA",
  "HAI",
  "HOA",
  "HOI",
  "LAM",
  "MOI",
  "NAM",
  "NEN",
  "SAU",
  "TAI",
  "THE",
  "TIN",
  "VAN",
  "VOI",
  "MUA",
  "BAN",
  "SAN",
  "DAY",
  "DOT",
  "PHI",
  "QUA",
  "QUY",
  "ROI",
  "TAP",
  "TOP",
  "VON",
  "VND",
  "USD",
  "EUR",
]);

export function tokenizeViTitle(title: string): Set<string> {
  if (!title) return new Set();
  // Strip HTML script/style tags and contents for clean clustering and injection defense
  const noHtml = title
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const lower = noHtml.toLowerCase().trim();
  const cleaned = lower.replace(/[^a-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s]/gi, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 2 && !VI_STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const aSize = a.size;
  const bSize = b.size;
  if (!aSize || !bSize) return 0.0;

  // shortcut: early bound check — if max possible overlap < 0.2, skip looping
  const maxPossible = aSize < bSize ? aSize / bSize : bSize / aSize;
  if (maxPossible < 0.2) return 0.0;

  // Always iterate through the smaller set
  const [smaller, larger] = aSize <= bSize ? [a, b] : [b, a];
  let inter = 0;
  for (const item of smaller) {
    if (larger.has(item)) inter++;
  }
  const union = aSize + bSize - inter;
  return union > 0 ? inter / union : 0.0;
}

/**
 * Gom cụm tiêu đề tin tức tài chính trùng lặp (Deduplication / Clustering).
 * Trả về danh sách các nhóm chỉ mục: e.g. [[0, 1], [2], [3, 4]]
 */
export function clusterNewsTitles(titles: string[], threshold = 0.3): number[][] {
  if (!titles || titles.length === 0) return [];

  const tokenSets = titles.map((t) => tokenizeViTitle(t));
  const clusterOf = new Int32Array(titles.length).fill(-1);
  const clusters: number[][] = [];

  for (let i = 0; i < titles.length; i++) {
    if (clusterOf[i] !== -1) continue;
    const cIdx = clusters.length;
    clusterOf[i] = cIdx;
    clusters.push([i]);

    const setI = tokenSets[i]!;
    for (let j = i + 1; j < titles.length; j++) {
      if (clusterOf[j] !== -1) continue;
      if (jaccardSimilarity(setI, tokenSets[j]!) >= threshold) {
        clusterOf[j] = cIdx;
        clusters[cIdx]!.push(j);
      }
    }
  }

  return clusters;
}

export interface ExtractedQueryIntent {
  intent: "GET_STOCK_INFO" | "ANALYZE_TREND" | "ASK_ADVICE" | "GENERAL_SEARCH";
  confidence: number;
  tickers: string[];
  cleanQuery: string;
}

export function extractFinancialIntent(query: string): ExtractedQueryIntent {
  const upper = query.toUpperCase();
  const rawMatches = upper.match(/\b([A-Z]{3})\b/g) || [];

  const tickers = Array.from(
    new Set(rawMatches.filter((t) => !VI_TICKER_EXCLUSIONS.has(t)))
  );

  const lower = query.toLowerCase();

  let intent: ExtractedQueryIntent["intent"] = "GENERAL_SEARCH";
  let confidence = 0.5;

  if (
    lower.includes("có nên mua") ||
    lower.includes("nên bán") ||
    lower.includes("mua được không") ||
    lower.includes("giữ hay bán") ||
    lower.includes("khuyến nghị")
  ) {
    intent = "ASK_ADVICE";
    confidence = 0.9;
  } else if (
    lower.includes("xu hướng") ||
    lower.includes("chart") ||
    lower.includes("biểu đồ") ||
    lower.includes("phân tích kỹ thuật") ||
    lower.includes("kháng cự") ||
    lower.includes("hỗ trợ")
  ) {
    intent = "ANALYZE_TREND";
    confidence = 0.85;
  } else if (
    lower.includes("giá") ||
    lower.includes("thông tin") ||
    lower.includes("kết quả kinh doanh") ||
    lower.includes("báo cáo tài chính") ||
    lower.includes("p/e") ||
    tickers.length > 0
  ) {
    intent = "GET_STOCK_INFO";
    confidence = 0.8;
  }

  return {
    intent,
    confidence,
    tickers,
    cleanQuery: query.trim(),
  };
}

export type VnFinancialEventCategory =
  | "EARNINGS_SURPRISE_POSITIVE"
  | "EARNINGS_MISS_NEGATIVE"
  | "DILUTION_RIGHTS_ISSUE"
  | "INSIDER_ACCUMULATION"
  | "INSIDER_SELLING"
  | "DIVIDEND_CASH_CATALYST"
  | "BOND_LEGAL_CONTAGION_SHOCK"
  | "NEUTRAL_DISCLOSURE";

export interface DetectedVnEventSignal {
  category: VnFinancialEventCategory;
  title: string;
  ageDays: number;
  decayWeight: number;
  rawImpactScore: number;
  decayedImpactScore: number;
}

export interface VietnameseEventAlphaResult {
  sueScore: number | null; // Standardized Unexpected Earnings Z-score
  peadAlphaScore: number; // Post-Earnings Announcement Drift score [-40, +40]
  dilutionPenaltyScore: number; // Negative penalty [-35, 0] for rights issues / ESOP dilution
  insiderFlowScore: number; // [-25, +25]
  bondLegalShockScore: number; // [-60, 0]
  eventAlphaScore: number; // Combined net event-driven alpha in [-100, +100]
  dominantCategory: VnFinancialEventCategory;
  events: DetectedVnEventSignal[];
  summaryVi: string;
}

/**
 * Extracts structured Event-Driven Vietnamese Financial NLP Alpha:
 * - Standardized Unexpected Earnings (SUE) & Post-Earnings Announcement Drift (PEAD) with 20-day exponential decay
 * - Share Dilution / Rights Issue / ESOP penalty
 * - Insider & Major Shareholder registration flow
 * - Bond default / Inspection / Margin-cut shock guard
 */
export function extractVietnameseEventAlpha(params: {
  headlines: { title: string; publishedAtMs?: number | null }[];
  nowMs?: number;
  reportedNetIncomeGrowthPct?: number | null;
  expectedNetIncomeGrowthPct?: number | null;
  earningsStdPct?: number | null;
}): VietnameseEventAlphaResult {
  const {
    headlines,
    nowMs = Date.now(),
    reportedNetIncomeGrowthPct,
    expectedNetIncomeGrowthPct = 12.0,
    earningsStdPct = 15.0,
  } = params;

  // 1. Standardized Unexpected Earnings (SUE)
  let sueScore: number | null = null;
  let peadAlphaScore = 0;
  if (reportedNetIncomeGrowthPct != null && Number.isFinite(reportedNetIncomeGrowthPct)) {
    const std = Math.max(4.0, earningsStdPct ?? 15.0);
    sueScore = Number(
      Math.max(-4.0, Math.min(4.0, (reportedNetIncomeGrowthPct - (expectedNetIncomeGrowthPct ?? 12.0)) / std)).toFixed(2),
    );
    peadAlphaScore = Number((sueScore * 8.5).toFixed(2));
  }

  let dilutionPenaltyScore = 0;
  let insiderFlowScore = 0;
  let bondLegalShockScore = 0;
  const events: DetectedVnEventSignal[] = [];

  for (const item of headlines) {
    if (!item.title) continue;
    const clean = item.title
      .replace(/<[^>]*>/g, " ")
      .toLowerCase()
      .trim();
    const ageMs =
      item.publishedAtMs != null && Number.isFinite(item.publishedAtMs) && item.publishedAtMs > 0
        ? Math.max(0, nowMs - item.publishedAtMs)
        : 0;
    const ageDays = Number((ageMs / (1000 * 60 * 60 * 24)).toFixed(1));
    // PEAD 20-day half-life exponential decay: exp(-ageDays / 20)
    const decayWeight = Number(Math.exp(-ageDays / 20).toFixed(3));

    let category: VnFinancialEventCategory = "NEUTRAL_DISCLOSURE";
    let rawImpact = 0;

    if (
      /chậm trả lãi|chậm trả gốc|vỡ nợ trái phiếu|khởi tố|bắt tạm giam|cắt margin|đình chỉ giao dịch|kiểm toán từ chối/i.test(
        clean,
      )
    ) {
      category = "BOND_LEGAL_CONTAGION_SHOCK";
      rawImpact += -45;
      bondLegalShockScore = Math.max(-60, bondLegalShockScore - 45 * decayWeight);
    }
    if (
      /phát hành thêm|chào bán cho cổ đông hiện hữu|phát hành riêng lẻ|phát hành esop|pha loãng/i.test(clean)
    ) {
      if (category === "NEUTRAL_DISCLOSURE") category = "DILUTION_RIGHTS_ISSUE";
      rawImpact += -18;
      dilutionPenaltyScore = Math.max(-35, dilutionPenaltyScore - 18 * decayWeight);
    }
    if (
      /lãi kỷ lục|lợi nhuận tăng bằng lần|vượt kế hoạch năm|lãi đột biến|lợi nhuận sau thuế tăng mạnh/i.test(clean)
    ) {
      if (category === "NEUTRAL_DISCLOSURE") category = "EARNINGS_SURPRISE_POSITIVE";
      rawImpact += 22;
      peadAlphaScore = Math.min(40, peadAlphaScore + 22 * decayWeight);
    } else if (/báo lỗ|lợi nhuận lao dốc|lợi nhuận giảm mạnh|lỗ ròng|không hoàn thành kế hoạch/i.test(clean)) {
      if (category === "NEUTRAL_DISCLOSURE") category = "EARNINGS_MISS_NEGATIVE";
      rawImpact += -22;
      peadAlphaScore = Math.max(-40, peadAlphaScore - 22 * decayWeight);
    }
    if (/đăng ký mua|mua vào|nâng sở hữu|gom thêm/i.test(clean) && /cổ đông lớn|chủ tịch|tổng giám đốc|hđqt|nội bộ/i.test(clean)) {
      if (category === "NEUTRAL_DISCLOSURE") category = "INSIDER_ACCUMULATION";
      rawImpact += 15;
      insiderFlowScore = Math.min(25, insiderFlowScore + 15 * decayWeight);
    } else if (/đăng ký bán|thoái vốn|bán ra|giảm sở hữu/i.test(clean) && /cổ đông lớn|chủ tịch|tổng giám đốc|hđqt|nội bộ/i.test(clean)) {
      if (category === "NEUTRAL_DISCLOSURE") category = "INSIDER_SELLING";
      rawImpact += -15;
      insiderFlowScore = Math.max(-25, insiderFlowScore - 15 * decayWeight);
    }
    if (/cổ tức tiền mặt|tạm ứng cổ tức|chốt quyền nhận cổ tức/i.test(clean)) {
      if (category === "NEUTRAL_DISCLOSURE") category = "DIVIDEND_CASH_CATALYST";
      rawImpact += 10;
      peadAlphaScore = Math.min(40, peadAlphaScore + 10 * decayWeight);
    }

    const decayedImpactScore = Number((rawImpact * decayWeight).toFixed(2));
    events.push({
      category,
      title: item.title,
      ageDays,
      decayWeight,
      rawImpactScore: rawImpact,
      decayedImpactScore,
    });
  }

  peadAlphaScore = Number(Math.max(-40, Math.min(40, peadAlphaScore)).toFixed(2));
  dilutionPenaltyScore = Number(Math.max(-35, Math.min(0, dilutionPenaltyScore)).toFixed(2));
  insiderFlowScore = Number(Math.max(-25, Math.min(25, insiderFlowScore)).toFixed(2));
  bondLegalShockScore = Number(Math.max(-60, Math.min(0, bondLegalShockScore)).toFixed(2));

  const eventAlphaScore = Number(
    Math.max(-100, Math.min(100, peadAlphaScore + dilutionPenaltyScore + insiderFlowScore + bondLegalShockScore)).toFixed(2),
  );

  let dominantCategory: VnFinancialEventCategory = "NEUTRAL_DISCLOSURE";
  let maxAbs = 0;
  for (const ev of events) {
    if (Math.abs(ev.decayedImpactScore) > maxAbs) {
      maxAbs = Math.abs(ev.decayedImpactScore);
      dominantCategory = ev.category;
    }
  }
  if (dominantCategory === "NEUTRAL_DISCLOSURE" && sueScore != null && Math.abs(sueScore) >= 1.0) {
    dominantCategory = sueScore > 0 ? "EARNINGS_SURPRISE_POSITIVE" : "EARNINGS_MISS_NEGATIVE";
  }

  const summaryVi =
    `NLP Event Alpha: ${eventAlphaScore >= 0 ? "+" : ""}${eventAlphaScore}đ ` +
    `(PEAD: ${peadAlphaScore >= 0 ? "+" : ""}${peadAlphaScore}, Pha loãng: ${dilutionPenaltyScore}, Nội bộ: ${insiderFlowScore}, Rủi ro pháp lý/trái phiếu: ${bondLegalShockScore}).`;

  return {
    sueScore,
    peadAlphaScore,
    dilutionPenaltyScore,
    insiderFlowScore,
    bondLegalShockScore,
    eventAlphaScore,
    dominantCategory,
    events,
    summaryVi,
  };
}
