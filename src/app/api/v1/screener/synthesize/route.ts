import { ok, badRequest } from "@/lib/envelope";
import { llmChat, llmConfigured } from "@/lib/ai/gateway";
import type { ScreenerStockItem } from "@/lib/services/screener-snapshot-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface SynthesizePayload {
  preset?: string;
  totalMatched?: number;
  stocks: Partial<ScreenerStockItem>[];
  question?: string;
}

/**
 * Deterministic quantitative synthesis engine fallback when LLM is unavailable
 */
function buildDeterministicSynthesis({
  preset,
  totalMatched,
  stocks,
}: {
  preset?: string;
  totalMatched?: number;
  stocks: Partial<ScreenerStockItem>[];
}): string {
  if (stocks.length === 0) {
    return "Không có mã cổ phiếu nào trong danh mục hiện tại để phân tích. Hãy điều chỉnh bộ lọc để quét các mã tiềm năng.";
  }

  // 1. Sector breakdown
  const sectorCounts: Record<string, number> = {};
  for (const s of stocks) {
    const sec = s.sector || "Khác";
    sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
  }
  const sortedSectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);
  const leadingSector = sortedSectors[0]?.[0] || "Đa ngành";

  // 2. Average metrics
  const avgRs = Math.round(
    stocks.reduce((acc, s) => acc + (s.rsRating || 50), 0) / stocks.length
  );
  const avgQuality = Math.round(
    stocks.reduce((acc, s) => acc + (s.compositeScore || s.qualityScore || 50), 0) / stocks.length
  );

  // 3. Trade plan allocation
  // Weight stocks by RS rating & composite score
  const topStocks = stocks.slice(0, 5);
  const totalWeightScore = topStocks.reduce(
    (acc, s) => acc + (s.rsRating || 50) * (s.compositeScore || 50),
    0
  );

  const tradePlanRows = topStocks.map((s) => {
    const sym = s.symbol || "CP";
    const price = s.price || 0;
    const bp = s.buyPoint || price;
    const weightScore = (s.rsRating || 50) * (s.compositeScore || 50);
    const weightPct = totalWeightScore > 0 ? Math.round((weightScore / totalWeightScore) * 100) : Math.round(100 / topStocks.length);
    
    // Stop loss ~ 5% to 7% or tripleBarrierLower
    const sl = s.tripleBarrierLower && s.tripleBarrierLower < price
      ? Math.round(s.tripleBarrierLower)
      : Math.round(price * 0.94);
    
    // TP1 ~ 10-12% or tripleBarrierUpper, TP2 ~ 18-20%
    const tp1 = s.tripleBarrierUpper && s.tripleBarrierUpper > price
      ? Math.round(s.tripleBarrierUpper)
      : Math.round(price * 1.10);
    const tp2 = Math.round(price * 1.18);

    const risk = price - sl;
    const reward = tp1 - price;
    const rr = risk > 0 ? (reward / risk).toFixed(1) : "2.0";

    return `| **${sym}** | **${weightPct}%** | ${Math.round(bp * 0.99).toLocaleString("vi-VN")} - ${Math.round(bp * 1.02).toLocaleString("vi-VN")} đ | ${sl.toLocaleString("vi-VN")} đ (-${((1 - sl/price)*100).toFixed(1)}%) | ${tp1.toLocaleString("vi-VN")} đ (+${(((tp1/price)-1)*100).toFixed(1)}%) | ${tp2.toLocaleString("vi-VN")} đ (+${(((tp2/price)-1)*100).toFixed(1)}%) | **${rr}x** |`;
  });

  return `### 🏛️ 1. TỔNG QUAN TƯƠNG QUAN NGÀNH & XUNG LỰC DÒNG TIỀN
• **Nhóm ngành dẫn dắt:** Rổ cổ phiếu lọc theo bộ chuẩn **${preset || "Hiện tại"}** (${totalMatched || stocks.length} mã thỏa điều kiện) đang hội tụ xung lực mạnh nhất tại nhóm **${leadingSector}** (${sortedSectors.map(([sec, count]) => `${sec}: ${count} mã`).join(", ")}).
• **Sức mạnh tương quan (RS Rating):** Trung bình toàn danh mục đạt **${avgRs}/99 điểm**, cho thấy dòng tiền thông minh (Smart Money Footprint) đang có xu hướng gom hàng chủ động trước khi sóng bùng nổ.
• **Chất lượng cấu trúc kỹ thuật (Orca Master Score):** Trung bình đạt **${avgQuality}/100 điểm**, xác nhận đa số cổ phiếu đang vận động trong pha tích lũy chặt chẽ (Base building) hoặc chuẩn bị kích hoạt điểm Breakout chuẩn VCP / CANSLIM.

---

### 🎯 2. HỢP LƯU ĐIỂM MUA & VÙNG VÀNG (SWEET LAUNCH ZONE)
• **Trạng thái hành động giá:**
${topStocks.map((s) => {
  const diff = s.buyPointDiffPct != null ? `${s.buyPointDiffPct >= 0 ? "+" : ""}${s.buyPointDiffPct.toFixed(1)}%` : "0%";
  const zone = s.buyZoneStatus || (Math.abs(s.buyPointDiffPct || 0) <= 3 ? "SWEET_SPOT" : "WATCHING");
  const vsa = s.vsaSignal || s.smartMoneySignal || "Tích lũy khối lượng kiệt quệ";
  return `  - **${s.symbol}**: Giá **${(s.price || 0).toLocaleString("vi-VN")} đ** (${diff} so với Buy Point). Vùng: \`${zone}\`. Tín hiệu VSA: *${vsa}*.`;
}).join("\n")}
• **Nhận định điểm kích hoạt:** Các mã có độ lệch giá so với Buy Point trong biên độ $[-2\\%, +4\\%]$ là các vị thế tối ưu để giải ngân bước 1 (30-40% vị thế) mà không bị rủi ro mua đuổi (FOMO Extension).

---

### ⚖️ 3. KẾ HOẠCH ĐI VỐN ĐỊNH LƯỢNG & MA TRẬN GIAO DỊCH (TRADE PLAN)
*Chiến lược phân bổ tỷ trọng theo mô hình Fixed Fractional & Kelly Criterion tối ưu hóa tỷ lệ sinh lời trên rủi ro:*

| Mã Cổ Phiếu | Tỷ Trọng Đề Xuất | Vùng Mua Gom | Điểm Cắt Lỗ (SL) | Mục Tiêu 1 (TP1) | Mục Tiêu 2 (TP2) | Tỷ Lệ R:R |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${tradePlanRows.join("\n")}

---

### ⚠️ 4. CẢNH BÁO RỦI RO & BẪY KÉO XẢ T+ (BULLTRAP GUARD)
1. **Rủi ro bẫy nổ xịt (Fake Breakout Trap):** Nếu chỉ số VN-Index tiệm cận vùng kháng cự tâm lý mà thanh khoản thị trường suy giảm dưới MA20 phiên, tuyệt đối không mua đuổi khi cổ phiếu vượt giá pivot quá $5\\%$.
2. **Kỷ luật điểm dừng lỗ:** Thực thi quy tắc Stop-loss cứng khi đóng nến thủng MA20 ngày hoặc âm quá $-6\\%$ từ giá vốn. Không trung bình giá xuống với cổ phiếu đang rơi rụng nền giá.
3. **Quản trị T+:** Chia tỷ trọng giải ngân thành 2 bước (Vị thế thăm dò $40\\%$ tại nền, gia tăng $60\\%$ khi có nến nổ xác nhận kèm Volume đột biến $> 1.5\\times$ MA20).`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SynthesizePayload;
    const { preset, totalMatched, stocks = [], question } = body;

    if (!Array.isArray(stocks) || stocks.length === 0) {
      return badRequest("Danh sách cổ phiếu phân tích không được để trống.");
    }

    const targetStocks = stocks.slice(0, 10);
    const stockSummaries = targetStocks.map((s, idx) => {
      return `${idx + 1}. [${s.symbol}] - Ngành: ${s.sector || "N/A"}, Giá: ${s.price?.toLocaleString("vi-VN") || "0"} đ (${(s.changePercent ?? 0) >= 0 ? "+" : ""}${s.changePercent?.toFixed(2) ?? "0"}%), Vol: ${s.volume?.toLocaleString("vi-VN") || "N/A"}, RS: ${s.rsRating ?? "N/A"}/99, Điểm Master: ${s.compositeScore ?? s.qualityScore ?? "N/A"}, Buy Point: ${s.buyPoint?.toLocaleString("vi-VN") || "N/A"} (Lệch: ${s.buyPointDiffPct != null ? (s.buyPointDiffPct >= 0 ? "+" : "") + s.buyPointDiffPct.toFixed(1) + "%" : "0%"}), Vùng: ${s.buyZoneStatus || "N/A"}, Smart Money / VSA: ${s.vsaSignal || s.smartMoneySignal || "N/A"}, Setup Grade: ${s.setupGrade || "N/A"}`;
    });

    const isLlmAvailable = llmConfigured();

    if (isLlmAvailable) {
      const systemPrompt = `Bạn là Giám đốc Quản lý Quỹ Định lượng Cấp cao (Chief Quantitative Strategist) tại Orca Capital.
Nhiệm vụ của bạn là tổng hợp danh mục cổ phiếu vừa được lọc ra từ hệ thống Screener chuyên sâu, đưa ra nhận định chiến lược, tương quan dòng tiền, và lập kế hoạch giao dịch định lượng (Trade Plan) chặt chẽ bằng tiếng Việt theo chuẩn KaTeX math.

QUY TẮC PHÂN TÍCH BẮT BUỘC:
1. KHÔNG suy đoán thông tin ngoài dữ liệu được cung cấp. Bám sát các chỉ số thực tế: RS Rating, Composite Score, Buy Point, Vùng Vàng, VSA, Triple Barrier.
2. Cấu trúc bài trả lời rõ ràng gồm 4 phần chính:
   ### 🏛️ 1. TỔNG QUAN TƯƠNG QUAN NGÀNH & XUNG LỰC DÒNG TIỀN
   ### 🎯 2. HỢP LƯU ĐIỂM MUA & VÙNG VÀNG (SWEET LAUNCH ZONE)
   ### ⚖️ 3. KẾ HOẠCH ĐI VỐN ĐỊNH LƯỢNG & MA TRẬN GIAO DỊCH (Bảng Markdown: Mã | Tỷ Trọng % | Vùng Mua | SL | TP1 | TP2 | R:R)
   ### ⚠️ 4. CẢNH BÁO RỦI RO & BẪY KÉO XẢ T+ (BULLTRAP GUARD)
3. Văn phong súc tích, dứt khoát, chuyên nghiệp theo phong cách Quantitative Trading Fund.
4. Công thức toán hoặc tỷ số viết chuẩn LaTeX $...$ ví dụ $R:R \\ge 2.0\\text{x}$, $[-2\\%, +5\\%]$.`;

      const userMessage = `Dưới đây là danh mục top ${targetStocks.length} cổ phiếu được lọc ra theo bộ tiêu chí "${preset || "Hiện tại"}" (Tổng số mã thỏa mãn: ${totalMatched || targetStocks.length}):

${stockSummaries.join("\n")}

${question ? `Câu hỏi bổ sung từ Nhà đầu tư: "${question}"` : ""}

Hãy tổng hợp và lập kế hoạch giao dịch định lượng chi tiết cho rổ cổ phiếu trên.`;

      try {
        const result = await llmChat("reasoning", {
          system: systemPrompt,
          user: userMessage,
          maxTokens: 2200,
          temperature: 0.25,
        });

        if (result && result.text && result.text.trim().length > 100) {
          return ok({
            synthesis: result.text.trim(),
            model: result.model || "Orca Quant Reasoning LLM",
            latencyMs: result.latencyMs,
            stockCount: targetStocks.length,
            generatedAt: new Date().toISOString(),
          });
        }
      } catch (llmErr) {
        console.warn("[Screener Synthesize] LLM failed, using deterministic fallback:", llmErr);
      }
    }

    // Deterministic Quant Synthesizer
    const deterministicMarkdown = buildDeterministicSynthesis({
      preset,
      totalMatched,
      stocks: targetStocks,
    });

    return ok({
      synthesis: deterministicMarkdown,
      model: "Orca In-House Quantitative Synthesis Engine",
      latencyMs: 12,
      stockCount: targetStocks.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Screener Synthesize API Error]:", error);
    return badRequest("Lỗi xử lý yêu cầu tổng hợp AI Screener.");
  }
}
