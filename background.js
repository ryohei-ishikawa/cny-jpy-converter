// 為替レート（USD基準）を取得し、CNY→JPY / USD→JPY を算出してキャッシュする。
const PRIMARY = "https://open.er-api.com/v6/latest/USD";
const FALLBACK_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY,CNY";
const FALLBACK_RATE = { cnyJpy: 21.0, usdJpy: 150.0 }; // 取得失敗時の保険値

async function fetchRates() {
  // 1) open.er-api.com（USD基準）
  try {
    const r = await fetch(PRIMARY, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      const jpy = d && d.rates && d.rates.JPY;
      const cny = d && d.rates && d.rates.CNY;
      if (jpy && cny) {
        return {
          usdJpy: jpy,
          cnyJpy: jpy / cny,
          // 無料枠は1日1回更新。レートが公表された時刻を「最終更新」として表示する
          updatedUnix: (d.time_last_update_unix || Math.floor(Date.now() / 1000)) * 1000,
          source: "open.er-api.com",
        };
      }
    }
  } catch (e) { /* fall through */ }
  // 2) frankfurter（ECB）
  try {
    const r = await fetch(FALLBACK_URL, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      const jpy = d && d.rates && d.rates.JPY;
      const cny = d && d.rates && d.rates.CNY;
      if (jpy && cny) {
        return { usdJpy: jpy, cnyJpy: jpy / cny, updatedUnix: Date.parse(d.date) || Date.now(), source: "frankfurter(ECB)" };
      }
    }
  } catch (e) { /* fall through */ }
  return null;
}

async function refreshRates() {
  const got = await fetchRates();
  if (got) { await chrome.storage.local.set({ fx: got }); return got; }
  const cur = (await chrome.storage.local.get("fx")).fx;
  if (cur) return cur;
  const fb = { cnyJpy: FALLBACK_RATE.cnyJpy, usdJpy: FALLBACK_RATE.usdJpy, updatedUnix: 0, source: "fallback" };
  await chrome.storage.local.set({ fx: fb });
  return fb;
}

chrome.runtime.onInstalled.addListener(() => {
  refreshRates();
  chrome.alarms.create("fx-refresh", { periodInMinutes: 360 });
});
chrome.runtime.onStartup.addListener(() => { refreshRates(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "fx-refresh") refreshRates(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "REFRESH_FX") {
    refreshRates().then((fx) => sendResponse({ ok: true, fx }));
    return true;
  }
  if (msg && msg.type === "GET_FX") {
    chrome.storage.local.get("fx").then(({ fx }) => sendResponse({ ok: true, fx: fx || null }));
    return true;
  }
});
