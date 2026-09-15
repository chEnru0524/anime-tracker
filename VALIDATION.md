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
