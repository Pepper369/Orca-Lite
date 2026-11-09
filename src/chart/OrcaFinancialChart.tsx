"use client";

/**
 * ORCA FINANCIAL CHART — History + indicators + live stream.
 * Streamlined UI, unified price scaling, zero background MTF bloat.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi } from "lightweight-charts";
import { useApi } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";
import { tfsFor, TF_LABEL, type ChartAssetType, type ChartCandle, type ChartMarketData } from "@/lib/chart-const";
import { SeriesManager } from "./series-manager";
import { ChartLiveManager, type LiveState, type LiveCandle } from "./live-manager";
import { supportsLiveChart } from "./live-policy";
import { ORCA_CHART_THEME as T, type ChartKind } from "./theme";
import { Loading } from "@/components/ui";
import { analyzeMoneyFlow } from "@/lib/engines/money-flow";
import { buildSmcOverlay } from "@/chart/smc-overlay";
import { buildWyckoffOverlay } from "@/chart/wyckoff-overlay";
import { applySmcPriceLines, type SmcLineBag } from "@/chart/smc-series-helpers";
import type { OhlcvBar } from "@/lib/types";

interface Props {
  symbol: string;
  assetType: ChartAssetType;
  defaultTimeframe?: string;
  height?: number;
  title?: string;
  extraLevels?: { label: string; price: number; color: string }[];
}

const CHART_KINDS: { id: ChartKind; label: string }[] = [
  { id: "candles", label: "Nến" },
  { id: "line", label: "Đường" },
  { id: "area", label: "Vùng" },
  { id: "bar", label: "Bar" },
];

type IndKey =
  | "ema"
  | "ma20"
  | "bollinger"
  | "vwap"
  | "rsi"
  | "macd"
  | "srLevels";

const QUICK_INDICATORS: { key: IndKey | "volume"; label: string; short: string }[] = [
  { key: "ema", label: "EMA 20/50", short: "EMA" },
  { key: "ma20", label: "MA 20/50", short: "MA" },
  { key: "bollinger", label: "Bollinger Bands", short: "BB" },
  { key: "vwap", label: "VWAP", short: "VWAP" },
  { key: "rsi", label: "RSI (14)", short: "RSI" },
  { key: "macd", label: "MACD", short: "MACD" },
  { key: "srLevels", label: "Hỗ trợ / Kháng cự", short: "S/R" },
  { key: "volume", label: "Khối lượng", short: "Vol" },
];

function normalizeKind(raw: string | undefined): ChartKind {
  if (raw === "candle") return "candles";
  if (raw === "candles" || raw === "area" || raw === "line" || raw === "baseline" || raw === "bar") return raw;
  return "candles";
}

function historyLimit(assetType: ChartAssetType, tf: string): number {
  const isDailyPlus = tf === "1d" || tf === "1w" || tf === "1M";
  const isHighTf = isDailyPlus || tf === "4h" || tf === "6h" || tf === "12h" || tf === "2h";
  if (assetType === "crypto") {
    if (isDailyPlus) return 2500;
    if (isHighTf) return 2000;
    return 1500;
  }
  if (assetType === "stock") {
    if (tf === "12M") return 40;
    if (tf === "1M") return 180;
    if (tf === "1w") return 400;
    if (tf === "1d") return 1000;
    if (tf === "4h") return 600;
    if (tf === "1h") return 500;
    if (tf === "15m" || tf === "30m") return 400;
    if (tf === "5m") return 350;
    return 300;
  }
  if (assetType === "commodity") return isDailyPlus ? 1000 : 800;
  if (isDailyPlus) return 1500;
  if (tf === "4h" || tf === "1h") return 1000;
  return 800;
}

function lastPointValue(pts: { value?: number }[] | undefined | null): number | null {
  if (!pts?.length) return null;
  for (let i = pts.length - 1; i >= 0; i--) {
    const v = pts[i]?.value;
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function OrcaFinancialChartInner({ symbol, assetType, defaultTimeframe, height = 430, title, extraLevels }: Props) {
  const { settings, update } = useSettings();
  const prefs = settings.chart;
  const tfs = useMemo(() => tfsFor(assetType), [assetType]);
  const [tf, setTf] = useState(() => {
    const pref = defaultTimeframe ?? settings.dashboard.defaultTimeframe ?? "1d";
    if (tfs.includes(pref)) return pref;
    if (tfs.includes("1d")) return "1d";
    return tfs[0]!;
  });
  const [engineReady, setEngineReady] = useState(false);
  const [activeKind, setActiveKind] = useState<ChartKind>(() => normalizeKind(prefs.chartType));

  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mgrRef = useRef<SeriesManager | null>(null);
  const liveRef = useRef<ChartLiveManager | null>(null);
  const kindRef = useRef<ChartKind>(normalizeKind(prefs.chartType));
  const loadSeqRef = useRef(0);
  const appliedTfRef = useRef<string>(tf);
  const dataRef = useRef<ChartMarketData | null>(null);
  const lastMutateRef = useRef(0);
  const liveStateRef = useRef<LiveState | null>(null);
  const extraLevelsRef = useRef(extraLevels);
  const [liveState, setLiveState] = useState<LiveState | null>(null);
  const [smcOn, setSmcOn] = useState(false);
  const smcLineBag = useRef<SmcLineBag>({ lines: [] });
  const [wyckoffOn, setWyckoffOn] = useState(false);
  const wyckoffLineBag = useRef<SmcLineBag>({ lines: [] });

  useEffect(() => {
    extraLevelsRef.current = extraLevels;
  }, [extraLevels]);

  const limit = historyLimit(assetType, tf);
  const chartUrl = `/api/v1/chart/history?symbol=${encodeURIComponent(symbol)}&assetType=${assetType}&timeframe=${tf}&limit=${limit}`;
  const { data, isLoading, isValidating, mutate } = useApi<ChartMarketData>(chartUrl, {
    keepPreviousData: false,
    timeoutMs: 18_000,
  });

  useEffect(() => {
    dataRef.current = data ?? null;
  }, [data]);

  useEffect(() => {
    void mutate();
  }, [chartUrl, mutate]);

  const readout = useMemo(() => {
    const ind = data?.indicators;
    if (!ind) return null;
    return {
      ema20: lastPointValue(ind.ema20),
      ema50: lastPointValue(ind.ema50),
      rsi: lastPointValue(ind.rsi),
      macd: lastPointValue(ind.macd?.macd),
      signal: lastPointValue(ind.macd?.signal),
      hist: lastPointValue(ind.macd?.histogram),
    };
  }, [data]);

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let chart: IChartApi | null = null;

    (async () => {
      try {
        const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts");
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";

        chart = createChart(hostRef.current, {
          height,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: T.text,
            fontSize: 11,
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          },
          grid: prefs.grid
            ? { vertLines: { color: T.grid }, horzLines: { color: T.grid } }
            : { vertLines: { visible: false }, horzLines: { visible: false } },
          crosshair: { mode: prefs.crosshairMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal },
          rightPriceScale: {
            borderVisible: false,
            mode: prefs.logScale ? 1 : 0,
            scaleMargins: { top: 0.08, bottom: 0.18 },
          },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        });

        chartRef.current = chart;
        const mgr = new SeriesManager(chart);
        mgr.createBase(kindRef.current);
        mgrRef.current = mgr;

        ro = new ResizeObserver(() => {
          if (hostRef.current && chart) chart.applyOptions({ width: hostRef.current.clientWidth, height });
        });
        ro.observe(hostRef.current);
        chart.applyOptions({ width: hostRef.current.clientWidth });
        if (!cancelled) setEngineReady(true);
      } catch {
        /* safety */
      }
    })();

    const hostEl = hostRef.current;
    return () => {
      cancelled = true;
      ro?.disconnect();
      try {
        chart?.remove();
        if (hostEl) hostEl.innerHTML = "";
      } catch {
        /* safety */
      }
      chartRef.current = null;
      mgrRef.current = null;
      setEngineReady(false);
    };
  }, [height, prefs.grid, prefs.crosshairMagnet, prefs.logScale]);

  useEffect(() => {
    const k = normalizeKind(prefs.chartType);
    if (k !== kindRef.current) {
      kindRef.current = k;
      setActiveKind(k);
      mgrRef.current?.setKind(k);
    }
  }, [prefs.chartType]);

  useEffect(() => {
    const seq = ++loadSeqRef.current;
    const mgr = mgrRef.current;
    const chart = chartRef.current;
    if (!engineReady || !mgr || !chart) return;

    const dataTf = (data?.timeframe ?? "").toLowerCase();
    const wantTf = tf.toLowerCase();

    if (appliedTfRef.current !== tf) {
      appliedTfRef.current = tf;
      dataRef.current = null;
      try {
        mgr.setHistory([], kindRef.current);
      } catch {
        /* safety */
      }
    }

    if (dataTf && dataTf !== wantTf) return;
    if (isValidating && !data?.candles?.length) return;
    if (!data?.candles?.length) return;
    if (seq !== loadSeqRef.current) return;

    try {
      const safe = data.candles
        .filter(
          (c) =>
            c &&
            Number.isFinite(c.time) &&
            c.time > 0 &&
            Number.isFinite(c.close) &&
            c.close > 0 &&
            Number.isFinite(c.open) &&
            c.open > 0 &&
            Number.isFinite(c.high) &&
            Number.isFinite(c.low),
        )
        .map((c) => {
          const hi = Math.max(c.open, c.high, c.low, c.close);
          const lo = Math.min(c.open, c.high, c.low, c.close);
          return lo > 0 && hi >= lo ? { ...c, high: hi, low: lo } : null;
        })
        .filter((c): c is NonNullable<typeof c> => c != null);
      if (!safe.length) return;
      mgr.setHistory(safe, kindRef.current);
      mgr.setVolumeVisible(prefs.volume !== false);

      const vis = {
        ema: prefs.indicators?.ema !== false,
        ma10: !!prefs.indicators?.ma10,
        ma20: !!prefs.indicators?.ma20,
        ma50: !!prefs.indicators?.ma50,
        ma100: !!prefs.indicators?.ma100,
        ma200: !!prefs.indicators?.ma200,
        bollinger: !!prefs.indicators?.bollinger,
        vwap: prefs.indicators?.vwap !== false,
        rsi: prefs.indicators?.rsi !== false,
        macd: prefs.indicators?.macd !== false,
        srLevels: prefs.indicators?.srLevels !== false,
      };
      mgr.rebuildIndicators(data.indicators ?? null, vis);
      mgr.rebuildSrLines(data.indicators ?? null, vis.srLevels);
      if (data.markers?.length) mgr.applyMarkers(data.markers);
      if (extraLevels?.length) mgr.rebuildExtraLevels(extraLevels);
      chart.timeScale().fitContent();
    } catch {
      /* safety */
    }
  }, [data, tf, prefs.volume, prefs.indicators, extraLevels, engineReady, isValidating]);

  useEffect(() => {
    const mgr = mgrRef.current;
    if (!engineReady || !mgr || !data?.candles?.length) return;
    if (data.timeframe && data.timeframe.toLowerCase() !== tf.toLowerCase()) return;
    try {
      const series = mgr.getCandleSeries?.() ?? null;
      if (!smcOn) {
        applySmcPriceLines(series, smcLineBag.current, []);
        return;
      }
      const bars: OhlcvBar[] = data.candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      }));
      const analysis = analyzeMoneyFlow(bars);
      const overlay = buildSmcOverlay(analysis);
      applySmcPriceLines(series, smcLineBag.current, overlay.levels);
      if (overlay.markers.length) mgr.applyMarkers(overlay.markers as any);
    } catch {
      /* safety */
    }
  }, [data, smcOn, engineReady, tf]);

  const wyckoffOverlay = useMemo(() => {
    if (!wyckoffOn || !data?.candles?.length) return null;
    const bars: OhlcvBar[] = data.candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume ?? 0,
    }));
    return buildWyckoffOverlay(bars);
  }, [data, wyckoffOn]);

  const wyckoffSnap = wyckoffOverlay?.snapshot ?? null;

  useEffect(() => {
    const mgr = mgrRef.current;
    if (!engineReady || !mgr) return;
    try {
      const series = mgr.getCandleSeries?.() ?? null;
      if (!wyckoffOn || !wyckoffOverlay) {
        applySmcPriceLines(series, wyckoffLineBag.current, []);
        return;
      }
      applySmcPriceLines(series, wyckoffLineBag.current, wyckoffOverlay.levels);
      if (wyckoffOverlay.markers.length) mgr.applyMarkers(wyckoffOverlay.markers as any);
    } catch {
      /* safety */
    }
  }, [wyckoffOverlay, wyckoffOn, engineReady]);

  const supportsLive = supportsLiveChart(assetType);
  const canLive = Boolean(engineReady && supportsLive && symbol);
  const [prevCanLive, setPrevCanLive] = useState(canLive);
  if (prevCanLive !== canLive) {
    setPrevCanLive(canLive);
    if (!canLive && liveState != null) {
      setLiveState(null);
    }
  }

  useEffect(() => {
    if (!canLive) {
      liveRef.current?.stop();
      return;
    }

    if (!liveRef.current) liveRef.current = new ChartLiveManager();
    const live = liveRef.current;

    live.start(
      symbol,
      tf,
      {
        onCandle: (c: LiveCandle, closed: boolean) => {
          const mgr = mgrRef.current;
          if (!mgr) return;
          try {
            let candle: ChartCandle = {
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume ?? 0,
            };
            const hist = dataRef.current?.candles;
            const lastHist = hist?.length ? hist[hist.length - 1] : null;
            if (assetType === "stock" && lastHist && lastHist.close > 0 && c.close > 0) {
              const ratio = c.close / lastHist.close;
              if (ratio > 500) {
                candle = {
                  ...candle,
                  open: candle.open / 1000,
                  high: candle.high / 1000,
                  low: candle.low / 1000,
                  close: candle.close / 1000,
                };
              } else if (ratio < 1 / 500) {
                candle = {
                  ...candle,
                  open: candle.open * 1000,
                  high: candle.high * 1000,
                  low: candle.low * 1000,
                  close: candle.close * 1000,
                };
              }
            }
            mgr.updateLive(candle);
            if (candle.close != null && Number.isFinite(candle.close)) {
              mgr.updateIncremental(candle.close, candle.time);
            }
            if (closed) {
              const now = Date.now();
              if (now - lastMutateRef.current > 8_000) {
                lastMutateRef.current = now;
                void mutate();
              }
            }
          } catch {
            /* safety */
          }
        },
        onResyncNeeded: () => {
          void mutate();
        },
        onLiveState: (s) => {
          const prev = liveStateRef.current;
          if (prev && prev.state === s.state) return;
          liveStateRef.current = s;
          setLiveState(s);
        },
      },
      assetType,
    );

    return () => {
      live.stop();
    };
  }, [symbol, tf, assetType, engineReady, mutate, canLive]);

  const setKind = (kind: ChartKind) => {
    if (kind === kindRef.current) return;
    kindRef.current = kind;
    setActiveKind(kind);
    mgrRef.current?.setKind(kind);
    update({ chart: { ...settings.chart, chartType: kind } });
  };

  const toggleInd = (key: IndKey | "volume") => {
    const mgr = mgrRef.current;
    if (key === "volume") {
      const next = !settings.chart.volume;
      mgr?.setVolumeVisible(next);
      update({ chart: { ...settings.chart, volume: next } });
      return;
    }
    const ind = settings.chart.indicators;
    const cur = key === "bollinger" || key === "ma20"
      ? !!ind[key as keyof typeof ind]
      : ind[key as keyof typeof ind] !== false;
    const next = !cur;
    const nextInd = { ...ind, [key]: next };
    if (key === "ma20") {
      nextInd.ma50 = next;
    }

    if (mgr && key !== "srLevels") {
      const vis = {
        ema: nextInd.ema !== false,
        ma10: !!nextInd.ma10,
        ma20: !!nextInd.ma20,
        ma50: !!nextInd.ma50,
        ma100: !!nextInd.ma100,
        ma200: !!nextInd.ma200,
        bollinger: !!nextInd.bollinger,
        vwap: nextInd.vwap !== false,
        rsi: nextInd.rsi !== false,
        macd: nextInd.macd !== false,
        srLevels: nextInd.srLevels !== false,
      };
      try {
        mgr.rebuildIndicators(dataRef.current?.indicators ?? null, vis);
      } catch {
        mgr.setIndicatorVisible(key as Parameters<SeriesManager["setIndicatorVisible"]>[0], next);
      }
    }
    if (key === "srLevels") {
      mgr?.rebuildSrLines(dataRef.current?.indicators ?? null, !!nextInd.srLevels);
    }
    update({ chart: { ...settings.chart, indicators: nextInd } });
  };

  const isIndOn = (key: IndKey | "volume") => {
    if (key === "volume") return prefs.volume !== false;
    if (key === "bollinger" || key === "ma20")
      return !!prefs.indicators?.[key as keyof typeof prefs.indicators];
    return prefs.indicators?.[key as keyof typeof prefs.indicators] !== false;
  };

  const liveBadge =
    liveState?.state === "live"
      ? "LIVE"
      : liveState?.state === "connecting"
        ? "…"
        : supportsLiveChart(assetType)
          ? "SSE"
          : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-primary text-text-primary">
      {/* 1. Header Toolbar: Symbol, Status, Timeframes, Chart Styles */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border-subtle/80 px-2.5 py-1.5 bg-surface-elevated/40">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold tracking-tight text-text-primary">{title ?? symbol}</span>
          {liveBadge && (
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                liveBadge === "LIVE"
                  ? "bg-positive/15 text-positive border border-positive/30 animate-pulse"
                  : "bg-surface-elevated text-text-muted"
              }`}
            >
              {liveBadge}
            </span>
          )}
        </div>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center gap-0.5 bg-surface-primary/70 p-0.5 rounded-lg border border-border-subtle/60">
          {tfs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                tf === t
                  ? "bg-accent-primary text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-elevated/60"
              }`}
            >
              {(TF_LABEL[t] ?? t).toUpperCase()}
            </button>
          ))}
        </div>

        {/* Chart Kind Segmented Selector */}
        <div className="flex items-center gap-0.5 bg-surface-primary/70 p-0.5 rounded-lg border border-border-subtle/60">
          {CHART_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                activeKind === k.id
                  ? "bg-surface-elevated text-accent-primary font-bold shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Indicators & Overlays Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border-subtle/60 px-2.5 py-1 text-[10px]">
        {/* Core Indicators */}
        <div className="flex flex-wrap items-center gap-1">
          {QUICK_INDICATORS.map((t) => (
            <button
              key={t.key}
              type="button"
              title={t.label}
              onClick={() => toggleInd(t.key)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition border ${
                isIndOn(t.key)
                  ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary font-semibold"
                  : "border-border-subtle/50 text-text-muted hover:text-text-primary hover:border-border-subtle"
              }`}
            >
              {t.short}
            </button>
          ))}
        </div>

        {/* Advanced Overlays: SMC & Wyckoff */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            title="Smart Money Concepts (FVG, OrderBlock, Swings, Liquidity)"
            onClick={() => setSmcOn((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[10px] font-medium transition ${
              smcOn
                ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-300 font-bold shadow-sm"
                : "border-border-subtle/60 text-text-muted hover:text-cyan-400"
            }`}
          >
            SMC
          </button>
          <button
            type="button"
            title="Wyckoff VSA Master (Phase, Ice, Creek, Stops, Targets & RS)"
            onClick={() => setWyckoffOn((v) => !v)}
            className={`rounded border px-2 py-0.5 text-[10px] font-medium transition ${
              wyckoffOn
                ? "border-amber-500/60 bg-amber-500/20 text-amber-300 font-bold shadow-sm"
                : "border-border-subtle/60 text-text-muted hover:text-amber-400"
            }`}
          >
            WYCKOFF
          </button>
        </div>
      </div>

      {/* 3. Wyckoff Analysis Ribbon (Single-line Compact) */}
      {wyckoffOn && wyckoffSnap && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle/70 bg-surface-elevated/30 px-2.5 py-1 text-[10px] text-text-secondary">
          <span className="font-bold text-amber-300">
            Wyckoff {wyckoffSnap.trModel ? `(${wyckoffSnap.trModel === "Base" ? "Base TR" : "Top TR"})` : ""}:
          </span>
          <span className="font-semibold text-text-primary">
            {wyckoffSnap.phaseVi}{wyckoffSnap.subPhase ? ` · Pha ${wyckoffSnap.subPhase}` : ""}
          </span>
          {wyckoffSnap.channelPosPct != null && (
            <span>· Kênh: <b className="font-mono text-text-primary">{wyckoffSnap.channelPosPct}%</b></span>
          )}
          {wyckoffSnap.stopLoss != null && (
            <span className="font-mono text-rose-400">· SL: <b>{wyckoffSnap.stopLoss.toFixed(2)}</b></span>
          )}
          {wyckoffSnap.target1 != null && (
            <span className="font-mono text-emerald-400">· T1: <b>{wyckoffSnap.target1.toFixed(2)}</b></span>
          )}
          {wyckoffSnap.rsScore != null && (
            <span className={wyckoffSnap.isRsAboveMa49 ? "font-mono text-emerald-400 font-bold" : "font-mono text-text-muted"}>
              · RS: <b>{wyckoffSnap.rsScore > 0 ? `+${wyckoffSnap.rsScore}` : wyckoffSnap.rsScore}%</b>
              {wyckoffSnap.isLeaderITF ? " ⭐ Leader" : ""}
            </span>
          )}
          {wyckoffSnap.marketRoro && (
            <span
              className={`rounded px-1.5 py-0.5 font-bold ${
                wyckoffSnap.marketRoro.environment === "RISK_ON"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
              }`}
            >
              {wyckoffSnap.marketRoro.environment === "RISK_ON" ? "Risk-On 🟢" : "Risk-Off 🔴"}
            </span>
          )}
        </div>
      )}

      {/* 4. Indicator Readout Inline (Clean 2-decimal formatting) */}
      {readout && (
        <div className="flex flex-wrap items-center gap-3 px-2.5 py-0.5 text-[10px] text-text-secondary border-b border-border-subtle/30 bg-surface-primary/50">
          {readout.rsi != null && (
            <span>RSI: <b className="font-mono text-text-primary">{readout.rsi.toFixed(1)}</b></span>
          )}
          {readout.ema20 != null && (
            <span>EMA20: <b className="font-mono text-text-primary">{readout.ema20.toFixed(2)}</b></span>
          )}
          {readout.ema50 != null && (
            <span>EMA50: <b className="font-mono text-text-primary">{readout.ema50.toFixed(2)}</b></span>
          )}
          {readout.hist != null && (
            <span>
              MACD Hist:{" "}
              <b className={`font-mono ${readout.hist >= 0 ? "text-up" : "text-down"}`}>
                {readout.hist >= 0 ? `+${readout.hist.toFixed(2)}` : readout.hist.toFixed(2)}
              </b>
            </span>
          )}
        </div>
      )}

      {/* 5. Chart Canvas */}
      <div ref={hostRef} className="relative min-h-0 flex-1 w-full" style={{ minHeight: Math.max(220, height - 70) }} />

      {isLoading && !data && (
        <div className="absolute inset-0 flex items-center justify-center bg-background-secondary/60 backdrop-blur-[1px]">
          <Loading rows={2} />
        </div>
      )}
    </div>
  );
}

export const OrcaFinancialChart = memo(OrcaFinancialChartInner);
