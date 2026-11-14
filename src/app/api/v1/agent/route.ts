import { ok, badRequest, fail } from "@/lib/envelope";
import { answerQuestion, type AgentHistoryTurn } from "@/lib/services/agent";
import { runAgenticFinancialReasoning } from "@/lib/ai/agent-runner";
import { llmConfigured } from "@/lib/ai/gateway";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Serverless budget — keep under this for cascade + data-engine */
export const maxDuration = 60;

type AgentRequestBody = {
  question?: string;
  history?: AgentHistoryTurn[];
  preferences?: {
    depth?: "concise" | "standard" | "deep";
    style?: "analyst" | "technical" | "brief";
    language?: "vi" | "en";
    riskDisclosure?: "standard" | "detailed" | "off";
    agentic?: boolean;
  };
};

async function parseAgentRequestBody(req: Request): Promise<AgentRequestBody | null> {
  try {
    return (await req.json()) as AgentRequestBody;
  } catch {
    return null;
  }
}

/**
 * ORCA AI Agent — fetch-data-first reasoning over live platform data.
 * POST { question: string, history?: { role, content }[], preferences? }
 *
 * Always returns JSON (never hangs naked): degraded answer if LLM/data fails.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req, { name: "agent", binding: "RL_AI", limit: 10, windowSec: 60 });
  if (limited) return limited;
  const body = await parseAgentRequestBody(req);
  if (!body) return badRequest("Body JSON không hợp lệ");

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length < 3) return badRequest("Câu hỏi quá ngắn");
  if (question.length > 800) return badRequest("Câu hỏi quá dài (tối đa 800 ký tự)");

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (h) =>
            h &&
            (h.role === "user" || h.role === "assistant" || h.role === "agent") &&
            typeof h.content === "string",
        )
        .map((h) => ({
          role: (h.role === "agent" ? "assistant" : h.role) as "user" | "assistant",
          content: String(h.content).slice(0, 2_500),
        }))
        .slice(-20)
    : [];

  try {
    // Nếu client bật explicit agentic mode:
    if (body.preferences?.agentic && llmConfigured()) {
      try {
        const agenticRes = await runAgenticFinancialReasoning(question);
        if (
          agenticRes?.answer &&
          agenticRes.answer.trim().length >= 100 &&
          !agenticRes.answer.includes("Đã hoàn tất phân tích số liệu")
        ) {
          return ok(
            {
              answer: agenticRes.answer,
              mode: "agentic_tools",
              model: agenticRes.model,
              steps: agenticRes.steps,
              toolsUsed: agenticRes.toolsUsed,
              confidence: "HIGH",
            },
            {
              source: "orca-agentic-fa-loop",
              freshness: "FRESH",
              cached: false,
            }
          );
        }
      } catch {
        /* Fallback sang standard pipeline */
      }
    }

    const { result, meta } = await answerQuestion(question, body.preferences ?? {}, history);
    return ok(result, meta);
  } catch (e) {
    // answerQuestion already degrades internally — this is last-resort
    const msg = e instanceof Error ? e.message : "unknown";
    return fail(
      "AGENT_FAILED",
      `Agent tạm thời không phản hồi (${msg.slice(0, 160)}). Thử lại sau vài giây.`,
      503,
    );
  }
}
