import { ok, badRequest, fail } from "@/lib/envelope";
import { rateLimit } from "@/lib/rate-limit";
import { DualAiConsensusEngine } from "@/lib/services/dual-ai-consensus";
import { isValidTradingSymbol, safeInternalErrorMessage, sanitizePlainText } from "@/app/api/_security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_QUESTION_CHARS = 800;

export async function GET(req: Request) {
  const limited = await rateLimit(req, { name: "ai_consensus_get", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase() ?? "";

    if (!isValidTradingSymbol(symbol)) {
      return badRequest("Tham số 'symbol' không hợp lệ (ví dụ: ?symbol=FPT)");
    }

    const report = await DualAiConsensusEngine.getConsensus(symbol);
    return ok(report);
  } catch (err: unknown) {
    console.error("[AI Consensus API Error - GET]:", err);
    return fail("AI_CONSENSUS_ERROR", safeInternalErrorMessage(err, "Không thể tạo đồng thuận AI"), 500);
  }
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "ai_consensus_post", binding: "RL_AI", limit: 20, windowSec: 60 });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => null)) as { symbol?: unknown; question?: unknown } | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Body JSON không hợp lệ");
    }

    const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    if (!isValidTradingSymbol(symbol)) {
      return badRequest("Trường 'symbol' không hợp lệ trong body");
    }

    if (typeof body.question === "string" && body.question.trim().length > MAX_QUESTION_CHARS) {
      return badRequest(`Câu hỏi quá dài (tối đa ${MAX_QUESTION_CHARS} ký tự)`);
    }
    const question =
      typeof body.question === "string" && body.question.trim()
        ? sanitizePlainText(body.question, MAX_QUESTION_CHARS, true) || undefined
        : undefined;
    const report = await DualAiConsensusEngine.getConsensus(symbol, question);
    return ok(report);
  } catch (err: unknown) {
    console.error("[AI Consensus API Error - POST]:", err);
    return fail("AI_CONSENSUS_ERROR", safeInternalErrorMessage(err, "Không thể tạo đồng thuận AI"), 500);
  }
}

