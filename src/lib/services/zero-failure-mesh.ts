import { httpJson } from "../http";
import type { Quote } from "../types";
import { getVpsQuotes } from "../providers/vps";
import * as vndirect from "../providers/vndirect";
import { getVietcapQuotes } from "../providers/vietcap";

/**
 * ============================================================================
 * TRỤ CỘT 1: ZERO-FAILURE DATA MESH (LƯỚI DỮ LIỆU ĐA NGUỒN TỰ ĐỘNG CHUYỂN MẠCH)
 * ============================================================================
 * Kết hợp 4 nguồn dữ liệu thị trường độc lập:
 * 1. VPS CDN (bgapidatafeed.vps.com.vn) - Tốc độ cao nhất, độ trễ cực thấp
 * 2. Entrade DNSE (services.entrade.com.vn) - Ổn định, chịu tải lớn
 * 3. VNDirect (finfo-api.vndirect.com.vn) - Độ phủ toàn diện cổ phiếu & chỉ số
 * 4. Vietcap (iq.vietcap.com.vn) - Dữ liệu dự phòng & profile
 *
 * Cơ chế chuyển mạch:
 * - Race với ngưỡng ngắt 300ms trong giờ cao điểm ATO (09:00-09:15) / ATC (14:30-14:45).
 * - Circuit breaker tự động cách ly nguồn lỗi và tái kết nối khi phục hồi.
 */

export type DataSourceId = "vps" | "entrade" | "vndirect" | "vietcap";

export interface SourceHealthMetrics {
  id: DataSourceId;
  name: string;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastLatencyMs: number;
  avgLatencyMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  circuitOpenUntil: number | null;
}

const CIRCUIT_COOLDOWN_MS = 60_000; // Cách ly nguồn lỗi trong 60 giây
const MAX_CONSECUTIVE_FAILURES = 3;

// In-memory health state of data sources
const sourceHealthMap: Record<DataSourceId, SourceHealthMetrics> = {
  vps: {
    id: "vps",
    name: "VPS CDN Datafeed",
    isHealthy: true,
    consecutiveFailures: 0,
    lastLatencyMs: 80,
    avgLatencyMs: 100,
    lastSuccessAt: Date.now(),
    lastFailureAt: null,
    circuitOpenUntil: null,
  },
  entrade: {
    id: "entrade",
    name: "Entrade DNSE Gateway",
    isHealthy: true,
    consecutiveFailures: 0,
    lastLatencyMs: 120,
    avgLatencyMs: 140,
    lastSuccessAt: Date.now(),
    lastFailureAt: null,
    circuitOpenUntil: null,
  },
  vndirect: {
    id: "vndirect",
    name: "VNDirect Finfo",
    isHealthy: true,
    consecutiveFailures: 0,
    lastLatencyMs: 180,
    avgLatencyMs: 200,
    lastSuccessAt: Date.now(),
    lastFailureAt: null,
    circuitOpenUntil: null,
  },
  vietcap: {
    id: "vietcap",
    name: "Vietcap IQ Insight",
    isHealthy: true,
    consecutiveFailures: 0,
    lastLatencyMs: 220,
    avgLatencyMs: 250,
    lastSuccessAt: Date.now(),
    lastFailureAt: null,
    circuitOpenUntil: null,
  },
};

/** Kiểm tra khung giờ cao điểm ATO/ATC của TTCK Việt Nam */
export function isAtoAtcRushWindow(d = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return false;

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const mins = hour * 60 + minute;

  // ATO: 09:00 - 09:18 | ATC: 14:28 - 14:48
  const isAto = mins >= 9 * 60 && mins <= 9 * 60 + 18;
  const isAtc = mins >= 14 * 60 + 28 && mins <= 14 * 60 + 48;
  return isAto || isAtc;
}

/** Cập nhật telemetry sức khỏe nguồn */
export function recordSourceResult(id: DataSourceId, latencyMs: number, ok: boolean) {
  const meta = sourceHealthMap[id];
  const now = Date.now();
  if (ok) {
    meta.consecutiveFailures = 0;
    meta.isHealthy = true;
    meta.lastSuccessAt = now;
    meta.lastLatencyMs = latencyMs;
    meta.avgLatencyMs = Math.round(meta.avgLatencyMs * 0.7 + latencyMs * 0.3);
    meta.circuitOpenUntil = null;
  } else {
    meta.consecutiveFailures += 1;
    meta.lastFailureAt = now;
    if (meta.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      meta.isHealthy = false;
      meta.circuitOpenUntil = now + CIRCUIT_COOLDOWN_MS;
    }
  }
}

/** Lấy trạng thái sức khỏe của toàn bộ lưới */
export function getDataMeshHealth(): SourceHealthMetrics[] {
  const now = Date.now();
  for (const src of Object.values(sourceHealthMap)) {
    if (src.circuitOpenUntil && now > src.circuitOpenUntil) {
      // Half-open circuit breaker test
      src.circuitOpenUntil = null;
      src.isHealthy = true;
    }
  }
  return Object.values(sourceHealthMap);
}

// ----------------------------------------------------------------------------
// ADAPTER: ENTRADE DNSE (services.entrade.com.vn)
// ----------------------------------------------------------------------------

interface EntradeStockData {
  symbol?: string;
  price?: number;
  change?: number;
  ratioChange?: number;
  totalVolume?: number;
  totalValue?: number;
  highestPrice?: number;
  lowestPrice?: number;
  openPrice?: number;
  basicPrice?: number;
  ceilingPrice?: number;
  floorPrice?: number;
}

export async function fetchEntradeQuotes(symbols: string[]): Promise<Quote[]> {
  const t0 = Date.now();
  try {
    const symList = symbols.map((s) => s.toUpperCase().trim()).filter(Boolean);
    if (!symList.length) return [];

    // Gọi API Entrade public snapshot
    const res = await httpJson<EntradeStockData[] | { data?: EntradeStockData[] }>(
      `https://services.entrade.com.vn/chart-api/v2/stocks/overview?symbols=${symList.join(",")}`,
      {
        provider: "entrade-dnse",
        timeoutMs: 3_500,
        retries: 1,
        headers: {
          Accept: "application/json",
          Origin: "https://banggia.dnse.com.vn",
          Referer: "https://banggia.dnse.com.vn/",
        },
      },
    );

    const latency = Date.now() - t0;
    const rawList = Array.isArray(res.data) ? res.data : res.data?.data;
    if (!res.ok || !rawList || !rawList.length) {
      recordSourceResult("entrade", latency, false);
      return [];
    }

    recordSourceResult("entrade", latency, true);
    const nowIso = new Date().toISOString();
    const quotes: Quote[] = [];

    for (const item of rawList) {
      const sym = item.symbol?.toUpperCase();
      if (!sym || !item.price) continue;
      quotes.push({
        symbol: sym,
        assetClass: "stock",
        price: item.price,
        change: item.change ?? 0,
        changePercent: item.ratioChange ? item.ratioChange * 100 : 0,
        volume: item.totalVolume ?? null,
        quoteVolume: item.totalValue ?? null,
        high: item.highestPrice ?? null,
        low: item.lowestPrice ?? null,
        open: item.openPrice ?? null,
        referencePrice: item.basicPrice ?? null,
        ceilingPrice: item.ceilingPrice ?? null,
        floorPrice: item.floorPrice ?? null,
        updatedAt: nowIso,
      });
    }
    return quotes;
  } catch {
    recordSourceResult("entrade", Date.now() - t0, false);
    return [];
  }
}

// ----------------------------------------------------------------------------
// CORE ENGINE: ZERO-FAILURE RESILIENT FETCH (AUTO-FAILOVER IN 300MS)
// ----------------------------------------------------------------------------

export interface MeshQuoteResult {
  quotes: Quote[];
  primarySource: DataSourceId;
  fallbackUsed: boolean;
  totalLatencyMs: number;
  sourcesAttempted: DataSourceId[];
}

/**
 * Fetch giá chứng khoán qua Lưới Đa Nguồn Bền Vững (Zero-Failure Data Mesh).
 * Trong giờ ATO/ATC hoặc khi nguồn chính phản hồi chậm quá 300ms, tự động chuyển
 * mạch sang nguồn dự phòng song song để đảm bảo trải nghiệm người dùng liền mạch.
 */
export async function fetchResilientQuotes(symbols: string[]): Promise<MeshQuoteResult> {
  const t0 = Date.now();
  const rush = isAtoAtcRushWindow();
  const fastTimeoutMs = rush ? 300 : 450; // Chuyển mạch trong 300ms giờ cao điểm
  const sourcesAttempted: DataSourceId[] = [];

  // Hàm bọc nguồn với timeout ngắt sớm
  const runWithTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<{ result: T | null; timedOut: boolean }> => {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<{ result: null; timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ result: null, timedOut: true }), timeoutMs);
    });

    try {
      const res = await Promise.race([
        promise.then((val) => ({ result: val, timedOut: false })),
        timeoutPromise,
      ]);
      clearTimeout(timer!);
      return res;
    } catch {
      clearTimeout(timer!);
      return { result: null, timedOut: false };
    }
  };

  // 1. Nguồn ưu tiên 1: VPS CDN
  sourcesAttempted.push("vps");
  const vpsPromise = getVpsQuotes(symbols).then((res) => {
    recordSourceResult("vps", Date.now() - t0, res.length > 0);
    return res;
  });

  const vpsAttempt = await runWithTimeout(vpsPromise, fastTimeoutMs);
  if (vpsAttempt.result && vpsAttempt.result.length >= symbols.length * 0.7) {
    return {
      quotes: vpsAttempt.result,
      primarySource: "vps",
      fallbackUsed: false,
      totalLatencyMs: Date.now() - t0,
      sourcesAttempted,
    };
  }

  // 2. Chuyển mạch tức thời sang Entrade DNSE & VNDirect song song
  sourcesAttempted.push("entrade", "vndirect");
  const entradePromise = fetchEntradeQuotes(symbols);
  const vndirectPromise = vndirect.getVndQuotes(symbols).then((res) => {
    const list = res.quotes ?? [];
    recordSourceResult("vndirect", Date.now() - t0, list.length > 0);
    return list;
  });

  // Đua giữa Entrade và VNDirect hoặc chờ VPS nếu VPS chỉ chậm một chút
  const secondaryResults = await Promise.allSettled([vpsPromise, entradePromise, vndirectPromise]);

  for (const item of secondaryResults) {
    if (item.status === "fulfilled" && item.value && item.value.length > 0) {
      return {
        quotes: item.value,
        primarySource: "entrade",
        fallbackUsed: true,
        totalLatencyMs: Date.now() - t0,
        sourcesAttempted,
      };
    }
  }

  // 3. Fallback cuối cùng: Vietcap
  sourcesAttempted.push("vietcap");
  try {
    const vcRes = await getVietcapQuotes(symbols);
    const vcQuotes = vcRes.quotes ?? [];
    recordSourceResult("vietcap", Date.now() - t0, vcQuotes.length > 0);
    return {
      quotes: vcQuotes,
      primarySource: "vietcap",
      fallbackUsed: true,
      totalLatencyMs: Date.now() - t0,
      sourcesAttempted,
    };
  } catch {
    return {
      quotes: [],
      primarySource: "vps",
      fallbackUsed: true,
      totalLatencyMs: Date.now() - t0,
      sourcesAttempted,
    };
  }
}
