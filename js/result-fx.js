/**
 * result-fx.js — مؤثرات نتيجة الاختبار (عرض فقط، بلا أي كتابة على Firestore).
 *  - scoreRing: حلقة SVG تُرسم وتعدّ حتى الدرجة
 *  - physicsConfetti: قصاصات Canvas بجاذبية وهواء ودوران
 *  - buildShareCard / shareCard: صورة PNG للمشاركة (واتساب...) بـ Canvas
 * كل شيء try/catch وتجميلي: فشله لا يكسر الصفحة.
 */
import { mascotSVG } from "./mascot.js";

const reduced = () => {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; }
};

const tone = (pct) =>
  pct >= 85 ? { c1: "#4FAF83", c2: "#7CE3B0", label: "ممتاز" }
  : pct >= 65 ? { c1: "#E8B94F", c2: "#FFD84D", label: "جيد جدًا" }
  : pct >= 50 ? { c1: "#6498EF", c2: "#9CC0FF", label: "جيد" }
  : { c1: "#FF4654", c2: "#FF8B97", label: "كمّل وهتوصل" };

const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** يستبدل مربع الدرجة بحلقة متحركة. يعيد دالة تنظيف. */
export function scoreRing(host, score, total) {
  try {
    const pct = total > 0 ? Math.max(0, Math.min(100, (score / total) * 100)) : 0;
    const t = tone(pct);
    const R = 54, C = 2 * Math.PI * R;
    const id = "sr" + Math.random().toString(36).slice(2, 7);
    host.innerHTML = `
      <div class="rfx-ring" role="img" aria-label="الدرجة ${score} من ${total}">
        <svg viewBox="0 0 130 130" aria-hidden="true">
          <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/></linearGradient></defs>
          <circle cx="65" cy="65" r="${R}" class="rfx-track"/>
          <circle cx="65" cy="65" r="${R}" class="rfx-bar" stroke="url(#${id})"
            stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" transform="rotate(-90 65 65)"/>
        </svg>
        <div class="rfx-center"><span class="rfx-num">0</span><span class="rfx-of">من ${total}</span></div>
        <div class="rfx-tag" style="--tc:${t.c1}">${t.label} • ${Math.round(pct)}%</div>
      </div>`;
    const bar = host.querySelector(".rfx-bar");
    const num = host.querySelector(".rfx-num");
    const target = C * (1 - pct / 100);
    if (reduced()) { bar.setAttribute("stroke-dashoffset", target); num.textContent = String(score); return () => {}; }
    let raf = 0, start = 0;
    const dur = 1500;
    const step = (ts) => {
      if (!start) start = ts + 250;
      const k = Math.max(0, Math.min(1, (ts - start) / dur));
      const e = easeOutExpo(k);
      bar.setAttribute("stroke-dashoffset", (C - (C - target) * e).toFixed(2));
      num.textContent = String(Math.round(score * e));
      if (k < 1) raf = requestAnimationFrame(step); else num.textContent = String(score);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  } catch (e) { return () => {}; }
}

/** قصاصات بفيزياء حقيقية على Canvas ملء الشاشة. */
export function physicsConfetti({ count = 140, bursts = 2 } = {}) {
  try {
    if (reduced()) return;
    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:3000";
    document.body.appendChild(cv);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (cv.width = innerWidth * dpr), H = (cv.height = innerHeight * dpr);
    const ctx = cv.getContext("2d");
    const colors = ["#FF4654", "#E8B94F", "#4FAF83", "#6498EF", "#A58AE8", "#FF8B97", "#FFD84D"];
    const parts = [];
    const spawn = (ox, dir) => {
      for (let i = 0; i < count / bursts; i++) {
        const a = (-Math.PI / 2) + dir * (0.25 + Math.random() * 0.7) + (Math.random() - 0.5) * 0.3;
        const sp = (9 + Math.random() * 13) * dpr;
        parts.push({
          x: ox * W, y: H * 0.95, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          w: (6 + Math.random() * 7) * dpr, h: (9 + Math.random() * 9) * dpr,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
          flip: Math.random() * 6.28, vf: 0.1 + Math.random() * 0.2,
          c: colors[(Math.random() * colors.length) | 0], circle: Math.random() < 0.25,
        });
      }
    };
    spawn(0.1, 1); spawn(0.9, -1);
    let last = performance.now(), alive = true;
    const loop = (now) => {
      const dt = Math.min(2, (now - last) / 16.67); last = now;
      ctx.clearRect(0, 0, W, H);
      let any = false;
      for (const p of parts) {
        p.vy += 0.38 * dpr * dt; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.flip += p.vf * dt;
        if (p.y < H + 40) any = true; else continue;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip)); ctx.fillStyle = p.c;
        if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.28); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (any && alive) requestAnimationFrame(loop); else cv.remove();
    };
    requestAnimationFrame(loop);
    setTimeout(() => { alive = false; cv.remove(); }, 6000);
  } catch (e) { /* تجميلي */ }
}

function loadMascot(mood) {
  return new Promise((res) => {
    try {
      const svg = mascotSVG(mood).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" ');
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (e) { res(null); }
  });
}

/** يبني صورة 1080×1350 ويعيد Blob. */
export async function buildShareCard({ name, examTitle, score, total, mood = "cheer", platform = "منصة أ/ إسماعيل عماد" }) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  const pct = total > 0 ? (score / total) * 100 : 0;
  const t = tone(pct);
  const F = "'Alexandria','IBM Plex Sans Arabic','Tajawal',sans-serif";
  x.direction = "rtl"; x.textAlign = "center";

  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#17191D"); bg.addColorStop(1, "#2A1A24");
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  // هالات لونية
  for (const [cx, cy, r, c] of [[160, 180, 420, "rgba(255,70,84,.28)"], [940, 1180, 460, t.c1 + "40"]]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // شبكة ورق مربعات خفيفة
  x.strokeStyle = "rgba(255,255,255,.035)"; x.lineWidth = 2;
  for (let i = 0; i <= W; i += 60) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let j = 0; j <= H; j += 60) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }

  x.fillStyle = "#fff"; x.font = `700 44px ${F}`; x.fillText(platform, W / 2, 120);
  x.fillStyle = "rgba(255,255,255,.55)"; x.font = `500 32px ${F}`;
  const title = String(examTitle || "اختبار");
  x.fillText(title.length > 34 ? title.slice(0, 33) + "…" : title, W / 2, 180);

  // الحلقة
  const cx = W / 2, cy = 520, R = 240;
  x.lineWidth = 46; x.lineCap = "round";
  x.strokeStyle = "rgba(255,255,255,.1)"; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
  const rg = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  rg.addColorStop(0, t.c1); rg.addColorStop(1, t.c2);
  x.strokeStyle = rg; x.shadowColor = t.c1; x.shadowBlur = 40;
  x.beginPath(); x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(pct, 100)) / 100); x.stroke();
  x.shadowBlur = 0;

  x.fillStyle = "#fff"; x.font = `800 200px Inter, ${F}`; x.direction = "ltr";
  x.fillText(String(score), cx, cy + 50);
  x.direction = "rtl"; x.fillStyle = "rgba(255,255,255,.6)"; x.font = `600 44px ${F}`;
  x.fillText(`من ${total}`, cx, cy + 125);

  // شارة النسبة
  const tag = `${t.label} • ${Math.round(pct)}%`;
  x.font = `700 46px ${F}`;
  const tw = x.measureText(tag).width + 90;
  x.fillStyle = t.c1; x.beginPath(); x.roundRect(cx - tw / 2, 810, tw, 86, 43); x.fill();
  x.fillStyle = "#17191D"; x.fillText(tag, cx, 868);

  const m = await loadMascot(mood);
  if (m) x.drawImage(m, W / 2 - 140, 1010, 280, 280);

  x.fillStyle = "#fff"; x.font = `700 54px ${F}`;
  const nm = String(name || "").trim();
  if (nm) x.fillText(nm, cx, 970, 900);
  return new Promise((res) => cv.toBlob((b) => res(b), "image/png"));
}

/** مشاركة (Web Share مع ملف) أو تنزيل كبديل. يعيد "shared" | "downloaded" | "failed". */
export async function shareCard(opts) {
  try {
    const blob = await buildShareCard(opts);
    if (!blob) return "failed";
    const file = new File([blob], "natiga.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: "نتيجتي في منصة أ/ إسماعيل عماد" });
        return "shared";
      } catch (e) { if (e && e.name === "AbortError") return "shared"; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "natiga.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "downloaded";
  } catch (e) { return "failed"; }
}
