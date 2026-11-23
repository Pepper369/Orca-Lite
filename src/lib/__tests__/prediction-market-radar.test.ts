import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePredictionMarketMacroRadar,
  evaluatePredictionBiasAlignment,
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
});
