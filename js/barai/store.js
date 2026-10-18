/**
 * store.js — ذاكرة برعي. معرّفات المواقف وأوقاتها فقط (لا بيانات حساسة).
 * كل قراءة/كتابة داخل try/catch، وتعمل الصفحة بدون التخزين (ذاكرة مؤقتة داخل الصفحة).
 */
import { config } from "./config.js";

const LS = "barai:v1";
const SS = "barai:session";
const mem = { ls: {}, ss: { bubbles: 0, moments: 0, pages: {}, lastAt: 0, closedRun: 0, acted: 0, ignoredRun: 0 } };

const health = { corrupt: false };

/** يقرأ من التخزين. null = التخزين يعمل لكن لا يوجد شيء (أو المحتوى تالف فيُعامل كفارغ ويُصلَح عند أول كتابة)؛
 *  undefined = التخزين غير متاح (نستخدم الذاكرة المؤقتة). */
function readJSON(storage, key) {
  let raw;
  try { raw = storage.getItem(key); } catch (e) { return undefined; }
  if (raw === null || raw === undefined || raw === "") return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    health.corrupt = true; return null;
  } catch (e) { health.corrupt = true; return null; }
}
function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

function getLS() {
  let v; try { v = readJSON(window.localStorage, LS); } catch (e) { v = undefined; }
  if (v === undefined) return mem.ls;           // بدون تخزين: ذاكرة الصفحة
  mem.ls = v || {};
  return mem.ls;
}
function setLS(obj) {
  mem.ls = obj;
  try { writeJSON(window.localStorage, LS, obj); } catch (e) { /* بدون تخزين */ }
}
const SS_DEFAULT = () => ({ bubbles: 0, moments: 0, pages: {}, lastAt: 0, closedRun: 0, acted: 0, ignoredRun: 0 });
function getSS() {
  let v; try { v = readJSON(window.sessionStorage, SS); } catch (e) { v = undefined; }
  if (v === undefined) return mem.ss;
  mem.ss = Object.assign(SS_DEFAULT(), v || {});
  return mem.ss;
}
function setSS(obj) {
  mem.ss = obj;
  try { writeJSON(window.sessionStorage, SS, obj); } catch (e) { /* بدون تخزين */ }
}

const today = () => new Date().toISOString().slice(0, 10);

export const store = {
  /** المستوى: "many" | "few" | "silent" (الافتراضي few). */
  getLevel() { const l = getLS().level; return l === "many" || l === "silent" ? l : "few"; },
  setLevel(level) { const s = getLS(); s.level = level; setLS(s); },

  /** تفضيلات الطالب الصريحة (يختارها بنفسه): تتقدّم على أي استنتاج. القيم غير الصالحة تُهمل وتُستبدل بالافتراضي. */
  getPrefs() {
    const p = getLS().prefs, d = config.explicit, ok = (v, list, def) => (list.includes(v) ? v : def);
    const src = p && typeof p === "object" && !Array.isArray(p) ? p : {};
    return { level: store.getLevel(), motion: ok(src.motion, ["auto", "reduced"], d.motion), brevity: ok(src.brevity, ["auto", "short"], d.brevity), flows: ok(src.flows, ["on", "off"], d.flows) };
  },
  setPref(key, value) {
    const allowed = { motion: ["auto", "reduced"], brevity: ["auto", "short"], flows: ["on", "off"] };
    if (key === "level") { if (!["many", "few", "silent"].includes(value)) return false; store.setLevel(value); return store.getLevel() === value; }
    if (!allowed[key] || !allowed[key].includes(value)) return false;
    const s = getLS(); s.prefs = s.prefs && typeof s.prefs === "object" && !Array.isArray(s.prefs) ? s.prefs : {}; s.prefs[key] = value; setLS(s);
    return store.getPrefs()[key] === value;
  },
  /** يعيد كل التفضيلات الصريحة للافتراضي (المستوى «قليل»...). لا يمس ما تعلّمه برعي ولا أي شيء خارج برعي. */
  resetPrefs() { const s = getLS(); delete s.prefs; delete s.level; setLS(s); return true; },
  /** يمسح ذاكرة برعي المحلية (التعلّم وسجل الظهور والزيارات)؛ يُبقي التفضيلات الصريحة وعلامات «شوهد» حتى لا تُعلَن أشياء قديمة كأنها جديدة.
   *  لا يلمس سوى مفتاحي barai:v1 وbarai:session — لا حساب ولا امتحانات ولا أي بيانات للمنصة. */
  clearMemory() {
    const s = getLS();
    ["m", "shown", "lastVisit", "prevPct", "balance", "reducedOn"].forEach((k) => delete s[k]);
    setLS(s);
    setSS(SS_DEFAULT());
    return true;
  },
  /** مسح كل شيء يخص برعي (الذاكرة والتفضيلات وعلامات «شوهد»). */
  clearAll() { mem.ls = {}; mem.ss = SS_DEFAULT(); try { window.localStorage.removeItem(LS); } catch (e) { /* تجاهل */ } try { window.sessionStorage.removeItem(SS); } catch (e) { /* تجاهل */ } return true; },
  health() { return { corrupt: health.corrupt }; },

  lastShown(key) { return Number((getLS().shown || {})[key]) || 0; },
  markShown(key) {
    const s = getLS(); s.shown = s.shown || {}; s.shown[key] = Date.now();
    const keys = Object.keys(s.shown);
    if (keys.length > 80) keys.sort((a, b) => s.shown[a] - s.shown[b]).slice(0, keys.length - 80).forEach((k) => delete s.shown[k]);
    setLS(s);
  },

  /** محوّل ذاكرة برعي الذكية (memory.js) — يخزَّن داخل نفس مفتاح barai:v1 تحت m. */
  memAdapter: {
    read() { return getLS().m || {}; },
    write(obj) { const s = getLS(); s.m = obj; setLS(s); }
  },

  /** هل رأى الطالب هذا المعرّف (امتحان…) من قبل؟ */
  hasSeen(group, id) { return ((getLS().seen || {})[group] || []).includes(String(id)); },
  markSeen(group, ids) {
    const s = getLS(); s.seen = s.seen || {};
    const set = new Set(s.seen[group] || []);
    [].concat(ids).forEach((i) => set.add(String(i)));
    s.seen[group] = Array.from(set).slice(-200);
    setLS(s);
  },

  /** آخر زيارة للمنصة (لموقف «وحشتنا»). */
  getLastVisit() { return Number(getLS().lastVisit) || 0; },
  touchVisit() { const s = getLS(); s.lastVisit = Date.now(); setLS(s); },

  /** آخر درجة لكل امتحان (لموقف التحسّن). */
  getPrevPct() { const v = getLS().prevPct; return typeof v === "number" ? v : null; },
  setPrevPct(p) { const s = getLS(); s.prevPct = p; setLS(s); },

  getBalance() { const v = getLS().balance; return typeof v === "number" ? v : null; },
  setBalance(n) { const s = getLS(); s.balance = Number(n) || 0; setLS(s); },

  /** تخفيف اليوم بعد إغلاقين متتاليين. */
  isReducedToday() { return getLS().reducedOn === today(); },
  reduceToday() { const s = getLS(); s.reducedOn = today(); setLS(s); },

  session: {
    get: getSS,
    bump(field) { const s = getSS(); s[field] = (Number(s[field]) || 0) + 1; setSS(s); return s[field]; },
    page(path) { return Number((getSS().pages || {})[path]) || 0; },
    bumpPage(path) { const s = getSS(); s.pages = s.pages || {}; s.pages[path] = (s.pages[path] || 0) + 1; setSS(s); },
    setLastAt(t) { const s = getSS(); s.lastAt = t; setSS(s); },
    setClosedRun(n) { const s = getSS(); s.closedRun = n; setSS(s); },
    set(field, value) { const s = getSS(); s[field] = value; setSS(s); },
    /** مفتاح عام لقيم الجلسة الصغيرة (بدء الجلسة، مسار الصفحات…). */
    getField(field, fallback) { const v = getSS()[field]; return v === undefined ? fallback : v; }
  }
};
