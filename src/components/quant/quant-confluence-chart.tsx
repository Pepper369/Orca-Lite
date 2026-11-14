"use client";

import React from "react";

interface ConfluenceItem {
  symbol: string;
  price: number;
  ret10: string;
  ret50: string;
  ret100: string;
  ret200: string;
  confluenceScore: number;
}

export function QuantConfluenceChart({ items }: { items: ConfluenceItem[] }) {
  return (
    <div className="p-4 bg-background-secondary rounded-xl border border-border-subtle">
      <h3 className="text-lg font-bold text-text-primary mb-2">Biểu đồ Hợp lưu Định lượng (10-200 ngày)</h3>
      <div className="space-y-3">
        {items.map((item) => {
          const isPositive = item.confluenceScore >= 0;
          const width = Math.min(Math.abs(item.confluenceScore) * 3, 100);

          return (
            <div key={item.symbol} className="flex items-center gap-4 text-sm">
              <span className="w-12 font-bold">{item.symbol}</span>
              <div className="flex-1 bg-surface-elevated h-4 rounded-full overflow-hidden flex">
                {isPositive ? (
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${width}%` }}
                  />
                ) : (
                  <div
                    className="bg-rose-500 h-full rounded-full transition-all duration-300 ml-auto"
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>
              <span className="w-16 text-right font-medium">
                {item.confluenceScore > 0 ? `+${item.confluenceScore}` : item.confluenceScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}