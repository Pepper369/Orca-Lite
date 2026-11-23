import "server-only";
import { eventBus } from "../events";
import type { OhlcvBar } from "../types";
import { getBiquotePublicQuotes, type BiquoteTick } from "../providers/forex";
import { isServerlessRuntime } from "./ws-policy";

/**
 * Shared Biquote public tick cache + poll loop (Workers-safe REST poll).
 * Core universe: FX majors · XAUUSD · XAGUSD · USOIL/UKOIL · USDVND
 */

export interface BiquoteLiveTick {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  high: number | null;
  low: number | null;
  dayDiffPercent: number | null;
  ts: number;
  marketState: string;
  source: "biquote-public";
}

export const BIQUOTE_CORE_SYMBOLS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "USDCHF",
  "AUDUSD",
  "USDCAD",
  "NZDUSD",
  "EURJPY",
  "GBPJPY",
  "USDVND",
  "XAUUSD",
  "XAGUSD",
  "USOIL",
  "UKOIL",
  "XPTUSD",
] as const;

const ALIASES: Record<string, string> = {
  OILUSD: "USOIL",
  WTIUSD: "USOIL",
  WTI: "USOIL",
  BRENT: "UKOIL",
  BRENTUSD: "UKOIL",
  GOLD: "XAUUSD",
  XAU: "XAUUSD",
  SILVER: "XAGUSD",
  XAG: "XAGUSD",
  PLATINUM: "XPTUSD",
  PALLADIUM: "XPDUSD",
};

const POLL_MS = 1_000;
const STALE_MS = 45_000;
const MAX_BATCH = 24;

const ticks = new Map<string, BiquoteLiveTick>();
const prevPrices = new Map<string, { price: number; ts: number; lastEmitAt: number }>();
const watchers = new Map<string, number>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight = false;
let started = false;
let corePinned = false;

function canon(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ALIASES[s] ?? s;
}

function toLive(t: BiquoteTick): BiquoteLiveTick {
  return {
    symbol: t.symbol,
    price: t.mid,
    bid: t.bid,
    ask: t.ask,
    high: t.high,
    low: t.low,
    dayDiffPercent: t.dayDiffPercent,
    ts: t.timestamp,
    marketState: t.marketState,
    source: "biquote-public",
  };
}

async function pollOnce(): Promise<void> {
  if (inflight) return;
  const symbols = [...new Set([...watchers.keys(), ...(corePinned ? BIQUOTE_CORE_SYMBOLS : [])])]
    .map(canon)
    .filter(Boolean)
    .slice(0, MAX_BATCH);
  if (!symbols.length) return;
  inflight = true;
  try {
    const { ticks: batch } = await getBiquotePublicQuotes(symbols);
    const now = Date.now();
    for (const [sym, t] of Object.entries(batch)) {
      const live = toLive(t);
      const prev = prevPrices.get(sym);
      if (!prev || now - prev.ts > 12_000) {
        prevPrices.set(sym, { price: live.price, ts: now, lastEmitAt: prev?.lastEmitAt ?? 0 });
      } else if (prev.price > 0) {
        const velPct = ((live.price - prev.price) / prev.price) * 100;
        const thresholdPct = sym.startsWith("XAU") ? 0.18 : 0.12;
        if (Math.abs(velPct) >= thresholdPct && now - prev.lastEmitAt >= 12_000) {
          prev.lastEmitAt = now;
          prev.price = live.price;
          prev.ts = now;
          eventBus.emit("quant:micro-breakout", {
            symbol: sym,
            assetType: "FOREX",
            price: live.price,
            velocityPct: Number(velPct.toFixed(3)),
            direction: velPct > 0 ? "BUY" : "SELL",
            ts: now,
          });
        }
      }
      ticks.set(sym, live);
      for (const [alias, target] of Object.entries(ALIASES)) {
        if (target === sym) ticks.set(alias, { ...live, symbol: alias });
      }
      eventBus.emit(`market-tick:${sym}`, {
        symbol: sym,
        price: live.price,
        cumVolume: 0,
        cumQuoteVolume: 0,
        ts: live.ts || now,
        source: "biquote",
        degraded: false,
      });
    }
  } catch {
    /* keep last known */
  } finally {
    inflight = false;
  }
}

function ensureLoop(): void {
  if (pollTimer) return;
  if (
    isServerlessRuntime() ||
    process.env.BIQUOTE_POLL_DISABLED === "true"
  ) {
    // Serverless (Vercel, Cloudflare Workers, Lambda): avoid persistent setInterval in serverless functions
    void pollOnce();
    return;
  }
  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_MS);
  pollTimer.unref?.();
  void pollOnce();
}

function stopLoopIfIdle(): void {
  if (watchers.size > 0 || corePinned) return;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function ensureBiquotePollStarted(): void {
  started = true;
  ensureLoop();
}

export function ensureBiquoteCoreWatch(): void {
  corePinned = true;
  for (const s of BIQUOTE_CORE_SYMBOLS) {
    watchers.set(s, Math.max(watchers.get(s) ?? 0, 1));
  }
  ensureBiquotePollStarted();
  ensureLoop();
}

export function watchBiquoteSymbol(symbol: string): () => void {
  const sym = canon(symbol);
  if (!sym) return () => {};
  watchers.set(sym, (watchers.get(sym) ?? 0) + 1);
  ensureBiquotePollStarted();
  ensureLoop();
  return () => {
    const n = (watchers.get(sym) ?? 1) - 1;
    if (n <= 0) {
      if (!corePinned || !(BIQUOTE_CORE_SYMBOLS as readonly string[]).includes(sym)) {
        watchers.delete(sym);
      } else {
        watchers.set(sym, 1);
      }
    } else watchers.set(sym, n);
    stopLoopIfIdle();
  };
}

export function getBiquoteLiveTick(symbol: string, maxAgeMs = STALE_MS): BiquoteLiveTick | null {
  const sym = canon(symbol);
  const t = ticks.get(sym) ?? ticks.get(symbol.toUpperCase());
  if (!t) return null;
  if (Date.now() - t.ts > maxAgeMs) return null;
  return t;
}

export function getBiquoteLiveTickAny(symbol: string): BiquoteLiveTick | null {
  const sym = canon(symbol);
  return ticks.get(sym) ?? ticks.get(symbol.toUpperCase()) ?? null;
}

/**
 * Ingests sub-second live tick telemetry directly from the MT5 EA broker bridge.
 * Prioritizes actual broker spot prices over 10-15 minute delayed Yahoo Finance quotes.
 */
export function registerBrokerLiveTick(
  symbol: string,
  bid: number,
  ask: number,
  source: string = "mt5-ea-bridge",
): void {
  if (!symbol || !Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return;
  const sym = canon(symbol);
  const mid = (bid + ask) / 2;
  const existing = ticks.get(sym);
  ticks.set(sym, {
    symbol: sym,
    price: mid,
    bid,
    ask,
    high: existing?.high != null ? Math.max(existing.high, ask) : ask,
    low: existing?.low != null ? Math.min(existing.low, bid) : bid,
    dayDiffPercent: existing?.dayDiffPercent ?? 0,
    ts: Date.now(),
    marketState: "regular",
    source: "biquote-public",
  });
}

/**
 * Merges the latest real-time Biquote tick into an OHLCV series so the forming candle
 * reflects sub-second bid/ask mid price and high/low extremes without 15-45s REST lag.
 */
export function mergeBarsWithBiquoteLiveTick(
  bars: OhlcvBar[],
  symbol: string,
  intervalSec = 900,
): OhlcvBar[] {
  if (!Array.isArray(bars) || bars.length === 0) return bars;
  const tick = getBiquoteLiveTick(symbol, STALE_MS) ?? getBiquoteLiveTickAny(symbol);
  if (!tick || !Number.isFinite(tick.price) || tick.price <= 0) return bars;

  let out = bars.slice();
  const lastIdx = out.length - 1;
  const last = out[lastIdx]!;

  // Basis-alignment guard: if OHLCV came from Yahoo Futures (e.g. GC=F @ 3515.4 vs Spot XAUUSD @ 3539.14),
  // parallel-shift the entire series into the Spot coordinate system so entry/SL/TP match Spot markPrice.
  const recentSlice = out.slice(-14);
  const avgBarRange =
    recentSlice.reduce((s, b) => s + Math.max(0, b.high - b.low), 0) / Math.max(1, recentSlice.length);
  const basisDelta = tick.price - last.close;
  if (avgBarRange > 0 && Math.abs(basisDelta) > avgBarRange * 1.25) {
    out = out.map((b) => ({
      ...b,
      open: b.open + basisDelta,
      high: b.high + basisDelta,
      low: b.low + basisDelta,
      close: b.close + basisDelta,
    }));
  }

  const shiftedLast = out[lastIdx]!;
  if (tick.marketState === "closed") {
    return out;
  }

  const isMs = shiftedLast.time > 1e11;
  const bucketSize = isMs ? intervalSec * 1000 : intervalSec;
  const tickTimeUnit = isMs ? tick.ts : Math.floor(tick.ts / 1000);
  const currentBucket = Math.floor(tickTimeUnit / bucketSize) * bucketSize;

  if (currentBucket > shiftedLast.time && currentBucket - shiftedLast.time <= bucketSize * 4) {
    out.push({
      time: currentBucket,
      open: shiftedLast.close,
      high: Math.max(shiftedLast.close, tick.price),
      low: Math.min(shiftedLast.close, tick.price),
      close: tick.price,
      volume: shiftedLast.volume,
    });
  } else {
    out[lastIdx] = {
      ...shiftedLast,
      high: Math.max(shiftedLast.high, tick.price),
      low: Math.min(shiftedLast.low, tick.price),
      close: tick.price,
    };
  }
  return out;
}

export function getBiquoteLiveAll(maxAgeMs = STALE_MS): BiquoteLiveTick[] {
  const now = Date.now();
  const out: BiquoteLiveTick[] = [];
  for (const t of ticks.values()) {
    if (now - t.ts <= maxAgeMs) out.push(t);
  }
  const seen = new Set<string>();
  return out.filter((t) => {
    if (seen.has(t.symbol)) return false;
    seen.add(t.symbol);
    return true;
  });
}

export function biquoteWatchedSymbols(): string[] {
  return [...watchers.keys()];
}

export function isBiquotePollActive(): boolean {
  return started && pollTimer != null;
}
