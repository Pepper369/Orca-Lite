"use client";

import { memo } from "react";
import type { DriverAttribution } from "@/lib/services/driver-attribution";
import { Zap, Globe, Building2, Newspaper, LineChart, BarChart2 } from "lucide-react";

export interface DriverAttributionWidgetProps {
  attribution?: DriverAttribution | null;
  symbol: string;
}

const FACTOR_META = [
  { key: "foreignPct", label: "Khối ngoại", color: "bg-blue-500", icon: Globe },
  { key: "sectorPct", label: "Sóng ngành", color: "bg-emerald-500", icon: Building2 },
  { key: "marketPct", label: "VN-Index", color: "bg-amber-500", icon: BarChart2 },
  { key: "newsPct", label: "Tin tức", color: "bg-purple-500", icon: Newspaper },
  { key: "technicalPct", label: "Kỹ thuật", color: "bg-cyan-500", icon: LineChart },
  { key: "volumePct", label: "Thanh khoản", color: "bg-rose-500", icon: Zap },
] as const;

export const DriverAttributionWidget = memo(function DriverAttributionWidget({
  attribution,
  symbol,
}: DriverAttributionWidgetProps) {
  if (!attribution) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-[#12141a]/95 p-4 sm:p-5 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Động lực biến động giá (Price Driver Attribution)
            </h3>
            <p className="text-xs text-zinc-400">
              Phân rã % đóng góp vào mức giá hôm nay của {symbol}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar Breakdown */}
      <div className="mt-4">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
          {FACTOR_META.map((f) => {
            const val = attribution[f.key] as number;
            if (!val || val <= 0) return null;
            return (
              <div
                key={f.key}
                style={{ width: `${val}%` }}
                className={`${f.color} transition-all duration-500`}
                title={`${f.label}: ${val}%`}
              />
            );
          })}
          {attribution.residualPct > 0 && (
            <div
              style={{ width: `${attribution.residualPct}%` }}
              className="bg-zinc-700 transition-all duration-500"
              title={`Khác: ${attribution.residualPct}%`}
            />
          )}
        </div>

        {/* Factors Legend & Stats */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {FACTOR_META.map((f) => {
            const val = attribution[f.key] as number;
            const Icon = f.icon;
            return (
              <div
                key={f.key}
                className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2"
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${f.color}/10 text-white`}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] text-zinc-400">
                    {f.label}
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {val}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Note */}
      <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-3 py-2 text-xs text-cyan-200">
        💡 <span className="font-medium">{attribution.summaryVi}</span>
      </div>
    </div>
  );
});
