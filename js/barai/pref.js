/**
 * pref.js — تحكّم الطالب في برعي من الملف الشخصي: مستوى الظهور (كثير/قليل/صامت)، اختصار الرسائل،
 * الاقتراحات والاختيارات، الحركة، وإعادة الضبط / مسح الذاكرة المحلية.
 * ملف مستقل: لو فشل لا يتأثر الملف الشخصي. كل ما هنا محلي (localStorage) ولا يمس حسابًا ولا امتحانات ولا نتائج.
 */
import { store } from "./store.js";
import { barai } from "./index.js";
import { mascotEl } from "../mascot.js";

try {
  const host = document.getElementById("baraiPref");
  if (host) {
    const mkSeg = (label, key, opts) => {
      const wrap = document.createElement("div");
      wrap.className = "barai-pref-row";
      const lab = document.createElement("span"); lab.className = "barai-pref-label"; lab.textContent = label;
      const seg = document.createElement("div");
      seg.className = "barai-pref-seg"; seg.setAttribute("role", "group"); seg.setAttribute("aria-label", label);
      opts.forEach(([v, text]) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "barai-pref-btn"; b.dataset.pref = key; b.dataset.value = v; b.textContent = text;
        if (key === "level") b.dataset.level = v;
        b.addEventListener("click", () => { store.setPref(key, v); if (key === "motion") { try { barai.prefs.set("motion", v); } catch (e) { /* تجاهل */ } } paint(); });
        seg.appendChild(b);
      });
      wrap.appendChild(lab); wrap.appendChild(seg);
      return wrap;
    };
    const paint = () => {
      const cur = store.getPrefs();
      host.querySelectorAll("button[data-pref]").forEach((b) => b.setAttribute("aria-pressed", String(cur[b.dataset.pref] === b.dataset.value)));
    };

    host.appendChild(mascotEl("wave"));
    host.appendChild(mkSeg("مستوى ظهور برعي", "level", [["many", "كثير"], ["few", "قليل"], ["silent", "صامت"]]));
    host.appendChild(mkSeg("طول الرسائل", "brevity", [["auto", "تلقائي"], ["short", "مختصرة"]]));
    host.appendChild(mkSeg("الاقتراحات والاختيارات", "flows", [["on", "تعمل"], ["off", "متوقفة"]]));
    host.appendChild(mkSeg("حركة برعي", "motion", [["auto", "تلقائي"], ["reduced", "مخففة"]]));

    /* إعادة ضبط ومسح: ضغطتان للتأكيد (لا مسح بنقرة عابرة)، والنتيجة تُعلَن للقارئات */
    const note = document.createElement("p");
    note.className = "barai-pref-note"; note.setAttribute("role", "status"); note.setAttribute("aria-live", "polite");
    const danger = (label, confirmLabel, doneText, fn, id) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "barai-pref-btn barai-pref-danger"; b.id = id; b.textContent = label;
      let armed = 0;
      b.addEventListener("click", () => {
        if (!armed) { b.textContent = confirmLabel; armed = setTimeout(() => { armed = 0; b.textContent = label; }, 4000); return; }
        clearTimeout(armed); armed = 0; b.textContent = label;
        let ok = false; try { ok = !!fn(); } catch (e) { ok = false; }
        note.textContent = ok ? doneText : "تعذّر التنفيذ الآن. جرّب مرة تانية.";
        paint();
      });
      return b;
    };
    const row = document.createElement("div"); row.className = "barai-pref-row barai-pref-actions";
    row.appendChild(danger("إعادة ضبط التفضيلات", "تأكيد إعادة الضبط؟", "رجعت التفضيلات للوضع الافتراضي.", () => barai.prefs.reset(), "baraiResetPrefs"));
    row.appendChild(danger("مسح ذاكرة برعي", "تأكيد المسح؟", "اتمسحت ذاكرة برعي على الجهاز ده. حسابك ونتايجك زي ما هما.", () => barai.reset({}), "baraiClearMemory"));
    host.appendChild(row);
    host.appendChild(note);
    paint();
  }
} catch (e) { /* تجاهل */ }
