# Specification Quality Checklist: Core Algorithm & Money-Flow Purification

- [x] **CHK-001** Every identified bottleneck cites exact file path, line range, mathematical/algorithmic defect, and concrete failure scenario.
- [x] **CHK-002** Graphify AST dependency graph (`4,428 nodes, 12,523 edges, 187 communities`) used to trace downstream blast radius of God Nodes (`OhlcvBar`, `analyzeMoneyFlow`, `evaluateApexQuant`, `evaluateSmartMoneyFootprint`, `ema`).
- [x] **CHK-003** Causal invariance (`SC-001`) and Price Scale invariance across 8 orders of magnitude (`SC-003`) are formally specified.
- [x] **CHK-004** Zero-Volume FX degradation and 1000x VND unit discrepancies are explicitly covered.
- [x] **CHK-005** Backward-compatible TypeScript interfaces preserved across all public engine exports.
