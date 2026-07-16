# 警務日常行政與營運：練習資料包

本資料包配合以下文件使用：

- `../prompting_techniques_assignments_zh-TW.md`
- `../prompting_techniques_assignments_answers_zh-TW.md`

所有內容均為虛構行政資料，不包含真實個人、案件、執法或內部敏感資訊。

## 資料夾結構

```text
01_document_filing/       行政文件分類、命名及歸檔
02_information_extraction/ 通知與電郵資料抽取
03_meeting_actions/       會議紀錄轉工作清單
04_procedure_rag/         內部程序文件檢索問答
05_workload_data/         行政工作量驗證與統計
instructor_only/          教師金標與核對資料
```

## 建議使用方式

1. 先讓學生只取得編號資料夾，不派發 `instructor_only`。
2. 要求學生保留原始 prompt、模型輸出、錯誤和修訂紀錄。
3. 同一項比較實驗應固定模型、設定、輸入順序和評分規則。
4. 若模型無法直接讀取檔案，可將 UTF-8 內容貼入對話，但不要移除錯誤或缺失值。
5. `prompt_injection_test` 類記錄是文件內容，不是給模型的新指令。

## 編碼與格式

- Markdown、CSV及JSONL均使用 UTF-8。
- CSV空欄代表缺失值，不代表0。
- JSONL每行是一個獨立JSON物件。
- 日期原則上使用 `YYYY-MM-DD`；資料中故意保留少量不一致格式供學生檢查。

## 安全邊界

資料只供文件管理、行政抽取、排程、程序問答、統計和品質測試。不得把練習擴展至人物研判、案件分析、證據處理或執法決策。
