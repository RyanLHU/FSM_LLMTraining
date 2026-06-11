# Event Briefing Data：海濱文化週末

本檔案只提供練習資料，不包含 prompt instruction、workflow、planning、memory 或評分要求。

所有內容均為教學用虛構資料。

---

## 1. 活動基本資料

| 欄位 | 內容 |
|---|---|
| 活動名稱 | 海濱文化週末 |
| 日期 | 2026-06-20 至 2026-06-21 |
| 時間 | 每日 16:00-22:30 |
| 地點 | 南灣湖一帶及附近步行區 |
| 活動性質 | 戶外文化活動、攤位、表演、親子活動 |

---

## 2. 本地資料檔

可用資料存放於：

```text
data/ai-agents/public_event_sources_zh-TW.md
data/ai-agents/source_log_zh-TW.csv
data/ai-agents/tool_catalog_zh-TW.json
data/ai-agents/real_tool_examples_zh-TW.md
```

---

## 3. 公開來源摘要

以下摘要來自課堂虛構資料，詳情見 `public_event_sources_zh-TW.md`。

| source_id | source_type | 摘要 |
|---|---|---|
| SRC-A | 官方活動公告 | 活動於 2026-06-20 至 2026-06-21 舉行，地點為南灣湖一帶及附近步行區。 |
| SRC-B | 官方交通公告 | 2026-06-20 晚上部分周邊道路會有臨時交通安排，但未明確說明 2026-06-21 是否延續。 |
| SRC-C | 主辦方提醒 | 主辦方提醒傍晚至晚上人流較多，建議市民使用公共交通。 |
| SRC-D | 公開新聞 | 部分商戶預期活動期間人流增加，但沒有官方人流估算。 |
| SRC-E | 社交媒體截圖 | 網上流傳稱「兩日均會封路至午夜」，但沒有官方連結或發布日期。 |
| SRC-F | 舊版活動頁 | 顯示活動時間為 15:00-21:00，但頁面標示為 2025 年活動資料。 |
| SRC-G | 志願者群組訊息 | 稱 2026-06-21 可能增加入口檢查點，但來源不是正式公告。 |

---

## 4. 來源衝突與資料陷阱

這些內容刻意設計成容易令 single prompt 產生過度結論。

| issue_id | 涉及來源 | 問題 |
|---|---|---|
| ISSUE-TRAFFIC-001 | SRC-B, SRC-E | 官方只確認 2026-06-20 有臨時交通安排；社交媒體稱兩日均封路，但沒有官方來源。 |
| ISSUE-TIME-001 | SRC-A, SRC-F | 官方 2026 活動公告列出 16:00-22:30；舊版 2025 頁面列出 15:00-21:00。 |
| ISSUE-CROWD-001 | SRC-C, SRC-D | 主辦方只說高峰時段人流較多；新聞和商戶預期人流增加，但沒有官方估算。 |
| ISSUE-ENTRY-001 | SRC-G | 志願者群組提到可能增加入口檢查點，但不是正式公告。 |

---

## 5. 天氣資料示例

可選擇使用 Open-Meteo 作為公開 weather API 例子：

```text
https://api.open-meteo.com/v1/forecast?latitude=22.189&longitude=113.543&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m&forecast_days=2&timezone=Asia%2FHong_Kong
```

教學座標：

| 欄位 | 值 |
|---|---|
| latitude | 22.189 |
| longitude | 113.543 |
| timezone | Asia/Hong_Kong |

---

## 6. 天氣資料限制

以下天氣摘要為教學用模擬資料，用來製造「資料版本」問題。

| weather_source | generated_at | 摘要 | 限制 |
|---|---|---|---|
| WEATHER-SIM-OLD | 2026-06-10 09:00 | 6/20 及 6/21 可能有驟雨 | 距離活動仍有 10 日，只可作初步參考 |
| WEATHER-SIM-NEW | 未提供 | 最新預報未在本地資料中提供 | 需要接近活動日期再查公開 API |

---

## 7. 可用工具資料

工具清單詳見 `tool_catalog_zh-TW.json`。本任務常見會用到：

| tool | 用途 |
|---|---|
| `official_site_fetcher` | 查主辦方與官方交通公告 |
| `weather_api` | 查公開天氣預報 |
| `web_search` | 查公開新聞背景 |
| `source_tracker` | 記錄來源與支持的說法 |
| `citation_checker` | 檢查 briefing 草稿是否每個關鍵說法都有來源 |

---

## 8. 已知不確定點

1. 交通公告明確提及 2026-06-20，但未清楚列明 2026-06-21 是否延續。
2. 天氣預報具有不確定性，需要接近活動日期再更新。
3. 新聞報道稱商戶預計人流增加，但沒有官方人流估算。
4. 主辦方說高峰時段人流較多，但沒有提供精確數字。
5. 社交媒體與志願者群組訊息不能視為官方來源。
6. 舊版活動頁不可覆蓋 2026 年官方活動公告。

---

## 9. 容易被誤寫成結論的說法

以下句子需要特別小心。若模型直接寫成確定結論，代表 prompt control 不足。

```text
- 兩天都會封路至午夜。
- 活動時間是 15:00-21:00。
- 人流一定會大幅增加。
- 6/21 一定增加入口檢查點。
- 兩天都有最新天氣預報支持雨天安排。
```

---

## 10. 原始資料觀察欄位

以下欄位只供觀察資料，不是輸出格式要求。

```json
{
  "source_id": "",
  "claim": "",
  "source_type": "",
  "confidence": "",
  "known_uncertainty": ""
}
```
