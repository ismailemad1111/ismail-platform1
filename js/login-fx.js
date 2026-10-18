/** login-fx.js — مؤثرات شاشة الدخول (عرض فقط؛ لا يلمس منطق الدخول). */
(function () {
  "use strict";
  try {
    var page = document.getElementById("loginPage");
    if (!page) return;
    var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    var fine = false; try { fine = matchMedia("(hover:hover) and (pointer:fine)").matches; } catch (e) {}

    // شفق
    var au = document.createElement("div"); au.className = "lfx-aurora"; au.setAttribute("aria-hidden", "true");
    au.innerHTML = "<i></i><i></i><i></i>"; page.insertBefore(au, page.firstChild);

    // مسرح البطاقة (للميلان ثلاثي الأبعاد)
    var card = document.getElementById("loginCard");
    if (card && card.parentNode === page) {
      var st = document.createElement("div"); st.className = "lfx-stage";
      page.insertBefore(st, card); st.appendChild(card);
    }
    page.classList.add("lfx-in");

    // حروف ورموز دراسية عائمة
    if (!reduce) {
      var cv = document.createElement("canvas"); cv.id = "lfxGlyphs"; cv.setAttribute("aria-hidden", "true");
      page.insertBefore(cv, au.nextSibling);
      var ctx = cv.getContext("2d"), dpr = Math.min(devicePixelRatio || 1, 2), W = 0, H = 0;
      var SYM = ["π", "∑", "√", "∞", "x²", "H₂O", "+", "÷", "×", "=", "أ", "ب", "جـ", "∫", "Δ", "%", "θ", "A", "B", "ع", "؟", "٣"];
      var COL = ["255,70,84", "232,185,79", "100,152,239", "79,175,131", "165,138,232"];
      var gl = [], px = 0, py = 0, tx = 0, ty = 0;
      var size = function () {
        W = page.clientWidth; H = page.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n = Math.max(12, Math.min(30, Math.round(W * H / 28000)));
        gl = [];
        for (var i = 0; i < n; i++) gl.push({
          x: Math.random() * W, y: Math.random() * H, s: 18 + Math.random() * 30, v: 6 + Math.random() * 14,
          r: (Math.random() - .5) * .6, vr: (Math.random() - .5) * .08, a: .08 + Math.random() * .12,
          c: COL[i % COL.length], t: SYM[(Math.random() * SYM.length) | 0], z: .3 + Math.random() * .9
        });
      };
      size(); addEventListener("resize", size);
      if (fine) addEventListener("pointermove", function (e) { tx = (e.clientX / innerWidth - .5); ty = (e.clientY / innerHeight - .5); });
      var last = performance.now(), run = true;
      document.addEventListener("visibilitychange", function () { run = !document.hidden; if (run) { last = performance.now(); requestAnimationFrame(loop); } });
      var loop = function (now) {
        if (!run) return;
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        px += (tx - px) * .06; py += (ty - py) * .06;
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < gl.length; i++) {
          var g = gl[i];
          g.y -= g.v * g.z * dt; g.r += g.vr * dt;
          if (g.y < -50) { g.y = H + 50; g.x = Math.random() * W; }
          ctx.save();
          ctx.translate(g.x - px * 40 * g.z, g.y - py * 40 * g.z); ctx.rotate(g.r);
          ctx.font = "700 " + g.s + "px Inter,'IBM Plex Sans Arabic',sans-serif";
          ctx.textAlign = "center"; ctx.fillStyle = "rgba(" + g.c + "," + g.a + ")";
          ctx.fillText(g.t, 0, 0); ctx.restore();
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    // ميلان البطاقة مع المؤشر (أجهزة الماوس فقط، ويتوقف أثناء الكتابة)
    if (fine && !reduce && card) {
      var typing = false;
      card.addEventListener("focusin", function () { typing = true; card.style.transform = ""; });
      card.addEventListener("focusout", function () { typing = false; });
      page.addEventListener("pointermove", function (e) {
        if (typing) return;
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
        card.style.transform = "rotateY(" + (dx * 8).toFixed(2) + "deg) rotateX(" + (-dy * 8).toFixed(2) + "deg)";
      });
      page.addEventListener("pointerleave", function () { card.style.transform = ""; });
    }

    // إظهار/إخفاء كلمة المرور + تنبيه Caps Lock
    var pw = document.getElementById("passwordInput");
    if (pw && !pw.parentNode.classList.contains("lfx-pw")) {
      var wrap = document.createElement("div"); wrap.className = "lfx-pw";
      pw.parentNode.insertBefore(wrap, pw); wrap.appendChild(pw);
      var eye = document.createElement("button");
      eye.type = "button"; eye.className = "lfx-eye"; eye.setAttribute("aria-label", "إظهار كلمة المرور"); eye.setAttribute("aria-pressed", "false");
      eye.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="on"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></g><g class="off"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a19.8 19.8 0 0 1 5.1-5.9M9.9 5.2A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a19.7 19.7 0 0 1-3.2 4.2M1 1l22 22"/></g></svg>';
      eye.addEventListener("click", function () {
        var show = pw.type === "password"; pw.type = show ? "text" : "password";
        eye.setAttribute("aria-pressed", show ? "true" : "false");
        eye.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
        pw.focus();
      });
      wrap.appendChild(eye);
      var caps = document.createElement("p"); caps.className = "lfx-caps"; caps.setAttribute("role", "status");
      caps.textContent = "⚠ زر Caps Lock شغّال"; wrap.parentNode.insertBefore(caps, wrap.nextSibling);
      var chk = function (e) { try { caps.classList.toggle("show", !!(e.getModifierState && e.getModifierState("CapsLock"))); } catch (x) {} };
      pw.addEventListener("keydown", chk); pw.addEventListener("keyup", chk);
      pw.addEventListener("blur", function () { caps.classList.remove("show"); });
    }
  } catch (e) { /* تجميلي فقط */ }

  /* ---------- مشهد النجاح: «فتح القفل» ثم انتقال للرئيسية ---------- */
  window.__lfxSuccess = function () {
    try {
      var reduce2 = matchMedia("(prefers-reduced-motion: reduce)").matches;
      try { sessionStorage.setItem("hfx:welcome", "1"); } catch (e) {}
      if (reduce2) return 400;
      var btn = document.querySelector(".login-submit-btn"), r = btn ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      var ov = document.createElement("div"); ov.className = "lfx-success"; ov.setAttribute("aria-hidden", "true");
      ov.style.setProperty("--ox", (r.left + r.width / 2) + "px"); ov.style.setProperty("--oy", (r.top + r.height / 2) + "px");
      ov.innerHTML = '<div class="lfx-s-in"><svg viewBox="0 0 80 80" width="96" height="96"><circle class="c" cx="40" cy="40" r="34"/><path class="t" d="M24 41l11 11 21-24"/></svg><p>أهلاً بيك!</p></div>';
      document.body.appendChild(ov);
      var cd = document.getElementById("loginCard"); if (cd) cd.classList.add("lfx-leave");
      return 1500;
    } catch (e) { return 400; }
  };
})();

