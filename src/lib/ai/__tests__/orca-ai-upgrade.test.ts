import test from "node:test";
import assert from "node:assert/strict";
import { ORCA_FA_TOOLS, executeOrcaTool } from "../tools/fa-tools";
import { checkLocalGgufHeartbeat, resolveLocalGgufConfig } from "../local-gguf";

test("Orca AI Upgrade - Tool Registry Validation", () => {
  const toolNames = ORCA_FA_TOOLS.map((t) => t.name);
  assert.ok(toolNames.includes("tool_get_orderbook_flow"), "Phải có tool_get_orderbook_flow");
  assert.ok(toolNames.includes("tool_get_wyckoff_vsa_signals"), "Phải có tool_get_wyckoff_vsa_signals");
  assert.ok(toolNames.includes("tool_verify_claims_and_rumors"), "Phải có tool_verify_claims_and_rumors");
  assert.ok(toolNames.includes("tool_get_financial_ratios"), "Phải có tool_get_financial_ratios");
});

test("Orca AI Upgrade - Local GGUF Heartbeat & Healthcheck", async () => {
  const cfg = resolveLocalGgufConfig();
  assert.equal(typeof cfg.enabled, "boolean");

  // Non-blocking ping test with fast 200ms timeout
  const isAlive = await checkLocalGgufHeartbeat(200);
  assert.equal(typeof isAlive, "boolean", "checkLocalGgufHeartbeat phải trả về boolean");
});

test("Orca AI Upgrade - OrderBook Tool Execution Safe Fallback", async () => {
  // Empty symbol handling
  const badRes = await executeOrcaTool("tool_get_orderbook_flow", { symbol: "" });
  assert.equal(badRes.success, false);
  assert.match(badRes.error || "", /Thiếu mã cổ phiếu/i);

  // Symbol execution
  const res = await executeOrcaTool("tool_get_orderbook_flow", { symbol: "SSI" });
  if (res.success) {
    const data = res.result as Record<string, unknown>;
    assert.equal(data.symbol, "SSI");
    assert.ok(typeof data.buyPressurePct === "number");
  } else {
    assert.ok(res.error, "Phải có thông báo lỗi nếu không lấy được dữ liệu");
  }
});

test("Orca AI Upgrade - Wyckoff & VSA Tool Execution Safe Fallback", async () => {
  // Empty symbol handling
  const badRes = await executeOrcaTool("tool_get_wyckoff_vsa_signals", { symbol: "" });
  assert.equal(badRes.success, false);
  assert.match(badRes.error || "", /Thiếu mã cổ phiếu/i);

  // Symbol execution
  const res = await executeOrcaTool("tool_get_wyckoff_vsa_signals", { symbol: "HPG" });
  if (res.success) {
    const data = res.result as Record<string, unknown>;
    assert.equal(data.symbol, "HPG");
    assert.ok(data.phase, "Phải có trường phase");
  } else {
    assert.ok(res.error, "Phải có error message nếu thiếu nến");
  }
});
