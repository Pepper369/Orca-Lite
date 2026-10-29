"use client";

import React, { useEffect, useState } from "react";
import type { StockConsensusUpside } from "@/lib/engines/consensus-upside-engine";

export function ConsensusUpsideCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<StockConsensusUpside | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    void Promise.resolve().then(() => setLoading(true));
    fetch(`/api/v1/stocks/${symbol}/consensus`)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((json: StockConsensusUpside) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch consensus upside:", err);
        setLoading(false);
      });
  }, [symbol]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 animate-pulse text-xs text-muted-foreground text-center">
        Đang tổng hợp định giá mục tiêu đồng thuận từ các công ty chứng khoán & Orca Consensus Engine...
      </div>
    );
  }

  if (!data || !data.reports.length) {
    return null;
  }

  const getRatingStyle = (rating: string) => {
    switch (rating) {
      case "MUA MẠNH":
      case "MUA":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
      case "KHẢ QUAN":
        return "bg-sky-500/15 text-sky-400 border-sky-500/30";
      case "NẮM GIỮ":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      default:
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h3 className="text-sm font-bold text-foreground">
              Định Giá Mục Tiêu Đồng Thuận (Consensus Target & Upside)
            </h3>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              CTCK Consensus
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tổng hợp khuyến nghị và giá mục tiêu từ {data.analystCoverageCount} báo cáo phân tích mới nhất
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getRatingStyle(data.consensusRating)}`}>
            {data.consensusRating}
          </span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            Upside: +{data.upsidePct}%
          </span>
        </div>
      </div>

      {/* Target Price Visual Gauge */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-surface/30 border border-border/50">
        <div>
          <span className="text-[11px] text-muted-foreground">Thị giá hiện tại</span>
          <div className="text-lg font-bold text-foreground mt-0.5">
            {data.currentPrice.toLocaleString("vi-VN")} ₫
          </div>
        </div>

        <div className="sm:text-center border-t sm:border-t-0 sm:border-x border-border/40 pt-2 sm:pt-0 sm:px-2">
          <span className="text-[11px] text-muted-foreground">Giá mục tiêu Trung bình</span>
          <div className="text-lg font-bold text-emerald-400 mt-0.5">
            {data.averageTargetPrice.toLocaleString("vi-VN")} ₫
          </div>
          <span className="text-[10px] text-muted-foreground">
            Biên an toàn: ~{data.marginOfSafetyPct}%
          </span>
        </div>

        <div className="sm:text-right border-t sm:border-t-0 border-border/40 pt-2 sm:pt-0">
          <span className="text-[11px] text-muted-foreground">Khoảng giá Mục tiêu (Min - Max)</span>
          <div className="text-sm font-semibold text-foreground mt-1">
            {data.lowestTargetPrice.toLocaleString("vi-VN")} ₫ - {data.highestTargetPrice.toLocaleString("vi-VN")} ₫
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div>
        <div className="text-xs font-semibold text-foreground mb-2 flex items-center justify-between">
          <span>Danh sách Báo cáo Phân tích từ các CTCK</span>
          <span className="text-[11px] text-muted-foreground">Kèm link PDF tải về</span>
        </div>

        <div className="space-y-2">
          {data.reports.slice(0, 5).map((rep, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl border border-border/50 bg-surface/40 hover:bg-surface/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{rep.brokerName}</span>
                  {rep.reportDate && (
                    <span className="text-[11px] text-muted-foreground">({rep.reportDate})</span>
                  )}
                  {rep.rating && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary/10 text-primary">
                      {rep.rating}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-[11px] line-clamp-1">
                  {rep.title}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {rep.targetPrice && (
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block">Mục tiêu</span>
                    <span className="font-bold text-emerald-400">
                      {rep.targetPrice.toLocaleString("vi-VN")} ₫
                    </span>
                    {rep.upsidePct != null && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        (+{rep.upsidePct}%)
                      </span>
                    )}
                  </div>
                )}

                {rep.pdfUrl && (
                  <a
                    href={rep.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[11px] font-medium flex items-center gap-1 transition-colors"
                  >
                    <span>📄</span> PDF
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
