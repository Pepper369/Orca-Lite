import { queryScreenerStocks, type ScreenerPreset } from "@/lib/services/screener-snapshot-service";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";
import { buildMeta } from "@/lib/freshness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
  const q = url.searchParams.get("q") ?? undefined;

  const filters = {
    preset,
    exchange: exchange && exchange !== "ALL" ? exchange : undefined,
    sector: sector || undefined,
    q: q || undefined,
    minPrice: num(url.searchParams.get("minPrice")),
    maxPrice: num(url.searchParams.get("maxPrice")),
    minChg: num(url.searchParams.get("minChg")),
    maxChg: num(url.searchParams.get("maxChg")),
    minVol: num(url.searchParams.get("minVol")),
    maxVol: num(url.searchParams.get("maxVol")),
    minMarketCap: num(url.searchParams.get("minMarketCap")),
    maxMarketCap: num(url.searchParams.get("maxMarketCap")),
    minPe: num(url.searchParams.get("minPe")),
    maxPe: num(url.searchParams.get("maxPe")),
    minPb: num(url.searchParams.get("minPb")),
    maxPb: num(url.searchParams.get("maxPb")),
    minRoe: num(url.searchParams.get("minRoe")),
    maxRoe: num(url.searchParams.get("maxRoe")),
    minRoa: num(url.searchParams.get("minRoa")),
    maxRoa: num(url.searchParams.get("maxRoa")),
    minDivYield: num(url.searchParams.get("minDivYield")),
    maxDivYield: num(url.searchParams.get("maxDivYield")),
    maxDe: num(url.searchParams.get("maxDe")),
    minQualityScore: num(url.searchParams.get("minQualityScore")),
    minRevenueYoy: num(url.searchParams.get("minRevenueYoy")),
    minNiYoy: num(url.searchParams.get("minNiYoy")),
    minQuantScore: num(url.searchParams.get("minQuantScore")),
    maxOuZScore: num(url.searchParams.get("maxOuZScore")),
    minRiskReward: num(url.searchParams.get("minRiskReward")),
    maSignal: url.searchParams.get("maSignal") ?? undefined,
    sort: url.searchParams.get("sort") ?? "marketCap",
    order: (url.searchParams.get("order") === "asc" ? "asc" : "desc") as "asc" | "desc",
    limit: num(url.searchParams.get("limit")) ?? 50,
    offset: num(url.searchParams.get("offset")) ?? 0,
  };

  return safeApi({
    label: "stocks-screener-pro",
    guard: {
      wallMs: WORKERS_BUDGET?.techScreenWallMs ?? 15_000,
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
    fallback: async () => ({
      data: {
        items: [],
        total: 0,
        totalUniverse: 0,
        offset: 0,
        limit: filters.limit,
        presetsCount: { all: 0, canslim: 0, dividend: 0, growth: 0, value: 0, breakout: 0 },
        sectorsAvailable: [],
        meta: buildMeta({
          source: "screener-fallback",
          sourceTimestampMs: Date.now(),
          stale: true,
          hasData: false,
          note: "Đang làm ấm dữ liệu bộ lọc — vui lòng thử lại sau giây lát",
        }),
      },
    }),
    unavailableSource: "stocks-screener-service",
    unavailableNote: "Hệ thống Screener Pro đang làm mới dữ liệu.",
  });
}
