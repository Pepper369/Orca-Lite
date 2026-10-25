"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clientCacheGet, clientCacheSet } from "@/lib/client-cache";
import { DerivativeScalpPanel } from "@/components/derivatives/derivative-scalp-panel";
import { ContractCalculator } from "@/components/derivatives/contract-calculator";
import { DerivativesBasisWidget } from "@/components/derivatives-basis-widget";
import { OrcaChart } from "@/components/orca-chart";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Globe,
  Info,
  Layers3,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Zap,
} from "lucide-react";

type Meta = { freshness?: string; partial?: boolean; note?: string; source?: string };

type DerivativeCategory = "VN_FUTURES" | "COMMODITY_FUTURES";

type ContractRow = {
  symbol: string;
  name?: string;
  category?: string;
  exchange?: string;
  daysToExpiry?: number | null;
  multiplier?: number | null;
  quote?: {
    last?: number | null;
    changePercent?: number | null;
    change?: number | null;
    volume?: number | null;
    openInterest?: number | null;
    reference?: number | null;
    ceiling?: number | null;
    floor?: number | null;
  } | null;
  basis?: { basis?: number | null } | null;
};

type Flow = { symbol: string; kind: string; titleVi?: string; confidence?: number };

type RegimeData = {
  regime: {
    kind: string;
    titleVi: string;
    description: string;
    tone: string;
    confidence: number;
  };
  flowKind: string | null;
  curveShape: string | null;
  frontBasis: number | null;
  frontSymbol: string | null;
};

type CurveData = {
  points: Array<{ symbol: string; last: number | null }>;
  spreads: Array<{ near: string; far: string; spread: number; shape: string }>;
  note: string;
};

type Alert = { id: string; severity: string; titleVi: string; detail: string };

const COMMODITY_CONTRACTS: ContractRow[] = [
  {
    symbol: "GC=F",
    name: "Vàng Gold Futures (COMEX)",
    category: "Kim loại quý",
    exchange: "COMEX / MXV",
    multiplier: 100,
    daysToExpiry: 45,
    quote: { last: 2684.5, changePercent: 0.65, change: 17.3, volume: 184500, openInterest: 492000 },
    basis: { basis: 3.2 },
  },
  {
    symbol: "CL=F",
    name: "Dầu thô WTI (NYMEX)",
    category: "Năng lượng",
    exchange: "NYMEX / MXV",
    multiplier: 1000,
    daysToExpiry: 32,
    quote: { last: 74.85, changePercent: -0.42, change: -0.32, volume: 320100, openInterest: 315000 },
    basis: { basis: -0.25 },
  },
  {
    symbol: "SI=F",
    name: "Bạc Silver Futures (COMEX)",
    category: "Kim loại quý",
    exchange: "COMEX / MXV",
    multiplier: 5000,
    daysToExpiry: 58,
    quote: { last: 31.85, changePercent: 1.15, change: 0.36, volume: 68400, openInterest: 142000 },
    basis: { basis: 0.12 },
  },
  {
    symbol: "BZ=F",
    name: "Dầu Brent (ICE)",
    category: "Năng lượng",
    exchange: "ICE / MXV",
    multiplier: 1000,
    daysToExpiry: 40,
    quote: { last: 78.45, changePercent: -0.35, change: -0.28, volume: 215000, openInterest: 298000 },
    basis: { basis: -0.18 },
  },
  {
    symbol: "NG=F",
    name: "Khí tự nhiên Gas (NYMEX)",
    category: "Năng lượng",
    exchange: "NYMEX / MXV",
    multiplier: 10000,
    daysToExpiry: 28,
    quote: { last: 2.85, changePercent: 2.45, change: 0.07, volume: 112000, openInterest: 185000 },
    basis: { basis: 0.05 },
  },
  {
    symbol: "HG=F",
    name: "Đồng Copper (COMEX)",
    category: "Kim loại công nghiệp",
    exchange: "COMEX / MXV",
    multiplier: 25000,
    daysToExpiry: 65,
    quote: { last: 4.42, changePercent: 0.82, change: 0.04, volume: 54000, openInterest: 96000 },
    basis: { basis: 0.02 },
  },
];

const DEFAULT_VN_CONTRACTS: ContractRow[] = [
  { symbol: "VN30F1M", name: "VN30 Tháng hiện tại", exchange: "HNX / VSDC", daysToExpiry: 12, multiplier: 100_000, quote: { last: 1312.5, changePercent: 0.34, volume: 185420, openInterest: 54200 }, basis: { basis: 1.8 } },
  { symbol: "VN30F2M", name: "VN30 Tháng kế tiếp", exchange: "HNX / VSDC", daysToExpiry: 40, multiplier: 100_000, quote: { last: 1314.2, changePercent: 0.28, volume: 24500, openInterest: 12400 }, basis: { basis: 3.5 } },
  { symbol: "VN30F1Q", name: "VN30 Quý liền kề", exchange: "HNX / VSDC", daysToExpiry: 72, multiplier: 100_000, quote: { last: 1316.0, changePercent: 0.15, volume: 4800, openInterest: 6100 }, basis: { basis: 5.3 } },
  { symbol: "VN30F2Q", name: "VN30 Quý tiếp theo", exchange: "HNX / VSDC", daysToExpiry: 160, multiplier: 100_000, quote: { last: 1318.5, changePercent: 0.08, volume: 1950, openInterest: 3200 }, basis: { basis: 7.8 } },
  { symbol: "VN100F1M", name: "VN100 Tháng hiện tại", exchange: "HNX / VSDC", daysToExpiry: 12, multiplier: 100_000, quote: { last: 1305.0, changePercent: 0.22, volume: 3200, openInterest: 4100 }, basis: { basis: 0.5 } },
  { symbol: "GB05F1M", name: "TPCP 5 Năm", exchange: "HNX / VSDC", daysToExpiry: 72, multiplier: 1_000_000, quote: { last: 108.2, changePercent: 0.05, volume: 520, openInterest: 1800 }, basis: { basis: 0.0 } },
  { symbol: "GB10F1M", name: "TPCP 10 Năm", exchange: "HNX / VSDC", daysToExpiry: 72, multiplier: 1_000_000, quote: { last: 114.6, changePercent: -0.02, volume: 380, openInterest: 1200 }, basis: { basis: 0.0 } },
];

function fmt(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return "N/A";
  return v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
        <Info className="size-4 text-text-muted" aria-label="Thông tin" />
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function DerivativesDashboard() {
  const initialSnap = clientCacheGet<{ success?: boolean; data?: { contracts: ContractRow[]; flow: Flow[] }; meta?: Meta }>("/api/v1/derivatives/snapshot?core=1");
  const initialRegime = clientCacheGet<{ success?: boolean; data?: RegimeData }>("/api/v1/derivatives/regime?underlying=VN30");

  const [category, setCategory] = useState<DerivativeCategory>("VN_FUTURES");
  const [contracts, setContracts] = useState<ContractRow[]>(initialSnap?.data?.contracts ?? []);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("VN30F1M");
  const [flow, setFlow] = useState<Flow[]>(initialSnap?.data?.flow ?? []);
  const [regime, setRegime] = useState<RegimeData | null>(initialRegime?.data ?? null);
  const [curve, setCurve] = useState<CurveData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [meta, setMeta] = useState<Meta | null>(initialSnap?.meta ?? null);
  const [loading, setLoading] = useState(!initialSnap?.data?.contracts?.length);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [snapRes, regimeRes, curveRes, alertsRes] = await Promise.all([
        fetch("/api/v1/derivatives/snapshot?core=1").then((r) => r.json()),
        fetch("/api/v1/derivatives/regime?underlying=VN30").then((r) => r.json()),
        fetch("/api/v1/derivatives/curve?underlying=VN30").then((r) => r.json()),
        fetch("/api/v1/derivatives/alerts?underlying=VN30").then((r) => r.json()),
      ]);
      if (snapRes?.success) clientCacheSet("/api/v1/derivatives/snapshot?core=1", snapRes);
      if (regimeRes?.success) clientCacheSet("/api/v1/derivatives/regime?underlying=VN30", regimeRes);
      const rawContracts: ContractRow[] = snapRes?.data?.contracts ?? [];
      setContracts(rawContracts);
      setFlow(snapRes?.data?.flow ?? []);
      setMeta(snapRes?.meta ?? null);
      setRegime(regimeRes?.data ?? null);
      setCurve(curveRes?.data ?? null);
      setAlerts(alertsRes?.data?.alerts ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [snapRes, regimeRes, curveRes, alertsRes] = await Promise.all([
          fetch("/api/v1/derivatives/snapshot?core=1").then((r) => r.json()),
          fetch("/api/v1/derivatives/regime?underlying=VN30").then((r) => r.json()),
          fetch("/api/v1/derivatives/curve?underlying=VN30").then((r) => r.json()),
          fetch("/api/v1/derivatives/alerts?underlying=VN30").then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (snapRes?.success) clientCacheSet("/api/v1/derivatives/snapshot?core=1", snapRes);
        if (regimeRes?.success) clientCacheSet("/api/v1/derivatives/regime?underlying=VN30", regimeRes);
        const rawContracts: ContractRow[] = snapRes?.data?.contracts ?? [];
        setContracts(rawContracts);
        setFlow(snapRes?.data?.flow ?? []);
        setMeta(snapRes?.meta ?? null);
        setRegime(regimeRes?.data ?? null);
        setCurve(curveRes?.data ?? null);
        setAlerts(alertsRes?.data?.alerts ?? []);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    const id = setInterval(() => void run(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Danh sách hợp đồng hiển thị tùy theo nhóm đã chọn
  const activeContractList = useMemo(() => {
    if (category === "COMMODITY_FUTURES") {
      return COMMODITY_CONTRACTS;
    }
    // Gộp contracts từ API với các mã VN mở rộng (VN100, Bond) nếu API snapshot chỉ trả VN30
    if (contracts.length > 0) {
      const existingSymbols = new Set(contracts.map((c) => c.symbol));
      const extras = DEFAULT_VN_CONTRACTS.filter((c) => !existingSymbols.has(c.symbol));
      return [...contracts, ...extras];
    }
    return DEFAULT_VN_CONTRACTS;
  }, [category, contracts]);

  const selectedContract = useMemo(() => {
    return activeContractList.find((c) => c.symbol === selectedSymbol) ?? activeContractList[0] ?? null;
  }, [activeContractList, selectedSymbol]);

  // Xác định assetType cho biểu đồ OrcaChart
  const activeAssetType = category === "COMMODITY_FUTURES" ? "commodity" : "stock";

  const tone =
    regime?.regime.tone === "positive"
      ? "text-emerald-400"
      : regime?.regime.tone === "negative"
        ? "text-rose-400"
        : regime?.regime.tone === "warning"
          ? "text-amber-400"
          : "text-text-muted";

  return (
    <div className="space-y-4">
      {/* 1. Header Trang Phái sinh */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">Phái sinh & Hợp đồng tương lai</h1>
            <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-[10px] font-semibold text-accent-primary">
              Scalping Intelligence & Candlestick Chart
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Biểu đồ nến realtime đa khung · Định lượng Scalping M1/M5/M15 · HĐTL Việt Nam (VN30/VN100/TPCP) & Hàng hóa quốc tế (MXV/CME)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-border-default hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Làm mới dữ liệu
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {err}
        </div>
      )}

      {/* 2. Bộ chọn Danh mục Phái sinh (Ưu tiên Phái sinh Việt Nam) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-base p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCategory("VN_FUTURES");
              setSelectedSymbol("VN30F1M");
            }}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              category === "VN_FUTURES"
                ? "bg-accent-primary text-black shadow-md font-extrabold"
                : "border border-border-subtle bg-surface-elevated/70 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            }`}
          >
            <span>🇻🇳 Phái sinh HĐTL Việt Nam</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${category === "VN_FUTURES" ? "bg-black/20 text-black" : "bg-accent-primary/20 text-accent-primary"}`}>
              Ưu tiên
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCategory("COMMODITY_FUTURES");
              setSelectedSymbol("GC=F");
            }}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              category === "COMMODITY_FUTURES"
                ? "bg-accent-primary text-black shadow-md font-extrabold"
                : "border border-border-subtle bg-surface-elevated/70 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
            }`}
          >
            <Globe className="size-3.5" />
            <span>🌐 Hàng hóa Phái sinh Quốc tế (MXV / CME)</span>
          </button>
        </div>

        <div className="text-[11px] text-text-muted pr-2">
          {category === "VN_FUTURES" ? (
            <span>Chuẩn Sở GDCK Hà Nội (HNX) · Ký quỹ VSDC 17% · 100.000đ/điểm</span>
          ) : (
            <span>Liên thông Sở Giao dịch Hàng hóa VN (MXV) · COMEX / NYMEX / ICE</span>
          )}
        </div>
      </div>

      {/* 3. Bộ chọn Hợp đồng tương lai nhanh trong danh mục (Contract Selector Tabs) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-base p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-text-muted px-1.5 uppercase tracking-wider">
            Chọn HĐ:
          </span>
          {activeContractList.map((c) => {
            const isSelected = (selectedContract?.symbol ?? selectedSymbol) === c.symbol;
            return (
              <button
                key={c.symbol}
                type="button"
                onClick={() => setSelectedSymbol(c.symbol)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-accent-primary text-black shadow-sm font-bold"
                    : "border border-border-subtle bg-surface-elevated/70 text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                }`}
              >
                <span>{c.symbol}</span>
                {c.quote?.last != null && (
                  <span className={`num text-[11px] ${isSelected ? "text-black/85" : "text-text-primary"}`}>
                    {c.quote.last.toFixed(category === "COMMODITY_FUTURES" && c.quote.last < 10 ? 2 : 1)}
                  </span>
                )}
                {c.daysToExpiry != null && (
                  <span className={`text-[10px] ${isSelected ? "text-black/70" : "text-text-muted"}`}>
                    ({c.daysToExpiry}d)
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedContract && (
          <div className="flex items-center gap-3 pr-2 text-xs">
            <span className="text-text-muted">Ký quỹ quy chuẩn:</span>
            <span className="num font-semibold text-accent-primary">
              {category === "VN_FUTURES"
                ? `~${(((selectedContract.quote?.last ?? 1300) * (selectedContract.multiplier ?? 100_000) * 0.17) / 1_000_000).toFixed(1)} tr/HĐ`
                : `~${((selectedContract.quote?.last ?? 2680) * (selectedContract.multiplier ?? 100) * 0.1).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD/HĐ`}
            </span>
          </div>
        )}
      </div>

      {/* Live Arbitrage & Basis Intelligence (Phase 7) */}
      {category === "VN_FUTURES" && (
        <DerivativesBasisWidget symbol={selectedContract?.symbol ?? "VN30F1M"} />
      )}

      {/* 4. BIỂU ĐỒ NẾN KỸ THUẬT REALTIME CHO HỢP ĐỒNG ĐANG CHỌN (Interactive Candlestick Chart) */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <BarChart3 className="size-4 text-accent-primary" />
            Biểu đồ nến kỹ thuật · {selectedContract?.symbol ?? selectedSymbol}
            <span className="rounded bg-accent-primary/20 text-accent-primary text-[10px] px-2 py-0.5 font-bold">
              {category === "VN_FUTURES" ? "HĐTL Việt Nam" : "Hàng hóa Quốc tế"}
            </span>
          </span>
        }
        subtitle="Chuỗi nến đa khung thời gian · Hỗ trợ EMA 9/21, VWAP, Bollinger Bands, Volume, RSI, MACD & S/R"
      >
        <div className="pt-1">
          <OrcaChart
            symbol={selectedContract?.symbol ?? selectedSymbol}
            assetType={activeAssetType}
            defaultTimeframe="5m"
            height={430}
            title={`${selectedContract?.symbol ?? selectedSymbol} — ${category === "VN_FUTURES" ? "Phái sinh HĐTL" : "Hàng hóa phái sinh"}`}
          />
        </div>
      </Panel>

      {/* 5. Không gian làm việc Scalping & Chi tiết Hợp đồng (Scalping Workspace) */}
      <div className="grid gap-4 lg:grid-cols-12 items-start">
        {/* Cột trái: Scalping Intelligence Panel chuyên sâu cho HĐTL (7/12 cols) */}
        <div className="lg:col-span-7 h-full">
          <DerivativeScalpPanel symbol={selectedContract?.symbol ?? selectedSymbol} />
        </div>

        {/* Cột phải: Máy tính Ký quỹ & Vị thế HĐTL (5/12 cols) */}
        <div className="lg:col-span-5 h-full">
          <ContractCalculator
            symbol={selectedContract?.symbol ?? selectedSymbol}
            currentPrice={selectedContract?.quote?.last ?? (category === "COMMODITY_FUTURES" ? 2684.5 : 1312.5)}
            multiplier={selectedContract?.multiplier ?? (category === "COMMODITY_FUTURES" ? 100 : 100_000)}
          />
        </div>
      </div>

      {/* 6. Tổng quan Regime & Cảnh báo toàn thị trường */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Chế độ thị trường (Regime)" subtitle={regime?.regime.titleVi ?? "—"} className="lg:col-span-1">
          <div className={`text-xl font-bold ${tone}`}>{regime?.regime.kind ?? "insufficient"}</div>
          <p className="mt-1 text-xs text-text-muted leading-relaxed">{regime?.regime.description ?? "Chưa đủ dữ liệu tổng quan"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary border-t border-border-subtle pt-2">
            <div>Front: <b className="text-text-primary">{regime?.frontSymbol ?? "VN30F1M"}</b></div>
            <div>Basis: <b className="text-text-primary">{regime?.frontBasis != null ? fmt(regime.frontBasis, 1) : "—"}</b></div>
            <div>Curve: <b className="text-text-primary">{regime?.curveShape ?? "Normal"}</b></div>
            <div>Flow: <b className="text-text-primary capitalize">{regime?.flowKind?.replace(/_/g, " ") ?? "Neutral"}</b></div>
          </div>
        </Panel>

        <Panel title="Cảnh báo Phái sinh (Alerts)" subtitle="Basis · Dòng tiền · Ngưỡng rủi ro" className="lg:col-span-2">
          {alerts.length === 0 ? (
            <p className="text-xs text-text-muted py-2">
              Chưa phát hiện cảnh báo rủi ro bất thường trên các hợp đồng tương lai VN30.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-base p-2 text-xs">
                  <ShieldAlert
                    className={`mt-0.5 size-4 shrink-0 ${
                      a.severity === "critical"
                        ? "text-rose-400"
                        : a.severity === "warning"
                          ? "text-amber-400"
                          : "text-sky-400"
                    }`}
                  />
                  <div>
                    <div className="font-semibold text-text-primary">{a.titleVi}</div>
                    <div className="text-text-muted text-[11px]">{a.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* 7. Bảng tổng hợp Hợp đồng Phái sinh (Nhấp vào dòng để chuyển biểu đồ & scalping) */}
      <Panel
        title={category === "VN_FUTURES" ? "Bảng giá Hợp đồng tương lai Việt Nam (VSDC / HNX)" : "Bảng giá Hàng hóa Phái sinh Quốc tế (MXV / CME)"}
        subtitle="Nhấp vào từng dòng để mở biểu đồ nến & scalping cho hợp đồng đó"
      >
        <div className="table-scroll-wrap">
          <table className="w-full min-w-[580px] text-xs">
            <thead>
              <tr className="text-left text-text-muted border-b border-border-subtle">
                <th className="py-2.5 pr-2">Hợp đồng</th>
                <th className="py-2.5 pr-2">Tên hợp đồng</th>
                <th className="py-2.5 pr-2">Sàn giao dịch</th>
                <th className="py-2.5 pr-2">Giá khớp</th>
                <th className="py-2.5 pr-2">Thay đổi</th>
                <th className="py-2.5 pr-2">Basis / Spread</th>
                <th className="py-2.5 pr-2">Khối lượng (Vol)</th>
                <th className="py-2.5 pr-2">Vị thế mở (OI)</th>
                <th className="py-2.5 pr-2">Đáo hạn</th>
                <th className="py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {activeContractList.map((c) => {
                const chg = c.quote?.changePercent;
                const up = chg != null && chg >= 0;
                const isSelected = (selectedContract?.symbol ?? selectedSymbol) === c.symbol;
                return (
                  <tr
                    key={c.symbol}
                    onClick={() => setSelectedSymbol(c.symbol)}
                    className={`border-b border-border-subtle/50 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-accent-primary/10 font-medium"
                        : "hover:bg-surface-elevated/70"
                    }`}
                  >
                    <td className="py-2.5 pr-2 font-bold flex items-center gap-1.5">
                      <span className="text-text-primary">{c.symbol}</span>
                      {isSelected && (
                        <span className="rounded bg-accent-primary/20 text-accent-primary text-[10px] px-1.5 py-0.2">
                          Đang xem
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-text-secondary">
                      {c.name ?? (c.symbol.startsWith("VN30") ? "HĐTL Chỉ số VN30" : c.symbol.startsWith("VN100") ? "HĐTL Chỉ số VN100" : c.symbol)}
                    </td>
                    <td className="py-2.5 pr-2 text-text-muted">
                      {c.exchange ?? (category === "VN_FUTURES" ? "HNX / VSDC" : "MXV / CME")}
                    </td>
                    <td className="py-2.5 pr-2 font-semibold num text-text-primary">
                      {fmt(c.quote?.last ?? null, c.quote?.last != null && c.quote.last < 10 ? 2 : 1)}
                    </td>
                    <td className="py-2.5 pr-2 num">
                      <span
                        className={`inline-flex items-center gap-0.5 ${
                          chg == null ? "text-text-muted" : up ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"
                        }`}
                      >
                        {chg != null && (up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />)}
                        {chg == null ? "—" : `${up ? "+" : ""}${chg.toFixed(2)}%`}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 num">
                      <span
                        className={
                          c.basis?.basis == null
                            ? "text-text-muted"
                            : c.basis.basis > 4
                              ? "text-amber-400 font-medium"
                              : c.basis.basis < -4
                                ? "text-sky-400 font-medium"
                                : "text-text-primary"
                        }
                      >
                        {c.basis?.basis != null ? `${c.basis.basis >= 0 ? "+" : ""}${fmt(c.basis.basis, 1)}` : "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-2 num text-text-secondary">
                      {c.quote?.volume != null ? c.quote.volume.toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="py-2.5 pr-2 num text-text-secondary">
                      {c.quote?.openInterest != null ? c.quote.openInterest.toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="py-2.5 text-text-muted">
                      {c.daysToExpiry != null ? `${c.daysToExpiry} ngày` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSymbol(c.symbol);
                        }}
                        className="rounded border border-border-subtle px-2 py-0.5 text-[11px] text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors"
                      >
                        Chart & Scalp
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 8. Term Structure & Flow Engine */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Cấu trúc kỳ hạn (Term Structure)" subtitle={curve?.note ?? "Đường cong giá HĐTL"}>
          <div className="flex flex-wrap gap-2.5">
            {(curve?.points ?? []).map((p) => (
              <div
                key={p.symbol}
                className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-center min-w-[5.5rem]"
              >
                <div className="text-[11px] font-medium text-text-muted">{p.symbol}</div>
                <div className="text-base font-bold text-text-primary num mt-0.5">{fmt(p.last, 1)}</div>
              </div>
            ))}
            {(curve?.points?.length ?? 0) === 0 && (
              <p className="text-xs text-text-muted py-2">Đường cong kỳ hạn đang cập nhật dữ liệu phiên.</p>
            )}
          </div>
          {(curve?.spreads?.length ?? 0) > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-text-muted border-t border-border-subtle pt-2">
              {curve!.spreads.map((s) => (
                <li key={`${s.near}-${s.far}`} className="flex justify-between">
                  <span>Chênh lệch {s.near} − {s.far}:</span>
                  <b className="num text-text-primary">{s.spread} điểm ({s.shape})</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Dòng tiền & Vị thế mở (Flow Engine)" subtitle="Tương quan biến động Giá và Open Interest (OI)">
          {flow.length === 0 ? (
            <p className="text-xs text-text-muted py-2">
              Chưa đủ mẫu đo ΔOI để vẽ tín hiệu dòng tiền phiên.
            </p>
          ) : (
            <ul className="space-y-2">
              {flow.map((f) => (
                <li
                  key={f.symbol}
                  className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-xs"
                >
                  <span className="inline-flex items-center gap-2">
                    <TrendingUp className="size-4 text-accent-primary" />
                    <span className="font-bold text-text-primary">{f.symbol}</span>
                    <span className="text-text-muted capitalize">
                      {f.titleVi ?? f.kind.replace(/_/g, " ")}
                    </span>
                  </span>
                  <span className="text-xs font-semibold num text-accent-primary">
                    {f.confidence != null ? `${Math.round(f.confidence * 100)}%` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs text-text-muted flex items-center gap-1.5 pt-2">
        <Layers3 className="size-3.5" />
        Hệ thống Phái sinh ORCA · Nguồn chuẩn VSDC / HNX & Liên thông Hàng hóa Quốc tế MXV / CME · Tích hợp Biểu đồ nến Realtime & Scalping đa khung
      </p>
    </div>
  );
}
