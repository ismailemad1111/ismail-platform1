/**
 * ambient.js — حضور برعي الهادئ: تعبيرات بلا نص ولا فقاعة ولا احتساب في ميزانية الظهور.
 * ------------------------------------------------------------------
 * - يُركَّب داخل عنصر موجود في الصفحة (مربع أيقونة الترويسة، أو حاوية فارغة) بدل أي نص.
 * - المستوى «صامت» ⇒ لا يظهر شيء (تبقى الأيقونة الأصلية).
 * - مع «تقليل الحركة» يتوقف التحريك بقواعد mascot.css (التعبير يتبدّل فقط).
 * - كل شيء محصّن: الفشل ⇒ تبقى الصفحة كما هي.
 * - حياة خفيفة: نظرة العينين تتبع المؤشر/آخر لمسة (±3 وحدات رسم)، ونظرة جانبية عفوية كل 9–17 ثانية،
 *   وردّ فعل لحظي (react) عند الضغط عليه أو إيقاظه. مؤقّت واحد فقط، يتوقف مع إخفاء الصفحة أو الخمول
 *   أو «تقليل الحركة» أو «صامت»، ويُنظَّف عند مغادرة الصفحة.
 */
import { mascotEl } from "../mascot.js";
import { store } from "./store.js";
import { context } from "./context.js";
import { config } from "./config.js";

const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

const hostOf = (h) => {
  try { return typeof h === "string" ? (document.getElementById(h) || document.querySelector(h)) : h; } catch (e) { return null; }
};
const svgOf = (el) => el && el.querySelector(":scope > .mascot");

/** الضغط على برعي الهادئ يفتح رسالة قصيرة عامة (مرة لكل ضغطة، والنقر السريع يُتجاهل داخل brain.tap). */
function bindTap(el) {
  if (el.dataset.baraiTap) return;
  el.dataset.baraiTap = "1";
  el.style.cursor = "pointer";
  if (!el.hasAttribute("role")) el.setAttribute("role", "button");
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
  if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", "برعي");
  const go = () => { try { ambient.react(el, "wink", 1200); } catch (e) { /* تجاهل */ } import("./index.js").then((m) => m.barai.tap()).catch(() => {}); };
  el.addEventListener("click", go);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
}

/* ============================================================
   نظرة العينين (gaze)
   ============================================================ */
const gaze = { on: false, tx: 0, ty: 0, at: 0, raf: 0, glanceTimer: 0, lastMove: 0 };

/** برعي الكبير الظاهر فقط (ليس مصغّر الفقاعة)، وأقرب gaze.maxMascots منها للمؤشر. */
function gazeTargets() {
  const out = [];
  try {
    document.querySelectorAll(".mascot:not(.is-xs)").forEach((m) => {
      const r = m.getBoundingClientRect();
      if (r.width < 30 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      out.push({ m, cx: r.left + r.width / 2, cy: r.top + r.height * 0.4 });
    });
  } catch (e) { /* تجاهل */ }
  return out.slice(0, config.gaze.maxMascots);
}

function aim(x, y) {
  const R = config.gaze.range;
  gazeTargets().forEach((t) => {
    const gx = Math.tanh((x - t.cx) / 140) * R, gy = Math.tanh((y - t.cy) / 140) * R * 0.8;
    t.m.style.setProperty("--gx", gx.toFixed(2));
    t.m.style.setProperty("--gy", gy.toFixed(2));
  });
}
function center() { gazeTargets().forEach((t) => { t.m.style.setProperty("--gx", "0"); t.m.style.setProperty("--gy", "0"); }); }

function onPointer(e) {
  gaze.tx = e.clientX; gaze.ty = e.clientY; gaze.lastMove = Date.now();
  if (gaze.raf) return;
  gaze.raf = requestAnimationFrame(() => { gaze.raf = 0; if (Date.now() - gaze.at < 100) return; gaze.at = Date.now(); aim(gaze.tx, gaze.ty); });
}

function scheduleGlance() {
  const g = config.gaze;
  gaze.glanceTimer = setTimeout(() => {
    try {
      const idle = context.lastInputAgo();
      if (document.visibilityState === "visible" && idle >= 3000 && idle < g.idleStopMs && !reduceMotion() && store.getLevel() !== "silent") {
        const side = Math.random() < 0.5 ? -1 : 1;
        gazeTargets().forEach((t) => { t.m.style.setProperty("--gx", String(side * g.range)); t.m.style.setProperty("--gy", String(-0.5)); });
        setTimeout(center, 800);
      }
    } catch (e) { /* تجاهل */ }
    scheduleGlance();
  }, g.glanceMinMs + Math.random() * (g.glanceMaxMs - g.glanceMinMs));
}

export const ambient = {
  /** يشغّل نظرة العينين (مرة واحدة لكل صفحة). بلا تأثير مع «تقليل الحركة». */
  startGaze() {
    try {
      if (gaze.on || reduceMotion()) return false;
      gaze.on = true;
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      scheduleGlance();
      window.addEventListener("pagehide", () => { clearTimeout(gaze.glanceTimer); if (gaze.raf) cancelAnimationFrame(gaze.raf); window.removeEventListener("pointermove", onPointer); window.removeEventListener("pointerdown", onPointer); gaze.on = false; }, { once: true });
      return true;
    } catch (e) { return false; }
  },

  /** ردّ فعل لحظي: يبدّل التعبير ثم يعيده بعد ms إن لم يتغير في الأثناء. */
  react(host, mood, ms = 1400) {
    try {
      const el = hostOf(host);
      if (!el || !svgOf(el)) return false;
      const prev = el.dataset.baraiAmbient || "wave";
      if (prev === mood) return true;
      ambient.set(el, mood);
      clearTimeout(el._baraiReact);
      el._baraiReact = setTimeout(() => { if (el.dataset.baraiAmbient === mood) ambient.set(el, prev === "sleepy" ? "wave" : prev); }, ms);
      return true;
    } catch (e) { return false; }
  },

  /** يركّب برعي داخل host (id أو محدّد CSS أو عنصر). يعيد العنصر أو null. */
  mount(host, mood = "wave") {
    try {
      const el = hostOf(host);
      if (!el) return null;
      if (store.getLevel() === "silent") return null;
      const old = svgOf(el);
      if (old) { old.replaceWith(mascotEl(mood)); }
      else { el.classList.add("barai-ambient-on"); el.appendChild(mascotEl(mood)); }
      el.dataset.baraiAmbient = mood;
      bindTap(el);
      return el;
    } catch (e) { return null; }
  },

  bindTap,

  /** يبدّل التعبير إن كان برعي مُركَّبًا في host (وإلا لا شيء). */
  set(host, mood) {
    try {
      const el = hostOf(host);
      if (!el || !svgOf(el)) return false;
      if (el.dataset.baraiAmbient === mood) return true;
      svgOf(el).replaceWith(mascotEl(mood));
      el.dataset.baraiAmbient = mood;
      return true;
    } catch (e) { return false; }
  },

  /** يعيد التعبير الحالي أو null. */
  mood(host) { try { const el = hostOf(host); return el && svgOf(el) ? el.dataset.baraiAmbient || null : null; } catch (e) { return null; } },

  /** نعاس بعد ms من عدم اللمس (الافتراضي 60 ثانية)، ويستيقظ عند أول لمسة. يعيد دالة إيقاف. */
  sleepOnIdle(host, { ms = 60000, awake = "wave", sleepy = "sleepy", everyMs = 4000 } = {}) {
    try {
      const el = hostOf(host);
      if (!el) return () => {};
      const wake = () => {
        if (el.dataset.baraiAmbient !== sleepy) return;
        ambient.set(el, "surprised");                       // يستيقظ بمفاجأة قصيرة ثم يرحّب
        clearTimeout(el._baraiReact);
        el._baraiReact = setTimeout(() => { if (el.dataset.baraiAmbient === "surprised") ambient.set(el, "welcome"); }, 900);
        setTimeout(() => { if (el.dataset.baraiAmbient === "welcome") ambient.set(el, awake); }, 3200);
      };
      const evs = ["pointerdown", "touchstart", "keydown", "wheel", "scroll"];
      evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
      const timer = setInterval(() => {
        try {
          if (document.visibilityState !== "visible" || !el.isConnected || store.getLevel() === "silent") return;
          if (context.lastInputAgo() >= ms && el.dataset.baraiAmbient === awake) ambient.set(el, sleepy);
        } catch (e) { /* تجاهل */ }
      }, everyMs);
      return () => { clearInterval(timer); evs.forEach((e) => window.removeEventListener(e, wake)); };
    } catch (e) { return () => {}; }
  }
};
