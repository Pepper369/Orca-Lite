"use client";

import React, { useMemo, useState } from "react";
import type { OhlcvBar, TechnicalSnapshot } from "@/lib/types";
import { Badge, fmtNum, Panel } from "@/components/ui";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Compass,
  Cpu,
  Gauge,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  XCircle,
  Zap,
} from "lucide-react";
import { evaluateHighWinrateGate } from "@/lib/engines/high-winrate-gate";
import { evaluateLateCandleResolution } from "@/lib/engines/quant-reversal-pace";
import { analyzeIctSmcLiquidity } from "@/lib/engines/ict-smc-liquidity-engine";
import {
  buildMtfConfluenceMatrix,
  estimateClvOrderFlowImbalance,
  getAssetPipSize,
} from "@/lib/engines/asset-precision";
import { estimateOrnsteinUhlenbeck } from "@/lib/engines/advanced-quant-math";
import { detectDivergences } from "@/lib/engines/divergence";
import { ReversalPaceMeter } from "@/components/scalp/reversal-pace-meter";

interface QuantTerminalPanelProps {
  symbol: string;
  interval: string;
  series: OhlcvBar[];
  currentPrice?: number | null;
  assetType?: "forex" | "crypto" | "stock";
  tech?: TechnicalSnapshot | null;
  digits?: number;
}

export function QuantTerminalPanel({
  symbol,
  interval,
  series,
  currentPrice,
  assetType = "forex",
  tech,
  digits = assetType === "forex" ? 5 : 2,
}: QuantTerminalPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "gates" | "pace" | "ou_divergence">("overview");

  // Determine current effective price and pip size
  const lastBar = series[series.length - 1];
  const price = currentPrice ?? lastBar?.close ?? 1.0;
  const isForex = assetType === "forex";
  const precisionAssetType = isForex ? "FOREX" : assetType === "stock" ? "STOCK" : "CRYPTO";
  const pipSize = getAssetPipSize(symbol, precisionAssetType, price);

  // Run Quantitative Engines
  const quantAnalysis = useMemo(() => {
    if (!series || series.length < 20) return null;

    const closes = series.map((b) => b.close);

    // 1. Ornstein-Uhlenbeck (OU) Mean Reversion
    const ouResult = estimateOrnsteinUhlenbeck(closes);

    // 2. Causal Resampled Multi-Timeframe Matrix
    const { rows: mtfRows, dominantTrend, confluencePct: mtfConfluencePct } = buildMtfConfluenceMatrix(series);

    // 3. Real CLV Order Flow Imbalance (replaces static placeholder) & ICT Direction
    const realImbalance = estimateClvOrderFlowImbalance(series, 12);
    const ictResult = analyzeIctSmcLiquidity({
      symbol,
      bars: series,
      currentPrice: price,
      assetType: precisionAssetType,
      pipSize,
    });

    const ictDir = ictResult.optimalTradeSetup.direction;
    const candidateDir: "BUY" | "SELL" =
      ictDir !== "NEUTRAL" &&
      (dominantTrend === "RANGING" ||
        (ictDir === "BUY" && dominantTrend === "BULLISH") ||
        (ictDir === "SELL" && dominantTrend === "BEARISH"))
        ? ictDir
        : dominantTrend === "BULLISH"
          ? "BUY"
          : dominantTrend === "BEARISH"
            ? "SELL"
            : ictDir === "SELL"
              ? "SELL"
              : lastBar.close >= lastBar.open
                ? "BUY"
                : "SELL";

    const slDistance = isForex ? pipSize * 15 : price * 0.005;
    const stopLossPrice = candidateDir === "BUY" ? price - slDistance : price + slDistance;

    const highWinrate = evaluateHighWinrateGate({
      symbol,
      series,
      candidateDirection: candidateDir,
      entryPrice: price,
      stopLossPrice,
      orderBookImbalance: realImbalance,
      assetType: isForex ? "FOREX" : "CRYPTO",
    });

    // 4. Quant Reversal Pace (0x50f7 Model)
    const tfParam = interval === "1m" ? "1m" : interval === "15m" ? "15m" : "5m";
    const paceResolution = evaluateLateCandleResolution({
      symbol,
      timeframe: tfParam,
      bars: series,
      orderFlowImbalance: realImbalance,
      assetType: isForex ? "FOREX" : "CRYPTO",
      pipSize,
    });

    // 5. Advanced Divergence Engine
    const divergences = detectDivergences(series, {
      lookback: 60,
      maxSignals: 4,
    });

    return {
      ouResult,
      highWinrate,
      paceResolution,
      divergences,
      mtfRows,
      dominantTrend,
      mtfConfluencePct,
    };
  }, [series, price, pipSize, isForex, precisionAssetType, symbol, interval, lastBar]);

  if (!quantAnalysis) {
    return (
      <div className="p-4 rounded-xl border border-border/40 bg-surface-primary text-xs font-mono text-muted-foreground">
        Đang tải và tính toán mô hình định lượng cho {symbol}...
      </div>
    );
  }

  const { ouResult, highWinrate, paceResolution, divergences, mtfRows, dominantTrend, mtfConfluencePct } =
    quantAnalysis;

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Top Quantitative Command Header */}
      <div className="rounded-xl border border-border/60 bg-surface/90 p-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent-primary/10 text-accent-primary">
              <Cpu className="size-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">Quantitative Trading Lab</span>
                <Badge tone={highWinrate.isHighWinrateVerified ? "bull" : "warn"} className="text-[10px]">
                  {highWinrate.isHighWinrateVerified ? "SIÊU TÍN HIỆU WINRATE CAO" : "TÍN HIỆU TIÊU CHUẨN"}
                </Badge>
                <Badge tone="accent" className="text-[10px]">
                  Score: {highWinrate.winrateScore}%
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">
                Đa khung thời gian · 6 Cổng Confluence · Mô hình Late Resolution 0x50f7 · Ornstein-Uhlenbeck
              </span>
            </div>
          </div>

          {/* Sub-tab Switcher */}
          <div className="flex gap-1 bg-surface-muted/60 p-0.5 rounded-lg border border-border/40 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveSubTab("overview")}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeSubTab === "overview"
                  ? "bg-accent-primary/20 text-accent-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tổng quan MTF
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("gates")}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeSubTab === "gates"
                  ? "bg-accent-primary/20 text-accent-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              6 Cổng Winrate
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("pace")}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeSubTab === "pace"
                  ? "bg-accent-primary/20 text-accent-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pace &amp; Tail (0x50f7)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("ou_divergence")}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeSubTab === "ou_divergence"
                  ? "bg-accent-primary/20 text-accent-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              OU &amp; Phân kỳ
            </button>
          </div>
        </div>

        {/* Dynamic Sub-Tab Views */}
        {activeSubTab === "overview" && (
          <div className="space-y-3">
            {/* MTF Matrix Table */}
            <div>
              <div className="flex justify-between items-center mb-1.5 text-[11px]">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Layers className="size-3.5 text-accent-primary" /> Ma trận hội tụ đa khung thời gian (MTF Confluence)
                </span>
                <span className="text-muted-foreground">
                  Đồng thuận xu hướng:{" "}
                  <b
                    className={
                      dominantTrend === "BULLISH"
                        ? "text-positive"
                        : dominantTrend === "BEARISH"
                        ? "text-negative"
                        : "text-foreground"
                    }
                  >
                    {dominantTrend} ({mtfConfluencePct}%)
                  </b>
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border/40 bg-surface-muted/20">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-border/40 text-muted-foreground text-[10px] bg-surface-muted/40">
                      <th className="py-1.5 px-2">Khung TF</th>
                      <th className="py-1.5 px-2">Xu hướng EMA</th>
                      <th className="py-1.5 px-2">RSI(14)</th>
                      <th className="py-1.5 px-2">MACD Mom</th>
                      <th className="py-1.5 px-2">Vùng cấu trúc</th>
                      <th className="py-1.5 px-2 text-right">Độ tin cậy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {mtfRows.map((row) => (
                      <tr key={row.tf} className="hover:bg-surface-elevated/40">
                        <td className="py-1.5 px-2 font-bold text-foreground">{row.tf}</td>
                        <td className="py-1.5 px-2">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              row.trend === "BULLISH"
                                ? "text-positive"
                                : row.trend === "BEARISH"
                                ? "text-negative"
                                : "text-muted-foreground"
                            }`}
                          >
                            {row.trend === "BULLISH" ? (
                              <ArrowUpRight className="size-3" />
                            ) : row.trend === "BEARISH" ? (
                              <ArrowDownRight className="size-3" />
                            ) : null}
                            {row.trend}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={
                              row.rsiVal >= 70
                                ? "text-negative font-bold"
                                : row.rsiVal <= 30
                                ? "text-positive font-bold"
                                : "text-foreground"
                            }
                          >
                            {row.rsiVal.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          <span
                            className={
                              row.macdState === "EXPANDING"
                                ? "text-positive font-medium"
                                : row.macdState === "CONTRACTING"
                                ? "text-negative font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {row.macdState}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">{row.structure}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-foreground">
                          {row.confluencePct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 rounded-lg border border-border/40 bg-surface-muted/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cân bằng OU (Mu)</span>
                <div className="mt-0.5 font-bold text-foreground">{fmtNum(ouResult.mu, digits)}</div>
                <span className="text-[9px] text-muted-foreground">Z-Score: {ouResult.currentZScore.toFixed(2)}σ</span>
              </div>
              <div className="p-2.5 rounded-lg border border-border/40 bg-surface-muted/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Required Speed</span>
                <div className="mt-0.5 font-bold text-foreground">
                  {paceResolution.paceMetrics.requiredSpeedPerMin.toFixed(2)} pips/m
                </div>
                <span className="text-[9px] text-muted-foreground">Z: {paceResolution.paceMetrics.zScoreSpeed}σ</span>
              </div>
              <div className="p-2.5 rounded-lg border border-border/40 bg-surface-muted/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Favorite Prob</span>
                <div className="mt-0.5 font-bold text-positive">
                  {(paceResolution.paceMetrics.favoriteProbability * 100).toFixed(1)}%
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {paceResolution.paceMetrics.isIrreversibleLock ? "Đã khóa không đảo chiều" : "Đang giao động"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-border/40 bg-surface-muted/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Phân kỳ hoạt động</span>
                <div className="mt-0.5 font-bold text-foreground">
                  {divergences.length > 0 ? `${divergences.length} tín hiệu` : "Không có"}
                </div>
                <span className="text-[9px] text-muted-foreground">
                  {divergences[0] ? `${divergences[0].kind} (${divergences[0].oscillator})` : "Ổn định"}
                </span>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "gates" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-positive" /> Thẩm định 6 Cổng Confluence Thể chế (Institutional Gate)
              </span>
              <span className="text-muted-foreground font-bold">
                Xác thực: {highWinrate.passedGates.length} / 6 Cổng
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              {highWinrate.passedGates.map((gate, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-positive/30 bg-positive/5 flex items-start gap-2"
                >
                  <CheckCircle2 className="size-4 text-positive shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">{gate}</span>
                  </div>
                </div>
              ))}
              {highWinrate.failedGates.map((gate, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-negative/30 bg-negative/5 flex items-start gap-2"
                >
                  <XCircle className="size-4 text-negative shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">{gate}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Commentary Banner */}
            <div className="p-3 rounded-lg border border-border/40 bg-surface-muted/40 text-[11px] leading-relaxed">
              <span className="font-bold text-foreground">Nhận định định lượng: </span>
              <span className="text-muted-foreground">{highWinrate.commentary}</span>
            </div>
          </div>
        )}

        {activeSubTab === "pace" && (
          <div className="space-y-2">
            <ReversalPaceMeter data={paceResolution} />
          </div>
        )}

        {activeSubTab === "ou_divergence" && (
          <div className="space-y-3 text-[11px]">
            {/* Ornstein-Uhlenbeck Analysis Card */}
            <div className="p-3 rounded-lg border border-border/40 bg-surface-muted/20">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Compass className="size-4 text-accent-primary" /> Quá trình hoàn nguyên trung bình Ornstein-Uhlenbeck (OU)
                </span>
                <Badge
                  tone={
                    ouResult.actionRecommendation === "BUY_OVERSOLD"
                      ? "bull"
                      : ouResult.actionRecommendation === "SELL_OVERBOUGHT"
                      ? "down"
                      : "neutral"
                  }
                >
                  {ouResult.actionRecommendation.replace(/_/g, " ")}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <span className="text-muted-foreground text-[10px]">Tốc độ hoàn nguyên (Theta):</span>
                  <div className="font-bold text-foreground">{ouResult.theta.toFixed(4)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px]">Mức cân bằng dài hạn (Mu):</span>
                  <div className="font-bold text-foreground">{fmtNum(ouResult.mu, digits)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px]">Chu kỳ bán rã (Half-Life):</span>
                  <div className="font-bold text-foreground">
                    {ouResult.halfLife === Infinity ? "∞" : `${ouResult.halfLife} chu kỳ nến`}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px]">Độ lệch chuẩn hiện tại:</span>
                  <div
                    className={`font-bold ${
                      ouResult.currentZScore <= -1.8
                        ? "text-positive"
                        : ouResult.currentZScore >= 1.8
                        ? "text-negative"
                        : "text-foreground"
                    }`}
                  >
                    {ouResult.currentZScore.toFixed(2)}σ
                  </div>
                </div>
              </div>
            </div>

            {/* Divergence Scanner Card */}
            <div className="p-3 rounded-lg border border-border/40 bg-surface-muted/20">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="size-4 text-amber-400" /> Máy quét phân kỳ đa dao động (RSI, MACD, Stoch)
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {divergences.length} phân kỳ được phát hiện
                </span>
              </div>

              {divergences.length > 0 ? (
                <div className="space-y-1.5">
                  {divergences.map((d, i) => (
                    <div
                      key={i}
                      className="p-2 rounded border border-border/30 bg-surface-elevated/40 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={d.kind.includes("bullish") ? "bull" : "down"}
                          className="text-[9px]"
                        >
                          {d.kind.toUpperCase()}
                        </Badge>
                        <span className="font-semibold text-foreground">{d.oscillator.toUpperCase()}</span>
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        Giá: {fmtNum(d.pricePivots[1]?.price ?? d.pricePivots[0]?.price ?? price, digits)} (Cường độ: <b className="text-foreground">{d.strength}</b>)
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-[11px] py-1">
                  Không phát hiện phân kỳ bất thường trên khung thời gian này. Dao động giá đang di chuyển hài hòa với chỉ báo.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
