/**
 * login-scene.js — مشهد الدخول السينمائي (عرض فقط):
 *  1) خلفية WebGL: بلازما سائلة بألوان العلامة تتأثر بالمؤشر (تتوقف مع «تقليل الحركة»/إخفاء الصفحة).
 *  2) برعي كبير فوق العلامة: عيناه تتابعان الكتابة، ويهتز عند خطأ.
 * لا يلمس منطق الدخول؛ برعي نفسه يبقى مُدارًا من barai (نقلنا حاويته فقط).
 */
(function () {
  "use strict";
  try {
    var page = document.getElementById("loginPage"); if (!page) return;
    var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    page.classList.add("lfx-scene");

    /* ---------- 1) WebGL ---------- */
    if (reduce) page.classList.add("lfx-nogl");
    if (!reduce) (function () {
      var cv = document.createElement("canvas"); cv.className = "lfx-gl"; cv.setAttribute("aria-hidden", "true");
      var gl = cv.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
      if (!gl) { page.classList.add("lfx-nogl"); return; }
      var vs = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
      var fs = "precision mediump float;uniform vec2 r;uniform float t;uniform vec2 m;" +
        "float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}" +
        "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}" +
        "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return v;}" +
        "void main(){vec2 uv=gl_FragCoord.xy/r.y;vec2 mm=m*vec2(r.x/r.y,1.);" +
        "vec2 q=vec2(fbm(uv*2.2+t*.05),fbm(uv*2.2+vec2(5.2,1.3)-t*.04));" +
        "float d=distance(uv,mm);q+=.35*exp(-d*3.)*vec2(sin(t+d*9.),cos(t+d*9.));" +
        "float f=fbm(uv*2.+4.*q+t*.03);" +
        "vec3 c=vec3(.043,.055,.09);" +
        "c=mix(c,vec3(1.,.27,.33),smoothstep(.38,.9,f)*.85);" +
        "c=mix(c,vec3(.91,.73,.31),smoothstep(.6,1.,q.x)*.55);" +
        "c=mix(c,vec3(.39,.6,.94),smoothstep(.55,1.,q.y)*.4);" +
        "c+=vec3(1.,.3,.35)*.22/(1.+26.*d*d);" +
        "vec2 vv=gl_FragCoord.xy/r-.5;c*=.78-dot(vv,vv)*.9;" +
        "gl_FragColor=vec4(c,1.);}";
      var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs); if (!v || !f) return;
      var pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      gl.useProgram(pr);
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var uR = gl.getUniformLocation(pr, "r"), uT = gl.getUniformLocation(pr, "t"), uM = gl.getUniformLocation(pr, "m");
      var S = .5, FPS = 30, mx = .5, my = .5, cx = .5, cy = .5, t0 = performance.now(), run = true, last = 0, raf = 0, slow = 0, lowered = false;
      var size = function () { cv.width = Math.max(2, Math.round(innerWidth * S)); cv.height = Math.max(2, Math.round(innerHeight * S)); gl.viewport(0, 0, cv.width, cv.height); };
      size(); addEventListener("resize", size);
      addEventListener("pointermove", function (e) { mx = e.clientX / innerWidth; my = 1 - e.clientY / innerHeight; }, { passive: true });
      var frame = function (now) {
        raf = 0; if (!run) return;
        var dt = now - last;
        if (dt > 1000 / FPS - 2) {
          // جهاز ضعيف: إذا تأخرت الإطارات باستمرار نخفض الدقة والمعدل مرة واحدة
          if (last) { slow = dt > 60 ? slow + 1 : Math.max(0, slow - 1); }
          if (slow > 20 && !lowered) { lowered = true; S = .33; FPS = 20; size(); }
          last = now; cx += (mx - cx) * .08; cy += (my - cy) * .08;
          gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, (now - t0) / 1000); gl.uniform2f(uM, cx, cy);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        raf = requestAnimationFrame(frame);
      };
      // حلقة رسم واحدة فقط: لا نبدأ حلقة جديدة إن كانت هناك حلقة معلّقة
      var start = function () { run = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); };
      var stop = function () { run = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } };
      document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
      // فقدان سياق WebGL: نتوقف ونرجع للخلفية الاحتياطية بدل شاشة سوداء
      cv.addEventListener("webglcontextlost", function (e) { e.preventDefault(); stop(); page.classList.remove("lfx-gl-on"); page.classList.add("lfx-nogl"); cv.style.display = "none"; });
      page.insertBefore(cv, page.firstChild); page.classList.add("lfx-gl-on");
      start();
    })();

    /* ---------- 2) برعي الكبير ---------- */
    var host = document.getElementById("baraiAmbient"), brand = page.querySelector(".login-brand");
    if (host && brand) {
      var hero = document.createElement("div"); hero.className = "lfx-hero";
      hero.innerHTML = '<div class="lfx-halo"></div>';
      hero.appendChild(host); brand.insertBefore(hero, brand.firstChild);
      setTimeout(function () { // لو برعي «صامت» لا يوجد رسم: نُبقي الواجهة القديمة
        if (host.querySelector(".mascot")) page.classList.add("lfx-hero-on"); else hero.remove();
      }, 700);

      // متابعة العيون
      var gx = 0, gy = 0, cxx = 0, cyy = 0, raf = 0, until = 0;
      var aim = function (x, y) {
        var m = host.querySelector(".mascot"); if (!m) return;
        var r = m.getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220);
        gx = dx / d * 3.4 * k; gy = dy / d * 2.6 * k; until = performance.now() + 2600;
        if (!raf) raf = requestAnimationFrame(tick);
      };
      var tick = function (now) {
        if (now > until) { gx = gy = 0; }
        cxx += (gx - cxx) * .2; cyy += (gy - cyy) * .2;
        host.querySelectorAll(".rb-eye").forEach(function (e) { e.style.translate = cxx.toFixed(2) + "px " + cyy.toFixed(2) + "px"; });
        raf = (Math.abs(cxx - gx) > .02 || Math.abs(cyy - gy) > .02 || gx || gy) ? requestAnimationFrame(tick) : 0;
      };
      if (!reduce) {
        addEventListener("pointermove", function (e) { aim(e.clientX, e.clientY); }, { passive: true });
        var follow = function (inp) {
          var upd = function () {
            var r = inp.getBoundingClientRect(), len = (inp.value || "").length, max = +inp.getAttribute("maxlength") || 8;
            var prog = Math.min(1, len / max);
            aim(r.left + r.width * (.2 + .6 * prog), r.top + r.height / 2);
          };
          inp.addEventListener("input", upd); inp.addEventListener("focus", upd);
        };
        ["codeInput", "passwordInput"].forEach(function (id) { var i = document.getElementById(id); if (i) follow(i); });
      }

      // أثناء الكتابة نوقف حركة العوم والهالة حتى لا تشتّت
      var formEl = document.getElementById("loginForm");
      if (formEl) {
        formEl.addEventListener("focusin", function (e) { if (e.target.matches && e.target.matches("input")) page.classList.add("lfx-typing"); });
        formEl.addEventListener("focusout", function () { page.classList.remove("lfx-typing"); });
      }

      // اهتزاز عند خطأ (aria-invalid / فئة خطأ على حقل)
      var shakeT = 0;
      var shake = function () {
        hero.classList.remove("lfx-shake"); void hero.offsetWidth; hero.classList.add("lfx-shake");
        clearTimeout(shakeT); shakeT = setTimeout(function () { hero.classList.remove("lfx-shake"); }, 700);
      };
      var form = document.getElementById("loginForm");
      if (form) new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var t = list[i].target;
          if (t.matches && t.matches("input,select") && (t.getAttribute("aria-invalid") === "true" || /error|invalid/.test(t.className))) { shake(); return; }
        }
      }).observe(form, { attributes: true, subtree: true, attributeFilter: ["aria-invalid", "class"] });
    }
  } catch (e) { /* تجميلي فقط */ }
})();
