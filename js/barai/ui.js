/**
 * ui.js — عرض برعي: فقاعة / لحظة / مدمج. لا يقرر شيئًا (القرار في brain.js).
 * - يتجنّب العناصر الموسومة data-barai-avoid (حقول الإدخال والأزرار الأساسية): يرفع الفقاعة فوقها، وإن لم يتّسع
 *   المكان ينقلها لأعلى الشاشة، وإن تعذّر يرفض العرض (يعيد null فتؤجَّل الرسالة).
 * - يتابع visualViewport (لوحة المفاتيح) فيعيد الحساب ولا تختبئ الفقاعة خلفها.
 * - تختفي الفقاعة عند تمرير الصفحة ≥ config.bubble.scrollDismiss بكسل (لا تُحسب إغلاقًا).
 * - مهلة الاختفاء تتوقف عند hover/focus وتتمدّد عند الاستئناف.
 * - اختيارات التفاعل متعدد الخطوات (choices): أزرار صغيرة داخل البطاقة؛ morphBubble يبدّل المحتوى في مكانه
 *   (نفس العنصر) بدل إخفاء وإظهار، وتُعلن «مناطق aria-live» التغيير للقارئات.
 * - data-tone على الجذر (celebrate/alert/calm/think/warm) يحدد لمسة البطاقة وحركة دخولها في barai.css.
 */
import { mascotEl, confettiBurst, toneOfMood } from "../mascot.js";
import { config } from "./config.js";

let bubbleEl = null, hideTimer = null, momentEl = null, momentTimer = null, detach = null;
let hideListener = null;     // brain.js: يُبلَّغ حين تختفي الفقاعة لأي سبب (لإنهاء التفاعل الجاري)

function textOf(node) { return node && node.textContent || ""; }

function build(kind, { text, mood, action, secondary, choices, onChoose, onClose, onInteract, onAction, key, progress, kind: msgKind }) {
  const root = document.createElement("div");
  root.className = kind === "moment" ? "barai-moment" : "barai-bubble";
  root.dataset.key = key || "";
  root.dataset.mood = mood || "";
  root.dataset.tone = toneOfMood(mood);
  if (msgKind) root.dataset.kind = msgKind;          // guide/encourage/celebrate/hint/alert/reply: لمسة بصرية حسب نوع الرسالة
  if (!document.querySelector(".bottom-nav") && kind !== "moment") root.classList.add("no-nav");

  const card = document.createElement("div");
  card.className = "barai-card";
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const p = document.createElement("p");
  p.className = "barai-text";
  p.textContent = text;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "barai-close";
  close.setAttribute("aria-label", "إغلاق");
  close.textContent = "×";
  close.addEventListener("click", () => onClose && onClose("close"));

  if (kind === "moment") card.appendChild(mascotEl(mood, "is-lg"));
  card.appendChild(p);
  card.appendChild(close);
  if (progress && progress.total > 1) {              // تقدّم التفاعل: «خطوة س من ص» + نقاط (للقارئات عبر aria-label)
    const pr = document.createElement("div");
    pr.className = "barai-progress";
    pr.setAttribute("role", "img");
    pr.setAttribute("aria-label", `خطوة ${progress.index} من ${progress.total}`);
    for (let i = 1; i <= progress.total; i++) { const d = document.createElement("i"); if (i <= progress.index) d.className = "on"; pr.appendChild(d); }
    card.appendChild(pr);
  }

  const mkAction = (act, secondaryBtn) => {
    const a = document.createElement(act.href ? "a" : "button");
    a.className = "barai-action" + (secondaryBtn ? " is-secondary" : "");
    a.textContent = act.label;
    if (act.href) a.href = act.href; else a.type = "button";
    a.addEventListener("click", () => { onAction ? onAction() : onInteract && onInteract(); if (act.onClick) act.onClick(); });
    return a;
  };
  const list = (choices || []).slice(0, config.flow.maxChoices);
  if ((action && action.label) || (secondary && secondary.label) || list.length) {
    const row = document.createElement("div");
    row.className = "barai-actions";
    if (action && action.label) row.appendChild(mkAction(action, false));
    if (secondary && secondary.label) row.appendChild(mkAction(secondary, !!(action && action.label)));
    list.forEach((ch) => {
      const b = document.createElement(ch.href ? "a" : "button");
      b.className = "barai-choice";
      b.textContent = ch.label;
      b.dataset.choice = ch.id;
      if (ch.href) b.href = ch.href; else b.type = "button";
      b.addEventListener("click", (e) => {
        if (row.dataset.lock) { e.preventDefault(); return; }      // نقرات متتابعة لا تُنفّذ الإجراء مرتين
        row.dataset.lock = "1"; setTimeout(() => { delete row.dataset.lock; }, 450);
        if (onChoose) onChoose(ch.id, ch);
      });
      row.appendChild(b);
    });
    if (list.length) row.classList.add("has-choices");
    card.appendChild(row);
  }
  card.addEventListener("click", (e) => { if (!e.target.closest(".barai-close") && !e.target.closest(".barai-action")) onInteract && onInteract(); });

  if (kind === "moment") root.appendChild(card);
  else { root.appendChild(mascotEl(mood, "is-xs")); root.appendChild(card); }
  return root;
}

function ttlFor(text, ttl, hasChoices) {
  if (ttl) return ttl;
  const b = config.bubble;
  const t = Math.min(b.maxTtl, Math.max(b.minTtl, b.base + String(text).length * b.perChar));
  return hasChoices ? Math.max(t, config.flow.stepTtlMs) : t;      // من عنده اختيارات يحتاج وقتًا ليقرأ ويقرر
}

/** مؤقّت يتوقف عند hover/focus، ويُستأنف بمدة لا تقل عن 2.5 ثانية (يتمدّد ولا يقطع قراءة الطالب). */
function armTimer(el, ms, cb) {
  let t = setTimeout(cb, ms);
  let dueAt = Date.now() + ms;
  const pause = () => { clearTimeout(t); };
  const resume = () => { clearTimeout(t); const left = Math.max(2500, dueAt - Date.now()); dueAt = Date.now() + left; t = setTimeout(cb, left); };
  el.addEventListener("mouseenter", pause);
  el.addEventListener("focusin", pause);
  el.addEventListener("pointerdown", pause);
  el.addEventListener("mouseleave", resume);
  el.addEventListener("focusout", resume);
  return () => clearTimeout(t);
}

/* ============================================================
   التموضع: تجنّب data-barai-avoid + لوحة المفاتيح
   ============================================================ */
const overlaps = (a, b, gap) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
const vvInfo = () => {
  const vv = window.visualViewport;
  const vh = vv ? vv.height : window.innerHeight;
  const top = vv ? vv.offsetTop : 0;
  return { top, height: vh, kb: Math.max(0, window.innerHeight - (top + vh)) };
};

function visibleAvoidRects() {
  const out = [];
  try {
    document.querySelectorAll(config.avoid.selector).forEach((n) => {
      const r = n.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") return;
      out.push(r);
    });
  } catch (e) { /* تجاهل */ }
  return out;
}

/**
 * يضع الفقاعة: الافتراضي أسفل اليسار، ثم يرفعها فوق أي عنصر يجب تجنّبه، ثم أعلى الشاشة، وإلا يفشل.
 * يعيد "ok" | "raised" | "top" | "blocked".
 */
function layout(el) {
  const gap = config.avoid.gap;
  const vv = vvInfo();
  el.style.setProperty("--barai-kb", vv.kb + "px");
  el.style.removeProperty("--barai-raise");
  el.style.removeProperty("top");
  el.classList.remove("is-top");
  const avoid = visibleAvoidRects();
  if (!avoid.length) return "ok";

  const measure = () => el.getBoundingClientRect();
  // إجراء القياس بدون انتقال/إزاحة الظهور
  const prevT = el.style.transition, prevTr = el.style.transform;
  el.style.transition = "none"; el.style.transform = "none";
  let state = "ok";
  try {
    let raise = 0;
    for (let i = 0; i < 6; i++) {
      const r = measure();
      const hit = avoid.find((a) => overlaps(r, a, gap));
      if (!hit) break;
      raise += Math.max(1, r.bottom - (hit.top - gap));
      el.style.setProperty("--barai-raise", raise + "px");
      state = "raised";
    }
    let r = measure();
    const bad = () => avoid.some((a) => overlaps(measure(), a, gap));
    if (r.top < vv.top + 8 || bad()) {
      el.style.removeProperty("--barai-raise");
      el.classList.add("is-top");
      el.style.top = (vv.top + 8) + "px";
      state = "top";
      if (bad()) state = "blocked";
    }
  } finally { el.style.transition = prevT; el.style.transform = prevTr; }
  return state;
}

function watch(el, onScrollAway) {
  const re = () => { try { layout(el); } catch (e) { /* تجاهل */ } };
  const vv = window.visualViewport;
  const startY = window.scrollY;
  const onScroll = () => { if (Math.abs(window.scrollY - startY) >= config.bubble.scrollDismiss) onScrollAway(); };
  window.addEventListener("resize", re);
  window.addEventListener("scroll", onScroll, { passive: true });
  if (vv) { vv.addEventListener("resize", re); vv.addEventListener("scroll", re); }
  document.addEventListener("focusin", re);
  document.addEventListener("focusout", re);
  return () => {
    window.removeEventListener("resize", re);
    window.removeEventListener("scroll", onScroll);
    if (vv) { vv.removeEventListener("resize", re); vv.removeEventListener("scroll", re); }
    document.removeEventListener("focusin", re);
    document.removeEventListener("focusout", re);
  };
}

export const ui = {
  isBubbleVisible() { return (!!bubbleEl && bubbleEl.isConnected) || (!!momentEl && momentEl.isConnected); },   // عنصر أزالته الصفحة من DOM لا يُعدّ معروضًا

  /** يعيد عنصر الفقاعة، أو null إن تعذّر العرض دون حجب عنصر مهم (تؤجَّل الرسالة). */
  showBubble(opts) {
    this.hideMoment();                      // لا بطاقتان فوق بعضهما (العقل أجاز المقاطعة قبل الوصول هنا)
    this.hideBubble("replace");
    const el = build("bubble", opts);
    document.body.appendChild(el);
    const state = layout(el);
    if (state === "blocked") { el.remove(); return null; }
    bubbleEl = el;
    el.dataset.place = state;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
    const stop = armTimer(el, ttlFor(opts.text, opts.ttl, !!(opts.choices && opts.choices.length)), () => { this.hideBubble("timeout"); if (opts.onTimeout) opts.onTimeout(); });
    hideTimer = stop;
    detach = watch(el, () => { if (bubbleEl === el && !opts.sticky) { this.hideBubble("scroll"); if (opts.onDismiss) opts.onDismiss(); } });
    return el;
  },

  hideBubble(reason) {
    if (hideTimer) { hideTimer(); hideTimer = null; }
    if (detach) { detach(); detach = null; }
    if (!bubbleEl) return;
    const el = bubbleEl; bubbleEl = null;
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 320);
    try { if (hideListener) hideListener(reason || "hide", el); } catch (e) { /* تجاهل */ }
  },

  /** brain.js يسجّل مستمعًا واحدًا (يُستبدل لا يتراكم). */
  onBubbleHidden(fn) { hideListener = typeof fn === "function" ? fn : null; },

  /**
   * يبدّل محتوى الفقاعة الحالية في مكانها (خطوة تالية من تفاعل): النص والتعبير والأزرار والمهلة.
   * يعيد العنصر أو null إن لم تكن هناك فقاعة (يترك القرار للمستدعي).
   */
  morphBubble(opts) {
    const el = bubbleEl;
    if (!el) return null;
    const fresh = build("bubble", opts);
    const oldCard = el.querySelector(".barai-card"), newCard = fresh.querySelector(".barai-card");
    if (!oldCard || !newCard) return null;
    oldCard.replaceWith(newCard);
    const oldM = el.querySelector(".mascot"), newM = fresh.querySelector(".mascot");
    if (oldM && newM) { newM.classList.add("rb-swap"); oldM.replaceWith(newM); }
    el.dataset.mood = opts.mood || "";
    el.dataset.tone = toneOfMood(opts.mood);
    if (opts.kind) el.dataset.kind = opts.kind; else delete el.dataset.kind;
    if (opts.key) el.dataset.key = opts.key;
    try { layout(el); } catch (e) { /* تجاهل */ }
    if (hideTimer) hideTimer();
    hideTimer = armTimer(el, ttlFor(opts.text, opts.ttl, !!(opts.choices && opts.choices.length)), () => { this.hideBubble("timeout"); if (opts.onTimeout) opts.onTimeout(); });
    return el;
  },

  /** عنصر الفقاعة الحالية أو null. */
  current() { return bubbleEl; },

  /** هل الفقاعة الحالية هي هذا العنصر؟ */
  isCurrent(el) { return !!el && el === bubbleEl; },

  showMoment(opts) {
    this.hideMoment();
    this.hideBubble("replaced-by-moment");
    momentEl = build("moment", opts);
    document.body.appendChild(momentEl);
    const el = momentEl;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-in")));
    if (opts.confetti) confettiBurst();
    momentTimer = armTimer(el, ttlFor(opts.text, 5500), () => { this.hideMoment(); if (opts.onTimeout) opts.onTimeout(); });
    return el;
  },

  hideMoment() {
    if (momentTimer) { momentTimer(); momentTimer = null; }
    if (!momentEl) return;
    const el = momentEl; momentEl = null;
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 380);
  },

  hideAll() { this.hideBubble(); this.hideMoment(); },

  /** تنظيف كامل (مغادرة الصفحة): يفكّ المؤقتات والمستمعين ويزيل أي بطاقة. */
  destroy() { try { this.hideAll(); document.querySelectorAll(".barai-bubble, .barai-moment").forEach((n) => n.remove()); } catch (e) { /* تجاهل */ } },

  /** تغيير تعبير الفقاعة الحالية فقط. */
  setMood(mood) {
    if (!bubbleEl) return false;
    const old = bubbleEl.querySelector(".mascot");
    if (!old) return false;
    const fresh = mascotEl(mood, "is-xs rb-swap");
    old.replaceWith(fresh);
    bubbleEl.dataset.mood = mood;
    bubbleEl.dataset.tone = toneOfMood(mood);
    return true;
  },

  /** مدمج: يضيف برعي + جملة داخل حاوية. */
  inline(container, { text, mood, size = "sm" }) {
    const row = document.createElement("div");
    row.className = "barai-inline" + (size === "xs" ? " is-xs" : "");
    row.dataset.mood = mood;
    row.appendChild(mascotEl(mood));
    const p = document.createElement("p");
    p.className = "barai-inline-text";
    p.textContent = text;
    row.appendChild(p);
    container.appendChild(row);
    return row;
  },

  bubbleText() { return textOf(bubbleEl && bubbleEl.querySelector(".barai-text")); }
};
