# 法徑：澳門法律 RAG 示範

一個不需要安裝第三方套件即可運行的 Node.js 教學型 RAG 系統。它在每次提問時查詢澳門法務局「搜法易」，將法律文件切成段落、在本地重排，然後以可追溯的官方來源回答。

## 啟動

需要 Node.js 18.17 或以上及系統 `curl`：

```bash
npm start
```

開啟 <http://127.0.0.1:3000>。程式啟動時會直接讀取專案根目錄的 `.env`，不需要執行 `source .env`。Shell、IDE 或部署平台已設定的環境變數具有較高優先權。

預設使用 `extractive`（無模型）模式，因此不需要 API key。

## 啟用生成模型

- `RAG_PROVIDER=extractive`：只整理檢索結果，零設定、最容易展示。
- `RAG_PROVIDER=ollama`：使用本機 Ollama；預設模型是 `qwen2.5:7b`。
- `RAG_PROVIDER=openai_compatible`：使用任何 OpenAI-compatible Chat Completions API。
- `RAG_PROVIDER=openai`：向後兼容舊設定名稱。

使用自建相容 API 的 `.env` 範例：

```dotenv
RAG_PROVIDER=openai_compatible
OPENAI_COMPATIBLE_API_KEY=your-secret-key
OPENAI_COMPATIBLE_MODEL=your-model-id
OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:8000/v1
PORT=3000
```

`OPENAI_COMPATIBLE_BASE_URL` 應指向 API 的 `/v1` 根路徑；程式會呼叫 `/chat/completions`。也支援舊名稱 `OPENAI_API_KEY`、`OPENAI_MODEL` 及 `OPENAI_BASE_URL`。

## RAG 流程

1. 後端把一般問法清理為法律搜尋詞；對已識別的事實模式（例如高空墜物造成財物損害）產生保守的民事及刑事查詢，不預先斷定責任。
2. 對 `https://search.bo.dsaj.gov.mo/_/search` 發出低頻、唯讀查詢；多個法律面向最多三個並行。
3. 只保留最多 10 份官方搜尋結果，優先使用 DSAJ 命中的條文 highlight，再清理 HTML 並按約 900 字切分。
4. 使用中文雙字詞與英數詞重排，確保每個法律面向至少有一個候選段落，最多選 6 段、每份文件最多 2 段。
5. 模型只能看到被選段落，系統提示要求逐項使用 `[n]` 引用並處理廢止／修改狀態。
6. 前端把引用連到法務局文件，方便核對原文。

## 指令

```bash
npm start        # 啟動 http://127.0.0.1:3000
npm run dev      # 修改程式後自動重啟
npm test         # 執行 Node.js 測試
```

## 使用與限制

- 這是教學示範，不構成法律意見。
- 法務局搜尋介面是外部服務，其公開 Web contract 日後可能變更；程式會在格式不符時明確報錯。
- 後端設有 10 分鐘記憶體快取、25 秒 timeout、12 MB 回應上限。法律查詢最多三個並行，預設使用無 shell 的 `curl` 連接法務局；可設定 `DSAJ_HTTP_TRANSPORT=fetch` 使用 Node transport。
- 《澳門特別行政區公報》PDF 是法定有效版本。重要個案必須核對正式文本及諮詢合資格專業人士。
- 部署到公開網絡前，應另加速率限制、存取日誌政策、監控及機構批准。
