import React from 'react';
import {
  Calendar,
  CheckCircle2,
  TestTube2,
  RefreshCw,
  Trash2,
  RotateCcw,
  Sparkles,
  Heart,
} from 'lucide-react';
import { OrcaMark } from '@/components/logo';

interface HeaderProps {
  currentPeriod: string;
  availablePeriods: string[];
  onSelectPeriod: (p: string) => void;
  activeTab: string;
  onSelectTab: (t: string) => void;
  isDemo: boolean;
  onLoadDemo: () => void;
  onStartBlank: () => void;
  onOpenTestModal: () => void;
  onStartCheckin: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPeriod,
  availablePeriods,
  onSelectPeriod,
  activeTab,
  onSelectTab,
  isDemo,
  onLoadDemo,
  onStartBlank,
  onOpenTestModal,
  onStartCheckin,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Tổng quan' },
    { id: 'global_finance', label: 'Tinh hoa Tài chính (6 Lọ · YNAB · FIRE)' },
    { id: 'ask_orca', label: 'ORCA AI Tư Vấn' },
    { id: 'cashflow_calc', label: 'Tính dòng tiền & Thuế' },
    { id: 'checkin', label: 'Monthly Check-in' },
    { id: 'analytics', label: 'Phân tích tài chính' },
    { id: 'planning', label: 'Kế hoạch & Hưu trí' },
    { id: 'advice', label: 'Lời khuyên tài chính' },
    { id: 'report', label: 'Báo cáo & PDF' },
    { id: 'market', label: 'Giả định & Thị trường' },
    { id: 'privacy', label: 'Quyền riêng tư' },
  ];

  return (
    <header className="border-b border-border-subtle bg-surface-base/95 backdrop-blur-md sticky top-0 z-20 shadow-sm">
      {/* Sub-toolbar: Quản lý kỳ tài chính & các thao tác nhanh */}
      <div className="px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 border-b border-border-subtle/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-text-primary tracking-tight">
              Tài chính cá nhân
            </h1>
            <span className="text-[10px] font-bold text-accent-primary bg-accent-primary/15 px-2 py-0.5 rounded-full border border-accent-primary/30 font-mono">
              Thuế VN 2026
            </span>
            {isDemo ? (
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 text-[10px] font-mono rounded-full font-bold">
                Dữ liệu mẫu (Demo)
              </span>
            ) : (
              <span className="bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-mono rounded-full font-bold">
                Sổ tay cá nhân
              </span>
            )}
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-between sm:justify-end">
          {/* Period selector */}
          <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-subtle px-2.5 py-1 text-xs rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-accent-primary shrink-0" />
            <span className="text-text-muted text-[11px] font-medium hidden xs:inline">Kỳ:</span>
            <select
              value={currentPeriod}
              onChange={(e) => onSelectPeriod(e.target.value)}
              className="bg-transparent text-text-primary font-mono font-bold focus:outline-none cursor-pointer text-xs"
            >
              {availablePeriods.map((p) => (
                <option key={p} value={p} className="bg-surface-elevated text-text-primary">
                  {p} {p === '2026-10' ? '(Hiện tại)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onOpenTestModal}
            title="Kiểm tra độ chính xác công thức toán học"
            className="flex items-center gap-1 text-[11px] font-mono text-text-secondary hover:text-text-primary px-2.5 py-1 bg-surface-elevated border border-border-subtle hover:border-accent-primary/50 rounded-lg transition-colors cursor-pointer"
          >
            <TestTube2 className="w-3 h-3 text-accent-primary" />
            <span className="hidden sm:inline">Kiểm thử Engine (8/8)</span>
            <span className="sm:hidden">Kiểm thử</span>
          </button>

          <div className="flex items-center gap-1.5">
            {/* Quick Check-in CTA button */}
            <button
              onClick={onStartCheckin}
              className="flex items-center gap-1.5 px-3 py-1 bg-accent-primary hover:bg-accent-primary/90 text-black font-bold text-xs rounded-lg transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-black shrink-0" />
              <span>Check-in <span className="hidden xs:inline">(~5 ph)</span></span>
            </button>

            {/* Dataset switcher: Reset to 0 or View Demo */}
            <button
              onClick={onStartBlank}
              className="flex items-center gap-1 px-2.5 py-1 bg-surface-elevated hover:bg-rose-950/60 text-text-secondary hover:text-rose-300 border border-border-subtle hover:border-rose-500/50 text-xs font-mono rounded-lg transition-colors cursor-pointer active:scale-95"
              title="Đặt lại toàn bộ số liệu về 0 để tự nhập từ đầu"
            >
              <RotateCcw className="w-3.5 h-3.5 text-text-muted" />
              <span className="hidden sm:inline">Đặt về 0</span>
              <span className="sm:hidden">Về 0</span>
            </button>

            {!isDemo && (
              <button
                onClick={onLoadDemo}
                className="flex items-center gap-1 px-2.5 py-1 bg-surface-elevated hover:bg-surface-elevated/80 text-accent-primary border border-accent-primary/40 text-xs font-mono rounded-lg transition-colors cursor-pointer active:scale-95"
                title="Nạp lại bộ dữ liệu mẫu để tham khảo"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xem mẫu Demo</span>
                <span className="sm:hidden">Demo</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Clean Navigation Tabs with Smooth Horizontal Touch-Scroll */}
      <div className="px-2.5 sm:px-3 flex items-center gap-1 overflow-x-auto no-scrollbar bg-surface-base overscroll-contain">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`px-3 py-2 text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all border-b-2 cursor-pointer shrink-0 ${
                isActive
                  ? 'border-accent-primary text-accent-primary font-bold bg-surface-elevated/70 rounded-t-lg'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
