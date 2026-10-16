/**
 * home-sky.js — سماء حيّة في ترويسة الرئيسية + وضع الليل (عرض فقط).
 * - مراحل اليوم من مواقيت الصلاة الفعلية (aladhan، القاهرة) مع كاش يومي،
 *   وقيم افتراضية تقريبية لو تعذّر الاتصال.
 * - شمس/قمر يتحركان على قوس حسب الوقت، نجوم بالليل، سحب هادئة.
 * - زر تبديل: تلقائي ← فاتح ← داكن (يُحفظ محليًا، try/catch).
 * لا كتابة على Firestore ولا اعتماد على باقي الملفات.
 */
(function () {
  "use strict";
  var KEY = "hs:theme"; // auto | light | dark
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var DEFAULTS = { Fajr: "04:55", Dhuhr: "11:55", Asr: "15:20", Maghrib: "17:50", Isha: "19:15" };
  var times = DEFAULTS;

  function toMin(s) { var p = String(s || "").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function dayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

  function loadTimes() {
    try {
      var c = JSON.parse(localStorage.getItem("hs:times") || "null");
      if (c && c.day === dayKey() && c.t) times = c.t;
    } catch (e) {}
    try {
      var c2 = JSON.parse(localStorage.getItem("hs:times") || "null");
      if (c2 && c2.day === dayKey()) return;
      var ctl = new AbortController();
      setTimeout(function () { ctl.abort(); }, 5000);
      fetch("https://api.aladhan.com/v1/timingsByCity?city=Cairo&country=Egypt&method=5", { signal: ctl.signal })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var t = j && j.data && j.data.timings; if (!t) return;
          var o = {}; ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"].forEach(function (k) { o[k] = String(t[k]).slice(0, 5); });
          times = o;
          try { localStorage.setItem("hs:times", JSON.stringify({ day: dayKey(), t: o })); } catch (e) {}
          update();
        }).catch(function () {});
    } catch (e) {}
  }

  /** يرجع { phase, sun:0..1|null, moon:0..1|null } */
  function state() {
    var n = nowMin(), F = toMin(times.Fajr), D = toMin(times.Dhuhr), A = toMin(times.Asr), M = toMin(times.Maghrib), I = toMin(times.Isha);
    var sunrise = F + 80;
    var phase;
    if (n >= F && n < sunrise) phase = "dawn";
    else if (n >= sunrise && n < A) phase = "day";
    else if (n >= A && n < M - 25) phase = "afternoon";
    else if (n >= M - 25 && n < I) phase = "sunset";
    else phase = "night";
    var sun = (n >= sunrise && n <= M) ? (n - sunrise) / (M - sunrise) : null;
    var moon = null;
    if (n > M) moon = (n - M) / (24 * 60 - M + F);
    else if (n < F) moon = (n + 24 * 60 - M) / (24 * 60 - M + F);
    return { phase: phase, sun: sun, moon: moon };
  }

  var SKYLINE = '<div class="hs-skyline"><svg class="hs-L hs-far" viewBox="0 0 800 140" preserveAspectRatio="xMidYMax slice"><g fill="var(--sk1)"><g transform="translate(110 0)"><path d="M60 140L170 52L280 140Z"/><path d="M215 140L315 70L415 140Z"/><path d="M385 140L440 96L495 140Z"/></g><g transform="translate(-120 0)"><rect x="560" y="100" width="22" height="40"/><rect x="590" y="88" width="18" height="52"/><rect x="616" y="104" width="26" height="36"/><rect x="650" y="94" width="16" height="46"/><rect x="676" y="108" width="30" height="32"/><rect x="714" y="92" width="20" height="48"/><rect x="742" y="104" width="60" height="36"/></g></g></svg><svg class="hs-L hs-mid" viewBox="0 0 800 140" preserveAspectRatio="xMidYMax slice"><g fill="var(--sk2)"><g transform="translate(-150 0)"><rect x="540" y="108" width="120" height="32"/><path d="M558 108A42 40 0 0 1 642 108Z"/><rect x="599" y="62" width="2" height="14"/><circle cx="600" cy="60" r="3.5"/><rect x="526" y="72" width="9" height="68"/><path d="M524 72L530.5 50L537 72Z"/><rect x="665" y="72" width="9" height="68"/><path d="M663 72L669.5 50L676 72Z"/><path d="M706 140L711 74L721 74L726 140Z"/><ellipse cx="716" cy="66" rx="15" ry="10"/><rect x="715" y="38" width="2" height="22"/></g><g transform="translate(20 0)"><rect x="90" y="106" width="34" height="34"/><path d="M96 106A11 12 0 0 1 118 106Z"/><rect x="136" y="96" width="8" height="44"/><path d="M134 96L140 78L146 96Z"/><rect x="160" y="112" width="46" height="28"/><rect x="214" y="100" width="22" height="40"/><rect x="246" y="116" width="40" height="24"/></g></g><g class="hs-win" fill="#FFD66B"><g transform="translate(-150 0)"><rect x="552" y="118" width="5" height="7"/><rect x="568" y="118" width="5" height="7"/><rect x="584" y="118" width="5" height="7"/><rect x="612" y="118" width="5" height="7"/><rect x="628" y="118" width="5" height="7"/><rect x="644" y="118" width="5" height="7"/><rect x="713" y="96" width="3" height="6"/></g><g transform="translate(20 0)"><rect x="98" y="116" width="4" height="6"/><rect x="110" y="116" width="4" height="6"/><rect x="166" y="120" width="4" height="6"/><rect x="180" y="120" width="4" height="6"/><rect x="194" y="120" width="4" height="6"/><rect x="219" y="110" width="4" height="6"/><rect x="226" y="124" width="4" height="6"/></g></g></svg><svg class="hs-L hs-near" viewBox="0 0 800 140" preserveAspectRatio="xMidYMax slice"><g class="hs-nile"><path class="hs-w1" d="M-400 130q50-8 100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0V140H-400Z"/></g><g class="hs-boat"><path d="M300 128L300 100L324 126Z" fill="#fff" opacity=".92"/><path d="M292 128H332L326 134H298Z" fill="var(--sk3)"/></g><path d="M0 140V128Q200 121 400 128T800 126V140Z" fill="var(--sk3)"/><g fill="none" stroke="var(--sk3)" stroke-linecap="round"><path stroke-width="5" d="M40 140Q47 110 42 84"/><path stroke-width="4" d="M42 84Q22 66 4 80M42 84Q30 62 14 62M42 84Q42 58 44 52M42 84Q60 62 76 64M42 84Q64 70 80 86"/><path stroke-width="5" d="M762 140Q755 112 760 88"/><path stroke-width="4" d="M760 88Q740 70 722 84M760 88Q748 66 732 66M760 88Q760 62 762 56M760 88Q778 66 794 68M760 88Q782 74 798 90"/></g></svg></div>';
  var head, sunEl, moonEl, btn;

  function arc(el, f) {
    if (f === null || f === undefined) { el.style.opacity = "0"; return; }
    f = Math.max(0, Math.min(1, f));
    el.style.opacity = "1";
    el.style.left = (8 + 84 * f).toFixed(2) + "%";
    el.style.top = (78 - 62 * Math.sin(Math.PI * f)).toFixed(2) + "%";
  }

  function effectiveTheme(phase) {
    var pref = "auto"; try { pref = localStorage.getItem(KEY) || "auto"; } catch (e) {}
    if (pref === "dark" || pref === "light") return pref;
    return phase === "night" ? "dark" : "light";
  }

  function update() {
    if (!head) return;
    var s = state();
    head.setAttribute("data-phase", s.phase);
    arc(sunEl, s.sun); arc(moonEl, s.moon);
    var th = effectiveTheme(s.phase);
    document.documentElement.setAttribute("data-theme", th);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", th === "dark" ? "#0E1118" : "#FF4654");
    if (btn) {
      var pref = "auto"; try { pref = localStorage.getItem(KEY) || "auto"; } catch (e) {}
      btn.setAttribute("data-mode", pref);
      btn.setAttribute("aria-label", pref === "auto" ? "المظهر: تلقائي" : pref === "dark" ? "المظهر: داكن" : "المظهر: فاتح");
      btn.title = btn.getAttribute("aria-label");
    }
  }

  /* برعي: لا نحرّك النسخ التي خرجت من الشاشة (الصفحة فيها عدة نسخ تتحرك باستمرار) */
  function watchMascots() {
    if (!("IntersectionObserver" in window) || !window.MutationObserver) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.target.classList.toggle("hs-mute", !e.isIntersecting); });
    }, { rootMargin: "60px" });
    var seen = typeof WeakSet === "function" ? new WeakSet() : null, tm = 0;
    function scan() {
      document.querySelectorAll(".mascot").forEach(function (m) {
        if (seen) { if (seen.has(m)) return; seen.add(m); }
        io.observe(m);
      });
    }
    scan();
    new MutationObserver(function () { clearTimeout(tm); tm = setTimeout(scan, 150); }).observe(document.body, { childList: true, subtree: true });
  }

  function build() {
    head = document.querySelector(".home-welcome");
    if (!head || head.querySelector(".hs-sky")) return;
    head.classList.add("hs-on");
    var sky = document.createElement("div");
    sky.className = "hs-sky"; sky.setAttribute("aria-hidden", "true");
    var stars = "";
    for (var i = 0; i < 26; i++) {
      stars += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;top:' + (Math.random() * 85).toFixed(1) + '%;--s:' + (1 + Math.random() * 2).toFixed(1) + 'px;--d:' + (2 + Math.random() * 4).toFixed(1) + 's;--w:' + (Math.random() * 4).toFixed(1) + 's"></i>';
    }
    sky.innerHTML =
      '<div class="hs-stars">' + stars + '</div>' +
      '<div class="hs-sun"></div><div class="hs-moon"></div>' +
      '<div class="hs-cloud hs-c1"></div><div class="hs-cloud hs-c2"></div><div class="hs-cloud hs-c3"></div>' +
      '<div class="hs-horizon"></div>' + SKYLINE;
    head.insertBefore(sky, head.firstChild);
    sunEl = sky.querySelector(".hs-sun"); moonEl = sky.querySelector(".hs-moon");

    btn = document.createElement("button");
    btn.type = "button"; btn.className = "hs-theme-btn";
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<g class="hs-i-light"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g>' +
      '<path class="hs-i-dark" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' +
      '<g class="hs-i-auto"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></g></svg>';
    btn.addEventListener("click", function () {
      var pref = "auto"; try { pref = localStorage.getItem(KEY) || "auto"; } catch (e) {}
      var next = pref === "auto" ? "dark" : pref === "dark" ? "light" : "auto";
      try { localStorage.setItem(KEY, next); } catch (e) {}
      document.documentElement.classList.add("hs-switching");
      update();
      setTimeout(function () { document.documentElement.classList.remove("hs-switching"); }, 500);
    });
    head.appendChild(btn);
    head.classList.add("hs-init"); // أول رسم بلا انتقال: الألوان النهائية فورًا
    update();
    requestAnimationFrame(function () { requestAnimationFrame(function () { head.classList.remove("hs-init"); }); });
    setInterval(update, 60000);
    watchMascots();
    // إيقاف حركات السماء عندما لا تُرى (خارج الشاشة أو تبويب مخفي) لتوفير المعالج والبطارية
    var onScreen = true, tabOn = !document.hidden;
    function idle() { head.classList.toggle("hs-idle", !(onScreen && tabOn)); }
    try {
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; idle(); }, { threshold: 0 }).observe(head);
      }
      document.addEventListener("visibilitychange", function () { tabOn = !document.hidden; idle(); });
    } catch (e) {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { build(); loadTimes(); });
  else { build(); loadTimes(); }
})();
