const get = (id: string) => document.getElementById(id)!;
const input = (id: string) => get(id) as HTMLInputElement;
input("extension-id").value = chrome.runtime.id;
async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: "STATUS" });
  input("enabled").checked = s.enabled;
  input("threshold").value = String(s.threshold);
  get("status").textContent =
    `待接收 ${s.count} 筆 · ${s.enabled ? "已啟用" : "已暫停"}`;
}
void refresh().catch(
  () => (get("status").textContent = "無法讀取擴充功能，請重新載入"),
);
void chrome.tabs
  .query({ active: true, currentWindow: true })
  .then(async (tabs) => {
    if (tabs[0]?.id && tabs[0]?.url?.startsWith("https://ani.gamer.com.tw/")) {
      const r = await chrome.tabs.sendMessage(tabs[0].id, {
        type: "PAGE_STATUS",
      });
      if (r?.notice) get("result").textContent = r.notice;
    }
  })
  .catch(() => {});
get("save").onclick = async () => {
  const threshold = Number(input("threshold").value);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
    get("result").textContent = "門檻必須為 1–100 的整數";
    return;
  }
  const r = await chrome.runtime.sendMessage({
    type: "CONFIG",
    value: { enabled: input("enabled").checked, threshold },
  });
  get("result").textContent = r.ok ? "設定已儲存；10 秒內套用" : r.error;
  await refresh();
};
get("open").onclick = () =>
  void chrome.tabs.create({
    url: "https://chenru0524.github.io/anime-tracker/#/sync",
  });
get("import").onclick = async () => {
  const button = get("import") as HTMLButtonElement;
  button.disabled = true;
  get("result").textContent = "正在讀取觀看紀錄，請保持此視窗開啟…";
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (
      !tab?.id ||
      !tab.url?.startsWith("https://ani.gamer.com.tw/viewList.php")
    )
      throw new Error("請先開啟已登入的動畫瘋觀看紀錄頁");
    const r = await chrome.tabs.sendMessage(tab.id, { type: "IMPORT_HISTORY" });
    if (!r.ok) throw new Error(r.error);
    get("result").textContent =
      `已讀取 ${r.count} 筆，請開啟夜番預覽並確認匯入。`;
    await refresh();
  } catch (e) {
    get("result").textContent =
      e instanceof Error ? e.message : "讀取失敗，請重新整理動畫瘋後重試";
  } finally {
    button.disabled = false;
  }
};
