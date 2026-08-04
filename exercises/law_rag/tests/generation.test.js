import test from "node:test";
import assert from "node:assert/strict";
import { compatibleSetting, errorDetail } from "../generation.js";

test("OpenRouter error metadata is surfaced", () => {
  assert.equal(errorDetail('{"error":{"message":"Provider returned error","metadata":{"raw":"rate limited"}}}'), "Provider returned error — rate limited");
});

test("invalid model error body is safe", () => assert.equal(errorDetail("not json"), "Request rejected"));

test("compatible settings prefer the explicit name and support legacy fallback", () => {
  const originalNew = process.env.OPENAI_COMPATIBLE_MODEL;
  const originalLegacy = process.env.OPENAI_MODEL;
  try {
    process.env.OPENAI_COMPATIBLE_MODEL = "new-model";
    process.env.OPENAI_MODEL = "legacy-model";
    assert.equal(compatibleSetting("OPENAI_COMPATIBLE_MODEL", "OPENAI_MODEL"), "new-model");
    delete process.env.OPENAI_COMPATIBLE_MODEL;
    assert.equal(compatibleSetting("OPENAI_COMPATIBLE_MODEL", "OPENAI_MODEL"), "legacy-model");
  } finally {
    if (originalNew === undefined) delete process.env.OPENAI_COMPATIBLE_MODEL; else process.env.OPENAI_COMPATIBLE_MODEL = originalNew;
    if (originalLegacy === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = originalLegacy;
  }
});
