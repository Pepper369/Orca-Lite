"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { FreshnessDot, Loading, Panel } from "@/components/ui";
import type { SectorFlowItem } from "@/app/api/v1/screener/sector-flow/route";

type Data = {
  sectors: SectorFlowItem[];
  totalMarketTurnoverBillion: number;
  timestamp: number;
};

function quadrantBadge(q: SectorFlowItem["quadrant"]): string {
  switch (q) {
    case "Leading":
      return "bg-up/15 text-up border border-up/30 font-bold";
    case "Improving":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-medium";
    case "Weakening":
      return "bg-amber-600/15 text-amber-500 border border-amber-600/30 font-medium";
    case "Lagging":
      return "bg-down/15 text-down border border-down/30";
  }
}

export function SectorFlowScreener() {
  const [filterQuadrant, setFilterQuadrant] = useState<string>("");
  const { res, data, meta, isLoading, isValidating } = useApi<Data>(
    "/api/v1/screener/sector-flow",
    { refreshInterval: 60_000 }
  );

  const sectors = data?.sectors ?? [];
  const filtered = filterQuadrant
    ? sectors.filter((s) => s.quadrant === filterQuadrant)
    : sectors;

  const topSectors = sectors.slice(0, 8);
  const maxShare = Math.max(...sectors.map((s) => s.turnoverSharePct), 1);

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-panel p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Tổng thanh khoản thị trường
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-2xl font-bold text-ink">
              {data ? data.totalMarketTurnoverBillion.toLocaleString("vi-VN") : "—"}
            </span>
            <span className="text-xs text-ink-3">Tỷ VNĐ</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Ngành hút tiền mạnh nhất
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-up truncate">
              {sectors[0] ? sectors[0].sector : "—"}
            </span>
            <span className="num text-xs text-ink-3">
              ({sectors[0] ? `${sectors[0].turnoverSharePct}%` : "—"})
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Số ngành Dẫn dắt dòng tiền
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-2xl font-bold text-accent">
              {sectors.filter((s) => s.quadrant === "Leading").length}
            </span>
            <span className="text-xs text-ink-3">/ {sectors.length} ngành</span>
          </div>
        </div>
      </div>

      {/* Visual Flow Distribution (Top Sectors) */}
      <Panel
        title="Bản đồ phân bổ dòng tiền ngành (Sector Rotation)"
        right={
          <div className="flex items-center gap-2">
            {isValidating && <span className="text-[10px] text-ink-3">Đang cập nhật...</span>}
            <FreshnessDot status={meta?.freshness ?? "FRESH"} ageMs={meta?.ageMs} />
          </div>
        }
      >
        <div className="space-y-2">
          {topSectors.map((sec) => {
            const barW = Math.min(100, (sec.turnoverSharePct / maxShare) * 100);
            const isUp = sec.avgChangePercent >= 0;

            return (
              <div key={sec.sector} className="group relative flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink group-hover:text-accent transition-colors">
                      {sec.sector}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] ${quadrantBadge(sec.quadrant)}`}>
                      {sec.quadrantVi}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-ink-3">{sec.totalTurnoverBillion.toLocaleString("vi-VN")} Tỷ ({sec.turnoverSharePct}%)</span>
                    <span className={`font-bold ${isUp ? "text-up" : "text-down"}`}>
                      {isUp ? "+" : ""}{sec.avgChangePercent}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-panel-3">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      sec.quadrant === "Leading"
                        ? "bg-up"
                        : sec.quadrant === "Improving"
                        ? "bg-yellow-400"
                        : sec.quadrant === "Weakening"
                        ? "bg-amber-500"
                        : "bg-down/80"
                    }`}
                    style={{ width: `${barW}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Detailed Table Panel with Quadrant Filters */}
      <Panel
        title="Bảng phân tích Dòng tiền chi tiết"
        right={
          <div className="flex items-center rounded-md bg-panel-3 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFilterQuadrant("")}
              className={`rounded px-2 py-0.5 transition-all ${!filterQuadrant ? "bg-accent text-white font-medium" : "text-ink-3 hover:text-ink"}`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setFilterQuadrant("Leading")}
              className={`rounded px-2 py-0.5 transition-all ${filterQuadrant === "Leading" ? "bg-up/25 text-up font-bold" : "text-ink-3 hover:text-ink"}`}
            >
              Dẫn dắt
            </button>
            <button
              type="button"
              onClick={() => setFilterQuadrant("Improving")}
              className={`rounded px-2 py-0.5 transition-all ${filterQuadrant === "Improving" ? "bg-yellow-500/25 text-yellow-400 font-bold" : "text-ink-3 hover:text-ink"}`}
            >
              Cải thiện
            </button>
            <button
              type="button"
              onClick={() => setFilterQuadrant("Weakening")}
              className={`rounded px-2 py-0.5 transition-all ${filterQuadrant === "Weakening" ? "bg-amber-600/25 text-amber-500 font-bold" : "text-ink-3 hover:text-ink"}`}
            >
              Suy yếu
            </button>
            <button
              type="button"
              onClick={() => setFilterQuadrant("Lagging")}
              className={`rounded px-2 py-0.5 transition-all ${filterQuadrant === "Lagging" ? "bg-down/25 text-down font-bold" : "text-ink-3 hover:text-ink"}`}
            >
              Tụt hậu
            </button>
          </div>
        }
        pad={false}
      >
        {isLoading && !data ? (
          <div className="p-6">
            <Loading rows={8} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-3">
            Không có ngành nào trong nhóm đã chọn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line bg-panel-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                  <th className="py-2.5 px-3">Ngành nghề</th>
                  <th className="py-2.5 px-3 text-right">Giá trị (Tỷ VNĐ)</th>
                  <th className="py-2.5 px-3 text-right">Tỷ trọng</th>
                  <th className="py-2.5 px-3 text-right">Biến động TB</th>
                  <th className="py-2.5 px-3 text-center">Độ rộng (Tăng/Giảm)</th>
                  <th className="py-2.5 px-3 text-center">Trạng thái RRG</th>
                  <th className="py-2.5 px-3">Cổ phiếu dẫn sóng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30 font-mono">
                {filtered.map((sec) => {
                  const isUp = sec.avgChangePercent >= 0;

                  return (
                    <tr key={sec.sector} className="hover:bg-panel-2/50 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-semibold text-ink">
                        {sec.sector}
                      </td>
                      <td className="py-2.5 px-3 text-right text-ink font-bold">
                        {sec.totalTurnoverBillion.toLocaleString("vi-VN")}
                      </td>
                      <td className="py-2.5 px-3 text-right text-accent font-semibold">
                        {sec.turnoverSharePct}%
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${isUp ? "text-up" : "text-down"}`}>
                        {isUp ? "+" : ""}{sec.avgChangePercent}%
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans text-[11px]">
                        <span className="text-up font-medium">{sec.gainersCount} xanh</span>
                        <span className="text-ink-3 mx-1">/</span>
                        <span className="text-down font-medium">{sec.losersCount} đỏ</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${quadrantBadge(sec.quadrant)}`}>
                          {sec.quadrantVi}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        {sec.topStock ? (
                          <Link
                            href={`/stocks/${sec.topStock.symbol}`}
                            className="inline-flex items-center gap-1.5 font-bold text-accent hover:underline"
                          >
                            <span>{sec.topStock.symbol}</span>
                            <span className={`text-[10px] font-mono ${sec.topStock.changePercent >= 0 ? "text-up" : "text-down"}`}>
                              ({sec.topStock.changePercent >= 0 ? "+" : ""}{sec.topStock.changePercent}%)
                            </span>
                          </Link>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
