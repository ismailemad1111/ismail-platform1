# برومبت متابعة — برعي (بعد الدفعة 1)

الحالة: نظام برعي مكتمل ومُختبَر (engine/memory/lines/brain/ui/ambient + ربط كل صفحات الطالب). الدفعة 1 أضافت الضغط اليدوي على برعي (tap.hello) وأصلحت حجب اللمس في ترويسة الرئيسية. قيود ثابتة: Frontend فقط، لا backend/Firestore/Worker/API، كل تخزين try/catch.

## المتبقي (الدفعة 2)
1. مراجعة بصرية بلقطات حقيقية لفقاعة tap على 360/390/430 (الرئيسية، الدروس، المساعد، الدخول).
2. زر «إخفاء برعي» سريع داخل الفقاعة اليدوية يضبط المستوى «صامت» ويعرض تراجعًا (اختياري، بعد قرار المستخدم).
3. تأكد يدويًا من تعارض tap مع بيضة العيد (5 ضغطات) على جهاز لمس حقيقي.
4. صفحة subscribe.html: نموذج واحد؛ تحقق من scrollIntoView للنجاح فقط.
التشغيل: node --test bank-tests/barai-engine.test.mjs ؛ ومن bank-tests/browser: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node barai.test.mjs (يحتاج node_modules لـ minimatch وplaywright).
