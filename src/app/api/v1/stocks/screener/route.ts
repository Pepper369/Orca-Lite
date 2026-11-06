import { queryScreenerStocks, getLastMasterSnapshot, type ScreenerPreset } from "@/lib/services/screener-snapshot-service";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { buildMeta } from "@/lib/freshness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function num(v: string | null, min?: number, max?: number): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

/**
 * GET /api/v1/stocks/screener
 *
 * Unified Screener Pro API across VN Equities:
 * Multi-dimensional filtering by valuation, profitability, health, technical momentum, and 1-click strategy presets.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const preset = (url.searchParams.get("preset") ?? "all").toLowerCase() as ScreenerPreset;
  const exchange = url.searchParams.get("exchange") ?? undefined;
  const sector = url.searchParams.get("sector") ?? undefined;
  const rawQ = url.searchParams.get("q");
  const q = rawQ ? rawQ.trim().slice(0, 50) : undefined;

  const filters = {
    preset,
    exchange: exchange && exchange !== "ALL" ? exchange : undefined,
    sector: sector || undefined,
    q: q || undefined,
    minPrice: num(url.searchParams.get("minPrice"), 0),
    maxPrice: num(url.searchParams.get("maxPrice"), 0),
    minChg: num(url.searchParams.get("minChg")),
    maxChg: num(url.searchParams.get("maxChg")),
    minVol: num(url.searchParams.get("minVol"), 0),
    maxVol: num(url.searchParams.get("maxVol"), 0),
    minTradingValue: num(url.searchParams.get("minTradingValue"), 0),
    minMarketCap: num(url.searchParams.get("minMarketCap"), 0),
    maxMarketCap: num(url.searchParams.get("maxMarketCap"), 0),
    minPe: num(url.searchParams.get("minPe")),
    maxPe: num(url.searchParams.get("maxPe")),
    minPb: num(url.searchParams.get("minPb")),
    maxPb: num(url.searchParams.get("maxPb")),
    minRoe: num(url.searchParams.get("minRoe")),
    maxRoe: num(url.searchParams.get("maxRoe")),
    minRoa: num(url.searchParams.get("minRoa")),
    maxRoa: num(url.searchParams.get("maxRoa")),
    minDivYield: num(url.searchParams.get("minDivYield"), 0),
    maxDivYield: num(url.searchParams.get("maxDivYield"), 0),
    maxDe: num(url.searchParams.get("maxDe"), 0),
    minQualityScore: num(url.searchParams.get("minQualityScore"), 0, 100),
    minRevenueYoy: num(url.searchParams.get("minRevenueYoy")),
    minNiYoy: num(url.searchParams.get("minNiYoy")),
    minQuantScore: num(url.searchParams.get("minQuantScore"), 0, 100),
    maxOuZScore: num(url.searchParams.get("maxOuZScore")),
    minRiskReward: num(url.searchParams.get("minRiskReward"), 0),
    minOrcaMasterScore: num(url.searchParams.get("minOrcaMasterScore"), 0, 99),
    minSmartMoneyScore: num(url.searchParams.get("minSmartMoneyScore"), 0, 100),
    minRsRating: num(url.searchParams.get("minRsRating"), 1, 99),
    minPiotroskiScore: num(url.searchParams.get("minPiotroskiScore"), 0, 9),
    minHistoricalEdgeScore: num(url.searchParams.get("minHistoricalEdgeScore"), 0, 100),
    minHistoricalWinRate: num(url.searchParams.get("minHistoricalWinRate"), 0, 100),
    minUpDownVolRatio: num(url.searchParams.get("minUpDownVolRatio"), 0, 10),
    minApexScore: num(url.searchParams.get("minApexScore"), 0, 99),
    maxExtensionBottom: num(url.searchParams.get("maxExtensionBottom")),
    sweetZoneOnly: url.searchParams.get("sweetZoneOnly") === "true" ? true : undefined,
    buyTriggerOnly: url.searchParams.get("buyTriggerOnly") === "true" ? true : undefined,
    minBuyTriggerScore: num(url.searchParams.get("minBuyTriggerScore"), 0, 100),
    maxBuyDiff: num(url.searchParams.get("maxBuyDiff")),
    buyZoneStatus: url.searchParams.get("buyZoneStatus") ?? undefined,
    buyPosition: url.searchParams.get("buyPosition") ?? undefined,
    volatilityCoil: url.searchParams.get("volatilityCoil") ?? undefined,
    vsaPattern: url.searchParams.get("vsaPattern") ?? undefined,
    faProfile: url.searchParams.get("faProfile") ?? undefined,
    techPattern: url.searchParams.get("techPattern") ?? undefined,
    minRoic: num(url.searchParams.get("minRoic")),
    minInterestCoverage: num(url.searchParams.get("minInterestCoverage")),
    minCfoToNp: num(url.searchParams.get("minCfoToNp")),
    minConsensusUpside: num(url.searchParams.get("minConsensusUpside")),
    maxPeg: num(url.searchParams.get("maxPeg")),
    netCashOnly: url.searchParams.get("netCashOnly") === "true" ? true : undefined,
    tightClosesOnly: url.searchParams.get("tightClosesOnly") === "true" ? true : undefined,
    vduOnly: url.searchParams.get("vduOnly") === "true" ? true : undefined,
    rsNewHighOnly: url.searchParams.get("rsNewHighOnly") === "true" ? true : undefined,
    wyckoffLpsOnly: url.searchParams.get("wyckoffLpsOnly") === "true" ? true : undefined,
    setupGradeOnly: (url.searchParams.get("setupGradeOnly")?.toUpperCase() as any) ?? undefined,
    goldenPocketOnly: url.searchParams.get("goldenPocketOnly") === "true" || url.searchParams.get("goldenPocketOnly") === "1" ? true : undefined,
    flipZoneOnly: url.searchParams.get("flipZoneOnly") === "true" || url.searchParams.get("flipZoneOnly") === "1" ? true : undefined,
    smcOrderBlockOnly: url.searchParams.get("smcOrderBlockOnly") === "true" || url.searchParams.get("smcOrderBlockOnly") === "1" ? true : undefined,
    sniperTriggerSubtype: (url.searchParams.get("sniperTriggerSubtype")?.toUpperCase() as any) ?? undefined,
    minSniperRR: num(url.searchParams.get("minSniperRR")),
    mtfOnly: url.searchParams.get("mtfOnly") === "true" ? true : undefined,
    mtfConsensus: url.searchParams.get("mtfConsensus") ?? undefined,
    mtfCandleOnly: url.searchParams.get("mtfCandleOnly") === "true" ? true : undefined,
    minMtfCandleScore: num(url.searchParams.get("minMtfCandleScore"), 0, 100),
    vsaOnly: url.searchParams.get("vsaOnly") === "true" ? true : undefined,
    minOverheadRoom: num(url.searchParams.get("minOverheadRoom")),
    rrgQuadrant: (url.searchParams.get("rrgQuadrant") as any) ?? undefined,
    sectorLeadingOnly: url.searchParams.get("sectorLeadingOnly") === "true" ? true : undefined,
    squeezeOnly: url.searchParams.get("squeezeOnly") === "true" ? true : undefined,
    squeezeFiredOnly: url.searchParams.get("squeezeFiredOnly") === "true" ? true : undefined,
    maRibbonSqueezeOnly: url.searchParams.get("maRibbonSqueezeOnly") === "true" ? true : undefined,
    maReclaimOnly: url.searchParams.get("maReclaimOnly") === "true" ? true : undefined,
    absorptionSpikeOnly: url.searchParams.get("absorptionSpikeOnly") === "true" ? true : undefined,
    vsaNoSupplyOnly: url.searchParams.get("vsaNoSupplyOnly") === "true" ? true : undefined,
    precisionMtfOnly: url.searchParams.get("precisionMtfOnly") === "true" ? true : undefined,
    maSignal: url.searchParams.get("maSignal") ?? undefined,
    sort: url.searchParams.get("sort") ?? "marketCap",
    order: (url.searchParams.get("order")
      ? url.searchParams.get("order") === "asc" ? "asc" : "desc"
      : (url.searchParams.get("sort") === "absBuyDiff" || url.searchParams.get("sort") === "buyPointDiffPct") ? "asc" : "desc") as "asc" | "desc",
    limit: Math.min(200, Math.max(1, Math.floor(num(url.searchParams.get("limit")) ?? 50))),
    offset: Math.max(0, Math.floor(num(url.searchParams.get("offset")) ?? 0)),
  };

  return safeApi({
    label: "stocks-screener-pro",
    guard: {
      wallMs: 25_000,
      maxSubrequests: 30,
      maxConcurrent: 4,
    },
    produce: async () => {
      const res = await queryScreenerStocks(filters);
      return {
        data: res,
        meta: res.meta,
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
        },
      };
    },
    fallback: async () => {
      // High-resilience fallback: Check if L1 in-memory master snapshot is available
      const lastSnapshot = getLastMasterSnapshot();
      if (lastSnapshot && lastSnapshot.items.length > 0) {
        try {
          const res = await queryScreenerStocks(filters);
          return {
            data: {
              ...res,
              meta: buildMeta({
                source: "screener-ram-fallback",
                sourceTimestampMs: Date.now(),
                stale: true,
                hasData: true,
                note: "Phục vụ từ bộ nhớ đệm RAM dự phòng — đang làm mới nền",
              }),
            },
          };
        } catch {
          // continue to basic fallback
        }
      }

      return {
        data: {
          items: [],
          total: 0,
          totalUniverse: 0,
          offset: 0,
          limit: filters.limit,
          presetsCount: {
            all: 0,
            apex_buy_now: 0,
            orca_apex_quant: 0,
            historical_edge: 0,
            orca_master_elite: 0,
            smart_money_inflow: 0,
            near_buy_point: 0,
            mtf_candle_cluster: 0,
            vsa_no_supply: 0,
            rs_leaders: 0,
            piotroski_diamonds: 0,
            mtf_confluence: 0,
            bottom_confluence: 0,
            quant_edge: 0,
            quant_mean_revert: 0,
            quant_low_beta: 0,
            quant_asymmetric: 0,
            confluence: 0,
            vcp: 0,
            ttm_squeeze: 0,
            canslim: 0,
            dividend: 0,
            growth: 0,
            value: 0,
            breakout: 0,
            ma_cross: 0,
          },
          sectorsAvailable: [],
          meta: buildMeta({
            source: "screener-fallback",
            sourceTimestampMs: Date.now(),
            stale: true,
            hasData: false,
            note: "Đang làm ấm dữ liệu bộ lọc — vui lòng thử lại sau giây lát",
          }),
        },
      };
    },
    unavailableSource: "stocks-screener-service",
    unavailableNote: "Hệ thống Screener Pro đang làm mới dữ liệu.",
  });
}
