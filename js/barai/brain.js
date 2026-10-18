/**
 * brain.js — عقل برعي: يستقبل أحداثًا ويقرر الظهور والتعبير والجملة.
 * ------------------------------------------------------------------
 * الصفحات تُرسل حدثًا فقط. التدفق:
 *   notify ⇒ مرشّح يدخل طابورًا ⇒ تنتهي النافذة (config.windowMs أو settle()) ⇒ engine.arbitrate
 *   ⇒ عرض الفائز (أو دمج أقوى اثنين) ⇒ commit (علامة «شوهد» + الذاكرة) عند العرض فقط ⇒ تتبّع تفاعل الطالب.
 * إضافات الجولة الثالثة:
 *   - سجل أحداث الجلسة (evlog): يربط ما حدث في صفحات مختلفة (نتيجة منخفضة ثم درس ⇒ جملة تعرف ذلك).
 *   - حلقات الاستجابة: لكل رسالة تُسجَّل نتيجتها (نُفّذ/أُغلق/اختفى/اختار) فتتكيّف الذاكرة بلا استنتاج متسرع.
 *   - تفاعلات متعددة الخطوات (FLOWS): اختيارات داخل الفقاعة، خطوة تلو خطوة، وتُلغى حين يتغير السياق.
 *   - ارتباط الأحداث (CORRELATIONS في engine.js) ⇒ رسالة واحدة تصف موقفين معًا.
 * أي فشل هنا يُبتلع (لا يكسر الصفحة). لا كتابة في Firestore؛ كل تخزين محلي داخل try/catch.
 */
import { config } from "./config.js";
import { LINES, pickLine, tokens } from "./lines.js";
import { FLOWS } from "./flows.js";
import { runAction } from "./actions.js";
import { store } from "./store.js";
import { ui } from "./ui.js";
import { context, memory } from "./context.js";
import { arbitrate, flowStart, flowStepOf, flowChoose, flowExpired, flowCancelledBy, flowProgress, flowActResult, kindOf, canPreempt, inferState, actionableNeeds, safeHref } from "./engine.js";

const page = () => (location.pathname.split("/").pop() || "index.html");
const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

/**
 * القواعد. kind: bubble | moment | inline (يعيد السطر للصفحة).
 * line(d) ⇒ مفتاح أو مصفوفة مفاتيح بترتيب الأفضلية (الأخير هو الاحتياطي).
 * id(d) ⇒ يميّز المثيل داخل نفس الموقف (لتهدئة 24 ساعة لكل معرّف).
 * compoundable: يصلح للدمج مع موقف آخر قابل للتنفيذ في رسالة واحدة.
 */
const RULES = {
  "exam.new":        { kind: "bubble", compoundable: true, flow: "examPrep", id: (d) => d.id, line: (d) => (d.count === 2 ? "exam.new.two" : d.count > 2 && d.count <= 10 ? "exam.new.many" : d.count > 10 ? "exam.new.lots" : "exam.new") },
  "exam.intro":      { kind: "bubble", line: (d) => (d && d.examId && memory.hinted("exam", d.examId) ? ["exam.intro.followup", "exam.intro"] : "exam.intro") },
  "exam.result":     { kind: "inline", line: (d, ctx) => resultKeys(d, ctx) },
  "streak.milestone":{ kind: "bubble", id: (d) => String(d.count), line: () => "streak.milestone" },
  "lesson.completed":{ kind: "bubble", line: (d, ctx) => (ctx && ctx.ev && ctx.ev.recent("exam.result", 45 * 60000, (x) => x.low) ? ["lesson.afterLow", "lesson.completed"] : "lesson.completed") },
  "lesson.returning":{ kind: "bubble", line: () => "lesson.returning" },
  "planner.empty":   { kind: "bubble", line: () => "planner.empty" },
  "planner.taskDone":{ kind: "bubble", line: (d, ctx) => (ctx && ctx.ev && ctx.ev.count("planner.taskDone", 6 * 3600000) >= 2 ? ["planner.taskDone.run", "planner.taskDone"] : "planner.taskDone") },
  "planner.allDone": { kind: "moment", confetti: true, line: () => "planner.allDone" },
  "planner.overdue": { kind: "bubble", compoundable: true, line: () => "planner.overdue" },
  "time.lateNight":  { kind: "bubble", flow: "night", line: () => "time.lateNight" },
  "time.morning":    { kind: "bubble", line: () => "time.morning" },
  "time.friday":     { kind: "bubble", line: () => "time.friday" },
  "net.offline":     { kind: "bubble", critical: true, line: () => "net.offline", sticky: true },
  "net.slow":        { kind: "bubble", critical: true, line: () => "net.slow" },
  "net.back":        { kind: "bubble", critical: true, line: () => "net.back" },
  "net.failed":      { kind: "bubble", critical: true, line: () => "net.failed" },
  "error.generic":   { kind: "bubble", critical: true, line: () => "error.generic" },
  "page.notFound":   { kind: "inline", line: () => "page.notFound" },
  "login.first":     { kind: "bubble", ignoreFocus: true, line: () => "login.first" },
  "login.firstStep": { kind: "bubble", ignoreFocus: true, line: () => "login.firstStep" },
  "login.fail":      { kind: "bubble", critical: true, line: (d) => (d && d.kind === "password" ? "login.fail.password" : d && d.kind === "code" ? "login.fail.code" : "login.fail") },
  "login.success":   { kind: "bubble", line: () => "login.success" },
  "bank.orderStatus":{ kind: "bubble", compoundable: true, id: (d) => String(d.id || "") + ":" + String(d.status || ""), line: (d) => "bank.orderStatus." + String(d.status || "") },
  "bank.earned":     { kind: "bubble", id: (d) => String(d.id || d.balance || ""), line: (d) => (d.reason ? ["bank.earned.reason", "bank.earned"] : "bank.earned") },
  "bank.afford":     { kind: "bubble", compoundable: true, id: (d) => String(d.id || ""), line: () => "bank.afford" },
  "bank.near":       { kind: "bubble", id: (d) => String(d.id || ""), line: () => "bank.near" },
  "bank.newReward":  { kind: "bubble", compoundable: true, id: (d) => String(d.id || ""), line: () => "bank.newReward" },
  "bank.lowStock":   { kind: "bubble", id: (d) => String(d.id || ""), line: () => "bank.lowStock" },
  "bank.blocked":    { kind: "bubble", line: () => "bank.blocked" },
  "bank.welcome":    { kind: "bubble", line: () => "bank.welcome" },
  "bank.redeem":     { kind: "moment", confetti: true, line: () => "bank.redeem" },
  "bank.poor":       { kind: "bubble", line: () => "bank.poor" },
  "event.live":      { kind: "bubble", compoundable: true, id: (d) => d.id, line: () => "event.live" },
  "event.ended":     { kind: "bubble", id: (d) => d.id, line: () => "event.ended" },
  "ai.open":         { kind: "bubble", ignoreFocus: "empty", line: () => "ai.open" },
  "ai.thinking":     { kind: "inline", line: () => "ai.thinking" },
  "ai.limit":        { kind: "bubble", ignoreFocus: true, line: () => "ai.limit" },
  "ai.error":        { kind: "bubble", critical: true, line: () => "ai.error" },
  "announce.unread": { kind: "bubble", compoundable: true, line: () => "announce.unread" },
  "announce.onPage": { kind: "bubble", line: (d) => (memory.hinted("announce", "unread") ? ["announce.onPage.followup", "announce.onPage"] : "announce.onPage") },
  "announce.allRead":{ kind: "bubble", line: () => (memory.hinted("announce", "unread") ? ["announce.allRead.followup", "announce.allRead"] : "announce.allRead") },
  "bank.open":       { kind: "bubble", flow: "bankHelp", line: () => "bank.open" },
  "lessons.open":    { kind: "bubble", flow: (d, ctx) => (hasNeed(ctx, "review") ? "lessonsReview" : "lessonsHelp"), line: (d, ctx) => (hasNeed(ctx, "review") ? "lessons.open.review" : "lessons.open") },
  "lesson.resume":   { kind: "bubble", id: (d) => String(d.id || ""), line: (d) => (d && d.title ? "lesson.resume" : null) },
  "tap.hello":       { kind: "bubble", manual: true, flow: "tap", line: (d) => (d && d.page && LINES["tap." + d.page] ? ["tap." + d.page, "tap.generic"] : "tap.generic") },
  "egg.joke":        { kind: "bubble", critical: true, manual: true, line: () => "egg.joke" },
  "egg.intro":       { kind: "bubble", critical: true, manual: true, line: () => "egg.intro" }
};

/* ============================================================
   التفاعلات متعددة الخطوات
   كل خطوة: line (مفتاح جملة، والخطوة الأولى تأخذ جملة الحدث نفسها) + choices:[{id,label,next|ack|href,snooze}]
   href دالة (data)=>رابط أو null: الاختيار يُحذف إن لم يتوفر الرابط (لا أزرار تقود لشيء غير موجود).
   cancelOn: أحداث تُلغي التفاعل لأن السياق تغيّر (بدأ الامتحان، انقطع النت…).
   ============================================================ */
/** هل الحالة المقدّرة تؤكّد احتياجًا بثقة كافية وأساس مؤكَّد/سلوكي؟ (النيّة وحدها لا تكفي) */
function hasNeed(ctx, k) { try { return !!(ctx && ctx.state && actionableNeeds(ctx.state, config).some((n) => n.k === k)); } catch (e) { return false; } }

/** اقتراح مبني على معلومة فعلية فقط (ما قاله برعي ولم يُنفَّذ، ما تعرضه الصفحة، اتجاه الدرجات، مدة الجلسة). */
function suggestion(ctx) {
  const facts = ctx.facts || {};
  const here = page();
  const hints = memory.hints("exam"), ids = Object.keys(hints);
  if (ids.length && here !== "exams.html" && here !== "exam.html") {
    const h = hints[ids[ids.length - 1]] || {};
    if (h.title) return { line: "suggest.exam", vars: { title: h.title }, href: "exams.html", label: "افتح الاختبارات" };
  }
  if (Number(facts.unread) > 0 && here !== "announcements.html") return { line: "suggest.unread", vars: {}, href: "announcements.html", label: "افتح الرسائل" };
  if (ctx.scores && ctx.scores.lowRun >= 1 && here !== "lessons.html") return { line: "suggest.lowrun", vars: {}, href: "lessons.html", label: "افتح الدروس" };
  if (facts.tasksToday === 0 && here !== "planner.html") return { line: "suggest.planner", vars: {}, href: "planner.html", label: "افتح المنظّم" };
  if (ctx.sessionAgeMs > 45 * 60000) return { line: "suggest.rest", vars: {}, href: null };
  return { line: "suggest.generic", vars: {}, href: here === "lessons.html" ? null : "lessons.html", label: "افتح الدروس" };
}

/** مفاتيح تعليق نتيجة الاختبار: اتجاه الدرجات المحلي + ما قاله برعي قبل ذلك. */
function resultKeys(d, ctx) {
  if (d.pending) return ["exam.result.pending"];
  const total = Number(d.total), score = Number(d.score);
  if (!(total > 0) || !isFinite(score)) return null;
  const pct = (score / total) * 100;
  const tr = memory.scoreTrend();
  const hinted = d.examId && memory.hinted("exam", d.examId);
  const out = [];
  if (pct >= 100) out.push("exam.result.perfect");
  else if (pct >= 85) { if (hinted) out.push("exam.result.followup.great"); out.push("exam.result.great"); }
  else if (pct >= 50) {
    if (tr.lowRun >= 1) out.push("exam.result.comeback");
    else if (tr.last !== null && pct - tr.last >= config.trend.delta) out.push("exam.result.improved");
    else if (tr.trend === "up") out.push("exam.result.improved");
    if (hinted) out.push("exam.result.followup.ok");
    out.push("exam.result.ok");
  } else {
    if (tr.lowRun >= 2) out.push("exam.result.lowRun");
    if (hinted) out.push("exam.result.followup.low");
    out.push("exam.result.low");
  }
  return out;
}

/* ============================================================
   الحالة الداخلية
   ============================================================ */
let busyFlag = false;
let lastTapAt = 0;
let stickyEl = null;
let queue = [];               // مرشّحون في النافذة الحالية
let winTimer = null, winStart = 0, settled = false, flushing = false;
const retryTimers = new Set();
const decisions = [];         // آخر القرارات (للتشخيص ?barai=debug)
let active = null;            // التفاعل الجاري: {def, st, c, data, el, tk, common, epId, shownAt}
let tkSeq = 0;                // رقم الخطوة: اختيار من خطوة قديمة يُتجاهل
let epoch = 0;                // يزيد عند تغيّر جوهري في السياق (بدأ اختبار/مشغّل، غاب الطالب): المرشّحون الأقدم يسقطون
let cur = null;               // المعروض الآن: {event, tier, kind, sticky, interacted, el} — للأولويات والمقاطعة
let hiddenAt = 0;

/* ---------- سجل أحداث الجلسة (يربط الأحداث عبر الصفحات؛ أسماء أحداث وأوقات فقط) ---------- */
const EVLOG_MAX = 14;
function evRead() { try { return store.session.getField("evlog", []) || []; } catch (e) { return []; } }
function evPush(event, extra) {
  try { store.session.set("evlog", evRead().concat(Object.assign({ e: event, t: Date.now() }, extra || {})).slice(-EVLOG_MAX)); } catch (e) { /* تجاهل */ }
}
/** مساعدات السياق: كم مرة وقع الحدث مؤخرًا؟ هل وقع حدث يطابق شرطًا؟ */
const evHelper = {
  count(event, withinMs) { const t = Date.now(); return evRead().filter((x) => x.e === event && t - x.t <= withinMs).length; },
  recent(event, withinMs, pred) { const t = Date.now(); return evRead().some((x) => x.e === event && t - x.t <= withinMs && (!pred || pred(x))); }
};
function snap() {
  const ctx = context.snapshot({ busyFlag });
  try { ctx.prefs = memory.prefs(); } catch (e) { ctx.prefs = { brevity: null, flows: null, actions: null, why: {} }; }
  ctx.ev = evHelper;
  ctx.epoch = epoch;
  /* تفضيلات الطالب الصريحة تتقدّم على أي استنتاج */
  try {
    ctx.explicit = store.getPrefs();
    if (ctx.explicit.brevity === "short") ctx.prefs.brevity = "short";
    if (ctx.explicit.flows === "off") ctx.prefs.flows = "off";
  } catch (e) { ctx.explicit = { level: "few", motion: "auto", brevity: "auto", flows: "on" }; }
  /* صورة الجلسة: مؤكَّد/سلوك/نيّة بدرجات ثقة (أدلة فقط) */
  try { ctx.state = inferState(ctx, { evlog: evRead(), hints: { exam: memory.hints("exam") } }, config); } catch (e) { ctx.state = null; }
  return ctx;
}

const eventCfg = (k) => config.events[k] || { tier: "contextual", cat: k.split(".")[0], imp: 0.5, urg: 0.5 };
const arr = (v) => (Array.isArray(v) ? v : [v]);

const recentTexts = () => { try { return memory.recentTexts(); } catch (e) { return []; } };

/** يختار الصيغة لمرشّح: نبرة السياق، عدم تكرار آخر 3، الاسم نادر. */
function chooseLine(lineKeys, d, ctx) {
  const nameOpen = !!(ctx.identity.firstName) && memory.nameGateOpen();
  const vars = Object.assign({}, d);
  if (!vars.name && nameOpen) vars.name = ctx.identity.firstName;
  for (const k of arr(lineKeys)) {
    if (!k || !LINES[k]) continue;
    const short = ctx.prefs && ctx.prefs.brevity === "short";      // تفضيل موثوق (عيّنات كافية): صيغ مختصرة
    const picked = pickLine(k, vars, { avoid: memory.lastLines(k), tones: ctx.tone && ctx.tone !== "normal" ? [ctx.tone] : [], preferName: nameOpen && Math.random() < config.name.preferChance, maxLen: short ? config.prefs.shortLen : 0, avoidTexts: recentTexts(), simThreshold: config.similarity.threshold });
    if (picked) return Object.assign(picked, { lineKey: k });
  }
  return null;
}

function buildCandidate(eventKey, d, ctx) {
  const rule = RULES[eventKey];
  const ec = eventCfg(eventKey);
  const keys = rule.line(d, ctx);
  if (!keys) return null;
  const picked = chooseLine(keys, d, ctx);
  if (!picked) return null;
  const idPart = rule.id ? rule.id(d) : "";
  return {
    event: eventKey, rule, cat: ec.cat, tier: ec.tier, imp: ec.imp, urg: ec.urg, flow: !!ec.flow,
    kind: rule.kind === "moment" ? "moment" : "bubble",
    cdKey: eventKey + (idPart ? ":" + idPart : ""),
    critical: ec.tier === "critical", manual: !!rule.manual,
    ignoreFocus: rule.manual ? true : rule.ignoreFocus,
    isNew: !!d.commit,
    topic: config.topics.of[eventKey] || ec.cat,
    followup: config.topics.followups.includes(eventKey),
    hasAction: !!(d.href && d.actionLabel),
    flowId: typeof rule.flow === "function" ? rule.flow(d, ctx) : (rule.flow || null),
    msgKind: kindOf(eventKey, config), born: Date.now(), epoch: ctx.epoch,
    phrase: !!rule.compoundable, data: d, picked, tries: 0
  };
}

/* ============================================================
   النافذة والتحكيم
   ============================================================ */
function enqueue(c, immediate) {
  queue = queue.filter((x) => x.cdKey !== c.cdKey).concat(c);   // نفس الموقف مرتين ⇒ آخر نسخة
  if (!winStart) winStart = Date.now();
  if (immediate || c.critical || c.manual || c.flow) { flush(); return; }
  scheduleFlush();
}

function scheduleFlush() {
  if (winTimer) clearTimeout(winTimer);
  const t = Date.now();
  let wait = Math.max(0, winStart + config.windowMs - t);
  if (settled) wait = Math.min(wait, config.settleMs);
  wait = Math.min(wait, Math.max(0, winStart + config.maxHoldMs - t));
  winTimer = setTimeout(flush, wait);
}

function flush() {
  if (winTimer) { clearTimeout(winTimer); winTimer = null; }
  if (flushing) return;
  flushing = true;
  try {
    const cands = queue; queue = []; winStart = 0;
    if (!cands.length) return;
    const ctx = snap();
    let quiet = 0; try { quiet = memory.quietness().q; } catch (e) { /* تجاهل */ }
    const env = { level: store.getLevel(), ss: store.session.get(), reducedToday: store.isReducedToday(), mem: memory, now: Date.now(), page: page(), quiet, sessionStart: Date.now() - (ctx.sessionAgeMs || 0) };
    const res = arbitrate(cands, ctx, env, config);
    record(res, ctx);

    res.deferred.forEach((c) => {
      c.tries++;
      if (c.tries > config.maxTries) return;
      if (c.critical && c.tries >= 2) c.overrideBusy = true;
      const id = setTimeout(() => { retryTimers.delete(id); try { enqueue(c, false); } catch (e) { /* تجاهل */ } }, config.retryMs);
      retryTimers.add(id);
    });

    if (res.winner) {
      /* أولوية المقاطعة: لا نستبدل بطاقة بأقل منها ولا بطاقة يتفاعل معها الطالب، ولا نضع بطاقتين فوق بعضهما */
      if (cur && (!ui.isBubbleVisible() || !cur.el || !cur.el.isConnected)) cur = null;
      const pre = canPreempt(cur, res.winner, config);
      if (!pre.ok) {
        try { decisions[decisions.length - 1].shown = { event: res.winner.event, blocked: pre.reason }; } catch (e) { /* تجاهل */ }
        if (pre.reason === "user-engaged" || pre.reason === "sticky-current") {
          const w = res.winner; w.tries = (w.tries || 0) + 1;
          if (w.tries <= config.maxTries) { const id = setTimeout(() => { retryTimers.delete(id); try { enqueue(w, false); } catch (e) { /* تجاهل */ } }, config.retryMs * 2); retryTimers.add(id); }
        }
      } else show(res.winner, res.compound ? res.second : null, ctx, res.corr);
    }
  } catch (e) { /* تجاهل */ } finally { flushing = false; }
}

function record(res, ctx) {
  try {
    decisions.push({ t: Date.now(), page: page(), tone: ctx.tone, prefs: ctx.prefs ? { brevity: ctx.prefs.brevity, flows: ctx.prefs.flows, actions: ctx.prefs.actions } : null, corr: res.corr ? res.corr.line : null,
      log: res.log.map((x) => ({ event: x.event, status: x.status, reason: x.reason || null, score: x.score === undefined ? null : x.score, bar: x.bar === undefined ? null : x.bar, notes: x.notes || [], correlated: x.correlated || null })) });
    if (decisions.length > 30) decisions.shift();
  } catch (e) { /* تجاهل */ }
}

/* ============================================================
   العرض + commit + التقاط التفاعل
   ============================================================ */
const compoundKey = (a, b) => "compound." + [a.cat, b.cat].sort().join("+");

function actionOf(c) {
  const d = c.data || {};
  if (d.act && d.act.name && d.act.label) return { label: d.act.label, onClick: () => runBubbleAction(c, d.act) };   // زر ينفّذ إجراءً حقيقيًا داخل الصفحة
  return d.href && d.actionLabel ? { label: d.actionLabel, href: d.href } : null;
}

function commit(c, counts, ctx, now) {
  try {
    const d = c.data || {};
    if (d.commit && d.commit.group) store.markSeen(d.commit.group, d.commit.ids || []);     // «شوهد» فقط حين تظهر الرسالة فعلًا
    if (c.picked) memory.pushLine(c.picked.lineKey, c.picked.index);
    if (counts) {
      memory.recordShown(c.cat, now);
      memory.markKey(c.cdKey, now);
      memory.markTopic(c.topic || c.cat, now);
      store.markShown(c.cdKey);
    }
    memory.noteMessage(!!(c.picked && c.picked.usedName));
    /* ما قاله برعي ⇒ يُتابَع لاحقًا */
    if (c.event === "exam.new") (d.ids || [d.id]).filter(Boolean).forEach((id) => memory.hint("exam", id, { title: d.title || "" }));
    if (c.event === "announce.unread") memory.hint("announce", "unread", { n: d.count || 0 });
    if (c.event === "announce.allRead") memory.clearHint("announce", "unread");
    if (c.event === "announce.onPage") memory.clearHint("announce", "unread");
  } catch (e) { /* تجاهل */ }
}

/** تفاعل يُعرض لهذا المرشّح؟ (مسموح فقط حين لا يكون الطالب قد تجاهل الاختيارات مرارًا، ولا الاتصال بطيئًا) */
function flowAllowed(c, ctx) {
  if (!c.flowId || !FLOWS[c.flowId]) return false;
  if (ctx.prefs && ctx.prefs.flows === "off" && !c.manual) return false;
  if (ctx.net && ctx.net.slow) return false;
  return true;
}

/** عرض خطوة: النص/التعبير/الإجراء/الاختيارات/التقدّم. الخطوة الأولى تحمل جملة الحدث نفسها. */
function stepView(a, ctx) {
  const step = flowStepOf(a.def, a.st);
  if (!step) return null;
  const d = a.data || {};
  let text, mood, href = null;
  const first = a.st.step === a.def.start;
  if (first) { text = a.c.picked.text; mood = a.c.picked.mood; }
  else if (step.dynamic === "suggest") {
    const sg = suggestion(ctx);
    const pk = chooseLine(sg.line, sg.vars, ctx) || chooseLine("suggest.generic", {}, ctx);
    if (!pk) return null;
    text = pk.text; mood = pk.mood; href = sg.href ? { href: safeHref(sg.href, config), label: sg.label } : null;
    if (href && !href.href) href = null;
  } else {
    const pk = step.line ? chooseLine(step.line, Object.assign({}, d), ctx) : null;
    if (!pk) return null;
    text = pk.text; mood = pk.mood;
  }
  const dd = href ? Object.assign({}, d, { suggestHref: href.href }) : d;
  const choices = (step.choices || []).map((ch) => {
    let h = typeof ch.href === "function" ? ch.href(dd) : ch.href;
    if (h) h = safeHref(h, config);                                   // لا روابط خارج صفحات المنصة المعروفة
    if (ch.href && !h) return null;                                   // لا زر يقود لشيء غير موجود
    if (ch.back && !((a.st.hist || []).length)) return null;          // لا «رجوع» بلا خطوة سابقة
    return { id: ch.id, label: ch.label, href: h || null };
  }).filter(Boolean);
  const pr = flowProgress(a.def, a.st);
  return { text, mood, choices, action: first ? actionOf(a.c) : null, progress: pr.total > 1 ? pr : null };
}

function endActive(outcome) {
  const a = active; active = null;
  if (a) {
    try { memory.endEpisode(a.epId, outcome, Date.now() - a.shownAt); } catch (e) { /* تجاهل */ }
    try { memory.recordFlow(a.def.id, outcome === "cancelled" ? "cancelled" : "abandoned"); } catch (e) { /* تجاهل */ }
  }
}

/** إلغاء التفاعل القديم عند تغيّر السياق (بدون ادّعاء أن الطالب أغلقه). */
function cancelFlow(why) {
  if (!active) return false;
  const a = active;
  endActive("cancelled");
  try { if (ui.isCurrent(a.el)) ui.hideBubble(why || "flow-cancel"); } catch (e) { /* تجاهل */ }
  return true;
}

/** يعرض نتيجة (تأكيد نجاح / رسالة فشل) داخل البطاقة نفسها، مع اختيارات اختيارية (تراجع / جرّب تاني). */
function showOutcome(el, lineKey, { choices = null, onChoose, key = "", kind = "reply" } = {}) {
  if (!ui.isCurrent(el)) return null;
  const pk = lineKey ? chooseLine(lineKey, {}, snap()) : null;
  if (!pk) { ui.hideBubble("choice-end"); return null; }
  memory.pushLine(pk.lineKey, pk.index);
  return ui.morphBubble({ text: pk.text, mood: pk.mood, key, kind, choices, onChoose, ttl: choices ? 9000 : 4200, onTimeout: () => {}, onClose: () => ui.hideBubble("close"), onInteract: () => {} });
}

/** ينفّذ إجراءً حقيقيًا من اختيار: نجاح ⇒ تأكيد (+ تراجع إن وُجد)، تعذّر ⇒ رسالة مناسبة + «جرّب تاني» (حدّ 3 محاولات). */
function runChoiceAct(a, choice, args) {
  const el = a.el;
  const result = runAction(choice.act, args || choice.args || {});
  const out = flowActResult(a.def, a.st, choice, result);
  if (out.type === "end") {
    try { memory.recordFlow(a.def.id, "completed"); } catch (e) { /* تجاهل */ }
    if (active === a) active = null;
    let undo = null;
    const u = choice.undo;
    if (u && result.prev && result.prev !== result.level) undo = { label: u.label, act: u.act, args: { level: result.prev }, ack: u.ack };
    const choices = undo ? [{ id: "undo", label: undo.label }] : null;
    showOutcome(el, out.ack, { key: a.c.cdKey, choices, onChoose: choices ? (id) => { if (id !== "undo") return; const r = runAction(undo.act, undo.args); showOutcome(el, r.ok ? undo.ack : "flow.fail.generic", { key: a.c.cdKey }); } : undefined });
    return true;
  }
  a.fails = (a.fails || 0) + 1;
  const tk = ++tkSeq; a.tk = tk;
  const canRetry = a.fails < 3;
  const choices = [canRetry ? { id: "retry", label: "جرّب تاني" } : null, (a.st.hist || []).length ? { id: "back", label: "رجوع" } : null].filter(Boolean);
  showOutcome(el, out.ack, { key: a.c.cdKey, kind: "alert", choices: choices.length ? choices : null, onChoose: (id) => {
    if (active !== a || a.tk !== tk) return;
    if (id === "retry") runChoiceAct(a, choice, args);
    else if (id === "back") renderActive();
  } });
  return false;
}

/** اختيار الطالب من خطوة (اختيار من خطوة قديمة يُتجاهل بالرقم tk). */
function onChoose(tk, id) {
  try {
    const a = active;
    if (!a || a.tk !== tk) return;
    if (flowExpired(a.st, Date.now(), config)) { cancelFlow("flow-expired"); return; }
    const res = flowChoose(a.def, a.st, id);
    if (!res) return;
    if (cur && cur.el === a.el) cur.interacted = true;
    memory.endEpisode(a.epId, "chose", Date.now() - a.shownAt);            // أول اختيار = تفاعل حقيقي
    store.session.setClosedRun(0); store.session.set("ignoredRun", 0); store.session.bump("acted");
    if (res.type === "act") { runChoiceAct(a, res.choice, res.args); return; }
    if (res.snooze) memory.snooze(a.def.cat, res.snooze);                  // طلب صريح من الطالب: «لاحقًا»
    if (res.type === "step") { a.st = res.state; renderActive(); return; }
    memory.recordFlow(a.def.id, "completed");
    if (res.href) { active = null; return; }                               // الرابط ينقل الصفحة بنفسه
    const ack = res.ack ? chooseLine(res.ack, a.data || {}, snap()) : null;
    const el = a.el;
    active = null;
    if (ack && ui.isCurrent(el)) {
      memory.pushLine(ack.lineKey, ack.index);
      ui.morphBubble({ text: ack.text, mood: ack.mood, key: a.c.cdKey, kind: "reply", ttl: 4200, onTimeout: () => {}, onClose: () => ui.hideBubble("close"), onInteract: () => {} });
    } else if (ui.isCurrent(el)) ui.hideBubble("choice-end");
  } catch (e) { /* تجاهل */ }
}

function renderActive() {
  const a = active;
  if (!a) return;
  const ctx = snap();
  const v = stepView(a, ctx);
  if (!v) { cancelFlow("flow-empty"); return; }
  const tk = ++tkSeq; a.tk = tk;
  const el = ui.morphBubble({ ...a.common, text: v.text, mood: v.mood, action: v.action, secondary: null, choices: v.choices, progress: v.progress, onChoose: (id) => onChoose(tk, id) });
  if (!el) { endActive("cancelled"); return; }
  a.el = el;
  if (cur && cur.event === a.c.event) cur.el = el;
}

/* اختفاء الفقاعة لأي سبب ⇒ تُغلق حلقتها (الإغلاق الأول حاسم) ويُنهى التفاعل المرتبط بها */
const HIDE_OUTCOME = { scroll: "scrolled", timeout: "timeout", close: "closed", "net-back": "cancelled" };
try {
  ui.onBubbleHidden((reason, el) => {
    try {
      const out = HIDE_OUTCOME[reason] || "replaced";
      const id = el && el.dataset && el.dataset.ep;
      if (id) memory.endEpisode(id, out);
      if (cur && cur.el === el) cur = null;
      if (active && active.el === el) { memory.recordFlow(active.def.id, out === "replaced" || out === "cancelled" ? "cancelled" : "abandoned"); active = null; }
    } catch (e) { /* تجاهل */ }
  });
} catch (e) { /* تجاهل */ }

/** إجراء مرتبط بزر الرسالة نفسها (مثل «افتحه»): نجاح ⇒ تُغلق البطاقة، تعذّر ⇒ رسالة فشل مناسبة. */
function runBubbleAction(c, spec) {
  const result = runAction(spec.name, spec.args);
  const el = ui.current();
  if (result.ok) { if (el) ui.hideBubble("acted"); return; }
  if (el) showOutcome(el, "flow.fail.missing", { key: c.cdKey, kind: "alert" });
}

function show(c, second, ctx, corr) {
  const now = Date.now();
  const rule = c.rule;
  let text = c.picked.text, mood = c.picked.mood;
  let action = actionOf(c), secondary = null;
  let merged = null;

  if (second) {
    const ck = corr ? corr.line : compoundKey(c, second);
    const vars = corr ? Object.assign({}, second.data || {}, c.data || {}) : {};
    const cp = LINES[ck] ? chooseLine(ck, vars, ctx) : null;
    if (cp) {
      merged = second;
      text = cp.text; mood = (corr && corr.mood) || c.picked.mood || cp.mood;
      const a2 = actionOf(second);
      if (!action && a2) { action = a2; } else if (a2 && action) secondary = a2;
      c.picked = Object.assign({}, c.picked, { lineKey: cp.lineKey, index: cp.index, usedName: cp.usedName, text });
    }
  }

  const counts = !c.critical && !c.manual;
  const kindMoment = rule.kind === "moment";
  /* تفاعل متعدد الخطوات؟ (فقاعة فقط، وبلا دمج: الدمج رسالة مكتملة) */
  const canFlow = !kindMoment && !merged && flowAllowed(c, ctx);
  const def = canFlow ? FLOWS[c.flowId] : null;
  const shownAt = now;
  const epId = (() => { try { return memory.startEpisode({ event: c.event, cat: c.cat, key: c.cdKey, len: String(text).length, action: !!action, choices: !!def, topic: c.topic, manual: c.manual }, now); } catch (e) { return null; } })();

  const touch = () => { if (cur && cur.event === c.event) cur.interacted = true; };
  const common = {
    text, mood, key: c.cdKey, kind: c.msgKind, action, secondary,
    onInteract: () => { touch(); store.session.setClosedRun(0); store.session.set("ignoredRun", 0); },
    onAction: () => {
      touch();
      store.session.setClosedRun(0); store.session.set("ignoredRun", 0);
      store.session.bump("acted");
      try { memory.endEpisode(epId, "acted", Date.now() - shownAt); } catch (e) { /* تجاهل */ }
      if (counts) { memory.recordAction(c.cat); if (merged) memory.recordAction(merged.cat); }
    },
    onTimeout: () => {
      endActive("timeout");
      if (rule.kind === "moment") return;     // اللحظات الاحتفالية لا تُعدّ «تجاهلًا»
      // اختفت وحدها = لم تُغلق (تنكسر سلسلة الإغلاق) لكن تُحسب «تجاهلًا»
      try { memory.endEpisode(epId, "timeout", Date.now() - shownAt); } catch (e) { /* تجاهل */ }
      store.session.setClosedRun(0);
      store.session.set("ignoredRun", (Number(store.session.get().ignoredRun) || 0) + 1);
      if (counts) memory.recordTimeout(c.cat);
    },
    onDismiss: () => { try { memory.endEpisode(epId, "scrolled", Date.now() - shownAt); } catch (e) { /* تجاهل */ } endActive("scrolled"); },   // بالتمرير: لا إغلاق ولا تجاهل
    onClose: (why) => {
      endActive("closed");
      try { memory.endEpisode(epId, "closed", Date.now() - shownAt); } catch (e) { /* تجاهل */ }
      if (rule.kind === "moment") ui.hideMoment(); else ui.hideBubble(why);
      store.session.set("ignoredRun", 0);
      const run = (Number(store.session.get().closedRun) || 0) + 1;   // مصدر واحد: sessionStorage
      store.session.setClosedRun(run);
      if (counts) { memory.recordClosed(c.cat, Date.now()); if (merged) memory.recordClosed(merged.cat, Date.now()); }
      if (run >= 2) store.reduceToday();
    }
  };

  let shownEl = null;
  if (kindMoment) shownEl = ui.showMoment({ ...common, confetti: rule.confetti && !reduceMotion() });
  else {
    let choices = null, tk = 0, progress = null;
    if (def) {
      const a = { def, st: flowStart(def, now), c, data: c.data || {}, el: null, tk: 0, common, epId, shownAt };
      const v = stepView(a, ctx);
      if (v && v.choices.length) { tk = ++tkSeq; a.tk = tk; choices = v.choices; progress = v.progress; active = a; }
    }
    const el = ui.showBubble({ ...common, choices, progress, onChoose: choices ? (id) => onChoose(tk, id) : undefined, ttl: rule.sticky ? 3600000 : undefined, sticky: !!rule.sticky });
    if (!el) {                                   // المكان كله محجوب بعناصر مهمة (حقول/أزرار): تُؤجَّل ولا تُحتسب ظاهرة
      if (active && active.epId === epId) active = null;
      try { memory.endEpisode(epId, "cancelled", 0); } catch (e) { /* تجاهل */ }
      [c, merged].filter(Boolean).forEach((x) => { x.tries = (x.tries || 0) + 1; if (x.tries <= config.maxTries) { const id = setTimeout(() => { retryTimers.delete(id); try { enqueue(x, false); } catch (e) { /* تجاهل */ } }, config.retryMs); retryTimers.add(id); } });
      try { decisions[decisions.length - 1].shown = { event: c.event, blocked: "avoid" }; } catch (e) { /* تجاهل */ }
      return;
    }
    try { el.dataset.ep = epId || ""; } catch (e) { /* تجاهل */ }
    if (active && active.epId === epId) { active.el = el; try { memory.recordFlow(def.id, "started"); } catch (e) { /* تجاهل */ } }
    if (rule.sticky) stickyEl = el;
    shownEl = el;
  }
  cur = { event: c.event, tier: c.tier, kind: kindMoment ? "moment" : "bubble", sticky: !!rule.sticky, interacted: false, el: shownEl };

  commit(c, counts, ctx, now);
  if (merged) commit(merged, counts, ctx, now);
  try { memory.noteText(tokens(text), now); } catch (e) { /* تجاهل */ }       // لمنع تشابه الصيغ عبر المواقف
  if (counts) {
    if (rule.kind === "moment") store.session.bump("moments");
    else { store.session.bump("bubbles"); store.session.bumpPage(page()); }
    store.session.setLastAt(now);
  }
  try { decisions[decisions.length - 1].shown = { event: c.event, merged: merged ? merged.event : null, text, mood, kind: c.msgKind, flow: def ? def.id : null }; } catch (e) { /* تجاهل */ }
}

/* ============================================================
   الواجهة العامة
   ============================================================ */
/* ---- ربط مرة واحدة لكل صفحة: تغيّب الطالب ⇒ يسقط ما نشأ قبله، ومغادرة الصفحة ⇒ تنظيف كامل ---- */
let bound = false;
function bindLifecycle() {
  if (bound) return; bound = true;
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 20000) { epoch++; hiddenAt = 0; }
    });
    window.addEventListener("pagehide", () => { try { brain.dispose(); } catch (e) { /* تجاهل */ } });
    window.addEventListener("pageshow", (e) => { if (e && e.persisted) epoch++; });
  } catch (e) { /* تجاهل */ }
}

export const brain = {
  setBusy(v) { busyFlag = !!v; if (busyFlag) { epoch++; active = null; cur = null; ui.hideAll(); } },

  /** يُرجع {text, mood} لأحداث inline، وإلا يضع مرشّحًا في الطابور ويعيد null. */
  notify(eventKey, data = {}) {
    try {
      const rule = RULES[eventKey];
      if (!rule) return null;
      context.init();
      bindLifecycle();
      const ctx = snap();
      if (active && flowCancelledBy(active.def, eventKey)) cancelFlow("flow-cancel:" + eventKey);   // تغيّر السياق ⇒ التفاعل القديم لم يعد صالحًا
      if (eventKey === "net.back" && stickyEl) { ui.hideBubble("net-back"); stickyEl = null; }
      if (rule.kind === "inline") {
        const keys = rule.line(data, ctx);
        const picked = keys ? chooseLine(keys, data, ctx) : null;
        if (picked) memory.pushLine(picked.lineKey, picked.index);
        if (eventKey === "exam.result") {
          if (data.examId) { try { memory.completeTask("exam", data.examId); } catch (e) { /* تجاهل */ } }
          let low = false;
          if (!data.pending && data.total > 0 && isFinite(Number(data.score))) { const pct = (data.score / data.total) * 100; memory.pushScore(pct); low = pct < config.trend.lowPct; }
          if (data.examId) memory.clearHint("exam", data.examId);
          evPush(eventKey, { low });
        } else evPush(eventKey);
        return picked;
      }
      if (eventKey === "exam.intro" && data.examId) { try { memory.setTask("exam", { id: data.examId, title: "" }); } catch (e) { /* تجاهل */ } }
      if (eventKey === "lessons.open") {
        /* العودة لنفس المهمة: درس فتحه الطالب في جلسة سابقة (من سجل محلي) ⇒ اقتراح استكماله */
        try {
          const tk = memory.task("lesson"), t0 = Date.now() - (ctx.sessionAgeMs || 0);
          if (tk && tk.st === "opened" && tk.title && tk.t < t0 && Date.now() - tk.t < 7 * 86400000) this.notify("lesson.resume", { id: tk.id, title: tk.title, act: { label: "افتحه", name: "openLesson", args: { id: tk.id } } });
        } catch (e) { /* تجاهل */ }
      }
      const c = buildCandidate(eventKey, data, ctx);
      if (c) enqueue(c, false);
      evPush(eventKey);          // بعد اختيار الجملة: العدّ داخل القواعد يخص ما سبق فقط
      return null;
    } catch (e) { return null; }
  },

  /** الصفحة انتهت من تحميل بياناتها: ننهي نافذة التحكيم بعد settleMs بدل الانتظار الكامل. */
  settle() {
    try { settled = true; if (queue.length) scheduleFlush(); } catch (e) { /* تجاهل */ }
  },

  /** حقائق ظاهرة في الصفحة (للسياق). */
  facts(f) { try { return context.facts(f); } catch (e) { return {}; } },

  /** جملة جاهزة للعرض المدمج (حالات فارغة…) دون ميزانية. */
  line(key, vars = {}) {
    try { const ctx = snap(); return chooseLine(key, vars, ctx); } catch (e) { return null; }
  },

  /** موقف محدد مباشرة (يمر بنفس القواعد). */
  say(key, data = {}) {
    try {
      const evt = Object.keys(RULES).find((k) => { try { return arr(RULES[k].line(data, {})).includes(key); } catch (e) { return false; } }) || key;
      return this.notify(evt, data);
    } catch (e) { return null; }
  },

  /** ضغطة الطالب على برعي: رسالة عامة قصيرة للصفحة (لا تُحسب في الميزانية، ولا تتكرر بالنقر السريع). */
  tap() {
    try {
      const t = Date.now();
      if (t - lastTapAt < 2500) return false;                 // نقرات متتابعة ⇒ تفاعل واحد فقط
      if (document.querySelector(".barai-bubble, .barai-moment")) return false;   // لا نضع فقاعة فوق فقاعة
      lastTapAt = t;
      const p = page();
      const map = { "exams.html": "exams", "exam.html": "exams", "lessons.html": "lessons", "bank.html": "bank", "ai.html": "ai", "planner.html": "planner", "login.html": "login" };
      this.notify("tap.hello", { page: map[p] || "generic" });
      return true;
    } catch (e) { return false; }
  },

  mood(name) { try { return ui.setMood(name); } catch (e) { return false; } },

  /** يسجّل مهمة بدأها الطالب (درس) محليًا: معرّف وعنوان قصير فقط. */
  task(kind, rec) { try { if (kind === "lesson" && rec && rec.id) memory.setTask("lesson", { id: rec.id, title: rec.title || "" }); return true; } catch (e) { return false; } },

  /** يُنظّف كل ما يخص الصفحة (مؤقتات/طابور/تفاعل جارٍ/بطاقة معروضة) — عند مغادرتها أو الاستعادة من bfcache. */
  dispose() {
    try {
      if (winTimer) { clearTimeout(winTimer); winTimer = null; }
      retryTimers.forEach((id) => clearTimeout(id)); retryTimers.clear();
      queue = []; winStart = 0; active = null; cur = null; stickyEl = null; epoch++;
      ui.hideAll();
    } catch (e) { /* تجاهل */ }
  },

  /** مسح ذاكرة برعي المحلية (والتفضيلات إن طُلب). لا يلمس أي بيانات للمنصة. */
  reset({ prefs = false, all = false } = {}) {
    try {
      this.dispose();
      memory.clear(); store.clearMemory();
      if (prefs || all) store.resetPrefs();
      if (all) store.clearAll();
      return true;
    } catch (e) { return false; }
  },
  /** يصفّر ما تعلّمه برعي من سلوك الطالب فقط (الفعالية/الهدوء/التفاعلات) ويُبقي التفضيلات والذاكرة العامة. */
  resetLearning() { try { return memory.resetLearning(); } catch (e) { return false; } },
  currentInfo() { return cur ? { event: cur.event, tier: cur.tier, kind: cur.kind, interacted: cur.interacted } : null; },
  epochNow() { return epoch; },
  dismiss() { try { ui.hideAll(); } catch (e) { /* تجاهل */ } },
  hasEvent(k) { return !!RULES[k]; },
  debug() {
    let prefs = null; try { prefs = memory.prefs(); } catch (e) { /* تجاهل */ }
    return {
      decisions: decisions.slice(), queue: queue.map((c) => c.event), memory: memory.raw(), prefs, evlog: evRead(),
      flow: active ? { id: active.def.id, step: active.st.step, picks: active.st.picks.slice() } : null
    };
  },
  /** للاختبارات والتشخيص. */
  flowState() { return active ? { id: active.def.id, step: active.st.step, picks: active.st.picks.slice() } : null; },
  cancelFlow(why) { return cancelFlow(why); },
  /** للاختبارات: تفريغ الطابور فورًا. */
  flushNow() { flush(); }
};
