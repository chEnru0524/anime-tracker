# 動畫瘋同步技術調查（2026-09-16）

## 實際確認的網站行為

- 公開播放頁 [animeVideo.php?sn=36632](https://ani.gamer.com.tw/animeVideo.php?sn=36632) 可見 `.anime_name h1`、`.season .playing a[data-ani-video-sn]`、`#ani_video video` / `#ani_video_html5_api`。`sn` 是单集 ID，不能當作品 ID。
- 作品訂閱控制項的 `toggleGather(acgSn, animeSn, ...)` 包含作品 ID。公開播放器實際使用的 [video.php](https://api.gamer.com.tw/anime/v1/video.php?videoSn=36632) 回應也能交叉核對 `data.anime.animeSn` 與單集資訊。本功能使用 DOM 明確欄位，不依賴此非官方介面。
- 研究 [官方頁面載入的播放器腳本](https://i2.bahamut.com.tw/build/js/anime_player.js?v=1789355980)：Video.js HTML5 播放器；廣告有 `vjs-ad-playing`、`vjs-anigamer-ad-playing` 狀態。正片的 `breakPoint` 外掛每 5 秒把 `videoSn`、`breakPoint`、`watchTime` 寫入 `ANIME_BP`，廣告開始會停止此更新。
- 原站播放器以 `/ajax/elapse.php` 回報進度；距結尾少於約 120 秒時回報 `time=-1`。這是原站程式行為，不是公開 API 契約。本擴充功能不呼叫該寫入端點，不修改巴哈觀看紀錄。
- 使用者自行登入後，實際檢查觀看紀錄頁成功。頁面提示保存期限目前為一年，仍屬測試性服務，可能變動。
- 紀錄頁原始腳本使用 `GET https://api.gamer.com.tw/anime/v3/history.php?page=N`、`credentials: include`，以 `data.totalPage` 控制「載入更多」。可見 `.history-wrapper .anime-card`、`[data-anime-sn]`、`.history-anime-title`、`.user-lastwatch`、`.progress-bar .progress`，以及 `.user-watchTime-list` 中的單集 URL、顯示日期。
- 腳本顯示 `history.duration` 以分鐘換算比例，`breakPoint=-1` 顯示「觀看結束」。本功能讀取網站已計算的 DOM 百分比，避免猜單位。
- 工具直接開啟 api.gamer.com.tw 的登入紀錄 endpoint 被瀏覽器阻擋，未繞過。對請求欄位的確認依據是網站實際載入的腳本與其渲染結果，不宣稱已擷取完整登入 Network trace。公開 metadata request 已以無憑證 HTTP 讀取交叉檢查；未保存任何使用者請求標頭或登入資訊。

## 採用方案

1. Chrome / Edge MV3 isolated content script，限定播放／紀錄頁。
2. 首次匯入只在使用者點擴充功能按鈕後讀取 DOM，必要時點原站「載入更多」。原站自行執行 Network Request；擴充功能不接觸其憑證。只匯入每部最近觀看快照；完整舊單集缺少完播證據，不擅自猜測。
3. 日後監看正片 `timeupdate`，排除廣告、seeking、paused、未定 duration；比對 `ANIME_BP` 的單集與位置。累計連續且合理速度的區間，重疊去重，達到門檻才送事件。播放器更換或單集改變會重設偵測，已保存同單集片段可恢復。
4. Service worker 只保存經 schema 驗證的作品 ID、單集 ID、集數、名稱、播放比例與時間。queue 在 `chrome.storage.local`，非雲端 sync。儲存區限 trusted contexts；content script 透過窄化訊息 API 存取。
5. Tracker 以 `externally_connectable` 和 native messaging 輪詢；worker 檢查實際 sender URL 的 exact origin 與 pathname，因為 GitHub Pages 多專案共用 origin。禁止其他 extension 作 external sender。不新增後端。
6. IndexedDB v2 僅新增 `bahamut` store；個人資料原結構保留。保存 inbox / records 的 transaction commit 後才 ACK；重送只去重不加一。

## 配對

現有專案來源實際為 Jikan / MyAnimeList 加 Bangumi，不是 AniList；此次不換 Provider。配對儲存內部 `anime.id`（包含原有 Bangumi namespace）、動畫瘋 `animeSn` 與來源集數範圍／偏移，不靠中文名稱等值比較。第一次由使用者核对日文名、年份、季度、總集數與來源單集後確認，之後使用 ID 自動同步。無把握時保持未配對。這比從名稱推斷續作安全，也可配合未來 provider adapter 延續內部 ID。

## 瀏覽器限制與已知邊界

- 不能跨來源直接共用 IndexedDB；也不能在網站關閉時任意寫入網站 DB。使用持久佇列，下次網站開啟補送。
- 同一裝置不同瀏覽器／profile 的資料不互通，手機一般瀏覽器未支援這個 desktop extension。
- 網站頁面與 selectors 可變動。無法識別時停止，不繞过付費、登入、年齡、DRM 或地區限制。
- 實際影片解碼、所有廣告供應商與每種帳號方案的完整長時間播放，無法由合成媒體測試完全涵蓋。已檢查真實登入紀錄 DOM 與公開播放器；擴充功能端到端使用真正 Chromium extension、完全攔截網路的合成頁面與媒體狀態測試。未在使用者正常 Chrome／Edge profile 自行安裝或改寫真實收藏。
- 顯示日期若只有分鐘／相對時間，解析精度也是分鐘；無法解析保持 null。首次匯入與即時偵測的證據種類分開保存。

## 主要平台文件

- [Content scripts / isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Native messaging between web pages and extensions](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [externally_connectable](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable)
- [Extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

研究用的原始 HTML、使用者觀看紀錄與 Session 不納入 Repository；測試全部使用合成資料。
