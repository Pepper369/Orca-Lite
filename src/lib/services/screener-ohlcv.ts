import "server-only";
import { getVnOhlcv } from "./stocks-board";
import { getVndOhlcv, getVndIndexOhlcv, isVnIndexSymbol } from "../providers/vndirect";
import { fetchVndDchartHistory } from "../providers/vndirect-dchart";
import { getPublicOhlcv } from "../providers/public-vn-feed";
import { getVnOhlcv as getVnstockOhlcv } from "../providers/vnstock";
import { env } from "../env";
import { firstHealthy, raceHealthy } from "../data-engine/resilience";
import type { OhlcvBar } from "../types";

type OhlcvPack = Awaited<ReturnType<typeof getVnOhlcv>>;

// High-speed in-memory L1 cache with stale fallback to protect CF Workers budget
const screenerOhlcvL1 = new Map<string, { data: { bars: OhlcvBar[]; pack: OhlcvPack | null }; exp: number }>();
const OHLCV_L1_TTL_MS = 45_000;

/**
 * Shared OHLCV fetch for screeners — sequential first to cut CF Workers subrequest burn.
 * Prioritizes official VNStock API when configured, cascading to VNDirect Dchart, VNDirect OHLCV, and public feeds.
 * Includes short L1 memory cache and resilient stale fallback.
 */
export async function fetchOhlcvResilient(
  symbol: string,
  bars = 260,
): Promise<{ bars: OhlcvBar[]; pack: OhlcvPack | null }> {
  const sym = symbol.trim().toUpperCase();
  const cKey = `${sym}:${bars}`;
  const hitL1 = screenerOhlcvL1.get(cKey);

  if (hitL1 && Date.now() < hitL1.exp && hitL1.data.bars.length >= 20) {
    return hitL1.data;
  }

  const isIndex = isVnIndexSymbol(sym);

  const attempts: Array<{
    id: string;
    run: () => Promise<OhlcvBar[]>;
    accept: (v: OhlcvBar[]) => boolean;
  }> = [];

  // 1. Official Vnstock provider if configured
  if (env.vnstockApiKey && env.vnstockBaseUrl && !isIndex) {
    attempts.push({
      id: "vnstock-official",
      run: () => getVnstockOhlcv(sym, bars),
      accept: (v: OhlcvBar[]) => Array.isArray(v) && v.length >= 20,
    });
  }

  // 2. VNDirect Dchart (deepest history up to 2,000 bars)
  attempts.push({
    id: "vndirect-dchart",
    run: () => fetchVndDchartHistory(sym, "D", bars),
    accept: (v: OhlcvBar[]) => Array.isArray(v) && v.length >= 20,
  });

  // 3. VNDirect OHLCV API
  attempts.push({
    id: "vndirect-ohlcv",
    run: () => (isIndex ? getVndIndexOhlcv(sym, bars) : getVndOhlcv(sym, bars)),
    accept: (v: OhlcvBar[]) => Array.isArray(v) && v.length >= 20,
  });

  // 4. Public Vietnam Feed (VPS Tradingview + Entrade fallback)
  attempts.push({
    id: "entrade-public-ohlcv",
    run: () => getPublicOhlcv(sym, bars, isIndex ? "index" : "stock"),
    accept: (v: OhlcvBar[]) => Array.isArray(v) && v.length >= 20,
  });

  let result: { bars: OhlcvBar[]; pack: OhlcvPack | null } | null = null;

  // Sequential firstHealthy — fewer simultaneous subrequests than race (CF Error 1102).
  try {
    const hit = await firstHealthy(
      attempts.map((a) => ({
        id: a.id,
        run: async (_signal?: AbortSignal) => a.run(),
        accept: a.accept,
      })),
      { budgetMs: 8_000, perAttemptMs: 4_000, label: `screener-ohlcv:${sym}` },
    );
    result = {
      bars: hit.value,
      pack: { bars: hit.value, meta: { source: hit.sourceId, sourceTimestampMs: Date.now() } } as any,
    };
  } catch {
    try {
      const hit = await raceHealthy<OhlcvBar[]>(
        attempts.map((a) => ({
          id: a.id,
          run: async (_signal?: AbortSignal) => a.run(),
          accept: a.accept,
        })),
        { perAttemptMs: 3_500, label: `screener-ohlcv-race:${sym}` },
      );
      result = {
        bars: hit.value,
        pack: { bars: hit.value, meta: { source: hit.sourceId, sourceTimestampMs: Date.now() } } as any,
      };
    } catch {
      const pack = await getVnOhlcv(sym, bars).catch(() => null);
      if (pack?.bars?.length) {
        result = { bars: pack.bars, pack };
      }
    }
  }

  // Graceful degradation: Fallback to stale L1 cache if network fetch failed
  if (!result || result.bars.length < 20) {
    if (hitL1 && hitL1.data.bars.length >= 20) {
      return hitL1.data;
    }
    return { bars: result?.bars ?? [], pack: result?.pack ?? null };
  }

  // Cache fresh valid bars
  screenerOhlcvL1.set(cKey, { data: result, exp: Date.now() + OHLCV_L1_TTL_MS });
  return result;
}

/** Bounded concurrency map (same pattern used across screeners). */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}
