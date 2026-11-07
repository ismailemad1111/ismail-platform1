/**
 * admin-lessons.js — إدارة المجموعات التعليمية ← الوحدات ← دروس الفيديو
 * الحماية الحقيقية في الباك إند وقواعد Firestore؛ هذه واجهة فقط.
 */
import { onReady, safeText, showToast, debounce, extractYouTubeID } from "./helpers.js";
import { requireAdmin } from "./router.js";
import { backendRequest } from "./backend/index.js";

const STAGE_NAMES = {
  grade_4: "الرابع الابتدائي", grade_5: "الخامس الابتدائي", grade_6: "السادس الابتدائي",
  prep_1: "الأول الإعدادي", prep_2: "الثاني الإعدادي", prep_3: "الثالث الإعدادي",
  sec_1: "الأول الثانوي", sec_2: "الثاني الثانوي", sec_3: "الثالث الثانوي"
};
const stageName = (k) => STAGE_NAMES[safeText(k)] || "—";
const NONE = "__none";   // مجموعة افتراضية للدروس غير المصنفة (قديمة)

const $ = (id) => document.getElementById(id);
const api = (m, p, body) => backendRequest(p, { method: m, body });

let groups = [], units = [], lessons = [];
let stageFilter = "all", search = "", openGroup = "";
let editingGroup = null, editingUnit = null, editingLesson = null, unitForGroup = "";
let moveId = null, confirmFn = null, busy = false;
let pickedColor = "indigo";

/* ---------- DOM ---------- */
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function btn(label, cls, fn) {
  const b = h("button", "lca-btn is-sm " + (cls || ""), label);
  b.type = "button";
  b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
  return b;
}
const openM = (id) => { const m = $(id); m.classList.add("is-open"); m.setAttribute("aria-hidden", "false"); };
const closeM = (id) => { const m = $(id); m.classList.remove("is-open"); m.setAttribute("aria-hidden", "true"); };

/* ---------- نوع الدرس (يصلح تصنيف notes) ---------- */
const kindOf = (l) => (l.kind === "audio" || l.kind === "notes") ? l.kind : "video";
const isVideo = (l) => kindOf(l) === "video";
const KIND_LABEL = { audio: "صوت (قديم)", notes: "ملزمة (قديمة)" };

/* ---------- تحميل ---------- */
function state(which) {
  $("lsSkeleton").style.display = which === "loading" ? "" : "none";
  $("lsError").style.display = which === "error" ? "" : "none";
  $("lsEmpty").style.display = which === "empty" ? "" : "none";
  $("lsGroupGrid").style.display = which === "grid" ? "" : "none";
  $("lsGroupView").style.display = which === "group" ? "" : "none";
  $("lsHome").style.display = (which === "group") ? "none" : "";
}

async function load() {
  state("loading");
  const [g, u, l] = await Promise.all([
    api("GET", "/api/admin/lesson-groups"), api("GET", "/api/admin/lesson-units"), api("GET", "/api/admin/lessons")
  ]);
  if (![g, u, l].every((r) => r && r.success)) { state("error"); return; }
  groups = g.data.groups; units = u.data.units; lessons = l.data.lessons;
  render();
}

function render() {
  const videos = lessons.filter(isVideo).length;
  $("statGroups").textContent = groups.length;
  $("statUnits").textContent = units.length;
  $("statVideos").textContent = videos;
  if (openGroup) return renderGroupView();
  $("lsHeaderTitle").textContent = "الدروس";
  renderHome();
}

/* ---------- الرئيسية ---------- */
function unitsOf(gid) { return units.filter((u) => u.lessonGroupId === gid).sort((a, b) => a.order - b.order); }
function lessonsOf(gid, uid) {
  return lessons.filter((l) => (l.lessonGroupId || NONE) === gid && (uid === undefined || (l.unitId || "") === uid))
    .sort((a, b) => a.order - b.order);
}
const loose = () => lessons.filter((l) => !l.lessonGroupId);

function groupCard(g, i) {
  const card = h("article", "lc-card lca-card");
  card.dataset.color = g.color; card.style.animationDelay = Math.min(i, 8) * 40 + "ms";
  const cv = h("div");
  cv.classList.add("lc-cover");
  if (/^https:\/\//i.test(g.coverUrl || "")) {
    const img = document.createElement("img"); img.className = "lc-cover-img"; img.alt = ""; img.loading = "lazy";
    img.referrerPolicy = "no-referrer"; img.addEventListener("load", () => cv.classList.add("has-img")); img.addEventListener("error", () => img.remove());
    img.src = g.coverUrl; cv.append(img, h("span", "lc-cover-shade"));
  }
  cv.appendChild(h("span", "lc-badge" + (g.active ? "" : " is-draft"), g.active ? "منشورة" : "مسودة"));
  cv.appendChild(h("h3", "", g.name));
  cv.addEventListener("click", () => enterGroup(g.id));
  card.appendChild(cv);
  const body = h("div", "lc-body");
  if (g.description) body.appendChild(h("p", "lc-desc", g.description));
  const meta = h("div", "lc-meta");
  meta.append(h("span", "", stageName(g.stage)), h("span", "", `${g.unitCount} وحدة`), h("span", "", `${g.lessonCount} درس`));
  body.appendChild(meta);
  card.appendChild(body);
  const act = h("div", "lca-card-actions");
  act.append(
    btn("فتح", "is-primary", () => enterGroup(g.id)),
    btn("تعديل", "", () => openGroupModal(g)),
    btn(g.active ? "إخفاء" : "نشر", "", () => togglePublish("groups", g)),
    btn("↑", "", () => moveItem("groups", g.id, -1)),
    btn("↓", "", () => moveItem("groups", g.id, 1)),
    btn("حذف", "is-danger", () => askDeleteGroup(g))
  );
  card.appendChild(act);
  return card;
}

function renderHome() {
  const q = search.toLowerCase();
  let list = groups.filter((g) => stageFilter === "all" || g.stage === stageFilter);
  if (q) {
    list = list.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      unitsOf(g.id).some((u) => u.name.toLowerCase().includes(q)) ||
      lessonsOf(g.id).some((l) => l.title.toLowerCase().includes(q)));
  }
  const grid = $("lsGroupGrid");
  grid.replaceChildren();
  list.forEach((g, i) => grid.appendChild(groupCard(g, i)));

  /* دروس قديمة بلا مجموعة: بطاقة افتراضية حتى لا تضيع من الإدارة */
  const lo = loose();
  if (lo.length && stageFilter === "all" && !q) {
    const card = h("article", "lc-card lca-card");
    card.dataset.color = "slate";
    const cv = h("div", "lc-cover"); cv.appendChild(h("h3", "", "دروس غير مصنفة"));
    cv.addEventListener("click", () => enterGroup(NONE));
    card.appendChild(cv);
    const body = h("div", "lc-body");
    body.appendChild(h("p", "lc-desc", "دروس قديمة أو بلا مجموعة. انقلها إلى مجموعة لتظهر ضمن منهج."));
    const meta = h("div", "lc-meta"); meta.appendChild(h("span", "", `${lo.length} درس`)); body.appendChild(meta);
    card.appendChild(body);
    const act = h("div", "lca-card-actions"); act.appendChild(btn("فتح", "is-primary", () => enterGroup(NONE))); card.appendChild(act);
    grid.appendChild(card);
  }

  if (!groups.length && !lo.length) {
    $("lsEmptyTitle").textContent = "لا توجد مجموعات بعد";
    $("lsEmptyText").textContent = "أنشئ أول مجموعة تعليمية (مثل: منهج الشهر الأول) ثم أضف إليها الفيديوهات.";
    return state("empty");
  }
  if (!grid.children.length) {
    $("lsEmptyTitle").textContent = "لا نتائج مطابقة";
    $("lsEmptyText").textContent = "جرّب كلمة بحث أو مرحلة أخرى.";
    return state("empty");
  }
  state("grid");
}

/* ---------- داخل المجموعة ---------- */
function enterGroup(id) { openGroup = id; render(); window.scrollTo({ top: 0 }); }
function leaveGroup() { openGroup = ""; render(); }

function lessonRow(l, siblings) {
  const row = h("div", "lca-lesson");
  const th = h("div", "lca-lesson-thumb");
  const vid = isVideo(l) ? extractYouTubeID(l.url) : null;
  if (vid) {
    const img = document.createElement("img"); img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
    img.src = `https://img.youtube.com/vi/${vid}/mqdefault.jpg`; img.addEventListener("error", () => { img.remove(); th.textContent = "🎬"; });
    th.appendChild(img);
  } else th.textContent = "🎬";
  const info = h("div", "lca-lesson-info");
  info.appendChild(h("b", "", l.title));
  const tags = h("small");
  tags.appendChild(h("span", "lca-tag " + (l.active ? "is-live" : "is-draft"), l.active ? "منشور" : "مسودة"));
  if (!isVideo(l)) tags.appendChild(h("span", "lca-tag is-legacy", KIND_LABEL[kindOf(l)]));
  tags.appendChild(document.createTextNode(`#${l.order}`));
  info.appendChild(tags);
  const act = h("div", "lca-row-actions");
  const i = siblings.indexOf(l);
  act.append(
    btn("تعديل", "", () => openLessonModal(l)),
    btn("نقل", "", () => openMove(l)),
    btn(l.active ? "إخفاء" : "نشر", "", () => togglePublish("lessons", l)),
    btn("↑", "", () => reorderLessons(siblings, i, -1)),
    btn("↓", "", () => reorderLessons(siblings, i, 1)),
    btn("حذف", "is-danger", () => confirm_(`حذف الدرس «${l.title}» نهائيًا؟`, async () => { await run(api("DELETE", `/api/admin/lessons/${l.id}`), "تم حذف الدرس"); }))
  );
  row.append(th, info, act);
  return row;
}

function lessonsBlock(list) {
  const wrap = h("div", "lca-lessons");
  if (!list.length) wrap.appendChild(h("div", "lc-empty", "لا توجد فيديوهات هنا بعد."));
  list.forEach((l) => wrap.appendChild(lessonRow(l, list)));
  return wrap;
}

function renderGroupView() {
  const v = $("lsGroupView"); v.replaceChildren();
  const virtual = openGroup === NONE;
  const g = virtual ? { id: NONE, name: "دروس غير مصنفة", description: "", color: "slate", stage: "", active: true } : groups.find((x) => x.id === openGroup);
  if (!g) { openGroup = ""; return renderHome(); }
  $("lsHeaderTitle").textContent = g.name;

  const back = h("button", "lc-back", "→ كل المجموعات"); back.type = "button"; back.addEventListener("click", leaveGroup);
  v.appendChild(back);

  const hero = h("section", "lc-hero lc-cover"); hero.dataset.color = g.color;
  hero.append(h("h2", "", g.name));
  if (g.description) hero.appendChild(h("p", "", g.description));
  if (!virtual) {
    hero.appendChild(h("p", "", `${stageName(g.stage)} — ${g.active ? "منشورة" : "مسودة"}`));
    const ha = h("div", "lca-hero-actions");
    ha.append(
      btn("+ إنشاء وحدة", "", () => openUnitModal(null, g.id)),
      btn("+ إضافة فيديو", "", () => openLessonModal(null, { groupId: g.id })),
      btn("تعديل المجموعة", "", () => openGroupModal(g))
    );
    hero.appendChild(ha);
  }
  v.appendChild(hero);

  const us = virtual ? [] : unitsOf(g.id);
  us.forEach((u, i) => {
    const box = h("section", "lca-unit-box");
    const head = h("div", "lca-unit-head");
    const t = h("div"); const h4 = h("h4", "", u.name);
    h4.appendChild(h("span", "lca-tag " + (u.active ? "is-live" : "is-draft"), u.active ? "منشورة" : "مسودة"));
    t.appendChild(h4); if (u.description) t.appendChild(h("p", "", u.description));
    const act = h("div", "lca-row-actions");
    act.append(
      btn("+ فيديو", "is-primary", () => openLessonModal(null, { groupId: g.id, unitId: u.id })),
      btn("تعديل", "", () => openUnitModal(u, g.id)),
      btn(u.active ? "إخفاء" : "نشر", "", () => togglePublish("units", u)),
      btn("↑", "", () => moveUnit(us, i, -1)), btn("↓", "", () => moveUnit(us, i, 1)),
      btn("حذف", "is-danger", () => confirm_(`حذف الوحدة «${u.name}»؟ دروسها لن تُحذف، وستنتقل إلى المجموعة مباشرة.`, async () => { await run(api("DELETE", `/api/admin/lesson-units/${u.id}`), "تم حذف الوحدة"); }))
    );
    head.append(t, act); box.appendChild(head);
    box.appendChild(lessonsBlock(lessonsOf(g.id, u.id)));
    v.appendChild(box);
  });

  const direct = lessonsOf(g.id, "");
  if (direct.length || !us.length) {
    const box = h("section", "lca-unit-box");
    const head = h("div", "lca-unit-head");
    head.appendChild(h("h4", "", us.length ? "دروس مباشرة في المجموعة" : "الدروس"));
    if (!virtual) head.appendChild(btn("+ إضافة فيديو", "is-primary", () => openLessonModal(null, { groupId: g.id })));
    box.appendChild(head); box.appendChild(lessonsBlock(direct));
    v.appendChild(box);
  }
  state("group");
}

/* ---------- عمليات مشتركة ---------- */
async function run(promise, okMsg) {
  if (busy) return false;
  busy = true;
  try {
    const r = await promise;
    if (!r || !r.success) { showToast((r && r.error && r.error.message) || "تعذر تنفيذ العملية.", "error"); return false; }
    if (okMsg) showToast(okMsg, "success");
    await load();
    return true;
  } finally { busy = false; }
}

function confirm_(text, fn) { $("confirmText").textContent = text; confirmFn = fn; openM("confirmModal"); }

async function togglePublish(kind, item) {
  const path = kind === "groups" ? "lesson-groups" : kind === "units" ? "lesson-units" : "lessons";
  await run(api("PATCH", `/api/admin/${path}/${item.id}`, { active: !item.active }), item.active ? "تم الإخفاء" : "تم النشر");
}

async function moveItem(kind, id, d) {
  const list = groups.filter((g) => stageFilter === "all" || g.stage === stageFilter);
  const i = list.findIndex((x) => x.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= list.length) return;
  const ids = list.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
  await run(api("POST", "/api/admin/lesson-groups/reorder", { ids }), "تم الترتيب");
}
async function moveUnit(list, i, d) {
  const j = i + d; if (j < 0 || j >= list.length) return;
  const ids = list.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
  await run(api("POST", "/api/admin/lesson-units/reorder", { lessonGroupId: list[0].lessonGroupId, ids }), "تم الترتيب");
}
async function reorderLessons(list, i, d) {
  const j = i + d; if (j < 0 || j >= list.length) return;
  const ids = list.map((x) => x.id); [ids[i], ids[j]] = [ids[j], ids[i]];
  await run(api("POST", "/api/admin/lessons/reorder", { ids }), "تم الترتيب");
}

function askDeleteGroup(g) {
  confirm_(`حذف المجموعة «${g.name}»؟ ستُحذف وحداتها فقط، أما الفيديوهات (${g.lessonCount}) فلن تُحذف وستنتقل إلى «دروس غير مصنفة». طلبات الاشتراك لا تتأثر.`,
    async () => { await run(api("DELETE", `/api/admin/lesson-groups/${g.id}`), "تم حذف المجموعة"); });
}

/* ---------- مودال المجموعة ---------- */
function setColor(c) {
  pickedColor = c;
  $("grpColors").querySelectorAll(".lca-swatch").forEach((s) => s.classList.toggle("is-on", s.dataset.pick === c));
}
function openGroupModal(g) {
  editingGroup = g || null;
  $("grpModalTitle").textContent = g ? "تعديل المجموعة" : "مجموعة جديدة";
  $("grpName").value = g ? g.name : ""; $("grpDesc").value = g ? g.description : "";
  $("grpStage").value = g ? g.stage : (stageFilter !== "all" ? stageFilter : "");
  $("grpCover").value = g ? g.coverUrl : ""; $("grpOrder").value = g ? g.order : "";
  $("grpActive").checked = g ? g.active : true; setColor(g ? g.color : "indigo");
  openM("grpModal"); setTimeout(() => $("grpName").focus(), 80);
}
async function saveGroup() {
  const body = {
    name: safeText($("grpName").value), description: safeText($("grpDesc").value), stage: $("grpStage").value,
    coverUrl: safeText($("grpCover").value), color: pickedColor, active: $("grpActive").checked
  };
  if ($("grpOrder").value !== "") body.order = Number($("grpOrder").value);
  if (!body.name) return showToast("اكتب اسم المجموعة.", "error");
  if (!body.stage) return showToast("اختر المرحلة الدراسية.", "error");
  const p = editingGroup ? api("PATCH", `/api/admin/lesson-groups/${editingGroup.id}`, body) : api("POST", "/api/admin/lesson-groups", body);
  if (await run(p, editingGroup ? "تم تحديث المجموعة" : "تم إنشاء المجموعة")) closeM("grpModal");
}

/* ---------- مودال الوحدة ---------- */
function openUnitModal(u, gid) {
  editingUnit = u || null; unitForGroup = gid;
  $("unitModalTitle").textContent = u ? "تعديل الوحدة" : "وحدة جديدة";
  $("unitName").value = u ? u.name : ""; $("unitDesc").value = u ? u.description : ""; $("unitActive").checked = u ? u.active : true;
  openM("unitModal"); setTimeout(() => $("unitName").focus(), 80);
}
async function saveUnit() {
  const body = { name: safeText($("unitName").value), description: safeText($("unitDesc").value), active: $("unitActive").checked };
  if (!body.name) return showToast("اكتب اسم الوحدة.", "error");
  if (!editingUnit) body.lessonGroupId = unitForGroup;
  const p = editingUnit ? api("PATCH", `/api/admin/lesson-units/${editingUnit.id}`, body) : api("POST", "/api/admin/lesson-units", body);
  if (await run(p, editingUnit ? "تم تحديث الوحدة" : "تم إنشاء الوحدة")) closeM("unitModal");
}

/* ---------- قوائم المجموعة/الوحدة التابعة للمرحلة ---------- */
function fillGroupSelect(sel, stage, current) {
  sel.replaceChildren();
  const first = h("option", "", stage ? "اختر المجموعة" : "اختر المرحلة أولًا"); first.value = ""; sel.appendChild(first);
  groups.filter((g) => !stage || g.stage === stage).forEach((g) => { const o = h("option", "", g.name + (g.active ? "" : " (مسودة)")); o.value = g.id; sel.appendChild(o); });
  sel.value = current && [...sel.options].some((o) => o.value === current) ? current : "";
}
function fillUnitSelect(sel, gid, current) {
  sel.replaceChildren();
  const first = h("option", "", "بدون وحدة (مباشرة في المجموعة)"); first.value = ""; sel.appendChild(first);
  if (gid) unitsOf(gid).forEach((u) => { const o = h("option", "", u.name); o.value = u.id; sel.appendChild(o); });
  sel.value = current && [...sel.options].some((o) => o.value === current) ? current : "";
}

/* ---------- مودال الدرس ---------- */
function updatePreview() {
  const box = $("lsPreview"); box.replaceChildren();
  const id = extractYouTubeID(safeText($("lsUrlInput").value));
  if (!id) { box.appendChild(h("span", "", "🎬")); return; }
  const img = document.createElement("img"); img.alt = "معاينة الفيديو"; img.referrerPolicy = "no-referrer";
  img.style.cssText = "width:100%;height:100%;object-fit:cover;";
  img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  img.addEventListener("error", () => { box.replaceChildren(h("span", "", "🎬")); });
  box.appendChild(img);
}
function openLessonModal(l, pre = {}) {
  editingLesson = l || null;
  const gid = l ? (l.lessonGroupId || "") : (pre.groupId && pre.groupId !== NONE ? pre.groupId : "");
  const grp = groups.find((g) => g.id === gid);
  const stage = l ? l.stage : (grp ? grp.stage : (stageFilter !== "all" ? stageFilter : ""));
  $("lsModalTitle").textContent = l ? "تعديل الدرس" : "درس جديد";
  $("lsConfirmBtn").textContent = l ? "حفظ" : "إضافة";
  $("lsTitleInput").value = l ? l.title : ""; $("lsDescInput").value = l ? l.description : "";
  $("lsUrlInput").value = l ? l.url : ""; $("lsStageSelect").value = stage;
  fillGroupSelect($("lsGroupSelect"), stage, gid);
  fillUnitSelect($("lsUnitSelect"), $("lsGroupSelect").value, l ? l.unitId : pre.unitId);
  $("lsOrderInput").value = l ? l.order : ""; $("lsActiveInput").checked = l ? l.active : true;
  const legacy = l && !isVideo(l);
  $("lsModalSub").textContent = legacy ? "درس قديم (" + KIND_LABEL[kindOf(l)] + "): أدخل رابط YouTube لتحويله إلى فيديو، أو انقله/احذفه." : "فيديو من YouTube داخل مجموعة تعليمية.";
  if (legacy) $("lsUrlInput").value = "";
  updatePreview(); openM("lsModal"); setTimeout(() => $("lsTitleInput").focus(), 80);
}
function closeLessonModal() { closeM("lsModal"); editingLesson = null; }

async function saveLesson() {
  const url = safeText($("lsUrlInput").value);
  const body = {
    title: safeText($("lsTitleInput").value), description: safeText($("lsDescInput").value), url, kind: "video",
    stage: $("lsStageSelect").value, lessonGroupId: $("lsGroupSelect").value, unitId: $("lsUnitSelect").value,
    active: $("lsActiveInput").checked
  };
  if ($("lsOrderInput").value !== "") body.order = Number($("lsOrderInput").value);
  if (!body.title) return showToast("اكتب عنوان الدرس.", "error");
  if (!extractYouTubeID(url)) return showToast("رابط YouTube غير صالح.", "error");
  if (!body.stage) return showToast("اختر المرحلة الدراسية.", "error");
  if (!body.lessonGroupId) return showToast("اختر المجموعة التعليمية.", "error");
  const p = editingLesson ? api("PATCH", `/api/admin/lessons/${editingLesson.id}`, body) : api("POST", "/api/admin/lessons", body);
  if (await run(p, editingLesson ? "تم حفظ الدرس" : "تمت إضافة الدرس")) closeLessonModal();
}

/* ---------- نقل ---------- */
function openMove(l) {
  moveId = l.id;
  $("moveModalSub").textContent = `«${l.title}» — المجموعات المتاحة من نفس المرحلة (${stageName(l.stage)}).`;
  fillGroupSelect($("moveGroup"), l.stage, l.lessonGroupId || "");
  fillUnitSelect($("moveUnit"), $("moveGroup").value, l.unitId);
  openM("moveModal");
}
async function saveMove() {
  const gid = $("moveGroup").value;
  if (!gid) return showToast("اختر المجموعة.", "error");
  if (await run(api("PATCH", `/api/admin/lessons/${moveId}`, { lessonGroupId: gid, unitId: $("moveUnit").value }), "تم نقل الدرس")) closeM("moveModal");
}

/* ---------- ربط الأحداث ---------- */
function bind() {
  $("lsRetryBtn").addEventListener("click", load);
  $("lsCreateBtn").addEventListener("click", () => openLessonModal(null, { groupId: openGroup }));
  $("lsNewLessonBtn").addEventListener("click", () => openLessonModal(null));
  $("lsNewGroupBtn").addEventListener("click", () => openGroupModal(null));
  $("lsSearchInput").addEventListener("input", debounce((e) => { search = safeText(e.target.value); if (!openGroup) renderHome(); }, 250));
  $("lsStageFilters").addEventListener("click", (e) => {
    const b = e.target.closest(".ls-filter"); if (!b) return;
    stageFilter = b.dataset.stage;
    $("lsStageFilters").querySelectorAll(".ls-filter").forEach((x) => x.classList.toggle("is-active", x === b));
    if (!openGroup) renderHome();
  });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeM(b.dataset.close)));
  $("grpColors").addEventListener("click", (e) => { const s = e.target.closest("[data-pick]"); if (s) setColor(s.dataset.pick); });
  $("grpSave").addEventListener("click", saveGroup);
  $("unitSave").addEventListener("click", saveUnit);
  $("lsConfirmBtn").addEventListener("click", saveLesson);
  $("lsCancelBtn").addEventListener("click", closeLessonModal);
  $("lsUrlInput").addEventListener("input", debounce(updatePreview, 250));
  /* عند اختيار مجموعة: اعرض وحداتها فقط ولا تحتفظ بوحدة مجموعة أخرى */
  $("lsStageSelect").addEventListener("change", () => { fillGroupSelect($("lsGroupSelect"), $("lsStageSelect").value, ""); fillUnitSelect($("lsUnitSelect"), "", ""); });
  $("lsGroupSelect").addEventListener("change", () => fillUnitSelect($("lsUnitSelect"), $("lsGroupSelect").value, ""));
  $("moveGroup").addEventListener("change", () => fillUnitSelect($("moveUnit"), $("moveGroup").value, ""));
  $("moveSave").addEventListener("click", saveMove);
  $("confirmOk").addEventListener("click", async () => { const f = confirmFn; closeM("confirmModal"); if (f) await f(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".adm-modal-overlay.is-open").forEach((m) => closeM(m.id));
  });
}

async function init() {
  if (!requireAdmin()) return;
  bind();
  await load();
}
onReady(init);
