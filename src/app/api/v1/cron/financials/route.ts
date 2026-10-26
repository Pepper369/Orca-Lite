import { ok, fail } from "@/lib/envelope";
import { warmFundamentalSnapshots } from "@/lib/financial/snapshots";
import { LIQUID_BOARD } from "@/lib/providers/public-vn-feed";
import { DEFAULT_SYMBOLS } from "@/lib/services/valuation-screener";
import { resolveListedEquityUniverse, listedEquityUniverseSync } from "@/lib/financial/equity-universe";
import { warmCanslimDefault, CANSLIM_DEFAULT_CAP } from "@/lib/services/canslim-screener";
import { screenFundamental } from "@/lib/services/fundamental-screener";
import { screenMinervini, type MinerviniScreenRow } from "@/lib/services/minervini-screener";
import { marketScanCycle, nextMarketScanOffset, writeMarketScanChunk } from "@/lib/services/market-screener-snapshots";
import { cronUnauthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** cronjob.org free/plan timeout is often 30s — finish before that. */
export const maxDuration = 30;

const BUDGET_MS = 25_000;

type Phase = "bctc" | "ohlcv" | "canslim" | "detect" | "auto";

function parsePhase(raw: string | null): Phase {
  const p = (raw ?? "auto").toLowerCase();
  if (p === "bctc" || p === "ohlcv" || p === "canslim" || p === "detect") return p;
  return "auto";
}

async function detectAndPrewarmNewBctcFilings(limit = 25): Promise<{
  detected: number;
  filings: Array<{ code: string; title: string; date: string; time?: string }>;
  invalidated: string[];
}> {
  try {
    const url =
      "https://api-finfo.vndirect.com.vn/v4/news?q=newsType:financialstatement&sort=newsDate:desc~newsTime:desc&size=30";
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { detected: 0, filings: [], invalidated: [] };
    const json = (await res.json()) as {
      data?: Array<{ tagCodes?: string; newsTitle?: string; newsDate?: string; newsTime?: string }>;
    };
    const rows = json.data ?? [];
    const valid = rows.filter((r) => r.tagCodes && /^[A-Z0-9]{3,8}$/.test(r.tagCodes.trim()));

    const uniqueSymbols = [
      ...new Set(valid.map((r) => r.tagCodes!.trim().toUpperCase())),
    ].slice(0, limit);
    const { invalidate } = await import("@/lib/cache");
    const invalidated: string[] = [];

    for (const sym of uniqueSymbols) {
      await Promise.allSettled([
        invalidate(`vnd-fs:periods:${sym}:v6:12`),
        invalidate(`vnd-fs:periods:${sym}:v7:12`),
        invalidate(`fin:pkg:${sym}:router:v5:standard`),
        invalidate(`fin:pkg:${sym}:router:v5:bank`),
        invalidate(`fin:pkg:${sym}:router:v5:securities`),
        invalidate(`fin:pkg:${sym}:router:v6:standard`),
        invalidate(`fin:pkg:${sym}:router:v6:bank`),
        invalidate(`fin:pkg:${sym}:router:v6:securities`),
      ]);
      invalidated.push(sym);
    }

    // Warm fresh BCTC
    const { fetchFinancialStatementsMulti } = await import("@/lib/financial/fs-multi");
    await Promise.allSettled(
      uniqueSymbols.slice(0, 8).map((sym) => fetchFinancialStatementsMulti(sym)),
    );

    return {
      detected: valid.length,
      filings: valid.slice(0, 10).map((r) => ({
        code: r.tagCodes!.trim().toUpperCase(),
        title: r.newsTitle ?? "",
        date: r.newsDate ?? "",
        time: r.newsTime,
      })),
      invalidated,
    };
  } catch {
    return { detected: 0, filings: [], invalidated: [] };
  }
}

/**
 * Warm BCTC / OHLCV / CANSLIM cache in 30s-safe phases (cronjob.org).
 *
 * Recommended (Asia/Ho_Chi_Minh), timeout 30s each:
 *   Chạy phase=bctc và phase=ohlcv theo từng lát, offset += limit tới hết universe.
 *   Chỉ snapshot đủ tất cả lát mới được công bố cho UI; các lát đang dở không ảnh hưởng dữ liệu đang phục vụ.
 */
export async function GET(req: Request) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  const t0 = Date.now();
  const url = new URL(req.url);
  const phase = parsePhase(url.searchParams.get("phase"));
  const explicitOffset = url.searchParams.has("offset");
  const requestedOffset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 30);
  const custom = (url.searchParams.get("symbols") ?? "")
    .split(/[,\s;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  let board = custom.length
    ? custom
    : [...new Set([...LIQUID_BOARD, ...DEFAULT_SYMBOLS.split(","), ...listedEquityUniverseSync(500)])];
  if (!custom.length) {
    try {
      const uni = await resolveListedEquityUniverse({ max: 600 });
      if (uni.symbols.length) board = uni.symbols;
    } catch {
      /* keep merged board */
    }
  }
  const fullUniverse = [...new Set(board.map((s) => s.toUpperCase()))];
  const cycle = marketScanCycle();
  let offset = requestedOffset;
  if (!custom.length && !explicitOffset && (phase === "bctc" || phase === "auto" || phase === "ohlcv")) {
    const scanPhase = phase === "ohlcv" ? "minervini" : "fundamental";
    const next = await nextMarketScanOffset({
      phase: scanPhase,
      cycle,
      universeSize: fullUniverse.length,
      chunkSize: limit,
    });
    if (next == null) {
      return ok({ ok: true, phase, scanComplete: true, cycle, universeSize: fullUniverse.length, note: "all slices complete for today's market cycle" });
    }
    offset = next;
  }

  try {
    const out: Record<string, unknown> = { ok: true, phase, durationMs: 0 };

    if (phase === "detect") {
      const det = await detectAndPrewarmNewBctcFilings(30);
      out.detection = det;
      out.durationMs = Date.now() - t0;
      out.note = `BCTC detector: tìm thấy ${det.detected} công bố BCTC mới, đã huỷ cache & pre-warm ${det.invalidated.length} mã.`;
      return ok(out);
    }

    if (phase === "bctc" || phase === "auto") {
      // Khi quét lát đầu tiên (offset=0), chạy BCTC detector để cập nhật ngay các DN vừa nộp hôm nay
      if (offset === 0) {
        try {
          const det = await detectAndPrewarmNewBctcFilings(15);
          out.detectedNewFilings = det;
        } catch {
          /* non-blocking */
        }
      }

      const slice = fullUniverse.slice(offset, offset + limit);
      if (!slice.length) {
        return ok({
          ok: true,
          phase,
          scanned: 0,
          warmed: 0,
          durationMs: Date.now() - t0,
          note: "empty BCTC slice",
        });
      }
      const r = await warmFundamentalSnapshots(slice, { concurrency: 8 });
      const screen = await screenFundamental({ symbols: slice, limit: slice.length });
      const scan = screen && !custom.length
        ? await writeMarketScanChunk({
            phase: "fundamental",
            cycle,
            universeSize: fullUniverse.length,
            chunkSize: limit,
            chunk: {
              offset,
              scanned: screen.scanned,
              withData: screen.withData,
              skipped: screen.skipped,
              rows: screen.rows,
              generatedAt: Date.now(),
            },
          })
        : null;
      out.scanned = r.scanned;
      out.warmed = r.warmed;
      out.scanSnapshot = scan;
      out.offset = offset;
      out.limit = limit;
      out.sliceSize = slice.length;
      out.universeSize = fullUniverse.length;
      out.note = `BCTC + fundamental scan slice offset=${offset} limit=${limit} / universe ${fullUniverse.length}`;
    }

    if (phase === "ohlcv") {
      const slice = fullUniverse.slice(offset, offset + limit);
      if (!slice.length) {
        return ok({ ok: true, phase, scanned: 0, universeSize: fullUniverse.length, note: "empty OHLCV slice" });
      }
      const screen = await screenMinervini({ symbols: slice, minPass: 0, limit: slice.length, skipQuotes: true });
      const scan = screen && !custom.length
        ? await writeMarketScanChunk<MinerviniScreenRow>({
            phase: "minervini",
            cycle,
            universeSize: fullUniverse.length,
            chunkSize: limit,
            chunk: {
              offset,
              scanned: screen.scanned,
              withData: Math.max(0, screen.scanned - screen.skipped),
              skipped: screen.skipped,
              rows: screen.rows,
              generatedAt: Date.now(),
            },
          })
        : null;
      out.ohlcvWarmed = Math.max(0, (screen?.scanned ?? 0) - (screen?.skipped ?? 0));
      out.scanned = screen?.scanned ?? 0;
      out.skipped = screen?.skipped ?? slice.length;
      out.offset = offset;
      out.limit = limit;
      out.universeSize = fullUniverse.length;
      out.scanSnapshot = scan;
      out.note = `Minervini + OHLCV slice offset=${offset} limit=${limit} / universe ${fullUniverse.length}`;
    }

    if (phase === "canslim") {
      const remaining = BUDGET_MS - (Date.now() - t0);
      if (remaining < 8_000) {
        out.canslim = null;
        out.note = "skip canslim — budget low";
      } else {
        const canslim = await warmCanslimDefault().catch(() => null);
        out.canslim = canslim;
        out.note = "CANSLIM result cache seed";
      }
    }

    out.durationMs = Date.now() - t0;
    return ok(out);
  } catch (e) {
    return fail(
      "CRON_FINANCIALS_ERROR",
      e instanceof Error ? e.message : "Warm BCTC thất bại",
      500,
    );
  }
}
