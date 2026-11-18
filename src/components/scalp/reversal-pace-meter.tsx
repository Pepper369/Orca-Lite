"use client";

import React from "react";
import { Badge, Panel, fmtNum } from "@/components/ui";
import { Gauge, Zap, Timer, Lock, Sparkles, Activity, ShieldCheck, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { LateCandleResolutionResult } from "@/lib/engines/quant-reversal-pace";

interface ReversalPaceMeterProps {
  data: LateCandleResolutionResult;
  className?: string;
}

export function ReversalPaceMeter({ data, className = "" }: ReversalPaceMeterProps) {
  const { paceMetrics, tailMetrics, recommendedAction, actionDetails, timeRemainingSec, timeframe } = data;

  const isLocked = paceMetrics.isIrreversibleLock;
  const isTail = tailMetrics.isCheapTailDetected;
  const favoritePct = Math.round(paceMetrics.favoriteProbability * 100);
  const tailOddsPct = (tailMetrics.fairTailProbability * 100).toFixed(1);
  const impliedPct = (tailMetrics.impliedMarketOdds * 100).toFixed(1);

  return (
    <div className={`rounded-xl border border-border/60 bg-surface/80 backdrop-blur-md p-4 text-xs font-mono shadow-lg ${className}`}>
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent-primary/10 text-accent-primary">
            <Gauge className="size-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-foreground">Quant Reversal Pace</span>
              <Badge tone="accent" className="text-[10px] px-1.5 py-0">0x50f7 Engine</Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Late-Resolution Speed &amp; Tail Probability
            </span>
          </div>
        </div>

        {/* Countdown & Lock status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-surface-muted/60 border border-border/40 text-[11px]">
            <Timer className="size-3.5 text-accent-primary" />
            <span className="font-semibold">{timeRemainingSec}s</span>
            <span className="text-muted-foreground">/ {timeframe}</span>
          </div>
          {isLocked ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
              <Lock className="size-3" /> LOCKED {paceMetrics.lockDirection === "BULLISH_LOCKED" ? "BULL" : "BEAR"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px]">
              <Activity className="size-3" /> FLOATING
            </span>
          )}
        </div>
      </div>

      {/* Speed & Gap Gauge Bar */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground flex items-center gap-1">
            <Zap className="size-3 text-amber-400" /> Tốc độ cần để đảo chiều (Req Speed):
          </span>
          <span className="font-bold text-foreground">
            {paceMetrics.requiredSpeedPerMin.toFixed(2)} pips/phút ({paceMetrics.zScoreSpeed}σ)
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div className="relative h-2 w-full rounded-full bg-surface-muted overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isLocked ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-blue-500 to-amber-500"
            }`}
            style={{ width: `${Math.min(100, (paceMetrics.zScoreSpeed / 4.0) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0σ (Dễ đảo chiều)</span>
          <span>Ngưỡng an toàn 3.0σ</span>
          <span className={isLocked ? "text-emerald-400 font-bold" : ""}>
            {paceMetrics.zScoreSpeed >= 3.0 ? "Đã khóa bất khả đảo chiều" : "Chưa khóa"}
          </span>
        </div>
      </div>

      {/* Grid: 2 Columns (Favorite Lock vs Cheap Tail) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {/* Column 1: Favorite Momentum */}
        <div className="p-3 rounded-lg border border-border/40 bg-surface-muted/30">
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-emerald-400" /> Favorite Momentum
            </span>
            <span className="text-emerald-400 font-bold">{favoritePct}%</span>
          </div>
          <div className="text-[11px] space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Khoảng cách Gap:</span>
              <span className="text-foreground">{paceMetrics.gapPipsOrPct.toFixed(2)} pips</span>
            </div>
            <div className="flex justify-between">
              <span>Định giá Maker Fill:</span>
              <span className="text-foreground font-semibold">
                {data.peggingGuide?.favoriteLimitUsd ? `$${data.peggingGuide.favoriteLimitUsd}` : "99.2¢"}
              </span>
            </div>
          </div>
        </div>

        {/* Column 2: Cheap Tail Hunter */}
        <div className={`p-3 rounded-lg border ${isTail ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 bg-surface-muted/30"}`}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <Sparkles className="size-3.5 text-amber-400" /> Cheap Tail Hunter
            </span>
            {isTail ? (
              <Badge tone="warn" className="text-[9px]">LỆCH GIÁ ĐUÔI</Badge>
            ) : (
              <span className="text-muted-foreground">Fair {tailOddsPct}%</span>
            )}
          </div>
          <div className="text-[11px] space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Thực tế vs Thị trường:</span>
              <span className={isTail ? "text-amber-400 font-bold" : "text-foreground"}>
                {tailOddsPct}% vs {impliedPct}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Tỷ lệ R:R Asymmetric:</span>
              <span className="text-emerald-400 font-bold">1:{tailMetrics.asymmetricRewardRatio}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Recommendation Banner */}
      <div className={`p-3 rounded-lg border ${
        recommendedAction === "LATE_EXPANSION_RIDER"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : recommendedAction === "CHEAP_TAIL_REVERSAL"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
          : "border-border/40 bg-surface-muted/40 text-muted-foreground"
      }`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 font-bold text-xs">
            {actionDetails.direction === "BUY" ? (
              <ArrowUpRight className="size-4 text-emerald-400" />
            ) : actionDetails.direction === "SELL" ? (
              <ArrowDownRight className="size-4 text-rose-400" />
            ) : null}
            <span>KHUYẾN NGHỊ: {recommendedAction.replace(/_/g, " ")} ({actionDetails.direction})</span>
          </div>
          <span className="font-bold text-[11px]">
            Winrate: {actionDetails.expectedWinrate}% | Size: {actionDetails.suggestedRiskPct}%
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-foreground/80">
          {actionDetails.rationale}
        </p>
      </div>
    </div>
  );
}
