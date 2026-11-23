"use client";

import { memo } from "react";
import { Activity, Radar, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui";
import type { BotQuantIntelligenceSummary } from "@/lib/engines/bot-telemetry-types";

export const QuantIntelligenceStrip = memo(function QuantIntelligenceStrip({
  intel,
}: {
  intel?: BotQuantIntelligenceSummary | null;
}) {
  if (!intel) return null;
  const { predictionRadar: radar, alphaDecaySummary: decay, thesisEventsCount, roiDecayExitsCount } = intel;

  const regimeTone =
    radar.riskRegime === "RISK_ON"
      ? "up"
      : radar.riskRegime === "RISK_OFF"
        ? "down"
        : "warn";

  const biasTone =
    radar.cryptoLeadingBiasScore >= 25
      ? "text-positive"
      : radar.cryptoLeadingBiasScore <= -25
        ? "text-negative"
        : "text-text-secondary";

  const oddsMeters = [
    { label: "Fed Cut", pct: Math.round(radar.fedRateCutOdds * 100), tone: "bg-emerald-500" },
    { label: "CPI Hot", pct: Math.round(radar.inflationSurpriseOdds * 100), tone: "bg-amber-500" },
    { label: "Crypto Bull", pct: Math.round(radar.cryptoBullishRangeOdds * 100), tone: "bg-cyan-500" },
    { label: "Geopolitics", pct: Math.round(radar.geopoliticalStressOdds * 100), tone: "bg-rose-500" },
  ];

  return (
    <div className="grid gap-2.5 lg:grid-cols-12">
      {/* Prediction Market Leading Macro Radar */}
      <div className="lg:col-span-7 rounded-xl border border-line/70 bg-surface-secondary/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <Radar className="size-3.5 text-cyan-400" />
            <span className="text-[11.5px] font-bold text-text-primary">
              Prediction Macro Radar (Polymarket / Kalshi)
            </span>
            <Badge tone={regimeTone}>{radar.riskRegime}</Badge>
            <Badge tone={radar.dataSource === "LIVE_POLYMARKET" ? "up" : "accent"}>
              {radar.dataSource === "LIVE_POLYMARKET" ? "LIVE API" : "BASELINE"}
            </Badge>
          </div>
          <span className={`font-mono text-[11px] font-bold ${biasTone}`}>
            Crypto Bias: {radar.cryptoLeadingBiasScore > 0 ? "+" : ""}
            {radar.cryptoLeadingBiasScore}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {oddsMeters.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-line/50 bg-surface-primary/70 px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="text-text-muted">{m.label}</span>
                <span className="font-mono font-bold text-text-primary">{m.pct}%</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
                <div className={`h-full ${m.tone}`} style={{ width: `${Math.min(100, m.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alpha Decay Sentinel + Thesis / ROI Exit Shield */}
      <div className="lg:col-span-5 rounded-xl border border-line/70 bg-surface-secondary/60 p-3 flex flex-col justify-between gap-2">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3.5 text-violet-400" />
            <span className="text-[11.5px] font-bold text-text-primary">
              Alpha Decay &amp; Execution Shield
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="rounded bg-surface-primary px-1.5 py-0.5 font-mono text-text-secondary border border-line/50">
              Cache: {decay.trackedSymbols} cặp
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-amber-400 border border-amber-500/20">
              <ShieldAlert className="size-2.5" /> Thesis: {thesisEventsCount}
            </span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-400 border border-emerald-500/20">
              ROI Exit: {roiDecayExitsCount}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {decay.topEmergingFactors.length > 0 ? (
            decay.topEmergingFactors.map((f) => (
              <span
                key={`em_${f}`}
                className="inline-flex items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-emerald-400"
              >
                <TrendingUp className="size-2.5" /> {f}
              </span>
            ))
          ) : (
            <span className="text-text-muted">Qlib Alpha: Đang theo dõi Rank-IC thực tế…</span>
          )}
          {decay.prunedDecayedFactors.slice(0, 3).map((f) => (
            <span
              key={`pr_${f}`}
              className="inline-flex items-center gap-0.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-rose-400 line-through"
              title="Nhân tố suy thoái đã bị tự động loại bỏ khỏi trọng số"
            >
              <TrendingDown className="size-2.5" /> {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});
