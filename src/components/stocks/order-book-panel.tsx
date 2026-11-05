"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/hooks";
import type { VnOrderBook, VnTrade } from "@/lib/services/stock-orderbook";
import type { FreshnessStatus } from "@/lib/types";
import {
  analyzeBigOrderTape,
  formatVndShort,
  analyzeTrade,
  BIG_ORDER_VALUE_THRESHOLD,
  BIG_ORDER_VOLUME_THRESHOLD,
} from "@/lib/services/big-order-tape";
import {
  FreshnessDot,
  Loading,
  Panel,
  Unavailable,
  ErrorState,
  FreshnessAlertBanner,
} from "@/components/ui";

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  if (p >= 10) return p.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  return p.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 1 : 2)}K`;
  return v.toLocaleString("vi-VN");
}

function fmtTime(t: string | null, eventTime: number): string {
  if (t && /^\d{1,2}:\d{2}/.test(t)) return t.length >= 8 ? t.slice(0, 8) : t;
  try {
    return new Date(eventTime).toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--:--";
  }
}

/** Terminal-style market depth + Big Order Tape — SSE primary, REST 10s fallback. */
export function OrderBookPanel({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  const { res, data: restData, meta: restMeta, isLoading, mutate } = useApi<VnOrderBook>(
    symbol ? `/api/v1/stocks/${symbol}/orderbook` : null,
    { refreshInterval: 10_000, timeoutMs: 7_000 },
  );

  const [live, setLive] = useState<VnOrderBook | null>(null);
  const [sseState, setSseState] = useState<"connecting" | "open" | "error" | "off">("off");

  // Orca interactive controls: Mode (3-levels vs Full) & Trade Filter (all, buy, sell, whale)
  const [viewMode, setViewMode] = useState<"l3" | "full">("l3");
  const [tradeFilter, setTradeFilter] = useState<"all" | "buy" | "sell" | "whale">("all");

  const mergeBook = useCallback(
    (partial: Partial<VnOrderBook> & { symbol?: string }) => {
      window.setTimeout(() => {
        setLive((prev) => {
          const base = prev ?? restData ?? null;
          if (!base && !partial.bids && !partial.asks) return prev;
          const next: VnOrderBook = {
            symbol: partial.symbol ?? base?.symbol ?? symbol,
            bids: partial.bids ?? base?.bids ?? [],
            asks: partial.asks ?? base?.asks ?? [],
            bidTotal: partial.bidTotal ?? base?.bidTotal ?? 0,
            askTotal: partial.askTotal ?? base?.askTotal ?? 0,
            imbalance: partial.imbalance ?? base?.imbalance ?? null,
            lastPrice: partial.lastPrice ?? base?.lastPrice ?? null,
            ceiling: partial.ceiling ?? base?.ceiling ?? null,
            floor: partial.floor ?? base?.floor ?? null,
            ref: partial.ref ?? base?.ref ?? null,
            session: partial.session ?? base?.session ?? null,
            eventTime: partial.eventTime ?? Date.now(),
            levels: partial.levels ?? base?.levels ?? 0,
            trades: partial.trades ?? base?.trades ?? [],
            tradeBuyVol: partial.tradeBuyVol ?? base?.tradeBuyVol ?? 0,
            tradeSellVol: partial.tradeSellVol ?? base?.tradeSellVol ?? 0,
            tradeTotalVol: partial.tradeTotalVol ?? base?.tradeTotalVol ?? 0,
            fromLastSession: partial.fromLastSession ?? base?.fromLastSession ?? false,
          };
          if (next.bids.length || next.asks.length) {
            next.levels = Math.max(next.bids.length, next.asks.length);
            const tot = next.bidTotal + next.askTotal;
            next.imbalance = tot > 0 ? (next.bidTotal - next.askTotal) / tot : null;
          }
          return next;
        });
      }, 0);
    },
    [restData, symbol],
  );

  // Sync REST payload into live state
  useEffect(() => {
    if (restData) {
      window.setTimeout(() => {
        setLive((prev) => {
          if (!prev) return restData;
          if ((restData.eventTime ?? 0) >= (prev.eventTime ?? 0)) return restData;
          return prev;
        });
      }, 0);
    }
  }, [restData]);

  // SSE stream for real-time orderbook updates
  useEffect(() => {
    if (!symbol) return;
    let es: EventSource | null = null;
    let closed = false;
    const url = `/api/v1/stocks/${symbol}/orderbook/stream`;
    try {
      window.setTimeout(() => setSseState("connecting"), 0);
      es = new EventSource(url);
      es.onopen = () => {
        if (!closed) setSseState("open");
      };
      es.onerror = () => {
        if (!closed) setSseState("error");
      };
      const applyBookEvent = (ev: Event) => {
        try {
          const raw = JSON.parse((ev as MessageEvent).data) as
            | Partial<VnOrderBook>
            | { book?: Partial<VnOrderBook> | null; orderBook?: Partial<VnOrderBook> | null };
          const payload = ("orderBook" in raw ? raw.orderBook : "book" in raw ? raw.book : raw) as
            | Partial<VnOrderBook>
            | null
            | undefined;
          if (payload) mergeBook(payload);
        } catch {
          /* ignore */
        }
      };
      es.addEventListener("snapshot", applyBookEvent);
      es.addEventListener("orderbook", applyBookEvent);
      es.onmessage = applyBookEvent;
      es.addEventListener("book", applyBookEvent);
      es.addEventListener("trade", (ev) => {
        try {
          const tr = JSON.parse((ev as MessageEvent).data) as VnTrade;
          setLive((prev) => {
            if (!prev) return prev;
            const trades = [tr, ...(prev.trades ?? [])].slice(0, 80);
            const tradeBuyVol = trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.volume, 0);
            const tradeSellVol = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.volume, 0);
            return {
              ...prev,
              trades,
              tradeBuyVol,
              tradeSellVol,
              tradeTotalVol: trades.reduce((s, t) => s + t.volume, 0),
              lastPrice: tr.price,
              eventTime: tr.eventTime,
              fromLastSession: false,
            };
          });
        } catch {
          /* ignore */
        }
      });
    } catch {
      window.setTimeout(() => setSseState("off"), 0);
    }
    return () => {
      closed = true;
      es?.close();
      setSseState("off");
    };
  }, [symbol, mergeBook]);

  const data = live ?? restData;

  const freshness: FreshnessStatus = data?.fromLastSession
    ? "STALE"
    : sseState === "open"
    ? "LIVE"
    : restMeta?.freshness ?? "FRESH";
  const ageMs = data?.eventTime ? Math.max(0, Date.now() - data.eventTime) : restMeta?.ageMs ?? 0;

  if (isLoading && !data) {
    return (
      <Panel title="Sổ lệnh & Khớp lệnh">
        <Loading />
      </Panel>
    );
  }

  if (!data) {
    if (res?.error) {
      return (
        <Panel title="Sổ lệnh & Khớp lệnh" right={<FreshnessDot status="UNAVAILABLE" ageMs={ageMs} />}>
          <ErrorState
            title={`Không thể tải sổ lệnh ${symbol}`}
            message={res.error.message}
            onRetry={() => void mutate()}
          />
        </Panel>
      );
    }
    return (
      <Panel title="Sổ lệnh & Khớp lệnh" right={<FreshnessDot status="UNAVAILABLE" ageMs={ageMs} />}>
        <Unavailable
          title={`Chưa có sổ lệnh ${symbol}`}
          note="Hệ thống chuyển mạch tự động đa nguồn (VPS, Entrade, VNDirect, Vietcap). Trong phiên giao dịch, sổ lệnh cập nhật trực tiếp."
        />
      </Panel>
    );
  }

  // Price coloring function based on Ref, Ceiling, Floor
  const getPriceColor = (price: number | null | undefined): string => {
    if (price == null) return "text-ink";
    if (data.ceiling != null && price >= data.ceiling - 0.01) return "text-purple-400 font-bold";
    if (data.floor != null && price <= data.floor + 0.01) return "text-sky-400 font-bold";
    if (data.ref != null) {
      if (price > data.ref) return "text-up font-semibold";
      if (price < data.ref) return "text-down font-semibold";
      return "text-yellow-400 font-semibold";
    }
    return "text-ink";
  };

  const displayedLevels = viewMode === "l3" ? 3 : Math.min(Math.max(data.bids.length, data.asks.length, 3), 10);
  const maxLevelVol = Math.max(
    ...data.bids.slice(0, displayedLevels).map((l) => l.volume),
    ...data.asks.slice(0, displayedLevels).map((l) => l.volume),
    1,
  );

  const totalDepth = data.bidTotal + data.askTotal;
  const buyDepthPct = totalDepth > 0 ? (data.bidTotal / totalDepth) * 100 : 50;
  const sellDepthPct = totalDepth > 0 ? (data.askTotal / totalDepth) * 100 : 50;

  // Big Order Tape & Whale analysis
  const trades = data.trades ?? [];
  const tapeSummary = analyzeBigOrderTape(trades);

  const buyTradesVol = data.tradeBuyVol || trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.volume, 0);
  const sellTradesVol = data.tradeSellVol || trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.volume, 0);
  const totalTradesVol = buyTradesVol + sellTradesVol;
  const buyAggressorPct = totalTradesVol > 0 ? (buyTradesVol / totalTradesVol) * 100 : 50;
  const sellAggressorPct = totalTradesVol > 0 ? (sellTradesVol / totalTradesVol) * 100 : 50;

  // Filtered trades list
  const filteredTrades = trades.filter((t) => {
    if (tradeFilter === "buy") return t.side === "buy";
    if (tradeFilter === "sell") return t.side === "sell";
    if (tradeFilter === "whale") {
      const val = (t.price || 0) * (t.volume || 0);
      return val >= BIG_ORDER_VALUE_THRESHOLD || t.volume >= BIG_ORDER_VOLUME_THRESHOLD;
    }
    return true;
  });

  return (
    <div className={`grid gap-3.5 ${compact ? "" : "xl:grid-cols-2"}`}>
      {/* ----------------- PANEL 1: SỔ LỆNH 3 CẤP (ORCA DEPTH OF MARKET) ----------------- */}
      <Panel
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">Sổ lệnh 3 cấp</span>
            <div className="flex items-center rounded-md bg-panel-3 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setViewMode("l3")}
                className={`rounded px-2 py-0.5 transition-all ${
                  viewMode === "l3"
                    ? "bg-accent text-white font-medium shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                3 Cấp
              </button>
              <button
                type="button"
                onClick={() => setViewMode("full")}
                className={`rounded px-2 py-0.5 transition-all ${
                  viewMode === "full"
                    ? "bg-accent text-white font-medium shadow-xs"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                Đầy đủ
              </button>
            </div>
            {data.fromLastSession ? (
              <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                Phiên gần nhất
              </span>
            ) : (
              <span className="rounded bg-up/10 px-1.5 py-0.5 text-[10px] font-medium text-up">
                {sseState === "open" ? "Streaming Live" : "Fast-path"}
              </span>
            )}
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            {data.ref != null && (
              <div className="hidden sm:flex items-center gap-1.5 text-[10px]">
                <span className="text-purple-400 font-mono">Trần: {fmtPrice(data.ceiling || 0)}</span>
                <span className="text-yellow-400 font-mono">TC: {fmtPrice(data.ref)}</span>
                <span className="text-sky-400 font-mono">Sàn: {fmtPrice(data.floor || 0)}</span>
              </div>
            )}
            <FreshnessDot status={freshness} ageMs={ageMs} />
          </div>
        }
        pad={false}
      >
        {/* Central Match Price Banner */}
        {data.lastPrice != null && (
          <div className="flex items-center justify-between border-b border-line bg-panel-2/70 px-3 py-1.5 text-xs">
            <span className="text-[11px] text-ink-3">Khớp gần nhất:</span>
            <div className="flex items-center gap-2">
              <span className={`num text-base font-bold tracking-tight ${getPriceColor(data.lastPrice)}`}>
                {fmtPrice(data.lastPrice)}
              </span>
              {data.ref != null && (
                <span
                  className={`num rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    data.lastPrice > data.ref
                      ? "bg-up/10 text-up"
                      : data.lastPrice < data.ref
                      ? "bg-down/10 text-down"
                      : "bg-yellow-400/10 text-yellow-400"
                  }`}
                >
                  {data.lastPrice > data.ref ? "+" : ""}
                  {(data.lastPrice - data.ref).toFixed(2)} (
                  {(((data.lastPrice - data.ref) / data.ref) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Level Headers */}
        <div className="grid grid-cols-6 gap-1 border-b border-line bg-panel-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          <span className="text-left text-ink-3">Cấp</span>
          <span className="text-right text-up">Giá mua</span>
          <span className="text-right text-ink-2">KL Mua</span>
          <span className="text-left text-down pl-2">Giá bán</span>
          <span className="text-right text-ink-2">KL Bán</span>
          <span className="text-right text-ink-3">Cấp</span>
        </div>

        {/* Order Book Rows (Level 1, 2, 3) with Big Order Wall indicators */}
        <div className="divide-y divide-line/30 font-mono">
          {Array.from({ length: displayedLevels }).map((_, i) => {
            const bid = data.bids[i];
            const ask = data.asks[i];
            const bidW = bid ? Math.min(100, (bid.volume / maxLevelVol) * 100) : 0;
            const askW = ask ? Math.min(100, (ask.volume / maxLevelVol) * 100) : 0;

            const isBigBid = bid && (bid.volume >= BIG_ORDER_VOLUME_THRESHOLD || bid.price * bid.volume >= BIG_ORDER_VALUE_THRESHOLD);
            const isBigAsk = ask && (ask.volume >= BIG_ORDER_VOLUME_THRESHOLD || ask.price * ask.volume >= BIG_ORDER_VALUE_THRESHOLD);

            const bidTag = `Mua ${i + 1}`;
            const askTag = `Bán ${i + 1}`;

            return (
              <div key={i} className="relative grid grid-cols-6 items-center gap-1 px-3 py-1.5 text-[11px]">
                {/* Volume Depth visual bars behind data */}
                {bid && (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 bg-up/10 border-r border-up/25 transition-all duration-300"
                    style={{ width: `${bidW / 2}%` }}
                  />
                )}
                {ask && (
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 bg-down/10 border-l border-down/25 transition-all duration-300"
                    style={{ width: `${askW / 2}%` }}
                  />
                )}

                {/* Bid side: Level tag, Price, Volume */}
                <span className="relative z-10 text-[10px] text-ink-3 font-sans">
                  {bid ? bidTag : "--"}
                </span>
                <span className={`relative z-10 text-right font-semibold ${getPriceColor(bid?.price)}`}>
                  {bid ? fmtPrice(bid.price) : "--"}
                </span>
                <span className="relative z-10 text-right text-ink-2">
                  {bid ? fmtVol(bid.volume) : "--"}
                  {isBigBid && (
                    <span className="ml-1 text-[9px] text-amber-400 font-bold" title="Tường mua lớn ≥1 tỷ/100k cp">
                      ⚡
                    </span>
                  )}
                </span>

                {/* Ask side: Price, Volume, Level tag */}
                <span className={`relative z-10 pl-2 text-left font-semibold ${getPriceColor(ask?.price)}`}>
                  {ask ? fmtPrice(ask.price) : "--"}
                </span>
                <span className="relative z-10 text-right text-ink-2">
                  {isBigAsk && (
                    <span className="mr-1 text-[9px] text-amber-400 font-bold" title="Tường bán lớn ≥1 tỷ/100k cp">
                      ⚡
                    </span>
                  )}
                  {ask ? fmtVol(ask.volume) : "--"}
                </span>
                <span className="relative z-10 text-right text-[10px] text-ink-3 font-sans">
                  {ask ? askTag : "--"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Total Depth of Market Bar (Cung - Cầu) */}
        <div className="border-t border-line bg-panel-2/40 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
            <span className="flex items-center gap-1.5 text-up">
              <span className="size-2 rounded-full bg-up" />
              Tổng dư mua: <span className="font-bold text-ink">{fmtVol(data.bidTotal)}</span>
              <span className="text-[10px] text-ink-3 font-normal">({buyDepthPct.toFixed(1)}%)</span>
            </span>
            <span className="flex items-center gap-1.5 text-down">
              <span className="text-[10px] text-ink-3 font-normal">({sellDepthPct.toFixed(1)}%)</span>
              Tổng dư bán: <span className="font-bold text-ink">{fmtVol(data.askTotal)}</span>
              <span className="size-2 rounded-full bg-down" />
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-panel-3">
            <div
              className="bg-up transition-all duration-500 ease-out"
              style={{ width: `${buyDepthPct}%` }}
              title={`Tổng dư mua: ${fmtVol(data.bidTotal)} (${buyDepthPct.toFixed(1)}%)`}
            />
            <div
              className="bg-down transition-all duration-500 ease-out"
              style={{ width: `${sellDepthPct}%` }}
              title={`Tổng dư bán: ${fmtVol(data.askTotal)} (${sellDepthPct.toFixed(1)}%)`}
            />
          </div>
        </div>

        {data.fromLastSession && (
          <FreshnessAlertBanner state="stale" ageMs={ageMs} />
        )}
      </Panel>

      {/* ----------------- PANEL 2: KHỚP LỆNH & BIG ORDER TAPE ----------------- */}
      <Panel
        title={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">Khớp lệnh & Lệnh lớn Cá Mập</span>
              {tapeSummary.bigTradesCount > 0 && (
                <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                  ⚡ {tapeSummary.bigTradesCount} lệnh cá mập
                </span>
              )}
            </div>
            {/* Filter buttons */}
            <div className="flex items-center rounded-md bg-panel-3 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setTradeFilter("all")}
                className={`rounded px-1.5 py-0.5 transition-all ${
                  tradeFilter === "all" ? "bg-panel-1 text-ink font-medium shadow-xs" : "text-ink-3 hover:text-ink"
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setTradeFilter("buy")}
                className={`rounded px-1.5 py-0.5 transition-all ${
                  tradeFilter === "buy" ? "bg-up/20 text-up font-bold" : "text-ink-3 hover:text-ink"
                }`}
              >
                Mua CĐ [M]
              </button>
              <button
                type="button"
                onClick={() => setTradeFilter("sell")}
                className={`rounded px-1.5 py-0.5 transition-all ${
                  tradeFilter === "sell" ? "bg-down/20 text-down font-bold" : "text-ink-3 hover:text-ink"
                }`}
              >
                Bán CĐ [B]
              </button>
              <button
                type="button"
                onClick={() => setTradeFilter("whale")}
                className={`rounded px-1.5 py-0.5 transition-all ${
                  tradeFilter === "whale"
                    ? "bg-amber-500/25 text-amber-400 font-bold border border-amber-500/40"
                    : "text-ink-3 hover:text-ink"
                }`}
                title="Lọc các lệnh tổ chức ≥1 Tỷ VND hoặc ≥100.000 cp"
              >
                ⚡ Cá mập
              </button>
            </div>
          </div>
        }
        pad={false}
      >
        {/* Aggressor Volume Pressure Gauge */}
        <div className="border-b border-line bg-panel-2/60 px-3 py-2 text-xs">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-up font-medium">
              Mua chủ động: <span className="font-bold text-ink">{fmtVol(buyTradesVol)}</span> ({buyAggressorPct.toFixed(1)}%)
            </span>
            <span className="text-down font-medium">
              Bán chủ động: <span className="font-bold text-ink">{fmtVol(sellTradesVol)}</span> ({sellAggressorPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-panel-3">
            <div
              className="bg-up transition-all duration-300"
              style={{ width: `${buyAggressorPct}%` }}
              title={`Mua chủ động: ${buyAggressorPct.toFixed(1)}%`}
            />
            <div
              className="bg-down transition-all duration-300"
              style={{ width: `${sellAggressorPct}%` }}
              title={`Bán chủ động: ${sellAggressorPct.toFixed(1)}%`}
            />
          </div>
        </div>

        {/* Big Money Flow Whale Tracker Banner */}
        {tapeSummary.bigTradesCount > 0 && (
          <div className="grid grid-cols-4 gap-1.5 border-b border-line bg-amber-500/5 px-3 py-1.5 text-[11px] font-mono">
            <div>
              <span className="text-[10px] text-ink-3 block">Cá mập Mua</span>
              <span className="text-up font-bold">{formatVndShort(tapeSummary.bigBuyValVnd)}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink-3 block">Cá mập Bán</span>
              <span className="text-down font-bold">{formatVndShort(tapeSummary.bigSellValVnd)}</span>
            </div>
            <div>
              <span className="text-[10px] text-ink-3 block">Ròng Cá mập</span>
              <span className={`font-bold ${tapeSummary.netBigValVnd >= 0 ? "text-up" : "text-down"}`}>
                {tapeSummary.netBigValVnd >= 0 ? "+" : ""}
                {formatVndShort(tapeSummary.netBigValVnd)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-ink-3 block">Tỷ trọng</span>
              <span className="text-amber-400 font-bold">{tapeSummary.whaleDominancePct}%</span>
            </div>
          </div>
        )}

        {/* Match Tape Table Header */}
        <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-x-2 border-b border-line bg-panel-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
          <span>Thời gian</span>
          <span className="text-right">KL Khớp</span>
          <span className="text-right">Giá</span>
          <span className="text-right">Giá trị</span>
          <span className="text-center min-w-8">Loại</span>
        </div>

        {/* Match Tape Rows */}
        <div className={`overflow-y-auto divide-y divide-line/20 font-mono ${compact ? "max-h-56" : "max-h-80"}`}>
          {filteredTrades.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-ink-3 font-sans">
              {tradeFilter === "whale"
                ? `Chưa ghi nhận lệnh cá mập (≥1 Tỷ VND hoặc ≥100.000 cp) trong phiên.`
                : data.fromLastSession
                ? "Dữ liệu phiên trước — danh sách khớp lệnh sẽ trực tiếp cập nhật khi thị trường mở cửa."
                : "Đang chờ tín hiệu khớp lệnh từ sàn giao dịch..."}
            </div>
          ) : (
            filteredTrades.slice(0, compact ? 25 : 60).map((tr, i) => {
              const isBuy = tr.side === "buy";
              const isSell = tr.side === "sell";
              const analysis = analyzeTrade(tr);
              const isWhale = analysis.isBigOrder;

              const sideLabel = isBuy ? "M" : isSell ? "B" : "--";
              const sideBadgeClass = isBuy
                ? "bg-up/15 text-up font-bold border border-up/30"
                : isSell
                ? "bg-down/15 text-down font-bold border border-down/30"
                : "bg-panel-3 text-ink-3";

              const rowHighlight = isWhale
                ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500"
                : isBuy
                ? "hover:bg-up/5"
                : isSell
                ? "hover:bg-down/5"
                : "hover:bg-panel-2";

              return (
                <div
                  key={`${tr.time}-${tr.price}-${tr.volume}-${i}`}
                  className={`grid grid-cols-[auto_1fr_1fr_1fr_auto] items-center gap-x-2 px-3 py-1 text-xs transition-colors ${rowHighlight}`}
                >
                  {/* Match Time */}
                  <span className="text-[11px] text-ink-3">
                    {fmtTime(tr.time, tr.eventTime)}
                  </span>

                  {/* Volume */}
                  <span className="text-right text-ink font-medium">
                    {fmtVol(tr.volume)}
                  </span>

                  {/* Price */}
                  <span className={`text-right font-bold ${getPriceColor(tr.price)}`}>
                    {fmtPrice(tr.price)}
                  </span>

                  {/* Value / Whale Badge */}
                  <span className="text-right text-[11px] text-ink-2">
                    {analysis.formattedValue}
                    {isWhale && (
                      <span
                        className="ml-1 text-[9px] text-amber-400 font-sans font-bold px-1 rounded bg-amber-500/15 border border-amber-500/30"
                        title="Lệnh cá mập ≥1 tỷ hoặc ≥100k cp"
                      >
                        ⚡
                      </span>
                    )}
                  </span>

                  {/* Aggressor Side Badge */}
                  <span className="text-center min-w-8">
                    <span className={`inline-block px-1 py-0.2 rounded text-[10px] font-sans ${sideBadgeClass}`}>
                      {sideLabel}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Panel>
    </div>
  );
}
