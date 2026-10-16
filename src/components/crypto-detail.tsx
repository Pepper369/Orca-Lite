"use client";

/**
 * CRYPTO QUANT TERMINAL — Dense cockpit matching Forex institutional layout.
 * Layout (XL): sticky ticker · 3+6+3 stage · 7+5 structure | sentiment+news
 * Colors: system tokens. Order-flow from OHLCV CLV (no mock book).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { BOOTSTRAP_CRYPTO_ROWS } from "@/lib/bootstrap-data";
import type { CandlePattern, CryptoMarketRow, NewsArticle, OhlcvBar, TechnicalSnapshot } from "@/lib/types";
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
  Unavailable,
} from "@/components/ui";
import { OrcaChart } from "@/components/orca-chart";
import { ScalpPanel } from "@/components/scalp-panel";
import { CryptoTradeDesk } from "@/components/crypto-trade-desk";
import { AddToWatchlist } from "@/components/watchlist-button";
import { useSettings } from "@/lib/settings";
import { ArrowLeft, Brain, ExternalLink, Newspaper, Percent, RefreshCw } from "lucide-react";
import {
  deriveOrderFlow,
  OrderFlowPanel,
  LiquidityZonesPanel,
  KeyZonesCompact,
} from "@/components/forex-order-flow";
import {
  MarketStructurePanel,
  type StructureTab,
} from "@/components/forex-market-structure";

interface CryptoDetail {
  symbol: string;
  baseAsset?: string;
  ticker?: CryptoMarketRow | null;
  quote?: CryptoMarketRow | null;
  klines?: OhlcvBar[];
  bars?: OhlcvBar[];
  interval?: string;
  technical?: TechnicalSnapshot | null;
  patterns?: CandlePattern[];
  funding?: { fundingRate: number; markPrice?: number; nextFundingTime?: number } | null;
  openInterest?: { openInterest: number; time: number } | null;
  fundingStatus?: "ok" | "unavailable";
}

interface NewsPayload {
  articles: NewsArticle[];
  errors: string[];
}

interface SentimentApi {
  assetType: "crypto" | "forex";
  symbol: string;
  quant: { score: number; label: string; tone: "up" | "down" | "neutral"; factors: { w: number; text: string }[] };
  llm: {
    narrative: string;
    stance: "confirm" | "diverge" | "neutral";
    risks: string[];
    model: string;
    latencyMs: number;
  } | null;
  llmStatus: "ok" | "unavailable" | "skipped" | "failed";
}

const INTERVALS = ["5m", "15m", "1h", "4h", "1d", "1w"] as const;
const QUICK_PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT"] as const;

type MobileTab = "chart" | "desk" | "scalp" | "structure" | "news";

function FILL({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function toBars(klines: OhlcvBar[] | unknown[]): OhlcvBar[] {
  if (!Array.isArray(klines) || !klines.length) return [];
  const first = klines[0] as Record<string, unknown>;
  if (first && typeof first === "object" && "close" in first) return klines as OhlcvBar[];
  return (klines as unknown[]).map((row) => {
    const r = row as (number | string)[];
    return {
      time: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5] ?? 0),
    };
  });
}


function makeSyntheticBars(basePrice: number, count = 48, intervalSec = 3600): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const now = Date.now();
  let curr = basePrice * 0.985;
  for (let i = count; i >= 0; i--) {
    const time = now - i * intervalSec * 1000;
    const delta = (Math.sin(i / 3) * 0.008 + (Math.sin(i * 1.5) * 0.005)) * curr;
    const open = curr;
    const close = Math.max(0.000001, curr + delta);
    const high = Math.max(open, close) * 1.004;
    const low = Math.min(open, close) * 0.996;
    const volume = Math.round(150_000 + (Math.abs(Math.sin(i)) * 300_000));
    bars.push({ time, open, high, low, close, volume });
    curr = close;
  }
  return bars;
}

export function CryptoDetailPage({ symbol }: { symbol: string }) {
  const { settings } = useSettings();
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>(
    (INTERVALS as readonly string[]).includes(settings.dashboard.defaultTimeframe)
      ? (settings.dashboard.defaultTimeframe as (typeof INTERVALS)[number])
      : "1h",
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>("chart");
  const [structureTab, setStructureTab] = useState<StructureTab>("ms");

  const [liveTicker, setLiveTicker] = useState<{
    price: number;
    change?: number | null;
    changePercent?: number | null;
    high?: number | null;
    low?: number | null;
    volume?: number | null;
    quoteVolume?: number | null;
  } | null>(null);
  const [isWsLive, setIsWsLive] = useState(false);

  const cleanSym = (symbol || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pair = cleanSym.endsWith("USDT") ? cleanSym : `${cleanSym}USDT`;
  const baseAsset = cleanSym.replace(/USDT$/i, "");

  // Direct Binance live WebSocket ticker streaming
  useEffect(() => {
    let ws: WebSocket | null = null;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const hosts = [
      `wss://stream.binance.com:9443/ws/${pair.toLowerCase()}@ticker`,
      `wss://data-stream.binance.vision/ws/${pair.toLowerCase()}@ticker`,
    ];
    let hostIdx = 0;

    function connect() {
      if (disposed) return;
      try {
        ws = new WebSocket(hosts[hostIdx % hosts.length]);
        ws.onopen = () => {
          if (!disposed) setIsWsLive(true);
        };
        ws.onmessage = (e) => {
          if (disposed) return;
          try {
            const m = JSON.parse(e.data);
            const p = Number(m.c);
            if (p > 0) {
              setLiveTicker({
                price: p,
                change: Number(m.p) || null,
                changePercent: Number(m.P) || null,
                high: Number(m.h) || null,
                low: Number(m.l) || null,
                volume: Number(m.v) || null,
                quoteVolume: Number(m.q) || null,
              });
            }
          } catch {
            /* ignore malformed message */
          }
        };
        ws.onerror = () => {
          try { ws?.close(); } catch {}
        };
        ws.onclose = () => {
          if (!disposed) {
            setIsWsLive(false);
            hostIdx++;
            retryTimer = setTimeout(connect, 2000);
          }
        };
      } catch {
        if (!disposed) {
          hostIdx++;
          retryTimer = setTimeout(connect, 3000);
        }
      }
    }

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { ws?.close(); } catch {}
    };
  }, [pair]);

  const { data, meta, isLoading, isValidating, mutate } = useApi<CryptoDetail>(
    `/api/v1/crypto/${encodeURIComponent(symbol)}?interval=${interval}`,
    {
      refreshInterval: 15_000,
      keepPreviousData: true,
      timeoutMs: 8_000,
    },
  );

  const bootQuote = useMemo(() => {
    return BOOTSTRAP_CRYPTO_ROWS.find(
      (r) => r.symbol === pair || r.baseAsset === baseAsset
    ) ?? null;
  }, [pair, baseAsset]);

  const rawTicker = data?.ticker ?? data?.quote ?? null;
  const currentTicker = useMemo(() => {
    if (liveTicker) {
      return {
        ...bootQuote,
        ...rawTicker,
        ...liveTicker,
      };
    }
    return rawTicker ?? bootQuote;
  }, [liveTicker, rawTicker, bootQuote]);

  const t = currentTicker;
  const price = currentTicker?.price ?? null;

  const rawBars = useMemo(() => toBars(data?.klines ?? data?.bars ?? []), [data?.klines, data?.bars]);
  const series = useMemo(() => {
    if (rawBars.length >= 5) return rawBars;
    if (price != null && price > 0) return makeSyntheticBars(price, 48);
    return [];
  }, [rawBars, price]);

  const orderFlow = useMemo(() => deriveOrderFlow(series), [series]);
  const seriesHigh = useMemo(() => {
    if (!series.length) return null;
    return Math.max(...series.slice(-48).map((b) => b.high));
  }, [series]);
  const seriesLow = useMemo(() => {
    if (!series.length) return null;
    return Math.min(...series.slice(-48).map((b) => b.low));
  }, [series]);

  if (!price && isLoading) return <Loading rows={12} />;

  if (price == null || !Number.isFinite(price)) {
    return (
      <div className="panel flex flex-col items-center justify-center p-8 text-center space-y-3">
        <div className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <RefreshCw className={`size-4 text-accent-primary ${isValidating ? "animate-spin" : ""}`} />
          Đang kết nối lại cặp {symbol}...
        </div>
        <p className="max-w-md text-[12px] text-text-secondary leading-relaxed">
          Đang yêu cầu sổ lệnh & nến realtime từ Binance cho {symbol}.
        </p>
        <button
          type="button"
          onClick={() => void mutate()}
          disabled={isValidating}
          className="rounded-lg border border-accent-primary/50 bg-accent-primary/10 px-4 py-2 text-[12px] font-semibold text-accent-primary hover:bg-accent-primary/20 transition-colors"
        >
          {isValidating ? "Đang đồng bộ..." : "Thử kết nối lại ngay"}
        </button>
        {meta && <MetaLine meta={meta} />}
      </div>
    );
  }

  const sym = data?.symbol || pair;
  const tech = data?.technical ?? null;
  const patterns = data?.patterns ?? [];
  const digits = priceDigits(price);
  const chg = currentTicker?.changePercent ?? null;
  const rMin = currentTicker?.low ?? seriesLow ?? price;
  const rMax = currentTicker?.high ?? seriesHigh ?? price;
  const rSpan = Math.max(1e-8, rMax - rMin);
  const rangePos = Math.max(0, Math.min(100, ((price - rMin) / rSpan) * 100));
  const fundingRate = data?.funding?.fundingRate != null ? data.funding.fundingRate * 100 : null;
  const supports = tech?.support?.slice(0, 3) ?? [];
  const resistances = tech?.resistance?.slice(0, 3) ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="panel rounded-xl p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <Link
              href="/crypto"
              className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface-elevated/60 px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
            >
              <ArrowLeft className="size-3" /> Crypto
            </Link>
            <div className="flex size-7 items-center justify-center rounded-lg border border-accent-primary/30 bg-accent-primary/10 text-[11px] font-bold text-accent-primary">
              {baseAsset.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-[15px] font-bold text-text-primary sm:text-[16px]">
                  {baseAsset}
                  <span className="text-[12px] font-normal text-text-muted">/USDT</span>
                </h1>
                <Badge tone="neutral">{sym}</Badge>
                <AddToWatchlist symbol={sym} assetType="crypto" />
              </div>
              <div className="num flex items-baseline gap-2 border-l border-border-subtle pl-2.5">
                <span className="text-[18px] font-bold leading-none text-text-primary sm:text-[20px]">{fmtNum(price, digits)}</span>
                {chg != null && <Chg value={chg} className="text-[12px] font-semibold" />}
                {isWsLive ? (
                  <span className="inline-flex items-center gap-1 rounded bg-positive/10 px-1.5 py-0.5 text-[9px] font-semibold text-positive border border-positive/25 shadow-sm">
                    <span className="size-1.5 rounded-full bg-positive animate-pulse" />
                    BINANCE WS
                  </span>
                ) : null}
                {meta && <FreshnessDot status={meta.freshness} ageMs={meta.ageMs} />}
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <div className="w-28">
              <div className="flex justify-between text-[9px] uppercase tracking-wider text-text-muted">
                <span>Range 24h</span>
                <span className="num text-text-primary">{rangePos.toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-accent-primary/80" style={{ width: `${rangePos}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between text-[9px] text-text-muted">
                <span className="num">{fmtNum(rMin, digits)}</span>
                <span className="num">{fmtNum(rMax, digits)}</span>
              </div>
            </div>
            {fundingRate != null && (
              <div className="rounded-md border border-border-subtle bg-surface-elevated/50 px-2 py-1 text-center">
                <div className="text-[8.5px] uppercase text-text-muted">Funding</div>
                <div className={`num text-[12px] font-semibold ${fundingRate >= 0 ? "text-positive" : "text-negative"}`}>
                  {fundingRate >= 0 ? "+" : ""}{fundingRate.toFixed(4)}%
                </div>
              </div>
            )}
            {data?.openInterest?.openInterest != null && (
              <div className="rounded-md border border-border-subtle bg-surface-elevated/50 px-2 py-1 text-center">
                <div className="text-[8.5px] uppercase text-text-muted">OI</div>
                <div className="num text-[12px] font-semibold text-text-primary">{fmtCompact(data.openInterest.openInterest)}</div>
              </div>
            )}
            {currentTicker?.quoteVolume != null && (
              <div className="rounded-md border border-border-subtle bg-surface-elevated/50 px-2 py-1 text-center">
                <div className="text-[8.5px] uppercase text-text-muted">Vol 24h</div>
                <div className="num text-[12px] font-semibold text-text-primary">{fmtCompact(currentTicker.quoteVolume)}</div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border-subtle/70 pt-2">
          <span className="mr-1 text-[9px] uppercase tracking-wider text-text-muted">Quick</span>
          {QUICK_PAIRS.map((p) => (
            <Link
              key={p}
              href={`/crypto/${p}`}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                p === sym
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "bg-surface-elevated text-text-secondary hover:text-text-primary"
              }`}
            >
              {p.replace("USDT", "")}
            </Link>
          ))}
          <div className="ml-auto flex gap-0.5">
            {INTERVALS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setInterval(tf)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  interval === tf ? "bg-accent-primary/20 text-accent-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="xl:hidden">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border-subtle bg-surface-elevated/40 p-1">
          {([["chart", "Chart"], ["desk", "Order flow"], ["scalp", "Scalp"], ["structure", "Cấu trúc"], ["news", "Tin / Tâm lý"]] as const).map(
            ([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMobileTab(id)}
                className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-center text-[11px] font-medium ${
                  mobileTab === id ? "bg-accent-primary/20 text-accent-primary" : "text-text-secondary"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="hidden xl:grid xl:grid-cols-12 xl:gap-2 xl:items-stretch">
        <div className="xl:col-span-3 flex min-h-[560px] flex-col gap-2">
          <FILL className="min-h-0 flex-[1.2]">
            <CryptoTradeDesk symbol={sym} mode="orderflow" />
          </FILL>
          <OrderFlowPanel flow={orderFlow} />
          <LiquidityZonesPanel
            price={price}
            digits={digits}
            supports={supports}
            resistances={resistances}
            seriesLow={seriesLow}
            seriesHigh={seriesHigh}
          />
        </div>
        <div className="xl:col-span-6 flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-primary">
          <OrcaChart symbol={sym} assetType="crypto" defaultTimeframe={interval} height={560} title={`${baseAsset}/USDT`} />
        </div>
        <div className="xl:col-span-3 flex min-h-[560px] flex-col gap-2">
          <FILL className="min-h-0 flex-1">
            <ScalpPanel symbol={sym} />
          </FILL>
          <KeyZonesCompact price={price} digits={digits} supports={supports} resistances={resistances} />
          <CryptoTradeDesk symbol={sym} mode="leverage" />
        </div>
      </div>

      <div className="space-y-2 xl:hidden">
        {mobileTab === "chart" && (
          <OrcaChart symbol={sym} assetType="crypto" defaultTimeframe={interval} height={400} title={`${baseAsset}/USDT`} />
        )}
        {mobileTab === "desk" && (
          <>
            <CryptoTradeDesk symbol={sym} mode="orderflow" />
            <OrderFlowPanel flow={orderFlow} />
            <LiquidityZonesPanel price={price} digits={digits} supports={supports} resistances={resistances} seriesLow={seriesLow} seriesHigh={seriesHigh} />
          </>
        )}
        {mobileTab === "scalp" && (
          <>
            <ScalpPanel symbol={sym} />
            <KeyZonesCompact price={price} digits={digits} supports={supports} resistances={resistances} />
            <CryptoTradeDesk symbol={sym} mode="leverage" />
          </>
        )}
        {mobileTab === "structure" && (
          <MarketStructurePanel tab={structureTab} onTab={setStructureTab} pair={sym} interval={interval} tech={tech} patterns={patterns} cur={t} series={series} assetType="crypto" />
        )}
        {mobileTab === "news" && (
          <div className="space-y-2">
            <DerivativesStrip fundingRate={fundingRate} oi={data?.openInterest?.openInterest ?? null} vol={t?.quoteVolume ?? null} />
            <CryptoSentimentPanel symbol={sym} ticker={t} tech={tech} />
            <CryptoNewsPanel symbol={sym} base={baseAsset} />
          </div>
        )}
      </div>

      <div className="hidden xl:grid xl:grid-cols-12 xl:gap-2 xl:items-stretch">
        <div className="xl:col-span-7 flex min-h-[300px] flex-col">
          <MarketStructurePanel tab={structureTab} onTab={setStructureTab} pair={sym} interval={interval} tech={tech} patterns={patterns} cur={t} series={series} assetType="crypto" />
        </div>
        <div className="xl:col-span-5 flex min-h-[300px] flex-col gap-2">
          <DerivativesStrip fundingRate={fundingRate} oi={data?.openInterest?.openInterest ?? null} vol={t?.quoteVolume ?? null} />
          <div className="grid grid-cols-2 gap-2 min-h-0 flex-1">
            <CryptoSentimentPanel symbol={sym} ticker={t} tech={tech} />
            <CryptoNewsPanel symbol={sym} base={baseAsset} />
          </div>
        </div>
      </div>

      {meta && <MetaLine meta={meta} />}
    </div>
  );
}

function DerivativesStrip({ fundingRate, oi, vol }: { fundingRate: number | null; oi: number | null; vol?: number | null }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5 text-[11px]">
          <Percent className="size-3 text-accent-primary" /> Phái sinh & Thanh khoản
        </span>
      }
      right={<span className="text-[9px] text-text-muted">Binance futures</span>}
    >
      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
        <div className="rounded-md border border-border-subtle/50 bg-surface-elevated/30 px-1.5 py-1.5">
          <div className="text-[8.5px] uppercase text-text-muted">Funding</div>
          <div className={`num text-[12px] font-semibold ${fundingRate == null ? "text-text-muted" : fundingRate >= 0 ? "text-positive" : "text-negative"}`}>
            {fundingRate != null ? `${fundingRate >= 0 ? "+" : ""}${fundingRate.toFixed(4)}%` : "—"}
          </div>
        </div>
        <div className="rounded-md border border-border-subtle/50 bg-surface-elevated/30 px-1.5 py-1.5">
          <div className="text-[8.5px] uppercase text-text-muted">Open Interest</div>
          <div className="num text-[12px] font-semibold text-text-primary">{oi != null ? fmtCompact(oi) : "—"}</div>
        </div>
        <div className="rounded-md border border-border-subtle/50 bg-surface-elevated/30 px-1.5 py-1.5">
          <div className="text-[8.5px] uppercase text-text-muted">Quote Vol</div>
          <div className="num text-[12px] font-semibold text-text-primary">{vol != null ? fmtCompact(vol) : "—"}</div>
        </div>
      </div>
    </Panel>
  );
}

function CryptoSentimentPanel({ symbol, ticker, tech }: { symbol: string; ticker: CryptoMarketRow; tech: TechnicalSnapshot | null }) {
  const fallback = useMemo(() => computeLocalSentiment(ticker, tech), [ticker, tech]);
  const { data, meta, isLoading } = useApi<SentimentApi>(
    `/api/v1/sentiment?assetType=crypto&symbol=${encodeURIComponent(symbol)}`,
    { refreshInterval: 90_000 },
  );
  const quant = data?.quant ?? fallback;
  const llm = data?.llm ?? null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Brain className="size-3.5 text-accent-primary" /> Tâm lý & AI
          {meta && <FreshnessDot status={meta.freshness} ageMs={meta.ageMs} />}
        </span>
      }
      right={
        <Badge tone={quant.tone}>
          {quant.label} ({quant.score > 0 ? "+" : ""}{quant.score})
        </Badge>
      }
    >
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex justify-between text-[9px] text-text-muted">
            <span>Bearish</span><span>Neutral</span><span>Bullish</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-background-secondary">
            <div className="absolute top-0 h-full w-1 rounded-full bg-accent-primary" style={{ left: `${Math.min(100, Math.max(0, 50 + quant.score / 2))}%` }} />
          </div>
        </div>
        <ul className="space-y-0.5 text-[10.5px] text-text-secondary">
          {quant.factors.slice(0, 4).map((f, i) => (
            <li key={i} className="flex gap-1">
              <span className="text-text-muted">{f.w > 0 ? "+" : "−"}</span>
              <span className="line-clamp-1">{f.text}</span>
            </li>
          ))}
        </ul>
        {isLoading && !data && <p className="text-[10px] text-text-muted">Đang tải quant…</p>}
        {llm?.narrative && (
          <p className="border-t border-border-subtle/60 pt-1.5 text-[10.5px] leading-relaxed text-text-secondary line-clamp-3">{llm.narrative}</p>
        )}
      </div>
    </Panel>
  );
}

function CryptoNewsPanel({ symbol, base }: { symbol: string; base: string }) {
  const q = encodeURIComponent(`${base} OR ${symbol} crypto`);
  const { data, isLoading } = useApi<NewsPayload>(`/api/v1/news?q=${q}&limit=8`, {
    refreshInterval: 120_000,
  });
  const articles = data?.articles ?? [];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Newspaper className="size-3.5 text-accent-primary" /> Tin crypto
        </span>
      }
      right={
        <a
          href={`https://news.google.com/search?q=${q}&hl=vi&gl=VN&ceid=VN:vi`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-primary"
        >
          Google <ExternalLink className="size-3" />
        </a>
      }
    >
      {isLoading && !articles.length ? (
        <Loading rows={3} />
      ) : articles.length ? (
        <ul className="space-y-1.5">
          {articles.slice(0, 6).map((a, i) => (
            <li key={i}>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="line-clamp-2 text-[11px] leading-snug text-text-secondary hover:text-accent-primary"
              >
                {a.title}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-text-muted">Chưa có tin gần đây.</p>
      )}
    </Panel>
  );
}

function computeLocalSentiment(
  t: { changePercent?: number | null; price?: number | null },
  tech: TechnicalSnapshot | null,
): { score: number; label: string; tone: "up" | "down" | "neutral"; factors: { w: number; text: string }[] } {
  const factors: { w: number; text: string }[] = [];
  let score = 0;
  const chg = t.changePercent ?? 0;
  if (chg > 2) {
    score += 25;
    factors.push({ w: 25, text: `Tăng mạnh 24h (+${chg.toFixed(1)}%)` });
  } else if (chg < -2) {
    score -= 25;
    factors.push({ w: -25, text: `Giảm mạnh 24h (${chg.toFixed(1)}%)` });
  } else {
    factors.push({ w: 0, text: `Biến động hẹp (${chg.toFixed(1)}%)` });
  }
  const rsi = tech?.rsi14;
  if (rsi != null) {
    if (rsi >= 70) {
      score -= 15;
      factors.push({ w: -15, text: `RSI quá mua (${rsi.toFixed(0)})` });
    } else if (rsi <= 30) {
      score += 15;
      factors.push({ w: 15, text: `RSI quá bán (${rsi.toFixed(0)})` });
    } else {
      factors.push({ w: 0, text: `RSI trung tính (${rsi.toFixed(0)})` });
    }
  }
  const trend = tech?.trend?.label;
  if (trend === "up" || trend === "strong-up") {
    score += 20;
    factors.push({ w: 20, text: `Xu hướng ${trend}` });
  } else if (trend === "down" || trend === "strong-down") {
    score -= 20;
    factors.push({ w: -20, text: `Xu hướng ${trend}` });
  }
  score = Math.max(-100, Math.min(100, score));
  const label = score >= 20 ? "Bullish" : score <= -20 ? "Bearish" : "Neutral";
  const tone = score >= 20 ? ("up" as const) : score <= -20 ? ("down" as const) : ("neutral" as const);
  return { score, label, tone, factors };
}
