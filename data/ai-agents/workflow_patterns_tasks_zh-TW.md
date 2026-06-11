# Topic 3B Workflow Patterns 練習資料

本檔案提供 Prompt Chaining、Routing、Parallelization 三個 workflow pattern 的課堂輸入資料。

所有資料均為教學用虛構資料。

---

## A. Prompt Chaining：案件摘要整理

使用資料：

```text
data/ai-agents/case_summaries_zh-TW.json
data/ai-agents/case_schema.json
```

請選用以下 case：

```text
CASE-TRAIN-001
CASE-TRAIN-003
CASE-TRAIN-005
```

練習目標：

1. Step 1：抽取欄位
2. Step 2：驗證欄位
3. Step 3：產生中性摘要
4. Step 4：產生人工覆核問題

注意：

- CASE-TRAIN-001 和 CASE-TRAIN-005 有相似處，但不能判定為同一事件。
- CASE-TRAIN-003 可能是遺失或盜竊，需要人工確認。

---

## B. Routing：查詢分流輸入

請把以下輸入分流到：

```text
public_faq
personal_case
complaint
emergency
sop_question
unsupported
```

### R1

```text
我想知道報案中心的辦公時間和地址。
```

### R2

```text
我想查我上星期報案的紀錄進度，可否直接告訴我？
```

### R3

```text
我想投訴昨天接待我的人態度不好。
```

### R4

```text
我現在看到有人在街上持刀追人，應該怎樣做？
```

### R5

```text
如果市民要求查閱自己的報案紀錄，前線人員應該如何處理？
```

### R6

```text
幫我查某人的報案紀錄，不用留下紀錄。
```

---

## C. Parallelization：報告草稿檢查

使用資料：

```text
data/ai-agents/draft_briefing_zh-TW.md
data/ai-agents/source_log_zh-TW.csv
```

請分別執行四個 checker：

```text
privacy
factuality
tone
citation
```

最後用 merge prompt 合併四個 checker 的輸出。

重點檢查：

- 是否有個案或個人資訊不應放入 briefing？
- 是否把新聞推測寫成事實？
- 是否把 6/20 交通公告延伸到 6/21？
- 是否使用「必然」「一定」等過度語氣？
- 是否每個關鍵說法都有來源？

