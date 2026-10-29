"use client";

import React, { useEffect, useState } from "react";
import type { TradingViewIdea } from "@/lib/providers/tradingview-ideas";

interface Props {
  symbol: string;
}

export function TradingViewIdeasPanel({ symbol }: Props) {
  const [ideas, setIdeas] = useState<TradingViewIdea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unmounted = false;
    setLoading(true);

    fetch(`/api/v1/stocks/${encodeURIComponent(symbol)}/tradingview-ideas`)
      .then((r) => r.json())
      .then((res) => {
        if (!unmounted && res.ok && Array.isArray(res.data)) {
          setIdeas(res.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!unmounted) setLoading(false);
      });

    return () => {
      unmounted = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-background-secondary p-4 animate-pulse">
        <div className="h-4 w-44 bg-surface-elevated rounded mb-3" />
        <div className="space-y-3">
          <div className="h-20 bg-surface-elevated rounded-lg" />
          <div className="h-20 bg-surface-elevated rounded-lg" />
        </div>
      </div>
    );
  }

  if (ideas.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-background-secondary p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary">Góc nhìn Cộng đồng TradingView</span>
          <span className="text-[11px] text-text-tertiary">({ideas.length} ý tưởng)</span>
        </div>
        <a
          href={`https://www.tradingview.com/symbols/${symbol}/ideas/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          Xem thêm trên TradingView ↗
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ideas.map((idea) => {
          const isBull = idea.sentiment === "BULLISH";
          const isBear = idea.sentiment === "BEARISH";

          return (
            <div
              key={idea.id}
              className="flex flex-col justify-between p-3 rounded-lg border border-border-subtle bg-surface-elevated/40 hover:border-accent/40 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-text-primary line-clamp-1">
                    {idea.title}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      isBull
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                        : isBear
                          ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                          : "text-amber-400 bg-amber-500/10 border-amber-500/30"
                    }`}
                  >
                    {isBull ? "BULLISH ↗" : isBear ? "BEARISH ↘" : "NEUTRAL ⇄"}
                  </span>
                </div>

                <p className="text-xs text-text-secondary line-clamp-3 mb-2 leading-relaxed">
                  {idea.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border-subtle/60 text-[11px] text-text-tertiary">
                <span>Tác giả: <strong className="text-text-secondary">{idea.author}</strong></span>
                <span>{new Date(idea.timestamp).toLocaleDateString("vi-VN")}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

