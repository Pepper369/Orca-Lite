"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { MonthlySnapshot } from '../types/finance';
import { calculateJarsDistribution } from '../engines/jarsEngine';
import { calculateYnabMetrics } from '../engines/ynabEngine';
import { calculateFireAndPyramid } from '../engines/firePyramidEngine';
import { analyzeSubscriptionsAndRunway, SubscriptionItem } from '../engines/subscriptionsEngine';
import {
  Globe,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Clock,
  Flame,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Layers,
  CreditCard,
  Target,
  DollarSign,
  HelpCircle,
  Zap,
  SlidersHorizontal,
  RotateCcw,
  Save,
  Plus,
  Trash2,
} from 'lucide-react';

interface GlobalFinanceViewProps {
  currentSnapshot: MonthlySnapshot;
  allSnapshots?: MonthlySnapshot[];
}

type GlobalTab = 'jars' | 'ynab' | 'fire' | 'copilot';

const STORAGE_KEY = 'orca_global_finance_custom_config_v1';

export const GlobalFinanceView: React.FC<GlobalFinanceViewProps> = ({
  currentSnapshot,
  allSnapshots = [],
}) => {
  const [activeTab, setActiveTab] = useState<GlobalTab>('jars');
  const [useCustomAmounts, setUseCustomAmounts] = useState<boolean>(false);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);

  // Snapshot defaults
  const snapIncome = currentSnapshot.metrics.totalNetIncome || 25_000_000;
  const snapExpenses = currentSnapshot.metrics.totalExpenses || 15_000_000;
  const snapCash = currentSnapshot.assets
    .filter((a) => a.category === 'cash')
    .reduce((sum, a) => sum + (a.balance || 0), 0) || 30_000_000;
  const snapInvested = currentSnapshot.assets
    .filter((a) => a.category !== 'cash')
    .reduce((sum, a) => sum + (a.balance || 0), 0) || 50_000_000;

  // Custom User Amounts State
  const [customIncome, setCustomIncome] = useState<number>(snapIncome);
  const [customExpenses, setCustomExpenses] = useState<number>(snapExpenses);
  const [customCash, setCustomCash] = useState<number>(snapCash);
  const [customInvested, setCustomInvested] = useState<number>(snapInvested);
  const [customAge, setCustomAge] = useState<number>(28);
  const [customCagr, setCustomCagr] = useState<number>(10); // 10%

  // Custom JARS ratios (NEC, FFA, LTSS, EDU, PLAY, GIVE)
  const [jarsRatios, setJarsRatios] = useState<Record<string, number>>({
    NEC: 55,
    FFA: 10,
    LTSS: 10,
    EDU: 10,
    PLAY: 10,
    GIVE: 5,
  });

  // Custom Subscriptions list
  const [customSubs, setCustomSubs] = useState<SubscriptionItem[]>([
    { id: 'sub-1', name: 'Netflix Premium', category: 'digital', monthlyAmount: 260_000, billingCycle: 'monthly', autoRenew: true, isEssential: false, color: '#ec4899', icon: '🎬' },
    { id: 'sub-2', name: 'Spotify Music', category: 'digital', monthlyAmount: 59_000, billingCycle: 'monthly', autoRenew: true, isEssential: false, color: '#ec4899', icon: '🎵' },
    { id: 'sub-3', name: 'iCloud 200GB', category: 'digital', monthlyAmount: 69_000, billingCycle: 'monthly', autoRenew: true, isEssential: true, color: '#38bdf8', icon: '☁️' },
    { id: 'sub-4', name: 'ChatGPT Plus AI', category: 'productivity', monthlyAmount: 520_000, billingCycle: 'monthly', autoRenew: true, isEssential: true, color: '#818cf8', icon: '🤖' },
    { id: 'sub-5', name: 'Internet Cáp Quang', category: 'living', monthlyAmount: 250_000, billingCycle: 'monthly', autoRenew: true, isEssential: true, color: '#38bdf8', icon: '🌐' },
  ]);

  // Load custom settings from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.customIncome != null) setCustomIncome(parsed.customIncome);
        if (parsed.customExpenses != null) setCustomExpenses(parsed.customExpenses);
        if (parsed.customCash != null) setCustomCash(parsed.customCash);
        if (parsed.customInvested != null) setCustomInvested(parsed.customInvested);
        if (parsed.customAge != null) setCustomAge(parsed.customAge);
        if (parsed.customCagr != null) setCustomCagr(parsed.customCagr);
        if (parsed.jarsRatios != null) setJarsRatios(parsed.jarsRatios);
        if (parsed.customSubs != null && Array.isArray(parsed.customSubs)) setCustomSubs(parsed.customSubs);
        if (parsed.useCustomAmounts != null) setUseCustomAmounts(parsed.useCustomAmounts);
      }
    } catch {
      /* ignore storage load error */
    }
  }, []);

  const handleSaveToLocalStorage = () => {
    try {
      const payload = {
        useCustomAmounts: true,
        customIncome,
        customExpenses,
        customCash,
        customInvested,
        customAge,
        customCagr,
        jarsRatios,
        customSubs,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setUseCustomAmounts(true);
      setShowConfigDrawer(false);
    } catch {
      /* ignore save error */
    }
  };

  const handleResetToSnapshot = () => {
    setCustomIncome(snapIncome);
    setCustomExpenses(snapExpenses);
    setCustomCash(snapCash);
    setCustomInvested(snapInvested);
    setUseCustomAmounts(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  // Giá trị thực tế đưa vào Engine
  const effectiveIncome = useCustomAmounts ? customIncome : snapIncome;
  const effectiveExpenses = useCustomAmounts ? customExpenses : snapExpenses;
  const effectiveCash = useCustomAmounts ? customCash : snapCash;
  const effectiveInvested = useCustomAmounts ? customInvested : snapInvested;

  // Tính toán kết quả từ 4 Engine với số tiền tùy chỉnh
  const jarsResult = useMemo(
    () => calculateJarsDistribution(
      currentSnapshot,
      jarsRatios,
      effectiveIncome,
      effectiveExpenses
    ),
    [currentSnapshot, jarsRatios, effectiveIncome, effectiveExpenses]
  );

  const ynabResult = useMemo(
    () => calculateYnabMetrics(
      currentSnapshot,
      allSnapshots,
      effectiveIncome,
      effectiveExpenses,
      effectiveCash
    ),
    [currentSnapshot, allSnapshots, effectiveIncome, effectiveExpenses, effectiveCash]
  );

  const fireResult = useMemo(
    () => calculateFireAndPyramid(
      currentSnapshot,
      customAge,
      customCagr / 100,
      {
        customMonthlyExpenses: effectiveExpenses,
        customMonthlyIncome: effectiveIncome,
        customCashDefense: effectiveCash,
        customInvestedAssets: effectiveInvested,
      }
    ),
    [currentSnapshot, customAge, customCagr, effectiveExpenses, effectiveIncome, effectiveCash, effectiveInvested]
  );

  const copilotResult = useMemo(
    () => analyzeSubscriptionsAndRunway(
      currentSnapshot,
      customSubs,
      effectiveIncome,
      effectiveCash,
      Math.round(effectiveExpenses * 0.6)
    ),
    [currentSnapshot, customSubs, effectiveIncome, effectiveCash, effectiveExpenses]
  );

  const formatVnd = (num: number) => {
    return (num || 0).toLocaleString('vi-VN') + ' đ';
  };

  const handleAddSubscription = () => {
    const name = prompt('Nhập tên khoản chi định kỳ / Thuê bao:');
    if (!name?.trim()) return;
    const amountStr = prompt('Nhập số tiền hàng tháng (VND):', '100000');
    const amount = Number(amountStr?.replace(/\D/g, '')) || 100_000;
    const isEssential = confirm('Khoản chi này có phải là bắt buộc thiết yếu không? (OK = Có, Cancel = Tùy chọn)');

    const newSub: SubscriptionItem = {
      id: `sub-${Date.now()}`,
      name: name.trim(),
      category: 'digital',
      monthlyAmount: amount,
      billingCycle: 'monthly',
      autoRenew: true,
      isEssential,
      color: isEssential ? '#38bdf8' : '#ec4899',
      icon: '⚡',
    };
    setCustomSubs((prev) => [newSub, ...prev]);
  };

  const handleDeleteSubscription = (id: string) => {
    setCustomSubs((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Institutional Global Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-[#0c1a3a] via-[#102454] to-[#0a1329] p-4 sm:p-6 shadow-xl">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 h-36 w-36 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
                <Globe className="h-3.5 w-3.5" />
                <span>Dịch ngược Tinh hoa Tài chính Quốc tế &amp; VN</span>
              </span>

              {useCustomAmounts ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                  <span>✏️</span>
                  <span>Chế độ: Số tiền Tự thiết lập</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                  <span>📁</span>
                  <span>Chế độ: Đồng bộ theo Sổ sách kỳ</span>
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Hệ Thống Quản Trị Tài Chính Cá Nhân Đa Mô Hình
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Bạn có thể xem tự động từ sổ sách hoặc <strong className="text-sky-300">tự do thiết lập số tiền của chính bạn</strong> để mô phỏng 6 Lọ JARS, Tuổi tiền YNAB, Tháp tài sản FIRE và Radar chi phí định kỳ.
            </p>
          </div>

          {/* Action Control: Toggle Custom Studio */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowConfigDrawer(!showConfigDrawer)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-sky-500/25 hover:from-sky-400 hover:to-blue-500 transition-all cursor-pointer"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>{showConfigDrawer ? 'Đóng bảng thiết lập' : '✏️ Tự thiết lập Số tiền của tôi'}</span>
            </button>

            {useCustomAmounts && (
              <button
                type="button"
                onClick={handleResetToSnapshot}
                title="Khôi phục lại dữ liệu gốc từ sổ sách kỳ"
                className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-xs text-slate-300 hover:bg-slate-700 transition-all cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* INTERACTIVE CUSTOM AMOUNTS STUDIO (EXPANDABLE) */}
        {showConfigDrawer && (
          <div className="mt-5 rounded-2xl border border-sky-400/40 bg-[#091530] p-4 sm:p-5 shadow-inner space-y-4 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-sky-400" />
                  <span>Bảng Tự Thiết Lập Dòng Tiền &amp; Tài Sản Cá Nhân (Realtime)</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Nhập số tiền thực tế của bạn. Hệ thống sẽ ngay lập tức tính toán lại toàn bộ 4 mô hình!
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveToLocalStorage}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 shadow-md transition-all cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Áp dụng &amp; Lưu</span>
                </button>
              </div>
            </div>

            {/* 4 Core Financial Inputs */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Income */}
              <div className="rounded-xl border border-sky-500/30 bg-[#0e1d44] p-3 space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center justify-between">
                  <span>Thu nhập tháng</span>
                  <span className="text-[10px] text-slate-400 font-normal">VND / tháng</span>
                </label>
                <input
                  type="number"
                  step="500000"
                  value={customIncome}
                  onChange={(e) => {
                    setCustomIncome(Number(e.target.value) || 0);
                    setUseCustomAmounts(true);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 font-mono text-sm font-bold text-white focus:border-sky-400 focus:outline-none"
                />
                <div className="flex gap-1 pt-1">
                  {[15, 25, 40, 60].map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => {
                        setCustomIncome(tr * 1_000_000);
                        setUseCustomAmounts(true);
                      }}
                      className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-mono text-sky-300 hover:bg-sky-500/30 cursor-pointer"
                    >
                      {tr}tr
                    </button>
                  ))}
                </div>
              </div>

              {/* Expenses */}
              <div className="rounded-xl border border-rose-500/30 bg-[#0e1d44] p-3 space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-rose-300 flex items-center justify-between">
                  <span>Chi tiêu tháng</span>
                  <span className="text-[10px] text-slate-400 font-normal">VND / tháng</span>
                </label>
                <input
                  type="number"
                  step="500000"
                  value={customExpenses}
                  onChange={(e) => {
                    setCustomExpenses(Number(e.target.value) || 0);
                    setUseCustomAmounts(true);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 font-mono text-sm font-bold text-white focus:border-rose-400 focus:outline-none"
                />
                <div className="flex gap-1 pt-1">
                  {[10, 18, 25, 35].map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => {
                        setCustomExpenses(tr * 1_000_000);
                        setUseCustomAmounts(true);
                      }}
                      className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-mono text-rose-300 hover:bg-rose-500/30 cursor-pointer"
                    >
                      {tr}tr
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash Defense */}
              <div className="rounded-xl border border-emerald-500/30 bg-[#0e1d44] p-3 space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center justify-between">
                  <span>Tiền mặt dự phòng</span>
                  <span className="text-[10px] text-slate-400 font-normal">Quỹ khẩn cấp</span>
                </label>
                <input
                  type="number"
                  step="1000000"
                  value={customCash}
                  onChange={(e) => {
                    setCustomCash(Number(e.target.value) || 0);
                    setUseCustomAmounts(true);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 font-mono text-sm font-bold text-white focus:border-emerald-400 focus:outline-none"
                />
                <div className="flex gap-1 pt-1">
                  {[20, 50, 100, 200].map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => {
                        setCustomCash(tr * 1_000_000);
                        setUseCustomAmounts(true);
                      }}
                      className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300 hover:bg-emerald-500/30 cursor-pointer"
                    >
                      {tr}tr
                    </button>
                  ))}
                </div>
              </div>

              {/* Invested Assets */}
              <div className="rounded-xl border border-amber-500/30 bg-[#0e1d44] p-3 space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center justify-between">
                  <span>Tài sản đầu tư sinh lời</span>
                  <span className="text-[10px] text-slate-400 font-normal">Cổ phiếu, Quỹ, BĐS</span>
                </label>
                <input
                  type="number"
                  step="2000000"
                  value={customInvested}
                  onChange={(e) => {
                    setCustomInvested(Number(e.target.value) || 0);
                    setUseCustomAmounts(true);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 font-mono text-sm font-bold text-white focus:border-amber-400 focus:outline-none"
                />
                <div className="flex gap-1 pt-1">
                  {[50, 150, 300, 500].map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => {
                        setCustomInvested(tr * 1_000_000);
                        setUseCustomAmounts(true);
                      }}
                      className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono text-amber-300 hover:bg-amber-500/30 cursor-pointer"
                    >
                      {tr}tr
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced Settings Strip */}
            <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-sky-500/20 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-slate-300 whitespace-nowrap">Tuổi hiện tại của bạn:</span>
                <input
                  type="number"
                  min="18"
                  max="70"
                  value={customAge}
                  onChange={(e) => setCustomAge(Number(e.target.value) || 28)}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white text-center font-bold"
                />
                <span className="text-slate-400">tuổi</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-300 whitespace-nowrap">Kỳ vọng lợi nhuận đầu tư:</span>
                <input
                  type="number"
                  min="4"
                  max="30"
                  value={customCagr}
                  onChange={(e) => setCustomCagr(Number(e.target.value) || 10)}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-amber-300 text-center font-bold"
                />
                <span className="text-slate-400">%/năm (chuẩn VN-Index)</span>
              </div>
            </div>
          </div>
        )}

        {/* Quick-Stats Grid */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-sky-500/20 bg-sky-950/40 p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-sky-400">JARS Kỷ Luật</div>
            <div className="text-base sm:text-xl font-bold text-white mt-0.5">
              {jarsResult.disciplineScore}/100
            </div>
            <div className="text-[10px] text-slate-300">
              {jarsResult.overspentJarsCount === 0 ? '✓ Cân đối chuẩn' : `${jarsResult.overspentJarsCount} lọ vượt chi`}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-400">Tuổi tiền (YNAB)</div>
            <div className="text-base sm:text-xl font-bold text-white mt-0.5">
              {ynabResult.ageOfMoneyDays} ngày
            </div>
            <div className="text-[10px] text-slate-300">
              {ynabResult.ageOfMoneyDays >= 30 ? '✓ Đệm an toàn' : '⚠️ Cần đệm 30d'}
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-950/40 p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-amber-400">Tiến độ FIRE</div>
            <div className="text-base sm:text-xl font-bold text-white mt-0.5">
              {fireResult.fire.progressPercent}%
            </div>
            <div className="text-[10px] text-slate-300">
              ~{fireResult.fire.yearsToFire} năm nữa
            </div>
          </div>

          <div className="rounded-xl border border-pink-500/20 bg-pink-950/40 p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-pink-400">Runway Sống Sót</div>
            <div className="text-base sm:text-xl font-bold text-white mt-0.5">
              {copilotResult.runwayMonths} tháng
            </div>
            <div className="text-[10px] text-slate-300">
              Nếu mất việc
            </div>
          </div>
        </div>

        {/* Global Tab Switcher */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-sky-500/20 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('jars')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'jars'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25'
                : 'bg-[#152754]/80 text-slate-300 hover:bg-[#1b326d] hover:text-white'
            }`}
          >
            <span>🏺</span>
            <span>6 Chiếc Lọ (Money Lover)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ynab')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'ynab'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                : 'bg-[#152754]/80 text-slate-300 hover:bg-[#1b326d] hover:text-white'
            }`}
          >
            <span>⏳</span>
            <span>Age of Money &amp; Zero-Based (YNAB)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fire')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'fire'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25'
                : 'bg-[#152754]/80 text-slate-300 hover:bg-[#1b326d] hover:text-white'
            }`}
          >
            <span>🏛️</span>
            <span>Tháp Tài Sản &amp; FIRE (Empower)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'copilot'
                ? 'bg-pink-500 text-white shadow-md shadow-pink-500/25'
                : 'bg-[#152754]/80 text-slate-300 hover:bg-[#1b326d] hover:text-white'
            }`}
          >
            <span>📡</span>
            <span>Thuê bao &amp; Runway (Copilot Money)</span>
          </button>
        </div>
      </div>

      {/* TAB 1: JARS SYSTEM (MONEY LOVER) */}
      {activeTab === 'jars' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#203671] bg-[#0c1633] p-4 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
            <div>
              <strong className="text-white">Triết lý T. Harv Eker (Money Lover): </strong>
              {jarsResult.verdictVi}
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span>Thu nhập tính toán: <strong className="text-sky-300">{formatVnd(jarsResult.totalIncome)}</strong></span>
              <span>·</span>
              <span>Chi tiêu tính toán: <strong className="text-rose-300">{formatVnd(jarsResult.totalExpenses)}</strong></span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jarsResult.jars.map((jar) => {
              const pctSpent = jar.allocatedAmount > 0 ? Math.round((jar.spentAmount / jar.allocatedAmount) * 100) : 0;
              const isOver = jar.status === 'OVERSPENT';
              const isWarn = jar.status === 'WARNING';

              return (
                <div
                  key={jar.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isOver
                      ? 'border-rose-500/50 bg-rose-950/20'
                      : isWarn
                      ? 'border-amber-500/40 bg-amber-950/20'
                      : 'border-[#1e346d] bg-[#0d1736]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{jar.icon}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white">{jar.nameVi}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">Tỷ lệ: {jar.targetPercent}%</span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isOver
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : isWarn
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {isOver ? '⚠️ Lạm chi' : isWarn ? '⚡ Sắp chạm trần' : '✓ An toàn'}
                    </span>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-300 line-clamp-1">{jar.description}</p>

                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>Đã tiêu:</span>
                      <strong className="text-white font-mono">{formatVnd(jar.spentAmount)}</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Ngân sách lọ:</span>
                      <span className="font-mono">{formatVnd(jar.allocatedAmount)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Còn lại:</span>
                      <span
                        className={`font-mono font-bold ${
                          jar.remainingAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatVnd(jar.remainingAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Tiến độ ngân sách</span>
                      <span className="font-mono">{pctSpent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#182a58]">
                      <div
                        className={`h-full transition-all ${
                          isOver ? 'bg-rose-500' : isWarn ? 'bg-amber-400' : 'bg-sky-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, pctSpent))}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: YNAB (YOU NEED A BUDGET) */}
      {activeTab === 'ynab' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-12">
            {/* Age of Money Card */}
            <div className="md:col-span-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#0c223a] to-[#0d1736] p-5 shadow-lg">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Clock className="h-4 w-4" />
                <span>Thước đo Tuổi Dòng Tiền (Age of Money)</span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black text-white font-mono">
                  {ynabResult.ageOfMoneyDays}
                </span>
                <span className="text-lg font-bold text-emerald-300">ngày</span>
              </div>

              <p className="mt-2 text-xs text-slate-200 leading-relaxed font-medium">
                {ynabResult.ageStatusLabelVi}
              </p>

              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3 text-[11.5px] text-slate-300 space-y-1.5">
                <div className="flex justify-between">
                  <span>Tiền đệm sống sót:</span>
                  <strong className="text-white">{ynabResult.bufferMonths} tháng</strong>
                </div>
                <div className="flex justify-between">
                  <span>Tiền mặt khả dụng:</span>
                  <strong className="text-emerald-300 font-mono">{formatVnd(effectiveCash)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Tiêu chuẩn YNAB:</span>
                  <span className="text-emerald-300 font-semibold">&gt; 30 ngày (Tiêu tiền tháng trước)</span>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-slate-400 italic">
                * Tuổi dòng tiền càng cao, bạn càng an tâm trước những biến cố kinh tế bất ngờ mà không phải vay mượn.
              </div>
            </div>

            {/* Zero-Based Budgeting & 4 Rules */}
            <div className="md:col-span-7 rounded-2xl border border-[#203671] bg-[#0d1736] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">4 Quy Tắc Vàng Chuẩn YNAB</h3>
                  <p className="text-xs text-slate-400">Đánh giá mức độ tuân thủ triết lý ngân sách số 1 nước Mỹ</p>
                </div>
                <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 px-3 py-1.5 text-center">
                  <div className="text-[10px] text-sky-400 font-bold uppercase">Điểm YNAB</div>
                  <div className="text-lg font-black text-white">{ynabResult.totalYnabScore}/100</div>
                </div>
              </div>

              <div className="space-y-2.5">
                {ynabResult.rules.map((rule) => (
                  <div
                    key={rule.ruleNumber}
                    className="rounded-xl border border-[#1b2f64] bg-[#121f47] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {rule.pass ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                        )}
                        <span className="font-semibold text-white">
                          Rule {rule.ruleNumber}: {rule.titleVi}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-sky-300">{rule.score}/25</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-slate-300 ml-6">{rule.detailVi}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WEALTH PYRAMID & FIRE (EMPOWER / FINHAY) */}
      {activeTab === 'fire' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-12">
            {/* 4-Tier Wealth Pyramid */}
            <div className="md:col-span-7 rounded-2xl border border-amber-500/30 bg-[#0d1736] p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>🏛️</span>
                    <span>Tháp Tài Sản 4 Tầng (Wealth Pyramid)</span>
                  </h3>
                  <p className="text-xs text-slate-400">Mô hình phân bổ tài sản vững chãi theo chuẩn quốc tế</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Tài sản ròng</div>
                  <div className="text-sm sm:text-base font-bold text-amber-300 font-mono">
                    {formatVnd(effectiveCash + effectiveInvested)}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-1">
                {fireResult.pyramid.map((tier) => (
                  <div
                    key={tier.tierNumber}
                    className="rounded-xl border border-[#1e346d] bg-[#101e47] p-3 transition-all hover:border-amber-400/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{tier.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-white">{tier.nameVi}</div>
                          <div className="text-[10.5px] text-slate-400">{tier.descriptionVi}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-white font-mono">{formatVnd(tier.totalValue)}</div>
                        <span className="text-[10px] font-mono text-amber-300 font-bold">{tier.percentOfNetworth}%</span>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#182a58]">
                      <div
                        className="h-full bg-amber-400 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(3, tier.percentOfNetworth))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FIRE Simulator */}
            <div className="md:col-span-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-[#241708] via-[#1a1408] to-[#0d1736] p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Flame className="h-4 w-4" />
                <span>Bộ Mô Phỏng Tự Do Tài Chính (FIRE)</span>
              </div>

              <div>
                <div className="text-[11px] text-slate-400">Mục tiêu Tài sản Tự do Tài chính (Quy tắc 4% SWR):</div>
                <div className="text-2xl sm:text-3xl font-black text-amber-300 font-mono mt-0.5">
                  {formatVnd(fireResult.fire.fireTargetStandard)}
                </div>
                <div className="text-[11px] text-slate-300 mt-1">
                  Đảm bảo dòng tiền rút an toàn: <strong className="text-white">{formatVnd(fireResult.fire.annualExpenses / 12)} / tháng</strong> suốt đời không hết vốn.
                </div>
              </div>

              {/* Progress to FIRE */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 p-3.5 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Đã tích lũy đầu tư:</span>
                  <strong className="text-white font-mono">{formatVnd(fireResult.fire.currentInvestedAssets)}</strong>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Tiến độ đạt mốc FIRE:</span>
                  <strong className="text-amber-400 font-mono">{fireResult.fire.progressPercent}%</strong>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#182a58]">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full"
                    style={{ width: `${fireResult.fire.progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                  <span>Dự kiến chạm mốc:</span>
                  <span className="text-white font-bold">Tuổi {fireResult.fire.targetFireAge} (~{fireResult.fire.yearsToFire} năm)</span>
                </div>
              </div>

              {/* 3 FIRE Tiers */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-[#14234e] p-2 border border-[#223b7a]">
                  <span className="text-slate-400">Lean FIRE (Tối thiểu):</span>
                  <div className="font-bold text-white font-mono mt-0.5">{formatVnd(fireResult.fire.fireTargetLean)}</div>
                </div>
                <div className="rounded-lg bg-[#14234e] p-2 border border-[#223b7a]">
                  <span className="text-slate-400">Fat FIRE (Sung túc):</span>
                  <div className="font-bold text-white font-mono mt-0.5">{formatVnd(fireResult.fire.fireTargetFat)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUBSCRIPTIONS & RUNWAY (COPILOT MONEY) */}
      {activeTab === 'copilot' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-12">
            {/* Cash Flow Runway Radar */}
            <div className="md:col-span-5 rounded-2xl border border-pink-500/30 bg-gradient-to-br from-[#240a1d] to-[#0d1736] p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-pink-400">
                <Zap className="h-4 w-4" />
                <span>Cash Flow Runway Radar (Số tháng sống sót)</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-black text-white font-mono">
                  {copilotResult.runwayMonths}
                </span>
                <span className="text-lg font-bold text-pink-300">tháng</span>
              </div>

              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                {copilotResult.runwayStatusVi}
              </p>

              <div className="rounded-xl border border-pink-500/20 bg-pink-950/30 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-300">Chi phí thuê bao hàng tháng:</span>
                  <strong className="text-pink-300 font-mono">{formatVnd(copilotResult.totalMonthlyCost)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Tổng chi phí thuê bao / năm:</span>
                  <strong className="text-white font-mono">{formatVnd(copilotResult.totalAnnualCost)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Tiềm năng tiết kiệm:</span>
                  <strong className="text-emerald-400 font-mono">+{formatVnd(copilotResult.potentialAnnualSavings)} / năm</strong>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 leading-relaxed">
                * Quỹ tiền mặt khả dụng hiện tại: <strong className="text-white">{formatVnd(effectiveCash)}</strong>.
              </div>
            </div>

            {/* Subscriptions List */}
            <div className="md:col-span-7 rounded-2xl border border-[#203671] bg-[#0d1736] p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-pink-400" />
                    <span>Khoản Chi Định Kỳ &amp; Thuê Bao Số</span>
                  </h3>
                  <p className="text-xs text-slate-400">Theo dõi ngày thu tiền và mức độ thiết yếu của từng dịch vụ</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddSubscription}
                    className="flex items-center gap-1 rounded-lg bg-pink-500/20 border border-pink-500/40 px-2.5 py-1 text-xs font-bold text-pink-300 hover:bg-pink-500/30 transition-all cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Thêm khoản chi</span>
                  </button>
                  <span className="rounded-full bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 text-xs font-bold">
                    {copilotResult.subscriptions.length} khoản
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {copilotResult.subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-xl border border-[#1b2f64] bg-[#121f47] p-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{sub.icon}</span>
                      <div>
                        <div className="font-bold text-white">{sub.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>Chu kỳ: {sub.billingCycle === 'monthly' ? 'Hàng tháng' : 'Hàng năm'}</span>
                          <span>·</span>
                          <span className={sub.isEssential ? 'text-sky-300' : 'text-slate-400'}>
                            {sub.isEssential ? 'Cần thiết' : 'Tùy chọn'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold text-white font-mono">{formatVnd(sub.monthlyAmount)} / th</div>
                        <span className="text-[10px] text-slate-400">{formatVnd(sub.monthlyAmount * 12)} / năm</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubscription(sub.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Xóa khoản chi này"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
