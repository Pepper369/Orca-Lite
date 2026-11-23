import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  conveneInvestmentCommittee,
  calculateDynamicCommitteeWeights,
  evaluateBuffettPersona,
  evaluateGrahamPersona,
  evaluateBurryPersona,
  evaluateCathieWoodPersona,
  evaluateQuantAnalystPersona,
  type InvestmentCommitteeInput,
} from "../engines/ai-investment-committee";

describe("Multi-Persona AI Investment Committee Engine (AI Hedge Fund & TradingAgents Parity)", () => {
  it("calculateDynamicCommitteeWeights: dynamically shifts persona weights according to market regime", () => {
    // Crisis High Volatility regime -> Burry and Graham lead
    const crisisWeights = calculateDynamicCommitteeWeights("CRISIS_HIGH_VOL");
    assert.equal(crisisWeights.MICHAEL_BURRY, 0.35);
    assert.equal(crisisWeights.BEN_GRAHAM, 0.25);
    assert.equal(crisisWeights.CATHIE_WOOD, 0.05);

    // Trend Expansion regime -> Cathie Wood and Quant Analyst lead
    const trendWeights = calculateDynamicCommitteeWeights("TREND_EXPANSION");
    assert.equal(trendWeights.CATHIE_WOOD, 0.30);
    assert.equal(trendWeights.QUANT_ANALYST, 0.30);
    assert.equal(trendWeights.MICHAEL_BURRY, 0.10);
  });

  it("evaluateBuffettPersona: favors high ROIC and conservative debt", () => {
    const compounder: InvestmentCommitteeInput = {
      symbol: "FPT",
      price: 130000,
      roicPct: 24.5,
      roePct: 26.0,
      debtToEquity: 0.45,
      peRatio: 18.0,
    };
    const vote = evaluateBuffettPersona(compounder, 0.25);
    assert.equal(vote.stance, "BULLISH");
    assert.ok(vote.convictionScore >= 40);
    assert.equal(vote.vetoTriggered, false);
    assert.ok(vote.thesisVi.includes("con hào kinh tế"));
  });

  it("evaluateGrahamPersona: rewards low P/E*P/B product and strong working capital", () => {
    const deepValue: InvestmentCommitteeInput = {
      symbol: "VNM",
      price: 65000,
      peRatio: 12.0,
      pbRatio: 1.4, // Graham product = 16.8 <= 22.5
      currentRatio: 2.2,
      debtToEquity: 0.3,
    };
    const vote = evaluateGrahamPersona(deepValue, 0.25);
    assert.equal(vote.stance, "BULLISH");
    assert.ok(vote.convictionScore >= 50);
    assert.ok(vote.keyFactors.some((f) => f.includes("Benjamin Graham")));
  });

  it("evaluateBurryPersona: flags critical tail risk and triggers CRO veto on systemic fragility", () => {
    const fragileStock: InvestmentCommitteeInput = {
      symbol: "BUBBLE",
      price: 100,
      tailRiskScore: 82, // Critical tail risk >= 75
      debtToEquity: 3.2,
      volatilitySigma: 0.65,
      peRatio: 95.0,
    };
    const vote = evaluateBurryPersona(fragileStock, 0.35);
    assert.equal(vote.stance, "BEARISH");
    assert.ok(vote.convictionScore <= -50);
    assert.equal(vote.vetoTriggered, true);
    assert.ok(vote.keyFactors.some((f) => f.includes("sụp đổ thanh khoản")));
  });

  it("evaluateCathieWoodPersona: endorses high revenue growth and crypto network disruption", () => {
    const cryptoGrowth: InvestmentCommitteeInput = {
      symbol: "SOLUSDT",
      assetType: "CRYPTO",
      price: 180,
      revenueGrowthYoY: 52.0,
      priceChangePct: 12.5,
      alphaScore: 60,
    };
    const vote = evaluateCathieWoodPersona(cryptoGrowth, 0.30);
    assert.equal(vote.stance, "BULLISH");
    assert.ok(vote.convictionScore >= 50);
    assert.ok(vote.thesisVi.includes("công nghệ số mũ"));
  });

  it("evaluateQuantAnalystPersona: responds strongly to Qlib multi-factor alphas and L2 imbalance", () => {
    const quantPositive: InvestmentCommitteeInput = {
      symbol: "BTCUSDT",
      price: 68000,
      alphaScore: 55, // Strong positive Qlib alpha
      orderBookImbalance: 0.35, // 35% buy pressure
      macroRegime: "TREND_EXPANSION",
    };
    const vote = evaluateQuantAnalystPersona(quantPositive, 0.30);
    assert.equal(vote.stance, "BULLISH");
    assert.ok(vote.convictionScore >= 60);
    assert.ok(vote.keyFactors.some((f) => f.includes("Qlib Alpha")));
  });

  it("conveneInvestmentCommittee: synthesizes institutional consensus and enforces CRO directives", () => {
    // 1. High-quality asset in Trend Expansion -> STRONG_BUY approved
    const bluechip = conveneInvestmentCommittee({
      symbol: "TECH_LEADER",
      price: 250,
      roicPct: 22.0,
      peRatio: 22.0,
      pbRatio: 2.1,
      currentRatio: 2.1,
      debtToEquity: 0.35,
      revenueGrowthYoY: 28.0,
      alphaScore: 48,
      orderBookImbalance: 0.20,
      macroRegime: "TREND_EXPANSION",
      tailRiskScore: 25,
    });
    assert.ok(bluechip.consensusScore >= 35);
    assert.ok(bluechip.verdict === "BUY" || bluechip.verdict === "STRONG_BUY");
    assert.equal(bluechip.chiefRiskOfficer.approved, true);
    assert.ok(bluechip.chiefRiskOfficer.recommendedSizeMultiplier >= 0.85);

    // 2. High-risk asset with Burry Veto -> CRO veto blocks allocation
    const toxic = conveneInvestmentCommittee({
      symbol: "TOXIC_CREDIT",
      price: 15,
      tailRiskScore: 88, // Veto trigger
      debtToEquity: 4.5,
      currentRatio: 0.7,
      peRatio: 80,
      macroRegime: "CRISIS_HIGH_VOL",
    });
    assert.equal(toxic.chiefRiskOfficer.approved, false);
    assert.equal(toxic.chiefRiskOfficer.recommendedSizeMultiplier, 0.0);
    assert.ok(toxic.chiefRiskOfficer.vetoReason?.includes("CRO VETO"));
    assert.equal(toxic.verdict, "REDUCE");
    assert.ok(toxic.verdictLabelVi.includes("BỊ CHẶN BỞI CRO"));
  });
});
