import { hubVnQuotes } from "@/lib/data-engine";
import { VN_SECURITIES } from "@/lib/vn/master";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { getVndForeignFlow } from "@/lib/providers/vndirect";
import { getRrgData } from "@/lib/services/rrg-service";
import { matchSymbolToIcbSector, type RrgItem } from "@/lib/engines/rrg-engine";
import {
  getLastMasterSnapshot,
  getMasterScreenerSnapshot,
  type ScreenerStockItem,
} from "@/lib/services/screener-snapshot-service";
import {
  evaluateMultiHorizonSectorFlow,
  toSectorHorizonInput,
  type SectorHorizonFlowInputItem,
  type SectorHorizonFlowResult,
  type SectorSortHorizon,
} from "@/lib/engines/sector-horizon-flow-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 18;

export type SectorFlowItem = SectorHorizonFlowResult;

interface CachedSectorFlowInputs {
  flowInputs: SectorHorizonFlowInputItem[];
  hasMasterSnap: boolean;
  sourcesConnected: string[];
  expiresAt: number;
}

let l1SectorFlowCache: CachedSectorFlowInputs | null = null;
const SECTOR_FLOW_L1_TTL_MS = 30_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawHorizon = (url.searchParams.get("horizon") ?? "COMPOSITE").toUpperCase();
  const horizonSort: SectorSortHorizon =
    rawHorizon === "CURRENT_1D" ||
    rawHorizon === "SHORT_1_2W" ||
    rawHorizon === "MEDIUM_3W_2M" ||
    rawHorizon === "MED_LONG_2_6M" ||
    rawHorizon === "LONG_6M_PLUS"
      ? rawHorizon
      : "COMPOSITE";

  return safeApi({
    label: "screener-sector-flow",
    guard: {
      wallMs: WORKERS_BUDGET.techScreenWallMs,
      maxSubrequests: 24,
      maxConcurrent: 4,
    },
    produce: async () => {
      const now = Date.now();
      const hotSnap = getLastMasterSnapshot();
      const hotHasItems = Boolean(hotSnap && hotSnap.items.length > 0);

      // Fast L1 cache hit if cache is fresh and doesn't miss newly warmed master snapshot
      if (
        l1SectorFlowCache &&
        now < l1SectorFlowCache.expiresAt &&
        (l1SectorFlowCache.hasMasterSnap || !hotHasItems)
      ) {
        const evaluated = evaluateMultiHorizonSectorFlow(
          l1SectorFlowCache.flowInputs,
          horizonSort,
        );
        return {
          data: {
            sectors: evaluated.sectors,
            totalMarketTurnoverBillion: evaluated.totalMarketTurnoverBillion,
            horizonLeaders: evaluated.horizonLeaders,
            activeHorizon: horizonSort,
            sourcesConnected: l1SectorFlowCache.sourcesConnected,
            timestamp: now,
            cached: true,
          },
        };
      }

      // 1. Multi-Source Parallel Fetch: Live Quotes + Master Screener TA/FA + VNDDirect Live Foreign Flow + True RRG Sectors
      const allSymbols = VN_SECURITIES.map((s) => s.symbol);
      const [quotesResult, masterSnap, foreignFlow, rrgRes] = await Promise.all([
        hubVnQuotes(allSymbols).catch(() => null),
        hotHasItems
          ? Promise.resolve(hotSnap)
          : Promise.race([
              getMasterScreenerSnapshot().catch(() => null),
              new Promise<null>((r) => setTimeout(() => r(null), 1_800)),
            ]),
        Promise.race([
          getVndForeignFlow().catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 2_200)),
        ]),
        Promise.race([
          getRrgData("sectors", 5).catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 2_200)),
        ]),
      ]);

      const sourcesConnected: string[] = [];
      if (quotesResult?.quotes?.length) sourcesConnected.push("VN_LIVE_QUOTES");
      if ((masterSnap as { items?: ScreenerStockItem[] } | null)?.items?.length) sourcesConnected.push("MASTER_TA_FA_SNAPSHOT");
      if (foreignFlow?.bySymbol && Object.keys(foreignFlow.bySymbol).length > 0) sourcesConnected.push("VNDIRECT_FOREIGN_FLOW");
      if (rrgRes?.data?.items?.length) sourcesConnected.push("RRG_VNINDEX_BENCHMARK");

      const rrgBySectorCode = new Map<string, RrgItem>(
        (rrgRes?.data?.items ?? []).map((item) => [item.code.toUpperCase(), item]),
      );

      const quotesRes = quotesResult?.quotes ?? [];
      const quotesMap = new Map<
        string,
        { price: number; changePercent: number; volume: number; valueBillion: number }
      >();

      for (const q of quotesRes) {
        if (!q.symbol) continue;
        const price = q.price ?? 0;
        const vol = q.volume ?? 0;
        const standardPrice = price > 1000 ? price : price * 1000;
        const valBillion = Math.max(0, (standardPrice * vol) / 1e9);

        quotesMap.set(q.symbol.toUpperCase(), {
          price,
          changePercent: q.changePercent ?? 0,
          volume: vol,
          valueBillion: valBillion,
        });
      }

      const snapItems: ScreenerStockItem[] = (masterSnap as { items?: ScreenerStockItem[] } | null)?.items ?? [];
      const snapMap = new Map<string, ScreenerStockItem>(
        snapItems.map((it) => [it.symbol.toUpperCase(), it]),
      );

      // 2. Build unified input items enriched with all 4 real sources (Quotes + TA/FA + VNDDirect Foreign + RRG)
      const flowInputs: SectorHorizonFlowInputItem[] = [];

      for (const sec of VN_SECURITIES) {
        const sym = sec.symbol.toUpperCase();
        const q = quotesMap.get(sym);
        const snap = snapMap.get(sym);
        if (!q && !snap) continue;

        const price = q?.price && q.price > 0 ? q.price : (snap?.price ?? 0);
        const volume = q?.volume && q.volume > 0 ? q.volume : (snap?.volume ?? 0);
        const changePercent = q ? q.changePercent : (snap?.changePercent ?? 0);
        const stdPrice = price > 1000 ? price : price * 1000;
        const turnoverBillion = q ? q.valueBillion : Math.max(0, (stdPrice * volume) / 1e9);

        const vndForeignVnd = foreignFlow?.bySymbol?.[sym];
        const liveForeignBillion =
          vndForeignVnd != null && Number.isFinite(vndForeignVnd)
            ? Number((vndForeignVnd / 1e9).toFixed(3))
            : undefined;

        const icbCode = matchSymbolToIcbSector(sym, snap?.sector ?? sec.sector);
        const rrgItem = icbCode ? rrgBySectorCode.get(icbCode.toUpperCase()) : undefined;

        flowInputs.push(
          toSectorHorizonInput(snap ?? {}, {
            symbol: sym,
            sector: snap?.sector ?? sec.sector,
            price,
            changePercent,
            volume,
            turnoverBillion,
            ...(liveForeignBillion !== undefined ? { foreignNetValBillion: liveForeignBillion } : {}),
            ...(rrgItem
              ? {
                  sectorRrgQuadrant: rrgItem.quadrant,
                  sectorRsRatio: rrgItem.currentRsRatio,
                  sectorRsMomentum: rrgItem.currentRsMomentum,
                }
              : {}),
          }),
        );
      }

      if (flowInputs.length > 0) {
        l1SectorFlowCache = {
          flowInputs,
          hasMasterSnap: snapItems.length > 0,
          sourcesConnected,
          expiresAt: Date.now() + SECTOR_FLOW_L1_TTL_MS,
        };
      }

      const evaluated = evaluateMultiHorizonSectorFlow(flowInputs, horizonSort);

      return {
        data: {
          sectors: evaluated.sectors,
          totalMarketTurnoverBillion: evaluated.totalMarketTurnoverBillion,
          horizonLeaders: evaluated.horizonLeaders,
          activeHorizon: horizonSort,
          sourcesConnected,
          timestamp: Date.now(),
          cached: false,
        },
      };
    },
  });
}
