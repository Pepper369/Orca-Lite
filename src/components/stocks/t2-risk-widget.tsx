"use client";

import { useApi } from "@/lib/hooks";
import type { T2RiskAssessment } from "@/lib/services/t2-risk";
import { Panel, Loading, FreshnessDot } from "@/components/ui";

export function T2RiskWidget({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<T2RiskAssessment>(
    symbol ? `/api/v1/stocks/${symbol}/t2-risk` : null,
    { refreshInterval: 60_000 }
  );

  if (isLoading && !data) {
    return (
      <Panel title="Rủi ro Kẹp Hàng T+2 (T+2 Overextension)">
        <Loading />
      </Panel>
    );
  }

  if (!data) return null;

  const isTrap = data.level === "CRITICAL_T2_TRAP";
  const isElevated = data.level === "ELEVATED";

  const getBorderColor = () => {
    if (isTrap) return "border-rose-500/50 bg-rose-500/10";
    if (isElevated) return "border-amber-500/40 bg-amber-500/10";
    return "border-emerald-500/30 bg-emerald-500/5";
  };

  const getBadgeClass = () => {
    if (isTrap) return "bg-rose-500 text-white font-bold animate-pulse";
    if (isElevated) return "bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40";
    return "bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30";
  };

  return (
    <Panel
      title={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">Vi Cấu Trúc T+2.5: Rủi Ro Kẹp Hàng</span>
            <span className={`text-[10px] px-2 py-0.5 rounded ${getBadgeClass()}`}>
              {data.levelVi}
            </span>
          </div>
          <span className="text-xs font-mono text-ink-3">
            Điểm rủi ro: <span className={`font-bold ${isTrap ? "text-rose-400" : isElevated ? "text-amber-400" : "text-emerald-400"}`}>{data.score}/100</span>
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Banner cảnh báo chính */}
        <div className={`p-3 rounded-lg border text-xs ${getBorderColor()}`}>
          <div className="flex items-center gap-2 font-bold mb-1">
            <span className={isTrap ? "text-rose-400" : isElevated ? "text-amber-400" : "text-emerald-400"}>
              {data.warningTitle}
            </span>
          </div>
          <p className="text-ink-2 leading-relaxed mb-2 font-sans">
            {data.warningMessage}
          </p>
          <div className="bg-panel-1/80 p-2 rounded border border-line text-[11px]">
            <span className="font-semibold text-accent">Khuyến nghị thực chiến: </span>
            <span className="text-ink">{data.recommendedAction}</span>
          </div>
        </div>

        {/* 4 Chỉ số vi cấu trúc chính */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
          <div className="bg-panel-2 p-2 rounded border border-line">
            <span className="text-[10px] text-ink-3 block">Chuỗi tăng liên tiếp</span>
            <span className={`text-base font-bold ${data.consecutiveUpDays >= 3 ? "text-rose-400" : "text-ink"}`}>
              {data.consecutiveUpDays} phiên
            </span>
          </div>

          <div className="bg-panel-2 p-2 rounded border border-line">
            <span className="text-[10px] text-ink-3 block">Độ rướn nhịp tăng</span>
            <span className={`text-base font-bold ${data.cumulativeRunGainPct >= 7.5 ? "text-rose-400" : "text-ink"}`}>
              +{data.cumulativeRunGainPct}%
            </span>
          </div>

          <div className="bg-panel-2 p-2 rounded border border-line">
            <span className="text-[10px] text-ink-3 block">Cách nền MA20</span>
            <span className={`text-base font-bold ${data.distanceFromMa20Pct >= 8.0 ? "text-rose-400" : "text-ink"}`}>
              +{data.distanceFromMa20Pct}%
            </span>
          </div>

          <div className="bg-panel-2 p-2 rounded border border-line">
            <span className="text-[10px] text-ink-3 block">RSI(14)</span>
            <span className={`text-base font-bold ${data.currentRsi14 && data.currentRsi14 >= 70 ? "text-rose-400" : "text-ink"}`}>
              {data.currentRsi14 ?? "--"}
            </span>
          </div>
        </div>

        {/* Thanh Gauge rủi ro */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-ink-3">
            <span>Vùng an toàn (0-30)</span>
            <span>Rung lắc (30-60)</span>
            <span className="text-rose-400 font-bold">Bẫy T+2 (60-100)</span>
          </div>
          <div className="h-2 w-full bg-panel-3 rounded-full overflow-hidden flex">
            <div
              className={`transition-all duration-500 ${
                isTrap ? "bg-rose-500" : isElevated ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${data.score}%` }}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
