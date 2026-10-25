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

type ViewTab = "overview" | "valuation" | "profitability" | "health";

const PRESET_TABS: { id: ScreenerPreset; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "all", label: "Tất cả", icon: <Sparkles className="size-3.5" />, desc: "Toàn bộ thị trường" },
  { id: "canslim", label: "CANSLIM", icon: <TrendingUp className="size-3.5 text-accent-primary" />, desc: "Tăng trưởng cao & ROE > 14%" },
  { id: "dividend", label: "Cổ tức cao", icon: <DollarSign className="size-3.5 text-emerald-400" />, desc: "Cổ tức tiền mặt > 5%, nợ an toàn" },
  { id: "growth", label: "Siêu tăng trưởng", icon: <Zap className="size-3.5 text-amber-400" />, desc: "LNST / Doanh thu tăng > 20%" },
  { id: "value", label: "Giá trị rẻ", icon: <ShieldCheck className="size-3.5 text-blue-400" />, desc: "P/E < 11, P/B < 1.3, an toàn" },
  { id: "breakout", label: "Bứt phá vol", icon: <CheckCircle2 className="size-3.5 text-purple-400" />, desc: "Giá tăng > 2% kèm vol lớn" },
];

export function VnScreener({ defaultSector }: { defaultSector: string | null }) {
  // Preset & Tab state
  const [preset, setPreset] = useState<ScreenerPreset>("all");
  const [viewTab, setViewTab] = useState<ViewTab>("overview");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Search & Filter state
  const [q, setQ] = useState("");
  const [exchange, setExchange] = useState("ALL");
  const [sector, setSector] = useState(defaultSector ?? "");
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 border-b border-line p-3.5 bg-panel-3/40 animate-in fade-in duration-200">
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
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-accent-primary">{row.symbol}</span>
                  <span className="rounded bg-panel-3 px-1 py-0.2 text-[9px] text-text-muted">
                    {row.exchange}
                  </span>
                </div>
                <div className="truncate text-[11px] text-text-muted">{row.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-text-secondary">
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
