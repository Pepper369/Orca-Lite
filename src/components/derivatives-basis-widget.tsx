"use client";

import React, { useEffect, useState } from "react";
import type { DerivativesArbitrageSignal } from "@/lib/engines/derivatives-arbitrage-engine";

export function DerivativesBasisWidget({ symbol = "VN30F1M" }: { symbol?: string }) {
  const [data, setData] = useState<DerivativesArbitrageSignal | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBasis = () => {
    fetch(`/api/v1/derivatives/basis?symbol=${symbol}`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((json: DerivativesArbitrageSignal) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch derivatives basis:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    void Promise.resolve().then(fetchBasis);
    const interval = setInterval(fetchBasis, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 animate-pulse text-xs text-muted-foreground text-center">
        Đang đo lường độ lệch Basis phái sinh VN30F1M vs Chỉ số VN30 cơ sở...
      </div>
    );
  }

  if (!data) return null;

  const isContango = data.basis > 0;
  const isArbitrageOpportunity = data.arbitrageRecommendation.action !== "NO_ACTION";

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">
              Định Giá Basis & Cơ Hội Arbitrage Phái Sinh HNX ({data.symbol})
            </h3>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              Live Entrade Zero-Key
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Đối chiếu tức thời giá tương lai {data.symbol} và rổ chỉ số tiền mặt {data.underlyingSymbol}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
              isContango
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
            }`}
          >
            Basis: {data.basis > 0 ? `+${data.basis}` : data.basis} pts ({data.basisPct}%)
          </span>
          <span className="text-xs text-muted-foreground">
            Đáo hạn: {data.daysToExpiry} ngày ({data.expiryDateStr})
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-surface/30 border border-border/40">
          <div className="text-muted-foreground text-[11px]">HĐTL {data.symbol}</div>
          <div className="text-base font-bold text-foreground mt-1">
            {data.derivativePrice.toLocaleString("vi-VN")}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/30 border border-border/40">
          <div className="text-muted-foreground text-[11px]">Chỉ số {data.underlyingSymbol} Cơ sở</div>
          <div className="text-base font-bold text-foreground mt-1">
            {data.underlyingIndexPrice.toLocaleString("vi-VN")}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/30 border border-border/40">
          <div className="text-muted-foreground text-[11px]">Giá trị Lý thuyết (Fair Value)</div>
          <div className="text-base font-bold text-sky-400 mt-1">
            {data.fairValuePrice.toLocaleString("vi-VN")}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/30 border border-border/40">
          <div className="text-muted-foreground text-[11px]">Độ Lệch Định Giá (Mispricing)</div>
          <div className={`text-base font-bold mt-1 ${data.mispricing >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {data.mispricing > 0 ? `+${data.mispricing}` : data.mispricing} pts
          </div>
        </div>
      </div>

      {/* State & Strategy Advice */}
      <div
        className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
          isArbitrageOpportunity
            ? "bg-primary/10 border-primary/40 text-foreground"
            : "bg-surface/30 border-border/50 text-muted-foreground"
        }`}
      >
        <div className="flex items-center gap-2 font-bold mb-1">
          <span>{isArbitrageOpportunity ? "Tín Hiệu Arbitrage Khả Thi:" : "Đánh Giá Trạng Thái Thị Trường:"}</span>
          <span className="text-primary">{data.arbitrageRecommendation.actionTitleVi}</span>
        </div>
        <p className="text-[11px]">{data.arbitrageRecommendation.description}</p>
        <p className="text-[10px] text-muted-foreground mt-1 italic">{data.stateDescription}</p>
      </div>
    </div>
  );
}
