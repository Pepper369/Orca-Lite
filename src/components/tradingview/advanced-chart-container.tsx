"use client";

import React, { useEffect, useRef, useState } from "react";
import { TradingViewDatafeed } from "@/chart/tradingview-datafeed";
import { OrcaChart } from "@/components/orca-chart";

interface Props {
  symbol?: string;
  assetType?: "stock" | "crypto" | "forex" | "commodity";
  timeframe?: string;
  height?: number;
}

export function TradingViewAdvancedChartContainer({
  symbol = "SSI",
  assetType = "stock",
  timeframe = "1d",
  height = 540,
}: Props) {
  const [currentTimeframe, setCurrentTimeframe] = useState(timeframe);
  const [mode, setMode] = useState<"lightweight" | "embed">("lightweight");
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSymbol = symbol;

  return (
    <div className="flex flex-col rounded-xl border border-border-subtle bg-background-secondary overflow-hidden shadow-sm">
      {/* TradingView Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-base px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-text-primary tracking-wide">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-base font-bold text-accent">{currentSymbol}</span>
            <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-surface-elevated text-text-secondary border border-border-subtle">
              {assetType}
            </span>
          </div>

          {/* Timeframe quick switches */}
          <div className="hidden sm:flex items-center gap-1 bg-surface-elevated rounded-lg p-0.5 border border-border-subtle">
            {["1m", "5m", "15m", "1h", "1d", "1w"].map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setCurrentTimeframe(tf)}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                  currentTimeframe === tf
                    ? "bg-accent text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-base"
                }`}
              >
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Right Controls: Mode Selector & Datafeed Tag */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>TV Datafeed: UDF Ready</span>
          </div>

          <div className="flex items-center rounded-lg bg-surface-elevated p-0.5 border border-border-subtle text-xs">
            <button
              type="button"
              onClick={() => setMode("lightweight")}
              className={`px-2.5 py-1 rounded transition-colors ${
                mode === "lightweight"
                  ? "bg-accent text-white font-medium shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Native v5
            </button>
            <button
              type="button"
              onClick={() => setMode("embed")}
              className={`px-2.5 py-1 rounded transition-colors ${
                mode === "embed"
                  ? "bg-accent text-white font-medium shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              TV Embed
            </button>
          </div>
        </div>
      </div>

      {/* Main Chart Canvas Area */}
      <div className="relative w-full" style={{ height }}>
        {mode === "lightweight" ? (
          <OrcaChart
            symbol={currentSymbol}
            assetType={assetType}
            defaultTimeframe={currentTimeframe}
            height={height}
          />
        ) : (
          <div ref={containerRef} className="h-full w-full flex items-center justify-center bg-black/40">
            <iframe
              src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${currentSymbol}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Asia%2FHo_Chi_Minh&withdateranges=1&showpopupbutton=1`}
              className="h-full w-full border-0"
              title={`TradingView Advanced Chart for ${currentSymbol}`}
              allowTransparency
            />
          </div>
        )}
      </div>

      {/* Footer info bar */}
      <div className="flex items-center justify-between border-t border-border-subtle bg-surface-base px-4 py-1.5 text-[11px] text-text-tertiary">
        <span>UDF Endpoint: <code className="text-text-secondary">/api/v1/chart/tradingview</code></span>
        <span>Múi giờ: Asia/Ho_Chi_Minh (UTC+7)</span>
      </div>
    </div>
  );
}

