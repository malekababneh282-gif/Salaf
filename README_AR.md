# سلف فورية — Telegram Mini App (نسخة استفسارات أولية)

## ما الذي تفعله النسخة؟
- واجهة عربية RTL تعمل داخل Telegram Mini App.
- تتحقق من `Telegram initData` على الخادم.
- تحفظ استفسارات الاتصال الأولية في Supabase.
- لا تجمع صور هويات أو بيانات بطاقات أو كلمات مرور أو OTP.
- تعرض بوضوح أنها منصة استفسارات مستقلة وليست بوابة رسمية للمصرف.

## المتطلبات
- Node.js 20+
- مشروع Supabase
- بوت Telegram تملكه وتديره
- استضافة تدعم Node.js ومتغيرات البيئة

## إعداد Supabase
نفّذ SQL التالي في SQL Editor. لا تمنح `anon` أو `authenticated` صلاحيات على الجدول؛ الخادم فقط يستخدم Service Role Key:

```sql
create table if not exists public.loan_inquiries (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null,
  full_name text not null,
  phone text not null,
  governorate text,
  requested_amount numeric,
  consent_given boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'completed', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.loan_inquiries enable row level security;
revoke all on table public.loan_inquiries from anon, authenticated;
```

## تشغيل محلي
1. انسخ `.env.example` إلى `.env`.
2. ضع القيم السرية في `.env` محلياً فقط.
3. شغّل `npm install`.
4. شغّل `npm start`.
5. افتح `http://localhost:3000` للاختبار الشكلي. إرسال النموذج يتطلب فتحه من Telegram عبر HTTPS.

## النشر
انشر المشروع على استضافة Node.js تدعم:
- أمر التشغيل: `npm start`
- متغيرات البيئة: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`
- HTTPS

لا تضع Service Role Key أو Bot Token في ملفات `public` أو في كود المتصفح أو GitHub.

## ربط زر البوت
بعد نشر الموقع والحصول على رابط HTTPS، افتح BotFather:
1. `/mybots`
2. اختر البوت.
3. Bot Settings ثم Menu Button (قد تختلف أسماء القوائم).
4. ضع رابط التطبيق المنشور.

يمكن أيضاً ضبط زر القائمة عبر Telegram Bot API `setChatMenuButton` من بيئة آمنة، مع `web_app.url` يساوي رابط HTTPS.

## تنبيهات تشغيلية
- هذه النسخة نموذج استقبال استفسارات فقط وليست نظام موافقات أو منح قروض.
- قبل استخدامها تجارياً، تحقق من التفويض والامتثال لقواعد الإعلان والخصوصية وحماية البيانات في العراق.
- احتفظ بأقل قدر ممكن من البيانات، وحدد من يحق له الوصول إليها وسياسة حذف واضحة.
- لا تطلب كلمات مرور مصرفية أو OTP أو أرقام بطاقات.
