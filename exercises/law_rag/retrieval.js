import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const DSAJ_ORIGIN = "https://search.bo.dsaj.gov.mo";
const SEARCH_ENDPOINT = `${DSAJ_ORIGIN}/_/search`;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const execFileAsync = promisify(execFile);

export class RetrievalError extends Error {}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const numeric = entity[1].toLowerCase() === "x"
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    try { return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match; }
    catch { return match; }
  });
}

export function plain(value) {
  if (typeof value !== "string") return "";
  return decodeEntities(value.replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim();
}

export function tokens(text) {
  const normalized = text.toLowerCase();
  const latin = normalized.match(/[a-zà-ÿ0-9]+(?:[/.\-][a-zà-ÿ0-9]+)*/g) ?? [];
  const chinese = [];
  for (const run of normalized.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (run.length === 1) chinese.push(run);
    else for (let index = 0; index < run.length - 1; index += 1) chinese.push(run.slice(index, index + 2));
  }
  return [...latin, ...chinese];
}

export function searchTerms(question) {
  let text = question.trim();
  const fillers = [
    "根據澳門法律", "根據澳門法例", "在澳門", "澳門", "請問", "可否告訴我",
    "有甚麼規定", "有什麼規定", "有哪些規定", "是甚麼", "是什麼",
    "甚麼時候", "什麼時候", "有哪一些", "有哪些", "哪一些", "哪些",
    "應該如何", "需要如何", "如何", "怎樣", "中的", "當中", "需要", "可以",
  ];
  for (const filler of fillers) text = text.replaceAll(filler, " ");
  text = text.replace(/[？?！!，,。；;：:「」『』（）()]+/g, " ").replace(/\s+/g, " ").trim();
  return text || question.trim();
}

export function expandSearchQueries(question) {
  const queries = [searchTerms(question)];
  const includesAny = (values) => values.some((value) => question.includes(value));
  const fallingObject = includesAny(["掉下", "墜下", "墜落", "跌下", "高空擲物", "高空墮物"]);
  const propertyDamage = includesAny(["破壞", "損壞", "損毀", "毀損", "撞壞", "砸壞", "財物", "汽車", "車輛", "BMW"]);
  const building = includesAny(["大廈", "樓宇", "建築物", "露台", "窗台", "天台"]);
  if (fallingObject) queries.push("由物、動物或活動造成之損害");
  if (fallingObject && building) queries.push("由樓宇或其他工作物造成之損害");
  if (propertyDamage) queries.push("刑法典 第二百零六條 毀損");
  if (fallingObject && propertyDamage) queries.push("刑法典 僅在法律有特別規定時 出於過失作出之事實 方予處罰");
  if (propertyDamage && !fallingObject) queries.push("損害賠償 財產損害");
  let unique = [...new Set(queries.filter(Boolean))];
  if (unique.length > 1) unique = unique.slice(1);
  return unique.slice(0, 4);
}

export function highlightSegments(document) {
  let content = document?.highlight?.content?.cn ?? [];
  if (typeof content === "string") content = [content];
  if (!Array.isArray(content)) return [];
  return content.map(plain).filter(Boolean);
}

export function makeChunks(text, target = 900, overlap = 140) {
  const cleaned = plain(text).replace(/\r\n?/g, "\n");
  const paragraphs = cleaned.split(/\n{2,}|(?=第[一二三四五六七八九十百千0-9]+條)/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const pieces = [];
    if (paragraph.length > target * 2) {
      for (let index = 0; index < paragraph.length; index += target - overlap) pieces.push(paragraph.slice(index, index + target));
    } else pieces.push(paragraph);
    for (const piece of pieces) {
      if (current && current.length + piece.length + 1 > target) {
        chunks.push(current);
        current = `${current.slice(-overlap)}\n${piece}`;
      } else current = `${current}\n${piece}`.trim();
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : (cleaned ? [cleaned.slice(0, target)] : []);
}

async function mapConcurrent(values, limit, worker) {
  const output = new Array(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next++;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return output;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export class DSAJRetriever {
  constructor(cacheTtl = 600) {
    this.cacheTtl = cacheTtl;
    this.cache = new Map();
  }

  async fetch(query, documentScope) {
    const params = new URLSearchParams({
      keyword: query, scope: "full_text", page: "1", lang: "zh-mo", type: documentScope,
      "sort_by[0][type]": "similarity", "sort_by[0][order]": "DESC",
    });
    const url = `${SEARCH_ENDPOINT}?${params}`;
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.time < this.cacheTtl * 1000) return cached.payload;
    const headers = {
      Accept: "application/json",
      "User-Agent": "UM-Law-RAG-Demo/1.0 (educational use; low request rate)",
      "X-Requested-With": "XMLHttpRequest",
    };
    let raw;
    let fetchError;
    if ((process.env.DSAJ_HTTP_TRANSPORT ?? "curl").toLowerCase() === "fetch") {
      try {
        const response = await fetchWithTimeout(url, { headers }, 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        raw = Buffer.from(await response.arrayBuffer());
      } catch (error) { fetchError = error; }
    }
    if (!raw) {
      const args = ["-fsSL", "--max-time", "25", "--max-filesize", String(MAX_RESPONSE_BYTES)];
      for (const [key, value] of Object.entries(headers)) args.push("-H", `${key}: ${value}`);
      args.push(url);
      try {
        const result = await execFileAsync("curl", args, { encoding: "buffer", timeout: 30_000, maxBuffer: MAX_RESPONSE_BYTES + 1024 });
        raw = result.stdout;
      } catch (error) {
        const detail = Buffer.isBuffer(error?.stderr) ? error.stderr.toString("utf8").trim().slice(0, 180) : "";
        throw new RetrievalError(`法務局搜尋服務暫時無法連線：${detail || fetchError?.message || error.message}`);
      }
    }
    if (raw.length > MAX_RESPONSE_BYTES) throw new RetrievalError("法務局回應超過安全大小限制。請縮窄搜尋字詞。");
    let payload;
    try { payload = JSON.parse(raw.toString("utf8")); }
    catch { throw new RetrievalError("法務局搜尋服務回傳了無法解析的資料。"); }
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.data)) throw new RetrievalError("法務局搜尋服務的回應格式已變更。");
    this.cache.set(url, { time: Date.now(), payload });
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    return payload;
  }

  async retrieve(rawQuery, documentScope = "laws", topK = 6) {
    const query = String(rawQuery ?? "").trim();
    if (!query) throw new RetrievalError("請輸入法律問題。");
    if (query.length > 300) throw new RetrievalError("問題過長，請限制在 300 個字元內。");
    if (!["laws", "all", "legismac"].includes(documentScope)) documentScope = "laws";
    const searchQueries = expandSearchQueries(query);
    const payloads = await mapConcurrent(searchQueries, 3, (searchQuery) => this.fetch(searchQuery, documentScope));
    const searchResults = [];
    payloads.forEach((payload, queryRank) => {
      payload.data.slice(0, 10).forEach((document, docRank) => searchResults.push({ queryRank, searchQuery: searchQueries[queryRank], docRank, document }));
    });
    const candidates = [];
    const seenCandidates = new Set();
    for (const { queryRank, searchQuery, docRank, document } of searchResults) {
      const title = plain(document?.name?.cn);
      const description = plain(document?.description?.cn);
      const content = plain(document?.content?.cn);
      const segments = [...highlightSegments(document).map((text) => ({ text, highlight: true })), ...makeChunks(content).map((text) => ({ text, highlight: false }))];
      const querySet = new Set(tokens(`${query} ${searchQuery}`));
      segments.forEach(({ text, highlight }, chunkRank) => {
        const id = String(document?.identifier ?? "");
        const candidateKey = `${id}\u0000${text}`;
        if (seenCandidates.has(candidateKey)) return;
        seenCandidates.add(candidateKey);
        const frequencies = new Map();
        for (const token of tokens(`${title} ${description} ${text}`)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
        let overlap = 0;
        let matched = 0;
        for (const token of querySet) if (frequencies.has(token)) { overlap += 1 + Math.log(frequencies.get(token)); matched += 1; }
        const titleTokens = new Set(tokens(title));
        let titleMatches = 0;
        for (const token of querySet) if (titleTokens.has(token)) titleMatches += 1;
        const score = overlap + (matched / Math.max(1, querySet.size)) * 8 + titleMatches * 2 + (highlight ? 9 : 0) + 2 / (1 + docRank) - queryRank * 0.2 - chunkRank * 0.015;
        candidates.push({ score, docRank, document, text, queryRank });
      });
    }
    candidates.sort((left, right) => right.score - left.score);
    const diverse = [];
    const usedIndexes = new Set();
    searchQueries.forEach((_, queryRank) => {
      const index = candidates.findIndex((candidate) => candidate.queryRank === queryRank);
      if (index >= 0) { diverse.push(candidates[index]); usedIndexes.add(index); }
    });
    candidates.forEach((candidate, index) => { if (!usedIndexes.has(index)) diverse.push(candidate); });
    const selected = [];
    const perDocument = new Map();
    const citationIds = new Map();
    for (const candidate of diverse) {
      const document = candidate.document;
      const documentId = String(document?.identifier ?? "");
      if (!documentId || (perDocument.get(documentId) ?? 0) >= 2) continue;
      if (!citationIds.has(documentId)) citationIds.set(documentId, citationIds.size + 1);
      selected.push({
        citation_id: citationIds.get(documentId), document_id: documentId,
        title: plain(document?.name?.cn) || documentId,
        description: plain(document?.description?.cn), text: candidate.text.slice(0, 1400),
        published_at: String(document?.publication_info?.published_at ?? "").slice(0, 10),
        document_type: plain(document?.document_info?.type?.name?.cn),
        states: Array.isArray(document?.states) ? document.states.map(String) : [],
        url: `${DSAJ_ORIGIN}/_/documents/${encodeURIComponent(documentId)}/page?lang=zh-mo&action=search`,
        score: Math.round(candidate.score * 1000) / 1000,
      });
      perDocument.set(documentId, (perDocument.get(documentId) ?? 0) + 1);
      if (selected.length >= Math.max(1, Math.min(topK, 10))) break;
    }
    const officialHits = payloads.reduce((sum, payload) => sum + Number(payload?.meta?.total ?? 0), 0);
    return [selected, {
      official_hits: officialHits, official_query: searchQueries.join("、"), official_queries: searchQueries,
      scope: documentScope, retrieved_documents: new Set(selected.map((passage) => passage.document_id)).size,
    }];
  }
}
