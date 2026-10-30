import React, { useState } from 'react';
import {
  MonthlySnapshot,
  CalculatedMetrics,
  Insight,
  ExpenseItem,
} from '../types/finance.ts';
import { OFFICIAL_MARKET_DATA } from '../engines/marketData.ts';
import { QuickCashflowCalculator } from './QuickCashflowCalculator.tsx';
import { OrcaMark } from '@/components/logo';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  HeartPulse,
  Clock,
  ArrowUpRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Calculator,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Heart,
  Globe,
} from 'lucide-react';

interface DashboardViewProps {
  currentSnapshot: MonthlySnapshot;
  allSnapshots: MonthlySnapshot[];
  insights: InsightsProps[];
  onNavigateToCheckin: () => void;
  onNavigateToAdvice: () => void;
  onNavigateToPlanning: () => void;
  onNavigateToAskOrca?: () => void;
  onToggleInsightStatus: (id: string, newStatus: 'new' | 'completed' | 'dismissed') => void;
  onApplyCashflowToSnapshot: (params: {
    grossSalary: number;
    bonus: number;
    otherIncome: number;
    insuranceSalaryBase: number;
    dependentsCount: number;
    expenses: ExpenseItem[];
  }) => void;
}

type InsightsProps = Insight;

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentSnapshot,
  allSnapshots,
  insights,
  onNavigateToCheckin,
  onNavigateToAdvice,
  onNavigateToPlanning,
  onNavigateToAskOrca,
  onToggleInsightStatus,
  onApplyCashflowToSnapshot,
}) => {
  const [showQuickCalc, setShowQuickCalc] = useState<boolean>(true);
  const { metrics } = currentSnapshot;

  // Tìm kỳ tháng trước để tính so sánh delta
  const currentIndex = allSnapshots.findIndex((s) => s.period === currentSnapshot.period);
  const prevSnapshot = currentIndex > 0 ? allSnapshots[currentIndex - 1] : undefined;

  // Tính delta tài sản ròng
  const nwDeltaAmount = prevSnapshot ? metrics.netWorth - prevSnapshot.metrics.netWorth : 0;
  const nwDeltaPercent = prevSnapshot && prevSnapshot.metrics.netWorth !== 0
    ? ((nwDeltaAmount / Math.abs(prevSnapshot.metrics.netWorth)) * 100).toFixed(1)
    : '0.0';

  // Sắp xếp các snapshots theo thời gian để vẽ đồ thị
  const sortedSnapshots = [...allSnapshots].sort((a, b) => a.period.localeCompare(b.period));

  const mascotMood = metrics.healthScore.total >= 80
    ? 'cheering'
    : metrics.savingsRate >= 20
    ? 'happy'
    : metrics.emergencyFundMonths < 3
    ? 'caution'
    : 'saving';

  // Overview greeting message
  const welcomeMessage = metrics.healthScore.total >= 80
    ? `Điểm sức khỏe tài chính đạt ${metrics.healthScore.total}/100.`
    : metrics.savingsRate >= 20
    ? `Tỷ lệ tiết kiệm tháng này đạt ${metrics.savingsRate}% thu nhập.`
    : `Quản lý ngân sách và theo dõi các chỉ số tài chính định kỳ.`;

  return (
    <div className="space-y-6">
      {/* Overview Greeting Banner */}
      <div className="bg-gradient-to-r from-[#172d63] via-[#1f3c85] to-[#172e66] border border-sky-400/40 p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 sm:gap-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="shrink-0 scale-90 sm:scale-100 origin-left">
            <OrcaMark size={40} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-amber-300 text-[10px] sm:text-xs font-bold font-mono tracking-wider uppercase">
                KỲ SỔ SÁCH {currentSnapshot.period}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-[11px] sm:text-xs text-sky-200 font-semibold">ORCA Finance</span>
            </div>
            <h2 className="text-base sm:text-xl font-bold text-white mt-0.5">
              Tổng quan Tài chính Cá nhân
            </h2>
            <p className="text-[11px] sm:text-xs text-sky-100 mt-1 hidden sm:block">
              {welcomeMessage} Nhập số liệu ở bảng tính bên dưới hoặc bấm Check-in để cập nhật sổ sách.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onNavigateToAskOrca && (
            <button
              onClick={onNavigateToAskOrca}
              className="flex-1 sm:flex-initial justify-center px-3 sm:px-4 py-2 bg-gradient-to-r from-sky-500 via-sky-400 to-blue-500 hover:from-sky-400 hover:to-blue-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span>Hỏi ORCA AI</span>
            </button>
          )}

          <button
            onClick={onNavigateToCheckin}
            className="flex-1 sm:flex-initial justify-center px-3 sm:px-4 py-2 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 hover:from-amber-300 hover:to-amber-200 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            <span>Check-in <span className="hidden xs:inline">(~5 ph)</span></span>
          </button>
        </div>
      </div>

      {/* QUICK CASHFLOW CALCULATOR SECTION (Requested by User) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-[#152756] border border-[#2d4d98] px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl shadow-md">
          <div className="flex items-center gap-2">
            <div>
              <span className="text-[11px] sm:text-xs font-bold text-white tracking-wide uppercase">
                BẢNG TÍNH DÒNG TIỀN (LIVE CALCULATOR)
              </span>
              <span className="text-xs text-sky-200 ml-2 hidden lg:inline">
                · Nhập lương, thưởng, chi tiêu để tính thu nhập thực nhận và phân bổ dòng tiền
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowQuickCalc(!showQuickCalc)}
            className="flex items-center gap-1 text-[11px] sm:text-xs font-mono text-amber-300 hover:text-white px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-[#1b326e] hover:bg-[#234292] rounded-xl border border-amber-400/40 transition-all cursor-pointer active:scale-95"
          >
            <span>{showQuickCalc ? 'Thu gọn ∧' : 'Mở bảng tính ∨'}</span>
          </button>
        </div>

        {showQuickCalc && (
          <QuickCashflowCalculator
            currentSnapshot={currentSnapshot}
            onApplyCashflowToSnapshot={onApplyCashflowToSnapshot}
          />
        )}
      </div>

      {/* TOP 4 PRIMARY KPIS - Responsive 2x2 Grid on Mobile, 4 Cols on Desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* KPI 1: Tài sản ròng */}
        <div className="bg-[#142552] border border-[#2b4b96] p-3 sm:p-4.5 rounded-2xl shadow-md relative hover:border-amber-400/60 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-200 mb-1">
              <span className="font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-sky-300 flex items-center gap-1 truncate">
                <span className="truncate">TÀI SẢN RÒNG</span>
              </span>
              <Wallet className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-amber-300 shrink-0" />
            </div>
            <div className="font-mono text-base sm:text-2xl font-bold text-white tracking-tight my-0.5 sm:my-1 truncate">
              {metrics.netWorth.toLocaleString('vi-VN')} <span className="text-xs sm:text-sm font-normal text-slate-300">₫</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs pt-1.5 sm:pt-2 border-t border-[#233f82] mt-1 sm:mt-2 truncate">
            {prevSnapshot ? (
              <div className={`flex items-center gap-0.5 font-mono font-medium truncate ${nwDeltaAmount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {nwDeltaAmount >= 0 ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
                <span className="truncate">
                  {nwDeltaAmount >= 0 ? '+' : ''}{nwDeltaPercent}%
                </span>
              </div>
            ) : (
              <span className="text-slate-300 font-mono text-[10px]">Kỳ đầu tiên</span>
            )}
            <span className="text-slate-400 text-[9px] sm:text-[10px] hidden sm:inline">so với kỳ trước</span>
          </div>
        </div>

        {/* KPI 2: Tiết kiệm tháng này */}
        <div className="bg-[#142552] border border-[#2b4b96] p-3 sm:p-4.5 rounded-2xl shadow-md relative hover:border-emerald-400/60 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-200 mb-1">
              <span className="font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-emerald-300 flex items-center gap-1 truncate">
                <span className="truncate">TIẾT KIỆM KỲ NÀY</span>
              </span>
              <PiggyBank className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-emerald-300 shrink-0" />
            </div>
            <div className="font-mono text-base sm:text-2xl font-bold text-white tracking-tight my-0.5 sm:my-1 truncate">
              {metrics.monthlySavings.toLocaleString('vi-VN')} <span className="text-xs sm:text-sm font-normal text-slate-300">₫</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-xs pt-1.5 sm:pt-2 border-t border-[#233f82] mt-1 sm:mt-2 font-mono">
            <span className={`font-bold truncate ${metrics.savingsRate >= 20 ? 'text-emerald-300' : 'text-amber-300'}`}>
              Đạt: {metrics.savingsRate}%
            </span>
            <span className="text-slate-300 text-[9px] sm:text-[11px] hidden xs:inline">Mục tiêu &ge;20%</span>
          </div>
        </div>

        {/* KPI 3: Điểm sức khỏe tài chính */}
        <div className="bg-[#142552] border border-[#2b4b96] p-3 sm:p-4.5 rounded-2xl shadow-md relative hover:border-amber-400/60 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-200 mb-1">
              <span className="font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-amber-300 flex items-center gap-1 truncate">
                <span className="truncate">SỨC KHỎE TÀI CHÍNH</span>
              </span>
              <HeartPulse className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-rose-300 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1.5 my-0.5 sm:my-1">
              <span className="font-mono text-base sm:text-2xl font-bold text-white">
                {metrics.healthScore.total}
              </span>
              <span className="font-mono text-[10px] sm:text-xs text-slate-300">/ 100</span>
              <span
                className="text-[10px] sm:text-xs font-bold px-2 py-0.5 ml-auto rounded-full border truncate"
                style={{
                  borderColor: metrics.healthScore.ratingText === 'Xuất sắc' ? '#34d399' : '#fbbf24',
                  color: metrics.healthScore.ratingText === 'Xuất sắc' ? '#34d399' : '#fbbf24',
                  backgroundColor: 'rgba(20, 37, 82, 0.95)',
                }}
              >
                {metrics.healthScore.ratingText}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] pt-1.5 sm:pt-2 border-t border-[#233f82] mt-1 sm:mt-2 font-mono truncate">
            <span className="text-slate-300 truncate">
              Dòng tiền, Quỹ, Nợ, Tích lũy
            </span>
          </div>
        </div>

        {/* KPI 4: Quỹ khẩn cấp */}
        <div className="bg-[#142552] border border-[#2b4b96] p-3 sm:p-4.5 rounded-2xl shadow-md relative hover:border-sky-400/60 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-200 mb-1">
              <span className="font-bold text-[10px] sm:text-[11px] uppercase tracking-wider text-sky-300 flex items-center gap-1 truncate">
                <span className="truncate">QUỸ DỰ PHÒNG</span>
              </span>
              <Clock className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-sky-300 shrink-0" />
            </div>
            <div className="flex items-baseline gap-1 my-0.5 sm:my-1">
              <span className="font-mono text-base sm:text-2xl font-bold text-white">
                {metrics.emergencyFundMonths}
              </span>
              <span className="text-xs sm:text-sm font-normal text-slate-300">tháng</span>
              <span className="text-[10px] font-mono text-slate-300 ml-auto truncate hidden xs:inline">
                ({(metrics.liquidAssets / 1_000_000).toFixed(1)} tr)
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] sm:text-xs pt-1.5 sm:pt-2 border-t border-[#233f82] mt-1 sm:mt-2 font-mono">
            <span className={`font-medium truncate ${metrics.emergencyFundMonths >= 3.0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {metrics.emergencyFundMonths >= 3.0 ? 'Đạt an toàn' : 'Cần thêm'}
            </span>
            <span className="text-slate-300 text-[9px] sm:text-[11px] hidden xs:inline">Chuẩn 3-6 th</span>
          </div>
        </div>
      </div>

      {/* AI CALLOUT BANNER - ORCA AI phân bổ tài chính */}
      {onNavigateToAskOrca && (
        <div className="bg-gradient-to-r from-[#17306b] via-[#1f3e87] to-[#16316e] border border-sky-400/40 p-5 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="shrink-0">
              <OrcaMark size={40} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full border border-amber-400/30 uppercase tracking-wide font-mono">
                  TÍNH NĂNG: ORCA AI
                </span>
                <span className="text-xs text-sky-200">· Trợ lý tài chính cá nhân</span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                Tư vấn phân bổ tiền lương, thưởng và kế hoạch chi tiêu
              </h3>
              <p className="text-xs text-sky-100 mt-0.5">
                Mô hình ORCA AI phân tích và đưa ra giải pháp tài chính sát với hoàn cảnh thực tế.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onNavigateToAskOrca}
              className="px-4 py-2 bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-300 hover:to-blue-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer hover:scale-105 flex items-center gap-1.5"
            >
              <span>Trò chuyện cùng ORCA AI</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* GLOBAL FINANCE HERO WIDGET */}
      <div className="bg-gradient-to-r from-[#0d1f47] via-[#132c66] to-[#0a1838] border border-sky-500/30 p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/20 border border-sky-400/40 text-sky-300 shadow-inner">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-sky-300 bg-sky-400/20 px-2 py-0.5 rounded-full border border-sky-400/30 uppercase tracking-wide font-mono">
                TINH HOA QUỐC TẾ & VN
              </span>
              <span className="text-xs text-slate-300">· 4 Mô hình tài chính</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
              Quản trị tài chính theo 6 Chiếc Lọ (Money Lover) & YNAB & FIRE
            </h3>
            <p className="text-xs text-sky-100/80 mt-0.5">
              Đo lường Tuổi dòng tiền, Tháp tài sản 4 tầng, và Radar thuê bao chống lạm chi tự động.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('orca:personal-finance-tab', { detail: 'global_finance' }));
          }}
          className="px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer hover:scale-105 flex items-center gap-2 shrink-0 self-stretch md:self-auto justify-center"
        >
          <span>Khám phá Mô hình Quốc tế</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* CHARTS GRID - Brighter & Clean */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Lịch sử tài sản ròng theo thời gian */}
        <div className="lg:col-span-2 bg-[#142552] border border-[#2b4b96] p-5 rounded-2xl shadow-md">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#233f82]">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                <span>BIẾN ĐỘNG TÀI SẢN RÒNG VÀ NỢ VAY QUA CÁC KỲ</span>
              </h3>
              <p className="text-[11px] text-sky-200">
                Tài sản ròng = Tổng tài sản - Tổng nợ
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-[11px]">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-3 h-1 bg-amber-400 inline-block rounded-full"></span>
                Tài sản ròng
              </span>
              <span className="flex items-center gap-1.5 text-rose-300">
                <span className="w-3 h-1 bg-rose-400 inline-block rounded-full"></span>
                Nợ vay
              </span>
            </div>
          </div>

          {/* SVG Line / Bar Chart */}
          <div className="h-56 w-full flex flex-col justify-end">
            {sortedSnapshots.length > 0 ? (
              <div className="h-full w-full flex items-end gap-6 pt-4 pb-2">
                {sortedSnapshots.map((s) => {
                  const maxVal = Math.max(
                    ...sortedSnapshots.map((x) => Math.max(x.metrics.totalAssets, 1000000))
                  );
                  const netHeight = Math.max(8, Math.min(100, (s.metrics.netWorth / maxVal) * 100));
                  const debtHeight = Math.max(2, Math.min(100, (s.metrics.totalDebt / maxVal) * 100));
                  const isCurrent = s.period === currentSnapshot.period;

                  return (
                    <div key={s.period} className="flex-1 flex flex-col items-center h-full justify-end group">
                      <div className="text-[10px] font-mono text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity mb-1 whitespace-nowrap">
                        {Math.round(s.metrics.netWorth / 1000000)}M ₫
                      </div>
                      
                      <div className="w-full max-w-[48px] flex items-end justify-center gap-1.5 h-36 border-b border-[#3053a4]">
                        {/* Net worth bar */}
                        <div
                          style={{ height: `${netHeight}%` }}
                          className={`w-6 rounded-t-xl transition-all ${
                            isCurrent
                              ? 'bg-gradient-to-t from-amber-400 to-amber-300 shadow-md'
                              : 'bg-[#2b4c96] group-hover:bg-[#3861bd]'
                          }`}
                          title={`Tài sản ròng kỳ ${s.period}: ${s.metrics.netWorth.toLocaleString('vi-VN')} ₫`}
                        ></div>

                        {/* Debt bar */}
                        {s.metrics.totalDebt > 0 && (
                          <div
                            style={{ height: `${debtHeight}%` }}
                            className="w-3.5 bg-rose-500/80 group-hover:bg-rose-400 rounded-t-lg transition-all"
                            title={`Dư nợ kỳ ${s.period}: ${s.metrics.totalDebt.toLocaleString('vi-VN')} ₫`}
                          ></div>
                        )}
                      </div>

                      <div className={`mt-2 font-mono text-xs ${isCurrent ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
                        {s.period}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                Chưa đủ dữ liệu lịch sử
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Cơ cấu chi tiêu */}
        <div className="bg-[#142552] border border-[#2b4b96] p-5 rounded-2xl shadow-md flex flex-col justify-between">
          <div>
            <div className="pb-3 mb-3 border-b border-[#233f82]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                <span>CƠ CẤU CHI TIÊU THÁNG</span>
              </h3>
              <p className="text-[11px] text-sky-200">
                Chi cố định tối đa 65% thu nhập
              </p>
            </div>

            {/* Fixed vs Variable bar */}
            <div className="space-y-3.5 pt-2">
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-200 font-medium">Chi cố định:</span>
                  <span className={`font-bold ${metrics.fixedCostRatio > 65 ? 'text-rose-300' : 'text-slate-100'}`}>
                    {metrics.fixedExpenses.toLocaleString('vi-VN')} ₫ ({metrics.fixedCostRatio}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-[#0f1d44] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${metrics.fixedCostRatio > 65 ? 'bg-rose-400' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(100, metrics.fixedCostRatio)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-200 font-medium">Chi biến đổi:</span>
                  <span className="text-slate-100 font-bold">
                    {metrics.variableExpenses.toLocaleString('vi-VN')} ₫ (
                    {metrics.totalNetIncome > 0
                      ? ((metrics.variableExpenses / metrics.totalNetIncome) * 100).toFixed(1)
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full h-3 bg-[#0f1d44] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        metrics.totalNetIncome > 0
                          ? (metrics.variableExpenses / metrics.totalNetIncome) * 100
                          : 0
                      )}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-slate-200 font-medium">Tiết kiệm bỏ heo:</span>
                  <span className="text-emerald-300 font-bold">
                    {metrics.monthlySavings.toLocaleString('vi-VN')} ₫ ({metrics.savingsRate}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-[#0f1d44] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, metrics.savingsRate))}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick status box */}
          <div className="mt-4 p-3.5 bg-[#172a5a] border border-[#2d4d98] rounded-xl text-xs">
            <div className="text-slate-100 font-bold mb-1 flex items-center gap-1.5">
              <span>Khuyến nghị ORCA:</span>
            </div>
            <p className="text-sky-100 text-[11px] leading-relaxed">
              {metrics.fixedCostRatio <= 65
                ? 'Dòng tiền thảnh thơi và an toàn, tiếp tục duy trì tỷ lệ này.'
                : 'Chi phí cố định đang vượt mức 65% thu nhập. Nên rà soát và tối ưu các khoản chi bắt buộc.'}
            </p>
          </div>
        </div>
      </div>

      {/* TOP ACTIONABLE INSIGHTS */}
      <div className="bg-[#142552] border border-[#2b4b96] p-5 rounded-2xl shadow-md">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#233f82]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-amber-400 rounded-full"></span>
              LỜI KHUYÊN ƯU TIÊN (6 PHẦN ĐỊNH LƯỢNG)
            </h3>
            <p className="text-[11px] text-sky-200">
              Định lượng con số và thời hạn để thực hiện kế hoạch.
            </p>
          </div>

          <button
            onClick={onNavigateToAdvice}
            className="text-xs font-mono text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer font-bold"
          >
            <span>Xem tất cả lời khuyên</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {insights.length === 0 ? (
          <div className="p-6 text-center text-slate-300 text-xs">
            Chưa có khuyến nghị mới cho kỳ này.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.slice(0, 2).map((ins) => (
              <div
                key={ins.id}
                className="bg-[#172a5a] border border-[#2d4d98] p-4.5 rounded-2xl flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span
                      className={`text-[10px] font-mono px-2.5 py-0.5 uppercase font-bold rounded-full border ${
                        ins.severity === 'critical'
                          ? 'border-rose-400 text-rose-200 bg-rose-950/70'
                          : ins.severity === 'warning'
                          ? 'border-amber-400 text-amber-200 bg-amber-950/70'
                          : 'border-emerald-400 text-emerald-200 bg-emerald-950/70'
                      }`}
                    >
                      {ins.severity === 'critical' ? 'ƯU TIÊN SỐ 1' : 'LƯU Ý'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-300">MÃ: {ins.ruleCode}</span>
                  </div>

                  <h4 className="text-sm font-bold text-white mb-2">{ins.title}</h4>

                  <div className="space-y-1.5 text-xs text-slate-200">
                    <p>
                      <strong className="text-slate-300 font-semibold">1. Phát hiện:</strong>{' '}
                      {ins.content.finding}
                    </p>
                    <p>
                      <strong className="text-slate-300 font-semibold">2. Tác động:</strong>{' '}
                      {ins.content.impact}
                    </p>
                    <p>
                      <strong className="text-amber-300 font-bold">3. Hành động:</strong>{' '}
                      <span className="text-white font-medium">{ins.content.action}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#233f82] flex items-center justify-between text-xs">
                  <div className="font-mono">
                    <span className="text-slate-300 text-[10px]">Số tiền đề xuất: </span>
                    <span className="text-amber-300 font-bold">
                      {ins.content.amount.toLocaleString('vi-VN')} ₫
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      onToggleInsightStatus(
                        ins.id,
                        ins.status === 'completed' ? 'new' : 'completed'
                      )
                    }
                    className={`px-3.5 py-1.5 text-[11px] font-mono cursor-pointer rounded-xl border transition-all ${
                      ins.status === 'completed'
                        ? 'bg-emerald-900/90 text-emerald-200 border-emerald-400 font-bold'
                        : 'bg-[#1b326e] text-slate-200 hover:text-white border-[#335bb5]'
                    }`}
                  >
                    {ins.status === 'completed' ? 'Đã hoàn thành' : 'Đánh dấu đã làm'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Official Market Reference Ticker Bar at Bottom (Simplified & Clean) */}
      <div className="bg-[#142552] border border-[#2b4b96] p-4.5 rounded-2xl text-xs">
        <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#233f82]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
              DỮ LIỆU THỊ TRƯỜNG THỰC TẾ (SBV, VIETCOMBANK, SJC)
            </span>
          </div>
          <span className="text-[11px] font-mono text-sky-200">
            Cập nhật: 05/10/2026 ICT
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {OFFICIAL_MARKET_DATA.slice(0, 4).map((item) => (
            <div key={item.id} className="bg-[#0f1d44] border border-[#264388] p-3 rounded-xl">
              <div className="text-[10px] text-slate-300 truncate mb-1">{item.indicator}</div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm font-bold text-amber-300">
                  {item.value} <span className="text-[10px] font-normal text-slate-300">{item.unit}</span>
                </span>
                <span className="text-[10px] font-mono text-sky-300">{item.changeText}</span>
              </div>
              <div className="text-[9px] text-slate-400 mt-1 truncate">
                {item.sourceName}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
