# 夜番 YORU — 個人動漫追蹤

純前端、預設深色模式的動漫收藏 Web App。搜尋動畫、查看本季與未來新番、記錄進度和評分、管理觀看平台、匯出與還原資料。**不需要後端、Docker、帳號或 API Key**，可直接部署 GitHub Pages。

初次使用不會建立假收藏；請搜尋 `Frieren` 或 `葬送的芙莉蓮`，點選「開始觀看」。

## 使用技術

- React 19、TypeScript、Vite：靜態網站建置。
- React Router HashRouter：`/#/anime/52991` 路由，GitHub Pages 重新整理不會要求不存在的伺服器路徑。
- IndexedDB（idb）：保存個人收藏、設定、API 快取。
- Zod：完整驗證 JSON 備份與個人紀錄。
- Jikan / MyAnimeList、Bangumi：公開動畫資料與備援。
- OpenCC：將來源的簡體中文轉成繁體；不代表台灣官方譯名。
- Lucide 圖示、CSS Grid 響應式版面。
- Vitest、Playwright：資料與完整瀏覽器流程測試。

## 本機開發

安裝 Node.js **22.12+**（亦支援 Node 24），在本專案目錄執行：

```sh
npm ci
npm run dev
```

開啟終端顯示的本機網址。請透過 HTTP 使用，勿直接雙擊 `index.html`。

```sh
npm test                     # 資料、備份與進度測試
npx playwright install chromium
npx playwright test          # 完整操作流程、斷線、手機/平板/桌面
npm run build                # TypeScript 檢查 + production build
npm run preview              # 預覽 dist
```

`tests/live-smoke.mjs` 是額外的真實 API 健康檢查，需先啟動 5173 的 dev server，且不列入 CI（外部服務可能停機）。截圖存於 `test-results/live` 目錄；一般開發不需要執行此腳本。

## GitHub Pages 部署

1. 建立 GitHub repository，將**本資料夾的內容**放在 repository 根目錄（包含隱藏的 `.github` 與 `package-lock.json`）。
2. 開啟 GitHub repository → **Settings → Pages → Build and deployment → Source → GitHub Actions**。
3. 將程式碼推送到 `main`。已包含 `.github/workflows/deploy.yml`：
   `push main → npm ci → npm test → npm run build → 上傳 dist → GitHub Pages`。
4. 在 Actions 的 `Deploy GitHub Pages` 工作完成後，開啟 Pages 顯示的網址。
5. 後續推送到 `main` 自動更新；亦可從 Actions 手動執行工作流程。

```sh
git init
git add .
git commit -m "Build Yoru anime tracker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Vite 使用 `base: './'`，資源路徑自動相對於網站目錄，因此同時適用 `https://user.github.io/` 與 `https://user.github.io/repository/`，不需要手動改 repository 名稱。全部頁面使用 `#` 後面的路由，因此不依賴 404 redirect 或後端 rewrite。

部署 Repository：[chEnru0524/anime-tracker](https://github.com/chEnru0524/anime-tracker)。網站入口：[夜番 YORU](https://chenru0524.github.io/anime-tracker/)（首次 Actions 部署完成後生效）。Repository 已設定為公開，Pages 來源使用 GitHub Actions；後續更新 `main` 即自動重新部署。GitHub Actions 僅使用平台自動產生的短期 `GITHUB_TOKEN`／OIDC，沒有寫入任何個人 Token。

## 功能與操作

- **首頁**：觀看中卡片、`－1 / ＋1 集`、最近觀看時間、統計、本季追番（本季首播且狀態為觀看中）、下一季預告。
- **我的動畫**：五種狀態，名稱、年份、季度、平台篩選，評分／最近觀看排序。
- **本季／未來新番**：依裝置當地日期計算季度，下一季度可跨年，支援指定季度、未來年份、所有未來動畫與分頁。
- **詳細頁**：中日文名稱、其他名稱、簡介、類型、日期、播出狀態；已收藏可修改評分、備註、日期、觀看狀態及集數。
- **觀看進度**：不小於 0，不大於已知集數。未知總數可繼續增加（防止異常資料的技術上限為 100,000）。到達已知總集數會詢問是否已看完；取消確認仍會保存進度。從已完成減少集數會回到觀看中。
- **統計**：總收藏、各狀態數量、總觀看集數、平均個人評分（排除未評分）、依完成日期的年度完成數。
- **平台**：API 提供的地區皆視為未確認。可手動新增、修改、刪除名稱／HTTP(S) 網址／地區，並優先排序台灣。空網址允許保留平台名稱；不接受 `javascript:`。點擊連結在新分頁開啟。

## 資料儲存方式

IndexedDB 名稱 `yoru-anime`、schema version 1：

| Store      | 內容                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `records`  | 以動畫 ID 為索引的動畫快照、狀態、集數、評分、備註、加入日、最近觀看日、完成日、自訂平台 |
| `settings` | 優先觀看地區（預設台灣）                                                                 |
| `cache`    | 公開 API 回應與最近成功的列表                                                            |

個人資料不傳到 API、不存到 GitHub；API 只收到公開資料查詢（例如搜尋詞）。沒有使用 LocalStorage。公開資料快取有效期六小時，取資料失敗時可回退到過去列表快取；收藏保有動畫快照，因此 API 停機不影響查看、編輯、匯出。

同一瀏覽器的其他分頁可透過 BroadcastChannel 更新畫面。資料依 origin 隔離，**更換網域、瀏覽器、裝置，或清除網站資料不會自動同步**。同一個 `username.github.io` 網域的多個 repository 共享 origin，請避免同時部署多份需分開資料的夜番。此版本沒有 Service Worker；API 離線時個人紀錄仍可用，但完全斷網且尚未載入網站時，不保證可以第一次啟動。

### 備份／還原

1. 首頁「備份資料」或側欄「資料與備份」。
2. 點「下載備份檔」，將所有個人資料匯出為 `yoru-backup-YYYY-MM-DD.json`。
3. 換裝置後選取 JSON，先驗證格式、版本、ID 重複、日期、進度上下限與安全網址。
4. 顯示收藏與狀態數量、總集數、平台數量與設定摘要。
5. 按「確認還原並取代資料」，並接受最後確認後，才以 IndexedDB transaction 原子替換收藏與設定。失敗則回滾，不會半套覆蓋。

還原採**整份取代**，請先匯出舊資料。備份上限 30 MB／20,000 筆，不包含 API 快取或封面圖片本體；API 或圖片主機停機時以快照文字及封面替代畫面呈現。備份是明文 JSON，包含你的備註與平台網址，請自行妥善保管。

## Anime API 研究與選擇

| 方案                 | 評估                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Jikan v4             | MyAnimeList 的非官方唯讀公開 API，無須 Key，提供搜尋、本季／各季、未來動畫、詳細資訊、播出狀態、平台連結。採主要資料來源。 |
| Bangumi v0           | 提供 `name_cn`、原文名稱、簡介、日期與日期區間搜尋；採中文補充與 API 故障時的完整列表／搜尋／詳細頁備援。                  |
| AniList              | GraphQL 公開讀取方便，但沒有保證中文標題欄位，且需考量追蹤服務使用條款；本專案未使用。                                     |
| MyAnimeList 官方 API | 正式整合需要應用程式授權設定。本專案透過 Jikan 做公開唯讀查詢，省去個人金鑰設定。                                          |

2026-09-15 實測 Jikan 與 Bangumi 對帶有 GitHub Pages Origin 的讀取回傳 `Access-Control-Allow-Origin: *`；亦在 Chromium 中直接執行跨來源請求。Bangumi 搜尋使用公開 POST，無 Authorization。服務可能變更 CORS、限流或 schema，因此 API 皆封裝於 `src/api.ts` 的 `AnimeProvider` 介面，Components 不直接 fetch。

官方／第一手參考：

- [Jikan v4 API 文件](https://docs.api.jikan.moe/)
- [Jikan 專案](https://github.com/jikan-me/jikan-rest)
- [Bangumi OpenAPI 規格](https://github.com/bangumi/api/blob/master/open-api/v0.yaml)
- [AniList API 文件](https://docs.anilist.co/guide/introduction)
- [AniList 使用條款](https://docs.anilist.co/guide/terms-of-use)

### API 策略與限制

- Jikan 單一請求佇列至少間隔 450ms、同請求去重、12 秒 timeout，429／5xx 做一次有上限的延遲重試。
- Jikan 失效時，列表優先使用已存在的快取，否則切換 Bangumi，畫面顯示来源提示。繁中與 `Frieren` 搜尋已實測可用。
- 中文名稱以**相同原文名稱**匹配 Bangumi，避免把不同季／重製版錯認成同一部；無精確匹配就顯示原文與「中文名稱待補」，不虛構譯名。英文搜尋先補前五筆的中文，其他可在詳細頁取得；季度以批次資料補充，仍可能缺少冷門作品。
- Bangumi 備援使用 `1,000,000,000 + subject_id` 作命名空間，避免與 MAL ID 衝突。加入收藏亦檢查相同原文與年份，避免常見的來源切換重複收藏；現有收藏的來源 ID 不會偷偷遷移。
- Bangumi 列表用播出日與 calendar 判斷已知未來／播出中；詳細頁使用正片集數及最後一集已公布播出日判斷完結，其餘顯示未定。首播日、季度、結束日期與總集數都允许未知。
- **尚未公布日期的未來作品**由 Jikan upcoming 提供。在 Jikan 停機且沒有快取的情況下，Bangumi 日期區間備援只能列出已公布日期的作品；UI 會標示備援來源。
- 平台資料有授權地區差異，且可能只有平台首頁而非特定播放頁；不推定某個全球連結在台灣有效。手動平台陣列優先於 API；空陣列代表「我已清空」，`null` 代表繼續採用 API。
- 封面與簡介著作權屬原權利人；應遵守 API 與來源網站條款，勿大量爬取。

## 專案結構

```text
src/
  model.ts          統一資料模型、Zod schema、季度、集數與平台規則
  db.ts             IndexedDB 與原子還原
  api.ts            AnimeProvider、Jikan、Bangumi、限流與快取
  store.tsx         個人狀態與資料寫入
  components.tsx    卡片、封面、進度、空狀態
  App.tsx           導覽、路由、Dashboard
  pages.tsx         搜尋、新番、收藏篩選
  detail.tsx        動畫資訊、個人紀錄與觀看平台
  settings.tsx      統計、設定、JSON 備份
  webmcp.ts         可選的只讀收藏查詢工具
  style.css         深色模式與響應式介面
tests/              瀏覽器完整流程與額外 live smoke
.github/workflows/  main 分支自動部署 GitHub Pages
```

架構先分離「公開動畫資料」與「個人資料」，再透過 provider、storage、state、UI 四層連接。API 的回傳格式不會直接滲入個人紀錄或 UI；新來源應轉換成 `Anime`，新儲存 schema 應使用 IndexedDB upgrade 與備份版本遷移。

支援 WebMCP 的瀏覽器會額外註冊只讀 `read_anime_library`，不支援時完全不影響正常 UI；不具備此實驗 API 的瀏覽器未進行原生 WebMCP 整合驗證。

## 驗證結果

見 [VALIDATION.md](./VALIDATION.md)，包含實際 API 測試與本機驗證範圍。

## 新番篩選與分頁

本季與未來新番可依播出形式（TV、劇場版、OVA、ONA、特別篇）及題材篩選。列表顯示總筆數與總頁數，支援首末頁、上一頁／下一頁及直接輸入頁碼；變更條件會回到第一頁。篩選由 API 對完整結果執行，Bangumi 備援使用分類標籤，分類可能與 Jikan 不同。

## 巴哈姆特動畫瘋同步

新增動畫瘋同步頁與 Chrome / Edge Manifest V3 擴充功能。首次匯入讀取已登入的觀看紀錄頁；日常觀看以實際播放片段達到預設 80% 後排入本機佇列，夜番開啟時自動接收。配對使用作品 ID、集數範圍與偏移，首次由使用者確認，不靠中文名稱硬比對。

安裝、權限、使用方法與限制見 [extension/README.md](./extension/README.md)，實際網站調查見 [extension/RESEARCH.md](./extension/RESEARCH.md)。npm run build 會一起產生擴充功能 ZIP 並部署至 Pages。
