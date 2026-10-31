"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import type { CryptoMarketRow, IndexQuote } from "@/lib/types";
import {
  Badge,
  Chg,
  fmtCompact,
  fmtNum,
  FreshnessDot,
  Loading,
  MetaLine,
  Panel,
  priceDigits,
} from "@/components/ui";
import {
  SlidersHorizontal,
  Download,
  Search,
  Sparkles,
  TrendingUp,
  ShieldCheck,
  Zap,
  DollarSign,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import type {
  ScreenerPreset,
  ScreenerStockItem,
  ScreenerResponseData,
} from "@/lib/services/screener-snapshot-service";

export function Field({
  label,
  value,
  onChange,
  small,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  small?: boolean;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input text-[12px] ${small ? "!w-24 !py-1.5" : "!w-28 !py-1.5"}`}
        inputMode="decimal"
      />
    </label>
  );
}

type ViewTab = "overview" | "quant" | "confluence" | "technical" | "valuation" | "profitability" | "health";

export function QuantBadge({
  badge,
  score,
}: {
  badge: "SUPER_QUANT" | "QUANT_EDGE" | "WATCH" | "NEUTRAL" | string | null | undefined;
  score?: number | null;
}) {
  if (badge === "SUPER_QUANT") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 border border-cyan-400/40 px-2 py-0.5 text-[10px] font-bold text-cyan-300 whitespace-nowrap shadow-sm">
        <Zap className="size-3 text-cyan-300" /> SIÊU QUANT {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "QUANT_EDGE") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 whitespace-nowrap">
        ƯU THẾ QUANT {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "WATCH") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 whitespace-nowrap">
        Theo dõi {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">{score ? `${score}đ` : "—"}</span>;
}

export function ConfluenceBadge({
  badge,
  score,
}: {
  badge: "SUPER_SETUP" | "POTENTIAL_BREAKOUT" | "WATCH" | "NONE" | string | null | undefined;
  score?: number | null;
}) {
  if (badge === "SUPER_SETUP") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold text-amber-400 whitespace-nowrap shadow-sm">
        SIÊU SETUP {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "POTENTIAL_BREAKOUT") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-accent-primary/20 border border-accent-primary/40 px-2 py-0.5 text-[10px] font-bold text-accent-primary whitespace-nowrap">
        CHỜ NỔ {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  if (badge === "WATCH") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 whitespace-nowrap">
        Theo dõi {score ? `(${score}đ)` : ""}
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">{score ? `${score}đ` : "—"}</span>;
}

export function SqueezeBadge({ state }: { state: string | null | undefined }) {
  if (state === "fired_bull") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
        Nổ tăng
      </span>
    );
  }
  if (state === "fired_bear") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 whitespace-nowrap">
        Nổ giảm
      </span>
    );
  }
  if (state === "squeeze_on") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 border border-purple-500/40 px-1.5 py-0.5 text-[10px] font-medium text-purple-300 whitespace-nowrap animate-pulse">
        Đang nén
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

export function SuperTrendBadge({ dir }: { dir: "up" | "down" | null | undefined }) {
  if (dir === "up") {
    return <span className="text-[11px] font-bold text-emerald-400">▲ Tăng</span>;
  }
  if (dir === "down") {
    return <span className="text-[11px] font-semibold text-rose-400">▼ Giảm</span>;
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

export function MaSignalBadge({ signal }: { signal: string | null | undefined }) {
  if (signal === "GOLDEN_CROSS") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 whitespace-nowrap">
        Giao cắt Vàng
      </span>
    );
  }
  if (signal === "BULLISH_ALIGN") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
        Trật tự tăng
      </span>
    );
  }
  if (signal === "DEATH_CROSS") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400 whitespace-nowrap">
        Cắt Tử thần
      </span>
    );
  }
  return <span className="text-[10px] text-text-muted">—</span>;
}

const PRESET_TABS: { id: ScreenerPreset; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "all", label: "Tất cả", icon: <Sparkles className="size-3.5" />, desc: "Toàn bộ thị trường" },
  { id: "quant_edge", label: "Ưu thế Quant Pro", icon: <Zap className="size-3.5 text-cyan-400" />, desc: "Top cổ phiếu có ưu thế định lượng thống kê toàn diện (Score >= 62)" },
  { id: "quant_mean_revert", label: "Mean Reversion OU", icon: <TrendingUp className="size-3.5 text-emerald-400" />, desc: "Mô hình Ornstein-Uhlenbeck: Bắt đáy thống kê Z-Score <= -1.4, chu kỳ t½" },
  { id: "quant_low_beta", label: "Low-Beta Anomaly", icon: <ShieldCheck className="size-3.5 text-blue-400" />, desc: "Bất thường học thuyết AQR: Beta <= 0.88 & Chất lượng cao" },
  { id: "quant_asymmetric", label: "Triple-Barrier R/R >= 2.0", icon: <Sparkles className="size-3.5 text-amber-400" />, desc: "Tỷ lệ Lời/Lỗ tối ưu theo mô hình biến động Marcos López de Prado" },
  { id: "confluence", label: "Siêu Hội Tụ", icon: <Sparkles className="size-3.5 text-amber-400" />, desc: "Hội tụ 4 trụ cột: Xu hướng + Mẫu hình + Dòng tiền + Cơ bản" },
  { id: "vcp", label: "Mẫu hình VCP / Cốc", icon: <TrendingUp className="size-3.5 text-accent-primary" />, desc: "Minervini VCP, Cốc tay cầm, Hai đáy" },
  { id: "ttm_squeeze", label: "Nén Squeeze", icon: <Zap className="size-3.5 text-purple-400" />, desc: "Bollinger nén trong Keltner chuẩn bị bùng nổ" },
  { id: "ma_cross", label: "Giao cắt MA", icon: <TrendingUp className="size-3.5 text-emerald-400" />, desc: "Golden Cross & Trật tự MA tăng" },
  { id: "canslim", label: "CANSLIM", icon: <TrendingUp className="size-3.5 text-accent-primary" />, desc: "Tăng trưởng cao & ROE > 14%" },
  { id: "dividend", label: "Cổ tức cao", icon: <DollarSign className="size-3.5 text-emerald-400" />, desc: "Cổ tức tiền mặt > 5%, nợ an toàn" },
  { id: "growth", label: "Siêu tăng trưởng", icon: <Zap className="size-3.5 text-amber-400" />, desc: "LNST / Doanh thu tăng > 20%" },
  { id: "value", label: "Giá trị rẻ", icon: <ShieldCheck className="size-3.5 text-blue-400" />, desc: "P/E < 11, P/B < 1.3, an toàn" },
  { id: "breakout", label: "Bứt phá vol", icon: <CheckCircle2 className="size-3.5 text-purple-400" />, desc: "Giá tăng > 2% kèm vol lớn" },
];

export function VnScreener({
  defaultSector,
  defaultPreset = "all",
  defaultView = "overview",
  onOpenBacktest,
}: {
  defaultSector: string | null;
  defaultPreset?: ScreenerPreset;
  defaultView?: ViewTab;
  onOpenBacktest?: (symbol?: string) => void;
}) {
  // Preset & Tab state
  const [preset, setPreset] = useState<ScreenerPreset>(defaultPreset);
  const [viewTab, setViewTab] = useState<ViewTab>(defaultView);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Search & Filter state
  const [q, setQ] = useState("");
  const [exchange, setExchange] = useState("ALL");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [maSignal, setMaSignal] = useState("ALL");
  const [minChg, setMinChg] = useState("");
  const [maxChg, setMaxChg] = useState("");
  const [minVol, setMinVol] = useState("");
  const [minPe, setMinPe] = useState("");
  const [maxPe, setMaxPe] = useState("");
  const [minPb, setMinPb] = useState("");
  const [maxPb, setMaxPb] = useState("");
  const [minRoe, setMinRoe] = useState("");
  const [minDivYield, setMinDivYield] = useState("");
  const [maxDe, setMaxDe] = useState("");
  const [minMarketCap, setMinMarketCap] = useState("");

  // Sort state
  const [sortKey, setSortKey] = useState<string>("marketCap");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Applied params
  const [applied, setApplied] = useState({
    preset: "all" as ScreenerPreset,
    exchange: "ALL",
    sector: defaultSector ?? "",
    q: "",
    maSignal: "ALL",
    minChg: "",
    maxChg: "",
    minVol: "",
    minPe: "",
    maxPe: "",
    minPb: "",
    maxPb: "",
    minRoe: "",
    minDivYield: "",
    maxDe: "",
    minMarketCap: "",
  });

  // Query string builder
  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (applied.preset !== "all") p.set("preset", applied.preset);
    if (applied.exchange && applied.exchange !== "ALL") p.set("exchange", applied.exchange);
    if (applied.sector) p.set("sector", applied.sector);
    if (applied.q) p.set("q", applied.q);
    if (applied.maSignal && applied.maSignal !== "ALL") p.set("maSignal", applied.maSignal);
    if (applied.minChg) p.set("minChg", applied.minChg);
    if (applied.maxChg) p.set("maxChg", applied.maxChg);
    if (applied.minVol) p.set("minVol", String(Number(applied.minVol) * 1_000_000));
    if (applied.minPe) p.set("minPe", applied.minPe);
    if (applied.maxPe) p.set("maxPe", applied.maxPe);
    if (applied.minPb) p.set("minPb", applied.minPb);
    if (applied.maxPb) p.set("maxPb", applied.maxPb);
    if (applied.minRoe) p.set("minRoe", applied.minRoe);
    if (applied.minDivYield) p.set("minDivYield", applied.minDivYield);
    if (applied.maxDe) p.set("maxDe", applied.maxDe);
    if (applied.minMarketCap) p.set("minMarketCap", applied.minMarketCap);
    p.set("sort", sortKey);
    p.set("order", sortOrder);
    p.set("limit", "150");
    return p.toString();
  }, [applied, sortKey, sortOrder]);

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<ScreenerResponseData>(
    `/api/v1/stocks/screener?${queryString}`,
    {
      refreshInterval: 30_000,
      timeoutMs: 10_000,
      keepPreviousData: true,
    },
  );

  const handleApply = useCallback(() => {
    setApplied({
      preset,
      exchange,
      sector,
      q,
      maSignal,
      minChg,
      maxChg,
      minVol,
      minPe,
      maxPe,
      minPb,
      maxPb,
      minRoe,
      minDivYield,
      maxDe,
      minMarketCap,
    });
    void mutate();
  }, [
    preset,
    exchange,
    sector,
    q,
    maSignal,
    minChg,
    maxChg,
    minVol,
    minPe,
    maxPe,
    minPb,
    maxPb,
    minRoe,
    minDivYield,
    maxDe,
    minMarketCap,
    mutate,
  ]);

  const handleReset = useCallback(() => {
    setPreset("all");
    setExchange("ALL");
    setSector("");
    setQ("");
    setMaSignal("ALL");
    setMinChg("");
    setMaxChg("");
    setMinVol("");
    setMinPe("");
    setMaxPe("");
    setMinPb("");
    setMaxPb("");
    setMinRoe("");
    setMinDivYield("");
    setMaxDe("");
    setMinMarketCap("");
    setApplied({
      preset: "all",
      exchange: "ALL",
      sector: "",
      q: "",
      maSignal: "ALL",
      minChg: "",
      maxChg: "",
      minVol: "",
      minPe: "",
      maxPe: "",
      minPb: "",
      maxPb: "",
      minRoe: "",
      minDivYield: "",
      maxDe: "",
      minMarketCap: "",
    });
    void mutate();
  }, [mutate]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const handleSelectPreset = (p: ScreenerPreset) => {
    setPreset(p);
    setApplied((prev) => ({ ...prev, preset: p }));
  };

  const rows = data?.items ?? [];
  const presetsCount = data?.presetsCount;

  // Export CSV
  const handleExportCsv = () => {
    if (!rows.length) return;
    const headers = [
      "Mã",
      "Tên DN",
      "Sàn",
      "Ngành",
      "Giá (k VND)",
      "Thay đổi (%)",
      "Khối lượng",
      "Vốn hóa (tỷ VND)",
      "P/E",
      "P/B",
      "ROE (%)",
      "ROA (%)",
      "Cổ tức (%)",
      "Biên LN ròng (%)",
      "Nợ/Vốn CSH",
      "Điểm Orca",
    ];
    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.symbol,
          `"${(r.name ?? "").replace(/"/g, '""')}"`,
          r.exchange ?? "",
          `"${r.sector ?? ""}"`,
          r.price ?? "",
          r.changePercent ?? "",
          r.volume ?? "",
          r.marketCap ?? "",
          r.pe ?? "",
          r.pb ?? "",
          r.roe ?? "",
          r.roa ?? "",
          r.dividendYield ?? "",
          r.netMargin ?? "",
          r.debtEquity ?? "",
          r.compositeScore ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orca-screener-${applied.preset}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* 1. Preset Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-1.5 flex items-center gap-1.5">
          <Sparkles className="size-3 text-accent-primary" />
          Chiến lược:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_TABS.map((tab) => {
            const active = preset === tab.id;
            const count = presetsCount ? presetsCount[tab.id] : null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectPreset(tab.id)}
                title={tab.desc}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all ${
                  active
                    ? "bg-accent-primary text-white shadow-sm font-semibold"
                    : "bg-panel-2 text-text-secondary hover:bg-panel-hover hover:text-text-primary"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {count != null && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      active ? "bg-white/25 text-white" : "bg-panel-3 text-text-muted"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Main Screener Panel */}
      <Panel
        title={
          <div className="flex items-center justify-between w-full pr-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">
                Bộ lọc: {rows.length} mã thỏa mãn
              </span>
              <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
              {data?.sourcesUsed && (
                <span
                  title={`Nguồn đang kết nối: ${data.sourcesUsed.join(", ")} · Chế độ HA tự động dự phòng`}
                  className="hidden sm:inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20"
                >
                  <ShieldCheck className="size-3" />
                  Đa nguồn song song ({data.sourcesUsed.length} nguồn)
                </span>
              )}
              {isValidating && (
                <span className="text-[11px] text-accent-primary font-normal animate-pulse">
                  · đang cập nhật…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!rows.length}
                className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-panel-hover hover:text-text-primary transition-all disabled:opacity-40"
              >
                <Download className="size-3" />
                Xuất CSV
              </button>
            </div>
          </div>
        }
        pad={false}
      >
        {/* Multi-Source Redundancy Telemetry Banner */}
        {data?.redundancyInfo && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-panel-3/50 border-b border-line text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Đa Nguồn HA Active:
              </span>
              {data.redundancyInfo.quoteProviders?.map((p) => {
                const lat = data.redundancyInfo?.latencies?.[p];
                return (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded bg-panel-2 px-2 py-0.5 border border-line/60 text-[10px] text-text-secondary"
                  >
                    <span className="size-1 rounded-full bg-emerald-400" />
                    <span className="uppercase font-medium">{p}</span>
                    {lat != null && <span className="text-text-muted font-mono">{lat}ms</span>}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span>Đồng bộ: <strong className="text-emerald-400 font-medium">{data.redundancyInfo.healthStatus}</strong></span>
              {data.redundancyInfo.conflictCount != null && data.redundancyInfo.conflictCount > 0 && (
                <span>Khử lệch: {data.redundancyInfo.conflictCount} mã</span>
              )}
              <span className="rounded bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 border border-emerald-500/20">
                HA Failover: {data.redundancyInfo.failoverCount > 0 ? `${data.redundancyInfo.failoverCount} lần` : "Sẵn sàng"}
              </span>
            </div>
          </div>
        )}

        {/* Quick Filter Bar */}
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3 bg-panel-2/40">
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
              <Search className="size-2.5" /> Tìm mã / tên
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApply()}
              placeholder="FPT, VCB, Hòa Phát…"
              className="input !w-36 !py-1.5 text-[12px]"
            />
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Sàn</span>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              className="input !w-24 !py-1.5 text-[12px]"
            >
              <option value="ALL">Tất cả sàn</option>
              <option value="HOSE">HOSE</option>
              <option value="HNX">HNX</option>
              <option value="UPCOM">UPCoM</option>
            </select>
          </label>

          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Ngành</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="input !w-36 !py-1.5 text-[12px]"
            >
              <option value="">Tất cả ngành</option>
              {VN_SECTOR_MAP.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <Field label="Δ% min" value={minChg} onChange={setMinChg} small placeholder="-5" />
          <Field label="Δ% max" value={maxChg} onChange={setMaxChg} small placeholder="7" />
          <Field label="GT min (tỷ)" value={minVol} onChange={setMinVol} small placeholder="5" />

          <button
            type="button"
            onClick={handleApply}
            className="rounded-md bg-accent-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-primary/90 transition-all shadow-sm"
          >
            Lọc kết quả
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            className={`flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium transition-all ${
              showAdvanced ? "bg-accent-primary/10 text-accent-primary border-accent-primary/30" : "bg-panel text-text-secondary hover:bg-panel-hover"
            }`}
          >
            <SlidersHorizontal className="size-3" />
            Bộ lọc nâng cao
            {showAdvanced ? <ChevronUp className="size-3 ml-0.5" /> : <ChevronDown className="size-3 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Đặt lại tất cả bộ lọc"
            className="rounded-md border border-line bg-panel p-1.5 text-text-muted hover:text-text-primary hover:bg-panel-hover"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 border-b border-line p-3.5 bg-panel-3/40 animate-in fade-in duration-200">
            <label>
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Tín hiệu MA</span>
              <select
                value={maSignal}
                onChange={(e) => setMaSignal(e.target.value)}
                className="input !w-full !py-1.5 text-[12px]"
              >
                <option value="ALL">Tất cả tín hiệu MA</option>
                <option value="GOLDEN_CROSS">Giao cắt Vàng (Golden)</option>
                <option value="BULLISH_ALIGN">Kênh tăng (Trật tự MA)</option>
                <option value="DEATH_CROSS">Cắt Tử thần (Death Cross)</option>
              </select>
            </label>
            <Field label="P/E tối đa" value={maxPe} onChange={setMaxPe} small placeholder="15" />
            <Field label="P/B tối đa" value={maxPb} onChange={setMaxPb} small placeholder="2.0" />
            <Field label="ROE tối thiểu (%)" value={minRoe} onChange={setMinRoe} small placeholder="15" />
            <Field label="Cổ tức tối thiểu (%)" value={minDivYield} onChange={setMinDivYield} small placeholder="5" />
            <Field label="Nợ/Vốn CSH tối đa" value={maxDe} onChange={setMaxDe} small placeholder="1.2" />
            <Field label="Vốn hóa min (tỷ)" value={minMarketCap} onChange={setMinMarketCap} small placeholder="1000" />
          </div>
        )}

        {/* View Tabs Bar */}
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5 bg-panel">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewTab("overview")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "overview"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Tổng quan
            </button>
            <button
              type="button"
              onClick={() => setViewTab("quant")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1 ${
                viewTab === "quant"
                  ? "bg-panel-3 text-cyan-400 font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Zap className="size-3 text-cyan-400" />
              Ưu thế Quant Trading
            </button>
            <button
              type="button"
              onClick={() => setViewTab("confluence")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1 ${
                viewTab === "confluence"
                  ? "bg-panel-3 text-amber-400 font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <Sparkles className="size-3 text-amber-400" />
              Siêu Hội Tụ & Mẫu hình
            </button>
            <button
              type="button"
              onClick={() => setViewTab("technical")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1 ${
                viewTab === "technical"
                  ? "bg-panel-3 text-emerald-400 font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <TrendingUp className="size-3 text-emerald-400" />
              Kỹ thuật & MA
            </button>
            <button
              type="button"
              onClick={() => setViewTab("valuation")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "valuation"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Định giá P/E, P/B
            </button>
            <button
              type="button"
              onClick={() => setViewTab("profitability")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "profitability"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Hiệu quả & Tăng trưởng
            </button>
            <button
              type="button"
              onClick={() => setViewTab("health")}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-all ${
                viewTab === "health"
                  ? "bg-panel-3 text-accent-primary font-semibold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Sức khỏe tài chính & Nợ
            </button>
          </div>
          <span className="text-[10px] text-text-muted hidden sm:inline">
            Sắp xếp: {sortKey} ({sortOrder === "desc" ? "giảm dần" : "tăng dần"})
          </span>
        </div>

        {/* 3. Screener Table Data Views */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3 bg-panel-2/30">
                <th
                  onClick={() => handleSort("symbol")}
                  className="px-3.5 py-2.5 font-medium cursor-pointer hover:text-accent-primary"
                >
                  Mã {sortKey === "symbol" && (sortOrder === "desc" ? "↓" : "↑")}
                </th>
                <th
                  onClick={() => handleSort("sector")}
                  className="py-2.5 font-medium cursor-pointer hover:text-accent-primary"
                >
                  Ngành
                </th>

                {viewTab === "overview" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("volume")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Khối lượng
                    </th>
                    <th
                      onClick={() => handleSort("marketCap")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vốn hóa (tỷ) {sortKey === "marketCap" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-center font-medium">Tín hiệu MA</th>
                    <th
                      onClick={() => handleSort("compositeScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Orca {sortKey === "compositeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                  </>
                )}

                {viewTab === "quant" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("quantEdgeScore")}
                      className="py-2.5 text-center font-medium cursor-pointer hover:text-cyan-400"
                    >
                      Ưu thế Quant {sortKey === "quantEdgeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-left font-medium">Chiến lược / Dị biệt</th>
                    <th
                      onClick={() => handleSort("ouZScore")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-emerald-400"
                    >
                      OU Z-Score {sortKey === "ouZScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ouHalfLife")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-emerald-400"
                    >
                      Bán rã t½ {sortKey === "ouHalfLife" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("tripleBarrierRiskReward")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-amber-400"
                    >
                      R/R Barrier {sortKey === "tripleBarrierRiskReward" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 text-right font-medium">Chốt lời / Dừng lỗ</th>
                    <th
                      onClick={() => handleSort("beta")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Beta {sortKey === "beta" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("cornishFisherVaR95")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-rose-400"
                    >
                      VaR 95% {sortKey === "cornishFisherVaR95" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-center font-medium">Mô phỏng</th>
                  </>
                )}

                {viewTab === "confluence" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("adx14")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ADX(14)
                    </th>
                    <th className="py-2.5 text-center font-medium">Nén Squeeze</th>
                    <th className="py-2.5 text-center font-medium">SuperTrend</th>
                    <th className="py-2.5 text-left font-medium">Mẫu hình & VSA</th>
                    <th
                      onClick={() => handleSort("confluenceScore")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Hội Tụ {sortKey === "confluenceScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th className="py-2.5 pr-3.5 text-right font-medium">Đánh giá</th>
                  </>
                )}

                {viewTab === "technical" && (
                  <>
                    <th
                      onClick={() => handleSort("price")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Giá {sortKey === "price" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("changePercent")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ± % {sortKey === "changePercent" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ma10")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      MA10 {sortKey === "ma10" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ma20")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      MA20 {sortKey === "ma20" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ma50")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      MA50 {sortKey === "ma50" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("volRatio20")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vol/MA20
                    </th>
                    <th className="py-2.5 text-center font-medium">Tín hiệu MA</th>
                    <th
                      onClick={() => handleSort("compositeScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Orca {sortKey === "compositeScore" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                  </>
                )}

                {viewTab === "valuation" && (
                  <>
                    <th onClick={() => handleSort("price")} className="py-2.5 text-right font-medium">
                      Giá
                    </th>
                    <th
                      onClick={() => handleSort("pe")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      P/E {sortKey === "pe" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("pb")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      P/B {sortKey === "pb" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("ps")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      P/S
                    </th>
                    <th
                      onClick={() => handleSort("dividendYield")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Cổ tức (%) {sortKey === "dividendYield" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("marketCap")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Vốn hóa (tỷ)
                    </th>
                  </>
                )}

                {viewTab === "profitability" && (
                  <>
                    <th
                      onClick={() => handleSort("roe")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ROE (%) {sortKey === "roe" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th
                      onClick={() => handleSort("roa")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      ROA (%)
                    </th>
                    <th onClick={() => handleSort("grossMargin")} className="py-2.5 text-right font-medium">
                      Biên Gộp (%)
                    </th>
                    <th onClick={() => handleSort("netMargin")} className="py-2.5 text-right font-medium">
                      Biên Ròng (%)
                    </th>
                    <th
                      onClick={() => handleSort("revenueYoyPct")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      DT YoY (%)
                    </th>
                    <th
                      onClick={() => handleSort("niYoyPct")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      LNST YoY (%)
                    </th>
                  </>
                )}

                {viewTab === "health" && (
                  <>
                    <th
                      onClick={() => handleSort("debtEquity")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Nợ/Vốn (D/E) {sortKey === "debtEquity" && (sortOrder === "desc" ? "↓" : "↑")}
                    </th>
                    <th onClick={() => handleSort("currentRatio")} className="py-2.5 text-right font-medium">
                      Thanh toán (CR)
                    </th>
                    <th onClick={() => handleSort("fcfTtm")} className="py-2.5 text-right font-medium">
                      FCF TTM (tỷ)
                    </th>
                    <th
                      onClick={() => handleSort("qualityScore")}
                      className="py-2.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Chất lượng BCTC
                    </th>
                    <th
                      onClick={() => handleSort("compositeScore")}
                      className="py-2.5 pr-3.5 text-right font-medium cursor-pointer hover:text-accent-primary"
                    >
                      Điểm Orca
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-8 text-center text-text-muted">
                    <Loading rows={4} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3.5 py-8 text-center text-text-muted">
                    Không có mã nào thỏa mãn tiêu chí bộ lọc. Hãy thử nới lỏng các điều kiện lọc.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.symbol} className="row-hover border-b border-line/40 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/stocks/${row.symbol}`}
                          className="font-bold text-accent-primary hover:underline"
                        >
                          {row.symbol}
                        </Link>
                        {row.exchange && (
                          <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted">
                            {row.exchange}
                          </span>
                        )}
                      </div>
                      <div className="max-w-[140px] truncate text-[10px] text-text-muted">
                        {row.name}
                      </div>
                    </td>
                    <td className="py-2.5 text-[11px] text-text-secondary">{row.sector}</td>

                    {viewTab === "overview" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {fmtCompact(row.volume)}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-text-secondary">
                          {row.marketCap != null ? fmtNum(row.marketCap, 0) : "—"}
                        </td>
                        <td className="py-2.5 text-center">
                          <MaSignalBadge signal={row.maSignal} />
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                              row.compositeScore >= 75
                                ? "bg-emerald-500/15 text-emerald-400"
                                : row.compositeScore >= 50
                                ? "bg-accent-primary/15 text-accent-primary"
                                : "bg-amber-500/15 text-amber-400"
                            }`}
                          >
                            {row.compositeScore}
                          </span>
                        </td>
                      </>
                    )}

                    {viewTab === "quant" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "-"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="py-2.5 text-center">
                          <QuantBadge badge={row.quantBadge} score={row.quantEdgeScore} />
                        </td>
                        <td className="py-2.5 text-left">
                          {row.quantAnomalyTag ? (
                            <span className="inline-block text-[11px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                              {row.quantAnomalyTag}
                            </span>
                          ) : (
                            <span className="text-[11px] text-text-muted">—</span>
                          )}
                        </td>
                        <td className="num py-2.5 text-right">
                          {row.ouZScore != null ? (
                            <span
                              className={`font-semibold ${
                                row.ouZScore <= -1.4
                                  ? "text-emerald-400"
                                  : row.ouZScore >= 1.4
                                  ? "text-rose-400"
                                  : "text-text-primary"
                              }`}
                            >
                              {row.ouZScore > 0 ? `+${row.ouZScore}` : row.ouZScore}σ
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.ouHalfLife != null ? `${row.ouHalfLife} phiên` : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.tripleBarrierRiskReward != null ? (
                            <span
                              className={
                                row.tripleBarrierRiskReward >= 2.0
                                  ? "text-amber-400 font-bold"
                                  : "text-text-primary"
                              }
                            >
                              {fmtNum(row.tripleBarrierRiskReward, 2)}x
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-[11px]">
                          {row.tripleBarrierUpper != null && row.tripleBarrierLower != null ? (
                            <span className="text-text-muted">
                              <span className="text-emerald-400 font-medium">{fmtNum(row.tripleBarrierUpper / 1000, 1)}</span>
                              {" / "}
                              <span className="text-rose-400 font-medium">{fmtNum(row.tripleBarrierLower / 1000, 1)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.beta != null ? fmtNum(row.beta, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.cornishFisherVaR95 != null ? `-${fmtNum(row.cornishFisherVaR95, 1)}%` : "—"}
                        </td>
                        <td className="py-2.5 pr-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => onOpenBacktest ? onOpenBacktest(row.symbol) : undefined}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400 transition-colors"
                          >
                            <Zap className="size-2.5" /> Backtest
                          </button>
                        </td>
                      </>
                    )}

                {viewTab === "confluence" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="num py-2.5 text-right text-text-primary">
                          {row.adx14 != null ? (
                            <span className={row.adx14 >= 25 ? "text-amber-400 font-bold" : "text-text-muted"}>
                              {row.adx14}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <SqueezeBadge state={row.squeezeState} />
                        </td>
                        <td className="py-2.5 text-center">
                          <SuperTrendBadge dir={row.superTrendDir} />
                        </td>
                        <td className="py-2.5 text-left">
                          {row.chartPattern ? (
                            <span className="inline-block rounded bg-accent-primary/10 border border-accent-primary/20 px-2 py-0.5 text-[10px] font-semibold text-accent-primary">
                              {row.chartPattern}
                            </span>
                          ) : (
                            <span className="text-[10px] text-text-muted">—</span>
                          )}
                        </td>
                        <td className="num py-2.5 text-right font-bold text-accent-primary">
                          {row.confluenceScore}
                        </td>
                        <td className="py-2.5 pr-3.5 text-right">
                          <ConfluenceBadge badge={row.confluenceBadge} />
                        </td>
                      </>
                    )}

                    {viewTab === "technical" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <Chg value={row.changePercent} arrow={false} />
                        </td>
                        <td className="num py-2.5 text-right text-text-primary">
                          {row.ma10 != null ? fmtNum(row.ma10, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-primary">
                          {row.ma20 != null ? fmtNum(row.ma20, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.ma50 != null ? fmtNum(row.ma50, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-medium">
                          {row.volRatio20 != null ? (
                            <span className={row.volRatio20 >= 1.3 ? "text-emerald-400 font-bold" : "text-text-muted"}>
                              {row.volRatio20}x
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <MaSignalBadge signal={row.maSignal} />
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                              row.compositeScore >= 75
                                ? "bg-emerald-500/15 text-emerald-400"
                                : row.compositeScore >= 50
                                ? "bg-accent-primary/15 text-accent-primary"
                                : "bg-amber-500/15 text-amber-400"
                            }`}
                          >
                            {row.compositeScore}
                          </span>
                        </td>
                      </>
                    )}

                    {viewTab === "valuation" && (
                      <>
                        <td className="num py-2.5 text-right font-medium">
                          {row.price != null ? fmtNum(row.price, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-semibold text-text-primary">
                          {row.pe != null ? fmtNum(row.pe, 1) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.pb != null ? fmtNum(row.pb, 1) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.ps != null ? fmtNum(row.ps, 1) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-emerald-400 font-medium">
                          {row.dividendYield != null ? `${fmtNum(row.dividendYield, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right text-text-secondary">
                          {row.marketCap != null ? fmtNum(row.marketCap, 0) : "—"}
                        </td>
                      </>
                    )}

                    {viewTab === "profitability" && (
                      <>
                        <td className="num py-2.5 text-right font-semibold text-text-primary">
                          {row.roe != null ? `${fmtNum(row.roe, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.roa != null ? `${fmtNum(row.roa, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.grossMargin != null ? `${fmtNum(row.grossMargin, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.netMargin != null ? `${fmtNum(row.netMargin, 1)}%` : "—"}
                        </td>
                        <td className="num py-2.5 text-right">
                          <Chg value={row.revenueYoyPct} arrow={false} />
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right font-medium">
                          <Chg value={row.niYoyPct} arrow={false} />
                        </td>
                      </>
                    )}

                    {viewTab === "health" && (
                      <>
                        <td className="num py-2.5 text-right font-medium text-text-primary">
                          {row.debtEquity != null ? fmtNum(row.debtEquity, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-secondary">
                          {row.currentRatio != null ? fmtNum(row.currentRatio, 2) : "—"}
                        </td>
                        <td className="num py-2.5 text-right text-text-muted">
                          {row.fcfTtm != null ? fmtNum(row.fcfTtm, 0) : "—"}
                        </td>
                        <td className="num py-2.5 text-right font-medium text-text-secondary">
                          {row.qualityScore != null ? `${row.qualityScore}/100` : "—"}
                        </td>
                        <td className="num py-2.5 pr-3.5 text-right font-bold text-accent-primary">
                          {row.compositeScore}
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Feed View */}
        <div className="divide-y divide-line/50 md:hidden">
          {rows.map((row) => (
            <Link
              key={row.symbol}
              href={`/stocks/${row.symbol}`}
              className="flex items-center justify-between px-3.5 py-3 hover:bg-panel-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-bold text-accent-primary">{row.symbol}</span>
                  {row.exchange && (
                    <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted">
                      {row.exchange}
                    </span>
                  )}
                  {row.maSignal && row.maSignal !== "NEUTRAL" && (
                    <MaSignalBadge signal={row.maSignal} />
                  )}
                  {row.quantEdgeScore != null && row.quantEdgeScore >= 55 && (
                    <QuantBadge badge={row.quantBadge} score={row.quantEdgeScore} />
                  )}
                </div>
                <div className="truncate text-[11px] text-text-muted">{row.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-text-secondary flex-wrap">
                  {row.quantAnomalyTag && (
                    <span className="text-[10px] text-cyan-400 font-medium">[{row.quantAnomalyTag}]</span>
                  )}
                  <span>P/E: {row.pe != null ? fmtNum(row.pe, 1) : "—"}</span>
                  <span>·</span>
                  <span>ROE: {row.roe != null ? `${fmtNum(row.roe, 1)}%` : "—"}</span>
                  <span>·</span>
                  <span>Điểm: {row.compositeScore}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="num block text-[13px] font-semibold">
                  {row.price != null ? fmtNum(row.price, 2) : "—"}
                </span>
                <Chg value={row.changePercent} arrow={false} className="text-[11px]" />
              </div>
            </Link>
          ))}
        </div>

        <div className="border-t border-line px-3.5 py-2">
          <MetaLine meta={meta} />
        </div>
      </Panel>
    </div>
  );
}

export function CryptoScreener() {
  const [url] = useState("/api/v1/screener?universe=crypto&limit=40");
  const { res, data, meta, isLoading } = useApi<{ universe: string; rows: CryptoMarketRow[] }>(url, {
    refreshInterval: 30_000,
    timeoutMs: 5_000,
  });
  const activeRows = data?.rows?.length ? data.rows : [];
  return (
    <Panel title={`Crypto: ${activeRows.length} mã`} pad={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
              <th className="px-3.5 py-2">Mã</th>
              <th className="py-2 text-right">Giá</th>
              <th className="py-2 text-right">24h %</th>
              <th className="py-2 pr-3.5 text-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((r) => (
              <tr key={r.symbol} className="row-hover border-b border-line/40">
                <td className="px-3.5 py-2">
                  <Link href={`/crypto/${r.symbol}`} className="font-semibold hover:text-accent">
                    {r.baseAsset}
                  </Link>
                </td>
                <td className="num py-2 text-right">{fmtNum(r.price, priceDigits(r.price))}</td>
                <td className="py-2 text-right">
                  <Chg value={r.changePercent} arrow={false} />
                </td>
                <td className="num py-2 pr-3.5 text-right text-ink-2">
                  {fmtCompact(r.quoteVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-3.5 py-2">
        <MetaLine meta={meta} />
      </div>
    </Panel>
  );
}
