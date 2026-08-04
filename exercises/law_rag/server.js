#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.js";

const root = dirname(fileURLToPath(import.meta.url));
loadEnvFile(join(root, ".env"));

const [{ generateAnswer }, { DSAJRetriever, RetrievalError }] = await Promise.all([
  import("./generation.js"), import("./retrieval.js"),
]);

const staticRoot = join(root, "static");
const retriever = new DSAJRetriever();
const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function sendJson(response, payload, status = 200) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
  response.end(body);
}

async function requestJson(request) {
  const declared = Number.parseInt(request.headers["content-length"] || "0", 10);
  if (!Number.isFinite(declared) || declared <= 0 || declared > 32_000) throw new TypeError("請求大小不正確。");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_000) throw new TypeError("請求大小不正確。");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new TypeError("請求內容不是有效的 JSON。"); }
}

async function handler(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, { ok: true, provider: process.env.RAG_PROVIDER || "extractive" });
    return;
  }
  if (request.method === "POST" && pathname === "/api/ask") {
    try {
      const body = await requestJson(request);
      const question = String(body?.question ?? "").trim();
      const scope = String(body?.scope ?? "laws");
      const [passages, meta] = await retriever.retrieve(question, scope, 6);
      const [answer, provider] = await generateAnswer(question, passages);
      sendJson(response, { answer, provider, sources: passages, meta });
    } catch (error) {
      if (error instanceof RetrievalError || error instanceof TypeError) sendJson(response, { error: error.message }, 400);
      else {
        console.error(error);
        sendJson(response, { error: error?.message || "模型服務無法完成回答。" }, 502);
      }
    }
    return;
  }
  if (request.method !== "GET") { sendJson(response, { error: "Not found" }, 404); return; }
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = join(staticRoot, requested);
  const pathFromRoot = relative(staticRoot, candidate);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) { sendJson(response, { error: "Not found" }, 404); return; }
  try {
    const body = await readFile(candidate);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(candidate).toLowerCase()] || "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-cache" });
    response.end(body);
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "EISDIR") console.error(error);
    sendJson(response, { error: "Not found" }, 404);
  }
}

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必須是 1 至 65535 的整數。");

const server = createServer((request, response) => handler(request, response).catch((error) => {
  console.error(error);
  if (!response.headersSent) sendJson(response, { error: "伺服器發生未預期錯誤。" }, 500);
  else response.destroy();
}));
server.listen(port, host, () => console.log(`Macau Law RAG demo: http://${host}:${port}`));
