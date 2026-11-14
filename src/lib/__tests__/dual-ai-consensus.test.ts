import test from "node:test";
import assert from "node:assert/strict";
import { DualAiConsensusEngine } from "../services/dual-ai-consensus";

test("DualAiConsensusEngine: Tạo báo cáo đồng thuận trí tuệ kép cho FPT", async () => {
  const report = await DualAiConsensusEngine.getConsensus("FPT");

  assert.equal(report.symbol, "FPT");
  assert.ok(typeof report.consensusScore === "number");
  assert.ok(report.consensusScore >= 0 && report.consensusScore <= 100);
  assert.ok(["STRONG_BUY", "BUY", "ACCUMULATE", "HOLD", "REDUCE", "SELL"].includes(report.verdict));
  assert.ok(report.verdictLabelVi.length > 0);
  assert.ok(Array.isArray(report.catalysts));
  assert.ok(Array.isArray(report.risks));
  assert.ok(Array.isArray(report.factChecks));
  assert.ok(Array.isArray(report.citations));
  assert.ok(report.narrativeVi.includes("ORCA DUAL-AI CONSENSUS"));
  assert.ok(report.narrativeVi.includes("FPT"));
});

test("DualAiConsensusEngine: Tạo báo cáo đồng thuận với câu hỏi tùy biến cho HPG", async () => {
  const report = await DualAiConsensusEngine.getConsensus("HPG", "Dung Quất 2 có phải là động lực chính của HPG không?");

  assert.equal(report.symbol, "HPG");
  assert.ok(report.priceAnalysis);
  assert.ok(typeof report.priceAnalysis.currentPrice === "number");
  assert.ok(report.narrativeVi.includes("HPG"));
  assert.ok(report.sentiment.consensus.length > 0);
});

