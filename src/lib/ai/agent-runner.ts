/**
 * AGENTIC RUNNER & REASONING LOOP (ORCA AGENTIC FA)
 * Implements ReAct (Reasoning + Acting) loop for Financial Analyst tasks.
 * Instead of dumping massive raw data into the prompt, the agent:
 * 1. Analyzes user intent & picks necessary tools.
 * 2. Executes tools iteratively (up to maxSteps).
 * 3. Synthesizes a well-grounded, professional CFA-grade answer with citations.
 */

import "server-only";
import { llmChat } from "./gateway";
import { ORCA_FA_TOOLS, executeOrcaTool } from "./tools/fa-tools";

export interface AgenticStep {
  step: number;
  thought: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  observation?: unknown;
}

export interface AgenticExecutionResult {
  answer: string;
  steps: AgenticStep[];
  model: string;
  toolsUsed: string[];
}

function synthesizeFallbackFromObservations(question: string, steps: AgenticStep[]): string | null {
  const successfulSteps = steps.filter((s) => s.observation && typeof s.observation === "object");
  if (successfulSteps.length === 0) return null;

  const lines: string[] = [
    `## 📊 BÁO CÁO PHÂN TÍCH TÀI CHÍNH CHUYÊN SÂU (ORCA FA AGENTIC)`,
    `**Chủ đề:** ${question}`,
    "",
    `### 1. DỮ LIỆU ĐỊNH LƯỢNG THU THẬP ĐƯỢC TỪ CÔNG CỤ NỘI BỘ:`,
  ];

  for (const step of successfulSteps) {
    const obs = step.observation as Record<string, unknown>;
    lines.push(`\n#### [Bước ${step.step}] ${step.thought}`);
    if (obs.symbol) {
      lines.push(`- **Mã cổ phiếu:** ${obs.symbol}`);
    }
    if (obs.ratios && typeof obs.ratios === "object") {
      const r = obs.ratios as Record<string, unknown>;
      lines.push(`- **Chỉ số sinh lời & định giá:**`);
      if (r.roe != null) lines.push(`  + ROE: ${(Number(r.roe) * 100).toFixed(1)}%`);
      if (r.roa != null) lines.push(`  + ROA: ${(Number(r.roa) * 100).toFixed(1)}%`);
      if (r.pe != null) lines.push(`  + P/E: ${Number(r.pe).toFixed(1)}x`);
      if (r.pb != null) lines.push(`  + P/B: ${Number(r.pb).toFixed(1)}x`);
      if (r.currentRatio != null) lines.push(`  + Thanh toán hiện hành: ${Number(r.currentRatio).toFixed(2)}x`);
    }
    if (obs.quality && typeof obs.quality === "object") {
      const q = obs.quality as Record<string, unknown>;
      if (q.piotroskiFScore != null) lines.push(`- **Piotroski F-Score:** ${q.piotroskiFScore}/9 điểm`);
      if (q.altmanZScore != null) lines.push(`- **Altman Z''-Score:** ${Number(q.altmanZScore).toFixed(2)}`);
      if (q.cfoQuality) lines.push(`- **Chất lượng dòng tiền CFO:** ${q.cfoQuality}`);
    }
    if (obs.valuation && typeof obs.valuation === "object") {
      const v = obs.valuation as Record<string, unknown>;
      if (v.fairValue != null) lines.push(`- **Giá trị nội tại ước tính:** ${Number(v.fairValue).toLocaleString("vi-VN")} đ`);
      if (v.marginOfSafetyPct != null) lines.push(`- **Biên an toàn (MOS):** ${v.marginOfSafetyPct}%`);
    }
  }

  lines.push("");
  lines.push(`### 2. ĐÁNH GIÁ CHẤT LƯỢNG LỢI NHUẬN & CON HÀO KINH TẾ (MOAT):`);
  lines.push(`- Dòng tiền thuần từ HĐKD (CFO) cần được đối chiếu liên tục với LNST để phòng tránh bẫy lợi nhuận dồn tích (Accruals).`);
  lines.push(`- Cấu trúc vốn và đòn bẩy tài chính (D/E) cần duy trì trong ngưỡng an toàn so với chu kỳ ngành.`);
  lines.push("");
  lines.push(`> **Tuyên bố miễn trừ trách nhiệm:** Phân tích được tổng hợp tự động từ dữ liệu BCTC và công cụ định lượng Orca AI cho mục đích nghiên cứu, không phải khuyến nghị mua bán.`);

  return lines.join("\n");
}

export async function runAgenticFinancialReasoning(
  question: string,
  opts?: { maxSteps?: number }
): Promise<AgenticExecutionResult | null> {
  const maxSteps = Math.min(Math.max(opts?.maxSteps ?? 3, 1), 5);
  const steps: AgenticStep[] = [];
  const toolsUsed: string[] = [];

  const toolsSystemDesc = ORCA_FA_TOOLS.map(
    (t) => `- ${t.name}: ${t.description}\n  Tham số: ${JSON.stringify(t.parameters)}`
  ).join("\n\n");

  const system = `Bạn là ORCA FA Agentic Copilot — Chuyên gia Phân tích Tài chính Cấp cao.
Nhiệm vụ của bạn là giải quyết câu hỏi tài chính của người dùng bằng cách tư duy từng bước (Chain-of-Thought) và sử dụng các công cụ (Tools) khi cần thiết.

DANH SÁCH CÔNG CỤ KHẢ DỤNG:
${toolsSystemDesc}

ĐỊNH DẠNG PHẢN HỒI:
Ở mỗi lượt, bạn PHẢI phản hồi theo ĐÚNG định dạng JSON sau:
{
  "thought": "Suy nghĩ phân tích của bạn về câu hỏi và lý do chọn công cụ...",
  "tool": "tên_công_cụ_cần_gọi hoặc để null nếu đã đủ thông tin để trả lời",
  "args": { "tên_tham_số": "giá_trị" },
  "final_answer": "Nếu tool là null, hãy viết câu trả lời phân tích cơ bản chuyên sâu tại đây. Nếu tool khác null, để final_answer là null"
}

QUY TẮC BẮT BUỘC:
- Chỉ trả về duy nhất 1 khối JSON hợp lệ, không bọc markdown \`\`\`json.
- Nếu câu hỏi cần số liệu BCTC, định giá hoặc danh sách mã: HÃY GỌI TOOL PHÙ HỢP TRƯỚC, KHÔNG ĐOÁN MÒ SỐ LIỆU.
- Khi đã có đủ kết quả quan sát (Observations) từ các công cụ, hãy đặt "tool": null và viết "final_answer" chuyên sâu, chuẩn CFA.`;

  let currentContext = `CÂU HỎI CỦA NGƯỜI DÙNG: "${question}"\n`;

  for (let step = 1; step <= maxSteps; step++) {
    const res = await llmChat("reasoning", {
      system,
      user: currentContext,
      temperature: 0.2,
      maxTokens: 2000,
    });

    if (!res?.text) break;

    // Parse JSON
    let parsed: {
      thought?: string;
      tool?: string | null;
      args?: Record<string, unknown>;
      final_answer?: string | null;
    } | null = null;

    try {
      const cleaned = res.text.replace(/^```json/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      if (res.text.trim().length >= 100) {
        return {
          answer: res.text.trim(),
          steps,
          model: res.model,
          toolsUsed,
        };
      }
      break;
    }

    if (!parsed) break;

    const thought = parsed.thought ?? "Đang phân tích...";
    const toolName = parsed.tool ?? null;
    const args = parsed.args ?? {};

    // Nếu Agent đã kết luận với câu trả lời đầy đủ
    if ((!toolName || parsed.final_answer) && parsed.final_answer && parsed.final_answer.trim().length >= 80) {
      steps.push({ step, thought, observation: "Hoàn tất phân tích" });
      return {
        answer: parsed.final_answer.trim(),
        steps,
        model: res.model,
        toolsUsed,
      };
    }

    // Nếu model cố gắng dừng mà không gọi tool và không có final_answer hợp lệ, break để chuyển sang synthesis
    if (!toolName) {
      break;
    }

    // Thực thi Tool với Error Handling & Self-Correction
    toolsUsed.push(toolName);
    const execRes = await executeOrcaTool(toolName, args);
    const isError = !execRes.success || Boolean(execRes.error);
    const obsData = isError ? { error: execRes.error || "Không lấy được dữ liệu từ nguồn này" } : execRes.result;

    steps.push({
      step,
      thought,
      toolCall: { name: toolName, args },
      observation: obsData,
    });

    if (isError) {
      currentContext += `\n[BƯỚC ${step} - THẤT BẠI]:
Suy nghĩ: ${thought}
Đã gọi công cụ: ${toolName} nhưng gặp lỗi: "${execRes.error}".
HƯỚNG DẪN TỰ SỬA SAI (SELF-CORRECTION): Hãy phân tích nguyên nhân lỗi, chọn công cụ thay thế (fallback tool) hoặc điều chỉnh tham số args, không được lặp lại lệnh gọi y hệt.\n`;
    } else {
      currentContext += `\n[BƯỚC ${step} - THÀNH CÔNG]:
Suy nghĩ: ${thought}
Đã gọi công cụ: ${toolName} với tham số: ${JSON.stringify(args)}
Kết quả quan sát được (Observations): ${JSON.stringify(obsData).slice(0, 4000)}
GHI CHÚ KIỂM ĐỊNH MÂU THUẪN (CONTRADICTION CHECK): Hãy đối chiếu xem có hiện tượng 'Bẫy giá trị' (Value Trap) không (ví dụ P/E thấp nhưng F-Score thấp, CFO âm, hoặc nợ vay quá lớn).\n`;
    }
  }

  // Lượt tổng kết cuối cùng nếu có context
  const finalSummary = await llmChat("analysis", {
    system: `Bạn là ORCA FA Copilot — Giám đốc Khối Phân tích Nghiên cứu Cổ phiếu (Head of Equity Research).
Dựa trên toàn bộ suy nghĩ và kết quả công cụ thu thập được, hãy viết bài phân tích cơ bản chuyên sâu chuẩn CFA.
YÊU CẦU BẮT BUỘC VỀ PHÂN TÍCH & TRÍCH DẪN AUDIT TRAIL:
1. Phát hiện & cảnh báo rõ ràng nếu có mâu thuẫn số liệu (ví dụ: P/E rẻ nhưng CFO âm, F-Score thấp -> Cảnh báo Bẫy Giá Trị).
2. Trích dẫn nguồn số liệu rõ ràng trong ngoặc vuông [Nguồn: BCTC VNDirect / Cổng thông tin HOSE / VietnamBiz Data / Kế toán VAS].
3. Tuân thủ văn phong Humanizer: Vào thẳng vấn đề, không mở bài sáo rỗng, liên kết nhân quả sắc sảo.`,
    user: currentContext,
    temperature: 0.35,
    maxTokens: 2500,
  });

  if (finalSummary?.text && finalSummary.text.trim().length >= 100) {
    return {
      answer: finalSummary.text.trim(),
      steps,
      model: finalSummary.model,
      toolsUsed,
    };
  }

  // Fallback tổng hợp từ observations nếu LLM không trả về text
  const synthesized = synthesizeFallbackFromObservations(question, steps);
  if (synthesized) {
    return {
      answer: synthesized,
      steps,
      model: "Orca Deterministic Synthesis",
      toolsUsed,
    };
  }

  // Nếu hoàn toàn không có dữ liệu, trả về null để route fallback sang pipeline chuẩn
  return null;
}
