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

  // ── 数値パース：漢数字・全角・漢字単位の様々な表記を許容して数値化 ──
  // 大単位（前の塊にかかる）／小単位（その場の数にかかる）を分けて二段で合成する。
  const BIG_UNIT = { "兆": 1e12, "億": 1e8, "亿": 1e8, "万": 1e4, "萬": 1e4 };
  const SMALL_UNIT = { "千": 1e3, "仟": 1e3, "阡": 1e3, "百": 1e2, "佰": 1e2, "十": 10, "拾": 10 };
  const ALL_UNIT_CHARS = "兆億亿万萬千仟阡百佰十拾";
  // 漢数字・全角→半角。単位漢字（万億千…）は変換しない。
  const KANJI_DIGIT = {
    "〇": "0", "零": "0", "一": "1", "壱": "1", "壹": "1", "二": "2", "弐": "2", "貳": "2",
    "两": "2", "兩": "2", "三": "3", "参": "3", "參": "3", "四": "4", "肆": "4", "五": "5",
    "伍": "5", "六": "6", "陸": "6", "七": "7", "八": "8", "捌": "8", "九": "9", "玖": "9",
  };
  function normalize(s) {
    let out = "";
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      if (code >= 0xff10 && code <= 0xff19) out += String.fromCharCode(code - 0xfee0); // 全角0-9
      else if (ch === "．") out += ".";
      else if (ch === "，") out += ",";
      else if (ch === "点" || ch === "點") out += ".";           // 中国語の小数点
      else if (KANJI_DIGIT[ch] != null) out += KANJI_DIGIT[ch];
      else out += ch;
    }
    return out;
  }
  function parseAmount(text) {
    if (!text) return null;
    let t = text.trim();
    if (t.length > 40) return null;
    t = t.split(/[~〜～\-–—]/)[0];                                // 範囲は先頭だけ
    t = normalize(t);
    // 通貨記号・通貨名・桁区切り・空白を除去（単位漢字は残す）
    t = t.replace(/[¥￥$＄]|元|块|塊|圆|圓|人民币|人民幣|RMB|rmb|CNY|cny|USD|usd|US|円|,|，|\s/g, "");
    if (!t) return null;
    // 単位漢字なし → そのまま数値化
    if (/^[\d.]+$/.test(t)) {
      const n = parseFloat(t);
      return isFinite(n) && n > 0 ? n : null;
    }
    if (![...ALL_UNIT_CHARS].some((u) => t.includes(u))) return null;
    // 二段合成：current=今の数, section=万未満の小計, total=確定分
    let total = 0, section = 0, buf = "", current = 0;
    for (const ch of t) {
      if (/[\d.]/.test(ch)) { buf += ch; continue; }
      if (buf) { current = parseFloat(buf); buf = ""; }
      if (SMALL_UNIT[ch] != null) {
        section += (current || 1) * SMALL_UNIT[ch]; // 「百」単独 = 100
        current = 0;
      } else if (BIG_UNIT[ch] != null) {
        const base = section + current || 1;        // 「万」単独 = 1万
        total += base * BIG_UNIT[ch];
        section = 0; current = 0;
      }
      // それ以外の文字は無視
    }
    if (buf) current = parseFloat(buf);
    total += section + current;
    return isFinite(total) && total > 0 ? total : null;
  }

  // ── 表示フォーマット：桁が大きいときは 万/億/兆 でコンパクト表示 ──
  const COMPACT_FROM = 1e6; // これ以上は漢字単位に切り替え（小さい額はそのまま桁区切り）
  const BIG_LABELS = [[1e12, "兆"], [1e8, "億"], [1e4, "万"]];
  function compactNum(n) {
    if (!isFinite(n)) return "0";
    const abs = Math.abs(n);
    if (abs >= COMPACT_FROM) {
      for (const [v, label] of BIG_LABELS) {
        if (abs >= v) {
          const x = n / v, ax = Math.abs(x);
          const dec = ax >= 1000 ? 0 : ax >= 100 ? 1 : 2; // 有効数字 ≒4桁
          const head = x.toLocaleString("en-US", { maximumFractionDigits: dec });
          return head + label;
        }
      }
    }
    return (Math.round(n * 100) / 100).toLocaleString("ja-JP");
  }
  function fmtJPY(n) { return compactNum(n) + " 円"; }
  function exactJPY(n) { return Math.round(n).toLocaleString("ja-JP") + " 円"; }
  function fmtSrc(n) { return compactNum(n); }

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
    return '<div class="cnyjpy-row" data-jpy="' + Math.round(jpy) + '" title="' + exactJPY(jpy) + '">' +
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
    if (FX.source === "fallback") {
      html = '<div class="cnyjpy-warn">⚠ 概算（レート取得失敗・保険値で換算）</div>' + html;
    }
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
