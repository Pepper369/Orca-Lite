"use client";

import { memo, useEffect, useMemo, useRef, useState, use, type ReactNode } from "react";
import { prefetchApi, useApi } from "@/lib/hooks";
import type { VnStockDetail } from "@/lib/services/stocks";
import { AddToWatchlist } from "@/components/watchlist-button";
import { QuickPaperTradeButton } from "@/components/portfolio/quick-paper-trade-modal";
import { StockTabs } from "@/components/stocks/stock-tabs";
import { Chg, fmtCompact, fmtNum, FreshnessDot, Loading, Panel } from "@/components/ui";
import { getSecurity } from "@/lib/vn/master";
import { BOOTSTRAP_VN30_QUOTES } from "@/lib/bootstrap-data";

export default function StockSymbolLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ symbol: string }>;
}) {
  const resolvedParams = use(params);
  const symbol = resolvedParams.symbol.toUpperCase();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [liveTick, setLiveTick] = useState<{
    price: number;
    volume?: number | null;
    high?: number | null;
    low?: number | null;
    ts: number;
  } | null>(null);

  // Realtime live tick polling from VNDirect/VPS provider
  useEffect(() => {
    if (!symbol) return;
    let disposed = false;
    async function fetchLive() {
      if (disposed) return;
      try {
        const res = await fetch(
          `/api/v1/chart/live-quote?symbol=${encodeURIComponent(symbol)}&assetType=stock&_=${Date.now()}`
        );
        if (!res.ok) return;
        const j = await res.json();
        if (j?.success && j?.data?.price > 0 && !disposed) {
          setLiveTick({
            price: Number(j.data.price),
            volume: Number(j.data.volume) || null,
            high: Number(j.data.high) || null,
            low: Number(j.data.low) || null,
            ts: Number(j.data.ts) || Date.now(),
          });
        }
      } catch {
        /* ignore live errors */
      }
    }
    fetchLive();
    const timer = setInterval(fetchLive, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [symbol]);

  // P6-A: soft shell — keepPreviousData + short timeout; never gate children on full payload
  const { res, data, meta, isLoading } = useApi<VnStockDetail>(
    symbol ? `/api/v1/stocks/${symbol}` : null,
    {
      refreshInterval: 12_000,
      keepPreviousData: true,
      timeoutMs: 8_000,
    },
  );

  useEffect(() => {
    if (!symbol) return;
    const paths = [
      `/api/v1/stocks/${symbol}/technical`,
      `/api/v1/stocks/${symbol}/valuation`,
      `/api/v1/stocks/${symbol}/financials`,
      `/api/v1/stocks/${symbol}/structure`,
      `/api/v1/stocks/${symbol}/tech-reco`,
      `/api/v1/stocks/${symbol}/style-fit`,
    ];
    const run = () => {
      const priority = [
        `/api/v1/stocks/${symbol}/style-fit`,
        `/api/v1/stocks/${symbol}/structure`,
        `/api/v1/stocks/${symbol}/tech-reco`,
      ];
      for (const url of priority) prefetchApi(url);
      for (const url of paths) {
        if (priority.includes(url)) continue;
        prefetchApi(url);
      }
    };
    if (typeof requestIdleCallback !== "undefined") requestIdleCallback(run, { timeout: 800 });
    else setTimeout(run, 120);
    for (const url of [
      `/api/v1/stocks/${symbol}/style-fit`,
      `/api/v1/stocks/${symbol}/structure`,
    ]) {
      prefetchApi(url);
    }
  }, [symbol]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(
      (entries) => setStuck(!entries[0]?.isIntersecting),
      { rootMargin: "-1px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const sec = useMemo(() => (symbol ? getSecurity(symbol) : null), [symbol]);
  const bootQuote = useMemo(() => {
    return symbol ? BOOTSTRAP_VN30_QUOTES.find((b) => b.symbol === symbol) ?? null : null;
  }, [symbol]);

  const rawQ = data?.quote ?? bootQuote;
  const q = useMemo(() => {
    if (liveTick && rawQ) {
      const chg = rawQ.referencePrice ? liveTick.price - rawQ.referencePrice : rawQ.change;
      const chgPct = rawQ.referencePrice ? (chg! / rawQ.referencePrice) * 100 : rawQ.changePercent;
      return {
        ...rawQ,
        price: liveTick.price,
        change: chg,
        changePercent: chgPct,
        volume: liveTick.volume ?? rawQ.volume,
        high: liveTick.high ?? rawQ.high,
        low: liveTick.low ?? rawQ.low,
      };
    }
    if (liveTick && !rawQ) {
      return {
        symbol,
        name: sec?.name ?? symbol,
        price: liveTick.price,
        change: 0,
        changePercent: 0,
        referencePrice: liveTick.price,
        ceilingPrice: Number((liveTick.price * 1.07).toFixed(2)),
        floorPrice: Number((liveTick.price * 0.93).toFixed(2)),
        volume: liveTick.volume ?? 0,
        quoteVolume: 0,
        assetClass: "stock" as const,
      };
    }
    return rawQ;
  }, [rawQ, liveTick, symbol, sec]);

  // P6-A: only wait for symbol resolve — render soft hero + children immediately
  if (!symbol) {
    return (
      <div className="stock-workspace stock-page-body">
        <Loading rows={4} full label="Đang mở trang cổ phiếu…" />
      </div>
    );
  }

  const ff = data?.foreignFlow?.latest as
    | { buyVal?: number; sellVal?: number; netVal?: number; currentRoom?: number }
    | undefined;
  const hasForeign =
    ff != null &&
    [ff.buyVal, ff.sellVal, ff.netVal].some((v) => v != null && Number(v) !== 0);
  const floor = data?.profile?.floor || sec?.exchange || null;
  const name = data?.name || q?.name || bootQuote?.name || sec?.name || null;

  return (
    <div className="stock-workspace stock-page-body">
      <div ref={sentinelRef} aria-hidden="true" className="stock-sticky-sentinel" />
      <div className="stock-sticky-head" data-stuck={stuck ? "true" : "false"}>
        <Panel pad={false} className="stock-hero-panel overflow-visible">
          <div className="stock-hero">
            <div className="stock-hero-main">
              <div className="stock-hero-title-row">
                <h1 className="stock-hero-symbol">{symbol}</h1>
                {floor ? <span className="stock-floor-badge">{floor}</span> : null}
                {name ? (
                  <span className="stock-hero-name">{name}</span>
                ) : null}
                {liveTick ? (
                  <span className="inline-flex items-center gap-1 rounded bg-positive/10 px-1.5 py-0.5 text-[9px] font-semibold text-positive border border-positive/25 shadow-sm">
                    <span className="size-1.5 rounded-full bg-positive animate-pulse" />
                    ORCA LIVE
                  </span>
                ) : null}
                <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
                <QuickPaperTradeButton
                  symbol={symbol}
                  currentPrice={q?.price}
                  ceilingPrice={q?.ceilingPrice}
                  floorPrice={q?.floorPrice}
                />
                <AddToWatchlist assetType="stock" symbol={symbol} />
              </div>

              {q ? (
                <div className="stock-hero-price-row num">
                  <span className="stock-hero-price">{fmtNum(q.price, 2)}</span>
                  <Chg value={q.changePercent} className="text-[13px] sm:text-[14px]" />
                  {q.change != null && (
                    <span
                      className={`text-[12px] leading-none ${
                        q.change >= 0 ? "text-up" : "text-down"
                      }`}
                    >
                      {q.change >= 0 ? "+" : ""}
                      {fmtNum(q.change, 2)}
                    </span>
                  )}
                  {(q.referencePrice != null ||
                    q.ceilingPrice != null ||
                    q.floorPrice != null) && (
                    <div className="stock-band-grid" aria-label="Biên độ giá">
                      {q.referencePrice != null && (
                        <div className="stock-band-cell stock-band-cell--tc">
                          <span className="stock-band-label">TC</span>
                          <span className="stock-band-val num">{fmtNum(q.referencePrice, 2)}</span>
                        </div>
                      )}
                      {q.ceilingPrice != null && (
                        <div className="stock-band-cell stock-band-cell--ceil">
                          <span className="stock-band-label">Trần</span>
                          <span className="stock-band-val num">{fmtNum(q.ceilingPrice, 2)}</span>
                        </div>
                      )}
                      {q.floorPrice != null && (
                        <div className="stock-band-cell stock-band-cell--floor">
                          <span className="stock-band-label">Sàn</span>
                          <span className="stock-band-val num">{fmtNum(q.floorPrice, 2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="stock-hero-empty mt-2">
                  Đang đồng bộ giá phiên khớp lệnh…
                </p>
              )}
            </div>

            <div className="stock-hero-stats">
              <Stat label="Khối lượng" value={fmtCompact(q?.volume)} />
              <Stat label="Giá trị" value={fmtCompact(q?.quoteVolume)} />
              <Stat
                label="CP lưu hành"
                value={
                  data?.sharesOutstanding != null ? fmtCompact(data.sharesOutstanding) : "—"
                }
              />
              <Stat
                label="NN ròng"
                value={ff?.netVal != null ? fmtCompact(ff.netVal) : "—"}
                tone={
                  ff?.netVal != null ? (ff.netVal >= 0 ? "up" : "down") : undefined
                }
              />
              <Stat
                label="Cập nhật"
                value={
                  q?.updatedAt
                    ? (() => {
                        try {
                          return new Date(q.updatedAt).toLocaleTimeString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh",
                            hour: "2-digit",
                            minute: "2-digit",
                          });
                        } catch {
                          return String(q.updatedAt).slice(11, 16) || "—";
                        }
                      })()
                    : "—"
                }
              />
            </div>
          </div>

          {hasForeign && ff ? (
            <div className="stock-meta-strip" aria-label="Dòng vốn nước ngoài">
              <span className="stock-meta-chip">
                <span className="stock-meta-chip-label">NN mua</span>
                <span className="num stock-meta-chip-value text-up">
                  {fmtCompact(ff.buyVal)}
                </span>
              </span>
              <span className="stock-meta-chip">
                <span className="stock-meta-chip-label">NN bán</span>
                <span className="num stock-meta-chip-value text-down">
                  {fmtCompact(ff.sellVal)}
                </span>
              </span>
              <span className="stock-meta-chip">
                <span className="stock-meta-chip-label">Ròng</span>
                <span
                  className={`num stock-meta-chip-value ${
                    (ff.netVal ?? 0) >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {fmtCompact(ff.netVal)}
                </span>
              </span>
              {ff.currentRoom != null && Number(ff.currentRoom) !== 0 && (
                <span className="stock-meta-chip">
                  <span className="stock-meta-chip-label">Room còn</span>
                  <span className="num stock-meta-chip-value">{fmtCompact(ff.currentRoom)}</span>
                </span>
              )}
            </div>
          ) : null}

          <StockTabs symbol={symbol} />
        </Panel>
      </div>
      {/* P6-A: children always mount — parallel section paint */}
      {children}
    </div>
  );
}

const Stat = memo(function Stat({
  label,
  value,
  className = "",
  tone,
}: {
  label: string;
  value: string;
  className?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className={`stock-stat ${className}`.trim()}>
      <div className="stock-stat-label">{label}</div>
      <div
        className={`stock-stat-value num ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
});
