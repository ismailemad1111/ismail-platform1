/**
 * mascot.js — «برعي»، روبوت المنصة (SVG مضمّن، بلا موارد خارجية).
 * مصدر الرسم الوحيد: تستخدمه بطاقة الانتقال والرئيسية ونتيجة الاختبار.
 *
 * الحالات (mood):
 *   wave      تلويح (الترحيب والانتقال)
 *   cheer     احتفال: ذراعان مرفوعتان وعينان مبتسمتان
 *   cheerUp   تشجيع: ذراع مرفوعة وابتسامة هادئة
 *   sleepy    هادئ/نعسان (الحالات الفارغة)
 *   wait      انتظار: ذراعان لأسفل وابتسامة (نتيجة مؤجلة)
 *   cover     يغطي عينيه بيديه (عند كتابة كلمة المرور) — محيطي بلا نص
 *   shiver    يرتجف (امتحان جديد) — محيطي بلا نص
 * تعبيرات الجولة الثالثة (حياة الشخصية):
 *   welcome   ترحيب دافئ (ذراعان مفتوحتان + عينان مبتسمتان)
 *   encourage تشجيع (قبضة مرفوعة + شرارات) — يختلف عن cheerUp الهادئ
 *   win       احتفال بإنجاز (كأس + شرارات)
 *   alert     تنبيه لطيف (علامة تعجب صفراء، ليست حمراء مخيفة)
 *   ponder    تفكير (فقاعة نقاط) | focus تركيز (دفتر + حاجبان ثابتان) | idea فكرة (لمبة)
 *   surprised مفاجأة قصيرة (قفزة واحدة ثم يهدأ) | goodnight تصبح على خير (قمر)
 * الحركات الجديدة «مرة أو مرتين ثم تهدأ» (لا حركة لا نهائية مزعجة)، وتتوقف مع prefers-reduced-motion.
 * العينان داخل <g.rb-eyes> فتتحرّكان بمتغيرَي --gx/--gy (نظرة تتبّع خفيفة من ambient.js).
 * يحتاج css/mascot.css.
 */

const INK = "#17191D";
const GREEN = "#7CE3B0";

const EYES = {
  open: `
      <ellipse class="rb-eye" cx="66" cy="63" rx="5" ry="7" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="63" rx="5" ry="7" fill="${GREEN}"/>`,
  happy: `
      <path d="M60 67 Q66 57 72 67" fill="none" stroke="${GREEN}" stroke-width="3.5"/>
      <path d="M88 67 Q94 57 100 67" fill="none" stroke="${GREEN}" stroke-width="3.5"/>`,
  sleepy: `
      <path d="M60 62 Q66 68 72 62" fill="none" stroke="${GREEN}" stroke-width="3.5"/>
      <path d="M88 62 Q94 68 100 62" fill="none" stroke="${GREEN}" stroke-width="3.5"/>`,
  wide: `
      <ellipse class="rb-eye" cx="66" cy="62" rx="7" ry="9" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="62" rx="7" ry="9" fill="${GREEN}"/>
      <circle cx="66" cy="62" r="2.2" fill="${INK}"/><circle cx="94" cy="62" r="2.2" fill="${INK}"/>`,
  /* هادئ: عينان مغمضتان بلطف */
  closed: `
      <path d="M58 64 Q66 71 74 64" fill="none" stroke="${GREEN}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M86 64 Q94 71 102 64" fill="none" stroke="${GREEN}" stroke-width="3.5" stroke-linecap="round"/>`,
  stars: `
      <path d="M66 54 L68.4 60 L74.6 60.4 L69.8 64.4 L71.4 70.6 L66 67.2 L60.6 70.6 L62.2 64.4 L57.4 60.4 L63.6 60 Z" fill="#FFD84D"/>
      <path d="M94 54 L96.4 60 L102.6 60.4 L97.8 64.4 L99.4 70.6 L94 67.2 L88.6 70.6 L90.2 64.4 L85.4 60.4 L91.6 60 Z" fill="#FFD84D"/>`,
  wink: `
      <ellipse class="rb-eye" cx="66" cy="63" rx="5" ry="7" fill="${GREEN}"/>
      <path d="M88 64 Q94 58 100 64" fill="none" stroke="${GREEN}" stroke-width="3.5"/>`,
  down: `
      <ellipse class="rb-eye" cx="66" cy="65" rx="5" ry="6" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="65" rx="5" ry="6" fill="${GREEN}"/>
      <path d="M58 58 L72 53 M102 58 L88 53" fill="none" stroke="${GREEN}" stroke-width="2.5" stroke-linecap="round"/>`,
  up: `
      <ellipse class="rb-eye" cx="66" cy="60" rx="5" ry="7" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="60" rx="5" ry="7" fill="${GREEN}"/>`,
  /* ودود: عينان مفتوحتان وحاجبان مرتفعان قليلًا */
  soft: `
      <ellipse class="rb-eye" cx="66" cy="64" rx="5" ry="7" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="64" rx="5" ry="7" fill="${GREEN}"/>
      <path d="M59 53 Q66 49 73 52 M87 52 Q94 49 101 53" fill="none" stroke="${GREEN}" stroke-width="2.4" stroke-linecap="round"/>`,
  /* تركيز: عينان أضيق وحاجبان مستقيمان هادئان (ليسا غاضبين) */
  focus: `
      <ellipse class="rb-eye" cx="66" cy="64" rx="5.5" ry="4.6" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="64" rx="5.5" ry="4.6" fill="${GREEN}"/>
      <path d="M58 55 L73 56 M87 56 L102 55" fill="none" stroke="${GREEN}" stroke-width="2.6" stroke-linecap="round"/>`,
  /* مفاجأة: عينان واسعتان وحاجبان مقوّسان عاليان */
  surprised: `
      <ellipse class="rb-eye" cx="66" cy="63" rx="7" ry="9" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="63" rx="7" ry="9" fill="${GREEN}"/>
      <circle cx="66" cy="63" r="2.2" fill="${INK}"/><circle cx="94" cy="63" r="2.2" fill="${INK}"/>
      <path d="M57 50 Q66 44 75 50 M85 50 Q94 44 103 50" fill="none" stroke="${GREEN}" stroke-width="2.6" stroke-linecap="round"/>`,
  /* تنبيه لطيف: حاجب واحد مرتفع */
  alert: `
      <ellipse class="rb-eye" cx="66" cy="64" rx="5" ry="7" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="94" cy="62" rx="5.5" ry="7.5" fill="${GREEN}"/>
      <path d="M59 55 L73 55" fill="none" stroke="${GREEN}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M87 51 Q94 46 102 50" fill="none" stroke="${GREEN}" stroke-width="2.6" stroke-linecap="round"/>`,
  /* تفكير: عينان تنظران لأعلى-جانبًا وحاجب مرتفع */
  side: `
      <ellipse class="rb-eye" cx="70" cy="60" rx="4.6" ry="6.4" fill="${GREEN}"/>
      <ellipse class="rb-eye" cx="98" cy="60" rx="4.6" ry="6.4" fill="${GREEN}"/>
      <path d="M89 50 Q97 45 104 50" fill="none" stroke="${GREEN}" stroke-width="2.4" stroke-linecap="round"/>`
};

const MOUTH = {
  smile: `<path class="rb-smile" d="M71 76 Q80 85 89 76" fill="none" stroke="${GREEN}"/>
    <path class="rb-flat" d="M72 82 Q80 76 88 82" fill="none" stroke="${GREEN}"/>`,
  open:  `<path d="M68 73 Q80 92 92 73 Z" fill="${GREEN}" stroke="${GREEN}" stroke-width="2"/>`,
  calm:  `<path d="M73 78 L87 78" fill="none" stroke="${GREEN}"/>`,
  sad:   `<path d="M71 82 Q80 74 89 82" fill="none" stroke="${GREEN}"/>`,
  o:     `<ellipse cx="80" cy="79" rx="6" ry="7" fill="${GREEN}" stroke="none"/>`,
  wobble:`<path d="M70 79 Q75 74 80 79 T90 79" fill="none" stroke="${GREEN}"/>`,
  /* ابتسامة جانبية (تفكير/مزاح) */
  smirk: `<path d="M72 80 Q82 86 90 75" fill="none" stroke="${GREEN}"/>`,
  /* صغير مستدير (تفكير) */
  hmm:   `<path d="M74 80 Q78 77 81 80 T88 79" fill="none" stroke="${GREEN}"/>`,
  /* ابتسامة عريضة ثابتة */
  grin:  `<path d="M66 74 Q80 92 94 74 Z" fill="${GREEN}" stroke="${GREEN}" stroke-width="2"/><path d="M71 78 H89" stroke="${INK}" stroke-width="1.6"/>`
};

/* إكسسوارات صغيرة تُرسم فوق الشكل الأساسي دون تعديله */
const ACC = {
  sweat: `<path class="rb-sweat" d="M112 44 Q116 52 112 56 Q108 52 112 44 Z" fill="#6CC8FF" stroke="${INK}" stroke-width="1.5"/>`,
  think: `<g class="rb-think"><text x="112" y="30" font-size="22" font-weight="800" fill="#FF4654" stroke="none">?</text></g>
    <g class="rb-gear" transform="translate(36 36)"><circle r="7" fill="#E8B94F" stroke="${INK}" stroke-width="2"/><circle r="2.5" fill="#FFFFFF" stroke="none"/></g>`,
  glasses: `<g fill="none" stroke="#FFFFFF" stroke-width="2.5"><circle cx="66" cy="63" r="11"/><circle cx="94" cy="63" r="11"/><path d="M77 63 H83"/></g>`,
  offline: `<g transform="translate(112 24)" fill="none" stroke="#FF4654" stroke-width="3"><path d="M-12 -2 Q0 -12 12 -2"/><path d="M-7 4 Q0 -2 7 4"/><circle cx="0" cy="9" r="1.5" fill="#FF4654"/><path d="M-12 14 L12 -10" stroke="${INK}" stroke-width="3.5"/></g>`,
  book: `<g transform="translate(52 130)"><rect width="56" height="22" rx="3" fill="#6498EF" stroke="${INK}" stroke-width="2.5"/><path d="M28 0 V22" stroke="${INK}" stroke-width="2"/></g>`,
  phone: `<g transform="translate(62 124)"><rect width="22" height="30" rx="4" fill="${INK}" stroke="#FFFFFF" stroke-width="2"/><rect x="3" y="4" width="16" height="18" rx="2" fill="${GREEN}" stroke="none"/></g>`,
  cap: `<g stroke="${INK}" stroke-width="2.5"><path d="M80 14 L112 26 L80 38 L48 26 Z" fill="#17191D"/><path d="M62 33 V44 Q80 52 98 44 V33" fill="#17191D"/><path d="M112 26 V42" /></g>`,
  heart: `<path class="rb-think" d="M118 28 q-6 -10 -12 -2 q-6 8 12 18 q18 -10 12 -18 q-6 -8 -12 2z" transform="translate(-6 -8) scale(.8)" fill="#FF4654" stroke="none"/>`,
  coins: `<g class="rb-think" stroke="${INK}" stroke-width="1.5"><circle cx="118" cy="40" r="7" fill="#FFD84D"/><circle cx="130" cy="28" r="5" fill="#FFD84D"/><circle cx="36" cy="36" r="6" fill="#FFD84D"/></g>`,
  envelope: `<g transform="translate(110 118)" stroke="${INK}" stroke-width="2"><rect width="28" height="20" rx="3" fill="#FFFFFF"/><path d="M0 2 L14 12 L28 2" fill="none"/></g>`,
  clock: `<g transform="translate(120 34)" stroke="${INK}" stroke-width="2"><circle r="10" fill="#FFFFFF"/><path d="M0 -6 V0 L5 3" fill="none"/></g>`,
  cover: `<g stroke="${INK}" stroke-width="3">
    <rect x="52" y="66" width="12" height="46" rx="6" fill="#FFFFFF" transform="rotate(-6 58 89)"/>
    <rect x="96" y="66" width="12" height="46" rx="6" fill="#FFFFFF" transform="rotate(6 102 89)"/>
    <circle cx="66" cy="63" r="10" fill="#FFFFFF"/><circle cx="94" cy="63" r="10" fill="#FFFFFF"/></g>`,
  chill: `<g fill="none" stroke="#6CC8FF" stroke-width="3" stroke-linecap="round"><path d="M22 58 l-6 -6 M22 74 l-8 0 M22 90 l-6 6"/><path d="M138 58 l6 -6 M138 74 l8 0 M138 90 l6 6"/></g>`,
  cup: `<g transform="translate(112 126)" stroke="${INK}" stroke-width="2"><rect width="16" height="14" rx="3" fill="#FFFFFF"/><path d="M16 4 Q22 4 22 9 Q22 12 16 12" fill="none"/></g>`,
  /* شرارات صغيرة تتوهّج مرة أو مرتين */
  spark: `<g fill="#FFD84D" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round">
    <path class="rb-spark" d="M0 -8 Q1.2 -1.2 8 0 Q1.2 1.2 0 8 Q-1.2 1.2 -8 0 Q-1.2 -1.2 0 -8Z" transform="translate(24 30)"/>
    <path class="rb-spark s2" d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6Z" transform="translate(138 40)"/>
    <path class="rb-spark s3" d="M0 -5 Q.8 -.8 5 0 Q.8 .8 0 5 Q-.8 .8 -5 0 Q-.8 -.8 0 -5Z" transform="translate(132 96)"/></g>`,
  /* علامة تعجب صفراء هادئة */
  bang: `<g class="rb-bang" transform="translate(121 28)"><circle r="11.5" fill="#FFD84D" stroke="${INK}" stroke-width="2"/><path d="M0 -6.5 V1.5" stroke="${INK}" stroke-width="3.2" fill="none"/><circle cy="6.2" r="1.9" fill="${INK}" stroke="none"/></g>`,
  /* فقاعة تفكير بثلاث نقاط تتتابع */
  dots: `<g transform="translate(104 8)" stroke="${INK}" stroke-width="2"><circle cx="2" cy="32" r="2.6" fill="#FFFFFF"/><circle cx="8" cy="26" r="3.6" fill="#FFFFFF"/><rect x="10" y="2" width="42" height="24" rx="12" fill="#FFFFFF"/>
    <g stroke="none" fill="${INK}"><circle class="rb-dot" cx="22" cy="14" r="2.6"/><circle class="rb-dot d2" cx="31" cy="14" r="2.6"/><circle class="rb-dot d3" cx="40" cy="14" r="2.6"/></g></g>`,
  /* دفتر ملاحظات + قلم (تركيز) */
  note: `<g transform="translate(58 128)" stroke="${INK}" stroke-width="2.4"><rect width="42" height="24" rx="3" fill="#FFFFFF"/><path d="M7 8 H30 M7 15 H24" stroke="#6498EF" stroke-width="2.2" stroke-linecap="round"/>
    <g transform="translate(34 24) rotate(40)"><rect x="-3" y="-20" width="6" height="18" rx="1.5" fill="#FFD84D" stroke-width="1.8"/><path d="M-3 -2 L0 4 L3 -2Z" fill="#F4C7A1" stroke-width="1.5"/></g></g>`,
  /* كأس ذهبي صغير (إنجاز) */
  trophy: `<g transform="translate(2 14) scale(.9)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"><path class="rb-trophy" d="M5 0 H27 V10 Q27 22 16 22 Q5 22 5 10 Z" fill="#FFD84D"/><path d="M5 4 H0 Q0 14 7 14 M27 4 H32 Q32 14 25 14" fill="none"/><path d="M16 22 V28 M9 30 H23" fill="none" stroke-width="3" stroke-linecap="round"/></g>`,
  /* سهم إرشاد صغير */
  arrow: `<g class="rb-glow" transform="translate(128 74)" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M-8 -6 L6 -6 L6 -11 L16 0 L6 11 L6 6 L-8 6 Z" fill="#FFD84D"/></g>`,
  /* ورقة هادئة */
  leaf: `<g transform="translate(120 36) rotate(20)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"><path d="M0 -12 Q12 -2 0 12 Q-12 -2 0 -12Z" fill="#4FAF83"/><path d="M0 -8 V10" fill="none"/></g>`,
  /* لمبة فكرة */
  bulb: `<g transform="translate(120 28)" stroke="${INK}" stroke-width="2" stroke-linecap="round"><path class="rb-glow" d="M0 -12 A10 10 0 0 1 6 6 V10 H-6 V6 A10 10 0 0 1 0 -12Z" fill="#FFD84D"/><path d="M-4 14 H4" fill="none"/>
    <path class="rb-glow" d="M-16 -4 H-20 M16 -4 H20 M-12 -15 L-15 -18 M12 -15 L15 -18" fill="none" stroke="#E8B94F"/></g>`,
  /* قمر وتصبح على خير */
  moon: `<g transform="translate(122 26)" stroke="${INK}" stroke-width="2"><path d="M0 -11 A11 11 0 1 0 10 8 A9 9 0 1 1 0 -11Z" fill="#FFD84D"/><path d="M-26 -2 l3 0 M-24.5 -3.5 v3" stroke="#FFD84D" stroke-width="2" stroke-linecap="round"/></g>`
};

const ARM_RIGHT_UP = `
    <g class="rb-wave">
      <rect x="100" y="108" width="12" height="30" rx="6" fill="#FFFFFF"/>
      <circle cx="106" cy="140" r="8" fill="#FFFFFF"/>
    </g>`;
const ARM_LEFT_UP = `
    <g class="rb-wave-l">
      <rect x="48" y="108" width="12" height="30" rx="6" fill="#FFFFFF"/>
      <circle cx="54" cy="140" r="8" fill="#FFFFFF"/>
    </g>`;
const ARM_RIGHT_DOWN = `<rect x="107" y="110" width="12" height="28" rx="6" fill="#FFFFFF" transform="rotate(-8 113 112)"/>`;
const ARM_LEFT_DOWN  = `<rect x="41" y="110" width="12" height="28" rx="6" fill="#FFFFFF" transform="rotate(8 47 112)"/>`;

const ARM_RIGHT_HOLD = `<rect x="98" y="112" width="12" height="26" rx="6" fill="#FFFFFF" transform="rotate(35 104 114)"/>`;
const ARM_LEFT_HOLD  = `<rect x="50" y="112" width="12" height="26" rx="6" fill="#FFFFFF" transform="rotate(-35 56 114)"/>`;
const ARM_RIGHT_HIP  = `<rect x="104" y="108" width="12" height="26" rx="6" fill="#FFFFFF" transform="rotate(-38 110 112)"/>`;
const ARM_LEFT_HIP   = `<rect x="44" y="108" width="12" height="26" rx="6" fill="#FFFFFF" transform="rotate(38 50 112)"/>`;
const ARM_RIGHT_HANG = `<rect x="108" y="114" width="12" height="28" rx="6" fill="#FFFFFF" transform="rotate(-2 114 116)"/>`;
const ARM_LEFT_HANG  = `<rect x="40" y="114" width="12" height="28" rx="6" fill="#FFFFFF" transform="rotate(2 46 116)"/>`;

/* قبضة مرفوعة (تشجيع) وذراعان مفتوحتان (ترحيب) */
const ARM_RIGHT_PUMP = `
    <g class="rb-pump">
      <rect x="100" y="108" width="12" height="26" rx="6" fill="#FFFFFF"/>
      <circle cx="106" cy="136" r="9" fill="#FFFFFF"/>
    </g>`;
const ARM_RIGHT_POINT = `<rect x="104" y="100" width="12" height="32" rx="6" fill="#FFFFFF" transform="rotate(-78 110 104)"/>`;
const ARM_RIGHT_OPEN = `<rect x="104" y="108" width="12" height="28" rx="6" fill="#FFFFFF" transform="rotate(-62 110 110)"/>`;
const ARM_LEFT_OPEN  = `<rect x="44" y="108" width="12" height="28" rx="6" fill="#FFFFFF" transform="rotate(62 50 110)"/>`;

const MOODS = {
  wave:    { eyes: "open",   mouth: "smile", left: ARM_LEFT_DOWN, right: ARM_RIGHT_UP },
  cheerUp: { eyes: "soft",   mouth: "smile", left: ARM_LEFT_HIP,  right: ARM_RIGHT_UP },
  cheer:   { eyes: "happy",  mouth: "open",  left: ARM_LEFT_UP,   right: ARM_RIGHT_UP, cls: "is-cheer" },
  sleepy:  { eyes: "sleepy", mouth: "calm",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, z: true },
  wait:    { eyes: "open",   mouth: "smile", left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN },
  scared:  { eyes: "wide",   mouth: "wobble", left: ARM_LEFT_HOLD, right: ARM_RIGHT_HOLD, acc: "sweat", cls: "is-scared" },
  shock:   { eyes: "wide",   mouth: "o",      left: ARM_LEFT_UP,   right: ARM_RIGHT_UP,   cls: "is-shock" },
  starstruck: { eyes: "stars", mouth: "open", left: ARM_LEFT_UP,   right: ARM_RIGHT_UP,   cls: "is-cheer" },
  think:   { eyes: "up",     mouth: "calm",   left: ARM_LEFT_DOWN, right: ARM_RIGHT_HIP,  acc: "think" },
  sad:     { eyes: "down",   mouth: "sad",    left: ARM_LEFT_HANG, right: ARM_RIGHT_HANG, cls: "is-sad" },
  wink:    { eyes: "wink",   mouth: "smile",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_UP },
  proud:   { eyes: "happy",  mouth: "smile",  left: ARM_LEFT_HIP,  right: ARM_RIGHT_HIP,  cls: "is-proud", acc: "cap" },
  reading: { eyes: "open",   mouth: "calm",   left: ARM_LEFT_HOLD, right: ARM_RIGHT_HOLD, acc: "book" },
  typing:  { eyes: "open",   mouth: "smile",  left: ARM_LEFT_HOLD, right: ARM_RIGHT_HOLD, acc: "phone" },
  glasses: { eyes: "open",   mouth: "smile",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "glasses" },
  offline: { eyes: "wide",   mouth: "wobble", left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "offline" },
  money:   { eyes: "stars",  mouth: "open",   left: ARM_LEFT_UP,   right: ARM_RIGHT_UP,   acc: "coins", cls: "is-cheer" },
  mail:    { eyes: "happy",  mouth: "open",   left: ARM_LEFT_DOWN, right: ARM_RIGHT_UP,   acc: "envelope" },
  timer:   { eyes: "wide",   mouth: "wobble", left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "clock" },
  coffee:  { eyes: "sleepy", mouth: "smile",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "cup" },
  love:    { eyes: "happy",  mouth: "smile",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "heart" },
  /* تعبيران محيطيان بلا نص: يغطي عينيه عند كتابة كلمة المرور، ويرتجف عند امتحان جديد */
  cover:   { eyes: "open",   mouth: "calm",   left: "",            right: "",             acc: "cover" },
  shiver:  { eyes: "wide",   mouth: "wobble", left: ARM_LEFT_HOLD, right: ARM_RIGHT_HOLD, acc: "chill", cls: "is-shiver" },
  /* ===== الجولة الثالثة: حياة أكثر ===== */
  welcome:   { eyes: "happy",     mouth: "smile", left: ARM_LEFT_OPEN, right: ARM_RIGHT_UP,   cls: "is-welcome" },
  encourage: { eyes: "soft",      mouth: "grin",  left: ARM_LEFT_HIP,  right: ARM_RIGHT_PUMP, acc: "spark", cls: "is-pump" },
  win:       { eyes: "happy",     mouth: "open",  left: ARM_LEFT_UP,   right: ARM_RIGHT_UP,   acc: "trophy+spark", cls: "is-cheer" },
  alert:     { eyes: "alert",     mouth: "hmm",   left: ARM_LEFT_DOWN, right: ARM_RIGHT_UP,   acc: "bang", cls: "is-nudge" },
  ponder:    { eyes: "side",      mouth: "smirk", left: ARM_LEFT_DOWN, right: ARM_RIGHT_HOLD, acc: "dots" },
  focus:     { eyes: "focus",     mouth: "calm",  left: ARM_LEFT_HOLD, right: ARM_RIGHT_HOLD, acc: "note", cls: "is-focus" },
  surprised: { eyes: "surprised", mouth: "o",     left: ARM_LEFT_HOLD, right: ARM_RIGHT_HOLD, cls: "is-pop" },
  idea:      { eyes: "up",        mouth: "grin",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_UP,   acc: "bulb", cls: "is-pop" },
  calm:      { eyes: "closed",    mouth: "calm",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "leaf", cls: "is-calm" },
  guide:     { eyes: "side",      mouth: "smile", left: ARM_LEFT_DOWN, right: ARM_RIGHT_POINT, acc: "arrow", cls: "is-guide" },
  goodnight: { eyes: "sleepy",    mouth: "calm",  left: ARM_LEFT_DOWN, right: ARM_RIGHT_DOWN, acc: "moon", z: true }
};

/**
 * نبرة التعبير: تحدد لمسة بطاقة الرسالة وحركة دخولها (لا تغيّر نصًا ولا قرارًا).
 *   celebrate احتفال · alert تنبيه لطيف · calm هدوء/ليل · think تفكير وتركيز · warm ترحيب/تشجيع · (فارغ) محايد
 */
export const MOOD_TONE = {
  cheer: "celebrate", starstruck: "celebrate", win: "celebrate", money: "celebrate", proud: "celebrate",
  alert: "alert", timer: "alert", offline: "alert", scared: "alert", shock: "alert", surprised: "alert",
  sleepy: "calm", coffee: "calm", goodnight: "calm", sad: "calm", calm: "calm",
  think: "think", ponder: "think", focus: "think", glasses: "think", reading: "think", idea: "think",
  guide: "think", welcome: "warm", encourage: "warm", cheerUp: "warm", love: "warm", wave: "warm", wink: "warm", mail: "warm"
};
export const toneOfMood = (mood) => MOOD_TONE[mood] || "";

export const MOOD_NAMES = Object.keys(MOODS);

/**
 * يعيد نص SVG لبرعي.
 * @param {string} mood أحد MOOD_NAMES
 * @param {string} extraClass صنف إضافي (للمقاس)
 */
export function mascotSVG(mood = "wave", extraClass = "") {
  const m = MOODS[mood] || MOODS.wave;
  const cls = ["mascot", m.cls || "", extraClass].filter(Boolean).join(" ");
  return `
<svg class="${cls}" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
  <ellipse class="rb-shadow" cx="80" cy="152" rx="28" ry="5" fill="${INK}" opacity=".2"/>
  <g class="rb-float" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <line x1="80" y1="34" x2="80" y2="21"/>
    <circle class="rb-bulb" cx="80" cy="16" r="6" fill="#FF4654"/>
    <rect x="30" y="52" width="10" height="22" rx="5" fill="#FF4654"/>
    <rect x="120" y="52" width="10" height="22" rx="5" fill="#FF4654"/>
    <rect x="38" y="34" width="84" height="64" rx="24" fill="#FFFFFF"/>
    <rect x="48" y="44" width="64" height="44" rx="16" fill="${INK}"/>
    <g stroke="none"><g class="rb-eyes">${EYES[m.eyes]}</g>
      <circle cx="56" cy="76" r="4" fill="#FF8B97" opacity=".6"/>
      <circle cx="104" cy="76" r="4" fill="#FF8B97" opacity=".6"/>
    </g>
    ${MOUTH[m.mouth]}
    <rect x="54" y="104" width="52" height="38" rx="16" fill="#FF4654"/>
    <circle cx="80" cy="123" r="8" fill="#FFFFFF"/>
    <circle cx="80" cy="123" r="3" fill="#FF4654" stroke="none"/>
    ${m.left}
    <rect x="60" y="141" width="16" height="8" rx="4" fill="${INK}"/>
    <rect x="84" y="141" width="16" height="8" rx="4" fill="${INK}"/>
    ${m.right}
    ${m.acc ? String(m.acc).split("+").map((k) => ACC[k] || "").join("") : ""}
    ${m.z ? `<text class="rb-z" x="118" y="34" fill="#68666A" stroke="none">z</text><text class="rb-z" x="128" y="22" fill="#68666A" stroke="none">z</text>` : ""}
  </g>
</svg>`;
}

/** عنصر DOM يحمل رسم برعي. */
export function mascotEl(mood = "wave", extraClass = "") {
  const t = document.createElement("template");
  t.innerHTML = mascotSVG(mood, extraClass).trim();
  return t.content.firstElementChild;
}

/** قصاصات احتفال خفيفة (DOM + CSS، تُحذف تلقائيًا). تُتجاهل مع تقليل الحركة. */
export function confettiBurst(count = 36) {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#FF4654", "#E8B94F", "#4FAF83", "#6498EF", "#A58AE8", "#FF8B97"];
    const layer = document.createElement("div");
    layer.className = "cf-layer";
    layer.setAttribute("aria-hidden", "true");
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "cf-piece";
      p.style.left = (5 + Math.random() * 90) + "%";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--x", (Math.random() * 160 - 80).toFixed(0) + "px");
      p.style.setProperty("--r", (360 + Math.random() * 540).toFixed(0) + "deg");
      p.style.setProperty("--d", (1.8 + Math.random() * 1.2).toFixed(2) + "s");
      p.style.setProperty("--delay", (Math.random() * 0.5).toFixed(2) + "s");
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3800);
  } catch (e) { /* تجميلي فقط */ }
}
