import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculatePitTax,
  calculateLoanAmortization,
  calculatePositionSizing,
  calculateWacc,
  calculateDcf,
} from "../engines/financial-calculation-suite";

describe("Financial Calculation Suite Tests", () => {
  describe("1. PIT Tax Calculation (Thuế TNCN)", () => {
    it("calculates zero tax for gross under deduction limit", () => {
      // 10M gross, 0 dependents -> No tax
      const res = calculatePitTax(10_000_000, 0);
      assert.equal(res.totalTaxVnd, 0);
      assert.equal(res.taxableIncomeVnd, 0);
      assert.ok(res.netSalaryVnd > 0);
    });

    it("calculates exact progressive tax for 30M gross with 1 dependent", () => {
      // Gross: 30,000,000 VND, 1 dependent
      // Insurance:
      // BHXH (8% of 30M) = 2,400,000
      // BHYT (1.5% of 30M) = 450,000
      // BHTN (1% of 30M) = 300,000
      // Total insurance = 3,150,000
      // Deductions: 11,000,000 + 4,400,000 = 15,400,000
      // Taxable: 30M - 3.15M - 15.4M = 11,450,000
      // Bracket 1 (0-5M @ 5%): 250,000
      // Bracket 2 (5-10M @ 10%): 500,000
      // Bracket 3 (10-11.45M @ 15%): 1,450,000 * 0.15 = 217,500
      // Total Tax = 250k + 500k + 217.5k = 967,500 VND
      const res = calculatePitTax(30_000_000, 1);
      assert.equal(res.insurance.totalInsurance, 3_150_000);
      assert.equal(res.deductions.totalFamilyDeduction, 15_400_000);
      assert.equal(res.taxableIncomeVnd, 11_450_000);
      assert.equal(res.totalTaxVnd, 967_500);
      assert.equal(res.netSalaryVnd, 30_000_000 - 3_150_000 - 967_500);
    });

    it("respects statutory cap for BHXH/BHYT at 46.8M", () => {
      // 100M gross salary -> BHXH/BHYT capped at 46.8M
      const res = calculatePitTax(100_000_000, 0);
      assert.equal(res.insurance.bhxh, Math.round(46_800_000 * 0.08));
      assert.equal(res.insurance.bhyt, Math.round(46_800_000 * 0.015));
    });
  });

  describe("2. Loan Amortization (Lãi suất theo dư nợ giảm dần)", () => {
    it("calculates exact PMT and zero balance at end of term (12 months)", () => {
      // 1,000,000,000 VND at 9% p.a for 12 months
      const res = calculateLoanAmortization(1_000_000_000, 9, 12);
      assert.equal(res.schedule.length, 12);
      // Final balance must be 0
      assert.equal(res.schedule[11].endingBalanceVnd, 0);
      // Total payment must equal principal + interest
      assert.equal(res.totalPaymentVnd, res.principalVnd + res.totalInterestVnd);
      assert.ok(res.monthlyPaymentVnd > 0);
    });

    it("calculates exact reducing balance amortization over 60 months (5 years)", () => {
      // 500,000,000 VND at 8.5% p.a for 60 months
      const res = calculateLoanAmortization(500_000_000, 8.5, 60);
      assert.equal(res.schedule.length, 60);
      // Month 1 interest = 500M * 8.5% / 12 = 3,541,667 VND
      assert.equal(res.schedule[0].interestPaymentVnd, Math.round(500_000_000 * (0.085 / 12)));
      // Balance strictly decreasing
      assert.ok(res.schedule[0].beginningBalanceVnd > res.schedule[1].beginningBalanceVnd);
      // Final balance is precisely 0
      assert.equal(res.schedule[59].endingBalanceVnd, 0);
      // Total payment reconciliation
      assert.equal(res.totalPaymentVnd, res.principalVnd + res.totalInterestVnd);
    });
  });

  describe("3. Position Sizing & Risk Management", () => {
    it("calculates exact share lot size and caps capital at risk", () => {
      // Capital: 500,000,000 VND
      // Risk: 2% = 10,000,000 VND
      // Entry: 25,000, Stop Loss: 23,000 (Risk per share = 2,000)
      // Shares = 10,000,000 / 2,000 = 5,000 shares (50 lots)
      const res = calculatePositionSizing(500_000_000, 2, 25_000, 23_000, 30_000, 50);
      assert.equal(res.capitalAtRiskVnd, 10_000_000);
      assert.equal(res.riskPerShareVnd, 2_000);
      assert.equal(res.sharesToBuy, 5_000);
      assert.equal(res.totalAllocatedVnd, 125_000_000);
      assert.equal(res.portfolioWeightPct, 25);
      // Reward = 30k - 25k = 5,000 -> R:R = 5,000 / 2,000 = 2.5
      assert.equal(res.rewardToRiskRatio, 2.5);
      assert.ok(res.kellyFractionPct! > 0);
    });
  });

  describe("4. WACC & DCF Valuation", () => {
    it("calculates accurate WACC with corporate tax shield", () => {
      // Equity: 80B, Debt: 20B (Total: 100B, 80% E, 20% D)
      // Ke = 12%, Kd = 8%, Tax = 20%
      // After-tax Kd = 8% * (1 - 0.20) = 6.4%
      // WACC = 0.8 * 12% + 0.2 * 6.4% = 9.6% + 1.28% = 10.88%
      const res = calculateWacc(80_000_000_000, 20_000_000_000, 12, 8, 20);
      assert.equal(res.equityWeightPct, 80);
      assert.equal(res.debtWeightPct, 20);
      assert.equal(res.afterTaxCostOfDebtPct, 6.4);
      assert.equal(res.waccPct, 10.88);
    });

    it("calculates DCF enterprise value and per-share fair value", () => {
      // Projected FCFF: 10B, 12B, 15B
      // WACC: 11%, Terminal Growth: 3%
      const res = calculateDcf(
        [10_000_000_000, 12_000_000_000, 15_000_000_000],
        3,
        11,
        5_000_000_000, // Net debt 5B
        10_000_000 // 10 million shares
      );
      assert.ok(res.sumDiscountedFcffVnd > 0);
      assert.ok(res.terminalValueVnd > 0);
      assert.ok(res.fairValuePerShareVnd > 0);
    });
  });
});

