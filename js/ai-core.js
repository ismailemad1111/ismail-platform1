/**
 * ai-core.js — نواة COSMIC INTELLIGENCE (العنصر البصري المركزي) + مدير الحالات
 * ------------------------------------------------------------
 * Canvas 2D واحد لكل نواة (بدون مكتبات ولا فيديو ولا WebGL):
 *   نواة مضيئة + حلقات مائلة تدور + جسيمات في مدارات + روابط عصبية + نبضة موجية.
 *
 * الحالات (مرتبطة بحالة المحادثة الفعلية من ai.js):
 *   idle        نبض هادئ
 *   focused     تفاعل مع التركيز على مربع الكتابة
 *   processing  معالجة نشطة (السؤال أُرسل وننتظر الرد)
 *   responding  وصلت الإجابة (نبضة + عودة تلقائية إلى idle)
 *   error       تغيّر لوني هادئ عند الفشل
 *
 * الأداء:
 *   - rAF فقط، ويتوقف عند إخفاء التبويب أو خروج الكانفس من الشاشة.
 *   - DPR ≤ 2 (≤ 1 للأجهزة الضعيفة)، وعدد جسيمات متكيّف مع الحجم والجهاز.
 *   - prefers-reduced-motion ⇒ إطار ثابت يُعاد رسمه عند تغيّر الحالة فقط.
 *   - بديل CSS ثابت خلف الكانفس (انظر cosmic.css) لو Canvas غير متاح.
 */

/* ============================================================
   01 — إعدادات الحالات
   ============================================================ */

const STATES = {
  idle:       { spin: 0.22, glow: 0.55, hz: 0.35, amp: 0.035, energy: 0.25, link: 0.25, hue: 0 },
  focused:    { spin: 0.50, glow: 0.80, hz: 0.60, amp: 0.050, energy: 0.50, link: 0.50, hue: 0 },
  processing: { spin: 2.10, glow: 1.00, hz: 1.50, amp: 0.090, energy: 1.00, link: 1.00, hue: 0.45 },
  responding: { spin: 0.90, glow: 0.90, hz: 0.80, amp: 0.060, energy: 0.70, link: 0.70, hue: 0.20 },
  error:      { spin: 0.08, glow: 0.35, hz: 0.20, amp: 0.020, energy: 0.10, link: 0.00, hue: -1 }
};

const LABELS = {
  idle: "متصل · جاهز لسؤالك",
  focused: "متصل · بانتظار سؤالك",
  processing: "يعالج سؤالك…",
  responding: "يعرض الإجابة",
  error: "تعذّر الاتصال"
};

const COL = {
  violet: [139, 92, 246],
  blue:   [59, 130, 246],
  rose:   [251, 113, 133],
  lav:    [201, 189, 255],
  white:  [244, 242, 255]
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

function isLowPower() {
  try {
    const n = navigator;
    return !!((n.connection && n.connection.saveData) || (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2));
  } catch (e) { return false; }
}


/* ============================================================
   02 — النواة
   ============================================================ */

class Core {
  constructor(canvas, mini) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.mini = mini;
    this.low = isLowPower();
    this.cur = { ...STATES.idle };
    this.tgt = STATES.idle;
    this.rot = Math.random() * 6;
    this.clock = 0;
    this.pulseAge = -1;
    this.visible = true;
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.parts = [];
    this.rings = mini
      ? [{ r: 0.92, t0: 0.9, rot: 0.3, sp: 1 }, { r: 0.62, t0: 2.1, rot: 1.9, sp: -1.4 }]
      : [{ r: 0.96, t0: 0.9, rot: 0.3, sp: 1 }, { r: 0.74, t0: 2.2, rot: 1.8, sp: -1.3 }, { r: 0.52, t0: 1.5, rot: 3.4, sp: 1.8 }];

    if (!this.ctx) { this.dead = true; return; }

    this.onResize = this.resize.bind(this);
    this.tick = this.tick.bind(this);
    try {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(canvas);
    } catch (e) { window.addEventListener("resize", this.onResize); }
    try {
      this.io = new IntersectionObserver((es) => { this.visible = es[es.length - 1].isIntersecting; this.sync(); });
      this.io.observe(canvas);
    } catch (e) { /* تجاهل */ }
    this.onVis = () => this.sync();
    document.addEventListener("visibilitychange", this.onVis);
    this.resize();
  }

  buildParticles() {
    const base = this.mini ? 9 : Math.round(Math.max(18, Math.min(52, this.w / 7)));
    const n = this.low ? Math.ceil(base * 0.45) : base;
    this.parts = [];
    for (let i = 0; i < n; i++) {
      this.parts.push({
        a: Math.random() * Math.PI * 2,
        sp: (0.25 + Math.random() * 0.9) * (Math.random() < 0.5 ? -1 : 1),
        inc: (Math.random() - 0.5) * 2.4,
        az: Math.random() * Math.PI * 2,
        r: 0.42 + Math.random() * 0.58,
        s: 0.7 + Math.random() * 1.1,
        ph: Math.random() * 6.28
      });
    }
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    this.dpr = Math.min(this.low ? 1 : 2, window.devicePixelRatio || 1);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.buildParticles();
    this.draw();
    this.sync();
  }

  setState(name) {
    this.tgt = STATES[name] || STATES.idle;
    if (reduceMotion()) { this.cur = { ...this.tgt }; this.draw(); }
    else this.sync();
  }

  pulse() {
    this.pulseAge = 0;
    if (reduceMotion()) this.draw(); else this.sync();
  }

  sync() {
    const want = !this.dead && this.visible && !document.hidden && !reduceMotion() && this.w > 0;
    if (want && !this.running) { this.running = true; this.last = 0; this.raf = requestAnimationFrame(this.tick); }
    else if (!want && this.running) { this.running = false; cancelAnimationFrame(this.raf); }
  }

  tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const minGap = (this.mini || this.low) ? 1000 / 30 : 1000 / 60 - 2;
    if (this.last && now - this.last < minGap) return;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.clock += dt;

    /* تقريب ناعم نحو حالة الهدف */
    const k = 1 - Math.exp(-dt * 3.2);
    for (const key in this.tgt) this.cur[key] += (this.tgt[key] - this.cur[key]) * k;
    this.rot += dt * this.cur.spin;
    if (this.pulseAge >= 0) { this.pulseAge += dt / 1.3; if (this.pulseAge > 1) this.pulseAge = -1; }
    this.draw();
  }

  color() {
    const h = this.cur.hue;
    return h >= 0 ? mix(COL.violet, COL.blue, Math.min(1, h)) : mix(COL.violet, COL.rose, Math.min(1, -h));
  }

  draw() {
    const { ctx, w, h, dpr, cur } = this;
    if (!ctx || !w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2;
    const main = this.color();
    const breath = Math.sin(this.clock * Math.PI * 2 * cur.hz) * cur.amp;
    const g = cur.glow;

    /* هالة محيطية */
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    halo.addColorStop(0, rgba(main, 0.34 * g));
    halo.addColorStop(0.45, rgba(main, 0.12 * g));
    halo.addColorStop(1, rgba(main, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    /* حلقات مائلة: النصف الخلفي أخفت من الأمامي (إحساس عمق) */
    ctx.lineWidth = this.mini ? 1 : 1.15;
    this.rings.forEach((rg, i) => {
      const tilt = rg.t0 + this.rot * 0.35 * rg.sp;
      const rx = R * rg.r * 0.97;
      const ry = Math.max(rx * 0.16, Math.abs(Math.cos(tilt)) * rx);
      const ang = rg.rot + this.rot * 0.28 * rg.sp;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, ang, Math.PI, Math.PI * 2);
      ctx.strokeStyle = rgba(mix(main, COL.blue, 0.25), 0.14 + 0.1 * g);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, ang, 0, Math.PI);
      ctx.strokeStyle = rgba(mix(main, COL.lav, 0.45), 0.34 + 0.34 * g);
      ctx.stroke();
      /* قمر صغير على الحلقة */
      const sa = this.rot * (1.1 + i * 0.4) * rg.sp + i * 2;
      const lx = Math.cos(sa) * rx, ly = Math.sin(sa) * ry;
      const ca = Math.cos(ang), sn = Math.sin(ang);
      const px = cx + lx * ca - ly * sn, py = cy + lx * sn + ly * ca;
      ctx.beginPath();
      ctx.arc(px, py, (this.mini ? 1.2 : 1.9) * (Math.sin(sa) > 0 ? 1.2 : 0.8), 0, 6.283);
      ctx.fillStyle = rgba(COL.white, Math.sin(sa) > 0 ? 0.95 : 0.4);
      ctx.fill();
    });

    /* جسيمات المدارات (إسقاط ثلاثي الأبعاد مبسّط) */
    const pts = [];
    const spinMul = 0.4 + cur.energy * 0.9;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const a = p.a + this.rot * p.sp * spinMul;
      let x = Math.cos(a) * p.r, y = Math.sin(a) * p.r, z = 0;
      const ci = Math.cos(p.inc), si = Math.sin(p.inc);
      const y1 = y * ci - z * si, z1 = y * si + z * ci;
      const cz = Math.cos(p.az), sz = Math.sin(p.az);
      const x2 = x * cz - y1 * sz, y2 = x * sz + y1 * cz;
      const persp = 1 / (1 - z1 * 0.32);
      pts.push({ x: cx + x2 * R * 0.9 * persp, y: cy + y2 * R * 0.9 * persp, z: z1, s: p.s, ph: p.ph });
    }

    /* روابط عصبية بين الجسيمات القريبة (تشتد مع المعالجة) */
    if (!this.mini && !this.low && cur.link > 0.04) {
      const maxD = R * 0.4;
      ctx.lineWidth = 0.8;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.hypot(dx, dy);
          if (d < maxD) {
            const a = (1 - d / maxD) * 0.42 * cur.link;
            ctx.strokeStyle = rgba(mix(main, COL.lav, 0.4), a);
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
          }
        }
      }
    }

    pts.forEach((p) => {
      const depth = (p.z + 1) / 2;
      const tw = 0.75 + 0.25 * Math.sin(this.clock * 2 + p.ph);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s * (this.mini ? 0.7 : 1) * (0.6 + depth * 0.8), 0, 6.283);
      ctx.fillStyle = rgba(mix(COL.lav, COL.white, depth), (0.25 + depth * 0.65) * tw * (0.5 + cur.energy * 0.5));
      ctx.fill();
    });

    /* النواة */
    const nr = R * 0.19 * (1 + breath);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr * 2.6);
    core.addColorStop(0, rgba(COL.white, 1));
    core.addColorStop(0.22, rgba(mix(COL.white, COL.lav, 0.5), 0.95));
    core.addColorStop(0.5, rgba(main, 0.55 + 0.25 * g));
    core.addColorStop(1, rgba(main, 0));
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, nr * 2.6, 0, 6.283); ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, nr * 0.55, 0, 6.283);
    ctx.fillStyle = rgba(COL.white, 0.96); ctx.fill();

    /* نبضة موجية */
    if (this.pulseAge >= 0) {
      const t = this.pulseAge;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (0.2 + t * 0.8), 0, 6.283);
      ctx.lineWidth = (this.mini ? 1.2 : 2) * (1 - t * 0.6);
      ctx.strokeStyle = rgba(mix(main, COL.white, 0.5), (1 - t) * 0.6);
      ctx.stroke();
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    try { if (this.ro) this.ro.disconnect(); else window.removeEventListener("resize", this.onResize); } catch (e) { /* تجاهل */ }
    try { if (this.io) this.io.disconnect(); } catch (e) { /* تجاهل */ }
    document.removeEventListener("visibilitychange", this.onVis);
  }
}


/* ============================================================
   03 — مدير الحالة (يربط النواة بحالة المحادثة)
   ============================================================ */

const cores = new Set();
let state = "idle";
let timer = 0;

function paintLabels(text) {
  const sub = document.getElementById("aiSubtitle");
  const chip = document.getElementById("ciStatusText");
  if (sub) sub.textContent = text;
  if (chip) chip.textContent = text;
}

/**
 * يغيّر حالة النواة والصفحة (data-state على .ci-page) ويحدّث نص الحالة.
 * responding ← تعود تلقائيًا إلى idle، و error ← كذلك بعد مهلة أطول.
 * @param {"idle"|"focused"|"processing"|"responding"|"error"} next
 * @param {{label?: string}} [opts]
 */
export function setCoreState(next, opts = {}) {
  if (!STATES[next]) next = "idle";
  clearTimeout(timer);
  state = next;
  const page = document.querySelector(".ci-page");
  if (page) page.setAttribute("data-state", next);
  cores.forEach((c) => c.setState(next));
  paintLabels(opts.label || LABELS[next]);
  if (next === "processing") cores.forEach((c) => c.pulse());
  if (next === "responding") {
    cores.forEach((c) => c.pulse());
    timer = setTimeout(() => setCoreState("idle", { label: "متصل · جاهز لسؤالك التالي" }), 1800);
  } else if (next === "error") {
    timer = setTimeout(() => setCoreState("idle"), 4500);
  }
}

export const getCoreState = () => state;

/** يركّب كل canvas[data-ci-core] في الصفحة. */
export function initCosmicCores() {
  document.querySelectorAll("canvas[data-ci-core]").forEach((cv) => {
    if (cv.dataset.ciReady) return;
    cv.dataset.ciReady = "1";
    try { cores.add(new Core(cv, cv.dataset.ciCore === "mini")); } catch (e) { /* يبقى البديل CSS */ }
  });
  setCoreState("idle", { label: "متصل · جاهز لسؤالك" });
}

window.addEventListener("pagehide", () => cores.forEach((c) => c.destroy()));
