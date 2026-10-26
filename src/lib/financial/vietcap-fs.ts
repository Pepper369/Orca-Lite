import "server-only";
import type { NormalizedMetrics, NormalizedPeriod, PeriodType, StatementScope } from "./types";
import { metricProfileForSymbol, type MetricProfile } from "./metric-dictionary";

const VIETCAP_BASE = "https://iq.vietcap.com.vn/api/iq-insight-service/v1";

const VIETCAP_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://iq.vietcap.com.vn",
  Referer: "https://iq.vietcap.com.vn/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

interface VietcapQuarterRaw {
  yearReport: number;
  lengthReport: number; // 1 = Q1, 2 = Q2, 3 = Q3, 4 = Q4, 5 = Year
  publicDate?: string | null;
  createDate?: string | null;
  updateDate?: string | null;
  [key: string]: unknown;
}

interface VietcapSectionResponse {
  successful?: boolean;
  data?: {
    quarters?: VietcapQuarterRaw[];
    years?: VietcapQuarterRaw[];
  };
}

async function fetchVietcapSection(
  symbol: string,
  section: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW",
  timeoutMs = 7_000,
): Promise<{ quarters: VietcapQuarterRaw[]; years: VietcapQuarterRaw[] }> {
  try {
    const url = `${VIETCAP_BASE}/company/${symbol}/financial-statement?section=${section}`;
    const res = await fetch(url, {
      headers: VIETCAP_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: 0 },
    });
    if (!res.ok) return { quarters: [], years: [] };
    const json = (await res.json()) as VietcapSectionResponse;
    return {
      quarters: Array.isArray(json.data?.quarters) ? json.data!.quarters : [],
      years: Array.isArray(json.data?.years) ? json.data!.years : [],
    };
  } catch {
    return { quarters: [], years: [] };
  }
}

function periodKey(year: number, lengthReport: number): string {
  if (lengthReport === 5) return String(year);
  return `${year}-Q${lengthReport}`;
}

function fiscalDateFromPeriod(year: number, lengthReport: number): string {
  if (lengthReport === 1) return `${year}-03-31`;
  if (lengthReport === 2) return `${year}-06-30`;
  if (lengthReport === 3) return `${year}-09-30`;
  return `${year}-12-31`;
}

function num(val: unknown): number | undefined {
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

/**
 * Fetch financial statements from Vietcap IQ Insight API (Fast public provider).
 * Returns normalized periods sorted newest first.
 */
export async function fetchVietcapFinancials(
  symbol: string,
  opts?: { limitPeriods?: number },
): Promise<{ periods: NormalizedPeriod[]; latencyMs: number; profile: MetricProfile } | null> {
  const sym = symbol.toUpperCase().trim();
  const profile = metricProfileForSymbol(sym);
  const limit = opts?.limitPeriods ?? 12;
  const t0 = performance.now();

  try {
    const [isData, bsData, cfData] = await Promise.all([
      fetchVietcapSection(sym, "INCOME_STATEMENT", 6_000),
      fetchVietcapSection(sym, "BALANCE_SHEET", 6_000),
      fetchVietcapSection(sym, "CASH_FLOW", 6_000),
    ]);

    // Map periods keyed by "YYYY-Qq" or "YYYY"
    const periodMap = new Map<
      string,
      {
        year: number;
        quarter: number | null;
        periodType: PeriodType;
        publicDate: string | null;
        updateDate: string | null;
        is?: VietcapQuarterRaw;
        bs?: VietcapQuarterRaw;
        cf?: VietcapQuarterRaw;
      }
    >();

    const recordRow = (
      r: VietcapQuarterRaw,
      section: "is" | "bs" | "cf",
      type: "quarter" | "year",
    ) => {
      const year = r.yearReport;
      const length = r.lengthReport;
      if (!year || !length) return;
      const key = periodKey(year, length);
      const cur = periodMap.get(key) ?? {
        year,
        quarter: length === 5 ? null : length,
        periodType: type === "year" || length === 5 ? "year" : "quarter",
        publicDate: r.publicDate ?? null,
        updateDate: r.updateDate ?? null,
      };
      cur[section] = r;
      if (!cur.publicDate && r.publicDate) cur.publicDate = r.publicDate;
      if (!cur.updateDate && r.updateDate) cur.updateDate = r.updateDate;
      periodMap.set(key, cur);
    };

    for (const r of isData.quarters) recordRow(r, "is", "quarter");
    for (const r of isData.years) recordRow(r, "is", "year");
    for (const r of bsData.quarters) recordRow(r, "bs", "quarter");
    for (const r of bsData.years) recordRow(r, "bs", "year");
    for (const r of cfData.quarters) recordRow(r, "cf", "quarter");
    for (const r of cfData.years) recordRow(r, "cf", "year");

    if (periodMap.size === 0) return null;

    const entries = [...periodMap.entries()].sort((a, b) => {
      const [ay, aq] = [a[1].year, a[1].quarter ?? 4];
      const [by, bq] = [b[1].year, b[1].quarter ?? 4];
      if (ay !== by) return by - ay;
      return bq - aq;
    });

    const periods: NormalizedPeriod[] = [];

    for (const [key, p] of entries) {
      const is = (p.is ?? {}) as Record<string, unknown>;
      const bs = (p.bs ?? {}) as Record<string, unknown>;
      const cf = (p.cf ?? {}) as Record<string, unknown>;

      const metrics: NormalizedMetrics = {};

      // Standard / Industrial metrics
      const grossRev = num(is.isa1);
      const netRev = num(is.isa3) ?? grossRev;
      if (netRev != null) metrics.netRevenue = netRev;
      if (grossRev != null) metrics.revenue = grossRev;

      const cogs = num(is.isa4);
      if (cogs != null) metrics.cogs = Math.abs(cogs);

      const gp = num(is.isa5);
      if (gp != null) metrics.grossProfit = gp;

      const op = num(is.isa11);
      if (op != null) metrics.operatingProfit = op;

      const interestExp = num(is.isa8) ?? num(is.isa7);
      if (interestExp != null) metrics.interestExpense = Math.abs(interestExp);

      const pbt = num(is.isa16);
      if (pbt != null) metrics.profitBeforeTax = pbt;

      const tax = num(is.isa17) ?? num(is.isa19);
      if (tax != null) metrics.taxExpense = Math.abs(tax);

      const npat = num(is.isa20);
      if (npat != null) metrics.netIncome = npat;

      const npatmi = num(is.isa22);
      if (npatmi != null) metrics.netIncomeParent = npatmi;

      // Bank specific metrics
      if (profile === "bank") {
        const netInterestIncome = num(is.isb25);
        if (netInterestIncome != null) {
          metrics.netRevenue = netInterestIncome;
          metrics.revenue = num(is.isb29) ?? netInterestIncome;
        }
        if (metrics.operatingProfit == null) {
          const bankOp = num(is.isb33) ?? num(is.isa11);
          if (bankOp != null) metrics.operatingProfit = bankOp;
        }
      }

      // Balance sheet metrics
      const currAssets = num(bs.bsa1);
      if (currAssets != null) metrics.currentAssets = currAssets;

      const cash = num(bs.bsa2);
      if (cash != null) metrics.cash = cash;

      const stInvest = num(bs.bsa5);
      if (stInvest != null) metrics.shortTermInvestments = stInvest;

      const receivables = num(bs.bsa8);
      if (receivables != null) metrics.receivables = receivables;

      const inventory = num(bs.bsa15);
      if (inventory != null) metrics.inventory = inventory;

      const nonCurrAssets = num(bs.bsa23);
      if (nonCurrAssets != null) metrics.longTermAssets = nonCurrAssets;

      const fixedAssets = num(bs.bsa29);
      if (fixedAssets != null) metrics.fixedAssets = fixedAssets;

      const totalAssets = num(bs.bsa53) ?? (currAssets && nonCurrAssets ? currAssets + nonCurrAssets : undefined);
      if (totalAssets != null) metrics.totalAssets = totalAssets;

      const totalLiab = num(bs.bsa54);
      if (totalLiab != null) metrics.totalLiabilities = totalLiab;

      const currLiab = num(bs.bsa55);
      if (currLiab != null) metrics.currentLiabilities = currLiab;

      const stDebt = num(bs.bsa57);
      if (stDebt != null) metrics.shortTermDebt = stDebt;

      const ltDebt = num(bs.bsa68);
      if (ltDebt != null) metrics.longTermDebt = ltDebt;

      const equity = num(bs.bsa78);
      if (equity != null) metrics.equity = equity;

      const retained = num(bs.bsa90);
      if (retained != null) metrics.retainedEarnings = retained;

      // Cash flow metrics
      const cfo = num(cf.cfa18) ?? num(cf.cfa9);
      if (cfo != null) metrics.operatingCashFlow = cfo;

      const cfi = num(cf.cfa26);
      if (cfi != null) metrics.investingCashFlow = cfi;

      const cff = num(cf.cfa34);
      if (cff != null) metrics.financingCashFlow = cff;

      const capex = num(cf.cfa19);
      if (capex != null) metrics.capex = Math.abs(capex);

      if (cfo != null && capex != null) {
        metrics.freeCashFlow = cfo - Math.abs(capex);
      }

      const cashEnd = num(cf.cfa38);
      if (cashEnd != null) metrics.cashEnd = cashEnd;

      periods.push({
        period: key,
        periodType: p.periodType,
        fiscalDate: fiscalDateFromPeriod(p.year, p.quarter ?? 4),
        year: p.year,
        quarter: p.quarter,
        statementScope: "consolidated" as StatementScope,
        auditStatus: p.periodType === "year" ? "audited" : "unaudited",
        currency: "VND",
        source: "vietcap-fs",
        sourceUrl: `https://iq.vietcap.com.vn/doanh-nghiep/${sym}/tai-chinh`,
        unit: "VND",
        filingDate: p.publicDate ?? p.updateDate ?? null,
        confidence: 0.95,
        metrics,
      });

      if (periods.length >= limit) break;
    }

    return {
      periods,
      latencyMs: Math.round(performance.now() - t0),
      profile,
    };
  } catch {
    return null;
  }
}
