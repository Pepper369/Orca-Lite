import "server-only";
import { httpJson } from "../http";
import type { Quote } from "../types";

/**
 * VPS public datafeed — bảng giá realtime HOSE/HNX/UPCOM (không cần API key).
 * Endpoint: https://bgapidatafeed.vps.com.vn/getliststockdata/SYM1,SYM2
 * Giá thường cập nhật nhanh; dùng làm tier-A song song với VNDirect.
 */

const BASE = "https://bgapidatafeed.vps.com.vn";
const CHUNK = 40;

interface VpsRow {
  sym?: string;
  symCode?: string;
  stock_code?: string;
  stockCode?: string;
  lastPrice?: number | string;
  last_price?: number | string;
  ot?: number | string;
  changePrice?: number | string;
  change_price?: number | string;
  changePc?: number | string;
  changePercent?: number | string;
  change_percent?: number | string;
  lot?: number | string;
  totalVol?: number | string;
  total_vol?: number | string;
  totalVal?: number | string;
  total_val?: number | string;
  highPrice?: number | string;
  high_price?: number | string;
  lowPrice?: number | string;
  low_price?: number | string;
  openPrice?: number | string;
  open_price?: number | string;
  r?: number | string;
  refPrice?: number | string;
  ref_price?: number | string;
  c?: number | string;
  ceilingPrice?: number | string;
  ceiling_price?: number | string;
  f?: number | string;
  floorPrice?: number | string;
  floor_price?: number | string;
  fBVol?: number | string;
  fBValue?: number | string;
  fSVolume?: number | string;
  fSValue?: number | string;
  fRoom?: number | string;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function mapRow(r: VpsRow): Quote | null {
  const code = String(r.sym ?? r.stock_code ?? r.stockCode ?? "").toUpperCase();
  if (!code) return null;
  const last = num(r.lastPrice ?? r.last_price);
  if (!last || last <= 0) return null;
  const change = num(r.ot ?? r.changePrice ?? r.change_price);
  const changePercent = num(r.changePc ?? r.changePercent ?? r.change_percent);
  return {
    symbol: code,
    assetClass: "stock",
    price: last,
    change,
    changePercent,
    volume: num(r.lot ?? r.totalVol ?? r.total_vol),
    quoteVolume: num(r.totalVal ?? r.total_val),
    high: num(r.highPrice ?? r.high_price),
    low: num(r.lowPrice ?? r.low_price),
    open: num(r.openPrice ?? r.open_price),
    referencePrice: num(r.r ?? r.refPrice ?? r.ref_price),
    ceilingPrice: num(r.c ?? r.ceilingPrice ?? r.ceiling_price),
    floorPrice: num(r.f ?? r.floorPrice ?? r.floor_price),
    updatedAt: new Date().toISOString(),
  };
}

async function fetchChunk(syms: string[]): Promise<Quote[]> {
  const res = await httpJson<VpsRow[]>(`${BASE}/getliststockdata/${syms.join(",")}`, {
    provider: "vps",
    timeoutMs: 7_500,
    retries: 1,
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok || !Array.isArray(res.data)) return [];
  const out: Quote[] = [];
  for (const r of res.data) {
    const q = mapRow(r);
    if (q) out.push(q);
  }
  return out;
}

export async function getVpsQuotes(symbols: string[]): Promise<Quote[]> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (!uniq.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += CHUNK) chunks.push(uniq.slice(i, i + CHUNK));
  const batches = await Promise.all(chunks.map(fetchChunk));
  return batches.flat();
}

export interface VpsForeignFlow {
  symbol: string;
  buyVolume: number | null;
  buyValue: number | null;
  sellVolume: number | null;
  sellValue: number | null;
  netVolume: number | null;
  netValue: number | null;
  foreignRoom: number | null;
  buyRatioPct: number;
  rightInfos: Array<{ contentVi: string; contentEn?: string }>;
  updatedAt: string;
}

/** Lấy dòng tiền khối ngoại trực tiếp từ datafeed realtime của VPS (công khai không API key). */
export async function getVpsForeignFlow(symbol: string): Promise<VpsForeignFlow | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;
  const res = await httpJson<Array<VpsRow & { rightInfos?: Array<{ contentVi: string; contentEn?: string }> }>>(`${BASE}/getliststockdata/${sym}`, {
    provider: "vps",
    timeoutMs: 4_500,
    retries: 1,
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return null;
  const r = res.data[0];
  const buyVol = num(r.fBVol);
  const fBVal = num(r.fBValue);
  const sellVol = num(r.fSVolume);
  const fSVal = num(r.fSValue);
  const room = num(r.fRoom);

  // fBValue / fSValue trong datafeed của VPS tính theo nghìn đồng -> quy đổi VND
  const buyVal = fBVal != null ? fBVal * 1000 : null;
  const sellVal = fSVal != null ? fSVal * 1000 : null;
  const netVol = buyVol != null && sellVol != null ? buyVol - sellVol : null;
  const netVal = buyVal != null && sellVal != null ? buyVal - sellVal : null;

  const totalVol = (buyVol ?? 0) + (sellVol ?? 0);
  const buyRatioPct = totalVol > 0 ? Math.round(((buyVol ?? 0) / totalVol) * 10000) / 100 : 50;
  const rightInfos = Array.isArray(r.rightInfos) ? r.rightInfos : [];

  return {
    symbol: sym,
    buyVolume: buyVol,
    buyValue: buyVal,
    sellVolume: sellVol,
    sellValue: sellVal,
    netVolume: netVol,
    netValue: netVal,
    foreignRoom: room,
    buyRatioPct,
    rightInfos,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Lấy dòng tiền khối ngoại hàng loạt theo danh sách mã từ VPS datafeed.
 * Chia chunk 40 mã/request để quét toàn bộ Universe chỉ trong 2-3 requests siêu tốc.
 */
export async function getVpsBatchForeignFlow(
  symbols: string[],
): Promise<Map<string, VpsForeignFlow>> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))];
  if (!uniq.length) return new Map();

  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    chunks.push(uniq.slice(i, i + CHUNK));
  }

  const result = new Map<string, VpsForeignFlow>();

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await httpJson<Array<VpsRow & { rightInfos?: Array<{ contentVi: string; contentEn?: string }> }>>(
          `${BASE}/getliststockdata/${chunk.join(",")}`,
          {
            provider: "vps",
            timeoutMs: 5_500,
            retries: 1,
            headers: {
              Accept: "application/json",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            },
          },
        );

        if (!res.ok || !Array.isArray(res.data)) return;

        for (const r of res.data) {
          const code = String(r.sym ?? r.stock_code ?? r.stockCode ?? "").toUpperCase();
          if (!code) continue;

          const buyVol = num(r.fBVol);
          const fBVal = num(r.fBValue);
          const sellVol = num(r.fSVolume);
          const fSVal = num(r.fSValue);
          const room = num(r.fRoom);

          const buyVal = fBVal != null ? fBVal * 1000 : null;
          const sellVal = fSVal != null ? fSVal * 1000 : null;
          const netVol = buyVol != null && sellVol != null ? buyVol - sellVol : null;
          const netVal = buyVal != null && sellVal != null ? buyVal - sellVal : null;

          const totalVol = (buyVol ?? 0) + (sellVol ?? 0);
          const buyRatioPct = totalVol > 0 ? Math.round(((buyVol ?? 0) / totalVol) * 10000) / 100 : 50;

          result.set(code, {
            symbol: code,
            buyVolume: buyVol,
            buyValue: buyVal,
            sellVolume: sellVol,
            sellValue: sellVal,
            netVolume: netVol,
            netValue: netVal,
            foreignRoom: room,
            buyRatioPct,
            rightInfos: Array.isArray(r.rightInfos) ? r.rightInfos : [],
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Soft timeout fallback
      }
    }),
  );

  return result;
}


