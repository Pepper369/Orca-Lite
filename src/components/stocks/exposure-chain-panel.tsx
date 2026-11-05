"use client";

import { memo } from "react";
import type { ExposureAnalysis, DriverImpact } from "@/lib/services/exposure-chain";
import { Network, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

export interface ExposureChainPanelProps {
  exposure?: ExposureAnalysis | null;
  symbol: string;
}

export const ExposureChainPanel = memo(function ExposureChainPanel({
  exposure,
  symbol,
}: ExposureChainPanelProps) {
  if (!exposure || !exposure.hasMapping) return null;

  const allDrivers: DriverImpact[] = [
    ...exposure.output,
    ...exposure.input,
    ...exposure.peer,
    ...exposure.context,
  ];

  if (allDrivers.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-[#12141a]/95 p-4 sm:p-5 shadow-lg backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <Network className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Chuỗi tác động vĩ mô & Chuỗi cung ứng (Exposure Chain)
            </h3>
            <p className="text-xs text-zinc-400">
              Mạng lưới biến số hàng hóa, lãi suất & đối thủ liên kết với {symbol}
            </p>
          </div>
        </div>

        <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          {exposure.summaryVi}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {allDrivers.map((item, idx) => {
          const m = item.mapping;
          const rFormatted = (m.historicalR > 0 ? "+" : "") + m.historicalR.toFixed(2);
          const isPositive = m.historicalR > 0;

          const sideLabelVi =
            m.side === "input"
              ? "Nguyên liệu đầu vào"
              : m.side === "output"
              ? "Thị trường đầu ra / Cầu"
              : m.side === "peer"
              ? "Đối thủ / Cùng ngành"
              : "Bối cảnh vĩ mô / Lãi suất";

          return (
            <div
              key={`${m.driver}-${idx}`}
              className="flex flex-col justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 transition hover:border-white/10"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs font-semibold text-white">
                      {m.labelVi}
                    </span>
                    <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {m.driver}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-xs font-mono font-semibold ${
                        isPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      r = {rFormatted}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      ({m.horizonDays}d)
                    </span>
                  </div>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300">
                    {sideLabelVi}
                  </span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    Mẫu n = {m.sampleN} phiên
                  </span>
                </div>

                <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
                  {m.explanation}
                </p>
              </div>

              {m.conceptGloss && (
                <div className="mt-2.5 flex items-start gap-1.5 rounded border border-white/[0.03] bg-black/20 p-2 text-[11px] text-zinc-400">
                  <Info className="h-3.5 w-3.5 shrink-0 text-zinc-500 mt-0.5" />
                  <span>{m.conceptGloss}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
