/**
 * flows.js — مكتبة التفاعلات متعددة الخطوات (تعريفات نقية بلا DOM، تُختبر في Node).
 * ------------------------------------------------------------------
 * بدل كتابة منطق مستقل لكل بطاقة: أدوات تركيب صغيرة (ask/end/later/go/back/ladder) تُنتج تعريفات تنفّذها
 * آلة الحالة في engine.js وbrain.js. كل زر هنا يقود إلى:
 *   - خطوة تالية (next) أو رجوع حقيقي (back)،
 *   - إنهاء مع تأكيد (ack) أو تأجيل صريح (snooze)،
 *   - رابط لصفحة موجودة فعلًا (href دالة تُحذف الزر إن أعادت null — لا روابط وهمية)،
 *   - أو إجراء حقيقي مسمّى (act) من actions.js يعيد {ok} فيُؤكَّد النجاح أو تُعرض رسالة فشل مع «جرّب تاني».
 * الجمل نفسها في lines.js (مفاتيح flow.*).
 */
import { config } from "./config.js";
import { safeHref } from "./engine.js";

/** أسماء الإجراءات المسموح بها (نفس مفاتيح ACTIONS في actions.js؛ يتحقق منها الاختبار). */
export const ACTION_NAMES = ["setLevel", "lessen", "highlight", "clickTab", "clickFirst", "openLesson"];

export const ask   = (id, label, more = {}) => ({ id, label, ...more });
export const back  = (label = "رجوع") => ({ id: "back", label, back: true });
export const end   = (id, label, ack = "flow.thanks.ack") => ({ id, label, ack });
export const later = (ack = "flow.later.ack") => ({ id: "later", label: "لاحقًا", ack, snooze: config.snooze.defaultMs });
export const go    = (id, label, href) => ({ id, label, href });
/** إجراء حقيقي: ack عند النجاح، fail عند التعذّر (مع «جرّب تاني» تلقائيًا). */
export const act   = (id, label, name, args, ack, fail = "flow.fail.missing", more = {}) => ({ id, label, act: name, args, ack, fail, ...more });

/**
 * سلّم تلميحات تدريجي: لا يكشف كل شيء من البداية؛ كل درجة تلميح أعمق، مع رجوع وإنهاء.
 * rungs: [{ line, show?: {label, act, args, ack, fail} }] — show يظهر في الدرجة الأخيرة (ما يمكن «عرضه» فعلًا في الصفحة).
 */
export function ladder({ id, cat, cancelOn = [], startLabel = "وريني", rungs }) {
  const steps = { start: { choices: [ask("more", startLabel, { next: "r1" }), later()] } };
  rungs.forEach((rg, i) => {
    const n = i + 1, last = n === rungs.length;
    const primary = last && rg.show
      ? act("show", rg.show.label, rg.show.act, rg.show.args, rg.show.ack, rg.show.fail)
      : (!last ? ask("more", "تلميح كمان", { next: "r" + (n + 1) }) : null);
    steps["r" + n] = { line: rg.line, choices: [primary, end("ok", "تمام"), back()].filter(Boolean) };
  });
  return { id, cat, start: "start", cancelOn, steps };
}

const goExam = (d) => safeHref(d && d.href && /exam\.html/.test(d.href) ? d.href : null, config);

export const FLOWS = {
  examPrep: {
    id: "examPrep", cat: "exam", start: "start", cancelOn: ["exam.intro", "net.offline", "error.generic", "login.fail"],
    steps: {
      start: { choices: [ask("how", "إزاي أستعد؟", { next: "how" }), later()] },
      how: { line: "flow.examPrep.how", choices: [ask("first", "أبدأ بإيه؟", { next: "first" }), ask("time", "عن الوقت", { next: "time" }), end("thanks", "تمام، شكرًا")] },
      first: { line: "flow.examPrep.first", choices: [go("go", "ادخل الامتحان", goExam), back()] },
      time:  { line: "flow.examPrep.time",  choices: [go("go", "ادخل الامتحان", goExam), back()] }
    }
  },
  night: {
    id: "night", cat: "time", start: "start", cancelOn: ["exam.intro", "net.offline"],
    steps: {
      start: { choices: [end("sleep", "هنام دلوقتي", "flow.night.sleep"), ask("more", "شوية كمان", { next: "more" })] },
      more: { line: "flow.night.more", choices: [end("ok", "تمام"), back()] }
    }
  },
  tap: {
    id: "tap", cat: "tap", start: "start", cancelOn: ["exam.intro", "net.offline", "error.generic"],
    steps: {
      start: { choices: [
        ask("suggest", "اقترح عليا", { next: "suggest" }),
        ask("joke", "نكتة", { next: "joke" }),
        act("lessen", "قلّل ظهورك", "lessen", {}, "flow.lessen.ack", "flow.fail.generic", { undo: { label: "رجّعه زي ما كان", act: "setLevel", ack: "flow.lessen.undone" } })
      ] },
      suggest: { dynamic: "suggest", choices: [go("go", "يلا", (d) => safeHref(d && d.suggestHref, config)), back()] },
      joke: { line: "egg.joke", choices: [ask("again", "كمان واحدة", { next: "joke" }), end("enough", "كفاية", null)] }
    }
  },
  /* ---- مساعدة البنك: سلّم تلميحات + إجراءات حقيقية داخل الصفحة ---- */
  bankHelp: ladder({
    id: "bankHelp", cat: "help", cancelOn: ["net.offline", "error.generic", "bank.redeem"],
    rungs: [
      { line: "flow.bank.tabs" },
      { line: "flow.bank.order", show: { label: "وريني فلتر «أقدر عليها»", act: "highlight", args: { selector: "#bkAffordable" }, ack: "flow.bank.filter.ack", fail: "flow.fail.missing" } }
    ]
  }),
  /* ---- مساعدة الدروس ---- */
  lessonsHelp: ladder({
    id: "lessonsHelp", cat: "help", cancelOn: ["net.offline", "error.generic"],
    rungs: [
      { line: "flow.lessons.tabs", show: { label: "وريني التبويبات", act: "highlight", args: { selector: ".ls-tabs" }, ack: "flow.lessons.tabs.ack", fail: "flow.fail.missing" } }
    ]
  }),
  /* ---- مراجعة بعد نتائج منخفضة مؤكدة من النظام: خطوة واحدة واضحة داخل الصفحة ---- */
  lessonsReview: {
    id: "lessonsReview", cat: "help", start: "start", cancelOn: ["net.offline", "error.generic", "exam.intro"],
    steps: {
      start: { choices: [act("open", "ابدأ بأول درس", "clickFirst", { selector: ".ls-card" }, "flow.lessons.review.ack", "flow.fail.missing"), later()] }
    }
  }
};

/** كل تفاعل ⇒ كل خطوة قابلة للوصول، وكل اختيار صالح (للاختبارات والتحقق الذاتي). */
export function validateFlows(flows = FLOWS, lines = null) {
  const problems = [];
  Object.values(flows).forEach((def) => {
    if (!def.steps[def.start]) problems.push(`${def.id}: بداية غير موجودة`);
    Object.entries(def.steps).forEach(([sid, step]) => {
      const chs = step.choices || [];
      if (chs.length > config.flow.maxChoices) problems.push(`${def.id}.${sid}: أكثر من ${config.flow.maxChoices} اختيارات`);
      if (step.line && lines && !lines[step.line]) problems.push(`${def.id}.${sid}: جملة ناقصة ${step.line}`);
      const ids = new Set();
      chs.forEach((ch) => {
        if (ids.has(ch.id)) problems.push(`${def.id}.${sid}: اختيار مكرر ${ch.id}`);
        ids.add(ch.id);
        if (ch.next && !def.steps[ch.next]) problems.push(`${def.id}.${sid}.${ch.id}: خطوة غير موجودة ${ch.next}`);
        if (ch.act && !ACTION_NAMES.includes(ch.act)) problems.push(`${def.id}.${sid}.${ch.id}: إجراء غير معروف ${ch.act}`);
        if (lines) [ch.ack, ch.fail].filter(Boolean).forEach((k) => { if (!lines[k]) problems.push(`${def.id}.${sid}.${ch.id}: جملة ناقصة ${k}`); });
        if (lines && ch.undo && ch.undo.ack && !lines[ch.undo.ack]) problems.push(`${def.id}.${sid}.${ch.id}: جملة تراجع ناقصة ${ch.undo.ack}`);
        if (!ch.next && !ch.back && !ch.act && !ch.href && !ch.ack && ch.id !== "enough") { /* إنهاء صامت مقبول (يغلق البطاقة) */ }
      });
    });
  });
  return problems;
}
