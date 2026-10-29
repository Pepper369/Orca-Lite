"use client";

import { memo, useState, useMemo } from "react";
import {
  FileText,
  FileCheck2,
  Download,
  ExternalLink,
  Building2,
  Calendar,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { StockDisclosuresResult } from "@/lib/services/stock-disclosures";
import type { SignedDisclosureDocument } from "@/lib/providers/vndirect-news";
import { Loading, Panel } from "@/components/ui";

const formatDate = (d: string | null) => {
  if (!d) return "—";
  const [yyyy, mm, dd] = d.slice(0, 10).split("-");
  return dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : d;
};

export const SignedDisclosuresPanel = memo(function SignedDisclosuresPanel({
  symbol,
}: {
  symbol: string;
}) {
  const [tab, setTab] = useState<"all" | "fs" | "resolutions">("all");

  const { data, isLoading } = useApi<StockDisclosuresResult>(
    symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/disclosures?limit=30` : null
  );

  const docs = useMemo(() => data?.documents ?? [], [data?.documents]);

  const filteredDocs = useMemo(() => {
    if (tab === "all") return docs;
    if (tab === "fs") {
      return docs.filter(
        (d) =>
          d.type === "financialstatement" ||
          /BCTC|Báo cáo tài chính|kiểm toán/i.test(d.title)
      );
    }
    if (tab === "resolutions") {
      return docs.filter(
        (d) =>
          d.type !== "financialstatement" &&
          !/BCTC|Báo cáo tài chính/i.test(d.title)
      );
    }
    return docs;
  }, [docs, tab]);

  if (isLoading && !data) {
    return (
      <Panel title="Văn bản BCTC & Công văn ký số HOSE/HNX">
        <Loading rows={4} />
      </Panel>
    );
  }

  if (!docs.length) {
    return (
      <Panel title="Văn bản BCTC & Công văn ký số HOSE/HNX">
        <div className="py-8 text-center text-xs text-text-muted">
          Chưa có văn bản công bố ký số cho mã {symbol}.
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-emerald-400" />
          <span>Văn Bản BCTC & Công Văn Giải Trình Ký Số (HOSE/HNX)</span>
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            {data?.pdfCount ?? 0} tệp PDF ký số
          </span>
        </div>
      }
    >
      <div className="space-y-3.5">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === "all"
                  ? "bg-accent-primary text-text-on-accent"
                  : "bg-surface-elevated/60 text-text-muted hover:text-text-primary"
              }`}
            >
              Tất cả ({docs.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("fs")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === "fs"
                  ? "bg-accent-primary text-text-on-accent"
                  : "bg-surface-elevated/60 text-text-muted hover:text-text-primary"
              }`}
            >
              Báo cáo tài chính ({docs.filter(
                (d) => d.type === "financialstatement" || /BCTC|Báo cáo tài chính|kiểm toán/i.test(d.title)
              ).length})
            </button>
            <button
              type="button"
              onClick={() => setTab("resolutions")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === "resolutions"
                  ? "bg-accent-primary text-text-on-accent"
                  : "bg-surface-elevated/60 text-text-muted hover:text-text-primary"
              }`}
            >
              Nghị quyết & Giải trình
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <ShieldCheck className="size-3.5 text-accent-primary" />
            <span>Nguồn cấp từ Sở Giao Dịch & Hệ Thống Finfo</span>
          </div>
        </div>

        {/* Documents List */}
        <div className="divide-y divide-border-subtle/50">
          {filteredDocs.map((doc) => {
            const isFs =
              doc.type === "financialstatement" ||
              /BCTC|Báo cáo tài chính|kiểm toán/i.test(doc.title);

            return (
              <div
                key={doc.id}
                className="group py-3 first:pt-0 last:pb-0 transition-colors hover:bg-surface-elevated/30 rounded-lg px-2 -mx-2"
              >
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 flex-1 min-w-0 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Badge Nguồn */}
                      <span className="inline-flex items-center gap-1 rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold text-text-primary border border-border-subtle">
                        <Building2 className="size-3 text-accent-primary" />
                        {doc.source}
                      </span>

                      {/* Loại văn bản */}
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          isFs
                            ? "bg-cyan-500/15 text-cyan-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}
                      >
                        {isFs ? "BCTC Kiểm Toán" : "Nghị quyết & Công văn"}
                      </span>

                      {/* Ngày công bố */}
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <Calendar className="size-3" />
                        {formatDate(doc.date)}
                        {doc.time ? ` ${doc.time.slice(0, 5)}` : ""}
                      </span>
                    </div>

                    {/* Title */}
                    <a
                      href={doc.newsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[13px] font-medium text-text-primary hover:text-accent-primary transition-colors leading-snug line-clamp-2"
                      title={doc.title}
                    >
                      {doc.title}
                    </a>
                  </div>

                  {/* Attachment Buttons */}
                  <div className="shrink-0 flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                    {doc.attachments && doc.attachments.length > 0 ? (
                      doc.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 hover:border-emerald-500/50"
                          title={`Tải văn bản ký số: ${att.name}`}
                        >
                          <Download className="size-3.5" />
                          <span>Tải PDF Ký Số</span>
                        </a>
                      ))
                    ) : (
                      <a
                        href={doc.newsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
                      >
                        <span>Chi tiết</span>
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
});
