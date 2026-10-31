"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import { Badge, Chg, fmtNum, FreshnessDot, Loading, MetaLine, Panel, Unavailable } from "@/components/ui";
import { DarkSelect } from "@/components/dark-select";
import { Play } from "@/components/screener-icons";
import type { MaCandleConfluenceRow } from "@/lib/services/ma-candle-confluence-screener";

type ScreenPayload = {
  rows: MaCandleConfluenceRow[];
  scanned: number;
  skipped: number;
  meta?: { freshness?: string; ageMs?: number; note?: string };
};

const SCENARIOS = [
  { id: "all", label: "Tất cả kịch bản", shortLabel: "Tất cả" },
  { id: "SMC_SWEEP_RECLAIM", label: "🧲 Quét rũ thanh khoản (SMC Spring)", shortLabel: "🧲 Quét SMC" },
  { id: "VSA_NO_SUPPLY_TEST", label: "🧪 Test cung cạn kiệt (No Supply)", shortLabel: "🧪 Test VSA" },
  { id: "EMA_RIBBON_ALIGN", label: "🎗️ Hợp lưu dải EMA Ribbon", shortLabel: "🎗️ EMA Ribbon" },
  { id: "MA50_BOUNCE", label: "🛡️ Nảy hỗ trợ MA50 (Tổ chức)", shortLabel: "🛡️ Nảy MA50" },
  { id: "MA20_BOUNCE", label: "🎯 Nảy hỗ trợ MA20 (Sóng tăng)", shortLabel: "🎯 Nảy MA20" },
  { id: "MA200_RECLAIM", label: "👑 Lấy lại MA200 (Thoát đáy)", shortLabel: "👑 Lấy MA200" },
  { id: "GOLDEN_CROSS_CONFIRM", label: "⚡ Xác nhận Golden Cross", shortLabel: "⚡ Golden Cross" },
  { id: "MA_SQUEEZE_BREAKOUT", label: "🌀 Nén chặt MA bung nổ", shortLabel: "🌀 Nén MA" },
  { id: "TREND_PULLBACK", label: "📈 Retest Kênh Tăng", shortLabel: "📈 Retest Kênh" },
] as const;

type ViewMode = "table" | "group_scenario" | "group_quality";
type SortField = "score" | "riskReward" | "change" | "volume";

const BADGE_COLORS = {
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

export function MaCandleConfluenceScreener({ defaultSector }: { defaultSector?: string | null }) {
  // Client-side interactive filter states (0ms instant updates)
  const [selectedScenario, setSelectedScenario] = useState<string>("all");
  const [selectedSector, setSelectedSector] = useState<string>(defaultSector ?? "");
  const [selectedQuality, setSelectedQuality] = useState<"all" | "A+" | "A">("all");
  const [minScoreThreshold, setMinScoreThreshold] = useState<number>(55);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [volumeOnly, setVolumeOnly] = useState<boolean>(false);
  const [foreignOnly, setForeignOnly] = useState<boolean>(false);
  const [leaderOnly, setLeaderOnly] = useState<boolean>(false);
  const [freshOnly, setFreshOnly] = useState<boolean>(false); // T+0 only
  const [highRrOnly, setHighRrOnly] = useState<boolean>(false); // R:R >= 2.0
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortBy, setSortBy] = useState<SortField>("score");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [pressed, setPressed] = useState<boolean>(false);

  // Fetch full confluence dataset once with generous boundary for instant zero-latency client filtering
  const { res, data, meta, isLoading, isValidating, mutate } = useApi<ScreenPayload>(
    `/api/v1/screener/ma-candle-confluence?scenario=ALL&minScore=50&limit=80`,
    { refreshInterval: 90_000, timeoutMs: 90_000 },
  );

  const rawRows = useMemo(() => data?.rows ?? [], [data?.rows]);

  // Scenario counts for quick badges
  const scenarioCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rawRows.length };
    for (const r of rawRows) {
      counts[r.scenario] = (counts[r.scenario] ?? 0) + 1;
    }
    return counts;
  }, [rawRows]);

  // High performance instant client-side filtering and sorting
  const filteredRows = useMemo(() => {
    let list = rawRows;

    // 1. Scenario Filter
    if (selectedScenario !== "all") {
      list = list.filter((r) => r.scenario.toUpperCase() === selectedScenario.toUpperCase());
    }

    // 2. Sector Filter
    if (selectedSector) {
      list = list.filter((r) => r.sector === selectedSector);
    }

    // 3. Quality Filter
    if (selectedQuality === "A+") {
      list = list.filter((r) => r.setupQuality === "A+");
    } else if (selectedQuality === "A") {
      list = list.filter((r) => r.setupQuality === "A+" || r.setupQuality === "A");
    }

    // 4. Min Score
    if (minScoreThreshold > 0) {
      list = list.filter((r) => r.confluenceScore >= minScoreThreshold);
    }

    // 5. Volume Climax / Confirmation
    if (volumeOnly) {
      list = list.filter((r) => (r.volRatio ?? 0) >= 1.2 || r.confluenceTags.some((t) => t.includes("Vol")));
    }

    // 5b. Foreign Accumulation Only
    if (foreignOnly) {
      list = list.filter((r) => Boolean(r.foreignAccumulating));
    }

    // 5c. Relative Strength Leader Only (Outperforming VN-Index)
    if (leaderOnly) {
      list = list.filter((r) => Boolean(r.isMarketLeader || (r.rsRating20 != null && r.rsRating20 > 0)));
    }

    // 6. Fresh T+0 only
    if (freshOnly) {
      list = list.filter((r) => r.patternAgeBars === 0);
    }

    // 7. High R:R only
    if (highRrOnly) {
      list = list.filter((r) => r.riskReward >= 2.0);
    }

    // 8. Search query (symbol, name, candleNameVi)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q)) ||
          r.candleNameVi.toLowerCase().includes(q) ||
          r.scenarioLabel.toLowerCase().includes(q),
      );
    }

    // 9. Sorting
    const sorted = [...list].sort((a, b) => {
      if (a.alertWorthy !== b.alertWorthy) return a.alertWorthy ? -1 : 1;
      switch (sortBy) {
        case "score":
          return b.confluenceScore - a.confluenceScore;
        case "riskReward":
          return b.riskReward - a.riskReward;
        case "change":
          return (b.changePercent ?? 0) - (a.changePercent ?? 0);
        case "volume":
          return (b.volume ?? 0) - (a.volume ?? 0);
        default:
          return b.confluenceScore - a.confluenceScore;
      }
    });

    return sorted;
  }, [
    rawRows,
    selectedScenario,
    selectedSector,
    selectedQuality,
    minScoreThreshold,
    volumeOnly,
    foreignOnly,
    leaderOnly,
    freshOnly,
    highRrOnly,
    searchQuery,
    sortBy,
  ]);

  // Statistics KPI computation
  const stats = useMemo(() => {
    const total = filteredRows.length;
    const aPlusCount = filteredRows.filter((r) => r.setupQuality === "A+").length;
    const aCount = filteredRows.filter((r) => r.setupQuality === "A").length;
    const volSurgeCount = filteredRows.filter((r) => (r.volRatio ?? 0) >= 1.2).length;
    const avgRr = total > 0 ? (filteredRows.reduce((acc, r) => acc + r.riskReward, 0) / total).toFixed(2) : "0.0";
    return { total, aPlusCount, aCount, volSurgeCount, avgRr };
  }, [filteredRows]);

  // Grouped by Scenario
  const groupedByScenario = useMemo(() => {
    const map = new Map<string, MaCandleConfluenceRow[]>();
    for (const r of filteredRows) {
      const arr = map.get(r.scenarioLabel) ?? [];
      arr.push(r);
      map.set(r.scenarioLabel, arr);
    }
    return Array.from(map.entries());
  }, [filteredRows]);

  // Grouped by Quality
  const groupedByQuality = useMemo(() => {
    const order: ("A+" | "A" | "B")[] = ["A+", "A", "B"];
    return order
      .map((q) => ({
        quality: q,
        rows: filteredRows.filter((r) => r.setupQuality === q),
      }))
      .filter((g) => g.rows.length > 0);
  }, [filteredRows]);

  const run = useCallback(() => {
    setPressed(true);
    void mutate();
    window.setTimeout(() => setPressed(false), 200);
  }, [mutate]);

  const resetFilters = useCallback(() => {
    setSelectedScenario("all");
    setSelectedSector("");
    setSelectedQuality("all");
    setMinScoreThreshold(55);
    setSearchQuery("");
    setVolumeOnly(false);
    setForeignOnly(false);
    setLeaderOnly(false);
    setFreshOnly(false);
    setHighRrOnly(false);
  }, []);

  if (isLoading && !res) return <Loading rows={8} />;

  if (!res?.success && !data) {
    return (
      <Unavailable
        title="Screener Hợp Lưu MA & Nến chưa sẵn sàng"
        note={res && !res.success ? res.error.message : "Đang kết nối lại máy chủ..."}
      />
    );
  }

  return (
    <div className="space-y-3.5">
      {/* KPI Counters Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line/60 bg-surface-elevated/40 p-2.5 px-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Cơ hội Hợp lưu</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-text-primary">{stats.total}</span>
            <span className="text-[11px] text-text-muted">/ {rawRows.length} mã quét</span>
          </div>
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-elevated/40 p-2.5 px-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Setup A+ / A</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-amber-400">{stats.aPlusCount}</span>
            <span className="text-[11px] text-text-muted">hạng A+ · {stats.aCount} hạng A</span>
          </div>
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-elevated/40 p-2.5 px-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Dòng tiền xác nhận</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-emerald-400">{stats.volSurgeCount}</span>
            <span className="text-[11px] text-text-muted">mã Vol &gt; 1.2x</span>
          </div>
        </div>

        <div className="rounded-lg border border-line/60 bg-surface-elevated/40 p-2.5 px-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">R:R Trung bình</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-cyan-400">1:{stats.avgRr}</span>
            <span className="text-[11px] text-text-muted">tỷ lệ Lãi / Lỗ</span>
          </div>
        </div>
      </div>

      {/* Main Filter Command Panel */}
      <Panel title="Bộ lọc Hợp Lưu Đường MA & Nến Đảo Chiều (MA-Candle Confluence)" pad={false}>
        {/* Row 1: Quick Strategy Presets Pills with Live Counters */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line/50 px-3 py-2 bg-surface-elevated/25">
          <span className="text-[10.5px] font-semibold text-text-muted mr-1">Chiến lược:</span>
          {SCENARIOS.map((sc) => {
            const count = scenarioCounts[sc.id === "all" ? "all" : sc.id] ?? 0;
            const isSelected = selectedScenario.toLowerCase() === sc.id.toLowerCase();
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => setSelectedScenario(sc.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition cursor-pointer select-none ${
                  isSelected
                    ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/50 shadow-sm"
                    : "bg-surface-elevated/60 text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-transparent"
                }`}
              >
                <span>{sc.shortLabel}</span>
                <span
                  className={`rounded-full px-1.5 py-0.1 text-[9.5px] font-semibold ${
                    isSelected ? "bg-accent-primary text-white" : "bg-surface-elevated text-text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 2: Precision Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 border-b border-line/40">
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm mã CK, ngành, nến…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input !w-44 !py-1 text-[11.5px] pl-2.5"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1.5 text-[10px] text-text-muted hover:text-text-primary"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sector Dropdown */}
            <DarkSelect
              value={selectedSector}
              onChange={setSelectedSector}
              className="!w-36 !py-1 text-[11.5px]"
              options={[
                { value: "", label: "Tất cả ngành" },
                ...VN_SECTOR_MAP.map((s) => ({ value: s.name, label: s.name })),
              ]}
            />

            {/* Quality Tier Dropdown */}
            <DarkSelect
              value={selectedQuality}
              onChange={(v) => setSelectedQuality(v as "all" | "A+" | "A")}
              className="!w-28 !py-1 text-[11.5px]"
              options={[
                { value: "all", label: "Tất cả hạng" },
                { value: "A+", label: "⭐ Chỉ A+" },
                { value: "A", label: "✨ Hạng A+ & A" },
              ]}
            />

            {/* Min Score Quick Selector */}
            <div className="flex items-center gap-1 rounded-md border border-line/60 bg-surface-elevated/40 p-0.5">
              {[50, 60, 70, 75].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setMinScoreThreshold(score)}
                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium transition ${
                    minScoreThreshold === score
                      ? "bg-accent-primary text-white"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  ≥{score}đ
                </button>
              ))}
            </div>
          </div>

          {/* Right actions: Refresh & Reset */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={resetFilters}
              title="Đặt lại bộ lọc"
              className="rounded-md border border-line/60 px-2 py-1 text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-elevated transition"
            >
              Đặt lại
            </button>
            <button
              type="button"
              onClick={run}
              className={`flex items-center gap-1 rounded-md px-3 py-1 text-[11.5px] font-semibold text-white transition ${
                pressed ? "scale-95 bg-accent-primary" : "bg-accent-primary hover:bg-accent-primary/90"
              }`}
            >
              <Play className="size-3" />
              {isValidating ? "Đang quét…" : "Quét lại"}
            </button>
          </div>
        </div>

        {/* Row 3: Quick Filter Toggles & View Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-surface-elevated/15 text-[11px]">
          {/* Quick Condition Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary select-none">
              <input
                type="checkbox"
                checked={volumeOnly}
                onChange={(e) => setVolumeOnly(e.target.checked)}
                className="rounded"
              />
              <span>Dòng tiền lớn (Vol &gt; 1.2x)</span>
            </label>

            <span className="text-text-muted">|</span>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary select-none">
              <input
                type="checkbox"
                checked={foreignOnly}
                onChange={(e) => setForeignOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-emerald-400 font-medium">Khối ngoại gom ròng</span>
            </label>

            <span className="text-text-muted">|</span>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary select-none">
              <input
                type="checkbox"
                checked={leaderOnly}
                onChange={(e) => setLeaderOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-cyan-400 font-medium">Khỏe hơn VN-Index</span>
            </label>

            <span className="text-text-muted">|</span>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary select-none">
              <input
                type="checkbox"
                checked={freshOnly}
                onChange={(e) => setFreshOnly(e.target.checked)}
                className="rounded"
              />
              <span>Mới phiên nay (T+0)</span>
            </label>

            <span className="text-text-muted">|</span>

            <label className="inline-flex items-center gap-1.5 cursor-pointer text-text-secondary hover:text-text-primary select-none">
              <input
                type="checkbox"
                checked={highRrOnly}
                onChange={(e) => setHighRrOnly(e.target.checked)}
                className="rounded"
              />
              <span>R:R cao (≥ 1:2.0)</span>
            </label>
          </div>

          {/* Right: Sort By & View Mode Segment */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-[10.5px]">Xếp theo:</span>
              <DarkSelect
                value={sortBy}
                onChange={(v) => setSortBy(v as SortField)}
                className="!w-28 !py-0.5 text-[10.5px]"
                options={[
                  { value: "score", label: "Điểm hợp lưu" },
                  { value: "riskReward", label: "Tỷ lệ R:R" },
                  { value: "change", label: "% Thay đổi" },
                  { value: "volume", label: "Khối lượng" },
                ]}
              />
            </div>

            {/* View Mode Pills */}
            <div className="flex items-center rounded-md border border-line/60 bg-surface-elevated/40 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-medium transition ${
                  viewMode === "table" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"
                }`}
                title="Dạng bảng chi tiết"
              >
                📋 Bảng
              </button>
              <button
                type="button"
                onClick={() => setViewMode("group_scenario")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-medium transition ${
                  viewMode === "group_scenario" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"
                }`}
                title="Phân nhóm theo kịch bản MA"
              >
                🗂️ Nhóm MA
              </button>
              <button
                type="button"
                onClick={() => setViewMode("group_quality")}
                className={`rounded px-2 py-0.5 text-[10.5px] font-medium transition ${
                  viewMode === "group_quality" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"
                }`}
                title="Phân nhóm theo chất lượng setup"
              >
                🏆 Nhóm Hạng
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* Results Presentation Container */}
      <Panel
        title={
          <span>
            Kết quả lọc: <strong className="text-text-primary font-semibold">{filteredRows.length}</strong> mã thỏa mãn
            {data ? ` (từ ${data.scanned} mã)` : ""}
            <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
            {isValidating ? <span className="ml-1.5 text-[10px] text-accent-primary">· đang quét cập nhật</span> : null}
          </span>
        }
        pad={false}
      >
        {filteredRows.length === 0 ? (
          <div className="px-3.5 py-12 text-center text-[13px] text-text-muted">
            <div className="text-base font-semibold text-text-secondary">Không tìm thấy mã thỏa mãn điều kiện lọc</div>
            <div className="mt-1 text-[11.5px]">
              Hãy thử nới lỏng “Điểm hợp lưu”, bỏ chọn “Chỉ T+0” hoặc chọn “Tất cả kịch bản”.
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 inline-flex items-center gap-1 rounded border border-line px-2.5 py-1 text-[11px] text-accent-primary hover:bg-surface-elevated transition"
            >
              Khôi phục bộ lọc mặc định
            </button>
          </div>
        ) : viewMode === "table" ? (
          /* VIEW 1: DATA TABLE VIEW */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3 bg-surface-elevated/20">
                  <th className="px-3.5 py-2 font-medium">Mã CK & Ngành</th>
                  <th className="py-2 font-medium">Kịch bản Hợp lưu MA</th>
                  <th className="py-2 font-medium">Nến kích hoạt & Tín hiệu</th>
                  <th className="py-2 font-medium">Kế hoạch Giao dịch (R:R)</th>
                  <th className="py-2 text-right font-medium">Điểm</th>
                  <th className="py-2 text-right font-medium">Giá khớp</th>
                  <th className="py-2 pr-3.5 text-right font-medium">± %</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <ConfluenceRowItem
                    key={row.symbol}
                    row={row}
                    isExpanded={expandedSymbol === row.symbol}
                    onToggle={() => setExpandedSymbol(expandedSymbol === row.symbol ? null : row.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === "group_scenario" ? (
          /* VIEW 2: GROUPED BY SCENARIO */
          <div className="p-3 space-y-4">
            {groupedByScenario.map(([groupLabel, rows]) => (
              <div key={groupLabel} className="rounded-lg border border-line/60 bg-surface-elevated/20 overflow-hidden">
                <div className="flex items-center justify-between border-b border-line/40 px-3 py-2 bg-surface-elevated/40">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[12.5px] text-text-primary">{groupLabel}</span>
                    <span className="rounded-full bg-accent-primary/20 text-accent-primary px-2 py-0.2 text-[10px] font-bold">
                      {rows.length} mã
                    </span>
                  </div>
                  <span className="text-[10.5px] text-text-muted">
                    Neo MA: <strong>{rows[0]?.anchorMa}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-[12px]">
                    <tbody>
                      {rows.map((row) => (
                        <ConfluenceRowItem
                          key={row.symbol}
                          row={row}
                          isExpanded={expandedSymbol === row.symbol}
                          onToggle={() => setExpandedSymbol(expandedSymbol === row.symbol ? null : row.symbol)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* VIEW 3: GROUPED BY QUALITY */
          <div className="p-3 space-y-4">
            {groupedByQuality.map(({ quality, rows }) => (
              <div key={quality} className="rounded-lg border border-line/60 bg-surface-elevated/20 overflow-hidden">
                <div className="flex items-center justify-between border-b border-line/40 px-3 py-2 bg-surface-elevated/40">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[11px] font-bold ${
                        quality === "A+"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          : quality === "A"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-surface-elevated text-text-muted"
                      }`}
                    >
                      Hạng {quality}
                    </span>
                    <span className="font-semibold text-[12px] text-text-primary">
                      {quality === "A+" ? "Cơ hội Vàng (Top Setup)" : quality === "A" ? "Cơ hội Đạt Chuẩn" : "Cơ hội Tiềm năng"}
                    </span>
                    <span className="text-[11px] text-text-muted">({rows.length} mã)</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-[12px]">
                    <tbody>
                      {rows.map((row) => (
                        <ConfluenceRowItem
                          key={row.symbol}
                          row={row}
                          isExpanded={expandedSymbol === row.symbol}
                          onToggle={() => setExpandedSymbol(expandedSymbol === row.symbol ? null : row.symbol)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-line px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-surface-elevated/10">
          <MetaLine meta={meta ?? data?.meta} />
          <div className="text-[10.5px] text-text-muted">
            💡 Bấm vào bất kỳ dòng nào để mở rộng kế hoạch giao dịch chi tiết (Visual R:R Bar &amp; Vùng Stop Loss).
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* Sub-component: Individual Row Item with Expandable Setup Plan */
function ConfluenceRowItem({
  row,
  isExpanded,
  onToggle,
}: {
  row: MaCandleConfluenceRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="row-hover border-b border-line/35 cursor-pointer transition-colors"
      >
        {/* Symbol & Sector */}
        <td className="px-3.5 py-2.5 align-top">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/stocks/${row.symbol}`}
              onClick={(e) => e.stopPropagation()}
              className="font-bold text-text-primary hover:text-accent-primary transition-colors text-[13px]"
            >
              {row.symbol}
            </Link>
            {row.setupQuality === "A+" && (
              <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 text-[9px] font-bold">
                A+
              </span>
            )}
            {row.setupQuality === "A" && (
              <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 text-[9px] font-semibold">
                A
              </span>
            )}
            {row.isMarketLeader && (
              <span className="rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1 py-0.2 text-[9px] font-semibold" title={`Khỏe hơn VN-Index: ${row.rsRating20 ? `+${row.rsRating20}%` : ''}`}>
                RS Leader
              </span>
            )}
            {row.foreignAccumulating && (
              <span className="rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1 py-0.2 text-[9px] font-semibold" title={`Khối ngoại mua ròng ${row.foreignNetVal ? `${row.foreignNetVal} tỷ` : ''}`}>
                NN Gom
              </span>
            )}
            {row.alertWorthy && <Badge tone="bull">Alert</Badge>}
          </div>
          <div className="text-[10.5px] text-text-muted truncate max-w-[130px] mt-0.5">
            {row.sector ?? row.name ?? "—"}
          </div>
        </td>

        {/* MA Confluence Scenario */}
        <td className="py-2.5 align-top">
          <div className="flex items-center gap-1.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[10.5px] font-semibold ${
                BADGE_COLORS[row.scenarioBadgeTone] ?? "bg-surface-elevated text-text-primary"
              }`}
            >
              {row.scenarioLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
            <span>
              Neo: <strong className="text-text-secondary">{row.anchorMa}</strong> ({fmtNum(row.anchorMaPrice, 2)})
            </span>
            {row.distToMaPct != null && (
              <span>
                Cách MA:{" "}
                <strong className={row.distToMaPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {row.distToMaPct >= 0 ? `+${row.distToMaPct}%` : `${row.distToMaPct}%`}
                </strong>
              </span>
            )}
          </div>
        </td>

        {/* Trigger Candlestick Pattern */}
        <td className="py-2.5 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-bull text-[12px]">{row.candleNameVi}</span>
            {row.patternAgeBars === 0 ? (
              <span className="text-[9.5px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1 py-0.2 rounded font-medium">
                T+0 hôm nay
              </span>
            ) : (
              <span className="text-[9.5px] text-text-muted bg-surface-elevated px-1 py-0.2 rounded border border-line/40">
                T-{row.patternAgeBars}
              </span>
            )}
          </div>

          {/* Confluence Tags */}
          <div className="flex flex-wrap gap-1 mt-1">
            {row.foreignNetVal != null && row.foreignNetVal !== 0 && (
              <span
                className={`rounded px-1 py-0.2 text-[9px] font-semibold border ${
                  row.foreignNetVal > 0
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                }`}
              >
                NN {row.foreignNetVal > 0 ? `+${row.foreignNetVal} tỷ` : `${row.foreignNetVal} tỷ`}
              </span>
            )}
            {row.rsRating20 != null && (
              <span
                className={`rounded px-1 py-0.2 text-[9px] font-semibold border ${
                  row.rsRating20 >= 0
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                    : "bg-surface-elevated text-text-muted border-line/40"
                }`}
              >
                RS {row.rsRating20 >= 0 ? `+${row.rsRating20}%` : `${row.rsRating20}%`}
              </span>
            )}
            {row.confluenceTags.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                className="rounded bg-surface-elevated text-text-secondary border border-line/50 px-1 py-0.2 text-[9px]"
              >
                {tag}
              </span>
            ))}
          </div>
        </td>

        {/* Trade Setup Calculator (R:R) */}
        <td className="py-2.5 align-top text-[11px]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-text-muted">SL:</span>
              <span className="text-rose-400 font-medium">{fmtNum(row.stopLoss, 2)}</span>
              <span className="text-[10px] text-rose-400/80">(-{row.riskPercent}%)</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-text-muted">TP1:</span>
              <span className="text-emerald-400 font-medium">{fmtNum(row.target1, 2)}</span>
              <span className="text-[10px] text-emerald-400/80">(+{row.rewardPercent}%)</span>
              <span
                className={`ml-auto font-bold px-1.5 py-0.2 rounded text-[10px] ${
                  row.riskReward >= 2.0
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-surface-elevated text-text-secondary"
                }`}
              >
                R:R 1:{row.riskReward}
              </span>
            </div>
          </div>
        </td>

        {/* Confluence Score */}
        <td className="num py-2.5 text-right align-top">
          <span
            className={`font-bold text-[13px] ${
              row.confluenceScore >= 80
                ? "text-emerald-400"
                : row.confluenceScore >= 70
                  ? "text-cyan-400"
                  : "text-amber-400"
            }`}
          >
            {row.confluenceScore}
          </span>
          <div className="text-[9.5px] text-text-muted">/100</div>
        </td>

        {/* Price */}
        <td className="num py-2.5 text-right align-top font-medium text-[12px]">{fmtNum(row.price, 2)}</td>

        {/* Change % */}
        <td className="py-2.5 pr-3.5 text-right align-top">
          <Chg value={row.changePercent} arrow={false} />
        </td>
      </tr>

      {/* Expanded Row Detail: Trade Plan Visualizer */}
      {isExpanded && (
        <tr className="border-b border-line/60 bg-surface-elevated/40">
          <td colSpan={7} className="p-3.5 pl-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Visual Risk-Reward Gauge */}
              <div className="rounded-lg border border-line/60 bg-surface-elevated/70 p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-text-primary">
                  <span>📐 Thước đo Lợi nhuận / Rủi ro (R:R 1:{row.riskReward})</span>
                  <span className="text-text-muted text-[10px]">Cơ chế: {row.stopLossType === "BELOW_MA" ? "Dưới dải MA" : "Dưới chân nến"}</span>
                </div>

                {/* Visual Gauge Bar */}
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-rose-400 font-medium">Dừng lỗ: {fmtNum(row.stopLoss, 2)} (-{row.riskPercent}%)</span>
                    <span className="text-text-primary font-bold">Điểm mua: {fmtNum(row.entryPrice, 2)}</span>
                    <span className="text-emerald-400 font-medium">TP1: {fmtNum(row.target1, 2)} (+{row.rewardPercent}%)</span>
                    <span className="text-cyan-400 font-medium">TP2: {fmtNum(row.target2, 2)}</span>
                  </div>

                  <div className="relative h-2.5 w-full rounded-full bg-surface-base overflow-hidden flex">
                    <div style={{ width: "30%" }} className="bg-rose-500/70 h-full" title="Risk Zone" />
                    <div style={{ width: "40%" }} className="bg-emerald-500/80 h-full" title="Target 1 Zone" />
                    <div style={{ width: "30%" }} className="bg-cyan-500/80 h-full" title="Target 2 Zone" />
                  </div>
                </div>

                <div className="mt-2 text-[10.5px] text-text-muted leading-relaxed">
                  <strong>Điều kiện xác nhận:</strong> {row.confirmation || "Đợi phiên tiếp theo duy trì trên giá mua."}
                </div>
              </div>

              {/* Right Column: Technical MA Context & Tags */}
              <div className="rounded-lg border border-line/60 bg-surface-elevated/70 p-3 space-y-2 text-[11px]">
                <div className="font-semibold text-text-primary">🔍 Bối cảnh Kỹ thuật Hợp lưu</div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                  <div>
                    <span className="text-text-muted">Độ dốc MA neo: </span>
                    <span className="font-medium text-text-secondary">
                      {row.maSlope === "UP" ? "↗ Đang dốc lên" : row.maSlope === "FLAT" ? "→ Đi ngang" : "↘ Đang dốc xuống"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Trạng thái Ribbon: </span>
                    <span className="font-medium text-text-secondary">
                      {row.maAlignment === "BULLISH_RIBBON" ? "🚀 Ribbon Tăng Trưởng" : "Thường"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Khối lượng Vol Ratio: </span>
                    <span className="font-medium text-text-secondary">
                      {row.volRatio ? `${row.volRatio}x MA20 vol` : "Bình thường"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted">Độ tin cậy nến: </span>
                    <span className="font-medium text-text-secondary uppercase">{row.candleReliability}</span>
                  </div>
                </div>

                <div className="pt-1.5 flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {row.confluenceTags.map((tag, i) => (
                      <span key={i} className="rounded bg-surface-base px-1.5 py-0.5 text-[9px] text-text-secondary border border-line/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/stocks/${row.symbol}`}
                    className="inline-flex items-center gap-1 rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 px-2.5 py-1 text-[11px] font-semibold transition"
                  >
                    Xem biểu đồ mã →
                  </Link>
                </div>
              </div>
            </div>

            {/* 5-Pillars Confluence Quantitative Breakdown */}
            <div className="mt-3 rounded-lg border border-line/60 bg-surface-elevated/70 p-3 space-y-2 text-[11px]">
              <div className="font-semibold text-text-primary flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span>⚡ Phân Tích 5 Trụ Cột Hợp Lưu Đa Nguồn</span>
                  {row.setupQuality === "A+" && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold">
                      ⭐ SIÊU HỢP LƯU (Top Setup)
                    </span>
                  )}
                </span>
                <span className="text-accent-primary font-bold">{row.confluenceScore} / 100 điểm</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10.5px]">
                <div className="rounded bg-surface-base/80 p-2 border border-line/40">
                  <div className="text-text-muted text-[9.5px]">1. Xu Hướng &amp; MA</div>
                  <div className="font-bold text-text-primary mt-0.5">{row.pillars?.trend ?? 20} / 25đ</div>
                  <div className="text-[9.5px] text-text-muted truncate mt-0.5">Neo {row.anchorMa}</div>
                </div>

                <div className="rounded bg-surface-base/80 p-2 border border-line/40">
                  <div className="text-text-muted text-[9.5px]">2. Nến Đảo Chiều</div>
                  <div className="font-bold text-text-primary mt-0.5">{row.pillars?.candle ?? 20} / 25đ</div>
                  <div className="text-[9.5px] text-emerald-400 truncate mt-0.5">{row.candleNameVi}</div>
                </div>

                <div className="rounded bg-surface-base/80 p-2 border border-line/40">
                  <div className="text-text-muted text-[9.5px]">3. Động Lượng RSI/MACD</div>
                  <div className="font-bold text-text-primary mt-0.5">{row.pillars?.momentum ?? 12} / 20đ</div>
                  <div className="text-[9.5px] text-cyan-400 truncate mt-0.5">
                    {row.rsi14 ? `RSI: ${row.rsi14}` : "RSI chuẩn"} {row.macdHist ? `· Hist: ${row.macdHist}` : ""}
                  </div>
                </div>

                <div className="rounded bg-surface-base/80 p-2 border border-line/40">
                  <div className="text-text-muted text-[9.5px]">4. Dòng Tiền &amp; Khối Ngoại</div>
                  <div className="font-bold text-text-primary mt-0.5">{row.pillars?.flow ?? 10} / 20đ</div>
                  <div className="text-[9.5px] text-text-muted truncate mt-0.5">
                    {row.foreignNetVal ? (
                      <span className={row.foreignNetVal >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        NN: {row.foreignNetVal >= 0 ? `+${row.foreignNetVal}` : row.foreignNetVal} tỷ
                      </span>
                    ) : (
                      `Vol ${row.volRatio ?? 1}x`
                    )}
                  </div>
                </div>

                <div className="rounded bg-surface-base/80 p-2 border border-line/40">
                  <div className="text-text-muted text-[9.5px]">5. RS vs VN-Index</div>
                  <div className="font-bold text-text-primary mt-0.5">{row.pillars?.rs ?? 6} / 10đ</div>
                  <div className="text-[9.5px] text-text-muted truncate mt-0.5">
                    {row.rsRating20 != null ? (
                      <span className={row.rsRating20 >= 0 ? "text-cyan-400 font-semibold" : "text-text-muted"}>
                        {row.rsRating20 >= 0 ? `+${row.rsRating20}%` : `${row.rsRating20}%`}
                      </span>
                    ) : (
                      "Tương quan tốt"
                    )}
                  </div>
                </div>
              </div>
          </td>
        </tr>
      )}
    </>
  );
}
