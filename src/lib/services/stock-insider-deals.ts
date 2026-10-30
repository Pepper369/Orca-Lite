import "server-only";

import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { vndirectJson } from "../financial/vndirect-http";
import type { Meta } from "../types";

const TTL_MS = 15 * 60_000; // 15 mins cache
const STALE_MS = 60 * 60_000;

export interface InsiderDealItem {
  id: string;
  symbol: string;
  date: string;
  time?: string | null;
  person: string;
  role: string;
  action: "BUY" | "SELL" | "TRANSFER" | "OTHER";
  registeredShares?: number | null;
  matchedShares?: number | null;
  holdingBefore?: number | null;
  holdingAfter?: number | null;
  title: string;
  url: string;
}

export interface InsiderDealsResult {
  symbol: string;
  asOfDate: string;
  totalDeals: number;
  summary: {
    buyCount: number;
    sellCount: number;
    signal: "NET_ACCUMULATION" | "NET_DISTRIBUTION" | "NEUTRAL";
    signalVi: string;
  };
  deals: InsiderDealItem[];
}

function parseAction(title: string): "BUY" | "SELL" | "TRANSFER" | "OTHER" {
  const upper = title.toUpperCase();
  if (upper.includes("MUA") || upper.includes("NHẬN")) return "BUY";
  if (upper.includes("BÁN") || upper.includes("CHUYỂN NHƯỢNG") || upper.includes("THOÁI")) return "SELL";
  if (upper.includes("CHO") || upper.includes("TẶNG") || upper.includes("THỪA KẾ")) return "TRANSFER";
  return "OTHER";
}

function parsePerson(title: string): { person: string; role: string } {
  // Pattern thường gặp: "Thông báo giao dịch cổ phiếu của Người nội bộ Nguyễn Văn A"
  // hoặc "giao dịch cổ phiếu của người có liên quan..."
  let person = "Người nội bộ / Cổ đông lớn";
  let role = "Người nội bộ";

  const lower = title.toLowerCase();
  if (lower.includes("người nội bộ")) {
    role = "Người nội bộ";
    const parts = title.split(/người nội bộ/i);
    if (parts[1]) person = parts[1].trim().replace(/^[-–:\s]+/, "");
  } else if (lower.includes("người có liên quan")) {
    role = "Người có liên quan";
    const parts = title.split(/người có liên quan(?: của)?/i);
    if (parts[1]) person = parts[1].trim().replace(/^[-–:\s]+/, "");
  } else if (lower.includes("cổ đông lớn")) {
    role = "Cổ đông lớn";
    const parts = title.split(/cổ đông lớn/i);
    if (parts[1]) person = parts[1].trim().replace(/^[-–:\s]+/, "");
  } else {
    const parts = title.split(/của/i);
    if (parts.length > 1) {
      person = parts[parts.length - 1].trim().replace(/^[-–:\s]+/, "");
    }
  }

  // Cắt ngắn nếu có dấu ngoặc
  person = person.split(/[(–-]/)[0].trim();
  if (!person || person.length > 40) person = "Lãnh đạo / Cổ đông";

  return { person, role };
}

export async function getStockInsiderDeals(
  symbol: string,
  limit = 25
): Promise<{ data: InsiderDealsResult; meta: Meta }> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cacheKey = `stock:insider-deals:${sym}:${limit}`;

  const res = await cached(cacheKey, {
    ttlMs: TTL_MS,
    staleMs: STALE_MS,
    producer: async (): Promise<InsiderDealsResult> => {
      const q = encodeURIComponent(`tagCodes:${sym}~newsTitle:giao dịch`);
      const path = `/v4/news?q=${q}&sort=newsDate:desc~newsTime:desc&size=${limit}`;

      let rawRows: Array<Record<string, unknown>> = [];
      try {
        const payload = (
          await vndirectJson<{ data?: Array<Record<string, unknown>> }>(path, {
            provider: "vndirect-insider",
            timeoutMs: 8000,
            retries: 1,
            accept: (v) => Array.isArray(v.data),
          })
        ).data;
        rawRows = payload.data || [];
      } catch {
        rawRows = [];
      }

      const deals: InsiderDealItem[] = [];
      let buyCount = 0;
      let sellCount = 0;

      for (const row of rawRows) {
        const title = String(row.newsTitle || row.title || "").trim();
        if (!title) continue;

        const action = parseAction(title);
        if (action === "BUY") buyCount++;
        if (action === "SELL") sellCount++;

        const { person, role } = parsePerson(title);
        const date = String(row.newsDate || row.date || "").slice(0, 10);
        const time = typeof row.newsTime === "string" ? row.newsTime : null;
        const id = String(row.newsId || row.id || `${date}-${deals.length}`);

        deals.push({
          id,
          symbol: sym,
          date: date || new Date().toISOString().split("T")[0],
          time,
          person,
          role,
          action,
          title,
          url: `https://dstock.vndirect.com.vn/tin-tuc-ma/${sym}`,
        });
      }

      // Đánh giá tín hiệu nội bộ
      let signal: "NET_ACCUMULATION" | "NET_DISTRIBUTION" | "NEUTRAL" = "NEUTRAL";
      let signalVi = "Giao dịch cân bằng / ít biến động lớn";
      if (buyCount > sellCount && buyCount >= 2) {
        signal = "NET_ACCUMULATION";
        signalVi = "Lãnh đạo & Người nội bộ đang Mua ròng tích lũy";
      } else if (sellCount > buyCount && sellCount >= 2) {
        signal = "NET_DISTRIBUTION";
        signalVi = "Người nội bộ có động thái Bán ròng";
      }

      return {
        symbol: sym,
        asOfDate: deals[0]?.date || new Date().toISOString().split("T")[0],
        totalDeals: deals.length,
        summary: {
          buyCount,
          sellCount,
          signal,
          signalVi,
        },
        deals,
      };
    },
  });

  const meta = buildMeta({
    source: "vndirect-insider",
    sourceTimestampMs: Date.now(),
    cached: res.cached,
    stale: res.stale,
    note: `Lịch sử giao dịch người nội bộ và ban lãnh đạo ${sym}.`,
  });

  return { data: res.value, meta };
}
