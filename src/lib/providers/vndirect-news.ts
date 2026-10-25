import "server-only";
import { createHash } from "crypto";
import { vndirectJson } from "../financial/vndirect-http";
import type { NewsArticle } from "../types";

const VND_NEWS = "vndirect-news";

export const dstockNewsUrl = (symbol: string) =>
  `https://dstock.vndirect.com.vn/tin-tuc-ma/${encodeURIComponent(symbol)}`;

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** newsDate "2026-10-09" (+ newsTime "14:05:00") theo giờ VN → ISO; không hợp lệ → null. */
export function vndNewsTime(date: unknown, time: unknown): string | null {
  const d = str(date)?.slice(0, 10);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = str(time);
  const hhmmss = t && /^\d{2}:\d{2}(:\d{2})?$/.test(t) ? (t.length === 5 ? `${t}:00` : t) : "00:00:00";
  const ms = Date.parse(`${d}T${hhmmss}+07:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Chuẩn hoá một dòng /v4/news (chịu được thiếu/đổi tên trường). */
export function mapVndNewsRow(sym: string, row: Row): NewsArticle | null {
  const title = str(row.newsTitle) ?? str(row.title) ?? str(row.headline);
  if (!title) return null;
  const rawUrl = str(row.newsSourceLink) ?? str(row.newsUrl) ?? str(row.url) ?? str(row.link);
  const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : dstockNewsUrl(sym);
  const id = str(row.newsId) ?? str(row.id) ?? createHash("sha1").update(`${sym}|${title}`).digest("hex").slice(0, 16);
  return {
    id: `vnd-${id}`,
    title,
    url,
    source: str(row.newsSource) ?? str(row.source) ?? "VNDirect DStock",
    publishedAt: vndNewsTime(row.newsDate ?? row.date, row.newsTime ?? row.time),
    summary: str(row.newsDescription) ?? str(row.description) ?? str(row.summary),
    symbols: [sym],
    category: "corporate",
    relatedSymbols: [sym],
  };
}

export interface AnalyticReport {
  id: string;
  symbol: string;
  title: string;
  date: string | null;
  source: string;
  pdfUrl: string | null;
  targetPrice: number | null;
  marketPrice: number | null;
  rating: string | null;
  dividendYield: string | null;
  abstract: string | null;
  url: string;
}

function cleanHtmlText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapVndAnalyticReport(sym: string, row: Row): AnalyticReport | null {
  const title = str(row.newsTitle) ?? str(row.title) ?? str(row.headline);
  if (!title) return null;
  const content = str(row.newsContent) ?? "";
  const rawUrl = str(row.newsSourceLink) ?? str(row.newsUrl) ?? str(row.url) ?? str(row.link);
  const url = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : dstockNewsUrl(sym);
  const id = str(row.newsId) ?? str(row.id) ?? createHash("sha1").update(`${sym}|${title}`).digest("hex").slice(0, 16);

  // Extract PDF attachment if present
  let pdfUrl: string | null = null;
  const rawAttachments = row.attachments;
  if (Array.isArray(rawAttachments) && rawAttachments.length) {
    for (const att of rawAttachments) {
      const u = str(att?.url) ?? str(att?.sourceUrl);
      if (u && /\.pdf$/i.test(u)) {
        pdfUrl = u;
        break;
      }
    }
  }
  if (!pdfUrl && content) {
    const m = content.match(/https?:\/\/[^\s"'><\)]+\.pdf/i);
    if (m) pdfUrl = m[0];
  }

  // Extract Target Price
  let targetPrice: number | null = null;
  const targetMatch = content.match(/(?:Target Price|Giá mục tiêu)[^0-9\n\r<]{0,40}(?:VND)?\s*([0-9]{1,3}(?:[,.][0-9]{3})+|[0-9]{4,6})/i);
  if (targetMatch) {
    const p = Number(targetMatch[1].replace(/[,.]/g, ""));
    if (Number.isFinite(p) && p > 1000 && p < 1_000_000) targetPrice = p;
  }

  // Extract Market Price
  let marketPrice: number | null = null;
  const priceMatch = content.match(/(?:Market Price|Thị giá)[^0-9\n\r<]{0,40}(?:VND)?\s*([0-9]{1,3}(?:[,.][0-9]{3})+|[0-9]{4,6})/i);
  if (priceMatch) {
    const p = Number(priceMatch[1].replace(/[,.]/g, ""));
    if (Number.isFinite(p) && p > 1000 && p < 1_000_000) marketPrice = p;
  }

  // Extract Rating
  let rating: string | null = null;
  const ratingMatch = content.match(/(?:Rating|Khuyến nghị)[^A-Za-z\n\r<]{0,40}(ADD|BUY|HOLD|NEUTRAL|REDUCE|OUTPERFORM|ACCUMULATE|MUA|KHẢ QUAN|NẮM GIỮ|BÁN)/i);
  if (ratingMatch) {
    const rawRating = ratingMatch[1].toUpperCase();
    if (rawRating === "ADD" || rawRating === "ACCUMULATE") rating = "TĂNG TỶ TRỌNG";
    else if (rawRating === "BUY" || rawRating === "OUTPERFORM" || rawRating === "MUA" || rawRating === "KHẢ QUAN") rating = "MUA";
    else if (rawRating === "HOLD" || rawRating === "NEUTRAL" || rawRating === "NẮM GIỮ") rating = "NẮM GIỮ";
    else if (rawRating === "REDUCE" || rawRating === "BÁN") rating = "HẠ TỶ TRỌNG";
    else rating = rawRating;
  }

  // Extract Dividend Yield
  let dividendYield: string | null = null;
  const divMatch = content.match(/(?:Dividend Yield|Cổ tức)[^0-9\n\r<]{0,30}([0-9]+(?:\.[0-9]+)?%)/i);
  if (divMatch) dividendYield = divMatch[1];

  const rawAbstract = str(row.newsAbstract);
  const abstract = rawAbstract || (content ? cleanHtmlText(content).slice(0, 300) + "..." : null);

  return {
    id: `vnd-rep-${id}`,
    symbol: sym,
    title,
    date: str(row.newsDate) ?? str(row.date) ?? null,
    source: str(row.newsSource) ?? str(row.source) ?? "VNDIRECT Research",
    pdfUrl,
    targetPrice,
    marketPrice,
    rating,
    dividendYield,
    abstract,
    url,
  };
}

/**
 * Báo cáo phân tích định giá chuyên sâu từ khối phân tích VNDirect Research (analytic_report).
 */
export async function getVndAnalyticReports(symbol: string, size = 15): Promise<AnalyticReport[]> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return [];
  const n = Math.max(1, Math.min(30, Math.floor(size)));
  const path = `/v4/news?q=tagCodes:${sym}~newsGroup:analytic_report&sort=newsDate:desc~newsTime:desc&size=${n}`;
  const { data } = await vndirectJson<{ data?: Row[] }>(path, {
    provider: VND_NEWS,
    timeoutMs: 7_000,
    retries: 1,
    accept: (v) => Array.isArray(v?.data),
  });
  const out: AnalyticReport[] = [];
  for (const row of data.data ?? []) {
    const r = mapVndAnalyticReport(sym, row);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Tin doanh nghiệp theo mã (tương ứng https://dstock.vndirect.com.vn/tin-tuc-ma/{SYM}).
 * Sửa query sang tagCodes:${sym} để bắt chuẩn toàn bộ tin tức theo mã.
 */
export async function getVndCompanyNews(symbol: string, size = 20): Promise<NewsArticle[]> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return [];
  const n = Math.max(1, Math.min(50, Math.floor(size)));
  const path = `/v4/news?q=tagCodes:${sym}&sort=newsDate:desc~newsTime:desc&size=${n}`;
  const { data } = await vndirectJson<{ data?: Row[] }>(path, {
    provider: VND_NEWS,
    timeoutMs: 6_000,
    retries: 1,
    accept: (v) => Array.isArray(v?.data),
  });
  const out: NewsArticle[] = [];
  for (const row of data.data ?? []) {
    const a = mapVndNewsRow(sym, row);
    if (a) out.push(a);
  }
  return out;
}

