# 驗證紀錄

驗證日期：2026-09-15。環境：Windows、Node 24.11、Chromium 153。

## 通過

- `npm run build`：TypeScript 與正式建置通過。
- `npm test`：7 個測試通過，涵蓋集數上下限／未知總數、跨年季度、平台優先順序、備份完整還原、不合法輸入保護、網路失效不影響本機收藏。
- `npx playwright test`：2 個完整情境通過。
  - 搜尋 Frieren → 加入觀看中 → 儲存進度／9 分／備註 → 最後一集確認已看完 → 修改台灣平台 → 下載 JSON → 預覽匯入摘要 → 確認還原 → 統計核對。
  - 阻擋 API 網路 → 本機收藏仍能加一集 → 重新整理仍保留 → 錯誤 JSON 不覆蓋 → 390／768／1440px 無橫向溢出。
- `node tests/pages-smoke.mjs`：production `dist` 在 `/anime-tracker/` 子目錄載入，收藏、備份、統計的 Hash 路由重新整理成功；390／768／1440px 無橫向溢出；沒有未捕捉的 JavaScript runtime error。
- 桌面／手機首頁截圖已人工檢視，包含真實封面、觀看進度與未來動畫。
- 已修正測試發現的選擇器精確匹配問題；亦補強匯入日期驗證、資料寫入失敗保留草稿、未來季度篩選切換。

## 真實 API 測試（非 Mock）

- Chromium 直接從本機前端跨來源呼叫 Jikan、Bangumi。
- `Frieren` 搜尋成功，結果包含「葬送的芙莉蓮」與第二季；中文 `葬送的芙莉蓮` 的 Bangumi 公開搜尋回傳成功。
- 已成功進入詳細頁、加入收藏、保存 20 / 28 集。
- 本季列表取得 20 部動畫；下一季區塊取得 4 部已公布作品。
- Jikan 部分搜尋／指定季度端點實際回傳 504，已驗證 Bangumi 備援正常顯示與操作。
- Jikan `/anime/52991/full`、`/seasons/now`、`/seasons/upcoming` 的公開請求曾成功；第三方服務可用性會波動。
- 對帶 Origin 的公開請求確認兩家 API 有 `Access-Control-Allow-Origin: *`。
- 真實瀏覽器 smoke 未出現未捕捉 JavaScript error。API 504 等預期網路失敗會被捕捉並呈現來源提示；外部圖片失效由封面替代畫面處理。

## 部署與限制

- 已檢查 GitHub Actions 權限、Node、lockfile、測試、build、Pages artifact 與 deploy dependency。
- 已在嚴格靜態伺服器上驗證 project base path 與 Hash Router，沒有依賴 SPA server fallback。
- 已上傳至 [chEnru0524/anime-tracker](https://github.com/chEnru0524/anime-tracker)。實際 GitHub Actions 的 7 項測試與 Vite 建置通過；第一次工作流程因 Pages 尚未啟用而停止，之後已依使用者確認改為公開並設定 Pages 使用 GitHub Actions。最新發佈結果請見 [Actions](https://github.com/chEnru0524/anime-tracker/actions)。
- OpenCC 的繁體字典獨立延遲載入（約 466KB gzip）；建置仍有字典大於 500KB 的提示，以及 Zod 上游註解被 Rollup 移除的提示。均不影響成功建置。
- API 缺失的中文名稱、播出日期與台灣串流授權無法保證完整。Jikan 失效且無快取時，未定日期的未來動畫不包含於 Bangumi 日期備援結果。
- WebMCP 為可選漸進增強，環境未提供原生可驗證的 WebMCP context；一般瀏覽器完整 UI 流程已驗證。

## 2026-09-16 分頁與類型篩選

- Build 通過，11 項單元測試與 4 項 Playwright 流程測試通過。
- 驗證總頁數、直接跳頁、末頁、篩選重設頁碼、零結果與 Bangumi 20 筆分頁 offset。
- 篩選頁面在 390、768、1440px 無橫向溢出，新增流程無未捕捉 JavaScript error。

## 動畫瘋同步驗證

- 已檢查真實公開播放器 DOM、播放器腳本，以及使用者自行登入後的觀看紀錄 DOM／載入腳本；沒有保存登入憑證或真實紀錄至 Repository。
- 新增測試涵蓋集數 5 → 8、較早集數不倒退、時間合併、去重、跨季偏移、備份相容、sender allowlist、廣告／拖曳排除與歷史分頁讀取。
- 本機完整 Chrome for Testing 無法啟動，原生擴充功能端到端測試設定於 GitHub Actions 的 Linux Chromium 執行（RUN_NATIVE_EXTENSION=1）；本機另用實際編譯 content script、worker 與合成頁面測試。
- 非真實帳號的長片完整播放測試；真實播放器版本／廣告方案差異仍可能影響偵測，無法識別時會保守停止。

## 巴哈自動收藏與批次操作

- Build 與 25 項單元測試通過；新增測試覆蓋依作品 ID 自動收藏、重送去重、巴哈平台取代、歷史確認加入、移除後防自動重建、批次加入防覆寫。
- 瀏覽器驗證批次加入／取消與確認移除、歷史多筆直接加入、巴哈本機詳情離線重新整理、360／768／1440px 版面；既有 9 項瀏覽器測試通過，原生擴充功能由 Linux CI 驗證。

## 2026-09-16 歷年動畫

- Build、23 項單元測試、既有 7 項瀏覽器測試及新增 2 項歷年動畫測試通過；原生擴充功能測試沿用 Linux CI。
- 新測試驗證一月預設前一年秋季、自由輸入 1917 年、整季跨頁排序、季度切換、分類空結果、收藏狀態、防重複加入、備援排序與錯誤重試。
- 360、768、1440px 無橫向溢出；新流程沒有未捕捉 JavaScript error。GitHub Pages base path smoke 通過。
- 實際 Jikan 年份端點曾回傳 504；Bangumi 歷史查詢成功，確認每頁最多 20 筆。備援按實際回傳筆數遞增 offset，測試包含跨頁熱門作品排序。
