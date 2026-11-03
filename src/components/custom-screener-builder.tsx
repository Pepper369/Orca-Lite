"use client";

import React, { useState, useEffect } from "react";
import { SlidersHorizontal, Plus, Trash2, Check, X, Bookmark, Zap, ShieldCheck } from "lucide-react";

export interface CustomScreenerPreset {
  id: string;
  name: string;
  desc?: string;
  createdAt: number;
  filters: {
    minOrcaMasterScore?: number;
    minRsRating?: number;
    minSmartMoneyScore?: number;
    minPiotroskiScore?: number;
    maxBuyDiff?: number;
    buyZoneStatus?: string;
    mtfOnly?: boolean;
    maSignal?: string;
    minTradingValue?: number;
    minPe?: number;
    maxPe?: number;
    minPb?: number;
    maxPb?: number;
    minRoe?: number;
    minDivYield?: number;
    maxDe?: number;
    minMarketCap?: number;
    mtfCandleOnly?: boolean;
    minMtfCandleScore?: number;
    vsaOnly?: boolean;
    minOverheadRoom?: number;
  };
}

const STORAGE_KEY = "orca_custom_screener_presets_v1";
const MAX_SAVED_PRESETS = 30;

export function loadCustomPresets(): CustomScreenerPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is CustomScreenerPreset =>
        Boolean(
          p &&
            typeof p === "object" &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            p.filters &&
            typeof p.filters === "object"
        )
    );
  } catch {
    return [];
  }
}

export function persistCustomPreset(preset: CustomScreenerPreset) {
  if (typeof window === "undefined") return;
  try {
    const current = loadCustomPresets();
    const next = [preset, ...current.filter((p) => p.id !== preset.id)].slice(0, MAX_SAVED_PRESETS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // QuotaExceededError or private browsing
  }
}

export function removeCustomPreset(id: string) {
  if (typeof window === "undefined") return;
  try {
    const current = loadCustomPresets();
    const next = current.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // safe
  }
}

export interface CustomScreenerBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPreset: (filters: CustomScreenerPreset["filters"], presetName?: string) => void;
  activeFilters?: CustomScreenerPreset["filters"];
}

export function CustomScreenerBuilder({
  isOpen,
  onClose,
  onApplyPreset,
  activeFilters = {},
}: CustomScreenerBuilderProps) {
  const [minOrca, setMinOrca] = useState<string>(activeFilters.minOrcaMasterScore != null ? String(activeFilters.minOrcaMasterScore) : "80");
  const [minRs, setMinRs] = useState<string>(activeFilters.minRsRating != null ? String(activeFilters.minRsRating) : "80");
  const [minSmartMoney, setMinSmartMoney] = useState<string>(activeFilters.minSmartMoneyScore != null ? String(activeFilters.minSmartMoneyScore) : "70");
  const [minPiotroski, setMinPiotroski] = useState<string>(activeFilters.minPiotroskiScore != null ? String(activeFilters.minPiotroskiScore) : "");
  const [maxBuyDiff, setMaxBuyDiff] = useState<string>(activeFilters.maxBuyDiff != null ? String(activeFilters.maxBuyDiff) : "2.0");
  const [buyZoneStatus, setBuyZoneStatus] = useState<string>(activeFilters.buyZoneStatus ?? "ALL");
  const [mtfOnly, setMtfOnly] = useState<boolean>(activeFilters.mtfOnly ?? false);
  const [maSignal, setMaSignal] = useState<string>(activeFilters.maSignal ?? "ALL");
  const [minTradingValue, setMinTradingValue] = useState<string>(activeFilters.minTradingValue != null ? String(activeFilters.minTradingValue) : "");
  const [maxPe, setMaxPe] = useState<string>(activeFilters.maxPe != null ? String(activeFilters.maxPe) : "");
  const [minRoe, setMinRoe] = useState<string>(activeFilters.minRoe != null ? String(activeFilters.minRoe) : "");
  const [minDivYield, setMinDivYield] = useState<string>(activeFilters.minDivYield != null ? String(activeFilters.minDivYield) : "");
  const [mtfCandleOnly, setMtfCandleOnly] = useState<boolean>(activeFilters.mtfCandleOnly ?? false);
  const [vsaOnly, setVsaOnly] = useState<boolean>(activeFilters.vsaOnly ?? false);
  const [minOverheadRoom, setMinOverheadRoom] = useState<string>(activeFilters.minOverheadRoom != null ? String(activeFilters.minOverheadRoom) : "");

  const [presetName, setPresetName] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  const [savedPresets, setSavedPresets] = useState<CustomScreenerPreset[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSavedPresets(loadCustomPresets());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentCompiledFilters = (): CustomScreenerPreset["filters"] => {
    return {
      minOrcaMasterScore: minOrca ? Number(minOrca) : undefined,
      minRsRating: minRs ? Number(minRs) : undefined,
      minSmartMoneyScore: minSmartMoney ? Number(minSmartMoney) : undefined,
      minPiotroskiScore: minPiotroski ? Number(minPiotroski) : undefined,
      maxBuyDiff: maxBuyDiff ? Number(maxBuyDiff) : undefined,
      buyZoneStatus: buyZoneStatus !== "ALL" ? buyZoneStatus : undefined,
      mtfOnly: mtfOnly ? true : undefined,
      mtfCandleOnly: mtfCandleOnly ? true : undefined,
      vsaOnly: vsaOnly ? true : undefined,
      minOverheadRoom: minOverheadRoom ? Number(minOverheadRoom) : undefined,
      maSignal: maSignal !== "ALL" ? maSignal : undefined,
      minTradingValue: minTradingValue ? Number(minTradingValue) : undefined,
      maxPe: maxPe ? Number(maxPe) : undefined,
      minRoe: minRoe ? Number(minRoe) : undefined,
      minDivYield: minDivYield ? Number(minDivYield) : undefined,
    };
  };

  const handleApply = () => {
    onApplyPreset(currentCompiledFilters());
    onClose();
  };

  const handleSaveAndApply = () => {
    const sanitizedName = presetName.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim().slice(0, 40);
    const name = sanitizedName || `Bộ lọc của tôi #${savedPresets.length + 1}`;
    const newPreset: CustomScreenerPreset = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      createdAt: Date.now(),
      filters: currentCompiledFilters(),
    };
    persistCustomPreset(newPreset);
    setSavedPresets(loadCustomPresets());
    setShowSaveDialog(false);
    setPresetName("");
    onApplyPreset(newPreset.filters, name);
    onClose();
  };

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeCustomPreset(id);
    setSavedPresets(loadCustomPresets());
  };

  const handleLoadSaved = (preset: CustomScreenerPreset) => {
    onApplyPreset(preset.filters, preset.name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border-subtle bg-surface-base shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle p-4 bg-surface-elevated/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/20 text-accent-primary border border-accent-primary/30">
              <SlidersHorizontal className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">Custom Screener Studio (Tự Tạo Bộ Lọc)</h2>
              <p className="text-[11px] text-text-muted">
                Phối hợp đa nhân tố: Orca Master, Dòng tiền cá mập, RS O'Neil, MTF và Điểm mua tối ưu.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-all"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Saved Presets Quick Bar */}
        {savedPresets.length > 0 && (
          <div className="border-b border-border-subtle px-4 py-2.5 bg-panel-2/30 flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider shrink-0">
              Đã lưu:
            </span>
            <div className="flex items-center gap-1.5 flex-nowrap">
              {savedPresets.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleLoadSaved(p)}
                  className="group flex items-center gap-1.5 rounded-md bg-surface-elevated px-2 py-1 text-[11px] font-semibold text-text-primary border border-border-subtle hover:border-accent-primary hover:text-accent-primary cursor-pointer transition-all"
                >
                  <Bookmark className="size-3 text-amber-400" />
                  <span>{p.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSaved(p.id, e)}
                    className="opacity-40 hover:opacity-100 hover:text-rose-400 p-0.5 rounded transition-all"
                    title="Xóa bộ lọc này"
                  >
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Pillar 1: Elite Institutional Ratings */}
          <div className="rounded-xl bg-panel-2/40 border border-border-subtle p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-400" />
                1. Trụ Cột Độc Quyền (Elite Quantitative Ratings)
              </span>
              <span className="text-[10px] text-text-muted">Thang điểm 1 - 99 percentile</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary font-medium flex items-center justify-between">
                  <span>Orca Master Rating tối thiểu</span>
                  <strong className="text-amber-300 font-mono">{minOrca ? `>= ${minOrca}` : "Tất cả"}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="95"
                  step="5"
                  value={minOrca || "0"}
                  onChange={(e) => setMinOrca(e.target.value === "0" ? "" : e.target.value)}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary font-medium flex items-center justify-between">
                  <span>RS Leader (William O'Neil) tối thiểu</span>
                  <strong className="text-emerald-400 font-mono">{minRs ? `>= ${minRs}` : "Tất cả"}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="95"
                  step="5"
                  value={minRs || "0"}
                  onChange={(e) => setMinRs(e.target.value === "0" ? "" : e.target.value)}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary font-medium flex items-center justify-between">
                  <span>Dòng Tiền Cá Mập tối thiểu</span>
                  <strong className="text-purple-300 font-mono">{minSmartMoney ? `>= ${minSmartMoney}` : "Tất cả"}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="5"
                  value={minSmartMoney || "0"}
                  onChange={(e) => setMinSmartMoney(e.target.value === "0" ? "" : e.target.value)}
                  className="w-full accent-purple-400 cursor-pointer"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-text-secondary font-medium flex items-center justify-between">
                  <span>Piotroski F-Score tối thiểu (0-9)</span>
                  <strong className="text-cyan-300 font-mono">{minPiotroski ? `>= ${minPiotroski}` : "Tất cả"}</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="9"
                  step="1"
                  value={minPiotroski || "0"}
                  onChange={(e) => setMinPiotroski(e.target.value === "0" ? "" : e.target.value)}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Pillar 2: Timing, Buy Zone & Multi-Timeframe */}
          <div className="rounded-xl bg-panel-2/40 border border-border-subtle p-3.5 space-y-3">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <Zap className="size-3.5 text-emerald-400" />
              2. Điểm Mua & Đồng Thuận Đa Khung Thời Gian
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              <div>
                <span className="block text-[11px] text-text-secondary mb-1">Vùng Mua / Điểm Mua (Buy Zone)</span>
                <select
                  value={buyZoneStatus}
                  onChange={(e) => setBuyZoneStatus(e.target.value)}
                  className="input w-full !py-1.5 text-[11px]"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="AT_BUY_POINT">🎯 Đang chạm điểm mua (At Buy Point)</option>
                  <option value="NEAR_BUY_POINT">⚡ Sát điểm mua (Near Buy Zone &lt;= 2%)</option>
                  <option value="WAIT_PULLBACK">⏳ Chờ điều chỉnh (Wait Pullback)</option>
                </select>
              </div>

              <div>
                <span className="block text-[11px] text-text-secondary mb-1">Khoảng cách tối đa tới Điểm Mua (|%|)</span>
                <input
                  value={maxBuyDiff}
                  onChange={(e) => setMaxBuyDiff(e.target.value)}
                  placeholder="Ví dụ: 1.5, 2.5, 3.0"
                  className="input w-full !py-1.5 text-[11px]"
                  inputMode="decimal"
                />
              </div>

              <div>
                <span className="block text-[11px] text-text-secondary mb-1">Tín hiệu Đường MA</span>
                <select
                  value={maSignal}
                  onChange={(e) => setMaSignal(e.target.value)}
                  className="input w-full !py-1.5 text-[11px]"
                >
                  <option value="ALL">Tất cả tín hiệu</option>
                  <option value="GOLDEN_CROSS">Giao cắt Vàng (Golden Cross MA20/MA50)</option>
                  <option value="BULLISH_ALIGN">Kênh tăng vững (Trật tự MA10 &gt; MA20 &gt; MA50)</option>
                </select>
              </div>

              <div>
                <span className="block text-[11px] text-text-secondary mb-1">Dư địa tăng đến cản min (%)</span>
                <input
                  value={minOverheadRoom}
                  onChange={(e) => setMinOverheadRoom(e.target.value)}
                  placeholder="Ví dụ: 12"
                  className="input w-full !py-1.5 text-[11px]"
                  inputMode="decimal"
                />
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mtfCandleOnly}
                    onChange={(e) => setMtfCandleOnly(e.target.checked)}
                    className="size-4 rounded accent-rose-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-rose-300 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-rose-400" />
                    Bắt buộc có Cụm Nến Đảo Chiều Đa Khung (H1 + D1 + W1)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vsaOnly}
                    onChange={(e) => setVsaOnly(e.target.checked)}
                    className="size-4 rounded accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-cyan-300 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-cyan-400" />
                    Bắt buộc có tín hiệu Cạn Cung VSA (No Supply / Stopping Vol)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mtfOnly}
                    onChange={(e) => setMtfOnly(e.target.checked)}
                    className="size-4 rounded accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-text-primary">
                    ⚡ Bắt buộc đồng thuận Đa khung xu hướng H1 + D1 + W1
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Pillar 3: Valuation & Fundamental Financials */}
          <div className="rounded-xl bg-panel-2/40 border border-border-subtle p-3.5 space-y-3">
            <span className="text-xs font-bold text-accent-primary flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-accent-primary" />
              3. Cơ Bản, Định Giá & Thanh Khoản
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <label>
                <span className="mb-0.5 block text-[10px] text-text-muted">P/E tối đa</span>
                <input
                  value={maxPe}
                  onChange={(e) => setMaxPe(e.target.value)}
                  placeholder="15"
                  className="input w-full !py-1.5 text-[11px]"
                  inputMode="decimal"
                />
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] text-text-muted">ROE min (%)</span>
                <input
                  value={minRoe}
                  onChange={(e) => setMinRoe(e.target.value)}
                  placeholder="15"
                  className="input w-full !py-1.5 text-[11px]"
                  inputMode="decimal"
                />
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] text-text-muted">Cổ tức min (%)</span>
                <input
                  value={minDivYield}
                  onChange={(e) => setMinDivYield(e.target.value)}
                  placeholder="5"
                  className="input w-full !py-1.5 text-[11px]"
                  inputMode="decimal"
                />
              </label>

              <label>
                <span className="mb-0.5 block text-[10px] text-text-muted">GTGD min (tỷ/phiên)</span>
                <input
                  value={minTradingValue}
                  onChange={(e) => setMinTradingValue(e.target.value)}
                  placeholder="5"
                  className="input w-full !py-1.5 text-[11px]"
                  inputMode="decimal"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border-subtle p-4 bg-surface-elevated/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          {showSaveDialog ? (
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Đặt tên bộ lọc (ví dụ: Săn Hàng Cá Mập)..."
                className="input !py-1.5 text-xs flex-1"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveAndApply}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-bold text-xs flex items-center gap-1 transition-all"
              >
                <Check className="size-3.5" /> Lưu & Lọc
              </button>
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="px-2.5 py-1.5 rounded-lg bg-surface-elevated text-text-muted text-xs hover:text-text-primary"
              >
                Hủy
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full justify-between sm:justify-start">
              <button
                type="button"
                onClick={() => setShowSaveDialog(true)}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-elevated/80 border border-border-subtle text-text-secondary text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Plus className="size-3.5 text-accent-primary" /> Lưu Thành Preset Của Tôi
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-surface-elevated text-text-muted text-xs font-semibold hover:text-text-primary"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 rounded-lg bg-accent-primary text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              Áp Dụng Bộ Lọc Ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}