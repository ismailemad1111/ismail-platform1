/**
 * ai-render.js — محرّك عرض ردود المساعد (COSMIC INTELLIGENCE)
 * ------------------------------------------------------------
 * يحوّل نص الرد (Markdown مبسّط + معادلات LaTeX) إلى عناصر DOM آمنة.
 *
 *  - لا يستخدم innerHTML إطلاقًا: كل شيء يُبنى بـ createElement/textContent،
 *    فلا يمكن لرد النموذج أن يحقن HTML أو سكربت.
 *  - لا مكتبات خارجية (مفيش KaTeX/MathJax في المشروع ولا اتصال لتحميلهما):
 *    المعادلات تُعرض بمجموعة LaTeX الشائعة في مناهج العلوم (كسور، أسس، جذور،
 *    رموز يونانية، وحدات، تفاعلات كيميائية). أي أمر غير معروف يظهر كنص عادي
 *    ولا يكسر الرد.
 *  - يدعم: عناوين، فقرات، قوائم مرتّبة وغير مرتّبة، جداول، اقتباسات (تُعرض
 *    كلوحات: تعريف/قانون/مثال/ناتج/ملاحظة)، كود، خط عريض، معادلات داخلية
 *    $...$ ومنفصلة $$...$$.
 *  - عرض عربي RTL مع معادلات LTR معزولة (dir=ltr + isolate).
 */

/* ============================================================
   01 — رموز LaTeX
   ============================================================ */

const SYMBOLS = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  ohm: "Ω", hbar: "ℏ", ell: "ℓ", infty: "∞", partial: "∂", nabla: "∇", angle: "∠", perp: "⊥", parallel: "∥",
  times: "×", cdot: "⋅", div: "÷", pm: "±", mp: "∓", approx: "≈", neq: "≠", ne: "≠", leq: "≤", le: "≤",
  geq: "≥", ge: "≥", ll: "≪", gg: "≫", propto: "∝", sim: "∼", equiv: "≡", cong: "≅",
  rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐",
  Leftrightarrow: "⇔", rightleftharpoons: "⇌", uparrow: "↑", downarrow: "↓", longrightarrow: "⟶",
  circ: "°", degree: "°", prime: "′", cdots: "⋯", ldots: "…", dots: "…", therefore: "∴", because: "∵",
  in: "∈", cup: "∪", cap: "∩", subset: "⊂", emptyset: "∅", bullet: "•", sum: "∑", int: "∫", prod: "∏",
  sqrt3: "∛"
};

/** رموز تُعامل كمعاملات (مسافات جانبية) */
const OPERATORS = new Set([
  "times", "div", "pm", "mp", "approx", "neq", "ne", "leq", "le", "geq", "ge", "ll", "gg", "propto", "sim",
  "equiv", "cong", "rightarrow", "to", "leftarrow", "leftrightarrow", "Rightarrow", "Leftarrow",
  "Leftrightarrow", "rightleftharpoons", "longrightarrow", "therefore", "because", "in", "cup", "cap", "subset"
]);

/** دوال تُكتب منتصبة */
const FUNCTIONS = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "exp", "min", "max", "lim", "sup", "inf", "det", "arcsin", "arccos", "arctan"]);

const SPACES = { ",": 0.17, ";": 0.28, ":": 0.22, " ": 0.28, quad: 1, qquad: 2, "!": 0 };

const ESCAPED = { "%": "%", "$": "$", "{": "{", "}": "}", "_": "_", "&": "&", "#": "#" };

const LEFT_RIGHT = { ".": "", "|": "|", "{": "{", "}": "}", "(": "(", ")": ")", "[": "[", "]": "]", langle: "⟨", rangle: "⟩", lbrace: "{", rbrace: "}", "lVert": "‖", "rVert": "‖" };


/* ============================================================
   02 — محلّل LaTeX → DOM
   ============================================================ */

const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
const txt = (s) => document.createTextNode(s);

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+)/.exec(src.slice(i));
      if (m) { toks.push({ k: "cmd", v: m[1] }); i += m[0].length; }
      else { toks.push({ k: "cmd", v: src[i + 1] || "" }); i += 2; }
    } else if (c === "{" || c === "}" || c === "^" || c === "_" || c === "&") {
      toks.push({ k: c }); i++;
    } else if (/\s/.test(c)) {
      toks.push({ k: "sp" });
      while (i < src.length && /\s/.test(src[i])) i++;
    } else {
      toks.push({ k: "ch", v: c }); i++;
    }
  }
  return toks;
}

/** هل المعادلة صيغة/تفاعل كيميائي؟ (حروف منتصبة بدل المائلة) */
function looksChemical(src) {
  if (/=/.test(src) && !/\\(?:rightarrow|to|rightleftharpoons|longrightarrow)/.test(src)) return false;
  const hasArrow = /\\(?:rightarrow|to|rightleftharpoons|longrightarrow|uparrow|downarrow)/.test(src);
  const hasSub = /[A-Z][a-z]?\)?_\{?\d/.test(src);
  const hasCharge = /\^\{?\d*[+\-−]\}?/.test(src);
  if (!hasArrow && !hasSub && !hasCharge) return false;
  const s = src.replace(/\\text\{[^}]*\}/g, "").replace(/\\[a-zA-Z]+/g, " ");
  for (let i = 0; i < s.length; i++) {
    if (/[a-z]/.test(s[i]) && !(i > 0 && /[A-Z]/.test(s[i - 1]))) return false;
  }
  return true;
}

function parseTex(src) {
  const toks = tokenize(src);
  let p = 0;

  const peek = () => toks[p];

  function parseSeq(stop, textMode) {
    const out = [];
    while (p < toks.length) {
      const t = toks[p];
      if (stop === "}" && t.k === "}") break;
      if (stop === "]" && t.k === "ch" && t.v === "]") break;
      if (t.k === "}") { p++; continue; }
      if (t.k === "sp") { p++; if (textMode) out.push(txt(" ")); continue; }
      const base = parseAtom(textMode);
      let sup = null, sub = null;
      while (peek() && (peek().k === "^" || peek().k === "_")) {
        const k = toks[p++].k;
        const arg = parseArg(textMode);
        if (k === "^") sup = arg; else sub = arg;
      }
      if (sup || sub) attach(out, base, sup, sub);
      else if (base) out.push(base);
    }
    return out;
  }

  /** وسيط واحد: مجموعة {..} أو ذرّة مفردة */
  function parseArg(textMode) {
    while (peek() && peek().k === "sp") p++;
    const t = peek();
    if (!t) return [];
    if (t.k === "{") {
      p++;
      const nodes = parseSeq("}", textMode);
      if (peek() && peek().k === "}") p++;
      return nodes;
    }
    const a = parseAtom(textMode);
    return a ? [a] : [];
  }

  function parseAtom(textMode) {
    const t = toks[p++];
    if (!t) return null;
    if (t.k === "{") {
      const g = el("span", "ci-g");
      parseSeq("}", textMode).forEach((n) => g.appendChild(n));
      if (peek() && peek().k === "}") p++;
      return g;
    }
    if (t.k === "^" || t.k === "_") { p--; return el("span"); }
    if (t.k === "&") return txt(" ");
    if (t.k === "ch") return charNode(t.v, textMode);
    if (t.k === "cmd") return command(t.v, textMode);
    return null;
  }

  function attach(out, base, sup, sub) {
    if (base) out.push(base);
    const isDegree = sup && sup.length === 1 && sup[0].textContent === "°";
    if (isDegree && !sub) { out.push(txt("°")); return; }
    if (sup && sub) {
      const ss = el("span", "ci-ss");
      const a = el("sup"); sup.forEach((n) => a.appendChild(n));
      const b = el("sub"); sub.forEach((n) => b.appendChild(n));
      ss.append(a, b);
      out.push(ss);
    } else if (sup) {
      const a = el("sup"); sup.forEach((n) => a.appendChild(n)); out.push(a);
    } else if (sub) {
      const b = el("sub"); sub.forEach((n) => b.appendChild(n)); out.push(b);
    }
  }

  function charNode(c, textMode) {
    if (textMode) return txt(c);
    if (/[A-Za-z]/.test(c)) { const s = el("span", "ci-v"); s.textContent = c; return s; }
    if (c === "+" || c === "=" || c === "<" || c === ">") { const s = el("span", "ci-op"); s.textContent = c; return s; }
    if (c === "-") { const s = el("span", "ci-op"); s.textContent = "−"; return s; }
    if (c === "'") return txt("′");
    return txt(c);
  }

  function fill(node, nodes) { nodes.forEach((n) => node.appendChild(n)); return node; }

  function command(name, textMode) {
    switch (name) {
      case "frac": case "dfrac": case "tfrac": {
        const a = parseArg(false), b = parseArg(false);
        const f = el("span", "ci-frac");
        f.append(fill(el("span", "ci-num"), a), fill(el("span", "ci-den"), b));
        return f;
      }
      case "sqrt": {
        while (peek() && peek().k === "sp") p++;
        let idx = null;
        if (peek() && peek().k === "ch" && peek().v === "[") {
          p++;
          idx = parseSeq("]", false);
          if (peek() && peek().k === "ch" && peek().v === "]") p++;
        }
        const arg = parseArg(false);
        const r = el("span", "ci-sqrt");
        if (idx) r.appendChild(fill(el("span", "ci-idx"), idx));
        const rad = el("span", "ci-rad");
        rad.textContent = "√";
        r.appendChild(rad);
        r.appendChild(fill(el("span", "ci-rc"), arg));
        return r;
      }
      case "text": case "textrm": case "mbox": case "hbox": return fill(el("span", "ci-t"), parseArg(true));
      case "mathrm": case "operatorname": case "rm": return fill(el("span", "ci-up"), parseArg(false));
      case "textbf": case "mathbf": case "boldsymbol": case "bf": return fill(el("span", "ci-b"), parseArg(textMode));
      case "textit": case "mathit": return fill(el("span", "ci-it"), parseArg(textMode));
      case "overline": case "bar": return fill(el("span", "ci-over"), parseArg(false));
      case "vec": case "overrightarrow": return fill(el("span", "ci-vec"), parseArg(false));
      case "hat": return fill(el("span", "ci-hat"), parseArg(false));
      case "underline": return fill(el("span", "ci-under"), parseArg(false));
      case "left": case "right": {
        const t = toks[p++];
        if (!t) return null;
        if (t.k === "ch") return txt(t.v === "." ? "" : t.v);
        if (t.k === "cmd") return txt(LEFT_RIGHT[t.v] != null ? LEFT_RIGHT[t.v] : "");
        return null;
      }
      case "\\": case "cr": return el("br");
      case "displaystyle": case "textstyle": case "scriptstyle": case "limits": case "nolimits": case "big": case "Big": case "bigg": case "Bigg": case "mathbin": case "mathrel":
        return null;
      default: break;
    }
    if (Object.prototype.hasOwnProperty.call(SPACES, name)) {
      const s = el("span", "ci-sp"); s.style.width = SPACES[name] + "em"; return s;
    }
    if (Object.prototype.hasOwnProperty.call(ESCAPED, name)) return txt(ESCAPED[name]);
    if (Object.prototype.hasOwnProperty.call(SYMBOLS, name)) {
      const s = el("span");
      s.textContent = SYMBOLS[name];
      if (OPERATORS.has(name)) s.className = "ci-op";
      else if (name === "sum" || name === "int" || name === "prod") s.className = "ci-big";
      else if (/^[a-z]/.test(name) && /^[α-ω]$/.test(SYMBOLS[name]) && !textMode) s.className = "ci-v";
      return s;
    }
    if (FUNCTIONS.has(name)) { const s = el("span", "ci-fn"); s.textContent = name; return s; }
    return txt(name);
  }

  return parseSeq(null, false);
}

/** عنصر معادلة (داخلية أو منفصلة) */
export function mathNode(src, display) {
  const wrap = el("span", "ci-math" + (display ? " ci-display" : ""));
  wrap.setAttribute("dir", "ltr");
  wrap.setAttribute("role", "math");
  try {
    if (looksChemical(src)) wrap.classList.add("ci-up");
    parseTex(String(src).trim()).forEach((n) => wrap.appendChild(n));
  } catch (e) {
    wrap.textContent = String(src);
  }
  return wrap;
}


/* ============================================================
   03 — Markdown: inline
   ============================================================ */

const INLINE_RE = /`([^`\n]+)`|\$\$([^$]+?)\$\$|\$([^\s$](?:[^$\n]*?[^\s$])?)\$|\*\*(.+?)\*\*/g;

function addText(parent, s) {
  if (!s) return;
  const parts = s.split("\n");
  parts.forEach((part, i) => {
    if (i > 0) parent.appendChild(el("br"));
    if (part) parent.appendChild(txt(part));
  });
}

function inline(parent, s, allowBold = true) {
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0, m;
  while ((m = re.exec(s))) {
    addText(parent, s.slice(last, m.index));
    if (m[1] != null) {
      const c = el("code", "ci-code"); c.textContent = m[1]; parent.appendChild(c);
    } else if (m[2] != null) {
      parent.appendChild(mathNode(m[2], false));
    } else if (m[3] != null) {
      parent.appendChild(mathNode(m[3], false));
    } else if (allowBold) {
      const b = el("strong"); inline(b, m[4], false); parent.appendChild(b);
    } else {
      addText(parent, m[0]);
    }
    last = re.lastIndex;
  }
  addText(parent, s.slice(last));
}

function inlineEl(tag, cls, s) {
  const n = el(tag, cls);
  n.setAttribute("dir", "auto");
  inline(n, s);
  return n;
}


/* ============================================================
   04 — Markdown: blocks
   ============================================================ */

const RE = {
  blank: /^\s*$/,
  fence: /^\s*```(\w*)\s*$/,
  fenceEnd: /^\s*```\s*$/,
  heading: /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/,
  hr: /^\s*([-*_])(\s*\1){2,}\s*$/,
  quote: /^\s*>/,
  ul: /^\s*[-*•+]\s+(.*)$/,
  ol: /^\s*(\d+)[.)]\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
};

const CALLOUTS = [
  ["law", /^[*\s]*(القانون|قانون|المعادلة|العلاقة|الصيغة)/],
  ["def", /^[*\s]*(تعريف|المفهوم|المقصود)/],
  ["ex", /^[*\s]*(مثال|مسألة|سؤال)/],
  ["res", /^[*\s]*(الناتج|النتيجة|الإجابة|الاجابة|الجواب|إذن)/],
  ["step", /^[*\s]*(الحل|الخطوات|خطوة)/],
  ["note", /^[*\s]*(ملاحظة|تنبيه|انتبه|معلومة|تذكّر|تذكر)/]
];

function startsBlock(line, next) {
  return RE.fence.test(line) || /^\s*\$\$/.test(line) || RE.heading.test(line) || RE.hr.test(line)
    || RE.quote.test(line) || RE.ul.test(line) || RE.ol.test(line)
    || (line.includes("|") && next != null && RE.tableSep.test(next));
}

function splitRow(l) {
  let s = l.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function eqBlock(src) {
  const d = el("div", "ci-eq");
  d.appendChild(mathNode(src, true));
  return d;
}

function codeBlock(code) {
  const pre = el("pre", "ci-pre");
  pre.setAttribute("dir", "ltr");
  const c = el("code"); c.textContent = code;
  pre.appendChild(c);
  return pre;
}

function tableBlock(head, rows, aligns) {
  const wrap = el("div", "ci-table-wrap");
  const t = el("table", "ci-table");
  const thead = el("thead"), trh = el("tr");
  head.forEach((h, i) => { const th = inlineEl("th", "", h); if (aligns[i]) th.style.textAlign = aligns[i]; trh.appendChild(th); });
  thead.appendChild(trh); t.appendChild(thead);
  const tb = el("tbody");
  rows.forEach((r) => {
    const tr = el("tr");
    head.forEach((_, i) => { const td = inlineEl("td", "", r[i] || ""); if (aligns[i]) td.style.textAlign = aligns[i]; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t);
  return wrap;
}

function parseBlocks(lines, parent) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (RE.blank.test(line)) { i++; continue; }

    /* كود */
    if (RE.fence.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !RE.fenceEnd.test(lines[i])) buf.push(lines[i++]);
      i++;
      parent.appendChild(codeBlock(buf.join("\n")));
      continue;
    }

    /* معادلة منفصلة $$ ... $$ */
    if (/^\s*\$\$/.test(line)) {
      const s = line.trim().slice(2);
      const close = s.indexOf("$$");
      if (close >= 0) {
        parent.appendChild(eqBlock(s.slice(0, close)));
        const rest = s.slice(close + 2).trim();
        if (rest) lines[i] = rest; else i++;
        continue;
      }
      const buf = [s];
      i++;
      while (i < lines.length && !lines[i].includes("$$")) buf.push(lines[i++]);
      if (i < lines.length) {
        const k = lines[i].indexOf("$$");
        buf.push(lines[i].slice(0, k));
        const rest = lines[i].slice(k + 2).trim();
        if (rest) lines[i] = rest; else i++;
      }
      parent.appendChild(eqBlock(buf.join(" ")));
      continue;
    }

    /* عنوان */
    let m = RE.heading.exec(line);
    if (m) {
      parent.appendChild(inlineEl(m[1].length <= 2 ? "h3" : "h4", m[1].length <= 2 ? "ci-h" : "ci-h3", m[2]));
      i++;
      continue;
    }

    /* فاصل */
    if (RE.hr.test(line)) { parent.appendChild(el("hr", "ci-hr")); i++; continue; }

    /* جدول */
    if (line.includes("|") && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "end" : /^:-+/.test(c) ? "start" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && !RE.blank.test(lines[i]) && lines[i].includes("|")) rows.push(splitRow(lines[i++]));
      parent.appendChild(tableBlock(head, rows, aligns));
      continue;
    }

    /* اقتباس ← لوحة */
    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      const box = el("div", "ci-callout");
      const first = buf.find((l) => !RE.blank.test(l)) || "";
      const hit = CALLOUTS.find(([, re]) => re.test(first));
      box.setAttribute("data-kind", hit ? hit[0] : "quote");
      parseBlocks(buf, box);
      parent.appendChild(box);
      continue;
    }

    /* قوائم */
    const ulm = RE.ul.exec(line), olm = RE.ol.exec(line);
    if (ulm || olm) {
      const ordered = !!olm;
      const list = el(ordered ? "ol" : "ul", ordered ? "ci-steps" : "ci-list");
      if (ordered && Number(olm[1]) > 1) list.setAttribute("start", String(Number(olm[1])));
      while (i < lines.length) {
        const cur = lines[i];
        const mm = ordered ? RE.ol.exec(cur) : RE.ul.exec(cur);
        if (!mm) break;
        let body = ordered ? mm[2] : mm[1];
        i++;
        while (i < lines.length && !RE.blank.test(lines[i]) && /^\s+\S/.test(lines[i]) && !RE.ul.test(lines[i]) && !RE.ol.test(lines[i])) {
          body += "\n" + lines[i++].trim();
        }
        list.appendChild(inlineEl("li", "", body));
        /* سطر فاضي بين عناصر نفس القائمة */
        let j = i;
        while (j < lines.length && RE.blank.test(lines[j])) j++;
        if (j > i && j < lines.length && (ordered ? RE.ol.test(lines[j]) : RE.ul.test(lines[j]))) i = j;
      }
      parent.appendChild(list);
      continue;
    }

    /* فقرة */
    const buf = [line];
    i++;
    while (i < lines.length && !RE.blank.test(lines[i]) && !startsBlock(lines[i], lines[i + 1])) buf.push(lines[i++]);
    parent.appendChild(inlineEl("p", "", buf.join("\n").trim()));
  }
}


/* ============================================================
   05 — الواجهة العامة
   ============================================================ */

/**
 * يحوّل نص الرد إلى DocumentFragment جاهز للإضافة.
 * @param {string} raw
 * @returns {DocumentFragment}
 */
export function renderRichText(raw) {
  const frag = document.createDocumentFragment();
  const lines = String(raw == null ? "" : raw).replace(/\r\n?/g, "\n").split("\n");
  try {
    parseBlocks(lines, frag);
  } catch (e) {
    /* أي عطل ⇒ نص عادي بدل ضياع الرد */
    const fallback = document.createDocumentFragment();
    const p = el("p");
    p.textContent = String(raw);
    fallback.appendChild(p);
    return fallback;
  }
  return frag;
}
