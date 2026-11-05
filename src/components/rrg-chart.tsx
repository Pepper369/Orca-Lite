"use client";

import { useState, useMemo, memo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/hooks";
import type { RrgResult, RrgItem, RrgQuadrant } from "@/lib/engines/rrg-engine";
import { Loading } from "@/components/ui";
import {
  Compass,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Sparkles,
} from "lucide-react";

const QUADRANT_META: Record<
  RrgQuadrant,
  { label: string; desc: string; action: string; bgClass: string; borderClass: string; textClass: string; color: string }
> = {
  LEADING: {
    label: "Dẫn dắt (Leading)",
    desc: "RS > 100 & Momentum > 100: Mạnh hơn VN-Index và đang gia tốc tăng.",
    action: "Tập trung giải ngân - Canh nhịp chỉnh để gom hàng dẫn sóng.",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-500/30",
    textClass: "text-emerald-400",
    color: "#10b981",
  },
  WEAKENING: {
    label: "Suy yếu (Weakening)",
    desc: "RS > 100 & Momentum < 100: Vẫn khỏe hơn thị trường nhưng đà tăng đang chậm lại.",
    action: "Chốt lời từng phần - Hạn chế mua mới, nâng mức trailing stop.",
    bgClass: "bg-cyan-500/10",
    borderClass: "border-cyan-500/30",
    textClass: "text-cyan-400",
    color: "#06b6d4",
  },
  LAGGING: {
    label: "Tụt hậu (Lagging)",
    desc: "RS < 100 & Momentum < 100: Yếu hơn VN-Index và đà giảm đang tiếp diễn.",
    action: "Đứng ngoài quan sát - Tuyệt đối không bắt đáy sớm.",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/30",
    textClass: "text-rose-400",
    color: "#f43f5e",
  },
  IMPROVING: {
    label: "Cải thiện (Improving)",
    desc: "RS < 100 & Momentum > 100: Đang tạo đáy phục hồi, động lượng tăng mạnh.",
    action: "Đón đầu chân sóng phục hồi trước khi cổ phiếu tăng trần.",
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

    const spanX = Math.max(Math.abs(xMin - 100), Math.abs(xMax - 100)) + 0.8;
    const spanY = Math.max(Math.abs(yMin - 100), Math.abs(yMax - 100)) + 0.8;

    return {
      minX: 100 - spanX,
      maxX: 100 + spanX,
      minY: 100 - spanY,
      maxY: 100 + spanY,
    };
  }, [items]);

  const width = 800;
  const height = 560;
  const padding = 50;

  const scaleX = (val: number) => {
    return padding + ((val - minX) / (maxX - minX)) * (width - 2 * padding);
  };

  const scaleY = (val: number) => {
    return height - padding - ((val - minY) / (maxY - minY)) * (height - 2 * padding);
  };

  const centerX = scaleX(100);
  const centerY = scaleY(100);

  if (isLoading && !rrg) {
    return (
      <div className="rounded-2xl border border-line bg-panel-1 p-8 text-center">
        <Loading />
        <p className="mt-3 text-xs text-ink-3">Đang tính toán ma trận RRG và chuỗi xoay vòng dòng tiền...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="size-5 text-accent" />
            <h2 className="text-base font-bold text-ink">
              Biểu Đồ Xoay Vòng Ngành RRG (Relative Rotation Graph)
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">
            Đo lường sức mạnh tương đối (RS-Ratio) và gia tốc dòng tiền (RS-Momentum) so với chỉ số chuẩn VN-Index.
          </p>
        </div>

        {/* Mode Toggle & Trail Slider */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-panel-2 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("sectors")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                mode === "sectors" ? "bg-accent text-white font-bold" : "text-ink-3 hover:text-ink"
              }`}
            >
              18 Nhóm Ngành
            </button>
            <button
              type="button"
              onClick={() => setMode("vn30")}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                mode === "vn30" ? "bg-accent text-white font-bold" : "text-ink-3 hover:text-ink"
              }`}
            >
              Cổ Phiếu VN30
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2.5 py-1 text-xs text-ink-3">
            <span>Độ dài đuôi:</span>
            <select
              value={trailLength}
              onChange={(e) => setTrailLength(Number(e.target.value))}
              className="bg-transparent font-semibold text-ink focus:outline-none"
            >
              <option value={3} className="bg-panel-1 text-ink">3 phiên</option>
              <option value={5} className="bg-panel-1 text-ink">5 phiên</option>
              <option value={7} className="bg-panel-1 text-ink">7 phiên</option>
              <option value={10} className="bg-panel-1 text-ink">10 phiên</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => mutate()}
            className="rounded-lg border border-line p-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink transition-colors"
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
                isSelected ? "ring-2 ring-accent border-transparent" : meta.borderClass
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${meta.textClass}`}>{meta.label}</span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-panel-1 text-ink">
                  {count} {mode === "sectors" ? "ngành" : "mã"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-ink-3 line-clamp-1">{meta.desc}</p>
              <p className="mt-1 text-[10px] text-accent font-medium line-clamp-1">💡 {meta.action}</p>
            </button>
          );
        })}
      </div>

      {/* Main RRG SVG Visualization Canvas */}
      <div className="relative rounded-2xl border border-line bg-panel-1 p-2 overflow-hidden shadow-xl">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          style={{ maxHeight: "600px" }}
        >
          {/* Quadrant Background Tints */}
          {/* 1. TOP-RIGHT: LEADING */}
          <rect
            x={centerX}
            y={padding}
            width={width - padding - centerX}
            height={centerY - padding}
            fill="#10b981"
            fillOpacity="0.06"
          />

          {/* 2. TOP-LEFT: IMPROVING */}
          <rect
            x={padding}
            y={padding}
            width={centerX - padding}
            height={centerY - padding}
            fill="#f59e0b"
            fillOpacity="0.06"
          />

          {/* 3. BOTTOM-LEFT: LAGGING */}
          <rect
            x={padding}
            y={centerY}
            width={centerX - padding}
            height={height - padding - centerY}
            fill="#f43f5e"
            fillOpacity="0.06"
          />

          {/* 4. BOTTOM-RIGHT: WEAKENING */}
          <rect
            x={centerX}
            y={centerY}
            width={width - padding - centerX}
            height={height - padding - centerY}
            fill="#06b6d4"
            fillOpacity="0.06"
          />

          {/* Grid Lines */}
          <line
            x1={padding}
            y1={centerY}
            x2={width - padding}
            y2={centerY}
            stroke="currentColor"
            className="text-line stroke-dashed"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1={centerX}
            y1={padding}
            x2={centerX}
            y2={height - padding}
            stroke="currentColor"
            className="text-line stroke-dashed"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Quadrant Watermark Titles */}
          <text
            x={width - padding - 15}
            y={padding + 25}
            textAnchor="end"
            className="fill-emerald-400 font-extrabold text-[13px] tracking-wider opacity-70"
          >
            ↗ DẪN DẮT (LEADING)
          </text>
          <text
            x={padding + 15}
            y={padding + 25}
            textAnchor="start"
            className="fill-amber-400 font-extrabold text-[13px] tracking-wider opacity-70"
          >
            ↖ CẢI THIỆN (IMPROVING)
          </text>
          <text
            x={padding + 15}
            y={height - padding - 15}
            textAnchor="start"
            className="fill-rose-400 font-extrabold text-[13px] tracking-wider opacity-70"
          >
            ↙ TỤT HẬU (LAGGING)
          </text>
          <text
            x={width - padding - 15}
            y={height - padding - 15}
            textAnchor="end"
            className="fill-cyan-400 font-extrabold text-[13px] tracking-wider opacity-70"
          >
            ↘ SUY YẾU (WEAKENING)
          </text>

          {/* Axis Labels */}
          <text
            x={width / 2}
            y={height - 15}
            textAnchor="middle"
            className="fill-ink-3 text-[11px] font-semibold tracking-wide"
          >
            Sức Mạnh Giá Tương Đối (RS-Ratio so với VN-Index)
          </text>
          <text
            x={15}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90 15 ${height / 2})`}
            className="fill-ink-3 text-[11px] font-semibold tracking-wide"
          >
            Gia Tốc Động Lượng (RS-Momentum)
          </text>

          {/* Center Benchmark Point */}
          <circle cx={centerX} cy={centerY} r={5} fill="#6366f1" />
          <text
            x={centerX + 8}
            y={centerY - 8}
            className="fill-indigo-400 font-bold text-[11px]"
          >
            VN-INDEX (100, 100)
          </text>

          {/* Draw Trails & Nodes */}
          {filteredItems.map((item) => {
            const isHovered = hoveredItem?.id === item.id;
            const isSelected = activeItem?.id === item.id;
            const meta = QUADRANT_META[item.quadrant];

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
                  strokeWidth={isHovered || isSelected ? 3.5 : 2}
                  strokeOpacity={isHovered || isSelected ? 0.9 : 0.4}
                />

                {/* Trail Dots */}
                {trailCoords.slice(0, -1).map((pt, pIdx) => (
                  <circle
                    key={pIdx}
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 2.5 : 1.5}
                    fill={meta.color}
                    fillOpacity={0.5}
                  />
                ))}

                {/* Current Leading Head Point */}
                <circle
                  cx={currentPoint.x}
                  cy={currentPoint.y}
                  r={isHovered || isSelected ? 7 : 4.5}
                  fill={meta.color}
                  stroke="#ffffff"
                  strokeWidth={isHovered || isSelected ? 2 : 1}
                  className="transition-all"
                />

                {/* Label text */}
                <text
                  x={currentPoint.x + 8}
                  y={currentPoint.y + 4}
                  className={`text-[10px] font-bold transition-all ${
                    isHovered || isSelected ? "fill-ink font-extrabold text-[12px]" : "fill-ink-2"
                  }`}
                  style={{
                    textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                  }}
                >
                  {item.code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover / Active Detail Tooltip */}
        {(hoveredItem || activeItem) && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 rounded-xl border border-line bg-panel-1/95 p-3.5 shadow-2xl backdrop-blur-md text-xs space-y-2">
            {(() => {
              const item = hoveredItem || activeItem;
              if (!item) return null;
              const meta = QUADRANT_META[item.quadrant];

              return (
                <>
                  <div className="flex items-center justify-between border-b border-line pb-1.5">
                    <span className="font-bold text-ink text-sm">{item.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.bgClass} ${meta.textClass}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-ink-3 font-mono">
                    <div>
                      <span>RS-Ratio:</span>{" "}
                      <span className="font-bold text-ink">{item.currentRsRatio}</span>
                    </div>
                    <div>
                      <span>RS-Momentum:</span>{" "}
                      <span className="font-bold text-ink">{item.currentRsMomentum}</span>
                    </div>
                    <div>
                      <span>Đà tăng 5 phiên:</span>{" "}
                      <span className={`font-bold ${item.change5dPct >= 0 ? "text-up" : "text-down"}`}>
                        {item.change5dPct >= 0 ? `+${item.change5dPct}%` : `${item.change5dPct}%`}
                      </span>
                    </div>
                    <div>
                      <span>Vị thế:</span>{" "}
                      <span className="font-semibold text-ink">
                        {item.currentRsRatio >= 100 ? "Outperform" : "Underperform"}
                      </span>
                    </div>
                  </div>
                  <div className="text-[11px] bg-panel-2 p-1.5 rounded border border-line">
                    <span className="text-accent font-semibold">Khuyến nghị: </span>
                    <span className="text-ink">{meta.action}</span>
                  </div>
                  {mode === "vn30" && (
                    <div className="pt-1 border-t border-line">
                      <Link
                        href={`/stocks/${item.code}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
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
      <div className="overflow-x-auto rounded-xl border border-line bg-panel-1">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-panel-2 text-ink-3">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Tên Nhóm / Mã</th>
              <th className="py-2.5 px-3 font-semibold text-right">RS-Ratio</th>
              <th className="py-2.5 px-3 font-semibold text-right">RS-Momentum</th>
              <th className="py-2.5 px-3 font-semibold text-right">Biến Động 5 Phiên</th>
              <th className="py-2.5 px-3 font-semibold">Góc Phần Tư RRG</th>
              <th className="py-2.5 px-3 font-semibold text-right">Hành Động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/30">
            {filteredItems.map((item) => {
              const meta = QUADRANT_META[item.quadrant];
              return (
                <tr
                  key={item.id}
                  className={`hover:bg-panel-2 transition-colors ${
                    activeItem?.id === item.id ? "bg-panel-2" : ""
                  }`}
                  onClick={() => setActiveItem(item)}
                >
                  <td className="py-2 px-3 font-bold text-ink">
                    {item.name}{" "}
                    <span className="font-normal text-ink-3 text-[11px]">({item.code})</span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-medium">
                    {item.currentRsRatio}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-medium">
                    {item.currentRsMomentum}
                  </td>
                  <td className={`py-2 px-3 text-right font-bold ${item.change5dPct >= 0 ? "text-up" : "text-down"}`}>
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
                        className="text-[11px] font-medium text-accent hover:underline"
                      >
                        Phân tích
                      </Link>
                    ) : (
                      <span className="text-[11px] text-ink-3">Theo dõi</span>
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
