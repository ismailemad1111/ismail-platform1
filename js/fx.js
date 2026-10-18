/**
 * fx.js — دمج GSAP + ScrollTrigger + Lottie (تحسين تدريجي، عرض فقط).
 * - يحمّل المكتبات من /vendor أولًا ثم من cdnjs (نسخ مثبّتة)؛ وإن فشلت يبقى كل شيء يعمل بالـ CSS.
 * - لا يعمل مع prefers-reduced-motion ولا مع الاتصال الموفّر للبيانات.
 * - API: MrFx.lottie(host,name,opts) ، MrFx.celebrate(kind) ، MrFx.refresh()
 */
(function () {
  "use strict";
  var V = { gsap: "3.15.0", lottie: "5.13.0" };
  var CDN = "https://cdnjs.cloudflare.com/ajax/libs/";
  var reduce = false, saveData = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  try { saveData = !!(navigator.connection && navigator.connection.saveData); } catch (e) {}
  var cache = {};

  function load(srcs) {
    var key = srcs[0];
    if (cache[key]) return cache[key];
    cache[key] = new Promise(function (res, rej) {
      (function next(i) {
        if (i >= srcs.length) return rej(new Error("fx: load failed " + key));
        var s = document.createElement("script");
        s.src = srcs[i]; s.async = true;
        s.onload = function () { res(); };
        s.onerror = function () { s.remove(); next(i + 1); };
        document.head.appendChild(s);
      })(0);
    });
    return cache[key];
  }
  function loadGsap() {
    if (window.gsap && window.ScrollTrigger) return Promise.resolve();
    return load(["/vendor/gsap.min.js", CDN + "gsap/" + V.gsap + "/gsap.min.js"])
      .then(function () { return load(["/vendor/ScrollTrigger.min.js", CDN + "gsap/" + V.gsap + "/ScrollTrigger.min.js"]); })
      .then(function () { gsap.registerPlugin(ScrollTrigger); });
  }
  function loadLottie() {
    if (window.lottie) return Promise.resolve();
    return load(["/vendor/lottie.min.js", CDN + "lottie-web/" + V.lottie + "/lottie.min.js"]);
  }

  /* ---------- Lottie ---------- */
  var json = {};
  function getJson(name) {
    return json[name] || (json[name] = fetch("/animations/" + name + ".json").then(function (r) {
      if (!r.ok) throw new Error("no anim"); return r.json();
    }));
  }
  function lottieInto(host, name, o) {
    o = o || {};
    if (!host || reduce || saveData) return Promise.resolve(null);
    return Promise.all([loadLottie(), getJson(name)]).then(function (a) {
      if (!host.isConnected) return null;
      var anim = lottie.loadAnimation({
        container: host, renderer: "svg", loop: !!o.loop, autoplay: o.autoplay !== false,
        animationData: a[1], rendererSettings: { progressiveLoad: true, preserveAspectRatio: "xMidYMid meet" }
      });
      host.setAttribute("data-lottie-ready", "1");
      if (o.onDone) anim.addEventListener("complete", function () { o.onDone(anim); });
      return anim;
    }).catch(function () { host.removeAttribute("data-lottie-ready"); return null; });
  }
  function hookStatic() {
    document.querySelectorAll("[data-lottie]:not([data-lottie-ready])").forEach(function (h) {
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (es) {
          if (es[0].isIntersecting) { io.disconnect(); lottieInto(h, h.dataset.lottie, { loop: h.hasAttribute("data-lottie-loop") }); }
        }); io.observe(h);
      } else lottieInto(h, h.dataset.lottie, { loop: h.hasAttribute("data-lottie-loop") });
    });
  }
  var busyCel = false;
  function celebrate(kind) {
    if (reduce || saveData || busyCel) return;
    busyCel = true;
    var h = document.createElement("div");
    h.className = "fx-celebrate"; h.setAttribute("aria-hidden", "true");
    document.body.appendChild(h);
    var done = function () { busyCel = false; h.remove(); };
    lottieInto(h, kind === "success" ? "success" : "celebrate", { onDone: done }).then(function (a) { if (!a) done(); });
    setTimeout(done, 2600);
  }

  /* ---------- GSAP / ScrollTrigger ---------- */
  var SEL = ".home-section:not(.hm-reveal), .home-tools-item, .bk-card, .bk-order, .bk-row, .ex-card, .ls-card, .ann-card, .pl-section, .pf-section, .ev-card, [data-fx-reveal]";
  var ready = false;
  function reveal(root) {
    if (!ready) return;
    var els = Array.prototype.filter.call((root || document).querySelectorAll(SEL), function (e) {
      return !e.dataset.fxd && !e.closest("[hidden]") && !e.closest(".hm-reveal:not(.is-in)");
    });
    if (!els.length) return;
    els.forEach(function (e) { e.dataset.fxd = "1"; });
    gsap.set(els, { autoAlpha: 0, y: 22 });
    ScrollTrigger.batch(els, {
      start: "top 94%", once: true,
      onEnter: function (b) {
        gsap.to(b, { autoAlpha: 1, y: 0, duration: .5, ease: "power3.out", stagger: .06, overwrite: true,
          clearProps: "transform,opacity,visibility" });
      }
    });
    /* شبكة أمان: لا يبقى عنصر مخفيًا */
    setTimeout(function () { els.forEach(function (e) { if (getComputedStyle(e).visibility === "hidden") gsap.set(e, { clearProps: "all" }); }); }, 3500);
  }
  var pend = 0;
  function watch() {
    if (!window.MutationObserver) return;
    new MutationObserver(function () {
      if (pend) return;
      pend = requestAnimationFrame(function () { pend = 0; reveal(); hookStatic(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  function initGsap() {
    if (reduce || saveData) return;
    loadGsap().then(function () {
      ready = true;
      document.documentElement.classList.add("fx-gsap");
      reveal(); watch();
      window.addEventListener("pageshow", function (e) { if (e.persisted) ScrollTrigger.refresh(); });
    }).catch(function () { /* تبقى حركات CSS */ });
  }

  window.MrFx = { lottie: lottieInto, celebrate: celebrate, refresh: function () { reveal(); hookStatic(); }, get gsapReady() { return ready; } };
  function start() { hookStatic(); if ("requestIdleCallback" in window) requestIdleCallback(initGsap, { timeout: 1200 }); else setTimeout(initGsap, 300); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
