import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { getVietcapShareholders, type VietcapShareholder } from "../providers/vietcap";
import type { Meta } from "../types";

const TTL_MS = 60 * 60_000; // 1 hour cache
const STALE_MS = 7 * 24 * 60 * 60_000; // 7 days stale

export interface StockShareholdersResult {
  symbol: string;
  shareholders: VietcapShareholder[];
  totalHolders: number;
  structure: {
    corporatePct: number;
    individualPct: number;
    foreignPct: number;
    otherPct: number;
  };
  majorHoldersCount: number;
}

export async function getStockShareholders(
  symbol: string
): Promise<{ data: StockShareholdersResult; meta: Meta } | null> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) return null;

  try {
    const res = await cached(`stock-shareholders:vietcap:${sym}`, {
      ttlMs: TTL_MS,
      staleMs: STALE_MS,
      producer: async () => {
        const list = await getVietcapShareholders(sym);
        const sorted = [...list].sort((a, b) => b.percentage - a.percentage);

        let corporatePct = 0;
        let individualPct = 0;
        let foreignPct = 0;
        let majorCount = 0;

        for (const h of sorted) {
          if (h.percentage >= 5) majorCount++;
          const type = h.ownerType.toUpperCase();
          if (type.includes("CORPORATE") || type.includes("TỔ CHỨC") || type.includes("STATE") || type.includes("NHÀ NƯỚC")) {
            corporatePct += h.percentage;
          } else if (type.includes("INDIVIDUAL") || type.includes("CÁ NHÂN")) {
            individualPct += h.percentage;
          } else if (type.includes("FOREIGN") || type.includes("NƯỚC NGOÀI")) {
            foreignPct += h.percentage;
          } else {
            corporatePct += h.percentage;
          }
        }

        corporatePct = Math.round(corporatePct * 100) / 100;
        individualPct = Math.round(individualPct * 100) / 100;
        foreignPct = Math.round(foreignPct * 100) / 100;
        const totalIdentified = corporatePct + individualPct + foreignPct;
        const otherPct = Math.max(0, Math.round((100 - totalIdentified) * 100) / 100);

        return {
          symbol: sym,
          shareholders: sorted,
          totalHolders: sorted.length,
          structure: {
            corporatePct,
            individualPct,
            foreignPct,
            otherPct,
          },
          majorHoldersCount: majorCount,
        };
      },
    });

    const meta = buildMeta({
      source: "vietcap-iq",
      sourceTimestampMs: Date.now(),
      hasData: res.value.shareholders.length > 0,
      cached: res.cached,
      stale: res.stale,
      note: `Sổ cổ đông chi tiết ${sym} từ Vietcap IQ Insight.`,
      slas: { liveSlaMs: -1, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
    });

    return { data: res.value, meta };
  } catch {
    return null;
  }
}
