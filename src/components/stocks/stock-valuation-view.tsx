"use client";

import { ValuationPanel } from "@/components/stocks/valuation-panel";
import { ForecastPanel } from "@/components/stocks/forecast-panel";

export function StockValuationView({ symbol }: { symbol: string }) {
  if (!symbol) return <div className="p-4 text-[12px] text-ink-3">Đang tải…</div>;
  return (
    <div className="stock-workspace space-y-3">
      <ValuationPanel symbol={symbol} showAnalyst />
      <ForecastPanel symbol={symbol} />
    </div>
  );
}
