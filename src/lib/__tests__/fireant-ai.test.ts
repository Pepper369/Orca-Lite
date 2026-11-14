import test from "node:test";
import assert from "node:assert/strict";
import { FireAntAnswerClient } from "../services/fireant-ai";

test("FireAntAnswerClient: Khởi tạo client an toàn", () => {
  const client = new FireAntAnswerClient();
  assert.ok(client instanceof FireAntAnswerClient);
  assert.equal(typeof client.isAuthenticated, "function");
});

test("FireAntAnswerClient: Fallback ask query cho cổ phiếu FPT", async () => {
  const client = new FireAntAnswerClient();
  const res = await client.ask("Triển vọng cổ phiếu FPT");

  assert.ok(res.threadId.length > 0);
  assert.ok(res.content.includes("FIREANT ANSWER AI"));
  assert.ok(res.content.includes("FPT"));
  assert.ok(Array.isArray(res.sources));
  assert.ok(res.sources!.length > 0);
});

test("FireAntAnswerClient: generateFireAntAiAnswer tổng hợp luận điểm & fact-check", async () => {
  const result = await FireAntAnswerClient.generateFireAntAiAnswer("HPG");

  assert.equal(result.symbol, "HPG");
  assert.ok(result.answer.length > 50);
  assert.ok(Array.isArray(result.reasoningPoints));
  assert.ok(result.reasoningPoints.length > 0);
  assert.ok(Array.isArray(result.factChecks));
  assert.ok(result.factChecks.length > 0);
  assert.equal(result.factChecks[0].symbol, "HPG");
  assert.ok(result.factChecks[0].confidenceScore > 0);
});

