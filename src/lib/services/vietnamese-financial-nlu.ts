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
