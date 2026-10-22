/**
 * JARS 6-Jar Money Management Engine
 * Reverse-engineered from Money Lover (Vietnam) & T. Harv Eker
 * 
 * 6 Lọ tài chính chuẩn:
 * 1. NEC (Necessities - Nhu cầu thiết yếu: 55%)
 * 2. FFA (Financial Freedom - Đầu tư tự do tài chính: 10%)
 * 3. LTSS (Long-term Savings - Tiết kiệm dài hạn: 10%)
 * 4. EDU (Education - Giáo dục & phát triển bản thân: 10%)
 * 5. PLAY (Hưởng thụ & thưởng cho bản thân: 10%)
 * 6. GIVE (Cho đi & thiện nguyện: 5%)
 */

import { MonthlySnapshot, ExpenseItem } from '../types/finance';

export interface JarItem {
  id: 'NEC' | 'FFA' | 'LTSS' | 'EDU' | 'PLAY' | 'GIVE';
  nameVi: string;
  code: string;
  targetPercent: number;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  status: 'SAFE' | 'WARNING' | 'OVERSPENT';
  description: string;
  icon: string;
  color: string;
}

export interface JarsAnalysisResult {
  totalIncome: number;
  totalExpenses: number;
  jars: JarItem[];
  overspentJarsCount: number;
  disciplineScore: number; // 0 - 100
  verdictVi: string;
}

export function calculateJarsDistribution(
  snapshot: MonthlySnapshot,
  customRatios?: { [key: string]: number },
  customIncome?: number,
  customExpenses?: number,
  customSpentByJar?: Record<string, number>
): JarsAnalysisResult {
  const netIncome = customIncome !== undefined ? Math.max(0, customIncome) : (snapshot.metrics.totalNetIncome || 0);
  const expenses = snapshot.expenses || [];
  const totalExpenses = customExpenses !== undefined ? Math.max(0, customExpenses) : (snapshot.metrics.totalExpenses || 0);

  // Tỷ lệ phân bổ mặc định chuẩn quốc tế
  const ratios = {
    NEC: customRatios?.NEC ?? 55,
    FFA: customRatios?.FFA ?? 10,
    LTSS: customRatios?.LTSS ?? 10,
    EDU: customRatios?.EDU ?? 10,
    PLAY: customRatios?.PLAY ?? 10,
    GIVE: customRatios?.GIVE ?? 5,
  };

  // Phân loại các khoản chi tiêu hiện tại vào 6 lọ
  const spentByJar: Record<string, number> = customSpentByJar ? { ...customSpentByJar } : {
    NEC: 0,
    FFA: 0,
    LTSS: 0,
    EDU: 0,
    PLAY: 0,
    GIVE: 0,
  };

  if (!customSpentByJar) {
    if (customExpenses !== undefined && expenses.length === 0) {
      // Nếu user tự gõ tổng chi tiêu mà chưa có danh sách chi tiết: ước tính phân bổ thực tế theo tỷ lệ 60-10-10-5-10-5
      spentByJar.NEC = Math.round(totalExpenses * 0.60);
      spentByJar.FFA = Math.round(totalExpenses * 0.10);
      spentByJar.LTSS = Math.round(totalExpenses * 0.10);
      spentByJar.EDU = Math.round(totalExpenses * 0.05);
      spentByJar.PLAY = Math.round(totalExpenses * 0.10);
      spentByJar.GIVE = Math.round(totalExpenses * 0.05);
    } else {
      for (const exp of expenses) {
        const cat = exp.category?.toLowerCase() || '';
        const name = exp.name?.toLowerCase() || '';

        if (cat.includes('invest') || name.includes('đầu tư') || name.includes('cổ phiếu') || name.includes('chứng chỉ quỹ')) {
          spentByJar.FFA += exp.amount;
        } else if (cat.includes('save') || cat.includes('saving') || name.includes('tiết kiệm') || name.includes('bảo hiểm')) {
          spentByJar.LTSS += exp.amount;
        } else if (cat.includes('edu') || name.includes('học') || name.includes('sách') || name.includes('khóa học')) {
          spentByJar.EDU += exp.amount;
        } else if (cat.includes('entertain') || cat.includes('play') || name.includes('du lịch') || name.includes('cà phê') || name.includes('mua sắm') || name.includes('xem phim')) {
          spentByJar.PLAY += exp.amount;
        } else if (cat.includes('charity') || cat.includes('give') || name.includes('biếu') || name.includes('từ thiện') || name.includes('ủng hộ')) {
          spentByJar.GIVE += exp.amount;
        } else {
          spentByJar.NEC += exp.amount;
        }
      }
    }
  }

  const jarConfigs: Array<{
    id: 'NEC' | 'FFA' | 'LTSS' | 'EDU' | 'PLAY' | 'GIVE';
    nameVi: string;
    desc: string;
    icon: string;
    color: string;
  }> = [
    { id: 'NEC', nameVi: 'Thiết yếu (NEC)', desc: 'Tiền nhà, ăn uống, hóa đơn, sinh hoạt phí cố định', icon: '🏠', color: '#38bdf8' },
    { id: 'FFA', nameVi: 'Tự do tài chính (FFA)', desc: 'Đầu tư cổ phiếu, ETF, bất động sản, tài sản sinh lời', icon: '🚀', color: '#34d399' },
    { id: 'LTSS', nameVi: 'Tiết kiệm dài hạn (LTSS)', desc: 'Quỹ khẩn cấp, mua sắm lớn tương lai, bảo hiểm', icon: '🏦', color: '#818cf8' },
    { id: 'EDU', nameVi: 'Học tập & Kỹ năng (EDU)', desc: 'Sách, khóa học, nâng cấp năng lực kiếm tiền', icon: '📚', color: '#f59e0b' },
    { id: 'PLAY', nameVi: 'Hưởng thụ (PLAY)', desc: 'Tự thưởng bản thân, du lịch, giải trí, tái tạo năng lượng', icon: '🎉', color: '#ec4899' },
    { id: 'GIVE', nameVi: 'Cho đi (GIVE)', desc: 'Biếu bố mẹ, người thân, giúp đỡ cộng đồng, từ thiện', icon: '❤️', color: '#f43f5e' },
  ];

  let overspentCount = 0;
  const jars: JarItem[] = jarConfigs.map((cfg) => {
    const pct = ratios[cfg.id];
    const allocated = Math.round((netIncome * pct) / 100);
    const spent = Math.round(spentByJar[cfg.id] || 0);
    const remaining = allocated - spent;

    let status: 'SAFE' | 'WARNING' | 'OVERSPENT' = 'SAFE';
    if (spent > allocated) {
      status = 'OVERSPENT';
      overspentCount++;
    } else if (allocated > 0 && spent / allocated > 0.85) {
      status = 'WARNING';
    }

    return {
      id: cfg.id,
      nameVi: cfg.nameVi,
      code: cfg.id,
      targetPercent: pct,
      allocatedAmount: allocated,
      spentAmount: spent,
      remainingAmount: remaining,
      status,
      description: cfg.desc,
      icon: cfg.icon,
      color: cfg.color,
    };
  });

  // Điểm kỷ luật dòng tiền (Discipline Score)
  const baseScore = 100 - overspentCount * 20;
  const necJar = jars.find((j) => j.id === 'NEC');
  const necOverspent = necJar && necJar.status === 'OVERSPENT';
  const disciplineScore = Math.max(10, necOverspent ? baseScore - 15 : baseScore);

  let verdictVi = 'Bạn đang quản lý các lọ tài chính rất cân đối!';
  if (necOverspent) {
    verdictVi = 'Cảnh báo: Lọ Thiết yếu (NEC) đang bị lạm chi so với thu nhập. Hãy tối ưu chi phí cố định.';
  } else if (overspentCount >= 2) {
    verdictVi = `Có ${overspentCount} lọ đang bị chi vượt mức ngân sách. Hãy điều hòa dòng tiền từ lọ Hưởng thụ sang.`;
  }

  return {
    totalIncome: netIncome,
    totalExpenses,
    jars,
    overspentJarsCount: overspentCount,
    disciplineScore,
    verdictVi,
  };
}
