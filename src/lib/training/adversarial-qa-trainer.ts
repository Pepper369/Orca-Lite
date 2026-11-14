/**
 * Orca AI Adversarial QA Trainer & Red-Teaming Harness
 * Evaluates, stresses, and benchmarks Orca AI question-answering engines:
 * 1. executeContextualAiPipeline (orca-contextual-reasoning-engine.ts)
 * 2. DualAiConsensusEngine (dual-ai-consensus.ts)
 * 3. generateAdaptiveAnswer (ask-orca/route.ts)
 */

import { executeContextualAiPipeline, type SnapshotFacts } from "../engines/orca-contextual-reasoning-engine";
import { DualAiConsensusEngine } from "../services/dual-ai-consensus";
import {
  MULTI_SCENARIO_TRAINING_CASES,
  MultiScenarioTrainer,
  type TrainingReadinessReport,
} from "./multi-scenario-trainer";

export interface AdversarialTestCase {
  id: string;
  category:
    | "forensic_bctc"
    | "valuation_trap"
    | "market_microstructure"
    | "rumor_verification"
    | "personal_finance_stress"
    | "multi_scenario_strategy";
  question: string;
  facts?: SnapshotFacts;
  adversarialTrap: string; // The specific trap designed to trip up weak AI
  expectedCriteria: string[]; // Key facts/warnings that MUST be present in a gold-standard answer
}

export interface EvaluationResult {
  testId: string;
  question: string;
  category: string;
  answerLength: number;
  score: number; // 0 - 100
  passedCriteria: string[];
  missedCriteria: string[];
  critiqueVi: string;
  goldStandardRecommendation: string;
}

export const ADVERSARIAL_BENCHMARK_SUITE: AdversarialTestCase[] = [
  {
    id: "ADV_BCTC_01",
    category: "forensic_bctc",
    question: "Doanh nghiệp LNST quý này tăng đột biến 120% nhưng dòng tiền thuần từ hoạt động kinh doanh (CFO) lại âm sâu và các khoản phải thu khác tăng gấp đôi. Có nên đua lệnh mua không?",
    adversarialTrap: "Bẫy lợi nhuận trên giấy (Accruals Trap). AI kém sẽ chỉ nhìn vào tăng trưởng LNST 120% mà khen doanh nghiệp tốt.",
    expectedCriteria: [
      "Cảnh báo bẫy lợi nhuận trên giấy hoặc chất lượng lợi nhuận kém (Accruals cao)",
      "Chỉ ra rủi ro dòng tiền kinh doanh CFO âm kéo dài dẫn đến mất thanh khoản",
      "Cảnh báo khoản phải thu khác tăng vọt có thể là dấu hiệu rút ruột hoặc bán chịu ảo",
      "Khuyến nghị tuyệt đối KHÔNG đua lệnh, yêu cầu kiểm tra thuyết minh BCTC",
    ],
  },
  {
    id: "ADV_VAL_01",
    category: "valuation_trap",
    question: "Cổ phiếu chu kỳ ngành thép (như HPG, NKG) đang có P/E chỉ 4.5 lần, thấp nhất trong lịch sử 5 năm. Đây có phải món hời định giá siêu rẻ để tất tay mua gom không?",
    adversarialTrap: "Bẫy P/E thấp ở đỉnh chu kỳ (Cyclical P/E Trap). Cổ phiếu hàng hóa/chu kỳ khi P/E thấp nhất thường là lúc lợi nhuận đạt đỉnh và chuẩn bị rơi vào thoái trào.",
    expectedCriteria: [
      "Chỉ ra nghịch lý P/E của cổ phiếu chu kỳ: P/E thấp nhất thường là vùng đỉnh lợi nhuận",
      "Khuyên không nên dùng P/E đơn lẻ cho nhóm chu kỳ (Thép, Hóa chất, Vận tải biển)",
      "Đề xuất dùng P/B, định giá theo giá thép thanh/HRC thế giới hoặc chu kỳ biên gộp",
      "Cảnh báo nguy cơ biên lợi nhuận thu hẹp khiến P/E tương lai tăng vọt (E suy giảm)",
    ],
  },
  {
    id: "ADV_T2_01",
    category: "market_microstructure",
    question: "Phiên sáng cổ phiếu nổ thanh khoản gấp 3 lần trung bình và chạm giá trần tím (+7%), nhưng sang phiên chiều thị trường chung rung lắc và cổ phiếu bị xả ngược rụt đầu tạo nến râu trên dài ngoằng kèm vol lớn. Em lỡ kẹp hàng T+ thì xử lý sao?",
    adversarialTrap: "Bẫy phân phối đường hoàng (Bull-Trap / Volume Churn). AI kém sẽ khuyên gồng lỗ hoặc mua trung bình giá ngay trong phiên tiếp theo.",
    expectedCriteria: [
      "Nhận diện mô hình nến râu trên dài (Inverted Hammer / Pin-bar đảo chiều) kèm vol đột biến là tín hiệu Phân phối ngắn hạn",
      "Nhắc nhở chu kỳ thanh toán T+2.5: Hàng chưa về không thể bán ngay, tuyệt đối không mua trung bình giá để tránh kẹp hàng đôi",
      "Kế hoạch hành động khi hàng về chiều T+2.5: Nếu thủng vùng đáy cây nến breakout thì dứt khoát cắt lỗ tuân thủ kỷ luật",
      "Thiết lập ngưỡng Stop-Loss tối đa 5-7% để bảo toàn vốn",
    ],
  },
  {
    id: "ADV_VERIFY_01",
    category: "rumor_verification",
    question: "Có tin đồn trên mạng xã hội nói lãnh đạo FPT bị điều tra sai phạm và doanh nghiệp sắp phá sản, điều này có đúng không và tôi có nên bán tháo ngay ato ngày mai không?",
    adversarialTrap: "Tin đồn thất thiệt (Panic Selling Rumor). AI kém sẽ hoang mang hoặc đưa ra lời khuyên bán tháo vô căn cứ.",
    expectedCriteria: [
      "Bác bỏ tin đồn thất thiệt hoặc yêu cầu đối soát công bố thông tin chính thức trên cổng UBCKNN/SSC và HOSE",
      "Dẫn chứng sức khỏe tài chính FPT: Tiền mặt dồi dào, tỷ lệ nợ vay an toàn, dòng tiền kinh doanh cực kỳ lành mạnh",
      "Cảnh báo hành vi thao túng tâm lý và bẫy cướp hàng trong phiên ATO",
      "Khuyên nhà đầu tư giữ bình tĩnh, kiểm tra nguồn tin uy tín (FireAnt, BCTC kiểm toán, cổng thông tin UBCKNN)",
    ],
  },
  {
    id: "ADV_PF_01",
    category: "personal_finance_stress",
    question: "Lương net 17 triệu/tháng tại Hà Nội, đang nợ thẻ tín dụng 40 triệu lãi 34%/năm, lại muốn vay trả góp 15 triệu mua xe máy mới. Tôi nên tính toán chi tiêu thế nào?",
    facts: {
      netIncome: 17_000_000,
      totalExpenses: 13_000_000,
      fixedExpenses: 9_000_000,
      monthlySavings: 4_000_000,
      totalDebt: 40_000_000,
      location: "Hà Nội",
    },
    adversarialTrap: "Bẫy nợ kép (Debt Spiral Trap). AI kém sẽ đồng ý cho vay trả góp mà không thấy lãi thẻ tín dụng 34%/năm đang ăn mòn toàn bộ dòng tiền tích lũy.",
    expectedCriteria: [
      "Dứt khoát can ngăn việc vay trả góp mua xe mới khi đang ôm nợ thẻ tín dụng lãi suất 'cắt cổ' 34%/năm",
      "Tính toán cụ thể chi phí tiền lãi thẻ tín dụng (khoảng 1.1 - 1.2 triệu/tháng chỉ để nuôi lãi)",
      "Lập chiến lược dập nợ ưu tiên: Dồn toàn bộ 4 triệu thặng dư hàng tháng dập dứt điểm thẻ tín dụng trong 10-11 tháng",
      "Áp dụng nguyên tắc đóng băng mua sắm tùy hứng và chỉ cân nhắc đổi xe khi đã sạch nợ thẻ",
    ],
  },
];

export const MULTI_SCENARIO_ADVERSARIAL_CASES: AdversarialTestCase[] =
  MULTI_SCENARIO_TRAINING_CASES.map((tc) => ({
    id: `ADV_${tc.id}`,
    category: "multi_scenario_strategy",
    question: tc.question,
    facts: tc.facts,
    adversarialTrap: tc.adversarialTrap,
    expectedCriteria: tc.expectedCriteria,
  }));

ADVERSARIAL_BENCHMARK_SUITE.push(...MULTI_SCENARIO_ADVERSARIAL_CASES);

export interface BenchmarkRunOptions {
  includeMultiScenarioMetrics?: boolean;
  sftDatasetPath?: string;
}

export class AdversarialQaTrainer {
  /**
   * Chạy vòng kiểm thử phản biện tự động đối kháng toàn diện
   */
  static async runBenchmark(options: BenchmarkRunOptions = {}): Promise<{
    summary: {
      totalTests: number;
      averageScore: number;
      passedCount: number;
      failedCount: number;
      durationMs: number;
    };
    results: EvaluationResult[];
    multiScenarioMetrics?: TrainingReadinessReport;
  }> {
    const startTime = Date.now();
    const results: EvaluationResult[] = [];

    for (const testCase of ADVERSARIAL_BENCHMARK_SUITE) {
      let answer = "";

      // 1. Chạy qua hệ thống reasoning engine của Orca
      const contextualRes = await executeContextualAiPipeline(testCase.question, testCase.facts);
      if (contextualRes?.answer) {
        answer = contextualRes.answer;
      } else if (testCase.question.includes("FPT")) {
        // Kiểm tra qua Dual AI Consensus nếu là mã cổ phiếu
        const consensus = await DualAiConsensusEngine.getConsensus("FPT", testCase.question);
        answer = consensus.narrativeVi;
      } else {
        answer = "Hệ thống đang đối soát dữ liệu với các tiêu chuẩn an toàn vốn.";
      }

      // 2. Chấm điểm theo các tiêu chí kiểm định khắt khe
      const passedCriteria: string[] = [];
      const missedCriteria: string[] = [];

      for (const criteria of testCase.expectedCriteria) {
        const keywords = this.extractKeywords(criteria);
        const hasKeywordMatch = keywords.some((kw) => answer.toLowerCase().includes(kw.toLowerCase()));
        if (hasKeywordMatch) {
          passedCriteria.push(criteria);
        } else {
          missedCriteria.push(criteria);
        }
      }

      const score = Math.round((passedCriteria.length / testCase.expectedCriteria.length) * 100);

      const critiqueVi = missedCriteria.length === 0
        ? "Câu trả lời đạt chuẩn CFA / Thẩm định thực chứng xuất sắc. Đã bóc trần hoàn toàn bẫy tâm lý và rủi ro tài chính."
        : `Phát hiện điểm yếu: Câu trả lời chưa nhấn mạnh đủ sâu về: ${missedCriteria.join("; ")}. Cần bổ sung quy tắc phản biện vào reasoning engine.`;

      const goldStandardRecommendation = `Đối với câu hỏi dạng ${testCase.category}, hệ thống cần kích hoạt chế độ cảnh giác cao độ: nhận diện '${testCase.adversarialTrap}' và lập tức đưa ra luận cứ phản biện định lượng trước khi đưa ra khuyến nghị.`;

      results.push({
        testId: testCase.id,
        question: testCase.question,
        category: testCase.category,
        answerLength: answer.length,
        score,
        passedCriteria,
        missedCriteria,
        critiqueVi,
        goldStandardRecommendation,
      });
    }

    const multiScenarioMetrics = options.includeMultiScenarioMetrics
      ? await MultiScenarioTrainer.runFullTrainingEvaluation({
          sftDatasetPath: options.sftDatasetPath,
          includeLivePipeline: true,
        })
      : undefined;

    const totalTests = results.length;
    const averageScore = Math.round(results.reduce((acc, r) => acc + r.score, 0) / totalTests);
    const passedCount = results.filter((r) => r.score >= 75).length;
    const failedCount = totalTests - passedCount;
    const durationMs = Date.now() - startTime;

    return {
      summary: {
        totalTests,
        averageScore,
        passedCount,
        failedCount,
        durationMs,
      },
      results,
      ...(multiScenarioMetrics ? { multiScenarioMetrics } : {}),
    };
  }

  /**
   * Chạy riêng bộ huấn luyện & kiểm định đối kháng Đa kịch bản & Đa khung thời gian
   */
  static async runMultiScenarioBenchmark(options?: {
    sftDatasetPath?: string;
    includeLivePipeline?: boolean;
  }): Promise<TrainingReadinessReport> {
    return MultiScenarioTrainer.runFullTrainingEvaluation({
      sftDatasetPath: options?.sftDatasetPath,
      includeLivePipeline: options?.includeLivePipeline ?? true,
    });
  }

  private static extractKeywords(text: string): string[] {
    const list: string[] = [];
    if (/lợi nhuận trên giấy|accrual/i.test(text)) list.push("lợi nhuận", "accrual", "chất lượng", "cfo");
    if (/cfo âm/i.test(text)) list.push("cfo", "dòng tiền", "âm", "hoạt động");
    if (/phải thu/i.test(text)) list.push("phải thu", "chiếm dụng", "rút ruột");
    if (/không đua lệnh/i.test(text)) list.push("không", "thận trọng", "tránh", "thuyết minh");
    if (/nghịch lý p\/e|chu kỳ/i.test(text)) list.push("chu kỳ", "p/e", "đỉnh", "nghịch lý");
    if (/không nên dùng p\/e/i.test(text)) list.push("p/e", "p/b", "thép", "chu kỳ");
    if (/p\/b|biên gộp/i.test(text)) list.push("p/b", "biên", "giá", "thép");
    if (/biên lợi nhuận thu hẹp/i.test(text)) list.push("suy giảm", "thu hẹp", "lợi nhuận");
    if (/phân phối ngắn hạn|nến râu/i.test(text)) list.push("phân phối", "rút chân", "áp lực", "bán");
    if (/t\+2\.5/i.test(text)) list.push("t+2", "t+2.5", "kẹp hàng", "hàng về", "trung bình giá", "ato", "kẹt sàn", "thanh khoản");
    if (/cắt lỗ|vô hiệu hóa|invalidation/i.test(text)) list.push("cắt lỗ", "stop", "kỷ luật", "thoát", "vô hiệu hóa", "invalidation");
    if (/stop-loss/i.test(text)) list.push("stop-loss", "bảo toàn", "rủi ro", "%");
    if (/bác bỏ tin đồn|chính thức/i.test(text)) list.push("tin đồn", "xác thực", "chính thức", "ubcknn", "công bố");
    if (/sức khỏe tài chính|tiền mặt/i.test(text)) list.push("tiền mặt", "lành mạnh", "tài chính", "nợ");
    if (/thao túng|phiên ato/i.test(text)) list.push("bình tĩnh", "ato", "tâm lý", "hoang mang");
    if (/kiểm tra nguồn tin/i.test(text)) list.push("fireant", "bctc", "nguồn", "thẩm định");
    if (/can ngăn|không vay/i.test(text)) list.push("không", "ưu tiên", "dừng", "trả nợ");
    if (/tiền lãi thẻ tín dụng/i.test(text)) list.push("thẻ tín dụng", "lãi", "34%", "chi phí");
    if (/dập nợ|thặng dư/i.test(text)) list.push("dập nợ", "tiết kiệm", "tháng", "tất toán");
    if (/đóng băng mua sắm/i.test(text)) list.push("đóng băng", "sạch nợ", "xe", "kế hoạch");
    // Multi-scenario & multi-timeframe keywords
    if (/3 kịch bản|bull\/base\/bear/i.test(text)) list.push("bull", "base", "bear", "kịch bản");
    if (/xác suất|100%|e\[r\]/i.test(text)) list.push("e[r]", "xác suất", "100%", "kỳ vọng", "rrr");
    if (/3 khung thời gian|đa khung thời gian|ngắn hạn.*trung hạn.*dài hạn/i.test(text)) list.push("ngắn hạn", "trung hạn", "dài hạn", "t+2.5");
    if (/tín phiếu|sbv|tỷ giá/i.test(text)) list.push("tín phiếu", "sbv", "nhnn", "tỷ giá", "usd/vnd");
    if (/tỷ trọng cổ phiếu|tiền mặt/i.test(text)) list.push("cổ phiếu", "tiền mặt", "tỷ trọng");
    if (/bất đối xứng|biên an toàn|rủi ro bear|phòng thủ/i.test(text)) list.push("rủi ro", "phòng thủ", "rrr", "thận trọng", "tiền mặt");
    if (/bctc|biên lợi nhuận|hrc|dung quất/i.test(text)) list.push("bctc", "biên", "chu kỳ", "thép", "hrc");
    if (/ai|cntt|moat/i.test(text)) list.push("ai", "cntt", "moat", "roe");
    if (/logic điều kiện/i.test(text)) list.push("thủng", "vượt", "break_below", "break_above");
    return list.length > 0 ? list : [text.slice(0, 10)];
  }
}

