"use client";

import React, { useEffect, useState } from "react";
import type { TechnicalGaugeReport, GaugeVerdict } from "@/lib/engines/technical-rating-gauge";

interface Props {
  symbol: string;
}

function verdictColor(verdict: GaugeVerdict): { text: string; bg: string; border: string; angle: number } {
  switch (verdict) {
    case "STRONG_BUY":
      return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", angle: 65 };
    case "BUY":
      return { text: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20", angle: 30 };
    case "NEUTRAL":
      return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", angle: 0 };
    case "SELL":
      return { text: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/20", angle: -30 };
    case "STRONG_SELL":
      return { text: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30", angle: -65 };
  }
}

function verdictLabelVi(verdict: GaugeVerdict): string {
  switch (verdict) {
    case "STRONG_BUY": return "MUA MẠNH";
    case "BUY": return "MUA";
    case "NEUTRAL": return "TRUNG LẬP";
    case "SELL": return "BÁN";
    case "STRONG_SELL": return "BÁN MẠNH";
  }
}

function MeterDial({ title, verdict, buy, sell, neutral, angle }: {
  title: string;
  verdict: GaugeVerdict;
  buy: number;
  sell: number;
  neutral: number;
  angle: number;
}) {
  const meta = verdictColor(verdict);

  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-surface-elevated/40 border border-border-subtle">
      <span className="text-xs font-medium text-text-tertiary mb-1 uppercase tracking-wider">{title}</span>

      {/* SVG Semi-Circle Speedometer */}
      <div className="relative w-36 h-20 flex items-end justify-center overflow-hidden">
        <svg viewBox="0 0 100 55" className="w-full h-full">
          {/* Gauge Arc Segments: Strong Sell -> Sell -> Neutral -> Buy -> Strong Buy */}
          <path d="M 10 50 A 40 40 0 0 1 22 22" fill="none" stroke="#ef4444" strokeWidth="7" strokeLinecap="round" />
          <path d="M 23 21 A 40 40 0 0 1 42 11" fill="none" stroke="#f87171" strokeWidth="7" />
          <path d="M 43 11 A 40 40 0 0 1 57 11" fill="none" stroke="#fbbf24" strokeWidth="7" />
          <path d="M 58 11 A 40 40 0 0 1 77 21" fill="none" stroke="#34d399" strokeWidth="7" />
          <path d="M 78 22 A 40 40 0 0 1 90 50" fill="none" stroke="#10b981" strokeWidth="7" strokeLinecap="round" />

          {/* Pivot pin */}
          <circle cx="50" cy="50" r="3.5" fill="#e2e8f0" />

          {/* Needle with rotation transition */}
          <g transform={`rotate(${angle}, 50, 50)`} style={{ transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
            <line x1="50" y1="50" x2="50" y2="15" stroke="#f1f5f9" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      {/* Verdict text badge */}
      <div className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full border ${meta.text} ${meta.bg} ${meta.border}`}>
        {verdictLabelVi(verdict)}
      </div>

      {/* Tally */}
      <div className="flex items-center gap-2 mt-2 text-[11px] text-text-tertiary">
        <span className="text-rose-400 font-semibold">{sell} Bán</span>
        <span>•</span>
        <span className="text-amber-400 font-semibold">{neutral} Trung hòa</span>
        <span>•</span>
        <span className="text-emerald-400 font-semibold">{buy} Mua</span>
      </div>
    </div>
  );
}

export function TechnicalGaugeCard({ symbol }: Props) {
  const [data, setData] = useState<TechnicalGaugeReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    setLoading(true);

    fetch(`/api/v1/stocks/${encodeURIComponent(symbol)}/technical-gauge`)
      .then((r) => r.json())
      .then((res) => {
        if (!unmounted && res.ok && res.data) {
          setData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!unmounted) setLoading(false);
      });

    return () => {
      unmounted = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-background-secondary p-4 animate-pulse">
        <div className="h-4 w-40 bg-surface-elevated rounded mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="h-28 bg-surface-elevated rounded-xl" />
          <div className="h-28 bg-surface-elevated rounded-xl" />
          <div className="h-28 bg-surface-elevated rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const sumMeta = verdictColor(data.summary.verdict);
  const oscMeta = verdictColor(data.oscillators.verdict);
  const maMeta = verdictColor(data.movingAverages.verdict);

  return (
    <div className="rounded-xl border border-border-subtle bg-background-secondary p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary">Đồng hồ Đo lường Kỹ thuật 26 Chỉ báo</span>
          <span className="text-[11px] text-text-tertiary">(Chuẩn TradingView Rating)</span>
        </div>
        <span className="text-xs font-semibold text-text-secondary">{symbol}</span>
      </div>

      {/* 3 Speedometers Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MeterDial
          title="Dao động (Oscillators)"
          verdict={data.oscillators.verdict}
          buy={data.oscillators.buy}
          sell={data.oscillators.sell}
          neutral={data.oscillators.neutral}
          angle={oscMeta.angle}
        />
        <MeterDial
          title="Tổng hợp (Summary)"
          verdict={data.summary.verdict}
          buy={data.summary.buy}
          sell={data.summary.sell}
          neutral={data.summary.neutral}
          angle={sumMeta.angle}
        />
        <MeterDial
          title="Đường MA (Moving Averages)"
          verdict={data.movingAverages.verdict}
          buy={data.movingAverages.buy}
          sell={data.movingAverages.sell}
          neutral={data.movingAverages.neutral}
          angle={maMeta.angle}
        />
      </div>
    </div>
  );
}

