import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_PRESETS,
  FA_BIT,
  PRESET_ALIASES,
  UNIVERSE_ALIASES,
  WORKSPACE_GROUPS,
  resolveCanonicalPreset,
  resolveUniverseRoute,
} from "../quant/screener-taxonomy";
import { queryScreenerStocks } from "../services/screener-snapshot-service";

test("Screener Taxonomy: 20 canonical presets & full 49->20 alias parity", () => {
  assert.equal(CANONICAL_PRESETS.length, 20, "Canonical presets must stay consolidated at 20");
  const canonicalIds = new Set<string>(CANONICAL_PRESETS.map((p) => p.id));

  for (const [legacy, canonical] of Object.entries(PRESET_ALIASES)) {
    assert.ok(
      canonical === "all" || canonicalIds.has(canonical),
      `Legacy alias "${legacy}" maps to unknown canonical preset "${canonical}"`,
    );
    assert.equal(resolveCanonicalPreset(legacy), canonical);
  }
  assert.equal(resolveCanonicalPreset(undefined), "all");
  assert.equal(resolveCanonicalPreset("non_existent_preset"), "all");
});

test("Screener Taxonomy: 12 consolidated workspaces & full 32->12 universe alias parity", () => {
  const workspaceIds = WORKSPACE_GROUPS.flatMap((g) => g.items.map((t) => t.id));
  assert.equal(workspaceIds.length, 12, "UI workspaces must stay consolidated at 12");
  const idSet = new Set<string>(workspaceIds);
  assert.equal(idSet.size, 12, "Workspace IDs must be unique");

  for (const [legacyTab, route] of Object.entries(UNIVERSE_ALIASES)) {
    assert.ok(
      idSet.has(route.workspace),
      `Legacy tab "${legacyTab}" points to unknown workspace "${route.workspace}"`,
    );
    const resolved = resolveUniverseRoute(legacyTab);
    assert.equal(resolved.workspace, route.workspace);
  }
});

test("Screener Taxonomy: FA_BIT dual-register contains 25 distinct single-bit masks", () => {
  const values = Object.values(FA_BIT);
  assert.equal(values.length, 25);
  const seen = new Set<number>();
  for (const v of values) {
    assert.ok(v > 0 && (v & (v - 1)) === 0, `FA_BIT value ${v} is not a power of 2`);
    assert.equal(seen.has(v), false, `Duplicate FA_BIT value ${v}`);
    seen.add(v);
  }
});

test("Synthetic FA Guard: queryScreenerStocks excludes SECTOR_FALLBACK when excludeSyntheticFa=true", async () => {
  const res = await queryScreenerStocks({ excludeSyntheticFa: true, limit: 25 });
  for (const item of res.items) {
    assert.notEqual(
      item.faProvenance,
      "SECTOR_FALLBACK",
      `Synthetic fallback row ${item.symbol} leaked when excludeSyntheticFa=true`,
    );
    assert.notEqual(
      item.faProvenance,
      "MISSING",
      `Missing FA row ${item.symbol} leaked when excludeSyntheticFa=true`,
    );
  }
});
