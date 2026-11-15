import "server-only";
import { cached } from "../cache";
import { buildMeta } from "../freshness";
import { fetchWorldBankMacro, type WorldBankMacroBundle } from "../providers/worldbank";
import type { Meta } from "../types";
import { BOOTSTRAP_WORLDBANK_VN } from "../bootstrap-data";

const TTL_MS = 6 * 60 * 60_000; // annual series — refresh a few times per day
const STALE_MS = 7 * 24 * 60 * 60_000;

export async function getWorldBankMacro(
  countryIso2 = "VN",
): Promise<{ data: WorldBankMacroBundle; meta: Meta } | null> {
  try {
    const result = await cached(`macro:worldbank:${countryIso2.toUpperCase()}:v1`, {
      ttlMs: TTL_MS,
      staleMs: STALE_MS,
      producer: async () => fetchWorldBankMacro(countryIso2),
    });
    const data = result.value;
    const fetchedMs = Date.parse(data.fetchedAt);
    const meta = buildMeta({
      source: "worldbank",
      sourceTimestampMs: Number.isFinite(fetchedMs) ? fetchedMs : null,
      hasData: data.series.length > 0,
      degraded: data.warnings.length > 0,
      cached: result.cached,
      stale: result.stale,
      latencyMs: data.latencyMs,
      partial: data.warnings.length > 0,
      note:
        "Chuỗi World Bank (thường niên). Trạng thái freshness phản ánh lần đồng bộ, không phải kỳ quan sát cuối.",
      slas: {
        liveSlaMs: -1,
        freshSlaMs: TTL_MS,
        delayedSlaMs: STALE_MS,
      },
    });
    return { data, meta };
  } catch {
    if (countryIso2.toUpperCase() === "VN") {
      const data = BOOTSTRAP_WORLDBANK_VN;
      const meta = buildMeta({
        source: "bootstrap-snapshot",
        sourceTimestampMs: Date.now(),
        hasData: true,
        degraded: false,
        cached: true,
        stale: true,
        latencyMs: 5,
        partial: true,
        note: "Chuỗi World Bank Việt Nam phục hồi từ bootstrap snapshot.",
        slas: { liveSlaMs: -1, freshSlaMs: TTL_MS, delayedSlaMs: STALE_MS },
      });
      return { data, meta };
    }
    return null;
  }
}
