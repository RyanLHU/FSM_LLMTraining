# 真實工具實作例子

本檔案補充 `ai-agents-zh-TW.marp.md` 中 Tool Use 的實作層說明。

## 例子 1：真實公開 Weather API

工具名稱：

```text
weather_api
```

工具用途：

```text
查詢指定座標與日期範圍的公開天氣預報。
```

真實 API provider：

```text
Open-Meteo
```

官方文件：

```text
https://open-meteo.com/en/docs
```

真實 endpoint：

```text
https://api.open-meteo.com/v1/forecast
```

Macau / 南灣湖附近示例座標：

```text
latitude=22.189
longitude=113.543
```

可直接測試的 URL：

```text
https://api.open-meteo.com/v1/forecast?latitude=22.189&longitude=113.543&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m&forecast_days=2&timezone=Asia%2FHong_Kong
```

模型看到的 tool definition：

```json
{
  "name": "weather_api",
  "description": "Get public weather forecast from Open-Meteo for a latitude/longitude location. Use for weather-related public briefing tasks only.",
  "parameters": {
    "type": "object",
    "properties": {
      "latitude": {
        "type": "number",
        "description": "WGS84 latitude, e.g. 22.189 for Macau Nam Van area"
      },
      "longitude": {
        "type": "number",
        "description": "WGS84 longitude, e.g. 113.543 for Macau Nam Van area"
      },
      "forecast_days": {
        "type": "integer",
        "description": "Number of forecast days, e.g. 1 or 2"
      }
    },
    "required": ["latitude", "longitude"]
  }
}
```

後端實作需要做的事：

1. 接收模型產生的 `latitude`, `longitude`, `forecast_days`
2. 組成 Open-Meteo URL
3. 呼叫 HTTP GET
4. 把回傳 JSON 轉成 agent 容易理解的 observation
5. 記錄 API 呼叫、時間、來源與錯誤

Observation 範例：

```json
{
  "status": "success",
  "provider": "Open-Meteo",
  "source_url": "https://api.open-meteo.com/v1/forecast?...",
  "location": {
    "latitude": 22.189,
    "longitude": 113.543
  },
  "summary": "Hourly forecast returned for temperature, precipitation probability, precipitation, and wind speed.",
  "limitations": [
    "Forecast can change; update close to event time.",
    "Coordinates are approximate for training purposes."
  ]
}
```

## 例子 2：本地案件摘要讀取工具

工具名稱：

```text
case_read_tool
```

真實資料來源：

```text
data/ai-agents/case_summaries_zh-TW.json
```

這不是外部 API，而是本地檔案工具。教學時可用它模擬內部案件資料讀取。

模型看到的 tool definition：

```json
{
  "name": "case_read_tool",
  "description": "Read authorized de-identified training case summaries from local JSON data. Do not use for real personal or live case data.",
  "parameters": {
    "type": "object",
    "properties": {
      "case_ids": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Training case IDs, e.g. CASE-TRAIN-001"
      }
    },
    "required": ["case_ids"]
  }
}
```

後端實作需要做的事：

1. 讀取 `data/ai-agents/case_summaries_zh-TW.json`
2. 根據 `case_ids` 過濾資料
3. 回傳摘要與 notes
4. 記錄讀取行為
5. 如果 case_id 不存在，回傳 `no_records_found`

## 例子 3：本地 SOP Retriever

工具名稱：

```text
policy_retriever
```

真實資料來源：

```text
data/ai-agents/sop_snippets_zh-TW.md
```

這可用簡單 keyword search 模擬 RAG 檢索。

模型看到的 tool definition：

```json
{
  "name": "policy_retriever",
  "description": "Retrieve relevant SOP snippets from local training policy snippets. Use only for SOP questions in class exercises.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "User's SOP question or keywords"
      }
    },
    "required": ["query"]
  }
}
```

後端實作需要做的事：

1. 讀取 `data/ai-agents/sop_snippets_zh-TW.md`
2. 用 keyword 或 embedding search 找相關段落
3. 回傳文件名稱、版本日期、段落與文字
4. 如果多個段落衝突，標記 `possible_conflict`
5. 如果沒有結果，回傳 `no_results`

## 教學重點

LLM 只知道 tool definition。  
真正的 endpoint、API key、檔案路徑、權限檢查、錯誤處理，都要由系統開發者實作。

