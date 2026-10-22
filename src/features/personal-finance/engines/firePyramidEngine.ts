/**
 * Wealth Pyramid & FIRE Independence Engine
 * Reverse-engineered from Empower (Personal Capital) & Finhay
 * 
 * Mô hình:
 * 1. Tháp tài sản 4 Tầng: Phòng thủ -> Thu nhập cố định -> Tăng trưởng -> Mạo hiểm/Cơ hội.
 * 2. Bộ mô phỏng FIRE (Financial Independence, Retire Early): Lean, Standard, Fat, Coast FIRE.
 * 3. Quy tắc 4% (Safe Withdrawal Rate - SWR) chuẩn Trinity Study.
 */

import { MonthlySnapshot } from '../types/finance';

export interface PyramidTier {
  tierNumber: 1 | 2 | 3 | 4;
  nameVi: string;
  enName: string;
  descriptionVi: string;
  totalValue: number;
  percentOfNetworth: number;
  targetPercentRange: [number, number];
  status: 'OPTIMAL' | 'UNDER' | 'OVER';
  color: string;
  icon: string;
}

export interface FireMetrics {
  annualExpenses: number;
  fireTargetStandard: number;
  fireTargetLean: number;
  fireTargetFat: number;
  currentInvestedAssets: number;
  progressPercent: number;
  yearsToFire: number;
  targetFireAge: number;
  currentAge: number;
  monthlyInvestmentCapacity: number;
  swrPercent: number; // 4.0%
}

export interface FirePyramidAnalysisResult {
  pyramid: PyramidTier[];
  fire: FireMetrics;
  netWorth: number;
  verdictVi: string;
}

export interface FirePyramidCustomOptions {
  customMonthlyExpenses?: number;
  customMonthlyIncome?: number;
  customCashDefense?: number;
  customInvestedAssets?: number;
}

export function calculateFireAndPyramid(
  snapshot: MonthlySnapshot,
  currentAge: number = 28,
  expectedCagr: number = 0.10, // 10%/năm (chuẩn VN-Index dài hạn)
  options?: FirePyramidCustomOptions
): FirePyramidAnalysisResult {
  const assets = snapshot.assets || [];
  const monthlyExpenses = options?.customMonthlyExpenses !== undefined
    ? Math.max(0, options.customMonthlyExpenses)
    : (snapshot.metrics.totalExpenses || 0);
  const annualExpenses = monthlyExpenses * 12;
  const netIncome = options?.customMonthlyIncome !== undefined
    ? Math.max(0, options.customMonthlyIncome)
    : (snapshot.metrics.totalNetIncome || 0);
  const monthlySavings = Math.max(0, netIncome - monthlyExpenses);

  // Phân loại tài sản vào 4 tầng tháp tài sản
  let tier1Defense = options?.customCashDefense !== undefined ? Math.max(0, options.customCashDefense) : 0;
  let tier2FixedIncome = 0; // Trái phiếu, gửi tiết kiệm dài hạn
  let tier3Growth = options?.customInvestedAssets !== undefined ? Math.max(0, options.customInvestedAssets) : 0;
  let tier4Speculative = 0; // Crypto, vàng, cơ hội

  if (options?.customCashDefense === undefined || options?.customInvestedAssets === undefined) {
    for (const a of assets) {
      const cat = a.category?.toLowerCase() || '';
      const name = a.name?.toLowerCase() || '';
      const bal = a.balance || 0;

      if (cat === 'cash' || name.includes('ví') || name.includes('khẩn cấp') || name.includes('tiền mặt')) {
        if (options?.customCashDefense === undefined) tier1Defense += bal;
      } else if (name.includes('trái phiếu') || name.includes('tiết kiệm') || name.includes('bảo hiểm')) {
        tier2FixedIncome += bal;
      } else if (cat === 'crypto' || name.includes('crypto') || name.includes('bitcoin') || name.includes('vàng') || name.includes('coin')) {
        tier4Speculative += bal;
      } else {
        if (options?.customInvestedAssets === undefined) tier3Growth += bal;
      }
    }
  }

  const totalAssets = tier1Defense + tier2FixedIncome + tier3Growth + tier4Speculative;
  const totalDebt = snapshot.debts.reduce((sum, d) => sum + (d.balance || 0), 0);
  const netWorth = Math.max(0, totalAssets - totalDebt);

  const p1 = totalAssets > 0 ? (tier1Defense / totalAssets) * 100 : 0;
  const p2 = totalAssets > 0 ? (tier2FixedIncome / totalAssets) * 100 : 0;
  const p3 = totalAssets > 0 ? (tier3Growth / totalAssets) * 100 : 0;
  const p4 = totalAssets > 0 ? (tier4Speculative / totalAssets) * 100 : 0;

  const pyramid: PyramidTier[] = [
    {
      tierNumber: 1,
      nameVi: 'Tầng 1: Tài sản Phòng thủ (Đáy tháp)',
      enName: 'Emergency & Cash Reserve',
      descriptionVi: 'Quỹ tiền mặt dự phòng 3-6 tháng sinh hoạt phí thiết yếu',
      totalValue: tier1Defense,
      percentOfNetworth: Math.round(p1),
      targetPercentRange: [15, 25],
      status: p1 < 10 ? 'UNDER' : p1 > 35 ? 'OVER' : 'OPTIMAL',
      color: '#38bdf8',
      icon: '🛡️',
    },
    {
      tierNumber: 2,
      nameVi: 'Tầng 2: Thu nhập Cố định & Bảo vệ',
      enName: 'Fixed Income & Protection',
      descriptionVi: 'Trái phiếu, chứng chỉ tiền gửi, bảo hiểm nhân thọ tích lũy',
      totalValue: tier2FixedIncome,
      percentOfNetworth: Math.round(p2),
      targetPercentRange: [15, 30],
      status: p2 < 10 ? 'UNDER' : 'OPTIMAL',
      color: '#818cf8',
      icon: '🏛️',
    },
    {
      tierNumber: 3,
      nameVi: 'Tầng 3: Tài sản Tăng trưởng (Cốt lõi)',
      enName: 'Growth Equity & Real Estate',
      descriptionVi: 'Cổ phiếu doanh nghiệp hàng đầu, quỹ chỉ số ETF, BĐS dòng tiền',
      totalValue: tier3Growth,
      percentOfNetworth: Math.round(p3),
      targetPercentRange: [40, 65],
      status: p3 < 30 ? 'UNDER' : 'OPTIMAL',
      color: '#34d399',
      icon: '🚀',
    },
    {
      tierNumber: 4,
      nameVi: 'Tầng 4: Tài sản Cơ hội / Mạo hiểm (Đỉnh tháp)',
      enName: 'Alternative & Speculative',
      descriptionVi: 'Crypto, tài sản công nghệ, lướt sóng biến động ngắn hạn',
      totalValue: tier4Speculative,
      percentOfNetworth: Math.round(p4),
      targetPercentRange: [0, 10],
      status: p4 > 15 ? 'OVER' : 'OPTIMAL',
      color: '#f59e0b',
      icon: '⚡',
    },
  ];

  // Tính toán FIRE
  const swr = 0.04; // 4% SWR (Trinity Study)
  const fireTargetStandard = Math.round(annualExpenses / swr); // Chi phí năm x 25
  const fireTargetLean = Math.round((annualExpenses * 0.75) / swr); // Tiết chế 25%
  const fireTargetFat = Math.round((annualExpenses * 1.6) / swr); // Sung túc +60%

  // Tổng tài sản đầu tư sinh lời (Tier 2 + Tier 3 + Tier 4)
  const currentInvestedAssets = tier2FixedIncome + tier3Growth + tier4Speculative;
  const progressPercent = fireTargetStandard > 0
    ? Math.min(100, Math.round((currentInvestedAssets / fireTargetStandard) * 100))
    : 0;

  // Tính số năm chạm mốc FIRE theo bài toán tích lũy tăng trưởng kép
  let yearsToFire = fireTargetStandard === 0 ? 0 : 99;
  if (fireTargetStandard > 0 && monthlySavings > 0) {
    const annualSavings = monthlySavings * 12;
    let accumulated = currentInvestedAssets;
    for (let yr = 1; yr <= 45; yr++) {
      accumulated = accumulated * (1 + expectedCagr) + annualSavings;
      if (accumulated >= fireTargetStandard) {
        yearsToFire = yr;
        break;
      }
    }
  }

  const targetFireAge = currentAge + (fireTargetStandard === 0 ? 0 : (yearsToFire < 99 ? yearsToFire : 30));

  let verdictVi = `Bạn đã hoàn thành ${progressPercent}% lộ trình Tự do tài chính (FIRE).`;
  if (progressPercent >= 100) {
    verdictVi = 'Chúc mừng! Bạn đã hoàn toàn độc lập tài chính với quy tắc 4% dòng tiền an toàn!';
  } else if (p1 < 10) {
    verdictVi = 'Đáy tháp tài sản phòng thủ còn mỏng. Hãy ưu tiên bổ sung quỹ dự phòng 3 tháng trước khi tăng tỷ trọng đầu tư mạo hiểm.';
  } else if (yearsToFire <= 15) {
    verdictVi = `Với tỷ lệ tích lũy hiện tại, bạn dự kiến chạm mốc Tự do tài chính ở tuổi ${targetFireAge} (~${yearsToFire} năm nữa).`;
  }

  return {
    pyramid,
    fire: {
      annualExpenses,
      fireTargetStandard,
      fireTargetLean,
      fireTargetFat,
      currentInvestedAssets,
      progressPercent,
      yearsToFire,
      targetFireAge,
      currentAge,
      monthlyInvestmentCapacity: monthlySavings,
      swrPercent: 4.0,
    },
    netWorth,
    verdictVi,
  };
}
