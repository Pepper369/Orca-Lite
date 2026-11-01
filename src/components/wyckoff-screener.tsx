"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/hooks";
import { VN_SECTOR_MAP } from "@/lib/vn/master";
import type { WyckoffScreenRow } from "@/lib/services/wyckoff-screener";
import type { MarketRoroStatus } from "@/lib/engines/wyckoff-elliott";
import { Badge, Chg, fmtNum, FreshnessDot, Loading, MetaLine, Panel, Unavailable } from "@/components/ui";
import { WyckoffPositionCalculator } from "@/components/stocks/wyckoff-position-calculator";
import { Play } from "@/components/screener-icons";

function FilterChip({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-[7.5rem] flex-col gap-1.5 rounded-lg border border-line/80 bg-panel-2/60 px-2.5 py-2 ${className}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-2">{title}</span>
      {children}
    </div>
  );
}

type WyckoffData = { rows: WyckoffScreenRow[]; scanned: number; skipped: number; roro?: MarketRoroStatus | null };

const WYCKOFF_PHASES = [
  { v: "all", l: "Mọi phase" },
  { v: "accumulation", l: "Accumulation" },
  { v: "re-accumulation", l: "Re-accumulation" },
  { v: "markup", l: "Markup" },
  { v: "distribution", l: "Distribution" },
  { v: "re-distribution", l: "Re-distribution" },
  { v: "markdown", l: "Markdown" },
] as const;

const WYCKOFF_SETUPS = [
  { v: "all", l: "Mọi setup" },
  { v: "lps-pullback", l: "LPS Điểm tựa (Pha D)" },
  { v: "spring-tested", l: "Spring đã Test (Pha C)" },
  { v: "spring", l: "Spring Shakeout" },
  { v: "sos-breakout", l: "SOS Breakout (Pha D->E)" },
  { v: "accumulation-range", l: "Range tích lũy" },
  { v: "upthrust", l: "Upthrust / UTAD" },
  { v: "sow-breakdown", l: "SOW Breakdown" },
  { v: "distribution-range", l: "Range phân phối" },
] as const;

const TR_MODELS = [
  { v: "all", l: "Mọi cấu trúc TR" },
  { v: "Base", l: "Tích lũy đáy (Base TR)" },
  { v: "Top", l: "Phân phối đỉnh (Top TR)" },
] as const;

const VSA_TAGS = [
  { v: "all", l: "Mọi Volume VSA" },
  { v: "ultra-high", l: "Ultra High Vol (Cao trào)" },
  { v: "high", l: "High Vol (Hoạt động)" },
  { v: "low", l: "Kiệt Vol (Cạn cung/cầu)" },
] as const;

const CHANNEL_POSITIONS = [
  { v: "all", l: "Mọi vị trí kênh" },
  { v: "ice", l: "Sát sàn Ice (≤ 30%)" },
  { v: "mid", l: "Trục giữa (30% - 75%)" },
  { v: "creek", l: "Tiệm cận Creek (75% - 100%)" },
  { v: "breakout", l: "Vượt đỉnh Creek (> 100%)" },
] as const;

const VSA_SIGNALS = [
  { v: "all", l: "Mọi nến VSA" },
  { v: "NO_SUPPLY", l: "No Supply (Cạn cung)" },
  { v: "NO_DEMAND", l: "No Demand (Cạn cầu)" },
  { v: "STOPPING_VOLUME", l: "Stopping Vol (Chặn đà)" },
  { v: "SHAKEOUT", l: "Shakeout (Rũ bỏ)" },
  { v: "UPTHRUST", l: "Upthrust (Bẫy giá)" },
  { v: "ABSORPTION", l: "Absorption (Hấp thụ)" },
] as const;

function phaseTone(phase: string): "up" | "down" | "warn" | "neutral" {
  if (phase === "accumulation" || phase === "re-accumulation" || phase === "markup") return "up";
  if (phase === "distribution" || phase === "re-distribution" || phase === "markdown") return "down";
  return "neutral";
}

function buildQs(opts: {
  phase: string;
  setup: string;
  trModel: string;
  vsaTag: string;
  vsaSignal: string;
  channelPos: string;
  minRr1: string;
  onlyLeaders: boolean;
  minConf: string;
  sector: string;
  symbols: string;
  bust?: number;
}) {
  const qs = new URLSearchParams({
    phase: opts.phase,
    setup: opts.setup,
    minConfidence: opts.minConf || "40",
    limit: "40",
  });
  if (opts.trModel && opts.trModel !== "all") qs.set("trModel", opts.trModel);
  if (opts.vsaTag && opts.vsaTag !== "all") qs.set("vsaTag", opts.vsaTag);
  if (opts.channelPos && opts.channelPos !== "all") qs.set("channelPos", opts.channelPos);
  if (opts.vsaSignal && opts.vsaSignal !== "all") qs.set("vsaSignal", opts.vsaSignal);
  if (opts.minRr1) qs.set("minRr1", opts.minRr1);
  if (opts.onlyLeaders) qs.set("onlyLeaders", "true");
  if (opts.sector) qs.set("sector", opts.sector);
  const symbols = opts.symbols
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.length) qs.set("symbols", symbols.join(","));
  if (opts.bust) qs.set("_", String(opts.bust));
  return qs.toString();
}

export function WyckoffScreener({ defaultSector }: { defaultSector: string | null }) {
  const [phase, setPhase] = useState("all");
  const [setup, setSetup] = useState("all");
  const [trModel, setTrModel] = useState("all");
  const [vsaTag, setVsaTag] = useState("all");
  const [vsaSignal, setVsaSignal] = useState("all");
  const [channelPos, setChannelPos] = useState("all");
  const [minRr1, setMinRr1] = useState("");
  const [onlyLeaders, setOnlyLeaders] = useState(false);
  const [minConf, setMinConf] = useState("40");
  const [calcRow, setCalcRow] = useState<WyckoffScreenRow | null>(null);
  const [sector, setSector] = useState(defaultSector ?? "");
  const [symbols, setSymbols] = useState("");
  const [query, setQuery] = useState(() =>
    buildQs({
      phase: "all",
      setup: "all",
      trModel: "all",
      vsaTag: "all",
      vsaSignal: "all",
      channelPos: "all",
      minRr1: "",
      onlyLeaders: false,
      minConf: "40",
      sector: defaultSector ?? "",
      symbols: "",
    }),
  );
  const [pressed, setPressed] = useState(false);
  const [flash, setFlash] = useState(false);
  const { res, data, meta, isLoading, isValidating, mutate } = useApi<WyckoffData>(`/api/v1/screener/wyckoff?${query}`, {
    refreshInterval: 60_000,
  });

  const run = useCallback(() => {
    setPressed(true);
    setFlash(true);
    setQuery(
      buildQs({
        phase,
        setup,
        trModel,
        vsaTag,
        vsaSignal,
        channelPos,
        minRr1,
        onlyLeaders,
        minConf,
        sector,
        symbols,
        bust: Date.now(),
      }),
    );
    void mutate();
    window.setTimeout(() => setPressed(false), 180);
  }, [phase, setup, trModel, vsaTag, vsaSignal, channelPos, minRr1, onlyLeaders, minConf, sector, symbols, mutate]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(t);
  }, [flash]);

  const liveNeedle = symbols.trim().toUpperCase();
  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    if (!liveNeedle) return list;
    const parts = liveNeedle.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return list;
    return list.filter((r) =>
      parts.some(
        (p) =>
          r.symbol.includes(p) ||
          (r.name ?? "").toUpperCase().includes(p) ||
          (r.sector ?? "").toUpperCase().includes(p),
      ),
    );
  }, [data, liveNeedle]);

  const busy = isLoading || isValidating;

  return (
    <div className="space-y-3">
      <Panel title="Bộ lọc Wyckoff — rổ thanh khoản VN">
        {data?.roro && (
          <div
            className={`mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${
              data.roro.environment === "RISK_ON"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex size-2.5 rounded-full ${
                  data.roro.environment === "RISK_ON"
                    ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                    : "bg-rose-400 shadow-[0_0_8px_#f43f5e]"
                }`}
              />
              <div>
                <div className="flex items-center gap-2 font-bold text-[13px]">
                  <span>Môi trường VN-Index: {data.roro.environment === "RISK_ON" ? "RISK-ON (Mở vị thế thuận lợi)" : "RISK-OFF (Phòng thủ & Bảo toàn vốn)"}</span>
                  <span className="font-mono text-[11px] opacity-80">
                    ({data.roro.roroValue > 0 ? `+${data.roro.roroValue}` : data.roro.roroValue} pts)
                  </span>
                </div>
                <div className="text-[11px] opacity-90 leading-snug mt-0.5">{data.roro.summaryVi}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono opacity-80 ml-auto">
              <span>Xung lực: <b>{data.roro.strength}%</b></span>
              <span>· MA49: <b>{data.roro.strengthMa49}%</b></span>
              <span>· Xu hướng: <b>{data.roro.trend === "improving" ? "Cải thiện ↗" : data.roro.trend === "deteriorating" ? "Suy giảm ↘" : "Đi ngang →"}</b></span>
            </div>
          </div>
        )}

        <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
          Đọc chu kỳ Composite Man trên nến ngày. Gõ mã để lọc nhanh kết quả; đổi phase/setup/ngành rồi bấm{" "}
          <strong>Tìm kiếm</strong> để quét lại toàn rổ.
        </p>

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Phase & setup</div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <FilterChip title="Phase" className="min-w-[9rem]">
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              {WYCKOFF_PHASES.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="Setup" className="min-w-[9rem]">
            <select
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              {WYCKOFF_SETUPS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.l}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="Tin cậy ≥">
            <input
              value={minConf}
              onChange={(e) => setMinConf(e.target.value)}
              inputMode="decimal"
              placeholder="40"
              className="num input !w-full !px-2 !py-1.5 text-[12px]"
            />
          </FilterChip>
        </div>

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Cấu trúc TR, VSA & Tỷ lệ R:R</div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <FilterChip title="Cấu trúc TR" className="min-w-[9rem]">
            <select
              value={trModel}
              onChange={(e) => setTrModel(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              {TR_MODELS.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.l}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="Volume VSA" className="min-w-[9rem]">
            <select
              value={vsaTag}
              onChange={(e) => setVsaTag(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              {VSA_TAGS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="Nến VSA Tom Williams" className="min-w-[9rem]">
            <select
              value={vsaSignal}
              onChange={(e) => setVsaSignal(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              {VSA_SIGNALS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="Vị trí Kênh" className="min-w-[9rem]">
            <select
              value={channelPos}
              onChange={(e) => setChannelPos(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              {CHANNEL_POSITIONS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.l}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="R:R T1 ≥">
            <input
              value={minRr1}
              onChange={(e) => setMinRr1(e.target.value)}
              inputMode="decimal"
              placeholder="2.0"
              className="num input !w-full !px-2 !py-1.5 text-[12px]"
            />
          </FilterChip>
          <FilterChip title="Cá Mập ITF" className="min-w-[9rem]">
            <button
              type="button"
              onClick={() => setOnlyLeaders((v) => !v)}
              className={`w-full rounded px-2 py-1.5 text-[11px] font-semibold transition border ${
                onlyLeaders
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-surface-elevated text-text-muted border-border-subtle hover:text-text-primary"
              }`}
            >
              {onlyLeaders ? "⭐ Chỉ Leader (Bật)" : "Tất cả mã"}
            </button>
          </FilterChip>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-line/50 pt-3">
          <FilterChip title="Ngành" className="min-w-[10rem]">
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="input !w-full !px-2 !py-1.5 text-[12px]"
            >
              <option value="">Tất cả ({VN_SECTOR_MAP.length} ngành)</option>
              {VN_SECTOR_MAP.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.symbols.length})
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip title="Mã (live)" className="min-w-[9rem]">
            <input
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  run();
                }
              }}
              placeholder="VCB, HPG, FPT"
              className="input !w-full !px-2 !py-1.5 text-[12px]"
              autoComplete="off"
              spellCheck={false}
            />
          </FilterChip>
          <button
            type="button"
            onClick={run}
            disabled={busy && pressed}
            aria-busy={busy}
            className={`inline-flex h-[2.65rem] items-center gap-1.5 self-end rounded-lg px-4 text-[12px] font-semibold text-white shadow-sm transition ${
              pressed ? "scale-95 bg-accent-primary ring-2 ring-white/40" : "bg-accent-primary hover:bg-accent-primary/90"
            } ${busy ? "opacity-90" : ""}`}
          >
            {busy ? (
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
            ) : (
              <Play className="size-3.5" />
            )}
            {busy ? "Đang quét…" : "Tìm kiếm"}
          </button>
        </div>

        {flash && (
          <div className="mt-2 text-[11px] font-medium text-accent-primary animate-pulse">
            Đã áp dụng bộ lọc — đang tải kết quả…
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
          <MetaLine meta={meta} />
          <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
        </div>
      </Panel>

      {isLoading && !res ? (
        <Loading rows={8} />
      ) : !data ? (
        <Unavailable title="Wyckoff screener không khả dụng" note={res && !res.success ? res.error.message : undefined} />
      ) : (
        <Panel
          title={
            <span>
              {rows.length} mã{liveNeedle ? ` (lọc “${liveNeedle}”)` : ""} · quét {data.scanned} · bỏ {data.skipped}{" "}
              thiếu nến <FreshnessDot status={meta?.freshness} ageMs={meta?.ageMs} />
              {isValidating ? <span className="ml-1.5 text-[10px] text-accent-primary">· đang cập nhật</span> : null}
            </span>
          }
          pad={false}
        >
          <div className={`overflow-x-auto transition-opacity duration-200 ${isValidating ? "opacity-70" : "opacity-100"}`}>
            <table className="w-full min-w-[720px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                  <th className="px-3.5 py-2 font-medium">Mã</th>
                  <th className="py-2 font-medium">Phase</th>
                  <th className="py-2 font-medium">Setup</th>
                  <th className="py-2 text-right font-medium">Tin cậy</th>
                  <th className="py-2 text-right font-medium">Giá</th>
                  <th className="py-2 text-right font-medium">Δ%</th>
                  <th className="py-2 pr-3.5 font-medium">Sự kiện</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3.5 py-6 text-center text-text-muted">
                      Không có mã khớp. Thử xóa ô mã hoặc nới lọc phase/setup rồi bấm Tìm kiếm.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.symbol} className="row-hover border-b border-line/40 align-top">
                      <td className="px-3.5 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link href={`/stocks/${r.symbol}`} className="font-semibold hover:text-accent">
                            {r.symbol}
                          </Link>
                          {r.isLeaderITF ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              ⭐ Leader ITF
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-text-muted flex items-center gap-1.5 mt-0.5">
                          <span>{r.sector ?? "—"}</span>
                          {r.rsScore != null ? (
                            <span className={`font-mono ${r.isRsAboveMa49 ? "text-emerald-400 font-semibold" : "text-text-muted"}`}>
                              · RS: {r.rsScore > 0 ? `+${r.rsScore}` : r.rsScore}%
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge tone={phaseTone(r.phase)}>
                            {r.phaseVi}
                            {r.subPhase ? ` · ${r.subPhase}` : ""}
                          </Badge>
                          {r.trModel ? (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                                r.trModel === "Base"
                                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                  : "border-rose-500/40 text-rose-400 bg-rose-500/10"
                              }`}
                            >
                              {r.trModel === "Base" ? "Base TR" : "Top TR"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 text-ink-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-text-primary">{r.setupVi}</span>
                          {r.vsaTag === "ultra-high" ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              Ultra Vol
                            </span>
                          ) : r.vsaTag === "high" ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              High Vol
                            </span>
                          ) : r.vsaTag === "low" ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-medium bg-sky-500/15 text-sky-400 border border-sky-500/30">
                              Kiệt Vol
                            </span>
                          ) : null}
                          {r.latestVsaSignal ? (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                                r.latestVsaSignal.nature === "BULLISH"
                                  ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                                  : "border-rose-500/40 text-rose-300 bg-rose-500/10"
                              }`}
                            >
                              {r.latestVsaSignal.nameVi}
                            </span>
                          ) : null}
                        </div>
                        {r.transitionVi ? (
                          <div className="mt-0.5 text-[10px] text-accent-primary">{r.transitionVi}</div>
                        ) : null}
                      </td>
                      <td className="num py-2 text-right">{r.confidence}%</td>
                      <td className="num py-2 text-right">{fmtNum(r.price, 2)}</td>
                      <td className="py-2 text-right">
                        <Chg value={r.changePercent} arrow={false} />
                      </td>
                      <td className="max-w-[320px] py-2 pr-3.5 text-[11px] leading-snug text-ink-2">
                        <div>{r.events[0] ?? r.notes[0] ?? "—"}</div>
                        {r.range ? (
                          <div className="mt-0.5 text-[10px] text-text-muted">
                            Ice: {fmtNum(r.range.low, 1)} – Creek: {fmtNum(r.range.high, 1)}
                            {r.channelPosPct != null ? (
                              <span className="ml-1 text-ink-2 font-mono">({r.channelPosPct}%)</span>
                            ) : null}
                            {r.causeWeeks != null ? (
                              <span className="ml-1 text-text-muted">· {r.causeWeeks}w</span>
                            ) : null}
                            {r.springTested ? (
                              <span className="ml-1 text-emerald-400 font-semibold">(Spring Tested)</span>
                            ) : null}
                            {r.lpsConfirmed ? (
                              <span className="ml-1 text-cyan-400 font-semibold">(LPS Support)</span>
                            ) : null}
                          </div>
                        ) : null}
                        {r.stopLoss != null || r.target1 != null ? (
                          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] flex-wrap">
                            {r.stopLoss != null ? (
                              <span className="text-rose-400">SL: {fmtNum(r.stopLoss, 1)}</span>
                            ) : null}
                            {r.target1 != null ? (
                              <span className="text-emerald-400">T1: {fmtNum(r.target1, 1)}</span>
                            ) : null}
                            {r.target2 != null ? (
                              <span className="text-cyan-400">T2: {fmtNum(r.target2, 1)}</span>
                            ) : null}
                            {r.rr1 != null ? (
                              <span
                                className={`px-1.5 py-0.2 rounded font-semibold border ${
                                  r.rr1 >= 2.5
                                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                    : r.rr1 >= 1.5
                                      ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                                      : "border-line text-text-muted"
                                }`}
                              >
                                R:R 1:{r.rr1}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setCalcRow(r)}
                              className="rounded bg-accent-primary/10 border border-accent-primary/30 text-accent-primary px-1.5 py-0.2 text-[9px] font-semibold hover:bg-accent-primary hover:text-white transition flex items-center gap-1 ml-auto"
                            >
                              ⚡ Đi tiền
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-3.5 py-2">
            <MetaLine meta={meta} />
          </div>
        </Panel>
      )}

      {calcRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-2xl w-full">
            <WyckoffPositionCalculator
              symbol={calcRow.symbol}
              entryPrice={calcRow.price ?? calcRow.creekLevel ?? 30000}
              stopLossPrice={calcRow.stopLoss}
              target1Price={calcRow.target1}
              target2Price={calcRow.target2}
              onClose={() => setCalcRow(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
