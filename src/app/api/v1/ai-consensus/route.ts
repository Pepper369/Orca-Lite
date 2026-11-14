import { ok, badRequest } from "@/lib/envelope";
import { rateLimit } from "@/lib/rate-limit";
import { DualAiConsensusEngine } from "@/lib/services/dual-ai-consensus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const limited = await rateLimit(req, { name: "ai_consensus_get", binding: "RL_AI", limit: 30, windowSec: 60 });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");

    if (!symbol || symbol.trim().length === 0) {
      return badRequest("Thiếu tham số 'symbol' (ví dụ: ?symbol=FPT)");
    }

    const report = await DualAiConsensusEngine.getConsensus(symbol);
    return ok(report);
  } catch (err: any) {
    console.error("[AI Consensus API Error - GET]:", err);
    return badRequest(`Không thể tạo đồng thuận AI: ${err.message || String(err)}`);
  }
}

export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "ai_consensus_post", binding: "RL_AI", limit: 20, windowSec: 60 });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return badRequest("Body JSON không hợp lệ");
    }

    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    if (!symbol) {
      return badRequest("Thiếu trường 'symbol' trong body");
    }

    const question = typeof body.question === "string" ? body.question.trim() : undefined;
    const report = await DualAiConsensusEngine.getConsensus(symbol, question);
    return ok(report);
  } catch (err: any) {
    console.error("[AI Consensus API Error - POST]:", err);
    return badRequest(`Không thể tạo đồng thuận AI: ${err.message || String(err)}`);
  }
}

