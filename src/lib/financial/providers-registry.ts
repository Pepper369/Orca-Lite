import "server-only";
import type { FinancialProvider } from "./provider";
import { env } from "../env";
import { fetchVndirectFinancials } from "./vndirect-fs";
import { fetchVietcapFinancials } from "./vietcap-fs";
import { fetchVnstockFinancials } from "./vnstock-provider";
import { ssiFcConfigured } from "../providers/ssi-fcdata";

/**
 * Financial Provider Layout
 *
 * Returns the provider layout keyed on callsite-relative `.market.primary` / `.financial.primary`.
 *
 * We keep one canonical place for provider topology so `.vnProviderLayout()` never relies on
 * brittle relative requires to provider modules.
 */
export interface VnProviderLayout {
  market: {
    primary: "vndirect";
    fallback: "ssi-fcdata" | "vndirect";
  };
  financial: {
    primary: "vndirect";
    fallback: "vietcap-fs" | "vnstock-financial" | "vndirect";
  };
}

export function vnProviderLayout(): VnProviderLayout {
  // Market + BCTC ưu tiên nguồn công khai (không API key).
  // VNDirect DStock/api-finfo = primary public cho quotes + financial statements.
  // Vietcap IQ = secondary public BCTC provider (tự động cập nhật không cần API key).
  // SSI FastConnect (credential) chỉ là optional enrichment — không bắt buộc.
  // VNStock API (key) = tertiary BCTC khi có cấu hình.
  const ssiLive = ssiFcConfigured();
  return {
    market: {
      primary: "vndirect",
      fallback: ssiLive ? "ssi-fcdata" : "vndirect",
    },
    financial: {
      primary: "vndirect",
      fallback: "vietcap-fs",
    },
  };
}

const vndirectProvider: FinancialProvider = {
  id: "vndirect-fs",
  role: "PRIMARY_SOURCE_OF_TRUTH",
  priority: 1,
  enabled: () => true,
  fetch: async (symbol, opts) => {
    const r = await fetchVndirectFinancials(symbol, opts);
    if (!r) return null;
    return {
      periods: r.periods,
      latencyMs: r.latencyMs,
      sourceId: "vndirect-fs",
      role: "PRIMARY_SOURCE_OF_TRUTH",
      priority: 1,
      note: "VNDirect DStock / api-finfo financial_statements — nguồn công khai (không API key)",
    };
  },
};

const vietcapProvider: FinancialProvider = {
  id: "vietcap-fs",
  role: "SECONDARY_FALLBACK",
  priority: 2,
  enabled: () => true,
  fetch: async (symbol, opts) => {
    const r = await fetchVietcapFinancials(symbol, opts);
    if (!r) return null;
    return {
      periods: r.periods,
      latencyMs: r.latencyMs,
      sourceId: "vietcap-fs",
      role: "SECONDARY_FALLBACK",
      priority: 2,
      note: "Vietcap IQ Insight Service — nguồn công khai thời gian thực",
    };
  },
};

const vnstockProvider: FinancialProvider = {
  id: "vnstock-financial",
  role: "SECONDARY_FALLBACK",
  priority: 3,
  enabled: () => Boolean(env.vnstockApiKey && env.vnstockBaseUrl),
  fetch: async (symbol, opts) => {
    const r = await fetchVnstockFinancials(symbol, opts);
    if (!r) return null;
    return {
      periods: r.periods,
      latencyMs: r.latencyMs,
      sourceId: "vnstock-financial",
      role: "SECONDARY_FALLBACK",
      priority: 3,
      note: "Fallback VNStock API (chỉ bật khi cấu hình cả base URL và API key)",
    };
  },
};

export function listFinancialProviders(): FinancialProvider[] {
  return [vndirectProvider, vietcapProvider, vnstockProvider];
}
