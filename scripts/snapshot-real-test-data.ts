/**
 * Captures REAL historical market data snapshots from live public exchange APIs
 * (Binance, VNDIRECT dchart, Polymarket Gamma) into `src/lib/__tests__/fixtures/real-market-snapshot.json`.
 *
 * Canonical conventions enforced:
 * - OhlcvBar.time is ALWAYS epoch seconds (integer).
 * - VN stock prices are converted to full VND (never ambiguous thousand-VND).
 * - Zero synthetic/random data is ever generated.
 *
 * Usage: npx tsx scripts/snapshot-real-test-data.ts
 */

import fs from "node:fs";
import path from "node:path";
import type { OhlcvBar } from "../src/lib/types";

const OUT_PATH = path.resolve(
  process.cwd(),
  "src/lib/__tests__/fixtures/real-market-snapshot.json",
);

async function fetchJson<T>(
  url: string,
  timeoutMs = 8_000,
  extraHeaders?: Record<string, string>,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Orca-Financial/1.0",
        ...extraHeaders,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinanceBars(symbol: string, interval: string, limit = 180): Promise<OhlcvBar[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const raw = await fetchJson<unknown[][]>(url);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => ({
      time: Math.floor(Number(k[0]) / 1000), // canonical epoch seconds
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))
    .filter((b) => Number.isFinite(b.time) && b.close > 0);
}

async function fetchVnStockBars(symbol: string, days = 260): Promise<OhlcvBar[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;
  const candidates: Array<{ url: string; headers?: Record<string, string> }> = [
    {
      url: `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${symbol}&resolution=D&from=${from}&to=${to}`,
      headers: { Origin: "https://banggia.vps.com.vn", Referer: "https://banggia.vps.com.vn/" },
    },
    {
      url: `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${symbol}&from=${from}&to=${to}`,
      headers: { Origin: "https://dchart.vndirect.com.vn", Referer: "https://dchart.vndirect.com.vn/" },
    },
  ];

  type TvResp = {
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };

  for (const cand of candidates) {
    const raw = await fetchJson<TvResp>(cand.url, 8_000, cand.headers);
    if (!raw || raw.s !== "ok" || !Array.isArray(raw.t) || !Array.isArray(raw.c) || raw.t.length === 0) {
      continue;
    }
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < raw.t.length; i++) {
      const rawClose = Number(raw.c[i]);
      if (!Number.isFinite(rawClose) || rawClose <= 0) continue;
      // VPS & VNDIRECT return thousand-VND (< 500) -> normalize to full VND
      const mult = rawClose < 500 ? 1000 : 1;
      bars.push({
        time: Math.floor(Number(raw.t[i])),
        open: Math.round(Number(raw.o?.[i] ?? rawClose) * mult),
        high: Math.round(Number(raw.h?.[i] ?? rawClose) * mult),
        low: Math.round(Number(raw.l?.[i] ?? rawClose) * mult),
        close: Math.round(rawClose * mult),
        volume: Math.round(Number(raw.v?.[i] ?? 0)),
      });
    }
    if (bars.length > 0) return bars;
  }
  return [];
}

async function fetchPolymarketGamma(): Promise<unknown[]> {
  const url =
    "https://gamma-api.polymarket.com/markets?closed=false&active=true&order=volume24hr&ascending=false&limit=40";
  const raw = await fetchJson<unknown[]>(url);
  if (!Array.isArray(raw)) return [];
  // Keep only fields needed by parsePolymarketGammaMarkets to keep fixture compact
  return raw
    .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === "object"))
    .map((m) => ({
      id: m.id,
      question: m.question,
      outcomePrices: m.outcomePrices,
      volume24hr: m.volume24hr ?? m.volumeNum ?? m.volume ?? 0,
    }));
}

async function main() {
  console.log("[Snapshot] Fetching REAL market data from Binance, VNDIRECT, Polymarket...");
  const [btc15m, eth1h, fpt1d, vcb1d, hpg1d, polymarketRaw] = await Promise.all([
    fetchBinanceBars("BTCUSDT", "15m", 180),
    fetchBinanceBars("ETHUSDT", "1h", 180),
    fetchVnStockBars("FPT", 260),
    fetchVnStockBars("VCB", 260),
    fetchVnStockBars("HPG", 260),
    fetchPolymarketGamma(),
  ]);

  const snapshot = {
    schemaVersion: "1.0.0",
    capturedAt: new Date().toISOString(),
    timeUnit: "epoch_seconds",
    vnPriceUnit: "full_vnd",
    sources: {
      crypto: "Binance Public REST API (/api/v3/klines)",
      vnStocks: "VNDIRECT dchart Public API (/dchart/history)",
      predictionMarkets: "Polymarket Gamma Public API (/markets)",
    },
    bars: {
      BTCUSDT_15m: btc15m,
      ETHUSDT_1h: eth1h,
      FPT_1d: fpt1d,
      VCB_1d: vcb1d,
      HPG_1d: hpg1d,
    },
    polymarketRaw,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2), "utf8");

  console.log("[Snapshot] Saved:", OUT_PATH);
  console.log({
    BTCUSDT_15m: btc15m.length,
    ETHUSDT_1h: eth1h.length,
    FPT_1d: fpt1d.length,
    VCB_1d: vcb1d.length,
    HPG_1d: hpg1d.length,
    polymarketRaw: polymarketRaw.length,
  });
}

void main();
