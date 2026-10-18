/**
 * config.js — كل أوزان «ذكاء برعي» وعتباته وحدوده في مكان واحد.
 * ------------------------------------------------------------------
 * القاعدة الذهبية: الذكاء = اختيار الشيء الصحيح في اللحظة الصحيحة، وليس كثرة الكلام.
 * لذلك سقوف الظهور (الميزانية/التهدئة/الصفحة الواحدة) محفوظة هنا بنفس قيم الجولة السابقة،
 * وأي تكيّف يتحرك داخل [min, max] فقط.
 *
 * وصفة الضبط السريعة (كل رقم قابل للتعديل دون لمس بقية الكود):
 *   - يظهر برعي كثيرًا؟      ↓ budget.few.base  /  ↑ cooldownMs.few  /  ↑ minScore
 *   - لا يظهر أبدًا تقريبًا؟  ↓ minScore  /  ↓ windowMs  /  راجع debug (?barai=debug) لسبب الرفض
 *   - رسالة معينة تتقدّم دائمًا؟ عدّل imp/urg لها في EVENTS أو tiers.<tier>.base
 *   - تريد أن يتكيّف أسرع مع تجاهل الطالب؟ ↓ memory.closedToPenalize / ↓ adaptive.ignoredToShrink
 */
export const config = {
  /* ---------- نافذة التحكيم ---------- */
  windowMs: 2500,      // يجمع المرشّحين هذه المدة ثم يختار الأفضل (بدل «أول من يصل»)
  settleMs: 250,       // بعد barai.settle() (انتهاء تحميل بيانات الصفحة) نُنهي النافذة بعد هذه المدة
  maxHoldMs: 4000,     // لا ننتظر أكثر من هذا بعد أول مرشّح
  idleTimeoutMs: 1500, // مهلة requestIdleCallback للعرض (لا عمل ثقيل أثناء التحميل)
  retryMs: 2500,       // إعادة المحاولة إن كان الطالب مشغولًا (كتابة/فيديو…)
  maxTries: 3,

  /* ---------- الميزانية (سقف الظهور) ---------- */
  budget: {
    few:  { base: 3, min: 1, max: 4 },   // «قليل» (الافتراضي)
    many: { base: 6, min: 2, max: 7 },   // «كثير»
    reducedTo: 1                          // بعد إغلاقين متتاليين بلا تفاعل: باقي اليوم
  },
  /** تكيّف الميزانية داخل الجلسة */
  adaptive: {
    actedToGrow: 2,        // نقرتان على زر إجراء ⇒ فقاعة إضافية واحدة (حتى max)
    grow: 1,
    ignoredToShrink: 2,    // فقاعتان اختفتا وحدهما بلا أي تفاعل ⇒ ننزل إلى ignoredCap
    ignoredCap: 2
  },
  cooldownMs: { few: 90000, many: 45000, reducedMul: 3 },
  sameKeyMs: 24 * 60 * 60 * 1000,   // نفس الموقف لا يتكرر قبل مرور هذه المدة
  pageLimit: 1,                      // فقاعة تلقائية واحدة للصفحة (الأحداث «اللحظية» flow مستثناة من الصفحة والتهدئة)
  momentsMax: 2,

  /* ---------- الدرجات (كلها تُقارن ببعضها) ---------- */
  tiers: {
    critical:   { base: 100, rank: 0 },  // انقطاع النت، خطأ يمنع العمل
    actionable: { base: 60,  rank: 1 },  // قابل للتنفيذ الآن
    celebrate:  { base: 50,  rank: 2 },  // احتفالي
    contextual: { base: 28,  rank: 3 },  // سياقي (وقت/يوم/غياب)
    ambient:    { base: 10,  rank: 4 }   // محيطي بلا نص
  },
  minScore: 3,           // أقل نقاط للعرض (ما دونها ⇒ «ضعيف»). المواقف السياقية الخفيفة (جمعة/صباح/تخطيط فارغ) تسجّل 4–7 قبل الخصم

  /* ---------- الإرهاق وتكلفة المقاطعة ---------- */
  fatigue: {
    perCategory: 12, categoryWindowMs: 6 * 3600000,   // كل ظهور لنفس الفئة خلال 6 ساعات يخصم 12
    global: 5, globalWindowMs: 30 * 60000,            // كل ظهور خلال 30 دقيقة يخصم 5
    max: 40
  },
  interrupt: {
    base: 1,
    scrolling: 10, scrollMs: 1200,       // الطالب يمرّر الآن
    typing: 14, typingMs: 3000,          // كتب قبل لحظات
    idleBonus: -1, idleMs: 6000,         // ساكن ⇒ المقاطعة أرخص
    justLanded: 5, landedMs: 1500        // الصفحة لتوّها فُتحت
  },

  /* ---------- الذاكرة والتكيّف ---------- */
  memory: {
    closedToPenalize: 3,      // 3 إغلاقات بـ × على الأقل…
    closedRate: 0.6,          // …وبنسبة ≥ 60% من الظهور
    penaltyMult: 0.5,         // ⇒ وزن الفئة ×0.5
    penaltyMs: 3 * 24 * 3600000,   // …ومنعها هذه المدة
    boostActed: 2,            // نقر الإجراء مرتين فأكثر بنسبة ≥ 50%
    boostRate: 0.5,
    boostMult: 1.15,
    lastLinesPerKey: 3,       // لا تكرار آخر 3 صيغ لكل موقف عبر الجلسات
    maxRecent: 40,
    maxAgeMs: 30 * 86400000,  // أي أثر أقدم من 30 يومًا يُنسى (حلقات/مفاتيح/معانٍ/متابعات)
    maxBytes: 48000,          // سقف حجم الذاكرة بعد التسلسل؛ فوقه تُقلَّم أقدم الحلقات ثم الصيغ، وأخيرًا تُصفَّر بأمان
    schema: 2                 // رقم نسخة البنية: أي بنية أقدم/تالفة تُنظَّف عند التحميل
  },

  /* ---------- تعلّم من جودة القرارات (محلي، محدود، قابل للتصفير) ----------
     الإشارة = ما فعله الطالب بعد الرسالة، لا «سبب» نفسي. الاختفاء/التمرير/الإلغاء إشارات ضعيفة أو محايدة
     (قد يكون الطالب مشغولًا)، والارتباط لا يُعامل كسببية: الأثر مضاعف محدود [min,max] بعيّنات كافية فقط. */
  learn: {
    minSamples: 4, window: 12, fullAt: 10,
    gain: 0.3, min: 0.75, max: 1.2,
    quickCloseMs: 1500,
    weights: { acted: 1, chose: 1, closedQuick: -1, closedSlow: -0.4, timeout: -0.15 },
    repeatNoBenefit: { n: 3, windowMs: 24 * 3600000, mult: 0.7 }   // 3 ظهورات في يوم بلا أي تفاعل ⇒ ×0.7
  },
  /** «هدوء متدرّج»: كلما تجاهل الطالب/أغلق رسائل تلقائية حديثة، ارتفعت عتبة الصمت وانخفضت الميزانية قليلًا (لا يمس ما طلبه بنفسه). */
  quiet: {
    window: 10, minSamples: 4, windowMs: 3 * 86400000, full: 6,
    weights: { closed: 1, timeout: 0.3, acted: -1.2, chose: -1.2 },
    maxBar: 4, maxBudgetCut: 1
  },

  /* ---------- ميزانيات المبادرة لكل فئة (قابلة للضبط) ----------
     perSession: سقف الفئة في الجلسة، perDay: سقفها خلال 24 ساعة، minGapMs: أقل فاصل بين ظهورين. الحرج واللحظي flow والطلب اليدوي مستثنون. */
  initiative: {
    default: { perSession: 3, perDay: 6, minGapMs: 0 },
    perCat: {
      time:   { perSession: 1, perDay: 1 },
      help:   { perSession: 1, perDay: 1, minGapMs: 2 * 86400000 },
      lesson: { perSession: 2, perDay: 3 }
    }
  },

  /* ---------- صلاحية المرشّح: ما فقد صلاحيته لا يُعرض ---------- */
  validity: { ttlMs: { critical: 90000, actionable: 20000, celebrate: 15000, contextual: 12000, ambient: 8000, flow: 10000 } },

  /* ---------- تقدير حالة الجلسة (أدلة فقط، مع درجة ثقة) ---------- */
  states: { lowRunStruggle: 2, trailHurry: 3, exploringPages: 4, sessionLongMs: 45 * 60000, minConfidenceToAct: 0.6 },

  /* ---------- منع تشابه الصيغ عبر المواقف خلال فترة قصيرة ---------- */
  similarity: { threshold: 0.6, keep: 12, windowMs: 20 * 60000 },

  /* ---------- صفحات المنصة المعروفة: لا روابط خارجها ---------- */
  pages: ["index.html", "exams.html", "lessons.html", "bank.html", "planner.html", "announcements.html", "events.html", "profile.html", "ai.html"],

  /* ---------- تفضيلات الطالب الصريحة (الافتراضيات) ---------- */
  explicit: { level: "few", motion: "auto", brevity: "auto", flows: "on" },

  /* ---------- نوع كل موقف: guide إرشاد · encourage تشجيع · celebrate احتفال · hint تلميح · alert تنبيه · reply ردّ على طلب الطالب ----------
     الاحتفال لا يظهر إلا لحدث مؤكَّد من النظام؛ والردّ لا يُحسب مبادرة. أي حدث غير مذكور يأخذ نوع درجته. */
  kinds: {
    "exam.new": "guide", "exam.intro": "encourage", "exam.result": "celebrate",
    "announce.unread": "guide", "announce.onPage": "hint", "announce.allRead": "encourage",
    "event.live": "guide", "event.ended": "hint",
    "planner.empty": "guide", "planner.overdue": "alert", "planner.taskDone": "celebrate", "planner.allDone": "celebrate",
    "streak.milestone": "celebrate", "lesson.completed": "encourage", "lesson.returning": "encourage", "lesson.resume": "guide",
    "time.lateNight": "hint", "time.morning": "encourage", "time.friday": "encourage",
    "login.first": "guide", "login.firstStep": "guide", "login.success": "encourage", "login.fail": "alert",
    "bank.orderStatus": "guide", "bank.earned": "celebrate", "bank.afford": "guide", "bank.near": "hint", "bank.newReward": "guide",
    "bank.lowStock": "hint", "bank.blocked": "alert", "bank.welcome": "guide", "bank.poor": "encourage", "bank.redeem": "celebrate", "bank.open": "guide",
    "lessons.open": "guide", "ai.open": "guide", "ai.limit": "alert", "ai.error": "alert",
    "net.offline": "alert", "net.slow": "alert", "net.back": "alert", "net.failed": "alert", "error.generic": "alert",
    "tap.hello": "reply", "egg.joke": "reply", "egg.intro": "reply"
  },

  /* ---------- الاسم الأول: نادر ---------- */
  name: { everyNth: 4, preferChance: 0.65 },   // مرة تقريبًا كل 4 رسائل

  /* ---------- الرسائل المدمجة ---------- */
  compound: {
    enabled: true,
    minScore: 22,      // الثاني يجب أن يكون قويًا
    minRatio: 0.45     // ونقاطه ≥ 45% من الأول
  },

  /* ---------- اتجاه الدرجات (محليًا) ---------- */
  trend: { window: 8, delta: 8, lowPct: 50 },   // تحسّن/تراجع = فرق ≥ 8 نقاط مئوية بين النصفين

  /* ---------- سياق الجلسة ---------- */
  context: {
    idleSleepMs: 60000,        // نعاس برعي بعد 60 ثانية بلا لمس (الرئيسية)
    returningAwayDays: 3,      // «وحشتنا» بعد 3 أيام غياب
    nearGapRatio: 0.35,        // «باقي لك X» إن كان النقص ≤ 35% من السعر
    lowStock: 3,
    poorRatio: 0.35,
    shortTextLen: 70           // نص قصير للنت الضعيف/الليل
  },

  /* ---------- الحلقات (ما حدث بعد كل رسالة) ---------- */
  episodes: {
    max: 40,
    windowMs: 20 * 60000,      // أثر آخر نتيجة في نفس الفئة يمتد 20 دقيقة فقط
    timeoutMult: 0.8, closedMult: 0.6, actedMult: 1.1   // أثر خفيف: حلقة واحدة لا تغيّر السلوك جذريًا
  },
  snooze: { defaultMs: 6 * 3600000 },   // «لاحقًا» الصريحة من الطالب

  /* ---------- «المعنى»: لا يتكرر بصيغة أخرى خلال هذه المدة ---------- */
  topics: {
    gapMs: 45 * 60000,
    /** حدث ⇒ معنى (الافتراضي: فئته). نفس المعنى لا يظهر مرتين بحدثين مختلفين قريبين. */
    of: {
      "bank.afford": "bank.spend", "bank.near": "bank.spend",
      "bank.newReward": "bank.catalog", "bank.lowStock": "bank.catalog",
      "time.lateNight": "greeting", "time.morning": "greeting", "time.friday": "greeting",
      "login.success": "greeting", "lesson.returning": "greeting",
      "announce.unread": "announce.news", "announce.onPage": "announce.page", "announce.allRead": "announce.page"
    },
    /** متابعات مشروعة لما قيل قبل قليل: لا تُحجب بقاعدة المعنى. */
    followups: ["announce.onPage", "announce.allRead", "exam.result", "bank.redeem", "bank.earned"]
  },

  /* ---------- الصمت كخيار حقيقي: عتبة تتحرك مع سلوك الطالب ---------- */
  silence: {
    ignoredStep: 1.5,   // كل رسالة اختفت وحدها تتبعها أخرى: ترفع العتبة
    closedStep: 3,      // كل إغلاق متتالٍ بـ ×
    hurry: 2.5,         // تنقّل سريع ذهابًا وإيابًا بين صفحتين
    returned: 1.5,      // عاد للتوّ من تبويب آخر
    focusPages: { "lessons.html": 4, "exam.html": 6, "ai.html": 2 },   // صفحات تركيز: الصمت أولى لما ليس عاجلًا
    tierWeight: { critical: 0, actionable: 0.5, celebrate: 0.25, contextual: 1, ambient: 1 }
  },

  /* ---------- تفضيلات موثوقة (تظهر فقط بعد عيّنات كافية) ---------- */
  prefs: {
    window: 8, minSamples: 5, share: 0.7,
    longLen: 70, shortLen: 45, quickCloseMs: 1500,   // رسالة طويلة تُغلق قبل أن تُقرأ ⇒ إشارة لتفضيل الاختصار
    flowMinOffers: 4,                                  // أربع عروض اختيار بلا اختيار ⇒ لا نعرض اختيارات
    actionShare: 0.6, actionMult: 1.1,
    maxAgeMs: 21 * 86400000
  },

  /* ---------- تفاعلات متعددة الخطوات ---------- */
  flow: {
    stepTtlMs: 14000,     // مهلة كل خطوة (تتوقف عند اللمس)
    maxMs: 120000,        // أقصى عمر لتفاعل كامل
    maxChoices: 3
  },

  /* ---------- نظرة العينين والحركات العفوية ---------- */
  gaze: { range: 3, maxMascots: 3, glanceMinMs: 9000, glanceMaxMs: 17000, idleStopMs: 90000 },

  /* ---------- ثوابت أخرى ---------- */
  avoid: { selector: "[data-barai-avoid]", gap: 8 },
  bubble: { minTtl: 4000, maxTtl: 7000, perChar: 55, base: 2500, scrollDismiss: 90 },

  /* ---------- أوزان كل موقف (الأهمية × الإلحاح) ----------
     tier: الدرجة، cat: الفئة (للإرهاق والتكيّف)، imp/urg ∈ (0..1]
     flow: ناتج مباشرة عن فعل الطالب الآن ⇒ يتجاوز تهدئة الصفحة والتهدئة الزمنية (لكن لا الميزانية ولا «صامت»)  */
  events: {
    "exam.new":         { tier: "actionable", cat: "exam",     imp: 0.90, urg: 0.80 },
    "exam.intro":       { tier: "contextual", cat: "exam",     imp: 0.50, urg: 0.90, flow: true },
    "exam.result":      { tier: "celebrate",  cat: "exam",     imp: 0.80, urg: 0.90 },
    "announce.unread":  { tier: "actionable", cat: "announce", imp: 0.75, urg: 0.70 },
    "announce.onPage":  { tier: "contextual", cat: "announce", imp: 0.50, urg: 0.50 },
    "announce.allRead": { tier: "contextual", cat: "announce", imp: 0.35, urg: 0.40 },
    "event.live":       { tier: "actionable", cat: "event",    imp: 0.70, urg: 0.90 },
    "event.ended":      { tier: "contextual", cat: "event",    imp: 0.30, urg: 0.30 },
    "planner.empty":    { tier: "contextual", cat: "planner",  imp: 0.45, urg: 0.45 },
    "planner.overdue":  { tier: "actionable", cat: "planner",  imp: 0.70, urg: 0.65 },
    "planner.taskDone": { tier: "celebrate",  cat: "planner",  imp: 0.40, urg: 0.80, flow: true },
    "planner.allDone":  { tier: "celebrate",  cat: "planner",  imp: 0.85, urg: 0.95, flow: true },
    "streak.milestone": { tier: "celebrate",  cat: "streak",   imp: 0.80, urg: 0.70 },
    "lesson.completed": { tier: "celebrate",  cat: "lesson",   imp: 0.50, urg: 0.80, flow: true },
    "lesson.returning": { tier: "contextual", cat: "lesson",   imp: 0.65, urg: 0.60 },
    "time.lateNight":   { tier: "contextual", cat: "time",     imp: 0.70, urg: 0.75 },
    "time.morning":     { tier: "contextual", cat: "time",     imp: 0.45, urg: 0.45 },
    "time.friday":      { tier: "contextual", cat: "time",     imp: 0.40, urg: 0.40 },
    "login.first":      { tier: "contextual", cat: "login",    imp: 0.50, urg: 0.50 },
    "login.firstStep":  { tier: "actionable", cat: "login",    imp: 0.80, urg: 0.90, flow: true },
    "login.success":    { tier: "celebrate",  cat: "login",    imp: 0.60, urg: 0.70 },
    "bank.orderStatus": { tier: "actionable", cat: "bank",     imp: 0.90, urg: 0.75 },
    "bank.earned":      { tier: "celebrate",  cat: "bank",     imp: 0.75, urg: 0.80 },
    "bank.afford":      { tier: "actionable", cat: "bank",     imp: 0.65, urg: 0.55 },
    "bank.near":        { tier: "actionable", cat: "bank",     imp: 0.55, urg: 0.45 },
    "bank.newReward":   { tier: "actionable", cat: "bank",     imp: 0.55, urg: 0.50 },
    "bank.lowStock":    { tier: "actionable", cat: "bank",     imp: 0.45, urg: 0.55 },
    "bank.blocked":     { tier: "contextual", cat: "bank",     imp: 0.70, urg: 0.60 },
    "bank.welcome":     { tier: "contextual", cat: "bank",     imp: 0.65, urg: 0.60 },
    "bank.poor":        { tier: "contextual", cat: "bank",     imp: 0.30, urg: 0.30 },
    "bank.redeem":      { tier: "celebrate",  cat: "bank",     imp: 0.90, urg: 1.00, flow: true },
    "ai.open":          { tier: "contextual", cat: "ai",       imp: 0.40, urg: 0.60, flow: true },
    "bank.open":        { tier: "contextual", cat: "help",     imp: 0.55, urg: 0.55 },
    "lessons.open":     { tier: "contextual", cat: "help",     imp: 0.50, urg: 0.50 },
    "lesson.resume":    { tier: "contextual", cat: "lesson",   imp: 0.60, urg: 0.55 },
    "tap.hello":        { tier: "contextual", cat: "tap",      imp: 0.50, urg: 0.50 },
    "ai.limit":         { tier: "actionable", cat: "ai",       imp: 0.70, urg: 0.90, flow: true },
    "ai.error":         { tier: "critical",   cat: "error",    imp: 1, urg: 1 },
    "net.offline":      { tier: "critical",   cat: "net",      imp: 1, urg: 1 },
    "net.slow":         { tier: "critical",   cat: "net",      imp: 1, urg: 1 },
    "net.back":         { tier: "critical",   cat: "net",      imp: 1, urg: 1 },
    "net.failed":       { tier: "critical",   cat: "net",      imp: 1, urg: 1 },
    "error.generic":    { tier: "critical",   cat: "error",    imp: 1, urg: 1 },
    "login.fail":       { tier: "critical",   cat: "login",    imp: 1, urg: 1 },
    "egg.joke":         { tier: "critical",   cat: "egg",      imp: 1, urg: 1 },
    "egg.intro":        { tier: "critical",   cat: "egg",      imp: 1, urg: 1 }
  }
};

export default config;
