import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "../env.js";

test("dotenv loads supported syntax and preserves process values", () => {
  const keys = ["LAW_RAG_TEST_ALPHA", "LAW_RAG_TEST_QUOTED", "LAW_RAG_TEST_EXISTING"];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  const directory = mkdtempSync(join(tmpdir(), "law-rag-env-"));
  try {
    process.env.LAW_RAG_TEST_EXISTING = "from-shell";
    const path = join(directory, ".env");
    writeFileSync(path, "# comment\nLAW_RAG_TEST_ALPHA=one # inline comment\nexport LAW_RAG_TEST_QUOTED=\"two words\"\nLAW_RAG_TEST_EXISTING=from-file\n", "utf8");
    loadEnvFile(path);
    assert.equal(process.env.LAW_RAG_TEST_ALPHA, "one");
    assert.equal(process.env.LAW_RAG_TEST_QUOTED, "two words");
    assert.equal(process.env.LAW_RAG_TEST_EXISTING, "from-shell");
  } finally {
    rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
