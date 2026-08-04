# ReAct 與 Reflexion 網頁示範

這是一個簡單的瀏覽器教學實驗室，用來比較 ReAct 與 Reflexion。專案使用 OpenRouter 的相容聊天生成介面，不需要 OpenAI 帳戶。

功能包括：

- 瀏覽器聊天介面
- Node.js 後端
- 相容 `/v1/chat/completions` 請求
- 後端工具定義及執行
- 可見的工具調用紀錄
- ReAct 模式：在模型決策與工具觀察之間交替運作
- Reflexion 模式：顯示初稿、批判檢查表及修訂答案

專案毋須安裝任何 npm 套件。

## 1. 設定

把 `.env.example` 複製為 `.env`，然後填入 OpenRouter 金鑰：

```powershell
Copy-Item .env.example .env
# 編輯 .env，以真正金鑰取代 your_openrouter_key_here
```

伺服器會自動載入專案資料夾內的 `.env`。如 PowerShell 已設定同名環境變數，PowerShell 的值會優先使用。

所選 OpenRouter 模型必須支援 `tools` 參數。如使用其他相容供應商，可設定：

```powershell
$env:LLM_API_KEY="供應商金鑰"
$env:LLM_BASE_URL="https://供應商網址.example.com/v1"
$env:LLM_MODEL="相容模型名稱"
```

## 2. 執行

```powershell
npm start
```

開啟 `http://localhost:3000`。

## 3. 示範情境：查詢即時停車場車位

ReAct 工具會使用交通事務局的「停車場車位資訊」資料集：

```text
資料集：https://data.gov.mo/Detail?id=ea50a770-cc35-47cc-a3ba-7f60092d4bc4
即時 API：https://dsat.apigateway.data.gov.mo/car_park_maintance
```

資料集以 XML 提供，標示更新頻率為 10 秒。工具會抽取停車場名稱、汽車位、電單車位、電動車位、無障礙車位、維護狀態和更新時間。`null` 表示 API 沒有提供該數值，不能當作零。

### ReAct：先查資料，再回答

本示範共有三個工具，方便說明模型如何選擇 Action：

- `list_macao_parking_names`：不知道正確名稱時列出停車場。
- `get_macao_parking_spaces`：查詢一個指定停車場的各類車位。
- `compare_macao_parking_spaces`：比較 2 至 5 個停車場的指定車位類型。

可另外測試以下兩題：

```text
請先找出名稱包含「口岸」的停車場，再選擇其中一個查詢目前汽車位。
```

這一題會示範兩步 ReAct：先調用 `list_macao_parking_names`，觀察名稱後再調用 `get_macao_parking_spaces`。

```text
請比較「下環街市」和「栢港」目前的汽車位，告訴我哪一個較多；列出兩者更新時間，資料不足時不要猜測。
```

這一題會調用 `compare_macao_parking_spaces`，並提醒學生「較多車位」不等於距離較近或一定有位。

選擇 **ReAct**：

```text
你是資料查核助理。

任務：查詢「下環街市」停車場目前的汽車位、電單車位、
電動汽車位及無障礙車位。

請依以下 ReAct 流程處理：
1. Plan：只用一句話說明要查核甚麼，不要提供冗長內部推理。
2. Action：調用 get_macao_parking_spaces，parking_name 設為「下環街市」。
3. Observation：取得工具結果後，摘錄各類車位、維護狀態及資料更新時間。
4. Final Answer：根據 Observation 回答，不得使用未經工具支持的數字。

輸出標題：
- 查核計畫
- 工具觀察摘要
- 最終答案

限制：
- 必須先使用工具，才可以回答車位數量。
- null 代表 API 沒有提供數值，不可當作 0。
- 如工具失敗，說明失敗，不可自行估計。
```

預期流程：

```text
問題
→ get_macao_parking_spaces({ parking_name: "下環街市" })
→ 工具取得資料集設定及公開 AppCode
→ 即時 API 傳回 XML 車位資料
→ 工具抽取指定停車場並保留更新時間
→ 模型區分數值 0 與 null，再整理答案
```

### Reflexion：先寫初稿，再檢查及修改

選擇 **Reflexion**：

```text
請根據以下資料寫一段 80 字內的即時車位資訊使用提示：
- 車位數目會變動
- 使用前要查看更新時間
- 空值代表沒有資料，不等於零

請先寫初稿，再檢查三項提醒及是否補造資料，最後修訂。
```

預期流程：

```text
初稿
→ 檢查：數據變動？更新時間？空值意義？有沒有補造資料？
→ 修訂稿
```

一句話分辨：**ReAct 用工具補充外部資料；Reflexion 用檢查表改善已有答案。**

## 4. 安全提示

ReAct 模式會向澳門政府公開 API 發出唯讀請求；API 可能因維護、網絡或資料更新而改變結果。系統限制停車場名稱長度、最多傳回 10 個部分名稱相符的結果、設定 10 秒逾時，並只把白名單欄位交給模型。公開 AppCode 由資料集詳情 API 動態取得，不會傳給模型。安全流程應為：

```text
模型建議工具調用 → 後端驗證 → 後端執行獲准功能 → 模型整理結果
```
