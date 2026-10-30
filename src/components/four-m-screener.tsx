"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import { FreshnessDot, Loading, Panel, Unavailable, ErrorState } from "@/components/ui";
import { Play } from "@/components/screener-icons";
import type { FourMScore } from "@/lib/engines/four-m";

type Data = {
  rows: FourMScore[];
  scanned: number;
  summary: {
    diamondCount: number;
    goldCount: number;
    silverCount: number;
    bronzeCount: number;
  };
};

function gradeColor(g: string): string {
  if (g === "Diamond") return "bg-sky-500/15 text-sky-400 border border-sky-500/30 font-bold";
  if (g === "Gold") return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 font-bold";
  if (g === "Silver") return "bg-slate-400/15 text-slate-300 border border-slate-400/30";
  return "bg-amber-700/15 text-amber-500 border border-amber-700/30";
}

function scoreBg(score: number): string {
  if (score >= 80) return "text-sky-400";
  if (score >= 65) return "text-yellow-400";
  if (score >= 50) return "text-slate-300";
  return "text-ink-3";
}

export function FourMScreener({ defaultSector }: { defaultSector: string | null }) {
  const [sector, setSector] = useState(defaultSector ?? "");
  const [grade, setGrade] = useState<string>("");
  const [minScore, setMinScore] = useState<number>(50);
  const [query, setQuery] = useState("/api/v1/screener/four-m?minScore=50");

  const { res, data, meta, isLoading, isValidating } = useApi<Data>(query, {
    refreshInterval: 120_000,
  });

  const run = useCallback(() => {
    const qs = new URLSearchParams();
    if (sector) qs.set("sector", sector);
    if (grade) qs.set("grade", grade);
    if (minScore) qs.set("minScore", String(minScore));
    setQuery(`/api/v1/screener/four-m?${qs.toString()}`);
  }, [sector, grade, minScore]);

  return (
    <div className="space-y-4">
      {/* Filter Header Panel */}
      <Panel
        title="Bộ lọc 4M Orca (Phil Town — Rule #1)"
        right={
          <div className="flex items-center gap-2">
            {isValidating && <span className="text-[10px] text-ink-3">Đang quét...</span>}
            <FreshnessDot status={meta?.freshness ?? "FRESH"} ageMs={meta?.ageMs} />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Sector Select */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Ngành nghề</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="select text-xs !py-1.5"
            >
              <option value="">Tất cả ngành</option>
              {Object.keys(VN_SECTOR_MAP).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Grade Select */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Xếp hạng 4M</span>
            <div className="flex items-center rounded-md bg-panel-3 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setGrade("")}
                className={`rounded px-2.5 py-1 transition-all ${!grade ? "bg-accent text-white font-medium" : "text-ink-3 hover:text-ink"}`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setGrade("diamond")}
                className={`rounded px-2.5 py-1 transition-all ${grade === "diamond" ? "bg-sky-500/25 text-sky-400 font-bold" : "text-ink-3 hover:text-ink"}`}
              >
                Kim cương
              </button>
              <button
                type="button"
                onClick={() => setGrade("gold")}
                className={`rounded px-2.5 py-1 transition-all ${grade === "gold" ? "bg-yellow-500/25 text-yellow-400 font-bold" : "text-ink-3 hover:text-ink"}`}
              >
                Vàng
              </button>
              <button
                type="button"
                onClick={() => setGrade("silver")}
                className={`rounded px-2.5 py-1 transition-all ${grade === "silver" ? "bg-slate-400/25 text-slate-300 font-bold" : "text-ink-3 hover:text-ink"}`}
              >
                Bạc
              </button>
            </div>
          </div>

          {/* Min Score Range */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
              Điểm 4M tối thiểu: <span className="text-accent font-bold">{minScore}</span>
            </span>
            <input
              type="range"
              min="30"
              max="85"
              step="5"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="accent-accent h-2 w-32 cursor-pointer"
            />
          </div>

          {/* Submit button */}
          <div className="flex items-end self-end">
            <button
              type="button"
              onClick={run}
              className="btn btn-primary flex items-center gap-1.5 !px-3.5 !py-1.5 text-xs font-semibold shadow-xs"
            >
              <Play className="size-3.5" /> Lọc 4M
            </button>
          </div>
        </div>

        {/* 4 Pillars explanation bar */}
        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-line text-[11px]">
          <div className="p-2 rounded bg-panel-2/50 border border-line/40">
            <span className="font-bold text-accent">1. Meaning (Hiểu)</span>
            <p className="text-[10px] text-ink-3 mt-0.5">Doanh nghiệp dễ hiểu, chu kỳ minh bạch.</p>
          </div>
          <div className="p-2 rounded bg-panel-2/50 border border-line/40">
            <span className="font-bold text-up">2. Moat (Con hào)</span>
            <p className="text-[10px] text-ink-3 mt-0.5">ROE ≥ 15%, Biên gộp cao, Doanh thu tăng.</p>
          </div>
          <div className="p-2 rounded bg-panel-2/50 border border-line/40">
            <span className="font-bold text-yellow-400">3. Management (Lãnh đạo)</span>
            <p className="text-[10px] text-ink-3 mt-0.5">Nợ D/E ≤ 1.0, ROIC cao, thanh toán tốt.</p>
          </div>
          <div className="p-2 rounded bg-panel-2/50 border border-line/40">
            <span className="font-bold text-purple-400">4. Margin of Safety (An toàn)</span>
            <p className="text-[10px] text-ink-3 mt-0.5">P/E, P/B chiết khấu hấp dẫn dưới giá trị thực.</p>
          </div>
        </div>
      </Panel>

      {/* Results Table Panel */}
      <Panel title="Danh sách Cổ phiếu đạt chuẩn 4M" pad={false}>
        {isLoading && !data ? (
          <div className="p-6">
            <Loading rows={8} />
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-3">
            Không tìm thấy cổ phiếu nào thỏa mãn đầy đủ các tiêu chí 4M đã chọn. Thử giảm điểm tối thiểu hoặc mở rộng ngành nghề.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line bg-panel-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
                  <th className="py-2.5 px-3">Mã CP</th>
                  <th className="py-2.5 px-3">Ngành</th>
                  <th className="py-2.5 px-3 text-right">Giá</th>
                  <th className="py-2.5 px-3 text-center">Xếp hạng</th>
                  <th className="py-2.5 px-3 text-center">Điểm 4M</th>
                  <th className="py-2.5 px-3 text-center">M1 · M2 · M3 · M4</th>
                  <th className="py-2.5 px-3 text-right">ROE</th>
                  <th className="py-2.5 px-3 text-right">Biên gộp</th>
                  <th className="py-2.5 px-3 text-right">Nợ D/E</th>
                  <th className="py-2.5 px-3 text-right">P/E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30 font-mono">
                {data.rows.map((r) => {
                  const pUp = (r.changePercent ?? 0) > 0;
                  const pDown = (r.changePercent ?? 0) < 0;
                  const pCls = pUp ? "text-up font-semibold" : pDown ? "text-down font-semibold" : "text-ink";

                  return (
                    <tr key={r.symbol} className="hover:bg-panel-2/50 transition-colors">
                      <td className="py-2.5 px-3 font-sans">
                        <Link
                          href={`/stocks/${r.symbol}`}
                          className="font-bold text-accent hover:underline flex items-center gap-1.5"
                        >
                          {r.symbol}
                          {r.name && (
                            <span className="text-[10px] text-ink-3 font-normal truncate max-w-[140px] hidden sm:inline">
                              {r.name}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-ink-2 text-[11px] truncate max-w-[120px]">
                        {r.sector || "—"}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${pCls}`}>
                        {r.price ? r.price.toLocaleString("vi-VN") : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${gradeColor(r.grade)}`}>
                          {r.gradeVi}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-sm font-bold ${scoreBg(r.totalScore)}`}>
                          {r.totalScore}
                        </span>
                        <span className="text-[9px] text-ink-3">/100</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        <div className="inline-flex items-center gap-1 text-[10px]">
                          <span className={`size-4 rounded-full flex items-center justify-center font-bold ${r.m1MeaningPass ? "bg-accent/20 text-accent" : "bg-panel-3 text-ink-3"}`} title={r.m1Note}>
                            M
                          </span>
                          <span className={`size-4 rounded-full flex items-center justify-center font-bold ${r.m2MoatPass ? "bg-up/20 text-up" : "bg-panel-3 text-ink-3"}`} title={r.m2Note}>
                            M
                          </span>
                          <span className={`size-4 rounded-full flex items-center justify-center font-bold ${r.m3ManagementPass ? "bg-yellow-500/20 text-yellow-400" : "bg-panel-3 text-ink-3"}`} title={r.m3Note}>
                            M
                          </span>
                          <span className={`size-4 rounded-full flex items-center justify-center font-bold ${r.m4MarginOfSafetyPass ? "bg-purple-500/20 text-purple-400" : "bg-panel-3 text-ink-3"}`} title={r.m4Note}>
                            M
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-up font-semibold">
                        {r.roe != null ? `${r.roe.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-ink-2">
                        {r.grossMargin != null ? `${r.grossMargin.toFixed(1)}%` : "—"}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r.debtEquity != null && r.debtEquity <= 1.0 ? "text-ink" : "text-warn"}`}>
                        {r.debtEquity != null ? r.debtEquity.toFixed(2) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-accent font-medium">
                        {r.pe != null ? r.pe.toFixed(1) : "—"}
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
