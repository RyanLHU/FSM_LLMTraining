import test from "node:test";
import assert from "node:assert/strict";
import { expandSearchQueries, highlightSegments, makeChunks, plain, searchTerms, tokens } from "../retrieval.js";

test("plain removes markup and decodes entities", () => {
  assert.equal(plain("第<mark>一</mark>條 &amp; 原則"), "第一條 & 原則");
});

test("Chinese tokenization uses bigrams and keeps legal numbers", () => {
  assert.ok(tokens("個人資料 Law 8/2005").includes("個人"));
  assert.ok(tokens("個人資料 Law 8/2005").includes("8/2005"));
});

test("chunking preserves later articles", () => {
  const chunks = makeChunks(`第一條\n${"甲".repeat(1000)}\n\n第二條\n${"乙".repeat(1000)}`, 300, 30);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.some((chunk) => chunk.includes("第二條")));
});

test("question is compacted for official search", () => {
  assert.equal(searchTerms("澳門刑法中的罪刑法定原則是甚麼？"), "刑法 罪刑法定原則");
});

test("falling object scenario expands to civil and criminal search terms", () => {
  const queries = expandSearchQueries("大廈有花籠掉下，損壞一台汽車，犯了什麼法？");
  assert.ok(queries.includes("由物、動物或活動造成之損害"));
  assert.ok(queries.includes("由樓宇或其他工作物造成之損害"));
  assert.ok(queries.includes("刑法典 第二百零六條 毀損"));
  assert.ok(queries.includes("刑法典 僅在法律有特別規定時 出於過失作出之事實 方予處罰"));
});

test("DSAJ highlights become clean passages", () => {
  const document = { highlight: { content: { cn: ["第四百八十六條（由<mark>物</mark>造成之損害）"] } } };
  assert.deepEqual(highlightSegments(document), ["第四百八十六條（由物造成之損害）"]);
});
