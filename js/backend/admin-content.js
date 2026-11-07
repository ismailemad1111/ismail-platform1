/* ============================================================
   js/backend/admin-content.js — الإدارة: الدروس، الاختبارات، النتائج،
   الإعدادات، مجموعات الدروس
   ============================================================ */

import {
  fs, db, col, route, ok, bad, safeText, clamp, isValidStage, isYouTubeUrl, isLessonUrl, NEW_LESSON_KINDS, storedLessonKind, GROUP_COLORS,
  tsToMs, toPlain,
  requireAdmin, getDocData, queryDocs, listAll, ref, countDocs, sumField, getDocsByIds
} from "./core.js";
import {
  AI_PROVIDERS, AI_PROVIDER_IDS, ProviderError,
  normalizeAiConfig, providerReadiness, callProvider
} from "./ai.js";

/** حذف مجموعة مستندات على دفعات (حد Firestore: 500 عملية) */
async function deleteMany(name, ids) {
  for (let i = 0; i < ids.length; i += 400) {
    const batch = fs.writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(ref(name, id)));
    await batch.commit();
  }
}

/* ---------------- التحقق من بيانات الاختبار ---------------- */

function validateExamPayload(body, opts = {}) {
  const { requireStatus = false } = opts;

  const title = safeText(body.title);
  const stage = safeText(body.stage);
  const policy = safeText(body.resultPolicy) || "immediate";
  const resultTime = body.resultTime || null;
  const resultDurationMinutes = clamp(Number(body.resultDurationMinutes) || 0, 0, 10080);
  const questions = Array.isArray(body.questions) ? body.questions : [];

  if (!title || title.length > 150) return { ok: false, error: "العنوان غير صالح." };
  if (!isValidStage(stage)) return { ok: false, error: "المرحلة غير صحيحة." };
  if (!["immediate", "after_duration", "after_datetime"].includes(policy)) {
    return { ok: false, error: "سياسة النتيجة غير صحيحة." };
  }
  if (policy === "after_datetime" && !resultTime) {
    return { ok: false, error: "حدد وقت ظهور النتيجة." };
  }
  if (policy === "after_duration" && resultDurationMinutes <= 0) {
    return { ok: false, error: "حدد مدة ظهور النتيجة." };
  }
  if (questions.length < 1) {
    return { ok: false, error: "يجب إضافة سؤال واحد على الأقل." };
  }

  const safeQuestions = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const text = safeText(q.text);
    const choices = Array.isArray(q.choices) ? q.choices.map((c) => safeText(c)) : [];
    const correctIndex = Number(q.correctIndex);

    if (!text) return { ok: false, error: `السؤال ${i + 1}: نص السؤال ناقص.` };
    if (choices.length < 3 || choices.length > 4) {
      return { ok: false, error: `السؤال ${i + 1}: يجب 3 أو 4 اختيارات.` };
    }
    if (choices.some((c) => !c)) {
      return { ok: false, error: `السؤال ${i + 1}: يوجد اختيار فارغ.` };
    }
    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      return { ok: false, error: `السؤال ${i + 1}: الإجابة الصحيحة غير محددة.` };
    }

    safeQuestions.push({ text, choices, correctIndex });
  }

  return {
    ok: true,
    title,
    stage,
    resultPolicy: policy,
    resultTime: policy === "after_datetime" ? resultTime : null,
    resultDurationMinutes: policy === "after_duration" ? resultDurationMinutes : 0,
    questions: safeQuestions
  };
}

/* ---------------- الدروس (فيديو فقط للجديد) ---------------- */

const toOrder = (v, dflt = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(Math.round(n), 0, 100000) : dflt;
};

/** يتحقق من علاقة (المجموعة/الوحدة/المرحلة) ويعيد { group, unit } */
async function resolveLessonPlacement({ stage, collectionId, unitId }) {
  const group = await getDocData("lessonCollections", collectionId);
  if (!group) bad("NOT_FOUND", "المجموعة التعليمية غير موجودة.");
  if (safeText(group.stage) !== stage) bad("BAD_REQUEST", "المجموعة لا تتبع المرحلة المحددة.");
  let unit = null;
  if (unitId) {
    unit = await getDocData("lessonUnits", unitId);
    if (!unit) bad("NOT_FOUND", "الوحدة غير موجودة.");
    if (safeText(unit.collectionId) !== collectionId) bad("BAD_REQUEST", "الوحدة لا تتبع المجموعة نفسها.");
  }
  return { group, unit };
}

const lessonOut = (d) => ({
  id: d.id,
  title: safeText(d.title),
  description: safeText(d.description),
  kind: storedLessonKind(d),
  url: safeText(d.url) || safeText(d.youtubeUrl),
  youtubeUrl: safeText(d.url) || safeText(d.youtubeUrl),
  stage: safeText(d.stage),
  collectionId: safeText(d.collectionId) || null,
  unitId: safeText(d.unitId) || null,
  order: Number.isFinite(Number(d.order)) ? Number(d.order) : 0,
  active: d.active !== false,
  createdAt: d.createdAt || null
});

route("GET", "/api/admin/lessons", async () => {
  requireAdmin();
  const rows = await listAll("lessons");
  const lessons = rows.map(lessonOut);
  lessons.sort((a, b) => (a.order - b.order) || (tsToMs(b.createdAt) - tsToMs(a.createdAt)));
  return ok(toPlain({ lessons }));
});

route("POST", "/api/admin/lessons", async ({ body }) => {
  requireAdmin();
  const title = safeText(body.title);
  const kind = safeText(body.kind) || "video";
  const url = safeText(body.url) || safeText(body.youtubeUrl);
  const stage = safeText(body.stage);
  const description = safeText(body.description);
  const collectionId = safeText(body.collectionId);
  const unitId = safeText(body.unitId);
  const active = body.active !== false;

  if (!title || title.length > 150) bad("BAD_REQUEST", "العنوان غير صالح.");
  if (description.length > 1000) bad("BAD_REQUEST", "الوصف طويل جدًا.");
  if (!NEW_LESSON_KINDS.includes(kind)) bad("BAD_REQUEST", "الدروس الجديدة فيديو فقط.");
  if (!isYouTubeUrl(url)) bad("BAD_REQUEST", "رابط YouTube غير صالح.");
  if (!isValidStage(stage)) bad("BAD_REQUEST", "المرحلة غير صحيحة.");
  if (!collectionId) bad("BAD_REQUEST", "اختر المجموعة التعليمية.");
  await resolveLessonPlacement({ stage, collectionId, unitId });

  let order = body.order === undefined || body.order === "" ? null : toOrder(body.order);
  if (order === null) {
    const sibs = (await queryDocs("lessons", fs.where("collectionId", "==", collectionId)))
      .filter((l) => (safeText(l.unitId) || "") === unitId);
    order = sibs.reduce((m, l) => Math.max(m, Number(l.order) || 0), 0) + 1;
  }

  const doc = {
    title, description, kind: "video", url, youtubeUrl: url, stage,
    collectionId, unitId: unitId || null, order, active,
    createdAt: fs.serverTimestamp()
  };
  const created = await fs.addDoc(col("lessons"), doc);
  return ok({
    lesson: lessonOut({ ...doc, id: created.id, createdAt: new Date().toISOString() })
  });
});

route("PATCH", "/api/admin/lessons/:id", async ({ params, body }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  const old = await getDocData("lessons", id);
  if (!old) bad("NOT_FOUND", "الدرس غير موجود.");

  const oldKind = storedLessonKind(old);
  /* لا تغيير للنوع إلى صوت/ملازم، والنوع القديم يبقى كما هو */
  if (typeof body.kind === "string" && body.kind !== oldKind && !NEW_LESSON_KINDS.includes(body.kind)) {
    bad("BAD_REQUEST", "الدروس فيديو فقط.");
  }

  const update = {};
  if (typeof body.title === "string") {
    const t = safeText(body.title);
    if (!t || t.length > 150) bad("BAD_REQUEST", "العنوان غير صالح.");
    update.title = t;
  }
  if (typeof body.description === "string") {
    const d = safeText(body.description);
    if (d.length > 1000) bad("BAD_REQUEST", "الوصف طويل جدًا.");
    update.description = d;
  }
  const newUrl = safeText(body.url) || safeText(body.youtubeUrl);
  if (newUrl) {
    if (!isYouTubeUrl(newUrl)) bad("BAD_REQUEST", "رابط YouTube غير صالح.");
    update.url = newUrl;
    update.youtubeUrl = newUrl;
    update.kind = "video";
  } else if (oldKind !== "video" && typeof body.kind === "string" && body.kind === "video") {
    bad("BAD_REQUEST", "أدخل رابط YouTube لتحويل الدرس القديم إلى فيديو.");
  }
  if (typeof body.active === "boolean") update.active = body.active;
  if (body.order !== undefined && body.order !== "") update.order = toOrder(body.order);

  /* العلاقات: تُفحص دائمًا على القيم النهائية */
  const stage = typeof body.stage === "string" ? body.stage : safeText(old.stage);
  if (!isValidStage(stage)) bad("BAD_REQUEST", "المرحلة غير صحيحة.");
  const groupChanged = typeof body.collectionId === "string" && safeText(body.collectionId) !== (safeText(old.collectionId) || "");
  let groupId = typeof body.collectionId === "string" ? safeText(body.collectionId) : (safeText(old.collectionId) || "");
  let unitId = body.unitId !== undefined ? safeText(body.unitId) : (groupChanged ? "" : (safeText(old.unitId) || ""));
  if (groupChanged && body.unitId === undefined) unitId = ""; /* لا نحتفظ بوحدة من مجموعة مختلفة */
  const touchesPlacement = groupChanged || body.unitId !== undefined || stage !== safeText(old.stage) || (typeof body.collectionId === "string");
  if (touchesPlacement) {
    if (!groupId) bad("BAD_REQUEST", "اختر المجموعة التعليمية.");
    await resolveLessonPlacement({ stage, collectionId: groupId, unitId });
    update.stage = stage;
    update.collectionId = groupId;
    update.unitId = unitId || null;
    if (groupChanged && body.order === undefined) {
      const sibs = (await queryDocs("lessons", fs.where("collectionId", "==", groupId)))
        .filter((l) => (safeText(l.unitId) || "") === unitId);
      update.order = sibs.reduce((m, l) => Math.max(m, Number(l.order) || 0), 0) + 1;
    }
  }
  update.updatedAt = fs.serverTimestamp();

  await fs.updateDoc(ref("lessons", id), update);
  return ok({ updated: true });
});

/* ترتيب الدروس: ids بالترتيب الجديد (داخل نفس الوحدة/المجموعة) */
route("POST", "/api/admin/lessons/reorder", async ({ body }) => {
  requireAdmin();
  const ids = Array.isArray(body.ids) ? body.ids.map(safeText).filter(Boolean) : [];
  if (!ids.length || ids.length > 400 || new Set(ids).size !== ids.length) bad("BAD_REQUEST", "قائمة الترتيب غير صالحة.");
  const found = await getDocsByIds("lessons", ids);
  if (ids.some((i) => !found[i])) bad("NOT_FOUND", "بعض الدروس غير موجودة.");
  const batch = fs.writeBatch(db);
  ids.forEach((i, n) => batch.update(ref("lessons", i), { order: n + 1, updatedAt: fs.serverTimestamp() }));
  await batch.commit();
  return ok({ reordered: ids.length });
});

route("DELETE", "/api/admin/lessons/:id", async ({ params }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("lessons", id))) bad("NOT_FOUND", "الدرس غير موجود.");
  await fs.deleteDoc(ref("lessons", id));
  return ok({ deleted: true });
});

/* ---------------- الاختبارات ---------------- */

route("GET", "/api/admin/exams", async () => {
  requireAdmin();
  const rows = await listAll("exams");
  // عدد المحاولات لكل اختبار بـ count() (قراءة واحدة لكل 1000 محاولة) بدل تنزيل كل المحاولات.
  // العدد دقيق وكامل، وأي فشل يُفشل الطلب كله (لا نعرض عددًا ناقصًا على أنه كامل).
  const counts = {};
  await Promise.all(rows.map(async (d) => {
    counts[d.id] = await countDocs("examAttempts", fs.where("examId", "==", d.id));
  }));

  const exams = rows.map((d) => ({
    id: d.id,
    title: safeText(d.title),
    stage: safeText(d.stage),
    status: safeText(d.status) || "draft",
    resultPolicy: safeText(d.resultPolicy) || "immediate",
    resultTime: d.resultTime || null,
    resultDurationMinutes: Number(d.resultDurationMinutes) || 0,
    questionsCount: Array.isArray(d.questions) ? d.questions.length : 0,
    attemptsCount: counts[d.id] || 0,
    createdAt: d.createdAt || null
  }));
  exams.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  return ok(toPlain({ exams }));
});

route("POST", "/api/admin/exams", async ({ body }) => {
  requireAdmin();
  const v = validateExamPayload(body);
  if (!v.ok) bad("BAD_REQUEST", v.error);

  const created = await fs.addDoc(col("exams"), {
    title: v.title,
    stage: v.stage,
    resultPolicy: v.resultPolicy,
    resultTime: v.resultTime,
    resultDurationMinutes: v.resultDurationMinutes,
    questions: v.questions,
    status: "draft",
    createdAt: fs.serverTimestamp()
  });

  return ok(toPlain({
    exam: {
      id: created.id,
      title: v.title,
      stage: v.stage,
      status: "draft",
      resultPolicy: v.resultPolicy,
      resultTime: v.resultTime,
      resultDurationMinutes: v.resultDurationMinutes,
      questionsCount: v.questions.length,
      attemptsCount: 0,
      createdAt: new Date()
    }
  }));
});

route("PATCH", "/api/admin/exams/:id", async ({ params, body }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");

  const v = validateExamPayload(body, { requireStatus: false });
  if (!v.ok) bad("BAD_REQUEST", v.error);
  if (!(await getDocData("exams", id))) bad("NOT_FOUND", "الاختبار غير موجود.");

  await fs.updateDoc(ref("exams", id), {
    title: v.title,
    stage: v.stage,
    resultPolicy: v.resultPolicy,
    resultTime: v.resultTime,
    resultDurationMinutes: v.resultDurationMinutes,
    questions: v.questions,
    updatedAt: fs.serverTimestamp()
  });
  return ok({ updated: true });
});

route("PATCH", "/api/admin/exams/:id/publish", async ({ params, body }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");

  const status = safeText(body.status);
  if (!["draft", "published"].includes(status)) bad("BAD_REQUEST", "الحالة غير صحيحة.");

  const exam = await getDocData("exams", id);
  if (!exam) bad("NOT_FOUND", "الاختبار غير موجود.");

  if (status === "published") {
    if (!exam.title || !isValidStage(exam.stage)) bad("BAD_REQUEST", "بيانات الاختبار ناقصة.");
    if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
      bad("BAD_REQUEST", "الاختبار لا يحتوي على أسئلة.");
    }
  }

  await fs.updateDoc(ref("exams", id), {
    status,
    publishedAt: status === "published" ? fs.serverTimestamp() : null,
    updatedAt: fs.serverTimestamp()
  });
  return ok({ updated: true, status });
});

route("DELETE", "/api/admin/exams/:id", async ({ params }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("exams", id))) bad("NOT_FOUND", "الاختبار غير موجود.");

  await fs.deleteDoc(ref("exams", id));

  try {
    const attempts = await queryDocs("examAttempts", fs.where("examId", "==", id), fs.limit(2000));
    await deleteMany("examAttempts", attempts.map((a) => a.id));
  } catch (e) { /* لا يؤثر */ }

  return ok({ deleted: true });
});

/* ---------------- النتائج ----------------
   بدون limit : السلوك القديم كما هو (كل المحاولات؛ حتى 2000 لامتحان محدد).
   مع limit   : ترقيم حقيقي بـ startAfter + إجماليات دقيقة بـ aggregate.
   الترقيم لا يُفعَّل إلا بعد فحص يضمن أنه مكافئ للقديم: كل المحاولات لها attemptedAt
   من نوع Timestamp ولها percent رقمي. إن وُجدت محاولة قديمة ينقصها أحدهما، أو لم يُنشر
   فهرس مطلوب، نرجع تلقائيًا للسلوك القديم الكامل (لا يضيع أي سجل). */

const RESULTS_CURSORS = new Map();                        // معرّف آخر مستند → لقطته لـ startAfter
const NAME_CACHE = { students: new Map(), exams: new Map() };  // تُمسح عند كل تحميل جديد (أول صفحة)

async function fillNames(kind, ids) {
  const cache = NAME_CACHE[kind];
  const missing = ids.filter((i) => i && !cache.has(String(i)));
  if (missing.length) {
    const docs = await getDocsByIds(kind, missing);
    missing.forEach((i) => {
      const d = docs[String(i)];
      cache.set(String(i), d ? safeText(kind === "students" ? d.fullName : d.title) : "");
    });
  }
  return cache;
}

function toResult(d, examTitles, studentNames) {
  return {
    id: d.id,
    examId: d.examId,
    examTitle: examTitles.get(String(d.examId)) || "",
    studentId: d.studentId,
    studentName: studentNames.get(String(d.studentId)) || "",
    stage: safeText(d.stage),
    score: Number(d.score) || 0,
    total: Number(d.total) || 0,
    percent: Number(d.percent) || 0,
    correctCount: Number(d.correctCount) || 0,
    wrongCount: Number(d.wrongCount) || 0,
    resultVisible: d.resultVisible === true,
    attemptedAt: d.attemptedAt || null
  };
}

/** إجماليات كل النتائج (للعناصر الأربعة في رأس الصفحة) أو null إن لم يكن الترقيم مكافئًا للقديم */
async function pagedSummary(examId, passingPercent) {
  const base = examId ? [fs.where("examId", "==", examId)] : [];
  const [total, withTs, withPercent] = await Promise.all([
    countDocs("examAttempts", ...base),
    countDocs("examAttempts", ...base, fs.where("attemptedAt", ">=", fs.Timestamp.fromMillis(0))),
    countDocs("examAttempts", ...base, fs.where("percent", ">=", 0))
  ]);
  if (withTs !== total || withPercent !== total) return null;
  const [sumPercent, passCount, topSnap] = await Promise.all([
    sumField("examAttempts", "percent", ...base),
    countDocs("examAttempts", ...base, fs.where("percent", ">=", passingPercent)),
    fs.getDocs(fs.query(col("examAttempts"), ...base, fs.orderBy("score", "desc"), fs.limit(1)))
  ]);
  const top = topSnap.docs[0] ? Number(topSnap.docs[0].data().score) || 0 : 0;
  return {
    total,
    avgPercent: total > 0 ? Math.round(sumPercent / total) : 0,
    topScore: top,
    passCount
  };
}

route("GET", "/api/admin/results", async ({ query }) => {
  requireAdmin();
  const examId = safeText(query.examId);
  const limitN = clamp(parseInt(query.limit, 10) || 0, 0, 200);
  const cursor = safeText(query.cursor);

  const general = await getDocData("settings", "general");
  const passingPercent = clamp(parseInt((general && general.passingPercent) || "50", 10), 1, 100);

  if (limitN > 0) {
    try {
      if (!cursor) {
        NAME_CACHE.students.clear(); NAME_CACHE.exams.clear(); RESULTS_CURSORS.clear();
      }
      const summary = cursor ? null : await pagedSummary(examId, passingPercent);
      if (cursor || summary) {
        const cons = [];
        if (examId) cons.push(fs.where("examId", "==", examId));
        cons.push(fs.orderBy("attemptedAt", "desc"), fs.orderBy(fs.documentId(), "desc"));
        if (cursor) {
          const snap = RESULTS_CURSORS.get(cursor) || await fs.getDoc(ref("examAttempts", cursor));
          if (!snap.exists()) bad("BAD_REQUEST", "تعذر متابعة التحميل. حدّث الصفحة.");
          cons.push(fs.startAfter(snap));
        }
        cons.push(fs.limit(limitN + 1));          // +1 فقط لمعرفة وجود صفحة تالية
        const snaps = (await fs.getDocs(fs.query(col("examAttempts"), ...cons))).docs;
        const hasMore = snaps.length > limitN;
        const pageSnaps = snaps.slice(0, limitN);
        const rows = pageSnaps.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d._placeholder !== true);
        if (pageSnaps.length) {
          const last = pageSnaps[pageSnaps.length - 1];
          RESULTS_CURSORS.set(last.id, last);
        }
        const [examTitles, studentNames] = await Promise.all([
          fillNames("exams", [examId, ...rows.map((a) => a.examId)]),
          fillNames("students", rows.map((a) => a.studentId))
        ]);
        const results = rows.map((d) => toResult(d, examTitles, studentNames));
        return ok(toPlain({
          results,
          passingPercent,
          examTitle: examId ? (examTitles.get(examId) || "") : "",
          paged: true,
          hasMore,
          nextCursor: hasMore && pageSnaps.length ? pageSnaps[pageSnaps.length - 1].id : null,
          ...(summary ? { summary } : {})
        }));
      }
      // summary === null: بيانات قديمة تمنع الترقيم المكافئ → السلوك القديم الكامل
    } catch (err) {
      if (!(err && err.code === "failed-precondition")) throw err;
      console.warn("[results] فهرس مطلوب غير منشور؛ رجوع للتحميل الكامل:", err.message);
    }
  }

  const attempts = examId
    ? await queryDocs("examAttempts", fs.where("examId", "==", examId), fs.limit(2000))
    : await listAll("examAttempts");

  // نقرأ فقط الاختبارات والطلاب الذين ظهروا في المحاولات (بدل كل الاختبارات وكل الطلاب).
  // من لا مستند له (محذوف) يظهر باسم فارغ تمامًا كما كان.
  const [exams, students] = await Promise.all([
    getDocsByIds("exams", [examId, ...attempts.map((a) => a.examId)]),   // examId أولًا: العنوان يظهر حتى لو لا محاولات
    getDocsByIds("students", attempts.map((a) => a.studentId))
  ]);
  const examTitles = new Map(Object.values(exams).map((e) => [e.id, safeText(e.title)]));
  const studentNames = new Map(Object.values(students).map((s) => [s.id, safeText(s.fullName)]));

  const results = attempts.map((d) => toResult(d, examTitles, studentNames));
  results.sort((a, b) => tsToMs(b.attemptedAt) - tsToMs(a.attemptedAt));

  return ok(toPlain({
    results,
    passingPercent,
    examTitle: examId ? (examTitles.get(examId) || "") : "",
    ...(limitN > 0 ? { paged: false } : {})
  }));
});

/* ---------------- الإعدادات ---------------- */

route("GET", "/api/admin/settings", async () => {
  requireAdmin();
  const d = await getDocData("settings", "general");
  if (!d) {
    return ok({
      settings: {
        academicYear: "",
        platformName: "منصة أ/ إسماعيل عماد",
        subscriptionsEnabled: true,
        prayerEnabled: true,
        aiEnabled: true,
        passingPercent: 50
      }
    });
  }
  return ok({
    settings: {
      academicYear: safeText(d.academicYear),
      platformName: safeText(d.platformName),
      subscriptionsEnabled: d.subscriptionsEnabled !== false,
      prayerEnabled: d.prayerEnabled !== false,
      aiEnabled: d.aiEnabled !== false,
      passingPercent: Math.min(Math.max(parseInt(d.passingPercent || "50", 10) || 50, 1), 100)
    }
  });
});

/* ---------------- إعدادات بنك مستر إسماعيل (الضريبة الاختيارية) ----------------
   settings/bank: { taxEnabled, taxRate } — معطلة افتراضيًا. الكتابة للأدمن فقط (قواعد Firestore). */

const BANK_MAX_TAX = 50;

route("GET", "/api/admin/bank/settings", async () => {
  requireAdmin();
  const d = await getDocData("settings", "bank");
  const rate = d ? Number(d.taxRate) : 0;
  return ok({
    settings: {
      taxEnabled: !!d && d.taxEnabled === true,
      taxRate: Number.isFinite(rate) && rate >= 0 && rate <= BANK_MAX_TAX ? rate : 0,
      maxTaxRate: BANK_MAX_TAX
    }
  });
});

route("PATCH", "/api/admin/bank/settings", async ({ body }) => {
  const admin = requireAdmin();
  if (typeof body.taxEnabled !== "boolean") bad("BAD_REQUEST", "حالة الضريبة غير صحيحة.");
  const raw = body.taxRate;
  const rate = typeof raw === "number" ? raw
    : (typeof raw === "string" && /^\d{1,3}(\.\d{1,2})?$/.test(raw.trim()) ? Number(raw) : NaN);
  const twoDecimals = Number.isFinite(rate) && Math.abs(rate * 100 - Math.round(rate * 100)) < 1e-9;
  if (!twoDecimals || rate < 0 || rate > BANK_MAX_TAX) {
    bad("BAD_REQUEST", `نسبة الضريبة يجب أن تكون رقمًا من 0 إلى ${BANK_MAX_TAX} (بحد أقصى خانتين عشريتين).`);
  }
  if (body.taxEnabled && rate <= 0) bad("BAD_REQUEST", "حدّد نسبة أكبر من صفر لتفعيل الضريبة.");
  await fs.setDoc(ref("settings", "bank"), {
    taxEnabled: body.taxEnabled,
    taxRate: rate,
    updatedAt: fs.serverTimestamp(),
    updatedBy: admin.id
  }, { merge: true });
  return ok({ updated: true });
});

route("PATCH", "/api/admin/settings", async ({ body }) => {
  requireAdmin();
  const update = { updatedAt: fs.serverTimestamp() };
  if (typeof body.academicYear === "string" || body.academicYear === null) {
    update.academicYear = safeText(body.academicYear) || "";
  }
  if (typeof body.platformName === "string") update.platformName = safeText(body.platformName);
  if (typeof body.subscriptionsEnabled === "boolean") update.subscriptionsEnabled = body.subscriptionsEnabled;
  if (typeof body.prayerEnabled === "boolean") update.prayerEnabled = body.prayerEnabled;
  if (typeof body.aiEnabled === "boolean") update.aiEnabled = body.aiEnabled;
  if (body.passingPercent !== undefined) {
    const value = Number(body.passingPercent);
    if (!Number.isInteger(value) || value < 1 || value > 100) bad("BAD_REQUEST", "نسبة النجاح يجب أن تكون بين 1 و100.");
    update.passingPercent = value;
  }

  await fs.setDoc(ref("settings", "general"), update, { merge: true });
  // المفتاح العام للمساعد يبقى متزامنًا مع settings/ai.enabled
  if (typeof body.aiEnabled === "boolean") {
    await fs.setDoc(ref("settings", "ai"), { enabled: body.aiEnabled }, { merge: true });
  }
  return ok({ updated: true });
});

/* ---------------- إدارة مزودي الذكاء الاصطناعي ---------------- */

/** نسخة آمنة للواجهة: لا تحوي المفتاح، فقط hasApiKey وآخر 4 أحرف */
function publicAiSettings(cfg, general) {
  const providers = {};
  for (const id of AI_PROVIDER_IDS) {
    const p = cfg.providers[id];
    providers[id] = {
      label: AI_PROVIDERS[id].label,
      enabled: p.enabled,
      hasApiKey: !!p.apiKey,
      keyHint: p.apiKey.length >= 12 ? p.apiKey.slice(-4) : "",
      model: p.model,
      maxOutputTokens: p.maxOutputTokens,
      temperature: p.temperature
    };
  }
  return {
    enabled: cfg.enabled && !(general && general.aiEnabled === false),
    defaultProvider: cfg.defaultProvider,
    dailyLimit: cfg.dailyLimit,
    providers
  };
}

async function loadAiSettingsForAdmin() {
  const [raw, general] = await Promise.all([getDocData("settings", "ai"), getDocData("settings", "general")]);
  return { raw, general, cfg: normalizeAiConfig(raw) };
}

route("GET", "/api/admin/ai-settings", async () => {
  requireAdmin();
  const { cfg, general } = await loadAiSettingsForAdmin();
  return ok({ settings: publicAiSettings(cfg, general) });
});

route("PATCH", "/api/admin/ai-settings", async ({ body }) => {
  const admin = requireAdmin();
  const { raw, general, cfg } = await loadAiSettingsForAdmin();
  const update = { updatedAt: fs.serverTimestamp(), updatedBy: admin.id };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") bad("BAD_REQUEST", "قيمة التفعيل غير صحيحة.");
    update.enabled = body.enabled;
  }
  if (body.defaultProvider !== undefined) {
    const id = safeText(body.defaultProvider).toLowerCase();
    if (!AI_PROVIDERS[id]) bad("BAD_REQUEST", "المزود الافتراضي غير مدعوم.");
    update.defaultProvider = id;
  }
  if (body.dailyLimit !== undefined) {
    const n = Number(body.dailyLimit);
    if (!Number.isInteger(n) || n < 1 || n > 500) bad("BAD_REQUEST", "الحد اليومي يجب أن يكون بين 1 و500.");
    update.dailyLimit = n;
  }

  const patch = body.providers;
  if (patch !== undefined && (!patch || typeof patch !== "object" || Array.isArray(patch))) {
    bad("BAD_REQUEST", "إعدادات المزودين غير صحيحة.");
  }
  // أول حفظ على مستند قديم: نكتب البنية الجديدة كاملة (مع مفتاح المزود القديم) ثم نحذف الحقول القديمة
  const migrating = !cfg.migrated && !!raw;
  const providersUpdate = {};
  if (migrating) {
    for (const id of AI_PROVIDER_IDS) providersUpdate[id] = { ...cfg.providers[id] };
    update.defaultProvider = update.defaultProvider || cfg.defaultProvider;
    update.dailyLimit = update.dailyLimit !== undefined ? update.dailyLimit : cfg.dailyLimit;
    for (const k of ["provider", "model", "apiKey", "maxOutputTokens"]) update[k] = fs.deleteField();
  }

  for (const id of Object.keys(patch || {})) {
    if (!AI_PROVIDERS[id]) bad("BAD_REQUEST", `مزود غير مدعوم: ${safeText(id).slice(0, 30)}`);
    const p = patch[id];
    if (!p || typeof p !== "object" || Array.isArray(p)) bad("BAD_REQUEST", "إعدادات المزود غير صحيحة.");
    const out = providersUpdate[id] || (providersUpdate[id] = {});

    if (p.enabled !== undefined) {
      if (typeof p.enabled !== "boolean") bad("BAD_REQUEST", "قيمة تفعيل المزود غير صحيحة.");
      out.enabled = p.enabled;
    }
    if (p.deleteApiKey !== undefined && p.deleteApiKey !== true) bad("BAD_REQUEST", "أمر حذف المفتاح غير صحيح.");
    if (p.deleteApiKey === true && p.apiKey) bad("BAD_REQUEST", "لا يمكن حذف المفتاح وتعيينه في نفس الطلب.");
    if (p.deleteApiKey === true) out.apiKey = "";
    // مفتاح فارغ/غير مرسل = الإبقاء على المفتاح الحالي
    if (typeof p.apiKey === "string" && p.apiKey.trim()) {
      const key = p.apiKey.trim();
      if (key.length < 10 || key.length > 512 || /\s/.test(key)) bad("BAD_REQUEST", "صيغة مفتاح API غير صحيحة.");
      out.apiKey = key;
    }
    if (p.model !== undefined) {
      const model = safeText(p.model);
      if (!model || model.length > 100 || !/^[A-Za-z0-9._:\/-]+$/.test(model)) bad("BAD_REQUEST", "اسم النموذج غير صحيح.");
      out.model = model;
    }
    if (p.maxOutputTokens !== undefined) {
      const n = Number(p.maxOutputTokens);
      if (!Number.isInteger(n) || n < 50 || n > 2000) bad("BAD_REQUEST", "عدد Tokens يجب أن يكون بين 50 و2000.");
      out.maxOutputTokens = n;
    }
    if (p.temperature !== undefined) {
      const n = Number(p.temperature);
      if (p.temperature === "" || p.temperature === null || !Number.isFinite(n) || n < 0 || n > 2) bad("BAD_REQUEST", "Temperature يجب أن تكون بين 0 و2.");
      out.temperature = n;
    }
  }
  if (Object.keys(providersUpdate).length) update.providers = providersUpdate;

  // تحديث جزئي (merge) — لا يستبدل المستند ولا يمس المفاتيح غير المذكورة
  await fs.setDoc(ref("settings", "ai"), update, { merge: true });
  if (typeof update.enabled === "boolean") {
    await fs.setDoc(ref("settings", "general"), { aiEnabled: update.enabled, updatedAt: fs.serverTimestamp() }, { merge: true });
  }

  const fresh = await loadAiSettingsForAdmin();
  return ok({ settings: publicAiSettings(fresh.cfg, fresh.general) });
});

route("POST", "/api/admin/ai-settings/test", async ({ body }) => {
  requireAdmin();
  const id = safeText(body.provider).toLowerCase();
  if (!AI_PROVIDERS[id]) bad("BAD_REQUEST", "المزود غير مدعوم.");
  const { cfg } = await loadAiSettingsForAdmin();
  const conf = cfg.providers[id];

  const notReady = providerReadiness(conf);
  if (notReady) return ok({ result: { ok: false, kind: "not_ready", message: notReady, latencyMs: 0 } });

  // طلب قصير جدًا. لا يمس aiUsage ولا المزود الافتراضي.
  const t0 = Date.now();
  try {
    const out = await callProvider(id, {
      ...conf, maxOutputTokens: 16, temperature: 0,
      messages: [{ role: "user", content: "ping" }]
    }, 20000);
    return ok({ result: { ok: true, kind: "ok", message: "اتصال ناجح.", latencyMs: out.latencyMs, model: conf.model } });
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : "network";
    const message = e instanceof ProviderError ? e.message : "تعذّر إتمام الاختبار.";
    return ok({ result: { ok: false, kind, message, latencyMs: Date.now() - t0, model: conf.model } });
  }
});

/* ---------------- مجموعات الدروس ---------------- */

route("GET", "/api/admin/lesson-groups", async () => {
  requireAdmin();
  const rows = await listAll("lessonGroups");
  const groups = rows.map((d) => ({
    id: d.id,
    name: safeText(d.name),
    stage: safeText(d.stage),
    active: d.active !== false,
    createdAt: d.createdAt || null
  }));
  groups.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  return ok(toPlain({ groups }));
});

route("POST", "/api/admin/lesson-groups", async ({ body }) => {
  requireAdmin();
  const name = safeText(body.name);
  const stage = safeText(body.stage);
  const active = body.active !== false;

  if (!name || name.length > 80) bad("BAD_REQUEST", "اسم المجموعة غير صالح.");
  if (!isValidStage(stage)) bad("BAD_REQUEST", "المرحلة غير صحيحة.");

  const created = await fs.addDoc(col("lessonGroups"), {
    name, stage, active, createdAt: fs.serverTimestamp()
  });
  return ok({
    group: { id: created.id, name, stage, active, createdAt: new Date().toISOString() }
  });
});

route("PATCH", "/api/admin/lesson-groups/:id", async ({ params, body }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("lessonGroups", id))) bad("NOT_FOUND", "المجموعة غير موجودة.");

  const update = {};
  if (typeof body.name === "string") update.name = safeText(body.name);
  if (typeof body.stage === "string" && isValidStage(body.stage)) update.stage = body.stage;
  if (typeof body.active === "boolean") update.active = body.active;
  update.updatedAt = fs.serverTimestamp();

  await fs.updateDoc(ref("lessonGroups", id), update);
  return ok({ updated: true });
});

route("DELETE", "/api/admin/lesson-groups/:id", async ({ params }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("lessonGroups", id))) bad("NOT_FOUND", "المجموعة غير موجودة.");
  await fs.deleteDoc(ref("lessonGroups", id));
  return ok({ deleted: true });
});

/* ---------------- المناهج (Learning Collections) + الوحدات ---------------- */

const collOut = (d) => ({
  id: d.id,
  name: safeText(d.name),
  description: safeText(d.description),
  stage: safeText(d.stage),
  coverUrl: safeText(d.coverUrl),
  color: GROUP_COLORS.includes(safeText(d.color)) ? safeText(d.color) : "indigo",
  order: Number.isFinite(Number(d.order)) ? Number(d.order) : 0,
  active: d.active !== false,
  createdAt: d.createdAt || null
});

const unitOut = (d) => ({
  id: d.id,
  collectionId: safeText(d.collectionId),
  stage: safeText(d.stage),
  name: safeText(d.name),
  description: safeText(d.description),
  order: Number.isFinite(Number(d.order)) ? Number(d.order) : 0,
  active: d.active !== false,
  createdAt: d.createdAt || null
});

/** غلاف اختياري: رابط https فقط (أو فارغ) */
function cleanCover(v) {
  const s = safeText(v);
  if (!s) return "";
  if (s.length > 1000 || !/^https:\/\//i.test(s)) bad("BAD_REQUEST", "رابط الغلاف يجب أن يبدأ بـ https://");
  return s;
}

route("GET", "/api/admin/lesson-collections", async () => {
  requireAdmin();
  const [rows, units, lessons] = await Promise.all([listAll("lessonCollections"), listAll("lessonUnits"), listAll("lessons")]);
  const groups = rows.map((d) => {
    const g = collOut(d);
    g.unitCount = units.filter((u) => safeText(u.collectionId) === d.id).length;
    g.lessonCount = lessons.filter((l) => safeText(l.collectionId) === d.id).length;
    return g;
  });
  groups.sort((a, b) => (a.order - b.order) || (tsToMs(b.createdAt) - tsToMs(a.createdAt)));
  return ok(toPlain({ groups }));
});

route("POST", "/api/admin/lesson-collections", async ({ body }) => {
  requireAdmin();
  const name = safeText(body.name);
  const stage = safeText(body.stage);
  const description = safeText(body.description);
  const active = body.active !== false;
  const color = GROUP_COLORS.includes(safeText(body.color)) ? safeText(body.color) : "indigo";

  if (!name || name.length > 80) bad("BAD_REQUEST", "اسم المجموعة غير صالح.");
  if (description.length > 600) bad("BAD_REQUEST", "الوصف طويل جدًا.");
  if (!isValidStage(stage)) bad("BAD_REQUEST", "المرحلة غير صحيحة.");
  const coverUrl = cleanCover(body.coverUrl);

  let order;
  if (body.order !== undefined && body.order !== "") order = toOrder(body.order);
  else {
    const same = await queryDocs("lessonCollections", fs.where("stage", "==", stage));
    order = same.reduce((m, g) => Math.max(m, Number(g.order) || 0), 0) + 1;
  }

  const doc = { name, description, stage, coverUrl, color, order, active, createdAt: fs.serverTimestamp() };
  const created = await fs.addDoc(col("lessonCollections"), doc);
  return ok({ group: collOut({ ...doc, id: created.id, createdAt: new Date().toISOString() }) });
});

route("POST", "/api/admin/lesson-collections/reorder", async ({ body }) => {
  requireAdmin();
  const ids = Array.isArray(body.ids) ? body.ids.map(safeText).filter(Boolean) : [];
  if (!ids.length || ids.length > 200 || new Set(ids).size !== ids.length) bad("BAD_REQUEST", "قائمة الترتيب غير صالحة.");
  const found = await getDocsByIds("lessonCollections", ids);
  if (ids.some((i) => !found[i])) bad("NOT_FOUND", "بعض المجموعات غير موجودة.");
  const batch = fs.writeBatch(db);
  ids.forEach((i, n) => batch.update(ref("lessonCollections", i), { order: n + 1, updatedAt: fs.serverTimestamp() }));
  await batch.commit();
  return ok({ reordered: ids.length });
});

route("PATCH", "/api/admin/lesson-collections/:id", async ({ params, body }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  const old = await getDocData("lessonCollections", id);
  if (!old) bad("NOT_FOUND", "المجموعة غير موجودة.");

  const update = {};
  if (typeof body.name === "string") {
    const n = safeText(body.name);
    if (!n || n.length > 80) bad("BAD_REQUEST", "اسم المجموعة غير صالح.");
    update.name = n;
  }
  if (typeof body.description === "string") {
    const d = safeText(body.description);
    if (d.length > 600) bad("BAD_REQUEST", "الوصف طويل جدًا.");
    update.description = d;
  }
  if (typeof body.coverUrl === "string") update.coverUrl = cleanCover(body.coverUrl);
  if (typeof body.color === "string" && GROUP_COLORS.includes(body.color)) update.color = body.color;
  if (body.order !== undefined && body.order !== "") update.order = toOrder(body.order);
  if (typeof body.active === "boolean") update.active = body.active;

  /* تغيير المرحلة يجب ألا يترك دروسًا/وحدات بمرحلة مختلفة عن مجموعتها */
  if (typeof body.stage === "string" && isValidStage(body.stage) && body.stage !== safeText(old.stage)) {
    update.stage = body.stage;
    const [lessons, units] = await Promise.all([
      queryDocs("lessons", fs.where("collectionId", "==", id)),
      queryDocs("lessonUnits", fs.where("collectionId", "==", id))
    ]);
    const writes = [...lessons.map((l) => ref("lessons", l.id)), ...units.map((u) => ref("lessonUnits", u.id))];
    for (let i = 0; i < writes.length; i += 400) {
      const batch = fs.writeBatch(db);
      writes.slice(i, i + 400).forEach((r) => batch.update(r, { stage: body.stage }));
      await batch.commit();
    }
  }
  update.updatedAt = fs.serverTimestamp();

  await fs.updateDoc(ref("lessonCollections", id), update);
  return ok({ updated: true });
});

/* حذف المجموعة: تُحذف وحداتها (تنظيم فقط)، أما الدروس فلا تُحذف أبدًا:
   تُفصل عن المجموعة وتصير "غير مصنفة" (تظهر للطالب ضمن "دروس عامة" إن كانت منشورة).
   طلبات الاشتراك تحتفظ باسم المجموعة (lessonGroupName) فلا تتأثر. */
route("DELETE", "/api/admin/lesson-collections/:id", async ({ params }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("lessonCollections", id))) bad("NOT_FOUND", "المجموعة غير موجودة.");

  const [lessons, units] = await Promise.all([
    queryDocs("lessons", fs.where("collectionId", "==", id)),
    queryDocs("lessonUnits", fs.where("collectionId", "==", id))
  ]);
  for (let i = 0; i < lessons.length; i += 400) {
    const batch = fs.writeBatch(db);
    lessons.slice(i, i + 400).forEach((l) => batch.update(ref("lessons", l.id), { collectionId: null, unitId: null, updatedAt: fs.serverTimestamp() }));
    await batch.commit();
  }
  await deleteMany("lessonUnits", units.map((u) => u.id));
  await fs.deleteDoc(ref("lessonCollections", id));
  return ok({ deleted: true, detachedLessons: lessons.length, deletedUnits: units.length });
});

/* ---------------- الوحدات ---------------- */

route("GET", "/api/admin/lesson-units", async ({ query }) => {
  requireAdmin();
  const gid = safeText(query.collectionId);
  const rows = gid ? await queryDocs("lessonUnits", fs.where("collectionId", "==", gid)) : await listAll("lessonUnits");
  const units = rows.map(unitOut);
  units.sort((a, b) => (a.order - b.order) || (tsToMs(a.createdAt) - tsToMs(b.createdAt)));
  return ok(toPlain({ units }));
});

route("POST", "/api/admin/lesson-units", async ({ body }) => {
  requireAdmin();
  const collectionId = safeText(body.collectionId);
  const name = safeText(body.name);
  const description = safeText(body.description);
  if (!name || name.length > 80) bad("BAD_REQUEST", "اسم الوحدة غير صالح.");
  if (description.length > 600) bad("BAD_REQUEST", "الوصف طويل جدًا.");
  const group = collectionId ? await getDocData("lessonCollections", collectionId) : null;
  if (!group) bad("NOT_FOUND", "المجموعة غير موجودة.");

  let order;
  if (body.order !== undefined && body.order !== "") order = toOrder(body.order);
  else {
    const sibs = await queryDocs("lessonUnits", fs.where("collectionId", "==", collectionId));
    order = sibs.reduce((m, u) => Math.max(m, Number(u.order) || 0), 0) + 1;
  }
  const doc = {
    collectionId, stage: safeText(group.stage), name, description, order,
    active: body.active !== false, createdAt: fs.serverTimestamp()
  };
  const created = await fs.addDoc(col("lessonUnits"), doc);
  return ok({ unit: unitOut({ ...doc, id: created.id, createdAt: new Date().toISOString() }) });
});

route("POST", "/api/admin/lesson-units/reorder", async ({ body }) => {
  requireAdmin();
  const collectionId = safeText(body.collectionId);
  const ids = Array.isArray(body.ids) ? body.ids.map(safeText).filter(Boolean) : [];
  if (!ids.length || ids.length > 200 || new Set(ids).size !== ids.length) bad("BAD_REQUEST", "قائمة الترتيب غير صالحة.");
  const found = await getDocsByIds("lessonUnits", ids);
  if (ids.some((i) => !found[i])) bad("NOT_FOUND", "بعض الوحدات غير موجودة.");
  if (collectionId && ids.some((i) => safeText(found[i].collectionId) !== collectionId)) bad("BAD_REQUEST", "الوحدات لا تتبع المجموعة نفسها.");
  const batch = fs.writeBatch(db);
  ids.forEach((i, n) => batch.update(ref("lessonUnits", i), { order: n + 1, updatedAt: fs.serverTimestamp() }));
  await batch.commit();
  return ok({ reordered: ids.length });
});

route("PATCH", "/api/admin/lesson-units/:id", async ({ params, body }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("lessonUnits", id))) bad("NOT_FOUND", "الوحدة غير موجودة.");
  const update = {};
  if (typeof body.name === "string") {
    const n = safeText(body.name);
    if (!n || n.length > 80) bad("BAD_REQUEST", "اسم الوحدة غير صالح.");
    update.name = n;
  }
  if (typeof body.description === "string") {
    const d = safeText(body.description);
    if (d.length > 600) bad("BAD_REQUEST", "الوصف طويل جدًا.");
    update.description = d;
  }
  if (body.order !== undefined && body.order !== "") update.order = toOrder(body.order);
  if (typeof body.active === "boolean") update.active = body.active;
  update.updatedAt = fs.serverTimestamp();
  await fs.updateDoc(ref("lessonUnits", id), update);
  return ok({ updated: true });
});

/* حذف الوحدة: دروسها لا تُحذف، تنتقل للمجموعة مباشرة (unitId = null) */
route("DELETE", "/api/admin/lesson-units/:id", async ({ params }) => {
  requireAdmin();
  const id = safeText(params.id);
  if (!id) bad("BAD_REQUEST", "المعرّف مطلوب.");
  if (!(await getDocData("lessonUnits", id))) bad("NOT_FOUND", "الوحدة غير موجودة.");
  const lessons = await queryDocs("lessons", fs.where("unitId", "==", id));
  for (let i = 0; i < lessons.length; i += 400) {
    const batch = fs.writeBatch(db);
    lessons.slice(i, i + 400).forEach((l) => batch.update(ref("lessons", l.id), { unitId: null, updatedAt: fs.serverTimestamp() }));
    await batch.commit();
  }
  await fs.deleteDoc(ref("lessonUnits", id));
  return ok({ deleted: true, movedLessons: lessons.length });
});
