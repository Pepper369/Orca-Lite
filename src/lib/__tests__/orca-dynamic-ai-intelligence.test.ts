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
  assert.ok(report.latencyMs < 50, `Latency must be sub-50ms, was ${report.latencyMs}ms`);

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
