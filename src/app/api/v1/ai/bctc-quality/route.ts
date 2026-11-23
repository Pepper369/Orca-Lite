import { ok, badRequest } from "@/lib/envelope";
import { rateLimit } from "@/lib/rate-limit";
import { isValidTradingSymbol, sanitizePlainText } from "@/app/api/_security";
import {
  analyzeBctcQuality,
  quickAnalyzeHeadlineEarnings,
  type RawFinancialInputs,
} from "@/lib/services/bctc-quality-analyst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_HEADLINE_CHARS = 500;

/**
 * TRỤ CỘT 3: AI BCTC QUALITY ANALYST API
 * Phân tích chất lượng lợi nhuận BCTC (cốt lõi vs thu nhập tài chính/một lần).
 * GET /api/v1/ai/bctc-quality?headline=... HOẶC POST với các chỉ số
 */
export async function GET(req: Request) {
  const limited = await rateLimit(req, { name: "bctc_quality_get", binding: "RL_AI", limit: 40, windowSec: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const headline = searchParams.get("headline");
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();

  if (headline) {
    if (headline.length > MAX_HEADLINE_CHARS) {
      return badRequest(`Tiêu đề quá dài (tối đa ${MAX_HEADLINE_CHARS} ký tự)`);
    }
    const analysis = quickAnalyzeHeadlineEarnings(headline);
    if (!analysis) {
      return badRequest("Không thể trích xuất số liệu BCTC từ tiêu đề");
    }
    return ok(analysis);
  }

  // Mẫu phân tích nhanh cho symbol thông dụng nếu không truyền headline
  const ticker = symbol || "HPG";
  if (!isValidTradingSymbol(ticker)) {
    return badRequest("Mã cổ phiếu không hợp lệ");
  }
  const defaultRaw: RawFinancialInputs = {
    revenue: 35_000,
    grossProfit: 4_500,
    operatingExpenses: 1_200,
    financialIncome: 450,
    otherIncome: 80,
    netProfit: 3_200,
    operatingCashFlow: 3_800,
  };

  const res = analyzeBctcQuality(ticker, "Q4", defaultRaw);
  return ok(res);
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "bctc_quality_post", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const rawTicker = typeof body?.ticker === "string" ? body.ticker.toUpperCase().trim() : "STOCK";
    if (!isValidTradingSymbol(rawTicker)) {
      return badRequest("Mã cổ phiếu không hợp lệ");
    }
    const ticker = rawTicker;
    const period = typeof body?.period === "string" ? sanitizePlainText(body.period, 40) || "Gần nhất" : "Gần nhất";
    const inputs: RawFinancialInputs = {
      revenue: Number(body.revenue) || undefined,
      grossProfit: Number(body.grossProfit) || undefined,
      operatingExpenses: Number(body.operatingExpenses) || undefined,
      financialIncome: Number(body.financialIncome) || undefined,
      otherIncome: Number(body.otherIncome) || undefined,
      netProfit: Number(body.netProfit) || 0,
      operatingCashFlow: Number(body.operatingCashFlow) || undefined,
    };

    const result = analyzeBctcQuality(ticker, period, inputs);
    return ok(result);
  } catch {
    return badRequest("Dữ liệu tài chính không hợp lệ");
  }
}
