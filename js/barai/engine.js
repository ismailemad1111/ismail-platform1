/**
 * engine.js — محرك القرار (نقي بلا DOM، يُختبر في Node).
 * ------------------------------------------------------------------
 * بدل «أول حدث يصل يستهلك الفقاعة»: الأحداث تدخل طابور مرشّحين لنافذة قصيرة، ثم:
 *   1) بوّابات (gates): صامت، ميزانية، تهدئة، صفحة واحدة، نفس الموقف خلال 24 ساعة، تأجيل الطالب الصريح،
 *      نفس «المعنى» قبل قليل، الطالب مشغول…
 *   2) نقاط:  الدرجة × الأهمية × الإلحاح × ملاءمة السياق × الجِدّة × وزن الفئة المتكيّف × أثر آخر رسالة في الفئة
 *             × تفضيل موثوق − الإرهاق − تكلفة المقاطعة
 *   3) عتبة الصمت: لا يكفي أن تتجاوز النقاط الحد الأدنى؛ العتبة نفسها ترتفع مع التجاهل والإغلاق
 *      والتنقل السريع وصفحات التركيز (الصمت خيار حقيقي، وسببه يُسجَّل).
 *   4) ارتباطات (CORRELATIONS): حدثان في نفس النافذة بينهما معنى مشترك ⇒ رسالة واحدة تربطهما.
 *   5) اختيار مرشّح واحد (أو دمج اثنين) وتسجيل سبب رفض البقية والقواعد التي أثّرت في كل نقطة.
 * + آلة حالة نقية للتفاعلات متعددة الخطوات (flow*) تُنفَّذ في brain.js وتُختبر هنا.
 * إضافات «برعي Evolution X» (كلها نقية وتُختبر في Node):
 *   - inferState: تقدير حالة الجلسة بفصل المؤكَّد (من النظام) عن السلوك الملاحَظ عن النيّة المحتملة، بدرجة ثقة وأدلة؛
 *     النيّة وحدها لا تُطلق شيئًا (الصمت أولى).
 *   - validity: ما انتهت صلاحيته (مدة/تغيّر سياق/لم يعد صحيحًا) لا يُعرض.
 *   - canPreempt: الأولوية عند المقاطعة؛ لا تُستبدل بطاقة بأقل منها ولا بطاقة يتفاعل معها الطالب.
 *   - ميزانيات المبادرة لكل فئة، وهدوء متدرّج، ومضاعف فعالية محدود في النقاط.
 *   - flowBack/flowProgress/flowActResult: رجوع وتقدّم ونتيجة إجراء حقيقي (نجاح/فشل/إعادة محاولة).
 * لا يعرف المحرك شيئًا عن الواجهة؛ brain.js ينفّذ القرار.
 */
import { config as defaultConfig } from "./config.js";

/* ============================================================
   ملاءمة السياق: كل دالة تعيد رقمًا ≥ 0 (1 = محايد، 0 = غير مناسب إطلاقًا)
   ============================================================ */
export const RELEVANCE = {
  "time.lateNight": (c) => (c.isNight ? 1.2 : 0),
  "time.morning":   (c) => (c.partOfDay === "morning" ? 1 : 0),
  "time.friday":    (c) => (c.dow === 5 && !c.isNight ? 1 : 0),
  "lesson.returning": (c, d, cfg) => (c.daysAway >= cfg.context.returningAwayDays ? Math.min(1.3, 0.9 + c.daysAway / 20) : 0),
  "planner.empty":  (c) => (c.isNight ? 0.5 : 1),
  "exam.new":       (c) => (c.isNight ? 0.75 : 1),
  "event.live":     (c) => (c.isNight ? 0.6 : 1),
  "announce.allRead": (c) => (c.isNew ? 0.5 : 1),
  "bank.afford":    (c, d) => (d && d.balance > 0 ? 1 : 0),
  "bank.near":      (c, d) => (d && d.gap > 0 ? 1 : 0),
  "bank.welcome":   (c) => (c.visits <= 3 ? 1.1 : 0.7),
  "bank.poor":      (c) => (c.isNight ? 0 : 1),
  "streak.milestone": (c) => (c.isNight ? 0.8 : 1),
  "bank.open":      (c) => (c.state && c.state.stage === "hurrying" ? 0.25 : 1),
  "lessons.open":   (c) => (c.state && c.state.stage === "hurrying" ? 0.25 : 1),
  "lesson.resume":  (c, d) => (d && d.title && !(c.state && c.state.stage === "hurrying") ? 1 : 0)
};

/* ============================================================
   نوع الرسالة: إرشاد / تشجيع / احتفال / تلميح / تنبيه / ردّ على طلب
   ============================================================ */
export const KIND_BY_TIER = { critical: "alert", actionable: "guide", celebrate: "celebrate", contextual: "hint", ambient: "hint" };
export function kindOf(event, cfg = defaultConfig) {
  const k = cfg.kinds && cfg.kinds[event];
  if (k) return k;
  const ec = cfg.events && cfg.events[event];
  return KIND_BY_TIER[(ec && ec.tier) || "contextual"] || "hint";
}

/**
 * ارتباطات بين حدثين في نفس النافذة. a هو الأساس (يُحدد الشكل: لحظة أو فقاعة)، b يُضاف معناه.
 * line: مفتاح في LINES يصف الاثنين معًا. لا تعمل إلا حين ينجح الاثنان في البوابات والنقاط.
 */
export const CORRELATIONS = [
  { a: "planner.allDone", b: "streak.milestone", line: "corr.allDone.streak", mood: "win" },
  { a: "login.success",   b: "exam.new",         line: "corr.login.exam",     mood: "welcome" },
  { a: "bank.earned",     b: "bank.afford",      line: "corr.earned.afford",  mood: "money" }
];

/** نبرة الجملة المناسبة للسياق: تؤثر في اختيار الصيغة (لا في المحتوى الحقيقي). */
export function toneOf(ctx) {
  if (!ctx) return "normal";
  if (ctx.net && ctx.net.slow) return "slow";
  if (ctx.isNight) return "night";
  if (ctx.scores && ctx.scores.last !== null && ctx.scores.lowRun >= 1 && ctx.sessionPage !== "bank.html") return "gentle";
  if (ctx.isNew || ctx.daysAway >= 3) return "welcome";
  return "normal";
}

/* ============================================================
   البوابات
   ============================================================ */

/** حدود الظهور الحالية (الميزانية التكيّفية + التهدئة). */
export function limitsFor(level, ss, reducedToday, cfg = defaultConfig, quiet = 0) {
  const key = level === "many" ? "many" : "few";
  const b = cfg.budget[key];
  let budget = b.base;
  if ((ss.acted || 0) >= cfg.adaptive.actedToGrow) budget = Math.min(b.max, budget + cfg.adaptive.grow);
  if ((ss.ignoredRun || 0) >= cfg.adaptive.ignoredToShrink) budget = Math.max(b.min, Math.min(budget, cfg.adaptive.ignoredCap));
  if (quiet > 0 && cfg.quiet) budget = Math.max(b.min, budget - Math.round(quiet * cfg.quiet.maxBudgetCut));   // هدوء متدرّج (من تجاهل حديث)
  let cooldown = cfg.cooldownMs[key];
  if (reducedToday) { budget = Math.min(budget, cfg.budget.reducedTo); cooldown *= cfg.cooldownMs.reducedMul; }
  return { budget, cooldown };
}

/** لماذا لا يمكن مقاطعة الطالب الآن؟ null = يمكن. */
export function busyReason(rule, ctx) {
  if (rule.overrideBusy) return null;   // حرج وتأجّل مرتين: يُعرض رغم الانشغال
  const b = (ctx && ctx.busy) || {};
  if (b.flag) return "busy:exam";
  if (b.media) return "busy:media";
  if (b.overlay) return "busy:transition";
  if (b.typing) {
    if (rule.ignoreFocus === true) return null;
    if (rule.ignoreFocus === "empty" && !b.typingHasValue) return null;
    return "busy:typing";
  }
  return null;
}

/**
 * بوابات المرشّح. يعيد سبب الرفض أو null.
 * env: {level, ss, reducedToday, mem, now, page}
 */
export function gate(c, ctx, env, cfg = defaultConfig) {
  const { level, ss, reducedToday, mem, now, page } = env;
  if (level === "silent") return "silent";
  if (c.manual) return null;
  if (c.tier !== "critical") {
    if (!c.flow && mem.isSnoozed && mem.isSnoozed(c.cat, now)) return "snoozed";           // قال الطالب «لاحقًا» صراحةً
    if (mem.penalized(c.cat, now) && !c.flow) return "penalized";
    const lim = limitsFor(level, ss, reducedToday, cfg, env.quiet || 0);
    if (!c.flow && mem.shownCount && cfg.initiative) {                                      // ميزانية المبادرة لكل فئة
      const ib = Object.assign({}, cfg.initiative.default, cfg.initiative.perCat[c.cat] || {});
      if (ib.perDay && mem.shownCount(c.cat, now - 86400000) >= ib.perDay) return "cat-day";
      if (ib.perSession && env.sessionStart && mem.shownCount(c.cat, env.sessionStart) >= ib.perSession) return "cat-session";
      if (ib.minGapMs && mem.lastShownOfCat && now - mem.lastShownOfCat(c.cat) < ib.minGapMs) return "cat-gap";
    }
    if (c.kind === "moment") { if ((ss.moments || 0) >= cfg.momentsMax) return "moments-cap"; }
    else {
      if ((ss.bubbles || 0) >= lim.budget) return "budget";
      if (!c.flow && (((ss.pages || {})[page]) || 0) >= cfg.pageLimit) return "page-limit";
    }
    if (!c.flow && ss.lastAt && now - ss.lastAt < lim.cooldown) return "cooldown";
    const lastKey = mem.keyShownAt(c.cdKey);
    const cd = c.cooldownMs || cfg.sameKeyMs;
    if (lastKey && now - lastKey < cd) return "same-key";
    if (c.topic && !c.flow && !c.followup && mem.topicShownAt) {                           // نفس المعنى بحدث آخر قبل قليل
      const t0 = mem.topicShownAt(c.topic);
      if (t0 && now - t0 < cfg.topics.gapMs) return "same-topic";
    }
  }
  return null;
}

/* ============================================================
   النقاط
   ============================================================ */

export function interruptCost(ctx, cfg = defaultConfig) {
  const k = cfg.interrupt;
  let v = k.base;
  if (ctx.scrollAgoMs !== undefined && ctx.scrollAgoMs < k.scrollMs) v += k.scrolling;
  if (ctx.typingAgoMs !== undefined && ctx.typingAgoMs < k.typingMs) v += k.typing;
  if (ctx.idleMs !== undefined && ctx.idleMs >= k.idleMs) v += k.idleBonus;
  if (ctx.pageAgeMs !== undefined && ctx.pageAgeMs < k.landedMs) v += k.justLanded;
  return Math.max(0, v);
}

/**
 * عتبة الصمت لهذا المرشّح: الحد الأدنى + (ضغط الموقف × وزن درجته).
 * الحرج والتدفقات المباشرة (ناتجة عن فعل الطالب الآن) لا تتأثر.
 */
export function silenceBar(c, ctx, env, cfg = defaultConfig) {
  const k = cfg.silence;
  const ss = env.ss || {};
  const w = c.flow || c.manual ? 0 : (k.tierWeight[c.tier] !== undefined ? k.tierWeight[c.tier] : 1);
  const parts = {
    ignored: (ss.ignoredRun || 0) * k.ignoredStep,
    closed: (ss.closedRun || 0) * k.closedStep,
    hurry: ctx.backAndForth ? k.hurry : 0,
    returned: ctx.returnedFromHidden ? k.returned : 0,
    focus: k.focusPages[env.page] || 0,
    quiet: (env.quiet || 0) * (cfg.quiet ? cfg.quiet.maxBar : 0)      // هدوء متدرّج من تجاهل/إغلاق حديث (ليس حكمًا نفسيًا)
  };
  const extra = parts.ignored + parts.closed + parts.hurry + parts.returned + parts.focus + parts.quiet;
  return { bar: Math.round((cfg.minScore + extra * w) * 100) / 100, extra: Math.round(extra * 100) / 100, weight: w, parts };
}

/** نقاط مرشّح واحد مع تفصيل الأجزاء (للتشخيص). */
export function scoreCandidate(c, ctx, mem, cfg = defaultConfig, now = Date.now(), extra = {}) {
  const tierBase = (cfg.tiers[c.tier] || cfg.tiers.contextual).base;
  const relFn = RELEVANCE[c.event];
  let rel = relFn ? relFn(ctx, c.data || {}, cfg) : 1;
  if (typeof c.relevance === "number") rel *= c.relevance;
  if (ctx.net && ctx.net.slow && c.tier !== "critical") rel *= 0.85;
  const nov = c.isNew ? 1.15 : (mem.keyShownAt(c.cdKey) ? 0.9 : 1.05);
  const mult = mem.catMult(c.cat, now);
  const fat = mem.fatigue(c.cat, now);
  const intr = interruptCost(ctx, cfg);
  const ep = mem.episodeMult ? mem.episodeMult(c.cat, now) : 1;               // أثر آخر رسالة في الفئة
  const pf = extra.prefs || (mem.prefs ? mem.prefs(now) : null);
  const pref = pf && pf.actions === "practical" && c.hasAction ? cfg.prefs.actionMult : 1;   // يميل لتنفيذ الإجراءات
  const ef = mem.effectiveness && c.tier !== "critical" && !c.manual ? mem.effectiveness(c.event, now) : null;   // الحرج لا يتكيّف أبدًا
  const eff = ef ? ef.mult : 1;
  const base = tierBase * c.imp * c.urg * rel * nov * mult * ep * pref * eff;
  const score = base - fat - intr;
  const notes = [];
  if (rel !== 1) notes.push(`سياق ×${Math.round(rel * 100) / 100}`);
  if (mult !== 1) notes.push(`فئة ×${mult}`);
  if (ep !== 1) notes.push(`آخر رسالة في الفئة ×${ep}`);
  if (pref !== 1) notes.push(`تفضيل عملي ×${pref}`);
  if (eff !== 1) notes.push(`فعالية ×${eff}${ef && ef.why ? " (" + ef.why + ")" : ""} — ارتباط لا سببية`);
  if (fat) notes.push(`إرهاق −${fat}`);
  if (intr > 1) notes.push(`مقاطعة −${intr}`);
  return { score: Math.round(score * 100) / 100, parts: { tierBase, imp: c.imp, urg: c.urg, rel: Math.round(rel * 100) / 100, nov, mult, ep, pref, fatigue: fat, interrupt: intr, eff }, notes };
}

/* ============================================================
   التحكيم
   ============================================================ */

/**
 * يختار من المرشّحين.
 * @param {Array} cands  مرشّحون: {event, key, cat, tier, kind, imp, urg, cdKey, data, phrase?, flow?, ignoreFocus?, ...}
 * @returns {{winner, second, compound, log, deferred}}
 */
export function arbitrate(cands, ctx, env, cfg = defaultConfig) {
  const log = [];
  const live = [];
  const deferred = [];      // مشغول الآن (كتابة/فيديو/اختبار…): يُعاد لاحقًا ولا يُسقَط
  const now = env.now;
  const prefs = env.mem && env.mem.prefs ? env.mem.prefs(now) : null;

  for (const c of cands) {
    const v = validity(c, ctx, now, cfg);
    if (!v.ok) { log.push({ event: c.event, status: "rejected", reason: v.reason }); continue; }          // فقدت صلاحيتها قبل العرض
    const g = gate(c, ctx, env, cfg);
    if (g) { log.push({ event: c.event, status: "rejected", reason: g }); continue; }
    const b = busyReason(c, ctx);
    if (b) { deferred.push(c); log.push({ event: c.event, status: "deferred", reason: b }); continue; }
    const sc = scoreCandidate(c, ctx, env.mem, cfg, now, { prefs });
    const row = { event: c.event, score: sc.score, parts: sc.parts, notes: sc.notes, c };
    if (!c.manual) {
      const sb = silenceBar(c, ctx, env, cfg);
      if (sc.score < sb.bar) {
        // الصمت هو القرار: إمّا أقل من الحد الأدنى، أو الموقف الحالي (تجاهل/تنقّل/تركيز) يرفع العتبة فوق قيمة الرسالة
        log.push({ event: c.event, status: "rejected", reason: sb.bar > cfg.minScore ? "silence" : "below-min", score: sc.score, bar: sb.bar, parts: sc.parts, notes: sc.notes.concat(sb.bar > cfg.minScore ? [`عتبة الصمت ${sb.bar} (ضغط ${sb.extra} × ${sb.weight})`] : []) });
        continue;
      }
    }
    live.push(row);
  }
  live.sort((a, b) => b.score - a.score);

  /* ارتباط: حدثان في النافذة بينهما معنى مشترك ⇒ رسالة واحدة (قبل حجب «الفئة الواحدة») */
  for (const rule of CORRELATIONS) {
    const ra = live.find((r) => r.c.event === rule.a), rb = live.find((r) => r.c.event === rule.b);
    if (!ra || !rb) continue;
    log.push({ event: ra.c.event, status: "chosen", score: ra.score, parts: ra.parts, notes: ra.notes, compoundWith: rb.c.event, correlated: rule.line });
    log.push({ event: rb.c.event, status: "merged", score: rb.score, parts: rb.parts, notes: rb.notes, correlated: rule.line });
    live.filter((r) => r !== ra && r !== rb).forEach((r) => log.push({ event: r.c.event, status: "rejected", reason: "lower-score", score: r.score, parts: r.parts, notes: r.notes }));
    return { winner: ra.c, second: rb.c, compound: true, corr: rule, log, deferred };
  }

  /* فئة واحدة تمثّل نفسها بأقوى مرشّح (لا فقاعتين متشابهتين) */
  const seenCat = new Set();
  const uniq = [];
  for (const r of live) {
    if (seenCat.has(r.c.cat)) { log.push({ event: r.c.event, status: "rejected", reason: "same-category", score: r.score }); continue; }
    seenCat.add(r.c.cat);
    uniq.push(r);
  }
  if (!uniq.length) return { winner: null, second: null, compound: false, corr: null, log, deferred };

  const top = uniq[0];
  let second = null;
  if (cfg.compound.enabled && uniq.length > 1 && top.c.kind === "bubble") {
    const s = uniq[1];
    const ok = s.c.kind === "bubble" && top.c.phrase && s.c.phrase
      && top.c.tier === "actionable" && s.c.tier === "actionable"
      && s.score >= cfg.compound.minScore && s.score >= top.score * cfg.compound.minRatio
      ;
    if (ok) second = s;
  }
  uniq.forEach((r, i) => {
    if (i === 0) log.push({ event: r.c.event, status: "chosen", score: r.score, parts: r.parts, notes: r.notes, compoundWith: second ? second.c.event : null });
    else if (second && r === second) log.push({ event: r.c.event, status: "merged", score: r.score, parts: r.parts, notes: r.notes });
    else log.push({ event: r.c.event, status: "rejected", reason: "lower-score", score: r.score, parts: r.parts, notes: r.notes });
  });

  return { winner: top.c, second: second ? second.c : null, compound: !!second, corr: null, log, deferred };
}

/* ============================================================
   آلة حالة التفاعلات متعددة الخطوات (نقية: بلا DOM ولا مؤقتات)
   تعريف التفاعل: { id, cat, start, cancelOn:[أحداث], steps:{ id:{ line, mood, choices:[{id,label,next|end,ack,snooze,href}] } } }
   الحالة: { id, step, at, startedAt, picks:[] }
   ============================================================ */

export function flowStart(def, now = Date.now()) {
  if (!def || !def.steps || !def.steps[def.start]) return null;
  return { id: def.id, step: def.start, at: now, startedAt: now, picks: [] };
}

/** الخطوة الحالية أو null. */
export function flowStepOf(def, st) { return def && st && def.steps ? def.steps[st.step] || null : null; }

/**
 * اختيار الطالب. يعيد:
 *   { type:"step", state }                       خطوة تالية (state.hist يحفظ الخطوات السابقة للرجوع)
 *   { type:"end", ack, snooze, href, undo }      انتهاء التفاعل
 *   { type:"act", act, args, choice, state }     إجراء حقيقي يُنفَّذ في brain ثم تُحسم نتيجته بـ flowActResult
 *   null                                         اختيار غير صالح (قديم/خطوة غير موجودة/رجوع بلا تاريخ) ⇒ يُتجاهل
 * choice.back:true = رجوع للخطوة السابقة فعليًا (لا إلى خطوة مسمّاة).
 */
export function flowChoose(def, st, choiceId, now = Date.now()) {
  const step = flowStepOf(def, st);
  if (!step) return null;
  const ch = (step.choices || []).find((x) => x.id === choiceId);
  if (!ch) return null;
  const picks = st.picks.concat(choiceId);
  if (ch.back) {
    const b = flowBack(def, st, now);
    return b ? { type: "step", state: Object.assign(b, { picks }), choice: ch, back: true } : null;
  }
  if (ch.act) return { type: "act", act: ch.act, args: ch.args || {}, choice: ch, state: st, picks };
  if (ch.next && def.steps[ch.next]) return { type: "step", state: { ...st, step: ch.next, at: now, picks, hist: (st.hist || []).concat(st.step) }, choice: ch };
  return { type: "end", ack: ch.ack || null, snooze: ch.snooze || 0, href: ch.href || null, choice: ch, picks };
}

/** رجوع حقيقي: الخطوة السابقة من السجل، أو null إن لم يوجد. */
export function flowBack(def, st, now = Date.now()) {
  const h = (st && st.hist) || [];
  if (!h.length) return null;
  const prev = h[h.length - 1];
  if (!def || !def.steps || !def.steps[prev]) return null;
  return { ...st, step: prev, at: now, hist: h.slice(0, -1) };
}

/** أطول مسار أمامي في تعريف التفاعل (يتجاهل حواف الرجوع الدائرية) — يُستخدم لإظهار «خطوة س من ص». */
const depthCache = new WeakMap();
export function flowDepth(def) {
  if (!def || !def.steps) return 1;
  if (depthCache.has(def)) return depthCache.get(def);
  const walk = (id, seen) => {
    const step = def.steps[id];
    if (!step || seen.has(id)) return 0;
    const nx = new Set(seen).add(id);
    let best = 0;
    (step.choices || []).forEach((ch) => { if (ch.next && !ch.back) best = Math.max(best, walk(ch.next, nx)); });
    return 1 + best;
  };
  const d = Math.max(1, walk(def.start, new Set()));
  depthCache.set(def, d);
  return d;
}
/** {index, total}: تقدّم الطالب داخل التفاعل (الرجوع ينقص index). */
export function flowProgress(def, st) {
  const total = flowDepth(def);
  const index = Math.min(total, ((st && st.hist) || []).length + 1);
  return { index, total };
}
/**
 * حسم نتيجة إجراء حقيقي (result = {ok, reason?}):
 *   نجاح ⇒ { type:"end", ack:choice.ack, undo:choice.undo }
 *   فشل  ⇒ { type:"fail", ack:choice.fail || "flow.fail.generic", retry:true, state } (يعرض رسالة مناسبة وزر «جرّب تاني»)
 */
export function flowActResult(def, st, choice, result) {
  if (result && result.ok) return { type: "end", ack: choice.ack || null, undo: choice.undo || null, snooze: 0, href: null, choice };
  return { type: "fail", ack: choice.fail || "flow.fail.generic", retry: true, state: st, choice, reason: (result && result.reason) || "failed" };
}
/** هل href داخل المنصة فعلًا؟ (لا روابط وهمية/خارجية) — يُرجع الرابط النظيف أو null. */
export function safeHref(href, cfg = defaultConfig) {
  if (typeof href !== "string" || !href) return null;
  const clean = href.split("#")[0].split("?")[0];
  return (cfg.pages || []).includes(clean) ? href : null;
}

/** هل انتهى عمر التفاعل (إجمالي أو خطوة بلا ردّ)؟ */
export function flowExpired(st, now = Date.now(), cfg = defaultConfig) {
  if (!st) return true;
  return now - st.startedAt > cfg.flow.maxMs || now - st.at > cfg.flow.stepTtlMs * 3;
}

/** هل يُلغي هذا الحدث التفاعل الجاري؟ (تغيّر السياق: بدأ الامتحان، انقطع النت، حدث بديل…) */
export function flowCancelledBy(def, eventKey) {
  return !!(def && Array.isArray(def.cancelOn) && def.cancelOn.includes(eventKey));
}


/* ============================================================
   صلاحية المرشّح
   ============================================================ */
/** شروط «ما زال صحيحًا» لكل حدث (لا تُرفض إلا حين يثبت العكس: غياب المعلومة ⇒ يبقى صالحًا). */
export const VALIDITY = {
  "net.offline":     (c, ctx) => !(ctx.net && ctx.net.online === true),
  "net.failed":      (c, ctx) => !(ctx.net && ctx.net.online === false),
  "net.back":        (c, ctx) => !(ctx.net && ctx.net.online === false),
  "time.lateNight":  (c, ctx) => ctx.isNight !== false,
  "time.morning":    (c, ctx) => ctx.partOfDay === undefined || ctx.partOfDay === "morning",
  "announce.unread": (c, ctx) => ctx.sessionPage !== "announcements.html",
  "lessons.open":    (c, ctx) => ctx.sessionPage === undefined || ctx.sessionPage === "lessons.html",
  "bank.open":       (c, ctx) => ctx.sessionPage === undefined || ctx.sessionPage === "bank.html",
  "lesson.resume":   (c, ctx) => ctx.sessionPage === undefined || ctx.sessionPage === "lessons.html"
};

/**
 * هل ما زال المرشّح صالحًا للعرض الآن؟ {ok, reason}
 *  - expired: تجاوز عمره المسموح لدرجته (c.born مطلوب)
 *  - context-changed: تغيّر السياق منذ نشأ (c.epoch مقابل ctx.epoch) — بدأ الاختبار/المشغّل أو غاب الطالب
 *  - no-longer-true: شرط الحدث لم يعد صحيحًا (عاد النت مثلًا قبل عرض «انقطع النت»)
 * الحرج لا يسقط بتغيّر السياق (لكن يسقط بانتهاء صحة معلومته).
 */
export function validity(c, ctx, now = Date.now(), cfg = defaultConfig) {
  if (!c || c.manual) return { ok: true };
  const ttl = cfg.validity && cfg.validity.ttlMs ? (c.flow ? cfg.validity.ttlMs.flow : (cfg.validity.ttlMs[c.tier] || cfg.validity.ttlMs.contextual)) : 0;
  if (ttl && c.born && now - c.born > ttl) return { ok: false, reason: "expired" };
  if (!c.critical && c.epoch !== undefined && ctx && ctx.epoch !== undefined && c.epoch !== ctx.epoch) return { ok: false, reason: "context-changed" };
  const f = VALIDITY[c.event];
  if (f && ctx && f(c, ctx) === false) return { ok: false, reason: "no-longer-true" };
  return { ok: true };
}

/* ============================================================
   المقاطعة والأولويات
   ============================================================ */
/**
 * هل يحق لمرشّح أن يحلّ محل ما هو معروض الآن؟
 * cur: {event, tier, kind, sticky, interacted} أو null.
 *  - لا شيء معروض ⇒ نعم.   - طلب الطالب بنفسه (manual) ⇒ نعم.
 *  - الطالب يتفاعل مع الحالي (لمس/اختار/توقّف المؤقّت) ⇒ لا، إلا الحرج.
 *  - الحرج يحلّ محل الجميع، ولا يُستبدل الحرج اللاصق (انقطاع النت) إلا بحرج.
 *  - ناتج فعل الطالب الآن (flow) يحلّ محل ما لم يتفاعل معه الطالب.
 *  - غير ذلك: فقط الأعلى درجةً (rank أقل). المساوي والأدنى يُحجبان (لا بطاقات فوق بعضها).
 */
export function canPreempt(cur, c, cfg = defaultConfig) {
  if (!cur) return { ok: true, reason: "free" };
  if (c.manual) return { ok: true, reason: "manual" };
  const rank = (t) => (cfg.tiers[t] || cfg.tiers.contextual).rank;
  if (cur.sticky && c.tier !== "critical") return { ok: false, reason: "sticky-current" };
  if (c.tier === "critical") return { ok: true, reason: "critical" };
  if (cur.interacted) return { ok: false, reason: "user-engaged" };
  if (c.flow) return { ok: true, reason: "fresh-action" };
  if (rank(c.tier) < rank(cur.tier)) return { ok: true, reason: "higher-priority" };
  return { ok: false, reason: "lower-priority" };
}

/* ============================================================
   تقدير حالة الجلسة — أدلة فقط، بفصل المؤكَّد عن السلوك عن النيّة
   ============================================================ */
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * يبني صورة محدّثة عن الجلسة من المتاح فعلًا فقط:
 *   confirmed: معلومات أكّدها النظام (درجات اختبارات، رسائل غير مقروءة، أيام غياب) — ثقة عالية
 *   behavior : سلوك ملاحَظ (تنقّل سريع، ساعات الجلسة، صفحة تركيز) — ثقة متوسطة
 *   intent   : نيّة محتملة مستنتجة — ثقة ≤ 0.4 ولا تُطلق شيئًا وحدها
 *   needs    : احتياجات مقترحة، كلٌّ بأساسه (basis) ودرجة ثقته
 *   stage    : مرحلة الطالب الآن + ثقتها
 * فتح صفحة ليس دليلًا على الفهم أو التعثر؛ لا يدخل confirmed أبدًا.
 */
export function inferState(ctx, opts = {}, cfg = defaultConfig) {
  const st = cfg.states;
  const evlog = opts.evlog || [];
  const hints = opts.hints || {};
  const facts = (ctx && ctx.facts) || {};
  const sc = (ctx && ctx.scores) || {};
  const out = { stage: "normal", confidence: 0.5, confirmed: [], behavior: [], intent: [], needs: [] };

  /* ---- مؤكَّد ---- */
  if (sc.lowRun >= st.lowRunStruggle) out.confirmed.push({ k: "lowRun", n: sc.lowRun, conf: 0.95, ev: `آخر ${sc.lowRun} نتائج امتحانات أقل من ${cfg.trend.lowPct}% (من النظام)` });
  if (Number(facts.unread) > 0) out.confirmed.push({ k: "unread", n: Number(facts.unread), conf: 0.95, ev: "رسائل غير مقروءة (من الصفحة)" });
  if (ctx && ctx.daysAway >= cfg.context.returningAwayDays) out.confirmed.push({ k: "away", n: ctx.daysAway, conf: 0.9, ev: `غياب ${ctx.daysAway} أيام (ساعة الجهاز)` });
  const told = Object.keys(hints.exam || {});
  if (told.length) out.confirmed.push({ k: "examPending", n: told.length, conf: 0.8, ev: "نبّه برعي على امتحان جديد ولم تصل نتيجته بعد (سجل محلي)" });

  /* ---- سلوك ---- */
  if (ctx && ctx.backAndForth) out.behavior.push({ k: "hurry", conf: 0.8, ev: "تنقّل ذهابًا وإيابًا بين صفحتين" });
  if (ctx && ctx.busy && ctx.busy.flag) out.behavior.push({ k: "inTask", conf: 0.95, ev: "اختبار/مشغّل مفتوح" });
  else if (ctx && cfg.silence.focusPages[ctx.sessionPage]) out.behavior.push({ k: "focusPage", conf: 0.7, ev: "صفحة تركيز" });
  if (ctx && ctx.sessionAgeMs > st.sessionLongMs) out.behavior.push({ k: "longSession", conf: 0.8, ev: "جلسة طويلة" });
  if (ctx && ctx.idleMs >= (cfg.context.idleSleepMs || 60000)) out.behavior.push({ k: "idle", conf: 0.6, ev: "بلا لمس منذ مدة" });
  const distinct = new Set((ctx && ctx.trail) || []).size;
  if (distinct >= st.exploringPages && !(ctx && ctx.session && ctx.session.acted)) out.behavior.push({ k: "exploring", conf: 0.5, ev: `${distinct} صفحات بلا إجراء` });
  if (ctx && ctx.returnedFromHidden) out.behavior.push({ k: "returnedTab", conf: 0.5, ev: "عاد من تبويب آخر" });

  /* ---- نيّة محتملة (ضعيفة بطبيعتها) ---- */
  if (out.behavior.some((b) => b.k === "exploring") && !out.behavior.some((b) => b.k === "hurry")) out.intent.push({ k: "maybeLooking", conf: 0.35, ev: "تصفّح بلا إجراء قد يعني بحثًا عن شيء — غير مؤكد" });
  if (out.behavior.some((b) => b.k === "idle") && ctx && ctx.sessionPage === "lessons.html") out.intent.push({ k: "maybeReading", conf: 0.3, ev: "سكون في الدروس قد يكون قراءة — لا يُعدّ تعثرًا" });

  /* ---- المرحلة ---- */
  const has = (k) => out.behavior.find((b) => b.k === k);
  if (has("inTask")) { out.stage = "focused"; out.confidence = 0.95; }
  else if (has("hurry")) { out.stage = "hurrying"; out.confidence = 0.8; }
  else if (out.confirmed.some((c) => c.k === "away")) { out.stage = "returning"; out.confidence = 0.9; }
  else if (has("focusPage")) { out.stage = "focused"; out.confidence = 0.7; }
  else if (has("idle")) { out.stage = "idle"; out.confidence = 0.6; }
  else if (has("exploring")) { out.stage = "exploring"; out.confidence = 0.5; }

  /* ---- احتياجات: من المؤكَّد/السلوك فقط ---- */
  const lr = out.confirmed.find((c) => c.k === "lowRun");
  if (lr) out.needs.push({ k: "review", conf: 0.85, basis: ["confirmed:lowRun"] });
  const ur = out.confirmed.find((c) => c.k === "unread");
  if (ur) out.needs.push({ k: "readMessages", conf: 0.9, basis: ["confirmed:unread"] });
  if (out.confirmed.some((c) => c.k === "examPending")) out.needs.push({ k: "examCatchUp", conf: 0.7, basis: ["confirmed:examPending"] });
  if (has("longSession") && ctx && (ctx.isNight || ctx.sessionAgeMs > st.sessionLongMs * 1.5)) out.needs.push({ k: "rest", conf: 0.65, basis: ["behavior:longSession"] });
  out.needs.sort((a, b) => b.conf - a.conf);
  out.needs.forEach((n) => { n.conf = r2(n.conf); });
  return out;
}

/** الاحتياجات التي يحق لبرعي التصرف بناءً عليها: ثقة كافية + أساس مؤكَّد أو سلوكي (النيّة وحدها لا تكفي). */
export function actionableNeeds(state, cfg = defaultConfig) {
  if (!state || !Array.isArray(state.needs)) return [];
  return state.needs.filter((n) => n.conf >= cfg.states.minConfidenceToAct && (n.basis || []).some((b) => /^(confirmed|behavior):/.test(b)));
}
