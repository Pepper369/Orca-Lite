import { screenWyckoff } from "@/lib/services/wyckoff-screener";
import type { WyckoffPhase } from "@/lib/engines/wyckoff-elliott";
import type { WyckoffSetup } from "@/lib/services/wyckoff-screener";
import { safeApi } from "@/lib/safe-api";
import { WORKERS_BUDGET } from "@/lib/data-engine/workers-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 25;

const PHASES = new Set<WyckoffPhase>([
  "accumulation",
  "markup",
  "distribution",
  "markdown",
  "re-accumulation",
  "re-distribution",
  "unknown",
]);

const SETUPS = new Set<WyckoffSetup>([
  "spring",
  "spring-tested",
  "lps-pullback",
  "upthrust",
  "sos-breakout",
  "sow-breakdown",
  "accumulation-range",
  "distribution-range",
  "markup",
  "markdown",
  "watch",
]);

/** GET /api/v1/screener/wyckoff */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const phaseRaw = (url.searchParams.get("phase") ?? "all").toLowerCase();
  const setupRaw = (url.searchParams.get("setup") ?? "all").toLowerCase();
  const phase = phaseRaw === "all" ? "all" : PHASES.has(phaseRaw as WyckoffPhase) ? (phaseRaw as WyckoffPhase) : "all";
  const setup = setupRaw === "all" ? "all" : SETUPS.has(setupRaw as WyckoffSetup) ? (setupRaw as WyckoffSetup) : "all";
  const minConfidence = url.searchParams.get("minConfidence") != null ? Number(url.searchParams.get("minConfidence")) : 40;
  const sector = url.searchParams.get("sector") || undefined;
  const trModelRaw = (url.searchParams.get("trModel") ?? "all");
  const trModel = trModelRaw === "Base" || trModelRaw === "Top" ? trModelRaw : "all";
  const vsaTagRaw = (url.searchParams.get("vsaTag") ?? "all");
  const vsaTag = vsaTagRaw === "ultra-high" || vsaTagRaw === "high" || vsaTagRaw === "low" || vsaTagRaw === "normal" ? vsaTagRaw : "all";
  const channelPosRaw = (url.searchParams.get("channelPos") ?? "all");
  const channelPos = channelPosRaw === "ice" || channelPosRaw === "mid" || channelPosRaw === "creek" || channelPosRaw === "breakout" ? channelPosRaw : "all";
  const minCauseWeeks = url.searchParams.get("minCauseWeeks") ? Number(url.searchParams.get("minCauseWeeks")) : undefined;
  const minRr1 = url.searchParams.get("minRr1") ? Number(url.searchParams.get("minRr1")) : undefined;
  const onlyLeaders = url.searchParams.get("onlyLeaders") === "true";
  const symbols = (url.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40) || 40, 60);

  return safeApi({
    label: "screener-wyckoff",
    guard: { wallMs: WORKERS_BUDGET.techScreenWallMs, maxSubrequests: 24, maxConcurrent: 3 },
    produce: async () => {
      const r = await screenWyckoff({
        symbols: symbols.length ? symbols : undefined,
        phase,
        setup,
        trModel,
        vsaTag,
        channelPos,
        minCauseWeeks: Number.isFinite(minCauseWeeks) ? minCauseWeeks : undefined,
        minRr1: Number.isFinite(minRr1) ? minRr1 : undefined,
        onlyLeaders,
        minConfidence: Number.isFinite(minConfidence) ? minConfidence : 40,
        sector,
        limit,
      });
      if (!r) return null;
      return {
        data: { universe: "wyckoff", rows: r.rows, scanned: r.scanned, skipped: r.skipped, roro: r.roro },
        meta: r.meta,
      };
    },
    fallback: async () => ({
      data: { universe: "wyckoff", rows: [], scanned: 0, skipped: 0 },
      meta: { source: "wyckoff-shell", partial: true, stale: true, note: "OHLCV tạm lỗi — thử lại sau" },
    }),
    unavailableSource: "wyckoff-screener",
    unavailableNote: "Wyckoff screener tạm không khả dụng",
  });
}
