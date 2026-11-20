"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useApi } from "@/lib/hooks";
import { FreshnessDot, Loading, Panel } from "@/components/ui";
import type { SectorFlowItem } from "@/app/api/v1/screener/sector-flow/route";
import type { InvestmentHorizon, HorizonFlowSignal } from "@/lib/engines/sector-horizon-flow-engine";

type Data = {
  sectors: SectorFlowItem[];
  totalMarketTurnoverBillion: number;
  horizonLeaders?: Record<InvestmentHorizon, string[]>;
  activeHorizon?: InvestmentHorizon | "COMPOSITE";
  timestamp: number;
};

type HorizonTabId = "COMPOSITE" | InvestmentHorizon;

const HORIZON_TABS: Array<{
  id: HorizonTabId;
  label: string;
  shortLabel: string;
  desc: string;
}> = [
  {
    id: "COMPOSITE",
    label: "Tổng hợp Đa Khung",
    shortLabel: "Tổng hợp",
    desc: "Kết hợp trọng số động lượng dòng tiền Ngắn hạn (28%) + Trung hạn (28%) + Trung-Dài hạn (24%) + Dài hạn (20%).",
  },
  {
    id: "SHORT_1_2W",
    label: "Ngắn hạn (1–2 Tuần)",
    shortLabel: "1–2 Tuần",
    desc: "Đo đột biến thanh khoản (VolRatio20), Pocket Pivot / Liquidity Sweep, nổ TTM Squeeze, hồi quy OU (t½ <= 15P) & dòng tiền chủ động T+.",
  },
  {
    id: "MEDIUM_3W_2M",
    label: "Trung hạn (3 Tuần–2 Tháng)",
    shortLabel: "3T–2 Tháng",
    desc: "Đo quỹ đạo RRG (Improving -> Leading), tỷ lệ tích lũy Up/Down Vol 50P, nền nén VCP/VDU/Wyckoff LPS & Điểm uốn tăng trưởng quý.",
  },
  {
    id: "MED_LONG_2_6M",
    label: "Trung–Dài hạn (2–6 Tháng)",
    shortLabel: "2–6 Tháng",
    desc: "Đo cấu trúc Stage 2 (MA20 > MA50), RS O'Neil 1–2 quý (RS >= 75) & biên an toàn định giá ngành (RNAV, Gordon P/B, Reverse DCF).",
  },
  {
    id: "LONG_6M_PLUS",
    label: "Dài hạn (> 6 Tháng)",
    shortLabel: "> 6 Tháng",
    desc: "Đo con hào kinh tế (ROIC >= 15%, ROIIC 3Y >= 20%), tiền thật (CFO/LNST >= 1.0, Sloan <= 5%), Pháo đài tài chính & Cổ tức tiền mặt.",
  },
];

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

function horizonScoreBadge(score: number): string {
  if (score >= 76) return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold";
  if (score >= 62) return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold";
  if (score >= 45) return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
  return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
}

function signalBadge(sig?: HorizonFlowSignal): string {
  switch (sig) {
    case "STRONG_INFLOW":
      return "text-emerald-400 font-bold";
    case "ACCUMULATION":
      return "text-cyan-400 font-semibold";
    case "DISTRIBUTION":
      return "text-amber-400";
    case "OUTFLOW":
      return "text-rose-400";
    default:
      return "text-ink-3";
  }
}

function getActiveScore(sec: SectorFlowItem, tab: HorizonTabId): number {
  if (!sec.horizonScores) return 50;
  if (tab === "SHORT_1_2W") return sec.horizonScores.short1_2w;
  if (tab === "MEDIUM_3W_2M") return sec.horizonScores.medium3w_2m;
  if (tab === "MED_LONG_2_6M") return sec.horizonScores.medLong2_6m;
  if (tab === "LONG_6M_PLUS") return sec.horizonScores.long6mPlus;
  return sec.horizonScores.compositeFlowScore;
}

export function SectorFlowScreener() {
  const [horizonTab, setHorizonTab] = useState<HorizonTabId>("COMPOSITE");
  const [filterQuadrant, setFilterQuadrant] = useState<string>("");
  const { data, meta, isLoading, isValidating } = useApi<Data>(
    `/api/v1/screener/sector-flow?horizon=${horizonTab}`,
    { refreshInterval: 60_000, keepPreviousData: true },
  );

  const sectors = useMemo(() => {
    const raw = data?.sectors ?? [];
    return [...raw].sort((a, b) => getActiveScore(b, horizonTab) - getActiveScore(a, horizonTab));
  }, [data?.sectors, horizonTab]);

  const filtered = useMemo(() => {
    return filterQuadrant ? sectors.filter((s) => s.quadrant === filterQuadrant) : sectors;
  }, [sectors, filterQuadrant]);

  const topSectors = sectors.slice(0, 8);
  const maxScore = Math.max(...sectors.map((s) => getActiveScore(s, horizonTab)), 1);
  const activeTabMeta = HORIZON_TABS.find((t) => t.id === horizonTab) ?? HORIZON_TABS[0]!;

  return (
    <div className="space-y-4">
      {/* 4-Horizon Selector Bar */}
      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {HORIZON_TABS.map((t) => {
              const active = horizonTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setHorizonTab(t.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "bg-accent text-white shadow-xs"
                      : "bg-panel-2 text-ink-3 hover:text-ink hover:bg-panel-3"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-3">
            {isValidating && <span>Đang đồng bộ...</span>}
            <FreshnessDot status={meta?.freshness ?? "FRESH"} ageMs={meta?.ageMs} />
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-3">{activeTabMeta.desc}</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
            Ngành Dẫn Sóng ({activeTabMeta.shortLabel})
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-up truncate">
              {sectors[0] ? sectors[0].sector : "—"}
            </span>
            <span className="num text-xs text-emerald-400 font-bold">
              {sectors[0] ? `${getActiveScore(sectors[0], horizonTab)}/99đ` : "—"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Ngành Tiền Vào / Gom Tích Lũy
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-2xl font-bold text-accent">
              {sectors.filter((s) => getActiveScore(s, horizonTab) >= 62).length}
            </span>
            <span className="text-xs text-ink-3">/ {sectors.length} ngành</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            Số ngành RRG Leading / Improving
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-2xl font-bold text-emerald-400">
              {sectors.filter((s) => s.quadrant === "Leading" || s.quadrant === "Improving").length}
            </span>
            <span className="text-xs text-ink-3">/ {sectors.length} ngành</span>
          </div>
        </div>
      </div>

      {/* Visual Flow Distribution (Top Sectors for Active Horizon) */}
      <Panel
        title={`Bản đồ Xếp hạng Dòng tiền Ngành — ${activeTabMeta.label}`}
        right={
          <span className="text-[11px] text-ink-3">
            Điểm chuẩn hóa 1–99 (Thanh khoản + Độ rộng + RRG + Định giá FA)
          </span>
        }
      >
        <div className="space-y-2.5">
          {topSectors.map((sec) => {
            const activeScore = getActiveScore(sec, horizonTab);
            const barW = Math.min(100, (activeScore / maxScore) * 100);
            const isUp = sec.avgChangePercent >= 0;
            const activePicks =
              horizonTab !== "COMPOSITE" && sec.topPicksByHorizon?.[horizonTab]?.length
                ? sec.topPicksByHorizon[horizonTab]
                : sec.topPicksByHorizon?.[sec.bestHorizon] ?? (sec.topStock ? [sec.topStock] : []);

            return (
              <div key={sec.sector} className="group relative flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink group-hover:text-accent transition-colors">
                      {sec.sector}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${horizonScoreBadge(activeScore)}`}>
                      {activeScore}đ
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] ${quadrantBadge(sec.quadrant)}`}>
                      {sec.quadrantVi}
                    </span>
                    {sec.rotationPhaseVi && (
                      <span className="hidden md:inline-block rounded bg-panel-3 px-2 py-0.5 text-[10px] text-ink-2">
                        {sec.rotationPhaseVi}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    {activePicks.length > 0 && (
                      <span className="hidden sm:inline text-ink-3 font-sans">
                        Top:{" "}
                        {activePicks.slice(0, 3).map((p, idx) => (
                          <Link
                            key={p.symbol}
                            href={`/stocks/${p.symbol}`}
                            className="font-bold text-accent hover:underline mr-1.5"
                          >
                            {p.symbol}
                            {idx < Math.min(2, activePicks.length - 1) ? "," : ""}
                          </Link>
                        ))}
                      </span>
                    )}
                    <span className="text-ink-3">
                      {sec.totalTurnoverBillion.toLocaleString("vi-VN")} Tỷ ({sec.turnoverSharePct}%)
                    </span>
                    <span className={`font-bold ${isUp ? "text-up" : "text-down"}`}>
                      {isUp ? "+" : ""}
                      {sec.avgChangePercent}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-panel-3">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      activeScore >= 75
                        ? "bg-emerald-400"
                        : activeScore >= 62
                          ? "bg-cyan-400"
                          : activeScore >= 48
                            ? "bg-amber-400"
                            : "bg-rose-500/80"
                    }`}
                    style={{ width: `${barW}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Detailed Multi-Horizon Table Panel */}
      <Panel
        title="Ma trận Dòng tiền Ngành Đa Khung Thời Gian (1–2 Tuần · 3T–2 Tháng · 2–6 Tháng · > 6 Tháng)"
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
                  <th className="py-2.5 px-3">Ngành nghề & Pha sóng</th>
                  <th className="py-2.5 px-2.5 text-center">Ngắn hạn (1–2T)</th>
                  <th className="py-2.5 px-2.5 text-center">Trung hạn (3T–2Th)</th>
                  <th className="py-2.5 px-2.5 text-center">Trung–Dài (2–6Th)</th>
                  <th className="py-2.5 px-2.5 text-center">Dài hạn (&gt;6Th)</th>
                  <th className="py-2.5 px-2.5 text-right">GTGD (Tỷ)</th>
                  <th className="py-2.5 px-2.5 text-right">Biến động</th>
                  <th className="py-2.5 px-2.5 text-center">Độ rộng</th>
                  <th className="py-2.5 px-2.5 text-center">RRG (RS / Mom)</th>
                  <th className="py-2.5 px-3">Cổ phiếu Tiêu điểm ({activeTabMeta.shortLabel})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30 font-mono">
                {filtered.map((sec) => {
                  const isUp = sec.avgChangePercent >= 0;
                  const hs = sec.horizonScores;
                  const hSig = sec.horizonSignals;
                  const picks =
                    horizonTab !== "COMPOSITE" && sec.topPicksByHorizon?.[horizonTab]?.length
                      ? sec.topPicksByHorizon[horizonTab]
                      : sec.topPicksByHorizon?.[sec.bestHorizon] ?? (sec.topStock ? [sec.topStock] : []);

                  return (
                    <tr key={sec.sector} className="hover:bg-panel-2/50 transition-colors">
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-semibold text-ink">{sec.sector}</div>
                        <div className="mt-0.5 text-[10px] text-ink-3">
                          {sec.rotationPhaseVi || sec.bestHorizonVi}
                        </div>
                      </td>

                      {/* 1-2 Weeks */}
                      <td className="py-2.5 px-2.5 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${horizonScoreBadge(hs?.short1_2w ?? 50)}`}>
                          {hs?.short1_2w ?? 50}đ
                        </span>
                        <div className={`mt-0.5 font-sans text-[9px] ${signalBadge(hSig?.short1_2w)}`}>
                          {hSig?.short1_2wVi ?? "Cân bằng"}
                        </div>
                      </td>

                      {/* 3 Weeks - 2 Months */}
                      <td className="py-2.5 px-2.5 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${horizonScoreBadge(hs?.medium3w_2m ?? 50)}`}>
                          {hs?.medium3w_2m ?? 50}đ
                        </span>
                        <div className={`mt-0.5 font-sans text-[9px] ${signalBadge(hSig?.medium3w_2m)}`}>
                          {hSig?.medium3w_2mVi ?? "Cân bằng"}
                        </div>
                      </td>

                      {/* 2 - 6 Months */}
                      <td className="py-2.5 px-2.5 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${horizonScoreBadge(hs?.medLong2_6m ?? 50)}`}>
                          {hs?.medLong2_6m ?? 50}đ
                        </span>
                        <div className={`mt-0.5 font-sans text-[9px] ${signalBadge(hSig?.medLong2_6m)}`}>
                          {hSig?.medLong2_6mVi ?? "Cân bằng"}
                        </div>
                      </td>

                      {/* > 6 Months */}
                      <td className="py-2.5 px-2.5 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] ${horizonScoreBadge(hs?.long6mPlus ?? 50)}`}>
                          {hs?.long6mPlus ?? 50}đ
                        </span>
                        <div className={`mt-0.5 font-sans text-[9px] ${signalBadge(hSig?.long6mPlus)}`}>
                          {hSig?.long6mPlusVi ?? "Cân bằng"}
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 text-right text-ink">
                        <div className="font-bold">{sec.totalTurnoverBillion.toLocaleString("vi-VN")}</div>
                        <div className="text-[10px] text-accent">{sec.turnoverSharePct}%</div>
                      </td>

                      <td className={`py-2.5 px-2.5 text-right font-bold ${isUp ? "text-up" : "text-down"}`}>
                        {isUp ? "+" : ""}
                        {sec.avgChangePercent}%
                      </td>

                      <td className="py-2.5 px-2.5 text-center font-sans text-[11px]">
                        <span className="text-up font-medium">{sec.gainersCount}</span>
                        <span className="text-ink-3 mx-0.5">/</span>
                        <span className="text-down font-medium">{sec.losersCount}</span>
                        <div className="text-[9px] text-ink-3">({sec.breadthRatioPct ?? 50}% xanh)</div>
                      </td>

                      <td className="py-2.5 px-2.5 text-center font-sans">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${quadrantBadge(sec.quadrant)}`}>
                          {sec.quadrantVi}
                        </span>
                        {sec.rsRatio != null && (
                          <div className="mt-0.5 font-mono text-[9px] text-ink-3">
                            {sec.rsRatio} / {sec.rsMomentum}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-sans">
                        {picks.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {picks.slice(0, 3).map((p) => (
                                <Link
                                  key={p.symbol}
                                  href={`/stocks/${p.symbol}`}
                                  className="inline-flex items-center gap-1 rounded bg-panel-3 px-1.5 py-0.5 font-bold text-accent hover:underline"
                                >
                                  <span>{p.symbol}</span>
                                  <span className={`text-[10px] font-mono ${p.changePercent >= 0 ? "text-up" : "text-down"}`}>
                                    {p.changePercent >= 0 ? "+" : ""}
                                    {p.changePercent}%
                                  </span>
                                </Link>
                              ))}
                            </div>
                            {picks[0]?.reasonVi && (
                              <div className="text-[10px] text-ink-3 truncate max-w-[240px]">
                                {picks[0].reasonVi}
                              </div>
                            )}
                          </div>
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
