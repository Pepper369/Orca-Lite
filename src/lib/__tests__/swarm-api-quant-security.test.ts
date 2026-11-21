import assert from "node:assert/strict";
import test from "node:test";
import type { NextRequest } from "next/server";
import {
  GET as labGet,
  POST as labPost,
  sanitizeCovarianceMatrix,
} from "../../app/api/v1/quant/institutional-lab/route";
import {
  GET as botsGet,
  POST as botsPost,
} from "../../app/api/v1/quant/bots/route";
import { GET as indexFlowGet } from "../../app/api/v1/quant/index-flow/route";
import { GET as marketSignalsGet } from "../../app/api/v1/quant/market-signals/route";
import { GET as strategiesGet } from "../../app/api/v1/quant/strategies/route";
import { GET as topPicksGet } from "../../app/api/v1/quant/top-picks/route";
import { POST as forexPositionSizePost } from "../../app/api/v1/forex/position-size/route";
import { MiQuantEngine } from "../engines/miquant-quant-engine";
import { MiQuantProvider } from "../providers/miquant";

let ipCounter = 1;
function nextTestIp(): string {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

function makeNextReq(
  url: string,
  opts?: { method?: string; rawBody?: string; ip?: string },
): NextRequest {
  const ip = opts?.ip ?? nextTestIp();
  return new Request(url, {
    method: opts?.method ?? (opts?.rawBody !== undefined ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: opts?.rawBody,
  }) as unknown as NextRequest;
}

function assertAllFiniteValues(obj: unknown, path = "root"): void {
  if (typeof obj === "number") {
    assert.equal(
      Number.isFinite(obj),
      true,
      `Expected finite number at ${path}, got ${String(obj)}`,
    );
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertAllFiniteValues(v, `${path}[${i}]`));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      assertAllFiniteValues(v, `${path}.${k}`);
    }
  }
}

test("Swarm API Security: sanitizeCovarianceMatrix enforces positive diagonal variances, symmetry, and Cauchy-Schwarz bounds", () => {
  const malformed = [
    [NaN, 500, -Infinity],
    [-200, -0.05, "evil" as unknown as number],
    [Infinity, null as unknown as number, 0],
  ];

  const clean = sanitizeCovarianceMatrix(malformed, 3);
  assert.ok(clean, "Expected sanitized matrix for matching 3x3 dimensions");
  assert.equal(clean.length, 3);

  for (let i = 0; i < 3; i++) {
    assert.ok(
      Number.isFinite(clean[i]![i]!) && clean[i]![i]! >= 1e-6,
      `Diagonal variance clean[${i}][${i}] must be strictly positive and finite`,
    );
    for (let j = 0; j < 3; j++) {
      assert.ok(Number.isFinite(clean[i]![j]!), `Entry (${i},${j}) must be finite`);
      assert.ok(
        Math.abs(clean[i]![j]! - clean[j]![i]!) <= 1e-12,
        `Matrix must be symmetric at (${i},${j})`,
      );
      if (i !== j) {
        const maxAllowed = Math.sqrt(clean[i]![i]! * clean[j]![j]!);
        assert.ok(
          Math.abs(clean[i]![j]!) <= maxAllowed + 1e-12,
          `Off-diagonal (${i},${j}) must obey Cauchy-Schwarz bound`,
        );
      }
    }
  }
});

test("Swarm API Security: Institutional Lab HRP & NCO survive malformed covMatrix and unbounded symbols", async () => {
  const hugeSymbols = [
    "FPT",
    "VNM",
    "SSI",
    "HPG",
    "<script>alert(1)</script>",
    "../../etc/passwd",
    ...Array.from({ length: 500 }, (_, i) => `SYM${i}`),
  ];

  const reqHrp = makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
    rawBody: JSON.stringify({
      type: "hrp",
      symbols: ["FPT", "VNM", "SSI"],
      covMatrix: [
        [-10, 999, "NaN"],
        [-500, 0, null],
        [1e9, -1e9, -0.001],
      ],
    }),
  });
  const resHrp = await labPost(reqHrp);
  assert.equal(resHrp.status, 200);
  const bodyHrp = await resHrp.json();
  assert.equal(bodyHrp.success, true);
  assertAllFiniteValues(bodyHrp.data);
  const weightSum = (Object.values(bodyHrp.data.weights) as number[]).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(weightSum - 1.0) < 1e-2, `HRP weights must sum to ~1, got ${weightSum}`);

  const reqNco = makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
    rawBody: JSON.stringify({
      type: "nco",
      symbols: hugeSymbols,
      covMatrix: [
        [-1, 50],
        [50, 0],
      ],
    }),
  });
  const resNco = await labPost(reqNco);
  assert.equal(resNco.status, 200);
  const bodyNco = await resNco.json();
  assert.equal(bodyNco.success, true);
  assert.ok(
    Object.keys(bodyNco.data.weights).length <= 30,
    "Symbols list must be capped at 30 max",
  );
  assertAllFiniteValues(bodyNco.data);
});

test("Swarm API Security: Institutional Lab sanitizes non-finite numbers and unbounded arrays across all calculation types", async () => {
  const cases = [
    {
      type: "almgren_chriss",
      totalShares: "NaN",
      totalTimeHours: -999,
      intervalsCount: 999999,
      riskAversion: "Infinity",
      dailyVolatilityPct: -50,
      tempImpactFactor: "invalid",
      currentPrice: -100,
    },
    {
      type: "dsr",
      observedSharpe: "Infinity",
      trialsCount: -50,
      sampleLengthBars: "NaN",
      skewness: 99999,
      kurtosis: -100,
    },
    {
      type: "ou",
      series: [100, "NaN", null, 102, 101, 99, 100, ...Array.from({ length: 2500 }, () => 101)],
      dt: -10,
    },
    {
      type: "var_cvar",
      returns: [-0.01, "NaN", 0.02, -0.015, 0.01, ...Array.from({ length: 6000 }, () => 0.001)],
    },
    {
      type: "drawdown_governor",
      currentBalanceUsd: "NaN",
      peakBalanceUsd: -500,
      dailyRealizedPnlUsd: "Infinity",
      maxDailyLossUsd: -100,
      portfolioAnnualizedVol: "NaN",
    },
    {
      type: "smart_execution",
      symbol: "BTCUSDT",
      direction: "BUY",
      totalQty: "NaN",
      entryPrice: -500,
      bestBid: "NaN",
      bestAsk: "Infinity",
      top5BookDepthUsd: -1000,
    },
  ];

  for (const payload of cases) {
    const req = makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
      rawBody: JSON.stringify(payload),
    });
    const res = await labPost(req);
    assert.equal(res.status, 200, `Expected 200 for sanitized ${payload.type}`);
    const json = await res.json();
    assert.equal(json.success, true);
    assertAllFiniteValues(json.data, payload.type);
  }

  // Insufficient finite series / returns or invalid action must return 400
  const badOu = await labPost(
    makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
      rawBody: JSON.stringify({ type: "ou", series: ["NaN", null] }),
    }),
  );
  assert.equal(badOu.status, 400);

  const badGetAction = await labGet(
    makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab?action=<script>alert(1)</script>"),
  );
  assert.equal(badGetAction.status, 400);
});

test("Swarm API Security: Prototype pollution (__proto__, constructor, prototype) is blocked with 400", async () => {
  const protoPayloads = [
    '{"__proto__":{"polluted":true},"type":"dsr"}',
    '{"constructor":{"prototype":{"polluted":true}},"type":"dsr"}',
    '{"nested":{"__proto__":{"polluted":true}},"botId":"bot_breakout_momentum","capital":100000000}',
    '{"pair":"EURUSD","entryPrice":1.085,"stopLossPrice":1.08,"__proto__":{"polluted":true}}',
  ];

  const r1 = await labPost(
    makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
      rawBody: protoPayloads[0],
    }),
  );
  assert.equal(r1.status, 400);

  const r2 = await labPost(
    makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
      rawBody: protoPayloads[1],
    }),
  );
  assert.equal(r2.status, 400);

  const r3 = await botsPost(
    makeNextReq("http://localhost:3000/api/v1/quant/bots", {
      rawBody: protoPayloads[2],
    }),
  );
  assert.equal(r3.status, 400);

  const r4 = await forexPositionSizePost(
    makeNextReq("http://localhost:3000/api/v1/forex/position-size", {
      rawBody: protoPayloads[3],
    }),
  );
  assert.equal(r4.status, 400);

  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("Swarm API Security: Quant Bots POST validates botId, allocationMode, and capital bounds", async () => {
  const invalidPayloads = [
    { botId: "../../etc/passwd", capital: 100_000_000 },
    { botId: "bot_breakout_momentum", allocationMode: "MALICIOUS_MODE", capital: 100_000_000 },
    { botId: "bot_breakout_momentum", capital: -500 },
    { botId: "bot_breakout_momentum", capital: 1e20 },
    { botId: "bot_breakout_momentum", capital: "NaN" },
    { botId: "bot_breakout_momentum", capital: true },
  ];

  for (const p of invalidPayloads) {
    const res = await botsPost(
      makeNextReq("http://localhost:3000/api/v1/quant/bots", {
        rawBody: JSON.stringify(p),
      }),
    );
    assert.equal(res.status, 400, `Expected 400 for invalid bots payload: ${JSON.stringify(p)}`);
  }
});

test("Swarm API Security: Quant Index Flow & Strategies validate query params and prevent reflection", async () => {
  // Invalid universe rejected
  const badUni = await indexFlowGet(
    makeNextReq("http://localhost:3000/api/v1/quant/index-flow?universe=../../passwd&days=30"),
  );
  assert.equal(badUni.status, 400);

  // Non-finite days rejected
  const badDays = await indexFlowGet(
    makeNextReq("http://localhost:3000/api/v1/quant/index-flow?universe=vnindex&days=NaN"),
  );
  assert.equal(badDays.status, 400);

  // Extreme days clamped to [1, 365]
  const clampedHigh = await indexFlowGet(
    makeNextReq("http://localhost:3000/api/v1/quant/index-flow?universe=vnindex&days=999999"),
  );
  assert.equal(clampedHigh.status, 200);
  const clampedHighJson = await clampedHigh.json();
  assert.equal(clampedHighJson.data.days, 365);

  const clampedLow = await indexFlowGet(
    makeNextReq("http://localhost:3000/api/v1/quant/index-flow?universe=vnindex&days=-50"),
  );
  assert.equal(clampedLow.status, 200);
  const clampedLowJson = await clampedLow.json();
  assert.equal(clampedLowJson.data.days, 1);

  // Strategies XSS id must be rejected with 400 and never reflected
  const xssId = "<script>alert('xss')</script>";
  const stratXss = await strategiesGet(
    makeNextReq(`http://localhost:3000/api/v1/quant/strategies?id=${encodeURIComponent(xssId)}`),
  );
  assert.equal(stratXss.status, 400);
  const stratXssText = await stratXss.text();
  assert.equal(stratXssText.includes("<script>"), false);

  // Unknown valid strategy id returns 404 without reflecting user input
  const unknownId = "nonexistent_strategy_token_xyz987";
  const strat404 = await strategiesGet(
    makeNextReq(`http://localhost:3000/api/v1/quant/strategies?id=${unknownId}`),
  );
  assert.equal(strat404.status, 404);
  const strat404Text = await strat404.text();
  assert.equal(strat404Text.includes(unknownId), false);
});

test("Swarm API Security: Forex Position Size rejects non-finite, zero-distance, negative, and out-of-bounds inputs", async () => {
  const invalidPayloads = [
    { pair: "EURUSD", entryPrice: "NaN", stopLossPrice: 1.08 },
    { pair: "EURUSD", entryPrice: 1.085, stopLossPrice: "Infinity" },
    { pair: "EURUSD", entryPrice: 1.085, stopLossPrice: 1.085 }, // zero SL distance (div-by-zero)
    { pair: "EURUSD", entryPrice: -1.085, stopLossPrice: 1.08 },
    { pair: "<script>", entryPrice: 1.085, stopLossPrice: 1.08 },
    { pair: "EURUSD", entryPrice: 1.085, stopLossPrice: 1.08, accountBalance: -5000 },
    { pair: "EURUSD", entryPrice: 1.085, stopLossPrice: 1.08, riskPercent: 150 },
    { pair: "EURUSD", entryPrice: 1.085, stopLossPrice: 1.08, leverage: 50000 },
    { pair: "EURUSD", entryPrice: 1.085, stopLossPrice: 1.08, takeProfit1: -1.2 },
    {
      pair: "EURJPY",
      entryPrice: 165.5,
      stopLossPrice: 165.0,
      crossRates: { usdJpy: -155 },
    },
  ];

  for (const p of invalidPayloads) {
    const res = await forexPositionSizePost(
      makeNextReq("http://localhost:3000/api/v1/forex/position-size", {
        rawBody: JSON.stringify(p),
      }),
    );
    assert.equal(res.status, 400, `Expected 400 for invalid forex payload: ${JSON.stringify(p)}`);
  }

  // Valid payload succeeds with finite outputs
  const validRes = await forexPositionSizePost(
    makeNextReq("http://localhost:3000/api/v1/forex/position-size", {
      rawBody: JSON.stringify({
        pair: "EUR/USD",
        accountBalance: 10000,
        riskPercent: 1,
        entryPrice: 1.085,
        stopLossPrice: 1.08,
        takeProfit1: 1.095,
        leverage: 100,
      }),
    }),
  );
  assert.equal(validRes.status, 200);
  const validJson = await validRes.json();
  assert.equal(validJson.success, true);
  assertAllFiniteValues(validJson.data);
});

test("Swarm API Security: Internal error messages are never leaked to clients on exceptions", async () => {
  const secretLeak = "SENSITIVE_DB_SECRET_TOKEN_998877";

  const origGetBots = MiQuantEngine.getBots;
  const origGetStrategies = MiQuantEngine.getQuantStrategies;
  const origGetRankedPicks = MiQuantEngine.getRankedPicks;
  const origGetIndexFlow = MiQuantProvider.getTotalIndexMoneyFlow;
  const origGetMarketSignals = MiQuantProvider.getMarketSignals;

  try {
    MiQuantEngine.getBots = async () => {
      throw new Error(secretLeak);
    };
    MiQuantEngine.getQuantStrategies = async () => {
      throw new Error(secretLeak);
    };
    MiQuantEngine.getRankedPicks = async () => {
      throw new Error(secretLeak);
    };
    MiQuantProvider.getTotalIndexMoneyFlow = async () => {
      throw new Error(secretLeak);
    };
    MiQuantProvider.getMarketSignals = async () => {
      throw new Error(secretLeak);
    };

    const responses = await Promise.all([
      labGet(makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab")),
      botsGet(makeNextReq("http://localhost:3000/api/v1/quant/bots")),
      indexFlowGet(makeNextReq("http://localhost:3000/api/v1/quant/index-flow")),
      marketSignalsGet(makeNextReq("http://localhost:3000/api/v1/quant/market-signals")),
      strategiesGet(makeNextReq("http://localhost:3000/api/v1/quant/strategies")),
      topPicksGet(makeNextReq("http://localhost:3000/api/v1/quant/top-picks")),
    ]);

    for (const res of responses) {
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.equal(
        text.includes(secretLeak),
        false,
        `Response leaked internal error secret: ${text}`,
      );
    }
  } finally {
    MiQuantEngine.getBots = origGetBots;
    MiQuantEngine.getQuantStrategies = origGetStrategies;
    MiQuantEngine.getRankedPicks = origGetRankedPicks;
    MiQuantProvider.getTotalIndexMoneyFlow = origGetIndexFlow;
    MiQuantProvider.getMarketSignals = origGetMarketSignals;
  }
});

test("Swarm API Security: Rate limiting enforces 429 on flood across hardened quant & forex endpoints", async () => {
  const floodIp = "203.0.113.250";
  let lastStatus = 200;
  for (let i = 0; i < 35; i++) {
    const res = await labPost(
      makeNextReq("http://localhost:3000/api/v1/quant/institutional-lab", {
        ip: floodIp,
        rawBody: JSON.stringify({ type: "dsr" }),
      }),
    );
    lastStatus = res.status;
    if (lastStatus === 429) break;
  }
  assert.equal(lastStatus, 429, "Expected 429 rate-limit response on POST /institutional-lab flood");
});
