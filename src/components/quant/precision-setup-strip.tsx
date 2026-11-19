"use client";

import { Badge, fmtNum } from "@/components/ui";
import type { PrecisionTradeSetup } from "@/lib/engines/fx-crypto-precision-engine";
import { Eye, EyeOff, Layers, ShieldAlert, ShieldCheck, Target } from "lucide-react";

export function buildPrecisionChartLevels(
  precision: PrecisionTradeSetup | null | undefined,
  enabled: boolean,
): { label: string; price: number; color: string }[] {
  if (!enabled || !precision || precision.grade === "NO_TRADE" || precision.direction === "NEUTRAL") {
    return [];
  }
  const levels: { label: string; price: number; color: string }[] = [];
  if (precision.entry != null && Number.isFinite(precision.entry) && precision.entry > 0) {
    levels.push({
      label: `ENTRY (${precision.grade} ${precision.direction})`,
      price: precision.entry,
      color: "#38bdf8",
    });
  }
  if (precision.stopLoss != null && Number.isFinite(precision.stopLoss) && precision.stopLoss > 0) {
    levels.push({
      label: "SL CẤU TRÚC",
      price: precision.stopLoss,
      color: "#f43f5e",
    });
  }
  if (precision.tp1 != null && Number.isFinite(precision.tp1) && precision.tp1 > 0) {
    levels.push({
      label: "TP1 50%+BE",
      price: precision.tp1,
      color: "#34d399",
    });
  }
  if (precision.tp2 != null && Number.isFinite(precision.tp2) && precision.tp2 > 0) {
    levels.push({
      label: "TP2 30%",
      price: precision.tp2,
      color: "#10b981",
    });
  }
  if (precision.tp3 != null && Number.isFinite(precision.tp3) && precision.tp3 > 0) {
    levels.push({
      label: "TP3 20%",
      price: precision.tp3,
      color: "#059669",
    });
  }
  return levels;
}

interface PrecisionSetupStripProps {
  symbol: string;
  assetType: "forex" | "crypto";
  precision: PrecisionTradeSetup | null;
  digits: number;
  isLoading?: boolean;
  showOnChart: boolean;
  onToggleChart: () => void;
  onInspectGates: () => void;
  sourceLabel?: string;
}

export function PrecisionSetupStrip({
  symbol,
  assetType,
  precision,
  digits,
  isLoading = false,
  showOnChart,
  onToggleChart,
  onInspectGates,
  sourceLabel,
}: PrecisionSetupStripProps) {
  if (!precision && isLoading) {
    return (
      <div className="panel rounded-xl px-3 py-2 text-[11px] text-text-muted flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-accent-primary animate-pulse" />
          Đang thẩm định 7 Cổng Precision cho {symbol}...
        </span>
        {sourceLabel && <span className="text-[10px]">{sourceLabel}</span>}
      </div>
    );
  }

  if (!precision) return null;

  const totalGates = precision.gatesPassed.length + precision.gatesFailed.length;
  const isNoTrade = precision.grade === "NO_TRADE" || precision.direction === "NEUTRAL";
  const gradeTone =
    precision.grade === "A+" || precision.grade === "A"
      ? "up"
      : precision.grade === "B"
        ? "warn"
        : "neutral";
  const actionTone =
    precision.action === "BUY" ? "up" : precision.action === "SELL" ? "down" : "neutral";
  const gradeLabel = precision.grade === "A+" ? "A+ SNIPER" : precision.grade === "NO_TRADE" ? "WAIT / LỌC" : `GRADE ${precision.grade}`;

  return (
    <div
      className={`panel rounded-xl px-3 py-2 border transition-colors ${
        isNoTrade
          ? "border-warning/30 bg-warning/[0.03]"
          : precision.action === "BUY"
            ? "border-positive/35 bg-positive/[0.03]"
            : "border-negative/35 bg-negative/[0.03]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Grade, Action, Calibrated WinRate, Expectancy, Regime */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-text-primary">
            <Target className="size-3.5 text-accent-primary" />
            <span>7-Gate Precision</span>
          </span>
          <Badge tone={gradeTone}>
            <span className="font-bold">{gradeLabel}</span>
          </Badge>
          <Badge tone={actionTone}>
            <span className="font-bold">{precision.action}</span>
          </Badge>
          <span className="num text-[11px] text-text-secondary">
            Win <b className="text-text-primary">{precision.calibratedWinRatePct}%</b>
          </span>
          <Badge tone={precision.expectancyR >= 0.2 ? "up" : isNoTrade ? "neutral" : "accent"}>
            E[R] {precision.expectancyR >= 0 ? `+${precision.expectancyR}R` : `${precision.expectancyR}R`}
          </Badge>
          {!isNoTrade && precision.netRiskReward != null && (
            <Badge tone="accent">Net 1:{precision.netRiskReward}</Badge>
          )}
          {!isNoTrade && (
            <Badge tone="neutral">Size {precision.recommendedSizeMultiplier}x</Badge>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-border-subtle bg-surface-elevated/50 px-1.5 py-0.5 text-[10px] text-text-muted">
            {precision.regime.state.replace(/_/g, " ")} · ADX {precision.regime.adx14.toFixed(0)} · ER{" "}
            {precision.regime.efficiencyRatio.toFixed(2)}
          </span>
          <span className="text-[10px] text-text-muted">
            Gates {precision.gatesPassed.length}/{Math.max(1, totalGates)}
          </span>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {sourceLabel && (
            <span className="hidden lg:inline text-[9.5px] text-text-muted mr-1">{sourceLabel}</span>
          )}
          <button
            type="button"
            disabled={isNoTrade}
            onClick={onToggleChart}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors ${
              isNoTrade
                ? "cursor-not-allowed border-border-subtle/50 bg-surface-elevated/30 text-text-muted opacity-50"
                : showOnChart
                  ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25"
                  : "border-border-subtle bg-surface-elevated/60 text-text-secondary hover:text-text-primary"
            }`}
            title={
              isNoTrade
                ? "Không vẽ mức giá khi setup đang bị lọc (NO_TRADE)"
                : "Bật/tắt đường Entry, SL Cấu trúc và TP1/2/3 trên biểu đồ"
            }
          >
            {showOnChart && !isNoTrade ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            {showOnChart && !isNoTrade ? "Chart: Đang vẽ SL/TP" : "Vẽ SL/TP lên Chart"}
          </button>
          <button
            type="button"
            onClick={onInspectGates}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-elevated/60 px-2 py-1 text-[10.5px] font-medium text-text-secondary transition-colors hover:border-accent-primary/40 hover:text-accent-primary"
          >
            <Layers className="size-3" /> Chi tiết 7 Cổng
          </button>
        </div>
      </div>

      {/* Bottom: Actionable Levels Strip OR Veto Alert */}
      {isNoTrade ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-[11px] text-text-secondary">
          <ShieldAlert className="size-3.5 shrink-0 text-warning" />
          <span className="font-semibold text-warning">Tạm lọc setup ({assetType === "forex" ? "FX" : "Crypto"}):</span>
          <span className="min-w-0 flex-1 truncate sm:whitespace-normal">
            {precision.vetoReasons[0] ?? precision.summaryVi}
          </span>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5 text-[10.5px]">
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">
              Entry ({precision.entryMode === "LIMIT_PULLBACK" ? "LIMIT OTE" : "CONFIRMED"})
            </div>
            <div className="num font-bold text-sky-400">
              {precision.entry != null ? fmtNum(precision.entry, digits) : "—"}
            </div>
          </div>
          <div className="rounded-md border border-negative/30 bg-negative/5 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">SL Cấu trúc</div>
            <div className="num font-bold text-negative">
              {precision.stopLoss != null ? fmtNum(precision.stopLoss, digits) : "—"}
            </div>
          </div>
          <div className="rounded-md border border-positive/25 bg-positive/5 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">
              TP1 ({precision.breakevenPlan.tp1ClosePct}% + SL➔BE)
            </div>
            <div className="num font-bold text-positive">
              {precision.tp1 != null ? fmtNum(precision.tp1, digits) : "—"}
            </div>
          </div>
          <div className="rounded-md border border-positive/25 bg-positive/5 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">TP2 (30%)</div>
            <div className="num font-bold text-positive">
              {precision.tp2 != null ? fmtNum(precision.tp2, digits) : "—"}
            </div>
          </div>
          <div className="rounded-md border border-positive/25 bg-positive/5 px-2 py-1 col-span-2 sm:col-span-1">
            <div className="text-[9px] uppercase tracking-wider text-text-muted">TP3 (Runner 20%)</div>
            <div className="num font-bold text-positive">
              {precision.tp3 != null ? fmtNum(precision.tp3, digits) : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
