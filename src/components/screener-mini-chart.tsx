"use client";

import React, { useMemo, useState } from "react";
import { fmtNum, fmtCompact } from "@/components/ui";

export interface MiniBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ScreenerMiniChartProps {
  symbol?: string;
  bars?: MiniBar[];
  sparkBars?: MiniBar[];
  sparkline?: number[];
  buyPoint?: number | null;
  ma20?: number | null;
  ma50?: number | null;
  currentPrice?: number | null;
  width?: number;
  height?: number;
  className?: string;
}

export function ScreenerMiniChart({
  symbol,
  bars,
  sparkBars,
  sparkline,
  buyPoint,
  ma20,
  ma50,
  currentPrice,
  width = 280,
  height = 110,
  className = "",
}: ScreenerMiniChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Normalize data: prefer full bars, fallback to sparkline
  const chartData = useMemo(() => {
    const rawBars = bars ?? sparkBars;
    if (rawBars && rawBars.length >= 3) {
      return rawBars.map((b) => ({
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      }));
    }
    if (sparkline && sparkline.length >= 3) {
      return sparkline.map((c, i) => {
        const prev = i > 0 ? sparkline[i - 1] : c;
        return {
          open: prev,
          high: Math.max(prev, c),
          low: Math.min(prev, c),
          close: c,
          volume: 100_000,
        };
      });
    }
    return null;
  }, [bars, sparkline]);

  if (!chartData || chartData.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-surface-elevated/40 text-[10px] text-text-muted border border-border-subtle/50 ${className}`}
        style={{ width: "100%", height }}
      >
        <span>Chưa đủ dữ liệu nến</span>
      </div>
    );
  }

  const n = chartData.length;
  const paddingX = 8;
  const paddingY = 8;
  const plotWidth = width - paddingX * 2;
  const pricePlotHeight = height * 0.72 - paddingY;
  const volumePlotHeight = height * 0.22;
  const volumeBaseY = height - 4;

  // Compute price min/max (include buyPoint and currentPrice if relevant)
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVol = 0;

  for (let i = 0; i < n; i++) {
    const d = chartData[i];
    if (d.low < minPrice) minPrice = d.low;
    if (d.high > maxPrice) maxPrice = d.high;
    if (d.volume > maxVol) maxVol = d.volume;
  }

  if (buyPoint && buyPoint > 0) {
    if (buyPoint * 0.98 < minPrice) minPrice = buyPoint * 0.98;
    if (buyPoint * 1.02 > maxPrice) maxPrice = buyPoint * 1.02;
  }

  // Margin buffer
  const priceRange = maxPrice - minPrice || 1;
  const yMin = minPrice - priceRange * 0.04;
  const yMax = maxPrice + priceRange * 0.04;
  const yRange = yMax - yMin;

  const getY = (price: number) => {
    return paddingY + pricePlotHeight - ((price - yMin) / yRange) * pricePlotHeight;
  };

  const getX = (index: number) => {
    return paddingX + (index / (n - 1)) * plotWidth;
  };

  const barWidth = Math.max(2, Math.min(8, (plotWidth / n) * 0.65));

  // Compute MA20 polyline if bars available
  const ma20Points: string[] = [];
  const maPeriod = 5; // Mini rolling average for smooth curve
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - maPeriod + 1);
    let sum = 0;
    for (let k = start; k <= i; k++) sum += chartData[k].close;
    const avg = sum / (i - start + 1);
    ma20Points.push(`${getX(i).toFixed(1)},${getY(avg).toFixed(1)}`);
  }

  const activeBar = hoverIndex != null && hoverIndex >= 0 && hoverIndex < n ? chartData[hoverIndex] : null;

  return (
    <div className={`relative select-none overflow-hidden rounded-lg bg-panel-2/60 border border-border-subtle/80 ${className}`}>
      {/* Mini Header / Legend */}
      <div className="flex items-center justify-between px-2 pt-1.5 text-[9.5px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-0.5 bg-cyan-400 rounded"></span>
          <span className="text-text-muted">MA Kênh</span>
          {buyPoint && (
            <>
              <span className="text-text-muted">·</span>
              <span className="inline-block w-2 h-0.5 border-b border-dashed border-emerald-400"></span>
              <span className="text-emerald-400 font-bold">Buy {fmtNum(buyPoint, 1)}</span>
            </>
          )}
        </div>
        {activeBar ? (
          <div className="flex items-center gap-1.5 font-mono text-[9px]">
            <span className={activeBar.close >= activeBar.open ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
              {fmtNum(activeBar.close, 2)}
            </span>
            <span className="text-text-muted">Vol: {fmtCompact(activeBar.volume)}</span>
          </div>
        ) : (
          <span className="text-text-muted font-mono text-[9px]">{n} phiên gần nhất</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto cursor-crosshair overflow-visible"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Buy Point Line */}
        {buyPoint && buyPoint >= yMin && buyPoint <= yMax && (
          <g>
            <line
              x1={paddingX}
              y1={getY(buyPoint)}
              x2={width - paddingX}
              y2={getY(buyPoint)}
              stroke="#10b981"
              strokeWidth="1"
              strokeDasharray="3 2"
              opacity="0.8"
            />
          </g>
        )}

        {/* Volume Bars */}
        {chartData.map((d, i) => {
          const isUp = d.close >= d.open;
          const volRatio = maxVol > 0 ? d.volume / maxVol : 0;
          const barH = Math.max(1, volRatio * volumePlotHeight);
          const x = getX(i) - barWidth / 2;
          const y = volumeBaseY - barH;

          return (
            <rect
              key={`vol-${i}`}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              fill={isUp ? "#10b981" : "#f43f5e"}
              opacity={hoverIndex === i ? 0.9 : 0.3}
              rx="0.5"
            />
          );
        })}

        {/* Candlesticks */}
        {chartData.map((d, i) => {
          const isUp = d.close >= d.open;
          const color = isUp ? "#10b981" : "#f43f5e";
          const cx = getX(i);
          const yHigh = getY(d.high);
          const yLow = getY(d.low);
          const yOpen = getY(d.open);
          const yClose = getY(d.close);
          const bodyY = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));

          return (
            <g
              key={`candle-${i}`}
              onMouseEnter={() => setHoverIndex(i)}
            >
              {/* Wick */}
              <line
                x1={cx}
                y1={yHigh}
                x2={cx}
                y2={yLow}
                stroke={color}
                strokeWidth="1"
                opacity={hoverIndex === i ? 1 : 0.85}
              />
              {/* Body */}
              <rect
                x={cx - barWidth / 2}
                y={bodyY}
                width={barWidth}
                height={bodyH}
                fill={isUp ? color : color}
                stroke={color}
                strokeWidth="0.5"
                opacity={hoverIndex === i ? 1 : 0.9}
                rx="0.5"
              />
            </g>
          );
        })}

        {/* MA Smooth Curve */}
        {ma20Points.length > 1 && (
          <polyline
            points={ma20Points.join(" ")}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.2"
            opacity="0.85"
            strokeLinecap="round"
          />
        )}

        {/* Hover Crosshair line */}
        {hoverIndex != null && (
          <line
            x1={getX(hoverIndex)}
            y1={paddingY}
            x2={getX(hoverIndex)}
            y2={volumeBaseY}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.6"
          />
        )}
      </svg>
    </div>
  );
}