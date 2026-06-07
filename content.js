// 選択した数字を CNY / USD とみなして、それぞれ JPY 換算をまとめて表示する。
(function () {
  "use strict";

  const DEFAULTS = { markupPct: 0, autoShow: true, chineseOnly: false };
  let FX = null;            // {cnyJpy, usdJpy, updatedUnix, source}
  let CFG = { ...DEFAULTS };
  let bubble = null;
  let hideTimer = null;

  const CN_HOSTS = ["1688.com", "taobao.com", "tmall.com", "jd.com", "alibaba.com",
    "aliexpress.com", "pinduoduo.com", "yangkeduo.com", "xiaohongshu.com", "weidian.com"];
  function isChineseSite() {
    return CN_HOSTS.some((d) => location.hostname.includes(d));
  }

  // 漢字単位（万・億・千・百…）混じり / 桁区切り / 通貨記号 を許容して数値化
  const UNIT = { "億": 1e8, "亿": 1e8, "万": 1e4, "萬": 1e4, "千": 1e3, "仟": 1e3, "百": 1e2, "佰": 1e2, "十": 10, "拾": 10 };
  function parseAmount(text) {
    if (!text) return null;
    let t = text.trim();
    if (t.length > 40) return null;
    t = t.split(/[~〜～\-–—]/)[0]; // 範囲は先頭
    // 通貨記号・通貨名・桁区切り・空白を除去（単位漢字は残す）
    t = t.replace(/[¥￥$＄]|元|块|塊|人民币|人民幣|RMB|rmb|CNY|cny|USD|usd|US|円|圆|\$|,|，|\s/g, "");
    if (!t) return null;
    // 単位漢字なし → そのまま
    if (/^[\d.]+$/.test(t)) {
      const n = parseFloat(t);
      return isFinite(n) && n > 0 ? n : null;
    }
    // 単位漢字あり → 合成
    if (![..."億亿万萬千仟百佰十拾"].some((u) => t.includes(u))) return null;
    let total = 0, buf = "";
    for (const ch of t) {
      if (/[\d.]/.test(ch)) { buf += ch; }
      else if (UNIT[ch]) { total += (buf ? parseFloat(buf) : 1) * UNIT[ch]; buf = ""; }
      // それ以外の文字は無視
    }
    if (buf) total += parseFloat(buf);
    return isFinite(total) && total > 0 ? total : null;
  }

  function fmtJPY(n) { return Math.round(n).toLocaleString("ja-JP") + " 円"; }
  function fmtSrc(n) { return (Math.round(n * 100) / 100).toLocaleString("en-US"); }

  function ensureBubble() {
    if (bubble) return bubble;
    bubble = document.createElement("div");
    bubble.className = "cnyjpy-bubble";
    bubble.addEventListener("mousedown", (e) => e.stopPropagation());
    document.documentElement.appendChild(bubble);
    return bubble;
  }
  function hideBubble() { if (bubble) bubble.classList.remove("is-show"); }

  function rowHTML(flag, label, srcVal, jpy) {
    return '<div class="cnyjpy-row" data-jpy="' + Math.round(jpy) + '">' +
      '<span class="cnyjpy-src"><span class="cnyjpy-flag">' + flag + '</span>' + fmtSrc(srcVal) + ' ' + label + '</span>' +
      '<span class="cnyjpy-arrow">→</span>' +
      '<span class="cnyjpy-dst"><span class="cnyjpy-flag">🇯🇵</span>' + fmtJPY(jpy) + '</span></div>';
  }

  function showBubble(num, rect) {
    if (!FX) return;
    const mult = 1 + (Number(CFG.markupPct) || 0) / 100;
    const b = ensureBubble();
    let html = "";
    html += rowHTML("🇨🇳", "元", num, num * FX.cnyJpy * mult);
    html += rowHTML("🇺🇸", "USD", num, num * FX.usdJpy * mult);
    if (CFG.markupPct) html += '<div class="cnyjpy-foot">上乗せ ' + CFG.markupPct + '%　・　行をクリックでコピー</div>';
    else html += '<div class="cnyjpy-foot">行をクリックでコピー</div>';
    b.innerHTML = html;
    const top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;
    b.style.top = top + "px";
    b.style.left = left + "px";
    b.classList.add("is-show");
    requestAnimationFrame(() => {
      const maxLeft = window.scrollX + document.documentElement.clientWidth - b.offsetWidth - 10;
      if (left > maxLeft) b.style.left = Math.max(window.scrollX + 8, maxLeft) + "px";
    });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, 7000);
  }

  function onSelect() {
    if (!CFG.autoShow) return;
    if (CFG.chineseOnly && !isChineseSite()) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideBubble(); return; }
    const num = parseAmount(sel.toString());
    if (num == null) { hideBubble(); return; }
    let rect;
    try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) { return; }
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    showBubble(num, rect);
  }

  document.addEventListener("mouseup", (e) => {
    if (bubble && (e.target === bubble || bubble.contains(e.target))) return;
    setTimeout(onSelect, 0);
  });
  document.addEventListener("mousedown", () => { hideBubble(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideBubble(); });
  document.addEventListener("scroll", hideBubble, true);

  // 行クリックでその円の値をコピー
  document.addEventListener("click", (e) => {
    if (!bubble || !bubble.contains(e.target)) return;
    const row = e.target.closest(".cnyjpy-row");
    if (!row) return;
    const v = row.dataset.jpy;
    if (v && navigator.clipboard) {
      navigator.clipboard.writeText(v).then(() => {
        row.classList.add("copied");
        setTimeout(() => row.classList.remove("copied"), 900);
      }).catch(() => {});
    }
  });

  function loadAll() {
    chrome.storage.local.get(["fx", "cfg"], (res) => {
      FX = res.fx || null;
      CFG = { ...DEFAULTS, ...(res.cfg || {}) };
    });
  }
  loadAll();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.fx) FX = changes.fx.newValue;
    if (changes.cfg) CFG = { ...DEFAULTS, ...(changes.cfg.newValue || {}) };
  });
})();
