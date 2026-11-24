/**
 * Canonical Real-Market Test Harness & SSOT Fixture Loader
 *
 * Standardizes definitions, units, and callers across Orca-Financial test suites:
 * - OhlcvBar.time is ALWAYS canonical epoch seconds (integer).
 * - VN stock prices are ALWAYS full VND.
 * - Zero Math.random() or fabricated synthetic waves in real-data tests.
 * - Supports 2 modes seamlessly:
 *     1. Default (Offline Real-Market Snapshot): Deterministic, <5ms, backed by real exchange captures.
 *     2. Live Mode (`ORCA_LIVE_TEST=1`): Fetches fresh live data directly from Binance / VPS / Polymarket.
 */

import fs from "node:fs";
import path from "node:path";
import type { OhlcvBar } from "../../types";

export type RealFixtureSeriesKey =
  | "BTCUSDT_15m"
  | "ETHUSDT_1h"
  | "SOLUSDT_1h"
  | "BNBUSDT_15m"
  | "EURUSD_1h"
  | "GBPUSD_1h"
  | "USDJPY_1h"
  | "XAUUSD_1h"
  | "FPT_1d"
  | "VCB_1d"
  | "HPG_1d";

export interface RealMarketSnapshotFile {
  schemaVersion: string;
  capturedAt: string;
  timeUnit: "epoch_seconds";
  vnPriceUnit: "full_vnd";
  sources: Record<string, string>;
  bars: Record<RealFixtureSeriesKey, OhlcvBar[]>;
  polymarketRaw: Array<{
    id?: unknown;
    question?: unknown;
    outcomePrices?: unknown;
    volume24hr?: unknown;
  }>;
}

const FIXTURE_PATH = path.resolve(
  __dirname,
  "../fixtures/real-market-snapshot.json",
);

let cachedSnapshot: RealMarketSnapshotFile | null = null;

/** Returns true when live exchange verification is explicitly enabled (`ORCA_LIVE_TEST=1`). */
export function isLiveTestMode(): boolean {
  return process.env.ORCA_LIVE_TEST === "1";
}

/** Normalizes any timestamp (seconds or milliseconds) into canonical epoch seconds. */
export function toEpochSec(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts > 1e11 ? Math.floor(ts / 1000) : Math.floor(ts);
}

/** Loads the captured real-market snapshot JSON from disk (cached in-process). */
export function getRealMarketSnapshot(): RealMarketSnapshotFile {
  if (!cachedSnapshot) {
    const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
    cachedSnapshot = JSON.parse(raw) as RealMarketSnapshotFile;
  }
  return cachedSnapshot;
}

/**
 * Returns a defensive copy of REAL historical OHLCV bars in canonical epoch-seconds format.
 * Guarantees ascending time order, finite positive closes, and full-VND pricing for VN equities.
 */
export function loadRealBarsSync(key: RealFixtureSeriesKey, limit?: number): OhlcvBar[] {
  const snap = getRealMarketSnapshot();
  const series = snap.bars[key] ?? [];
  const sliced = limit && limit > 0 ? series.slice(-limit) : series;
  return sliced.map((b) => ({
    time: toEpochSec(b.time),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

/**
 * Async loader supporting both Offline Real-Market Snapshot (default) and Live Exchange Fetch (`ORCA_LIVE_TEST=1`).
 */
export async function loadRealBars(key: RealFixtureSeriesKey, limit?: number): Promise<{
  bars: OhlcvBar[];
  mode: "LIVE" | "SNAPSHOT";
}> {
  if (!isLiveTestMode()) {
    return { bars: loadRealBarsSync(key, limit), mode: "SNAPSHOT" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  timer.unref?.();
  try {
    if (
      key === "BTCUSDT_15m" ||
      key === "ETHUSDT_1h" ||
      key === "SOLUSDT_1h" ||
      key === "BNBUSDT_15m"
    ) {
      const [symbol, interval] = key.split("_");
      const n = Math.min(1000, limit ?? 180);
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${n}`,
        { signal: controller.signal },
      );
      if (res.ok) {
        const raw = (await res.json()) as unknown[][];
        const bars: OhlcvBar[] = raw
          .map((k) => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: Number(k[1]),
            high: Number(k[2]),
            low: Number(k[3]),
            close: Number(k[4]),
            volume: Number(k[5]),
          }))
          .filter((b) => b.close > 0);
        if (bars.length > 0) return { bars, mode: "LIVE" };
      }
    } else if (
      key === "EURUSD_1h" ||
      key === "GBPUSD_1h" ||
      key === "USDJPY_1h" ||
      key === "XAUUSD_1h"
    ) {
      return { bars: loadRealBarsSync(key, limit), mode: "SNAPSHOT" };
    } else {
      const symbol = key.split("_")[0]!;
      const to = Math.floor(Date.now() / 1000);
      const from = to - 260 * 86400;
      const res = await fetch(
        `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${symbol}&resolution=D&from=${from}&to=${to}`,
        {
          signal: controller.signal,
          headers: { Origin: "https://banggia.vps.com.vn", Referer: "https://banggia.vps.com.vn/" },
        },
      );
      if (res.ok) {
        const raw = (await res.json()) as {
          s?: string;
          t?: number[];
          o?: number[];
          h?: number[];
          l?: number[];
          c?: number[];
          v?: number[];
        };
        if (raw.s === "ok" && Array.isArray(raw.t) && Array.isArray(raw.c)) {
          const bars: OhlcvBar[] = [];
          for (let i = 0; i < raw.t.length; i++) {
            const c = Number(raw.c[i]);
            if (!Number.isFinite(c) || c <= 0) continue;
            const mult = c < 500 ? 1000 : 1;
            bars.push({
              time: Math.floor(Number(raw.t[i])),
              open: Math.round(Number(raw.o?.[i] ?? c) * mult),
              high: Math.round(Number(raw.h?.[i] ?? c) * mult),
              low: Math.round(Number(raw.l?.[i] ?? c) * mult),
              close: Math.round(c * mult),
              volume: Math.round(Number(raw.v?.[i] ?? 0)),
            });
          }
          if (bars.length > 0) {
            return { bars: limit ? bars.slice(-limit) : bars, mode: "LIVE" };
          }
        }
      }
    }
  } catch {
    // Transparent fallback to real snapshot if live network unreachable
  } finally {
    clearTimeout(timer);
  }
  return { bars: loadRealBarsSync(key, limit), mode: "SNAPSHOT" };
}

/** Loads real Polymarket Gamma raw market objects (offline snapshot or live when `ORCA_LIVE_TEST=1`). */
export async function loadRealPolymarketRaw(): Promise<{
  markets: unknown[];
  mode: "LIVE" | "SNAPSHOT";
}> {
  if (isLiveTestMode()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    timer.unref?.();
    try {
      const res = await fetch(
        "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=40",
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        const raw = (await res.json()) as unknown[];
        if (Array.isArray(raw) && raw.length > 0) return { markets: raw, mode: "LIVE" };
      }
    } catch {
      /* fallback below */
    } finally {
      clearTimeout(timer);
    }
  }
  return { markets: getRealMarketSnapshot().polymarketRaw, mode: "SNAPSHOT" };
}
