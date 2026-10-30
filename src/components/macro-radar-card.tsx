"use client";

import React, { useEffect, useState } from "react";
import type { MacroRadarSnapshot } from "@/lib/engines/macro-radar-engine";

export function MacroRadarCard() {
  const [data, setData] = useState<MacroRadarSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/macro/radar")
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((json: MacroRadarSnapshot) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load macro radar:", err);
        setError("Không thể tải dữ liệu vĩ mô.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground animate-pulse">
        Đang đồng bộ dữ liệu vĩ mô và chu kỳ kinh tế NHNN / Tổng cục Thống kê...
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const getVerdictBadge = (v: string) => {
    if (v === "VERY_FAVORABLE" || v === "FAVORABLE") {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          Thuận Lợi Cho Cổ Phiếu (+{data.overallScore}/100)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        Thận Trọng / Cân Bằng ({data.overallScore}/100)
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden space-y-5 p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">
              Radar Vĩ Mô & Chu Kỳ Kinh Tế (Macro Economic Radar)
            </h2>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              OQuant / Ray Dalio Cycle
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Định vị pha chu kỳ kinh tế, chính sách tiền tệ NHNN và ma trận phân bổ lớp tài sản
          </p>
        </div>
        <div>{getVerdictBadge(data.overallVerdict)}</div>
      </div>

      {/* Current Cycle Phase Highlight */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-primary uppercase tracking-wide">
            Định vị Chu Kỳ Hiện Tại
          </div>
          <span className="text-xs font-bold text-foreground">
            {data.phaseNameVi}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          {data.phaseDescription}
        </p>
      </div>

      {/* Macro Indicators Grid */}
      <div>
        <div className="text-xs font-semibold text-foreground mb-3 flex items-center justify-between">
          <span>Các Chỉ Số Vĩ Mô Cốt Lõi (Leading Macro Indicators)</span>
          <span className="text-[11px] text-muted-foreground">Cập nhật kỳ mới nhất</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.indicators.map((ind, i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-border/60 bg-surface/40 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{ind.name}</span>
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      ind.assessment === "POSITIVE"
                        ? "bg-emerald-400"
                        : ind.assessment === "NEUTRAL"
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                  />
                </div>
                <div className="text-lg font-bold text-foreground mt-1 flex items-baseline gap-1">
                  {ind.currentValue.toLocaleString("vi-VN")}
                  <span className="text-[11px] font-normal text-muted-foreground">{ind.unit}</span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 line-clamp-2 border-t border-border/30 pt-1.5">
                {ind.comment}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Asset Allocation & Sector Rotation Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {/* Asset Allocation */}
        <div className="p-4 rounded-xl border border-border/60 bg-surface/30">
          <h3 className="text-xs font-semibold text-foreground mb-3">
            Khuyến Nghị Phân Bổ Lớp Tài Sản (Asset Allocation)
          </h3>
          <div className="space-y-3">
            {data.allocationMatrix.map((item, i) => (
              <div key={i} className="text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-foreground">{item.assetClass}</span>
                  <span
                    className={`font-bold ${
                      item.stance === "OVERWEIGHT"
                        ? "text-emerald-400"
                        : item.stance === "UNDERWEIGHT"
                        ? "text-rose-400"
                        : "text-slate-300"
                    }`}
                  >
                    {item.weightPct}% ({item.stance === "OVERWEIGHT" ? "TĂNG TỶ TRỌNG" : item.stance === "UNDERWEIGHT" ? "GIẢM TỶ TRỌNG" : "CÂN BẰNG"})
                  </span>
                </div>
                <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.stance === "OVERWEIGHT"
                        ? "bg-emerald-500"
                        : item.stance === "UNDERWEIGHT"
                        ? "bg-rose-500"
                        : "bg-primary"
                    }`}
                    style={{ width: `${item.weightPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{item.rationale}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Leading vs Lagging Sectors */}
        <div className="p-4 rounded-xl border border-border/60 bg-surface/30 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-foreground mb-3">
              Luân Chuyển Ngành Trong Pha Hiện Tại (Sector Rotation)
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1.5">
                  Ngành Dẫn Sóng Hưởng Lợi (Leading Sectors):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.leadingSectors.map((sec, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]"
                    >
                      {sec}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center gap-1.5 text-rose-400 font-semibold mb-1.5">
                  Ngành Kém Hưởng Lợi / Cần Thận Trọng (Lagging Sectors):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.laggingSectors.map((sec, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px]"
                    >
                      {sec}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground mt-4 pt-2 border-t border-border/30">
            * Mô hình vĩ mô lượng hóa dựa trên chu kỳ nới lỏng tiền tệ và tăng trưởng cung tiền M2 của Việt Nam.
          </div>
        </div>
      </div>
    </div>
  );
}
