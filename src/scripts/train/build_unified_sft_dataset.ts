/**
 * ORCA-FA: UNIFIED SFT TRAINING DATASET COMPILER
 *
 * Aggregates all curated gold knowledge and deterministic engine outputs into:
 * 1. src/lib/data/training/orca-unified-sft.jsonl (ChatML + id/source/category/split metadata)
 * 2. src/data/training/orca_fin_data.jsonl (Pure ChatML {"messages":[...]} for OpenAI / TRL / Unsloth)
 *
 * Run:
 *   npx tsx --conditions=react-server src/scripts/train/build_unified_sft_dataset.ts
 */

import fs from "node:fs";
import path from "node:path";
import {
  executeContextualAiPipeline,
  type SnapshotFacts,
} from "../../lib/engines/orca-contextual-reasoning-engine";
import {
  calculateWacc,
  calculateDcf,
} from "../../lib/engines/financial-calculation-suite";
import { auditMultiScenarioModel } from "../../lib/engines/multi-scenario-critic";
import {
  MULTI_SCENARIO_TRAINING_CASES,
  verifyScenarioMathInvariants,
  type SftScenarioSample,
} from "../../lib/training/multi-scenario-trainer";
import {
  getScreenerFilterCases,
  getCommodityMacroCases,
  getForensicRiskCases,
} from "./sft_v2_extension_cases";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface UnifiedSftRecord {
  id: string;
  source:
    | "gold_multi_scenario"
    | "gold_adversarial_qa"
    | "training_case_audit"
    | "pipeline_quant_math"
    | "pipeline_personal_finance"
    | "pipeline_multi_scenario"
    | "pipeline_screener_filter"
    | "pipeline_commodity_macro"
    | "pipeline_forensic_risk";
  category: string;
  split: "train" | "eval";
  symbol?: string;
  messages: ChatMessage[];
}

interface PureChatMlRecord {
  messages: ChatMessage[];
}

const ROOT = process.cwd();
const MULTI_SCENARIO_GOLD_PATH = path.resolve(
  ROOT,
  "src/lib/data/training/orca-multi-scenario-sft.json"
);
const QA_GOLD_PATH = path.resolve(
  ROOT,
  "src/lib/data/training/orca-qa-gold-sft.json"
);
const UNIFIED_OUTPUT_PATH = path.resolve(
  ROOT,
  "src/lib/data/training/orca-unified-sft.jsonl"
);
const PURE_CHATML_OUTPUT_PATH = path.resolve(
  ROOT,
  "src/data/training/orca_fin_data.jsonl"
);

const SYSTEM_PROMPTS = {
  multiScenarioCro:
    "Bạn là Giám đốc Chiến lược Định lượng & Quản trị Rủi ro (CRO) của Orca AI chuyên sâu thị trường chứng khoán Việt Nam (HOSE/HNX/UPCOM), quy tắc thanh toán T+2.5 và phân tích Đa kịch bản (Bull/Base/Bear) kết hợp Ma trận Đa khung Thời gian.",
  quantMath:
    "Bạn là Chuyên gia Toán Tài chính Định lượng của Orca AI. Hãy tính toán chính xác tuyệt đối theo công thức KaTeX chuẩn, luật Việt Nam hiện hành và trình bày bảng số liệu rõ ràng.",
  personalFinance:
    "Bạn là Cố vấn Quản trị Tài chính Cá nhân & Dòng tiền Thực chiến của Orca AI tại Việt Nam. Hãy phân tích dựa trên con số thực tế, cảnh báo rủi ro nợ/lãi suất thả nổi và đưa ra lộ trình hành động cụ thể.",
  valuationCfa:
    "Bạn là Chuyên gia Định giá Doanh nghiệp (CFA) của Orca AI. Hãy trình bày đầy đủ công thức WACC, DCF, bảng hiện giá dòng tiền FCFF và đánh giá biên an toàn.",
  croAuditor:
    "Bạn là Giám đốc Kiểm toán Rủi ro (CRO Critic) của Orca AI. Nhiệm vụ của bạn là phát hiện các lỗi xác suất, bất đối xứng rủi ro, bẫy P/E chu kỳ hoặc thiếu điểm vô hiệu hóa trong mô hình kịch bản.",
  screenerQuant:
    "Bạn là Chuyên gia Cố vấn Lọc Cổ phiếu Định lượng Đa Nhân tố (Quant Screener) của Orca AI. Hãy sàng lọc dựa trên số liệu thực tế, lập bảng ma trận định lượng, giải thích ý nghĩa kinh tế, cảnh báo bẫy P/E đỉnh chu kỳ/cản T+2.5 và đưa ra kế hoạch giải ngân Triple-Barrier.",
  commodityMacro:
    "Bạn là Chuyên gia Phân tích Vĩ mô & Hàng hóa Toàn cầu (Global Macro & Commodities) của Orca AI. Hãy bóc tách cơ chế truyền dẫn của giá hàng hóa thế giới vào doanh nghiệp niêm yết tại Việt Nam, đo lường độ trễ vòng quay tồn kho (1-2 quý) và phân hóa nhóm hưởng lợi/chịu áp lực chi phí.",
  forensicRisk:
    "Bạn là Chuyên gia Pháp y Kế toán & Kiểm toán Thẩm định Rủi ro (Forensic CPA) của Orca AI. Hãy bóc tách các cờ đỏ BCTC, bẫy lợi nhuận giấy, tỷ lệ dồn tích Accruals, áp lực nợ trái phiếu và nguyên tắc phòng vệ kẹt sàn T+2.5.",
};

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatVnd(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function formatGoldAssistant(sample: SftScenarioSample): string {
  const cot = (sample.reasoningCoT ?? []).map((step) => `- ${step}`).join("\n");
  if (!cot) return sample.goldAnswer.trim();
  return [
    "### 🧠 Quy trình Suy luận Định lượng (Chain-of-Thought)",
    cot,
    "",
    "---",
    "",
    sample.goldAnswer.trim(),
  ].join("\n");
}

function buildTrapAuditAnswer(
  tc: (typeof MULTI_SCENARIO_TRAINING_CASES)[number]
): string {
  const audit = auditMultiScenarioModel(tc.candidatePayload);
  const math = verifyScenarioMathInvariants(tc.candidatePayload, audit);
  const scenarios = tc.candidatePayload.scenarios;

  const lines: string[] = [
    `### 🛡️ KIỂM TOÁN ĐỘC LẬP CRO CRITIC: \`${tc.symbol}\` — ${tc.title}`,
    `> **Kết luận Kiểm toán CRO (Verdict):** \`${audit.verdict}\` | **Audit Score:** \`${audit.metrics.auditScore}/100\` | **Passed:** \`${audit.passed ? "YES" : "NO"}\``,
    ``,
    `#### 1. Bẫy Đối Kháng Được Phát Hiện (${tc.trapCategory})`,
    `- **Bản chất bẫy:** ${tc.adversarialTrap}`,
    `- **Tổng xác suất ($\\sum p_i$):** \`${(math.totalProbability * 100).toFixed(2)}%\` (${math.probabilitySumValid ? "Đạt chuẩn Unitary 100%" : "**VI PHẠM TIÊN ĐỀ $\\sum p_i = 1.00$**"})`,
    `- **Lợi suất kỳ vọng ($E[R]$):** \`${audit.metrics.expectedReturnPct > 0 ? "+" : ""}${audit.metrics.expectedReturnPct}%\` | **Tỷ số bất đối xứng Bull/Bear:** \`${audit.metrics.bullBearAsymmetryRatio}x\``,
    `- **Lợi suất sau Haircut T+2.5:** \`${audit.metrics.t2LiquidityHaircutReturnPct > 0 ? "+" : ""}${audit.metrics.t2LiquidityHaircutReturnPct}%\``,
    ``,
    `$$\\sum_{i \\in \\{\\text{Bull}, \\text{Base}, \\text{Bear}\\}} p_i = ${scenarios.map((s) => s.probability.toFixed(2)).join(" + ")} = \\mathbf{${math.totalProbability.toFixed(2)}}$$`,
    ``,
    `$$E[R] = \\sum_{i} p_i \\times R_i = ${scenarios.map((s) => `(${s.probability.toFixed(2)} \\times ${s.expectedReturnPct}\\%)`).join(" + ")} = \\mathbf{${audit.metrics.expectedReturnPct}\\%}$$`,
    ``,
    `#### 2. Chi Tiết Các Lỗi Vi Phạm Chuẩn CRO (${audit.issues.length} cảnh báo)`,
  ];

  for (const issue of audit.issues) {
    lines.push(
      `- **[${issue.severity}] \`${issue.code}\`:** ${issue.message} → *Khuyến nghị sửa:* ${issue.recommendation}`
    );
  }

  if (math.scenarioReturnDiscrepancies.length > 0) {
    lines.push(
      `- **Sai lệch nhất quán mục tiêu giá:** ${math.scenarioReturnDiscrepancies.join("; ")}`
    );
  }

  lines.push(
    ``,
    `#### 3. Khuyến Nghị Khắc Phục & Ma Trận Đa Khung Thời Gian (T+2.5 / Trung hạn / Dài hạn)`,
    `- **Ngắn hạn T+2.5 (1–10 phiên):** Không giải ngân khi mô hình chưa vượt qua cổng kiểm toán CRO; tuân thủ kỷ luật cắt lỗ và chuẩn bị phương án thoát lệnh ATO nếu trắng bảng bên mua.`,
    `- **Trung hạn (1–2 Quý / BCTC):** Chuẩn hóa lại tổng xác suất về đúng 100% ($1.00$), đối soát biên lợi nhuận gộp và dòng tiền OCF thực thu trên BCTC quý trước khi tái đánh giá.`,
    `- **Dài hạn (1–3 Năm / Chu kỳ):** Đảm bảo mỗi kịch bản Bull/Base/Bear đều gắn Điểm Vô Hiệu Hóa số học (Bull: \`BREAK_BELOW\`, Bear: \`BREAK_ABOVE\`) và giữ tỷ lệ bất đối xứng Bull/Bear $\\ge 1.30x$ trước khi phân bổ vốn dài hạn.`
  );

  return lines.join("\n");
}

function buildCustomWaccDcfAnswer(params: {
  symbol: string;
  companyName: string;
  equityVal: number;
  debtVal: number;
  ke: number;
  kd: number;
  tax: number;
  fcffSeries: number[];
  g: number;
  netDebt: number;
  shares: number;
}): string {
  const waccRes = calculateWacc(
    params.equityVal,
    params.debtVal,
    params.ke,
    params.kd,
    params.tax
  );
  const dcfRes = calculateDcf(
    params.fcffSeries,
    params.g,
    waccRes.waccPct,
    params.netDebt,
    params.shares
  );

  return [
    `## 💎 ĐỊNH GIÁ CHIẾT KHẤU DÒNG TIỀN (DCF) & CHI PHÍ VỐN (WACC): ${params.symbol} (${params.companyName})`,
    `> **KẾT QUẢ ĐIỀU HÀNH (VALUATION SUMMARY):**`,
    `> - **Chi phí vốn bình quân (WACC):** **${waccRes.waccPct}%**`,
    `> - **Cơ cấu vốn:** Vốn chủ sở hữu (E) **${waccRes.equityWeightPct}%** | Nợ vay (D) **${waccRes.debtWeightPct}%**`,
    `> - **Giá trị doanh nghiệp (Enterprise Value):** **${formatVnd(dcfRes.enterpriseValueVnd)}**`,
    `> - **Giá trị vốn chủ sở hữu (Equity Value):** **${formatVnd(dcfRes.equityValueVnd)}**`,
    `> - **Giá trị hợp lý mỗi cổ phiếu (Fair Value/Share):** **${formatVnd(dcfRes.fairValuePerShareVnd)}/cổ phiếu**`,
    ``,
    `### 1. BÓC TÁCH CÔNG THỨC WACC`,
    `$$\\text{WACC} = \\frac{E}{V} \\cdot K_e + \\frac{D}{V} \\cdot K_d \\cdot (1 - t)$$`,
    `- Chi phí nợ sau lá chắn thuế $K_d(1-t)$: $${params.kd.toFixed(1)}\\% \\times (1 - ${(params.tax / 100).toFixed(2)}) = ${waccRes.afterTaxCostOfDebtPct}\\%$`,
    `- $\\text{WACC} = (${waccRes.equityWeightPct}\\% \\times ${params.ke}\\%) + (${waccRes.debtWeightPct}\\% \\times ${waccRes.afterTaxCostOfDebtPct}\\%) = \\mathbf{${waccRes.waccPct}\\%}$`,
    ``,
    `### 2. CÔNG THỨC ĐỊNH GIÁ DCF`,
    `$$\\text{Enterprise Value (EV)} = \\sum_{t=1}^{${params.fcffSeries.length}} \\frac{\\text{FCFF}_t}{(1 + \\text{WACC})^t} + \\frac{\\text{TV}_n}{(1 + \\text{WACC})^n}, \\quad \\text{TV}_n = \\frac{\\text{FCFF}_n(1+g)}{\\text{WACC}-g}$$`,
    ``,
    `### 3. BẢNG CHIẾT KHẤU DÒNG TIỀN TỰ DO (FCFF)`,
    `| Kỳ dự phóng | FCFF Dự kiến | Hệ số chiết khấu $DF_t$ | Hiện giá dòng tiền (PV) |`,
    `|:---|:---:|:---:|:---|`,
    ...params.fcffSeries.map(
      (fcff, idx) =>
        `| Năm ${idx + 1} | ${formatVnd(fcff)} | ${dcfRes.discountFactors[idx]} | ${formatVnd(dcfRes.discountedFcffVnd[idx])} |`
    ),
    `| Giá trị vĩnh viễn (TV, $g=${params.g}\\%$) | ${formatVnd(dcfRes.terminalValueVnd)} | ${dcfRes.discountFactors[params.fcffSeries.length - 1]} | ${formatVnd(dcfRes.discountedTerminalValueVnd)} |`,
    `| **Tổng Enterprise Value (EV)** | **-** | **-** | **${formatVnd(dcfRes.enterpriseValueVnd)}** |`,
    ``,
    `### 4. BẮC CẦU GIÁ TRỊ VỐN CHỦ SỞ HỮU (EQUITY BRIDGE)`,
    `- Tổng hiện giá FCFF dự phóng: **${formatVnd(dcfRes.sumDiscountedFcffVnd)}**`,
    `- Hiện giá Terminal Value: **${formatVnd(dcfRes.discountedTerminalValueVnd)}**`,
    `- Trừ đi Nợ vay ròng (Net Debt): **${formatVnd(dcfRes.netDebtVnd)}**`,
    `- Equity Value = **${formatVnd(dcfRes.equityValueVnd)}** / ${params.shares.toLocaleString("vi-VN")} CP = **${formatVnd(dcfRes.fairValuePerShareVnd)}/CP**.`,
  ].join("\n");
}

function buildSixJarsAnswer(net: number, fixed: number, location: string): string {
  const nec = Math.round(net * 0.55);
  const ltss = Math.round(net * 0.1);
  const edu = Math.round(net * 0.1);
  const play = Math.round(net * 0.1);
  const ffa = Math.round(net * 0.1);
  const give = Math.round(net * 0.05);
  const fixedPct = net > 0 ? Math.round((fixed / net) * 100) : 0;

  return [
    `## 🏺 PHÂN BỔ THU NHẬP THEO QUY TẮC 6 CHIẾC LỌ (JARS FRAMEWORK)`,
    `> **Thông số đầu vào:** Lương Net **${formatVnd(net)}/tháng** tại **${location}** | Chi phí cố định: **${formatVnd(fixed)}/tháng** (${fixedPct}% thu nhập).`,
    ``,
    `| Chiếc lọ (Jar) | Tỷ lệ chuẩn | Số tiền/tháng | Mục tiêu sử dụng & Trạng thái |`,
    `|:---|:---:|:---|:---|`,
    `| **1. NEC — Thiết yếu** | 55% | **${formatVnd(nec)}** | Tiền nhà, ăn uống, điện nước (${fixed <= nec ? "Đạt ngưỡng an toàn" : "Đang sát trần, cần tối ưu"}) |`,
    `| **2. FFA — Tự do tài chính** | 10% | **${formatVnd(ffa)}** | Quỹ mở VN30, cổ phiếu tích sản, vàng 9999 tạo thu nhập thụ động |`,
    `| **3. LTSS — Tiết kiệm dài hạn** | 10% | **${formatVnd(ltss)}** | Quỹ khẩn cấp 3-6 tháng, mua xe, cọc mua nhà |`,
    `| **4. EDU — Giáo dục & Kỹ năng** | 10% | **${formatVnd(edu)}** | Sách, khóa học chuyên môn giúp tăng thu nhập chủ động |`,
    `| **5. PLAY — Hưởng thụ** | 10% | **${formatVnd(play)}** | Du lịch, cà phê, giải trí tái tạo năng lượng (tiêu hết mỗi tháng) |`,
    `| **6. GIVE — Cho đi & Đối ngoại** | 5% | **${formatVnd(give)}** | Quà biếu gia đình, hiếu hỉ, thiện nguyện |`,
    ``,
    `### KẾ HOẠCH THỰC THI TỰ ĐỘNG NGÀY NHẬN LƯƠNG`,
    `1. **Tách tài khoản ngay ngày nhận lương (Pay Yourself First):** Chuyển tự động **20% (${formatVnd(ffa + ltss)})** vào 2 ví tiết kiệm/đầu tư riêng biệt trước khi chi tiêu.`,
    `2. **Kiểm soát lọ Thiết yếu (NEC):** Chi phí cố định ${formatVnd(fixed)} đang nằm ${fixed <= nec ? "gọn trong" : "vượt nhẹ"} trần ${formatVnd(nec)}; phần còn lại ${formatVnd(Math.max(0, nec - fixed))} dành cho sinh hoạt biến đổi.`,
  ].join("\n");
}

function buildEmergencyFundAnswer(
  net: number,
  exp: number,
  currentSavings: number,
  monthlySurplus: number
): string {
  const target3m = Math.round(exp * 3);
  const target6m = Math.round(exp * 6);
  const currentMonths = exp > 0 ? Number((currentSavings / exp).toFixed(1)) : 0;
  const gapTo3m = Math.max(0, target3m - currentSavings);
  const monthsTo3m = monthlySurplus > 0 ? Math.ceil(gapTo3m / monthlySurplus) : 0;
  const gapTo6m = Math.max(0, target6m - currentSavings);
  const monthsTo6m = monthlySurplus > 0 ? Math.ceil(gapTo6m / monthlySurplus) : 0;

  return [
    `## 🛡️ THIẾT LẬP QUỸ KHẨN CẤP & ĐỆM AN TOÀN THANH KHOẢN`,
    `> **Hiện trạng:** Chi tiêu sinh hoạt **${formatVnd(exp)}/tháng** (trên lương net ${formatVnd(net)}). Quỹ dự phòng hiện có **${formatVnd(currentSavings)}** — tương đương **${currentMonths} tháng** chi tiêu (chưa đạt ngưỡng sàn 3 tháng).`,
    ``,
    `### 1. CÁC CỘT MỐC CHUẨN AN TOÀN`,
    `$$\\text{Mục tiêu Quỹ Khẩn Cấp} = k \\times \\text{Chi tiêu thiết yếu/tháng} \\quad (k \\in [3, 6])$$`,
    `- **Cột mốc 1 (Mức sàn tối thiểu 3 tháng):** **${formatVnd(target3m)}** → Còn thiếu **${formatVnd(gapTo3m)}** (hoàn thành sau **${monthsTo3m} tháng** nếu trích đều ${formatVnd(monthlySurplus)}/tháng).`,
    `- **Cột mốc 2 (Mức vững chắc đô thị 6 tháng):** **${formatVnd(target6m)}** → Còn thiếu **${formatVnd(gapTo6m)}** (hoàn thành sau **${monthsTo6m} tháng**).`,
    ``,
    `### 2. NƠI LƯU TRỮ & KỶ LUẬT SỬ DỤNG`,
    `1. **Ưu tiên thanh khoản T+0 / T+1:** Gửi tiết kiệm online kỳ hạn ngắn 1-3 tháng chia làm 2-3 sổ nhỏ hoặc tài khoản sinh lời linh hoạt, tuyệt đối **không** đổ quỹ khẩn cấp vào cổ phiếu hay bất động sản.`,
    `2. **Thứ tự ưu tiên vốn:** Tạm giữ tỷ trọng đầu tư rủi ro ở mức tối thiểu cho tới khi hoàn tất tối thiểu **3 tháng (${formatVnd(target3m)})** đệm an toàn.`,
  ].join("\n");
}

function buildOverspendingRescueAnswer(
  net: number,
  fixed: number,
  remainingCash: number,
  daysLeft: number
): string {
  const safeDaily = Math.max(50_000, Math.floor(remainingCash / Math.max(1, daysLeft)));
  const nextMonthSurplus = Math.max(0, Math.round((net - fixed) * 0.35));

  return [
    `## 🚨 KẾ HOẠCH CỨU HỘ DÒNG TIỀN KHẨN CẤP KHI LỠ TIÊU LỐ CUỐI THÁNG`,
    `> **Tình trạng hiện tại:** Thu nhập net **${formatVnd(net)}/tháng**, chi phí cố định **${formatVnd(fixed)}**, số dư khả dụng còn lại **${formatVnd(remainingCash)}** cho **${daysLeft} ngày** cuối tháng.`,
    ``,
    `### 1. NGÂN SÁCH SINH TỒN TỐI GIẢN (${daysLeft} NGÀY TỚI)`,
    `- **Hạn mức chi tiêu tối đa mỗi ngày:** **${formatVnd(safeDaily)}/ngày** (chỉ dành cho ăn uống thiết yếu và di chuyển bắt buộc).`,
    `- **Đóng băng mua sắm tùy hứng (Spend Freeze):** Tắt thông báo sàn TMĐT, hủy toàn bộ đơn hàng không thiết yếu và áp dụng quy tắc chờ 48 giờ.`,
    ``,
    `### 2. CẢNH BÁO CẤM KỴ THANH KHOẢN`,
    `- **Tuyệt đối KHÔNG rút tiền mặt từ thẻ tín dụng hoặc vay app tín dụng đen:** Phí rút mặt 4% + lãi suất 30–36%/năm sẽ kích hoạt vòng xoáy nợ (Debt Spiral) sang tháng kế tiếp.`,
    `- Nếu phát sinh chi phí y tế/khẩn cấp vượt ${formatVnd(remainingCash)}, chỉ tạm ứng từ Quỹ khẩn cấp và hoàn trả ngay ngày nhận lương tháng sau.`,
    ``,
    `### 3. TÁI CẤU TRÚC THÁNG MỚI`,
    `- Ngay ngày nhận lương tháng sau, trích tự động trước **${formatVnd(nextMonthSurplus)}** vào tài khoản tiết kiệm tách biệt, sau đó chia ngân sách sinh hoạt theo tuần để không tái diễn thâm hụt.`,
  ].join("\n");
}

async function main() {
  const multiGoldRaw = JSON.parse(
    fs.readFileSync(MULTI_SCENARIO_GOLD_PATH, "utf-8")
  ) as SftScenarioSample[];
  const qaGoldRaw = JSON.parse(
    fs.readFileSync(QA_GOLD_PATH, "utf-8")
  ) as SftScenarioSample[];

  const records: UnifiedSftRecord[] = [];
  const seenQuestions = new Set<string>();
  const seenIds = new Set<string>();

  function addRecord(rec: UnifiedSftRecord): boolean {
    const userMsg = rec.messages.find((m) => m.role === "user")?.content ?? "";
    const assistantMsg =
      rec.messages.find((m) => m.role === "assistant")?.content ?? "";
    const systemMsg =
      rec.messages.find((m) => m.role === "system")?.content ?? "";

    if (!systemMsg.trim() || !userMsg.trim() || !assistantMsg.trim()) {
      throw new Error(`Empty message in record ${rec.id}`);
    }

    const normQ = normalizeQuestion(userMsg);
    if (seenQuestions.has(normQ)) {
      return false;
    }
    if (seenIds.has(rec.id)) {
      throw new Error(`Duplicate ID detected: ${rec.id}`);
    }

    seenQuestions.add(normQ);
    seenIds.add(rec.id);
    records.push(rec);
    return true;
  }

  // 1. All 10 samples from orca-multi-scenario-sft.json
  for (const sample of multiGoldRaw) {
    addRecord({
      id: sample.id,
      source: "gold_multi_scenario",
      category: sample.category,
      split: "train",
      symbol: sample.structuredScenarioPayload?.symbol,
      messages: [
        {
          role: "system",
          content: sample.systemPrompt ?? SYSTEM_PROMPTS.multiScenarioCro,
        },
        { role: "user", content: sample.question.trim() },
        { role: "assistant", content: formatGoldAssistant(sample) },
      ],
    });
  }

  // 2. All unique samples from orca-qa-gold-sft.json (deduplicating against multi-scenario gold)
  let qaDedupSkipped = 0;
  for (const sample of qaGoldRaw) {
    const added = addRecord({
      id: sample.id,
      source: "gold_adversarial_qa",
      category: sample.category,
      split: "train",
      symbol: sample.structuredScenarioPayload?.symbol,
      messages: [
        {
          role: "system",
          content: sample.systemPrompt ?? SYSTEM_PROMPTS.multiScenarioCro,
        },
        { role: "user", content: sample.question.trim() },
        { role: "assistant", content: formatGoldAssistant(sample) },
      ],
    });
    if (!added) qaDedupSkipped++;
  }

  // 3. Programmatically generated responses for MULTI_SCENARIO_TRAINING_CASES
  const trapAuditIds = new Set([
    "MS_QTR_TRAP_02",
    "MS_PROB_TRAP_01",
    "MS_SKEW_TRAP_01",
    "MS_INV_TRAP_01",
  ]);
  for (const tc of MULTI_SCENARIO_TRAINING_CASES) {
    if (trapAuditIds.has(tc.id)) {
      addRecord({
        id: `ORCA-TRAIN-${tc.id}`,
        source: "training_case_audit",
        category: `audit_${tc.trapCategory}`,
        split: "train",
        symbol: tc.symbol,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS.croAuditor },
          { role: "user", content: tc.question.trim() },
          { role: "assistant", content: buildTrapAuditAnswer(tc) },
        ],
      });
    } else {
      const res = await executeContextualAiPipeline(tc.question, tc.facts);
      if (!res || res.domain !== "multi_scenario_strategy") {
        throw new Error(
          `Expected multi_scenario_strategy for ${tc.id}, got ${res?.domain}`
        );
      }
      addRecord({
        id: `ORCA-TRAIN-${tc.id}`,
        source: "pipeline_multi_scenario",
        category: tc.trapCategory,
        split: "train",
        symbol: tc.symbol,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS.multiScenarioCro },
          { role: "user", content: tc.question.trim() },
          { role: "assistant", content: res.answer.trim() },
        ],
      });
    }
  }

  // 4. Core Vietnamese Quantitative Math Scenarios (PIT Tax, Loan Amortization, Position Sizing, WACC/DCF)
  const pitPrompts = [
    {
      id: "ORCA-MATH-PIT-01",
      q: "Tính thuế TNCN cho lương gross 20 triệu/tháng, độc thân 0 người phụ thuộc.",
    },
    {
      id: "ORCA-MATH-PIT-02",
      q: "Tính thuế TNCN cho lương gross 30 triệu/tháng có 1 người phụ thuộc.",
    },
    {
      id: "ORCA-MATH-PIT-03",
      q: "Tính thuế TNCN cho lương gross 45 triệu/tháng có 2 người phụ thuộc.",
    },
    {
      id: "ORCA-MATH-PIT-04",
      q: "Tính thuế TNCN và lương net từ lương gross 65 triệu/tháng có 1 người phụ thuộc.",
    },
    {
      id: "ORCA-MATH-PIT-05",
      q: "Tính thuế TNCN cho lương gross 110 triệu/tháng có 3 người phụ thuộc.",
    },
  ];
  for (const item of pitPrompts) {
    const res = await executeContextualAiPipeline(item.q);
    if (!res || res.domain !== "math_pit_tax") {
      throw new Error(`Expected math_pit_tax for ${item.id}, got ${res?.domain}`);
    }
    addRecord({
      id: item.id,
      source: "pipeline_quant_math",
      category: "math_pit_tax",
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.quantMath },
        { role: "user", content: item.q },
        { role: "assistant", content: res.answer.trim() },
      ],
    });
  }

  const loanPrompts = [
    {
      id: "ORCA-MATH-LOAN-01",
      q: "Tính lịch trả nợ vay 300 triệu lãi suất 9.5%/năm trong 24 tháng theo dư nợ giảm dần.",
    },
    {
      id: "ORCA-MATH-LOAN-02",
      q: "Tính lịch trả nợ vay 500 triệu lãi suất 8.5%/năm trong 12 tháng.",
    },
    {
      id: "ORCA-MATH-LOAN-03",
      q: "Tính lịch trả nợ vay mua nhà 1.5 tỷ lãi suất 7.8%/năm trong 15 năm.",
    },
    {
      id: "ORCA-MATH-LOAN-04",
      q: "Tính bảng trả nợ vay 2.2 tỷ lãi suất 10.2%/năm trong 20 năm.",
    },
  ];
  for (const item of loanPrompts) {
    const res = await executeContextualAiPipeline(item.q);
    if (!res || res.domain !== "math_loan_amortization") {
      throw new Error(
        `Expected math_loan_amortization for ${item.id}, got ${res?.domain}`
      );
    }
    addRecord({
      id: item.id,
      source: "pipeline_quant_math",
      category: "math_loan_amortization",
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.quantMath },
        { role: "user", content: item.q },
        { role: "assistant", content: res.answer.trim() },
      ],
    });
  }

  const positionPrompts = [
    {
      id: "ORCA-MATH-POS-01",
      q: "Tính khối lượng vào lệnh vốn 150 triệu, giá mua 32000 cắt lỗ 29800 theo quy tắc rủi ro 2%.",
    },
    {
      id: "ORCA-MATH-POS-02",
      q: "Tính khối lượng vào lệnh vốn 200 triệu, giá 25000 cắt lỗ 23000 mục tiêu 30000.",
    },
    {
      id: "ORCA-MATH-POS-03",
      q: "Tính khối lượng vị thế cổ phiếu vốn 500 triệu, giá vào 135000 cắt lỗ 127000.",
    },
  ];
  for (const item of positionPrompts) {
    const res = await executeContextualAiPipeline(item.q);
    if (!res || res.domain !== "math_position_sizing") {
      throw new Error(
        `Expected math_position_sizing for ${item.id}, got ${res?.domain}`
      );
    }
    addRecord({
      id: item.id,
      source: "pipeline_quant_math",
      category: "math_position_sizing",
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.quantMath },
        { role: "user", content: item.q },
        { role: "assistant", content: res.answer.trim() },
      ],
    });
  }

  // WACC & DCF (1 directly from executeContextualAiPipeline + 2 parameterized exact DCF models)
  const hpgDcfRes = await executeContextualAiPipeline(
    "Định giá DCF và chi phí vốn WACC cho cổ phiếu HPG"
  );
  if (!hpgDcfRes || hpgDcfRes.domain !== "math_wacc_dcf") {
    throw new Error("Expected math_wacc_dcf for HPG");
  }
  addRecord({
    id: "ORCA-MATH-DCF-01",
    source: "pipeline_quant_math",
    category: "math_wacc_dcf",
    split: "train",
    symbol: "HPG",
    messages: [
      { role: "system", content: SYSTEM_PROMPTS.valuationCfa },
      {
        role: "user",
        content: "Định giá DCF và chi phí vốn WACC cho cổ phiếu HPG",
      },
      { role: "assistant", content: hpgDcfRes.answer.trim() },
    ],
  });

  addRecord({
    id: "ORCA-MATH-DCF-02",
    source: "pipeline_quant_math",
    category: "math_wacc_dcf",
    split: "train",
    symbol: "FPT",
    messages: [
      { role: "system", content: SYSTEM_PROMPTS.valuationCfa },
      {
        role: "user",
        content:
          "Tính WACC và định giá DCF cho doanh nghiệp công nghệ kiểu FPT với vốn chủ 120 tỷ, nợ vay 15 tỷ, Ke=13%, Kd=7.5%, thuế 20%, FCFF 3 năm [18, 22, 27] tỷ, g=4%, nợ ròng -20 tỷ, 5 triệu cổ phiếu.",
      },
      {
        role: "assistant",
        content: buildCustomWaccDcfAnswer({
          symbol: "FPT",
          companyName: "Công nghệ Tăng trưởng",
          equityVal: 120_000_000_000,
          debtVal: 15_000_000_000,
          ke: 13.0,
          kd: 7.5,
          tax: 20,
          fcffSeries: [18_000_000_000, 22_000_000_000, 27_000_000_000],
          g: 4.0,
          netDebt: -20_000_000_000,
          shares: 5_000_000,
        }),
      },
    ],
  });

  addRecord({
    id: "ORCA-MATH-DCF-03",
    source: "pipeline_quant_math",
    category: "math_wacc_dcf",
    split: "train",
    symbol: "MWG",
    messages: [
      { role: "system", content: SYSTEM_PROMPTS.valuationCfa },
      {
        role: "user",
        content:
          "Tính WACC và định giá DCF cho doanh nghiệp bán lẻ kiểu MWG với vốn chủ 70 tỷ, nợ vay 30 tỷ, Ke=14%, Kd=9%, thuế 20%, FCFF 3 năm [10, 13, 16] tỷ, g=3.5%, nợ ròng 10 tỷ, 4 triệu cổ phiếu.",
      },
      {
        role: "assistant",
        content: buildCustomWaccDcfAnswer({
          symbol: "MWG",
          companyName: "Bán lẻ Tiêu dùng",
          equityVal: 70_000_000_000,
          debtVal: 30_000_000_000,
          ke: 14.0,
          kd: 9.0,
          tax: 20,
          fcffSeries: [10_000_000_000, 13_000_000_000, 16_000_000_000],
          g: 3.5,
          netDebt: 10_000_000_000,
          shares: 4_000_000,
        }),
      },
    ],
  });

  // 5. Personal Finance Stress Scenarios (Housing loan, FIRE, Dependents, Toxic debt, 6 jars, Emergency fund, Overspending rescue)
  const pfCases: Array<{
    id: string;
    category: string;
    q: string;
    facts: SnapshotFacts;
    expectedTopic: string;
    expectedDomain?: string;
  }> = [
    {
      id: "ORCA-PF-01",
      category: "personal_finance_housing",
      q: "Thu nhập thực nhận 35 triệu/tháng tại Thành phố Hồ Chí Minh, muốn vay mua nhà 2.5 tỷ thì dòng tiền có gánh nổi không?",
      facts: {
        netIncome: 35_000_000,
        totalExpenses: 17_000_000,
        fixedExpenses: 11_000_000,
        fixedCostRatio: 31,
        monthlySavings: 18_000_000,
        savingsRate: 51.4,
        emergencyFundMonths: 4.0,
        location: "TP.HCM",
      },
      expectedTopic: "housing_loan",
    },
    {
      id: "ORCA-PF-02",
      category: "personal_finance_housing",
      q: "Lương thực nhận 22 triệu/tháng tại Hà Nội, chi phí cố định 13 triệu, có nên vay mua nhà 2 tỷ lúc này không?",
      facts: {
        netIncome: 22_000_000,
        totalExpenses: 16_000_000,
        fixedExpenses: 13_000_000,
        fixedCostRatio: 59,
        monthlySavings: 6_000_000,
        savingsRate: 27.3,
        emergencyFundMonths: 2.0,
        location: "Hà Nội",
      },
      expectedTopic: "housing_loan",
    },
    {
      id: "ORCA-PF-03",
      category: "personal_finance_fire",
      q: "Thu nhập thực nhận 45 triệu/tháng, chi tiêu 20 triệu/tháng, cần lộ trình tự do tài chính FIRE nghỉ hưu sớm thế nào?",
      facts: {
        netIncome: 45_000_000,
        totalExpenses: 20_000_000,
        fixedExpenses: 12_000_000,
        monthlySavings: 25_000_000,
        savingsRate: 55.6,
        emergencyFundMonths: 6.0,
        location: "TP.HCM",
      },
      expectedTopic: "fire_retirement",
    },
    {
      id: "ORCA-PF-04",
      category: "personal_finance_family",
      q: "Gia đình có 2 con nhỏ tại Thành phố Hồ Chí Minh, thu nhập 38 triệu/tháng và chi tiêu 24 triệu/tháng nên lập kế hoạch tài chính gia đình và quỹ học vấn thế nào?",
      facts: {
        netIncome: 38_000_000,
        totalExpenses: 24_000_000,
        fixedExpenses: 16_000_000,
        monthlySavings: 14_000_000,
        dependents: 2,
        emergencyFundMonths: 2.5,
        location: "TP.HCM",
      },
      expectedTopic: "family_dependents",
    },
    {
      id: "ORCA-PF-05",
      category: "personal_finance_stress",
      q: "Lương thực nhận 22 triệu/tháng tại Thành phố Hồ Chí Minh, đang nợ thẻ tín dụng 65 triệu lãi 34%/năm nhưng muốn vay trả góp 20 triệu mua laptop mới. Nên xử lý dòng tiền ra sao?",
      facts: {
        netIncome: 22_000_000,
        totalExpenses: 16_000_000,
        fixedExpenses: 11_000_000,
        monthlySavings: 6_000_000,
        totalDebt: 65_000_000,
        location: "TP.HCM",
      },
      expectedTopic: "toxic_debt_rescue",
      expectedDomain: "toxic_debt_rescue",
    },
  ];

  for (const pf of pfCases) {
    const res = await executeContextualAiPipeline(pf.q, pf.facts);
    if (
      !res ||
      (pf.expectedDomain
        ? res.domain !== pf.expectedDomain
        : res.domain !== "personal_finance") ||
      res.personalTopic !== pf.expectedTopic
    ) {
      throw new Error(
        `Unexpected routing for ${pf.id}: domain=${res?.domain}, topic=${res?.personalTopic}`
      );
    }
    addRecord({
      id: pf.id,
      source: "pipeline_personal_finance",
      category: pf.category,
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.personalFinance },
        { role: "user", content: pf.q },
        { role: "assistant", content: res.answer.trim() },
      ],
    });
  }

  // Deterministic Personal Finance scenarios where contextual engine routes to generic fallback
  addRecord({
    id: "ORCA-PF-06",
    source: "pipeline_personal_finance",
    category: "personal_finance_jars",
    split: "train",
    messages: [
      { role: "system", content: SYSTEM_PROMPTS.personalFinance },
      {
        role: "user",
        content:
          "Hãy áp dụng quy tắc 6 chiếc lọ JARS cho mức lương net 24 triệu/tháng tại TP.HCM với chi phí cố định 12 triệu/tháng.",
      },
      {
        role: "assistant",
        content: buildSixJarsAnswer(24_000_000, 12_000_000, "TP.HCM"),
      },
    ],
  });

  addRecord({
    id: "ORCA-PF-07",
    source: "pipeline_personal_finance",
    category: "personal_finance_emergency",
    split: "train",
    messages: [
      { role: "system", content: SYSTEM_PROMPTS.personalFinance },
      {
        role: "user",
        content:
          "Thu nhập 28 triệu/tháng, chi tiêu 18 triệu/tháng, mới tích lũy được 20 triệu thì cần xây dựng quỹ khẩn cấp bao nhiêu và trong bao lâu?",
      },
      {
        role: "assistant",
        content: buildEmergencyFundAnswer(
          28_000_000,
          18_000_000,
          20_000_000,
          10_000_000
        ),
      },
    ],
  });

  addRecord({
    id: "ORCA-PF-08",
    source: "pipeline_personal_finance",
    category: "personal_finance_overspending",
    split: "train",
    messages: [
      { role: "system", content: SYSTEM_PROMPTS.personalFinance },
      {
        role: "user",
        content:
          "Lương 18 triệu/tháng, chi cố định 9 triệu, mới ngày 20 trong tháng nhưng lỡ tiêu lố chỉ còn 1.5 triệu cho 10 ngày cuối tháng thì cứu dòng tiền thế nào?",
      },
      {
        role: "assistant",
        content: buildOverspendingRescueAnswer(18_000_000, 9_000_000, 1_500_000, 10),
      },
    ],
  });

  // 6. Diverse VN Tickers via executeContextualAiPipeline() (Multi-scenario Bull/Base/Bear + 3 Timeframes + CRO Gate)
  const tickerQueries: Array<{
    id: string;
    symbol: string;
    category: string;
    q: string;
    facts?: SnapshotFacts;
  }> = [
    {
      id: "ORCA-MS-LIVE-01",
      symbol: "ACB",
      category: "banking_multi_scenario",
      q: "Phân tích đa kịch bản Bull Base Bear và đa khung thời gian (T+2.5, trung hạn 1-2 quý, dài hạn 1-3 năm) cho cổ phiếu ngân hàng ACB.",
    },
    {
      id: "ORCA-MS-LIVE-02",
      symbol: "TCB",
      category: "banking_multi_scenario",
      q: "Lập mô hình 3 kịch bản Bull/Base/Bear đa khung thời gian và kiểm toán CRO cho cổ phiếu ngân hàng TCB.",
    },
    {
      id: "ORCA-MS-LIVE-03",
      symbol: "MBB",
      category: "banking_multi_scenario",
      q: "Đánh giá đa kịch bản Bull Base Bear và ma trận đa khung thời gian T+2.5, trung hạn, dài hạn cho cổ phiếu MBB.",
    },
    {
      id: "ORCA-MS-LIVE-04",
      symbol: "VCB",
      category: "banking_multi_scenario",
      q: "Phân tích đa kịch bản Bull Base Bear và đa khung thời gian cho cổ phiếu phòng thủ VCB khi quỹ khẩn cấp cá nhân mới đạt 2 tháng chi tiêu.",
      facts: {
        netIncome: 30_000_000,
        monthlySavings: 8_000_000,
        emergencyFundMonths: 2.0,
        totalDebt: 0,
      },
    },
    {
      id: "ORCA-MS-LIVE-05",
      symbol: "VNM",
      category: "defensive_multi_scenario",
      q: "Xây dựng 3 kịch bản Bull Base Bear đa khung thời gian T+2.5, 1-2 quý, 1-3 năm cho cổ phiếu phòng thủ VNM.",
    },
    {
      id: "ORCA-MS-LIVE-06",
      symbol: "MWG",
      category: "retail_multi_scenario",
      q: "Phân tích đa kịch bản Bull Base Bear và ma trận đa khung thời gian kèm kiểm định CRO cho cổ phiếu bán lẻ MWG.",
    },
    {
      id: "ORCA-MS-LIVE-07",
      symbol: "PNJ",
      category: "retail_multi_scenario",
      q: "Lập ma trận 3 kịch bản Bull Base Bear và đa khung thời gian (ngắn hạn T+2.5, trung hạn, dài hạn) cho cổ phiếu PNJ.",
    },
    {
      id: "ORCA-MS-LIVE-08",
      symbol: "DGC",
      category: "industrial_multi_scenario",
      q: "Đánh giá đa kịch bản Bull/Base/Bear và đa khung thời gian T+2.5, trung hạn BCTC, dài hạn cho cổ phiếu hóa chất DGC.",
    },
    {
      id: "ORCA-MS-LIVE-09",
      symbol: "GAS",
      category: "energy_multi_scenario",
      q: "Phân tích 3 kịch bản Bull Base Bear đa khung thời gian và phòng vệ Bear cho cổ phiếu dầu khí GAS.",
    },
    {
      id: "ORCA-MS-LIVE-10",
      symbol: "KDH",
      category: "realestate_multi_scenario",
      q: "Xây dựng mô hình đa kịch bản Bull Base Bear và stress test thanh khoản T+2.5 đa khung thời gian cho cổ phiếu bất động sản KDH.",
    },
    {
      id: "ORCA-MS-LIVE-11",
      symbol: "VCI",
      category: "securities_multi_scenario",
      q: "Lập mô hình 3 kịch bản Bull/Base/Bear đa khung thời gian cho cổ phiếu chứng khoán beta cao VCI.",
    },
    {
      id: "ORCA-MS-LIVE-12",
      symbol: "SHS",
      category: "hnx_stress_multi_scenario",
      q: "Stress test kịch bản đa khung thời gian (T+2.5, trung hạn, dài hạn) cho cổ phiếu chứng khoán sàn HNX là SHS khi thị trường biến động mạnh.",
    },
    {
      id: "ORCA-MS-LIVE-13",
      symbol: "GMD",
      category: "logistics_multi_scenario",
      q: "Phân tích đa kịch bản Bull Base Bear và đa khung thời gian (T+2.5, 1-2 quý, 1-3 năm) cho cổ phiếu cảng biển GMD.",
    },
  ];

  for (const tq of tickerQueries) {
    const res = await executeContextualAiPipeline(tq.q, tq.facts);
    if (!res || res.domain !== "multi_scenario_strategy" || res.symbols?.[0] !== tq.symbol) {
      throw new Error(
        `Expected multi_scenario_strategy for ${tq.id} (${tq.symbol}), got domain=${res?.domain} symbols=${JSON.stringify(res?.symbols)}`
      );
    }
    addRecord({
      id: tq.id,
      source: "pipeline_multi_scenario",
      category: tq.category,
      split: "train",
      symbol: tq.symbol,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.multiScenarioCro },
        { role: "user", content: tq.q },
        { role: "assistant", content: res.answer.trim() },
      ],
    });
  }

  // --- SFT DATASET V2: Screener Filter Extensions ---
  const screenerCases = getScreenerFilterCases();
  for (const sc of screenerCases) {
    addRecord({
      id: sc.id,
      source: "pipeline_screener_filter",
      category: sc.category,
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.screenerQuant },
        { role: "user", content: sc.q },
        { role: "assistant", content: sc.a.trim() },
      ],
    });
  }

  // --- SFT DATASET V2: Commodity Macro Extensions ---
  const commodityCases = getCommodityMacroCases();
  for (const cc of commodityCases) {
    addRecord({
      id: cc.id,
      source: "pipeline_commodity_macro",
      category: cc.category,
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.commodityMacro },
        { role: "user", content: cc.q },
        { role: "assistant", content: cc.a.trim() },
      ],
    });
  }

  // --- SFT DATASET V2: Forensic Risk & Accounting Extensions ---
  const forensicCases = getForensicRiskCases();
  for (const fc of forensicCases) {
    addRecord({
      id: fc.id,
      source: "pipeline_forensic_risk",
      category: fc.category,
      split: "train",
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.forensicRisk },
        { role: "user", content: fc.q },
        { role: "assistant", content: fc.a.trim() },
      ],
    });
  }

  // Deterministic stratified train/eval split (~16.7% eval across sources)
  const categoryBucketCounts = new Map<string, number>();
  for (const rec of records) {
    const idxInBucket = categoryBucketCounts.get(rec.source) ?? 0;
    categoryBucketCounts.set(rec.source, idxInBucket + 1);
    rec.split = idxInBucket % 5 === 4 ? "eval" : "train";
  }

  // Ensure output directories exist
  fs.mkdirSync(path.dirname(UNIFIED_OUTPUT_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(PURE_CHATML_OUTPUT_PATH), { recursive: true });

  // Write JSONL files
  const unifiedLines = records.map((r) => JSON.stringify(r));
  const pureChatMlLines = records.map((r) =>
    JSON.stringify({ messages: r.messages } satisfies PureChatMlRecord)
  );

  fs.writeFileSync(UNIFIED_OUTPUT_PATH, unifiedLines.join("\n") + "\n", "utf-8");
  fs.writeFileSync(
    PURE_CHATML_OUTPUT_PATH,
    pureChatMlLines.join("\n") + "\n",
    "utf-8"
  );

  // Strict post-write validation
  const unifiedParsed = fs
    .readFileSync(UNIFIED_OUTPUT_PATH, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as UnifiedSftRecord);

  const pureParsed = fs
    .readFileSync(PURE_CHATML_OUTPUT_PATH, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as PureChatMlRecord);

  if (unifiedParsed.length !== pureParsed.length) {
    throw new Error("Line count mismatch between unified and pure JSONL files!");
  }

  const userPromptsCheck = new Set<string>();
  let multiScenarioCount = 0;
  let multiScenarioWithCoreTokens = 0;
  let minAssistantLen = Infinity;
  let maxAssistantLen = 0;
  let sumAssistantLen = 0;

  for (const rec of unifiedParsed) {
    if (
      rec.messages.length !== 3 ||
      rec.messages[0].role !== "system" ||
      rec.messages[1].role !== "user" ||
      rec.messages[2].role !== "assistant"
    ) {
      throw new Error(`Invalid ChatML structure in ${rec.id}`);
    }
    const normU = normalizeQuestion(rec.messages[1].content);
    if (userPromptsCheck.has(normU)) {
      throw new Error(`Duplicate user prompt detected in output: ${rec.id}`);
    }
    userPromptsCheck.add(normU);

    const aLen = rec.messages[2].content.length;
    minAssistantLen = Math.min(minAssistantLen, aLen);
    maxAssistantLen = Math.max(maxAssistantLen, aLen);
    sumAssistantLen += aLen;

    if (/Bull|Base|Bear/i.test(rec.messages[2].content)) {
      multiScenarioCount++;
      const hasProb = /100(\.00)?%|1\.00/.test(rec.messages[2].content);
      const hasEr = /E\[R\]/.test(rec.messages[2].content);
      const hasT25 = /T\+2\.?5/i.test(rec.messages[2].content);
      if (hasProb && hasEr && hasT25) {
        multiScenarioWithCoreTokens++;
      }
    }
  }

  const unifiedBytes = fs.statSync(UNIFIED_OUTPUT_PATH).size;
  const pureBytes = fs.statSync(PURE_CHATML_OUTPUT_PATH).size;
  const trainCount = unifiedParsed.filter((r) => r.split === "train").length;
  const evalCount = unifiedParsed.filter((r) => r.split === "eval").length;

  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const r of unifiedParsed) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }

  console.log("=== ORCA-FA UNIFIED SFT DATASET BUILD REPORT ===");
  console.log(`Total deduplicated records: ${unifiedParsed.length}`);
  console.log(`QA gold duplicates skipped: ${qaDedupSkipped}`);
  console.log(`Train / Eval split: ${trainCount} train (${((trainCount / unifiedParsed.length) * 100).toFixed(1)}%) / ${evalCount} eval (${((evalCount / unifiedParsed.length) * 100).toFixed(1)}%)`);
  console.log(`Unified JSONL: ${UNIFIED_OUTPUT_PATH} (${unifiedBytes.toLocaleString("en-US")} bytes)`);
  console.log(`Pure ChatML JSONL: ${PURE_CHATML_OUTPUT_PATH} (${pureBytes.toLocaleString("en-US")} bytes)`);
  console.log(`Assistant response chars: min=${minAssistantLen}, avg=${Math.round(sumAssistantLen / unifiedParsed.length)}, max=${maxAssistantLen}`);
  console.log(`Multi-scenario records with Bull/Base/Bear + 100% + E[R] + T+2.5: ${multiScenarioWithCoreTokens}/${multiScenarioCount}`);
  console.log("Source breakdown:", JSON.stringify(bySource, null, 2));
  console.log("Category breakdown:", JSON.stringify(byCategory, null, 2));
}

main().catch((err) => {
  console.error("Failed to build unified SFT dataset:", err);
  process.exit(1);
});
