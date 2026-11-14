/**
 * VIETNAMESE EQUITY FUNDAMENTAL ANALYSIS (FA) KNOWLEDGE BASE
 * Chuẩn mực phân tích báo cáo tài chính & Benchmark ngành TTCK Việt Nam.
 * Được tích hợp trực tiếp vào RAG Engine phục vụ ORCA FA Copilot.
 */

import "server-only";
import type { RagPassage } from "./types";
import { lexicalScore, tokenizeQuery } from "./chunk";

export interface FaKnowledgeDoc {
  id: string;
  category: "vas_accounting" | "industry_benchmark" | "financial_trap" | "cfa_framework";
  title: string;
  summary: string;
  content: string;
  keywords: string[];
}

export const FA_KNOWLEDGE_BASE: FaKnowledgeDoc[] = [
  // 1. CHUẨN MỰC KẾ TOÁN VAS & PHÂN TÍCH ĐẶC THÙ VN
  {
    id: "fa-vas-real-estate-accounting",
    category: "vas_accounting",
    title: "Quy tắc hạch toán Doanh thu Bất động sản theo Thông tư 200/BTC tại Việt Nam",
    summary: "BĐS tại VN không được ghi nhận doanh thu theo tiến độ xây dựng mà chỉ ghi nhận khi bàn giao nhà.",
    content: `Theo Chuẩn mực Kế toán Việt Nam (VAS) và Thông tư 200/2014/TT-BTC:
1. Ghi nhận doanh thu BĐS: Doanh nghiệp CHỈ ĐƯỢC ghi nhận doanh thu và giá vốn khi đã bàn giao nhà/sản phẩm thực tế cho người mua (hoàn tất chuyển giao phần lớn rủi ro và lợi ích).
2. Khoản tiền khách hàng nộp theo tiến độ: BẮT BUỘC hạch toán vào 'Người mua trả tiền trước ngắn hạn' (Mã số 312 trên Bảng CĐKT) hoặc 'Doanh thu chưa thực hiện'. Đây KHÔNG PHẢI là nợ vay phải trả lãi mà là 'CỦ ĐỂ DÀNH' bảo đảm doanh thu và lợi nhuận tương lai khi bàn giao.
3. Rủi ro trọng yếu: Nếu khoản 'Người mua trả tiền trước' sụt giảm liên tục qua nhiều quý chứng tỏ doanh nghiệp bán hàng chậm lại, tiến độ bán mới bị tắc nghẽn.`,
    keywords: ["bất động sản", "người mua trả tiền trước", "thông tư 200", "bàn giao", "backlog", "doanh thu chưa thực hiện", "vhm", "nvl", "kdh", "nlg"],
  },
  {
    id: "fa-vas-banking-circular-11",
    category: "vas_accounting",
    title: "Quy định Phân loại nợ & Trích lập dự phòng rủi ro Ngân hàng theo Thông tư 11/2021/TT-NHNN",
    summary: "Cơ chế phân loại 5 nhóm nợ và tác động của chi phí dự phòng rủi ro tín dụng lên lợi nhuận ngân hàng.",
    content: `Theo Thông tư 11/2021/TT-NHNN của Ngân hàng Nhà nước Việt Nam:
1. Phân loại 5 nhóm nợ: Nhóm 1 (Đủ tiêu chuẩn), Nhóm 2 (Cần chú ý - quá hạn 10-90 ngày), Nhóm 3 (Dưới tiêu chuẩn - quá hạn 91-180 ngày), Nhóm 4 (Nghi ngờ - quá hạn 181-360 ngày), Nhóm 5 (Có khả năng mất vốn - quá hạn >360 ngày). Nợ xấu (NPL) được tính từ nhóm 3 đến nhóm 5.
2. Tỷ lệ trích lập dự phòng cụ thể: Nhóm 1 (0%), Nhóm 2 (5%), Nhóm 3 (20%), Nhóm 4 (50%), Nhóm 5 (100%).
3. Tỷ lệ bao phủ nợ xấu (LLR = Quỹ dự phòng / Nợ xấu): Các ngân hàng top đầu (VCB, CTG, BID, MBB) thường duy trì LLR > 120% - 200% để có 'bộ đệm' chống sốc nợ xấu và có thể hoàn nhập dự phòng tạo lợi nhuận đột biến trong tương lai.
4. Tỷ lệ CASA (Tiền gửi không kỳ hạn): Giúp ngân hàng hạ thấp chi phí vốn (CoF). CASA cao (>35% như TCB, MBB) giúp duy trì biên lãi ròng NIM vượt trội ngay cả khi lãi suất liên ngân hàng tăng.`,
    keywords: ["ngân hàng", "nợ xấu", "npl", "thông tư 11", "dự phòng", "llr", "casa", "nim", "vcb", "mbb", "tcb", "ctg", "bid"],
  },
  {
    id: "fa-vas-interest-capitalization",
    category: "vas_accounting",
    title: "Kế toán Chi phí Lãi vay vốn hóa vào Tài sản dở dang theo VAS 16",
    summary: "Dấu hiệu nhận biết lãi vay không phản ánh vào Báo cáo KQKD mà bị vốn hóa vào tài sản.",
    content: `Theo VAS 16 - Chi phí đi vay:
1. Vốn hóa lãi vay: Chi phí lãi phát sinh trực tiếp từ các khoản vay phục vụ đầu tư xây dựng tài sản dở dang (ví dụ: nhà máy đang xây, dự án BĐS đang thi công) được phép CỘNG THẲNG vào nguyên giá tài sản dở dang, KHÔNG hạch toán vào 'Chi phí tài chính' trong kỳ.
2. Ẩn họa lợi nhuận ảo: Doanh nghiệp đang vay nợ rất lớn nhưng trên Báo cáo KQKD chi phí lãi vay lại rất thấp, làm lợi nhuận trước thuế nhìn có vẻ khả quan.
3. Điểm bùng nổ rủi ro: Khi dự án hoàn thành bàn giao hoặc bị đình trệ kéo dài, toàn bộ lãi vay không được vốn hóa nữa mà sẽ dội ngược lại Báo cáo KQKD, bào mòn ngay lập tức biên lợi nhuận của doanh nghiệp.`,
    keywords: ["vốn hóa lãi vay", "chi phí đi vay", "vas 16", "xây dựng dở dang", "lãi vay", "nợ vay"],
  },

  // 2. BENCHMARK TRUNG BÌNH NGÀNH TẠI THỊ TRƯỜNG CHỨNG KHOÁN VIỆT NAM
  {
    id: "fa-benchmark-banking",
    category: "industry_benchmark",
    title: "Bộ Benchmark Chỉ Số Trung Bình Ngành Ngân Hàng Việt Nam (5 năm gần nhất)",
    summary: "Các ngưỡng tham chiếu an toàn và trung bình ngành của nhóm Ngân hàng trên sàn HOSE/HNX.",
    content: `Benchmark chuẩn ngành Ngân hàng Việt Nam:
- NIM (Biên lãi ròng): Trung bình ngành đạt 3.4% - 3.8%. Nhóm ngân hàng bán lẻ/CASA cao (TCB, MBB, ACB) đạt 4.0% - 4.8%. Dưới 3.0% là biên lãi yếu.
- NPL (Tỷ lệ nợ xấu): Ngưỡng trần quy định của NHNN là 3.0%. Các ngân hàng quản trị rủi ro tốt duy trì NPL < 1.6%.
- LLR (Tỷ lệ bao phủ nợ xấu): Trung bình ngành ~90% - 110%. Vượt trội khi LLR > 150% (VCB có thời điểm đạt >250%).
- CASA (Tiền gửi không kỳ hạn): Trung bình ngành ~20% - 25%. Dẫn đầu thị trường là MBB và TCB (>35% - 42%).
- CIR (Chi phí / Thu nhập hoạt động): Ngưỡng tốt là < 35%. Trung bình ngành dao động từ 33% - 42%.
- ROE: Trung bình ngành đạt 16% - 22%. Ngân hàng có hiệu quả vốn hàng đầu đạt ROE > 22%.
- Định giá P/B lịch sử: Vùng đáy định giá P/B ~ 1.0x - 1.1x. Trung bình chu kỳ ~ 1.4x - 1.6x. Vùng đắt > 2.0x (ngoại trừ VCB thường được định giá cao quanh 2.2x - 3.0x do vị thế quốc doanh đầu ngành).`,
    keywords: ["benchmark ngân hàng", "nim trung bình", "npl trung bình", "pb ngân hàng", "roe ngân hàng", "casa"],
  },
  {
    id: "fa-benchmark-real-estate",
    category: "industry_benchmark",
    title: "Bộ Benchmark Chỉ Số Trung Bình Ngành Bất Động Sản Dân Cư Việt Nam",
    summary: "Các ngưỡng tham chiếu an toàn về đòn bẩy và quỹ đất của nhóm doanh nghiệp BĐS trên sàn chứng khoán.",
    content: `Benchmark chuẩn ngành Bất động sản Dân cư Việt Nam:
- D/E (Nợ vay ròng / VCSH): Ngưỡng an toàn là < 0.6x. Trung bình ngành khoảng 0.8x - 1.2x. Ngưỡng cảnh báo rủi ro đòn bẩy khi D/E > 1.5x - 2.0x.
- Tỷ trọng Hàng tồn kho / Tổng tài sản: Dao động từ 40% - 60%. Nếu > 70% mà không có người mua trả tiền trước đối ứng thì đối mặt rủi ro chôn vốn nặng nề.
- Người mua trả tiền trước / Nợ vay chịu lãi: Tỷ lệ lành mạnh khi > 0.8x (doanh nghiệp lấy tiền từ khách hàng để tài trợ dự án thay vì vay ngân hàng).
- Biên lợi nhuận gộp: Dự án cao cấp/quỹ đất giá rẻ đạt 40% - 55% (VHM, KDH). Trung bình ngành đạt 28% - 35%. Dự án vướng pháp lý hoặc đền bù giá cao biên gộp rơi xuống < 20%.
- Định giá P/B: P/B < 1.0x thường phản ánh thị trường chiết khấu rủi ro pháp lý dự án hoặc cấu trúc nợ trái phiếu. P/B trung bình ngành khoảng 1.2x - 1.8x. Định giá RNAV quỹ đất là phương pháp chuẩn xác nhất.`,
    keywords: ["benchmark bất động sản", "d/e bất động sản", "tồn kho bất động sản", "người mua trả tiền trước", "rnav", "pb bđs"],
  },
  {
    id: "fa-benchmark-steel-materials",
    category: "industry_benchmark",
    title: "Bộ Benchmark Chu Kỳ Ngành Thép & Vật Liệu Xây Dựng Việt Nam",
    summary: "Đặc tính chu kỳ giá hàng hóa HRC/Quặng sắt và biên lợi nhuận nhóm ngành Thép (HPG, HSG, NKG).",
    content: `Đặc tính chu kỳ & Benchmark ngành Thép (HPG, HSG, NKG):
- Độ nhạy với giá nguyên liệu: HPG phụ thuộc giá Quặng sắt (Iron Ore) và Than mỡ (Coking Coal). HSG, NKG phụ thuộc vào giá Thép cuộn cán nóng (HRC).
- Biên lợi nhuận gộp theo chu kỳ:
  + Vùng đáy chu kỳ (khi giá thép giảm mạnh, trích lập giảm giá tồn kho): Biên gộp tụt dốc về 3% - 6% (thậm chí âm ngắn hạn).
  + Vùng trung bình chu kỳ: 10% - 14%.
  + Vùng đỉnh chu kỳ (giá thép tăng dựng đứng, tồn kho giá rẻ): Biên gộp vượt 20% - 25%.
- Số ngày tồn kho (DIO): Chu kỳ tích trữ tồn kho bình quân từ 90 - 120 ngày. Khi DIO tăng vọt trong bối cảnh giá HRC thế giới giảm, doanh nghiệp đối mặt nguy cơ trích lập dự phòng giảm giá hàng tồn kho rất lớn trong quý kế tiếp.
- Đòn bẩy D/E: Doanh nghiệp thép sản xuất quy mô lớn (lò cao BOF) cần duy trì D/E < 0.8x để vượt qua mùa đông suy thoái chu kỳ giá hàng hóa.`,
    keywords: ["benchmark thép", "hpg", "hsg", "nkg", "hrc", "quặng sắt", "biên gộp thép", "chu kỳ ngành thép"],
  },

  // 3. NHẬN DIỆN "BẪY BÁO CÁO TÀI CHÍNH" (FINANCIAL RED FLAGS TRAPS)
  {
    id: "fa-traps-fictitious-capital",
    category: "financial_trap",
    title: "Nhận diện Dấu Hiệu 'Tăng Vốn Ảo' & Rút Ruột Doanh Nghiệp Trên TTCK Việt Nam",
    summary: "Các chiêu trò phát hành cổ phiếu tăng vốn nhưng tiền chạy lòng vòng qua các khoản phải thu khác.",
    content: `Chiêu trò 'Tăng vốn ảo' (Fictitious Capitalization):
1. Cơ chế thực hiện: Doanh nghiệp phát hành cổ phiếu cho cổ đông chiến lược/nội bộ để tăng vốn điều lệ gấp nhiều lần. Sau khi nhận tiền nộp vào tài khoản ngân hàng, ngay lập tức doanh nghiệp dùng số tiền đó ký các hợp đồng 'Ủy thác đầu tư', 'Tạm ứng', 'Đặt cọc hợp tác kinh doanh' với các công ty sân sau.
2. Dấu hiệu nhận diện trên BCTC:
   - Khoản 'Phải thu ngắn hạn/dài hạn khác' (Mã số 136, 216) phình to bất thường, chiếm > 50% - 70% Tổng tài sản.
   - Thuyết minh BCTC ghi mập mờ: 'Hợp tác kinh doanh với đối tác X', 'Tạm ứng cho nhân viên công ty', 'Ủy thác đầu tư không có tài sản bảo đảm'.
   - Lợi nhuận BCTC có thể vẫn tăng nhẹ nhưng Dòng tiền thuần từ kinh doanh (CFO) âm triền miên năm này qua năm khác.
3. Hậu quả cho cổ đông: Số lượng cổ phiếu lưu hành tăng vọt làm pha loãng EPS nghiêm trọng, tài sản thực chất chỉ là giấy nợ khó đòi.`,
    keywords: ["tăng vốn ảo", "ủy thác đầu tư", "phải thu khác", "rút ruột", "dấu hiệu gian lận", "bẫy bctc", "m-score"],
  },
  {
    id: "fa-traps-paper-profits",
    category: "financial_trap",
    title: "Bẫy 'Thoát Lỗ Trên Giấy' Nhờ Bán Tài Sản Hoặc Doanh Thu Tài Chính Một Lần",
    summary: "Phân biệt lợi nhuận hoạt động kinh doanh cốt lõi (Core EBIT) với các khoản lợi nhuận đột biến một lần.",
    content: `Bẫy 'Thoát lỗ trên giấy' (Paper Profits / One-off Gains):
1. Cơ chế: Hoạt động kinh doanh chính (Core business) thua lỗ nặng (Lợi nhuận gộp không đủ bù đắp chi phí bán hàng và QLDN), nhưng vào quý cuối năm, doanh nghiệp bán công ty con, chuyển nhượng dự án hoặc đánh giá lại giá trị khoản đầu tư để ghi nhận 'Doanh thu tài chính' hoặc 'Thu nhập khác'.
2. Dấu hiệu nhận diện:
   - Tỷ số Lợi nhuận cốt lõi / LNST < 30%, phần lớn lợi nhuận đến từ 'Doanh thu hoạt động tài chính' (Mã số 21) hoặc 'Lợi nhuận khác' (Mã số 40).
   - Dòng tiền từ kinh doanh (CFO) âm nặng, trong khi dòng tiền đầu tư dương đột biến nhờ thanh lý tài sản.
3. Đánh giá chất lượng: Đây là lợi nhuận 'một lần' không có tính lặp lại (Non-recurring). P/E tính trên EPS này sẽ bị sai lệch hoàn toàn (P/E nhìn có vẻ rất rẻ nhưng thực chất doanh nghiệp đang suy thoái nghiêm trọng).`,
    keywords: ["thoát lỗ trên giấy", "lợi nhuận cốt lõi", "doanh thu tài chính", "thu nhập khác", "bán tài sản", "chất lượng lợi nhuận"],
  },
  {
    id: "fa-traps-value-trap-contradiction",
    category: "financial_trap",
    title: "Phát hiện Mâu thuẫn Báo cáo Tài chính & Bẫy Giá Trị (Value Trap Detection)",
    summary: "Kỹ thuật nhận diện bẫy giá trị khi P/E, P/B rất rẻ nhưng F-Score thấp, Altman-Z nguy hiểm hoặc dòng tiền CFO âm nặng.",
    content: `Cơ chế nhận diện Bẫy Giá Trị (Value Trap) & Mâu Thuẫn Số Liệu:
1. Hiện tượng P/E siêu rẻ ảo tưởng (P/E < 5x - 7x):
   - Xảy ra khi lợi nhuận đạt đỉnh chu kỳ (Cyclical Peak) hoặc do ghi nhận doanh thu bất thường một lần. Khi chu kỳ đảo chiều, E (Earnings) sẽ sụt giảm 70% - 90%, đẩy P/E thực tế vọt lên rất đắt.
   - Luôn kiểm tra: Lợi nhuận tăng trưởng có đi kèm dòng tiền kinh doanh (CFO > 0) hay không? Nếu CFO < 0 liên tục trong 2 - 3 quý, lợi nhuận chỉ là hạch toán trên sổ sách.
2. Mâu thuẫn giữa Định giá vs Piotroski F-Score / Altman Z''-Score:
   - Nếu P/E rẻ nhưng F-Score <= 3/9 điểm: Doanh nghiệp đang suy yếu toàn diện về biên lợi nhuận, thanh khoản và hiệu quả sử dụng tài sản. Đây là bẫy giá trị điển hình.
   - Nếu P/B < 0.8x nhưng Altman Z''-Score < 1.1 (Distress Zone): Doanh nghiệp đang đối mặt nguy cơ mất khả năng thanh toán nợ đến hạn, giá trị sổ sách (Book Value) có nguy cơ bị xóa sổ khi phải trích lập dự phòng tài sản xấu.
3. Nguyên tắc xử lý của Chuyên viên CFA:
   - Tuyệt đối không khuyến nghị mua dựa trên bội số định giá đơn lẻ.
   - Bắt buộc đối chiếu 3 góc nhìn: Lợi nhuận kế toán (P/E, ROE) vs Dòng tiền thực tế (CFO, FCF) vs Cơ cấu an toàn vốn (Z-Score, D/E).`,
    keywords: ["bẫy giá trị", "value trap", "pe rẻ", "f-score thấp", "altman z nguy hiểm", "cfo âm", "mâu thuẫn số liệu", "đảo chiều chu kỳ"],
  },
];

/**
 * Tìm kiếm các tài liệu nghiệp vụ FA và benchmark phù hợp với câu hỏi
 */
export function queryFaKnowledgeBase(question: string, symbols: string[] = [], topK = 3): RagPassage[] {
  const tokens = tokenizeQuery(question);
  const symTokens = symbols.map((s) => s.toLowerCase());

  const scored: { doc: FaKnowledgeDoc; score: number }[] = [];

  for (const doc of FA_KNOWLEDGE_BASE) {
    let score = lexicalScore(`${doc.title}\n${doc.summary}\n${doc.content}`, tokens);
    // Cộng điểm thưởng nếu khớp từ khóa chuyên ngành hoặc mã cổ phiếu
    for (const kw of doc.keywords) {
      if (tokens.some((t) => kw.includes(t)) || symTokens.some((s) => kw.includes(s))) {
        score += 0.25;
      }
    }
    if (score > 0.08) {
      scored.push({ doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(({ doc, score }) => ({
    id: `fa-kb-${doc.id}`,
    source: "note",
    title: `[Chuẩn Mực Phân Tích FA & Benchmark] ${doc.title}`,
    content: `${doc.summary}\n\n${doc.content}`,
    score,
    sourceTs: "2024-VAS-CFA-Standard",
    url: null,
  }));
}
