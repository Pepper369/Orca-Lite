"use client";

import { memo } from "react";
import { Badge } from "@/components/ui";
import { AlertTriangle, CheckCircle2, Scale, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import type { CommitteeConsensusReport } from "@/lib/engines/ai-investment-committee";
import type { InstitutionalValuationReport } from "@/lib/engines/institutional-valuation-suite";

function fmtVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return `${Math.round(v).toLocaleString("vi-VN")} ₫`;
}

export const InstitutionalCommitteeValuationCards = memo(function InstitutionalCommitteeValuationCards({
  committee,
  valuation,
}: {
  committee?: CommitteeConsensusReport | null;
  valuation?: InstitutionalValuationReport | null;
}) {
  if (!committee && !valuation) return null;

  return (
    <div className="space-y-4">
      {/* 1. MULTI-PERSONA INVESTMENT COMMITTEE & CRO GATE */}
      {committee && (
        <div className="rounded-xl border border-border-subtle bg-surface-card p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent-primary" />
              <span className="text-[12.5px] font-bold text-text-primary">
                Hội Đồng Đầu Tư Đa Nhân Cách AI &amp; Cổng CRO
              </span>
              <Badge
                tone={
                  committee.verdict === "STRONG_BUY" || committee.verdict === "BUY"
                    ? "up"
                    : committee.verdict === "STRONG_SELL" || committee.verdict === "REDUCE"
                      ? "down"
                      : "warn"
                }
              >
                {committee.verdictLabelVi}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-text-muted">
                Điểm đồng thuận:{" "}
                <strong className="font-mono text-text-primary">{committee.consensusScore}/100</strong>
              </span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">
                Nhất trí:{" "}
                <strong className="font-mono text-accent-primary">
                  {(committee.debateAgreementRatio * 100).toFixed(0)}%
                </strong>
              </span>
            </div>
          </div>

          {/* CRO Gate Banner */}
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11.5px] ${
              committee.chiefRiskOfficer.approved
                ? "border-up/30 bg-up/5 text-text-primary"
                : "border-down/40 bg-down/10 text-down"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {committee.chiefRiskOfficer.approved ? (
                <ShieldCheck className="h-4 w-4 shrink-0 text-up" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0 text-down" />
              )}
              <span className="leading-snug">{committee.chiefRiskOfficer.croDirectiveVi}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10.5px]">
              <Badge tone={committee.chiefRiskOfficer.approved ? "up" : "down"}>
                Size x{committee.chiefRiskOfficer.recommendedSizeMultiplier.toFixed(2)}
              </Badge>
              <Badge
                tone={
                  committee.chiefRiskOfficer.tailRiskLevel === "CRITICAL" ||
                  committee.chiefRiskOfficer.tailRiskLevel === "HIGH"
                    ? "down"
                    : "accent"
                }
              >
                Tail Risk: {committee.chiefRiskOfficer.tailRiskLevel}
              </Badge>
            </div>
          </div>

          {/* 5 Persona Conviction Cards */}
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            {committee.personaVotes.map((v) => {
              const barPct = Math.min(100, Math.max(6, Math.round((v.convictionScore + 100) / 2)));
              const barColor =
                v.stance === "BULLISH"
                  ? "bg-up"
                  : v.stance === "BEARISH"
                    ? "bg-down"
                    : "bg-warn";
              return (
                <div
                  key={v.persona}
                  className="rounded-lg border border-border-subtle bg-surface-elevated/40 p-2.5 flex flex-col justify-between gap-1.5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-text-primary truncate" title={v.personaNameVi}>
                        {v.personaNameVi.split(" (")[0]}
                      </span>
                      <span
                        className={`font-mono text-[10.5px] font-bold ${
                          v.convictionScore >= 25
                            ? "text-up"
                            : v.convictionScore <= -25
                              ? "text-down"
                              : "text-warn"
                        }`}
                      >
                        {v.convictionScore > 0 ? "+" : ""}
                        {v.convictionScore}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                      <div className={`h-full ${barColor}`} style={{ width: `${barPct}%` }} />
                    </div>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted line-clamp-3">
                      {v.thesisVi}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] text-text-muted pt-1 border-t border-border-subtle/50">
                    <span>Trọng số {(v.weight * 100).toFixed(0)}%</span>
                    {v.vetoTriggered && (
                      <span className="font-semibold text-down inline-flex items-center gap-0.5">
                        <AlertTriangle className="h-2.5 w-2.5" /> VETO
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. INSTITUTIONAL VALUATION SUITE (DCF · 5x5 HEATMAP · MULTIPLES SCORECARD) */}
      {valuation && (
        <div className="rounded-xl border border-border-subtle bg-surface-card p-3.5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-accent-primary" />
              <span className="text-[12.5px] font-bold text-text-primary">
                Định Giá Tổ Chức (DCF · SOTP · Multiples Scorecard)
              </span>
              <Badge
                tone={
                  valuation.dcfStatus === "REAL_FCF"
                    ? "up"
                    : valuation.dcfStatus === "EXEMPT_FINANCIAL"
                      ? "accent"
                      : "warn"
                }
              >
                {valuation.dcfStatus === "REAL_FCF"
                  ? "DCF BCTC THẬT"
                  : valuation.dcfStatus === "EXEMPT_FINANCIAL"
                    ? "MIỄN TRỪ DCF (TÀI CHÍNH)"
                    : "BỘI SỐ NGÀNH (THIẾU FCF)"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-text-muted">
                Giá trị hợp lý:{" "}
                <strong className="font-mono text-text-primary">{fmtVnd(valuation.blendedFairValue)}</strong>
              </span>
              <Badge tone={valuation.marginOfSafetyPct >= 15 ? "up" : valuation.marginOfSafetyPct <= -12 ? "down" : "warn"}>
                MOS: {valuation.marginOfSafetyPct > 0 ? "+" : ""}
                {valuation.marginOfSafetyPct}%
              </Badge>
            </div>
          </div>

          {/* Bear / Base / Bull Scenario Range */}
          {valuation.dcf && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  {
                    label: "🐻 Bear Case (Thận trọng)",
                    val: valuation.dcf.scenarios.bear.fairValuePerShare,
                    upside: valuation.dcf.scenarios.bear.upsidePct,
                    tone: "border-down/30 bg-down/5",
                  },
                  {
                    label: `⚖️ Base Case (WACC ${valuation.dcf.baseWacc}% · g ${valuation.dcf.baseTerminalGrowth}%)`,
                    val: valuation.dcf.scenarios.base.fairValuePerShare,
                    upside: valuation.dcf.scenarios.base.upsidePct,
                    tone: "border-accent-primary/40 bg-accent-primary/10",
                  },
                  {
                    label: "🐂 Bull Case (Lạc quan)",
                    val: valuation.dcf.scenarios.bull.fairValuePerShare,
                    upside: valuation.dcf.scenarios.bull.upsidePct,
                    tone: "border-up/30 bg-up/5",
                  },
                ].map((sc) => (
                  <div key={sc.label} className={`rounded-lg border p-2.5 ${sc.tone}`}>
                    <div className="text-[10.5px] text-text-muted">{sc.label}</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="font-mono text-[13px] font-bold text-text-primary">
                        {fmtVnd(sc.val)}
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          sc.upside >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {sc.upside > 0 ? "+" : ""}
                        {sc.upside}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 5x5 WACC x Terminal Growth Sensitivity Heatmap */}
              <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-elevated/30">
                <div className="px-3 py-1.5 text-[10.5px] font-semibold text-text-secondary border-b border-border-subtle">
                  Ma Trận Độ Nhạy 2D (WACC % × Tăng Trưởng Dài Hạn g %) — So với thị giá {fmtVnd(valuation.currentPrice)}
                </div>
                <table className="w-full text-[10.5px] font-mono">
                  <thead>
                    <tr className="border-b border-border-subtle/70 text-text-muted">
                      <th className="py-1.5 px-2 text-left">WACC \ g</th>
                      {valuation.dcf.sensitivityMatrix.terminalGrowthHeaders.map((g) => (
                        <th key={g} className="py-1.5 px-2 text-right">
                          {g.toFixed(2)}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {valuation.dcf.sensitivityMatrix.waccHeaders.map((w, wi) => (
                      <tr key={w} className="border-b border-border-subtle/40 last:border-0">
                        <td className="py-1.5 px-2 font-semibold text-text-secondary">{w.toFixed(2)}%</td>
                        {valuation.dcf!.sensitivityMatrix.fairValueGrid[wi]!.map((fv, gi) => {
                          const diffPct =
                            valuation.currentPrice > 0
                              ? ((fv - valuation.currentPrice) / valuation.currentPrice) * 100
                              : 0;
                          const cellTone =
                            diffPct >= 15
                              ? "bg-up/15 text-up font-bold"
                              : diffPct <= -15
                                ? "bg-down/15 text-down"
                                : "text-text-primary";
                          return (
                            <td key={`${wi}_${gi}`} className={`py-1.5 px-2 text-right ${cellTone}`}>
                              {Math.round(fv).toLocaleString("vi-VN")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Relative Multiples Scorecard */}
          {valuation.multiplesScorecard.multiples.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-elevated/30">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
                <span className="text-[10.5px] font-semibold text-text-secondary">
                  Thẻ Điểm Bội Số Tương Đối (Relative Multiples Scorecard)
                </span>
                <Badge
                  tone={
                    valuation.multiplesScorecard.overallScore >= 15
                      ? "up"
                      : valuation.multiplesScorecard.overallScore <= -15
                        ? "down"
                        : "warn"
                  }
                >
                  {valuation.multiplesScorecard.valuationGrade} ({valuation.multiplesScorecard.overallScore}/100)
                </Badge>
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border-subtle/70 text-text-muted">
                    <th className="py-1.5 px-2.5 text-left font-medium">Chỉ số</th>
                    <th className="py-1.5 px-2.5 text-right font-medium">Doanh nghiệp</th>
                    <th className="py-1.5 px-2.5 text-right font-medium">Trung vị ngành</th>
                    <th className="py-1.5 px-2.5 text-right font-medium">Chênh lệch</th>
                    <th className="py-1.5 px-2.5 text-left font-medium">Đánh giá</th>
                  </tr>
                </thead>
                <tbody>
                  {valuation.multiplesScorecard.multiples.map((m) => (
                    <tr key={m.metric} className="border-b border-border-subtle/40 last:border-0">
                      <td className="py-1.5 px-2.5 font-semibold text-text-primary">{m.metric}</td>
                      <td className="py-1.5 px-2.5 text-right font-mono text-text-primary">{m.companyValue}</td>
                      <td className="py-1.5 px-2.5 text-right font-mono text-text-muted">{m.sectorMedian}</td>
                      <td
                        className={`py-1.5 px-2.5 text-right font-mono font-semibold ${
                          m.verdict === "UNDERVALUED"
                            ? "text-up"
                            : m.verdict === "OVERVALUED"
                              ? "text-down"
                              : "text-text-secondary"
                        }`}
                      >
                        {m.discountPremiumVsSectorPct > 0 ? "+" : ""}
                        {m.discountPremiumVsSectorPct}%
                      </td>
                      <td className="py-1.5 px-2.5 text-text-secondary">
                        <span className="inline-flex items-center gap-1">
                          {m.verdict === "UNDERVALUED" && <CheckCircle2 className="h-3 w-3 text-up shrink-0" />}
                          {m.verdictVi}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
