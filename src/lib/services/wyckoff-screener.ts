import "server-only";
import { buildMeta } from "../freshness";
import { analyzeWyckoff, type WyckoffPhase, type WyckoffSnapshot } from "../engines/wyckoff-elliott";
import { getVnQuotes, getVnOhlcv } from "./stocks";
import { LIQUID_BOARD } from "../providers/public-vn-feed";
import { fetchOhlcvResilient, mapPool } from "./screener-ohlcv";
import { getSecurity, sectorOf } from "../vn/master";
import type { Meta, Quote } from "../types";

export type WyckoffSetup =
  | "spring"
  | "spring-tested"
  | "lps-pullback"
  | "sos-breakout"
  | "sow-breakdown"
  | "upthrust"
  | "accumulation-range"
  | "distribution-range"
  | "markup"
  | "markdown"
  | "watch";

export interface WyckoffScreenRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  phase: WyckoffPhase;
  phaseVi: string;
  subPhase: WyckoffSnapshot["subPhase"];
  setup: WyckoffSetup;
  setupVi: string;
  confidence: number;
  bias: WyckoffSnapshot["bias"];
  events: string[];
  eventCodes: string[];
  range: { high: number; low: number } | null;
  notes: string[];
  transitionStatus?: string;
  transitionVi?: string;
  springTested?: boolean;
  lpsConfirmed?: boolean;
  creekLevel?: number | null;
  iceLevel?: number | null;
  trModel?: "Base" | "Top" | null;
  channelPosPct?: number | null;
  causeWeeks?: number | null;
  target1?: number | null;
  target2?: number | null;
  stopLoss?: number | null;
  rr1?: number | null;
  rr2?: number | null;
  vsaTag?: "ultra-high" | "high" | "low" | "normal";
  rsScore?: number | null;
  isRsAboveMa49?: boolean;
  isLeaderITF?: boolean;
}

const SETUP_VI: Record<WyckoffSetup, string> = {
  spring: "Spring / Shakeout",
  "spring-tested": "Spring đã Test (Pha C xác nhận)",
  "lps-pullback": "LPS Điểm tựa cuối (Pha D)",
  "sos-breakout": "SOS — Phá kháng cự (Pha D->E)",
  "sow-breakdown": "SOW — Gãy hỗ trợ",
  upthrust: "Upthrust / UTAD",
  "accumulation-range": "Range tích lũy",
  "distribution-range": "Range phân phối",
  markup: "Markup",
  markdown: "Markdown",
  watch: "Quan sát",
};

function pickSetup(w: WyckoffSnapshot): WyckoffSetup {
  const codes = new Set((w.eventCodes ?? []).map((c) => c.toUpperCase()));
  const blob = (w.events ?? []).join(" ").toLowerCase();
  if (w.springTested || codes.has("SPRING_TESTED")) return "spring-tested";
  if (w.lpsConfirmed || codes.has("LPS")) return "lps-pullback";
  if (codes.has("SPRING") || blob.includes("spring")) return "spring";
  if (codes.has("UTAD") || codes.has("UT") || blob.includes("utad") || blob.includes("upthrust")) return "upthrust";
  if ((codes.has("SOS") || blob.includes("sos")) && (w.phase === "markup" || w.phase === "accumulation" || w.phase === "re-accumulation"))
    return "sos-breakout";
  if ((codes.has("SOW") || blob.includes("sow")) && (w.phase === "markdown" || w.phase === "distribution" || w.phase === "re-distribution"))
    return "sow-breakdown";
  if (w.phase === "accumulation" || w.phase === "re-accumulation") return "accumulation-range";
  if (w.phase === "distribution" || w.phase === "re-distribution") return "distribution-range";
  if (w.phase === "markup") return "markup";
  if (w.phase === "markdown") return "markdown";
  return "watch";
}

export async function screenWyckoff(args?: {
  symbols?: string[];
  phase?: WyckoffPhase | "all";
  setup?: WyckoffSetup | "all";
  trModel?: "Base" | "Top" | "all";
  vsaTag?: "ultra-high" | "high" | "low" | "normal" | "all";
  channelPos?: "ice" | "mid" | "creek" | "breakout" | "all";
  minCauseWeeks?: number;
  minRr1?: number;
  onlyLeaders?: boolean;
  minConfidence?: number;
  sector?: string;
  limit?: number;
}): Promise<{ rows: WyckoffScreenRow[]; scanned: number; skipped: number; meta: Meta }> {
  const uniq = [
    ...new Set((args?.symbols?.length ? args.symbols : LIQUID_BOARD).map((s) => s.toUpperCase()).filter(Boolean)),
  ].slice(0, 90);

  const [quotesPack, indexPack] = await Promise.all([
    getVnQuotes(uniq).catch(() => null),
    getVnOhlcv("VNINDEX", 260).catch(() => null),
  ]);
  const quoteMap = new Map<string, Quote>((quotesPack?.quotes ?? []).map((q) => [q.symbol, q]));
  const indexBars = indexPack?.bars ?? [];

  let skipped = 0;
  const analyzed = await mapPool(uniq, 8, async (symbol) => {
    const { bars } = await fetchOhlcvResilient(symbol, 160);
    if (bars.length < 30) {
      skipped += 1;
      return null;
    }
    const w = analyzeWyckoff(bars, { benchmarkBars: indexBars });
    const q = quoteMap.get(symbol);
    const sec = getSecurity(symbol);
    const setup = pickSetup(w);
    const row: WyckoffScreenRow = {
      symbol,
      name: sec?.name ?? q?.name ?? null,
      sector: sectorOf(symbol) ?? sec?.sector ?? null,
      price: q?.price ?? bars[bars.length - 1]?.close ?? null,
      changePercent: q?.changePercent ?? null,
      volume: q?.quoteVolume ?? q?.volume ?? bars[bars.length - 1]?.volume ?? null,
      phase: w.phase,
      phaseVi: w.phaseVi,
      subPhase: w.subPhase ?? null,
      setup,
      setupVi: SETUP_VI[setup],
      confidence: w.confidence,
      bias: w.bias,
      events: w.events,
      eventCodes: w.eventCodes ?? [],
      range: w.range,
      notes: w.notes,
      transitionStatus: w.transitionStatus,
      transitionVi: w.transitionVi,
      springTested: w.springTested,
      lpsConfirmed: w.lpsConfirmed,
      creekLevel: w.creekLevel,
      iceLevel: w.iceLevel,
      trModel: w.trModel,
      channelPosPct: w.channelPosPct,
      causeWeeks: w.causeWeeks,
      target1: w.target1,
      target2: w.target2,
      stopLoss: w.stopLoss,
      rr1: w.rr1,
      rr2: w.rr2,
      vsaTag: w.vsaTag,
      rsScore: w.rsScore,
      isRsAboveMa49: w.isRsAboveMa49,
      isLeaderITF: w.isLeaderITF,
    };
    return row;
  });

  let rows = analyzed.filter((r): r is WyckoffScreenRow => r != null);

  if (args?.phase && args.phase !== "all") {
    rows = rows.filter((r) => r.phase === args.phase);
  }
  if (args?.setup && args.setup !== "all") {
    rows = rows.filter((r) => r.setup === args.setup);
  }
  if (args?.minConfidence != null) {
    rows = rows.filter((r) => r.confidence >= args.minConfidence!);
  }
  if (args?.sector) {
    rows = rows.filter((r) => r.sector === args.sector);
  }
  if (args?.trModel && args.trModel !== "all") {
    rows = rows.filter((r) => r.trModel === args.trModel);
  }
  if (args?.vsaTag && args.vsaTag !== "all") {
    rows = rows.filter((r) => r.vsaTag === args.vsaTag);
  }
  if (args?.channelPos && args.channelPos !== "all") {
    if (args.channelPos === "ice") {
      rows = rows.filter((r) => r.channelPosPct != null && r.channelPosPct <= 30);
    } else if (args.channelPos === "mid") {
      rows = rows.filter((r) => r.channelPosPct != null && r.channelPosPct > 30 && r.channelPosPct < 75);
    } else if (args.channelPos === "creek") {
      rows = rows.filter((r) => r.channelPosPct != null && r.channelPosPct >= 75 && r.channelPosPct <= 100);
    } else if (args.channelPos === "breakout") {
      rows = rows.filter((r) => r.channelPosPct != null && r.channelPosPct > 100);
    }
  }
  if (args?.minCauseWeeks != null && args.minCauseWeeks > 0) {
    rows = rows.filter((r) => (r.causeWeeks ?? 0) >= args.minCauseWeeks!);
  }
  if (args?.minRr1 != null && args.minRr1 > 0) {
    rows = rows.filter((r) => (r.rr1 ?? 0) >= args.minRr1!);
  }
  if (args?.onlyLeaders) {
    rows = rows.filter((r) => r.isLeaderITF === true || (r.isRsAboveMa49 && (r.rsScore ?? 0) > 0));
  }

  rows.sort((a, b) => b.confidence - a.confidence || (b.volume ?? 0) - (a.volume ?? 0));
  const limit = Math.min(args?.limit ?? 40, 80);
  rows = rows.slice(0, limit);

  return {
    rows,
    scanned: uniq.length,
    skipped,
    meta: buildMeta({
      source: quotesPack?.meta?.source ?? "vndirect+ohlcv",
      sourceTimestampMs: Date.now(),
      hasData: rows.length > 0,
      partial: skipped > 0,
      note: `Quét ${uniq.length} mã · đủ nến ${uniq.length - skipped} · Wyckoff heuristic (không phải tín hiệu GD)`,
    }),
  };
}
