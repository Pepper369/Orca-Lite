/**
 * Recurring Subscriptions & Cashflow Runway Engine
 * Reverse-engineered from Copilot Money & Monarch Money
 * 
 * Tính năng:
 * 1. Nhận diện và quản lý các khoản chi tiêu định kỳ (Subscriptions & Recurring Bills).
 * 2. Đo lường "Chảy máu dòng tiền âm thầm" (Monthly & Annual Leak).
 * 3. Cash Flow Runway Radar: Số tháng sinh tồn nếu toàn bộ nguồn thu nhập ngừng đột ngột.
 */

import { MonthlySnapshot, ExpenseItem } from '../types/finance';

export interface SubscriptionItem {
  id: string;
  name: string;
  category: 'digital' | 'living' | 'wellness' | 'productivity' | 'other';
  monthlyAmount: number;
  billingCycle: 'monthly' | 'yearly';
  billingDay?: number;
  autoRenew: boolean;
  isEssential: boolean;
  color: string;
  icon: string;
}

export interface SubscriptionsAnalysisResult {
  subscriptions: SubscriptionItem[];
  totalMonthlyCost: number;
  totalAnnualCost: number;
  percentOfIncome: number;
  leakAlert: boolean;
  runwayMonths: number;
  runwayStatus: 'CRITICAL' | 'VULNERABLE' | 'COMFORTABLE' | 'FORTRESS';
  runwayStatusVi: string;
  potentialAnnualSavings: number;
  verdictVi: string;
}

export function analyzeSubscriptionsAndRunway(
  snapshot: MonthlySnapshot,
  customSubs?: SubscriptionItem[]
): SubscriptionsAnalysisResult {
  const netIncome = snapshot.metrics.totalNetIncome || 0;
  const expenses = snapshot.expenses || [];
  const cashAssets = snapshot.assets
    .filter((a) => a.category === 'cash')
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  // Nhận diện tự động các khoản thuê bao / hóa đơn định kỳ từ danh mục chi tiêu
  const detectedSubs: SubscriptionItem[] = [];

  const subKeywords = [
    { key: 'netflix', name: 'Netflix Premium', cat: 'digital', icon: '🎬', isEssential: false },
    { key: 'spotify', name: 'Spotify Music', cat: 'digital', icon: '🎵', isEssential: false },
    { key: 'youtube', name: 'YouTube Premium', cat: 'digital', icon: '▶️', isEssential: false },
    { key: 'icloud', name: 'Apple iCloud+', cat: 'digital', icon: '☁️', isEssential: true },
    { key: 'google', name: 'Google One Drive', cat: 'digital', icon: '📁', isEssential: true },
    { key: 'chatgpt', name: 'ChatGPT Plus AI', cat: 'productivity', icon: '🤖', isEssential: true },
    { key: 'gym', name: 'Tập Gym / Fitness', cat: 'wellness', icon: '🏋️', isEssential: false },
    { key: 'internet', name: 'Internet cáp quang', cat: 'living', icon: '🌐', isEssential: true },
    { key: 'nhà', name: 'Tiền thuê nhà / Chung cư', cat: 'living', icon: '🏠', isEssential: true },
    { key: 'điện', name: 'Tiền điện & Nước', cat: 'living', icon: '💡', isEssential: true },
  ];

  for (const exp of expenses) {
    const lowName = exp.name.toLowerCase();
    const matched = subKeywords.find((k) => lowName.includes(k.key));
    if (matched || exp.isFixed) {
      detectedSubs.push({
        id: exp.id,
        name: exp.name,
        category: (matched?.cat as any) || 'living',
        monthlyAmount: exp.amount,
        billingCycle: 'monthly',
        billingDay: 5,
        autoRenew: true,
        isEssential: matched ? matched.isEssential : true,
        color: matched?.cat === 'digital' ? '#ec4899' : matched?.cat === 'productivity' ? '#818cf8' : '#38bdf8',
        icon: matched ? matched.icon : '📋',
      });
    }
  }

  // Danh mục thuê bao hợp nhất
  const subs = customSubs && customSubs.length > 0 ? customSubs : detectedSubs;

  const totalMonthlyCost = subs.reduce((sum, s) => sum + s.monthlyAmount, 0);
  const totalAnnualCost = totalMonthlyCost * 12;
  const percentOfIncome = netIncome > 0 ? (totalMonthlyCost / netIncome) * 100 : 0;
  const leakAlert = percentOfIncome > 12; // Chi tiêu định kỳ > 12% thu nhập là dấu hiệu rò rỉ

  // Tính tiềm năng tiết kiệm bằng cách cắt bỏ các thuê bao không thiết yếu
  const potentialAnnualSavings = subs
    .filter((s) => !s.isEssential)
    .reduce((sum, s) => sum + s.monthlyAmount * 12, 0);

  // Tính Cashflow Runway (Tháng sống sót)
  // Dựa trên chi phí thiết yếu hàng tháng (Fixed Expenses)
  const essentialMonthlyExpenses = Math.max(5_000_000, snapshot.metrics.fixedExpenses || totalMonthlyCost);
  const runwayMonths = essentialMonthlyExpenses > 0
    ? Number((cashAssets / essentialMonthlyExpenses).toFixed(1))
    : 0;

  let runwayStatus: 'CRITICAL' | 'VULNERABLE' | 'COMFORTABLE' | 'FORTRESS' = 'COMFORTABLE';
  let runwayStatusVi = 'An toàn: Quỹ dự phòng đủ sống sót 3 - 6 tháng';

  if (runwayMonths < 1.0) {
    runwayStatus = 'CRITICAL';
    runwayStatusVi = 'Báo động đỏ: Runway < 1 tháng, nguy cơ mất thanh khoản cao!';
  } else if (runwayMonths < 3.0) {
    runwayStatus = 'VULNERABLE';
    runwayStatusVi = 'Mỏng manh: Dự phòng dưới 3 tháng, cần hạn chế chi tiêu tùy ý.';
  } else if (runwayMonths >= 6.0) {
    runwayStatus = 'FORTRESS';
    runwayStatusVi = 'Pháo đài tài chính: Dự phòng trên 6 tháng sinh hoạt phí thiết yếu!';
  }

  let verdictVi = `Tổng chi phí định kỳ chiếm ${percentOfIncome.toFixed(1)}% thu nhập tháng. Runway hiện tại: ${runwayMonths} tháng.`;
  if (leakAlert) {
    verdictVi = `Cảnh báo: Chi phí định kỳ chiếm đến ${percentOfIncome.toFixed(1)}% thu nhập. Bạn có thể tiết kiệm ${potentialAnnualSavings.toLocaleString('vi-VN')} đ/năm nếu rà soát lại các thuê bao không cần thiết.`;
  }

  return {
    subscriptions: subs,
    totalMonthlyCost,
    totalAnnualCost,
    percentOfIncome,
    leakAlert,
    runwayMonths,
    runwayStatus,
    runwayStatusVi,
    potentialAnnualSavings,
    verdictVi,
  };
}
