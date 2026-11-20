"use client";

import "@/app/stock-fs-table.css";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { fmtCompact, Loading, Panel, Unavailable, ErrorState, EmptyState, FreshnessAlertBanner } from "@/components/ui";
import dynamic from "next/dynamic";
import { financialsApiUrl, type FinTablePayload } from "@/components/stocks/financials-table-data";

const AiFinancialPanel = dynamic(
  () => import("@/components/stocks/ai-financial-panel").then((m) => m.AiFinancialPanel),
  { ssr: false },
);

type TabKey = "income" | "balance" | "cashflow" | "ratios";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "income", label: "Kết quả kinh doanh", short: "KQKD" },
  { key: "balance", label: "Cân đối kế toán", short: "CĐKT" },
  { key: "cashflow", label: "Lưu chuyển tiền tệ", short: "LCTT" },
  { key: "ratios", label: "Chỉ số tự động", short: "Chỉ số" },
];

const META_KEYS = new Set([
  "period",
  "year",
  "quarter",
  "fiscalDate",
  "source",
  "periodType",
  "metricProfile",
  "metricLabelsVi",
  "metricLabelsEn",
  "sourceUrl",
  "sourceUrls",
  "unit",
]);

const METRIC_VI: Record<string, string> = {
  revenue: "Doanh thu",
  netRevenue: "Doanh thu thuần",
  cogs: "Giá vốn hàng bán",
  grossProfit: "Lợi nhuận gộp",
  operatingProfit: "Lợi nhuận thuần từ HĐKD",
  ebit: "EBIT (LN trước lãi & thuế)",
  ebitda: "EBITDA",
  interestExpense: "Chi phí lãi vay",
  profitBeforeTax: "Lợi nhuận trước thuế",
  taxExpense: "Chi phí thuế TNDN",
  netIncome: "Lợi nhuận sau thuế",
  netIncomeParent: "LNST thuộc về công ty mẹ",
  cash: "Tiền và tương đương tiền",
  shortTermInvestments: "Đầu tư tài chính ngắn hạn",
  receivables: "Các khoản phải thu ngắn hạn",
  inventory: "Hàng tồn kho",
  currentAssets: "Tài sản ngắn hạn",
  fixedAssets: "Tài sản cố định",
  longTermAssets: "Tài sản dài hạn",
  totalAssets: "Tổng cộng tài sản",
  shortTermDebt: "Vay và nợ thuê tài chính ngắn hạn",
  longTermDebt: "Vay và nợ thuê tài chính dài hạn",
  currentLiabilities: "Nợ ngắn hạn",
  totalLiabilities: "Tổng nợ phải trả",
  equity: "Vốn chủ sở hữu",
  retainedEarnings: "Lợi nhuận sau thuế chưa phân phối",
  operatingCashFlow: "Lưu chuyển tiền thuần từ HĐKD",
  investingCashFlow: "Lưu chuyển tiền thuần từ HĐ đầu tư",
  financingCashFlow: "Lưu chuyển tiền thuần từ HĐ tài chính",
  capex: "Chi mua sắm TSCĐ (Capex)",
  freeCashFlow: "Dòng tiền tự do (FCF)",
  cashBegin: "Tiền và tương đương tiền đầu kỳ",
  cashEnd: "Tiền và tương đương tiền cuối kỳ",
  grossMargin: "Biên lợi nhuận gộp",
  operatingMargin: "Biên lợi nhuận HĐKD",
  netMargin: "Biên lợi nhuận ròng",
  roe: "ROE (LNST / Vốn chủ)",
  roa: "ROA (LNST / Tổng tài sản)",
  debtToEquity: "Hệ số nợ / Vốn chủ sở hữu",
  currentRatio: "Hệ số thanh toán hiện hành",
  ocfToNi: "OCF / Lợi nhuận sau thuế",
};

const HIDDEN_DUPLICATE_KEYS = new Set(["netProfit"]);

const ORDER: Record<TabKey, string[]> = {
  income: [
    "netRevenue",
    "revenue",
    "cogs",
    "grossProfit",
    "operatingProfit",
    "ebit",
    "ebitda",
    "interestExpense",
    "profitBeforeTax",
    "taxExpense",
    "netIncome",
    "netProfit",
    "netIncomeParent",
  ],
  balance: [
    "cash",
    "shortTermInvestments",
    "receivables",
    "inventory",
    "currentAssets",
    "fixedAssets",
    "longTermAssets",
    "totalAssets",
    "shortTermDebt",
    "currentLiabilities",
    "longTermDebt",
    "totalLiabilities",
    "equity",
    "retainedEarnings",
  ],
  cashflow: [
    "operatingCashFlow",
    "investingCashFlow",
    "financingCashFlow",
    "capex",
    "freeCashFlow",
    "cashBegin",
    "cashEnd",
  ],
  ratios: [
    "grossMargin",
    "operatingMargin",
    "netMargin",
    "roe",
    "roa",
    "debtToEquity",
    "currentRatio",
    "ocfToNi",
  ],
};

const RATIO_PCT_KEYS = new Set(["grossMargin", "operatingMargin", "netMargin", "roe", "roa"]);

function statusVi(s: string | undefined | null): string {
  switch (s) {
    case "VERIFIED":
      return "Đã xác thực";
    case "LATEST_AVAILABLE":
      return "Kỳ gần nhất hiện có";
    case "STALE":
      return "Bản lưu gần nhất";
    case "SOURCE_UNAVAILABLE":
      return "Nguồn không khả dụng";
    case "FRESH":
      return "Mới";
    default:
      return s ?? "—";
  }
}

function formatMetricValue(key: string, v: number): string {
  if (RATIO_PCT_KEYS.has(key)) return `${(v * 100).toFixed(1)}%`;
  if (key === "debtToEquity" || key === "currentRatio" || key === "ocfToNi") return v.toFixed(2);
  return fmtCompact(v);
}

function periodHeader(r: Record<string, unknown>): string {
  const p = r.period;
  if (typeof p === "string" && p) return p;
  const y = r.year;
  const q = r.quarter;
  if (y != null && q != null) return `${y}-Q${q}`;
  if (y != null) return String(y);
  return "—";
}

function sortColumnsPeriods<T extends { year?: number | null; quarter?: number | null }>(rows: T[]): T[] {
  const rank = (r: T): number => {
    const y = r.year ?? 0;
    return r.quarter == null ? y * 10 + 5 : y * 10 + (r.quarter - 1) * 1.2;
  };
  return [...rows].sort((a, b) => rank(b) - rank(a));
}

export function StockFinancialsView({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<TabKey>("income");

  const { res, data, isLoading, error, mutate } = useApi<FinTablePayload>(
    symbol ? financialsApiUrl(symbol) : null,
    { refreshInterval: 300_000, timeoutMs: 18_000, keepPreviousData: true },
  );

  if (!symbol) return <Loading rows={6} label="Đang mở BCTC…" />;

  const failNote = (() => {
    if (res && !res.success) {
      const msg = (res as { error?: { message?: string } }).error?.message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error;
    return "Nguồn báo cáo đang gián đoạn. Thử lại sau hoặc đối chiếu nguồn bên dưới.";
  })();

  if (isLoading && !data) {
    return (
      <div className="stock-workspace space-y-3">
        <Loading rows={6} label="Đang tải BCTC…" />
        <Panel title="Nguồn đối chiếu BCTC">
          <ul className="space-y-1.5 text-[12px]">
            <li>
              <a className="text-accent underline-offset-2 hover:underline" href={`https://dstock.vndirect.com.vn/bao-cao-ket-qua-kinh-doanh/${symbol}`} target="_blank" rel="noopener noreferrer">
                KQKD {symbol} ↗
              </a>
            </li>
            <li>
              <a className="text-accent underline-offset-2 hover:underline" href={`https://dstock.vndirect.com.vn/bang-can-doi-ke-toan/${symbol}`} target="_blank" rel="noopener noreferrer">
                Cân đối kế toán {symbol} ↗
              </a>
            </li>
          </ul>
        </Panel>
      </div>
    );
  }

  if (!data?.financials) {
    return (
      <div className="stock-workspace space-y-3">
        <ErrorState
          title={`Không lấy được BCTC ${symbol || ""}`}
          message={failNote || "Không thể kết nối hoặc dữ liệu BCTC từ nhà cung cấp đang tạm dừng."}
          onRetry={() => void mutate()}
        />
        <Panel title="Nguồn đối chiếu BCTC">
          <ul className="space-y-1.5 text-[12px]">
            <li>
              <a className="break-all text-accent underline-offset-2 hover:underline" href={`https://dstock.vndirect.com.vn/bang-can-doi-ke-toan/${symbol}`} target="_blank" rel="noopener noreferrer">
                dstock…/bang-can-doi-ke-toan/{symbol}
              </a>
            </li>
            <li>
              <a className="break-all text-accent underline-offset-2 hover:underline" href={`https://dstock.vndirect.com.vn/bao-cao-ket-qua-kinh-doanh/${symbol}`} target="_blank" rel="noopener noreferrer">
                dstock…/bao-cao-ket-qua-kinh-doanh/{symbol}
              </a>
            </li>
            <li>
              <a className="break-all text-accent underline-offset-2 hover:underline" href={`https://dstock.vndirect.com.vn/bao-cao-luu-chuyen-tien-te/${symbol}`} target="_blank" rel="noopener noreferrer">
                dstock…/bao-cao-luu-chuyen-tien-te/{symbol}
              </a>
            </li>
          </ul>
        </Panel>
      </div>
    );
  }

  const fm = (data.packageMeta as {
    primarySource?: string;
    latestPeriod?: string;
    reportTypeLabel?: string;
    statementScope?: string;
    freshnessStatus?: string;
    note?: string;
    unit?: string;
  } | null) ?? null;
  const sourceLabel = typeof fm?.primarySource === "string" ? fm.primarySource : "vndirect-fs";
  const fin = data.financials;
  const rawList = fin[tab];
  const rawRows: Record<string, unknown>[] = Array.isArray(rawList)
    ? (rawList.filter((x) => x && typeof x === "object") as Record<string, unknown>[])
    : [];

  const columns = sortColumnsPeriods(
    rawRows as (Record<string, unknown> & { year?: number | null; quarter?: number | null })[],
  );

  const seen = new Set<string>();
  const explicit = ORDER[tab];
  const metricKeys: string[] = [];

  for (const k of explicit) {
    if (HIDDEN_DUPLICATE_KEYS.has(k)) continue;
    metricKeys.push(k);
    seen.add(k);
  }

  for (const r of rawRows) {
    for (const k of Object.keys(r)) {
      if (META_KEYS.has(k) || seen.has(k) || HIDDEN_DUPLICATE_KEYS.has(k)) continue;
      seen.add(k);
      metricKeys.push(k);
    }
  }

  const periodsDesc = columns.map(periodHeader);
  const unitsLabel = typeof fm?.unit === "string" && fm.unit ? fm.unit : "VND";

  return (
    <div className="stock-workspace space-y-3">
      <AiFinancialPanel symbol={symbol} />

      <Panel pad={false}>
        <div className="stock-fs-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`stock-fs-tab-btn rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  tab === t.key
                    ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="stock-fs-unit">Đơn vị: {unitsLabel}</span>
            <span className="stock-fs-sep">·</span>
            <span className="stock-fs-src truncate max-w-[140px] sm:max-w-none" title={sourceLabel}>
              Nguồn: {sourceLabel}
            </span>
            <button
              type="button"
              onClick={() => void mutate()}
              className="ml-1 inline-flex items-center gap-1 text-accent-primary hover:underline"
            >
              Làm mới
            </button>
          </div>
        </div>

        {columns.length === 0 ? (
          <EmptyState
            title="Chưa có số liệu cho tab này"
            description={`Bảng ${TABS.find((t) => t.key === tab)?.label ?? tab} chưa có kỳ báo cáo nào.`}
          />
        ) : (
          <div className="stock-fs-scroll overflow-x-auto">
            <table className="stock-fs-table w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-line bg-surface-elevated/40 text-text-muted">
                  <th className="sticky left-0 z-10 min-w-[200px] bg-surface-base px-3 py-2 font-medium backdrop-blur-xs">
                    Chỉ tiêu
                  </th>
                  {periodsDesc.map((p, i) => (
                    <th key={i} className="min-w-[100px] px-2 py-2 text-right font-medium">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40 font-mono">
                {metricKeys.map((k) => {
                  const label = METRIC_VI[k] ?? k;
                  const hasAny = columns.some((col) => {
                    const v = col[k];
                    return typeof v === "number" && !Number.isNaN(v);
                  });
                  if (!hasAny && !explicit.includes(k)) return null;

                  return (
                    <tr key={k} className="hover:bg-surface-elevated/30">
                      <td className="sticky left-0 z-10 bg-surface-base px-3 py-1.5 font-sans font-medium text-text-primary backdrop-blur-xs">
                        {label}
                      </td>
                      {columns.map((col, idx) => {
                        const val = col[k];
                        const n = typeof val === "number" && !Number.isNaN(val) ? val : null;
                        return (
                          <td key={idx} className="px-2 py-1.5 text-right tabular-nums">
                            {n != null ? (
                              <span className={n < 0 ? "text-down font-medium" : "text-text-primary"}>
                                {formatMetricValue(k, n)}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.notes && data.notes.length > 0 ? (
          <ul className="border-t border-line px-3 py-2 text-[11px] text-text-muted space-y-0.5">
            {data.notes.map((n, i) => (
              <li key={i}>· {typeof n === "string" ? n : String(n)}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Trạng thái báo cáo">
        <div className="stock-fs-status grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase text-ink-3">Dữ liệu mới nhất</div>
            <div className="font-medium text-ink-2">{fm?.latestPeriod ?? "Chưa xác định kỳ"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-3">Loại báo cáo</div>
            <div className="font-medium text-ink-2">{fm?.reportTypeLabel ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-3">Phạm vi</div>
            <div className="font-medium text-ink-2">
              {fm?.statementScope === "consolidated"
                ? "Hợp nhất"
                : fm?.statementScope === "standalone"
                  ? "Riêng"
                  : "Chưa phân loại"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-ink-3">Trạng thái</div>
            <div className="font-medium text-ink-2">{statusVi(fm?.freshnessStatus)}</div>
          </div>
        </div>
      </Panel>

      <Panel title="Nguồn đối chiếu BCTC">
        <ul className="space-y-1.5 text-[12px]">
          <li>
            <span className="text-ink-3">Bảng cân đối kế toán: </span>
            <a
              className="break-all text-accent underline-offset-2 hover:underline"
              href={`https://dstock.vndirect.com.vn/bang-can-doi-ke-toan/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              dstock.vndirect.com.vn/bang-can-doi-ke-toan/{symbol}
            </a>
          </li>
          <li>
            <span className="text-ink-3">Kết quả kinh doanh: </span>
            <a
              className="break-all text-accent underline-offset-2 hover:underline"
              href={`https://dstock.vndirect.com.vn/bao-cao-ket-qua-kinh-doanh/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              dstock.vndirect.com.vn/bao-cao-ket-qua-kinh-doanh/{symbol}
            </a>
          </li>
          <li>
            <span className="text-ink-3">Lưu chuyển tiền tệ: </span>
            <a
              className="break-all text-accent underline-offset-2 hover:underline"
              href={`https://dstock.vndirect.com.vn/bao-cao-luu-chuyen-tien-te/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              dstock.vndirect.com.vn/bao-cao-luu-chuyen-tien-te/{symbol}
            </a>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
