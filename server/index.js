import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "..")));

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
  TELEGRAM_GROUP_ID = "-5388219884", TELEGRAM_WEBHOOK_SECRET,
  PORT = 3000
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function telegram(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data.description || "Telegram API error");
  return data.result;
}
async function sendGroup(text) {
  return telegram("sendMessage", { chat_id: TELEGRAM_GROUP_ID, text });
}
function verifyTelegramInitData(initData) {
  if (!initData || initData.length > 10000) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 300) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TELEGRAM_BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(calculated, "hex"), b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const user = JSON.parse(params.get("user") || "{}");
    return user.id ? user : null;
  } catch { return null; }
}
const clean = v => String(v ?? "").trim().slice(0, 500);
const shortRef = id => String(id).slice(0, 8).toUpperCase();

app.post("/api/inquiries", async (req, res) => {
  const user = verifyTelegramInitData(req.get("X-Telegram-Init-Data"));
  if (!user) return res.status(401).json({ error: "تعذر التحقق من جلسة تيليجرام. أعد فتح التطبيق." });
  const { full_name, phone, governorate, requested_amount, consent } = req.body || {};
  if (consent !== true) return res.status(400).json({ error: "يجب الموافقة على إشعار الخصوصية." });
  if (typeof full_name !== "string" || full_name.trim().length < 3 || full_name.length > 100)
    return res.status(400).json({ error: "يرجى إدخال الاسم بشكل صحيح." });
  if (typeof phone !== "string" || !/^[+0-9()\-\s]{7,20}$/.test(phone))
    return res.status(400).json({ error: "يرجى إدخال رقم هاتف صحيح." });
  if (typeof governorate !== "string" || governorate.length > 40)
    return res.status(400).json({ error: "يرجى اختيار المحافظة." });
  const allowed = ["5000000", "10000000", "other"];
  if (!allowed.includes(String(requested_amount))) return res.status(400).json({ error: "يرجى اختيار المبلغ." });

  const { data, error } = await supabase.from("loan_inquiries").insert({
    telegram_user_id: String(user.id), full_name: full_name.trim(), phone: phone.trim(),
    governorate, requested_amount: requested_amount === "other" ? null : Number(requested_amount),
    consent_given: true, status: "pending"
  }).select("id").single();
  if (error) {
    console.error("Supabase insert failed:", error.message);
    return res.status(500).json({ error: "تعذر حفظ الاستفسار حالياً." });
  }
  const ref = shortRef(data.id);
  try {
    await sendGroup(`📩 استفسار جديد #${ref}\nالاسم: ${full_name.trim()}\nالهاتف: ${phone.trim()}\nالمحافظة: ${governorate}\nالمبلغ: ${requested_amount === "other" ? "استفسار عن مبلغ آخر" : Number(requested_amount).toLocaleString("en-US") + " دينار"}\nالحالة: قيد المراجعة\n\nللبحث: /ref ${ref}`);
  } catch (e) { console.error("Telegram notification failed:", e.message); }
  return res.json({ ok: true, reference: ref });
});

async function isGroupAdmin(userId) {
  const member = await telegram("getChatMember", { chat_id: TELEGRAM_GROUP_ID, user_id: userId });
  return ["creator", "administrator"].includes(member.status);
}
async function handleAdminCommand(message) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = String(message.text || "").trim();
  if (String(chatId) !== String(TELEGRAM_GROUP_ID)) return;
  if (!userId || !text.startsWith("/")) return;
  let allowed = false;
  try { allowed = await isGroupAdmin(userId); } catch (e) {
    console.error("Could not verify group admin:", e.message);
    return telegram("sendMessage", { chat_id: chatId, text: "تعذر التحقق من صلاحية المشرف حالياً." });
  }
  if (!allowed) return; // تجاهل أوامر الأعضاء العاديين
  const [command, ...parts] = text.split(/\s+/);
  const arg = parts.join(" ").trim();
  if (command === "/start" || command === "/help") {
    return telegram("sendMessage", { chat_id: chatId, text:
      "لوحة إدارة المجموعة\n/stats — الإحصائيات\n/latest — آخر 5 استفسارات\n/ref رقم_مرجعي — البحث\n/status UUID pending|reviewing|completed|rejected — تحديث الحالة\n/title نص — عنوان الموقع\n/description نص — وصف الموقع" });
  }
  if (command === "/stats") {
    const { data, error } = await supabase.from("loan_inquiries").select("status");
    if (error) throw error;
    const c = { pending: 0, reviewing: 0, completed: 0, rejected: 0 };
    for (const x of data || []) c[x.status] = (c[x.status] || 0) + 1;
    return telegram("sendMessage", { chat_id: chatId, text:
      `الإجمالي: ${(data || []).length}\nجديد: ${c.pending}\nقيد المراجعة: ${c.reviewing}\nمكتمل: ${c.completed}\nمرفوض/مغلق: ${c.rejected}` });
  }
  if (command === "/latest") {
    const { data, error } = await supabase.from("loan_inquiries")
      .select("id,full_name,phone,status,created_at").order("created_at", { ascending: false }).limit(5);
    if (error) throw error;
    const lines = (data || []).map(x => `${shortRef(x.id)} | ${x.full_name} | ${x.phone} | ${x.status}`);
    return telegram("sendMessage", { chat_id: chatId, text: lines.join("\n") || "لا توجد استفسارات." });
  }
  if (command === "/ref") {
    if (!arg) return telegram("sendMessage", { chat_id: chatId, text: "استخدم: /ref XXXXXXXX" });
    const { data, error } = await supabase.from("loan_inquiries")
      .select("id,full_name,phone,governorate,requested_amount,status,created_at")
      .ilike("id", `${arg}%`).limit(2);
    if (error) throw error;
    if (!data?.length) return telegram("sendMessage", { chat_id: chatId, text: "لم يتم العثور على الاستفسار." });
    if (data.length > 1) return telegram("sendMessage", { chat_id: chatId, text: "المرجع غير محدد؛ أرسل أحرفاً أكثر." });
    const x = data[0];
    return telegram("sendMessage", { chat_id: chatId, text:
      `المرجع: ${shortRef(x.id)}\nUUID: ${x.id}\nالاسم: ${x.full_name}\nالهاتف: ${x.phone}\nالمحافظة: ${x.governorate}\nالمبلغ: ${x.requested_amount ?? "غير محدد"}\nالحالة: ${x.status}` });
  }
  if (command === "/status") {
    const [id, status] = parts;
    if (!id || !["pending", "reviewing", "completed", "rejected"].includes(status))
      return telegram("sendMessage", { chat_id: chatId, text: "الصيغة: /status UUID pending|reviewing|completed|rejected" });
    const { data, error } = await supabase.from("loan_inquiries").update({ status }).eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    return telegram("sendMessage", { chat_id: chatId, text: data ? "تم تحديث حالة الاستفسار." : "لم يتم العثور على UUID." });
  }
  if (command === "/title" || command === "/description") {
    if (!arg) return telegram("sendMessage", { chat_id: chatId, text: "اكتب النص بعد الأمر." });
    const field = command === "/title" ? "site_title" : "site_description";
    const { error } = await supabase.from("site_settings").upsert({ id: 1, [field]: arg.slice(0, 180), updated_at: new Date().toISOString() });
    if (error) throw error;
    return telegram("sendMessage", { chat_id: chatId, text: "تم حفظ الإعداد. (يلزم أن تقرأ الواجهة هذه الإعدادات لعرضها)." });
  }
  return telegram("sendMessage", { chat_id: chatId, text: "أمر غير معروف. أرسل /help" });
}

app.post("/telegram/webhook", async (req, res) => {
  if (!TELEGRAM_WEBHOOK_SECRET || req.get("X-Telegram-Bot-Api-Secret-Token") !== TELEGRAM_WEBHOOK_SECRET)
    return res.status(401).json({ error: "Unauthorized webhook" });
  res.status(200).json({ ok: true });
  const message = req.body?.message;
  if (message) {
    try { await handleAdminCommand(message); }
    catch (e) { console.error("Admin command failed:", e.message); }
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Salaf Fawri server listening on ${PORT}`));
