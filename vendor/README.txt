ملفات المكتبات المحلية (مطلوبة لأن CSP لا تسمح إلا بـ self وcdnjs):
  gsap.min.js            GSAP 3.15.0          (بديل: cdnjs/ajax/libs/gsap/3.15.0/gsap.min.js)
  ScrollTrigger.min.js   ScrollTrigger 3.15.0 (بديل: cdnjs/ajax/libs/gsap/3.15.0/ScrollTrigger.min.js)
  lottie.min.js          lottie-web 5.13.0 (البناء الكامل) (بديل: cdnjs/ajax/libs/lottie-web/5.13.0/lottie.min.js)
المحمّل js/fx.js يقرأها من هنا أولًا، ثم من cdnjs بنفس الإصدار. وإن غابت كلها تعمل المنصة بالـ CSS فقط.
عند تغيير الإصدار حدّث V في js/fx.js وهذا الملف معًا.
