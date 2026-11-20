import { hubVnQuotes } from "@/lib/data-engine";
import { VN_SECURITIES } from "@/lib/vn/master";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import {
  getLastMasterSnapshot,
  getMasterScreenerSnapshot,
  type ScreenerStockItem,
} from "@/lib/services/screener-snapshot-service";
import {
  evaluateMultiHorizonSectorFlow,
  type InvestmentHorizon,
  type SectorHorizonFlowInputItem,
  type SectorHorizonFlowResult,
} from "@/lib/engines/sector-horizon-flow-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 18;

export type SectorFlowItem = SectorHorizonFlowResult;

interface CachedSectorFlowInputs {
  flowInputs: SectorHorizonFlowInputItem[];
  hasMasterSnap: boolean;
  expiresAt: number;
}

let l1SectorFlowCache: CachedSectorFlowInputs | null = null;
const SECTOR_FLOW_L1_TTL_MS = 30_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawHorizon = (url.searchParams.get("horizon") ?? "COMPOSITE").toUpperCase();
  const horizonSort: InvestmentHorizon | "COMPOSITE" =
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
      maxSubrequests: 20,
      maxConcurrent: 3,
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
            timestamp: now,
            cached: true,
          },
        };
      }

      // 1. Fetch live quotes and Master Screener Snapshot (prefer hot L1 snapshot if already warm)
      const allSymbols = VN_SECURITIES.map((s) => s.symbol);
      const [quotesResult, masterSnap] = await Promise.all([
        hubVnQuotes(allSymbols).catch(() => null),
        hotHasItems
          ? Promise.resolve(hotSnap)
          : Promise.race([
              getMasterScreenerSnapshot().catch(() => null),
              new Promise<null>((r) => setTimeout(() => r(null), 1_500)),
            ]),
      ]);

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

      // 2. Build unified input items across all VN_SECURITIES enriched with TA/FA/Valuation/Orderflow from Master Snapshot
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

        flowInputs.push({
          symbol: sym,
          sector: snap?.sector ?? sec.sector,
          price,
          changePercent,
          volume,
          turnoverBillion,
          marketCap: snap?.marketCap ?? null,
          foreignNetValBillion: snap?.foreignNetVal ?? null,
          volRatio20: snap?.volRatio20 ?? null,
          upDownVolRatio: snap?.upDownVolRatio ?? null,
          rsRating: snap?.rsRating ?? null,
          rsRating20: snap?.rsRating20 ?? null,
          rsTrend: snap?.rsTrend ?? null,
          maSignal: snap?.maSignal ?? null,
          mtfConsensus: snap?.mtfConsensus ?? null,
          isMtfAligned: snap?.isMtfAligned ?? null,
          smartMoneyScore: snap?.smartMoneyScore ?? null,
          smartMoneySignal: snap?.smartMoneySignal ?? null,
          apexQuantScore: snap?.apexQuantScore ?? null,
          orcaMasterScore: snap?.orcaMasterScore ?? null,
          confluenceScore: snap?.confluenceScore ?? null,
          historicalEdgeScore: snap?.historicalEdgeScore ?? null,
          isBuyTriggerNow: snap?.isBuyTriggerNow ?? null,
          buyZoneStatus: snap?.buyZoneStatus ?? null,
          absBuyDiff: snap?.absBuyDiff ?? null,
          riskReward: snap?.riskReward ?? null,
          isSqueezeFiredBull: snap?.isSqueezeFiredBull ?? null,
          isSqueezeOn: snap?.isSqueezeOn ?? null,
          isTightCloses: snap?.isTightCloses ?? null,
          isVolumeDryUp: snap?.isVolumeDryUp ?? null,
          isWyckoffLps: snap?.isWyckoffLps ?? null,
          isWyckoffSpring: snap?.isWyckoffSpring ?? null,
          ouZScore: snap?.ouZScore ?? null,
          ouHalfLife: snap?.ouHalfLife ?? null,
          sectorRrgQuadrant: snap?.sectorRrgQuadrant ?? null,
          sectorRsRatio: snap?.sectorRsRatio ?? null,
          sectorRsMomentum: snap?.sectorRsMomentum ?? null,
          roe: snap?.roe ?? null,
          roic: snap?.roic ?? null,
          roiic3Y: snap?.roiic3Y ?? null,
          pe: snap?.pe ?? null,
          pb: snap?.pb ?? null,
          peg: snap?.peg ?? null,
          dividendYield: snap?.dividendYield ?? null,
          niYoyPct: snap?.niYoyPct ?? null,
          revenueYoyPct: snap?.revenueYoyPct ?? null,
          isQuarterlyInflection: snap?.isQuarterlyInflection ?? null,
          piotroskiFScore: snap?.piotroskiFScore ?? null,
          altmanZone: snap?.altmanZone ?? null,
          cfoToNetProfit: snap?.cfoToNetProfit ?? null,
          sloanAccrualRatio: snap?.sloanAccrualRatio ?? null,
          isBeneishSafe: snap?.isBeneishSafe ?? null,
          isNetCash: snap?.isNetCash ?? null,
          isMertonSafe: snap?.isMertonSafe ?? null,
          mertonDistanceToDefault: snap?.mertonDistanceToDefault ?? null,
          isBuffettCompounder: snap?.isBuffettCompounder ?? null,
          isSuperCompounder: snap?.isSuperCompounder ?? null,
          isDividendAristocrat: snap?.isDividendAristocrat ?? null,
          consensusUpsidePct: snap?.consensusUpsidePct ?? null,
          reverseDcfMarginPct: snap?.reverseDcfMarginPct ?? null,
          bankFairPbGordon: snap?.bankFairPbGordon ?? null,
          rnavUpsidePct: snap?.rnavUpsidePct ?? null,
          isBrokenSupport: snap?.isBrokenSupport ?? null,
        });
      }

      if (flowInputs.length > 0) {
        l1SectorFlowCache = {
          flowInputs,
          hasMasterSnap: snapItems.length > 0,
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
          timestamp: Date.now(),
          cached: false,
        },
      };
    },
  });
}
