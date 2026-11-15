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
    stream?: boolean;
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
 * GET /api/v1/agent — Health & capability check
 */
export async function GET() {
  return ok({
    service: "ORCA FA AI Agent",
    status: "ready",
    methods: ["POST", "GET"],
    streaming: true,
  });
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
    const wantsStream =
      Boolean(body.preferences?.stream) ||
      Boolean(req.headers.get("accept")?.includes("text/event-stream"));

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (event: string, data: unknown) => {
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            } catch {
              /* Stream may be closed by client */
            }
          };

          try {
            const useAgentic = Boolean(body.preferences?.agentic && llmConfigured());
            if (useAgentic) {
              const agenticRes = await runAgenticFinancialReasoning(question, {
                signal: req.signal,
                onStep: (step) => sendEvent("step", step),
                onToken: (chunk) => sendEvent("token", { chunk }),
              });

              if (agenticRes?.answer) {
                sendEvent("done", {
                  answer: agenticRes.answer,
                  mode: "agentic_tools",
                  model: agenticRes.model,
                  steps: agenticRes.steps,
                  toolsUsed: agenticRes.toolsUsed,
                  confidence: "HIGH",
                  meta: {
                    source: "orca-agentic-fa-loop",
                    freshness: "FRESH",
                    cached: false,
                  },
                });
                controller.close();
                return;
              }
            }

            // Fallback sang standard pipeline
            const { result, meta } = await answerQuestion(question, body.preferences ?? {}, history);
            const text = result.answer;
            const words = text.split(/(\s+)/);
            for (let i = 0; i < words.length; i += 4) {
              if (req.signal.aborted) break;
              const slice = words.slice(i, i + 4).join("");
              sendEvent("token", { chunk: slice });
            }

            sendEvent("done", {
              ...result,
              meta,
            });
            controller.close();
          } catch (err) {
            sendEvent("error", {
              message: err instanceof Error ? err.message : "Lỗi xử lý luồng stream",
            });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

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
