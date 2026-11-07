"use client";

import React, { useState } from "react";
import {
  Zap,
  Target,
  ShieldCheck,
  TrendingUp,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers,
  Award,
} from "lucide-react";

export interface MatrixFilterState {
  // Tier 1: Timing & Trigger
  sniperTriggerOnly?: boolean;
  goldenPocketFilter?: boolean;
  squeezeFilter?: string;
  flipZoneFilter?: boolean;
  smcOrderBlockFilter?: boolean;
  setupGradeFilter?: "all" | "A+" | "A" | "B" | string;
  sniperSubtypeFilter?: "all" | "SNIPER_PULLBACK" | "SQUEEZE_BREAKOUT" | "SWEEP_RECLAIM" | string;
  minSniperRRFilter?: string;

  // Tier 2: Setup Pattern
  tightClosesOnly?: boolean;
  vduOnly?: boolean;
  vsaNoSupplyOnly?: boolean;
  maRibbonSqueezeOnly?: boolean;
  maReclaimOnly?: boolean;

  // Tier 3: Flow & Alpha
  minSmartMoneyScore?: string;
  rrgQuadrant?: string;
  minRsRating?: string;
  mtfOnly?: boolean;
  minOrcaMasterScore?: string;

  // Tier 4: Fundamental Moat
  faProfileCombo?: string;
  netCashOnly?: boolean;
  minPiotroskiScore?: string;
  minRoic?: string;
  maxPeg?: string;
}

interface ScreenerMatrixToolbarProps {
  filters: MatrixFilterState;
  onToggle: (key: string, val: unknown) => void;
  onReset: () => void;
  totalFilteredCount?: number;
}

export function ScreenerMatrixToolbar({
  filters,
  onToggle,
  onReset,
  totalFilteredCount,
}: ScreenerMatrixToolbarProps) {
  const [activeTierTab, setActiveTierTab] = useState<"all" | 1 | 2 | 3 | 4>("all");
  const [isExpanded, setIsExpanded] = useState(true);

  // Calculate active filters per tier
  const tier1Active = [
    Boolean(filters.sniperTriggerOnly),
    Boolean(filters.goldenPocketFilter),
    filters.squeezeFilter === "FIRED",
    Boolean(filters.flipZoneFilter),
    Boolean(filters.smcOrderBlockFilter),
    filters.setupGradeFilter === "A+" || filters.setupGradeFilter === "A",
    filters.sniperSubtypeFilter && filters.sniperSubtypeFilter !== "all",
    Boolean(filters.minSniperRRFilter),
  ].filter(Boolean).length;

  const tier2Active = [
    Boolean(filters.tightClosesOnly),
    Boolean(filters.vduOnly),
    Boolean(filters.vsaNoSupplyOnly),
    Boolean(filters.maRibbonSqueezeOnly),
    Boolean(filters.maReclaimOnly),
  ].filter(Boolean).length;

  const tier3Active = [
    filters.minSmartMoneyScore === "65",
    filters.rrgQuadrant === "LEADING",
    filters.minRsRating === "80",
    Boolean(filters.mtfOnly),
    filters.minOrcaMasterScore === "90",
  ].filter(Boolean).length;

  const tier4Active = [
    filters.faProfileCombo === "FORTRESS",
    Boolean(filters.netCashOnly),
    filters.minPiotroskiScore === "7",
    filters.minRoic === "15",
    filters.maxPeg === "1.0",
  ].filter(Boolean).length;

  const totalActive = tier1Active + tier2Active + tier3Active + tier4Active;
  const tiersPassingCount = [tier1Active, tier2Active, tier3Active, tier4Active].filter((c) => c > 0).length;

  return (
    <div className="rounded-xl border border-border-subtle bg-panel/95 p-3 shadow-md backdrop-blur-md transition-all">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Ma Trận Hợp Lưu 4 Tầng
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted border border-border-subtle">
                4-Tier Confluence Matrix
              </span>
              {tiersPassingCount >= 3 && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse">
                  <Award className="size-3" />
                  {tiersPassingCount === 4 ? "Tứ Hợp Lưu A+" : "Tam Hợp Lưu A"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-muted hidden sm:block">
              Kết hợp các tầng độc lập để sàng lọc cổ phiếu có xác suất bứt phá cao nhất
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalFilteredCount != null && (
            <span className="text-xs font-medium text-text-secondary px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-subtle">
              Tìm thấy: <strong className="text-emerald-400 font-bold">{totalFilteredCount}</strong> mã
            </span>
          )}

          {totalActive > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-all"
            >
              <RotateCcw className="size-3" />
              <span>Xóa bộ lọc ({totalActive})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
            title={isExpanded ? "Thu gọn ma trận" : "Mở rộng ma trận"}
          >
            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="pt-2.5 space-y-2.5">
          {/* Tier Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => setActiveTierTab("all")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTierTab === "all"
                  ? "bg-accent-primary text-text-on-accent shadow-xs"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              Tất cả 4 Tầng {totalActive > 0 && `(${totalActive})`}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(1)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTierTab === 1
                  ? "bg-emerald-500/25 text-emerald-200 border border-emerald-400/50 shadow-xs"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              <Target className="size-3 text-emerald-400" />
              <span>T1: Timing & Trigger</span>
              {tier1Active > 0 && (
                <span className="size-4 rounded-full bg-emerald-500/40 text-[10px] flex items-center justify-center font-bold">
                  {tier1Active}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(2)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTierTab === 2
                  ? "bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-xs"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              <Sparkles className="size-3 text-cyan-400" />
              <span>T2: Setup Pattern</span>
              {tier2Active > 0 && (
                <span className="size-4 rounded-full bg-cyan-500/40 text-[10px] flex items-center justify-center font-bold">
                  {tier2Active}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(3)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTierTab === 3
                  ? "bg-amber-500/25 text-amber-200 border border-amber-400/50 shadow-xs"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              <TrendingUp className="size-3 text-amber-400" />
              <span>T3: Flow & Alpha</span>
              {tier3Active > 0 && (
                <span className="size-4 rounded-full bg-amber-500/40 text-[10px] flex items-center justify-center font-bold">
                  {tier3Active}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(4)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTierTab === 4
                  ? "bg-indigo-500/25 text-indigo-200 border border-indigo-400/50 shadow-xs"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              <ShieldCheck className="size-3 text-indigo-400" />
              <span>T4: Fundamental Moat</span>
              {tier4Active > 0 && (
                <span className="size-4 rounded-full bg-indigo-500/40 text-[10px] flex items-center justify-center font-bold">
                  {tier4Active}
                </span>
              )}
            </button>
          </div>

          {/* TIER 1: TIMING & TRIGGER */}
          {(activeTierTab === "all" || activeTierTab === 1) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                <Target className="size-3" />
                T1 Timing:
              </span>

              {/* 1.1 Actionable Buy Trigger */}
              <button
                type="button"
                onClick={() => onToggle("sniperTriggerOnly", !filters.sniperTriggerOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.sniperTriggerOnly
                    ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🎯</span>
                <span>Điểm Mua Tức Thời</span>
              </button>

              {/* 1.2 Setup Grade A+ */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.setupGradeFilter === "A+" ? "all" : "A+";
                  onToggle("setupGradeFilter", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.setupGradeFilter === "A+"
                    ? "bg-amber-500/30 text-amber-200 border-amber-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🏆</span>
                <span>Hợp Lưu Hạng A+</span>
              </button>

              {/* 1.3 Fibo Golden Pocket 0.618 */}
              <button
                type="button"
                onClick={() => onToggle("goldenPocketFilter", !filters.goldenPocketFilter)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.goldenPocketFilter
                    ? "bg-purple-500/30 text-purple-200 border-purple-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>📐</span>
                <span>Fibo GP 0.618</span>
              </button>

              {/* 1.4 Squeeze Breakout */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.squeezeFilter === "FIRED" ? "ALL" : "FIRED";
                  onToggle("squeezeFilter", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.squeezeFilter === "FIRED"
                    ? "bg-rose-500/30 text-rose-200 border-rose-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>⚡</span>
                <span>Nổ Squeeze Breakout</span>
              </button>

              {/* 1.5 Flip Zone Retest */}
              <button
                type="button"
                onClick={() => onToggle("flipZoneFilter", !filters.flipZoneFilter)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.flipZoneFilter
                    ? "bg-blue-500/30 text-blue-200 border-blue-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🔄</span>
                <span>Flip Zone Retest</span>
              </button>

              {/* 1.6 SMC Order Block */}
              <button
                type="button"
                onClick={() => onToggle("smcOrderBlockFilter", !filters.smcOrderBlockFilter)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.smcOrderBlockFilter
                    ? "bg-indigo-500/30 text-indigo-200 border-indigo-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🏦</span>
                <span>Order Block SMC</span>
              </button>

              {/* Subtype & R:R dropdowns */}
              <select
                value={filters.sniperSubtypeFilter || "all"}
                onChange={(e) => onToggle("sniperSubtypeFilter", e.target.value)}
                className="rounded border border-border-subtle bg-surface-base px-2 py-0.5 text-xs text-text-primary focus:border-accent-primary"
              >
                <option value="all">Kịch Bản Sniper...</option>
                <option value="SNIPER_PULLBACK">🎯 Pullback Vùng Vàng</option>
                <option value="SQUEEZE_BREAKOUT">⚡ Bứt Phá Squeeze</option>
                <option value="SWEEP_RECLAIM">🔄 Quét Thanh Khoản</option>
              </select>

              <select
                value={filters.minSniperRRFilter || ""}
                onChange={(e) => onToggle("minSniperRRFilter", e.target.value)}
                className="rounded border border-border-subtle bg-surface-base px-2 py-0.5 text-xs text-text-primary focus:border-accent-primary"
              >
                <option value="">Mọi R:R</option>
                <option value="2.0">R:R ≥ 2.0x</option>
                <option value="2.5">R:R ≥ 2.5x</option>
                <option value="3.0">R:R ≥ 3.0x</option>
              </select>
            </div>
          )}

          {/* TIER 2: SETUP PATTERN */}
          {(activeTierTab === "all" || activeTierTab === 2) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-cyan-950/20 border border-cyan-500/20">
              <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                <Sparkles className="size-3" />
                T2 Pattern:
              </span>

              {/* 2.1 Tight Closes */}
              <button
                type="button"
                onClick={() => onToggle("tightClosesOnly", !filters.tightClosesOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.tightClosesOnly
                    ? "bg-cyan-500/30 text-cyan-200 border-cyan-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>📦</span>
                <span>Nén Giá Phẳng (Tight Closes)</span>
              </button>

              {/* 2.2 Volume Dry-Up */}
              <button
                type="button"
                onClick={() => onToggle("vduOnly", !filters.vduOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.vduOnly
                    ? "bg-sky-500/30 text-sky-200 border-sky-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>💧</span>
                <span>Cạn Kiệt Khối Lượng (VDU)</span>
              </button>

              {/* 2.3 VSA No Supply */}
              <button
                type="button"
                onClick={() => onToggle("vsaNoSupplyOnly", !filters.vsaNoSupplyOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.vsaNoSupplyOnly
                    ? "bg-teal-500/30 text-teal-200 border-teal-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🧪</span>
                <span>VSA No Supply Test</span>
              </button>

              {/* 2.4 MA Ribbon Squeeze */}
              <button
                type="button"
                onClick={() => onToggle("maRibbonSqueezeOnly", !filters.maRibbonSqueezeOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.maRibbonSqueezeOnly
                    ? "bg-indigo-500/30 text-indigo-200 border-indigo-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>📊</span>
                <span>Nén Dải Ribbon MA</span>
              </button>

              {/* 2.5 MA Reclaim Spring */}
              <button
                type="button"
                onClick={() => onToggle("maReclaimOnly", !filters.maReclaimOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.maReclaimOnly
                    ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🌱</span>
                <span>Lấy Lại Hỗ Trợ MA Spring</span>
              </button>
            </div>
          )}

          {/* TIER 3: FLOW & ALPHA */}
          {(activeTierTab === "all" || activeTierTab === 3) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-amber-950/20 border border-amber-500/20">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                <TrendingUp className="size-3" />
                T3 Flow & Alpha:
              </span>

              {/* 3.1 Smart Money Inflow >= 65 */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.minSmartMoneyScore === "65" ? "" : "65";
                  onToggle("minSmartMoneyScore", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.minSmartMoneyScore === "65"
                    ? "bg-amber-500/30 text-amber-200 border-amber-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🦈</span>
                <span>Dòng Tiền Cá Mập (65+)</span>
              </button>

              {/* 3.2 RRG Leading Sector */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.rrgQuadrant === "LEADING" ? "ALL" : "LEADING";
                  onToggle("rrgQuadrant", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.rrgQuadrant === "LEADING"
                    ? "bg-orange-500/30 text-orange-200 border-orange-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🧭</span>
                <span>Ngành Dẫn Dắt (RRG Leading)</span>
              </button>

              {/* 3.3 RS Leader 80+ */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.minRsRating === "80" ? "" : "80";
                  onToggle("minRsRating", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.minRsRating === "80"
                    ? "bg-lime-500/30 text-lime-200 border-lime-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🚀</span>
                <span>Sức Mạnh RS 80+ (O'Neil)</span>
              </button>

              {/* 3.4 Multi-Timeframe Confluence */}
              <button
                type="button"
                onClick={() => onToggle("mtfOnly", !filters.mtfOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.mtfOnly
                    ? "bg-cyan-500/30 text-cyan-200 border-cyan-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>⏱️</span>
                <span>Đồng Thuận Đa Khung MTF</span>
              </button>

              {/* 3.5 Orca Master Elite 90+ */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.minOrcaMasterScore === "90" ? "" : "90";
                  onToggle("minOrcaMasterScore", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.minOrcaMasterScore === "90"
                    ? "bg-yellow-500/30 text-yellow-200 border-yellow-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>👑</span>
                <span>Orca Master Elite (90+)</span>
              </button>
            </div>
          )}

          {/* TIER 4: FUNDAMENTAL MOAT */}
          {(activeTierTab === "all" || activeTierTab === 4) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-indigo-950/20 border border-indigo-500/20">
              <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                <ShieldCheck className="size-3" />
                T4 Moat:
              </span>

              {/* 4.1 FA Fortress */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.faProfileCombo === "FORTRESS" ? "ALL" : "FORTRESS";
                  onToggle("faProfileCombo", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.faProfileCombo === "FORTRESS"
                    ? "bg-indigo-500/30 text-indigo-200 border-indigo-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🏰</span>
                <span>Pháo Đài Tài Chính (Fortress)</span>
              </button>

              {/* 4.2 Net Cash */}
              <button
                type="button"
                onClick={() => onToggle("netCashOnly", !filters.netCashOnly)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.netCashOnly
                    ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>💵</span>
                <span>Tiền Mặt Ròng &gt; Nợ Vay</span>
              </button>

              {/* 4.3 Piotroski F-Score >= 7 */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.minPiotroskiScore === "7" ? "" : "7";
                  onToggle("minPiotroskiScore", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.minPiotroskiScore === "7"
                    ? "bg-purple-500/30 text-purple-200 border-purple-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>💎</span>
                <span>Piotroski F-Score (≥ 7)</span>
              </button>

              {/* 4.4 ROIC >= 15% */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.minRoic === "15" ? "" : "15";
                  onToggle("minRoic", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.minRoic === "15"
                    ? "bg-blue-500/30 text-blue-200 border-blue-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>📈</span>
                <span>ROIC Sinh Lời (≥ 15%)</span>
              </button>

              {/* 4.5 PEG < 1.0 */}
              <button
                type="button"
                onClick={() => {
                  const next = filters.maxPeg === "1.0" ? "" : "1.0";
                  onToggle("maxPeg", next);
                }}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                  filters.maxPeg === "1.0"
                    ? "bg-green-500/30 text-green-200 border-green-400/80 shadow-xs font-bold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                <span>🏷️</span>
                <span>PEG Tăng Trưởng (&lt; 1.0)</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

