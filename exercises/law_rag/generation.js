import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export const SYSTEM_PROMPT = `你是澳門法律資料檢索助理。只可根據「檢索資料」回答。
規則：
1. 使用繁體中文，先直接回答，再說明依據。
2. 每項法律主張後加入資料編號，例如 [1]。不可捏造條文或編號。
3. 資料不足、互相矛盾或可能已失效時，清楚說明，不可自行補完。
4. 留意 active、altered、abolished、partially_abolished 等狀態；不要把已廢止規定當作現行法。
5. 結尾提醒使用者核對《澳門特別行政區公報》PDF法定文本，並在重要個案中諮詢合資格法律專業人士。
6. 不要加入檢索資料以外的法律知識；即使你知道某項一般法律原則，如資料未明示亦必須省略。
7. 每一句具體法律命題都必須緊接至少一個 [n] 引用；送出前刪除沒有引用支持的法律命題。
8. 如問題描述具體事件，分開說明可能涉及的民事、刑事或行政問題；不得斷言任何人犯罪。列出仍須查明的關鍵事實，例如物件控制人、墜落原因、故意或過失、實際損失及是否有人受傷。`;

function context(passages) {
  return passages.map((passage) =>
    `[${passage.citation_id}] ${passage.title}｜${passage.description}\n` +
    `公佈日期：${passage.published_at || "不詳"}；狀態：${passage.states.join(", ") || "未標示"}\n` +
    `摘錄：${passage.text}`
  ).join("\n\n");
}

export function errorDetail(raw) {
  try {
    const body = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
    const message = String(body?.error?.message || "Request rejected");
    const providerDetail = String(body?.error?.metadata?.raw || "");
    return providerDetail ? `${message} — ${providerDetail}` : message;
  } catch { return "Request rejected"; }
}

function quoteCurlConfig(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function curlPostJson(url, payload, headers) {
  if ([url, ...Object.keys(headers), ...Object.values(headers)].some((value) => /[\r\n]/.test(value))) {
    throw new Error("模型服務設定包含不安全的換行字元。");
  }
  const directory = await mkdtemp(join(tmpdir(), "law-rag-curl-"));
  const configPath = join(directory, "request.conf");
  const config = [
    `url = "${quoteCurlConfig(url)}"`, 'request = "POST"', "silent", "show-error", "max-time = 60",
    ...Object.entries(headers).map(([key, value]) => `header = "${quoteCurlConfig(key)}: ${quoteCurlConfig(value)}"`),
  ].join("\n");
  const marker = "\n__LAW_RAG_HTTP_STATUS__:";
  try {
    await writeFile(configPath, config, { encoding: "utf8", mode: 0o600 });
    const result = await new Promise((resolve, reject) => {
      const child = spawn("curl", ["--config", configPath, "--data-binary", "@-", "--write-out", `${marker}%{http_code}`], { stdio: ["pipe", "pipe", "pipe"] });
      const stdout = [];
      const stderr = [];
      let size = 0;
      const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("模型服務請求逾時。")); }, 70_000);
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024 + 100) child.kill("SIGTERM");
        else stdout.push(chunk);
      });
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (size > 2 * 1024 * 1024 + 100) reject(new Error("模型服務回應超過安全大小限制。"));
        else resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
      });
      child.stdin.end(JSON.stringify(payload));
    });
    if (result.code !== 0) throw new Error(`模型服務無法完成回答：${result.stderr.trim().slice(0, 400) || "curl transport failed"}`);
    const separator = result.stdout.lastIndexOf(marker);
    if (separator < 0) throw new Error("模型服務回應缺少 HTTP 狀態。");
    const body = result.stdout.slice(0, separator);
    const status = Number.parseInt(result.stdout.slice(separator + marker.length).trim(), 10);
    if (!Number.isFinite(status)) throw new Error("模型服務回應包含無效 HTTP 狀態。");
    if (status >= 400) throw new Error(`模型服務拒絕請求（HTTP ${status}）：${errorDetail(body).slice(0, 800)}`);
    try { return JSON.parse(body); }
    catch { throw new Error("模型服務回傳了無法解析的資料。"); }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function postJson(url, payload, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal });
  } catch {
    clearTimeout(timer);
    return curlPostJson(url, payload, headers);
  }
  clearTimeout(timer);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 2 * 1024 * 1024) throw new Error("模型服務回應超過安全大小限制。");
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > 2 * 1024 * 1024) throw new Error("模型服務回應超過安全大小限制。");
  if (!response.ok) throw new Error(`模型服務拒絕請求（HTTP ${response.status}）：${errorDetail(raw).slice(0, 800)}`);
  try { return JSON.parse(raw.toString("utf8")); }
  catch (error) { throw new Error(`模型服務無法完成回答：${error.message}`); }
}

function extractiveAnswer(passages) {
  if (!passages.length) return "未能從法務局『搜法易』找到足以回答的法律資料。請改用法規名稱、編號或更精確的法律關鍵詞重試。";
  const seen = new Set();
  const lines = ["目前以「無模型檢索模式」列出最相關的官方條文摘錄："];
  for (const passage of passages) {
    if (seen.has(passage.citation_id)) continue;
    seen.add(passage.citation_id);
    let excerpt = passage.text.replaceAll("\n", " ").trim();
    if (excerpt.length > 240) excerpt = `${excerpt.slice(0, 240).trimEnd()}……`;
    const status = passage.states.length ? `（狀態：${passage.states.join(", ")}）` : "";
    const label = passage.description && passage.description !== passage.title ? ` — ${passage.description}` : "";
    lines.push(`\n- ${passage.title}${label}${status}：${excerpt} [${passage.citation_id}]`);
  }
  lines.push("\n以上是檢索結果而非法律意見。請開啟來源核對《澳門特別行政區公報》PDF法定文本；重要個案應諮詢合資格法律專業人士。");
  return lines.join("");
}

export function compatibleSetting(name, legacyName, defaultValue = "") {
  return process.env[name]?.trim() || process.env[legacyName]?.trim() || defaultValue;
}

export async function generateAnswer(question, passages) {
  const provider = (process.env.RAG_PROVIDER || "extractive").trim().toLowerCase();
  if (provider === "extractive") return [extractiveAnswer(passages), "extractive"];
  if (!passages.length) return [extractiveAnswer(passages), provider];
  const prompt = `使用者問題：${question}\n\n檢索資料：\n${context(passages)}`;
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }];
  if (provider === "ollama") {
    const base = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    const data = await postJson(`${base}/api/chat`, { model, stream: false, messages }, { "Content-Type": "application/json" });
    return [String(data?.message?.content || "").trim(), `ollama/${model}`];
  }
  if (provider === "openai" || provider === "openai_compatible") {
    const key = compatibleSetting("OPENAI_COMPATIBLE_API_KEY", "OPENAI_API_KEY");
    if (!key) throw new Error("未設定 OPENAI_COMPATIBLE_API_KEY（亦可使用舊名稱 OPENAI_API_KEY）。");
    const base = compatibleSetting("OPENAI_COMPATIBLE_BASE_URL", "OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = compatibleSetting("OPENAI_COMPATIBLE_MODEL", "OPENAI_MODEL", "gpt-4.1-mini");
    const data = await postJson(`${base}/chat/completions`, { model, temperature: 0.1, messages }, { "Content-Type": "application/json", Authorization: `Bearer ${key}` });
    const choices = data?.choices || [];
    if (!choices.length) throw new Error("相容 API 的回應沒有 choices，請確認它支援 Chat Completions 格式。");
    const answer = String(choices[0]?.message?.content || "").trim();
    if (!answer) throw new Error("相容 API 回傳了空白答案。");
    return [answer, `openai-compatible/${model}`];
  }
  throw new Error("RAG_PROVIDER 必須是 extractive、ollama、openai_compatible 或 openai。");
}
