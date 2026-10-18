/**
 * actions.js — الإجراءات الحقيقية التي تنفّذها أزرار برعي داخل الصفحة (تلمس DOM/التخزين المحلي فقط).
 * ------------------------------------------------------------------
 * كل إجراء يعيد {ok, reason?, ...}: النجاح يُؤكَّد للطالب، والتعذّر يُعرض برسالة مناسبة مع «جرّب تاني».
 * لا شبكة ولا Firestore هنا. مع «تقليل الحركة» لا تمرير ناعم ولا نبض (يُستبدل بإطار ثابت قصير).
 */
import { store } from "./store.js";

const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.baraiMotion === "reduced"; } catch (e) { return false; } };
const visible = (el) => {
  if (!el || !el.isConnected) return false;
  try {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden]");
  } catch (e) { return false; }
};
const find = (sel) => { try { return document.querySelector(sel); } catch (e) { return null; } };
const LEVELS = ["many", "few", "silent"];

export const ACTIONS = {
  /** يضبط مستوى الظهور ويتحقق بالقراءة العكسية (التخزين المحجوب ⇒ فشل صريح لا نجاح كاذب). */
  setLevel({ level }) {
    if (!LEVELS.includes(level)) return { ok: false, reason: "bad-level" };
    const prev = store.getLevel();
    store.setLevel(level);
    return store.getLevel() === level ? { ok: true, prev, level } : { ok: false, reason: "storage" };
  },
  /** يخفّض الظهور درجة: كثير ⇒ قليل ⇒ صامت. */
  lessen() {
    const cur = store.getLevel();
    if (cur === "silent") return { ok: true, prev: cur, level: cur, already: true };
    return ACTIONS.setLevel({ level: cur === "many" ? "few" : "silent" });
  },
  /** يمرّر إلى عنصر ظاهر ويلفت النظر إليه لحظة (نبض، أو إطار ثابت مع تقليل الحركة). */
  highlight({ selector }) {
    const el = find(selector);
    if (!visible(el)) return { ok: false, reason: "missing" };
    try { el.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" }); } catch (e) { /* تجاهل */ }
    el.classList.add("barai-pulse");
    clearTimeout(el._baraiPulse);
    el._baraiPulse = setTimeout(() => el.classList.remove("barai-pulse"), 2200);
    return { ok: true };
  },
  /** ينقر تبويبًا موجودًا فعلًا. */
  clickTab({ selector }) {
    const el = find(selector);
    if (!visible(el)) return { ok: false, reason: "missing" };
    el.click();
    return { ok: true };
  },
  /** ينقر أول عنصر ظاهر يطابق المحدّد (مثل أول درس). */
  clickFirst({ selector }) {
    let el = null;
    try { el = Array.from(document.querySelectorAll(selector)).find(visible) || null; } catch (e) { el = null; }
    if (!el) return { ok: false, reason: "missing" };
    el.click();
    return { ok: true };
  },
  /** يفتح درسًا بمعرّفه إن كان بطاقته ظاهرة في القائمة الحالية. */
  openLesson({ id }) {
    if (!id) return { ok: false, reason: "no-id" };
    let el = null;
    try { el = Array.from(document.querySelectorAll("[data-lesson-id]")).find((n) => n.dataset.lessonId === String(id)) || null; } catch (e) { el = null; }
    if (!visible(el)) return { ok: false, reason: "missing" };
    el.click();
    return { ok: true };
  }
};

/** ينفّذ إجراءً مسمّى؛ أي استثناء ⇒ فشل صريح (لا يكسر الصفحة). */
export function runAction(name, args) {
  try {
    const fn = ACTIONS[name];
    if (typeof fn !== "function") return { ok: false, reason: "unknown-action" };
    const r = fn(args || {});
    return r && typeof r === "object" ? r : { ok: !!r };
  } catch (e) { return { ok: false, reason: "error" }; }
}
