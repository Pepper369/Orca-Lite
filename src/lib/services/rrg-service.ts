import "server-only";

import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getVnOhlcv } from "./stocks-board";
import { batchVnOhlcv } from "./ohlcv-batch";
import {
  VN_ICB_SECTORS,
  computeRrgTrail,
  determineQuadrant,
  type RrgItem,
  type RrgResult,
  type RrgQuadrant,
} from "../engines/rrg-engine";
import { BOOTSTRAP_VN30_QUOTES } from "../bootstrap-data";
import type { Meta } from "../types";

const TTL_MS = 120_000; // 2 mins cache
const STALE_MS = 300_000;

export async function getRrgData(
  mode: "sectors" | "vn30" = "sectors",
  trailLength = 5
): Promise<{ data: RrgResult; meta: Meta }> {
  const cacheKey = `market:rrg:${mode}:${trailLength}`;

  const res = await cached(cacheKey, {
    ttlMs: TTL_MS,
    staleMs: STALE_MS,
    producer: async (): Promise<RrgResult> => {
      // 1. Lấy dữ liệu nến thật của Benchmark (VNINDEX) — không sinh nến giả khi thiếu nguồn
      const benchmarkPack = await getVnOhlcv("VNINDEX", 60, "index");
      const benchmarkBars = benchmarkPack?.bars || [];

      if (benchmarkBars.length < 20) {
        return {
          benchmark: "VNINDEX",
          asOfDate: new Date().toISOString().split("T")[0],
          items: [],
          summary: {
            leadingCount: 0,
            weakeningCount: 0,
            laggingCount: 0,
            improvingCount: 0,
          },
        };
      }

      const benchDates: string[] = [];
      const benchCloses: number[] = [];
      for (const b of benchmarkBars) {
        benchDates.push(new Date(b.time).toISOString().split("T")[0]);
        benchCloses.push(b.close);
      }

      const items: RrgItem[] = [];

      if (mode === "sectors") {
        // Tổng hợp chỉ số bình quân gia quyền đều (base 100) của top 3 cổ phiếu trụ cột mỗi ngành ICB
        const targetSectorSymbols = Array.from(
          new Set(VN_ICB_SECTORS.flatMap((s) => s.symbols.slice(0, 3))),
        );
        const ohlcvMap = await batchVnOhlcv(targetSectorSymbols, {
          bars: benchCloses.length,
          perSymbolMs: 3000,
        });

        for (const sector of VN_ICB_SECTORS) {
          const memberSeries: number[][] = [];
          for (const sym of sector.symbols.slice(0, 3)) {
            const bars = ohlcvMap.get(sym)?.bars;
            if (bars && bars.length >= 15) {
              memberSeries.push(bars.map((b) => b.close));
            }
          }
          if (memberSeries.length === 0) continue;

          const commonLen = Math.min(benchCloses.length, ...memberSeries.map((s) => s.length));
          if (commonLen < 15) continue;

          const trimmed = memberSeries.map((s) => s.slice(-commonLen));
          const targetPrices: number[] = [];
          for (let idx = 0; idx < commonLen; idx++) {
            let relSum = 0;
            let count = 0;
            for (const s of trimmed) {
              const base = s[0] ?? 0;
              if (base > 0) {
                relSum += (s[idx]! / base) * 100;
                count++;
              }
            }
            targetPrices.push(count > 0 ? relSum / count : 100);
          }

          const alignedBench = benchCloses.slice(-commonLen);
          const alignedDates = benchDates.slice(-commonLen);
          const trail = computeRrgTrail(targetPrices, alignedBench, alignedDates, trailLength);
          if (!trail.length) continue;

          const latest = trail[trail.length - 1];
          const firstInTrail = trail[0];
          const change5d = Math.round(((latest.rsRatio - firstInTrail.rsRatio) / firstInTrail.rsRatio) * 10000) / 100;
          const quadrant = determineQuadrant(latest.rsRatio, latest.rsMomentum);

          items.push({
            id: sector.code,
            code: sector.code,
            name: sector.name,
            currentRsRatio: latest.rsRatio,
            currentRsMomentum: latest.rsMomentum,
            quadrant,
            change5dPct: change5d,
            trail,
          });
        }
      } else {
        // Mode VN30
        const vn30Symbols = BOOTSTRAP_VN30_QUOTES.slice(0, 24).map((q) => q.symbol);
        const ohlcvMap = await batchVnOhlcv(vn30Symbols, {
          bars: benchCloses.length,
          perSymbolMs: 2500,
        });

        for (const sym of vn30Symbols) {
          const pack = ohlcvMap.get(sym);
          const bars = pack?.bars || [];
          if (bars.length < 15) continue;

          const quote = BOOTSTRAP_VN30_QUOTES.find((q) => q.symbol === sym);
          const targetPrices = bars.map((b) => b.close);
          const trail = computeRrgTrail(targetPrices, benchCloses, benchDates, trailLength);
          if (!trail.length) continue;

          const latest = trail[trail.length - 1];
          const firstInTrail = trail[0];
          const change5d = Math.round(((latest.rsRatio - firstInTrail.rsRatio) / firstInTrail.rsRatio) * 10000) / 100;
          const quadrant = determineQuadrant(latest.rsRatio, latest.rsMomentum);

          items.push({
            id: sym,
            code: sym,
            name: quote?.name || sym,
            currentRsRatio: latest.rsRatio,
            currentRsMomentum: latest.rsMomentum,
            quadrant,
            change5dPct: change5d,
            trail,
          });
        }
      }

      // Đếm số lượng theo 4 quadrant
      const summary = {
        leadingCount: items.filter((i) => i.quadrant === "LEADING").length,
        weakeningCount: items.filter((i) => i.quadrant === "WEAKENING").length,
        laggingCount: items.filter((i) => i.quadrant === "LAGGING").length,
        improvingCount: items.filter((i) => i.quadrant === "IMPROVING").length,
      };

      return {
        benchmark: "VNINDEX",
        asOfDate: benchDates[benchDates.length - 1] || new Date().toISOString().split("T")[0],
        items,
        summary,
      };
    },
  });

  const meta = buildMeta({
    source: "rrg-engine",
    sourceTimestampMs: Date.now(),
    cached: res.cached,
    stale: res.stale,
    note: `Relative Rotation Graph (RRG) mode=${mode} so với VN-Index.`,
  });

  return { data: res.value, meta };
}
