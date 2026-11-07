/* ============================================================
   js/backend/content.js — الدروس والإعلانات والملف الشخصي (جهة الطالب)
   + مجموعات الدروس وطلبات الاشتراك (عامة)
   ============================================================ */

import {
  fs, route, ok, bad, safeText, isValidStage, isYouTubeUrl, isLessonUrl, storedLessonKind, GROUP_COLORS, tsToMs, toPlain,
  requireStudent, loadStudent, getDocData, queryDocs, ref, col
} from "./core.js";

/* ---------------- الدروس (فيديو فقط) ---------------- */

/* دروس الصوت والملازم القديمة تبقى في Firestore كما هي لكنها لا تُعرض للطالب */
const isVideoLesson = (l) => storedLessonKind(l) === "video";
const lessonUrl = (l) => safeText(l.url) || safeText(l.youtubeUrl);
const orderOf = (x) => (Number.isFinite(Number(x.order)) ? Number(x.order) : 0);
const byOrder = (a, b) => (orderOf(a) - orderOf(b)) || (tsToMs(a.createdAt) - tsToMs(b.createdAt));

/** الدروس غير المربوطة بمجموعة (قديمة) تُعرض ضمن مجموعة افتراضية */
export const GENERAL_GROUP_ID = "__general";

const lessonRow = (l) => ({
  id: l.id,
  title: safeText(l.title),
  description: safeText(l.description),
  kind: "video",
  url: lessonUrl(l),
  youtubeUrl: lessonUrl(l),
  stage: l.stage,
  lessonGroupId: safeText(l.lessonGroupId) || null,
  unitId: safeText(l.unitId) || null,
  order: orderOf(l),
  createdAt: l.createdAt || null
});

route("GET", "/api/lessons", async () => {
  const me = requireStudent();
  const student = await loadStudent(me);
  const stage = safeText(student.stage);
  if (!isValidStage(stage)) return ok({ lessons: [] });

  const [rows, groups] = await Promise.all([
    queryDocs("lessons", fs.where("stage", "==", stage)),
    queryDocs("lessonGroups", fs.where("stage", "==", stage), fs.where("active", "==", true))
  ]);
  const liveGroups = new Set(groups.map((g) => g.id));
  const lessons = rows
    .filter((l) => l && l.id && lessonUrl(l) && isVideoLesson(l) && l.active !== false)
    .filter((l) => !safeText(l.lessonGroupId) || liveGroups.has(safeText(l.lessonGroupId)))
    .map(lessonRow);
  lessons.sort(byOrder);
  return ok(toPlain({ lessons }));
});

/* كتالوج الطالب: المجموعات المنشورة لمرحلته + وحداتها + دروسها + تقدّمه */
route("GET", "/api/lesson-catalog", async () => {
  const me = requireStudent();
  const student = await loadStudent(me);
  const stage = safeText(student.stage);
  if (!isValidStage(stage)) return ok({ groups: [] });

  const [groupRows, unitRows, lessonRows, progress] = await Promise.all([
    queryDocs("lessonGroups", fs.where("stage", "==", stage), fs.where("active", "==", true)),
    queryDocs("lessonUnits", fs.where("stage", "==", stage), fs.where("active", "==", true)),
    queryDocs("lessons", fs.where("stage", "==", stage)),
    queryDocs("lessonProgress", fs.where("studentId", "==", me.id))
  ]);
  const done = new Set(progress.filter((p) => p.completed === true).map((p) => safeText(p.lessonId)));
  const liveUnits = new Map(unitRows.map((u) => [u.id, u]));
  const liveGroupIds = new Set(groupRows.map((g) => g.id));

  const visible = lessonRows
    .filter((l) => l && l.id && lessonUrl(l) && isVideoLesson(l) && l.active !== false)
    .map((l) => ({ ...lessonRow(l), done: done.has(l.id) }));

  const build = (id, name, description, coverUrl, color, order, units, lessonsOf) => {
    const direct = lessonsOf.filter((l) => !l.unitId).sort(byOrder);
    const unitList = units
      .map((u) => {
        const ls = lessonsOf.filter((l) => l.unitId === u.id).sort(byOrder);
        return {
          id: u.id, name: safeText(u.name), description: safeText(u.description), order: orderOf(u),
          lessonCount: ls.length, doneCount: ls.filter((l) => l.done).length, lessons: ls
        };
      })
      .sort(byOrder);
    const all = lessonsOf.filter((l) => !l.unitId || units.some((u) => u.id === l.unitId));
    return {
      id, name, description, coverUrl, color, order, stage,
      unitCount: unitList.length,
      lessonCount: all.length,
      doneCount: all.filter((l) => l.done).length,
      units: unitList,
      lessons: direct
    };
  };

  const groups = groupRows.map((g) => {
    const units = [...liveUnits.values()].filter((u) => safeText(u.lessonGroupId) === g.id);
    const lessonsOf = visible.filter((l) => l.lessonGroupId === g.id &&
      (!l.unitId || (liveUnits.has(l.unitId) && safeText(liveUnits.get(l.unitId).lessonGroupId) === g.id)));
    return build(
      g.id, safeText(g.name), safeText(g.description), safeText(g.coverUrl),
      GROUP_COLORS.includes(safeText(g.color)) ? safeText(g.color) : "indigo",
      orderOf(g), units, lessonsOf
    );
  }).sort(byOrder);

  /* دروس قديمة بلا مجموعة (أو مجموعتها حُذفت) */
  const loose = visible.filter((l) => !l.lessonGroupId || !liveGroupIds.has(l.lessonGroupId))
    .filter((l) => !l.lessonGroupId); /* مجموعة موجودة وغير منشورة = مخفية */
  if (loose.length) {
    groups.push(build(GENERAL_GROUP_ID, "دروس عامة", "فيديوهات غير مصنفة في منهج محدد.", "", "slate", 100000,
      [], loose.map((l) => ({ ...l, unitId: null }))));
  }
  return ok(toPlain({ groups: groups.filter((g) => g.lessonCount > 0 || g.id !== GENERAL_GROUP_ID) }));
});

route("POST", "/api/lessons/:id/open", async ({ params }) => {
  const me = requireStudent();
  const lessonId = safeText(params.id);
  if (!lessonId) bad("BAD_REQUEST", "معرّف الدرس مطلوب.");

  const student = await loadStudent(me);
  const stage = safeText(student.stage);

  const lesson = await getDocData("lessons", lessonId);
  if (!lesson) bad("NOT_FOUND", "الدرس غير موجود.");
  if (safeText(lesson.stage) !== stage || !isVideoLesson(lesson) || lesson.active === false
      || !isLessonUrl("video", lessonUrl(lesson))) {
    bad("FORBIDDEN", "غير مسموح بهذا الدرس.");
  }
  const gid = safeText(lesson.lessonGroupId);
  if (gid) {
    const group = await getDocData("lessonGroups", gid);
    if (!group || group.active === false || safeText(group.stage) !== stage) bad("FORBIDDEN", "غير مسموح بهذا الدرس.");
    const uid = safeText(lesson.unitId);
    if (uid) {
      const unit = await getDocData("lessonUnits", uid);
      if (!unit || unit.active === false || safeText(unit.lessonGroupId) !== gid) bad("FORBIDDEN", "غير مسموح بهذا الدرس.");
    }
  }

  await fs.setDoc(ref("lessonProgress", `${me.id}_${lessonId}`), {
    studentId: me.id,
    lessonId,
    stage,
    title: safeText(lesson.title),
    lastOpenedAt: fs.serverTimestamp(),
    completed: true,
    completedAt: fs.serverTimestamp()
  }, { merge: true });

  return ok({ opened: true, completed: true, lessonId });
});

/* ---------------- الإعلانات ---------------- */

async function fetchVisibleAnnouncements(me, stage) {
  const [all, byStage, byStudent] = await Promise.all([
    queryDocs("announcements", fs.where("targetType", "==", "all")),
    stage
      ? queryDocs("announcements", fs.where("targetType", "==", "stage"), fs.where("targetValue", "==", stage))
      : Promise.resolve([]),
    queryDocs("announcements", fs.where("targetType", "==", "student"), fs.where("targetValue", "==", me.id))
  ]);
  const seen = new Set();
  const out = [];
  [...all, ...byStage, ...byStudent].forEach((a) => {
    if (!seen.has(a.id)) { seen.add(a.id); out.push(a); }
  });
  out.sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
  return out;
}

async function readIdsFor(me) {
  const reads = await queryDocs("announcementReads", fs.where("studentId", "==", me.id));
  return new Set(reads.map((r) => safeText(r.announcementId)));
}

route("GET", "/api/announcements", async () => {
  const me = requireStudent();
  const student = await loadStudent(me);
  const stage = safeText(student.stage);

  const [items, readIds] = await Promise.all([
    fetchVisibleAnnouncements(me, stage),
    readIdsFor(me)
  ]);

  const announcements = items.map((a) => ({
    id: a.id,
    title: safeText(a.title),
    body: safeText(a.body),
    type: safeText(a.type) || "text",
    targetType: safeText(a.targetType) || "all",
    targetValue: a.targetValue || null,
    linkTarget: a.linkTarget || null,
    createdAt: a.createdAt || null,
    isRead: readIds.has(a.id)
  }));

  return ok(toPlain({ announcements }));
});

route("GET", "/api/announcements/unread-count", async () => {
  const me = requireStudent();
  const student = await loadStudent(me);
  const stage = safeText(student.stage);

  const [items, readIds] = await Promise.all([
    fetchVisibleAnnouncements(me, stage),
    readIdsFor(me)
  ]);

  let count = 0;
  items.forEach((a) => { if (!readIds.has(a.id)) count += 1; });
  return ok({ count });
});

function canSeeAnnouncement(ann, me, stage) {
  const targetType = safeText(ann.targetType) || "all";
  if (targetType === "all") return true;
  if (targetType === "stage") return !!stage && safeText(ann.targetValue) === stage;
  if (targetType === "student") return safeText(ann.targetValue) === me.id;
  return false;
}

route("POST", "/api/announcements/:id/read", async ({ params }) => {
  const me = requireStudent();
  const announcementId = safeText(params.id);
  if (!announcementId) bad("BAD_REQUEST", "معرّف الإعلان مطلوب.");

  const ann = await getDocData("announcements", announcementId);
  if (!ann) bad("NOT_FOUND", "الإعلان غير موجود.");

  const student = await loadStudent(me);
  if (!canSeeAnnouncement(ann, me, safeText(student.stage))) {
    bad("FORBIDDEN", "غير مسموح بهذا الإعلان.");
  }

  await fs.setDoc(ref("announcementReads", `${me.id}_${announcementId}`), {
    studentId: me.id,
    announcementId,
    readAt: fs.serverTimestamp()
  }, { merge: true });

  return ok({ read: true });
});

route("POST", "/api/announcements/reply", async ({ body }) => {
  const me = requireStudent();
  const announcementId = safeText(body.announcementId);
  const message = safeText(body.message);

  if (!announcementId) bad("BAD_REQUEST", "معرّف الإعلان مطلوب.");
  if (!message || message.length < 2 || message.length > 2000) {
    bad("BAD_REQUEST", "الرد غير صالح.");
  }

  const ann = await getDocData("announcements", announcementId);
  if (!ann) bad("NOT_FOUND", "الإعلان غير موجود.");

  const student = await loadStudent(me);
  if (!canSeeAnnouncement(ann, me, safeText(student.stage))) {
    bad("FORBIDDEN", "غير مسموح لك بالرد على هذا الإعلان.");
  }

  await fs.addDoc(col("announcementReplies"), {
    announcementId,
    studentId: me.id,
    studentName: safeText(student.fullName) || "طالب",
    message,
    createdAt: fs.serverTimestamp()
  });

  return ok({ created: true });
});

/* ---------------- الملف الشخصي ---------------- */

route("GET", "/api/student/profile", async () => {
  const me = requireStudent();
  const s = await loadStudent(me);

  const [attempts, progress] = await Promise.all([
    queryDocs("examAttempts", fs.where("studentId", "==", me.id)),
    queryDocs("lessonProgress", fs.where("studentId", "==", me.id))
  ]);

  let correctTotal = 0;
  let totalScore = 0;
  let totalQ = 0;
  attempts.forEach((a) => {
    correctTotal += Number(a.correctCount) || 0;
    totalScore += Number(a.score) || 0;
    totalQ += Number(a.total) || 0;
  });
  const averageScore = totalQ > 0 ? Math.round((totalScore / totalQ) * 100) : 0;
  const completedLessons = progress.filter((p) => p.completed === true).length;

  return ok(toPlain({
    student: {
      id: me.id,
      fullName: s.fullName || "",
      stage: s.stage || "",
      code: s.code || me.code || null,
      joinedAt: s.joinedAt || null,
      lastLogin: s.lastLogin || null,
      status: s.status || "active"
    },
    stats: {
      attemptsCount: attempts.length,
      correctAnswers: correctTotal,
      studyHoursTotal: Math.round((Number(s.studyHoursTotal) || 0) * 10) / 10,
      completedLessons,
      averageScore
    }
  }));
});

/* ---------------- مجموعات الدروس (عامة) ---------------- */

route("GET", "/api/lesson-groups", async ({ query }) => {
  const stage = safeText(query.stage);
  if (!isValidStage(stage)) return ok({ groups: [] });

  const rows = await queryDocs("lessonGroups", fs.where("stage", "==", stage), fs.where("active", "==", true));
  const groups = rows
    .filter((g) => g && g.id && g.active !== false)
    .sort((a, b) => (orderOf(a) - orderOf(b)) || (tsToMs(a.createdAt) - tsToMs(b.createdAt)))
    .map((g) => ({
      id: g.id, name: safeText(g.name), stage: g.stage,
      description: safeText(g.description), coverUrl: safeText(g.coverUrl),
      color: GROUP_COLORS.includes(safeText(g.color)) ? safeText(g.color) : "indigo",
      order: orderOf(g)
    }));

  return ok({ groups });
});

/* ---------------- طلبات الاشتراك (عامة) ---------------- */

route("POST", "/api/subscription-requests", async ({ body }) => {
  const stage = safeText(body.stage);
  const lessonGroupId = safeText(body.lessonGroupId);
  const info = body.studentInformation && typeof body.studentInformation === "object"
    ? body.studentInformation
    : {};
  const fullName = safeText(info.fullName);
  const phone = safeText(info.phone);

  if (!isValidStage(stage)) bad("BAD_REQUEST", "اختر المرحلة.");
  if (!lessonGroupId) bad("BAD_REQUEST", "اختر مجموعة الدرس.");
  if (!fullName || fullName.length < 3) bad("BAD_REQUEST", "الاسم غير صالح.");
  if (!phone || !/^[0-9+\-\s]{6,20}$/.test(phone)) bad("BAD_REQUEST", "رقم الهاتف غير صحيح.");

  const settings = await getDocData("settings", "general");
  const subscriptionsEnabled = settings ? settings.subscriptionsEnabled !== false : true;
  if (!subscriptionsEnabled) bad("SUBSCRIPTIONS_DISABLED", "الاشتراكات متوقفة حاليًا.");

  const group = await getDocData("lessonGroups", lessonGroupId);
  if (!group) bad("NOT_FOUND", "مجموعة الدرس غير موجودة.");
  if (group.stage !== stage || group.active === false) {
    bad("BAD_REQUEST", "مجموعة الدرس غير متاحة.");
  }

  const created = await fs.addDoc(col("subscriptionRequests"), {
    stage,
    lessonGroupId,
    lessonGroupName: safeText(group.name),
    fullName,
    phone,
    status: "pending",
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp()
  });

  return ok({ requestId: created.id, status: "pending" });
});
