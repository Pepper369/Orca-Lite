"use client";

import { memo, useState } from "react";
import { Zap, TrendingUp, TrendingDown, Users, ShieldAlert, BarChart3, Layers, Clock } from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { ActiveFlowAnalysis } from "@/lib/engines/active-flow-engine";
import { Loading } from "@/components/ui";

const fmtVol = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return "0 cp";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M cp`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K cp`;
  return `${v.toLocaleString("vi-VN")} cp`;
};

const fmtVal = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(2)} nghìn tỷ`;
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} tỷ ₫`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(0)} triệu ₫`;
  return `${v.toLocaleString("vi-VN")} ₫`;
};

const fmtPrice = (p: number): string => {
  return p.toLocaleString("vi-VN");
};

export const ActiveFlowCard = memo(function ActiveFlowCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<ActiveFlowAnalysis>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/active-flow` : null,
    { refreshInterval: 10_000 },
  );

  const [activeTab, setActiveTab] = useState<"tiers" | "prices" | "timeline">("tiers");

  if (isLoading && !data) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-text-muted">Đang phân tích dòng tiền Mua/Bán chủ động {symbol}...</span>
        </div>
        <Loading rows={3} />
      </div>
    );
  }

  if (!data) return null;

  const isNetBuy = data.netActiveVolume > 0;
  const isNetSell = data.netActiveVolume < 0;

  // Signal badge styling
  const signalBadge = (() => {
    switch (data.smartMoneySignal.bias) {
      case "ACCUMULATING":
        return {
          icon: TrendingUp,
          text: "Cá mập gom mạnh",
          className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        };
      case "DISTRIBUTING":
        return {
          icon: TrendingDown,
          text: "Cá mập xả hàng",
          className: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
        };
      default:
        return {
          icon: Users,
          text: "Thăm dò cân bằng",
          className: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        };
    }
  })();

  const SignalIcon = signalBadge.icon;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-4 space-y-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle/60 pb-2.5">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-amber-400" />
          <span className="text-[13px] font-bold text-text-primary">
            Dòng Tiền Mua / Bán Chủ Động ({symbol})
          </span>
          <span className="rounded bg-panel-3 px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
            Tick-by-Tick
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${signalBadge.className}`}>
            <SignalIcon className="size-3" />
            {signalBadge.text}
          </span>
          <span
            className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
              isNetBuy ? "bg-up/15 text-up" : isNetSell ? "bg-down/15 text-down" : "bg-panel-3 text-text-muted"
            }`}
          >
            {isNetBuy ? "+" : ""}
            {fmtVol(data.netActiveVolume)}
          </span>
        </div>
      </div>

      {/* Aggressor Gauge Bar */}
      <div className="space-y-1.5 bg-panel-2/50 rounded-lg p-3 border border-border-subtle/40">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-up flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-up" />
            Mua chủ động: {fmtVol(data.activeBuyVolume)} ({data.activeBuyPercent}%)
          </span>
          <span className="text-[11px] text-text-muted">
            ATC/ATO: {data.neutralPercent}%
          </span>
          <span className="font-semibold text-down flex items-center gap-1">
            Bán chủ động: {fmtVol(data.activeSellVolume)} ({data.activeSellPercent}%)
            <span className="inline-block size-2 rounded-full bg-down" />
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-panel-3">
          <div
            className="bg-up transition-all duration-500 hover:brightness-110"
            style={{ width: `${data.activeBuyPercent}%` }}
            title={`Mua CĐ: ${fmtVol(data.activeBuyVolume)} (${data.activeBuyPercent}%)`}
          />
          <div
            className="bg-slate-500/40 transition-all duration-500"
            style={{ width: `${data.neutralPercent}%` }}
            title={`Khớp ATC/ATO: ${fmtVol(data.neutralVolume)} (${data.neutralPercent}%)`}
          />
          <div
            className="bg-down transition-all duration-500 hover:brightness-110"
            style={{ width: `${data.activeSellPercent}%` }}
            title={`Bán CĐ: ${fmtVol(data.activeSellVolume)} (${data.activeSellPercent}%)`}
          />
        </div>

        {/* Quick summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
          <div>
            <span className="text-text-muted block text-[10px]">Giá trị ròng CĐ</span>
            <span className={`font-bold ${isNetBuy ? "text-up" : isNetSell ? "text-down" : "text-text-primary"}`}>
              {isNetBuy ? "+" : ""}
              {fmtVal(data.netActiveValue)}
            </span>
          </div>
          <div>
            <span className="text-text-muted block text-[10px]">Tỷ lệ Mua/Bán</span>
            <span className="font-bold text-text-primary">
              {data.buySellRatio}x
            </span>
          </div>
          <div>
            <span className="text-text-muted block text-[10px]">Tổng Khớp Khảo Sát</span>
            <span className="font-bold text-text-primary">
              {fmtVol(data.totalMatchedVolume)}
            </span>
          </div>
          <div>
            <span className="text-text-muted block text-[10px]">Áp lực thị trường</span>
            <span className="font-bold text-text-primary font-sans">
              {data.pressureStatus === "STRONG_BUY"
                ? "Mua Áp Đảo 🔥"
                : data.pressureStatus === "BUY_DOMINANT"
                ? "Bên Mua Chiếm Ưu Thế"
                : data.pressureStatus === "STRONG_SELL"
                ? "Bán Tháo Mạnh ⚠️"
                : data.pressureStatus === "SELL_DOMINANT"
                ? "Bên Bán Chiếm Ưu Thế"
                : "Giằng Co Cân Bằng"}
            </span>
          </div>
        </div>
      </div>

      {/* Smart Money AI Summary Banner */}
      <div className="flex items-start gap-2.5 rounded-md border border-border-subtle bg-panel-2/80 px-3 py-2 text-xs">
        <ShieldAlert className="size-4 shrink-0 text-amber-400 mt-0.5" />
        <div className="flex-1 text-[12px] text-text-secondary leading-snug">
          <span className="font-semibold text-text-primary">Đánh giá hành vi dòng tiền: </span>
          {data.smartMoneySignal.summary}
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 border-b border-border-subtle/50 pb-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("tiers")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all ${
            activeTab === "tiers"
              ? "bg-primary/20 text-primary font-bold shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          <Layers className="size-3.5" />
          Cá Mập vs Nhỏ Lẻ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("prices")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all ${
            activeTab === "prices"
              ? "bg-primary/20 text-primary font-bold shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          <BarChart3 className="size-3.5" />
          Dòng Tiền Bước Giá
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("timeline")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-all ${
            activeTab === "timeline"
              ? "bg-primary/20 text-primary font-bold shadow-sm"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          <Clock className="size-3.5" />
          Xu Hướng Lũy Kế
        </button>
      </div>

      {/* TAB 1: TIERS (Whale / Medium / Retail) */}
      {activeTab === "tiers" && (
        <div className="space-y-2.5 font-mono text-xs">
          {data.tiers.map((t) => {
            const tot = t.buyVolume + t.sellVolume;
            const bPct = tot > 0 ? (t.buyVolume / tot) * 100 : 50;
            const sPct = 100 - bPct;
            const isTierBuy = t.netVolume > 0;

            return (
              <div key={t.tier} className="rounded border border-border-subtle/60 bg-panel-2/40 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-text-primary text-[12px]">{t.label}</span>
                    <span className="text-[10px] text-text-muted font-mono">
                      ({t.buyCount + t.sellCount} lệnh)
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold ${
                      isTierBuy ? "text-up" : t.netVolume < 0 ? "text-down" : "text-text-muted"
                    }`}
                  >
                    {isTierBuy ? "+" : ""}
                    {fmtVol(t.netVolume)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="flex h-2 overflow-hidden rounded bg-panel-3">
                  <div
                    className="bg-up transition-all duration-300"
                    style={{ width: `${bPct}%` }}
                    title={`Mua: ${fmtVol(t.buyVolume)} (${bPct.toFixed(1)}%)`}
                  />
                  <div
                    className="bg-down transition-all duration-300"
                    style={{ width: `${sPct}%` }}
                    title={`Bán: ${fmtVol(t.sellVolume)} (${sPct.toFixed(1)}%)`}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-text-muted font-mono">
                  <span className="text-up">Mua: {fmtVol(t.buyVolume)} ({bPct.toFixed(0)}%)</span>
                  <span className="text-down">Bán: {fmtVol(t.sellVolume)} ({sPct.toFixed(0)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: PRICE LEVELS */}
      {activeTab === "prices" && (
        <div className="space-y-1.5 font-mono text-xs">
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 text-[10px] font-sans font-semibold text-text-muted px-2 pb-1 border-b border-border-subtle/50">
            <span>Mức giá</span>
            <span className="text-center">Tỷ lệ Mua / Bán</span>
            <span className="text-right">KL Ròng</span>
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {data.priceLevels.map((p) => {
              const pNetBuy = p.netVolume > 0;
              const pNetSell = p.netVolume < 0;
              const buyW = p.totalVolume > 0 ? (p.buyVolume / p.totalVolume) * 100 : 0;
              const sellW = p.totalVolume > 0 ? (p.sellVolume / p.totalVolume) * 100 : 0;

              return (
                <div
                  key={p.price}
                  className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 rounded px-2 py-1 bg-panel-2/30 hover:bg-panel-2/70 transition-colors"
                >
                  <span className="font-bold text-text-primary">
                    {fmtPrice(p.price)}
                  </span>

                  {/* Dual bar */}
                  <div className="flex h-2 overflow-hidden rounded bg-panel-3">
                    <div
                      className="bg-up"
                      style={{ width: `${buyW}%` }}
                      title={`Mua: ${fmtVol(p.buyVolume)}`}
                    />
                    <div
                      className="bg-down"
                      style={{ width: `${sellW}%` }}
                      title={`Bán: ${fmtVol(p.sellVolume)}`}
                    />
                  </div>

                  <span
                    className={`text-right font-bold text-[11px] ${
                      pNetBuy ? "text-up" : pNetSell ? "text-down" : "text-text-muted"
                    }`}
                  >
                    {pNetBuy ? "+" : ""}
                    {fmtVol(p.netVolume)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TIMELINE (Cumulative Delta) */}
      {activeTab === "timeline" && (
        <div className="space-y-2 font-mono text-xs">
          <div className="grid grid-cols-[auto_1fr_auto] gap-2 text-[10px] font-sans font-semibold text-text-muted px-2 pb-1 border-b border-border-subtle/50">
            <span>Khung giờ</span>
            <span>Khớp trong phiên (Mua / Bán)</span>
            <span className="text-right">Lũy kế Net</span>
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {data.timeline.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-muted font-sans">
                Đang chờ cập nhật chuỗi khớp lệnh...
              </div>
            ) : (
              data.timeline.map((item) => {
                const isCumBuy = item.cumulativeNetVol > 0;
                const isCumSell = item.cumulativeNetVol < 0;

                return (
                  <div
                    key={item.time}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-2 py-1 bg-panel-2/30 hover:bg-panel-2/70 transition-colors"
                  >
                    <span className="text-[11px] text-text-secondary font-mono w-14">
                      {item.time}
                    </span>

                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-up font-medium">+{fmtVol(item.activeBuyVol)}</span>
                      <span className="text-text-muted">/</span>
                      <span className="text-down font-medium">-{fmtVol(item.activeSellVol)}</span>
                    </div>

                    <span
                      className={`text-right font-bold text-[11px] ${
                        isCumBuy ? "text-up" : isCumSell ? "text-down" : "text-text-muted"
                      }`}
                    >
                      {isCumBuy ? "+" : ""}
                      {fmtVol(item.cumulativeNetVol)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
});

