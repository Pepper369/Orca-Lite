import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePredictionMarketMacroRadar,
  evaluatePredictionBiasAlignment,
  parsePolymarketGammaMarkets,
  type PredictionMarketContract,
} from "../engines/prediction-market-radar";

describe("Prediction Market Leading Macro Radar Engine (agiprolabs Parity)", () => {
  it("computePredictionMarketMacroRadar: generates realistic forward-looking macro bias from contracts", () => {
    const radar = computePredictionMarketMacroRadar();

    assert.ok(radar.fedRateCutOdds >= 0.50 && radar.fedRateCutOdds <= 1.0);
    assert.ok(radar.cryptoBullishRangeOdds >= 0.50);
    assert.ok(["RISK_ON", "RISK_OFF", "NEUTRAL_CHOP"].includes(radar.riskRegime));
    assert.ok(radar.currencyBiasOverrides.has("USD"));
    assert.ok(radar.currencyBiasOverrides.has("EUR"));
    assert.ok(radar.currencyBiasOverrides.has("XAU"));

    // Rate cut odds (68%) > hot inflation (32%) -> USD should have negative bias
    const usdBias = radar.currencyBiasOverrides.get("USD")!;
    assert.ok(usdBias < 0, `USD bias ${usdBias} should be negative under high rate cut odds`);

    // Gold should have positive bias
    const goldBias = radar.currencyBiasOverrides.get("XAU")!;
    assert.ok(goldBias > 0, `XAU bias ${goldBias} should be positive`);

    assert.ok(radar.summaryVi.includes("Radar Thị trường Dự đoán"));
  });

  it("computePredictionMarketMacroRadar: shifts to RISK_OFF when geopolitical stress spikes", () => {
    const stressContracts: PredictionMarketContract[] = [
      {
        id: "poly_war",
        platform: "POLYMARKET",
        title: "Major geopolitical escalation",
        category: "GEOPOLITICS",
        impliedProbability: 0.85, // 85% high stress
        volume24hUsd: 50_000_000,
        lastUpdatedTimestamp: Date.now(),
      },
      {
        id: "poly_fed",
        platform: "POLYMARKET",
        title: "Fed rate decision",
        category: "FED_RATES",
        impliedProbability: 0.30,
        volume24hUsd: 10_000_000,
        lastUpdatedTimestamp: Date.now(),
      },
    ];

    const radar = computePredictionMarketMacroRadar(stressContracts, Date.now() + 100000);
    assert.equal(radar.riskRegime, "RISK_OFF");
    assert.ok(radar.geopoliticalStressOdds >= 0.80);
    // Safe havens (XAU, JPY, CHF) should receive strong boost
    assert.ok(radar.currencyBiasOverrides.get("XAU")! >= 1.0);
    assert.ok(radar.currencyBiasOverrides.get("CHF")! >= 1.0);
  });

  it("evaluatePredictionBiasAlignment: rewards trades aligned with prediction odds and penalizes contrarian headwinds", () => {
    // 1. Crypto BUY in Risk-On -> ALIGNED_LEADING_TAILWIND (+15% size bonus)
    const cryptoBuy = evaluatePredictionBiasAlignment({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "BUY",
    });
    assert.equal(cryptoBuy.alignment, "ALIGNED_LEADING_TAILWIND");
    assert.ok(cryptoBuy.alignmentScore >= 35);
    assert.equal(cryptoBuy.recommendedSizeMultiplier, 1.15);
    assert.ok(cryptoBuy.keyProbabilityDrivers.length > 0);

    // 2. Crypto SELL in Risk-On -> CONTRARIAN_HEADWIND (50% size cut)
    const cryptoSell = evaluatePredictionBiasAlignment({
      symbol: "BTCUSDT",
      assetType: "CRYPTO",
      direction: "SELL",
    });
    assert.equal(cryptoSell.alignment, "CONTRARIAN_HEADWIND");
    assert.ok(cryptoSell.alignmentScore <= -35);
    assert.equal(cryptoSell.recommendedSizeMultiplier, 0.50);
    assert.ok(cryptoSell.warningMessage?.includes("Nguy cơ bơi ngược dòng"));

    // 3. Gold BUY when USD is weak and safe haven demand is present -> ALIGNED
    const goldBuy = evaluatePredictionBiasAlignment({
      symbol: "XAUUSD",
      assetType: "FOREX",
      direction: "BUY",
    });
    assert.ok(goldBuy.alignmentScore > 0);
    assert.ok(goldBuy.recommendedSizeMultiplier >= 1.0);
  });

  it("parsePolymarketGammaMarkets: classifies live Polymarket markets and inverts peace odds", () => {
    const raw = [
      { id: "m1", question: "Will the Fed cut interest rates by 25 bps at next FOMC?", outcomePrices: '["0.74","0.26"]', volume24hr: 9_000_000 },
      { id: "m2", question: "Will US CPI inflation come in above 3.0%?", outcomePrices: '["0.28","0.72"]', volume24hr: 2_500_000 },
      { id: "m3", question: "Will Bitcoin hit above $120,000 this quarter?", outcomePrices: '["0.66","0.34"]', volume24hr: 12_000_000 },
      { id: "m4", question: "Russia-Ukraine ceasefire deal before July?", outcomePrices: '["0.30","0.70"]', volume24hr: 4_000_000 },
      { id: "m5", question: "Who wins Best Picture at the Oscars?", outcomePrices: '["0.50","0.50"]', volume24hr: 1_000_000 },
    ];
    const parsed = parsePolymarketGammaMarkets(raw);
    assert.equal(parsed.length, 4);
    assert.equal(parsed.find((c) => c.category === "FED_RATES")?.impliedProbability, 0.74);
    assert.equal(parsed.find((c) => c.category === "GEOPOLITICS")?.impliedProbability, 0.70);

    const liveRadar = computePredictionMarketMacroRadar(parsed, Date.now(), "LIVE_POLYMARKET");
    assert.equal(liveRadar.dataSource, "LIVE_POLYMARKET");
    assert.equal(liveRadar.riskRegime, "RISK_OFF"); // 70% geo stress -> RISK_OFF
  });
});
