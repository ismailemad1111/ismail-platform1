/**
 * admin-settings.js
 * ------------------------------------------------------------
 * منصة أ/ إسماعيل عماد التعليمية
 * تشغيل صفحة admin/settings.html
 *
 * المكان: /js/admin-settings.js
 *
 * المرجع:
 *   - الوثيقة الأصلية (بنود 87، 88، 103، 180)
 *   - Master Design System (بند 58)
 *
 * ⚠️ قواعد:
 *   - لا Secrets في الإعدادات (بند 103).
 *   - التحقق والصلاحيات داخل طبقة Firestore المحلية (بند 109).
 *   - كل نص في textContent (بند 124).
 *
 * ⚠️ حالة الملف:
 *   - لا يعتمد الملف على Worker خارجي.
 *   - workerFetch تستدعي طبقة Firestore المحلية.
 * ------------------------------------------------------------
 */


import {
  onReady,
  safeText,
  showToast,
  formatDate
} from "./helpers.js";

import {
  requireAdmin,
  getSession
} from "./router.js";


/* ============================================================
   01 — ثوابت
   ============================================================ */

const REQUEST_TIMEOUT_MS = 20000;

const ERRORS = {
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT:       "TIMEOUT",
  SERVER_ERROR:  "SERVER_ERROR",
  UNAUTHORIZED:  "UNAUTHORIZED",
  NOT_FOUND:     "NOT_FOUND",
  BAD_REQUEST:   "BAD_REQUEST"
};

const ERROR_MESSAGES = {
  NETWORK_ERROR: "لا يوجد اتصال بالإنترنت.",
  TIMEOUT:       "انتهت مدة الطلب.",
  SERVER_ERROR:  "حدث خطأ. حاول مرة أخرى.",
  UNAUTHORIZED:  "انتهت الجلسة.",
  NOT_FOUND:     "العنصر غير موجود.",
  BAD_REQUEST:   "البيانات المُرسَلة غير صحيحة."
};

const STAGE_NAMES = {
  grade_4: "الرابع الابتدائي",
  grade_5: "الخامس الابتدائي",
  grade_6: "السادس الابتدائي",
  prep_1:  "الأول الإعدادي",
  prep_2:  "الثاني الإعدادي",
  prep_3:  "الثالث الإعدادي",
  sec_1:   "الأول الثانوي",
  sec_2:   "الثاني الثانوي",
  sec_3:   "الثالث الثانوي"
};

function getStageName(key) {
  const k = safeText(key);
  return STAGE_NAMES[k] || "—";
}


/* ============================================================
   02 — المرجع للعناصر
   ============================================================ */

let headerSubEl       = null;

let tabsEl            = null;

// Groups Panel
let addGroupBtn       = null;
let groupsSkeletonEl  = null;
let groupsListEl      = null;
let groupsEmptyEl     = null;
let groupsErrorEl     = null;
let groupsRetryBtn    = null;

// General Panel
let generalFormEl     = null;
let academicYearEl    = null;
let platformNameEl    = null;
let passingPercentEl   = null;
let subscriptionsSw   = null;
let prayerSw          = null;
let aiSw              = null;
let saveGeneralBtn    = null;

// Group Modal
let groupModalEl      = null;
let groupModalTitleEl = null;
let groupModalSubEl   = null;
let groupNameInput    = null;
let groupStageSel     = null;
let groupActiveSw     = null;
let groupCancelBtn    = null;
let groupConfirmBtn   = null;


/* ============================================================
   03 — الحالة
   ============================================================ */

let groups = [];
let settings = {};
let isLoadingGroups = false;
let isLoadingSettings = false;

let editingGroupId = null;
let isSavingGroup = false;
let isSavingSettings = false;

// حالة عامة للـ switches
let switchesState = {
  subscriptions: true,
  prayer: true,
  ai: true
};

let groupActiveState = true;


/* ============================================================
   04 — طلب HTTP موحد
   ============================================================ */

import { backendRequest } from "./backend/index.js";
import { calcPricing } from "./backend/bank.js";
async function workerFetch(endpoint, options = {}) {
  // بدون Worker: التنفيذ داخل المتصفح عبر Firestore (js/backend/)
  return backendRequest(endpoint, options);
}


/* ============================================================
   05 — تجميع العناصر
   ============================================================ */

function cacheElements() {
  headerSubEl       = document.getElementById("stHeaderSub");
  tabsEl            = document.querySelector(".st-tabs");
  passingPercentEl  = document.getElementById("stPassingPercent");

  addGroupBtn       = document.getElementById("stAddGroupBtn");
  groupsSkeletonEl  = document.getElementById("stGroupsSkeleton");
  groupsListEl      = document.getElementById("stGroupsList");
  groupsEmptyEl     = document.getElementById("stGroupsEmpty");
  groupsErrorEl     = document.getElementById("stGroupsError");
  groupsRetryBtn    = document.getElementById("stGroupsRetryBtn");

  generalFormEl     = document.getElementById("stGeneralForm");
  academicYearEl    = document.getElementById("stAcademicYear");
  platformNameEl    = document.getElementById("stPlatformName");
  subscriptionsSw   = document.getElementById("stSubscriptionsSwitch");
  prayerSw          = document.getElementById("stPrayerSwitch");
  aiSw              = document.getElementById("stAISwitch");
  saveGeneralBtn    = document.getElementById("stSaveGeneralBtn");

  groupModalEl      = document.getElementById("stGroupModal");
  groupModalTitleEl = document.getElementById("stGroupModalTitle");
  groupModalSubEl   = document.getElementById("stGroupModalSub");
  groupNameInput    = document.getElementById("stGroupNameInput");
  groupStageSel     = document.getElementById("stGroupStageSelect");
  groupActiveSw     = document.getElementById("stGroupActiveSwitch");
  groupCancelBtn    = document.getElementById("stGroupCancelBtn");
  groupConfirmBtn   = document.getElementById("stGroupConfirmBtn");
}


/* ============================================================
   06 — Tabs
   ============================================================ */

function switchTab(tabKey) {
  if (!tabsEl) return;

  tabsEl.querySelectorAll(".st-tab").forEach((tab) => {
    const isActive = tab.dataset.tab === tabKey;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.querySelectorAll(".st-panel").forEach((panel) => {
    const isActive = panel.dataset.panel === tabKey;
    panel.classList.toggle("is-active", isActive);
  });
}

function bindTabs() {
  if (!tabsEl) return;

  tabsEl.querySelectorAll(".st-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const key = safeText(tab.dataset.tab);
      if (key) switchTab(key);
    });
  });
}


/* ============================================================
   07 — Groups States
   ============================================================ */

function showGroupsLoading() {
  if (groupsSkeletonEl) groupsSkeletonEl.style.display = "";
  if (groupsListEl)     groupsListEl.style.display = "none";
  if (groupsEmptyEl)    groupsEmptyEl.style.display = "none";
  if (groupsErrorEl)    groupsErrorEl.style.display = "none";
}
function showGroupsList() {
  if (groupsSkeletonEl) groupsSkeletonEl.style.display = "none";
  if (groupsListEl)     groupsListEl.style.display = "";
  if (groupsEmptyEl)    groupsEmptyEl.style.display = "none";
  if (groupsErrorEl)    groupsErrorEl.style.display = "none";
}
function showGroupsEmpty() {
  if (groupsSkeletonEl) groupsSkeletonEl.style.display = "none";
  if (groupsListEl)     groupsListEl.style.display = "none";
  if (groupsEmptyEl)    groupsEmptyEl.style.display = "";
  if (groupsErrorEl)    groupsErrorEl.style.display = "none";
}
function showGroupsError() {
  if (groupsSkeletonEl) groupsSkeletonEl.style.display = "none";
  if (groupsListEl)     groupsListEl.style.display = "none";
  if (groupsEmptyEl)    groupsEmptyEl.style.display = "none";
  if (groupsErrorEl)    groupsErrorEl.style.display = "";
}


/* ============================================================
   08 — بناء كارت مجموعة
   ============================================================ */

function createGroupCard(group) {
  const id      = safeText(group && group.id);
  const name    = safeText(group && group.name) || "مجموعة";
  const stage   = safeText(group && group.stage);
  const active  = group && group.active !== false;
  const createdAt = group && group.createdAt;

  const card = document.createElement("article");
  card.className = "st-group" + (active ? "" : " is-inactive");
  card.dataset.groupId = id;

  // Icon
  const icon = document.createElement("div");
  icon.className = "st-group-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📚";

  // Body
  const body = document.createElement("div");
  body.className = "st-group-body";

  const nameEl = document.createElement("h3");
  nameEl.className = "st-group-name";
  nameEl.textContent = name;
  body.appendChild(nameEl);

  const meta = document.createElement("div");
  meta.className = "st-group-meta";

  if (stage) {
    const sBadge = document.createElement("span");
    sBadge.className = "st-group-badge";
    const ic = document.createElement("span"); ic.textContent = "🎓";
    const tx = document.createElement("span"); tx.textContent = getStageName(stage);
    sBadge.appendChild(ic); sBadge.appendChild(tx);
    meta.appendChild(sBadge);
  }

  if (!active) {
    const aBadge = document.createElement("span");
    aBadge.className = "st-group-badge st-group-badge--inactive";
    aBadge.textContent = "معطلة";
    meta.appendChild(aBadge);
  }

  if (createdAt) {
    const dItem = document.createElement("span");
    dItem.style.cssText = "display:inline-flex;align-items:center;gap:3px;";
    const ic = document.createElement("span"); ic.textContent = "📅";
    const tx = document.createElement("span"); tx.textContent = formatDate(createdAt) || "—";
    dItem.appendChild(ic); dItem.appendChild(tx);
    meta.appendChild(dItem);
  }

  body.appendChild(meta);
  card.appendChild(icon);
  card.appendChild(body);

  // Actions
  const actions = document.createElement("div");
  actions.className = "st-group-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "st-group-btn";
  editBtn.title = "تعديل";
  editBtn.textContent = "✏️";
  editBtn.addEventListener("click", () => openGroupModal(group));
  actions.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "st-group-btn is-danger";
  delBtn.title = "حذف";
  delBtn.textContent = "🗑️";
  delBtn.addEventListener("click", () => handleDeleteGroup(id, name));
  actions.appendChild(delBtn);

  card.appendChild(actions);

  return card;
}


/* ============================================================
   09 — عرض Groups
   ============================================================ */

function renderGroups() {
  if (!groupsListEl) return;

  if (!Array.isArray(groups) || groups.length === 0) {
    showGroupsEmpty();
    return;
  }

  // ترتيب: الأحدث أولاً
  const sorted = [...groups].sort((a, b) => {
    return toTime(b && b.createdAt) - toTime(a && a.createdAt);
  });

  groupsListEl.replaceChildren();
  sorted.forEach((g) => groupsListEl.appendChild(createGroupCard(g)));
  showGroupsList();
}

function toTime(v) {
  if (!v) return 0;
  if (typeof v.toDate === "function") { try { return v.toDate().getTime(); } catch (e) { return 0; } }
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
  return 0;
}


/* ============================================================
   10 — تحميل Groups
   ============================================================ */

async function loadGroups() {
  if (isLoadingGroups) return;
  isLoadingGroups = true;

  showGroupsLoading();

  const result = await workerFetch("/api/admin/lesson-groups");

  isLoadingGroups = false;

  if (!result || !result.success) {
    const code = (result && result.error && result.error.code) || ERRORS.SERVER_ERROR;
    if (code === ERRORS.UNAUTHORIZED) {
      showToast(ERROR_MESSAGES.UNAUTHORIZED, "warning");
      setTimeout(() => { window.location.href = "login.html"; }, 1500);
      return;
    }
    showGroupsError();
    return;
  }

  const data = (result.data && typeof result.data === "object") ? result.data : {};
  const list = Array.isArray(data.groups) ? data.groups : [];

  groups = list.filter((g) => g && g.id);

  if (headerSubEl) {
    headerSubEl.textContent = `${groups.length} مجموعة دروس`;
  }

  renderGroups();
}


/* ============================================================
   11 — Group Modal
   ============================================================ */

function setGroupActiveSwitch(on) {
  groupActiveState = !!on;
  if (!groupActiveSw) return;
  groupActiveSw.classList.toggle("is-on", groupActiveState);
  groupActiveSw.setAttribute("aria-checked", groupActiveState ? "true" : "false");
}

function openGroupModal(existing) {
  if (!groupModalEl) return;

  editingGroupId = existing ? safeText(existing.id) : null;

  if (groupNameInput) groupNameInput.value = existing ? safeText(existing.name) : "";
  if (groupStageSel)  groupStageSel.value  = existing ? safeText(existing.stage) : "";

  setGroupActiveSwitch(existing ? (existing.active !== false) : true);

  if (groupModalTitleEl) groupModalTitleEl.textContent = existing ? "تعديل المجموعة" : "مجموعة جديدة";
  if (groupModalSubEl)   groupModalSubEl.textContent   = existing
    ? "عدّل بيانات المجموعة ثم احفظ."
    : "حدد اسم المجموعة والمرحلة المرتبطة.";

  if (groupConfirmBtn) groupConfirmBtn.textContent = existing ? "حفظ" : "إضافة";

  groupModalEl.classList.add("is-open");
  groupModalEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  setTimeout(() => {
    if (groupNameInput) groupNameInput.focus();
  }, 150);
}

function closeGroupModal() {
  if (!groupModalEl) return;
  groupModalEl.classList.remove("is-open");
  groupModalEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  editingGroupId = null;
}


/* ============================================================
   12 — حفظ Group
   ============================================================ */

async function handleSaveGroup() {
  if (isSavingGroup) return;

  const name = safeText(groupNameInput ? groupNameInput.value : "");
  const stage = safeText(groupStageSel ? groupStageSel.value : "");
  const active = groupActiveState;

  if (!name) {
    showToast("من فضلك أدخل اسم المجموعة.", "warning");
    return;
  }

  if (name.length > 80) {
    showToast("اسم المجموعة طويل جدًا.", "warning");
    return;
  }

  if (!stage) {
    showToast("من فضلك اختر المرحلة.", "warning");
    return;
  }

  isSavingGroup = true;
  if (groupConfirmBtn) {
    groupConfirmBtn.disabled = true;
    groupConfirmBtn.textContent = editingGroupId ? "جارٍ الحفظ..." : "جارٍ الإضافة...";
  }

  const body = { name, stage, active };

  let result;
  if (editingGroupId) {
    result = await workerFetch(`/api/admin/lesson-groups/${encodeURIComponent(editingGroupId)}`, {
      method: "PATCH",
      body
    });
  } else {
    result = await workerFetch("/api/admin/lesson-groups", {
      method: "POST",
      body
    });
  }

  isSavingGroup = false;
  if (groupConfirmBtn) {
    groupConfirmBtn.disabled = false;
    groupConfirmBtn.textContent = editingGroupId ? "حفظ" : "إضافة";
  }

  if (!result || !result.success) {
    const code = (result && result.error && result.error.code) || ERRORS.SERVER_ERROR;
    const msg  = (result && result.error && result.error.message) || ERROR_MESSAGES[code];

    if (code === ERRORS.UNAUTHORIZED) {
      showToast(ERROR_MESSAGES.UNAUTHORIZED, "warning");
      setTimeout(() => { window.location.href = "login.html"; }, 1500);
      return;
    }

    showToast(msg, "error");
    return;
  }

  const saved = (result.data && result.data.group) ? result.data.group : null;

  if (saved && saved.id) {
    if (editingGroupId) {
      const idx = groups.findIndex((g) => g && g.id === editingGroupId);
      if (idx >= 0) groups[idx] = saved;
    } else {
      groups.unshift(saved);
    }
  }

  renderGroups();
  closeGroupModal();

  showToast(editingGroupId ? "تم الحفظ ✅" : "تمت الإضافة ✅", "success");
}


/* ============================================================
   13 — حذف Group
   ============================================================ */

async function handleDeleteGroup(id, name) {
  const cleanId = safeText(id);
  if (!cleanId) return;

  const confirmed = window.confirm(`متأكد من حذف المجموعة: "${name}"؟`);
  if (!confirmed) return;

  const result = await workerFetch(`/api/admin/lesson-groups/${encodeURIComponent(cleanId)}`, {
    method: "DELETE"
  });

  if (!result || !result.success) {
    const code = (result && result.error && result.error.code) || ERRORS.SERVER_ERROR;
    const msg  = (result && result.error && result.error.message) || ERROR_MESSAGES[code];

    if (code === ERRORS.UNAUTHORIZED) {
      showToast(ERROR_MESSAGES.UNAUTHORIZED, "warning");
      setTimeout(() => { window.location.href = "login.html"; }, 1500);
      return;
    }

    showToast(msg, "error");
    return;
  }

  groups = groups.filter((g) => g && g.id !== cleanId);
  renderGroups();

  showToast("تم الحذف", "success");
}


/* ============================================================
   14 — General Settings
   ============================================================ */

function setSwitch(el, on, key) {
  switchesState[key] = !!on;
  if (!el) return;
  el.classList.toggle("is-on", !!on);
  el.setAttribute("aria-checked", on ? "true" : "false");
}

function bindSwitch(el, key) {
  if (!el) return;

  const toggle = () => {
    const newValue = !switchesState[key];
    setSwitch(el, newValue, key);
  };

  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
}

function renderSettings() {
  if (academicYearEl) {
    academicYearEl.value = safeText(settings.academicYear);
  }
  if (platformNameEl) {
    platformNameEl.value = safeText(settings.platformName);
  }
  if (passingPercentEl) {
    passingPercentEl.value = String(Number(settings.passingPercent) || 50);
  }

  setSwitch(subscriptionsSw, settings.subscriptionsEnabled !== false, "subscriptions");
  setSwitch(prayerSw,        settings.prayerEnabled !== false,        "prayer");
  setSwitch(aiSw,            settings.aiEnabled !== false,            "ai");
}

async function loadSettings() {
  if (isLoadingSettings) return;
  isLoadingSettings = true;

  const result = await workerFetch("/api/admin/settings");

  isLoadingSettings = false;

  if (!result || !result.success) {
    const code = (result && result.error && result.error.code) || ERRORS.SERVER_ERROR;
    if (code === ERRORS.UNAUTHORIZED) {
      showToast(ERROR_MESSAGES.UNAUTHORIZED, "warning");
      setTimeout(() => { window.location.href = "login.html"; }, 1500);
      return;
    }

    // لو فشل → إعدادات افتراضية
    settings = {
      academicYear: "",
      platformName: "",
      subscriptionsEnabled: true,
      prayerEnabled: true,
      aiEnabled: true,
      passingPercent: 50
    };
    renderSettings();
    return;
  }

  const data = (result.data && typeof result.data === "object") ? result.data : {};
  settings = (data.settings && typeof data.settings === "object") ? data.settings : data;

  renderSettings();
}

async function handleSaveSettings(event) {
  if (event) event.preventDefault();

  if (isSavingSettings) return;

  const academicYear = safeText(academicYearEl ? academicYearEl.value : "");
  const platformName = safeText(platformNameEl ? platformNameEl.value : "");
  const passingPercent = Number(passingPercentEl ? passingPercentEl.value : 50);

  // تحقق بسيط
  if (academicYear && !/^\d{4}-\d{4}$/.test(academicYear)) {
    showToast("صيغة السنة الدراسية يجب أن تكون YYYY-YYYY.", "warning");
    return;
  }

  if (platformName && platformName.length > 80) {
    showToast("اسم المنصة طويل جدًا.", "warning");
    return;
  }

  if (!Number.isInteger(passingPercent) || passingPercent < 1 || passingPercent > 100) {
    showToast("نسبة النجاح يجب أن تكون بين 1 و100.", "warning");
    return;
  }

  isSavingSettings = true;
  if (saveGeneralBtn) {
    saveGeneralBtn.disabled = true;
    saveGeneralBtn.textContent = "جارٍ الحفظ...";
  }

  const body = {
    academicYear: academicYear || null,
    platformName: platformName || null,
    subscriptionsEnabled: switchesState.subscriptions,
    prayerEnabled: switchesState.prayer,
    aiEnabled: switchesState.ai,
    passingPercent
  };

  const result = await workerFetch("/api/admin/settings", {
    method: "PATCH",
    body
  });

  isSavingSettings = false;
  if (saveGeneralBtn) {
    saveGeneralBtn.disabled = false;
    saveGeneralBtn.textContent = "حفظ الإعدادات";
  }

  if (!result || !result.success) {
    const code = (result && result.error && result.error.code) || ERRORS.SERVER_ERROR;
    const msg  = (result && result.error && result.error.message) || ERROR_MESSAGES[code];

    if (code === ERRORS.UNAUTHORIZED) {
      showToast(ERROR_MESSAGES.UNAUTHORIZED, "warning");
      setTimeout(() => { window.location.href = "login.html"; }, 1500);
      return;
    }

    showToast(msg, "error");
    return;
  }

  // تحديث محلي
  settings = { ...settings, ...body };

  showToast("تم حفظ الإعدادات ✅", "success");
  loadAISettings(true);   // مزامنة مفتاح التشغيل في تبويب الذكاء الاصطناعي
}


/* ============================================================
   14ب — إدارة الذكاء الاصطناعي (تبويب مستقل)
   ------------------------------------------------------------
   لا يُعرض المفتاح المحفوظ أبدًا: الخادم المحلي يعيد hasApiKey وآخر 4 أحرف فقط،
   وحقل المفتاح يبقى فارغًا (يُرسل فقط عند كتابة قيمة جديدة).
   ============================================================ */

const AI_IDS = ["gemini", "openai", "deepseek"];
const aiState = { settings: null, busy: new Set(), confirmCb: null };

function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

const aiEl = (id) => document.getElementById(id);
const aiCardEl = (id) => document.querySelector(`[data-ai-card="${id}"]`);

/** نداء موحّد للمسارات: يعيد { ok, data, message } ويعالج انتهاء الجلسة */
async function aiCall(endpoint, options) {
  const result = await workerFetch(endpoint, options);
  if (result && result.success) return { ok: true, data: result.data || {} };
  const code = (result && result.error && result.error.code) || ERRORS.SERVER_ERROR;
  if (code === ERRORS.UNAUTHORIZED) {
    showToast(ERROR_MESSAGES.UNAUTHORIZED, "warning");
    setTimeout(() => { window.location.href = "login.html"; }, 1500);
  }
  return { ok: false, message: (result && result.error && result.error.message) || ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR };
}

function aiSwitchHtml(on, key, label) {
  return `<div class="st-switch${on ? " is-on" : ""}" data-ai-switch="${esc(key)}" role="switch" aria-checked="${on ? "true" : "false"}" aria-label="${esc(label)}" tabindex="0"></div>`;
}

function renderAIStatus() {
  const s = aiState.settings;
  const el = aiEl("stAIStatus");
  if (!s || !el) return;
  const enabledCount = AI_IDS.filter((id) => s.providers[id].enabled).length;
  const keyed = AI_IDS.filter((id) => s.providers[id].hasApiKey).map((id) => s.providers[id].label);
  const def = s.providers[s.defaultProvider];
  const tiles = [
    ["حالة الذكاء الاصطناعي", s.enabled ? "مفعّل" : "متوقف"],
    ["المزود الافتراضي", def ? def.label : "—"],
    ["النموذج الحالي", def ? def.model : "—"],
    ["المزودون المفعّلون", `${enabledCount} من ${AI_IDS.length}`],
    ["مفاتيح API", keyed.length ? `محفوظة: ${keyed.join("، ")}` : "لا توجد مفاتيح محفوظة"],
    ["الحد اليومي لكل طالب", `${s.dailyLimit} رسالة`]
  ];
  el.innerHTML = tiles.map(([l, v]) => `<div class="ai-stat"><div class="ai-stat-label">${esc(l)}</div><div class="ai-stat-value">${esc(v)}</div></div>`).join("");
}

function renderAIGlobal() {
  const s = aiState.settings;
  const el = aiEl("stAIGlobal");
  if (!s || !el) return;
  el.innerHTML = `
    <div class="st-switch-row">
      <div class="st-switch-info">
        <div class="st-switch-label">تشغيل الذكاء الاصطناعي</div>
        <div class="st-switch-hint">إيقاف شامل: يظهر المساعد للطلاب كـ «غير متاح» دون حذف أي إعدادات.</div>
      </div>
      ${aiSwitchHtml(s.enabled, "master", "تشغيل الذكاء الاصطناعي")}
    </div>
    <div class="ai-grid" style="margin-top:14px;">
      <div class="st-field">
        <label class="st-label" for="stAIDefault">المزود الافتراضي</label>
        <select class="st-select" id="stAIDefault">
          ${AI_IDS.map((id) => `<option value="${id}"${id === s.defaultProvider ? " selected" : ""}>${esc(s.providers[id].label)}</option>`).join("")}
        </select>
        <div class="st-hint">لا يوجد تبديل تلقائي لمزود آخر عند الفشل.</div>
      </div>
      <div class="st-field">
        <label class="st-label" for="stAIDailyLimit">الحد اليومي لكل طالب</label>
        <input type="number" class="st-input" id="stAIDailyLimit" min="1" max="500" step="1" value="${esc(s.dailyLimit)}" />
      </div>
    </div>
    <button type="button" class="st-btn st-btn--primary" data-ai-action="save-global" style="width:100%;min-height:46px;">حفظ الإعدادات العامة</button>`;
}

function aiCardHtml(id) {
  const p = aiState.settings.providers[id];
  const keyText = p.hasApiKey ? `محفوظ${p.keyHint ? " ••••" + p.keyHint : ""}` : "غير محفوظ";
  return `
    <div class="st-form ai-card" data-ai-card="${id}">
      <div class="ai-card-head">
        <h3 class="ai-card-title">${esc(p.label)} <span class="ai-badge${p.enabled ? " is-ok" : ""}">${p.enabled ? "مفعّل" : "معطّل"}</span></h3>
        ${aiSwitchHtml(p.enabled, "provider:" + id, "تفعيل " + p.label)}
      </div>

      <div class="st-field">
        <label class="st-label" for="aiKey-${id}">مفتاح API</label>
        <div class="ai-key-state">
          <span class="ai-badge${p.hasApiKey ? " is-ok" : ""}">${esc(keyText)}</span>
          <span class="ai-actions-inline">
            ${p.hasApiKey ? `<button type="button" class="st-btn st-btn--ghost" data-ai-action="edit-key" data-id="${id}">تعديل المفتاح</button>
            <button type="button" class="st-btn st-btn--ghost ai-danger" data-ai-action="delete-key" data-id="${id}">حذف المفتاح</button>` : ""}
          </span>
        </div>
        <div class="ai-key-row" data-ai-keyrow${p.hasApiKey ? " hidden" : ""} style="margin-top:8px;">
          <input type="password" class="st-input" id="aiKey-${id}" data-ai-field="apiKey" autocomplete="new-password" spellcheck="false" placeholder="${p.hasApiKey ? "اكتب مفتاحًا جديدًا للاستبدال" : "الصق مفتاح API هنا"}" />
          <button type="button" class="st-btn st-btn--ghost" data-ai-action="toggle-key" data-id="${id}" aria-label="إظهار أو إخفاء المفتاح">إظهار</button>
        </div>
        <div class="st-hint">ترك الحقل فارغًا يُبقي المفتاح الحالي كما هو.</div>
      </div>

      <div class="st-field">
        <label class="st-label" for="aiModel-${id}">النموذج (Model)</label>
        <input type="text" class="st-input" id="aiModel-${id}" data-ai-field="model" dir="ltr" maxlength="100" value="${esc(p.model)}" />
      </div>
      <div class="ai-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px;">
        <div class="st-field" style="margin:0;">
          <label class="st-label" for="aiTokens-${id}">Max Output Tokens</label>
          <input type="number" class="st-input" id="aiTokens-${id}" data-ai-field="maxOutputTokens" min="50" max="2000" step="1" value="${esc(p.maxOutputTokens)}" />
        </div>
        <div class="st-field" style="margin:0;">
          <label class="st-label" for="aiTemp-${id}">Temperature</label>
          <input type="number" class="st-input" id="aiTemp-${id}" data-ai-field="temperature" min="0" max="2" step="0.1" value="${esc(p.temperature)}" />
        </div>
      </div>

      <div class="ai-actions">
        <button type="button" class="st-btn st-btn--primary" data-ai-action="save-provider" data-id="${id}">حفظ المزود</button>
        <button type="button" class="st-btn st-btn--ghost" data-ai-action="test" data-id="${id}">اختبار الاتصال</button>
      </div>
      <div class="ai-result" data-ai-result hidden role="status" aria-live="polite"></div>
    </div>`;
}

function renderAISettings() {
  if (!aiState.settings) return;
  aiEl("stAIContent").innerHTML = `
    <div class="ai-status" id="stAIStatus"></div>
    <div class="st-form ai-card" id="stAIGlobal"></div>
    ${AI_IDS.map(aiCardHtml).join("")}`;
  renderAIStatus();
  renderAIGlobal();
}

function renderAICard(id) {
  const old = aiCardEl(id);
  if (!old) return;
  old.outerHTML = aiCardHtml(id);
}

function aiShowState(state) {
  aiEl("stAILoading").hidden = state !== "loading";
  aiEl("stAIError").hidden = state !== "error";
  aiEl("stAIContent").hidden = state !== "content";
}

async function loadAISettings(silent) {
  if (aiState.busy.has("load")) return;
  aiState.busy.add("load");
  if (!silent) aiShowState("loading");
  const r = await aiCall("/api/admin/ai-settings");
  aiState.busy.delete("load");
  if (!r.ok || !r.data.settings) {
    if (!silent) {
      aiEl("stAIErrorMsg").textContent = r.message || "تعذّر تحميل الإعدادات.";
      aiShowState("error");
    }
    return;
  }
  aiState.settings = r.data.settings;
  if (silent && !aiEl("stAIStatus")) return;
  if (silent) { renderAIStatus(); refreshMasterSwitch(); return; }
  renderAISettings();
  aiShowState("content");
}

function refreshMasterSwitch() {
  const sw = document.querySelector('[data-ai-switch="master"]');
  if (sw && aiState.settings) {
    sw.classList.toggle("is-on", aiState.settings.enabled);
    sw.setAttribute("aria-checked", aiState.settings.enabled ? "true" : "false");
  }
}

/** يشغّل عملية مقفلة (يمنع الضغط المتكرر) ويعطّل زرها أثناء التنفيذ */
async function aiGuard(key, btn, busyText, fn) {
  if (aiState.busy.has(key)) return;
  aiState.busy.add(key);
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = busyText; }
  try { await fn(); }
  finally {
    aiState.busy.delete(key);
    if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; }
  }
}

async function aiPatch(body) {
  const r = await aiCall("/api/admin/ai-settings", { method: "PATCH", body });
  if (r.ok && r.data.settings) aiState.settings = r.data.settings;
  return r;
}

function readProviderForm(id) {
  const card = aiCardEl(id);
  const val = (f) => { const e = card.querySelector(`[data-ai-field="${f}"]`); return e ? e.value : ""; };
  return {
    apiKey: val("apiKey").trim(),
    model: val("model").trim(),
    maxOutputTokens: Number(val("maxOutputTokens")),
    temperature: val("temperature") === "" ? NaN : Number(val("temperature"))
  };
}

function isProviderFormDirty(id) {
  const f = readProviderForm(id);
  const p = aiState.settings.providers[id];
  return !!f.apiKey || f.model !== p.model || f.maxOutputTokens !== p.maxOutputTokens || f.temperature !== p.temperature;
}

async function saveAIProvider(id, btn) {
  const f = readProviderForm(id);
  if (!f.model) return showToast("اكتب اسم النموذج.", "warning");
  if (!Number.isInteger(f.maxOutputTokens) || f.maxOutputTokens < 50 || f.maxOutputTokens > 2000) {
    return showToast("عدد Tokens يجب أن يكون بين 50 و2000.", "warning");
  }
  if (!Number.isFinite(f.temperature) || f.temperature < 0 || f.temperature > 2) {
    return showToast("Temperature يجب أن تكون بين 0 و2.", "warning");
  }
  const provider = { model: f.model, maxOutputTokens: f.maxOutputTokens, temperature: f.temperature };
  if (f.apiKey) provider.apiKey = f.apiKey;

  await aiGuard("save:" + id, btn, "جارٍ الحفظ...", async () => {
    const r = await aiPatch({ providers: { [id]: provider } });
    if (!r.ok) return showToast(r.message, "error");   // المدخلات تبقى كما هي
    renderAICard(id);
    renderAIStatus();
    showToast("تم حفظ إعدادات المزود ✅", "success");
  });
}

async function toggleAIProvider(id, sw) {
  const on = !aiState.settings.providers[id].enabled;
  if (aiState.busy.has("toggle:" + id)) return;
  aiState.busy.add("toggle:" + id);
  const r = await aiPatch({ providers: { [id]: { enabled: on } } });
  aiState.busy.delete("toggle:" + id);
  if (!r.ok) return showToast(r.message, "error");
  const p = aiState.settings.providers[id];
  sw.classList.toggle("is-on", p.enabled);
  sw.setAttribute("aria-checked", p.enabled ? "true" : "false");
  const badge = aiCardEl(id).querySelector(".ai-card-title .ai-badge");
  if (badge) { badge.textContent = p.enabled ? "مفعّل" : "معطّل"; badge.classList.toggle("is-ok", p.enabled); }
  renderAIStatus();
}

async function toggleAIMaster(sw) {
  if (aiState.busy.has("master")) return;
  aiState.busy.add("master");
  const r = await aiPatch({ enabled: !aiState.settings.enabled });
  aiState.busy.delete("master");
  if (!r.ok) return showToast(r.message, "error");
  refreshMasterSwitch();
  renderAIStatus();
  setSwitch(aiSw, aiState.settings.enabled, "ai");   // مفتاح تبويب «إعدادات عامة»
  settings = { ...settings, aiEnabled: aiState.settings.enabled };
}

async function saveAIGlobal(btn) {
  const dailyLimit = Number(aiEl("stAIDailyLimit").value);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 500) {
    return showToast("الحد اليومي يجب أن يكون بين 1 و500.", "warning");
  }
  await aiGuard("save:global", btn, "جارٍ الحفظ...", async () => {
    const r = await aiPatch({ defaultProvider: aiEl("stAIDefault").value, dailyLimit });
    if (!r.ok) return showToast(r.message, "error");
    renderAIStatus();
    showToast("تم حفظ الإعدادات العامة ✅", "success");
  });
}

function askDeleteAIKey(id) {
  const m = aiEl("stAIConfirmModal");
  aiEl("stAIConfirmText").textContent = `سيتم حذف مفتاح ${aiState.settings.providers[id].label} نهائيًا، وسيتوقف هذا المزود عن العمل حتى تضيف مفتاحًا جديدًا.`;
  aiState.confirmCb = () => deleteAIProviderKey(id);
  m.classList.add("is-open");
  m.setAttribute("aria-hidden", "false");
}

function closeAIConfirm() {
  const m = aiEl("stAIConfirmModal");
  m.classList.remove("is-open");
  m.setAttribute("aria-hidden", "true");
  aiState.confirmCb = null;
}

async function deleteAIProviderKey(id) {
  const btn = aiEl("stAIConfirmOk");
  await aiGuard("delete:" + id, btn, "جارٍ الحذف...", async () => {
    const r = await aiPatch({ providers: { [id]: { deleteApiKey: true } } });
    closeAIConfirm();
    if (!r.ok) return showToast(r.message, "error");
    renderAICard(id);
    renderAIStatus();
    showToast("تم حذف المفتاح.", "success");
  });
}

async function testAIProvider(id, btn) {
  if (isProviderFormDirty(id)) return showToast("لديك تغييرات غير محفوظة. احفظ المزود أولًا ثم اختبر الاتصال.", "warning");
  const out = aiCardEl(id).querySelector("[data-ai-result]");
  await aiGuard("test:" + id, btn, "جارٍ الاختبار...", async () => {
    out.hidden = true;
    const r = await aiCall("/api/admin/ai-settings/test", { method: "POST", body: { provider: id } });
    const res = r.ok ? r.data.result : null;
    out.hidden = false;
    out.classList.toggle("is-ok", !!(res && res.ok));
    if (!res) { out.textContent = r.message || "تعذّر إجراء الاختبار."; return; }
    out.textContent = res.ok
      ? `✅ ${res.message} (${res.latencyMs} ms) — النموذج: ${res.model}`
      : `❌ ${res.message}${res.latencyMs ? ` (${res.latencyMs} ms)` : ""}`;
  });
}

function bindAIPanel() {
  const panel = aiEl("stAIPanel");
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const sw = e.target.closest("[data-ai-switch]");
    if (sw) return handleAISwitch(sw);
    const btn = e.target.closest("[data-ai-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.aiAction) {
      case "retry": loadAISettings(); break;
      case "save-global": saveAIGlobal(btn); break;
      case "save-provider": saveAIProvider(id, btn); break;
      case "test": testAIProvider(id, btn); break;
      case "delete-key": askDeleteAIKey(id); break;
      case "edit-key": {
        const row = aiCardEl(id).querySelector("[data-ai-keyrow]");
        row.hidden = false;
        row.querySelector("input").focus();
        break;
      }
      case "toggle-key": {
        const input = aiCardEl(id).querySelector('[data-ai-field="apiKey"]');
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "إخفاء" : "إظهار";
        break;
      }
    }
  });

  panel.addEventListener("keydown", (e) => {
    const sw = e.target.closest && e.target.closest("[data-ai-switch]");
    if (sw && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); handleAISwitch(sw); }
  });

  aiEl("stAIConfirmCancel").addEventListener("click", closeAIConfirm);
  aiEl("stAIConfirmOk").addEventListener("click", () => { if (aiState.confirmCb) aiState.confirmCb(); });
  aiEl("stAIConfirmModal").addEventListener("click", (e) => { if (e.target.id === "stAIConfirmModal") closeAIConfirm(); });
}

function handleAISwitch(sw) {
  const key = sw.dataset.aiSwitch;
  if (key === "master") toggleAIMaster(sw);
  else if (key.startsWith("provider:")) toggleAIProvider(key.slice(9), sw);
}


/* ============================================================
   15 — ربط الأحداث
   ============================================================ */

function bindEvents() {
  // Tabs
  bindTabs();

  // Add Group
  if (addGroupBtn) addGroupBtn.addEventListener("click", () => openGroupModal(null));

  // Retry Groups
  if (groupsRetryBtn) groupsRetryBtn.addEventListener("click", () => loadGroups());

  // Group Modal
  if (groupCancelBtn)  groupCancelBtn.addEventListener("click", closeGroupModal);
  if (groupConfirmBtn) groupConfirmBtn.addEventListener("click", handleSaveGroup);

  if (groupModalEl) {
    groupModalEl.addEventListener("click", (e) => {
      if (e.target === groupModalEl) closeGroupModal();
    });
  }

  // Group Active Switch
  bindSwitch(groupActiveSw, "groupActive");
  // ملاحظة: Switch المجموعة بيستخدم groupActiveState وليس switchesState
  if (groupActiveSw) {
    // إعادة ربط للاستخدام الخاص
    groupActiveSw.onclick = null;
    groupActiveSw.onkeydown = null;
  }

  // General Form
  if (generalFormEl) {
    generalFormEl.addEventListener("submit", handleSaveSettings);
  }

  // 3 switches
  bindSwitch(subscriptionsSw, "subscriptions");
  bindSwitch(prayerSw,        "prayer");
  bindSwitch(aiSw,            "ai");

  // إدارة الذكاء الاصطناعي
  bindAIPanel();

  // إعدادات البنك
  bindBankSettings();

  // Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aiEl("stAIConfirmModal").classList.contains("is-open")) closeAIConfirm();
    if (e.key === "Escape" && groupModalEl && groupModalEl.classList.contains("is-open")) {
      closeGroupModal();
    }
  });
}



/* ============================================================
   15-ب — إعدادات بنك مستر إسماعيل (الضريبة الاختيارية)
   الحساب النهائي يتم في Backend عند الطلب؛ المعاينة هنا للعرض فقط.
   ============================================================ */

const bankTax = { enabled: false, rate: 0, saving: false };

function bankEl(id) { return document.getElementById(id); }

function readBankRate() {
  const raw = safeText(bankEl("stBankTaxRate").value);
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return NaN;
  return Number(raw);
}

function renderBankPreview() {
  const box = bankEl("stBankPreview");
  if (!box) return;
  const base = Number(bankEl("stBankPreviewBase").value);
  const rate = readBankRate();
  if (!Number.isInteger(base) || base < 1 || !Number.isFinite(rate)) {
    box.textContent = "أدخل سعرًا ونسبة صحيحين لعرض المعاينة.";
    return;
  }
  const p = calcPricing(base, { enabled: bankTax.enabled && rate > 0, rate });
  box.textContent = `السعر الأساسي: ${p.basePrice} — الضريبة: ${p.taxAmount} — الإجمالي: ${p.finalPrice}`;
}

function setBankSwitch(on) {
  bankTax.enabled = !!on;
  const sw = bankEl("stBankTaxSwitch");
  sw.classList.toggle("is-on", !!on);
  sw.setAttribute("aria-checked", on ? "true" : "false");
  renderBankPreview();
}

async function loadBankSettings() {
  const result = await workerFetch("/api/admin/bank/settings");
  if (!result || !result.success) {
    showToast("تعذر تحميل إعدادات البنك.", "error");
    return;
  }
  const s = (result.data && result.data.settings) || {};
  bankEl("stBankTaxRate").value = String(Number(s.taxRate) || 0);
  setBankSwitch(s.taxEnabled === true);
}

async function saveBankSettings(event) {
  event.preventDefault();
  if (bankTax.saving) return;
  const rate = readBankRate();
  if (!Number.isFinite(rate) || rate < 0 || rate > 50) {
    showToast("نسبة الضريبة يجب أن تكون رقمًا من 0 إلى 50.", "warning");
    return;
  }
  if (bankTax.enabled && rate <= 0) {
    showToast("حدّد نسبة أكبر من صفر لتفعيل الضريبة.", "warning");
    return;
  }
  bankTax.saving = true;
  const btn = bankEl("stBankSaveBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ...";
  const result = await workerFetch("/api/admin/bank/settings", {
    method: "PATCH",
    body: { taxEnabled: bankTax.enabled, taxRate: rate }
  });
  bankTax.saving = false;
  btn.disabled = false;
  btn.textContent = "حفظ إعدادات البنك";
  if (!result || !result.success) {
    showToast((result && result.error && result.error.message) || "تعذر حفظ إعدادات البنك.", "error");
    return;
  }
  showToast("تم حفظ إعدادات البنك. تنطبق على الطلبات الجديدة فقط.", "success");
}

function bindBankSettings() {
  const form = bankEl("stBankForm");
  if (!form) return;
  form.addEventListener("submit", saveBankSettings);
  const sw = bankEl("stBankTaxSwitch");
  const toggle = () => setBankSwitch(!bankTax.enabled);
  sw.addEventListener("click", toggle);
  sw.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  bankEl("stBankTaxRate").addEventListener("input", renderBankPreview);
  bankEl("stBankPreviewBase").addEventListener("input", renderBankPreview);
  renderBankPreview();
}

/* ============================================================
   16 — التهيئة
   ============================================================ */

async function init() {
  const session = requireAdmin();
  if (!session) return;

  cacheElements();
  bindEvents();

  // تحميل متوازي
  await Promise.all([
    loadGroups(),
    loadSettings(),
    loadAISettings(),
    loadBankSettings()
  ]);
}


/* ============================================================
   17 — التشغيل
   ============================================================ */

onReady(init);
