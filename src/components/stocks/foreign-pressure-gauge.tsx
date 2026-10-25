"use client";

import { memo } from "react";
import { Globe, TrendingUp, TrendingDown, ShieldAlert, Award, Zap } from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { VpsForeignFlow } from "@/lib/providers/vps";
import { Loading, Panel } from "@/components/ui";

const fmtVol = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "0 cp";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M cp`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K cp`;
  return `${v.toLocaleString("vi-VN")} cp`;
};

const fmtVal = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(2)} nghìn tỷ`;
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} tỷ`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(0)} tr ₫`;
  return `${v.toLocaleString("vi-VN")} ₫`;
};

export const ForeignPressureGauge = memo(function ForeignPressureGauge({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<VpsForeignFlow>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/foreign-live` : null,
    { refreshInterval: 5_000 } // Live update every 5 seconds
  );

  if (isLoading && !data) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3">
        <Loading rows={2} />
      </div>
    );
  }

  if (!data) return null;

  const buyVol = data.buyVolume ?? 0;
  const sellVol = data.sellVolume ?? 0;
  const totalVol = buyVol + sellVol;
  const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;
  const sellPct = 100 - buyPct;
  const netVol = data.netVolume ?? 0;
  const isNetBuy = netVol > 0;
  const isNeutral = netVol === 0 && totalVol === 0;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-purple-400" />
          <span className="text-[13px] font-semibold text-text-primary">
            Áp Lực Dòng Tiền Khối Ngoại Realtime ({symbol})
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-400 animate-pulse">
            <Zap className="size-3" /> LIVE 5S
          </span>
        </div>

        {/* Net Status Badge */}
        {!isNeutral && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                isNetBuy
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {isNetBuy ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {isNetBuy ? "MUA RÒNG: " : "BÁN RÒNG: "}
              {fmtVol(netVol)} ({fmtVal(data.netValue)})
            </span>
          </div>
        )}
      </div>

      {/* Pressure Ratio Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="font-semibold text-emerald-400">
            Ngoại Mua: {fmtVol(buyVol)} ({buyPct.toFixed(1)}%)
          </span>
          <span className="font-semibold text-rose-400">
            Ngoại Bán: {fmtVol(sellVol)} ({sellPct.toFixed(1)}%)
          </span>
        </div>

        {/* 2-Color Flow Bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-base">
          <div
            style={{ width: `${buyPct}%` }}
            className="bg-emerald-500 transition-all duration-500 ease-out"
            title={`Khối ngoại Mua: ${buyPct.toFixed(1)}%`}
          />
          <div
            style={{ width: `${sellPct}%` }}
            className="bg-rose-500 transition-all duration-500 ease-out"
            title={`Khối ngoại Bán: ${sellPct.toFixed(1)}%`}
          />
        </div>
      </div>

      {/* Room and Upcoming Rights */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/50 text-[11px] text-text-muted">
        <div>
          Room Ngoại Còn Lại:{" "}
          <strong className="text-text-primary font-mono font-semibold">
            {fmtVol(data.foreignRoom)}
          </strong>
        </div>

        {data.rightInfos && data.rightInfos.length > 0 && (
          <div className="flex items-center gap-1.5 text-amber-400 truncate max-w-[500px]">
            <Award className="size-3.5 shrink-0" />
            <span className="truncate" title={data.rightInfos[0].contentVi}>
              {data.rightInfos[0].contentVi}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
