"use client";

import { memo, useEffect, useMemo, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useApi } from "@/lib/hooks";
import type { VnStockDetail } from "@/lib/services/stocks";
import type { Meta } from "@/lib/types";
import { FreshnessDot, Loading, Panel, Unavailable, ErrorState, FreshnessAlertBanner, SyncMetricBadge } from "@/components/ui";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
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

const SECTION_NAV = [
  { id: "sec-chart", label: "Biểu đồ" },
  { id: "sec-signals", label: "Tín hiệu & cấu trúc" },
  { id: "sec-quant", label: "Định lượng, BCTC & Cổ đông" },
  { id: "sec-audit", label: "AI Quick Audit" },
  { id: "sec-deep", label: "Báo cáo phân tích & Tin tức" },
] as const;


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

const ANCHOR_OFFSET =
  "calc(var(--stock-sticky-h, 4.65rem) + var(--stock-nav-h, 2.2rem) + 0.45rem)";

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  const [symbol, setSymbol] = useState("");
  const [activeSection, setActiveSection] = useState<string>(SECTION_NAV[0].id);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    params.then((p) => setSymbol(p.symbol.toUpperCase()));
  }, [params]);

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<VnStockDetail>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}` : null,
    {
      refreshInterval: 15_000,
      // P6-B: tighter client timeout; soft shell covers cold path
      timeoutMs: 12_000,
      keepPreviousData: true,
    },
  );

  // P6-B: progressive — paint as soon as we have a price OR any bars (not wait for 20)
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

  useEffect(() => {
    if (!data?.symbol) return;
    const ids = SECTION_NAV.map((s) => s.id);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target?.id;
        if (!id) return;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          setActiveSection((prev) => (prev === id ? prev : id));
        });
      },
      {
        root: document.querySelector(".orca-main-scroll"),
        rootMargin: "-18% 0px -50% 0px",
        threshold: [0.12, 0.25, 0.45],
      },
    );
    for (const el of els) io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [data?.symbol]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btn = nav.querySelector<HTMLElement>(`[data-section="${activeSection}"]`);
    if (!btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const delta =
      btnRect.left - navRect.left - (navRect.width - btnRect.width) / 2;
    nav.scrollTo({ left: nav.scrollLeft + delta, behavior: "smooth" });
  }, [activeSection]);

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
      <div className="stock-workspace">
        <Loading rows={3} label="Đang mở mã cổ phiếu…" />
      </div>
    );
  }

  return (
    <div className="stock-workspace stock-page-body">
      <nav ref={navRef} className="stock-section-nav" aria-label="Mục trang">
        {SECTION_NAV.map((s) => (
          <button
            key={s.id}
            type="button"
            data-section={s.id}
            data-active={activeSection === s.id ? "true" : "false"}
            className="stock-section-nav-item"
            onClick={() => {
              setActiveSection(s.id);
              scrollToSection(s.id);
            }}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {meta?.freshness && (meta.freshness === "DELAYED" || meta.freshness === "STALE" || meta.degraded) && (
        <FreshnessAlertBanner
          state={meta.freshness === "STALE" ? "stale" : meta.degraded ? "degraded" : "delayed"}
          ageMs={meta.ageMs}
          note={meta.note}
          source={meta.source}
          className="mb-2"
        />
      )}

      <DecisionStrip quote={detail.quote} technical={detail.technical} meta={meta ?? null} />

      <section id="sec-chart" className="stock-section-card" style={{ scrollMarginTop: ANCHOR_OFFSET }}>
        <div className="stock-section-heading">
          <div>
            <p className="stock-section-kicker">Depth · Chart · Breadth</p>
            <h2>Sổ lệnh · Biểu đồ · Độ rộng</h2>
          </div>
          <span className="stock-section-index">01</span>
        </div>
        <div className="stock-chart-trio-grid">
          <div className="stock-side-depth">
            <ErrorBoundary name="orderbook" resetKey={detail.symbol}>
              <OrderBookPanel symbol={detail.symbol} compact />
            </ErrorBoundary>
          </div>
          <div className="stock-chart-frame stock-chart-frame--compact">
            <ErrorBoundary name="chart" resetKey={detail.symbol}>
              <OrcaChart symbol={detail.symbol} assetType="stock" title={detail.symbol} height={340} />
            </ErrorBoundary>
          </div>
          <div className="stock-side-breadth">
            <ErrorBoundary name="breadth" resetKey={detail.symbol}>
              <MarketBreadthCard />
            </ErrorBoundary>
          </div>
        </div>
      </section>

      <section
        id="sec-signals"
        className="stock-section-card"
        style={{ scrollMarginTop: ANCHOR_OFFSET }}
        aria-labelledby="sec-signals-title"
      >
        <div className="stock-section-heading" id="sec-signals-title">
          <div>
            <p className="stock-section-kicker">Signals · Structure</p>
            <h2>Tín hiệu & cấu trúc mẫu hình</h2>
          </div>
          <span className="stock-section-index">02</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ErrorBoundary name="tech-reco" resetKey={detail.symbol}>
            <TechRecoPanel symbol={detail.symbol} />
          </ErrorBoundary>
          <ErrorBoundary name="patterns" resetKey={detail.symbol}>
            <PatternAnalysisHub symbol={detail.symbol} technical={detail.technical} patterns={detail.patterns} />
          </ErrorBoundary>
        </div>
      </section>

      <section
        id="sec-quant"
        className="stock-section-card"
        style={{ scrollMarginTop: ANCHOR_OFFSET }}
        aria-labelledby="sec-quant-title"
      >
        <div className="stock-section-heading" id="sec-quant-title">
          <div>
            <p className="stock-section-kicker">MiQuant Quantitative · Vietcap IQ · Fair Value · Banking & Shareholders</p>
            <h2>Dải định giá AI, Dòng tiền, Phân rã BCTC & Sổ cổ đông</h2>
          </div>
          <span className="stock-section-index">03</span>
        </div>
        <div className="space-y-4">
          <ErrorBoundary name="quant-flow" resetKey={detail.symbol}>
            <StockQuantFlowValuationWidget symbol={detail.symbol} />
          </ErrorBoundary>
          <ErrorBoundary name="deep-financials" resetKey={detail.symbol}>
            <DeepFinancialsPanel symbol={detail.symbol} />
          </ErrorBoundary>
          <ErrorBoundary name="shareholders" resetKey={detail.symbol}>
            <ShareholdersPanel symbol={detail.symbol} />
          </ErrorBoundary>
        </div>
      </section>

      <section
        id="sec-audit"
        className="stock-section-card"
        style={{ scrollMarginTop: ANCHOR_OFFSET }}
        aria-labelledby="sec-audit-title"
      >
        <div className="stock-section-heading" id="sec-audit-title">
          <div>
            <p className="stock-section-kicker">Gemini 2.0 Flash · 4M Phil Town · TCBS</p>
            <h2>AI Quick Audit BCTC & Định giá 1-Click</h2>
          </div>
          <span className="stock-section-index">04</span>
        </div>
        <ErrorBoundary name="ai-financial" resetKey={detail.symbol}>
          <AiFinancialPanel symbol={detail.symbol} />
        </ErrorBoundary>
      </section>

      <section id="sec-deep" className="stock-section-card" style={{ scrollMarginTop: ANCHOR_OFFSET }}>
        <div className="stock-section-heading">
          <div>
            <p className="stock-section-kicker">VNDirect Research & News</p>
            <h2>Báo cáo phân tích, Tin tức & Cảm xúc thị trường</h2>
          </div>
          <span className="stock-section-index">05</span>
        </div>
        <div className="space-y-4">
          <ErrorBoundary name="analytic-reports" resetKey={detail.symbol}>
            <AnalyticReportsPanel symbol={detail.symbol} />
          </ErrorBoundary>
          <ErrorBoundary name="news-sent" resetKey={detail.symbol}>
            <StockNewsSentiment symbol={detail.symbol} />
          </ErrorBoundary>
          <ErrorBoundary name="company-news" resetKey={detail.symbol}>
            <CompanyNewsPanel symbol={detail.symbol} />
          </ErrorBoundary>
        </div>
      </section>

    </div>
  );
}
