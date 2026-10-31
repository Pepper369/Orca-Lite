import { batchVnOhlcv, SCREENER_UNIVERSE_CAP } from "./ohlcv-batch";
import { defaultTechnicalUniverse } from "../vn/vn100";
import { getVnQuotes, getVnOhlcv } from "./stocks";
import { getVpsBatchForeignFlow } from "../providers/vps";
import { buildMeta } from "../freshness";
import { WORKERS_BUDGET } from "../data-engine/workers-budget";
import type { Meta, Quote } from "../types";
import {
  analyzeMaCandleRow,
  type MaCandleScenario,
  type MaCandleConfluenceRow,
  type AnalyzeMaCandleExtra,
} from "../engines/ma-candle-confluence";

export type { MaCandleScenario, MaCandleConfluenceRow, AnalyzeMaCandleExtra };
export { analyzeMaCandleRow };

export interface MaCandleScreenResult {
  rows: MaCandleConfluenceRow[];
  scanned: number;
  skipped: number;
  meta: Meta;
}

export interface MaCandleScreenOpts {
  symbols?: string[];
  scenario?: string;
  sector?: string;
  minScore?: number;
  qualityOnly?: "A+" | "A" | "all";
  volumeOnly?: boolean;
  foreignOnly?: boolean;
  leaderOnly?: boolean;
  limit?: number;
}

export async function screenMaCandleConfluence(
  opts: MaCandleScreenOpts = {},
): Promise<MaCandleScreenResult> {
  const universe = (opts.symbols?.length ? opts.symbols : defaultTechnicalUniverse(SCREENER_UNIVERSE_CAP))
    .map((s) => s.toUpperCase())
    .filter(Boolean)
    .slice(0, SCREENER_UNIVERSE_CAP);

  const minScore = opts.minScore ?? 60;
  const limit = Math.min(opts.limit ?? 40, 80);
  const targetScenario = opts.scenario?.toUpperCase();

  // Multi-source parallel hydration:
  // 1. Technical OHLCV batches for screened universe
  // 2. Realtime quote prices & changes
  // 3. VPS Realtime Foreign Flow batch (fBVol, fSVolume, netValue)
  // 4. Benchmark index OHLCV (VNINDEX) for Relative Strength (RS) leadership analysis
  const [ohlcvMap, quotesPack, foreignMap, indexPack] = await Promise.all([
    batchVnOhlcv(universe, {
      bars: Math.max(60, Math.min(90, WORKERS_BUDGET.screenerBars)),
      concurrency: WORKERS_BUDGET.ohlcvBatchConcurrency,
      perSymbolMs: WORKERS_BUDGET.ohlcvPerSymbolMs,
      deadlineMs: WORKERS_BUDGET.techScreenWallMs,
      resilient: true,
    }),
    getVnQuotes(universe).catch(() => null),
    getVpsBatchForeignFlow(universe).catch(() => new Map()),
    getVnOhlcv("VNINDEX", 60, "index").catch(() => null),
  ]);

  const quoteBy = new Map<string, Quote>((quotesPack?.quotes ?? []).map((q) => [q.symbol.toUpperCase(), q]));
  const indexBars = indexPack?.bars ?? null;

  const rows: MaCandleConfluenceRow[] = [];
  let skipped = 0;

  for (const sym of universe) {
    const pack = ohlcvMap.get(sym);
    if (!pack?.bars || pack.bars.length < 25) {
      skipped++;
      continue;
    }
    const q = quoteBy.get(sym);
    const foreign = foreignMap.get(sym) ?? null;

    const row = analyzeMaCandleRow(sym, pack.bars, q, {
      foreign,
      indexBars,
    });
    if (!row) continue;

    if (targetScenario && targetScenario !== "ALL" && row.scenario !== targetScenario) continue;
    if (opts.sector && row.sector !== opts.sector) continue;
    if (row.confluenceScore < minScore) continue;
    if (opts.qualityOnly === "A+" && row.setupQuality !== "A+") continue;
    if (opts.qualityOnly === "A" && row.setupQuality !== "A+" && row.setupQuality !== "A") continue;
    if (opts.volumeOnly && !(row.volRatio && row.volRatio >= 1.15)) continue;
    if (opts.foreignOnly && !row.foreignAccumulating) continue;
    if (opts.leaderOnly && !row.isMarketLeader) continue;

    rows.push(row);
  }

  rows.sort((a, b) => {
    if (a.alertWorthy !== b.alertWorthy) return a.alertWorthy ? -1 : 1;
    if (a.patternAgeBars !== b.patternAgeBars) return a.patternAgeBars - b.patternAgeBars;
    return b.confluenceScore - a.confluenceScore;
  });

  return {
    rows: rows.slice(0, limit),
    scanned: universe.length,
    skipped,
    meta: buildMeta({
      source: "ma-candle-confluence-engine (OHLCV + VPS Foreign Flow + VN-Index RS)",
      sourceTimestampMs: Date.now(),
      note: `Hợp lưu Đa Nguồn (MA Hỗ Trợ + Nến Đảo Chiều + Khối Ngoại + RS Leader) · minScore≥${minScore} · ${targetScenario || "ALL"}`,
      hasData: rows.length > 0,
      partial: skipped > 0,
    }),
  };
}
