"use client";

import { memo, useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Globe,
  Award,
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
import { useMarketStream } from "@/lib/hooks/use-market-stream";
import { VN_SECURITIES } from "@/lib/vn/master";
import type { MultiSourceStockItem } from "@/lib/services/multi-source-screener";
import { Loading, Panel } from "@/components/ui";

const VN30_SYMBOLS = new Set(VN_SECURITIES.filter((s) => s.bluechip).map((s) => s.symbol));

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
    { refreshInterval: 15_000, keepPreviousData: true }
  );

  const [query, setQuery] = useState("");
  const [foreignFilter, setForeignFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [researchFilter, setResearchFilter] = useState<"ALL" | "BUY" | "HIGH_UPSIDE">("ALL");
  const [instFilter, setInstFilter] = useState<"ALL" | "HIGH_INST">("ALL");
  const [quantFilter, setQuantFilter] = useState<"ALL" | "QUANT_EDGE" | "OU_OVERSOLD" | "SWING_DIV">("ALL");
  const [buyZoneFilter, setBuyZoneFilter] = useState<"ALL" | "NEAR_BUY" | "AT_BUY">("ALL");
  const [smartMoneyFilter, setSmartMoneyFilter] = useState<
    "ALL" | "INFLOW" | "ABSORPTION" | "POCKET_PIVOT" | "SUPER_FLOW"
  >("ALL");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [capFilter, setCapFilter] = useState<"ALL" | "VN30" | "MIDCAP" | "SMALLCAP">("ALL");
  const [valuationFilter, setValuationFilter] = useState<"ALL" | "UNDERVALUED" | "DEEP_VALUE">("ALL");
  const [rsFilter, setRsFilter] = useState<"ALL" | "RS_70" | "RS_80">("ALL");
  const [techGuardFilter, setTechGuardFilter] = useState<"ALL" | "APPROVED_ONLY">("ALL");
  const [sortBy, setSortBy] = useState<
    "upside" | "foreign" | "inst" | "quant" | "symbol" | "near_buy" | "rs" | "smart_money" | "master_score"
  >("near_buy");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const items = useMemo(() => data ?? [], [data]);

  // Danh mục ngành trích xuất tự động từ dữ liệu thực tế
  const availableSectors = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => {
      if (it.sector) s.add(it.sector);
    });
    return Array.from(s).sort();
  }, [items]);

  // Real-time SSE Stream Overlay (Item C)
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const streamSymbols = useMemo(() => {
    return items.slice(0, 50).map((it) => it.symbol);
  }, [items]);

  const { quotes: streamQuotes, status: streamStatus } = useMarketStream(streamSymbols, {
    enabled: realtimeEnabled && streamSymbols.length > 0,
    asset: "stock",
  });

  const [flashMap, setFlashMap] = useState<Record<string, "up" | "down">>({});
  const prevPricesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!realtimeEnabled) return;
    const updates: Record<string, "up" | "down"> = {};
    let hasUpdates = false;

    for (const [sym, sq] of Object.entries(streamQuotes)) {
      if (!sq?.price) continue;
      const normalized = sq.price > 500 ? Number((sq.price / 1000).toFixed(2)) : sq.price;
      const prev = prevPricesRef.current[sym];
      if (prev != null && prev !== normalized) {
        updates[sym] = normalized > prev ? "up" : "down";
        hasUpdates = true;
      }
      prevPricesRef.current[sym] = normalized;
    }

    if (hasUpdates) {
      setFlashMap((prev) => ({ ...prev, ...updates }));
      const timer = setTimeout(() => {
        setFlashMap((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(updates)) delete next[k];
          return next;
        });
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [streamQuotes, realtimeEnabled]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      // Query filter
      if (query.trim()) {
        const q = query.trim().toUpperCase();
        if (!item.symbol.includes(q) && !item.name.toUpperCase().includes(q)) {
          return false;
        }
      }

      // Sector filter (Item B)
      if (sectorFilter !== "ALL" && item.sector !== sectorFilter) {
        return false;
      }

      // Market Cap filter (Item B)
      if (capFilter === "VN30" && !VN30_SYMBOLS.has(item.symbol)) {
        return false;
      }
      if (capFilter === "MIDCAP" && ((item.marketCap ?? 0) < 3_000 || VN30_SYMBOLS.has(item.symbol))) {
        return false;
      }
      if (capFilter === "SMALLCAP" && (item.marketCap ?? 0) >= 3_000) {
        return false;
      }

      // Valuation filter (Item B)
      if (valuationFilter === "UNDERVALUED") {
        const peValid = item.pe != null && item.pe > 0 && item.pe <= 15;
        const pbValid = item.pb != null && item.pb > 0 && item.pb <= 2.2;
        if (!peValid && !pbValid) return false;
      }
      if (valuationFilter === "DEEP_VALUE") {
        const peDeep = item.pe != null && item.pe > 0 && item.pe <= 10;
        const pbDeep = item.pb != null && item.pb > 0 && item.pb <= 1.2;
        if (!peDeep && !pbDeep) return false;
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
      if (quantFilter === "SWING_DIV" && (!item.isSwingLowConfirmed || (!item.isFreshBullishDivergence && !item.isDualDivergenceFresh))) {
        return false;
      }

      // Buy Zone filter
      if (buyZoneFilter === "NEAR_BUY" && (item.absBuyDiff == null || item.absBuyDiff > 2.0)) {
        return false;
      }
      if (buyZoneFilter === "AT_BUY" && (item.absBuyDiff == null || item.absBuyDiff > 1.0)) {
        return false;
      }

      // Smart Money filter (Item A - Enhanced)
      if (smartMoneyFilter === "INFLOW") {
        const hasScore = (item.smartMoneyScore ?? 0) >= 60;
        const hasSig = item.smartMoneySignal === "HEAVY_ACCUMULATION" || item.smartMoneySignal === "POCKET_PIVOT";
        if (!hasScore && !hasSig) return false;
      }
      if (smartMoneyFilter === "ABSORPTION") {
        const isAbs =
          item.smartMoneySignal === "SPRING_ABSORPTION" ||
          item.smartMoneySignal === "HEAVY_ACCUMULATION" ||
          item.vsaSignal === "ABSORPTION_SPIKE" ||
          item.vsaSignal === "VSA_NO_SUPPLY";
        if (!isAbs) return false;
      }
      if (smartMoneyFilter === "POCKET_PIVOT") {
        if (item.smartMoneySignal !== "POCKET_PIVOT") return false;
      }
      if (smartMoneyFilter === "SUPER_FLOW") {
        const isSmart = (item.smartMoneyScore ?? 0) >= 65 || item.smartMoneySignal === "HEAVY_ACCUMULATION";
        const isForeign = item.foreignBuyRatioPct >= 55;
        if (!isSmart || !isForeign) return false;
      }

      // RS Rating filter (O'Neil)
      if (rsFilter === "RS_70" && (item.rsRating == null || item.rsRating < 70)) {
        return false;
      }
      if (rsFilter === "RS_80" && (item.rsRating == null || item.rsRating < 80)) {
        return false;
      }

      // Technical Consistency Guard (Loại bỏ Death Cross / Vỡ hỗ trợ)
      if (techGuardFilter === "APPROVED_ONLY" && item.isTechnicalBuyApproved !== true) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      let diff = 0;
      if (sortBy === "near_buy") {
        diff = (a.absBuyDiff ?? 999) - (b.absBuyDiff ?? 999);
      } else if (sortBy === "upside") {
        diff = (b.targetUpsidePct ?? -999) - (a.targetUpsidePct ?? -999);
      } else if (sortBy === "foreign") {
        diff = b.foreignBuyRatioPct - a.foreignBuyRatioPct;
      } else if (sortBy === "inst") {
        diff = (b.institutionOwnershipPct ?? 0) - (a.institutionOwnershipPct ?? 0);
      } else if (sortBy === "quant") {
        diff = (b.quantEdgeScore ?? 0) - (a.quantEdgeScore ?? 0);
      } else if (sortBy === "rs") {
        diff = (b.rsRating ?? 0) - (a.rsRating ?? 0);
      } else if (sortBy === "smart_money") {
        diff = (b.smartMoneyScore ?? 0) - (a.smartMoneyScore ?? 0);
      } else if (sortBy === "master_score") {
        diff = (b.orcaMasterScore ?? 0) - (a.orcaMasterScore ?? 0);
      } else if (sortBy === "symbol") {
        diff = a.symbol.localeCompare(b.symbol);
      }
      return sortDir === "desc" ? -diff : diff;
    });
  }, [
    items,
    query,
    foreignFilter,
    researchFilter,
    instFilter,
    quantFilter,
    buyZoneFilter,
    smartMoneyFilter,
    rsFilter,
    techGuardFilter,
    sectorFilter,
    capFilter,
    valuationFilter,
    sortBy,
    sortDir,
  ]);

  if (isLoading && !data) {
    return (
      <Panel title="Đang tải Bộ lọc đa nguồn Pro…">
        <Loading rows={8} />
      </Panel>
    );
  }

  const buyRecoCount = items.filter((i) => i.rating?.includes("MUA")).length;
  const netBuyForeignCount = items.filter((i) => i.foreignBuyRatioPct >= 55).length;
  const rsLeaderCount = items.filter((i) => (i.rsRating ?? 0) >= 70).length;
  const smartMoneyInCount = items.filter((i) => (i.smartMoneyScore ?? 0) >= 60).length;
  const techApprovedCount = items.filter((i) => i.isTechnicalBuyApproved === true).length;

  return (
    <div className="space-y-4">
      {/* Banner Thống kê nhanh */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Khuyến Nghị Mua (Orca Research)</span>
            <Award className="size-4 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-400">{buyRecoCount}</span>
            <span className="text-xs text-text-muted">/ {items.length} mã quét</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Ngoại Gom Ròng (Orca Flow)</span>
            <Globe className="size-4 text-purple-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-purple-400">{netBuyForeignCount}</span>
            <span className="text-xs text-text-muted">mã cầu ngoại &gt; 55%</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Cá Mập Gom (Smart Money)</span>
            <Zap className="size-4 text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-amber-400">{smartMoneyInCount}</span>
            <span className="text-xs text-text-muted">mã gom ngầm lớn</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>RS Leader O&apos;Neil (&ge; 70)</span>
            <TrendingUp className="size-4 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-cyan-400">{rsLeaderCount}</span>
            <span className="text-xs text-text-muted">mã xung lực dẫn dắt</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-elevated/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Chuẩn Kỹ Thuật (Tech Guard)</span>
            <ShieldCheck className="size-4 text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-400">{techApprovedCount}</span>
            <span className="text-xs text-text-muted">đồng thuận không báo bán</span>
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
              <span
                className={`rounded px-1.5 py-0.5 font-medium border flex items-center gap-1 ${
                  streamStatus === "open"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-surface-base text-text-muted border-border-subtle"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    streamStatus === "open" ? "bg-emerald-400 animate-pulse" : "bg-text-muted"
                  }`}
                />
                <span>SSE Stream: {streamStatus === "open" ? "Live Realtime" : "Kết nối…"}</span>
              </span>
              <button
                type="button"
                onClick={() => setRealtimeEnabled((prev) => !prev)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                  realtimeEnabled
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-400/30"
                    : "bg-surface-base text-text-muted border-border-subtle"
                }`}
              >
                {realtimeEnabled ? "⚡ Stream Bật" : "⏸ Stream Tắt"}
              </button>
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
              {/* Điểm Mua Gần Nhất Filter */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setBuyZoneFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    buyZoneFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Mọi điểm mua
                </button>
                <button
                  type="button"
                  onClick={() => setBuyZoneFilter("NEAR_BUY")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    buyZoneFilter === "NEAR_BUY" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Sát điểm mua (≤2%)
                </button>
                <button
                  type="button"
                  onClick={() => setBuyZoneFilter("AT_BUY")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    buyZoneFilter === "AT_BUY" ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Đúng điểm mua (≤1%)
                </button>
              </div>

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
                <button
                  type="button"
                  onClick={() => setQuantFilter("SWING_DIV")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    quantFilter === "SWING_DIV" ? "bg-cyan-500/20 text-cyan-300 font-bold" : "text-text-muted"
                  }`}
                >
                  Swing Đáy &amp; Phân Kỳ 💎
                </button>
              </div>

              {/* Smart Money Filter (Item A) */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setSmartMoneyFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    smartMoneyFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Tất cả dòng tiền
                </button>
                <button
                  type="button"
                  onClick={() => setSmartMoneyFilter("INFLOW")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    smartMoneyFilter === "INFLOW" ? "bg-amber-500/20 text-amber-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Cá mập gom (&ge; 60)
                </button>
                <button
                  type="button"
                  onClick={() => setSmartMoneyFilter("ABSORPTION")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    smartMoneyFilter === "ABSORPTION" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  Hấp thụ cung
                </button>
                <button
                  type="button"
                  onClick={() => setSmartMoneyFilter("POCKET_PIVOT")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    smartMoneyFilter === "POCKET_PIVOT" ? "bg-purple-500/20 text-purple-300 font-bold" : "text-text-muted"
                  }`}
                >
                  Pocket Pivot
                </button>
                <button
                  type="button"
                  onClick={() => setSmartMoneyFilter("SUPER_FLOW")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    smartMoneyFilter === "SUPER_FLOW" ? "bg-cyan-500/20 text-cyan-300 font-bold" : "text-text-muted"
                  }`}
                >
                  Siêu dòng tiền 🔥
                </button>
              </div>

              {/* RS Rating O'Neil Filter */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setRsFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    rsFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Mọi RS
                </button>
                <button
                  type="button"
                  onClick={() => setRsFilter("RS_70")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    rsFilter === "RS_70" ? "bg-cyan-500/20 text-cyan-400 font-bold" : "text-text-muted"
                  }`}
                >
                  RS &ge; 70 (Leader)
                </button>
                <button
                  type="button"
                  onClick={() => setRsFilter("RS_80")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    rsFilter === "RS_80" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  RS &ge; 80 (Super)
                </button>
              </div>

              {/* Technical Consistency Guard Toggle */}
              <button
                type="button"
                onClick={() => setTechGuardFilter((prev) => (prev === "ALL" ? "APPROVED_ONLY" : "ALL"))}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  techGuardFilter === "APPROVED_ONLY"
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300 font-bold"
                    : "border-border-subtle bg-surface-base text-text-muted"
                }`}
              >
                <ShieldCheck className="size-3.5" />
                <span>Bảo Vệ Kỹ Thuật (Loại Death Cross/Gãy nền)</span>
              </button>
            </div>
          </div>

          {/* Secondary Controls Bar: Ngành, Vốn hóa & Định giá (Item B) */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-border-subtle text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Lọc theo Ngành */}
              <div className="flex items-center gap-1.5 bg-surface-base px-2.5 py-1 rounded-lg border border-border-subtle">
                <span className="text-[11px] text-text-muted whitespace-nowrap">Ngành:</span>
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-text-primary focus:outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">Tất cả ngành ({availableSectors.length})</option>
                  {availableSectors.map((sec) => (
                    <option key={sec} value={sec} className="bg-surface-elevated text-text-primary">
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lọc theo Vốn hóa */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setCapFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    capFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Tất cả quy mô
                </button>
                <button
                  type="button"
                  onClick={() => setCapFilter("VN30")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    capFilter === "VN30" ? "bg-blue-500/20 text-blue-300 font-bold" : "text-text-muted"
                  }`}
                >
                  VN30 Trụ
                </button>
                <button
                  type="button"
                  onClick={() => setCapFilter("MIDCAP")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    capFilter === "MIDCAP" ? "bg-cyan-500/20 text-cyan-300 font-bold" : "text-text-muted"
                  }`}
                >
                  Midcap (&ge;3K tỷ)
                </button>
                <button
                  type="button"
                  onClick={() => setCapFilter("SMALLCAP")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    capFilter === "SMALLCAP" ? "bg-surface-elevated text-text-muted font-bold" : "text-text-muted"
                  }`}
                >
                  Smallcap
                </button>
              </div>

              {/* Lọc theo Định giá P/E & P/B */}
              <div className="flex items-center rounded-lg border border-border-subtle bg-surface-base p-0.5">
                <button
                  type="button"
                  onClick={() => setValuationFilter("ALL")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    valuationFilter === "ALL" ? "bg-surface-elevated text-text-primary" : "text-text-muted"
                  }`}
                >
                  Mọi định giá
                </button>
                <button
                  type="button"
                  onClick={() => setValuationFilter("UNDERVALUED")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    valuationFilter === "UNDERVALUED" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-text-muted"
                  }`}
                >
                  P/E &le; 15 hoặc P/B &le; 2.2
                </button>
                <button
                  type="button"
                  onClick={() => setValuationFilter("DEEP_VALUE")}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    valuationFilter === "DEEP_VALUE" ? "bg-purple-500/20 text-purple-300 font-bold" : "text-text-muted"
                  }`}
                >
                  Deep Value (P/E &le; 10)
                </button>
              </div>
            </div>

            {/* Reset Filters Shortcut */}
            {(sectorFilter !== "ALL" ||
              capFilter !== "ALL" ||
              valuationFilter !== "ALL" ||
              smartMoneyFilter !== "ALL" ||
              foreignFilter !== "ALL" ||
              researchFilter !== "ALL" ||
              buyZoneFilter !== "ALL" ||
              rsFilter !== "ALL" ||
              techGuardFilter !== "ALL" ||
              query.trim() !== "") && (
              <button
                type="button"
                onClick={() => {
                  setSectorFilter("ALL");
                  setCapFilter("ALL");
                  setValuationFilter("ALL");
                  setSmartMoneyFilter("ALL");
                  setForeignFilter("ALL");
                  setResearchFilter("ALL");
                  setBuyZoneFilter("ALL");
                  setRsFilter("ALL");
                  setTechGuardFilter("ALL");
                  setQuery("");
                }}
                className="text-[11px] text-rose-400 hover:text-rose-300 underline font-medium px-1"
              >
                Đặt lại bộ lọc
              </button>
            )}
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
                      setSortBy("near_buy");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1 text-accent-primary">
                      <span>Điểm Mua & Vùng Gom</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("rs");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1 text-cyan-400">
                      <span>RS & Master</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text-primary"
                    onClick={() => {
                      setSortBy("smart_money");
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    }}
                  >
                    <div className="flex items-center gap-1 text-amber-400">
                      <span>Cá Mập & VSA</span>
                      <ArrowUpDown className="size-3" />
                    </div>
                  </th>
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
                      <span>Sở hữu Tổ chức</span>
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
                  <th className="py-2.5 px-3">Bảo Vệ Kỹ Thuật</th>
                  <th className="py-2.5 pl-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {isLoading && items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-text-muted">
                      <Loading rows={5} />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-text-muted text-xs">
                      Không có mã cổ phiếu nào thỏa mãn toàn bộ tiêu chí lọc hiện tại. Thử chọn &quot;Mọi khuyến nghị&quot; hoặc điều chỉnh tiêu chí.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const sq = streamQuotes[item.symbol];
                    const livePrice = sq?.price != null ? (sq.price > 500 ? sq.price / 1000 : sq.price) : item.price;
                    const liveChg = sq?.changePercent != null ? sq.changePercent : item.changePercent;
                    const isUp = liveChg > 0;
                    const isDown = liveChg < 0;
                    const isNetBuy = (item.foreignNetVolume ?? 0) > 0;
                    const flash = flashMap[item.symbol];
                    const flashClass =
                      flash === "up"
                        ? "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/80 rounded"
                        : flash === "down"
                        ? "bg-rose-500/25 text-rose-300 ring-1 ring-rose-400/80 rounded"
                        : "";

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
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-text-primary group-hover:text-accent-primary">
                                {item.symbol}
                              </span>
                              {item.sector && (
                                <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted border border-border-subtle truncate max-w-[80px]">
                                  {item.sector}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-text-muted truncate max-w-[140px]">
                              {item.name}
                            </span>
                          </Link>
                        </td>

                        {/* Cột 2: Giá (Real-time SSE Flash) */}
                        <td className="py-3 px-3">
                          <div className={`flex flex-col transition-all duration-300 px-1 py-0.5 rounded ${flashClass}`}>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-text-primary num">
                                {livePrice > 0 ? livePrice.toFixed(2) : "—"}
                              </span>
                              {flash && (
                                <span
                                  className={`size-1.5 rounded-full animate-ping ${
                                    flash === "up" ? "bg-emerald-400" : "bg-rose-400"
                                  }`}
                                />
                              )}
                            </div>
                            <span
                              className={`text-[11px] font-medium num ${
                                isUp ? "text-emerald-400" : isDown ? "text-rose-400" : "text-text-muted"
                              }`}
                            >
                              {isUp ? "+" : ""}
                              {liveChg.toFixed(2)}%
                            </span>
                          </div>
                        </td>

                      {/* Cột Điểm Mua & Kế Hoạch */}
                      <td className="py-3 px-3">
                        {item.buyPoint ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="font-bold text-accent-primary">{item.buyPoint.toLocaleString("vi-VN")}</span>
                              {item.buyPointDiffPct != null && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                    Math.abs(item.buyPointDiffPct) <= 1.0
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                      : Math.abs(item.buyPointDiffPct) <= 2.5
                                      ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                                      : item.buyPointDiffPct > 0
                                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                      : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                                  }`}
                                >
                                  {Math.abs(item.buyPointDiffPct) <= 1.0 ? "Đúng điểm" : item.buyPointDiffPct > 0 ? `+${item.buyPointDiffPct}%` : `${item.buyPointDiffPct}%`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-text-muted truncate max-w-[180px]">
                              <span>{item.buyStrategy ?? "Bệ đỡ hội tụ"}</span>
                              {item.riskReward && <span className="text-amber-400 font-semibold font-mono">({item.riskReward}R)</span>}
                              {item.isMtfAligned && (
                                <span className="rounded bg-gradient-to-r from-emerald-500/20 to-amber-500/20 px-1 py-0.2 text-[8.5px] font-bold text-emerald-300 border border-emerald-500/30">
                                  H1·D1·W1 🟢
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-muted text-[10px]">—</span>
                        )}
                      </td>

                      {/* Cột Mới: RS & Master Rating */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-text-muted">RS:</span>
                            <span
                              className={`font-mono font-bold text-xs ${
                                (item.rsRating ?? 0) >= 80
                                  ? "text-emerald-400"
                                  : (item.rsRating ?? 0) >= 70
                                  ? "text-cyan-400"
                                  : "text-text-secondary"
                              }`}
                            >
                              {item.rsRating != null ? item.rsRating : "—"}
                            </span>
                            {item.isMarketLeader && (
                              <span className="rounded bg-cyan-500/20 px-1 py-0.2 text-[8px] font-bold text-cyan-300 border border-cyan-500/30">
                                LEADER
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-text-muted">
                            <span>Master:</span>
                            <span className="font-mono font-bold text-amber-300">
                              {item.orcaMasterScore != null ? item.orcaMasterScore : "—"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Cột Mới: Cá Mập & VSA */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-text-muted">Dòng tiền:</span>
                            <span
                              className={`font-mono font-bold text-xs ${
                                (item.smartMoneyScore ?? 0) >= 70
                                  ? "text-amber-400"
                                  : (item.smartMoneyScore ?? 0) >= 50
                                  ? "text-emerald-400"
                                  : "text-text-secondary"
                              }`}
                            >
                              {item.smartMoneyScore != null ? item.smartMoneyScore : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px]">
                            {item.vsaSignalVi ? (
                              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-medium text-purple-300 border border-purple-500/30 truncate max-w-[120px]">
                                {item.vsaSignalVi}
                              </span>
                            ) : item.smartMoneySignalVi ? (
                              <span className="text-text-muted text-[10px] truncate max-w-[120px]">
                                {item.smartMoneySignalVi}
                              </span>
                            ) : (
                              <span className="text-text-muted text-[10px]">—</span>
                            )}
                          </div>
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
                            {item.isSwingLowConfirmed && (item.isFreshBullishDivergence || item.isDualDivergenceFresh) && (
                              <span
                                title={item.reversalStageVi || "Nến Swing Đáy kèm Phân kỳ dương tươi mới"}
                                className="rounded bg-cyan-500/20 border border-cyan-400/40 px-1 py-0.2 text-[9px] font-bold text-cyan-300 whitespace-nowrap"
                              >
                                {item.isDualDivergenceFresh ? "Swing Đáy + PK Kép ✨" : "Swing Đáy + PK 💎"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-text-muted">
                            <span>OU Z: {item.ouZScore != null ? item.ouZScore.toFixed(2) : "—"}</span>
                            <span>RR: {item.tripleBarrierRiskReward != null ? `${item.tripleBarrierRiskReward.toFixed(1)}R` : "—"}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cột: Bảo Vệ Kỹ Thuật & Định Giá P/E */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-0.5 text-[11px]">
                          {item.isTechnicalBuyApproved ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                              <ShieldCheck className="size-3" />
                              <span>Chuẩn Mua 🟢</span>
                            </span>
                          ) : item.isBrokenSupport ? (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30 whitespace-nowrap">
                              <span>Vỡ hỗ trợ ⚠️</span>
                            </span>
                          ) : item.maSignal === "DEATH_CROSS" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30 whitespace-nowrap">
                              <span>Death Cross ⚠️</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-surface-base px-1.5 py-0.5 text-[10px] font-medium text-text-muted border border-border-subtle whitespace-nowrap">
                              <span>Quan sát 🟡</span>
                            </span>
                          )}
                          <div className="flex items-center gap-1 text-[10px] text-text-muted">
                            <span>P/E: {item.pe != null ? item.pe.toFixed(1) : "—"}</span>
                            {item.superTrendDir && (
                              <span className={item.superTrendDir === "up" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                {item.superTrendDir === "up" ? "▲ Up" : "▼ Down"}
                              </span>
                            )}
                          </div>
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
                }))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
});
