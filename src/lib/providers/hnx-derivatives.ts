import "server-only";
import { httpJson } from "../http";
import { ProviderError } from "./binance";
import { ssiFcConfigured, getSsiAccessToken, ssiToday } from "./ssi-fcdata";
import type { DerivativeQuote, OhlcvBar } from "../types";

/**
 * HNX derivatives market-data adapter (P0).
 *
 * Priority:
 *  1) SSI FastConnect Data with market=DER (when SSI credentials configured)
 *  2) Optional third-party feed via DERIVATIVES_QUOTE_URL (server-side only)
 *
 * Never invents prices. Callers must treat null quotes as UNAVAILABLE.
 */

export const HNX_DERIVATIVES = "hnx-derivatives";

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(String(v).replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

type SsiEnvelope<T> = {
  status?: number | string;
  message?: string;
  data?: T;
  totalRecord?: number;
};

type SsiPriceRow = Record<string, unknown>;

function mapRowToQuote(symbol: string, r: SsiPriceRow, source: string): DerivativeQuote | null {
  const last =
    num(r.Close) ??
    num(r.close) ??
    num(r.LastPrice) ??
    num(r.lastPrice) ??
    num(r.Last) ??
    num(r.last) ??
    num(r.Price) ??
    num(r.price);
  if (last == null || last <= 0) return null;

  const open = num(r.Open) ?? num(r.open);
  const high = num(r.High) ?? num(r.high);
  const low = num(r.Low) ?? num(r.low);
  const volume =
    num(r.Volume) ??
    num(r.volume) ??
    num(r.TotalMatchVolume) ??
    num(r.MatchVolume) ??
    num(r.matchVolume);
  const openInterest =
    num(r.OpenInterest) ?? num(r.openInterest) ?? num(r.OI) ?? num(r.oi) ?? num(r.Open_Interest);
  const change = num(r.Change) ?? num(r.change) ?? num(r.PriceChange);
  const changePercent =
    num(r.PerChange) ??
    num(r.perChange) ??
    num(r.ChangePercent) ??
    num(r.changePercent) ??
    num(r.PercentPriceChange);
  const ref = num(r.RefPrice) ?? num(r.ReferencePrice) ?? num(r.referencePrice);
  const ceiling = num(r.CeilingPrice) ?? num(r.ceilingPrice);
  const floor = num(r.FloorPrice) ?? num(r.floorPrice);

  let tradingDate = r.TradingDate ?? r.tradingDate ?? r.Time ?? r.time;
  let updatedAt: string | null = null;
  if (typeof tradingDate === "string" && tradingDate) {
    const m = tradingDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      updatedAt = new Date(
        `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T15:00:00+07:00`,
      ).toISOString();
    } else {
      const t = Date.parse(tradingDate);
      if (Number.isFinite(t)) updatedAt = new Date(t).toISOString();
    }
  }

  return {
    symbol: symbol.toUpperCase(),
    last,
    change,
    changePercent,
    open,
    high,
    low,
    volume,
    openInterest,
    settlement: num(r.SettlementPrice) ?? num(r.settlementPrice),
    mark: null,
    ceiling,
    floor,
    reference: ref,
    updatedAt,
    source,
  };
}

async function ssiGet<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const token = await getSsiAccessToken();
  const base = (process.env.SSI_FC_DATA_BASE_URL ?? "https://fc-data.ssi.com.vn").replace(/\/$/, "");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    qs.set(k, String(v));
  }
  const url = `${base}${path}?${qs.toString()}`;
  const res = await httpJson<T>(url, {
    provider: "ssi-fcdata",
    timeoutMs: 10_000,
    retries: 1,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok || res.data == null) {
    throw new ProviderError(`ssi-der: ${res.error ?? `HTTP ${res.status}`}`, HNX_DERIVATIVES);
  }
  return res.data;
}

/**
 * Fetch daily price row for a DER symbol via SSI FastConnect (when configured).
 */
export async function fetchSsiDerivativeQuote(symbol: string): Promise<DerivativeQuote | null> {
  if (!ssiFcConfigured()) return null;
  const sym = symbol.toUpperCase();
  const today = ssiToday();
  try {
    const body = await ssiGet<SsiEnvelope<SsiPriceRow[]>>("/api/v2/Market/DailyStockPrice", {
      Symbol: sym,
      symbol: sym,
      FromDate: today,
      fromDate: today,
      ToDate: today,
      toDate: today,
      PageIndex: 1,
      pageIndex: 1,
      PageSize: 10,
      pageSize: 10,
      Market: "DER",
      market: "DER",
    });
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const r of rows) {
      const q = mapRowToQuote(sym, r, "ssi-fcdata");
      if (q) return q;
    }
  } catch {
    /* try DailyOhlc as secondary */
  }

  try {
    const body = await ssiGet<SsiEnvelope<SsiPriceRow[]>>("/api/v2/Market/DailyOhlc", {
      Symbol: sym,
      symbol: sym,
      FromDate: today,
      fromDate: today,
      ToDate: today,
      toDate: today,
      PageIndex: 1,
      pageIndex: 1,
      PageSize: 5,
      pageSize: 5,
    });
    const rows = Array.isArray(body.data) ? body.data : [];
    for (const r of rows) {
      const q = mapRowToQuote(sym, r, "ssi-fcdata");
      if (q) return q;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Dchart public VN Derivatives feed (VNDirect)
 * Live, không cần API key, hỗ trợ VN30F1M, VN30F2M, VN30F1Q, VN30F2Q
 */
export async function fetchVndirectDerivativeOhlcv(
  symbol: string,
  days = 60,
): Promise<OhlcvBar[]> {
  const sym = symbol.toUpperCase();
  const limit = Math.min(Math.max(days, 5), 250);
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - limit * 86_400 * 2;
  const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${encodeURIComponent(sym)}&from=${fromSec}&to=${nowSec}`;

  try {
    const res = await httpJson<{
      s?: string;
      t?: number[];
      c?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      v?: number[];
    }>(url, {
      provider: "vndirect-dchart",
      timeoutMs: 8_000,
      retries: 2,
    });

    if (!res.ok || !res.data || !Array.isArray(res.data.t) || !res.data.t.length) {
      return [];
    }

    const { t, c, o, h, l, v } = res.data;
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < t.length; i++) {
      const time = t[i] * 1000;
      const close = c?.[i];
      const open = o?.[i] ?? close;
      const high = h?.[i] ?? close;
      const low = l?.[i] ?? close;
      const volume = v?.[i] ?? 0;
      if (time > 0 && close != null && close > 0) {
        bars.push({
          time,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume),
        });
      }
    }
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-limit);
  } catch {
    return [];
  }
}

export async function fetchVndirectDerivativeQuote(symbol: string): Promise<DerivativeQuote | null> {
  const sym = symbol.toUpperCase();
  // Với mã hàng hóa quốc tế, thử Yahoo
  if (sym.includes("=F")) {
    try {
      const { getYahooQuote } = await import("./yahoo");
      const yq = await getYahooQuote(sym);
      if (yq && Number(yq.price) > 0) {
        return {
          symbol: sym,
          last: Number(yq.price),
          change: yq.change != null ? Number(yq.change) : null,
          changePercent: yq.changePercent != null ? Number(yq.changePercent) : null,
          open: null,
          high: yq.dayHigh != null ? Number(yq.dayHigh) : null,
          low: yq.dayLow != null ? Number(yq.dayLow) : null,
          volume: null,
          openInterest: null,
          settlement: null,
          mark: null,
          ceiling: null,
          floor: null,
          reference: yq.previousClose != null ? Number(yq.previousClose) : null,
          updatedAt: yq.marketTime ? new Date(yq.marketTime * 1000).toISOString() : new Date().toISOString(),
          source: "yahoo-commodities",
        };
      }
    } catch {
      /* continue */
    }
  }

  // Với hợp đồng phái sinh VN30 / VN
  const bars = await fetchVndirectDerivativeOhlcv(sym, 5);
  if (!bars.length) return null;
  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null;

  const last = lastBar.close;
  const prevClose = prevBar ? prevBar.close : lastBar.open;
  const change = Math.round((last - prevClose) * 100) / 100;
  const changePercent = prevClose > 0 ? Math.round(((last - prevClose) / prevClose) * 10000) / 100 : 0;

  return {
    symbol: sym,
    last,
    change,
    changePercent,
    open: lastBar.open,
    high: lastBar.high,
    low: lastBar.low,
    volume: lastBar.volume,
    openInterest: null,
    settlement: last,
    mark: last,
    ceiling: Math.round(prevClose * 1.07 * 10) / 10,
    floor: Math.round(prevClose * 0.93 * 10) / 10,
    reference: prevClose,
    updatedAt: new Date(lastBar.time).toISOString(),
    source: "vndirect-dchart",
  };
}

/**
 * Optional generic JSON quote endpoint:
 *   DERIVATIVES_QUOTE_URL=https://…/quotes?symbol={symbol}
 */
export async function fetchExternalDerivativeQuote(symbol: string): Promise<DerivativeQuote | null> {
  const template = process.env.DERIVATIVES_QUOTE_URL?.trim();
  if (!template) return null;
  const sym = symbol.toUpperCase();
  const url = template.includes("{symbol}")
    ? template.replaceAll("{symbol}", encodeURIComponent(sym))
    : `${template}${template.includes("?") ? "&" : "?"}symbol=${encodeURIComponent(sym)}`;
  const res = await httpJson<Record<string, unknown>>(url, {
    provider: HNX_DERIVATIVES,
    timeoutMs: 8_000,
    retries: 1,
    headers: process.env.DERIVATIVES_QUOTE_API_KEY
      ? { Authorization: `Bearer ${process.env.DERIVATIVES_QUOTE_API_KEY}` }
      : undefined,
  });
  if (!res.ok || res.data == null) return null;
  const raw = (res.data.data as Record<string, unknown> | undefined) ?? res.data;
  return mapRowToQuote(sym, raw, "derivatives-quote-url");
}

/**
 * Entrade DNSE public derivative feed (Zero-Key).
 * Hỗ trợ VN30F1M, VN30F2M, VN30F1Q, VN30F2Q.
 */
export async function fetchEntradeDerivativeQuote(symbol: string): Promise<DerivativeQuote | null> {
  const sym = symbol.toUpperCase();
  if (sym.includes("=F")) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - 86_400 * 5;
  const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/derivative?symbol=${encodeURIComponent(sym)}&resolution=1&from=${fromSec}&to=${nowSec}`;

  try {
    const res = await httpJson<{
      t?: number[];
      c?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      v?: number[];
    }>(url, {
      provider: "entrade-derivatives",
      timeoutMs: 6_000,
      retries: 1,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.ok && res.data && Array.isArray(res.data.t) && res.data.t.length) {
      const { t, c, o, h, l, v } = res.data;
      const len = t.length;
      const last = Number(c?.[len - 1]) || 0;
      if (last > 0) {
        const first = Number(o?.[0]) || last;
        const prevClose = Number(c?.[0]) || first;
        const high = Math.max(...(h ?? [last]));
        const low = Math.min(...(l ?? [last]));
        const volume = (v ?? []).reduce((acc, val) => acc + (Number(val) || 0), 0);
        const change = Math.round((last - prevClose) * 10) / 10;
        const changePercent = prevClose > 0 ? Math.round(((last - prevClose) / prevClose) * 10000) / 100 : 0;
        const updatedAt = new Date(t[len - 1] * 1000).toISOString();

        return {
          symbol: sym,
          last,
          change,
          changePercent,
          open: Number(o?.[len - 1]) || first,
          high,
          low,
          volume,
          openInterest: null,
          settlement: last,
          mark: last,
          ceiling: Math.round(prevClose * 1.07 * 10) / 10,
          floor: Math.round(prevClose * 0.93 * 10) / 10,
          reference: prevClose,
          updatedAt,
          source: "entrade-public",
        };
      }
    }
  } catch {
    /* fallback */
  }

  // Fallback sang resolution 1D
  try {
    const dayUrl = `https://services.entrade.com.vn/chart-api/v2/ohlcs/derivative?symbol=${encodeURIComponent(sym)}&resolution=1D&from=${nowSec - 86_400 * 30}&to=${nowSec}`;
    const dayRes = await httpJson<{
      t?: number[];
      c?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      v?: number[];
    }>(dayUrl, {
      provider: "entrade-derivatives",
      timeoutMs: 6_000,
      retries: 1,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (dayRes.ok && dayRes.data && Array.isArray(dayRes.data.t) && dayRes.data.t.length) {
      const { t, c, o, h, l, v } = dayRes.data;
      const len = t.length;
      const last = Number(c?.[len - 1]) || 0;
      const prevClose = len >= 2 ? Number(c?.[len - 2]) || last : last;
      const change = Math.round((last - prevClose) * 10) / 10;
      const changePercent = prevClose > 0 ? Math.round(((last - prevClose) / prevClose) * 10000) / 100 : 0;

      return {
        symbol: sym,
        last,
        change,
        changePercent,
        open: Number(o?.[len - 1]) || last,
        high: Number(h?.[len - 1]) || last,
        low: Number(l?.[len - 1]) || last,
        volume: Number(v?.[len - 1]) || 0,
        openInterest: null,
        settlement: last,
        mark: last,
        ceiling: Math.round(prevClose * 1.07 * 10) / 10,
        floor: Math.round(prevClose * 0.93 * 10) / 10,
        reference: prevClose,
        updatedAt: new Date(t[len - 1] * 1000).toISOString(),
        source: "entrade-public-1d",
      };
    }
  } catch {
    /* continue */
  }

  return null;
}

export async function fetchEntradeDerivativeOhlcv(
  symbol: string,
  days = 60
): Promise<OhlcvBar[]> {
  const sym = symbol.toUpperCase();
  if (sym.includes("=F")) return [];

  const limit = Math.min(Math.max(days, 5), 250);
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - limit * 86_400 * 2;
  const url = `https://services.entrade.com.vn/chart-api/v2/ohlcs/derivative?symbol=${encodeURIComponent(sym)}&resolution=1D&from=${fromSec}&to=${nowSec}`;

  try {
    const res = await httpJson<{
      t?: number[];
      c?: number[];
      o?: number[];
      h?: number[];
      l?: number[];
      v?: number[];
    }>(url, {
      provider: "entrade-derivatives",
      timeoutMs: 8_000,
      retries: 2,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok || !res.data || !Array.isArray(res.data.t) || !res.data.t.length) {
      return [];
    }

    const { t, c, o, h, l, v } = res.data;
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < t.length; i++) {
      const time = t[i] * 1000;
      const close = c?.[i];
      const open = o?.[i] ?? close;
      const high = h?.[i] ?? close;
      const low = l?.[i] ?? close;
      const volume = v?.[i] ?? 0;
      if (time > 0 && close != null && close > 0) {
        bars.push({
          time,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume),
        });
      }
    }
    bars.sort((a, b) => a.time - b.time);
    return bars.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Best-effort quote: SSI DER → external URL → Entrade Zero-key Public → VNDirect Dchart / Yahoo → null.
 */
export async function getDerivativeMarketQuote(symbol: string): Promise<DerivativeQuote | null> {
  const sym = symbol.toUpperCase();
  try {
    const ssi = await fetchSsiDerivativeQuote(sym);
    if (ssi) return ssi;
  } catch {
    /* continue */
  }
  try {
    const ext = await fetchExternalDerivativeQuote(sym);
    if (ext) return ext;
  } catch {
    /* continue */
  }
  try {
    const ent = await fetchEntradeDerivativeQuote(sym);
    if (ent) return ent;
  } catch {
    /* continue */
  }
  try {
    const vnd = await fetchVndirectDerivativeQuote(sym);
    if (vnd) return vnd;
  } catch {
    /* continue */
  }
  return null;
}


export async function getDerivativeMarketQuotes(
  symbols: string[],
): Promise<Map<string, DerivativeQuote>> {
  const out = new Map<string, DerivativeQuote>();
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  await Promise.all(
    uniq.map(async (sym) => {
      try {
        const q = await getDerivativeMarketQuote(sym);
        if (q) out.set(sym, q);
      } catch {
        /* skip */
      }
    }),
  );
  return out;
}

export function derivativesLiveConfigured(): boolean {
  return true;
}

function daysAgoSsiLocal(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

function parseSsiBarDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const t = Date.parse(
      `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T15:00:00+07:00`,
    );
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

/**
 * Daily OHLCV for a derivative symbol (P1).
 * SSI DailyOhlc when configured; optional DERIVATIVES_OHLCV_URL.
 */
export async function fetchDerivativeOhlcv(
  symbol: string,
  days = 60,
): Promise<OhlcvBar[]> {
  const sym = symbol.toUpperCase();
  const limit = Math.min(Math.max(days, 5), 250);

  if (ssiFcConfigured()) {
    try {
      const body = await ssiGet<SsiEnvelope<SsiPriceRow[]>>("/api/v2/Market/DailyOhlc", {
        Symbol: sym,
        symbol: sym,
        FromDate: daysAgoSsiLocal(limit + 5),
        fromDate: daysAgoSsiLocal(limit + 5),
        ToDate: ssiToday(),
        toDate: ssiToday(),
        PageIndex: 1,
        pageIndex: 1,
        PageSize: Math.min(limit, 1000),
        pageSize: Math.min(limit, 1000),
        ascending: true,
      });
      const rows = Array.isArray(body.data) ? body.data : [];
      const bars: OhlcvBar[] = [];
      for (const r of rows) {
        const time = parseSsiBarDate(
          String(r.TradingDate ?? r.tradingDate ?? r.Time ?? r.time ?? ""),
        );
        const open = num(r.Open ?? r.open);
        const high = num(r.High ?? r.high);
        const low = num(r.Low ?? r.low);
        const close = num(r.Close ?? r.close ?? r.LastPrice ?? r.last);
        const volume = num(r.Volume ?? r.volume ?? r.TotalMatchVolume) ?? 0;
        if (time == null || open == null || high == null || low == null || close == null) continue;
        if (close <= 0) continue;
        bars.push({ time, open, high, low, close, volume });
      }
      bars.sort((a, b) => a.time - b.time);
      if (bars.length) return bars.slice(-limit);
    } catch {
      /* fall through */
    }
  }

  const template = process.env.DERIVATIVES_OHLCV_URL?.trim();
  if (template) {
    const url = template.includes("{symbol}")
      ? template.replaceAll("{symbol}", encodeURIComponent(sym))
      : `${template}${template.includes("?") ? "&" : "?"}symbol=${encodeURIComponent(sym)}`;
    const res = await httpJson<{ bars?: OhlcvBar[]; data?: OhlcvBar[] } | OhlcvBar[]>(url, {
      provider: HNX_DERIVATIVES,
      timeoutMs: 10_000,
      retries: 1,
      headers: process.env.DERIVATIVES_QUOTE_API_KEY
        ? { Authorization: `Bearer ${process.env.DERIVATIVES_QUOTE_API_KEY}` }
        : undefined,
    });
    if (res.ok && res.data) {
      const raw = Array.isArray(res.data)
        ? res.data
        : (res.data.bars ?? res.data.data ?? []);
      return raw
        .filter((b) => b && Number(b.close) > 0 && Number(b.time) > 0)
        .map((b) => ({
          time: Number(b.time),
          open: Number(b.open),
          high: Number(b.high),
          low: Number(b.low),
          close: Number(b.close),
          volume: Number(b.volume) || 0,
        }))
        .sort((a, b) => a.time - b.time)
        .slice(-limit);
    }
  }

  try {
    const entBars = await fetchEntradeDerivativeOhlcv(sym, limit);
    if (entBars.length) return entBars;
  } catch {
    /* continue */
  }

  try {
    const vndBars = await fetchVndirectDerivativeOhlcv(sym, limit);
    if (vndBars.length) return vndBars;
  } catch {
    /* continue */
  }


  if (sym.includes("=F")) {
    try {
      const { getYahooChart } = await import("./yahoo");
      const yres = await getYahooChart(sym, "1d", `${days}d`);
      if (yres?.candles?.length) {
        return yres.candles.map((c) => ({
          time: c.time * 1000,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
        }));
      }
    } catch {
      /* continue */
    }
  }

  return [];
}
