import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

async function loadEnvFile() {
  try {
    const content = await readFile(join(__dirname, ".env"), "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
const LLM_BASE_URL = (
  process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1"
).replace(/\/$/, "");
const LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "google/gemini-3-flash-preview";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const APP_TITLE = process.env.APP_TITLE || "ReAct vs Reflexion Classroom Lab";

const reactSystemPrompt = `
你是教學示範聊天室中的謹慎 AI 助手。所有回答必須使用繁體中文。
只有在確實需要時才使用工具。
如使用者查詢澳門公共停車場的最新剩餘車位，使用 get_macao_parking_spaces。
如使用者不知道停車場的正確名稱，先使用 list_macao_parking_names。
如使用者要求比較兩個或以上停車場，使用 compare_macao_parking_spaces。
車位數量、維護狀態及更新時間必須以工具最新回傳為準。空值代表沒有資料，不等於零。
使用工具時，清楚區分：
1. 工具傳回的資料
2. 你對資料的解讀
如資料不足，指出缺失資料，不得自行補造。
最終回答使用三個標題：「查核計畫」、「工具觀察摘要」、「最終答案」。
「查核計畫」只用一句話說明要查甚麼，不要公開冗長內部思維。
`.trim();

const reflexionDraftPrompt = `
你正在 Reflexion 教學示範中撰寫初稿。所有回答必須使用繁體中文。
只使用對話中已有的資料回答使用者要求。內容須簡潔；如資料不足，指出缺失資料，不得補造。
不得聲稱曾調用工具或查核資料庫。
`.trim();

const reflexionCriticPrompt = `
你是 Reflexion 教學示範中的批判者。使用繁體中文，按四項可見準則評估即時車位資料使用提示初稿：
1. 是否說明資料會變動；2. 是否提醒查看更新時間；3. 是否區分空值與零；4. 是否加入原文沒有的資料。
以「符合／需修改」檢查表列出具體問題及修正方法。
不要提供隱藏思維鏈。
`.trim();

const reflexionRevisionPrompt = `
你是 Reflexion 教學示範中的修訂者。使用批判檢查表，以繁體中文重寫初稿。
保留有證據支持的內容、修正已識別問題，並標示缺失資料。只輸出修訂後的答案。
`.trim();

const tools = [
  {
    type: "function",
    function: {
      name: "list_macao_parking_names",
      description: "列出澳門交通事務局即時資料中可供查詢的停車場名稱；當使用者不知道正確名稱時使用。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "可選的名稱關鍵字；留空會列出部分可用名稱。" },
          limit: { type: "integer", description: "最多列出多少個名稱，預設 12，最高 30。" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_macao_parking_spaces",
      description: "按停車場中文名稱查詢澳門交通事務局最新剩餘車位資訊。",
      parameters: {
        type: "object",
        properties: {
          parking_name: {
            type: "string",
            description: "停車場中文名稱或名稱的一部分，例如「下環街市」、「青茂口岸」或「栢港」。"
          }
        },
        required: ["parking_name"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_macao_parking_spaces",
      description: "比較兩至五個澳門公共停車場的最新剩餘車位，適合回答哪一個停車場較有機會找到車位。",
      parameters: {
        type: "object",
        properties: {
          parking_names: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: 5,
            description: "要比較的停車場中文名稱，例如 [\"下環街市\", \"栢港\"]。"
          },
          vehicle_type: {
            type: "string",
            enum: ["汽車", "電單車", "電動汽車", "無障礙"],
            description: "比較的車位類型。"
          }
        },
        required: ["parking_names", "vehicle_type"],
        additionalProperties: false
      }
    }
  }
];

async function fetchParkingRecords() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const datasetId = "ea50a770-cc35-47cc-a3ba-7f60092d4bc4";
      const detailResponse = await fetch(`https://api.data.gov.mo/datadir/detail/${datasetId}`, { signal: controller.signal });
      if (!detailResponse.ok) throw new Error(`資料集詳情 API 回應 HTTP ${detailResponse.status}`);
      const detail = await detailResponse.json();
      const apiRecord = Array.isArray(detail.data?.apis) ? detail.data.apis[0] : detail.data?.apis;
      const apiId = apiRecord?.apiId;
      const appCode = detail.data?.appCode;
      if (detail.code !== 0 || !apiId || !appCode) throw new Error("無法取得停車場資料集的 API 設定。");

      const apiResponse = await fetch(`https://api.data.gov.mo/api/${apiId}`, { signal: controller.signal });
      if (!apiResponse.ok) throw new Error(`API 說明端點回應 HTTP ${apiResponse.status}`);
      const apiInfo = await apiResponse.json();
      const liveUrl = apiInfo.data?.apiPath;
      if (apiInfo.code !== 0 || !liveUrl) throw new Error("無法取得即時停車場 API 網址。");

      const liveResponse = await fetch(liveUrl, {
        signal: controller.signal,
        headers: { authorization: `APPCODE ${appCode}` }
      });
      if (!liveResponse.ok) throw new Error(`即時停車場 API 回應 HTTP ${liveResponse.status}`);
      const xml = await liveResponse.text();
      const decodeXml = (value) => String(value || "")
        .replaceAll("&amp;", "&").replaceAll("&quot;", '"')
        .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&#39;", "'");
      const numericOrNull = (value) => value === "" || value == null ? null : Number(value);
      const records = [...xml.matchAll(/<Car_park_info\b([^>]*)>/gi)].map((match) => {
        const attributes = {};
        for (const item of match[1].matchAll(/([A-Za-z_]+)="([^"]*)"/g)) attributes[item[1].toLowerCase()] = decodeXml(item[2]);
        return {
          id: attributes.id,
          name: attributes.name,
          car_spaces: numericOrNull(attributes.car_cnt),
          motorcycle_spaces: numericOrNull(attributes.mb_cnt),
          electric_motorcycle_spaces: numericOrNull(attributes.ot_a_cnt),
          electric_car_spaces: numericOrNull(attributes.elc_cnt),
          accessible_spaces: numericOrNull(attributes.dc_cnt),
          maintenance: attributes.maintenance === "1",
          updated_at: attributes.time || null
        };
      });
      return {
        records,
        source: "交通事務局 — 停車場車位資訊",
        dataset_url: `https://data.gov.mo/Detail?id=${datasetId}`,
        live_api: liveUrl,
        fetched_at: new Date().toISOString()
      };
    } finally {
      clearTimeout(timeout);
    }
}

const toolHandlers = {
  list_macao_parking_names: async ({ keyword = "", limit = 12 } = {}) => {
    const cleanKeyword = String(keyword || "").trim().slice(0, 80);
    const safeLimit = Math.min(30, Math.max(1, Number(limit) || 12));
    const data = await fetchParkingRecords();
    const names = data.records
      .map((item) => item.name)
      .filter((name) => name && (!cleanKeyword || name.includes(cleanKeyword)))
      .slice(0, safeLimit);
    return {
      keyword: cleanKeyword,
      match_count: names.length,
      parking_names: names,
      source: data.source,
      dataset_url: data.dataset_url,
      fetched_at: data.fetched_at
    };
  },

  get_macao_parking_spaces: async ({ parking_name }) => {
    const cleanName = String(parking_name || "").trim().slice(0, 80);
    if (!cleanName) throw new Error("停車場名稱不可留空。");
    const data = await fetchParkingRecords();
    const matches = data.records.filter((item) => item.name?.includes(cleanName)).slice(0, 10);
    return {
      query: cleanName,
      match_count: matches.length,
      results: matches,
      null_value_note: "null 表示 API 沒有提供數值，不可解讀為 0。",
      source: data.source,
      dataset_url: data.dataset_url,
      live_api: data.live_api,
      fetched_at: data.fetched_at
    };
  },

  compare_macao_parking_spaces: async ({ parking_names, vehicle_type }) => {
    const names = [...new Set((Array.isArray(parking_names) ? parking_names : [])
      .map((name) => String(name || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 5);
    if (names.length < 2) throw new Error("請提供至少兩個停車場名稱。");
    const fieldMap = { "汽車": "car_spaces", "電單車": "motorcycle_spaces", "電動汽車": "electric_car_spaces", "無障礙": "accessible_spaces" };
    const field = fieldMap[vehicle_type];
    if (!field) throw new Error("不支援的車位類型。");
    const data = await fetchParkingRecords();
    const comparisons = names.map((query) => {
      const match = data.records.find((item) => item.name?.includes(query));
      return match ? { query, name: match.name, available_spaces: match[field], maintenance: match.maintenance, updated_at: match.updated_at } : { query, not_found: true };
    });
    const usable = comparisons.filter((item) => Number.isFinite(item.available_spaces) && !item.maintenance);
    const highest = usable.length ? Math.max(...usable.map((item) => item.available_spaces)) : null;
    return {
      vehicle_type,
      comparisons,
      most_available: highest == null ? [] : usable.filter((item) => item.available_spaces === highest).map((item) => item.name),
      decision_note: "只按目前剩餘車位比較；沒有考慮距離、費用或車位在查詢後的變動。",
      null_value_note: "null 表示 API 沒有提供數值，不可解讀為 0。",
      source: data.source,
      dataset_url: data.dataset_url,
      fetched_at: data.fetched_at
    };
  }
};

function jsonResponse(res, statusCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data)
  });
  res.end(data);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function safeClientMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant"))
    .map((msg) => ({
      role: msg.role,
      content: String(msg.content || "").slice(0, 8000)
    }))
    .slice(-20);
}

async function callChatCompletions(messages, availableTools = tools) {
  const headers = {
    "content-type": "application/json"
  };
  if (LLM_API_KEY) {
    headers.authorization = `Bearer ${LLM_API_KEY}`;
  }
  headers["HTTP-Referer"] = APP_URL;
  headers["X-OpenRouter-Title"] = APP_TITLE;

  const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      ...(availableTools.length > 0 ? { tools: availableTools, tool_choice: "auto" } : {}),
      temperature: 0.2
    })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`語言模型請求失敗：${response.status} ${JSON.stringify(data)}`);
  }

  return data.choices?.[0]?.message;
}

async function executeToolCall(toolCall) {
  const name = toolCall?.function?.name;
  const handler = toolHandlers[name];
  if (!handler) {
    return {
      error: `未知工具：${name}`
    };
  }

  try {
    const args = JSON.parse(toolCall.function.arguments || "{}");
    return await handler(args);
  } catch (error) {
    return {
      error: `工具執行失敗：${error.message}`
    };
  }
}

async function runAgentTurn(clientMessages) {
  const messages = [
    { role: "system", content: reactSystemPrompt },
    ...safeClientMessages(clientMessages)
  ];
  const toolTrace = [];

  for (let i = 0; i < 4; i += 1) {
    const assistantMessage = await callChatCompletions(messages);
    if (!assistantMessage) {
      throw new Error("模型沒有傳回 AI 助手訊息。");
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        reply: assistantMessage.content || "",
        toolTrace
      };
    }

    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall);
      toolTrace.push({
        name: toolCall.function?.name,
        arguments: toolCall.function?.arguments,
        result
      });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }
  }

  return {
    reply: "工具使用循環已達迭代上限，請縮窄問題範圍。",
    toolTrace
  };
}

async function runReflexionTurn(clientMessages) {
  const conversation = safeClientMessages(clientMessages);
  const draftMessage = await callChatCompletions(
    [{ role: "system", content: reflexionDraftPrompt }, ...conversation],
    []
  );
  const draft = draftMessage?.content || "";

  const criticMessage = await callChatCompletions(
    [
      { role: "system", content: reflexionCriticPrompt },
      { role: "user", content: `原始對話：\n${JSON.stringify(conversation)}\n\n初稿：\n${draft}` }
    ],
    []
  );
  const critique = criticMessage?.content || "模型沒有傳回批判結果。";

  const revisionMessage = await callChatCompletions(
    [
      { role: "system", content: reflexionRevisionPrompt },
      {
        role: "user",
        content: `原始對話：\n${JSON.stringify(conversation)}\n\n初稿：\n${draft}\n\n批判檢查表：\n${critique}`
      }
    ],
    []
  );

  return {
    reply: revisionMessage?.content || draft,
    toolTrace: [],
    reflectionTrace: { draft, critique }
  };
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requested = normalize(join(publicDir, pathname));

  if (!requested.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("禁止存取");
    return;
  }

  try {
    const data = await readFile(requested);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8"
    }[extname(requested)] || "application/octet-stream";

    res.writeHead(200, { "content-type": type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("找不到資源");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") {
      const body = await readJsonBody(req);
      const mode = body.mode === "reflexion" ? "reflexion" : "react";
      const result = mode === "reflexion"
        ? await runReflexionTurn(body.messages)
        : await runAgentTurn(body.messages);
      jsonResponse(res, 200, result);
      return;
    }

    if (req.method === "POST" && req.url === "/api/parking") {
      const input = await readJsonBody(req);
      const result = await toolHandlers.get_macao_parking_spaces({ parking_name: input.parking_name });
      jsonResponse(res, 200, result);
      return;
    }

    if (req.method === "GET" && req.url === "/api/tools") {
      jsonResponse(res, 200, {
        model: LLM_MODEL,
        base_url: LLM_BASE_URL,
        api_key_configured: Boolean(LLM_API_KEY),
        tools: tools.map((tool) => tool.function)
      });
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    res.writeHead(405);
    res.end("不允許使用此請求方法");
  } catch (error) {
    jsonResponse(res, 500, {
      error: error.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`自訂聊天室運行於 http://localhost:${PORT}`);
  console.log(`模型：${LLM_MODEL}`);
  console.log(`基礎網址：${LLM_BASE_URL}`);
});
