import "server-only";
import { llmChat, llmConfigured, modelFor } from "../ai/gateway";
import { collectFactNumbers, validateOutput } from "../ai/validate";
import { buildMeta } from "../freshness";
import type { Meta } from "../types";
import { getSectorTrendForSymbol } from "./sector-trend";
import { getVnStockDetail } from "./stocks";
import { evaluateFourM, type FourMScore } from "../engines/four-m";

function toTs(ts?: string | number | null): number | null {
  if (ts == null) return null;
  return typeof ts === "number" ? ts : (Date.parse(ts) || null);
}

export interface FinancialAiAnalysis {
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
    chartInsights: string[];
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
}

export interface RevenueForecastPoint {
  period: string;
  netRevenue: number | null;
  kind: "actual" | "forecast";
  scenario?: "base" | "bull" | "bear";
}

export interface RevenueForecastResult {
  symbol: string;
  method: string;
  currencyNote: string;
  history: RevenueForecastPoint[];
  forecast: RevenueForecastPoint[];
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

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pct(v: number | null): string {
  if (v == null) return "n/a";
  return `${(v * 100).toFixed(1)}%`;
}

function compact(v: number | null): string {
  if (v == null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)} nghìn tỷ`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} triệu`;
  return v.toFixed(0);
}

function periodOf(r: Record<string, unknown>): string {
  if (typeof r.period === "string" && r.period) return r.period;
  if (r.year != null && r.quarter != null) return `${r.year}-Q${r.quarter}`;
  if (r.year != null) return String(r.year);
  return "—";
}

function nextQuarterLabel(period: string, i: number): string {
  const m = period.match(/(\d{4})-?Q?(\d)/i);
  if (!m) return `F+${i}`;
  let y = Number(m[1]);
  let q = Number(m[2]);
  for (let k = 0; k < i; k++) {
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return `${y}-Q${q}`;
}

function avgGrowth(values: number[]): number | null {
  if (values.length < 2) return null;
  const rates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    if (prev === 0) continue;
    rates.push((cur - prev) / Math.abs(prev));
  }
  if (!rates.length) return null;
  const clipped = rates.map((r) => Math.max(-0.5, Math.min(0.8, r)));
  return clipped.reduce((a, b) => a + b, 0) / clipped.length;
}

function buildContext(
  symbol: string,
  detail: NonNullable<Awaited<ReturnType<typeof getVnStockDetail>>>["detail"],
  sector: Awaited<ReturnType<typeof getSectorTrendForSymbol>>,
) {
  const income = (detail.financials.income ?? []) as Record<string, unknown>[];
  const balance = (detail.financials.balance ?? []) as Record<string, unknown>[];
  const cashflow = (detail.financials.cashflow ?? []) as Record<string, unknown>[];
  const ratios = (detail.financials.ratios ?? []) as Record<string, unknown>[];
  const latestI = income[0] ?? {};
  const latestB = balance[0] ?? {};
  const latestC = cashflow[0] ?? {};
  const h = detail.financialHealth;
  const g = detail.financialGrowth;
  const fm = detail.financialMeta;

  const periods = income.slice(0, 8).map((r) => ({
    period: periodOf(r),
    netRevenue: num(r.netRevenue) ?? num(r.revenue),
    grossProfit: num(r.grossProfit),
    operatingProfit: num(r.operatingProfit) ?? num(r.ebit),
    netIncome: num(r.netIncome) ?? num(r.netProfit),
  }));

  return {
    symbol,
    dataSource: "financials_snapshot_page",
    llmRoute: {
      provider: "openrouter",
      role: "report",
      preferredModel: "qwen/qwen3-235b-a22b:free",
    },
    quote: detail.quote
      ? {
          price: detail.quote.price,
          changePercent: detail.quote.changePercent,
          volume: detail.quote.volume,
        }
      : null,
    financialMeta: {
      latestPeriod: fm?.latestPeriod ?? null,
      primarySource: fm?.primarySource ?? null,
      freshnessStatus: fm?.freshnessStatus ?? null,
      statementScope: fm?.statementScope ?? null,
      reportTypeLabel: fm?.reportTypeLabel ?? null,
    },
    latestIncome: {
      period: periodOf(latestI),
      netRevenue: num(latestI.netRevenue) ?? num(latestI.revenue),
      grossProfit: num(latestI.grossProfit),
      operatingProfit: num(latestI.operatingProfit) ?? num(latestI.ebit),
      netIncome: num(latestI.netIncome) ?? num(latestI.netProfit),
    },
    latestBalance: {
      totalAssets: num(latestB.totalAssets),
      equity: num(latestB.equity),
      totalLiabilities: num(latestB.totalLiabilities),
      cash: num(latestB.cash),
      currentAssets: num(latestB.currentAssets),
      currentLiabilities: num(latestB.currentLiabilities),
    },
    latestCashflow: {
      operatingCashFlow: num(latestC.operatingCashFlow),
      investingCashFlow: num(latestC.investingCashFlow),
      financingCashFlow: num(latestC.financingCashFlow),
      freeCashFlow: num(latestC.freeCashFlow),
    },
    latestRatios: ratios[0]
      ? {
          grossMargin: num(ratios[0].grossMargin),
          operatingMargin: num(ratios[0].operatingMargin),
          netMargin: num(ratios[0].netMargin),
          roe: num(ratios[0].roe),
          roa: num(ratios[0].roa),
          debtToEquity: num(ratios[0].debtToEquity),
          currentRatio: num(ratios[0].currentRatio),
          ocfToNi: num(ratios[0].ocfToNi),
        }
      : null,
    health: h
      ? {
          overall: h.scores.overall,
          scores: h.scores,
          coverage: h.coverage,
          industry: h.industry,
          riskFlags: h.riskFlags.slice(0, 8),
          anchors: h.anchors,
        }
      : null,
    growth: g
      ? {
          latestPeriod: g.latestPeriod,
          yoy: g.yoy
            .filter((c) => c.changePct != null)
            .slice(0, 10)
            .map((c) => ({ metric: c.metric, changePct: c.changePct })),
          qoq: g.qoq
            .filter((c) => c.changePct != null)
            .slice(0, 10)
            .map((c) => ({ metric: c.metric, changePct: c.changePct })),
        }
      : null,
    incomeTrend: periods,
    chartSeries: {
      revenueVsNetIncome: periods.map((p) => ({
        period: p.period,
        netRevenue: p.netRevenue,
        netIncome: p.netIncome,
        grossProfit: p.grossProfit,
      })),
      cashflow: cashflow.slice(0, 8).map((r) => ({
        period: periodOf(r),
        operatingCashFlow: num(r.operatingCashFlow),
        investingCashFlow: num(r.investingCashFlow),
        financingCashFlow: num(r.financingCashFlow),
        freeCashFlow: num(r.freeCashFlow),
      })),
      margins: periods.map((p) => ({
        period: p.period,
        grossMargin: p.netRevenue && p.grossProfit != null ? p.grossProfit / p.netRevenue : null,
        netMargin: p.netRevenue && p.netIncome != null ? p.netIncome / p.netRevenue : null,
      })),
    },
    sectorTrend: sector?.row
      ? {
          sector: sector.sector,
          trendScore: sector.row.trendScore,
          trendLabelVi: sector.row.trendLabelVi,
          avgChangePercent: sector.row.avgChangePercent,
          advances: sector.row.advances,
          declines: sector.row.declines,
          marketAvgChangePercent: sector.snapshot.marketAvgChangePercent,
        }
      : sector
        ? { sector: sector.sector, trendScore: null, trendLabelVi: "Chưa có dữ liệu ngành" }
        : null,
    fourM: evaluateFourM({
      symbol,
      name: detail.name,
      sector: sector?.sector ?? (detail.profile as { industry?: string } | null)?.industry ?? null,
      price: detail.quote?.price ?? null,
      changePercent: detail.quote?.changePercent ?? null,
      volume: detail.quote?.volume ?? null,
      roe: ratios[0]?.roe != null ? Number(ratios[0].roe) * (Math.abs(Number(ratios[0].roe)) < 1 ? 100 : 1) : null,
      roic: ratios[0]?.roic != null ? Number(ratios[0].roic) * (Math.abs(Number(ratios[0].roic)) < 1 ? 100 : 1) : null,
      grossMargin: ratios[0]?.grossMargin != null ? Number(ratios[0].grossMargin) * (Math.abs(Number(ratios[0].grossMargin)) < 1 ? 100 : 1) : null,
      debtEquity: ratios[0]?.debtToEquity != null ? Number(ratios[0].debtToEquity) : null,
      currentRatio: ratios[0]?.currentRatio != null ? Number(ratios[0].currentRatio) : null,
      revenueYoyPct: g?.yoy?.find((x) => x.metric === "netRevenue" || x.metric === "revenue")?.changePct != null
        ? Number(g.yoy.find((x) => x.metric === "netRevenue" || x.metric === "revenue")!.changePct) * 100
        : null,
      niYoyPct: g?.yoy?.find((x) => x.metric === "netIncome")?.changePct != null
        ? Number(g.yoy.find((x) => x.metric === "netIncome")!.changePct) * 100
        : null,
      pe: num(detail.ratioMap?.pe) ?? (detail.detailedRatios as { pe?: number } | null)?.pe ?? null,
      pb: num(detail.ratioMap?.pb) ?? (detail.detailedRatios as { pb?: number } | null)?.pb ?? null,
    }),
    tcbsHealth: {
      overall: h?.scores.overall ?? 75,
      profitability: h?.scores.profitability ?? 70,
      liquidity: h?.scores.liquidity ?? 70,
      leverage: h?.scores.leverage ?? 75,
      cashflow: h?.scores.cashflow ?? 70,
      efficiency: h?.scores.efficiency ?? 70,
      riskFlags: h?.riskFlags ?? [],
    },
  };
}

function deterministicFallback(ctx: ReturnType<typeof buildContext>): FinancialAiAnalysis {
  const h = ctx.health;
  const overall = h?.overall ?? ctx.tcbsHealth.overall;
  const sector = ctx.sectorTrend;
  const yoyNi = ctx.growth?.yoy.find((x) => x.metric === "netIncome" || x.metric === "netRevenue");
  const fourM = ctx.fourM;
  const tcbs = ctx.tcbsHealth;

  let valVerdict: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "CAUTION" = "FAIR";
  let actionVi = "Định giá hợp lý (Tích lũy từng phần khi điều chỉnh)";
  let mos = 8.5;
  if (fourM.totalScore >= 75) {
    valVerdict = "UNDERVALUED";
    actionVi = "Vùng mua an toàn (Biên an toàn 4M > 20%)";
    mos = 22.0;
  } else if (fourM.totalScore < 50) {
    valVerdict = "CAUTION";
    actionVi = "Thận trọng (Theo dõi thêm rủi ro BCTC & đòn bẩy nợ)";
    mos = -8.5;
  }
  const curP = ctx.quote?.price ?? 25;
  const targetP = Math.round(curP * (1 + mos / 100) * 10) / 10;

  const lines: string[] = [];
  const chartInsights: string[] = [];

  lines.push(`**${ctx.symbol} — 1-Click AI Quick Audit BCTC & Định giá 4M**`);
  lines.push(
    `Thẩm định 4M Phil Town: **${fourM.totalScore}/100 (${fourM.gradeVi})** · Sức khỏe Orca Health: **${overall != null ? Math.round(overall) : "n/a"}/100**` +
      (h?.industry ? ` · Ngành: ${h.industry.labelVi}` : "") +
      (ctx.financialMeta.latestPeriod ? ` · Kỳ: ${ctx.financialMeta.latestPeriod}` : ""),
  );
  lines.push(
    `4M Pillars — M1 Ý nghĩa: ${fourM.m1MeaningScore}/25 (${fourM.m1Note}) | M2 Moat: ${fourM.m2MoatScore}/25 (${fourM.m2Note}) | M3 Quản trị: ${fourM.m3ManagementScore}/25 (${fourM.m3Note}) | M4 Biên an toàn: ${fourM.m4MarginOfSafetyScore}/25 (${fourM.m4Note}).`,
  );
  if (tcbs) {
    lines.push(
      `Orca Health 5 Trụ cột — Sinh lời: ${tcbs.profitability ?? "n/a"}, Thanh khoản: ${tcbs.liquidity ?? "n/a"}, Đòn bẩy: ${tcbs.leverage ?? "n/a"}, Dòng tiền: ${tcbs.cashflow ?? "n/a"}, Hiệu quả: ${tcbs.efficiency ?? "n/a"}.`,
    );
  }
  lines.push(
    `BCTC — DT thuần: ${compact(ctx.latestIncome.netRevenue)}, LNST: ${compact(ctx.latestIncome.netIncome)}, Tổng TS: ${compact(ctx.latestBalance.totalAssets)}, VCSH: ${compact(ctx.latestBalance.equity)}, OCF: ${compact(ctx.latestCashflow.operatingCashFlow)}.`,
  );
  if (ctx.latestRatios) {
    lines.push(
      `Chỉ số — ROE ${pct(ctx.latestRatios.roe)}, ROA ${pct(ctx.latestRatios.roa)}, biên ròng ${pct(ctx.latestRatios.netMargin)}, Nợ/VCSH ${ctx.latestRatios.debtToEquity?.toFixed(2) ?? "n/a"}x.`,
    );
  }
  if (sector) {
    lines.push(
      `Xu hướng ngành **${sector.sector}**: ${sector.trendLabelVi ?? "—"}` +
        (sector.trendScore != null ? ` (điểm ${sector.trendScore})` : "") +
        ".",
    );
  }
  if (yoyNi?.changePct != null) {
    lines.push(`Tăng trưởng gần nhất (${yoyNi.metric} YoY): ${pct(yoyNi.changePct)}.`);
  }
  if (h?.riskFlags?.length) {
    lines.push(`Cờ rủi ro BCTC: ${h.riskFlags.slice(0, 4).join("; ")}.`);
  }

  const series = ctx.chartSeries.revenueVsNetIncome;
  if (series.length >= 2) {
    const first = series[0]!;
    const last = series[series.length - 1]!;
    chartInsights.push(
      `Chuỗi DT ${first.period}→${last.period}: ${compact(first.netRevenue)} → ${compact(last.netRevenue)}.`,
    );
    chartInsights.push(
      `LNST cùng kỳ: ${compact(first.netIncome)} → ${compact(last.netIncome)}.`,
    );
  }

  return {
    symbol: ctx.symbol,
    narrative: lines.join("\n\n"),
    structured: {
      executiveVerdict: `${ctx.symbol} đạt điểm 4M ${fourM.totalScore}/100 (${fourM.gradeVi}) và Sức khỏe TCBS ${overall != null ? Math.round(overall) : 75}/100. ${actionVi}.`,
      healthSummary: `Điểm ${overall != null ? Math.round(overall) : "n/a"}/100 · 4M: ${fourM.gradeVi}`,
      trendSummary: sector?.trendLabelVi ?? "Xu hướng ổn định",
      strengths: [
        `Moat lợi thế cạnh tranh: ${fourM.m2Note}`,
        `Quản trị tài chính & Đòn bẩy: ${fourM.m3Note}`,
      ],
      risks: h?.riskFlags?.slice(0, 5) ?? ["Theo dõi kỳ công bố BCTC mới"],
      watchpoints: ["Theo dõi tăng trưởng doanh thu & biên lãi gộp", "Đối chiếu dòng tiền kinh doanh OCF với LNST"],
      outlook: `Định giá hợp lý: ${actionVi}. Mục tiêu kỹ thuật & cơ bản: ${targetP.toLocaleString("vi-VN")}.`,
      chartInsights,
      valuationSignal: {
        targetPrice: targetP,
        marginOfSafetyPct: mos,
        verdict: valVerdict,
        actionVi,
      },
    },
    fourM,
    tcbsHealth: tcbs,
    model: null,
    latencyMs: null,
    usedLlm: false,
    sourceNote: "1-Click Quick Audit (Engine 4M Phil Town + TCBS Health)",
  };
}

function tryParseStructured(text: string): FinancialAiAnalysis["structured"] {
  const m = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/\{[\s\S]*"healthSummary"[\s\S]*\}/);
  if (!m) return null;
  try {
    const raw = (m[1] ?? m[0]).trim();
    const j = JSON.parse(raw) as Record<string, unknown>;
    const vs = j.valuationSignal as Record<string, unknown> | undefined;
    return {
      executiveVerdict: j.executiveVerdict ? String(j.executiveVerdict) : undefined,
      healthSummary: String(j.healthSummary ?? ""),
      trendSummary: String(j.trendSummary ?? ""),
      strengths: Array.isArray(j.strengths) ? j.strengths.map(String).slice(0, 6) : [],
      risks: Array.isArray(j.risks) ? j.risks.map(String).slice(0, 6) : [],
      watchpoints: Array.isArray(j.watchpoints) ? j.watchpoints.map(String).slice(0, 6) : [],
      outlook: String(j.outlook ?? ""),
      chartInsights: Array.isArray(j.chartInsights) ? j.chartInsights.map(String).slice(0, 6) : [],
      valuationSignal: vs
        ? {
            targetPrice: num(vs.targetPrice),
            marginOfSafetyPct: num(vs.marginOfSafetyPct),
            verdict: (vs.verdict as any) || "FAIR",
            actionVi: String(vs.actionVi || "Định giá hợp lý"),
          }
        : null,
    };
  } catch {
    return null;
  }
}

const SYS_ANALYSIS_JSON_HINT =
  'Cuối cùng (sau phần viết tay) thêm block JSON chính xác:\n```json\n{"executiveVerdict":"...","healthSummary":"...","trendSummary":"...","strengths":["..."],"risks":["..."],"watchpoints":["..."],"outlook":"...","chartInsights":["..."],"valuationSignal":{"targetPrice":12345,"marginOfSafetyPct":15.5,"verdict":"UNDERVALUED","actionVi":"Vùng mua an toàn"}}\n```';

const SYS_ANALYSIS =
  `Bạn là Giám đốc Phân tích Tài chính & Thẩm định Cổ phiếu Cao cấp tại Việt Nam trên nền tảng ORCA Finance.
Bạn phân tích BCTC 1-click dựa trên sự kết hợp độc đáo giữa:
1) Mô hình 4M Phil Town (Meaning - Ý nghĩa ngành nghề, Moat - Con hào kinh tế ROE & biên gộp, Management - Đòn bẩy nợ & quản trị, Margin of Safety - Biên an toàn định giá).
2) Mô hình Đánh giá Sức khỏe Tài chính 5 Trụ cột Orca Health (Sinh lời, Thanh khoản, Đòn bẩy nợ, Dòng tiền OCF/FCF, Hiệu quả kinh doanh).
3) Đọc sâu cấu trúc biểu đồ BCTC (chartSeries): Đối chiếu DT thuần vs LNST, biên gộp/ròng nở hay co, dòng tiền kinh doanh CFO có đi cùng LNST không.

Nguồn DUY NHẤT: JSON CONTEXT (BCTC + chartSeries + health + fourM + ngành). Không bịa số liệu, không bịa kỳ kế toán.

YÊU CẦU ĐẦU RA (1-CLICK QUICK AUDIT):
1) Executive Verdict (Đúc kết nhanh): 2-3 câu ngắn gọn định lượng chất lượng doanh nghiệp và đưa ra khuyến nghị thực chiến (MUA / TÍCH LŨY / QUAN SÁT / CẢNH BÁO).
2) Phân tích 4M: Đọc điểm số 4M trong context, nêu rõ con hào Moat (ROE, Biên gộp) và ban lãnh đạo (nợ D/E).
3) Đọc dòng tiền & BCTC: Chỉ rõ CFO vs LNST, FCF dương hay âm, áp lực nợ vay ngắn hạn.
4) Cờ rủi ro & Điểm theo dõi: 2-3 rủi ro cốt lõi và các chỉ báo cần theo dõi ở kỳ BCTC tới.
5) Định giá & Biên an toàn: Nhận định giá trị và mục tiêu giá hợp lý.

` + SYS_ANALYSIS_JSON_HINT;

const SYS_FORECAST = `Bạn là chuyên viên giải thích dự báo doanh thu cho NĐT cá nhân (ORCA).
Chỉ bàn trên HISTORY + FORECAST_ENGINE trong context — không sửa số engine.
Giọng tự nhiên, 4–6 câu: vì sao chọn tốc độ tăng trưởng đó; base/bull/bear khác nhau thế nào bằng lời thường; rủi ro nào dễ làm lệch dự báo.
Không kêu gọi mua/bán. Không mở đầu bằng "Dựa trên mô hình...".`;

export async function analyzeFinancialHealthAi(
  symbolRaw: string,
): Promise<{ analysis: FinancialAiAnalysis; meta: Meta } | null> {
  const symbol = symbolRaw.toUpperCase();
  const detailRes = await getVnStockDetail(symbol);
  if (!detailRes?.detail) return null;

  const sector = await getSectorTrendForSymbol(symbol).catch(() => null);
  const ctx = buildContext(symbol, detailRes.detail, sector);

  const hasFs =
    (detailRes.detail.financials.income?.length ?? 0) > 0 ||
    (detailRes.detail.financials.balance?.length ?? 0) > 0;

  if (!hasFs && !detailRes.detail.financialHealth) {
    return {
      analysis: {
        symbol,
        narrative: `${symbol}: chưa có snapshot BCTC để phân tích.`,
        structured: null,
        fourM: ctx.fourM,
        tcbsHealth: ctx.tcbsHealth,
        model: null,
        latencyMs: null,
        usedLlm: false,
        sourceNote: "No financial snapshot",
      },
      meta: buildMeta({
        source: detailRes.meta.source,
        sourceTimestampMs: toTs(detailRes.meta.sourceTimestamp),
        cached: detailRes.meta.cached,
        stale: true,
        note: "Thiếu BCTC",
      }),
    };
  }

  if (!llmConfigured()) {
    return {
      analysis: deterministicFallback(ctx),
      meta: buildMeta({
        source: detailRes.meta.source,
        sourceTimestampMs: toTs(detailRes.meta.sourceTimestamp),
        cached: detailRes.meta.cached,
        stale: detailRes.meta.stale,
        note: "AI Studio/OpenRouter chưa cấu hình — deterministic 4M/TCBS",
      }),
    };
  }

  const user = `Phân tích BCTC 1-click & định giá 4M cho ${symbol}. Đọc kỹ fourM, tcbsHealth, chartSeries (DT-LN, biên, dòng tiền OCF/FCF) và trả về nhận định chuẩn CFA kèm block JSON.\n\nCONTEXT:\n${JSON.stringify(ctx)}`;

  let llm = await llmChat("report", {
    system: SYS_ANALYSIS,
    user,
    temperature: 0.35,
    maxTokens: 1800,
    timeoutMs: 55_000,
  });

  if (!llm) {
    llm = await llmChat("analysis", {
      system: SYS_ANALYSIS,
      user,
      temperature: 0.35,
      maxTokens: 1800,
      timeoutMs: 55_000,
    });
  }

  if (llm) {
    const facts = collectFactNumbers(ctx);
    const val = validateOutput(llm.text, facts, 0.08);
    if (!val.ok && val.unsupported.length > 0) {
      const repair = await llmChat("report", {
        system: `${SYS_ANALYSIS}\nSTRICT REPAIR: chỉ dùng số liệu trong CONTEXT. Claim lỗi: ${val.unsupported
          .slice(0, 6)
          .map((u) => u.raw)
          .join(", ")}. Vẫn giữ văn phong sắc bén, thực chiến.`,
        user,
        temperature: 0.2,
        maxTokens: 1600,
        timeoutMs: 50_000,
      });
      if (repair) llm = repair;
    }
  }

  if (!llm) {
    const fb = deterministicFallback(ctx);
    return {
      analysis: { ...fb, sourceNote: "LLM fallback — Engine 4M/TCBS deterministic" },
      meta: buildMeta({
        source: detailRes.meta.source,
        sourceTimestampMs: toTs(detailRes.meta.sourceTimestamp),
        cached: detailRes.meta.cached,
        stale: detailRes.meta.stale,
        note: "LLM unavailable",
      }),
    };
  }

  const structured = tryParseStructured(llm.text);
  const narrative = llm.text.replace(/```json[\s\S]*?```/gi, "").trim();

  return {
    analysis: {
      symbol,
      narrative,
      structured,
      fourM: ctx.fourM,
      tcbsHealth: ctx.tcbsHealth,
      model: llm.model,
      latencyMs: llm.latencyMs,
      usedLlm: true,
      sourceNote: `${llm.model} · Quick Audit 4M + TCBS`,
    },
    meta: buildMeta({
      source: `${detailRes.meta.source}+llm:${llm.model}`,
      sourceTimestampMs: toTs(detailRes.meta.sourceTimestamp) ?? Date.now(),
      cached: false,
      stale: detailRes.meta.stale,
      note: `AI Quick Audit 4M/TCBS · ${llm.latencyMs}ms · ${llm.model}`,
    }),
  };
}

export async function forecastRevenueAi(
  symbolRaw: string,
  horizons = 4,
): Promise<{ forecast: RevenueForecastResult; meta: Meta } | null> {
  const symbol = symbolRaw.toUpperCase();
  const detailRes = await getVnStockDetail(symbol);
  if (!detailRes?.detail) return null;

  const income = (detailRes.detail.financials.income ?? []) as Record<string, unknown>[];
  const chrono = [...income]
    .map((r) => ({
      period: periodOf(r),
      netRevenue: num(r.netRevenue) ?? num(r.revenue),
    }))
    .filter((r) => r.netRevenue != null)
    .slice(0, 12)
    .reverse() as { period: string; netRevenue: number }[];

  if (chrono.length < 2) {
    return {
      forecast: {
        symbol,
        method: "insufficient_history",
        currencyNote: "VND (snapshot BCTC)",
        history: chrono.map((r) => ({ ...r, kind: "actual" as const })),
        forecast: [],
        metrics: {
          lastRevenue: chrono.at(-1)?.netRevenue ?? null,
          avgQoqGrowth: null,
          avgYoyGrowth: null,
          baseGrowthUsed: null,
        },
        narrative: "Chưa đủ chuỗi doanh thu trên snapshot BCTC để dự báo.",
        model: null,
        usedLlm: false,
        sourceNote: "Need ≥2 periods of netRevenue",
      },
      meta: buildMeta({
        source: detailRes.meta.source,
        sourceTimestampMs: toTs(detailRes.meta.sourceTimestamp),
        cached: detailRes.meta.cached,
        stale: detailRes.meta.stale,
        note: "insufficient BCTC history",
      }),
    };
  }

  const vals = chrono.map((r) => r.netRevenue);
  const qoq = avgGrowth(vals);
  let yoy: number | null = null;
  if (vals.length >= 5) {
    const yoyRates: number[] = [];
    for (let i = 4; i < vals.length; i++) {
      const prev = vals[i - 4]!;
      const cur = vals[i]!;
      if (prev !== 0) yoyRates.push((cur - prev) / Math.abs(prev));
    }
    if (yoyRates.length) {
      yoy = yoyRates.reduce((a, b) => a + b, 0) / yoyRates.length;
    }
  }

  let baseG = qoq ?? 0.02;
  if (yoy != null) baseG = 0.65 * baseG + 0.35 * (yoy / 4);
  baseG = Math.max(-0.25, Math.min(0.35, baseG));

  const last = vals[vals.length - 1]!;
  const lastPeriod = chrono[chrono.length - 1]!.period;
  const H = Math.min(Math.max(horizons, 1), 8);

  const forecastPts: RevenueForecastPoint[] = [];
  for (let i = 1; i <= H; i++) {
    const period = nextQuarterLabel(lastPeriod, i);
    const base = last * Math.pow(1 + baseG, i);
    forecastPts.push({ period, netRevenue: Math.round(base), kind: "forecast", scenario: "base" });
    forecastPts.push({
      period,
      netRevenue: Math.round(base * (1 + Math.abs(baseG) * 0.8 + 0.03)),
      kind: "forecast",
      scenario: "bull",
    });
    forecastPts.push({
      period,
      netRevenue: Math.round(base * (1 - Math.abs(baseG) * 0.8 - 0.03)),
      kind: "forecast",
      scenario: "bear",
    });
  }

  const engineCtx = {
    symbol,
    history: chrono,
    metrics: {
      lastRevenue: last,
      avgQoqGrowth: qoq,
      avgYoyGrowth: yoy,
      baseGrowthUsed: baseG,
    },
    forecastBase: forecastPts.filter((p) => p.scenario === "base"),
  };

  let narrative: string | null = null;
  let model: string | null = null;
  let usedLlm = false;

  if (llmConfigured()) {
    const llm = await llmChat("report", {
      system: SYS_FORECAST,
      user: `Giải thích ngắn, tự nhiên dự báo doanh thu ${symbol} (số engine đã có sẵn):\n${JSON.stringify(engineCtx)}`,
      temperature: 0.4,
      maxTokens: 700,
      timeoutMs: 40_000,
    });
    if (llm) {
      narrative = llm.text;
      model = llm.model;
      usedLlm = true;
    }
  }

  if (!narrative) {
    narrative = `Dự báo DT thuần ${symbol}: tăng trưởng QoQ TB ${pct(qoq)}, YoY TB ${pct(yoy)}. Engine dùng tốc độ base ${pct(baseG)}/quý cho ${H} quý tới (base/bull/bear). Số liệu từ snapshot BCTC.`;
  }

  return {
    forecast: {
      symbol,
      method: "qoq_blend_yoy_winsorized",
      currencyNote: "VND tuyệt đối từ snapshot BCTC (cùng nguồn trang Báo cáo tài chính)",
      history: chrono.map((r) => ({ period: r.period, netRevenue: r.netRevenue, kind: "actual" as const })),
      forecast: forecastPts,
      metrics: {
        lastRevenue: last,
        avgQoqGrowth: qoq,
        avgYoyGrowth: yoy,
        baseGrowthUsed: baseG,
      },
      narrative,
      model: model ?? modelFor("report"),
      usedLlm,
      sourceNote: usedLlm ? `Engine + LLM ${model}` : "Engine deterministic từ BCTC",
    },
    meta: buildMeta({
      source: detailRes.meta.source,
      sourceTimestampMs: toTs(detailRes.meta.sourceTimestamp),
      cached: detailRes.meta.cached,
      stale: detailRes.meta.stale,
      note: `Revenue forecast · growth ${pct(baseG)}`,
    }),
  };
}
