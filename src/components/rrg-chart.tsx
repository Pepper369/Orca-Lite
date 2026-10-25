"use client";

import { useState, useMemo, memo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { RrgResult, RrgItem, RrgQuadrant } from "@/lib/engines/rrg-engine";
import { Loading, Panel } from "@/components/ui";
import {
  Compass,
  TrendingUp,
  ArrowRight,
  Filter,
  Sparkles,
  Info,
  Maximize2,
  RefreshCw,
  Layers,
  Award,
  Zap,
} from "lucide-react";

const QUADRANT_META: Record<
  RrgQuadrant,
  { label: string; desc: string; bgClass: string; borderClass: string; textClass: string; color: string }
> = {
  LEADING: {
    label: "Dẫn dắt (Leading)",
    desc: "RS > 100 & Momentum > 100: Mạnh hơn VN-Index và đang gia tốc tăng.",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/30",
    textClass: "text-emerald-400",
    color: "#10b981",
  },
  WEAKENING: {
    label: "Suy yếu (Weakening)",
    desc: "RS > 100 & Momentum < 100: Vẫn khỏe hơn thị trường nhưng đà tăng đang chậm lại.",
    bgClass: "bg-cyan-500/10",
    borderClass: "border-cyan-500/30",
    textClass: "text-cyan-400",
    color: "#06b6d4",
  },
  LAGGING: {
    label: "Tụt hậu (Lagging)",
    desc: "RS < 100 & Momentum < 100: Yếu hơn VN-Index và đà giảm đang tiếp diễn.",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
    textClass: "text-rose-400",
    color: "#f43f5e",
  },
  IMPROVING: {
    label: "Tích lũy (Improving)",
    desc: "RS < 100 & Momentum > 100: Đang tạo đáy phục hồi, động lượng tăng mạnh.",
    bgClass: "bg-amber-500/10",
    borderClass: "border-amber-500/30",
    textClass: "text-amber-400",
    color: "#f59e0b",
  },
};

export const RrgChart = memo(function RrgChart() {
  const [mode, setMode] = useState<"sectors" | "vn30">("sectors");
  const [trailLength, setTrailLength] = useState<number>(5);
  const [selectedQuadrant, setSelectedQuadrant] = useState<RrgQuadrant | "ALL">("ALL");
  const [hoveredItem, setHoveredItem] = useState<RrgItem | null>(null);
  const [activeItem, setActiveItem] = useState<RrgItem | null>(null);

  const { data, isLoading, mutate } = useApi<{ data: RrgResult }>(
    `/api/v1/market/rrg?mode=${mode}&trail=${trailLength}`,
    { refreshInterval: 60_000 }
  );

  const rrg = data?.data;
  const items = useMemo(() => rrg?.items || [], [rrg?.items]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (selectedQuadrant === "ALL") return items;
    return items.filter((i) => i.quadrant === selectedQuadrant);
  }, [items, selectedQuadrant]);

  // SVG Coordinate mapping (Auto scale bounds around 100)
  const { minX, maxX, minY, maxY } = useMemo(() => {
    let xMin = 98;
    let xMax = 102;
    let yMin = 98;
    let yMax = 102;

    for (const item of items) {
      for (const p of item.trail) {
        if (p.rsRatio < xMin) xMin = p.rsRatio;
        if (p.rsRatio > xMax) xMax = p.rsRatio;
        if (p.rsMomentum < yMin) yMin = p.rsMomentum;
        if (p.rsMomentum > yMax) yMax = p.rsMomentum;
      }
    }

    // Ensure symmetrical padding around center (100, 100)
    const spanX = Math.max(Math.abs(xMin - 100), Math.abs(xMax - 100)) + 0.8;
    const spanY = Math.max(Math.abs(yMin - 100), Math.abs(yMax - 100)) + 0.8;

    return {
      minX: 100 - spanX,
      maxX: 100 + spanX,
      minY: 100 - spanY,
      maxY: 100 + spanY,
    };
  }, [items]);

  // Convert (RS-Ratio, RS-Momentum) to SVG Canvas (viewBox 0 0 800 600)
  const width = 800;
  const height = 550;
  const padding = 50;

  const scaleX = (val: number) => {
    return padding + ((val - minX) / (maxX - minX)) * (width - padding * 2);
  };

  const scaleY = (val: number) => {
    // Invert Y for SVG (higher momentum = smaller SVG Y)
    return height - padding - ((val - minY) / (maxY - minY)) * (height - padding * 2);
  };

  const centerX = scaleX(100);
  const centerY = scaleY(100);

  if (isLoading && !rrg) {
    return (
      <Panel title="Biểu đồ Luân chuyển Dòng tiền RRG (Relative Rotation Graph)">
        <Loading rows={8} label="Đang nạp tọa độ vòng xoay dòng tiền…" />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Compass className="size-5 text-accent-primary animate-spin-slow" />
          <div>
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              Biểu Đồ Vòng Xoay Dòng Tiền (RRG)
              <span className="rounded bg-accent-primary/15 px-2 py-0.5 text-[11px] font-semibold text-accent-primary">
                Chuẩn Julius de Kempenaer
              </span>
            </h2>
            <p className="text-xs text-text-muted">
              Chu kỳ 4 pha: Tích lũy ➔ Dẫn dắt ➔ Suy yếu ➔ Tụt hậu so với VN-Index (Cập nhật: {rrg?.asOfDate})
            </p>
          </div>
        </div>

        {/* Mode Toggle & Trail Slider */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border-subtle bg-surface-base p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("sectors")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                mode === "sectors" ? "bg-accent-primary text-white font-bold" : "text-text-muted hover:text-text-primary"
              }`}
            >
              18 Nhóm Ngành
            </button>
            <button
              type="button"
              onClick={() => setMode("vn30")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                mode === "vn30" ? "bg-accent-primary text-white font-bold" : "text-text-muted hover:text-text-primary"
              }`}
            >
              Cổ Phiếu VN30
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1 text-xs text-text-muted">
            <span>Độ dài đuôi:</span>
            <select
              value={trailLength}
              onChange={(e) => setTrailLength(Number(e.target.value))}
              className="bg-transparent font-semibold text-text-primary focus:outline-none"
            >
              <option value={3}>3 phiên</option>
              <option value={5}>5 phiên</option>
              <option value={7}>7 phiên</option>
              <option value={10}>10 phiên</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => mutate()}
            className="rounded-lg border border-border-subtle p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Quadrants Summary Cards / Filters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["LEADING", "IMPROVING", "WEAKENING", "LAGGING"] as RrgQuadrant[]).map((quad) => {
          const meta = QUADRANT_META[quad];
          const count = items.filter((i) => i.quadrant === quad).length;
          const isSelected = selectedQuadrant === quad;

          return (
            <button
              key={quad}
              type="button"
              onClick={() => setSelectedQuadrant(isSelected ? "ALL" : quad)}
              className={`rounded-xl border p-2.5 text-left transition-all ${meta.bgClass} ${
                isSelected ? "ring-2 ring-accent-primary border-transparent" : meta.borderClass
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${meta.textClass}`}>{meta.label.split(" ")[0]}</span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-surface-base/60 text-text-primary">
                  {count} {mode === "sectors" ? "ngành" : "mã"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-text-muted line-clamp-1">{meta.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Main RRG SVG Visualization Canvas */}
      <div className="relative rounded-2xl border border-border-subtle bg-surface-base/90 p-2 overflow-hidden shadow-2xl backdrop-blur-md">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          style={{ maxHeight: "650px" }}
        >
          {/* Quadrant Background Tints */}
          {/* 1. TOP-RIGHT: LEADING */}
          <rect
            x={centerX}
            y={padding}
            width={width - padding - centerX}
            height={centerY - padding}
            fill="rgba(16, 185, 129, 0.04)"
          />
          {/* 2. TOP-LEFT: IMPROVING */}
          <rect
            x={padding}
            y={padding}
            width={centerX - padding}
            height={centerY - padding}
            fill="rgba(245, 158, 11, 0.04)"
          />
          {/* 3. BOTTOM-LEFT: LAGGING */}
          <rect
            x={padding}
            y={centerY}
            width={centerX - padding}
            height={height - padding - centerY}
            fill="rgba(244, 63, 94, 0.04)"
          />
          {/* 4. BOTTOM-RIGHT: WEAKENING */}
          <rect
            x={centerX}
            y={centerY}
            width={width - padding - centerX}
            height={height - padding - centerY}
            fill="rgba(6, 182, 212, 0.04)"
          />

          {/* Grid lines */}
          <line
            x1={centerX}
            y1={padding}
            x2={centerX}
            y2={height - padding}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1={padding}
            y1={centerY}
            x2={width - padding}
            y2={centerY}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Quadrant Watermark Labels */}
          <text
            x={width - padding - 15}
            y={padding + 25}
            textAnchor="end"
            className="fill-emerald-400 font-extrabold text-[13px] tracking-wider opacity-60"
          >
            ↗ DẪN DẮT (LEADING)
          </text>
          <text
            x={padding + 15}
            y={padding + 25}
            textAnchor="start"
            className="fill-amber-400 font-extrabold text-[13px] tracking-wider opacity-60"
          >
            ↖ TÍCH LŨY (IMPROVING)
          </text>
          <text
            x={padding + 15}
            y={height - padding - 15}
            textAnchor="start"
            className="fill-rose-400 font-extrabold text-[13px] tracking-wider opacity-60"
          >
            ↙ TỤT HẬU (LAGGING)
          </text>
          <text
            x={width - padding - 15}
            y={height - padding - 15}
            textAnchor="end"
            className="fill-cyan-400 font-extrabold text-[13px] tracking-wider opacity-60"
          >
            ↘ SUY YẾU (WEAKENING)
          </text>

          {/* Axis Labels */}
          <text
            x={width / 2}
            y={height - 15}
            textAnchor="middle"
            className="fill-text-muted text-[11px] font-semibold tracking-wide"
          >
            Sức Mạnh Giá Tương Đối (RS-Ratio so với VN-Index) ➔
          </text>
          <text
            x={15}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90 15 ${height / 2})`}
            className="fill-text-muted text-[11px] font-semibold tracking-wide"
          >
            Gia Tốc Động Lượng (RS-Momentum) ➔
          </text>

          {/* Center Benchmark Point */}
          <circle cx={centerX} cy={centerY} r={5} fill="#6366f1" />
          <text
            x={centerX + 8}
            y={centerY - 8}
            className="fill-indigo-300 font-bold text-[11px]"
          >
            VN-INDEX (100, 100)
          </text>

          {/* Draw Trails & Nodes */}
          {filteredItems.map((item) => {
            const isHovered = hoveredItem?.id === item.id;
            const isSelected = activeItem?.id === item.id;
            const meta = QUADRANT_META[item.quadrant];

            // Build path string for trail
            const trailCoords = item.trail.map((p) => ({
              x: scaleX(p.rsRatio),
              y: scaleY(p.rsMomentum),
            }));

            const pathD = trailCoords.reduce((acc, curr, idx) => {
              return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
            }, "");

            const currentPoint = trailCoords[trailCoords.length - 1];
            if (!currentPoint) return null;

            return (
              <g
                key={item.id}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => setActiveItem(item)}
              >
                {/* Tail Trail Polyline */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={meta.color}
                  strokeWidth={isHovered || isSelected ? 3.5 : 1.8}
                  strokeOpacity={isHovered || isSelected ? 0.95 : 0.45}
                  strokeDasharray={isHovered ? "none" : "2 2"}
                />

                {/* Trail Historical Dots */}
                {trailCoords.slice(0, -1).map((pt, pIdx) => (
                  <circle
                    key={pIdx}
                    cx={pt.x}
                    cy={pt.y}
                    r={2}
                    fill={meta.color}
                    opacity={0.3 + (pIdx / trailCoords.length) * 0.4}
                  />
                ))}

                {/* Current Head Node */}
                <circle
                  cx={currentPoint.x}
                  cy={currentPoint.y}
                  r={isHovered || isSelected ? 8 : 5.5}
                  fill={meta.color}
                  stroke="#18181b"
                  strokeWidth={2}
                  className="transition-all duration-150"
                />

                {/* Node Label Text */}
                <text
                  x={currentPoint.x + 8}
                  y={currentPoint.y + 3}
                  className={`font-bold transition-all ${
                    isHovered || isSelected
                      ? "fill-white text-[12px] drop-shadow-md"
                      : "fill-text-secondary text-[10px]"
                  }`}
                >
                  {item.code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover / Selected Info Tooltip floating card */}
        {(hoveredItem || activeItem) && (
          <div className="absolute bottom-4 right-4 max-w-xs rounded-xl border border-border-subtle bg-surface-elevated/95 p-3.5 shadow-2xl backdrop-blur-md text-xs space-y-1.5 transition-all">
            {(() => {
              const item = hoveredItem || activeItem!;
              const meta = QUADRANT_META[item.quadrant];
              return (
                <>
                  <div className="flex items-center justify-between border-b border-border-subtle pb-1.5">
                    <span className="font-bold text-sm text-text-primary">{item.name} ({item.code})</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.bgClass} ${meta.textClass}`}>
                      {meta.label.split(" ")[0]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-text-muted pt-1">
                    <div>
                      <span>RS-Ratio:</span>{" "}
                      <span className="font-bold text-text-primary">{item.currentRsRatio}</span>
                    </div>
                    <div>
                      <span>RS-Momentum:</span>{" "}
                      <span className="font-bold text-text-primary">{item.currentRsMomentum}</span>
                    </div>
                    <div>
                      <span>Đà tăng 5 phiên:</span>{" "}
                      <span className={`font-bold ${item.change5dPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {item.change5dPct >= 0 ? `+${item.change5dPct}%` : `${item.change5dPct}%`}
                      </span>
                    </div>
                    <div>
                      <span>Vị thế:</span>{" "}
                      <span className="font-semibold text-text-primary">
                        {item.currentRsRatio >= 100 ? "Outperform" : "Underperform"}
                      </span>
                    </div>
                  </div>
                  {mode === "vn30" && (
                    <div className="pt-1 border-t border-border-subtle/50">
                      <Link
                        href={`/stocks/${item.code}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-primary hover:underline"
                      >
                        Xem phân tích chi tiết {item.code} <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Ranked Table of Sectors / Stocks */}
      <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-base">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border-subtle bg-surface-elevated/40 text-text-muted">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Tên Nhóm / Mã</th>
              <th className="py-2.5 px-3 font-semibold text-right">RS-Ratio</th>
              <th className="py-2.5 px-3 font-semibold text-right">RS-Momentum</th>
              <th className="py-2.5 px-3 font-semibold text-right">Biến động 5 phiên</th>
              <th className="py-2.5 px-3 font-semibold">Góc phần tư</th>
              <th className="py-2.5 px-3 font-semibold text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredItems.map((item) => {
              const meta = QUADRANT_META[item.quadrant];
              return (
                <tr
                  key={item.id}
                  className={`hover:bg-surface-elevated/50 transition-colors ${
                    activeItem?.id === item.id ? "bg-surface-elevated/70" : ""
                  }`}
                  onClick={() => setActiveItem(item)}
                >
                  <td className="py-2 px-3 font-bold text-text-primary">
                    {item.name}{" "}
                    <span className="font-normal text-text-muted text-[11px]">({item.code})</span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-medium">
                    {item.currentRsRatio}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-medium">
                    {item.currentRsMomentum}
                  </td>
                  <td className={`py-2 px-3 text-right font-bold ${item.change5dPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {item.change5dPct >= 0 ? `+${item.change5dPct}%` : `${item.change5dPct}%`}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.bgClass} ${meta.textClass}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    {mode === "vn30" ? (
                      <Link
                        href={`/stocks/${item.code}`}
                        className="text-[11px] font-medium text-accent-primary hover:underline"
                      >
                        Phân tích ➔
                      </Link>
                    ) : (
                      <span className="text-[11px] text-text-muted">Theo dõi</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
