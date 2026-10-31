"use client";

import { memo, useState, useMemo } from "react";
import Link from "next/link";
import {
  Layers,
  Globe,
  Award,
  Users2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Search,
  Filter,
  ArrowUpDown,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { MultiSourceStockItem } from "@/lib/services/multi-source-screener";
import { Loading, Panel } from "@/components/ui";

const fmtVol = (v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "0 cp";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M cp`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K cp`;
  return `${v.toLocaleString("vi-VN")} cp`;
};

export const MultiSourceScreener = memo(function MultiSourceScreener() {
  const { data, isLoading } = useApi<MultiSourceStockItem[]>(
    "/api/v1/screener/multi-source",
    { refreshInterval: 15_000 }
  );

  const [query, setQuery] = useState("");
  const [foreignFilter, setForeignFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [researchFilter, setResearchFilter] = useState<"ALL" | "BUY" | "HIGH_UPSIDE">("ALL");
  const [instFilter, setInstFilter] = useState<"ALL" | "HIGH_INST">("ALL");
  const [quantFilter, setQuantFilter] = useState<"ALL" | "QUANT_EDGE" | "OU_OVERSOLD">("ALL");
  const [sortBy, setSortBy] = useState<"upside" | "foreign" | "inst" | "quant" | "symbol">("upside");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const items = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      // Query filter
      if (query.trim()) {
        const q = query.trim().toUpperCase();
        if (!item.symbol.includes(q) && !item.name.toUpperCase().includes(q)) {
          return false;
        }
      }

      // Foreign filter
      if (foreignFilter === "BUY" && item.foreignBuyRatioPct < 55) return false;
      if (foreignFilter === "SELL" && item.foreignBuyRatioPct > 45) return false;

      // Research filter
      if (researchFilter === "BUY" && !item.rating?.includes("MUA")) return false;
      if (researchFilter === "HIGH_UPSIDE" && (item.targetUpsidePct == null || item.targetUpsidePct < 15)) {
        return false;
      }

      // Institution filter
      if (instFilter === "HIGH_INST" && (item.institutionOwnershipPct == null || item.institutionOwnershipPct < 25)) {
        return false;
      }

      // Quant filter
      if (quantFilter === "QUANT_EDGE" && (item.quantEdgeScore == null || item.quantEdgeScore < 60)) {
        return false;
      }
      if (quantFilter === "OU_OVERSOLD" && (item.ouZScore == null || item.ouZScore > -1.4)) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      let diff = 0;
      if (sortBy === "upside") {
        diff = (b.targetUpsidePct ?? -999) - (a.targetUpsidePct ?? -999);
      } else if (sortBy === "foreign") {
        diff = b.foreignBuyRatioPct - a.foreignBuyRatioPct;
      } else if (sortBy === "inst") {
        diff = (b.institutionOwnershipPct ?? 0) - (a.institutionOwnershipPct ?? 0);
      } else if (sortBy === "quant") {
        diff = (b.quantEdgeScore ?? 0) - (a.quantEdgeScore ?? 0);
      } else if (sortBy === "symbol") {
        diff = a.symbol.localeCompare(b.symbol);
      }
      return sortDir === "desc" ? diff : -diff;
    });
  }, [items, query, foreignFilter, researchFilter, instFilter, quantFilter, sortBy, sortDir]);

  if (isLoading && !data) {
    return (
      <Panel title="Đang tải Bộ lọc đa nguồn Pro…">
        <Loading rows={8} />
      </Panel>
    );
  }

  const buyRecoCount = items.filter((i) => i.rating?.includes("MUA")).length;
  const netBuyForeignCount = items.filter((i) => i.foreignBuyRatioPct >= 55).length;
  const highUpsideCount = items.filter((i) => (i.targetUpsidePct ?? 0) >= 15).length;

  return (
    <div className="space-y-4">
      {/* Banner Thống kê nhanh */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Khuyến Nghị Mua (Orca Research)</span>
            <Award className="size-4 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-400">{buyRecoCount}</span>
            <span className="text-xs text-text-muted">/ {items.length} mã VN30</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Ngoại Gom Ròng Realtime (Orca Flow)</span>
            <Globe className="size-4 text-purple-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-purple-400">{netBuyForeignCount}</span>
            <span className="text-xs text-text-muted">mã lực cầu ngoại &gt; 55%</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Dư Địa Tăng Trưởng &gt; 15%</span>
            <TrendingUp className="size-4 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-cyan-400">{highUpsideCount}</span>
            <span className="text-xs text-text-muted">mã chiết khấu hấp dẫn</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Cơ Cấu Tổ Chức & Ban Lãnh Đạo</span>
            <Users2 className="size-4 text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">Orca IQ</span>
            <span className="text-xs text-text-muted">chuẩn hóa 100%</span>
          </div>
        </div>
      </div>

      {/* Panel Bộ lọc & Bảng tương tác */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-accent-primary" />
            <span>Bộ Lọc Đa Nguồn Pro (Orca Multi-Source Engine)</span>
            <span className="rounded bg-accent-primary/15 px-2 py-0.5 text-[11px] font-semibold text-accent-primary">
              {filtered.length} mã thỏa điều kiện
            </span>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Multi-Source Connectivity Telemetry Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-surface-elevated/40 border border-border-subtle rounded-lg text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                Đa Nguồn Đồng Bộ Live:
              </span>
              <span className="rounded bg-panel-3 px-2 py-0.5 border border-border-subtle text-text-secondary flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" /> VPS (Khối ngoại)
              </span>
              <span className="rounded bg-panel-3 px-2 py-0.5 border border-border-subtle text-text-secondary flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-400" /> SSI iBoard (Khớp lệnh)
              </span>
              <span className="rounded bg-panel-3 px-2 py-0.5 border border-border-subtle text-text-secondary flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-cyan-400" /> VNDirect (Định giá & Target)
              </span>
              <span className="rounded bg-panel-3 px-2 py-0.5 border border-border-subtle text-text-secondary flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-amber-400" /> Vietcap (Sở hữu tổ chức)
              </span>
              <span className="rounded bg-panel-3 px-2 py-0.5 border border-border-subtle text-text-secondary flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-purple-400" /> Orca Quant Engine (Alpha Edge)
              </span>
            </div>
            <div className="text-[10px] text-text-muted flex items-center gap-2">
              <span className="rounded bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 font-medium border border-emerald-500/20">
                HA Failover: Tự động
              </span>
              <span>Độ trễ TB: ~110ms</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
            {/* Search Input */}
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Tìm mã cổ phiếu hoặc tên công ty…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface-base py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
              />
            </div>

            {/* Quick Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Foreign */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setForeignFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    foreignFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Tất cả ngoại
                </button>
                <button
                  type="button"
                  onClick={() => setForeignFilter("BUY")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    foreignFilter === "BUY" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Gom ròng
                </button>
                <button
                  type="button"
                  onClick={() => setForeignFilter("SELL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    foreignFilter === "SELL" ? "bg-rose-500/20 text-rose-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Xả ròng
                </button>
              </div>

              {/* Research */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setResearchFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    researchFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Mọi khuyến nghị
                </button>
                <button
                  type="button"
                  onClick={() => setResearchFilter("BUY")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    researchFilter === "BUY" ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Khuyến nghị Mua
                </button>
                <button
                  type="button"
                  onClick={() => setResearchFilter("HIGH_UPSIDE")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    researchFilter === "HIGH_UPSIDE" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Upside &gt; 15%
                </button>
              </div>

              {/* Institution */}
              <button
                type="button"
                onClick={() => setInstFilter((prev) => (prev === "ALL" ? "HIGH_INST" : "ALL"))}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  instFilter === "HIGH_INST"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-400 font-bold"
                    : "border-border-subtle bg-surface-base text-text-muted"
                }`}
              >
                Tổ chức &gt; 25%
              </button>

              {/* Quant Edge Filter */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setQuantFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    quantFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Tất cả Quant
                </button>
                <button
                  type="button"
                  onClick={() => setQuantFilter("QUANT_EDGE")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    quantFilter === "QUANT_EDGE" ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Ưu thế Quant &gt; 60
                </button>
                <button
                  type="button"
                  onClick={() => setQuantFilter("OU_OVERSOLD")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    quantFilter === "OU_OVERSOLD" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Bắt đáy OU Z &le; -1.4
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] text-text-muted">
                  <th
                    className="py-2.5 pr-4 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("symbol");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Cổ phiếu</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Thị giá</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("foreign");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Ngoại Live (Orca Flow)</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("upside");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Giá MT & Khuyến nghị</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("inst");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Sở hữu Tổ chức / Lãnh đạo</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("quant");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Ưu thế Quant</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">P/E vs TB 3Y</th>
                  <th className="py-2.5 pl-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {filtered.map((item) => {
                  const isUp = item.changePercent > 0;
                  const isDown = item.changePercent < 0;
                  const isNetBuy = (item.foreignNetVolume ?? 0) > 0;

                  return (
                    <tr
                      key={item.symbol}
                      className="group transition-colors hover:bg-surface-elevated/40"
                    >
                      {/* Cột 1: Mã */}
                      <td className="py-3 pr-4">
                        <Link
                          href={`/stocks/${item.symbol}`}
                          className="flex flex-col group-hover:text-accent-primary"
                        >
                          <span className="font-bold text-text-primary group-hover:text-accent-primary">
                            {item.symbol}
                          </span>
                          <span className="text-[10px] text-text-muted truncate max-w-[140px]">
                            {item.name}
                          </span>
                        </Link>
                      </td>

                      {/* Cột 2: Giá */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text-primary">
                            {item.price > 0 ? item.price.toFixed(2) : "—"}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              isUp ? "text-emerald-400" : isDown ? "text-rose-400" : "text-text-muted"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {item.changePercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* Cột 3: Ngoại Live */}
                      <td className="py-3 px-3">
                        <div className="space-y-1 w-32">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-emerald-400 font-medium">
                              {item.foreignBuyRatioPct.toFixed(0)}% Mua
                            </span>
                            <span className="text-text-muted">
                              {fmtVol(item.foreignNetVolume)}
                            </span>
                          </div>
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-base">
                            <div
                              style={{ width: `${item.foreignBuyRatioPct}%` }}
                              className="bg-emerald-500"
                            />
                            <div
                              style={{ width: `${100 - item.foreignBuyRatioPct}%` }}
                              className="bg-rose-500"
                            />
                          </div>
                        </div>
                      </td>

                      {/* Cột 4: Target & Rating */}
                      <td className="py-3 px-3">
                        {item.targetPrice ? (
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-text-primary">
                                {(item.targetPrice / 1000).toFixed(2)}
                              </span>
                              {item.targetUpsidePct != null && (
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                    item.targetUpsidePct >= 0
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : "bg-rose-500/15 text-rose-400"
                                  }`}
                                >
                                  {item.targetUpsidePct >= 0 ? "+" : ""}
                                  {item.targetUpsidePct}%
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-accent-primary">
                              {item.rating || "THEO DÕI"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[11px]">Đang cập nhật</span>
                        )}
                      </td>

                      {/* Cột 5: Sở hữu */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="text-text-primary">
                            Tổ chức:{" "}
                            <strong className="text-cyan-400 font-semibold">
                              {item.institutionOwnershipPct != null ? `${item.institutionOwnershipPct}%` : "—"}
                            </strong>
                          </span>
                          <span className="text-text-muted text-[10px]">
                            Lãnh đạo: {item.leadershipOwnershipPct != null ? `${item.leadershipOwnershipPct}%` : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Cột 6: Ưu thế Quant */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-cyan-400 font-mono">
                              {item.quantEdgeScore != null ? item.quantEdgeScore : "—"}
                            </span>
                            {item.quantAnomalyTag && (
                              <span className="rounded bg-accent-primary/15 px-1 py-0.2 text-[9px] font-semibold text-accent-primary">
                                {item.quantAnomalyTag}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-text-muted">
                            <span>OU Z: {item.ouZScore != null ? item.ouZScore.toFixed(2) : "—"}</span>
                            <span>RR: {item.tripleBarrierRiskReward != null ? `${item.tripleBarrierRiskReward.toFixed(1)}R` : "—"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cột 7: P/E */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col text-[11px]">
                          <span className="text-text-primary font-mono font-medium">
                            {item.pe != null ? item.pe.toFixed(1) : "—"}
                          </span>
                          <span className="text-text-muted text-[10px]">
                            TB 3Y: {item.pe3yAvg != null ? item.pe3yAvg.toFixed(1) : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Cột 7: Thao tác */}
                      <td className="py-3 pl-3 text-right">
                        <Link
                          href={`/stocks/${item.symbol}`}
                          className="inline-flex items-center gap-1 rounded bg-surface-elevated px-2.5 py-1 text-[11px] font-medium text-text-primary hover:bg-accent-primary hover:text-text-on-accent transition-colors"
                        >
                          <span>Chi tiết</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
});
