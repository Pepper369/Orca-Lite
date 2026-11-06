import { ok, badRequest } from "@/lib/envelope";
import {
  analyzeBctcQuality,
  quickAnalyzeHeadlineEarnings,
  type RawFinancialInputs,
} from "@/lib/services/bctc-quality-analyst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * TRỤ CỘT 3: AI BCTC QUALITY ANALYST API
 * Phân tích chất lượng lợi nhuận BCTC (cốt lõi vs thu nhập tài chính/một lần).
 * GET /api/v1/ai/bctc-quality?headline=... HOẶC POST với các chỉ số
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const headline = searchParams.get("headline");
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();

  if (headline) {
    const analysis = quickAnalyzeHeadlineEarnings(headline);
    if (!analysis) {
      return badRequest("Không thể trích xuất số liệu BCTC từ tiêu đề");
    }
    return ok(analysis);
  }

  // Mẫu phân tích nhanh cho symbol thông dụng nếu không truyền headline
  const ticker = symbol || "HPG";
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
  try {
    const body = await req.json();
    const ticker = typeof body.ticker === "string" ? body.ticker.toUpperCase().trim() : "STOCK";
    const period = typeof body.period === "string" ? body.period : "Gần nhất";
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
