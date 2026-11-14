import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  inspectLocalGgufArtifact,
  isLocalGgufModelId,
  resolveLocalGgufConfig,
} from "../ai/local-gguf";
import { llmConfigured, llmRegistryInfo, modelsFor } from "../ai/gateway";

describe("Local GGUF Integration Tests", () => {
  it("detects valid GGUF magic header & version and rejects non-GGUF files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orca-gguf-test-"));
    try {
      const validFile = path.join(tmpDir, "valid.gguf");
      const buf = Buffer.alloc(16);
      buf.write("GGUF", 0, "ascii");
      buf.writeUInt32LE(3, 4);
      fs.writeFileSync(validFile, buf);

      const okStatus = inspectLocalGgufArtifact(validFile);
      assert.equal(okStatus.exists, true);
      assert.equal(okStatus.validMagic, true);
      assert.equal(okStatus.ggufVersion, 3);
      assert.equal(okStatus.sizeBytes, 16);

      const badFile = path.join(tmpDir, "invalid.gguf");
      fs.writeFileSync(badFile, Buffer.from("NOT_GGUF_DATA"));
      const badStatus = inspectLocalGgufArtifact(badFile);
      assert.equal(badStatus.exists, true);
      assert.equal(badStatus.validMagic, false);
      assert.equal(badStatus.ggufVersion, null);

      const missingStatus = inspectLocalGgufArtifact(path.join(tmpDir, "missing.gguf"));
      assert.equal(missingStatus.exists, false);
      assert.equal(missingStatus.validMagic, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("identifies local GGUF model identifiers accurately", () => {
    assert.equal(isLocalGgufModelId("local-gguf"), true);
    assert.equal(isLocalGgufModelId("orca-fa-local"), true);
    assert.equal(isLocalGgufModelId("orca-fa-qwen2.5-3b"), true);
    assert.equal(isLocalGgufModelId("custom-finetune", "custom-finetune"), true);
    assert.equal(isLocalGgufModelId("google/gemini-2.0-flash-001"), false);
  });

  it("integrates LOCAL_GGUF_BASE_URL into gateway modelsFor & llmRegistryInfo cleanly", () => {
    const prevUrl = process.env.LOCAL_GGUF_BASE_URL;
    const prevModel = process.env.LOCAL_GGUF_MODEL;
    const prevPriority = process.env.LOCAL_GGUF_PRIORITY;
    try {
      process.env.LOCAL_GGUF_BASE_URL = "http://127.0.0.1:8080/v1/";
      process.env.LOCAL_GGUF_MODEL = "orca-fa-qwen2.5-3b";
      process.env.LOCAL_GGUF_PRIORITY = "primary";

      const cfg = resolveLocalGgufConfig();
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.baseUrl, "http://127.0.0.1:8080/v1");
      assert.equal(cfg.model, "orca-fa-qwen2.5-3b");
      assert.equal(cfg.priority, "primary");

      assert.equal(llmConfigured(), true);
      const reasoningModels = modelsFor("reasoning");
      assert.equal(reasoningModels[0], "orca-fa-qwen2.5-3b");

      const reg = llmRegistryInfo();
      assert.equal(reg.localGguf.enabled, true);
      assert.equal(reg.provider, "local-gguf");
      assert.equal(reg.baseUrl, "http://127.0.0.1:8080/v1");
    } finally {
      if (prevUrl === undefined) delete process.env.LOCAL_GGUF_BASE_URL;
      else process.env.LOCAL_GGUF_BASE_URL = prevUrl;
      if (prevModel === undefined) delete process.env.LOCAL_GGUF_MODEL;
      else process.env.LOCAL_GGUF_MODEL = prevModel;
      if (prevPriority === undefined) delete process.env.LOCAL_GGUF_PRIORITY;
      else process.env.LOCAL_GGUF_PRIORITY = prevPriority;
    }
  });
});

