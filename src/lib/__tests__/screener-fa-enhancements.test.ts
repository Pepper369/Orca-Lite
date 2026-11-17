import test from "node:test";
import assert from "node:assert/strict";
import { computeFundamentalMatrix } from "../engines/fundamental-quant-matrix";
import {
  SCREENER_BIT,
  queryScreenerStocks,
} from "../services/screener-snapshot-service";

test("Fundamental Analysis Matrix & Screener Phase 1 & 2 Enhancements", async (t) => {
  await t.test("Phase 1: Beneish M-Score and Sloan Accrual correctly detect forensic quality", () => {
    // Normal healthy company: low receivables growth, stable margins, positive CFO
    const healthy = computeFundamentalMatrix({
      snap: {
        roic: 16.0,
        interestCoverage: 8.0,
        netDebtToEbitda: -0.5,
        ocfTtm: 1500,
        fcfTtm: 1100,
        cash: 3000,
        totalDebt: 500,
        netProfit: 1200,
        revenue: 10000,
        qualityScore: 82,
        healthScore: 85,
      },
      price: 50.0,
      pe: 12.0,
      pb: 1.8,
    });

    assert.ok(healthy.beneishMScore != null);
    // In healthy earnings, M-Score is typically well below -2.22
    assert.equal(healthy.isBeneishSafe, true);
    assert.ok(healthy.beneishMScore < -2.22);
    // Sloan accrual ratio: (Net Profit - CFO) / Total Assets -> should be negative or small
    assert.ok(healthy.sloanAccrualRatio != null);
    assert.ok(healthy.sloanAccrualRatio < 0.1);
  });

  await t.test("Phase 1: Identifies Warren Buffett Compounder", () => {
    const compounder = computeFundamentalMatrix({
      snap: {
        roic: 22.5,
        interestCoverage: 15.0,
        netDebtToEbitda: -2.0,
        ocfTtm: 4000,
        fcfTtm: 3200,
        cash: 8000,
        totalDebt: 1000,
        netProfit: 2500,
        revenue: 18000,
        qualityScore: 92,
        healthScore: 95,
      },
      price: 80.0,
      pe: 15.0,
      pb: 2.5,
      niYoyPct: 18.0,
    });

    assert.equal(compounder.isBuffettCompounder, true);
    assert.ok(compounder.buffettScore != null && compounder.buffettScore >= 75);
    assert.equal(compounder.isNetCash, true);
    assert.ok(compounder.roic != null && compounder.roic >= 15);
  });

  await t.test("Phase 1: Identifies Peter Lynch Fast Grower with attractive PEG", () => {
    const lynch = computeFundamentalMatrix({
      snap: {
        roic: 18.0,
        interestCoverage: 6.0,
        netDebtToEbitda: 0.2,
        ocfTtm: 1200,
        fcfTtm: 800,
        cash: 1000,
        totalDebt: 800,
        netProfit: 900,
        revenue: 7000,
        qualityScore: 75,
        healthScore: 78,
      },
      price: 45.0,
      pe: 12.0,
      niYoyPct: 24.0, // High earnings growth
      revenueYoyPct: 20.0,
    });

    assert.equal(lynch.isLynchFastGrower, true);
    assert.ok(lynch.peg != null && lynch.peg <= 1.0);
  });

  await t.test("Phase 1: Working Capital & Cash Conversion Cycle (CCC)", () => {
    const workingCap = computeFundamentalMatrix({
      snap: {
        roic: 14.0,
        interestCoverage: 5.0,
        netDebtToEbitda: 0.5,
        currentRatio: 1.8,
        quickRatio: 1.2,
        ocfTtm: 2200,
        fcfTtm: 1600,
        cash: 1500,
        totalDebt: 1000,
        netProfit: 1400,
        revenue: 11000,
        qualityScore: 80,
        healthScore: 82,
      },
      price: 35.0,
      pe: 11.0,
    });

    assert.ok(workingCap.cashConversionCycleDays != null);
    assert.equal(workingCap.isWorkingCapitalChampion, true);
  });

  await t.test("Phase 1: Dividend Aristocrat with high yield and safe payout ratio", () => {
    const dividendStock = computeFundamentalMatrix({
      snap: {
        roic: 15.0,
        interestCoverage: 9.0,
        netDebtToEbitda: -0.8,
        ocfTtm: 1800,
        fcfTtm: 1400,
        cash: 2500,
        totalDebt: 400,
        netProfit: 1300,
        revenue: 9000,
        qualityScore: 84,
        healthScore: 88,
      },
      price: 40.0,
      dividendYield: 7.5, // 7.5% yield
      pe: 9.5,
    });

    assert.equal(dividendStock.isDividendAristocrat, true);
    assert.ok(dividendStock.dividendPayoutRatio != null);
  });

  await t.test("Phase 2: Bitmask constants are strictly orthogonal and non-zero", () => {
    const bits = [
      SCREENER_BIT.SWEET_ZONE,
      SCREENER_BIT.BUY_TRIGGER,
      SCREENER_BIT.SECTOR_LEADING,
      SCREENER_BIT.SQUEEZE_ON,
      SCREENER_BIT.SQUEEZE_FIRED,
      SCREENER_BIT.MA_RIBBON_SQUEEZE,
      SCREENER_BIT.MA_RECLAIM_SPRING,
      SCREENER_BIT.ABSORPTION_SPIKE,
      SCREENER_BIT.VSA_NO_SUPPLY,
      SCREENER_BIT.PRECISION_MTF,
      SCREENER_BIT.TIGHT_CLOSES,
      SCREENER_BIT.VOLUME_DRY_UP,
      SCREENER_BIT.RS_NEW_HIGH,
      SCREENER_BIT.WYCKOFF_LPS,
      SCREENER_BIT.NET_CASH,
      SCREENER_BIT.GOLDEN_POCKET,
      SCREENER_BIT.FLIP_ZONE,
      SCREENER_BIT.SMC_ORDER_BLOCK,
      SCREENER_BIT.MTF_ALIGNED,
      SCREENER_BIT.WYCKOFF_SPRING_TEST,
      SCREENER_BIT.VCP_VDU_PIVOT,
      SCREENER_BIT.CANSLIM_ACCEL,
      SCREENER_BIT.TRIPLE_CONFLUENCE_GOLD,
      SCREENER_BIT.SWING_LOW_CONFIRMED,
      SCREENER_BIT.FRESH_BULL_DIV,
      SCREENER_BIT.DUAL_BULL_DIV,
      SCREENER_BIT.BENEISH_SAFE,
      SCREENER_BIT.BUFFETT_COMPOUNDER,
      SCREENER_BIT.LYNCH_GROWER,
      SCREENER_BIT.GRAHAM_NCAV,
      SCREENER_BIT.WORKING_CAP_CCC,
      SCREENER_BIT.DIVIDEND_ARISTOCRAT,
    ];

    assert.equal(bits.length, 32);
    // Every bit must be distinct and non-zero
    for (let i = 0; i < bits.length; i++) {
      assert.notEqual(bits[i], 0);
      for (let j = i + 1; j < bits.length; j++) {
        assert.equal(bits[i] & bits[j], 0, `Bit collision between index ${i} and ${j}`);
      }
    }
  });

  await t.test("Phase 2: queryScreenerStocks filters with new FA presets and returns valid response", async () => {
    // 1. Beneish safe filter
    const beneishRes = await queryScreenerStocks({ preset: "beneish_safe", limit: 10 });
    assert.ok(beneishRes.total >= 0);
    assert.ok(Array.isArray(beneishRes.items));
    assert.ok(beneishRes.presetsCount.beneish_safe >= 0);

    // 2. Buffett compounder filter
    const buffettRes = await queryScreenerStocks({ preset: "buffett_compounder", limit: 10 });
    assert.ok(buffettRes.total >= 0);
    assert.ok(buffettRes.presetsCount.buffett_compounder >= 0);

    // 3. Lynch fast grower filter
    const lynchRes = await queryScreenerStocks({ preset: "lynch_fast_grower", limit: 10 });
    assert.ok(lynchRes.total >= 0);
    assert.ok(lynchRes.presetsCount.lynch_fast_grower >= 0);

    // 4. Cash conversion cycle filter
    const cccRes = await queryScreenerStocks({ preset: "cash_conversion_cycle", limit: 10 });
    assert.ok(cccRes.total >= 0);
    assert.ok(cccRes.presetsCount.cash_conversion_cycle >= 0);

    // 5. Dividend aristocrat filter
    const divRes = await queryScreenerStocks({ preset: "dividend_aristocrat", limit: 10 });
    assert.ok(divRes.total >= 0);
    assert.ok(divRes.presetsCount.dividend_aristocrat >= 0);

    // 6. Direct boolean filter: beneishSafeOnly
    const boolRes = await queryScreenerStocks({ beneishSafeOnly: true, limit: 10 });
    assert.ok(boolRes.total >= 0);
    for (const item of boolRes.items) {
      assert.equal(item.isBeneishSafe, true);
    }
  });

  await t.test("Phase 3: Industry sector relative percentiles and ranking labels are computed", async () => {
    const res = await queryScreenerStocks({ limit: 50 });
    assert.ok(res.items.length > 0);

    // Look for items with sector percentiles
    const itemsWithSectorRank = res.items.filter(
      (it) => it.sectorRoePercentile != null || it.sectorPePercentile != null,
    );
    assert.ok(itemsWithSectorRank.length > 0, "Should have stocks with sector percentile rankings");

    for (const item of itemsWithSectorRank) {
      if (item.sectorRoePercentile != null) {
        assert.ok(item.sectorRoePercentile >= 0 && item.sectorRoePercentile <= 100);
      }
      if (item.sectorPePercentile != null) {
        assert.ok(item.sectorPePercentile >= 0 && item.sectorPePercentile <= 100);
      }
      if (item.industryRankVi != null) {
        assert.ok(typeof item.industryRankVi === "string" && item.industryRankVi.length > 0);
      }
    }
  });

  await t.test("Phase 3: queryScreenerStocks filters with minBuffettScore, maxCccDays, minSectorRoePercentile", async () => {
    // Test minBuffettScore
    const buffettRes = await queryScreenerStocks({ minBuffettScore: 70, limit: 15 });
    assert.ok(buffettRes.total >= 0);
    for (const item of buffettRes.items) {
      assert.ok(item.buffettScore != null && item.buffettScore >= 70);
    }

    // Test maxCccDays
    const cccRes = await queryScreenerStocks({ maxCccDays: 90, limit: 15 });
    assert.ok(cccRes.total >= 0);
    for (const item of cccRes.items) {
      assert.ok(item.cashConversionCycleDays != null && item.cashConversionCycleDays <= 90);
    }

    // Test minSectorRoePercentile
    const roeRes = await queryScreenerStocks({ minSectorRoePercentile: 60, limit: 15 });
    assert.ok(roeRes.total >= 0);
    for (const item of roeRes.items) {
      assert.ok(item.sectorRoePercentile != null && item.sectorRoePercentile >= 60);
    }

    // Test maxSectorPePercentile
    const peRes = await queryScreenerStocks({ maxSectorPePercentile: 50, limit: 15 });
    assert.ok(peRes.total >= 0);
    for (const item of peRes.items) {
      assert.ok(item.sectorPePercentile != null && item.sectorPePercentile <= 50);
    }

    // Test quarterlyInflectionOnly
    const inflectionRes = await queryScreenerStocks({ quarterlyInflectionOnly: true, limit: 15 });
    assert.ok(inflectionRes.total >= 0);
    for (const item of inflectionRes.items) {
      assert.equal(item.isQuarterlyInflection, true);
    }
  });

  await t.test("Security & Bug Fix: Graham NCAV unit normalization prevents false positives", () => {
    // Case 1: Expensive stock (price = 50.0 thousand VND = 50k VND), ncavPerShare = 20,000 VND
    // Without normalization, 50.0 <= 20000 * 1.3 would be true (FALSE POSITIVE).
    // With normalization, normNcavPerShare = 20.0, so 50.0 <= 26.0 is false (CORRECT).
    const expensive = computeFundamentalMatrix({
      snap: {
        equity: 50_000_000_000,
        totalDebt: 15_000_000_000,
        cash: 10_000_000_000,
        shares: 2_250_000, // ncavTotal = 35B - 15B = 20B -> ncavPerShare = 20,000 VND
        netProfit: 5_000_000_000,
      },
      price: 50.0, // 50,000 VND
      marketCapBillion: 112.5,
    });
    assert.equal(expensive.isGrahamNcav, false, "Stock trading above NCAV must not be flagged as Graham Net-Net");

    // Case 2: Deep discount bargain (price = 15.0 thousand VND = 15k VND), ncavPerShare = 20,000 VND
    const bargain = computeFundamentalMatrix({
      snap: {
        equity: 50_000_000_000,
        totalDebt: 15_000_000_000,
        cash: 10_000_000_000,
        shares: 2_250_000,
        netProfit: 5_000_000_000,
      },
      price: 15.0, // 15,000 VND <= 20,000 * 1.3
      marketCapBillion: 33.75,
    });
    assert.equal(bargain.isGrahamNcav, true, "Stock trading well below NCAV must be flagged as Graham Net-Net");
  });

  await t.test("Security & Hardening: queryScreenerStocks safely handles prototype pollution in sortKey", async () => {
    // Malicious or invalid sort keys must safely fallback to marketCap
    const protoRes = await queryScreenerStocks({ sort: "__proto__" as any, limit: 5 });
    assert.ok(protoRes.items.length >= 0);

    const constructorRes = await queryScreenerStocks({ sort: "constructor" as any, limit: 5 });
    assert.ok(constructorRes.items.length >= 0);
  });
});
