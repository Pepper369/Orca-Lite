"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { OrcaChart } from "@/components/orca-chart";
import { OrderBookPanel } from "@/components/stocks/order-book-panel";
import { StockFinancialsView } from "@/components/stocks/stock-financials-view";
import { StockValuationView } from "@/components/stocks/stock-valuation-view";
import { getDuckDB, ingestJSONTable, querySQL } from "@/lib/duckdb-engine";
import { useApi, prefetchApi } from "@/lib/hooks";
import { clientCacheWarm } from "@/lib/client-cache";
import { prefetchRouteApis } from "@/lib/nav-prefetch";
import { Chg, fmtCompact, fmtNum, Panel } from "@/components/ui";
import type { Quote } from "@/lib/types";
import {
  Activity,
  BarChart2,
  Cpu,
  Layers,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

const TERMINAL_WATCHLIST = [
  "HPG", "SSI", "VNM", "FPT", "MWG", 
  "TCB", "MBB", "VHM", "VIC", "DGC",
  "STB", "VPB", "CTG", "KDH", "VND"
];

type BottomTab = "orderbook" | "financials" | "valuation" | "duckdb";

export default function ProTerminalPage() {
  const [symbol, setSymbol] = useState("HPG");
  const [bottomTab, setBottomTab] = useState<BottomTab>("orderbook");
  const [fullscreen, setFullscreen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [duckDbStatus, setDuckDbStatus] = useState<"ready" | "loading" | "fallback">("loading");
  const [customSql, setCustomSql] = useState("SELECT symbol, price, changePercent, volume FROM quotes WHERE price > 0 ORDER BY volume DESC LIMIT 10;");
  const [sqlResults, setSqlResults] = useState<Record<string, unknown>[]>([]);

  // Realtime quotes for watchlist & DuckDB ingestion
  const { data: stockData } = useApi<{ quotes: Quote[] }>(
    "/api/v1/stocks?board=vn30",
    { refreshInterval: 6_000, keepPreviousData: true }
  );

  const quotes = stockData?.quotes ?? [];

  // Ingest quotes into DuckDB-WASM for in-memory client queries
  useEffect(() => {
    if (!quotes.length) return;
    let cancelled = false;

    async function initDuck() {
      const db = await getDuckDB();
      if (!db || cancelled) {
        setDuckDbStatus("fallback");
        return;
      }
      setDuckDbStatus("ready");
      const cleanQuotes = quotes.map((q) => ({
        symbol: q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
        ceilingPrice: q.ceilingPrice,
        floorPrice: q.floorPrice,
      }));
      await ingestJSONTable("quotes", cleanQuotes);
      
      const topRows = await querySQL<Record<string, unknown>>(
        "SELECT symbol, price, changePercent, volume FROM quotes WHERE price > 0 ORDER BY volume DESC LIMIT 5;"
      );
      if (!cancelled && topRows.length > 0) {
        setSqlResults(topRows);
      }
    }

    initDuck();
    return () => {
      cancelled = true;
    };
  }, [quotes]);

  const activeQuote = useMemo(() => {
    return quotes.find((q) => q.symbol === symbol);
  }, [quotes, symbol]);

  const filteredWatchlist = useMemo(() => {
    if (!searchQ.trim()) return TERMINAL_WATCHLIST;
    const q = searchQ.trim().toUpperCase();
    return TERMINAL_WATCHLIST.filter((s) => s.includes(q));
  }, [searchQ]);

  const handleSelectSymbol = (s: string) => {
    setSymbol(s);
    prefetchRouteApis(`/stocks/${s}`);
    clientCacheWarm(`/api/v1/stocks/${s}`);
  };

  const handleRunSQL = async () => {
    if (!customSql.trim()) return;
    const res = await querySQL(customSql);
    setSqlResults(res);
  };

  return (
    <div className={`flex flex-col h-full bg-background-primary text-text-primary ${fullscreen ? "fixed inset-0 z-50 p-2" : "p-2"}`}>
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-subtle bg-surface-base/80 rounded-t-xl shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-1.5 font-bold tracking-tight text-[15px]">
            <Zap className="size-4 text-accent-primary animate-pulse" />
            ORCA PRO TERMINAL
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary font-mono border border-accent-primary/30">
              0ms SPA
            </span>
          </h1>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-text-muted">
            <Cpu className="size-3.5 text-accent-primary" />
            <span>DuckDB-Wasm:</span>
            <span className={`font-mono font-semibold ${duckDbStatus === "ready" ? "text-positive" : "text-amber-400"}`}>
              {duckDbStatus === "ready" ? "ACTIVE (In-Memory CPU)" : "LOADING…"}
            </span>
          </div>
        </div>

        {/* Quick Tickers */}
        <div className="hidden md:flex items-center gap-1 overflow-x-auto text-[11px] font-mono">
          {TERMINAL_WATCHLIST.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelectSymbol(s)}
              onMouseEnter={() => {
                prefetchApi(`/api/v1/stocks/${s}`);
              }}
              className={`px-2 py-0.5 rounded transition-all ${
                s === symbol
                  ? "bg-accent-primary text-white font-bold shadow-xs"
                  : "bg-surface-elevated/60 text-text-muted hover:text-text-primary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/stocks/${symbol}`}
            className="text-[11px] text-text-muted hover:text-accent-primary flex items-center gap-1 border border-border-subtle rounded px-2 py-1 bg-surface-elevated/40"
          >
            Mở chi tiết mã ↗
          </Link>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated border border-border-subtle"
            title={fullscreen ? "Thu nhỏ" : "Toàn màn hình"}
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Terminal Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2 mt-2">
        {/* Left Panel: Watchlist & In-Memory Screener (2.5 Cols) */}
        <div className="hidden lg:flex lg:col-span-3 flex-col rounded-xl border border-border-subtle bg-surface-base overflow-hidden">
          <div className="p-2.5 border-b border-border-subtle bg-surface-elevated/40 flex items-center gap-2">
            <Search className="size-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Lọc mã VN30…"
              className="w-full bg-transparent text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none font-mono"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/50 text-[12px]">
            {filteredWatchlist.map((s) => {
              const q = quotes.find((item) => item.symbol === s);
              const isSelected = s === symbol;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSelectSymbol(s)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-accent-primary/15 border-l-2 border-accent-primary"
                      : "hover:bg-surface-elevated/40"
                  }`}
                >
                  <div>
                    <div className="font-bold font-mono text-[13px] text-text-primary">{s}</div>
                    <div className="text-[10px] text-text-muted font-mono">{fmtCompact(q?.volume ?? 0)} cp</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-medium text-text-primary">{q?.price ? fmtNum(q.price, 2) : "—"}</div>
                    <Chg value={q?.changePercent} className="text-[11px]" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Panel: Chart & Workspace (6.5 Cols) */}
        <div className="lg:col-span-6 flex flex-col rounded-xl border border-border-subtle bg-surface-base overflow-hidden min-h-0">
          {/* Active Symbol Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-surface-elevated/30">
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg font-mono text-accent-primary">{symbol}</span>
              {activeQuote?.price && (
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold font-mono">{fmtNum(activeQuote.price, 2)}</span>
                  <Chg value={activeQuote.changePercent} className="text-[12px]" />
                </div>
              )}
            </div>

            {/* Bottom Panel Mode Switcher */}
            <div className="flex items-center gap-1 bg-surface-elevated/80 p-0.5 rounded-lg border border-border-subtle text-[11px]">
              <button
                type="button"
                onClick={() => setBottomTab("orderbook")}
                className={`px-2 py-0.5 rounded font-medium ${bottomTab === "orderbook" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"}`}
              >
                Sổ lệnh
              </button>
              <button
                type="button"
                onClick={() => setBottomTab("financials")}
                className={`px-2 py-0.5 rounded font-medium ${bottomTab === "financials" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"}`}
              >
                BCTC
              </button>
              <button
                type="button"
                onClick={() => setBottomTab("valuation")}
                className={`px-2 py-0.5 rounded font-medium ${bottomTab === "valuation" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"}`}
              >
                Định giá
              </button>
              <button
                type="button"
                onClick={() => setBottomTab("duckdb")}
                className={`px-2 py-0.5 rounded font-medium flex items-center gap-1 ${bottomTab === "duckdb" ? "bg-accent-primary text-white" : "text-text-muted hover:text-text-primary"}`}
              >
                <Cpu className="size-3" /> SQL
              </button>
            </div>
          </div>

          {/* Interactive Chart */}
          <div className="flex-1 min-h-[320px] p-2 bg-background-secondary/60">
            <OrcaChart symbol={symbol} assetType="stock" height={360} />
          </div>

          {/* Bottom Module Area (Keep-Alive Multi-Mode) */}
          <div className="h-64 border-t border-border-subtle bg-surface-base overflow-y-auto p-2">
            {bottomTab === "orderbook" && (
              <div className="h-full">
                <OrderBookPanel symbol={symbol} />
              </div>
            )}
            {bottomTab === "financials" && (
              <div className="h-full">
                <StockFinancialsView symbol={symbol} />
              </div>
            )}
            {bottomTab === "valuation" && (
              <div className="h-full">
                <StockValuationView symbol={symbol} />
              </div>
            )}
            {bottomTab === "duckdb" && (
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between text-text-muted">
                  <span className="flex items-center gap-1 font-semibold text-text-primary">
                    <Cpu className="size-3.5 text-accent-primary" />
                    DuckDB-Wasm In-Memory Console
                  </span>
                  <span className="font-mono text-[10px]">Table: quotes</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSql}
                    onChange={(e) => setCustomSql(e.target.value)}
                    className="flex-1 bg-surface-elevated border border-border-subtle rounded px-2.5 py-1 text-[11px] font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleRunSQL}
                    className="px-3 py-1 rounded bg-accent-primary text-white font-medium hover:bg-accent-primary/80 transition-all text-xs"
                  >
                    Chạy SQL
                  </button>
                </div>
                {sqlResults.length > 0 ? (
                  <div className="overflow-x-auto max-h-40 border border-border-subtle rounded">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-surface-elevated border-b border-border-subtle text-text-muted">
                        <tr>
                          {Object.keys(sqlResults[0]).map((k) => (
                            <th key={k} className="px-2 py-1 text-left">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {sqlResults.map((r, i) => (
                          <tr key={i} className="hover:bg-surface-elevated/40">
                            {Object.values(r).map((v, j) => (
                              <td key={j} className="px-2 py-1">{typeof v === "number" ? fmtNum(v, 2) : String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-text-muted text-[11px]">Chưa có kết quả hoặc truy vấn không trả về dòng nào.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Order Book & Trades (3 Cols) */}
        <div className="lg:col-span-3 flex flex-col rounded-xl border border-border-subtle bg-surface-base overflow-hidden">
          <div className="p-2.5 border-b border-border-subtle bg-surface-elevated/40 flex items-center justify-between">
            <span className="font-semibold text-[13px] flex items-center gap-1.5">
              <Activity className="size-3.5 text-accent-primary" />
              Sổ lệnh & Cá Mập
            </span>
            <span className="font-mono text-[11px] text-accent-primary font-bold">{symbol}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            <OrderBookPanel symbol={symbol} />
          </div>
        </div>
      </div>
    </div>
  );
}
