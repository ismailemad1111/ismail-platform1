/**
 * memory.js — ذاكرة برعي المحلية (تفضيلات الطالب وفعالية الرسائل).
 * ------------------------------------------------------------------
 * - كل شيء محلي في localStorage (أو ذاكرة الصفحة إن لم يتوفر). لا كتابة في Firestore.
 * - لا بيانات شخصية: فئات، أعداد، أوقات، نسب مئوية بلا أسماء، ومعرّفات حالة.
 * - الملف نقي (بلا DOM): يستقبل «محوّل تخزين» {read, write} فيُختبر في Node.
 *
 * يخزن:
 *   cats      فعالية كل فئة موقف (لا كل جملة): ظهرت/نُفّذ إجراؤها/أُغلقت/اختفت وحدها
 *   recent    آخر الظهورات (للإرهاق)
 *   lines     آخر 3 صيغ استُخدمت لكل موقف (منع التكرار عبر الجلسات)
 *   nameSince عدد الرسائل منذ آخر استخدام للاسم (ليبقى الاسم نادرًا)
 *   scores    آخر الدرجات المئوية (بلا أسماء) لاتجاه التحسّن
 *   follow    «ما قاله برعي» لتفادي التكرار والمتابعة (امتحان نُبّه عليه، رسائل لُمّح لها)
 *   keys      آخر ظهور لكل مفتاح (تهدئة مخصصة أطول من 24 ساعة حيث يلزم)
 *   data      حالة صفحات (مثل حالات طلبات البنك التي رآها الطالب)
 *   visits    عدد الزيارات وأيامها (تواريخ فقط) — «أيام متتالية على هذا الجهاز»
 *   eps       «حلقات»: آخر الرسائل وما فعله الطالب بعد كل واحدة (نُفّذ/أُغلق/اختفت/اختار) ومدة بقائها
 *   snooze    تأجيل صريح طلبه الطالب بنفسه («لاحقًا») لكل فئة
 *   topics    آخر ظهور لكل «معنى» (أدق من الفئة) لمنع تكرار المعنى بصيغة مختلفة
 *   flows     إحصاء كل تفاعل متعدد الخطوات: بدأ/اكتمل/أُلغي/تُرك (أعداد فقط)
 *   tasks     آخر مهمة بدأها الطالب (درس/امتحان) وحالتها: فُتحت أم اكتملت (معرّف + عنوان قصير + وقت)
 *   txt       رموز (كلمات مبسّطة) آخر الرسائل المعروضة لمنع تشابه الصيغ عبر المواقف
 *   v         رقم نسخة البنية
 *
 * الصلابة: كل قراءة تمر بـ normalize (بنية تالفة ⇒ تُهمل الأجزاء التالفة فقط)، وprune يمحو القديم (> maxAgeMs)،
 * وسقف الحجم maxBytes يقلّم تدريجيًا ثم يصفّر بأمان. clear()/resetLearning() يمسحان ذاكرة برعي فقط (لا شيء من بيانات المنصة).
 *
 * قاعدة التكيّف: لا استنتاج من ضغطة واحدة. التفضيل لا يُعتمد إلا بعد عيّنات كافية (cfg.prefs.minSamples)
 * وبنسبة اتساق عالية (cfg.prefs.share)، ويُرجع معه «السبب» ليظهر في التشخيص.
 */
import { config as defaultConfig } from "./config.js";

const DAY = 86400000;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const OBJ_KEYS = ["cats", "lines", "keys", "data", "follow", "snooze", "topics", "tasks", "flows", "visits"];
const ARR_KEYS = ["recent", "scores", "eps", "txt"];

/** يُصلح بنية الذاكرة: يحذف الأجزاء التالفة فقط ويُبقي السليم. لا يرمي أبدًا. */
export function normalize(raw) {
  try {
    if (!isObj(raw)) return {};
    const m = raw;
    OBJ_KEYS.forEach((k) => { if (m[k] !== undefined && !isObj(m[k])) delete m[k]; });
    ARR_KEYS.forEach((k) => { if (m[k] !== undefined && !Array.isArray(m[k])) delete m[k]; });
    if (m.recent) m.recent = m.recent.filter((r) => isObj(r) && typeof r.cat === "string" && isNum(r.t));
    if (m.scores) m.scores = m.scores.filter((r) => isObj(r) && isNum(r.p) && isNum(r.t));
    if (m.txt) m.txt = m.txt.filter((r) => isObj(r) && isNum(r.t) && Array.isArray(r.w));
    if (m.eps) m.eps = m.eps.filter((e) => isObj(e) && typeof e.e === "string" && typeof e.c === "string" && isNum(e.t));
    if (m.cats) Object.keys(m.cats).forEach((k) => {
      const c = m.cats[k];
      if (!isObj(c)) { delete m.cats[k]; return; }
      m.cats[k] = { shown: isNum(c.shown) ? c.shown : 0, acted: isNum(c.acted) ? c.acted : 0, closed: isNum(c.closed) ? c.closed : 0, timeout: isNum(c.timeout) ? c.timeout : 0, penaltyUntil: isNum(c.penaltyUntil) ? c.penaltyUntil : 0 };
    });
    ["keys", "topics", "snooze"].forEach((k) => { if (m[k]) Object.keys(m[k]).forEach((x) => { if (!isNum(m[k][x])) delete m[k][x]; }); });
    if (m.lines) Object.keys(m.lines).forEach((k) => { if (!Array.isArray(m.lines[k])) delete m.lines[k]; else m.lines[k] = m.lines[k].filter(isNum); });
    if (m.follow) Object.keys(m.follow).forEach((k) => { if (!isObj(m.follow[k])) delete m.follow[k]; });
    if (m.visits) m.visits = { n: isNum(m.visits.n) ? m.visits.n : 0, last: isNum(m.visits.last) ? m.visits.last : 0, days: Array.isArray(m.visits.days) ? m.visits.days.filter((d) => typeof d === "string").slice(-60) : [] };
    return m;
  } catch (e) { return {}; }
}

/** تاريخ محلي YYYY-MM-DD */
export function dayKeyOf(ms) {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function createMemory(adapter, cfg = defaultConfig) {
  const load = () => {
    let m;
    try { m = adapter.read(); } catch (e) { m = null; }
    return normalize(m);
  };
  /** سقف الحجم: يقلّم الأقدم فالأقل قيمة، وأخيرًا يصفّر بأمان (لا يرمي). */
  const shrink = (m) => {
    const size = () => { try { return JSON.stringify(m).length; } catch (e) { return Infinity; } };
    const steps = [
      () => { if (m.eps) m.eps = m.eps.slice(-20); },
      () => { m.txt = (m.txt || []).slice(-6); m.recent = (m.recent || []).slice(-20); },
      () => { m.lines = {}; m.keys = {}; m.topics = {}; },
      () => { m.eps = []; m.follow = {}; m.data = {}; }
    ];
    for (const step of steps) { if (size() <= cfg.memory.maxBytes) return m; try { step(); } catch (e) { /* تجاهل */ } }
    if (size() > cfg.memory.maxBytes) { const keep = { v: cfg.memory.schema, visits: m.visits || undefined }; Object.keys(m).forEach((k) => delete m[k]); Object.assign(m, keep); }
    return m;
  };
  const save = (m) => { try { m.v = cfg.memory.schema; shrink(m); adapter.write(m); } catch (e) { /* بدون تخزين */ } };
  const edit = (fn) => { const m = load(); const r = fn(m); save(m); return r; };
  const catOf = (m, cat) => { m.cats = m.cats || {}; return (m.cats[cat] = m.cats[cat] || { shown: 0, acted: 0, closed: 0, timeout: 0, penaltyUntil: 0 }); };

  const api = {
    raw: load,

    /* ===== فعالية الفئات ===== */
    cat(cat) { const m = load(); return Object.assign({ shown: 0, acted: 0, closed: 0, timeout: 0, penaltyUntil: 0 }, (m.cats || {})[cat]); },

    recordShown(cat, now = Date.now()) {
      edit((m) => {
        catOf(m, cat).shown++;
        m.recent = (m.recent || []).concat({ cat, t: now }).slice(-cfg.memory.maxRecent);
      });
    },
    recordAction(cat) { edit((m) => { catOf(m, cat).acted++; }); },
    recordTimeout(cat) { edit((m) => { catOf(m, cat).timeout++; }); },
    /** إغلاق بـ ×: إن تكرر بنسبة عالية تُخفَّض أوزان الفئة وتُمنع فترة. */
    recordClosed(cat, now = Date.now()) {
      edit((m) => {
        const c = catOf(m, cat);
        c.closed++;
        const rate = c.shown > 0 ? c.closed / c.shown : 0;
        if (c.closed >= cfg.memory.closedToPenalize && rate >= cfg.memory.closedRate) c.penaltyUntil = now + cfg.memory.penaltyMs;
      });
    },
    penalized(cat, now = Date.now()) { return api.cat(cat).penaltyUntil > now; },
    /** مضاعف وزن الفئة: <1 إن تُجوهلت كثيرًا، >1 إن تفاعل معها الطالب. */
    catMult(cat, now = Date.now()) {
      const c = api.cat(cat);
      if (c.penaltyUntil > now) return cfg.memory.penaltyMult;
      if (c.acted >= cfg.memory.boostActed && c.shown > 0 && c.acted / c.shown >= cfg.memory.boostRate) return cfg.memory.boostMult;
      return 1;
    },
    /** إرهاق الفئة + الإرهاق العام (يُخصم من نقاط المرشّح). */
    fatigue(cat, now = Date.now()) {
      const m = load();
      const f = cfg.fatigue;
      let v = 0;
      (m.recent || []).forEach((r) => {
        if (r.cat === cat && now - r.t <= f.categoryWindowMs) v += f.perCategory;
        if (now - r.t <= f.globalWindowMs) v += f.global;
      });
      return Math.min(f.max, v);
    },

    /* ===== تهدئة مخصصة لكل مفتاح (24 ساعة افتراضيًا أو أطول) ===== */
    keyShownAt(key) { return Number(((load().keys || {})[key])) || 0; },
    markKey(key, now = Date.now()) {
      edit((m) => {
        m.keys = m.keys || {};
        m.keys[key] = now;
        const ks = Object.keys(m.keys);
        if (ks.length > 120) ks.sort((a, b) => m.keys[a] - m.keys[b]).slice(0, ks.length - 120).forEach((k) => delete m.keys[k]);
      });
    },

    /* ===== عدم تكرار الصيغ عبر الجلسات ===== */
    lastLines(key) { return ((load().lines || {})[key]) || []; },
    pushLine(key, idx) {
      edit((m) => {
        m.lines = m.lines || {};
        const list = (m.lines[key] || []).filter((i) => i !== idx).concat(idx);
        m.lines[key] = list.slice(-cfg.memory.lastLinesPerKey);
      });
    },

    /* ===== الاسم الأول نادر (مرة تقريبًا كل N رسائل) ===== */
    nameGateOpen() { return (Number(load().nameSince) || 0) >= cfg.name.everyNth - 1; },
    noteMessage(usedName) { edit((m) => { m.nameSince = usedName ? 0 : (Number(m.nameSince) || 0) + 1; }); },

    /* ===== الدرجات المحلية (نسب فقط) واتجاهها ===== */
    pushScore(pct, now = Date.now()) {
      if (!isFinite(pct)) return;
      edit((m) => { m.scores = (m.scores || []).concat({ p: Math.round(pct), t: now }).slice(-10); });
    },
    scores() { return (load().scores || []).map((s) => s.p); },
    /** {trend:'up'|'down'|'flat'|null, lowRun, last, n} */
    scoreTrend() {
      const s = api.scores();
      const out = { trend: null, lowRun: 0, last: s.length ? s[s.length - 1] : null, n: s.length };
      for (let i = s.length - 1; i >= 0 && s[i] < cfg.trend.lowPct; i--) out.lowRun++;
      if (s.length >= 3) {
        const w = s.slice(-cfg.trend.window);
        const h = Math.floor(w.length / 2);
        const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        const d = avg(w.slice(w.length - h)) - avg(w.slice(0, h));
        out.trend = d >= cfg.trend.delta ? "up" : d <= -cfg.trend.delta ? "down" : "flat";
      }
      return out;
    },

    /* ===== المتابعة (ما قاله برعي وما فعله الطالب بعده) ===== */
    hint(kind, id, extra) { edit((m) => { m.follow = m.follow || {}; const f = (m.follow[kind] = m.follow[kind] || {}); f[String(id)] = Object.assign({ t: Date.now() }, extra || {}); const ks = Object.keys(f); if (ks.length > 40) ks.sort((a, b) => f[a].t - f[b].t).slice(0, ks.length - 40).forEach((k) => delete f[k]); }); },
    hinted(kind, id) { return ((load().follow || {})[kind] || {})[String(id)] || null; },
    clearHint(kind, id) { edit((m) => { if (m.follow && m.follow[kind]) delete m.follow[kind][String(id)]; }); },
    /** كل المتابعات من نوع (معرّف ⇒ {t, ...extra}) للقراءة فقط. */
    hints(kind) { return Object.assign({}, ((load().follow || {})[kind]) || {}); },
    anyHint(kind) { return Object.keys(((load().follow || {})[kind]) || {}).length > 0; },

    /* ===== الحلقات: ما قاله برعي وما حدث بعده (محليًا، بلا نصوص ولا أسماء) ===== */
    /** يسجّل ظهور رسالة. يعيد معرّف الحلقة لإغلاقها لاحقًا بـ endEpisode. */
    startEpisode({ event, cat, key, len = 0, action = false, choices = false, topic = "", manual = false }, now = Date.now()) {
      const id = now.toString(36) + Math.random().toString(36).slice(2, 5);
      edit((m) => {
        m.eps = (m.eps || []).concat({ id, e: event, c: cat, k: key || "", t: now, len, a: action ? 1 : 0, ch: choices ? 1 : 0, tp: topic, mn: manual ? 1 : 0, o: null, d: null }).slice(-cfg.episodes.max);
      });
      return id;
    },
    /** outcome: acted | closed | timeout | scrolled | chose | replaced | cancelled */
    endEpisode(id, outcome, dwellMs, now = Date.now()) {
      if (!id) return false;
      return edit((m) => {
        const e = (m.eps || []).find((x) => x.id === id);
        if (!e || e.o) return false;     // الإغلاق الأول هو الحاسم
        e.o = outcome; e.d = Math.max(0, Math.round(dwellMs || (now - e.t)));
        return true;
      });
    },
    episodes() { return (load().eps || []).slice(); },
    lastEpisode(cat) { const l = (load().eps || []).filter((x) => x.c === cat); return l.length ? l[l.length - 1] : null; },
    /**
     * مضاعف نقاط الفئة من نتيجة آخر رسالة فيها (ضمن نافذة قصيرة):
     * تجاهلٌ ⇒ أخفض قليلًا، إغلاقٌ بـ × ⇒ أخفض، تنفيذٌ/اختيارٌ ⇒ أعلى قليلًا. حلقة واحدة لا تصنع حكمًا دائمًا.
     */
    episodeMult(cat, now = Date.now()) {
      const l = api.lastEpisode(cat);
      if (!l || !l.o || now - l.t > cfg.episodes.windowMs) return 1;
      const k = cfg.episodes;
      if (l.o === "timeout") return k.timeoutMult;
      if (l.o === "closed") return k.closedMult;
      if (l.o === "acted" || l.o === "chose") return k.actedMult;
      return 1;
    },

    /* ===== تأجيل صريح من الطالب ===== */
    snooze(cat, ms, now = Date.now()) { edit((m) => { m.snooze = m.snooze || {}; m.snooze[cat] = now + (ms || cfg.snooze.defaultMs); }); },
    snoozedUntil(cat) { return Number(((load().snooze) || {})[cat]) || 0; },
    isSnoozed(cat, now = Date.now()) { return api.snoozedUntil(cat) > now; },
    clearSnooze(cat) { edit((m) => { if (m.snooze) delete m.snooze[cat]; }); },

    /* ===== «المعنى» الأدق من الفئة ===== */
    topicShownAt(topic) { return Number(((load().topics) || {})[topic]) || 0; },
    markTopic(topic, now = Date.now()) {
      edit((m) => {
        m.topics = m.topics || {};
        m.topics[topic] = now;
        const ks = Object.keys(m.topics);
        if (ks.length > 60) ks.sort((a, b) => m.topics[a] - m.topics[b]).slice(0, ks.length - 60).forEach((k) => delete m.topics[k]);
      });
    },

    /**
     * تفضيلات موثوقة مشتقة من الحلقات فقط (لا ادّعاء ذكاء اصطناعي):
     *   brevity: "short"  — الرسائل الطويلة تُغلق سريعًا بنسبة عالية بينما القصيرة لا
     *   flows:   "off"    — عُرضت اختيارات عدة مرات ولم يختر الطالب شيئًا
     *   actions: "practical" — ينفّذ أزرار الإجراء غالبًا
     * why: أسباب قابلة للقراءة في لوحة التشخيص.
     */
    prefs(now = Date.now()) {
      const k = cfg.prefs;
      const eps = (load().eps || []).filter((e) => e.o && now - e.t <= k.maxAgeMs);
      const out = { brevity: null, flows: null, actions: null, why: {} };
      const quick = (e) => e.o === "closed" && e.d !== null && e.d < k.quickCloseMs;
      const longs = eps.filter((e) => e.len >= k.longLen).slice(-k.window);
      const shorts = eps.filter((e) => e.len > 0 && e.len <= k.shortLen).slice(-k.window);
      if (longs.length >= k.minSamples) {
        const q = longs.filter(quick).length;
        const qs = shorts.length >= 3 ? shorts.filter(quick).length / shorts.length : 0;
        if (q / longs.length >= k.share && qs <= 0.5) { out.brevity = "short"; out.why.brevity = `أُغلقت ${q} من آخر ${longs.length} رسائل طويلة في أقل من ${k.quickCloseMs}ms`; }
      }
      const withCh = eps.filter((e) => e.ch).slice(-k.window);
      if (withCh.length >= k.flowMinOffers && withCh.every((e) => e.o !== "chose")) { out.flows = "off"; out.why.flows = `عُرضت اختيارات ${withCh.length} مرات بلا اختيار`; }
      const withAct = eps.filter((e) => e.a).slice(-k.window);
      if (withAct.length >= k.minSamples - 1) {
        const a = withAct.filter((e) => e.o === "acted").length;
        if (a / withAct.length >= k.actionShare) { out.actions = "practical"; out.why.actions = `نُفّذ إجراء ${a} من آخر ${withAct.length} رسائل بأزرار`; }
      }
      return out;
    },

    /* ===== تقييم جودة القرارات (محلي، محدود، بعيّنات كافية فقط) ===== */
    /** وزن إشارة حلقة واحدة. null = لا إشارة (الاختفاء/التمرير/الإلغاء/الاستبدال قد تعني أن الطالب مشغول). الطلب اليدوي لا يُحسب. */
    _signal(e) {
      if (!e || !e.o || e.mn) return null;
      const w = cfg.learn.weights;
      if (e.o === "acted") return w.acted;
      if (e.o === "chose") return w.chose;
      if (e.o === "closed") return e.d !== null && e.d !== undefined && e.d < cfg.learn.quickCloseMs ? w.closedQuick : w.closedSlow;
      if (e.o === "timeout") return w.timeout;
      return null;
    },
    /**
     * أثر موقف معيّن (حدث) على الاختيار القادم: {mult, n, conf, mean, repeat, why}.
     * mult ∈ [learn.min, learn.max] ولا يتحرك قبل minSamples؛ ويُضرب بـ repeatNoBenefit إن تكرر الموقف بلا أي تفاعل.
     */
    effectiveness(event, now = Date.now()) {
      const k = cfg.learn;
      const all = (load().eps || []).filter((e) => e.e === event && now - e.t <= cfg.memory.maxAgeMs);
      const out = { mult: 1, n: 0, conf: 0, mean: 0, repeat: false, why: "" };
      let sum = 0;
      all.slice(-k.window).forEach((e) => { const w = api._signal(e); if (w === null) return; sum += w; out.n++; });
      if (out.n >= k.minSamples) {
        out.mean = Math.round((sum / (out.n + 2)) * 1000) / 1000;      // انكماش نحو الصفر: عيّنات قليلة ⇒ أثر خفيف
        out.conf = Math.min(1, out.n / k.fullAt);
        out.mult = clamp(1 + k.gain * out.mean * out.conf * (k.fullAt / Math.max(1, out.n) > 1 ? 1 : 1), k.min, k.max);
        out.why = `${out.n} عيّنات، متوسط ${out.mean}`;
      }
      const rb = k.repeatNoBenefit;
      const recent = all.filter((e) => now - e.t <= rb.windowMs && !e.mn);
      if (recent.length >= rb.n && !recent.some((e) => e.o === "acted" || e.o === "chose")) { out.repeat = true; out.mult *= rb.mult; out.why += (out.why ? " · " : "") + `تكرر ${recent.length} مرات بلا تفاعل`; }
      out.mult = Math.round(clamp(out.mult, k.min * rb.mult, k.max) * 1000) / 1000;
      return out;
    },
    /** هدوء متدرّج: {q ∈ [0,1], n}. من التجاهل/الإغلاق التلقائي الحديث فقط؛ التنفيذ والاختيار يخفضانه. */
    quietness(now = Date.now()) {
      const k = cfg.quiet;
      const eps = (load().eps || []).filter((e) => e.o && !e.mn && now - e.t <= k.windowMs).slice(-k.window);
      let sum = 0, n = 0;
      eps.forEach((e) => { const w = k.weights[e.o]; if (w === undefined) return; sum += w; n++; });
      if (n < k.minSamples) return { q: 0, n };
      return { q: Math.round(clamp(sum / k.full, 0, 1) * 1000) / 1000, n };
    },
    /** كم مرة ظهرت فئة منذ لحظة معيّنة (لميزانيات المبادرة). */
    shownCount(cat, since = 0) { return (load().recent || []).filter((r) => r.cat === cat && r.t >= since).length; },
    lastShownOfCat(cat) { return (load().recent || []).reduce((mx, r) => (r.cat === cat && r.t > mx ? r.t : mx), 0); },

    /* ===== إحصاء التفاعلات متعددة الخطوات ===== */
    recordFlow(id, outcome, now = Date.now()) {
      if (!id) return;
      edit((m) => {
        const f = (m.flows = isObj(m.flows) ? m.flows : {});
        const r = (f[id] = isObj(f[id]) ? f[id] : { s: 0, c: 0, x: 0, a: 0, t: 0 });
        const key = { started: "s", completed: "c", cancelled: "x", abandoned: "a" }[outcome];
        if (key) r[key] = (Number(r[key]) || 0) + 1;
        r.t = now;
        const ks = Object.keys(f);
        if (ks.length > 30) ks.sort((a, b) => (f[a].t || 0) - (f[b].t || 0)).slice(0, ks.length - 30).forEach((x) => delete f[x]);
      });
    },
    flowStats(id) { const r = ((load().flows) || {})[id]; return Object.assign({ s: 0, c: 0, x: 0, a: 0, t: 0 }, isObj(r) ? r : {}); },

    /* ===== المهام التي بدأها الطالب (درس/امتحان): فُتحت أم اكتملت ===== */
    setTask(kind, rec, now = Date.now()) {
      if (!kind || !rec) return;
      edit((m) => {
        const t = (m.tasks = isObj(m.tasks) ? m.tasks : {});
        t[kind] = { id: String(rec.id || "").slice(0, 60), title: String(rec.title || "").slice(0, 60), st: rec.st === "done" ? "done" : "opened", t: now };
      });
    },
    task(kind) { const r = ((load().tasks) || {})[kind]; return isObj(r) && isNum(r.t) ? r : null; },
    completeTask(kind, id, now = Date.now()) { edit((m) => { const r = m.tasks && m.tasks[kind]; if (isObj(r) && (!id || r.id === String(id))) { r.st = "done"; r.t = now; } }); },
    clearTask(kind) { edit((m) => { if (m.tasks) delete m.tasks[kind]; }); },

    /* ===== تشابه الصيغ: رموز آخر الرسائل المعروضة (لا نصوص) ===== */
    noteText(tokens, now = Date.now()) {
      if (!Array.isArray(tokens) || !tokens.length) return;
      edit((m) => { m.txt = (m.txt || []).concat({ t: now, w: tokens.slice(0, 16) }).slice(-cfg.similarity.keep); });
    },
    recentTexts(now = Date.now()) { return (load().txt || []).filter((x) => now - x.t <= cfg.similarity.windowMs).map((x) => x.w); },

    /* ===== صيانة ===== */
    /** يمحو القديم (> maxAgeMs) ويُنظّف المنتهي. آمن لاستدعائه في أول الجلسة. */
    prune(now = Date.now()) {
      try {
        edit((m) => {
          const old = now - cfg.memory.maxAgeMs;
          if (m.eps) m.eps = m.eps.filter((e) => e.t >= old);
          if (m.recent) m.recent = m.recent.filter((r) => r.t >= old);
          if (m.scores) m.scores = m.scores.filter((r) => r.t >= old);
          if (m.txt) m.txt = m.txt.filter((r) => now - r.t <= cfg.similarity.windowMs * 3);
          ["keys", "topics"].forEach((k) => { if (m[k]) Object.keys(m[k]).forEach((x) => { if (m[k][x] < old) delete m[k][x]; }); });
          if (m.snooze) Object.keys(m.snooze).forEach((x) => { if (m.snooze[x] <= now) delete m.snooze[x]; });
          if (m.follow) Object.keys(m.follow).forEach((kind) => Object.keys(m.follow[kind]).forEach((id) => { const h = m.follow[kind][id]; if (!isObj(h) || !isNum(h.t) || h.t < old) delete m.follow[kind][id]; }));
          if (m.tasks) Object.keys(m.tasks).forEach((k) => { if (!isObj(m.tasks[k]) || m.tasks[k].t < old) delete m.tasks[k]; });
          if (m.cats) Object.keys(m.cats).forEach((k) => { if (m.cats[k].penaltyUntil && m.cats[k].penaltyUntil < now) m.cats[k].penaltyUntil = 0; });
        });
        return true;
      } catch (e) { return false; }
    },
    /** يمسح كل ما تعلّمه برعي (المحلي فقط). */
    clear() { try { adapter.write({}); return true; } catch (e) { return false; } },
    /** يصفّر التعلّم (فعالية/هدوء/تأجيلات/تفاعلات) ويُبقي مفاتيح التهدئة والزيارات حتى لا ينفجر الظهور بعد التصفير. */
    resetLearning() {
      try {
        edit((m) => { ["cats", "eps", "recent", "snooze", "flows", "txt", "tasks", "lines", "scores"].forEach((k) => delete m[k]); });
        return true;
      } catch (e) { return false; }
    },
    /** ملخص صغير للتشخيص/الاختبار. */
    size() { try { return JSON.stringify(load()).length; } catch (e) { return 0; } },

    /* ===== حالة صفحات (مثل آخر حالة طلبات رآها الطالب) ===== */
    data(name) { return ((load().data || {})[name]) || null; },
    setData(name, value) { edit((m) => { m.data = m.data || {}; m.data[name] = value; }); },

    /* ===== الزيارات (محليًا) ===== */
    /** يُستدعى مرة لكل جلسة متصفح. يعيد {visits, awayDays, prevLast}. */
    startSession(now = Date.now()) {
      api.prune(now);
      return edit((m) => {
        const v = (m.visits = m.visits || { n: 0, days: [], last: 0 });
        const prev = v.last || 0;
        v.n++;
        const dk = dayKeyOf(now);
        if (!v.days.includes(dk)) v.days = v.days.concat(dk).slice(-60);
        v.last = now;
        const away = prev ? Math.floor((now - prev) / DAY) : 0;
        return { visits: v.n, awayDays: away, prevLast: prev };
      });
    },
    visits() { return Number(((load().visits) || {}).n) || 0; },
    /** أيام متتالية على هذا الجهاز تنتهي اليوم (لا علاقة لها بعدّاد المنظّم). */
    consecutiveDays(now = Date.now()) {
      const days = new Set(((load().visits) || {}).days || []);
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const d = new Date(now); d.setDate(d.getDate() - i);   // تاريخ محلي (آمن مع تغيير التوقيت الصيفي)
        if (days.has(dayKeyOf(d.getTime()))) n++; else break;
      }
      return n;
    }
  };
  return api;
}
