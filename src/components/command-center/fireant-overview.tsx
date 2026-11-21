"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { ChartMarketData } from "@/lib/chart-const";
import type { MarketIntel } from "@/lib/services/market-intel";
import type { IndexQuote, Meta, Quote } from "@/lib/types";
import { sectorOf } from "@/lib/vn/master";
import { fmtNum, FreshnessDot } from "@/components/ui";
import { LiveBotCockpit } from "@/components/live-bot-cockpit";
import type {
  GlobalAsiaRow,
  GlobalCryptoRow,
  GlobalUsRow,
} from "@/components/command-center/phase2-global";
import type { LiquiditySparkSeries } from "@/components/command-center/phase3-extras";
import {
  Bot,
  Newspaper,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sparkles,
} from "lucide-react";

type OverviewSubTab = "market" | "bot";
type ChartTf = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";
type HeatmapWeightMode = "cap" | "turnover" | "change";

const TF_CONFIG: Record<ChartTf, { timeframe: string; limit: number }> = {
  "1D": { timeframe: "5m", limit: 78 },
  "1W": { timeframe: "15m", limit: 120 },
  "1M": { timeframe: "1d", limit: 25 },
  "3M": { timeframe: "1d", limit: 65 },
  "6M": { timeframe: "1d", limit: 130 },
  "1Y": { timeframe: "1d", limit: 260 },
};

const CORE_INDEX_ORDER = [
  { code: "VNINDEX", label: "VN-Index", chartSymbol: "VNINDEX" },
  { code: "VN30", label: "VN30", chartSymbol: "VN30" },
  { code: "HNX", label: "HNX-Index", chartSymbol: "HNXINDEX" },
  { code: "HNX30", label: "HNX30", chartSymbol: "HNX30" },
  { code: "UPCOM", label: "UPCoM-Index", chartSymbol: "UPCOM" },
  { code: "VN30F1M", label: "VN30F1M", chartSymbol: "VN30F1M" },
] as const;

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

function colorForChange(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-text-muted";
  if (v > 0.01) return "text-up";
  if (v < -0.01) return "text-down";
  return "text-warn";
}

function heatmapTileBg(changePct: number): string {
  if (changePct >= 6.5) return "#a855f7"; // Trần
  if (changePct <= -6.5) return "#06b6d4"; // Sàn
  if (changePct >= 3.0) return "#15803d";
  if (changePct >= 1.2) return "#166534";
  if (changePct > 0.05) return "#1d4f38";
  if (changePct <= -3.0) return "#b91c1c";
  if (changePct <= -1.2) return "#991b1b";
  if (changePct < -0.05) return "#6b252a";
  return "#5c5326"; // Tham chiếu
}

function formatBillionVnd(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  const ty = Math.abs(val) > 1e7 ? val / 1e9 : val;
  return `${ty > 0 ? "+" : ""}${ty.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
}

function formatBillionVndUnsigned(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  const ty = Math.abs(val) > 1e7 ? val / 1e9 : val;
  return `${ty.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`;
}

function timeAgoVi(isoOrTs?: string | number | null): string {
  if (!isoOrTs) return "";
  const ms = typeof isoOrTs === "number" ? isoOrTs : Date.parse(isoOrTs);
  if (!Number.isFinite(ms)) return "";
  const diffMin = Math.max(1, Math.round((Date.now() - ms) / 60_000));
  if (diffMin < 60) return `${diffMin} phút trước`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `Khoảng ${h} tiếng`;
  return `${Math.round(h / 24)} ngày trước`;
}

/** Deterministic lightweight sparkline SVG for each index card */
function MiniIndexSpark({ changePct, seed }: { changePct: number | null | undefined; seed: number }) {
  const isUp = (changePct ?? 0) >= 0;
  const stroke = (changePct ?? 0) > 0.01 ? "#22c55e" : (changePct ?? 0) < -0.01 ? "#ef4444" : "#eab308";
  const pts = useMemo(() => {
    const out: number[] = [];
    let y = 16;
    const drift = isUp ? -0.35 : 0.35;
    for (let i = 0; i < 18; i++) {
      const wave = Math.sin((i + 1) * 0.9 + seed) * 3.2 + Math.cos((i + 2) * 1.4 + seed) * 1.8;
      y = Math.max(4, Math.min(28, 16 + drift * i + wave));
      out.push(y);
    }
    return out.map((py, idx) => `${(idx * (64 / 17)).toFixed(1)},${py.toFixed(1)}`).join(" ");
  }, [isUp, seed]);

  return (
    <svg viewBox="0 0 64 32" className="h-8 w-16 shrink-0" aria-hidden="true">
      <line x1="0" y1="16" x2="64" y2="16" stroke="rgba(148,163,184,0.22)" strokeDasharray="2 2" strokeWidth="1" />
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

/** Interactive Lightweight Chart matching FireAnt's Index Chart panel */
function FireAntIndexChart({
  symbol,
  label,
  quote,
  sessionLabel,
}: {
  symbol: string;
  label: string;
  quote: IndexQuote | null;
  sessionLabel: string;
}) {
  const [tf, setTf] = useState<ChartTf>("1M");
  const hostRef = useRef<HTMLDivElement>(null);

  const cfg = TF_CONFIG[tf];
  const { data, isLoading } = useApi<ChartMarketData>(
    `/api/v1/chart/history?symbol=${encodeURIComponent(symbol)}&assetType=stock&timeframe=${cfg.timeframe}&limit=${cfg.limit}`,
    { refreshInterval: 30_000, keepPreviousData: true },
  );

  const isDown = (quote?.changePercent ?? 0) < -0.01;
  const lineColor = isDown ? "#ef4444" : "#22c55e";
  const topColor = isDown ? "rgba(239, 68, 68, 0.22)" : "rgba(34, 197, 94, 0.22)";
  const bottomColor = isDown ? "rgba(239, 68, 68, 0.0)" : "rgba(34, 197, 94, 0.0)";

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !data?.candles?.length) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let chart: ReturnType<typeof import("lightweight-charts").createChart> | null = null;

    (async () => {
      const lw = await import("lightweight-charts");
      if (cancelled || !hostRef.current) return;

      const cs = getComputedStyle(document.documentElement);
      const surfaceBg = cs.getPropertyValue("--color-surface-primary").trim() || "#0d1528";
      const textMuted = cs.getPropertyValue("--color-text-secondary").trim() || "#9aadc8";
      const borderSubtle = cs.getPropertyValue("--color-border-subtle").trim() || "#1a2744";

      chart = lw.createChart(hostRef.current, {
        width: hostRef.current.clientWidth || 560,
        height: 256,
        layout: {
          background: { type: lw.ColorType.Solid, color: surfaceBg },
          textColor: textMuted,
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(148, 163, 184, 0.1)" },
          horzLines: { color: "rgba(148, 163, 184, 0.1)" },
        },
        rightPriceScale: {
          borderColor: borderSubtle,
          scaleMargins: { top: 0.1, bottom: 0.22 },
        },
        timeScale: {
          borderColor: borderSubtle,
          timeVisible: tf === "1D" || tf === "1W",
        },
        crosshair: {
          mode: lw.CrosshairMode.Normal,
        },
      });

      const areaSeries = chart.addSeries(lw.AreaSeries, {
        lineColor,
        topColor,
        bottomColor,
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      });

      const volSeries = chart.addSeries(lw.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      const seen = new Set<number>();
      const sorted = [...data.candles]
        .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close) && b.close > 0)
        .sort((a, b) => a.time - b.time)
        .filter((b) => {
          const t = b.time > 1e11 ? Math.floor(b.time / 1000) : Math.floor(b.time);
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        });

      const areaPts = sorted.map((b) => ({
        time: (b.time > 1e11 ? Math.floor(b.time / 1000) : Math.floor(b.time)) as import("lightweight-charts").UTCTimestamp,
        value: b.close,
      }));
      const volPts = sorted.map((b) => ({
        time: (b.time > 1e11 ? Math.floor(b.time / 1000) : Math.floor(b.time)) as import("lightweight-charts").UTCTimestamp,
        value: Math.max(0, b.volume ?? 0),
        color: b.close >= b.open ? "rgba(34, 197, 94, 0.28)" : "rgba(239, 68, 68, 0.28)",
      }));

      areaSeries.setData(areaPts);
      volSeries.setData(volPts);

      const refPrice =
        quote?.value != null && quote?.change != null
          ? quote.value - quote.change
          : sorted[0]?.open ?? null;
      if (refPrice && Number.isFinite(refPrice)) {
        areaSeries.createPriceLine({
          price: refPrice,
          color: "#eab308",
          lineWidth: 1,
          lineStyle: lw.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "TC",
        });
      }

      chart.timeScale().fitContent();

      ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w && w > 100 && chart) {
          chart.applyOptions({ width: Math.floor(w) });
        }
      });
      ro.observe(hostRef.current);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      if (chart) {
        try {
          chart.remove();
        } catch {
          /* ignore */
        }
      }
    };
  }, [data, lineColor, topColor, bottomColor, quote?.change, quote?.value, tf]);

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-primary flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <Link
            href={`/market/index/${encodeURIComponent(symbol)}`}
            className="text-[13px] font-bold text-text-primary hover:text-accent-primary"
          >
            {label}
          </Link>
          <span className={`font-mono text-[12px] font-semibold ${colorForChange(quote?.changePercent)}`}>
            {fmtSigned(quote?.change, 2)} ({fmtPct(quote?.changePercent, 2)})
          </span>
          <span className="text-[10.5px] text-text-muted">so với tham chiếu</span>
          <span className="inline-flex items-center gap-1 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-secondary">
            <span className="size-1.5 rounded-full bg-amber-400" />
            {sessionLabel}
          </span>
        </div>

        <div className="inline-flex items-center gap-0.5 rounded bg-background-secondary p-0.5">
          {(Object.keys(TF_CONFIG) as ChartTf[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTf(k)}
              className={`rounded px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                tf === k
                  ? "bg-accent-primary text-white"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[256px] w-full">
        <div ref={hostRef} className="h-full w-full" />
        {isLoading && !data?.candles?.length && (
          <div className="absolute inset-0 flex items-center justify-center text-[11.5px] text-text-muted">
            Đang tải dữ liệu biểu đồ {label}...
          </div>
        )}
      </div>
    </section>
  );
}

/** FireAnt-style 5-row Session Statistics Card */
function SessionStatsCard({
  intel,
  quotes,
  liquiditySpark,
}: {
  intel: MarketIntel;
  quotes: Quote[];
  liquiditySpark: LiquiditySparkSeries;
}) {
  const b = intel.breadth;
  const totalBreadth = Math.max(1, (b.advancers ?? 0) + (b.unchanged ?? 0) + (b.decliners ?? 0));
  const upPct = ((b.advancers ?? 0) / totalBreadth) * 100;
  const flatPct = ((b.unchanged ?? 0) / totalBreadth) * 100;
  const downPct = ((b.decliners ?? 0) / totalBreadth) * 100;

  const ceilCount = useMemo(() => quotes.filter((q) => (q.changePercent ?? 0) >= 6.5).length, [quotes]);
  const floorCount = useMemo(() => quotes.filter((q) => (q.changePercent ?? 0) <= -6.5).length, [quotes]);

  const liqVal = intel.liquidity.valueTraded;
  const liqBase = intel.liquidity.baseline;
  const liqRatioPct =
    liqVal != null && liqBase != null && liqBase > 0
      ? Math.round(((liqVal - liqBase) / liqBase) * 100)
      : null;
  const liqProgressPct =
    liqVal != null && liqBase != null && liqBase > 0
      ? Math.min(100, Math.max(8, (liqVal / (liqBase * 1.25)) * 100))
      : 62;

  const sparkBars = useMemo(() => {
    const vols = liquiditySpark?.volumes ?? [];
    if (vols.length >= 6) {
      const slice = vols.slice(-16);
      const maxV = Math.max(...slice.map((v) => Math.abs(v)), 1);
      return slice.map((v, i) => ({
        h: Math.max(15, Math.round((Math.abs(v) / maxV) * 100)),
        pos: i % 3 !== 0 ? (intel.flow.foreignNet ?? 0) >= 0 : (intel.flow.foreignNet ?? 0) < 0,
      }));
    }
    return [];
  }, [liquiditySpark, intel.flow.foreignNet]);

  const pulseScore = Math.round(intel.condition?.score ?? 50);

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-primary flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[12.5px] font-bold text-text-primary">Thống kê phiên</h3>
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
            HSX
          </span>
        </div>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1 rounded bg-accent-primary/15 px-2 py-0.5 text-[10.5px] font-semibold text-accent-primary hover:bg-accent-primary/25 transition-colors"
        >
          <Sparkles className="size-3" />
          Hỏi AI Orca
        </Link>
      </div>

      <div className="divide-y divide-border-subtle px-3 text-[11.5px]">
        {/* 1. Độ rộng */}
        <div className="py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Độ rộng</span>
            <span className="font-mono text-[10.5px]">
              <span className="text-[#c084fc] font-semibold">{ceilCount} trần</span>
              <span className="mx-1 text-text-muted">·</span>
              <span className="text-[#22d3ee] font-semibold">{floorCount} sàn</span>
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-background-secondary">
            <div style={{ width: `${upPct}%` }} className="bg-up" />
            <div style={{ width: `${flatPct}%` }} className="bg-warn" />
            <div style={{ width: `${downPct}%` }} className="bg-down" />
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-up font-semibold">{b.advancers ?? 0} tăng</span>
            <span className="text-warn font-semibold">{b.unchanged ?? 0} đứng giá</span>
            <span className="text-down font-semibold">{b.decliners ?? 0} giảm</span>
          </div>
        </div>

        {/* 2. Thanh khoản khớp lệnh */}
        <div className="py-2.5 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-text-muted">Thanh khoản khớp lệnh</span>
            <span className="font-mono text-[13px] font-bold text-white">
              {formatBillionVndUnsigned(liqVal)}
            </span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-background-secondary">
            <div
              style={{ width: `${liqProgressPct}%` }}
              className="h-full rounded-full bg-accent-primary"
            />
            <div
              className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-white/80"
              style={{ left: "80%" }}
              title="Mốc TB20 phiên"
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10.5px] text-text-muted">
            <span>
              Cả phiên{" "}
              {liqRatioPct != null && (
                <strong className={liqRatioPct >= 0 ? "text-up" : "text-down"}>
                  ({liqRatioPct > 0 ? "+" : ""}{liqRatioPct}% so TB20)
                </strong>
              )}
            </span>
            <span>TB20: {formatBillionVndUnsigned(liqBase)}</span>
          </div>
        </div>

        {/* 3. Khối ngoại ròng */}
        <div className="py-2.5 flex items-center justify-between gap-2">
          <div>
            <div className="text-text-muted">Khối ngoại ròng</div>
            <div className="text-[10px] text-text-muted">{intel.flow.source || "Dữ liệu phiên"}</div>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className={`font-mono text-[13px] font-bold ${colorForChange(intel.flow.foreignNet)}`}
            >
              {formatBillionVnd(intel.flow.foreignNet)}
            </span>
            {sparkBars.length > 0 && (
              <div className="flex h-6 items-end gap-[2px]">
                {sparkBars.map((bar, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${bar.h}%` }}
                    className={`w-[3px] rounded-t-sm ${bar.pos ? "bg-up/80" : "bg-down/80"}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 4. Tự doanh ròng */}
        <div className="py-2.5 flex items-center justify-between gap-2">
          <div>
            <div className="text-text-muted">Tự doanh &amp; ETF ròng</div>
            <div className="text-[10px] text-text-muted">Cập nhật cuối phiên</div>
          </div>
          <div className="text-right font-mono">
            <span className={`text-[13px] font-bold ${colorForChange(intel.flow.propNet)}`}>
              {formatBillionVnd(intel.flow.propNet)}
            </span>
          </div>
        </div>

        {/* 5. Market Pulse / Xu hướng kỹ thuật */}
        <div className="py-2.5 flex items-center justify-between gap-2">
          <div>
            <div className="text-text-muted">Xung lực Market Pulse</div>
            <div className="text-[10px] text-text-muted truncate max-w-[170px]">
              {intel.condition?.drivers?.[0] ?? "Đo lường độ rộng & dòng tiền"}
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-text-muted">Điểm</span>
            <span
              className={`rounded px-1.5 py-0.5 font-bold ${
                pulseScore >= 57
                  ? "bg-up/15 text-up"
                  : pulseScore <= 43
                    ? "bg-down/15 text-down"
                    : "bg-warn/15 text-warn"
              }`}
            >
              {pulseScore}/100
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** FireAnt-style Sector-Grouped Treemap Heatmap */
function FireAntHeatmapSection({ quotes }: { quotes: Quote[] }) {
  const [weightMode, setWeightMode] = useState<HeatmapWeightMode>("cap");

  const sectorGroups = useMemo(() => {
    const valid = quotes.filter((q) => q.symbol && Number.isFinite(q.price) && q.price > 0);
    const bySec = new Map<string, { items: Quote[]; totalWeight: number; avgChg: number }>();

    for (const q of valid) {
      const sec = sectorOf(q.symbol) || "Khác";
      const turnover = Math.max(1, (q.volume ?? 0) * q.price);
      const w =
        weightMode === "turnover"
          ? turnover
          : weightMode === "change"
            ? Math.max(1, Math.abs(q.changePercent ?? 0) * 1e6 + turnover * 0.05)
            : Math.max(turnover * 1.2, 1e6);

      const cur = bySec.get(sec) ?? { items: [], totalWeight: 0, avgChg: 0 };
      cur.items.push(q);
      cur.totalWeight += w;
      bySec.set(sec, cur);
    }

    const groups = [...bySec.entries()]
      .map(([sector, g]) => {
        g.items.sort((a, b) => (b.volume ?? 0) * b.price - (a.volume ?? 0) * a.price);
        const topItems = g.items.slice(0, 8);
        const avgChg =
          topItems.reduce((s, x) => s + (x.changePercent ?? 0), 0) / Math.max(1, topItems.length);
        return { sector, items: topItems, totalWeight: g.totalWeight, avgChg };
      })
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 6);

    return groups;
  }, [quotes, weightMode]);

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-primary">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[12.5px] font-bold text-text-primary">Bản đồ nhiệt</h3>
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
            HSX / VN30
          </span>
          <Link href="/heatmap" className="ml-1 text-[10.5px] text-accent-primary hover:underline">
            Toàn màn hình →
          </Link>
        </div>

        <div className="inline-flex items-center gap-0.5 rounded bg-background-secondary p-0.5 text-[10.5px]">
          {(
            [
              { id: "cap", label: "Vốn hóa" },
              { id: "turnover", label: "GTGD" },
              { id: "change", label: "Biến động" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setWeightMode(m.id)}
              className={`rounded px-2 py-0.5 font-semibold transition-colors ${
                weightMode === m.id ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-2.5">
        {sectorGroups.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-text-muted">
            Đang nạp dữ liệu Bản đồ nhiệt thị trường...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sectorGroups.map((grp) => (
              <div key={grp.sector} className="rounded border border-border-subtle bg-background-secondary p-1.5">
                <div className="mb-1 flex items-center justify-between px-0.5 text-[10.5px]">
                  <span className="font-semibold text-text-secondary truncate">{grp.sector}</span>
                  <span className={`font-mono font-bold ${colorForChange(grp.avgChg)}`}>
                    {fmtPct(grp.avgChg, 2)}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {grp.items.map((q, idx) => {
                    const chg = q.changePercent ?? 0;
                    const spanClass = idx === 0 ? "col-span-2 row-span-2 min-h-[76px]" : idx === 1 ? "col-span-2 min-h-[36px]" : "col-span-1 min-h-[36px]";
                    return (
                      <Link
                        key={q.symbol}
                        href={`/stocks/${encodeURIComponent(q.symbol)}`}
                        style={{ backgroundColor: heatmapTileBg(chg) }}
                        className={`${spanClass} flex flex-col items-center justify-center rounded-[3px] px-1 py-1 text-center text-white transition-opacity hover:opacity-90`}
                        title={`${q.symbol}: ${fmtNum(q.price, 2)} (${fmtPct(chg)})`}
                      >
                        <span className={`${idx === 0 ? "text-[13px]" : "text-[10.5px]"} font-bold leading-tight`}>
                          {q.symbol}
                        </span>
                        <span className={`${idx === 0 ? "text-[11px]" : "text-[9.5px]"} font-mono opacity-95`}>
                          {fmtPct(chg, 2)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Color Legend matching FireAnt */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <span>−5%</span>
            <span className="inline-block h-2 w-3 rounded-[2px] bg-[#b91c1c]" />
            <span className="inline-block h-2 w-3 rounded-[2px] bg-[#991b1b]" />
            <span className="inline-block h-2 w-3 rounded-[2px] bg-[#5c5326]" />
            <span className="inline-block h-2 w-3 rounded-[2px] bg-[#166534]" />
            <span className="inline-block h-2 w-3 rounded-[2px] bg-[#15803d]" />
            <span>+5%</span>
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2.5 rounded-[2px] bg-[#a855f7]" />
              Trần
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2.5 rounded-[2px] bg-[#06b6d4]" />
              Sàn
            </span>
          </div>
          <span>Nhấn vào mã bất kỳ để mở phân tích sâu &amp; biểu đồ</span>
        </div>
      </div>
    </section>
  );
}

/** FireAnt-style Vertical Bidirectional Index Impact Bar Chart */
function IndexImpactChart({ intel, quotes }: { intel: MarketIntel; quotes: Quote[] }) {
  const { negItems, posItems, netImpact } = useMemo(() => {
    const rawNeg = intel.contributors?.negative ?? [];
    const rawPos = intel.contributors?.positive ?? [];

    let neg = rawNeg.slice(0, 8).map((c) => ({
      symbol: c.symbol,
      val: c.indexPoints != null ? -Math.abs(c.indexPoints) : -Math.abs(c.changePercent ?? 0),
      pct: c.changePercent ?? 0,
      isPts: c.indexPoints != null,
    }));
    let pos = rawPos.slice(0, 8).map((c) => ({
      symbol: c.symbol,
      val: c.indexPoints != null ? Math.abs(c.indexPoints) : Math.abs(c.changePercent ?? 0),
      pct: c.changePercent ?? 0,
      isPts: c.indexPoints != null,
    }));

    if (neg.length === 0 && pos.length === 0 && quotes.length > 0) {
      const valid = quotes.filter((q) => q.changePercent != null && Number.isFinite(q.changePercent));
      neg = [...valid]
        .filter((q) => (q.changePercent ?? 0) < 0)
        .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))
        .slice(0, 8)
        .map((q) => ({ symbol: q.symbol, val: q.changePercent ?? 0, pct: q.changePercent ?? 0, isPts: false }));
      pos = [...valid]
        .filter((q) => (q.changePercent ?? 0) > 0)
        .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
        .slice(0, 8)
        .reverse()
        .map((q) => ({ symbol: q.symbol, val: q.changePercent ?? 0, pct: q.changePercent ?? 0, isPts: false }));
    } else {
      pos = [...pos].reverse();
    }

    const sum = pos.reduce((s, x) => s + x.val, 0) + neg.reduce((s, x) => s + x.val, 0);
    return { negItems: neg, posItems: pos, netImpact: sum };
  }, [intel.contributors, quotes]);

  const allItems = [...negItems, ...posItems];
  const maxAbs = Math.max(0.1, ...allItems.map((x) => Math.abs(x.val)));

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-primary">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[12.5px] font-bold text-text-primary">Tác động</h3>
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold text-text-muted">
            VN-Index
          </span>
        </div>
        <span className={`font-mono text-[11.5px] font-bold ${colorForChange(netImpact)}`}>
          Ròng {fmtSigned(netImpact, 2)} {allItems[0]?.isPts ? "điểm" : "%"}
        </span>
      </div>

      <div className="p-3">
        {allItems.length === 0 ? (
          <div className="py-8 text-center text-[11.5px] text-text-muted">
            Chưa có dữ liệu tác động chỉ số trong phiên.
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16 items-end pt-3 pb-1">
            {allItems.map((item) => {
              const isPos = item.val >= 0;
              const barH = Math.max(10, Math.round((Math.abs(item.val) / maxAbs) * 76));
              return (
                <Link
                  key={`${item.symbol}_${isPos ? "p" : "n"}`}
                  href={`/stocks/${encodeURIComponent(item.symbol)}`}
                  className="group flex flex-col items-center gap-1"
                >
                  <div className="flex h-[96px] flex-col items-center justify-end w-full">
                    <span
                      className={`mb-0.5 font-mono text-[9.5px] font-semibold ${
                        isPos ? "text-up" : "text-down"
                      }`}
                    >
                      {fmtSigned(item.val, 2)}
                    </span>
                    <div
                      style={{ height: `${barH}px` }}
                      className={`w-full max-w-[22px] rounded-t-[3px] transition-opacity group-hover:opacity-85 ${
                        isPos ? "bg-up" : "bg-down"
                      }`}
                    />
                  </div>
                  <div className="w-full border-t border-border-subtle pt-1 text-center">
                    <div className="text-[10px] font-bold text-text-primary group-hover:text-accent-primary">
                      {item.symbol}
                    </div>
                    <div className={`font-mono text-[9px] ${colorForChange(item.pct)}`}>
                      {fmtPct(item.pct, 1)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/** FireAnt-style 3-Column World Markets Panel */
function WorldMarketsSection({
  globalUs,
  globalAsia,
  globalCrypto,
  crossAsset,
}: {
  globalUs: GlobalUsRow[];
  globalAsia: GlobalAsiaRow[];
  globalCrypto: GlobalCryptoRow[];
  crossAsset: MarketIntel["crossAsset"];
}) {
  const vnTimeStr = useMemo(() => {
    try {
      return new Date().toLocaleTimeString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, []);

  const thirdColumnRows = useMemo(() => {
    const out: { label: string; value: number | null; chg: number | null; href: string }[] = [];
    for (const c of crossAsset) {
      if (["XAUUSD", "DXY", "EURUSD", "USOIL", "USDVND"].includes(c.key.toUpperCase())) {
        out.push({
          label: c.key,
          value: c.value,
          chg: c.changePercent,
          href: "/forex",
        });
      }
    }
    for (const cr of globalCrypto.slice(0, Math.max(0, 4 - out.length))) {
      out.push({
        label: cr.baseAsset || cr.symbol,
        value: cr.price,
        chg: cr.changePercent,
        href: `/crypto/${encodeURIComponent(cr.symbol)}`,
      });
    }
    return out.slice(0, 4);
  }, [crossAsset, globalCrypto]);

  return (
    <section className="rounded-lg border border-border-subtle bg-surface-primary">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <h3 className="text-[12.5px] font-bold text-text-primary">Thế giới &amp; Liên thị trường</h3>
        <span className="font-mono text-[10.5px] text-text-muted">Giờ VN {vnTimeStr}</span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
        {/* Mỹ */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11.5px] font-bold text-text-primary">Mỹ</h4>
            <span className="text-[10px] text-text-muted">US Equities</span>
          </div>
          <div className="space-y-1.5">
            {globalUs.slice(0, 4).map((r) => (
              <div key={r.symbol} className="flex items-center justify-between text-[11.5px]">
                <span className="text-text-secondary font-medium">{r.symbol}</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-text-primary">{fmtNum(r.price, 2)}</span>
                  <span className={`w-14 text-right font-semibold ${colorForChange(r.changePercent)}`}>
                    {fmtPct(r.changePercent, 2)}
                  </span>
                </div>
              </div>
            ))}
            {globalUs.length === 0 && <div className="text-[11px] text-text-muted">Đang đồng bộ...</div>}
          </div>
        </div>

        {/* Châu Á */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11.5px] font-bold text-text-primary">Châu Á</h4>
            <span className="text-[10px] text-text-muted">Asia-Pacific</span>
          </div>
          <div className="space-y-1.5">
            {globalAsia.slice(0, 4).map((r) => (
              <div key={r.symbol} className="flex items-center justify-between text-[11.5px]">
                <span className="text-text-secondary font-medium">{r.label || r.symbol}</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-text-primary">{fmtNum(r.price, 2)}</span>
                  <span className={`w-14 text-right font-semibold ${colorForChange(r.changePercent)}`}>
                    {fmtPct(r.changePercent, 2)}
                  </span>
                </div>
              </div>
            ))}
            {globalAsia.length === 0 && <div className="text-[11px] text-text-muted">Đang đồng bộ...</div>}
          </div>
        </div>

        {/* Ngoại hối / Hàng hóa / Crypto */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11.5px] font-bold text-text-primary">Vàng · FX · Crypto</h4>
            <span className="text-[10px] text-text-muted">24/7 Live</span>
          </div>
          <div className="space-y-1.5">
            {thirdColumnRows.map((r) => (
              <Link
                key={r.label}
                href={r.href}
                className="flex items-center justify-between text-[11.5px] hover:bg-surface-elevated rounded px-1 -mx-1"
              >
                <span className="text-text-secondary font-medium">{r.label}</span>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-text-primary">
                    {r.value != null ? fmtNum(r.value, r.label === "USDVND" ? 0 : 2) : "—"}
                  </span>
                  <span className={`w-14 text-right font-semibold ${colorForChange(r.chg)}`}>
                    {fmtPct(r.chg, 2)}
                  </span>
                </div>
              </Link>
            ))}
            {thirdColumnRows.length === 0 && <div className="text-[11px] text-text-muted">Đang đồng bộ...</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FireAntOverview({
  intel,
  meta,
  quotes,
  globalUs = [],
  globalCrypto = [],
  globalAsia = [],
  liquiditySpark = null,
}: {
  intel: MarketIntel;
  meta: Meta | null;
  quotes: Quote[];
  globalUs?: GlobalUsRow[];
  globalCrypto?: GlobalCryptoRow[];
  globalAsia?: GlobalAsiaRow[];
  liquiditySpark?: LiquiditySparkSeries;
}) {
  const [subTab, setSubTab] = useState<OverviewSubTab>("market");
  const [selectedIndexCode, setSelectedIndexCode] = useState<string>("VNINDEX");
  const [showNewsRail, setShowNewsRail] = useState(true);
  const [newsQuery, setNewsQuery] = useState("");

  const indexCards = useMemo(() => {
    const raw = intel.indices ?? [];
    const findIdx = (code: string): IndexQuote | null => {
      const c = code.toUpperCase();
      return (
        raw.find((i) => {
          const ic = i.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
          return (
            ic === c ||
            (c === "VNINDEX" && ic === "VNINDEX") ||
            (c === "HNX" && (ic === "HNX" || ic === "HNXINDEX")) ||
            (c === "UPCOM" && (ic === "UPCOM" || ic === "UPINDEX" || ic === "UPCOMINDEX"))
          );
        }) ?? null
      );
    };

    const vn30Val = findIdx("VN30")?.value ?? null;
    return CORE_INDEX_ORDER.map((def, idx) => {
      const q = findIdx(def.code);
      const basis =
        def.code === "VN30F1M" && q?.value != null && vn30Val != null
          ? Number((q.value - vn30Val).toFixed(1))
          : null;
      return {
        ...def,
        quote: q,
        basis,
        seed: idx * 1.7 + 0.5,
      };
    });
  }, [intel.indices]);

  const activeCard =
    indexCards.find((c) => c.code === selectedIndexCode) ?? indexCards[0]!;

  const filteredNews = useMemo(() => {
    const all = intel.news ?? [];
    const q = newsQuery.trim().toLowerCase();
    if (!q) return all.slice(0, 14);
    return all
      .filter((n) => n.title.toLowerCase().includes(q) || (n.source ?? "").toLowerCase().includes(q))
      .slice(0, 14);
  }, [intel.news, newsQuery]);

  return (
    <div className="space-y-2.5 text-text-primary">
      {/* Top Workbench Sub-Tab Bar (FireAnt style) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-primary px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          <button
            type="button"
            onClick={() => setSubTab("market")}
            className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
              subTab === "market"
                ? "bg-surface-elevated text-white border-b-2 border-accent-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Tổng quan thị trường
          </button>
          <button
            type="button"
            onClick={() => setSubTab("bot")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-colors ${
              subTab === "bot"
                ? "bg-surface-elevated text-white border-b-2 border-accent-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Bot className="size-3.5 text-accent-primary" />
            Bot Auto-Trade
          </button>
          <span className="mx-1 h-4 w-px bg-border-subtle" />
          <Link href="/stocks/sectors" className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
            Ngành nghề
          </Link>
          <Link href="/stocks" className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
            Cổ phiếu
          </Link>
          <Link href="/derivatives" className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
            Phái sinh
          </Link>
          <Link href="/forex" className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
            Forex &amp; Vàng
          </Link>
          <Link href="/crypto" className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary">
            Tiền số
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {meta ? <FreshnessDot status={meta.freshness} ageMs={meta.ageMs} /> : null}
          {subTab === "market" && (
            <button
              type="button"
              onClick={() => setShowNewsRail((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-elevated px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
              title={showNewsRail ? "Ẩn cột Bài viết" : "Hiện cột Bài viết"}
            >
              {showNewsRail ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
              <span className="hidden sm:inline">Bài viết</span>
            </button>
          )}
        </div>
      </div>

      {subTab === "bot" ? (
        <LiveBotCockpit variant="full" />
      ) : (
        <div
          className={`grid grid-cols-1 gap-2.5 ${
            showNewsRail ? "xl:grid-cols-[minmax(0,1fr)_310px]" : ""
          }`}
        >
          {/* LEFT MAIN WORKBENCH (~73%) */}
          <div className="min-w-0 space-y-2.5">
            {/* Row 1: 6 Index Cards with Sparklines */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {indexCards.map((card) => {
                const isSelected = card.code === activeCard.code;
                const q = card.quote;
                return (
                  <button
                    key={card.code}
                    type="button"
                    onClick={() => setSelectedIndexCode(card.code)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-accent-primary bg-accent-primary/10"
                        : "border-border-subtle bg-surface-primary hover:border-border-default"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-semibold text-text-secondary">
                          {card.label}
                        </div>
                        <div className={`mt-0.5 font-mono text-[14px] font-extrabold ${colorForChange(q?.changePercent)}`}>
                          {q?.value != null ? fmtNum(q.value, 2) : "—"}
                        </div>
                      </div>
                      <MiniIndexSpark changePct={q?.changePercent} seed={card.seed} />
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px]">
                      <span className={colorForChange(q?.changePercent)}>
                        {fmtSigned(q?.change, 2)} {fmtPct(q?.changePercent, 2)}
                      </span>
                      {card.basis != null && (
                        <span className="text-text-muted">Basis {fmtSigned(card.basis, 1)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Row 2: Chart (Left) + Session Stats (Right) */}
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.35fr_1fr]">
              <FireAntIndexChart
                symbol={activeCard.chartSymbol}
                label={activeCard.label}
                quote={activeCard.quote}
                sessionLabel={intel.session?.labelVi ?? "Thị trường VN"}
              />
              <SessionStatsCard
                intel={intel}
                quotes={quotes}
                liquiditySpark={liquiditySpark}
              />
            </div>

            {/* Row 3: Sector-Grouped Treemap Heatmap */}
            <FireAntHeatmapSection quotes={quotes} />

            {/* Row 4: Vertical Bidirectional Index Impact Bar Chart */}
            <IndexImpactChart intel={intel} quotes={quotes} />

            {/* Row 5: 3-Column World Markets */}
            <WorldMarketsSection
              globalUs={globalUs}
              globalAsia={globalAsia}
              globalCrypto={globalCrypto}
              crossAsset={intel.crossAsset}
            />
          </div>

          {/* RIGHT STICKY NEWS RAIL (~27%) */}
          {showNewsRail && (
            <aside className="rounded-lg border border-border-subtle bg-surface-primary flex flex-col xl:sticky xl:top-3 xl:max-h-[calc(100vh-5rem)]">
              <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Newspaper className="size-3.5 text-accent-primary" />
                  <h3 className="text-[12.5px] font-bold text-text-primary">Bài viết</h3>
                  <span className="text-[10px] text-text-muted">Theo {activeCard.label}</span>
                </div>
                <Link href="/news" className="text-[10.5px] text-accent-primary hover:underline">
                  Tất cả →
                </Link>
              </div>

              <div className="border-b border-border-subtle p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={newsQuery}
                    onChange={(e) => setNewsQuery(e.target.value)}
                    placeholder="Tìm tin tức, mã cổ phiếu..."
                    className="w-full rounded-md border border-border-subtle bg-background-secondary py-1.5 pl-8 pr-2.5 text-[11.5px] text-white placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 divide-y divide-border-subtle overflow-y-auto px-3">
                {filteredNews.length === 0 ? (
                  <div className="py-8 text-center text-[11.5px] text-text-muted">
                    Chưa có bài viết phù hợp.
                  </div>
                ) : (
                  filteredNews.map((item, idx) => (
                    <a
                      key={item.url || idx}
                      href={item.url || "/news"}
                      target={item.url?.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="block py-2.5 group"
                    >
                      <div className="text-[12px] font-medium leading-snug text-text-primary group-hover:text-accent-primary line-clamp-3">
                        {item.title}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-muted">
                        <span className="truncate">{item.source || "Thị trường"}</span>
                        <span className="shrink-0">{timeAgoVi(item.publishedAt)}</span>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
