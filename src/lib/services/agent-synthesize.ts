import "server-only";
import { llmChat, llmConfigured } from "../ai/gateway";
import { retrieveRag, formatPassagesForPrompt, type RagBranch } from "../rag";
import type { AgentBuilt } from "./agent-context";
import type { HistoryTurn } from "./agent-memory";
import { buildFastDatafeedContext } from "./fast-datafeed-hub";

export type AgentPrefs = {
  depth?: "concise" | "standard" | "deep";
  style?: "analyst" | "technical" | "brief";
  language?: "vi" | "en";
  riskDisclosure?: "standard" | "detailed" | "off";
};

export type AgentHistoryTurn = HistoryTurn;

export function synthesizeFromDatafeed(
  question: string,
  built: AgentBuilt,
  prefs: AgentPrefs = {},
  opts?: { forceBriefingFormat?: boolean },
): { text: string; model: string } {
  const q = question.toLowerCase();
  const narrative = built.narrative.trim();

  if (narrative.includes("> 🎯 **ĐÁP ÁN TRỌNG TÂM")) {
    const text = `## 📊 BÁO CÁO PHÂN TÍCH ĐỊNH LƯỢNG CHUYÊN SÂU (ORCA QUANT INTELLIGENCE)\n\n${narrative}`;
    return { text, model: "Orca Dynamic Quant AI (Live Datafeed)" };
  }

  if (opts?.forceBriefingFormat || /thị trường|vn-?index|vn30|hose|hnx/i.test(q)) {
    const text = `## 🧭 NHẬN ĐỊNH THỊ TRƯỜNG & DÒNG TIỀN (ORCA IN-HOUSE QUANT AI)\n\n> 🎯 **ĐÁP ÁN TRỌNG TÂM:** Thị trường chứng khoán ghi nhận diễn biến phân hóa với thanh khoản và độ rộng dòng tiền bám sát dữ liệu thời gian thực.\n\n${narrative}\n\n---\n> **Chiến lược hành động:** Tập trung chọn lọc các mã bước vào **Vùng Vàng Chân Sóng Apex** và có con hào kinh tế 4M vững chắc. Kỷ luật tuân thủ ngưỡng cắt lỗ ATR và tỷ số Risk/Reward >= 2.2x.`;
    return { text, model: "Orca Dynamic Quant AI (Live Datafeed)" };
  }

  const symMatch = narrative.match(/##\s+([A-Z0-9]{3})\s*[—-]\s*([^\n]+)/);
  if (symMatch) {
    const sym = symMatch[1];
    const name = symMatch[2].trim();
    const priceMatch = narrative.match(/\*\*Giá hiện tại\*\*:\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)/);
    const rsiMatch = narrative.match(/- \*\*RSI14\*\*:\s*\*\*([^*]+)\*\*\s*\(([^)]+)\)/);
    const priceStr = priceMatch ? `${priceMatch[1]} (${priceMatch[2]})` : "đang tích lũy";
    const rsiStr = rsiMatch ? `RSI14 đạt ${rsiMatch[1]} (${rsiMatch[2]})` : "chỉ báo xung lực ổn định";

    const text = `## 📊 PHÂN TÍCH ĐỊNH LƯỢNG CHUYÊN SÂU: ${sym} (${name})\n\n` +
      `> 🎯 **ĐÁP ÁN TRỌNG TÂM:** ${sym} hiện giao dịch tại **${priceStr}**, trạng thái kỹ thuật duy trì nhịp vận động tích cực với **${rsiStr}**.\n\n` +
      `${narrative}\n\n` +
      `---\n> ⚠️ **Lưu ý rủi ro:** Kỷ luật quản trị rủi ro tại ngưỡng Stop Loss đề xuất (hoặc 1.0x ATR), chỉ giải ngân khi tỷ lệ Risk/Reward $\\ge 2.0x$.`;
    return { text, model: "Orca Dynamic Quant AI (Live Datafeed)" };
  }

  const text = `## 📊 PHÂN TÍCH ĐỊNH LƯỢNG CHUYÊN SÂU TỪ DATAFEED (ORCA QUANT INTELLIGENCE)\n\n${narrative}`;
  return { text, model: "Orca Dynamic Quant AI (Live Datafeed)" };
}

export async function synthesizeWithLlm(
  question: string,
  built: AgentBuilt,
  prefs: AgentPrefs,
  history: AgentHistoryTurn[],
  opts?: { forceBriefingFormat?: boolean },
): Promise<{ text: string; model: string } | null> {
  if (!llmConfigured()) {
    return synthesizeFromDatafeed(question, built, prefs, opts);
  }
  try {
    const lang = prefs.language === "en" ? "Anh" : "Việt";
    const depth = prefs.depth ?? "standard";
    const isDeep = depth === "deep" || Boolean(opts?.forceBriefingFormat);
    const isConcise = depth === "concise";

    const briefingRule = opts?.forceBriefingFormat
      ? `
BẮT BUỘC giữ đúng 4 phần (tiêu đề ##):
1. Biến động chỉ số & cổ phiếu dẫn dắt
2. Động thái khối ngoại
3. Thanh khoản & độ rộng thị trường
4. Tổng quan ngành & nguyên nhân vĩ mô
Chỉ làm mượt câu chữ / bổ sung liên kết logic từ CONTEXT; KHÔNG đổi cấu trúc, KHÔNG bịa số liệu.`
      : "";

    const marketRule = /thị trường|vn-?index|vn30|hose|hnx|upcom|khối ngoại|ngành dẫn dắt/i.test(question)
      ? `
NHÁNH THỊ TRƯỜNG — ưu tiên: trạng thái VN-Index/VN30/HNX/UPCoM, % và thanh khoản, breadth, leadership/ngành mạnh-yếu, flow (khối ngoại/tự doanh nếu có), macro/cross-asset, rủi ro cần theo dõi, kết luận ngắn. Không tự tạo market score hay xác suất. Nhắc timestamp khi có.`
      : "";

    const industryRule = /ngành|sector|banking|dầu khí|thép|công nghệ|bất động sản|bán lẻ/i.test(question)
      ? `
NHÁNH NGÀNH — phân tích toàn ngành trước (xu hướng/RS, breadth, thanh khoản, leadership/laggards); chỉ liên hệ từng mã khi CONTEXT chứng minh. Earnings, valuation, NIM/NPL, hàng hóa, macro, news chỉ nêu khi có dữ liệu; thiếu thì nói rõ. Không tự ranking mới.`
      : "";

    const stockRule = /phân tích|cổ phiếu|mã cổ phiếu|định giá|p\/e|p\/b|eps|so sánh|bctc|tài chính|sức khỏe|f-score|z-score|m-score|dupont|dòng tiền|\bFPT\b|\bCMG\b|\bGAS\b|\bHPG\b|\bVCB\b|\bVHM\b/i.test(question)
      ? `
NHÁNH CỔ PHIẾU & PHÂN TÍCH CƠ BẢN (CHUYÊN SÂU CFA):
1. Cấu trúc luận điểm phân tích cơ bản chuyên nghiệp:
   - Tổng quan doanh nghiệp & vị thế ngành: Biên an toàn, sức mạnh cạnh tranh (Moat).
   - Chất lượng tăng trưởng & Bóc tách DuPont: ROE, ROA, ROIC. Tách rõ ROE tăng do biên ròng, vòng quay tài sản hay đòn bẩy tài chính.
   - Sức khỏe thanh khoản & Vốn lưu động thuần (NWC): Current Ratio, Quick Ratio, Tỷ trọng VLĐT/Tổng TS, Số ngày trang trải chi phí (Defensive Interval).
   - Cơ cấu đòn bẩy & Rủi ro nợ: Nợ/VCSH, Tỷ lệ Nợ dài hạn/Nguồn vốn, Khả năng trả nợ gốc lãi bằng dòng tiền (EBITDA/Lãi vay).
   - Chu kỳ chuyển đổi tiền (Cash Conversion Cycle - CCC): Bóc tách số ngày tồn kho (DIO), phải thu (DSO), phải trả (DPO) xem có bị ứ đọng vốn không.
   - Kiểm định chất lượng BCTC & Cảnh báo rủi ro: Piotroski F-Score (thang điểm 9), Altman Z''-Score (vùng an toàn hay nguy hiểm), và bóc tách lợi nhuận cốt lõi (Core EBIT) vs thoái vốn một lần (Paper Profit).
   - Định giá tương đối & Bội số: P/E, P/B, EV/EBITDA, Dividend Yield so với tiềm năng doanh nghiệp.
2. Tuyệt đối bám sát các số liệu đã tính sẵn trong CONTEXT (Bộ chỉ số tài chính, F-Score, Altman-Z, BctcQuality). Diễn giải số liệu sắc sảo như một Giám đốc Nghiên cứu Phân tích (Head of Equity Research).`
      : "";

    const commodityRule = /vàng|gold|bạc|silver|dầu|oil|wti|brent|hrc|đồng|cà phê|robusta|arabica|hàng hóa|commodity/i.test(question)
      ? `
NHÁNH HÀNG HÓA — luôn nêu giá, đơn vị, currency, timestamp, timeframe, nguồn nếu có. Phân tích tác động theo chuỗi: COMMODITY → cơ chế truyền dẫn → INDUSTRY → DOANH NGHIỆP → STOCK; nêu độ trễ và rủi ro, không suy diễn mọi mã đều hưởng lợi.`
      : "";

    const depthRule =
      isDeep
        ? `
ĐỘ SÂU = DEEP: viết như research note đầy đủ khoảng 900–1.400 từ (hoặc tương đương 14–22 đoạn/ý).
Bắt buộc có: (1) mở đầu tóm tắt 3–5 câu, (2) từng khối phân tích với số liệu + diễn giải ý nghĩa, (3) liên hệ ngành/vĩ mô/cross-asset nếu CONTEXT có, (4) rủi ro & giả định, (5) kịch bản cần theo dõi, (6) kết luận mở (không đóng cứng mua/bán).
Ưu tiên phủ rộng dữ liệu quant có trong CONTEXT — không bỏ sót chỉ số then chốt.`
        : isConcise
          ? `
ĐỘ SÂU = CONCISE: 6–9 đoạn hoặc bullet có diễn giải, mỗi điểm chính kèm ít nhất một số liệu then chốt. Vẫn đủ để đọc hiểu bối cảnh, không chỉ 2–3 câu.`
          : `
ĐỘ SÂU = STANDARD (mặc định — trả lời ĐẦY ĐỦ, không rút gọn quá mức):
Viết khoảng 550–900 từ hoặc 12–18 đoạn/ý có liên kết logic.
Cấu trúc gợi ý (linh hoạt theo câu hỏi, không bắt buộc đánh số cứng):
1) Mở đầu: bức tranh tổng quan + 2–3 số liệu then chốt.
2) Thân bài: triển khai từng khía cạnh (giá/chỉ số, thanh khoản/độ rộng, dòng tiền, ngành/leadership, so sánh, tin/vĩ mô) — mỗi mục có số liệu + ý nghĩa.
3) Rủi ro / điểm cần theo dõi.
4) Kết luận mở, phục vụ nghiên cứu (không khuyến nghị mua/bán).
Bắt buộc tận dụng tối đa số liệu quant trong CONTEXT/NARRATIVE; thiếu phần nào thì nói rõ, không bỏ trống im lặng.`;

    const styleRule = `
BỘ QUY TẮC VĂN PHONG HUMANIZER (GIỐNG NGƯỜI THẬT 100%, XÓA SẠCH VĂN PHONG AI):
Bạn là Giám đốc Khối Phân tích Nghiên cứu Cổ phiếu (Head of Equity Research) hàng đầu tại Việt Nam.

1. NHỮNG TẬT XẤU CỦA AI CẦN XÓA BỎ TRIỆT ĐỂ (AI TELLS TO ELIMINATE):
- TUYỆT ĐỐI KHÔNG mở bài máy móc: "Dựa trên dữ liệu...", "Theo thông tin được cung cấp...", "Chào bạn, dưới đây là phân tích...". Hãy vào thẳng vấn đề ngay câu đầu tiên như một bản tin Bloomberg/Reuters.
- TUYỆT ĐỐI KHÔNG kết bài sáo rỗng: "Tóm lại, cổ phiếu này có cả cơ hội và thách thức...", "Nhà đầu tư nên cân nhắc kỹ trước khi quyết định...", "Hy vọng câu trả lời này hữu ích cho bạn...". Hãy thay bằng một kịch bản hành động hoặc ngưỡng theo dõi định lượng cụ thể.
- TUYỆT ĐỐI KHÔNG lạm dụng các từ AI dịch thô: "bức tranh tài chính", "bộ phim hấp dẫn", "ngọn hải đăng", "bản giao hưởng", "đầy hứa hẹn". Hãy dùng ngôn ngữ tài chính thực chiến: "biên an toàn", "áp lực thanh khoản", "chi phí vốn vay", "chu kỳ tồn kho", "vùng trũng định giá".

2. NGHỆ THUẬT VIẾT VĂN PHÂN TÍCH TÀI CHÍNH CÓ HỒN:
- Chuyển tiếp tự nhiên giữa các ý: "Đáng chú ý là...", "Điểm then chốt nằm ở chỗ...", "Trái ngược với vẻ ngoài hào nhoáng của doanh thu...", "Tuy nhiên, rủi ro tiềm ẩn lại xuất hiện tại...".
- Mỗi con số PHẢI GẮN VỚI MỘT CÂU CHUYỆN KINH DOANH: Đừng chỉ viết "Nợ/VCSH là 1.2x". Hãy viết "Tỷ số Nợ/VCSH leo lên mức 1.2x cho thấy ban lãnh đạo đang chấp nhận sử dụng đòn bẩy cao để tài trợ cho dự án mới, khiến gánh nặng lãi vay tăng thêm 45 tỷ mỗi quý".
- Luôn liên kết chuỗi nhân quả: VĨ MÔ/HÀNG HÓA -> NGÀNH -> BCTC -> CỔ PHIẾU.

3. VÍ DỤ PHONG CÁCH MẪU CHUẨN CFA (FEW-SHOT EXAMPLES):
Mẫu 1 - Bóc tách BCTC & Nhận diện Bẫy Lợi Nhuận:
"Nhìn vào kết quả kinh doanh quý vừa qua, con số lợi nhuận sau thuế tăng trưởng +45% YoY (đạt 520 tỷ đồng) thoạt nhìn rất ấn tượng đối với số đông nhà đầu tư. Tuy nhiên, bóc tách kỹ 4 bảng tài chính sẽ thấy chất lượng lợi nhuận đang gióng lên hồi chuông cảnh báo. Cụ thể, lợi nhuận từ hoạt động kinh doanh cốt lõi (Core EBIT) thực chất giảm -18%, phần lớn khoản lãi đột biến đến từ việc thanh lý tài sản và đánh giá lại khoản đầu tư tài chính. Đáng lo ngại hơn, dòng tiền thuần từ kinh doanh (CFO) âm kỷ lục hơn 380 tỷ đồng do khoản 'Phải thu ngắn hạn khác' phình to bất thường, chiếm tới 42% tổng tài sản. Đây là dấu hiệu rõ ràng cho thấy doanh nghiệp đang bán hàng trên giấy và bị đối tác chiếm dụng vốn nặng nề."

Mẫu 2 - Đánh giá Đòn bẩy & Rủi ro Lãi suất Vĩ mô:
"Trong bối cảnh Ngân hàng Nhà nước duy trì mặt bằng lãi suất liên ngân hàng thấp kỷ lục, cơ cấu vốn của doanh nghiệp lại đang bộc lộ điểm yếu ở các khoản nợ vay ngắn hạn sát ngày đáo hạn. Với tỷ lệ Nợ vay/VCSH ở mức 1.45x (cao hơn đáng kể so với mức bình quân ngành 0.8x), tỷ lệ bảo đảm nợ gốc và lãi bằng tiền (EBITDA/Lãi vay) đã tụt từ 4.2x xuống còn 1.6x. Mặc dù thời gian trang trải chi phí (Defensive Interval) vẫn cầm cự được khoảng 75 ngày, nhưng nếu tiến độ bán hàng dự án tiếp tục đình trệ trong 2 quý tới, áp lực tái cấp vốn sẽ trở thành rủi ro lớn nhất đe dọa trực tiếp đến thị giá cổ phiếu."`;

    const executiveStructureRule = `
BẮT BUỘC TRÌNH BÀY THEO BỘ KHUNG 5 LỚP PHẢN HỒI CHUẨN (CHUẨN 100 KỊCH BẢN TÀI CHÍNH VIỆT NAM):

> 🎯 **LỚP 1 - TRẢ LỜI TRỌNG TÂM (BLUF):**
> [Trả lời dứt khoát 1-2 câu trực diện vào câu hỏi của người dùng. Nêu rõ kết luận cốt lõi, bản chất vấn đề và đáp số chính. Đặt toàn bộ trong blockquote callout '> '].

### 📊 LỚP 2 - GIẢI THÍCH & SỐ LIỆU MINH BẠCH (FACTS & BENCHMARKS)
- Trình bày số liệu bắt buộc có đơn vị rõ ràng (tỷ VNĐ, VNĐ/cp, %), kèm nguồn và ngày cập nhật.
- Phân biệt rõ ràng giữa số thực tế đã diễn ra (Fact) và số ước tính/dự báo (F).
- Nếu thiếu dữ liệu: ghi rõ "[Chưa tìm thấy – cần xác minh]", TUYỆT ĐỐI KHÔNG BỊA SỐ.
- Sử dụng bảng Markdown đối soát chỉ số: F-Score, Altman-Z, ROE, P/E, P/B, CFO/LNST, D/E hoặc ma trận so sánh.
- Khi người dùng hỏi phân tích toàn diện một mã cổ phiếu: Bắt buộc trình bày bảng tóm tắt chuẩn Phụ lục B (Nhận diện, Doanh nghiệp, Kết quả kinh doanh, Sức khỏe tài chính, Định giá, Kỹ thuật, Dự phóng, Rủi ro & mốc theo dõi).

### 💡 LỚP 3 - VÍ DỤ MINH HỌA THỰC CHIẾN (GẦN GŨI VỚI NĐT CÁ NHÂN)
(Đưa ra 1 ví dụ số cụ thể, gần gũi với nhà đầu tư cá nhân Việt Nam: ví dụ vốn 50-100 triệu, lệnh mua 1.000 cp, tính toán biến động lãi lỗ, cổ tức thực nhận hoặc chi phí vốn).

### ⚠️ LỚP 4 - LƯU Ý RỦI RO & BẪY ĐỊNH LƯỢNG
(Cảnh báo rủi ro tương ứng mức độ nhạy cảm của câu hỏi: bẫy P/E đỉnh chu kỳ, bẫy nợ vay, rủi ro T+2.5 kẹt sàn, bẫy lợi nhuận giấy, bẫy margin, bẫy tin đồn).

### 🧭 LỚP 5 - GỢI Ý BƯỚC TIẾP THEO HOẶC CÂU HỎI NGƯỢC CÁ NHÂN HÓA
(Gợi ý 1-2 bước thực thi tiếp theo hoặc đặt DUY NHẤT 1 câu hỏi ngược về vốn/mục tiêu để hỗ trợ cá nhân hóa vị thế).

TUYÊN BỐ MIỄN TRỪ BẮT BUỘC Ở CUỐI:
> ⚠️ **Tuyên bố miễn trừ trách nhiệm:** Phân tích này chỉ mang tính tham khảo, không phải khuyến nghị đầu tư. Mọi quyết định đầu tư cần được cân nhắc kỹ lưỡng với cố vấn tài chính.`;

    const system = `Bạn là ORCA FA Copilot — Chuyên viên Cấp cao Phân tích Cơ bản Cổ phiếu (Senior Equity Research Analyst) của nền tảng ORCA-FA.
Chuyên môn trọng tâm của bạn là phân tích báo cáo tài chính, chất lượng lợi nhuận, cấu trúc vốn, chu kỳ tiền mặt, định giá DCF/Multiples và đánh giá rủi ro doanh nghiệp niêm yết tại Việt Nam.
Chỉ được dùng số liệu trong CONTEXT JSON và NARRATIVE đã tính sẵn từ hệ thống (Cổ phiếu VN, BCTC 3 sàn, Kinh tế vĩ mô, Lãi suất, Hàng hóa liên thông).
KHÔNG bịa số, KHÔNG bịa nguồn. Nếu thiếu dữ liệu, nói rõ.
Chỉ được dùng số liệu trong CONTEXT/NARRATIVE và các đoạn TÀI LIỆU TRUY XUẤT; khi dùng tài liệu hãy ghi chú [n].
Trả lời bằng tiếng ${lang}.
Mục tiêu: câu trả lời ĐẦY ĐỦ, chuyên sâu chuẩn CFA, sắc bén về tài chính kế toán, giàu thông tin quant — không lược bỏ các số liệu then chốt có trong CONTEXT.
${executiveStructureRule}
${styleRule}
${depthRule}
${briefingRule}${marketRule}${industryRule}${stockRule}${commodityRule}`;

    // Phase A & 3 RAG: guides + news + official signed disclosures + research reports + db chunks
    let ragBlock = "(Không có đoạn tài liệu bổ sung.)";
    try {
      let branch: RagBranch = "general";
      if (/thị trường|vn-?index|vn30|khối ngoại|hose|hnx/i.test(question)) branch = "market";
      else if (/ngành|sector|banking|dầu khí|thép|bất động sản/i.test(question)) branch = "industry";
      else if (/vàng|gold|dầu|oil|hàng hóa|commodity|cà phê/i.test(question)) branch = "commodity";
      else if (/cổ phiếu|mã |p\/e|p\/b|định giá|phân tích|bctc|thuyết minh|kiểm toán|nghị quyết|đhđcđ/i.test(question)) branch = "stock";
      const rag = await retrieveRag({
        question,
        symbols: built.symbols ?? [],
        branch,
        topK: isDeep ? 10 : isConcise ? 5 : 8,
        includeDisclosures: true,
      });
      ragBlock = formatPassagesForPrompt(rag.passages);
    } catch {
      /* RAG best-effort */
    }

    // Ingest live quantitative datafeed from the built in-house FastDatafeedHub
    let fastFeedGrounding = "";
    try {
      const fastFeed = await buildFastDatafeedContext(question);
      if (fastFeed?.assembledPromptContext) {
        fastFeedGrounding = `\n\nDATAFEED ĐỊNH LƯỢNG THỜI GIAN THỰC TỪ ORCA QUANT HUB:\n${fastFeed.assembledPromptContext}`;
      }
    } catch {
      /* best-effort */
    }

    const user = `CÂU HỎI: ${question}

NARRATIVE HỆ THỐNG & DATAFEED NỘI BỘ (ưu tiên bám sát — triển khai đầy đủ, không tóm tắt quá mức):
${built.narrative.slice(0, 16_000)}${fastFeedGrounding}

CONTEXT JSON (rút gọn nhưng đủ rộng):
${JSON.stringify(built.contract).slice(0, 18_000)}

TÀI LIỆU TRUY XUẤT (guides/news/notes — chỉ dùng kèm CONTEXT; ghi [n] khi trích):
${ragBlock}

YÊU CẦU ĐẦU RA:
- Viết phân tích chuyên sâu, dài và đủ ý theo ĐỘ SÂU đã chỉ định.
- Tận dụng tối đa số liệu quant trong NARRATIVE/CONTEXT/DATAFEED (giá, %, thanh khoản, breadth, flow, valuation, v.v. nếu có).
- Mỗi khối chính có diễn giải — không chỉ liệt kê.
- Giọng research analyst tự nhiên, tiếng ${lang}.`;

    const maxTokens = isDeep ? 3600 : isConcise ? 1400 : 2800;
    const temperature =
      opts?.forceBriefingFormat ? 0.18 :
      isConcise ? 0.22 :
      prefs.style === "analyst" || isDeep ? 0.45 :
      0.35;
    const timeoutMs = isDeep ? 32_000 : isConcise ? 22_000 : 28_000;

    const r = await llmChat("analysis", {
      system,
      user,
      temperature,
      maxTokens,
      topP: isDeep ? 0.9 : 0.92,
      timeoutMs,
      history: history.slice(-8).map((h) => ({
        role: h.role === "assistant" || h.role === "agent" ? ("assistant" as const) : ("user" as const),
        content: h.content,
      })),
    });
    if (!r?.text?.trim()) return synthesizeFromDatafeed(question, built, prefs, opts);
    return { text: r.text.trim(), model: r.model };
  } catch {
    return synthesizeFromDatafeed(question, built, prefs, opts);
  }
}
