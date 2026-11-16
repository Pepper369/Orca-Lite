import test from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_MONITORED_PRESETS,
  runScreenerAlertMonitor,
} from "@/lib/services/screener-alert-service";
import { getHot, putHot } from "@/lib/hot-snapshot";
import { GET as getAlertsRoute, POST as postAlertsRoute } from "@/app/api/v1/screener/alerts/route";

test("Screener Alerting & Webhook - Monitored Presets Configuration", () => {
  assert.ok(ALERT_MONITORED_PRESETS.length >= 4);
  const presets = ALERT_MONITORED_PRESETS.map((p) => p.preset);
  assert.ok(presets.includes("apex_buy_now"));
  assert.ok(presets.includes("smc_golden_pocket"));
  assert.ok(presets.includes("bottom_confluence"));
  assert.ok(presets.includes("breakout"));
});

test("Screener Alerting & Webhook - runScreenerAlertMonitor detects triggers and updates T-1 snapshot", async () => {
  // Prime T-1 hot snapshot with an empty state or partial state
  putHot("screener-alerts-prev", {
    apex_buy_now: [],
    smc_golden_pocket: [],
  });

  const res = await runScreenerAlertMonitor({ forceDispatch: false });
  assert.ok(res.ok);
  assert.equal(res.scannedPresets, ALERT_MONITORED_PRESETS.length);
  assert.ok(typeof res.newlyTriggeredCount === "number");
  assert.ok(Array.isArray(res.alerts));

  // Verify hot snapshot has been updated with current state
  const updatedEntry = await getHot("screener-alerts-prev");
  assert.ok(updatedEntry);
  assert.ok(updatedEntry.data);
  const data = updatedEntry.data as Record<string, string[]>;
  assert.ok(Array.isArray(data.apex_buy_now));
});

test("Screener Alerting & Webhook - API Route GET & POST", async () => {
  // Test GET
  const getRes = await getAlertsRoute();
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.ok(getJson.data);
  assert.ok(Array.isArray(getJson.data.monitoredPresets));

  // Test POST
  const postReq = new Request("http://localhost:3000/api/v1/screener/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forceDispatch: false }),
  });
  const postRes = await postAlertsRoute(postReq);
  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.ok(postJson.data);
  assert.ok(postJson.data.ok);
});
