/**
 * lessons.js — واجهة الطالب: مجموعات ← وحدات ← دروس فيديو
 * ------------------------------------------------------------
 * - الكتالوج يأتي جاهزًا من /api/lesson-catalog (منشور + مرحلة الطالب فقط).
 * - الفيديو يُشغَّل داخل مشغل المنصة (Modal) بنفس طريقة YouTube الحالية،
 *   وتُزال الـ iframe عند الإغلاق لإيقاف التشغيل.
 * - لا يوجد صوت ولا ملازم هنا.
 * ------------------------------------------------------------
 */

import { onReady, safeText, showToast, classifyLessonLink } from "./helpers.js";
import { requireStudent } from "./router.js";
import { getLessonCatalog, markLessonOpened } from "./api.js";
import { renderBottomNav } from "./components.js";
import { barai } from "./barai/safe.js";

/* ---------- العناصر ---------- */
const $ = (id) => document.getElementById(id);
let titleEl, subtitleEl, skeletonEl, viewEl, emptyEl, errorEl, retryBtn, bottomNavSlot;
let playerOverlay, playerTitleEl, playerBodyEl, playerCloseBtn, playerStatusEl, playerDescEl, prevBtn, nextBtn, listBtn;

/* ---------- الحالة ---------- */
let groups = [];            // الكتالوج
let nav = { g: "", u: "" }; // المجموعة/الوحدة المفتوحة
let ctx = [];               // قائمة الدروس المعروضة حاليًا (للسابق/التالي)
let ctxIndex = -1;
let loading = false;

/* ---------- أدوات DOM (textContent فقط) ---------- */
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);
const num = (n) => Number(n) || 0;

/** غلاف: تدرج + رسوم هندسية، ومع صورة إن وُجدت (https فقط) */
function cover(el, g) {
  el.classList.add("lc-cover");
  el.dataset.color = g.color || "indigo";
  const url = safeText(g.coverUrl);
  if (/^https:\/\//i.test(url)) {
    const img = document.createElement("img");
    img.className = "lc-cover-img";
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("load", () => { el.classList.add("has-img"); });
    img.addEventListener("error", () => img.remove());
    img.src = url;
    el.appendChild(img);
    el.appendChild(h("span", "lc-cover-shade"));
  }
}

function progressBar(done, total) {
  const wrap = h("div");
  const bar = h("div", "lc-progress");
  const fill = document.createElement("i");
  bar.appendChild(fill);
  requestAnimationFrame(() => { fill.style.width = pct(done, total) + "%"; });
  wrap.appendChild(bar);
  return wrap;
}

/* ---------- حالات العرض ---------- */
function show(which) {
  skeletonEl.style.display = which === "loading" ? "" : "none";
  viewEl.style.display = which === "view" ? "" : "none";
  emptyEl.style.display = which === "empty" ? "" : "none";
  errorEl.style.display = which === "error" ? "" : "none";
  if (which === "empty") { try { barai.empty(emptyEl, "empty.lessons"); } catch (e) { /* تجاهل */ } }
}

/* ---------- التنقل (hash) ---------- */
function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  nav = { g: safeText(p.get("g")), u: safeText(p.get("u")) };
}
function go(g, u) {
  const p = new URLSearchParams();
  if (g) p.set("g", g);
  if (u) p.set("u", u);
  const s = p.toString();
  history.pushState(null, "", s ? "#" + s : location.pathname + location.search);
  readHash();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function curGroup() { return groups.find((g) => g.id === nav.g) || null; }
function curUnit(g) { return g && nav.u ? (g.units.find((u) => u.id === nav.u) || null) : null; }

/* ---------- بطاقات ---------- */
function groupCard(g, i) {
  const card = h("button", "lc-card");
  card.type = "button";
  card.dataset.color = g.color;
  card.style.animationDelay = Math.min(i, 8) * 50 + "ms";

  const cv = h("div");
  cover(cv, g);
  cv.appendChild(h("h3", "", g.name));
  card.appendChild(cv);

  const body = h("div", "lc-body");
  if (g.description) body.appendChild(h("p", "lc-desc", g.description));
  const meta = h("div", "lc-meta");
  if (g.unitCount) meta.appendChild(h("span", "", `${g.unitCount} وحدة`));
  meta.appendChild(h("span", "", `${g.lessonCount} درس`));
  body.appendChild(meta);
  if (g.lessonCount > 0) {
    body.appendChild(progressBar(g.doneCount, g.lessonCount));
    body.appendChild(h("span", "lc-progress-label", `تم إنجاز ${pct(g.doneCount, g.lessonCount)}%`));
  }
  card.appendChild(body);
  card.addEventListener("click", () => go(g.id, ""));
  return card;
}

function lessonCard(lesson, list, idx) {
  const card = h("article", "ls-card");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.dataset.lessonId = lesson.id;

  const iconBox = h("div", "ls-card-icon");
  iconBox.setAttribute("aria-hidden", "true");
  iconBox.appendChild(h("span", "icon icon-video"));

  const body = h("div", "ls-card-body");
  body.appendChild(h("h3", "ls-card-title", safeText(lesson.title) || "درس"));
  const meta = h("p", "ls-card-meta", lesson.description ? lesson.description : "درس فيديو");
  body.appendChild(meta);
  if (lesson.done) body.appendChild(h("span", "lc-done", "✓ تمت المشاهدة"));

  const arrow = h("span", "ls-card-arrow", "←");
  arrow.setAttribute("aria-hidden", "true");
  card.append(iconBox, body, arrow);

  const open = () => { ctx = list; ctxIndex = idx; openLessonPlayer(lesson); };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  return card;
}

function lessonsList(list) {
  const wrap = h("div", "ls-list");
  list.forEach((l, i) => wrap.appendChild(lessonCard(l, list, i)));
  return wrap;
}

function emptyBox(title, text) {
  const b = h("div", "lc-empty");
  b.appendChild(h("b", "", title));
  b.appendChild(document.createTextNode(text));
  return b;
}

function backButton(label, fn) {
  const b = h("button", "lc-back", "→ " + label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}

/* ---------- الشاشات ---------- */
function renderGroups() {
  titleEl.textContent = "الدروس";
  subtitleEl.textContent = `${groups.length} ${groups.length === 1 ? "منهج متاح" : "مناهج متاحة"}`;
  viewEl.replaceChildren();
  const grid = h("div", "lc-grid");
  groups.forEach((g, i) => grid.appendChild(groupCard(g, i)));
  viewEl.appendChild(grid);
}

function renderGroup(g) {
  titleEl.textContent = g.name;
  subtitleEl.textContent = `${g.lessonCount} درس`;
  viewEl.replaceChildren();
  viewEl.appendChild(backButton("كل المناهج", () => go("", "")));

  const hero = h("section", "lc-hero");
  cover(hero, g);
  hero.appendChild(h("h2", "", g.name));
  if (g.description) hero.appendChild(h("p", "", g.description));
  if (g.lessonCount > 0) {
    hero.appendChild(progressBar(g.doneCount, g.lessonCount));
    hero.appendChild(h("p", "", `${g.doneCount} من ${g.lessonCount} — ${pct(g.doneCount, g.lessonCount)}%`));
  }
  viewEl.appendChild(hero);

  if (g.units.length) {
    const t = h("div", "lc-section-title", "الوحدات");
    t.appendChild(h("small", "", `(${g.units.length})`));
    viewEl.appendChild(t);
    const stack = h("div", "lc-stack");
    stack.dataset.color = g.color;
    g.units.forEach((u, i) => {
      const b = h("button", "lc-unit");
      b.type = "button";
      b.style.animationDelay = Math.min(i, 8) * 50 + "ms";
      b.appendChild(h("div", "lc-unit-num", String(i + 1)));
      const body = h("div", "lc-unit-body");
      body.appendChild(h("h4", "", u.name));
      body.appendChild(h("p", "", `${u.lessonCount} درس` + (u.lessonCount ? ` — تم ${u.doneCount}` : "")));
      b.append(body, h("span", "ls-card-arrow", "←"));
      b.addEventListener("click", () => go(g.id, u.id));
      stack.appendChild(b);
    });
    viewEl.appendChild(stack);
  }

  if (g.lessons.length) {
    const t = h("div", "lc-section-title", g.units.length ? "دروس المنهج" : "الدروس");
    t.appendChild(h("small", "", `(${g.lessons.length})`));
    viewEl.appendChild(t);
    viewEl.appendChild(lessonsList(g.lessons));
  }

  if (!g.units.length && !g.lessons.length) {
    viewEl.appendChild(emptyBox("لا توجد دروس بعد", "هيتم إضافة الفيديوهات قريبًا."));
  }
}

function renderUnit(g, u) {
  titleEl.textContent = u.name;
  subtitleEl.textContent = g.name;
  viewEl.replaceChildren();
  viewEl.appendChild(backButton(g.name, () => go(g.id, "")));
  if (u.description) viewEl.appendChild(h("p", "lc-crumbs", u.description));
  if (!u.lessons.length) viewEl.appendChild(emptyBox("الوحدة فارغة حاليًا", "هتظهر الدروس هنا عند إضافتها."));
  else viewEl.appendChild(lessonsList(u.lessons));
}

function render() {
  if (!groups.length) { show("empty"); return; }
  const g = curGroup();
  const u = curUnit(g);
  if (nav.g && !g) { nav = { g: "", u: "" }; }          // معرّف غير متاح للطالب → الرئيسية
  else if (nav.u && !u) { nav.u = ""; }                  // وحدة غير متاحة → المجموعة
  const gg = curGroup();
  const uu = curUnit(gg);
  if (uu) renderUnit(gg, uu);
  else if (gg) renderGroup(gg);
  else renderGroups();
  show("view");
}

/* ---------- التحميل ---------- */
async function load() {
  if (loading) return;
  loading = true;
  show("loading");
  const result = await getLessonCatalog();
  loading = false;
  if (!result || !result.success) { show("error"); return; }
  groups = Array.isArray(result.data && result.data.groups) ? result.data.groups.map(normGroup) : [];
  readHash();
  render();
  try { barai.notify("lessons.open"); barai.settle(); } catch (e) { /* تجاهل */ }
}

/** يطوي الدروس المتطابقة (نفس العنوان والرابط) التي تنتج عن ضغطة إضافة مكررة */
function dedupe(list) {
  const seen = new Set();
  return list.filter((l) => {
    const k = safeText(l.title).trim() + "|" + safeText(l.url || l.youtubeUrl).trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
const doneOf = (list) => list.filter((l) => l.done).length;

function normGroup(g) {
  const units = (Array.isArray(g.units) ? g.units : []).map((u) => {
    const lessons = dedupe(Array.isArray(u.lessons) ? u.lessons : []);
    return { ...u, lessons, lessonCount: lessons.length, doneCount: doneOf(lessons) };
  });
  const lessons = dedupe(Array.isArray(g.lessons) ? g.lessons : []);
  const all = lessons.concat(...units.map((u) => u.lessons));
  return { ...g, units, lessons, unitCount: units.length, lessonCount: all.length, doneCount: doneOf(all) };
}

/* ---------- المشغل ---------- */
function updatePlayerNav() {
  prevBtn.disabled = ctxIndex <= 0;
  nextBtn.disabled = ctxIndex < 0 || ctxIndex >= ctx.length - 1;
  prevBtn.style.visibility = ctx.length > 1 ? "" : "hidden";
  nextBtn.style.visibility = ctx.length > 1 ? "" : "hidden";
}

function openLessonPlayer(lesson) {
  try { barai.busy(true); } catch (e) { /* تجاهل */ }
  const title = safeText(lesson && lesson.title) || "درس";
  const url = safeText(lesson && (lesson.url || lesson.youtubeUrl));
  const link = classifyLessonLink(url);
  if (!link.open) { showToast("الرابط غير صالح. تواصل مع الإدارة.", "error"); return; }

  playerTitleEl.textContent = title;
  playerBodyEl.replaceChildren();

  if (link.mode === "embed") {
    const iframe = document.createElement("iframe");
    iframe.src = link.src;
    iframe.setAttribute("title", title);
    iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    iframe.setAttribute("loading", "lazy");
    playerBodyEl.appendChild(iframe);
  }
  const wrap = h("div");
  wrap.style.cssText = "text-align:center;";
  const a = h("a", "btn btn-primary ls-open-link", link.mode === "embed" ? "لو مش بيشتغل: افتح في صفحة جديدة" : "فتح الفيديو");
  a.href = link.open; a.target = "_blank"; a.rel = "noopener noreferrer";
  a.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;margin:12px;";
  wrap.appendChild(a);
  playerBodyEl.appendChild(wrap);

  playerDescEl.textContent = safeText(lesson.description);
  playerDescEl.style.display = lesson.description ? "" : "none";
  setStatus(lesson);
  updatePlayerNav();

  /* تسجيل المشاهدة في الخلفية؛ فشله لا يمنع التشغيل */
  if (lesson && lesson.id) {
    markLessonOpened(lesson.id).then((r) => {
      if (r && r.success) markDone(lesson);
    }).catch(() => {});
  }
  try { if (lesson && lesson.id) barai.task("lesson", { id: String(lesson.id), title }); } catch (e) { /* تجاهل */ }

  playerOverlay.classList.add("is-open");
  playerOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => playerCloseBtn && playerCloseBtn.focus(), 100);
}

function setStatus(lesson) {
  playerStatusEl.replaceChildren();
  if (lesson.done) playerStatusEl.appendChild(h("span", "lc-done", "✓ تمت المشاهدة"));
}

/** تحديث محلي للتقدم بعد نجاح التسجيل (بدون إعادة تحميل) */
function markDone(lesson) {
  if (lesson.done) return;
  lesson.done = true;
  groups.forEach((g) => {
    const inGroup = g.lessons.some((l) => l.id === lesson.id);
    const unit = g.units.find((u) => u.lessons.some((l) => l.id === lesson.id));
    if (unit) { unit.doneCount += 1; }
    if (inGroup || unit) { g.doneCount += 1; }
  });
  groups.forEach((g) => g.lessons.concat(...g.units.map((u) => u.lessons)).forEach((l) => { if (l.id === lesson.id) l.done = true; }));
  setStatus(lesson);
}

function closeLessonPlayer(refresh = true) {
  try { barai.busy(false); } catch (e) { /* تجاهل */ }
  playerBodyEl.replaceChildren();          // إزالة iframe لإيقاف الفيديو
  playerOverlay.classList.remove("is-open");
  playerOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (refresh) render();                   // تحديث حالة المشاهدة/النسب
}

function step(d) {
  const i = ctxIndex + d;
  if (i < 0 || i >= ctx.length) return;
  ctxIndex = i;
  openLessonPlayer(ctx[i]);
}

function bindEvents() {
  retryBtn.addEventListener("click", load);
  playerCloseBtn.addEventListener("click", () => closeLessonPlayer());
  listBtn.addEventListener("click", () => closeLessonPlayer());
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  playerOverlay.addEventListener("click", (e) => { if (e.target === playerOverlay) closeLessonPlayer(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playerOverlay.classList.contains("is-open")) closeLessonPlayer();
  });
  window.addEventListener("popstate", () => { if (groups.length) { readHash(); render(); } });
}

async function init() {
  try { barai.ambientMount(".ls-header-icon", "reading"); } catch (e) { /* تجاهل */ }
  const session = requireStudent();
  if (!session) return;

  titleEl = $("lsTitle"); subtitleEl = $("lsSubtitle"); skeletonEl = $("lsSkeleton");
  viewEl = $("lsView"); emptyEl = $("lsEmpty"); errorEl = $("lsError"); retryBtn = $("lsRetryBtn");
  bottomNavSlot = $("bottomNavSlot");
  playerOverlay = $("lsPlayerOverlay"); playerTitleEl = $("lsPlayerTitle"); playerBodyEl = $("lsPlayerBody");
  playerCloseBtn = $("lsPlayerCloseBtn"); playerStatusEl = $("lsPlayerStatus"); playerDescEl = $("lsPlayerDesc");
  prevBtn = $("lsPrevBtn"); nextBtn = $("lsNextBtn"); listBtn = $("lsListBtn");

  bottomNavSlot.replaceChildren();
  bottomNavSlot.appendChild(renderBottomNav());
  bindEvents();
  await load();
}

onReady(init);
