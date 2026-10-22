"use client";

import React, { useState, useMemo } from 'react';
import { MonthlySnapshot } from '../types/finance';
import { calculateJarsDistribution } from '../engines/jarsEngine';
import { calculateYnabMetrics } from '../engines/ynabEngine';
import { calculateFireAndPyramid } from '../engines/firePyramidEngine';
import { analyzeSubscriptionsAndRunway } from '../engines/subscriptionsEngine';
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
} from 'lucide-react';

interface GlobalFinanceViewProps {
  currentSnapshot: MonthlySnapshot;
  allSnapshots?: MonthlySnapshot[];
}

type GlobalTab = 'jars' | 'ynab' | 'fire' | 'copilot';

export const GlobalFinanceView: React.FC<GlobalFinanceViewProps> = ({
  currentSnapshot,
  allSnapshots = [],
}) => {
  const [activeTab, setActiveTab] = useState<GlobalTab>('jars');

  // Tính toán kết quả từ 4 Engine
  const jarsResult = useMemo(
    () => calculateJarsDistribution(currentSnapshot),
    [currentSnapshot]
  );

  const ynabResult = useMemo(
    () => calculateYnabMetrics(currentSnapshot, allSnapshots),
    [currentSnapshot, allSnapshots]
  );

  const fireResult = useMemo(
    () => calculateFireAndPyramid(currentSnapshot),
    [currentSnapshot]
  );

  const copilotResult = useMemo(
    () => analyzeSubscriptionsAndRunway(currentSnapshot),
    [currentSnapshot]
  );

  const formatVnd = (num: number) => {
    return (num || 0).toLocaleString('vi-VN') + ' đ';
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Institutional Global Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-[#0c1a3a] via-[#102454] to-[#0a1329] p-4 sm:p-6 shadow-xl">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 h-36 w-36 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
              <Globe className="h-3.5 w-3.5" />
              <span>Dịch ngược Tinh hoa Tài chính Quốc tế & Việt Nam</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Hệ Thống Quản Trị Tài Chính Đa Phương Pháp
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Tích hợp đồng thời phương pháp <strong className="text-sky-300">6 Chiếc Lọ (Money Lover)</strong>, triết lý <strong className="text-emerald-300">Tuổi dòng tiền (YNAB)</strong>, <strong className="text-amber-300">Tháp tài sản & Tự do tài chính FIRE (Empower/Finhay)</strong>, và <strong className="text-pink-300">Radar Thuê bao & Runway (Copilot Money)</strong>.
            </p>
          </div>

          {/* Quick-Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <div className="rounded-xl border border-sky-500/20 bg-sky-950/40 p-2.5 text-center">
              <div className="text-[10px] uppercase font-bold text-sky-400">JARS Kỷ Luật</div>
              <div className="text-base sm:text-lg font-bold text-white mt-0.5">
                {jarsResult.disciplineScore}/100
              </div>
              <div className="text-[9px] text-slate-400">
                {jarsResult.overspentJarsCount === 0 ? 'Hoàn hảo' : `${jarsResult.overspentJarsCount} lọ vượt chi`}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/40 p-2.5 text-center">
              <div className="text-[10px] uppercase font-bold text-emerald-400">Tuổi tiền (YNAB)</div>
              <div className="text-base sm:text-lg font-bold text-white mt-0.5">
                {ynabResult.ageOfMoneyDays} ngày
              </div>
              <div className="text-[9px] text-slate-400">
                {ynabResult.ageOfMoneyDays >= 30 ? 'Đệm an toàn' : 'Cần tích lũy'}
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-950/40 p-2.5 text-center">
              <div className="text-[10px] uppercase font-bold text-amber-400">Tiến độ FIRE</div>
              <div className="text-base sm:text-lg font-bold text-white mt-0.5">
                {fireResult.fire.progressPercent}%
              </div>
              <div className="text-[9px] text-slate-400">
                ~{fireResult.fire.yearsToFire} năm nữa
              </div>
            </div>

            <div className="rounded-xl border border-pink-500/20 bg-pink-950/40 p-2.5 text-center">
              <div className="text-[10px] uppercase font-bold text-pink-400">Runway Radar</div>
              <div className="text-base sm:text-lg font-bold text-white mt-0.5">
                {copilotResult.runwayMonths} tháng
              </div>
              <div className="text-[9px] text-slate-400">
                Sống sót mất việc
              </div>
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
            <span>Age of Money & Zero-Based (YNAB)</span>
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
            <span>Tháp Tài Sản & FIRE (Empower)</span>
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
            <span>Thuê bao & Runway (Copilot Money)</span>
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
              <span>Tổng thu nhập ròng: <strong className="text-sky-300">{formatVnd(jarsResult.totalIncome)}</strong></span>
              <span>·</span>
              <span>Đã chi: <strong className="text-rose-300">{formatVnd(jarsResult.totalExpenses)}</strong></span>
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
                        <span className="text-[10px] text-slate-400 font-mono">Tỷ lệ mục tiêu: {jar.targetPercent}%</span>
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
                    {formatVnd(fireResult.netWorth)}
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
                * Thuật toán Copilot phát hiện các khoản tiền trừ định kỳ tự động giúp bạn nhận diện các &quot;lỗ rò rỉ tài chính&quot; âm thầm.
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
                <span className="rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 px-2.5 py-0.5 text-xs font-bold">
                  {copilotResult.subscriptions.length} khoản
                </span>
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
                          <span>{sub.isEssential ? 'Cần thiết' : 'Tùy chọn'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white font-mono">{formatVnd(sub.monthlyAmount)} / th</div>
                      <span className="text-[10px] text-slate-400">{formatVnd(sub.monthlyAmount * 12)} / năm</span>
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
