import { ok, badRequest } from "@/lib/envelope";
import { llmChat, llmConfigured } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface SnapshotFacts {
  period?: string;
  netIncome?: number;
  totalNetIncome?: number;
  grossIncome?: number;
  totalGrossSalary?: number;
  totalExpenses?: number;
  fixedExpenses?: number;
  variableExpenses?: number;
  monthlySavings?: number;
  savingsRate?: number;
  fixedCostRatio?: number;
  emergencyFundMonths?: number;
  totalDebt?: number;
  netWorth?: number;
  healthScore?: number;
  healthRating?: string;
  location?: string;
  lifeStage?: string;
  primaryPriority?: string;
  dependents?: number;
  debtsList?: Array<{ name?: string; category?: string; balance?: number; interestRate?: number; minMonthlyPayment?: number }>;
  expensesList?: Array<{ name?: string; category?: string; amount?: number; isFixed?: boolean }>;
  goalsList?: Array<{ name?: string; targetAmount?: number; accumulatedAmount?: number; deadline?: string; status?: string }>;
}

function formatVnd(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "0 ₫";
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

/** Trích xuất số tiền từ văn bản câu hỏi (hỗ trợ triệu, tỷ, k/nghìn) */
function extractAmountFromText(text: string): number | null {
  const matchTy = text.match(/(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty\b)/i);
  if (matchTy) {
    const val = parseFloat(matchTy[1].replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 1_000_000_000);
  }
  const matchTrieu = text.match(/(\d+(?:[.,]\d+)?)\s*(?:triệu|trieu|tr\b)/i);
  if (matchTrieu) {
    const val = parseFloat(matchTrieu[1].replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 1_000_000);
  }
  const matchK = text.match(/(\d+(?:[.,]\d+)?)\s*(?:k\b|nghìn|nghin)/i);
  if (matchK) {
    const val = parseFloat(matchK[1].replace(",", "."));
    if (!isNaN(val) && val > 0) return Math.round(val * 1_000);
  }
  return null;
}

/**
 * BỘ TƯ DUY TÀI CHÍNH THÍCH ỨNG LINH HOẠT (Adaptive Financial Reasoning Engine)
 * Kết hợp tri thức từ SFT dataset chuẩn với khả năng biến thiên linh hoạt theo ngữ cảnh thực tế của người dùng:
 * - Đa kịch bản (Scenario-based planning)
 * - Thấu hiểu khó khăn đời thực tại Việt Nam (tiền trọ, chi tiêu sinh hoạt, lỡ tiêu lố, tâm lý mua sắm)
 * - Tự động nhận diện các con số tùy biến trong câu hỏi
 */
function generateAdaptiveAnswer(q: string, facts?: SnapshotFacts): string {
  const query = q.toLowerCase();
  const net = facts?.netIncome ?? facts?.totalNetIncome ?? 0;
  const exp = facts?.totalExpenses ?? 0;
  const fixed = facts?.fixedExpenses ?? 0;
  const variable = facts?.variableExpenses ?? (exp - fixed > 0 ? exp - fixed : 0);
  const savings = facts?.monthlySavings ?? (net - exp > 0 ? net - exp : 0);
  const emergencyMonths = facts?.emergencyFundMonths ?? (exp > 0 ? Number(((savings * 3) / exp).toFixed(1)) : 0);
  const debts = facts?.debtsList ?? [];
  const totalDebt = facts?.totalDebt ?? debts.reduce((s, d) => s + (d.balance ?? 0), 0);
  const goals = facts?.goalsList ?? [];
  const location = facts?.location || "Khu vực đô thị lớn (TP.HCM / Hà Nội)";
  const lifeStage = facts?.lifeStage || "Đang tích lũy phát triển";
  const dependents = facts?.dependents ?? 0;

  const parsedAmount = extractAmountFromText(q);

  // 1. Phân bổ lương 50/30/20 & Biến thể linh hoạt cho hoàn cảnh thực tế
  if (query.includes("50/30/20") || query.includes("50-30-20") || query.includes("chia lương") || (query.includes("lương") && query.includes("chia"))) {
    const needStandard = Math.round(net * 0.5);
    const wantStandard = Math.round(net * 0.3);
    const savStandard = Math.round(net * 0.2);

    const isHighRent = fixed > needStandard;
    const rentExcess = fixed - needStandard;

    if (isHighRent) {
      // Biến thể thực tế cho người sống ở đô thị đắt đỏ: Công thức 60/25/15
      const needAlt = Math.round(net * 0.6);
      const wantAlt = Math.round(net * 0.25);
      const savAlt = Math.round(net * 0.15);

      return `Chào cậu nhen! 🐳 Nhìn vào bảng sổ tài chính thực tế, Bé Orca nhận thấy tiền chi cố định của cậu (${formatVnd(fixed)}) đang chiếm ${(net > 0 ? Math.round((fixed / net) * 100) : 0)}% lương net (${formatVnd(net)}), tức cao hơn mức trần 50% chuẩn khoảng ${formatVnd(rentExcess)}. 

Điều này rất phổ biến ở các đô thị lớn như ${location} do giá thuê nhà và sinh hoạt phí tăng cao. Vì vậy, thay vì ép bản thân vào chuẩn 50/30/20 cứng nhắc, Bé Orca đề xuất cho cậu 2 kịch bản phân bổ linh hoạt:

📊 **KỊCH BẢN A: CÂN BẰNG THỰC TẾ (Công thức 60 / 25 / 15 — Khuyên dùng)**
• 🏠 Thiết yếu (60%): **${formatVnd(needAlt)}** — Vừa vặn bao bọc khoản chi cố định ${formatVnd(fixed)} và ăn uống cơ bản mà không gây căng thẳng.
• ☕ Chi tiêu linh hoạt (25%): **${formatVnd(wantAlt)}** — Dành cho giao lưu, cà phê, sở thích cá nhân và chăm sóc sức khỏe tinh thần.
• 🐷 Tích lũy tự động (15%): **${formatVnd(savAlt)}** — Trích ngay ngày có lương vào tài khoản tiết kiệm online để tích lũy an toàn.

📈 **KỊCH BẢN B: TỐI ƯU CHUẨN (50 / 30 / 20 — Mục tiêu 3-6 tháng tới)**
• 🏠 Thiết yếu (50%): **${formatVnd(needStandard)}** (Cần rà soát chuyển chỗ ở rẻ hơn hoặc tìm bạn share phòng để cắt giảm ${formatVnd(rentExcess)}).
• ☕ Linh hoạt (30%): **${formatVnd(wantStandard)}**
• 🐷 Tích lũy (20%): **${formatVnd(savStandard)}**

💡 **Gợi ý của Bé Orca:** Cậu hãy bắt đầu với Kịch bản A trước để dòng tiền không bị ngột ngạt, sau đó tìm cách tăng thu nhập hoặc tối ưu tiền thuê nhà để dần tiến về Kịch bản B nhé! Cậu thấy kịch bản nào thoải mái hơn với cậu? 💖`;
    }

    return `Bé Orca tính bảng phân bổ 50/30/20 chi tiết dựa trên dòng tiền thật ${formatVnd(net)} của cậu nè: 🐳✨

📊 **BẢNG PHÂN BỔ 50/30/20 THEO LƯƠNG THỰC NHẬN:**
• 🏠 **Thiết yếu (50%): ${formatVnd(needStandard)}**
  Khoản chi cố định hiện tại của cậu (${formatVnd(fixed)}) đang kiểm soát cực tốt, nằm gọn dưới mức trần an toàn! Phần dư còn lại đủ thoải mái cho ăn uống sinh hoạt hàng ngày.
• ☕ **Chi tiêu linh hoạt (30%): ${formatVnd(wantStandard)}**
  Khoản này hoàn toàn là của cậu: học thêm kỹ năng mới, cà phê cùng bạn bè, tự thưởng mua sắm mà không hề có cảm giác tội lỗi (guilt-free spending)!
• 🐷 **Tích lũy & Đầu tư (20%): ${formatVnd(savStandard)}**
  Quy tắc vàng: Trích tự động số tiền này vào tài khoản dự phòng ngay trong ngày nhận thông báo lương về ví!

✨ **Mẹo nhỏ từ Bé Orca:** Nếu tháng nào có phát sinh tiệc tùng hay đám cưới nhiều, cậu có thể linh hoạt nhích tỷ lệ thành **55/25/20** để tinh thần luôn thoải mái nhen! 💖`;
  }

  // 2. Quy tắc 6 chiếc lọ JARS & Phân chia tài khoản ngân hàng thông minh
  if (query.includes("6 chiếc lọ") || query.includes("jars") || query.includes("sáu chiếc lọ") || query.includes("chia lọ")) {
    const nec = Math.round(net * 0.55);
    const ltss = Math.round(net * 0.10);
    const edu = Math.round(net * 0.10);
    const play = Math.round(net * 0.10);
    const ffa = Math.round(net * 0.10);
    const give = Math.round(net * 0.05);

    return `Bé Orca chia thu nhập ${formatVnd(net)} của cậu thành 6 chiếc lọ JARS theo tỷ lệ vàng chuẩn nè: 🐳✨

🏺 **CHI TIẾT 6 CHIẾC LỌ TÀI CHÍNH:**
1. **NEC - Thiết yếu (55%): ${formatVnd(nec)}**
   (Chi cố định thực tế của cậu là ${formatVnd(fixed)} — ${fixed <= nec ? "Rất an toàn! ✨" : "Hơi sát trần, cần để ý hóa đơn sinh hoạt nhé ⚠️"}).
2. **LTSS - Tiết kiệm dài hạn (10%): ${formatVnd(ltss)}**
   Dành cho các cột mốc lớn: mua xe, cưới hỏi, hoặc cọc nhà tương lai.
3. **EDU - Giáo dục & Nâng cấp bản thân (10%): ${formatVnd(edu)}**
   Đầu tư vào kỹ năng, mua sách, khóa học chuyên môn để gia tăng thu nhập vượt bậc.
4. **PLAY - Hưởng thụ cuộc sống (10%): ${formatVnd(play)}**
   Tự do tiêu xài, du lịch xả stress, đi ăn nhà hàng yêu thích — bắt buộc phải tiêu hết lọ này mỗi tháng để tái tạo năng lượng!
5. **FFA - Tự do tài chính & Đầu tư (10%): ${formatVnd(ffa)}**
   Mua chứng chỉ quỹ chỉ số, vàng tích sản hoặc cổ phiếu để tiền làm việc cho mình.
6. **GIVE - Cho đi & Yêu thương (5%): ${formatVnd(give)}**
   Quà biếu bố mẹ, thăm hỏi bạn bè, từ thiện hoặc quỹ đối ngoại.

💡 **Cách thực chiến tại Việt Nam:** Cậu không cần giữ tiền mặt trong lọ thật đâu! Hãy mở các tính năng "Ví con / Hũ tiết kiệm" trên các app ngân hàng (Techcombank, Cake, Timo, VPBank...) để tự động chia tiền ngay khi nhận lương nhen! 💖`;
  }

  // 3. Xử lý khi lỡ tiêu lố / Thâm hụt ngân sách / Chữa cháy tài chính
  if (query.includes("tiêu lố") || query.includes("lỡ tiêu") || query.includes("hết tiền") || query.includes("thâm hụt") || query.includes("vượt ngân sách") || query.includes("cứu")) {
    const safeDaily = Math.round((net - fixed) / 30);
    return `Đừng lo lắng hay tự trách bản thân nha cậu! Ai cũng có những tháng phát sinh ngoài ý muốn nè 🐳💖 Bé Orca hướng dẫn cậu kế hoạch "Cứu hộ dòng tiền" 3 bước cực kỳ êm ái:

🛡️ **KẾ HOẠCH CỨU HỘ DÒNG TIỀN 14 NGÀY:**
1. **Bật chế độ "Đóng băng mua sắm tùy hứng" (Freeze Spending):**
   Trong 1–2 tuần tới, tạm hoãn mọi đơn hàng Shopee/Lazada, quần áo, phụ kiện chưa cấp bách. Áp dụng quy tắc "chờ 48 tiếng" trước khi quyết định quẹt thẻ.
2. **Kích hoạt ngân sách sinh tồn tối giản:**
   Ưu tiên nấu ăn tại nhà hoặc chọn các quán ăn bình dân quen thuộc. Đặt hạn mức chi tiêu ăn uống mỗi ngày tối đa khoảng **${formatVnd(safeDaily > 0 ? safeDaily : 70000)}/ngày**.
3. **Tránh bẫy vay tín chấp hoặc ứng lương tính phí cao:**
   Nếu thực sự cạn tiền mặt, chỉ trích một phần nhỏ từ Quỹ khẩn cấp (nếu có) để trang trải lương thực cơ bản, tuyệt đối không quẹt thẻ tín dụng rút tiền mặt với phí phạt cao nhé!

🌱 Sang tháng mới, cậu cứ trích quỹ tiết kiệm tự động trước ngay ngày đầu tháng, phần còn lại tiêu sẽ không bao giờ sợ bị lố nữa nhen! Cậu muốn Bé Orca cùng rà soát lại khoản chi nào tuần này không? ✨`;
  }

  // 4. Tiền thưởng / Thu nhập bất ngờ (Windfall)
  if (query.includes("thưởng") || query.includes("tiền nhàn rỗi") || query.includes("trúng") || query.includes("tết") || query.includes("khoản tiền")) {
    const bonus = parsedAmount || 20_000_000;
    const emAlloc = Math.round(bonus * 0.5);
    const invAlloc = Math.round(bonus * 0.3);
    const joyAlloc = Math.round(bonus * 0.2);

    let priorityExplanation = "";
    if (emergencyMonths < 3.0) {
      priorityExplanation = `Vì đệm an toàn hiện tại của cậu mới được ${emergencyMonths.toFixed(1)} tháng chi tiêu (dưới mức khuyến nghị 3 tháng), việc đổ ${formatVnd(emAlloc)} vào quỹ khẩn cấp sẽ giúp cậu ngủ ngon hơn mỗi đêm! 🛡️`;
    } else if (totalDebt > 0) {
      priorityExplanation = `Cậu đang có khoản nợ ${formatVnd(totalDebt)}, nên dùng ${formatVnd(emAlloc)} để dập bớt nợ lãi cao nhất, giúp giải phóng áp lực tiền lãi mỗi tháng! 💡`;
    } else {
      priorityExplanation = `Quỹ khẩn cấp của cậu đã vững chãi (${emergencyMonths.toFixed(1)} tháng) và sạch nợ, cậu hoàn toàn có thể đẩy phần này vào danh mục đầu tư tích sản để tiền đẻ ra tiền nhanh hơn! 🚀`;
    }

    return `Chúc mừng cậu nhận được khoản tiền **${formatVnd(bonus)}** nhen! 🎉 Bé Orca gợi ý công thức phân bổ 3 ngăn thông minh:

🎯 **CƠ CẤU PHÂN BỔ ${formatVnd(bonus)}:**
1. 🛡️ **50% (${formatVnd(emAlloc)}) — Gia cố phòng tuyến:**
   ${priorityExplanation}
2. 📈 **30% (${formatVnd(invAlloc)}) — Tích sản tăng trưởng:**
   Mua chứng chỉ quỹ chỉ số VN30, vàng nhẫn 9999 hoặc gửi tiết kiệm kỳ hạn 6–12 tháng để hưởng lãi kép.
3. 💖 **20% (${formatVnd(joyAlloc)}) — Tự thưởng trọn vẹn (Guilt-free joy):**
   Cậu đã làm việc rất chăm chỉ, hãy dùng trọn vẹn khoản này để mua món đồ cậu thích, đi ăn ngon hoặc du lịch mà không cần phải đắn đo suy nghĩ!

Cậu thấy tỷ lệ này đã phù hợp với kế hoạch gần nhất của cậu chưa nè? 🐳✨`;
  }

  // 5. Mua xe trả góp / Trả góp đồ công nghệ
  if (query.includes("trả góp") || query.includes("mua xe") || query.includes("mua ô tô") || query.includes("mua iphone") || query.includes("vay mua") || query.includes("mua laptop")) {
    const safeDebtRatio = 0.20; // 20% lương net
    const maxSafeMonthlyPay = Math.round(net * safeDebtRatio);
    const currentDebtMonthly = debts.reduce((sum, d) => sum + (d.minMonthlyPayment ?? 0), 0);
    const roomLeft = Math.max(0, maxSafeMonthlyPay - currentDebtMonthly);

    return `Bé Orca giải bài toán trả góp dựa trên sức chịu tải dòng tiền thật của cậu nè: 🐳

📊 **DÒNG TIỀN VÀ KHẢ NĂNG GÁNH NỢ CỦA CẬU:**
• Thu nhập thực nhận: **${formatVnd(net)}/tháng**.
• Chi cố định thiết yếu: **${formatVnd(fixed)}** (${(facts?.fixedCostRatio ?? 0).toFixed(0)}% thu nhập).
• Các nghĩa vụ trả nợ hiện tại: **${formatVnd(currentDebtMonthly)}/tháng**.

🛡️ **NGƯỠNG TRẢ GÓP AN TOÀN TUYỆT ĐỐI:**
Theo chuẩn quản trị rủi ro tài chính cá nhân, tổng tiền trả góp mọi khoản nợ mỗi tháng không nên vượt quá **20%–25%** lương net.
• Mức trần trả góp an toàn tối đa: **${formatVnd(maxSafeMonthlyPay)}/tháng**.
• Dư địa an toàn còn lại cho món đồ mới: khoảng **${formatVnd(roomLeft)}/tháng**.

💡 **LỰA CHỌN LINH HOẠT CHO CẬU:**
1. **Nếu khoản trả góp < ${formatVnd(roomLeft)}/tháng:** Cậu có thể mua ngay mà không làm đảo lộn chi tiêu hàng ngày.
2. **Nếu khoản trả góp vượt quá ${formatVnd(maxSafeMonthlyPay)}/tháng:** Rất rủi ro trong trường hợp công việc gián đoạn hoặc có phát sinh bất ngờ! Bé khuyên cậu nên hoãn 3–5 tháng, gom tiền trả trước (Down payment) tối thiểu 40–50% giá trị tài sản để hạ số tiền trả góp hàng tháng xuống mức an toàn nhé! 💪💖`;
  }

  // 6. Tiết kiệm vs Vàng vs Chứng chỉ quỹ mở (Kiềng 3 chân)
  if (query.includes("vàng") || query.includes("tiết kiệm hay mua vàng") || query.includes("quỹ mở") || (query.includes("tiết kiệm") && query.includes("đầu tư"))) {
    const idleCash = parsedAmount || 50_000_000;
    const isConservative = query.includes("an toàn") || query.includes("sợ lỗ") || query.includes("ngắn hạn");

    if (isConservative) {
      const bank = Math.round(idleCash * 0.60);
      const gold = Math.round(idleCash * 0.30);
      const fund = Math.round(idleCash * 0.10);
      return `Bé Orca thiết kế kịch bản **Phòng thủ an toàn tối đa** cho ${formatVnd(idleCash)} của cậu nè: 🐳🛡️

🏦 **KỊCH BẢN PHÒNG THỦ & THANH KHOẢN CAO:**
• 🏦 **60% (${formatVnd(bank)}) — Tiết kiệm ngân hàng linh hoạt:** Gửi kỳ hạn 6 tháng hoặc chia thành 2 sổ nhỏ để có thể rút 1 phần khi có việc gấp mà không mất lãi toàn bộ.
• 🪙 **30% (${formatVnd(gold)}) — Vàng nhẫn tròn trơn 9999:** Mua từ các thương hiệu lớn (SJC, DOJI, PNJ, Bảo Tín) để làm tài sản trú ẩn và bảo toàn sức mua trước lạm phát.
• 📊 **10% (${formatVnd(fund)}) — Quỹ mở trái phiếu / Cổ phiếu top VN30:** Bắt đầu làm quen với thị trường tài chính với rủi ro rất thấp.

Cách phân bổ này giúp tâm lý cậu luôn an tâm tuyệt đối mà tiền vẫn sinh lãi đều đặn nhen! ✨`;
    }

    const bank = Math.round(idleCash * 0.50);
    const gold = Math.round(idleCash * 0.30);
    const fund = Math.round(idleCash * 0.20);
    return `Bé Orca gợi ý chiến lược phân bổ ${formatVnd(idleCash)} theo thế kiềng 3 chân cân bằng tối ưu tại Việt Nam nè: 🐳✨

🪙 **CHIẾN LƯỢC KIỀNG 3 CHÂN (Cân bằng Tăng trưởng & An toàn):**
• 🏦 **50% (${formatVnd(bank)}) — Tiết kiệm ngân hàng:** Đảm bảo thanh khoản linh hoạt. Khi có cơ hội hoặc biến cố, cậu luôn có tiền mặt trong tay ngay lập tức.
• 🪙 **30% (${formatVnd(gold)}) — Vàng nhẫn 9999:** Kênh phòng hộ lạm phát và rủi ro địa chính trị bền bỉ nhất lịch sử. Giữ tối thiểu từ 1–3 năm trở lên.
• 📊 **20% (${formatVnd(fund)}) — Chứng chỉ quỹ mở (VN30 / Cổ phiếu tăng trưởng):** Tận dụng sức bật kinh tế Việt Nam với mức lợi nhuận kỳ vọng 10–14%/năm mà không cần canh bảng điện hàng ngày!

Cậu thích trường phái an toàn giữ vốn hay muốn đẩy mạnh sinh lời hơn nè? Nói Bé Orca biết nha! 💖`;
  }

  // 7. Quản trị nợ & Chiến lược dập nợ
  if (query.includes("nợ") || query.includes("trả nợ") || query.includes("vay") || query.includes("snowball") || query.includes("avalanche")) {
    if (debts.length === 0 && totalDebt <= 0) {
      return `Thật tuyệt vời! Sổ tài chính của cậu hiện tại hoàn toàn sạch nợ nè! 🐳🎉 Cậu đang ở vị thế tài chính tự do và thoải mái hơn 70% mọi người rồi đó. Giờ là lúc tập trung gia cố quỹ khẩn cấp 3–6 tháng (${formatVnd(exp * 3)} – ${formatVnd(exp * 6)}) và đầu tư tích sản nhé! ✨`;
    }

    const debtItems = debts.length > 0 
      ? debts.map((d) => `• ${d.name || "Khoản vay"}: Dư nợ ${formatVnd(d.balance)}, Lãi suất ${(d.interestRate ?? 0)}%/năm (Trả tối thiểu: ${formatVnd(d.minMonthlyPayment)}/tháng)`).join("\n")
      : `• Tổng dư nợ đang theo dõi: ${formatVnd(totalDebt)}`;

    return `Bé Orca cùng cậu lên kế hoạch dập dứt điểm khoản nợ ${formatVnd(totalDebt)} này nhé: 🐳💪

📋 **HIỆN TRẠNG CÁC KHOẢN NỢ:**
${debtItems}

🛡️ **SO SÁNH 2 CHIẾN THUẬT DẬP NỢ:**
1. 🏔️ **Phương pháp Lở tuyết (Debt Avalanche — Tối ưu tài chính):**
   Ưu tiên dồn toàn bộ tiền tiết kiệm hàng tháng (${formatVnd(savings)}) để trả thêm cho khoản nợ có **lãi suất cao nhất**. Duy trì trả tối thiểu các khoản còn lại. Đây là cách giúp cậu đỡ mất nhiều tiền lãi nhất!
2. ⛄ **Phương pháp Tuyết lăn (Debt Snowball — Giải tỏa tâm lý):**
   Nếu cậu cảm thấy áp lực và mệt mỏi, hãy dập dứt điểm khoản có **số dư nhỏ nhất trước**. Khi xóa sổ được một khoản nợ, não bộ sẽ tiết ra dopamine tạo động lực cực lớn để tiến lên!

💡 **Nguyên tắc an toàn:** Luôn giữ lại ít nhất 1 tháng chi tiêu thiết yếu (~${formatVnd(fixed)}) trong tài khoản, đừng dốc cạn sạch tiền mặt kẻo có việc gấp lại phải đi vay mới nhé cậu! 💖`;
  }

  // 8. Quỹ khẩn cấp & Tấm khiên an toàn
  if (query.includes("quỹ khẩn cấp") || query.includes("dự phòng") || (query.includes("an toàn") && query.includes("tiền"))) {
    const target3m = Math.round(exp * 3);
    const target6m = Math.round(exp * 6);
    const currentEmergency = Math.round(emergencyMonths * exp);

    return `Bé Orca đánh giá tấm khiên an toàn tài chính của cậu nè: 🐳🛡️

📊 **HIỆN TRẠNG QUỸ DỰ PHÒNG:**
• Quỹ khẩn cấp hiện tại: khoảng **${formatVnd(currentEmergency)}** (Tương đương **${emergencyMonths.toFixed(1)} tháng** chi tiêu sinh hoạt).
• Mức trích tiết kiệm hàng tháng: **${formatVnd(savings)}** (${(facts?.savingsRate ?? 0).toFixed(0)}% thu nhập).

🎯 **CÁC CỘT MỐC CHUẨN:**
• Cột mốc 1 (Sàn tối thiểu 3 tháng): **${formatVnd(target3m)}**
• Cột mốc 2 (Vững chắc 6 tháng): **${formatVnd(target6m)}**

💡 **ĐỊNH HƯỚNG CHO CẬU:**
${emergencyMonths < 3.0
  ? `Hiện tại quỹ của cậu (${emergencyMonths.toFixed(1)} tháng) còn hơi mỏng. Bé khuyên cậu tạm hoãn đầu tư chứng khoán mạo hiểm, tập trung trích tự động ${formatVnd(Math.round(net * 0.15))} – ${formatVnd(Math.round(net * 0.2))} mỗi tháng vào tài khoản tiết kiệm online cho tới khi cán mốc ${formatVnd(target3m)} nhé!`
  : `Tuyệt vời quá! Đệm an toàn của cậu đã đạt ${emergencyMonths.toFixed(1)} tháng, vượt chuẩn an toàn đô thị. Cậu hoàn toàn tự tin phân bổ dòng tiền tiết kiệm hàng tháng vào các kênh đầu tư tích sản sinh lời dài hạn rồi đó! ✨`}💖`;
  }

  // 9. Cắt giảm chi phí không gây đau khổ / Lối sống tối giản thông minh
  if (query.includes("cắt giảm") || query.includes("tiết kiệm tiền") || query.includes("bớt chi") || query.includes("tối giản") || query.includes("tiêu ít")) {
    return `Bé Orca chia sẻ phương pháp "Cắt cành to, giữ cành nhỏ" giúp cậu tối ưu chi tiêu mà tinh thần vẫn cực kỳ vui vẻ nè: 🐳✨

🌱 **NGUYÊN TẮC: ĐỪNG CẮT NIỀM VUI NHỎ, HÃY CẮT CHI PHÍ LỚN CỐ ĐỊNH**
Nhiều người cố nhịn ly cà phê 30k hay bát phở sáng để rồi cảm thấy khổ sở và sau đó "tiêu trả thù" còn tốn hơn! Thay vào đó:

1. **Rà soát 3 khoản chi cố định lớn nhất:**
   • Tiền thuê nhà & dịch vụ chung: Có thể đàm phán lại giá phòng, đổi gói internet/truyền hình phù hợp nhu cầu.
   • Các gói đăng ký âm thầm (Subscriptions): Hủy các ứng dụng nghe nhạc, xem phim, hội viên gym không còn dùng tới.
2. **Quy tắc 80/20 trong ăn uống:**
   Nấu ăn ở nhà từ thứ 2 đến thứ 6, dành thứ 7 hoặc Chủ nhật để đi ăn nhà hàng cùng người thân/bạn bè. Vừa bảo vệ sức khỏe vừa tiết kiệm được 2–3 triệu/tháng!
3. **Chờ 48 tiếng trước khi thanh toán giỏ hàng online:**
   Cho món đồ vào giỏ và tắt app. Sau 2 ngày nếu cậu vẫn cảm thấy thực sự cần nó thì mới mua nhé!

Cậu đang thấy khoản chi nào mỗi tháng làm cậu lăn tăn nhất? Nói Bé Orca cùng gỡ rối nha! 💖`;
  }

  // 10. Thuế TNCN & Lương Gross/Net
  if (query.includes("thuế") || query.includes("tncn") || query.includes("bảo hiểm") || query.includes("bhxh") || query.includes("gross")) {
    const depDeduction = dependents * 4_400_000;
    return `Bé Orca giải thích cách tối ưu thuế TNCN và các khoản trích theo lương tại Việt Nam cho cậu nè: 🐳📑

📊 **CƠ CẤU TRÍCH TỪ LƯƠNG GROSS SANG NET:**
1. **Bảo hiểm bắt buộc (Tổng 10,5% lương đóng BH):**
   • BHXH: 8% (hưu trí, tử tuất, thai sản, ốm đau)
   • BHYT: 1,5%
   • BHTN: 1%
2. **Mức giảm trừ gia cảnh hiện hành:**
   • Bản thân người lao động: **11.000.000 ₫/tháng**.
   • Người phụ thuộc đã đăng ký (${dependents} người): **${formatVnd(depDeduction)}/tháng** (4.400.000 ₫/người/tháng).
3. **Biểu thuế lũy tiến từng phần:** Áp dụng trên phần thu nhập tính thuế sau khi đã trừ bảo hiểm và giảm trừ gia cảnh.

💡 **Mẹo tối ưu:** Đăng ký người phụ thuộc (bố mẹ hết tuổi lao động có thu nhập thấp, con nhỏ) đầy đủ với phòng nhân sự để giảm trừ tối đa số thuế phải khấu trừ hàng tháng nhé! 💖`;
  }

  // 11. Mục tiêu tài chính cá nhân
  if (query.includes("mục tiêu") || query.includes("mua nhà") || query.includes("cưới") || query.includes("du lịch") || query.includes("laptop")) {
    if (goals.length === 0) {
      return `Hiện tại trong sổ cậu chưa thiết lập mục tiêu cụ thể nào nè! 🐳 
Việc có một mục tiêu rõ ràng (như Quỹ du lịch cuối năm, Mua xe mới, Cọc tiền nhà, Cưới hỏi...) sẽ giúp cậu có động lực tiết kiệm gấp đôi. Cậu muốn tích lũy cho mục tiêu nào trước, chia sẻ với Bé Orca để bé tính giúp số tiền cần trích mỗi tháng nhé! 🚀💖`;
    }

    const goalDetails = goals.map((g) => {
      const pct = g.targetAmount ? Math.min(100, Math.round(((g.accumulatedAmount ?? 0) / g.targetAmount) * 100)) : 0;
      return `• **${g.name}**: Đã tích lũy **${formatVnd(g.accumulatedAmount)}** / ${formatVnd(g.targetAmount)} (${pct}%) — Hạn chót: ${g.deadline || "Kế hoạch dài hạn"}`;
    }).join("\n");

    return `Bé Orca tổng hợp tiến độ các mục tiêu cậu đang ấp ủ nè: 🐳✨

🎯 **TIẾN ĐỘ TÍCH LŨY MỤC TIÊU:**
${goalDetails}

💪 Cậu đang đi rất đúng hướng! Chỉ cần duy trì trích tiền tự động đều đặn mỗi kỳ lương là mọi ước mơ đều sẽ về đích trong tầm tay nhen! Cậu muốn tăng tốc mục tiêu nào trước không? 💖`;
  }

  // 12. Fallback linh hoạt thông minh theo bối cảnh đời thực
  const statusEmoji = (facts?.healthScore ?? 75) >= 80 ? "🌟" : "💪";
  return `Chào cậu nhen! 🐳 Bé Orca đã đọc kỹ câu hỏi của cậu cùng với bức tranh tài chính kỳ ${facts?.period || "này"} của cậu tại ${location}:

📊 **TỔNG QUAN VỊ THẾ TÀI CHÍNH CỦA CẬU:**
• Thu nhập thực nhận: **${formatVnd(net)}/tháng**.
• Chi phí sinh hoạt: **${formatVnd(exp)}** (Cố định chiếm ${(facts?.fixedCostRatio ?? 0).toFixed(0)}% lương).
• Đệm an toàn dự phòng: **${emergencyMonths.toFixed(1)} tháng** chi tiêu.
• Điểm sức khỏe tài chính: **${facts?.healthScore ?? 75}/100** ${statusEmoji} (${facts?.healthRating || "Ổn định"}).

💡 **GÓC NHÌN & ĐỀ XUẤT CỦA BÉ ORCA:**
1. **Về câu hỏi của cậu:** Tùy thuộc vào ưu tiên hiện tại (${facts?.primaryPriority || "Cân bằng & Tích lũy"}), cậu có thể chọn cách tiếp cận an toàn từng bước hoặc tập trung tăng thu nhập để mở rộng dư địa chi tiêu.
2. **Nguyên tắc cốt lõi:** Luôn giữ chi tiêu cố định dưới 55% thu nhập và bảo vệ đệm quỹ khẩn cấp 3 tháng trước khi phân bổ vào các kênh mạo hiểm.

Cậu có thể hỏi sâu hơn về bất kỳ chủ đề nào (chia lương, phân bổ thưởng, tính mua trả góp, xử lý nợ hay mẹo tối ưu chi phí) — Bé Orca luôn ở đây đồng hành cùng cậu nhen! 💖✨`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return badRequest("Body JSON không hợp lệ");
    }

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return badRequest("Thiếu câu hỏi");
    }

    const facts = (body.snapshotFacts as SnapshotFacts) || {};
    const history = Array.isArray(body.conversationHistory)
      ? body.conversationHistory.filter(
          (m: unknown) =>
            m &&
            typeof m === "object" &&
            typeof (m as { text?: unknown }).text === "string" &&
            ((m as { sender?: unknown }).sender === "user" || (m as { sender?: unknown }).sender === "orca"),
        )
      : [];

    const net = facts.netIncome ?? facts.totalNetIncome ?? 0;
    const gross = facts.grossIncome ?? facts.totalGrossSalary ?? 0;
    const fixed = facts.fixedExpenses ?? 0;
    const totalExp = facts.totalExpenses ?? 0;

    // Nếu có LLM cấu hình, gọi LLM gateway với Prompt đa kịch bản, tự nhiên, linh hoạt
    if (llmConfigured()) {
      try {
        const systemPrompt = `Bạn là "Bé Orca 🐳" — Trợ lý AI Cố vấn Tài chính Cá nhân thông minh, thấu cảm và nhạy bén của hệ thống ORCA Financial.
Bạn được huấn luyện dựa trên bộ tri thức quản trị tài chính thực tế tại Việt Nam (thu nhập, chi phí nhà trọ, sinh hoạt phí đô thị, thuế TNCN, BHXH, thói quen tiêu dùng, vàng nhẫn 9999, quỹ mở và lãi suất ngân hàng).

TÍNH CÁCH & PHONG CÁCH GIAO TIẾP:
- Xưng hô ấm áp, đáng yêu: Tự xưng là "Bé Orca" hoặc "Bé", gọi người dùng là "cậu" hoặc "bạn". Sử dụng icon tinh tế (🐳, ✨, 💖, 💪, 🛡️).
- Đồng cảm, không phán xét: Hiểu rằng tài chính cá nhân gắn liền với cảm xúc, hoàn cảnh sống thực tế và áp lực đời thường.
- Sắc sảo, định lượng: Đưa ra các con số VND cụ thể dựa trên số liệu sổ tài chính thực tế dưới đây. Không đưa ra lời khuyên sáo rỗng hay đạo lý chung chung.

TRI THỨC & NGUYÊN TẮC LINH HOẠT (QUAN TRỌNG):
- KHÔNG BẮT BUỘC RẬP KHUÔN: Đừng biến mọi câu trả lời thành bảng 50/30/20 trừ khi người dùng hỏi cụ thể về chia lương. Hãy trả lời đúng trọng tâm câu hỏi của người dùng!
- TƯ DUY ĐA KỊCH BẢN (SCENARIO-BASED): Luôn đưa ra 2–3 phương án lựa chọn (VD: Kịch bản Thận trọng vs Kịch bản Cân bằng vs Kịch bản Tăng tốc) để người dùng chủ động chọn lối đi phù hợp với lối sống của họ.
- BIẾN THỂ THỰC TẾ:
  + Nếu sống ở đô thị lớn (Hà Nội, TP.HCM) và tiền trọ/cố định cao (>50% lương), đề xuất công thức 60/25/15 thay vì ép 50/30/20.
  + Nếu người dùng lỡ tiêu lố hoặc căng thẳng tài chính: Đưa ra kế hoạch hạ nhiệt 14 ngày, đóng băng chi tiêu tùy ý mà không làm giảm nhu cầu cơ bản.
  + Tiền thưởng/thu nhập bất ngờ: Chia 3 ngăn (Gia cố đệm an toàn/dập nợ, Tích sản sinh lời, Tự thưởng xứng đáng không tội lỗi).
  + Mua trả góp: Tổng nghĩa vụ nợ không vượt quá 20–25% lương net. Đề xuất tăng tỷ lệ trả trước (down payment) nếu cần.
  + Đầu tư/Tiết kiệm/Vàng: Thế kiềng 3 chân tùy theo khẩu vị rủi ro.

BỐI CẢNH SỔ TÀI CHÍNH THỰC TẾ:
- Kỳ ghi chép: ${facts.period || "Hiện tại"}
- Nơi sinh sống: ${facts.location || "TP.HCM / Hà Nội"}
- Giai đoạn cuộc sống: ${facts.lifeStage || "Độc thân / Tích lũy"}
- Ưu tiên hàng đầu: ${facts.primaryPriority || "Cân bằng & Tích lũy tài sản"}
- Thu nhập thực nhận (Net): ${formatVnd(net)}/tháng (Gross: ${formatVnd(gross)})
- Tổng chi tiêu: ${formatVnd(totalExp)}/tháng (Chi cố định: ${formatVnd(fixed)}, Chi linh hoạt: ${formatVnd(facts.variableExpenses)})
- Tỷ lệ chi cố định: ${(facts.fixedCostRatio ?? 0).toFixed(1)}% thu nhập
- Tiết kiệm hàng tháng: ${formatVnd(facts.monthlySavings)} (Tỷ lệ tiết kiệm: ${(facts.savingsRate ?? 0).toFixed(1)}%)
- Quỹ khẩn cấp: Đủ trang trải ${(facts.emergencyFundMonths ?? 0).toFixed(1)} tháng chi tiêu
- Tổng nợ: ${formatVnd(facts.totalDebt)}
- Tài sản ròng (Net Worth): ${formatVnd(facts.netWorth)}
- Điểm sức khỏe tài chính: ${facts.healthScore ?? 75}/100 (${facts.healthRating || "Khá"})
${facts.debtsList && facts.debtsList.length > 0 ? `- Danh sách nợ: ${JSON.stringify(facts.debtsList)}` : "- Không có khoản nợ nào"}
${facts.goalsList && facts.goalsList.length > 0 ? `- Mục tiêu: ${JSON.stringify(facts.goalsList)}` : "- Chưa tạo mục tiêu cụ thể"}
`;

        const chatHistory = history.map((h: { sender: string; text: string }) => ({
          role: (h.sender === "user" ? "user" : "assistant") as "user" | "assistant",
          content: h.text,
        }));

        const llmResult = await llmChat("reasoning", {
          system: systemPrompt,
          user: question,
          history: chatHistory,
          temperature: 0.72,
          maxTokens: 1400,
          timeoutMs: 15_000,
        });

        if (llmResult?.text && llmResult.text.trim().length > 20) {
          return ok({ answer: llmResult.text.trim() });
        }
      } catch (llmErr) {
        console.warn("[Ask Orca API] LLM gặp sự cố, chuyển sang bộ tư duy thích ứng cục bộ:", llmErr);
      }
    }

    // Engine tư duy thích ứng linh hoạt bám sát tri thức dataset
    const adaptiveAnswer = generateAdaptiveAnswer(question, facts);
    return ok({ answer: adaptiveAnswer });
  } catch (err) {
    console.error("[Ask Orca API Error]:", err);
    return ok({
      answer: "Chào cậu nhen! Bé Orca đang bơi một vòng để tổng hợp dữ liệu, cậu kiểm tra lại kết nối và hỏi lại bé nha! 🐳✨",
    });
  }
}
