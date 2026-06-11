# AI Agents 課堂練習資料

本資料夾配合 `ai-agents-zh-TW.marp.md` 使用。所有內容均為教學用虛構資料，避免真實個資、真實案情與內部敏感資訊。

## 建議使用方式

1. 從 `exercise_tasks_zh-TW.md` 選擇課堂練習。
2. 按題目載入對應資料檔。
3. 複製題目中的 prompt template。
4. 修改 template 內的 `TODO` 區塊。
5. 比較 baseline 與修改後輸出。
6. 用 red-team inputs 或測試集檢查 prompt 是否守得住。

## 主要練習檔

- `beginner_walkthrough_zh-TW.md`：給沒有 LLM 背景學員的 copy-paste 入門 walkthrough，包含 baseline、改良 prompt、預期輸出與 TODO 修改。
- `exercise_tasks_zh-TW.md`：Topic 9 課堂練習題目與 prompt templates。這是主要練習入口。

## 任務與資料檔

- `event_briefing_task_zh-TW.md`：公開活動 briefing 的使用者任務與交付需求，不包含 workflow / planning 指令。
- `event_briefing_data_zh-TW.md`：公開活動 briefing 的資料卡，包含來源摘要、資料陷阱、工具資料與不確定點。
- `workflow_patterns_tasks_zh-TW.md`：Workflow patterns 練習輸入資料。
- `public_event_sources_zh-TW.md`：大型活動公開資料練習素材。
- `draft_briefing_zh-TW.md`：需要 parallel check 的 briefing 草稿。
- `source_log_zh-TW.csv`：公開資料來源紀錄，用於 citation / verification 練習。

## SOP 與 Context Engineering 資料

- `sop_snippets_zh-TW.md`：SOP 問答助理的虛構規程片段。
- `sop_frontline_questions_zh-TW.md`：SOP 問答助理練習的前線問題資料，對應 slides 中的 `{{frontline_question}}`。

## Tool Use / Function Calling 資料

- `tool_catalog_zh-TW.json`：虛構工具清單，用於 tool definition 與 tool-use prompt 練習。
- `real_tool_examples_zh-TW.md`：真實工具實作例子，包括 Open-Meteo endpoint 與本地檔案工具。
- `case_summaries_zh-TW.json`：去識別化案件摘要，適合案件摘要整理 workflow。
- `case_schema.json`：案件摘要整理的目標欄位 schema。

## Validation / Red-team 資料

- `red_team_inputs_zh-TW.md`：紅隊測試輸入，用於檢查 agent 是否越權、缺乏引用、過度推測或忽略安全邊界。

## 已清理的舊檔

舊版 Topic 2-6 的分散 lab 與 sample answer markdown 已由 `exercise_tasks_zh-TW.md` 取代，避免同一練習存在多個版本造成混淆。
