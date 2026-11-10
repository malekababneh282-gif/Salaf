import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "..")));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, PORT = 3000 } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
  console.error("Missing required environment variables.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function verifyTelegramInitData(initData) {
  if (!initData || initData.length > 10000) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate)) return null;
  if (Math.abs(Date.now() / 1000 - authDate) > 300) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TELEGRAM_BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let user;
  try { user = JSON.parse(params.get("user") || "{}"); } catch { return null; }
  if (!user.id) return null;
  return user;
}

app.post("/api/inquiries", async (req, res) => {
  const user = verifyTelegramInitData(req.get("X-Telegram-Init-Data"));
  if (!user) return res.status(401).json({ error: "تعذر التحقق من جلسة تيليجرام. أعد فتح التطبيق." });

  const { full_name, phone, governorate, requested_amount } = req.body || {};
  if (typeof full_name !== "string" || full_name.trim().length < 3 || full_name.length > 100)
    return res.status(400).json({ error: "يرجى إدخال الاسم بشكل صحيح." });
  if (typeof phone !== "string" || !/^[+0-9()\-\s]{7,20}$/.test(phone))
    return res.status(400).json({ error: "يرجى إدخال رقم هاتف صحيح." });
  if (typeof governorate !== "string" || governorate.length > 40)
    return res.status(400).json({ error: "يرجى اختيار المحافظة." });
  const allowedAmounts = ["5000000", "10000000", "other"];
  if (!allowedAmounts.includes(String(requested_amount)))
    return res.status(400).json({ error: "يرجى اختيار المبلغ." });

  const { data, error } = await supabase.from("loan_inquiries").insert({
    telegram_user_id: String(user.id),
    full_name: full_name.trim(),
    phone: phone.trim(),
    governorate,
    requested_amount: requested_amount === "other" ? null : Number(requested_amount),
    consent_given: true,
    status: "pending"
  }).select("id").single();

  if (error) {
    console.error("Supabase insert failed:", error.message);
    return res.status(500).json({ error: "تعذر حفظ الاستفسار حالياً." });
  }
  return res.json({ ok: true, reference: data.id.slice(0, 8).toUpperCase() });
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Salaf Fawri server listening on ${PORT}`));