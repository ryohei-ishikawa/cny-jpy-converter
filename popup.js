const DEFAULTS = { markupPct: 0, autoShow: true, chineseOnly: false };
const $ = (id) => document.getElementById(id);
let FX = null, CFG = { ...DEFAULTS };

function mult() { return 1 + (Number(CFG.markupPct) || 0) / 100; }
function n2(x) { return (Math.round(x * 100) / 100).toLocaleString("en-US"); }
function yen(x) { return Math.round(x).toLocaleString("ja-JP") + " 円"; }

function fmtUpdated(unix) {
  if (!unix) return "レート未取得";
  const d = new Date(unix);
  const dd = new Intl.DateTimeFormat("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo",
  }).format(d);
  return "最終更新 " + dd;
}

function render() {
  if (FX) {
    $("cnyRate").textContent = n2(FX.cnyJpy);
    $("usdRate").textContent = n2(FX.usdJpy);
    $("updated").textContent = fmtUpdated(FX.updatedUnix) + (FX.source ? "（" + FX.source + "）" : "");
  } else {
    $("updated").textContent = "レート未取得";
  }
  calc();
}
function calc() {
  const v = parseFloat($("calcIn").value);
  if (!isFinite(v) || v <= 0 || !FX) {
    $("outCny").textContent = "🇯🇵 0 円";
    $("outUsd").textContent = "🇯🇵 0 円";
    return;
  }
  $("outCny").textContent = "🇯🇵 " + yen(v * FX.cnyJpy * mult());
  $("outUsd").textContent = "🇯🇵 " + yen(v * FX.usdJpy * mult());
}
function saveCfg() {
  CFG = {
    markupPct: Number($("markup").value) || 0,
    autoShow: $("autoShow").checked,
    chineseOnly: $("chineseOnly").checked,
  };
  chrome.storage.local.set({ cfg: CFG });
  calc();
}

function init() {
  chrome.storage.local.get(["fx", "cfg"], (res) => {
    FX = res.fx || null;
    CFG = { ...DEFAULTS, ...(res.cfg || {}) };
    $("markup").value = CFG.markupPct || 0;
    $("autoShow").checked = CFG.autoShow;
    $("chineseOnly").checked = CFG.chineseOnly;
    render();
    if (!FX) chrome.runtime.sendMessage({ type: "REFRESH_FX" }, (r) => { if (r && r.fx) { FX = r.fx; render(); } });
  });
  $("refreshBtn").addEventListener("click", () => {
    $("updated").textContent = "更新中…";
    chrome.runtime.sendMessage({ type: "REFRESH_FX" }, (r) => { if (r && r.fx) { FX = r.fx; render(); } });
  });
  $("calcIn").addEventListener("input", calc);
  $("markup").addEventListener("input", saveCfg);
  ["autoShow", "chineseOnly"].forEach((id) => $(id).addEventListener("change", saveCfg));
}
document.addEventListener("DOMContentLoaded", init);
