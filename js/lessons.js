/**
 * lessons.js
 * ------------------------------------------------------------
 * منصة أ/ إسماعيل عماد التعليمية
 * تشغيل صفحة lessons.html
 *
 * المكان: /js/lessons.js
 *
 * المرجع:
 *   - الوثيقة الأصلية (بنود 31، 32، 33، 34، 60، 80، 81، 125، 149، 177)
 *   - Master Design System (بنود 18، 19، 20، 21، 33، 34، 35، 36، 60)
 *
 * ⚠️ قواعد:
 *   - YouTube URL يُتحقق منه دائمًا (بند 125).
 *   - الفيديو يُشغَّل داخل المنصة عبر Modal (بند 60 من Design System).
 *   - إزالة الـ iframe عند الإغلاق لإيقاف التشغيل.
 *
 * ⚠️ حالة الملف:
 *   - WORKER_URL = PLACEHOLDER_WORKER_URL (البند 207).
 *   - getLessons سترجع NETWORK_ERROR حتى بناء الـ Worker.
 *   - سيظهر Error State مع زر إعادة المحاولة.
 * ------------------------------------------------------------
 */

import {
  onReady,
  safeText,
  showToast,
  classifyLessonLink
} from "./helpers.js";

import { requireStudent } from "./router.js";

import { getLessons, markLessonOpened } from "./api.js";

import { renderBottomNav } from "./components.js";


import { barai } from "./barai/safe.js";

/* ============================================================
   01 — المرجع للعناصر
   ============================================================ */

let subtitleEl       = null;
let tabsWrapEl       = null;
let tabsEl           = null;
let skeletonEl       = null;
let listEl           = null;
let emptyEl          = null;
let emptyTitleEl     = null;
let errorEl          = null;
let retryBtn         = null;
let bottomNavSlot    = null;

// Player
let playerOverlay    = null;
let playerTitleEl    = null;
let playerBodyEl     = null;
let playerCloseBtn   = null;


/* ============================================================
   02 — الحالة
   ============================================================ */

/** النوع النشط حاليًا */
let currentKind = "audio"; // "audio" | "notes"

/** الدروس المحمّلة حاليًا */
let currentLessons = [];

/** حالة التحميل */
let isLoading = false;


/* ============================================================
   03 — تجميع العناصر
   ============================================================ */

function cacheElements() {
  subtitleEl     = document.getElementById("lsSubtitle");
  tabsWrapEl     = document.querySelector(".ls-tabs-wrap");
  tabsEl         = document.querySelector(".ls-tabs");
  skeletonEl     = document.getElementById("lsSkeleton");
  listEl         = document.getElementById("lsList");
  emptyEl        = document.getElementById("lsEmpty");
  emptyTitleEl   = document.getElementById("lsEmptyTitle");
  errorEl        = document.getElementById("lsError");
  retryBtn       = document.getElementById("lsRetryBtn");
  bottomNavSlot  = document.getElementById("bottomNavSlot");

  playerOverlay  = document.getElementById("lsPlayerOverlay");
  playerTitleEl  = document.getElementById("lsPlayerTitle");
  playerBodyEl   = document.getElementById("lsPlayerBody");
  playerCloseBtn = document.getElementById("lsPlayerCloseBtn");
}


/* ============================================================
   04 — إدارة الحالات
   المرجع: Master Design System — بنود 34، 35، 36
   ============================================================ */

function showLoading() {
  if (skeletonEl) skeletonEl.style.display = "";
  if (listEl)     listEl.style.display = "none";
  if (emptyEl)    emptyEl.style.display = "none";
  if (errorEl)    errorEl.style.display = "none";
}

function showList() {
  if (skeletonEl) skeletonEl.style.display = "none";
  if (listEl)     listEl.style.display = "";
  if (emptyEl)    emptyEl.style.display = "none";
  if (errorEl)    errorEl.style.display = "none";
}

function showEmpty(kind) {
  if (emptyTitleEl) {
    emptyTitleEl.textContent = kind === "audio"
      ? "لا توجد تسجيلات صوتية متاحة حاليًا"
      : "لا توجد ملازم متاحة حاليًا";
  }

  if (skeletonEl) skeletonEl.style.display = "none";
  if (listEl)     listEl.style.display = "none";
  if (emptyEl)    emptyEl.style.display = "";
  try { barai.empty(emptyEl, "empty.lessons"); } catch (e) { /* تجاهل */ }
  if (errorEl)    errorEl.style.display = "none";
}

function showError() {
  if (skeletonEl) skeletonEl.style.display = "none";
  if (listEl)     listEl.style.display = "none";
  if (emptyEl)    emptyEl.style.display = "none";
  if (errorEl)    errorEl.style.display = "";
}


/* ============================================================
   05 — التابات
   المرجع: Master Design System — بند 18
   ============================================================ */

/**
 * تحديث شكل التابات حسب النوع النشط.
 * @param {"video"|"audio"} kind
 */
function updateTabsUI(kind) {
  if (!tabsEl) return;

  tabsEl.querySelectorAll(".ls-tab").forEach((tab) => {
    const isActive = tab.dataset.kind === kind;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

/**
 * ربط أحداث التابات.
 */
function bindTabsEvents() {
  if (!tabsEl) return;

  tabsEl.querySelectorAll(".ls-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const kind = safeText(tab.dataset.kind);
      if (!kind || kind === currentKind) return;

      currentKind = kind;
      updateTabsUI(kind);
      loadLessonsForCurrentKind();
    });
  });
}


/* ============================================================
   06 — كارت الدرس
   المرجع: Master Design System — بند 19
   ============================================================ */

/**
 * بناء كارت درس.
 * @param {Object} lesson
 * @returns {HTMLElement}
 */
function createLessonCard(lesson) {
  const id       = safeText(lesson && lesson.id);
  const title    = safeText(lesson && lesson.title) || "درس";
  const kind     = safeText(lesson && lesson.kind) || currentKind;

  const card = document.createElement("article");
  card.className = "ls-card" + (kind === "audio" ? " is-audio" : "");
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.dataset.lessonId = id;

  // أيقونة
  const iconBox = document.createElement("div");
  iconBox.className = "ls-card-icon";
  iconBox.setAttribute("aria-hidden", "true");
  const iconGlyph = document.createElement("span");
  iconGlyph.className = "icon " + (kind === "audio" ? "icon-headphones" : kind === "notes" ? "icon-books" : "icon-video");
  iconGlyph.setAttribute("aria-hidden", "true");
  iconBox.appendChild(iconGlyph);

  // Body
  const body = document.createElement("div");
  body.className = "ls-card-body";

  const titleEl = document.createElement("h3");
  titleEl.className = "ls-card-title";
  titleEl.textContent = title;

  const metaEl = document.createElement("p");
  metaEl.className = "ls-card-meta";
  metaEl.textContent = kind === "audio" ? "تسجيل صوتي" : kind === "notes" ? "ملزمة / ورق شرح" : "درس فيديو";

  body.appendChild(titleEl);
  body.appendChild(metaEl);

  // سهم
  const arrow = document.createElement("span");
  arrow.className = "ls-card-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "←";

  card.appendChild(iconBox);
  card.appendChild(body);
  card.appendChild(arrow);

  // الأحداث
  const open = () => openLessonPlayer(lesson);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });

  return card;
}

/**
 * عرض كل الدروس.
 */
function renderLessons() {
  if (!listEl) return;

  listEl.replaceChildren();

  currentLessons.forEach((lesson) => {
    listEl.appendChild(createLessonCard(lesson));
  });
}


/* ============================================================
   07 — تحميل الدروس
   المرجع: الوثيقة الأصلية — بنود 31، 32، 33، 34
   ============================================================ */

async function loadLessonsForCurrentKind() {
  if (isLoading) return;
  isLoading = true;

  showLoading();

  const result = await getLessons({ kind: currentKind });

  isLoading = false;

  if (!result || !result.success) {
    showError();
    return;
  }

  const list = (result.data && Array.isArray(result.data.lessons))
    ? result.data.lessons
    : [];

  // فلترة إضافية حسب النوع (أمان مزدوج — البند 34)
  currentLessons = list.filter((l) => {
    if (!l || typeof l !== "object") return false;
    const k = safeText(l.kind);
    return k === currentKind;
  });

  if (currentLessons.length === 0) {
    showEmpty(currentKind);
    return;
  }

  // تحديث الـ subtitle
  if (subtitleEl) {
    subtitleEl.textContent = `${currentLessons.length} درس متاح`;
  }

  renderLessons();
  showList();
  try { barai.notify("lessons.open"); barai.settle(); } catch (e) { /* تجاهل */ }   // مساعدة/عودة لدرس سابق (من سجل محلي)
}


/* ============================================================
   08 — Player Modal
   المرجع: Master Design System — بند 60
   ============================================================ */

/**
 * فتح مشغل الدرس.
 * @param {Object} lesson
 */
function openLessonPlayer(lesson) {
  try { barai.busy(true); } catch (e) { /* تجاهل */ }
  if (!playerOverlay || !playerBodyEl || !playerTitleEl) return;

  const title    = safeText(lesson && lesson.title) || "درس";
  const kind     = safeText(lesson && lesson.kind) || "audio";
  const url      = safeText(lesson && (lesson.url || lesson.youtubeUrl));
  const link     = classifyLessonLink(url);

  if (!link.open) {
    showToast("الرابط غير صالح. تواصل مع الإدارة.", "error");
    return;
  }

  playerTitleEl.textContent = title;
  playerBodyEl.replaceChildren();

  const mkOpenBtn = (label) => {
    const a = document.createElement("a");
    a.className = "btn btn-primary ls-open-link";
    a.href = link.open;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    a.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;margin:12px;";
    return a;
  };

  if (link.mode === "audio") {
    // ملف صوت مباشر: مشغّل المتصفح الأصلي (أضمن على الموبايل)
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:24px 16px;text-align:center;";
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = link.src;
    audio.style.cssText = "width:100%;";
    audio.setAttribute("aria-label", title);
    wrap.appendChild(audio);
    wrap.appendChild(mkOpenBtn(kind === "notes" ? "فتح الملف" : "لو مش بيشتغل: افتح التسجيل"));
    playerBodyEl.appendChild(wrap);
  } else if (link.mode === "embed") {
    const iframe = document.createElement("iframe");
    iframe.src = link.src;
    iframe.setAttribute("title", title);
    iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("loading", "lazy");
    playerBodyEl.appendChild(iframe);
    // زر احتياطي لو العرض المدمج مش شغال على موبايل الطالب
    const wrap = document.createElement("div");
    wrap.style.cssText = "text-align:center;";
    wrap.appendChild(mkOpenBtn(kind === "notes" ? "فتح الملزمة في صفحة جديدة" : "لو مش بيشتغل: افتح في صفحة جديدة"));
    playerBodyEl.appendChild(wrap);
  } else {
    // أي رابط آخر (PDF مباشر مثلًا): زر فتح في تبويب جديد — يعمل على كل الأجهزة
    const wrap = document.createElement("div");
    wrap.style.cssText = "padding:32px 16px;text-align:center;";
    const p = document.createElement("p");
    p.textContent = kind === "notes" ? "اضغط لفتح الملزمة أو تحميلها." : "اضغط لفتح التسجيل.";
    p.style.cssText = "margin:0 0 8px;font-weight:700;";
    wrap.appendChild(p);
    wrap.appendChild(mkOpenBtn(kind === "notes" ? "فتح الملزمة" : "فتح التسجيل"));
    playerBodyEl.appendChild(wrap);
  }

  // تسجيل فتح الدرس في الخلفية؛ فشل التسجيل لا يمنع تشغيل الدرس.
  if (lesson && lesson.id) {
    markLessonOpened(lesson.id).catch(() => {});
  }
  try { if (lesson && lesson.id) barai.task("lesson", { id: String(lesson.id), title: title }); } catch (e) { /* تجاهل */ }   // ذاكرة محلية فقط: للعودة لنفس الدرس

  // إظهار
  playerOverlay.classList.add("is-open");
  playerOverlay.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";

  // زر الإغلاق في التركيز (للوصولية)
  if (playerCloseBtn) {
    setTimeout(() => playerCloseBtn.focus(), 100);
  }
}

/**
 * إغلاق مشغل الدرس.
 * - إزالة الـ iframe لإيقاف التشغيل.
 */
function closeLessonPlayer() {
  try { barai.busy(false); } catch (e) { /* تجاهل */ }
  if (!playerOverlay || !playerBodyEl) return;

  // إزالة الـ iframe فورًا لإيقاف الصوت/الفيديو
  playerBodyEl.replaceChildren();

  playerOverlay.classList.remove("is-open");
  playerOverlay.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";
}


/* ============================================================
   09 — ربط أحداث الـ Player
   ============================================================ */

function bindPlayerEvents() {
  if (playerCloseBtn) {
    playerCloseBtn.addEventListener("click", closeLessonPlayer);
  }

  if (playerOverlay) {
    playerOverlay.addEventListener("click", (e) => {
      if (e.target === playerOverlay) closeLessonPlayer();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playerOverlay && playerOverlay.classList.contains("is-open")) {
      closeLessonPlayer();
    }
  });
}


/* ============================================================
   10 — Bottom Navigation
   ============================================================ */

function mountBottomNav() {
  if (!bottomNavSlot) return;
  bottomNavSlot.replaceChildren();
  bottomNavSlot.appendChild(renderBottomNav());
}


/* ============================================================
   11 — ربط أحداث عامة
   ============================================================ */

function bindEvents() {
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      loadLessonsForCurrentKind();
    });
  }
}


/* ============================================================
   12 — التهيئة
   ============================================================ */

async function init() {
  try { barai.ambientMount(".ls-header-icon", "reading"); } catch (e) { /* تجاهل */ }
  // حماية
  const session = requireStudent();
  if (!session) return;

  cacheElements();

  mountBottomNav();

  bindTabsEvents();
  bindPlayerEvents();
  bindEvents();

  // تحميل التسجيلات الصوتية افتراضيًا
  currentKind = "audio";
  updateTabsUI(currentKind);

  await loadLessonsForCurrentKind();
}


/* ============================================================
   13 — التشغيل
   ============================================================ */

onReady(init);