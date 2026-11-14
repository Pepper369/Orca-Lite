/**
 * AGENT TOOL REGISTRY & DISPATCHER (ORCA AGENTIC FA)
 * Equips ORCA AI with executable tools:
 * 1. tool_get_financial_ratios: Lấy bộ 5 nhóm chỉ số tài chính chuẩn quốc tế.
 * 2. tool_run_valuation_models: Chạy định giá DCF, Gordon P/B, RNAV.
 * 3. tool_get_bctc_quality_and_redflags: Kiểm tra Piotroski F-Score, Altman-Z, gian lận M-Score.
 * 4. tool_search_official_disclosures: Tra cứu BCTC kiểm toán, nghị quyết ĐHĐCĐ và báo cáo CTCK.
 * 5. tool_screen_stocks_by_criteria: Lọc các mã cổ phiếu thỏa mãn tiêu chí FA.
 */

import "server-only";
import { computeDetailedRatios, pickMetricsFromPeriods } from "../../financial/ratio-engine";
import { fetchVndirectFinancials } from "../../financial/vndirect-fs";
import { runFundamentalValuation } from "../../services/fundamental-valuation";
import { getVndSignedDisclosures, getVndAnalyticReports } from "../../providers/vndirect-news";
import { screenFundamental } from "../../services/fundamental-screener";
import { getVnQuotes } from "../../services/stocks";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const ORCA_FA_TOOLS: ToolDefinition[] = [
  {
    name: "tool_get_financial_ratios",
    description: "Lấy bộ 5 nhóm chỉ số tài chính chuẩn quốc tế (Thanh khoản, Đòn bẩy dài hạn, Vòng quay hoạt động & chu kỳ tiền CCC, Sinh lời & bóc tách DuPont, Bội số thị trường) của một mã cổ phiếu.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mã cổ phiếu (ví dụ: HPG, FPT, VCB, VHM)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "tool_run_valuation_models",
    description: "Thực hiện mô hình định giá định lượng: Chiết khấu dòng tiền DCF, Gordon P/B bền vững (cho Ngân hàng), hoặc RNAV Quỹ đất (cho Bất động sản).",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mã cổ phiếu cần định giá" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "tool_get_bctc_quality_and_redflags",
    description: "Kiểm tra toàn diện sức khỏe tài chính: Piotroski F-Score (thang 9 điểm), Altman Z''-Score (vùng nguy cơ kiệt quệ), và chất lượng lợi nhuận cốt lõi (phát hiện thoát lỗ trên giấy).",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mã cổ phiếu" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "tool_search_official_disclosures",
    description: "Tra cứu danh mục công bố thông tin chính thức, văn bản BCTC kiểm toán, nghị quyết ĐHĐCĐ và báo cáo phân tích định giá CTCK gần nhất.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mã cổ phiếu" },
        queryType: {
          type: "string",
          description: "Loại văn bản cần tra cứu",
          enum: ["disclosures", "analyst_reports", "all"],
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "tool_screen_stocks_by_criteria",
    description: "Sàng lọc toàn bộ cổ phiếu trên 3 sàn theo tiêu chuẩn tài chính khắt khe (ROE, nợ vay, thanh khoản, vòng quay tài sản).",
    parameters: {
      type: "object",
      properties: {
        preset: {
          type: "string",
          description: "Chiến lược sàng lọc FA",
          enum: ["safe_liquidity", "safe_leverage", "high_efficiency", "custom"],
        },
        sector: { type: "string", description: "Ngành (tùy chọn, ví dụ: Thép, Ngân hàng, Bất động sản)" },
      },
      required: ["preset"],
    },
  },
  {
    name: "tool_get_macro_and_commodities",
    description: "Tra cứu dữ liệu vĩ mô Việt Nam (GDP, CPI, PMI, Cung tiền M2, Lãi suất điều hành/liên ngân hàng), giá hàng hóa thế giới (Dầu, Thép, Vàng, Nông sản) và Lịch kinh tế.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Danh mục vĩ mô cần tra cứu",
          enum: ["commodities", "rates_macro", "economic_calendar", "all"],
        },
        commodityQuery: { type: "string", description: "Tên mặt hàng cụ thể nếu tìm hàng hóa (ví dụ: dầu, thép, cà phê, cao su)" },
      },
      required: ["category"],
    },
  },
  {
    name: "tool_verify_claims_and_rumors",
    description: "Chế độ Thẩm định Tin đồn & Fact-Checking (Verify Mode): Bóc tách một bài viết, tin đồn, bài phím hàng mạng xã hội (F247, Facebook, Zalo) và đối chiếu trực tiếp với BCTC thật để phát hiện dấu hiệu lùa gà, thổi phồng hoặc bẫy giá trị.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Mã cổ phiếu bị đồn thổi hoặc nhắc tới trong bài viết" },
        text: { type: "string", description: "Toàn văn nội dung bài đăng, tin nhắn phím hàng hoặc nhận định cần thẩm định" },
      },
      required: ["symbol", "text"],
    },
  },
];

export async function executeOrcaTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result: unknown; error?: string }> {
  try {
    const symbol = typeof args.symbol === "string" ? args.symbol.trim().toUpperCase() : "";

    switch (name) {
      case "tool_get_financial_ratios": {
        if (!symbol) return { success: false, result: null, error: "Thiếu mã cổ phiếu" };
        const [fs, quotePack] = await Promise.all([
          fetchVndirectFinancials(symbol, { limitPeriods: 8 }).catch(() => null),
          getVnQuotes([symbol]).catch(() => null),
        ]);
        if (!fs?.periods?.length) return { success: false, result: null, error: `Không lấy được BCTC cho ${symbol}` };
        const picked = pickMetricsFromPeriods(fs.periods);
        const price = quotePack?.quotes?.[0]?.price ?? null;
        const res = computeDetailedRatios({
          metrics: picked.metrics,
          prior: picked.prior,
          priceQuote: price,
          sharesOutstanding: null,
          periodLabel: picked.label,
        });
        const summaryObj: Record<string, unknown> = {
          period: res.period,
          liquidity: res.categories.liquidity.map((i) => ({ label: i.labelVi, value: i.value, format: i.format, band: i.bandLabel })),
          leverage: res.categories.leverage.map((i) => ({ label: i.labelVi, value: i.value, format: i.format, band: i.bandLabel })),
          efficiency: res.categories.efficiency.map((i) => ({ label: i.labelVi, value: i.value, format: i.format })),
          profitability: res.categories.profitability.map((i) => ({ label: i.labelVi, value: i.value, format: i.format, band: i.bandLabel })),
          dupont: res.categories.dupont.map((i) => ({ label: i.labelVi, value: i.value, format: i.format })),
        };
        return { success: true, result: summaryObj };
      }

      case "tool_run_valuation_models": {
        if (!symbol) return { success: false, result: null, error: "Thiếu mã cổ phiếu" };
        const val = await runFundamentalValuation(symbol, { full: true, peers: true });
        if (!val?.data) return { success: false, result: null, error: "Định giá không khả dụng" };
        const d = val.data;
        const fv = (d.fairValues ?? {}) as Record<string, unknown>;
        const ind = (d.industry ?? {}) as Record<string, unknown>;
        return {
          success: true,
          result: {
            symbol,
            currentPrice: d.currentPrice,
            fairValueBlended: fv.blended,
            dcfBase: fv.dcfBase,
            upsidePct: d.upsideDownside,
            grade: d.valuationGrade,
            industryProfile: d.industryProfile,
            bankValuation: ind.bankValuation ?? null,
            realEstateValuation: ind.realEstateValuation ?? null,
          },
        };
      }

      case "tool_get_bctc_quality_and_redflags": {
        if (!symbol) return { success: false, result: null, error: "Thiếu mã cổ phiếu" };
        const val = await runFundamentalValuation(symbol, { full: true });
        if (!val?.health) return { success: false, result: null, error: "Chưa đủ số liệu BCTC" };
        const h = val.health;
        return {
          success: true,
          result: {
            symbol,
            healthScoreOverall: h.scores.overall,
            profitabilityScore: h.scores.profitability,
            leverageScore: h.scores.leverage,
            liquidityScore: h.scores.liquidity,
            cashflowScore: h.scores.cashflow,
            riskFlags: h.riskFlags,
          },
        };
      }

      case "tool_search_official_disclosures": {
        if (!symbol) return { success: false, result: null, error: "Thiếu mã cổ phiếu" };
        const [disclosures, reports] = await Promise.allSettled([
          getVndSignedDisclosures(symbol, 6),
          getVndAnalyticReports(symbol, 4),
        ]);
        return {
          success: true,
          result: {
            symbol,
            disclosures: disclosures.status === "fulfilled" ? disclosures.value.slice(0, 5) : [],
            reports: reports.status === "fulfilled" ? reports.value.slice(0, 3) : [],
          },
        };
      }

      case "tool_screen_stocks_by_criteria": {
        const preset = String(args.preset || "safe_liquidity");
        const sector = typeof args.sector === "string" ? args.sector : undefined;
        let filters = {};
        if (preset === "safe_liquidity") {
          filters = { minCurrentRatio: 1.5, minQuickRatio: 1.0, minNwcToAssets: 20, sector };
        } else if (preset === "safe_leverage") {
          filters = { maxDebtEquity: 1.0, maxLongTermDebtRatio: 40, minCashDebtCoverage: 3.0, sector };
        } else if (preset === "high_efficiency") {
          filters = { minFixedAssetTurnover: 1.2, minNwcTurnover: 3.0, minRoe: 15, sector };
        }
        const screenRes = await screenFundamental({ ...filters, limit: 10 });
        return {
          success: true,
          result: {
            preset,
            totalMatched: screenRes?.rows?.length ?? 0,
            topRows: screenRes?.rows?.slice(0, 10).map((r) => ({
              symbol: r.symbol,
              sector: r.sector,
              price: r.price,
              score: r.score,
              roe: r.roe,
              currentRatio: r.currentRatio,
              debtEquity: r.debtEquity,
            })) ?? [],
          },
        };
      }

      case "tool_get_macro_and_commodities": {
        const cat = String(args.category || "all");
        const query = typeof args.commodityQuery === "string" ? args.commodityQuery.toLowerCase() : "";

        const [commodities, calendar, ecoMacro, ecoRates] = await Promise.allSettled([
          cat === "commodities" || cat === "all" ? (await import("../../services/commodities")).getCommodityMarket() : null,
          cat === "economic_calendar" || cat === "all" ? (await import("../../providers/economic-calendar")).getEconomicCalendar() : null,
          cat === "rates_macro" || cat === "all" ? (await import("../../services/economy")).getEconomicData("macro-economic") : null,
          cat === "rates_macro" || cat === "all" ? (await import("../../services/economy")).getEconomicData("currency-interest-rate") : null,
        ]);

        let commRows = commodities.status === "fulfilled" && commodities.value?.data?.rows ? commodities.value.data.rows : [];
        if (query && commRows.length) {
          commRows = commRows.filter((c) => c.name.toLowerCase().includes(query) || c.symbol.toLowerCase().includes(query));
        }

        return {
          success: true,
          result: {
            category: cat,
            commodities: commRows.slice(0, 10).map((c) => ({
              name: c.name,
              symbol: c.symbol,
              price: c.price,
              unit: c.unit,
              currency: c.currency,
              changePercent: c.changePercent,
            })),
            macroIndicators: ecoMacro.status === "fulfilled" && ecoMacro.value?.data?.rows ? ecoMacro.value.data.rows.slice(0, 6) : [],
            interestRates: ecoRates.status === "fulfilled" && ecoRates.value?.data?.rows ? ecoRates.value.data.rows.slice(0, 6) : [],
            upcomingEvents: calendar.status === "fulfilled" && calendar.value?.upcomingHighImpact ? calendar.value.upcomingHighImpact.slice(0, 5) : [],
          },
        };
      }

      case "tool_verify_claims_and_rumors": {
        if (!symbol) return { success: false, result: null, error: "Thiếu mã cổ phiếu để đối chiếu BCTC" };
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (!text) return { success: false, result: null, error: "Thiếu nội dung bài đăng cần thẩm định" };

        const { verifyFinancialClaims } = await import("../fact-check-engine");
        const report = await verifyFinancialClaims({ symbol, text });
        if (!report) return { success: false, result: null, error: "Không thể đối chiếu BCTC cho mã này" };

        return {
          success: true,
          result: {
            symbol: report.symbol,
            companyName: report.companyName,
            credibilityScore: report.overallVerdict.credibilityScore,
            status: report.overallVerdict.status,
            summaryVi: report.overallVerdict.summaryVi,
            warningFlags: report.overallVerdict.warningFlags,
            claims: report.claims.map((c) => ({
              category: c.category,
              claimText: c.claimText,
              actualValue: c.actualValue,
              verdict: c.verdict,
              analysis: c.analysisVi,
            })),
            bctcRealityCheck: report.bctcRealityCheck,
          },
        };
      }

      default:
        return { success: false, result: null, error: `Công cụ không xác định: ${name}` };
    }
  } catch (err) {
    return { success: false, result: null, error: err instanceof Error ? err.message : "Tool error" };
  }
}
