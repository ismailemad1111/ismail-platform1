/** home-fx.js — لمسات حيّة للرئيسية (عرض فقط): عدّادات، إضاءة تتبع المؤشر، عيون برعي، بارالاكس السماء. */
(function () {
  "use strict";
  var reduce = false, fine = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; fine = matchMedia("(hover:hover) and (pointer:fine)").matches; } catch (e) {}

  /* ---------- 1) عدّادات الأرقام ---------- */
  function countUp(el) {
    if (!el || el.dataset.hfx === el.textContent) return;
    var m = /^(\D*?)(\d+(?:\.\d+)?)(\D*)$/.exec((el.textContent || "").trim());
    if (!m) { el.dataset.hfx = el.textContent; return; }
    var pre = m[1], to = parseFloat(m[2]), post = m[3], dec = (m[2].split(".")[1] || "").length, final = el.textContent;
    el.dataset.hfx = final;
    if (reduce || to === 0) return;
    var start = 0, dur = 1100;
    var step = function (ts) {
      if (!start) start = ts;
      var k = Math.min(1, (ts - start) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = pre + (to * e).toFixed(dec) + post;
      el.dataset.hfx = el.textContent;
      if (k < 1) requestAnimationFrame(step); else { el.textContent = final; el.dataset.hfx = final; }
    };
    el.textContent = pre + (0).toFixed(dec) + post;
    requestAnimationFrame(step);
  }
  function scan() {
    document.querySelectorAll(".home-stat-value, #progressValue").forEach(function (el) {
      if (!el.closest("[hidden]")) countUp(el);
    });
  }
  var busy = false;
  var mo = new MutationObserver(function () {
    if (busy) return; busy = true;
    requestAnimationFrame(function () { scan(); busy = false; });
  });
  ["statsRow", "progressHighlight"].forEach(function (id) {
    var n = document.getElementById(id); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true });
  });
  scan();

  /* ---------- 2) إضاءة بطاقات الأدوات تتبع المؤشر ---------- */
  document.querySelectorAll(".home-tools-item").forEach(function (card) {
    var g = document.createElement("span"); g.className = "hfx-glow"; g.setAttribute("aria-hidden", "true");
    card.appendChild(g);
    if (!fine) return;
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });
  /* ضغطة: موجة ضوء من نقطة اللمس (تعمل على الهاتف أيضًا) */
  if (!reduce) document.addEventListener("pointerdown", function (e) {
    var c = e.target.closest && e.target.closest(".home-tools-item");
    if (!c) return;
    var r = c.getBoundingClientRect(), s = document.createElement("span");
    s.className = "hfx-ripple"; s.style.left = (e.clientX - r.left) + "px"; s.style.top = (e.clientY - r.top) + "px";
    c.appendChild(s); setTimeout(function () { s.remove(); }, 650);
  }, { passive: true });

  /* ---------- 3) عيون برعي تتبع اللمس/المؤشر ---------- */
  var tgt = null, cur = { x: 0, y: 0 }, goal = { x: 0, y: 0 }, raf = 0, lastMove = 0;
  function eyes() { return document.querySelectorAll(".home-mascot .rb-eye"); }
  function aim(x, y) {
    var w = document.querySelector(".home-mascot svg"); if (!w) return;
    var r = w.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
    goal.x = dx / d * 3.2 * k; goal.y = dy / d * 2.4 * k; lastMove = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (now - lastMove > 2500) { goal.x = goal.y = 0; }
    cur.x += (goal.x - cur.x) * .18; cur.y += (goal.y - cur.y) * .18;
    eyes().forEach(function (e) { e.style.translate = cur.x.toFixed(2) + "px " + cur.y.toFixed(2) + "px"; });
    if (Math.abs(cur.x - goal.x) > .02 || Math.abs(cur.y - goal.y) > .02 || goal.x || goal.y) raf = requestAnimationFrame(tick); else raf = 0;
  }
  if (!reduce) {
    addEventListener("pointermove", function (e) { aim(e.clientX, e.clientY); }, { passive: true });
    addEventListener("pointerdown", function (e) { aim(e.clientX, e.clientY); }, { passive: true });
  }

  /* ---------- 4) بارالاكس السماء مع التمرير ---------- */
  var ticking = false, head = document.querySelector(".home-welcome");
  if (head && !reduce) addEventListener("scroll", function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () { head.style.setProperty("--sy", Math.min(scrollY, 300)); ticking = false; });
  }, { passive: true });
})();

/* وصول بعد تسجيل دخول جديد: كشف دائري للترويسة وظهور متتابع (مرة واحدة) */
(function () {
  try {
    if (sessionStorage.getItem("hfx:welcome") !== "1") return;
    sessionStorage.removeItem("hfx:welcome");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var b = document.body; b.classList.add("hfx-arrive");
    setTimeout(function () { b.classList.remove("hfx-arrive"); }, 2200);
  } catch (e) {}
})();

/* بارالاكس الأفق: مؤشر الماوس أو ميل الهاتف */
(function () {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var head = document.querySelector(".home-welcome"); if (!head) return;
    var goal = 0, cur = 0, raf = 0;
    var loop = function () {
      cur += (goal - cur) * .08; head.style.setProperty("--hx", cur.toFixed(3));
      raf = Math.abs(goal - cur) > .002 ? requestAnimationFrame(loop) : 0;
    };
    var set = function (v) { goal = Math.max(-1, Math.min(1, v)); if (!raf) raf = requestAnimationFrame(loop); };
    addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") set((e.clientX / innerWidth - .5) * 2); }, { passive: true });
    addEventListener("deviceorientation", function (e) { if (e.gamma != null) set(e.gamma / 25); }, { passive: true });
  } catch (e) {}
})();
