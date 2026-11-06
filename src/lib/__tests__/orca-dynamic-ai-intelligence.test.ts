import test from "node:test";
import assert from "node:assert/strict";
import { generateOrcaDynamicAiReport, type DynamicAiInput } from "../engines/orca-dynamic-ai-intelligence";
import type { OhlcvBar } from "../types";

test("generateOrcaDynamicAiReport generates deep CFA-level quantitative intelligence without external LLM", () => {
  // Construct 35 bars simulating a high-quality Wyckoff Spring reversal
  const bars: OhlcvBar[] = [];
  let price = 50;
  for (let i = 0; i < 35; i++) {
    if (i < 26) {
      price -= 0.5;
    } else {
      price += 0.35;
    }
    bars.push({
      time: 1700000000 + i * 86400,
      open: price - 0.2,
      high: price + 0.4,
      low: price - 0.3,
      close: price,
      volume: 25000 + (i === 26 ? 60000 : 0),
    });
  }

  const input: DynamicAiInput = {
    symbol: "HPG",
    name: "Công ty Cổ phần Tập đoàn Hòa Phát",
    quote: {
      symbol: "HPG",
      price: price,
      changePercent: 2.5,
      volume: 15_000_000,
      open: price - 0.3,
      high: price + 0.5,
      low: price - 0.2,
      assetClass: "stock",
    },
    bars,
    financials: {
      income: [
        {
          period: "2024-Q3",
          netRevenue: 34_000_000_000_000,
          netIncome: 3_020_000_000_000,
        },
      ],
      balance: [
        {
          period: "2024-Q3",
          totalAssets: 210_000_000_000_000,
          equity: 110_000_000_000_000,
          shortTermBorrowings: 45_000_000_000_000,
          longTermBorrowings: 20_000_000_000_000,
        },
      ],
      cashflow: [
        {
          period: "2024-Q3",
          operatingCashFlow: 5_200_000_000_000, // OCF > Net Income (High quality)
        },
      ],
      ratios: [
        {
          roe: 18.5,
          roic: 14.2,
          grossMargin: 22.0,
          currentRatio: 1.6,
        },
      ],
    },
    financialHealth: {
      scores: {
        overall: 82,
        profitability: 85,
        liquidity: 78,
        leverage: 75,
        cashflow: 88,
        efficiency: 80,
      },
      industry: { labelVi: "Thép & Vật liệu xây dựng" },
      riskFlags: [],
    },
    ratioMap: {
      pe: 11.2,
      pb: 1.45,
    },
    sectorTrend: {
      sector: "Thép",
      trendScore: 80,
      trendLabelVi: "Tăng trưởng tích cực",
    },
    foreignFlow: {
      netValue: 120_000_000_000, // Khối ngoại mua ròng 120 tỷ
    },
  };

  const report = generateOrcaDynamicAiReport(input);

  // 1. Basic properties & sub-second latency
  assert.equal(report.symbol, "HPG");
  assert.equal(report.usedLlm, false);
  assert.equal(report.model, "Orca Dynamic Quant AI Engine (Live Datafeed)");
  assert.ok(report.latencyMs < 1000, `Latency must be sub-second (<1000ms), was ${report.latencyMs}ms`);

  // 2. Structured data assertions
  assert.ok(report.structured.executiveVerdict.length > 20);
  assert.ok(report.structured.strengths.length >= 2);
  assert.ok(report.structured.chartInsights.length >= 2);
  assert.ok(report.structured.valuationSignal.targetPrice != null);
  assert.ok(report.structured.valuationSignal.marginOfSafetyPct != null);

  // 3. Narrative completeness (CFA format)
  assert.ok(report.narrative.includes("BÁO CÁO PHÂN TÍCH ĐỊNH LƯỢNG TOÀN DIỆN"));
  assert.ok(report.narrative.includes("ĐỊNH VỊ CHÂN SÓNG APEX"));
  assert.ok(report.narrative.includes("DẤU CHÂN CÁ MẬP"));
  assert.ok(report.narrative.includes("CON HÀO KINH TẾ 4M"));
  assert.ok(report.narrative.includes("TRIPLE-BARRIER"));

  // 4. In-House Triple-Barrier & 4M integrations
  assert.ok(report.tripleBarrier != null);
  assert.ok(report.tripleBarrier.riskRewardRatio >= 1.5);
  assert.ok(report.fourM.totalScore >= 60);
});

test("generateOrcaDynamicAiReport handles edge cases with zero crashes", () => {
  // Empty data / new IPO / missing financials
  const minimalReport = generateOrcaDynamicAiReport({
    symbol: "NEWSTOCK",
    bars: [],
  });

  assert.equal(minimalReport.symbol, "NEWSTOCK");
  assert.equal(minimalReport.usedLlm, false);
  assert.ok(minimalReport.narrative.length > 50);
  assert.ok(minimalReport.structured.executiveVerdict.length > 0);
});

test("generateOrcaDynamicAiReport enforces zero hallucination: never fabricates missing financial numbers", () => {
  // Stock with bars but NO financial statements (BCTC pending/IPO)
  const report = generateOrcaDynamicAiReport({
    symbol: "UNLISTED",
    bars: [
      { time: 1700000000, open: 20, high: 21, low: 19, close: 20.5, volume: 10000 },
      { time: 1700086400, open: 20.5, high: 21.2, low: 20.1, close: 20.8, volume: 12000 },
    ],
    // Empty financials
    financials: null,
    financialHealth: null,
    ratioMap: undefined,
  });

  // Verify that metrics are NOT default fabricated numbers (15, 12, 25, 0.6, 12.5, 1.8)
  assert.equal(report.fourM.roe, null, "ROE must be null when missing, not fabricated");
  assert.equal(report.fourM.roic, null, "ROIC must be null when missing, not fabricated");
  assert.equal(report.fourM.grossMargin, null, "Gross margin must be null when missing, not fabricated");
  assert.equal(report.fourM.debtEquity, null, "Debt/Equity must be null when missing, not fabricated");
  assert.equal(report.fourM.pe, null, "P/E must be null when missing, not fabricated");
  assert.equal(report.fourM.pb, null, "P/B must be null when missing, not fabricated");
  assert.equal(report.tcbsHealth.overall, null, "Health score must be null when missing, not fabricated");

  // Verify that narrative explicitly communicates missing data instead of claiming fake percentages
  assert.ok(report.narrative.includes("Chưa có dữ liệu"), "Narrative must explicitly state missing data");
  assert.ok(!report.narrative.includes("ROE: **15.0%**"), "Must not hallucinate ROE 15.0%");
  assert.ok(!report.narrative.includes("Biên lãi gộp: **25.0%**"), "Must not hallucinate Gross Margin 25.0%");
  assert.ok(!report.narrative.includes("P/E hiện tại: **12.5x**"), "Must not hallucinate P/E 12.5x");
});
