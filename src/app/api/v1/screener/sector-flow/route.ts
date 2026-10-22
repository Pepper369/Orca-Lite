import { hubVnQuotes } from "@/lib/data-engine";
import { VN_SECTORS, VN_SECURITIES, type VnSector } from "@/lib/vn/master";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 18;

export interface SectorFlowItem {
  sector: VnSector;
  totalTurnoverBillion: number;
  turnoverSharePct: number;
  avgChangePercent: number;
  gainersCount: number;
  losersCount: number;
  unchangedCount: number;
  totalStocksCount: number;
  quadrant: "Leading" | "Improving" | "Weakening" | "Lagging";
  quadrantVi: string;
  topStock: {
    symbol: string;
    price: number;
    changePercent: number;
    turnoverBillion: number;
  } | null;
}

export async function GET() {
  return safeApi({
    label: "screener-sector-flow",
    guard: {
      wallMs: WORKERS_BUDGET.techScreenWallMs,
      maxSubrequests: 20,
      maxConcurrent: 3,
    },
    produce: async () => {
      // 1. Fetch live quotes across VN market
      const allSymbols = VN_SECURITIES.map((s) => s.symbol);
      const quotesResult = await hubVnQuotes(allSymbols);
      const quotesRes = quotesResult?.quotes ?? [];
      const quotesMap = new Map<string, { price: number; changePercent: number; volume: number; value: number }>();
      
      let totalMarketTurnoverBillion = 0;

      for (const q of quotesRes) {
        if (!q.symbol) continue;
        const price = q.price ?? 0;
        const vol = q.volume ?? 0;
        // Turnover in Billion VND: (price * volume) / 1e9
        const standardPrice = price > 1000 ? price : price * 1000;
        const valBillion = (standardPrice * vol) / 1e9;

        quotesMap.set(q.symbol.toUpperCase(), {
          price,
          changePercent: q.changePercent ?? 0,
          volume: vol,
          value: Math.max(0, valBillion),
        });

        totalMarketTurnoverBillion += Math.max(0, valBillion);
      }

      if (totalMarketTurnoverBillion === 0) totalMarketTurnoverBillion = 1;

      // 2. Aggregate metrics per sector
      const sectorResults: SectorFlowItem[] = [];

      for (const sec of VN_SECTORS) {
        const securities = VN_SECURITIES.filter((s) => s.sector === sec);
        if (securities.length === 0) continue;

        let secTurnover = 0;
        let sumChange = 0;
        let countedChange = 0;
        let gainers = 0;
        let losers = 0;
        let unchanged = 0;
        let bestStock: SectorFlowItem["topStock"] = null;

        for (const s of securities) {
          const q = quotesMap.get(s.symbol.toUpperCase());
          if (q) {
            secTurnover += q.value;
            sumChange += q.changePercent;
            countedChange++;

            if (q.changePercent > 0.1) gainers++;
            else if (q.changePercent < -0.1) losers++;
            else unchanged++;

            if (!bestStock || q.value > bestStock.turnoverBillion) {
              bestStock = {
                symbol: s.symbol,
                price: q.price,
                changePercent: q.changePercent,
                turnoverBillion: Number(q.value.toFixed(2)),
              };
            }
          }
        }

        const avgChange = countedChange > 0 ? sumChange / countedChange : 0;
        const sharePct = (secTurnover / totalMarketTurnoverBillion) * 100;

        // Determine Quadrant
        let quadrant: "Leading" | "Improving" | "Weakening" | "Lagging" = "Lagging";
        let quadrantVi = "Tụt hậu";

        if (avgChange >= 0.5 && sharePct >= 4) {
          quadrant = "Leading";
          quadrantVi = "Dẫn dắt (Leading)";
        } else if (avgChange < 0 && sharePct >= 3.5) {
          quadrant = "Improving";
          quadrantVi = "Cải thiện (Improving)";
        } else if (avgChange > 0 && sharePct < 3.5) {
          quadrant = "Weakening";
          quadrantVi = "Suy yếu (Weakening)";
        }

        sectorResults.push({
          sector: sec,
          totalTurnoverBillion: Number(secTurnover.toFixed(2)),
          turnoverSharePct: Number(sharePct.toFixed(2)),
          avgChangePercent: Number(avgChange.toFixed(2)),
          gainersCount: gainers,
          losersCount: losers,
          unchangedCount: unchanged,
          totalStocksCount: securities.length,
          quadrant,
          quadrantVi,
          topStock: bestStock,
        });
      }

      // Sort descending by turnover
      sectorResults.sort((a, b) => b.totalTurnoverBillion - a.totalTurnoverBillion);

      return {
        data: {
          sectors: sectorResults,
          totalMarketTurnoverBillion: Number(totalMarketTurnoverBillion.toFixed(2)),
          timestamp: Date.now(),
        },
      };
    },
  });
}
