"use client";

import { useState } from "react";
import { useApi } from "@/lib/hooks";
import { Badge, fmtNum, FreshnessDot, Loading, MetaLine, Panel, priceDigits, Unavailable } from "@/components/ui";
import { Crosshair, RefreshCw, ShieldAlert, Timer, Zap } from "lucide-react";
import type { Meta, QualityStatus } from "@/lib/types";

/** Client-local shapes — never import server-only modules. */
interface PrecisionSummaryView {
  direction: string;
  action: string;
  grade: "A+" | "A" | "B" | "NO_TRADE";
  precisionScore: number;
  calibratedWinRatePct: number;
  expectancyR: number;
  entryMode: string;
  entry: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  netRiskReward: number | null;
  vetoReasons: string[];
}

interface ScalpSignalView {
  timeframe: string;
  direction: "watch-long" | "watch-short" | "neutral" | string;
  strength: number;
  score: number;
  last: number;
  atr: number | null;
  entryZone: [number, number] | null;
  invalidation: number | null;
  micro: { support: number[]; resistance: number[] };
  riskNotes: string[];
  evidence: string[];
  probability?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  precision?: PrecisionSummaryView | null;
  primarySetup?: {
    strategy: string;
    status: string;
    grade?: string;
    entry: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    riskReward: number | null;
  } | null;
  regime?: { market: string } | null;
  filter?: { eligible: boolean; tier: string } | null;
}

interface ScalpResult {
  signal: ScalpSignalView;
  quality: QualityStatus;
  wsLive: boolean;
}

const TF = ["1m", "5m", "15m"] as const;

const DIR_UI: Record<string, { label: string; tone: "up" | "down" | "neutral" }> = {
  "watch-long": { label: "WATCH LONG", tone: "up" },
  "watch-short": { label: "WATCH SHORT", tone: "down" },
  neutral: { label: "QUAN SAT", tone: "neutral" },
};

export function ScalpPanel({
  symbol,
  tf: tfProp,
  onTfChange,
}: {
  symbol: string;
  tf?: "1m" | "5m" | "15m";
  onTfChange?: (next: "1m" | "5m" | "15m") => void;
}) {
  const [internalTf, setInternalTf] = useState<(typeof TF)[number]>("5m");
  const tf = tfProp ?? internalTf;
  const setTf = (next: (typeof TF)[number]) => {
    if (onTfChange) onTfChange(next);
    else setInternalTf(next);
  };
  const { data, meta, isLoading, isValidating, mutate } = useApi<ScalpResult>(
    `/api/v1/crypto/${encodeURIComponent(symbol)}/scalp?tf=${tf}`,
    { refreshInterval: 15_000, keepPreviousData: true },
  );

  return (
    <Panel
      className="h-full !flex !flex-col min-h-0 [&_.panel-body]:!flex-1 [&_.panel-body]:!min-h-0 [&_.panel-body]:!overflow-y-auto [&_.panel-body]:!py-2 [&_.panel-body]:!px-2.5"
      title={
        <span className="flex items-center gap-2">
          <Zap className="size-4 text-accent-primary" /> Scalping Intelligence
          {meta && <FreshnessDot status={meta.freshness} ageMs={meta.ageMs} />}
          {data?.wsLive && <Badge tone="up">WS LIVE</Badge>}
        </span>
      }
      right={
        <div className="seg">
          {TF.map((x) => (
            <button key={x} type="button" data-active={tf === x} onClick={() => setTf(x)}>
              {x}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && !data ? (
        <Loading rows={4} />
      ) : !data ? (
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
            <RefreshCw className={`size-3.5 text-accent-primary ${isValidating ? "animate-spin" : ""}`} />
            Đang kết nối tín hiệu Scalping realtime...
          </div>
          <p className="text-[10.5px] text-text-muted">
            Đang đồng bộ nến {tf} từ Binance và lọc tín hiệu thuật toán.
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={isValidating}
            className="rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2.5 py-1 text-[11px] font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            {isValidating ? "Đang đồng bộ..." : "Thử kết nối lại ngay"}
          </button>
        </div>
      ) : (
        <ScalpView result={data} meta={meta} />
      )}
    </Panel>
  );
}

function ScalpView({ result, meta }: { result: ScalpResult; meta: Meta | null }) {
  const s = result.signal;
  const digits = s.last < 0.01 ? 8 : s.last < 1 ? 4 : priceDigits(s.last);
  const dir = DIR_UI[s.direction] ?? DIR_UI.neutral;
  const setup = s.primarySetup;
  const prec = s.precision ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={dir.tone}>
          <span className="text-[12px] font-bold">{dir.label}</span>
        </Badge>
        {prec && (
          <Badge tone={prec.grade === "A+" || prec.grade === "A" ? "up" : prec.grade === "B" ? "warn" : "neutral"}>
            {prec.grade === "NO_TRADE" ? "WAIT / LỌC" : `GRADE ${prec.grade}`}
          </Badge>
        )}
        {prec && prec.grade !== "NO_TRADE" && (
          <Badge tone={prec.expectancyR >= 0.2 ? "up" : "accent"}>
            E[R] {prec.expectancyR >= 0 ? `+${prec.expectancyR}R` : `${prec.expectancyR}R`}
          </Badge>
        )}
        <span className="num text-[11px] text-text-secondary">
          winrate <b className="text-text-primary">{prec?.calibratedWinRatePct ?? s.probability ?? s.strength}</b>% · score{" "}
          {s.score >= 0 ? "+" : ""}
          {s.score}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-text-muted">
          <Timer className="size-3" /> {s.timeframe}
        </span>
        {setup && (
          <Badge tone={setup.status === "TRIGGERED" ? "up" : "neutral"}>
            {setup.strategy}:{setup.status}
          </Badge>
        )}
        {s.regime && <Badge tone="neutral">{s.regime.market}</Badge>}
        {s.filter && <Badge tone={s.filter.eligible ? "up" : "down"}>tier {s.filter.tier}</Badge>}
      </div>

      {prec?.grade === "NO_TRADE" && prec.vetoReasons?.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-text-secondary">
          <span className="font-semibold text-warning">🛡 Veto Precision: </span>
          {prec.vetoReasons[0]}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <Metric label="Last" value={fmtNum(s.last, digits)} />
        <Metric
          label="Entry zone"
          value={s.entryZone ? `${fmtNum(s.entryZone[1], digits)} → ${fmtNum(s.entryZone[0], digits)}` : "-"}
          tone={dir.tone}
        />
        <Metric
          label="Invalidation"
          value={s.invalidation != null ? fmtNum(s.invalidation, digits) : "-"}
          tone="down"
        />
        <Metric label="Mode" value={prec?.entryMode === "LIMIT_PULLBACK" ? "LIMIT OTE" : result.wsLive ? "WS+REST" : "REST"} />
      </div>

      {s.direction !== "neutral" && (prec?.entry ?? setup?.entry) != null && (prec?.stopLoss ?? setup?.stopLoss) != null && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <Metric label="Entry" value={fmtNum((prec?.entry ?? setup?.entry) as number, digits)} tone="up" />
            <Metric label="SL Cấu trúc" value={fmtNum((prec?.stopLoss ?? setup?.stopLoss) as number, digits)} tone="down" />
            <Metric
              label="TP2 Mục tiêu"
              value={(prec?.tp2 ?? s.tp2 ?? setup?.takeProfit) != null ? fmtNum((prec?.tp2 ?? s.tp2 ?? setup?.takeProfit) as number, digits) : "-"}
              hint={(prec?.netRiskReward ?? setup?.riskReward) != null ? `Net RR ${prec?.netRiskReward ?? setup?.riskReward}` : undefined}
            />
          </div>
          {(prec?.tp1 ?? s.tp1) != null && (
            <div className="grid grid-cols-3 gap-1.5 rounded-md border border-border-subtle bg-surface-elevated/30 p-1.5 text-[10px]">
              <div>
                <span className="text-text-muted">TP1 (50%+BE): </span>
                <b className="num text-positive">{fmtNum((prec?.tp1 ?? s.tp1) as number, digits)}</b>
              </div>
              <div>
                <span className="text-text-muted">TP2 (30%): </span>
                <b className="num text-positive">
                  {(prec?.tp2 ?? s.tp2) != null ? fmtNum((prec?.tp2 ?? s.tp2) as number, digits) : "—"}
                </b>
              </div>
              <div>
                <span className="text-text-muted">TP3 (20%): </span>
                <b className="num text-positive">
                  {(prec?.tp3 ?? s.tp3) != null ? fmtNum((prec?.tp3 ?? s.tp3) as number, digits) : "—"}
                </b>
              </div>
            </div>
          )}
        </div>
      )}

      {(s.micro?.support?.length ?? 0) + (s.micro?.resistance?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Crosshair className="size-3.5 text-text-muted" />
          {(s.micro?.support ?? []).slice(0, 2).map((v) => (
            <span key={`s${v}`} className="num rounded bg-positive/10 px-1.5 py-0.5 text-positive">
              {fmtNum(v, digits)}
            </span>
          ))}
          <span className="text-text-muted">·</span>
          {(s.micro?.resistance ?? []).slice(0, 2).map((v) => (
            <span key={`r${v}`} className="num rounded bg-negative/10 px-1.5 py-0.5 text-negative">
              {fmtNum(v, digits)}
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-0.5">
        {(s.evidence ?? []).map((e, i) => (
          <li key={i} className="text-[11px] text-text-secondary">
            ▸ {e}
          </li>
        ))}
      </ul>

      {(s.riskNotes ?? []).length > 0 && (
        <div className="space-y-0.5 rounded-md border border-warning/25 bg-warning/5 p-2">
          {s.riskNotes.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-text-secondary">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" /> {r}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-text-muted">Signal quant từ nến Binance (REST). Không phải khuyến nghị.</p>
      {meta && <MetaLine meta={meta} />}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <div className="panel-inset p-2">
      <div className="text-[9.5px] uppercase tracking-wider text-text-muted">{label}</div>
      <div
        className={`num mt-0.5 text-[12px] ${tone === "up" ? "text-positive" : tone === "down" ? "text-negative" : "text-text-primary"}`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-text-muted">{hint}</div>}
    </div>
  );
}
