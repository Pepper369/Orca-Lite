"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

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
  // Mặc định thu gọn để không vướng mắt và không che bảng cổ phiếu
  const [isExpanded, setIsExpanded] = useState(false);

  // Tính số lượng bộ lọc đang bật trên từng tầng
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

  return (
    <div className="rounded-lg border border-border-subtle bg-panel/90 p-2.5 shadow-xs transition-all">
      {/* Thanh tiêu đề tối giản */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-primary hover:text-accent-primary transition-colors"
          >
            <span>Bộ lọc chuyên sâu</span>
            {totalActive > 0 ? (
              <span className="rounded bg-accent-primary px-1.5 py-0.2 text-[10px] font-bold text-white">
                {totalActive} đang bật
              </span>
            ) : (
              <span className="text-[11px] text-text-muted font-normal">
                (Tùy chỉnh điểm mua, mô hình, dòng tiền, cơ bản)
              </span>
            )}
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {totalFilteredCount != null && (
            <span className="text-[11px] text-text-secondary px-2 py-0.5 rounded bg-surface-elevated border border-border-subtle">
              Thỏa mãn: <strong className="text-text-primary font-semibold">{totalFilteredCount}</strong> mã
            </span>
          )}

          {totalActive > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-all"
            >
              <RotateCcw className="size-3" />
              <span>Xóa bộ lọc ({totalActive})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-text-muted hover:text-text-primary px-2 py-0.5 rounded hover:bg-surface-elevated transition-colors"
          >
            {isExpanded ? "Thu gọn ▲" : "Mở rộng ▼"}
          </button>
        </div>
      </div>

      {/* Nội dung chi tiết (chỉ hiển thị khi mở rộng) */}
      {isExpanded && (
        <div className="mt-2.5 pt-2.5 border-t border-border-subtle space-y-2">
          {/* Tabs chuyển nhóm */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTierTab("all")}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTierTab === "all"
                  ? "bg-accent-primary text-white"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              Tất cả {totalActive > 0 && `(${totalActive})`}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(1)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTierTab === 1
                  ? "bg-surface-base text-text-primary border border-border-subtle font-semibold"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              Điểm mua & Kích hoạt {tier1Active > 0 && `(${tier1Active})`}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(2)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTierTab === 2
                  ? "bg-surface-base text-text-primary border border-border-subtle font-semibold"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              Mô hình giá & Vol {tier2Active > 0 && `(${tier2Active})`}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(3)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTierTab === 3
                  ? "bg-surface-base text-text-primary border border-border-subtle font-semibold"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              Dòng tiền & Sức mạnh {tier3Active > 0 && `(${tier3Active})`}
            </button>

            <button
              type="button"
              onClick={() => setActiveTierTab(4)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                activeTierTab === 4
                  ? "bg-surface-base text-text-primary border border-border-subtle font-semibold"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              Nền tảng tài chính {tier4Active > 0 && `(${tier4Active})`}
            </button>
          </div>

          {/* NHÓM 1: ĐIỂM MUA & KÍCH HOẠT */}
          {(activeTierTab === "all" || activeTierTab === 1) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded bg-surface-base border border-border-subtle text-xs">
              <span className="font-semibold text-text-muted mr-1 shrink-0">Điểm mua:</span>

              <button
                type="button"
                onClick={() => onToggle("sniperTriggerOnly", !filters.sniperTriggerOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.sniperTriggerOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Kích hoạt tức thời
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.setupGradeFilter === "A+" ? "all" : "A+";
                  onToggle("setupGradeFilter", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.setupGradeFilter === "A+"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Hạng A+ chuẩn
              </button>

              <button
                type="button"
                onClick={() => onToggle("goldenPocketFilter", !filters.goldenPocketFilter)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.goldenPocketFilter
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Vùng vàng Fibo 0.618
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.squeezeFilter === "FIRED" ? "ALL" : "FIRED";
                  onToggle("squeezeFilter", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.squeezeFilter === "FIRED"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Nổ Squeeze Breakout
              </button>

              <button
                type="button"
                onClick={() => onToggle("flipZoneFilter", !filters.flipZoneFilter)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.flipZoneFilter
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Test lại Flip Zone
              </button>

              <button
                type="button"
                onClick={() => onToggle("smcOrderBlockFilter", !filters.smcOrderBlockFilter)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.smcOrderBlockFilter
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Order Block SMC
              </button>

              <select
                value={filters.sniperSubtypeFilter || "all"}
                onChange={(e) => onToggle("sniperSubtypeFilter", e.target.value)}
                className="rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-primary"
              >
                <option value="all">Kịch bản mua...</option>
                <option value="SNIPER_PULLBACK">Kéo ngược hỗ trợ</option>
                <option value="SQUEEZE_BREAKOUT">Bứt phá vùng nén</option>
                <option value="SWEEP_RECLAIM">Rút chân rũ cung</option>
              </select>

              <select
                value={filters.minSniperRRFilter || ""}
                onChange={(e) => onToggle("minSniperRRFilter", e.target.value)}
                className="rounded border border-border-subtle bg-surface-elevated px-2 py-1 text-xs text-text-primary focus:border-accent-primary"
              >
                <option value="">Mọi tỷ lệ Lời/Lỗ</option>
                <option value="2.0">R:R ≥ 2.0x</option>
                <option value="2.5">R:R ≥ 2.5x</option>
                <option value="3.0">R:R ≥ 3.0x</option>
              </select>
            </div>
          )}

          {/* NHÓM 2: MÔ HÌNH GIÁ & VOL */}
          {(activeTierTab === "all" || activeTierTab === 2) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded bg-surface-base border border-border-subtle text-xs">
              <span className="font-semibold text-text-muted mr-1 shrink-0">Mô hình:</span>

              <button
                type="button"
                onClick={() => onToggle("tightClosesOnly", !filters.tightClosesOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.tightClosesOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Nén giá phẳng
              </button>

              <button
                type="button"
                onClick={() => onToggle("vduOnly", !filters.vduOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.vduOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Cạn kiệt vol (VDU)
              </button>

              <button
                type="button"
                onClick={() => onToggle("vsaNoSupplyOnly", !filters.vsaNoSupplyOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.vsaNoSupplyOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                VSA Cạn cung (No Supply)
              </button>

              <button
                type="button"
                onClick={() => onToggle("maRibbonSqueezeOnly", !filters.maRibbonSqueezeOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.maRibbonSqueezeOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Nén dải MA Ribbon
              </button>

              <button
                type="button"
                onClick={() => onToggle("maReclaimOnly", !filters.maReclaimOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.maReclaimOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Lấy lại MA then chốt
              </button>
            </div>
          )}

          {/* NHÓM 3: DÒNG TIỀN & SỨC MẠNH */}
          {(activeTierTab === "all" || activeTierTab === 3) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded bg-surface-base border border-border-subtle text-xs">
              <span className="font-semibold text-text-muted mr-1 shrink-0">Dòng tiền:</span>

              <button
                type="button"
                onClick={() => {
                  const next = filters.minSmartMoneyScore === "65" ? "" : "65";
                  onToggle("minSmartMoneyScore", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.minSmartMoneyScore === "65"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Cá mập gom (Điểm ≥ 65)
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.rrgQuadrant === "LEADING" ? "ALL" : "LEADING";
                  onToggle("rrgQuadrant", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.rrgQuadrant === "LEADING"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Ngành dẫn dắt thị trường
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.minRsRating === "80" ? "" : "80";
                  onToggle("minRsRating", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.minRsRating === "80"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Sức mạnh RS ≥ 80 (O'Neil)
              </button>

              <button
                type="button"
                onClick={() => onToggle("mtfOnly", !filters.mtfOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.mtfOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Đồng thuận đa khung H1+D1+W1
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.minOrcaMasterScore === "90" ? "" : "90";
                  onToggle("minOrcaMasterScore", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.minOrcaMasterScore === "90"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Top 10% thị trường (Score ≥ 90)
              </button>
            </div>
          )}

          {/* NHÓM 4: NỀN TẢNG TÀI CHÍNH */}
          {(activeTierTab === "all" || activeTierTab === 4) && (
            <div className="flex flex-wrap items-center gap-1.5 p-2 rounded bg-surface-base border border-border-subtle text-xs">
              <span className="font-semibold text-text-muted mr-1 shrink-0">Cơ bản:</span>

              <button
                type="button"
                onClick={() => {
                  const next = filters.faProfileCombo === "FORTRESS" ? "ALL" : "FORTRESS";
                  onToggle("faProfileCombo", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.faProfileCombo === "FORTRESS"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Pháo đài tài chính an toàn
              </button>

              <button
                type="button"
                onClick={() => onToggle("netCashOnly", !filters.netCashOnly)}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.netCashOnly
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Tiền mặt ròng &gt; Nợ vay
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.minPiotroskiScore === "7" ? "" : "7";
                  onToggle("minPiotroskiScore", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.minPiotroskiScore === "7"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Piotroski F-Score (≥ 7)
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.minRoic === "15" ? "" : "15";
                  onToggle("minRoic", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.minRoic === "15"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                ROIC cao (≥ 15%)
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = filters.maxPeg === "1.0" ? "" : "1.0";
                  onToggle("maxPeg", next);
                }}
                className={`px-2.5 py-1 rounded border transition-all ${
                  filters.maxPeg === "1.0"
                    ? "bg-accent-primary text-white border-accent-primary font-semibold"
                    : "bg-surface-elevated text-text-secondary border-border-subtle hover:text-text-primary"
                }`}
              >
                Định giá tăng trưởng rẻ (PEG &lt; 1.0)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
