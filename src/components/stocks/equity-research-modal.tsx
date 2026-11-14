"use client";

import { memo, useState } from "react";
import {
  FileText,
  Printer,
  X,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Calendar,
  ExternalLink,
  Award,
  Layers,
  Sparkles,
} from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { EquityResearchReport } from "@/lib/services/equity-research-report";
import { Loading, Panel, EmptyState, Badge, Chg, fmtCompact, fmtNum } from "@/components/ui";

const fmtPrice = (p: number | null) => {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toLocaleString("vi-VN") + " ₫";
};

export const EquityResearchModal = memo(function EquityResearchModal({
  symbol,
  isOpen,
  onClose,
}: {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useApi<EquityResearchReport>(
    isOpen && symbol ? `/api/v1/stocks/${encodeURIComponent(symbol)}/research-report` : null,
    { refreshInterval: 600_000 }
  );

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const rep = data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border-subtle bg-surface-primary shadow-2xl overflow-hidden">
        {/* Top Control Bar (ẩn khi in print) */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-surface-elevated/80 px-5 py-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-primary">
              <FileText className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Báo Cáo Nghiên Cứu Cơ Bản Doanh Nghiệp (Equity Research Note)
              </h3>
              <p className="text-[11px] text-text-muted">{symbol} · Chuẩn CFA Institute Methodology</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isLoading || !rep}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-accent-primary hover:text-accent-primary transition shadow-sm disabled:opacity-50"
            >
              <Printer className="size-3.5" />
              <span>In / Xuất PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Content Area (Có CSS Print stylesheet) */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 print:p-0 print:overflow-visible">
          {isLoading && !rep ? (
            <div className="py-20 text-center space-y-3">
              <Loading rows={6} label="ORCA AI đang bóc tách BCTC, mô hình định giá & tổng hợp báo cáo..." />
            </div>
          ) : !rep ? (
            <EmptyState title="Không thể tạo báo cáo" description={`Chưa đủ dữ liệu tài chính để lập báo cáo cho ${symbol}.`} />
          ) : (
            <div className="space-y-6 text-text-primary print:text-black">
              {/* Header Report */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-accent-primary/40 pb-5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-primary">
                    <Building2 className="size-4" />
                    <span>{rep.exchange} · {rep.sector}</span>
                  </div>
                  <h1 className="mt-1 text-2xl font-black text-text-primary tracking-tight">
                    {rep.symbol} — {rep.companyName}
                  </h1>
                  <p className="mt-1 text-xs text-text-muted">
                    Ngày phát hành: {rep.reportDate} · Người lập: {rep.analyst.leadAnalyst}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-text-muted">Khuyến nghị:</span>
                    <span
                      className={`px-3 py-1 rounded-md text-sm font-black tracking-wide ${
                        rep.executiveSummary.rating === "MUA"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : rep.executiveSummary.rating === "KHẢ QUAN"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      }`}
                    >
                      {rep.executiveSummary.rating}
                    </span>
                  </div>
                  <div className="mt-2 text-right text-xs text-text-muted">
                    Giá mục tiêu: <strong className="text-sm font-bold text-accent-primary">{fmtPrice(rep.executiveSummary.targetPrice)}</strong>
                    {rep.executiveSummary.upsidePct != null && (
                      <span className="ml-1.5 font-bold text-emerald-400">
                        (+{rep.executiveSummary.upsidePct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 1. Tóm tắt luận điểm đầu tư */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> 1. Tóm Tắt Luận Điểm Đầu Tư (Investment Thesis)
                </h3>
                <div className="rounded-xl border border-border-subtle bg-surface-elevated/30 p-4 space-y-2">
                  {rep.executiveSummary.investmentThesis.map((t, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="text-accent-primary font-bold">•</span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Ma trận Định giá & Giá trị hợp lý */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
                  <Award className="size-3.5" /> 2. Ma Trận Định Giá Đa Phương Pháp (Valuation Matrix)
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3">
                    <div className="text-[10px] text-text-muted">Thị giá hiện tại</div>
                    <div className="mt-1 text-base font-bold">{fmtPrice(rep.executiveSummary.currentPrice)}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3">
                    <div className="text-[10px] text-text-muted">Giá trị hợp lý Blended</div>
                    <div className="mt-1 text-base font-bold text-accent-primary">{fmtPrice(rep.valuationSummary.fairValueBlended)}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3">
                    <div className="text-[10px] text-text-muted">DCF Chiết khấu dòng tiền</div>
                    <div className="mt-1 text-base font-bold">{fmtPrice(rep.valuationSummary.dcfBase)}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-3">
                    <div className="text-[10px] text-text-muted">Chi phí vốn Ke / WACC</div>
                    <div className="mt-1 text-base font-bold">{(rep.valuationSummary.costOfCapitalKe! * 100).toFixed(1)}%</div>
                  </div>
                </div>
                {rep.valuationSummary.industrySpecialized && (
                  <div className="rounded-lg border border-border-subtle/70 bg-accent-primary/5 px-3 py-2 text-xs text-text-muted">
                    <strong className="text-text-primary">Định giá đặc thù ngành:</strong> {rep.valuationSummary.industrySpecialized}
                  </div>
                )}
              </div>

              {/* 3. Bộ Chỉ số Tài chính Doanh nghiệp (5 Trụ cột) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
                  <Layers className="size-3.5" /> 3. Bộ Chỉ Số Tài Chính Doanh Nghiệp (Phi Tài Chính)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-border-subtle">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-border-subtle bg-surface-elevated/20">
                      <tr>
                        <td className="px-3 py-2 font-medium text-text-muted">Khả năng thanh toán ngắn hạn</td>
                        <td className="px-3 py-2 font-mono">CR: <strong>{rep.financialPillars.currentRatio ?? "—"}x</strong> · QR: <strong>{rep.financialPillars.quickRatio ?? "—"}x</strong></td>
                        <td className="px-3 py-2 text-text-muted">VLĐT / Tổng tài sản</td>
                        <td className="px-3 py-2 font-mono"><strong>{rep.financialPillars.nwcToAssetsPct ?? "—"}%</strong></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium text-text-muted">Thời gian trang trải chi phí</td>
                        <td className="px-3 py-2 font-mono"><strong>{rep.financialPillars.defensiveIntervalDays ?? "—"} ngày</strong></td>
                        <td className="px-3 py-2 text-text-muted">Đòn bẩy Nợ / VCSH</td>
                        <td className="px-3 py-2 font-mono"><strong>{rep.financialPillars.debtToEquity ?? "—"}x</strong></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium text-text-muted">Bảo đảm nợ lãi bằng tiền (EBITDA/Lãi)</td>
                        <td className="px-3 py-2 font-mono"><strong>{rep.financialPillars.cashDebtCoverage ?? "—"}x</strong></td>
                        <td className="px-3 py-2 text-text-muted">Vòng quay tài sản cố định</td>
                        <td className="px-3 py-2 font-mono"><strong>{rep.financialPillars.fixedAssetTurnover ?? "—"}x</strong></td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium text-text-muted">Chu kỳ chuyển đổi tiền mặt (CCC)</td>
                        <td className="px-3 py-2 font-mono"><strong>{rep.financialPillars.cashConversionCycleDays ?? "—"} ngày</strong></td>
                        <td className="px-3 py-2 text-text-muted">Tỷ suất sinh lời ROE · ROA</td>
                        <td className="px-3 py-2 font-mono">ROE: <strong>{rep.financialPillars.roe ?? "—"}%</strong> · ROA: <strong>{rep.financialPillars.roa ?? "—"}%</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Kiểm định BCTC & Chất lượng lợi nhuận */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-accent-primary flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" /> 4. Kiểm Định BCTC & Cảnh Báo Rủi Ro Kiệt Quệ
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border-subtle bg-surface-elevated/30 p-3.5 space-y-1">
                    <div className="font-semibold text-text-primary">Piotroski F-Score: {rep.auditAndQuality.piotroskiScore}/9 điểm ({rep.auditAndQuality.piotroskiRating})</div>
                    <p className="text-text-muted text-[11px] leading-relaxed">
                      Đo lường động lượng tài chính qua 9 tiêu chí khắt khe: Biên lợi nhuận, dòng tiền hoạt động CFO so với LNST và sự lành mạnh của nguồn vốn.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border-subtle bg-surface-elevated/30 p-3.5 space-y-1">
                    <div className="font-semibold text-text-primary">Altman Z''-Score: {rep.auditAndQuality.altmanZScore} ({rep.auditAndQuality.altmanZone})</div>
                    <p className="text-text-muted text-[11px] leading-relaxed">
                      {rep.auditAndQuality.earningsQualityNote}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Động lực & Rủi ro trọng yếu */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <h4 className="font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                    <TrendingUp className="size-3.5" /> Động lực tăng trưởng (Catalysts)
                  </h4>
                  <ul className="space-y-1 text-text-muted leading-relaxed">
                    {rep.catalysts.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <h4 className="font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle className="size-3.5" /> Rủi ro cần theo dõi (Key Risks)
                  </h4>
                  <ul className="space-y-1 text-text-muted leading-relaxed">
                    {rep.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-rose-400 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer Disclosures */}
              <div className="border-t border-border-subtle pt-4 text-[10px] text-text-muted space-y-1">
                <p>
                  <strong>Tuyên bố miễn trừ:</strong> Báo cáo nghiên cứu cơ bản được tạo tự động bởi hệ thống ORCA-FA dựa trên phương pháp định lượng và các nguồn dữ liệu công khai (HOSE, HNX, UBCKNN, VNDirect BCTC). Báo cáo phục vụ mục đích nghiên cứu độc lập, không cấu thành lời mời chào mua bán chứng khoán.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
