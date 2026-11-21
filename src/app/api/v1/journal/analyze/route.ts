import { ok, badRequest, fail } from "@/lib/envelope";
import {
  analyzeJournalPortfolio,
  type JournalTradeInput,
} from "@/lib/services/journal-analysis";
import { rateLimit } from "@/lib/rate-limit";
import {
  hasPrototypePollutionKey,
  safeInternalErrorMessage,
  sanitizePlainText,
  stripPrototypePollution,
} from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * POST /api/v1/journal/analyze
 * Body: { trades: JournalTradeInput[] }
 * Đánh giá danh mục từ nhật ký lệnh (stats + LLM nếu có key).
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "journal", binding: "RL_AI", limit: 10, windowSec: 60 });
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as { trades?: JournalTradeInput[]; portfolioContext?: Record<string, unknown> } | null;
    if (body && hasPrototypePollutionKey(body)) {
      return badRequest("Payload chứa khóa không hợp lệ");
    }
    const trades = Array.isArray(body?.trades) ? body!.trades : null;
    if (!trades || trades.length === 0) {
      return badRequest("Cần ít nhất 1 lệnh trong trades[]");
    }
    if (trades.length > 300) return badRequest("Tối đa 300 lệnh mỗi lần phân tích");

    const numOrNull = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const cleaned: JournalTradeInput[] = trades.map((t) => ({
      assetType: sanitizePlainText(t.assetType ?? "stock", 20) || "stock",
      symbol: sanitizePlainText(t.symbol ?? "", 20).toUpperCase().replace(/[^A-Z0-9._-]/g, ""),
      side: t.side === "short" ? "short" : "long",
      entry: Number.isFinite(Number(t.entry)) ? Number(t.entry) : 0,
      exit: numOrNull(t.exit),
      stopLoss: numOrNull(t.stopLoss),
      takeProfit: numOrNull(t.takeProfit),
      size: numOrNull(t.size),
      leverage: numOrNull(t.leverage),
      strategy: sanitizePlainText(t.strategy ?? "", 80),
      emotion: sanitizePlainText(t.emotion ?? "", 40),
      notes: sanitizePlainText(t.notes ?? "", 200, true),
      openedAt: typeof t.openedAt === "number" && Number.isFinite(t.openedAt) ? t.openedAt : undefined,
      closedAt: typeof t.closedAt === "number" && Number.isFinite(t.closedAt) ? t.closedAt : null,
    }));

    const cleanContext = body?.portfolioContext ? stripPrototypePollution(body.portfolioContext) : undefined;
    const { result, meta } = await analyzeJournalPortfolio(cleaned, cleanContext);
    return ok(result, meta);
  } catch (e) {
    console.error("[journal-analyze]", e);
    return fail("JOURNAL_ANALYZE_FAILED", safeInternalErrorMessage(e, "Phân tích nhật ký thất bại"), 500);
  }
}
