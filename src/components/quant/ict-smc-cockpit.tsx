"use client";

import React, { useMemo } from "react";
import type { OhlcvBar } from "@/lib/types";
import { Badge, fmtNum } from "@/components/ui";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Crosshair,
  Layers,
  Magnet,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Waves,
  XCircle,
  Zap,
} from "lucide-react";
import {
  analyzeIctSmcLiquidity,
  type IctSmcAnalysisResult,
} from "@/lib/engines/ict-smc-liquidity-engine";

interface IctSmcCockpitProps {
  symbol: string;
  series: OhlcvBar[];
  currentPrice?: number | null;
  assetType?: "forex" | "crypto" | "stock";
  digits?: number;
}

export function IctSmcCockpit({
  symbol,
  series,
  currentPrice,
  assetType = "forex",
  digits = assetType === "forex" ? 5 : 2,
}: IctSmcCockpitProps) {
  const analysis: IctSmcAnalysisResult = useMemo(() => {
    return analyzeIctSmcLiquidity({
      symbol,
      bars: series,
      currentPrice,
      assetType: assetType === "crypto" ? "CRYPTO" : assetType === "stock" ? "STOCK" : "FOREX",
    });
  }, [symbol, series, currentPrice, assetType]);

  const {
    bias,
    overallScore,
    liquidityMap,
    recentSweeps,
    activeFvgList,
    orderBlocks,
    optimalTradeSetup,
    marketStructure,
    summaryVi,
  } = analysis;

  const lastSweep = recentSweeps[recentSweeps.length - 1];
  const { dealingRange, executionChecklist } = optimalTradeSetup;

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Top Banner: Liquidity Cycle & Score */}
      <div className="rounded-xl border border-border/60 bg-surface/90 p-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent-primary/10 text-accent-primary">
              <Waves className="size-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">ICT &amp; SMC Liquidity Suite</span>
                <Badge
                  tone={
                    bias.includes("BULLISH")
                      ? "bull"
                      : bias.includes("BEARISH")
                      ? "down"
                      : "neutral"
                  }
                  className="text-[10px]"
                >
                  {bias.replace(/_/g, " ")}
                </Badge>
                <Badge tone="accent" className="text-[10px]">
                  Score: {overallScore}%
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Dòng tiền thể chế · Quét thanh khoản (Sweep) · Vùng vàng OTE 0.705 · FVG &amp; Breaker
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-muted/60 border border-border/40 text-[11px]">
            <span className="text-muted-foreground">Chu trình dòng tiền:</span>
            <span className="font-bold text-accent-primary">
              {marketStructure.flowCycle === "IRL_TO_ERL"
                ? "Internal ➔ External (IRL ➔ ERL)"
                : marketStructure.flowCycle === "ERL_TO_IRL"
                ? "External ➔ Internal (ERL ➔ IRL)"
                : "Cân bằng (Equilibrium)"}
            </span>
          </div>
        </div>

        {/* 2-Column Grid: Liquidity Pools vs Sweeps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* Box 1: Liquidity Pools (BSL vs SSL) */}
          <div className="p-3 rounded-lg border border-border/40 bg-surface-muted/20">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Magnet className="size-3.5 text-accent-primary" /> Bản đồ Thanh khoản (Liquidity Pools)
              </span>
              <span className="text-muted-foreground text-[10px]">
                {dealingRange.currentZone} Zone
              </span>
            </div>

            <div className="space-y-2 text-[11px]">
              {/* Buy Side Liquidity */}
              <div className="p-2 rounded bg-surface-elevated/40 border border-border/30 flex items-center justify-between">
                <div>
                  <span className="font-bold text-positive flex items-center gap-1">
                    <ArrowUpRight className="size-3" /> Buy-Side (BSL / EQH)
                  </span>
                  <span className="text-[10px] text-muted-foreground">Thanh khoản chờ quét phía trên</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-foreground">
                    {liquidityMap.nearestBsl ? fmtNum(liquidityMap.nearestBsl.price, digits) : "—"}
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {liquidityMap.nearestBsl?.type ?? "BSL"} ({liquidityMap.nearestBsl?.status ?? "Untouched"})
                  </span>
                </div>
              </div>

              {/* Sell Side Liquidity */}
              <div className="p-2 rounded bg-surface-elevated/40 border border-border/30 flex items-center justify-between">
                <div>
                  <span className="font-bold text-negative flex items-center gap-1">
                    <ArrowDownRight className="size-3" /> Sell-Side (SSL / EQL)
                  </span>
                  <span className="text-[10px] text-muted-foreground">Thanh khoản chờ quét phía dưới</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-foreground">
                    {liquidityMap.nearestSsl ? fmtNum(liquidityMap.nearestSsl.price, digits) : "—"}
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {liquidityMap.nearestSsl?.type ?? "SSL"} ({liquidityMap.nearestSsl?.status ?? "Untouched"})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Box 2: Liquidity Sweeps Detection */}
          <div className="p-3 rounded-lg border border-border/40 bg-surface-muted/20">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Crosshair className="size-3.5 text-amber-400" /> Quét thanh khoản (Liquidity Sweeps)
              </span>
              {lastSweep ? (
                <Badge tone="warn" className="text-[9px]">{lastSweep.sweepType}</Badge>
              ) : (
                <span className="text-[10px] text-muted-foreground">Chưa có sweep</span>
              )}
            </div>

            {lastSweep ? (
              <div className="space-y-1.5 text-[11px]">
                <div className="p-2 rounded bg-surface-elevated/40 border border-amber-500/30">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-amber-300">
                      {lastSweep.side === "BUY_SIDE_SWEPT" ? "Quét sạch BSL (Đỉnh)" : "Quét sạch SSL (Đáy)"}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      Độ sâu: {lastSweep.sweepDepthPipsOrPct} pips
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>Mức bị quét: <b className="text-foreground">{fmtNum(lastSweep.sweptLevel, digits)}</b></span>
                    <span>Râu từ chối: <b className="text-foreground">{Math.round(lastSweep.displacementRatio * 100)}%</b></span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                    <CheckCircle2 className="size-3" />
                    {lastSweep.mssConfirmed ? "Xác nhận bẻ gãy cấu trúc vi mô (MSS)" : "Đang hình thành nến phản ứng"}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-[11px] py-3 text-center">
                Chưa phát hiện hành vi quét thanh khoản rõ ràng trong 15 phiên nến gần nhất.
              </p>
            )}
          </div>
        </div>

        {/* Optimal Trade Entry (OTE) Execution Card */}
        <div className={`p-3 rounded-xl border ${
          optimalTradeSetup.direction === "BUY"
            ? "border-emerald-500/40 bg-emerald-500/10"
            : optimalTradeSetup.direction === "SELL"
            ? "border-rose-500/40 bg-rose-500/10"
            : "border-border/40 bg-surface-muted/30"
        } mb-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Target className="size-4 text-accent-primary" />
              <span className="font-bold text-foreground text-xs">
                THIẾT LẬP VÀO LỆNH TỐI ƯU (OTE SETUP: {optimalTradeSetup.setupName.replace(/_/g, " ")})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  optimalTradeSetup.direction === "BUY"
                    ? "bull"
                    : optimalTradeSetup.direction === "SELL"
                    ? "down"
                    : "neutral"
                }
                className="text-[10px] font-bold"
              >
                {optimalTradeSetup.direction}
              </Badge>
              <span className="font-bold text-accent-primary text-xs">
                R:R 1:{optimalTradeSetup.riskRewardRatio}
              </span>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
            <div className="p-2 rounded bg-surface/80 border border-border/40">
              <span className="text-[9px] text-muted-foreground uppercase">Vùng vào OTE (0.618 - 0.786)</span>
              <div className="font-bold text-foreground mt-0.5">
                {fmtNum(optimalTradeSetup.entryZone[0], digits)} – {fmtNum(optimalTradeSetup.entryZone[1], digits)}
              </div>
              <span className="text-[9px] text-emerald-400 font-bold">
                Điểm vàng 0.705: {fmtNum(optimalTradeSetup.entryOptimal, digits)}
              </span>
            </div>

            <div className="p-2 rounded bg-surface/80 border border-border/40">
              <span className="text-[9px] text-muted-foreground uppercase">Cắt lỗ (Stop Loss)</span>
              <div className="font-bold text-negative mt-0.5">
                {fmtNum(optimalTradeSetup.stopLoss, digits)}
              </div>
              <span className="text-[9px] text-muted-foreground">Bảo vệ dưới râu quét</span>
            </div>

            <div className="p-2 rounded bg-surface/80 border border-border/40">
              <span className="text-[9px] text-muted-foreground uppercase">Chốt lời 1 (Internal TP1)</span>
              <div className="font-bold text-positive mt-0.5">
                {fmtNum(optimalTradeSetup.targetTP1, digits)}
              </div>
              <span className="text-[9px] text-muted-foreground">Equilibrium 50% Range</span>
            </div>

            <div className="p-2 rounded bg-surface/80 border border-border/40">
              <span className="text-[9px] text-muted-foreground uppercase">Chốt lời 2 (External TP2)</span>
              <div className="font-bold text-positive mt-0.5">
                {fmtNum(optimalTradeSetup.targetTP2, digits)}
              </div>
              <span className="text-[9px] text-muted-foreground">Mục tiêu quét BSL/SSL</span>
            </div>
          </div>

          {/* Checklist */}
          <div className="p-2.5 rounded-lg bg-surface/60 border border-border/30">
            <span className="font-bold text-foreground text-[10px] uppercase tracking-wider block mb-1.5">
              Checklist xác nhận vào lệnh thể chế:
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[10px]">
              {executionChecklist.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  {item.passed ? (
                    <CheckCircle2 className="size-3.5 text-positive shrink-0" />
                  ) : (
                    <XCircle className="size-3.5 text-muted-foreground/60 shrink-0" />
                  )}
                  <span className={item.passed ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {item.rule}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Narrative Summary */}
        <p className="text-[11px] leading-relaxed text-muted-foreground bg-surface-muted/30 p-2.5 rounded-lg border border-border/40">
          <span className="font-bold text-foreground">Tổng kết chiến thuật: </span>
          {summaryVi}
        </p>
      </div>
    </div>
  );
}
