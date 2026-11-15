import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GET as getEarningsCalendar } from "../../app/api/v1/earnings/calendar/route";
import { GET as getMarketIntel } from "../../app/api/v1/market/intel/route";
import { GET as getStocks } from "../../app/api/v1/stocks/route";
import { GET as getCryptoMarkets } from "../../app/api/v1/crypto/markets/route";
import { GET as getForexMarkets } from "../../app/api/v1/forex/markets/route";

describe("Provider Resilience & Zero-Downtime Endpoints", () => {
  test("GET /api/v1/earnings/calendar returns 200 with statutory deadlines", async () => {
    const req = new Request("http://localhost:3000/api/v1/earnings/calendar?year=2026");
    const res = await getEarningsCalendar(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.deadlines));
    assert.ok(body.data.deadlines.length >= 6);
    assert.ok(body.data.upcomingDeadline);
    assert.ok(Array.isArray(body.data.companies));
  });

  test("GET /api/v1/market/intel returns 200 with populated market structure", async () => {
    const res = await getMarketIntel();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.session);
    assert.ok(body.data.breadth);
    assert.ok(body.data.condition);
  });

  test("GET /api/v1/stocks (VN30 board) returns 200 with non-empty quotes and indices", async () => {
    const req = new Request("http://localhost:3000/api/v1/stocks?board=vn30");
    const res = await getStocks(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.quotes));
    assert.ok(body.data.quotes.length > 0);
  });

  test("GET /api/v1/crypto/markets returns 200 with liquid coin rows", async () => {
    const req = new Request("http://localhost:3000/api/v1/crypto/markets?limit=20");
    const res = await getCryptoMarkets(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.rows));
    assert.ok(body.data.rows.length > 0);
    assert.ok(body.data.summary);
  });

  test("GET /api/v1/forex/markets returns 200 with forex and commodities rows", async () => {
    const res = await getForexMarkets();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.rows));
    assert.ok(body.data.rows.length > 0);
  });
});
