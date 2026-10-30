"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { Badge, Chg, fmtNum, FreshnessDot, Loading, MetaLine, Panel, Unavailable } from "@/components/ui";
import { Play } from "@/components/screener-icons";

type DivSignal = {
  kind: string;
  oscillator: string;
  strength: "A" | "B" | "C";
  confidence: number;
  barsBetween: number;
  timeframe: string | null;
  structure?: "single" | "double" | "triple";
  status?: "forming" | "confirmed" | "playing_out" | "exhausted" | "invalidated";
  barsAgo?: number;
  zone?: "oversold" | "overbought" | "neutral";
  trigger?: string;
  confirmationBarIndex?: number | null;
};

type DivRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  asset: "stock" | "crypto";
  price: number | null;
  changePercent: number | null;
  top: DivSignal;
  alertWorthy: boolean;
  summary: string;
  divergences: DivSignal[];
};

type ScreenPayload = {
  rows: DivRow[];
  scanned: number;
  skipped: number;
  asset?: string;
  filters?: Record<string, string>;
  meta?: { freshness?: string; ageMs?: number; note?: string };
};

const KINDS = [
  { id: "any", label: "Tất cả loại" },
  { id: "regular_bullish", label: "Regular ↑ (đảo chiều lên)" },
  { id: "regular_bearish", label: "Regular ↓ (đảo chiều xuống)" },
  { id: "hidden_bullish", label: "Hidden ↑ (tiếp diễn)" },
  { id: "hidden_bearish", label: "Hidden ↓ (tiếp diễn)" },
] as const;

const OSCS = [
  { id: "any", label: "Tất cả oscillator" },
  { id: "rsi", label: "RSI" },
  { id: "macd_hist", label: "MACD hist" },
  { id: "macd_line", label: "MACD line" },
  { id: "stoch", label: "Stochastic" },
] as const;

const STRENGTHS = [
  { id: "C", label: "C trở lên" },
  { id: "B", label: "B trở lên" },
  { id: "A", label: "Chỉ class A" },
] as const;

const STATUSES = [
  { id: "all", label: "Tất cả trạng thái" },
  { id: "confirmed", label: "Đã xác nhận (Triggered)" },
  { id: "forming", label: "Đang hình thành (Mới)" },
  { id: "playing_out", label: "Đang diễn biến thuận" },
] as const;

const ZONES = [
  { id: "all", label: "Mọi vùng biên độ" },
  { id: "oversold", label: "Quá Bán sâu (RSI ≤ 35)" },
  { id: "overbought", label: "Quá Mua (RSI ≥ 65)" },
] as const;

const ASSETS = [
  { id: "stock", label: "Cổ phiếu VN" },
  { id: "crypto", label: "Crypto" },
  { id: "multi", label: "Multi" },
] as const;

function kindTone(kind: string): "up" | "down" | "neutral" {
  if (kind.includes("bullish")) return "up";
  if (kind.includes("bearish")) return "down";
  return "neutral";
}

function kindShort(kind: string): string {
  switch (kind) {
    case "regular_bullish":
      return "Reg ↑";
    case "regular_bearish":
      return "Reg ↓";
    case "hidden_bullish":
      return "Hid ↑";
    case "hidden_bearish":
      return "Hid ↓";
    default:
      return kind;
  }
}

function symbolHref(row: DivRow): string {
  return row.asset === "crypto" ? `/crypto/${row.symbol}` : `/stocks/${row.symbol}`;
}

export function DivergenceScreener() {
  const [asset, setAsset] = useState<"stock" | "crypto" | "multi">("stock");
  const [kind, setKind] = useState("any");
  const [oscillator, setOscillator] = useState("any");
  const [minStrength, setMinStrength] = useState("B");
  const [status, setStatus] = useState("all");
  const [zone, setZone] = useState("all");
  const [alertOnly, setAlertOnly] = useState(false);
  const [pressed, setPressed] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("asset", asset);
    if (kind !== "any") p.set("kind", kind);
    if (oscillator !== "any") p.set("oscillator", oscillator);
    p.set("minStrength", minStrength);
    if (status !== "all") p.set("status", status);
    if (zone !== "all") p.set("zone", zone);
    p.set("limit", "50");
    if (asset === "crypto") p.set("timeframe", "1h");
    return p.toString();
  }, [asset, kind, oscillator, minStrength, status, zone]);

  const { res, data, meta, isLoading, isValidating, mutate } = useApi<ScreenPayload>(
    `/api/v1/screener/divergence?${qs}`,
    { refreshInterval: 120_000, timeoutMs: 90_000 },
  );

  const run = useCallback(() => {
    setPressed(true);
    void mutate();
    window.setTimeout(() => setPressed(false), 180);
  }, [mutate]);

  const rows = useMemo(() => {
    let list = data?.rows ?? [];
    if (alertOnly) list = list.filter((r) => r.alertWorthy);
    return list;
  }, [data, alertOnly]);

  if (isLoading && !res) return <Loading rows={8} />;

  if (!res?.success && !data) {
    return (
      <Unavailable
        title="Screener phân kỳ chưa sẵn sàng"
        note={res && !res.success ? res.error.message : "Thử lại sau vài giây"}
      />
    );
  }

  return (
    <>
      <Panel title="Bộ lọc phân kỳ (divergence)" pad={false}>
        <div className="flex flex-wrap items-end gap-2 p-3">
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Tài sản</span>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as typeof asset)}
              className="input !w-36 !py-1.5 text-[12px]"
            >
              {ASSETS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Loại</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="input !w-48 !py-1.5 text-[12px]">
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Oscillator</span>
            <select
              value={oscillator}
              onChange={(e) => setOscillator(e.target.value)}
              className="input !w-36 !py-1.5 text-[12px]"
            >
              {OSCS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Độ mạnh</span>
            <select
              value={minStrength}
              onChange={(e) => setMinStrength(e.target.value)}
              className="input !w-28 !py-1.5 text-[12px]"
            >
              {STRENGTHS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Trạng thái</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input !w-36 !py-1.5 text-[12px]"
            >
              {STATUSES.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-text-muted">Vùng biên</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="input !w-36 !py-1.5 text-[12px]"
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-[12px]">
            <input type="checkbox" checked={alertOnly} onChange={(e) => setAlertOnly(e.target.checked)} />
            Chỉ alert-worthy
          </label>
          <button
            type="button"
            onClick={run}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold text-white ${
              pressed ? "scale-95 bg-accent-primary" : "bg-accent-primary/90 hover:bg-accent-primary"
            }`}
          >
            <Play className="size-3.5" />
            {isValidating ? "Đang quét…" : "Quét phân kỳ"}
          </button>
        </div>
      </Panel>

      <Panel
        title={
          <span>
            Phân kỳ: {rows.length} mã
            {data ? ` · quét ${data.scanned}` : ""}
            <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
            {isValidating ? <span className="ml-1.5 text-[10px] text-accent-primary">· đang cập nhật</span> : null}
          </span>
        }
        pad={false}
      >
        {rows.length === 0 ? (
          <div className="px-3.5 py-8 text-center text-[13px] text-text-muted">
            Không có phân kỳ khớp. Thử nới độ mạnh hoặc đổi loại.
            {data?.skipped ? <div className="mt-1 text-[11px]">Đã bỏ qua {data.skipped} mã thiếu nến.</div> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                  <th className="px-3.5 py-2 font-medium">Mã</th>
                  <th className="py-2 font-medium">Phân kỳ</th>
                  <th className="py-2 font-medium">Trạng thái & Xác nhận</th>
                  <th className="py-2 font-medium">Osc</th>
                  <th className="py-2 text-center font-medium">Class</th>
                  <th className="py-2 text-right font-medium">Conf</th>
                  <th className="py-2 text-right font-medium">Giá</th>
                  <th className="py-2 pr-3.5 text-right font-medium">± %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const t = row.top;
                  const tone = kindTone(t.kind);
                  return (
                    <tr key={`${row.symbol}-${t.kind}-${t.oscillator}`} className="row-hover border-b border-line/40">
                      <td className="px-3.5 py-2">
                        <Link href={symbolHref(row)} className="font-semibold hover:text-accent">
                          {row.symbol}
                        </Link>
                        {row.alertWorthy ? (
                          <span className="ml-1.5">
                            <Badge tone="bull">Alert</Badge>
                          </span>
                        ) : null}
                        {row.sector ? (
                          <div className="mt-0.5 text-[10px] text-text-muted">{row.sector}</div>
                        ) : null}
                      </td>
                      <td className="py-2 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={tone}>{kindShort(t.kind)}</Badge>
                          {t.barsAgo != null ? (
                            <span className="rounded bg-panel-2 px-1 py-0.5 text-[10px] text-text-muted">
                              T-{t.barsAgo}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 max-w-[220px] truncate text-[10px] text-ink-3" title={t.trigger || row.summary}>
                          {t.trigger || row.summary}
                        </div>
                      </td>
                      <td className="py-2 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1">
                          {t.status === "confirmed" ? (
                            <span className="inline-flex items-center rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-400">
                              Đã xác nhận
                            </span>
                          ) : t.status === "forming" ? (
                            <span className="inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-amber-400">
                              Đang tạo đáy
                            </span>
                          ) : t.status === "playing_out" ? (
                            <span className="inline-flex items-center rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-blue-400">
                              Đang diễn biến
                            </span>
                          ) : t.status === "invalidated" ? (
                            <span className="inline-flex items-center rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.2 text-[10px] font-semibold text-rose-400">
                              Đã gãy
                            </span>
                          ) : null}
                          {t.zone === "oversold" ? (
                            <span className="rounded bg-purple-500/15 border border-purple-500/30 px-1 py-0.2 text-[9px] font-medium text-purple-300">
                              RSI Quá bán
                            </span>
                          ) : t.zone === "overbought" ? (
                            <span className="rounded bg-rose-500/15 border border-rose-500/30 px-1 py-0.2 text-[9px] font-medium text-rose-300">
                              RSI Quá mua
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 text-[11px] text-ink-2">
                        {t.oscillator === "rsi"
                          ? "RSI"
                          : t.oscillator === "macd_hist"
                            ? "MACD hist"
                            : t.oscillator === "macd_line"
                              ? "MACD line"
                              : t.oscillator === "stoch"
                                ? "Stoch"
                                : t.oscillator}
                      </td>
                      <td className="py-2 text-center font-semibold">
                        {t.strength}
                        {t.structure && t.structure !== "single" ? (
                          <span className="ml-1 text-[10px] font-normal text-text-muted">{t.structure}</span>
                        ) : null}
                      </td>
                      <td className="num py-2 text-right">{(t.confidence * 100).toFixed(0)}%</td>
                      <td className="num py-2 text-right">{fmtNum(row.price, 2)}</td>
                      <td className="py-2 pr-3.5 text-right">
                        <Chg value={row.changePercent} arrow={false} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-3.5 py-2">
          <MetaLine meta={meta ?? data?.meta} />
          <p className="mt-1 text-[10px] text-text-muted">
            Pivot confirmed (đóng nến) · quant-only · RSI/MACD/Stoch · single/double/triple · không phải tín hiệu mua/bán.
          </p>
        </div>
      </Panel>
    </>
  );
}
