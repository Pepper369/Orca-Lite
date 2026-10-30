"use client";

import { useCallback, useState } from "react";
import { fmtCompact, Panel, ErrorState, EmptyState, Loading, Badge } from "@/components/ui";
import { Sparkles, Activity, ShieldCheck, TrendingUp, AlertTriangle, CheckCircle2, ChevronRight, BarChart3, Layers } from "lucide-react";
import type { FourMScore } from "@/lib/engines/four-m";

interface AiAnalysisPayload {
  symbol: string;
  narrative: string;
  structured: {
    executiveVerdict?: string;
    healthSummary: string;
    trendSummary: string;
    strengths: string[];
    risks: string[];
    watchpoints: string[];
    outlook: string;
    chartInsights?: string[];
    valuationSignal?: {
      targetPrice?: number | null;
      marginOfSafetyPct?: number | null;
      verdict: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "CAUTION";
      actionVi: string;
    } | null;
  } | null;
  fourM?: FourMScore | null;
  tcbsHealth?: {
    overall: number | null;
    profitability: number | null;
    liquidity: number | null;
    leverage: number | null;
    cashflow: number | null;
    efficiency: number | null;
    riskFlags: string[];
  } | null;
  model: string | null;
  latencyMs: number | null;
  usedLlm: boolean;
  sourceNote: string;
  llmConfigured?: boolean;
}

interface ForecastPayload {
  symbol: string;
  method: string;
  currencyNote: string;
  history: { period: string; netRevenue: number | null; kind: string }[];
  forecast: {
    period: string;
    netRevenue: number | null;
    kind: string;
    scenario?: string;
  }[];
  metrics: {
    lastRevenue: number | null;
    avgQoqGrowth: number | null;
    avgYoyGrowth: number | null;
    baseGrowthUsed: number | null;
  };
  narrative: string | null;
  model: string | null;
  usedLlm: boolean;
  sourceNote: string;
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

type AuditTab = "audit" | "four_m" | "tcbs" | "forecast";

export function AiFinancialPanel({ symbol }: { symbol: string }) {
  const [loading, setLoading] = useState(false);
  const [loadingFc, setLoadingFc] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AiAnalysisPayload | null>(null);
  const [fc, setFc] = useState<ForecastPayload | null>(null);
  const [activeTab, setActiveTab] = useState<AuditTab>("audit");

  const runAnalysis = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/stocks/${encodeURIComponent(symbol)}/ai-analysis`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const json = await res.json();
      if (!json?.success) {
        setErr(json?.error?.message ?? "Không hoàn thành phân tích AI");
        setData(null);
      } else {
        setData(json.data as AiAnalysisPayload);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi mạng khi gọi AI Quick Audit");
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const runForecast = useCallback(async () => {
    if (!symbol) return;
    setLoadingFc(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/stocks/${encodeURIComponent(symbol)}/revenue-forecast?horizons=4`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const json = await res.json();
      if (!json?.success) {
        setErr(json?.error?.message ?? "Không dự báo được doanh thu");
        setFc(null);
      } else {
        setFc(json.data as ForecastPayload);
        setActiveTab("forecast");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi mạng khi dự báo doanh thu");
    } finally {
      setLoadingFc(false);
    }
  }, [symbol]);

  const baseRows =
    fc?.forecast.filter((p) => p.scenario === "base" || !p.scenario).slice(0, 4) ?? [];

  const fourM = data?.fourM;
  const tcbs = data?.tcbsHealth;
  const valSig = data?.structured?.valuationSignal;

  return (
    <Panel
      title={
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-primary/20 text-accent-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-text-primary">
            AI Quick Audit — Thẩm định BCTC & Định giá ({symbol})
          </span>
          {data?.model && (
            <span className="ml-1 rounded bg-accent-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary border border-accent-primary/20">
              {data.model.includes("gemini") ? "Gemini 2.0 Flash" : data.model}
            </span>
          )}
        </div>
      }
      subtitle="Tổng hợp định lượng 4M Phil Town (Orca 4M) + 5 Trụ cột Sức khỏe BCTC (Orca Health) & Thẩm định 1-click bởi Gemini 2.0 Flash."
      right={
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={loading || !symbol}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-accent-primary to-accent-primary/80 px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all"
          >
            <Sparkles className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Đang thẩm định…" : data ? "Thẩm định lại" : "1-Click AI Quick Audit"}
          </button>
          <button
            type="button"
            onClick={() => void runForecast()}
            disabled={loadingFc || !symbol}
            className="flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-elevated/80 px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-surface-elevated active:scale-95 disabled:opacity-50 transition-all"
          >
            <TrendingUp className="h-3 w-3" />
            {loadingFc ? "Dự báo…" : "Dự báo DT"}
          </button>
        </div>
      }
    >
      {!data && !fc && !err && !loading && !loadingFc && (
        <EmptyState
          title={`Sẵn sàng Quick Audit cho ${symbol}`}
          description="Bấm '1-Click AI Quick Audit' để mô hình quét toàn bộ BCTC (KQKD, CĐKT, LCTT), tính điểm 4M Phil Town, đánh giá 5 trụ cột Orca Health và đề xuất định giá an toàn."
        />
      )}

      {(loading || loadingFc) && (
        <Loading rows={4} label={`AI Gemini 2.0 Flash đang đọc BCTC và tính toán chỉ số cho ${symbol}…`} />
      )}

      {err && (
        <ErrorState
          title="Không thể hoàn tất thẩm định AI"
          message={err}
          onRetry={() => void runAnalysis()}
        />
      )}

      {data && (
        <div className="space-y-4">
          {/* Executive Verdict Banner */}
          <div className="relative overflow-hidden rounded-xl border border-accent-primary/30 bg-gradient-to-br from-accent-primary/10 via-surface-elevated to-surface-card p-3.5 shadow-sm">
            <div className="grid gap-3 md:grid-cols-12 md:items-center">
              {/* Left Score Summary */}
              <div className="flex items-center gap-3 md:col-span-4 border-b md:border-b-0 md:border-r border-border-subtle/80 pb-3 md:pb-0 md:pr-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent-primary/20 border border-accent-primary/40 text-center">
                  <span className="text-[17px] font-bold leading-none text-accent-primary">
                    {fourM?.totalScore ?? tcbs?.overall ?? 75}
                  </span>
                  <span className="text-[9px] font-medium uppercase text-text-muted">/100</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-text-primary">
                      {fourM?.gradeVi ?? "Hạng Vàng"}
                    </span>
                    <Badge tone={fourM?.grade === "Diamond" || fourM?.grade === "Gold" ? "up" : "warn"}>
                      4M Phil Town
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-muted truncate">
                    Orca Health: <strong className="text-text-primary">{tcbs?.overall ?? 75}/100</strong>
                    {data.latencyMs ? ` · ${data.latencyMs}ms` : ""}
                  </div>
                </div>
              </div>

              {/* Center Valuation Signal */}
              <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-border-subtle/80 pb-3 md:pb-0 md:pr-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Định giá & Biên an toàn
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold text-text-primary">
                    {valSig?.targetPrice ? `${valSig.targetPrice.toLocaleString("vi-VN")} đ` : "Chiết khấu hợp lý"}
                  </span>
                  {valSig?.marginOfSafetyPct != null && (
                    <span className={`text-[12px] font-bold ${valSig.marginOfSafetyPct > 0 ? "text-up" : "text-down"}`}>
                      {valSig.marginOfSafetyPct > 0 ? `+${valSig.marginOfSafetyPct.toFixed(1)}%` : `${valSig.marginOfSafetyPct.toFixed(1)}%`}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-text-secondary">
                  {valSig?.actionVi ?? "Tích lũy từng phần khi điều chỉnh"}
                </div>
              </div>

              {/* Right Executive Verdict */}
              <div className="md:col-span-4">
                <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Đúc kết điều hành (1-Click)
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary line-clamp-2">
                  {data.structured?.executiveVerdict ?? data.structured?.healthSummary ?? data.narrative.slice(0, 160)}
                </p>
              </div>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-border-subtle text-[12px]">
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors ${
                activeTab === "audit"
                  ? "border-accent-primary text-accent-primary font-semibold"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Nhận định AI Gemini ({data.model ? "Flash 2.0" : "Engine"})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("four_m")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors ${
                activeTab === "four_m"
                  ? "border-accent-primary text-accent-primary font-semibold"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              4M Phil Town ({fourM?.totalScore ?? "—"}/100)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("tcbs")}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors ${
                activeTab === "tcbs"
                  ? "border-accent-primary text-accent-primary font-semibold"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Sức khỏe Orca Health 5 Trụ cột ({tcbs?.overall ?? "—"}/100)
            </button>
            {fc && (
              <button
                type="button"
                onClick={() => setActiveTab("forecast")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-medium transition-colors ${
                  activeTab === "forecast"
                    ? "border-accent-primary text-accent-primary font-semibold"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Dự báo Doanh thu
              </button>
            )}
          </div>

          {/* TAB 1: AI GEMINI AUDIT */}
          {activeTab === "audit" && (
            <div className="space-y-3.5">
              {/* Natural narrative */}
              <div className="rounded-xl border border-border-subtle bg-surface-card p-3.5">
                <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-primary">
                  {data.narrative}
                </div>
              </div>

              {/* Strengths & Risks Grid */}
              {data.structured && (data.structured.strengths.length > 0 || data.structured.risks.length > 0) && (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.structured.strengths.length > 0 && (
                    <div className="rounded-xl border border-up/25 bg-up/5 p-3.5">
                      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-up">
                        <CheckCircle2 className="h-4 w-4" />
                        Điểm mạnh & Con hào cạnh tranh
                      </div>
                      <ul className="space-y-1.5 text-[12px] text-text-secondary">
                        {data.structured.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-up">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {data.structured.risks.length > 0 && (
                    <div className="rounded-xl border border-down/25 bg-down/5 p-3.5">
                      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-down">
                        <AlertTriangle className="h-4 w-4" />
                        Rủi ro trọng yếu & Cờ đỏ BCTC
                      </div>
                      <ul className="space-y-1.5 text-[12px] text-text-secondary">
                        {data.structured.risks.map((s, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-down">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Chart Insights & Watchpoints */}
              <div className="grid gap-3 md:grid-cols-2">
                {data.structured?.chartInsights && data.structured.chartInsights.length > 0 && (
                  <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      <BarChart3 className="h-3.5 w-3.5 text-accent-primary" />
                      AI Đọc biểu đồ BCTC (Doanh thu vs Dòng tiền)
                    </div>
                    <ul className="space-y-1 text-[11.5px] text-text-secondary">
                      {data.structured.chartInsights.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.structured?.watchpoints && data.structured.watchpoints.length > 0 && (
                  <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      <Layers className="h-3.5 w-3.5 text-warn" />
                      Chỉ số cần theo dõi kỳ BCTC tới
                    </div>
                    <ul className="space-y-1 text-[11.5px] text-text-secondary">
                      {data.structured.watchpoints.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-warn mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 4M PHIL TOWN MATRIX */}
          {activeTab === "four_m" && fourM && (
            <div className="space-y-3">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* M1 Meaning */}
                <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">M1 · Ý NGHĨA</span>
                    <Badge tone={fourM.m1MeaningPass ? "up" : "warn"}>{fourM.m1MeaningScore}/25</Badge>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-text-primary">
                    {fourM.m1MeaningPass ? "Mô hình thiết yếu" : "Ngành biến động"}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted leading-tight">{fourM.m1Note}</div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full bg-accent-primary" style={{ width: `${(fourM.m1MeaningScore / 25) * 100}%` }} />
                  </div>
                </div>

                {/* M2 Moat */}
                <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">M2 · CON HÀO (MOAT)</span>
                    <Badge tone={fourM.m2MoatPass ? "up" : "warn"}>{fourM.m2MoatScore}/25</Badge>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-text-primary">
                    {fourM.m2MoatPass ? "Lợi thế vượt trội" : "Lợi thế trung bình"}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted leading-tight">{fourM.m2Note}</div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full bg-accent-primary" style={{ width: `${(fourM.m2MoatScore / 25) * 100}%` }} />
                  </div>
                </div>

                {/* M3 Management */}
                <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">M3 · QUẢN TRỊ (MGMT)</span>
                    <Badge tone={fourM.m3ManagementPass ? "up" : "warn"}>{fourM.m3ManagementScore}/25</Badge>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-text-primary">
                    {fourM.m3ManagementPass ? "Tài chính an toàn" : "Cần giám sát nợ"}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted leading-tight">{fourM.m3Note}</div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full bg-accent-primary" style={{ width: `${(fourM.m3ManagementScore / 25) * 100}%` }} />
                  </div>
                </div>

                {/* M4 Margin of Safety */}
                <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">M4 · BIÊN AN TOÀN</span>
                    <Badge tone={fourM.m4MarginOfSafetyPass ? "up" : "warn"}>{fourM.m4MarginOfSafetyScore}/25</Badge>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-text-primary">
                    {fourM.m4MarginOfSafetyPass ? "Định giá hấp dẫn" : "Định giá phù hợp"}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted leading-tight">{fourM.m4Note}</div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full bg-accent-primary" style={{ width: `${(fourM.m4MarginOfSafetyScore / 25) * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Key Quantitative Metrics Strip */}
              <div className="rounded-xl border border-border-subtle bg-surface-card p-3 text-[11px]">
                <div className="mb-2 font-semibold uppercase tracking-wider text-text-muted">
                  Bộ thông số lượng hóa 4M cốt lõi
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">ROE</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.roe != null ? `${fourM.roe.toFixed(1)}%` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">ROIC</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.roic != null ? `${fourM.roic.toFixed(1)}%` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">Biên gộp</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.grossMargin != null ? `${fourM.grossMargin.toFixed(1)}%` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">Nợ/VCSH (D/E)</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.debtEquity != null ? `${fourM.debtEquity.toFixed(2)}x` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">P/E</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.pe != null && fourM.pe > 0 ? `${fourM.pe.toFixed(1)}x` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">P/B</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.pb != null && fourM.pb > 0 ? `${fourM.pb.toFixed(1)}x` : "—"}</div>
                  </div>
                  <div className="rounded-lg bg-surface-elevated p-2">
                    <div className="text-text-muted text-[10px]">Tăng trưởng DT YoY</div>
                    <div className="text-[13px] font-bold text-text-primary">{fourM.revenueYoyPct != null ? `${fourM.revenueYoyPct.toFixed(1)}%` : "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TCBS 5 PILLARS HEALTH */}
          {activeTab === "tcbs" && tcbs && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Sinh lời", score: tcbs.profitability ?? 70, desc: "ROE, ROA, Biên lợi nhuận ròng" },
                  { label: "Thanh khoản", score: tcbs.liquidity ?? 70, desc: "Thanh toán hiện hành & Tiền mặt" },
                  { label: "Đòn bẩy tài chính", score: tcbs.leverage ?? 75, desc: "Tỷ lệ nợ vay & áp lực nợ ngắn hạn" },
                  { label: "Dòng tiền OCF/FCF", score: tcbs.cashflow ?? 70, desc: "Chất lượng dòng tiền kinh doanh" },
                  { label: "Hiệu quả hoạt động", score: tcbs.efficiency ?? 70, desc: "Vòng quay tài sản & tồn kho" },
                ].map((p, idx) => (
                  <div key={idx} className="rounded-xl border border-border-subtle bg-surface-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-text-primary">{p.label}</span>
                      <span className="text-[12px] font-bold text-accent-primary">{p.score}/100</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                      <div
                        className={`h-full ${p.score >= 75 ? "bg-up" : p.score >= 50 ? "bg-accent-primary" : "bg-warn"}`}
                        style={{ width: `${Math.min(100, Math.max(5, p.score))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 text-[10px] text-text-muted leading-tight">{p.desc}</div>
                  </div>
                ))}
              </div>

              {tcbs.riskFlags && tcbs.riskFlags.length > 0 && (
                <div className="rounded-xl border border-border-subtle bg-surface-card p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-down">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Cờ cảnh báo rủi ro BCTC ghi nhận bởi Orca Health Engine
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tcbs.riskFlags.map((flag, idx) => (
                      <span
                        key={idx}
                        className="rounded-md border border-down/30 bg-down/10 px-2 py-1 text-[11px] font-medium text-down"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REVENUE FORECAST */}
          {activeTab === "forecast" && fc && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 rounded-lg bg-surface-card p-3 text-[11px] border border-border-subtle">
                <span className="text-text-muted">QoQ TB: <strong className="text-text-primary">{pct(fc.metrics.avgQoqGrowth)}</strong></span>
                <span className="text-text-muted">YoY TB: <strong className="text-text-primary">{pct(fc.metrics.avgYoyGrowth)}</strong></span>
                <span className="text-text-muted">Tăng trưởng cơ sở: <strong className="text-text-primary">{pct(fc.metrics.baseGrowthUsed)}</strong></span>
                <span className="text-text-muted">Doanh thu gần nhất: <strong className="text-text-primary">{fmtCompact(fc.metrics.lastRevenue)}</strong></span>
              </div>

              {baseRows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface-card">
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface-elevated/40 text-text-muted">
                        <th className="py-2 px-3 text-left font-medium">Kỳ kế toán</th>
                        <th className="num py-2 px-3 font-medium">Kịch bản cơ sở (Base)</th>
                        <th className="num py-2 px-3 font-medium text-up">Kịch bản tích cực (Bull)</th>
                        <th className="num py-2 px-3 font-medium text-down">Kịch bản thận trọng (Bear)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {baseRows.map((b) => {
                        const bull = fc.forecast.find((p) => p.period === b.period && p.scenario === "bull");
                        const bear = fc.forecast.find((p) => p.period === b.period && p.scenario === "bear");
                        return (
                          <tr key={b.period} className="border-b border-border-subtle/40 last:border-0 hover:bg-surface-elevated/30">
                            <td className="py-2 px-3 font-medium text-text-primary">{b.period}</td>
                            <td className="num py-2 px-3 font-semibold text-text-primary">{fmtCompact(b.netRevenue)}</td>
                            <td className="num py-2 px-3 text-up">{fmtCompact(bull?.netRevenue ?? null)}</td>
                            <td className="num py-2 px-3 text-down">{fmtCompact(bear?.netRevenue ?? null)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {fc.narrative && (
                <div className="rounded-xl border border-border-subtle bg-surface-card p-3 text-[12px] leading-relaxed text-text-secondary whitespace-pre-wrap">
                  {fc.narrative}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
