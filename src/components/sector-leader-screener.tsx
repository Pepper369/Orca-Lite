"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { FreshnessDot, Loading } from "@/components/ui";
import type { ScreenerStockItem, ScreenerResponseData } from "@/lib/services/screener-snapshot-service";
import type {
  InvestmentHorizon,
  HorizonFlowSignal,
  SectorInstitutionalRegime,
} from "@/lib/engines/sector-horizon-flow-engine";

type HorizonFilter = "COMPOSITE" | InvestmentHorizon;

const HORIZON_OPTIONS: Array<{ id: HorizonFilter; label: string; sortField: string }> = [
  { id: "COMPOSITE", label: "Đa Khung Tổng Hợp", sortField: "sectorFlowScore" },
  { id: "SHORT_1_2W", label: "Ngắn hạn (1–2 Tuần)", sortField: "horizonShortScore" },
  { id: "MEDIUM_3W_2M", label: "Trung hạn (3T–2 Tháng)", sortField: "horizonMediumScore" },
  { id: "MED_LONG_2_6M", label: "Trung–Dài hạn (2–6 Tháng)", sortField: "horizonMedLongScore" },
  { id: "LONG_6M_PLUS", label: "Dài hạn (> 6 Tháng)", sortField: "horizonLongScore" },
];

const REGIME_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "Tất cả chế độ dòng tiền" },
  { id: "INFLOW_ACTIVE", label: "🔥 Ngành đang hút dòng tiền (Mạnh + Gom)" },
  { id: "DUAL_INFLOW", label: "💎 Nội & Ngoại đồng thuận bơm tiền" },
  { id: "SECTOR_VOLUME_IGNITION", label: "🚀 Nổ thanh khoản kích hoạt sóng ngành" },
  { id: "DOMESTIC_SMART_MONEY_LEAD", label: "🦈 Cá mập & Tổ chức nội dẫn dắt" },
  { id: "FOREIGN_NET_ACCUMULATION", label: "🌏 Khối ngoại gom ròng nâng đỡ" },
  { id: "STEALTH_ACCUMULATION", label: "🛡️ Gom ngầm nền chặt (VCP / VDU / LPS)" },
];

const RANK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 2, label: "Top 1–2 Đầu tàu mỗi ngành" },
  { value: 3, label: "Top 1–3 Dẫn sóng mỗi ngành" },
  { value: 5, label: "Top 1–5 Mạnh nhất mỗi ngành" },
  { value: 50, label: "Tất cả cổ phiếu trong ngành" },
];

function regimeBadgeStyle(regime?: SectorInstitutionalRegime | null): string {
  switch (regime) {
    case "DUAL_INFLOW":
      return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold";
    case "SECTOR_VOLUME_IGNITION":
      return "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold";
    case "DOMESTIC_SMART_MONEY_LEAD":
      return "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold";
    case "FOREIGN_NET_ACCUMULATION":
      return "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold";
    case "STEALTH_ACCUMULATION":
      return "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold";
    case "BROAD_DISTRIBUTION":
      return "bg-rose-500/20 text-rose-300 border border-rose-500/40";
    default:
      return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
  }
}

function signalBadgeStyle(sig?: HorizonFlowSignal | null): string {
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

function scoreColor(s?: number | null): string {
  const v = s ?? 50;
  if (v >= 76) return "text-emerald-400 font-bold";
  if (v >= 62) return "text-cyan-400 font-semibold";
  if (v >= 48) return "text-ink";
  return "text-rose-400";
}

export function SectorLeaderScreener({ defaultSector }: { defaultSector?: string | null }) {
  const [horizon, setHorizon] = useState<HorizonFilter>("COMPOSITE");
  const [regime, setRegime] = useState<string>("INFLOW_ACTIVE");
  const [maxRank, setMaxRank] = useState<number>(3);
  const [selectedSector, setSelectedSector] = useState<string>(defaultSector ?? "");
  const [buyReadyOnly, setBuyReadyOnly] = useState<boolean>(false);

  const activeHorizonOpt = HORIZON_OPTIONS.find((h) => h.id === horizon) ?? HORIZON_OPTIONS[0]!;

  const queryUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("limit", "100");
    sp.set("maxRankInSector", String(maxRank));
    sp.set("sort", activeHorizonOpt.sortField);
    sp.set("order", "desc");

    if (selectedSector) sp.set("sector", selectedSector);
    if (horizon !== "COMPOSITE") {
      sp.set("investmentHorizon", horizon);
      sp.set("minHorizonScore", "58");
    }
    if (regime === "INFLOW_ACTIVE") {
      sp.set("sectorFlowSignal", "INFLOW_ANY");
    } else if (regime !== "ALL") {
      sp.set("sectorInstitutionalRegime", regime);
    }
    if (buyReadyOnly) {
      sp.set("buyPosition", "SAFE_ACCUMULATION");
    }
    return `/api/v1/stocks/screener?${sp.toString()}`;
  }, [horizon, regime, maxRank, selectedSector, buyReadyOnly, activeHorizonOpt.sortField]);

  const { data, meta, isLoading, isValidating } = useApi<ScreenerResponseData>(queryUrl, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });

  const items = data?.items ?? [];
  const sectorsAvailable = data?.sectorsAvailable ?? [];

  const getStockHorizonScore = (it: ScreenerStockItem): number => {
    if (horizon === "SHORT_1_2W") return it.horizonShortScore ?? 50;
    if (horizon === "MEDIUM_3W_2M") return it.horizonMediumScore ?? 50;
    if (horizon === "MED_LONG_2_6M") return it.horizonMedLongScore ?? 50;
    if (horizon === "LONG_6M_PLUS") return it.horizonLongScore ?? 50;
    return Math.round(
      (it.horizonShortScore ?? 50) * 0.28 +
        (it.horizonMediumScore ?? 50) * 0.28 +
        (it.horizonMedLongScore ?? 50) * 0.24 +
        (it.horizonLongScore ?? 50) * 0.20,
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter Control Cockpit */}
      <div className="rounded-xl border border-line bg-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-ink">
              Bộ Lọc Cổ Phiếu Dẫn Sóng Nhóm Ngành & Đồng Thuận Dòng Tiền Tổ Chức
            </h2>
            <p className="text-xs text-ink-3 mt-0.5">
              Sử dụng trực tiếp hạt nhân <code className="text-accent">sector-horizon-flow-engine</code> (Zero-Overlap) để trích xuất các cổ phiếu đầu tàu (#1–#3) trong các nhóm ngành đang có dòng tiền lớn bơm vào.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-3">
            {isValidating && <span>Đang đồng bộ...</span>}
            <FreshnessDot status={meta?.freshness ?? "FRESH"} ageMs={meta?.ageMs} />
          </div>
        </div>

        {/* Horizon Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {HORIZON_OPTIONS.map((h) => {
            const active = horizon === h.id;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setHorizon(h.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "bg-accent text-white shadow-xs"
                    : "bg-panel-2 text-ink-3 hover:text-ink hover:bg-panel-3"
                }`}
              >
                {h.label}
              </button>
            );
          })}
        </div>

        {/* Multi-Dimensional Sector Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Tín hiệu Dòng tiền Tổ chức Ngành
            </label>
            <select
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-hidden"
            >
              {REGIME_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Vị thế Cổ phiếu trong Ngành
            </label>
            <select
              value={maxRank}
              onChange={(e) => setMaxRank(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-hidden"
            >
              {RANK_OPTIONS.map((rk) => (
                <option key={rk.value} value={rk.value}>
                  {rk.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
              Nhóm ngành ICB cụ thể
            </label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-hidden"
            >
              <option value="">Tất cả nhóm ngành ({sectorsAvailable.length})</option>
              {sectorsAvailable.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setBuyReadyOnly((v) => !v)}
              className={`w-full rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                buyReadyOnly
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                  : "border-line bg-panel-2 text-ink-3 hover:text-ink"
              }`}
            >
              {buyReadyOnly ? "✓ Chỉ mã sát Điểm Mua Chuẩn" : "Lọc Điểm Mua: Tất cả vị thế"}
            </button>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink">
              Danh sách Cổ phiếu Dẫn Sóng Ngành ({items.length} mã thỏa mãn)
            </span>
          </div>
          <span className="text-[11px] text-ink-3">
            Xếp hạng nội ngành (#1–#{maxRank}) • Hạt nhân định lượng hợp nhất
          </span>
        </div>

        {isLoading && !items.length ? (
          <div className="p-4">
            <Loading rows={8} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-3">
            Không có cổ phiếu nào khớp bộ lọc sóng ngành hiện tại. Hãy mở rộng chế độ dòng tiền sang &quot;Tất cả chế độ dòng tiền&quot; hoặc tăng giới hạn Top xếp hạng trong ngành.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-wider text-ink-3 bg-panel-2/40">
                  <th className="py-2.5 px-3">Mã / Hạng Ngành</th>
                  <th className="py-2.5 px-2.5">Nhóm Ngành & RRG</th>
                  <th className="py-2.5 px-2.5">Chế Độ Dòng Tiền Ngành</th>
                  <th className="py-2.5 px-2 text-right">Giá / %</th>
                  <th className="py-2.5 px-2 text-right">Điểm Ngành</th>
                  <th className="py-2.5 px-2 text-center">4 Tầm Nhìn Cổ Phiếu (1-2T / 3T-2Th / 2-6Th / &gt;6Th)</th>
                  <th className="py-2.5 px-2.5">Dấu Chân Cá Mập & VSA</th>
                  <th className="py-2.5 px-3 text-right">Vùng Mua & R:R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 text-xs">
                {items.map((it) => {
                  const chg = it.changePercent ?? 0;
                  const chgClass = chg > 0 ? "text-up" : chg < 0 ? "text-down" : "text-ref";
                  const stockScore = getStockHorizonScore(it);

                  return (
                    <tr key={it.symbol} className="hover:bg-panel-2/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              (it.rankInSector ?? 99) === 1
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : (it.rankInSector ?? 99) <= 3
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                  : "bg-panel-2 text-ink-3"
                            }`}
                          >
                            #{it.rankInSector ?? "—"}
                          </span>
                          <div>
                            <Link
                              href={`/stocks/${it.symbol}`}
                              className="font-bold text-accent hover:underline"
                            >
                              {it.symbol}
                            </Link>
                            <div className="text-[10px] text-ink-3 truncate max-w-[130px]">
                              {it.bestHorizonVi ?? "Đa khung"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5">
                        <div className="font-semibold text-ink">{it.sector}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                          <span className="text-ink-3">
                            RRG: <strong className="text-ink-2">{it.sectorRrgQuadrant ?? "NEUTRAL"}</strong>
                          </span>
                          {it.sectorVolSurgeRatio != null && (
                            <span className="text-ink-3">• Vol ngành {it.sectorVolSurgeRatio}x</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] ${regimeBadgeStyle(
                            it.sectorInstitutionalRegime,
                          )}`}
                        >
                          {it.sectorInstitutionalRegimeVi ?? "Phân hóa nội ngành"}
                        </span>
                        <div className={`mt-1 text-[10px] ${signalBadgeStyle(it.sectorFlowSignal)}`}>
                          {it.sectorFlowSignalVi ?? "Cân bằng"}
                          {it.sectorSmartMoneyBreadthPct != null
                            ? ` • Cá mập ${it.sectorSmartMoneyBreadthPct}% mã`
                            : ""}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right num">
                        <div className="font-bold text-ink">
                          {it.price != null ? it.price.toFixed(2) : "—"}
                        </div>
                        <div className={`text-[11px] font-semibold ${chgClass}`}>
                          {chg > 0 ? "+" : ""}
                          {chg.toFixed(2)}%
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-right num">
                        <div className={`text-sm ${scoreColor(it.sectorFlowScore)}`}>
                          {it.sectorFlowScore ?? 50}
                        </div>
                        <div className="text-[10px] text-ink-3">
                          Mã: <strong className={scoreColor(stockScore)}>{stockScore}đ</strong>
                        </div>
                      </td>

                      <td className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-1 num text-[11px]">
                          <span className={`rounded px-1.5 py-0.5 bg-panel-2 ${scoreColor(it.horizonShortScore)}`}>
                            {it.horizonShortScore ?? "—"}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 bg-panel-2 ${scoreColor(it.horizonMediumScore)}`}>
                            {it.horizonMediumScore ?? "—"}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 bg-panel-2 ${scoreColor(it.horizonMedLongScore)}`}>
                            {it.horizonMedLongScore ?? "—"}
                          </span>
                          <span className={`rounded px-1.5 py-0.5 bg-panel-2 ${scoreColor(it.horizonLongScore)}`}>
                            {it.horizonLongScore ?? "—"}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5">
                        <div className="text-[11px] font-medium text-ink">
                          {it.smartMoneySignalVi ?? "Trung tính"}
                        </div>
                        <div className="text-[10px] text-ink-3">
                          Vol {it.volRatio20 ?? 1}x • RS {it.rsRating ?? "—"}
                          {it.foreignNetVal != null && it.foreignNetVal !== 0
                            ? ` • Ngoại ${it.foreignNetVal > 0 ? "+" : ""}${it.foreignNetVal}T`
                            : ""}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right num">
                        <div className="text-[11px] font-semibold text-ink">
                          {it.buyPoint != null ? `Mua: ${it.buyPoint.toFixed(2)}` : "Quan sát"}
                        </div>
                        <div className="text-[10px] text-ink-3">
                          {it.riskReward != null ? `R:R ${it.riskReward}x` : ""}
                          {it.buyZoneStatus === "AT_BUY_POINT" || it.isBuyTriggerNow ? (
                            <span className="ml-1 text-emerald-400 font-bold">• Kích hoạt</span>
                          ) : it.buyZoneStatus === "NEAR_BUY_POINT" ? (
                            <span className="ml-1 text-cyan-400">• Sát điểm mua</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
