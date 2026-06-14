const DEFAULTS = { markupPct: 0, autoShow: true, chineseOnly: false };
const $ = (id) => document.getElementById(id);
let FX = null, CFG = { ...DEFAULTS };

function mult() { return 1 + (Number(CFG.markupPct) || 0) / 100; }
function n2(x) { return (Math.round(x * 100) / 100).toLocaleString("en-US"); }

// 桁が大きいときは 万/億/兆 でコンパクト表示（小さい額はそのまま桁区切り）
const COMPACT_FROM = 1e6;
const BIG_LABELS = [[1e12, "兆"], [1e8, "億"], [1e4, "万"]];
function compactNum(n) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= COMPACT_FROM) {
    for (const [v, label] of BIG_LABELS) {
      if (abs >= v) {
        const x = n / v, ax = Math.abs(x);
        const dec = ax >= 1000 ? 0 : ax >= 100 ? 1 : 2;
        return x.toLocaleString("en-US", { maximumFractionDigits: dec, useGrouping: false }) + label;
      }
    }
  }
  return (Math.round(n * 100) / 100).toLocaleString("ja-JP");
}
function yen(x) { return compactNum(x) + " 円"; }
function exactYen(x) { return Math.round(x).toLocaleString("ja-JP") + " 円"; }

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
    $("outCny").textContent = "🇯🇵 0 円"; $("outCny").title = "";
    $("outUsd").textContent = "🇯🇵 0 円"; $("outUsd").title = "";
    return;
  }
  const cny = v * FX.cnyJpy * mult(), usd = v * FX.usdJpy * mult();
  $("outCny").textContent = "🇯🇵 " + yen(cny); $("outCny").title = exactYen(cny);
  $("outUsd").textContent = "🇯🇵 " + yen(usd); $("outUsd").title = exactYen(usd);
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
