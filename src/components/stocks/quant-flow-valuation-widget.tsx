"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { Loading, fmtNum, fmtCompact, Chg } from "@/components/ui";
import {
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Activity,
  Layers,
  ArrowUpRight,
  Info,
  Calendar,
  Sparkles,
} from "lucide-react";
import type {
  MiQuantValuationDetail,
  MiQuantKeyMetrics,
  MiQuantStockMoneyFlowHistory,
} from "@/lib/providers/miquant";

export function StockQuantFlowValuationWidget({ symbol }: { symbol: string }) {
  const [days, setDays] = useState<number>(60);

  const { data, isLoading } = useApi<{
    data: {
      symbol: string;
      days: number;
      moneyFlow: MiQuantStockMoneyFlowHistory | null;
      valuation: MiQuantValuationDetail | null;
      metrics: MiQuantKeyMetrics | null;
    };
  }>(`/api/v1/stocks/${symbol}/quant-flow?days=${days}`, {
    refreshInterval: 60000,
  });

  const moneyFlow = data?.data?.moneyFlow;
  const valuation = data?.data?.valuation;
  const metrics = data?.data?.metrics;

  // Process money flow history for SVG chart
  const flowChartData = useMemo(() => {
    if (!moneyFlow || !moneyFlow.timestamp || moneyFlow.timestamp.length === 0) {
      return null;
    }

    const count = moneyFlow.timestamp.length;
    const items = [];
    let minCum = Infinity;
    let maxCum = -Infinity;
    let maxAbsDaily = 0;

    for (let i = 0; i < count; i++) {
      const ts = moneyFlow.timestamp[i];
      const daily = moneyFlow.total_net_money_flow[i] || 0;
      const cum = moneyFlow.cumulative_net_money_flow[i] || 0;
      const dailyBil = daily / 1e9;
      const cumBil = cum / 1e9;

      if (cumBil < minCum) minCum = cumBil;
      if (cumBil > maxCum) maxCum = cumBil;
      if (Math.abs(dailyBil) > maxAbsDaily) maxAbsDaily = Math.abs(dailyBil);

      items.push({
        date: new Date(ts * 1000).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
        }),
        dailyBil,
        cumBil,
      });
    }

    if (minCum === maxCum) {
      minCum -= 10;
      maxCum += 10;
    }
    if (maxAbsDaily === 0) maxAbsDaily = 10;

    return {
      items,
      minCum,
      maxCum,
      maxAbsDaily,
      latestCumBil: items[items.length - 1]?.cumBil || 0,
      totalNetBil: items.reduce((acc, it) => acc + it.dailyBil, 0),
    };
  }, [moneyFlow]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-bg-surface p-5">
        <Loading rows={4} label="Đang tải dữ liệu Định lượng & Dòng tiền OQuant..." />
      </div>
    );
  }

  const curPrice = valuation?.close ? valuation.close * (valuation.close < 1000 ? 1000 : 1) : 0;
  const aiValuation = valuation?.ai_valuation ? valuation.ai_valuation * (valuation.ai_valuation < 1000 ? 1000 : 1) : 0;
  const upsideGap = valuation?.valuation_pct_gap ?? 0;
  const valRating = valuation?.valuation_rating || (upsideGap > 15 ? "Định giá rẻ" : upsideGap > 0 ? "Hấp dẫn" : "Định giá cao");

  return (
    <div className="rounded-2xl border border-border/80 bg-bg-surface p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              OQuant Quantitative & Valuation Engine
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
              Giai đoạn 1: Live Feed
            </span>
          </div>
          <h3 className="text-base font-bold text-text-primary">
            Dải Định Giá AI & Biểu Đồ Dòng Tiền Tích Lũy ({symbol})
          </h3>
        </div>

        <div className="flex items-center gap-1.5 self-start">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                days === d
                  ? "bg-accent-primary text-text-inverse shadow-sm"
                  : "bg-bg-base text-text-muted hover:text-text-primary"
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {/* Grid: 2 Columns (Valuation Band & Money Flow Chart) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Column 1: AI Valuation Band (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-border/70 bg-bg-base/60 p-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-400">
                <ShieldCheck className="size-4" />
                Định Giá AI OQuant
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  upsideGap > 15
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : upsideGap > 0
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                }`}
              >
                {valRating}
              </span>
            </div>

            {/* Price vs AI Target */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-border/50 bg-bg-surface p-3">
                <div className="text-[10px] text-text-muted">Giá Thị Trường</div>
                <div className="text-lg font-bold font-mono text-text-primary">
                  {fmtNum(curPrice || 0)} đ
                </div>
                {valuation?.daily_pct_change !== undefined && (
                  <Chg value={valuation.daily_pct_change} className="text-[10px]" />
                )}
              </div>

              <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3">
                <div className="text-[10px] text-blue-300">Giá Trị Nội Tại AI</div>
                <div className="text-lg font-bold font-mono text-blue-400">
                  {fmtNum(aiValuation || 0)} đ
                </div>
                <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                  <ArrowUpRight className="size-3" />
                  Upside: +{upsideGap.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Visual Progress Gap */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[11px] text-text-muted">
                <span>Biên an toàn định giá (Margin of Safety)</span>
                <span className="font-bold text-text-primary">
                  {aiValuation > 0 ? `${((curPrice / aiValuation) * 100).toFixed(0)}% Giá trị` : "—"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-bg-surface border border-border/60">
                <div
                  className={`h-full transition-all duration-500 ${
                    upsideGap > 15 ? "bg-emerald-500" : upsideGap > 0 ? "bg-blue-500" : "bg-rose-500"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(10, aiValuation > 0 ? (curPrice / aiValuation) * 100 : 50))}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-text-muted italic">
                {upsideGap > 15
                  ? "Cổ phiếu đang được định giá chiết khấu sâu, biên an toàn cao cho việc tích lũy trung-dài hạn."
                  : upsideGap > 0
                  ? "Cổ phiếu đang giao dịch quanh vùng định giá hợp lý với tiềm năng tăng trưởng nhẹ."
                  : "Giá thị trường đã phản ánh đủ hoặc vượt giá trị nội tại AI tính toán."}
              </p>
            </div>
          </div>

          {/* Quick Quantitative Factor Scores */}
          {metrics && (
            <div className="grid grid-cols-4 gap-2 border-t border-border/50 pt-3 text-center text-[10px]">
              <div>
                <div className="text-text-muted">Kỹ thuật</div>
                <div className="font-bold text-blue-400">{metrics.technical_score}/100</div>
              </div>
              <div>
                <div className="text-text-muted">Tâm lý AI</div>
                <div className="font-bold text-emerald-400">{metrics.sentiment_score}/100</div>
              </div>
              <div>
                <div className="text-text-muted">GARCH Vol</div>
                <div className="font-bold text-amber-400">{metrics.volatility}</div>
              </div>
              <div>
                <div className="text-text-muted">Beta 3M</div>
                <div className="font-bold text-purple-400">{metrics.beta_3m}</div>
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Cumulative Net Money Flow Chart (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-border/70 bg-bg-base/60 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-border/40 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <DollarSign className="size-4" />
              Dòng Tiền Tích Lũy Lũy Kế ({days} phiên)
            </span>
            {flowChartData && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-text-muted">
                  Tổng ròng:{" "}
                  <strong
                    className={
                      flowChartData.totalNetBil >= 0 ? "text-emerald-400" : "text-rose-400"
                    }
                  >
                    {flowChartData.totalNetBil >= 0 ? "+" : ""}
                    {fmtNum(flowChartData.totalNetBil)} Tỷ
                  </strong>
                </span>
                <span className="text-text-muted">
                  Tích lũy:{" "}
                  <strong
                    className={
                      flowChartData.latestCumBil >= 0 ? "text-blue-400" : "text-rose-400"
                    }
                  >
                    {flowChartData.latestCumBil >= 0 ? "+" : ""}
                    {fmtNum(flowChartData.latestCumBil)} Tỷ
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* SVG Chart */}
          {flowChartData && flowChartData.items.length > 0 ? (
            <div className="relative h-44 w-full">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                {/* Horizontal baseline for 0 */}
                <line
                  x1="0"
                  y1="80"
                  x2="500"
                  y2="80"
                  stroke="currentColor"
                  className="text-border/40"
                  strokeDasharray="3 3"
                />

                {/* Daily Bar Histogram */}
                {flowChartData.items.map((it, idx) => {
                  const x = (idx / (flowChartData.items.length - 1)) * 480 + 10;
                  const barHeight = Math.min(50, (Math.abs(it.dailyBil) / flowChartData.maxAbsDaily) * 50);
                  const isPositive = it.dailyBil >= 0;
                  const y = isPositive ? 80 - barHeight : 80;

                  return (
                    <rect
                      key={idx}
                      x={x - 2}
                      y={y}
                      width={4}
                      height={Math.max(2, barHeight)}
                      fill={isPositive ? "#10b981" : "#f43f5e"}
                      opacity={0.65}
                      rx={1}
                    >
                      <title>{`${it.date}: ${it.dailyBil.toFixed(2)} Tỷ (Lũy kế: ${it.cumBil.toFixed(2)} Tỷ)`}</title>
                    </rect>
                  );
                })}

                {/* Cumulative Net Flow Polyline */}
                {(() => {
                  const points = flowChartData.items.map((it, idx) => {
                    const x = (idx / (flowChartData.items.length - 1)) * 480 + 10;
                    const range = flowChartData.maxCum - flowChartData.minCum || 1;
                    const norm = (it.cumBil - flowChartData.minCum) / range;
                    const y = 140 - norm * 120;
                    return `${x},${y}`;
                  });

                  return (
                    <polyline
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      points={points.join(" ")}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })()}
              </svg>

              {/* Legends & Axis info */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-sm bg-emerald-500" /> Mua chủ động
                  <span className="ml-2 inline-block size-2 rounded-sm bg-rose-500" /> Bán chủ động
                  <span className="ml-2 inline-block h-0.5 w-3 bg-blue-500" /> Dòng tiền tích lũy
                </span>
                <span>{flowChartData.items[0]?.date} &rarr; {flowChartData.items[flowChartData.items.length - 1]?.date}</span>
              </div>
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center text-xs text-text-muted">
              Đang tổng hợp dữ liệu dòng tiền chi tiết cho {symbol}...
            </div>
          )}

          <div className="rounded-lg bg-bg-surface/80 p-2 text-[11px] text-text-secondary border border-border/40">
            <strong>Tín hiệu dòng tiền:</strong>{" "}
            {flowChartData && flowChartData.latestCumBil > 0
              ? `Dòng tiền tích lũy lũy kế đang dương (+${fmtNum(flowChartData.latestCumBil)} Tỷ), thể hiện tổ chức và dòng tiền lớn đang tiếp tục gom giữ cổ phiếu.`
              : `Dòng tiền tích lũy đang có dấu hiệu hạ nhiệt, cần quan sát thêm lực cầu tại các vùng hỗ trợ kỹ thuật.`}
          </div>
        </div>
      </div>
    </div>
  );
}
