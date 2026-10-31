"use client";

import { memo, useEffect, useMemo, useState, useRef, use } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useApi } from "@/lib/hooks";
import type { VnStockDetail } from "@/lib/services/stocks";
import type { Meta } from "@/lib/types";
import {
  FreshnessDot,
  Loading,
  Panel,
  Unavailable,
  ErrorState,
  FreshnessAlertBanner,
  SyncMetricBadge,
  Badge,
  fmtCompact,
  fmtNum,
} from "@/components/ui";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  FileSpreadsheet,
  Calculator,
  Users,
  Newspaper,
  Bot,
  BarChart3,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { AddToWatchlist } from "@/components/watchlist-button";
import { OrcaChart } from "@/components/orca-chart";
import { StockNewsSentiment } from "@/components/stocks/news-sentiment-chip";
import { CompanyNewsPanel } from "@/components/stocks/company-news-panel";
import { OrderBookPanel } from "@/components/stocks/order-book-panel";
import { MarketBreadthCard } from "@/components/stocks/market-breadth-card";
import { ErrorBoundary } from "@/components/error-boundary";
import { getSecurity } from "@/lib/vn/master";
import { BOOTSTRAP_VN30_QUOTES } from "@/lib/bootstrap-data";

const TechRecoPanel = dynamic(
  () => import("@/components/stocks/tech-reco-panel").then((m) => m.TechRecoPanel),
  {
    ssr: false,
    loading: () => (
      <Panel title="Tín hiệu kỹ thuật">
        <Loading rows={2} />
      </Panel>
    ),
  },
);
const PatternAnalysisHub = dynamic(
  () => import("@/components/stocks/pattern-analysis-hub").then((m) => m.PatternAnalysisHub),
  {
    ssr: false,
    loading: () => (
      <Panel title="Phân tích mẫu hình">
        <Loading rows={5} />
      </Panel>
    ),
  },
);

const AiFinancialPanel = dynamic(
  () => import("@/components/stocks/ai-financial-panel").then((m) => m.AiFinancialPanel),
  {
    ssr: false,
    loading: () => (
      <Panel title="AI Quick Audit">
        <Loading rows={3} />
      </Panel>
    ),
  },
);

const StockQuantFlowValuationWidget = dynamic(
  () =>
    import("@/components/stocks/quant-flow-valuation-widget").then(
      (m) => m.StockQuantFlowValuationWidget
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Định lượng & Dòng tiền AI">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const DeepFinancialsPanel = dynamic(
  () =>
    import("@/components/stocks/deep-financials-panel").then(
      (m) => m.DeepFinancialsPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Phân tích chuyên sâu BCTC">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const ShareholdersPanel = dynamic(
  () =>
    import("@/components/stocks/shareholders-panel").then(
      (m) => m.ShareholdersPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Cơ cấu cổ đông & Ban điều hành">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const AnalyticReportsPanel = dynamic(
  () =>
    import("@/components/stocks/analytic-reports-panel").then(
      (m) => m.AnalyticReportsPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Báo cáo phân tích & Định giá">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const SignedDisclosuresPanel = dynamic(
  () =>
    import("@/components/stocks/signed-disclosures-panel").then(
      (m) => m.SignedDisclosuresPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Văn bản BCTC & Công văn ký số HOSE/HNX">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const ActiveFlowCard = dynamic(
  () =>
    import("@/components/stocks/active-flow-card").then(
      (m) => m.ActiveFlowCard
    ),
  {
    ssr: false,
  }
);

const ForeignPressureGauge = dynamic(
  () =>
    import("@/components/stocks/foreign-pressure-gauge").then(
      (m) => m.ForeignPressureGauge
    ),
  {
    ssr: false,
  }
);

const ComprehensiveRatiosPanel = dynamic(
  () =>
    import("@/components/stocks/comprehensive-ratios-panel").then(
      (m) => m.ComprehensiveRatiosPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Chỉ số tài chính chuyên sâu & Định giá 3 năm">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const InsiderTradingPanel = dynamic(
  () =>
    import("@/components/stocks/insider-trading-panel").then(
      (m) => m.InsiderTradingPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Giao dịch người nội bộ & Ban lãnh đạo">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const BusinessGoalsPanel = dynamic(
  () =>
    import("@/components/stocks/business-goals-panel").then(
      (m) => m.BusinessGoalsPanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Tiến độ thực hiện kế hoạch ĐHĐCĐ">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const DividendIntelligencePanel = dynamic(
  () =>
    import("@/components/stocks/dividend-intelligence-panel").then(
      (m) => m.DividendIntelligencePanel
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Phân tích Cổ tức & Tỷ suất sinh lời">
        <Loading rows={4} />
      </Panel>
    ),
  }
);

const ConsensusUpsideCard = dynamic(
  () =>
    import("@/components/stocks/consensus-upside-card").then(
      (m) => m.ConsensusUpsideCard
    ),
  {
    ssr: false,
    loading: () => (
      <Panel title="Định giá Mục tiêu Đồng thuận">
        <Loading rows={3} />
      </Panel>
    ),
  }
);


const FIREANT_TABS = [
  { id: "overview", label: "Tổng quan & Kỹ thuật", icon: TrendingUp },
  { id: "financials", label: "Báo cáo Tài chính", icon: FileSpreadsheet },
  { id: "valuation", label: "Định giá & AI Quant", icon: Calculator },
  { id: "shareholders", label: "Cổ đông & Ban LĐ", icon: Users },
  { id: "news", label: "Tin tức & Báo cáo CTCK", icon: Newspaper },
] as const;

type FireantTabId = (typeof FIREANT_TABS)[number]["id"];

const TREND_VI: Record<string, string> = {
  "strong-up": "Tăng mạnh",
  up: "Xu hướng tăng",
  sideways: "Đi ngang",
  down: "Xu hướng giảm",
  "strong-down": "Giảm mạnh",
};

const MONEY_FLOW_VI: Record<string, string> = {
  "strong-inflow": "Vào mạnh",
  inflow: "Vào",
  balanced: "Cân bằng",
  outflow: "Ra",
  "strong-outflow": "Ra mạnh",
};

const DecisionStrip = memo(function DecisionStrip({
  quote,
  technical,
  meta,
}: {
  quote: VnStockDetail["quote"];
  technical: VnStockDetail["technical"];
  meta: Meta | null;
}) {
  const trend = technical?.trend;
  const trendLabel =
    typeof trend === "object" && trend
      ? TREND_VI[trend.label] ?? trend.label
      : String(trend ?? "Chưa rõ");

  const ts = technical?.tradeSignal;
  const signal =
    ts?.action === "buy" ? "MUA" : ts?.action === "sell" ? "BÁN" : "QUAN SÁT";
  const tone = signal === "MUA" ? "up" : signal === "BÁN" ? "down" : "neutral";
  const Icon = signal === "MUA" ? ArrowUpRight : signal === "BÁN" ? ArrowDownRight : Activity;
  const plan = ts?.plan ?? null;

  const rsi = technical?.rsi14 != null ? technical.rsi14.toFixed(1) : "—";
  const vol30 =
    technical?.volatility30d != null
      ? `${(technical.volatility30d * 100).toFixed(1)}%`
      : "—";
  const flow = technical?.moneyFlow?.label;
  const flowLabel = flow ? MONEY_FLOW_VI[flow] ?? flow : null;

  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

  return (
    <div
      id="sec-decision"
      className={`stock-decision-strip stock-decision-strip--${tone}`}
    >
      <div className="stock-decision-left">
        <span className={`stock-signal-badge stock-signal-badge--${tone}`} aria-label={`Tín hiệu ${signal}`}>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="stock-signal-badge-text">{signal}</span>
          {ts?.confidence != null && (
            <span className="stock-signal-badge-conf">{Math.round(ts.confidence)}%</span>
          )}
        </span>
        <span className="stock-decision-trend" title={trendLabel}>
          <ShieldCheck className="size-3 shrink-0 text-accent-primary" aria-hidden />
          {trendLabel}
        </span>
        {ts?.reasons?.[0] && (
          <span className="stock-decision-reason" title={ts.reasons.join(" · ")}>
            {ts.reasons[0]}
          </span>
        )}
      </div>

      <div className="stock-decision-metrics">
        {quote?.price != null && (
          <MetricChip
            label="Giá"
            value={quote.price.toLocaleString("vi-VN")}
            tone={
              quote.changePercent != null
                ? quote.changePercent >= 0
                  ? "up"
                  : "down"
                : undefined
            }
          />
        )}
        {plan && signal !== "QUAN SÁT" ? (
          <span className="stock-plan-group" role="group" aria-label="Kế hoạch giao dịch">
            <MetricChip label="Entry" value={fmt(plan.entry)} emphasis />
            <MetricChip label="SL" value={fmt(plan.stopLoss)} tone="down" />
            <MetricChip label="TP1" value={fmt(plan.takeProfit1 ?? plan.takeProfit)} tone="up" />
            <MetricChip label="TP" value={fmt(plan.takeProfit)} tone="up" />
            <MetricChip label="R:R" value={`1:${plan.riskReward.toFixed(1)}`} emphasis />
          </span>
        ) : (
          <MetricChip label="Setup" value="Chờ xác nhận" muted />
        )}
        <MetricChip label="RSI" value={rsi} />
        {flowLabel && (
          <MetricChip
            label="Dòng tiền"
            value={flowLabel}
            tone={
              flow === "inflow" || flow === "strong-inflow"
                ? "up"
                : flow === "outflow" || flow === "strong-outflow"
                  ? "down"
                  : undefined
            }
          />
        )}
        <MetricChip label="Vol 30D" value={vol30} />
        <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
      </div>
    </div>
  );
});

const MetricChip = memo(function MetricChip({
  label,
  value,
  tone,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={`stock-metric-chip${emphasis ? " stock-metric-chip--emphasis" : ""}${
        muted ? " stock-metric-chip--muted" : ""
      }${tone === "up" ? " stock-metric-chip--up" : tone === "down" ? " stock-metric-chip--down" : ""}`}
    >
      <span className="stock-metric-chip-label">{label}</span>
      <span
        className={`stock-metric-chip-value num ${
          tone === "up" ? "text-positive" : tone === "down" ? "text-negative" : ""
        }`}
      >
        {value}
      </span>
    </span>
  );
});

export default function StockDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const resolvedParams = use(params);
  const symbol = resolvedParams.symbol.toUpperCase();
  const [activeTab, setActiveTab] = useState<FireantTabId>("overview");
  const [microTab, setMicroTab] = useState<"orderbook" | "flow" | "decision">("orderbook");

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<VnStockDetail>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}` : null,
    {
      refreshInterval: 15_000,
      timeoutMs: 12_000,
      keepPreviousData: true,
    },
  );

  const hasQuote = Boolean(data?.quote?.price && data.quote.price > 0);
  const hasBars = Boolean(data?.bars && data.bars.length >= 5);
  const isFull = Boolean(hasQuote && data?.bars && data.bars.length >= 20);
  const canPaint = hasQuote || hasBars || Boolean(data?.profile) || Boolean(data?.technical);

  const [retried, setRetried] = useState(false);
  const [hadPaint, setHadPaint] = useState(false);
  const [prevSymbol, setPrevSymbol] = useState(symbol);

  if (symbol !== prevSymbol) {
    setPrevSymbol(symbol);
    setHadPaint(false);
    setRetried(false);
  } else if (canPaint && !hadPaint) {
    setHadPaint(true);
  } else if (isFull && retried) {
    setRetried(false);
  }

  useEffect(() => {
    if (!symbol || isFull || isLoading || isValidating || retried) return;
    const t = window.setTimeout(() => {
      setRetried(true);
      void mutate();
    }, 400);
    return () => window.clearTimeout(t);
  }, [symbol, isLoading, isValidating, mutate, isFull, retried]);

  const sec = useMemo(() => (symbol ? getSecurity(symbol) : null), [symbol]);
  const bootQuote = useMemo(() => {
    return symbol ? BOOTSTRAP_VN30_QUOTES.find((b) => b.symbol === symbol) ?? null : null;
  }, [symbol]);

  const detail: VnStockDetail = useMemo(() => {
    if (data) return data;
    return {
      symbol,
      name: bootQuote?.name ?? sec?.name ?? symbol,
      quote: bootQuote ?? {
        symbol,
        name: sec?.name ?? symbol,
        price: 25.0,
        change: 0,
        changePercent: 0,
        referencePrice: 25.0,
        ceilingPrice: 26.75,
        floorPrice: 23.25,
        volume: 500_000,
        quoteVolume: 12_500_000,
        assetClass: "stock",
      },
      bars: [],
      technical: null,
      patterns: [],
      equity: null,
      sharesOutstanding: null,
      profile: sec ? { floor: sec.exchange, companyName: sec.name, industry: sec.sector } as any : null,
      orderBook: null,
      foreignFlow: null,
      financials: null,
      financialHealth: null,
      financialMeta: null,
      financialGrowth: null,
      financialTtm: null,
      detailedRatios: null,
      ratioMap: {},
      metricsSources: [],
      notes: ["instant-bootstrap"],
    };
  }, [data, symbol, bootQuote, sec]);

  if (!symbol) {
    return (
      <div className="p-4">
        <Loading rows={3} label="Đang mở mã cổ phiếu…" />
      </div>
    );
  }

  const quote = detail.quote;
  const chg = quote?.changePercent ?? 0;
  const isCeil = quote?.ceilingPrice && quote?.price && Math.abs(quote.price - quote.ceilingPrice) <= 0.051;
  const isFloor = quote?.floorPrice && quote?.price && Math.abs(quote.price - quote.floorPrice) <= 0.051;
  const priceTone = isCeil
    ? "text-purple-400"
    : isFloor
      ? "text-sky-400"
      : chg > 0
        ? "text-positive"
        : chg < 0
          ? "text-negative"
          : "text-amber-300";

  const priceVal = quote?.price != null ? quote.price.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : "—";
  const chgVal = quote?.change != null ? `${quote.change > 0 ? "+" : ""}${quote.change.toFixed(2)}` : "—";
  const chgPctVal = quote?.changePercent != null ? `${quote.changePercent > 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "—";
  const refVal = quote?.referencePrice != null ? quote.referencePrice.toFixed(2) : "—";
  const ceilVal = quote?.ceilingPrice != null ? quote.ceilingPrice.toFixed(2) : "—";
  const floorVal = quote?.floorPrice != null ? quote.floorPrice.toFixed(2) : "—";

  const estValVnd = quote?.price && quote?.volume ? (quote.price * quote.volume * 1000) : null;
  const estValFormatted = estValVnd != null ? `${(estValVnd / 1e9).toFixed(1)} Tỷ` : "—";

  const fBuy = (quote as any)?.foreignBuyVolume ?? 0;
  const fSell = (quote as any)?.foreignSellVolume ?? 0;
  const fNet = ((quote as any)?.foreignBuyVolume != null && (quote as any)?.foreignSellVolume != null) ? (fBuy - fSell) : null;
  const fNetTone = fNet == null ? "text-text-muted" : fNet > 0 ? "text-positive" : fNet < 0 ? "text-negative" : "text-text-secondary";
  const fNetFormatted = fNet == null ? "—" : `${fNet > 0 ? "+" : ""}${fmtCompact(fNet)} CP`;

  return (
    <div className="space-y-2.5 pb-8">
      {/* 1. FireAnt Pro Stock Station Header */}
      <div className="fireant-hero p-3 sm:p-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Ticker, Name, Badges & Price */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <Link
                href="/stocks"
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors pr-1"
                title="Quay lại Bảng điện VN"
              >
                <ArrowLeft className="size-3.5" />
                <span className="hidden sm:inline">Bảng điện</span>
              </Link>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-text-primary font-mono">
                {detail.symbol}
              </h1>
              <Badge tone="accent">{detail.profile?.floor ?? sec?.exchange ?? "HOSE"}</Badge>
              {sec?.sector && (
                <Badge tone="neutral">{sec.sector}</Badge>
              )}
              <span className="text-xs text-text-muted truncate max-w-xs hidden md:inline">
                {detail.profile?.vnName ?? sec?.name ?? detail.name}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-2.5 sm:gap-3.5 mt-1">
              <span className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${priceTone}`}>
                {priceVal}
              </span>
              <span className={`inline-flex items-center text-sm sm:text-base font-bold font-mono ${priceTone}`}>
                {chgVal} ({chgPctVal})
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 font-mono font-semibold" title="Giá tham chiếu">
                  TC: {refVal}
                </span>
                <span className="px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-300 font-mono font-semibold" title="Giá trần">
                  Trần: {ceilVal}
                </span>
                <span className="px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 font-mono font-semibold" title="Giá sàn">
                  Sàn: {floorVal}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Key Session Stats & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 text-xs">
              <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 px-2.5 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Tổng KL</div>
                <div className="font-mono font-bold text-text-primary mt-0.5">{fmtCompact(quote?.volume ?? 0)}</div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 px-2.5 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Cao / Thấp</div>
                <div className="font-mono font-bold text-text-primary mt-0.5">
                  <span className="text-positive">{fmtNum(quote?.high, 1)}</span> / <span className="text-negative">{fmtNum(quote?.low, 1)}</span>
                </div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 px-2.5 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Giá trị GD</div>
                <div className="font-mono font-bold text-text-primary mt-0.5">{estValFormatted}</div>
              </div>
              <div className="rounded-lg border border-border-subtle bg-surface-elevated/70 px-2.5 py-1">
                <div className="text-[10px] uppercase tracking-wider text-text-muted">Ngoại Net</div>
                <div className={`font-mono font-bold mt-0.5 ${fNetTone}`}>{fNetFormatted}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto lg:ml-0">
              <AddToWatchlist symbol={detail.symbol} assetType="stock" />
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("orca:open-ai-widget", {
                      detail: { prompt: `Phân tích toàn diện cổ phiếu ${detail.symbol}: tài chính, kỹ thuật, dòng tiền và định giá` },
                    }),
                  );
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent-primary/40 bg-accent-primary/15 text-accent-primary text-xs font-semibold hover:bg-accent-primary/25 transition-all active:scale-95 shadow-xs"
              >
                <Bot className="size-3.5" />
                <span>Hỏi AI</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {meta?.freshness && (meta.freshness === "DELAYED" || meta.freshness === "STALE" || meta.degraded) && (
        <FreshnessAlertBanner
          state={meta.freshness === "STALE" ? "stale" : meta.degraded ? "degraded" : "delayed"}
          ageMs={meta.ageMs}
          note={meta.note}
          source={meta.source}
          className="mb-1"
        />
      )}

      {/* 2. Above-the-fold FireAnt Workstation (Split Pane: Chart 65% + Micro Station 35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        {/* Left Column (65% width): Technical Chart */}
        <div className="lg:col-span-8 flex flex-col rounded-xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle/80 bg-surface-elevated/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <BarChart3 className="size-3.5 text-accent-primary" />
                Biểu đồ kỹ thuật
              </span>
              <span className="text-[11px] font-mono text-text-muted">
                {detail.symbol} · {detail.quote?.price ? detail.quote.price.toFixed(2) : ""}
              </span>
            </div>
            <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
          </div>
          <div className="flex-1 min-h-[380px] sm:min-h-[460px] p-1 bg-surface-primary">
            <ErrorBoundary name="chart" resetKey={detail.symbol}>
              <OrcaChart symbol={detail.symbol} assetType="stock" title={detail.symbol} height={460} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right Column (35% width): Micro-Market Station with Inner Tabs */}
        <div className="lg:col-span-4 flex flex-col rounded-xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
          <div className="fireant-micro-tabs">
            <button
              type="button"
              data-active={microTab === "orderbook"}
              onClick={() => setMicroTab("orderbook")}
              className="fireant-micro-tab-btn"
            >
              Sổ lệnh 3 giá
            </button>
            <button
              type="button"
              data-active={microTab === "flow"}
              onClick={() => setMicroTab("flow")}
              className="fireant-micro-tab-btn"
            >
              Dòng tiền & Ngoại
            </button>
            <button
              type="button"
              data-active={microTab === "decision"}
              onClick={() => setMicroTab("decision")}
              className="fireant-micro-tab-btn"
            >
              Tín hiệu & Setup
            </button>
          </div>

          <div className="flex-1 p-2 sm:p-2.5 overflow-y-auto max-h-[500px]">
            {microTab === "orderbook" && (
              <ErrorBoundary name="orderbook" resetKey={detail.symbol}>
                <OrderBookPanel symbol={detail.symbol} compact />
              </ErrorBoundary>
            )}
            {microTab === "flow" && (
              <div className="space-y-2.5">
                <ErrorBoundary name="active-flow" resetKey={detail.symbol}>
                  <ActiveFlowCard symbol={detail.symbol} />
                </ErrorBoundary>
                <ErrorBoundary name="foreign-gauge" resetKey={detail.symbol}>
                  <ForeignPressureGauge symbol={detail.symbol} />
                </ErrorBoundary>
              </div>
            )}
            {microTab === "decision" && (
              <div className="space-y-2.5">
                <DecisionStrip quote={detail.quote} technical={detail.technical} meta={meta ?? null} />
                <ErrorBoundary name="breadth" resetKey={detail.symbol}>
                  <MarketBreadthCard />
                </ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Deep Financial Intelligence: 5 FireAnt Station Tabs */}
      <div className="rounded-xl border border-border-subtle bg-surface-primary overflow-hidden shadow-sm">
        <div className="fireant-tab-nav">
          {FIREANT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-active={active ? "true" : "false"}
                onClick={() => setActiveTab(tab.id)}
                className="fireant-tab-btn"
              >
                <Icon className="size-4 opacity-90" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-3 sm:p-4">
          {activeTab === "overview" && (
            <div className="space-y-3.5">
              <div className="grid gap-3 lg:grid-cols-2">
                <ErrorBoundary name="tech-reco" resetKey={detail.symbol}>
                  <TechRecoPanel symbol={detail.symbol} />
                </ErrorBoundary>
                <ErrorBoundary name="patterns" resetKey={detail.symbol}>
                  <PatternAnalysisHub symbol={detail.symbol} technical={detail.technical} patterns={detail.patterns} />
                </ErrorBoundary>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <ErrorBoundary name="consensus-upside" resetKey={detail.symbol}>
                  <ConsensusUpsideCard symbol={detail.symbol} />
                </ErrorBoundary>
                <ErrorBoundary name="business-goals" resetKey={detail.symbol}>
                  <BusinessGoalsPanel symbol={detail.symbol} />
                </ErrorBoundary>
              </div>
            </div>
          )}

          {activeTab === "financials" && (
            <div className="space-y-3.5">
              <ErrorBoundary name="deep-financials" resetKey={detail.symbol}>
                <DeepFinancialsPanel symbol={detail.symbol} />
              </ErrorBoundary>
              <ErrorBoundary name="comprehensive-ratios" resetKey={detail.symbol}>
                <ComprehensiveRatiosPanel symbol={detail.symbol} />
              </ErrorBoundary>
              <ErrorBoundary name="dividend-intelligence" resetKey={detail.symbol}>
                <DividendIntelligencePanel symbol={detail.symbol} />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === "valuation" && (
            <div className="space-y-3.5">
              <ErrorBoundary name="ai-financial" resetKey={detail.symbol}>
                <AiFinancialPanel symbol={detail.symbol} />
              </ErrorBoundary>
              <ErrorBoundary name="quant-flow" resetKey={detail.symbol}>
                <StockQuantFlowValuationWidget symbol={detail.symbol} />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === "shareholders" && (
            <div className="space-y-3.5">
              <ErrorBoundary name="shareholders" resetKey={detail.symbol}>
                <ShareholdersPanel symbol={detail.symbol} />
              </ErrorBoundary>
              <ErrorBoundary name="insider-trading" resetKey={detail.symbol}>
                <InsiderTradingPanel symbol={detail.symbol} />
              </ErrorBoundary>
            </div>
          )}

          {activeTab === "news" && (
            <div className="space-y-3.5">
              <div className="grid gap-3 lg:grid-cols-2">
                <ErrorBoundary name="company-news" resetKey={detail.symbol}>
                  <CompanyNewsPanel symbol={detail.symbol} />
                </ErrorBoundary>
                <ErrorBoundary name="news-sent" resetKey={detail.symbol}>
                  <StockNewsSentiment symbol={detail.symbol} />
                </ErrorBoundary>
              </div>
              <ErrorBoundary name="signed-disclosures" resetKey={detail.symbol}>
                <SignedDisclosuresPanel symbol={detail.symbol} />
              </ErrorBoundary>
              <ErrorBoundary name="analytic-reports" resetKey={detail.symbol}>
                <AnalyticReportsPanel symbol={detail.symbol} />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
