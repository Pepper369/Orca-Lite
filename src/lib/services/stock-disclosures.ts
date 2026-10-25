import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import {
  getVndSignedDisclosures,
  type SignedDisclosureDocument,
} from "../providers/vndirect-news";
import type { Meta } from "../types";

const TTL_MS = 15 * 60_000; // 15 mins cache
const STALE_MS = 24 * 60 * 60_000; // 24 hours stale

export interface StockDisclosuresResult {
  symbol: string;
  documents: SignedDisclosureDocument[];
  total: number;
  pdfCount: number;
}

export async function getStockSignedDisclosures(
  symbol: string,
  limit = 25
): Promise<{ data: StockDisclosuresResult; meta: Meta } | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;

  try {
    const res = await cached(`stock-disclosures:vndirect:${sym}:${limit}`, {
      ttlMs: TTL_MS,
      staleMs: STALE_MS,
      producer: async () => {
        const documents = await getVndSignedDisclosures(sym, limit);
        const pdfCount = documents.reduce((acc, doc) => acc + doc.attachments.length, 0);

        return {
          symbol: sym,
          documents,
          total: documents.length,
          pdfCount,
        };
      },
    });

    const meta = buildMeta({
      source: "hose-hnx-vndirect-disclosure",
      sourceTimestampMs: Date.now(),
      hasData: res.value.documents.length > 0,
      cached: res.cached,
      stale: res.stale,
      note: `Văn bản BCTC kiểm toán & Công văn giải trình ký số ${sym} từ HOSE/HNX.`,
      slas: { liveSlaMs: -1, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
    });

    return { data: res.value, meta };
  } catch {
    return null;
  }
}
