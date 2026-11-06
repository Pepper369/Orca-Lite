import assert from "node:assert/strict";
import test from "node:test";
import {
  getBCTCDeadlines,
  extractEarningsFromHeadline,
  detectReportingPeriod,
} from "../services/earnings-intel";
import { computeDomesticFlow } from "../services/domestic-flow";

test("Trụ Cột 4 - Circular 96/2020/TT-BTC Statutory BCTC Deadlines", () => {
  const deadlines = getBCTCDeadlines(2025);

  assert.equal(deadlines.length, 6, "Must contain exactly 6 statutory reporting deadlines");

  const q1 = deadlines.find((d) => d.period === "Q1/2025");
  assert.ok(q1, "Q1/2025 deadline must exist");
  assert.equal(q1.date, "2025-04-20", "Q1 deadline is April 20th");

  const q2 = deadlines.find((d) => d.period === "Q2/2025");
  assert.ok(q2, "Q2/2025 deadline must exist");
  assert.equal(q2.date, "2025-07-20", "Q2 deadline is July 20th");

  const sixMonth = deadlines.find((d) => d.period === "6M/2025");
  assert.ok(sixMonth, "6M/2025 reviewed deadline must exist");
  assert.equal(sixMonth.date, "2025-08-14", "6M reviewed deadline is August 14th");

  const q3 = deadlines.find((d) => d.period === "Q3/2025");
  assert.ok(q3, "Q3/2025 deadline must exist");
  assert.equal(q3.date, "2025-10-20", "Q3 deadline is October 20th");

  const q4 = deadlines.find((d) => d.period === "Q4/2025");
  assert.ok(q4, "Q4/2025 deadline must exist");
  assert.equal(q4.date, "2026-01-20", "Q4 deadline is Jan 20th of next year");

  const fy = deadlines.find((d) => d.period === "FY/2025");
  assert.ok(fy, "FY/2025 audited deadline must exist");
  assert.equal(fy.date, "2026-03-31", "FY audited deadline is March 31st of next year");

  // Every deadline must have daysRemaining defined as number
  for (const d of deadlines) {
    assert.equal(typeof d.daysRemaining, "number");
    assert.equal(typeof d.isUpcoming, "boolean");
  }
});

test("Trụ Cột 4 - Headline Earnings & Period Regex Extraction", () => {
  const title1 = "HPG ước lãi sau thuế 3.500 tỷ đồng trong quý 1/2025, doanh thu vượt 30.000 tỷ";
  const ext1 = extractEarningsFromHeadline(title1);

  assert.equal(ext1.ticker, "HPG");
  assert.equal(ext1.profitVndBillions, 3500);
  assert.equal(ext1.revenueVndBillions, 30000);
  assert.equal(ext1.period, "Q1/2025");

  const title2 = "VHM lên kế hoạch lợi nhuận 25.000 tỷ năm 2025";
  const ext2 = extractEarningsFromHeadline(title2);
  assert.equal(ext2.ticker, "VHM");
  assert.equal(ext2.targetProfitVndBillions, 25000);
});

test("Trụ Cột 4 - Smart Board Domestic Buy Pressure Calculation", () => {
  const sampleStocks = [
    { ticker: "SSI", volume: 10_000_000, bidVol: 7_000_000, askVol: 3_000_000, foreignBuyVol: 500_000, foreignSellVol: 200_000 },
    { ticker: "VND", volume: 5_000_000, bidVol: 2_000_000, askVol: 4_000_000, foreignBuyVol: 100_000, foreignSellVol: 800_000 },
  ];

  const result = computeDomesticFlow(sampleStocks);
  assert.ok(result.totalVolume > 0);
  assert.ok(result.buyPressure >= 0 && result.buyPressure <= 100);
  assert.ok(["mua mạnh", "nghiêng mua", "cân bằng", "nghiêng bán", "bán mạnh"].includes(result.signal));
  assert.equal(result.topBuyers.includes("SSI"), true, "SSI should be identified as top buyer pressure");
});
