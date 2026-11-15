import { ok, unavailable, badRequest } from "@/lib/envelope";
import { getWorldBankMacro } from "@/lib/services/macro-worldbank";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/macro/worldbank?country=VN
 * Structured World Bank macro series (no API key).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "VN").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return badRequest("country phải là mã ISO2 (vd: VN, US)");
  }

  let result = await getWorldBankMacro(country);
  if (!result && country === "VN") {
    const { BOOTSTRAP_WORLDBANK_VN } = await import("@/lib/bootstrap-data");
    const { buildMeta } = await import("@/lib/freshness");
    result = {
      data: BOOTSTRAP_WORLDBANK_VN,
      meta: buildMeta({
        source: "bootstrap-snapshot",
        sourceTimestampMs: Date.now(),
        hasData: true,
        degraded: false,
        cached: true,
        stale: true,
        latencyMs: 5,
        partial: true,
        note: "Chuỗi World Bank Việt Nam phục hồi từ bootstrap snapshot.",
      }),
    };
  }
  if (!result) {
    return unavailable(
      "worldbank",
      `Chưa lấy được chuỗi macro World Bank cho ${country}. Thử lại sau.`,
    );
  }
  return ok(result.data, result.meta, {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  });
}
