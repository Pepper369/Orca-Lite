"use client";

import { memo } from "react";
import { FileText, Download, ExternalLink, TrendingUp, Award, Target, Percent } from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { StockReportsResult } from "@/lib/services/stock-reports";
import { Loading, Panel, EmptyState } from "@/components/ui";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    const [y, m, day] = d.split("-");
    if (y && m && day) return `${day}/${m}/${y}`;
    return d;
  } catch {
    return d;
  }
};

const fmtPrice = (p: number | null) => {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toLocaleString("vi-VN") + " ₫";
};

function getRatingBadge(rating: string | null) {
  if (!rating) return null;
  const upper = rating.toUpperCase();
  if (upper.includes("MUA") || upper.includes("BUY") || upper.includes("KHẢ QUAN") || upper.includes("OUTPERFORM")) {
    return <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">MUA</span>;
  }
  if (upper.includes("TĂNG TỶ TRỌNG") || upper.includes("ADD") || upper.includes("ACCUMULATE")) {
    return <span className="rounded bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-400">TĂNG TỶ TRỌNG</span>;
  }
  if (upper.includes("NẮM GIỮ") || upper.includes("HOLD") || upper.includes("NEUTRAL")) {
    return <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">NẮM GIỮ</span>;
  }
  return <span className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-400">{rating}</span>;
}

export const AnalyticReportsPanel = memo(function AnalyticReportsPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useApi<StockReportsResult>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/reports?limit=10` : null,
    { refreshInterval: 300_000 }
  );

  const title = (
    <span className="flex items-center gap-2">
      <FileText className="size-4 text-accent-primary" /> Báo Cáo Phân Tích & Định Giá Mục Tiêu ({symbol})
    </span>
  );

  if (isLoading && !data) {
    return (
      <Panel title={title}>
        <Loading rows={3} />
      </Panel>
    );
  }

  const reports = data?.reports ?? [];
  if (!reports.length) {
    return (
      <Panel title={title}>
        <EmptyState
          title={`Chưa có báo cáo phân tích cho ${symbol}`}
          description="Chưa có báo cáo định giá hoặc bản tin Earnings Flash từ khối phân tích VNDirect Research cho mã này."
        />
      </Panel>
    );
  }

  return (
    <Panel title={title}>
      {/* Target Price Highlight Banner */}
      {(data?.latestTargetPrice || data?.latestRating) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-primary/25 bg-accent-primary/5 p-3">
          <div className="flex items-center gap-2">
            <Target className="size-5 text-accent-primary" />
            <div>
              <span className="text-[12px] text-text-muted">Định giá mục tiêu khuyến nghị gần nhất:</span>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-text-primary">
                  {fmtPrice(data.latestTargetPrice)}
                </span>
                {getRatingBadge(data.latestRating)}
              </div>
            </div>
          </div>
          <div className="text-right text-[11px] text-text-muted">
            Nguồn: Khối Phân Tích VNDirect Research · {reports.length} báo cáo
          </div>
        </div>
      )}

      {/* Reports List */}
      <div className="space-y-3">
        {reports.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-3.5 transition-colors hover:border-border-default"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex-1 text-[13px] font-medium leading-snug text-text-primary hover:text-accent-primary"
              >
                {r.title}
                <ExternalLink className="ml-1.5 inline size-3 opacity-40 group-hover:opacity-100" />
              </a>
              <div className="flex items-center gap-2 shrink-0">
                {getRatingBadge(r.rating)}
                {r.pdfUrl && (
                  <a
                    href={r.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded bg-accent-primary/15 px-2 py-1 text-[11px] font-medium text-accent-primary hover:bg-accent-primary/25 transition-colors"
                    title="Mở file PDF Báo cáo chính thức"
                  >
                    <Download className="size-3" />
                    <span>Tải PDF</span>
                  </a>
                )}
              </div>
            </div>

            {/* Target Price & Metrics Pill */}
            {(r.targetPrice || r.dividendYield || r.marketPrice) && (
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                {r.targetPrice && (
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <Target className="size-3.5" />
                    <span>Mục tiêu: {fmtPrice(r.targetPrice)}</span>
                  </span>
                )}
                {r.marketPrice && (
                  <span className="text-text-muted">
                    Thị giá lúc phát hành: {fmtPrice(r.marketPrice)}
                  </span>
                )}
                {r.dividendYield && (
                  <span className="flex items-center gap-1 text-blue-400">
                    <Percent className="size-3.5" />
                    <span>Cổ tức: {r.dividendYield}</span>
                  </span>
                )}
              </div>
            )}

            {/* Abstract / Summary */}
            {r.abstract && (
              <p className="text-[12px] leading-relaxed text-text-secondary line-clamp-2">
                {r.abstract}
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] text-text-muted pt-1 border-t border-border-subtle/50">
              <span>{r.source}</span>
              <span>{fmtDate(r.date)}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
});
