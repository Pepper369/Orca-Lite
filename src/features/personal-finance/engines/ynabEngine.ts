/**
 * YNAB (You Need A Budget) Engine
 * Reverse-engineered from YNAB methodology
 * 
 * Các trụ cột:
 * 1. Age of Money (Tuổi của dòng tiền): Đồng tiền bạn tiêu hôm nay kiếm được bao nhiêu ngày trước.
 * 2. Zero-Based Budgeting: Give Every Dollar a Job (Giao việc cho từng đồng).
 * 3. Buffer Rule: Tích lũy đệm ngân sách > 30 ngày để tiêu tiền của tháng trước.
 */

import { MonthlySnapshot } from '../types/finance';

export interface YnabRuleCheck {
  ruleNumber: 1 | 2 | 3 | 4;
  titleVi: string;
  enRule: string;
  pass: boolean;
  score: number; // 0 - 25
  detailVi: string;
}

export interface YnabAnalysisResult {
  ageOfMoneyDays: number;
  ageStatus: 'CRITICAL' | 'FAIR' | 'HEALTHY' | 'EXCELLENT';
  ageStatusLabelVi: string;
  toBeBudgeted: number;
  totalAssigned: number;
  zeroBasedPass: boolean;
  bufferMonths: number;
  rules: YnabRuleCheck[];
  totalYnabScore: number; // 0 - 100
  verdictVi: string;
}

export function calculateYnabMetrics(
  snapshot: MonthlySnapshot,
  allSnapshots?: MonthlySnapshot[]
): YnabAnalysisResult {
  const netIncome = snapshot.metrics.totalNetIncome || 0;
  const totalExpenses = snapshot.metrics.totalExpenses || 0;
  const cashAssets = snapshot.assets
    .filter((a) => a.category === 'cash')
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  // 1. Tính toán Age of Money (Tuổi của dòng tiền tính theo ngày)
  // Ước tính chuẩn xác: Tiền mặt hiện có chia cho mức chi tiêu trung bình mỗi ngày
  const dailyBurnRate = Math.max(100_000, totalExpenses / 30);
  const ageOfMoneyDays = Math.round(cashAssets / dailyBurnRate);

  let ageStatus: 'CRITICAL' | 'FAIR' | 'HEALTHY' | 'EXCELLENT' = 'FAIR';
  let ageStatusLabelVi = 'Khá ổn định (Tiêu tiền kiếm được 2-4 tuần trước)';

  if (ageOfMoneyDays < 15) {
    ageStatus = 'CRITICAL';
    ageStatusLabelVi = 'Cảnh báo: Sống lay lắt từ kỳ lương này sang kỳ lương khác (Paycheck to Paycheck)';
  } else if (ageOfMoneyDays >= 45) {
    ageStatus = 'EXCELLENT';
    ageStatusLabelVi = 'Xuất sắc: Tiền của bạn đã "già" > 45 ngày, hoàn toàn tự chủ dòng tiền!';
  } else if (ageOfMoneyDays >= 30) {
    ageStatus = 'HEALTHY';
    ageStatusLabelVi = 'Lành mạnh: Đã đạt mốc đệm 30 ngày (Tiêu tiền của tháng trước)';
  }

  // 2. Zero-Based Budgeting
  // Tất cả thu nhập ròng phải được phân bổ vào Chi tiêu + Trả nợ + Tích lũy mục tiêu
  const allocatedExpenses = totalExpenses;
  const allocatedDebt = snapshot.debts.reduce((sum, d) => sum + (d.minMonthlyPayment || 0), 0);
  const allocatedGoals = snapshot.goals.reduce((sum, g) => sum + (g.accumulatedAmount > 0 ? (netIncome * 0.15) : 0), 0);
  const totalAssigned = allocatedExpenses + allocatedDebt;
  const toBeBudgeted = Math.max(0, netIncome - totalAssigned);
  const zeroBasedPass = toBeBudgeted <= netIncome * 0.05; // Sai số dưới 5%

  const bufferMonths = totalExpenses > 0 ? Number((cashAssets / totalExpenses).toFixed(1)) : 0;

  // 3. Đánh giá 4 quy tắc vàng của YNAB
  const rules: YnabRuleCheck[] = [
    {
      ruleNumber: 1,
      titleVi: 'Giao việc cho từng đồng (Give Every Dollar a Job)',
      enRule: 'Give Every Dollar a Job',
      pass: zeroBasedPass,
      score: zeroBasedPass ? 25 : 12,
      detailVi: zeroBasedPass
        ? 'Bạn đã lập kế hoạch chi tiêu và phân bổ hết 100% dòng tiền tháng này.'
        : `Còn ${toBeBudgeted.toLocaleString('vi-VN')} đ chưa được giao việc cụ thể.`,
    },
    {
      ruleNumber: 2,
      titleVi: 'Dự trù chi phí thực tế (Embrace Your True Expenses)',
      enRule: 'Embrace Your True Expenses',
      pass: snapshot.goals.some((g) => g.status === 'on_track'),
      score: snapshot.goals.length >= 2 ? 25 : 15,
      detailVi: `Có ${snapshot.goals.length} mục tiêu quỹ dự phòng / chi tiêu lớn tương lai.`,
    },
    {
      ruleNumber: 3,
      titleVi: 'Linh hoạt điều chỉnh (Roll With The Punches)',
      enRule: 'Roll With The Punches',
      pass: snapshot.metrics.savingsRate >= 0.15,
      score: snapshot.metrics.savingsRate >= 0.2 ? 25 : 15,
      detailVi: `Tỷ lệ tiết kiệm tháng này đạt ${(snapshot.metrics.savingsRate * 100).toFixed(1)}%.`,
    },
    {
      ruleNumber: 4,
      titleVi: 'Kéo dài tuổi thọ dòng tiền (Age Your Money > 30 ngày)',
      enRule: 'Age Your Money',
      pass: ageOfMoneyDays >= 30,
      score: ageOfMoneyDays >= 30 ? 25 : Math.round((ageOfMoneyDays / 30) * 20),
      detailVi: `Tuổi dòng tiền hiện tại: ${ageOfMoneyDays} ngày (${ageStatusLabelVi}).`,
    },
  ];

  const totalYnabScore = rules.reduce((sum, r) => sum + r.score, 0);

  let verdictVi = 'Bạn đang áp dụng nguyên lý YNAB rất xuất sắc, dòng tiền có độ trễ an toàn cao!';
  if (ageOfMoneyDays < 15) {
    verdictVi = 'Cần ưu tiên gia tăng tuổi thọ đồng tiền (Age of Money) lên trên 30 ngày để chấm dứt tình trạng phụ thuộc lương tháng.';
  } else if (!zeroBasedPass) {
    verdictVi = 'Hãy phân bổ khoản tiền chưa giao việc vào mục tiêu đầu tư hoặc trả nợ trước hạn.';
  }

  return {
    ageOfMoneyDays,
    ageStatus,
    ageStatusLabelVi,
    toBeBudgeted,
    totalAssigned,
    zeroBasedPass,
    bufferMonths,
    rules,
    totalYnabScore,
    verdictVi,
  };
}
