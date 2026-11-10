const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const app = document.querySelector("#app");
app.innerHTML = `
  <header class="hero">
    <div class="brand"><span class="mark">س</span><div><b>سلف فورية</b><small>استفسارات الخدمات التمويلية</small></div></div>
    <h1>أهلاً بك</h1>
    <p>قدّم استفساراً أولياً عن الخدمات المتاحة، وسنوضح لك الخطوات التالية.</p>
  </header>
  <main>
    <div class="notice"><b>تنويه مهم</b><br>هذه واجهة مستقلة للاستفسارات الأولية، وليست بوابة رسمية لمصرف الرافدين ولا تضمن الموافقة على أي تمويل. لا ترسل رقم بطاقة مصرفية أو كلمة مرور أو رمز تحقق أو صورة هوية.</div>
    <form id="inquiry">
      <label>الاسم الكامل<input name="full_name" autocomplete="name" maxlength="100" required placeholder="اكتب اسمك الكامل"></label>
      <label>رقم الهاتف<input name="phone" inputmode="tel" autocomplete="tel" maxlength="20" required placeholder="رقم الهاتف للتواصل"></label>
      <label>المحافظة
        <select name="governorate" required>
          <option value="">اختر المحافظة</option>
          ${["بغداد","البصرة","نينوى","أربيل","النجف","كربلاء","ذي قار","بابل","الأنبار","ديالى","كركوك","واسط","ميسان","المثنى","القادسية","صلاح الدين","دهوك","السليمانية"].map(x=>`<option>${x}</option>`).join("")}
        </select>
      </label>
      <label>المبلغ الذي ترغب بالاستفسار عنه
        <select name="requested_amount" required>
          <option value="">اختر المبلغ</option>
          <option value="5000000">5,000,000 دينار عراقي</option>
          <option value="10000000">10,000,000 دينار عراقي</option>
          <option value="other">مبلغ آخر / أريد الاستفسار</option>
        </select>
      </label>
      <label class="consent"><input type="checkbox" name="consent" required> أوافق على استخدام بيانات الاتصال التي أدخلتها للرد على استفساري، وأفهم أن إرسال الاستفسار لا يعني قبول طلب تمويل.</label>
      <button id="send" type="submit">إرسال الاستفسار</button>
      <p id="message" role="status"></p>
    </form>
  </main>
  <footer>سلف فورية · منصة استفسارات مستقلة</footer>
`;
const style = document.createElement("style");
style.textContent = `
*{box-sizing:border-box}body{margin:0;background:#f4f7f5;color:#17221d;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,Arial,sans-serif}
.hero{background:#087b53;color:white;padding:26px 20px 30px;border-radius:0 0 24px 24px}
.brand{display:flex;align-items:center;gap:10px}.mark{width:42px;height:42px;border-radius:13px;background:#fff;color:#087b53;display:grid;place-items:center;font-size:24px;font-weight:800}
.brand b{display:block;font-size:18px}.brand small{opacity:.85}.hero h1{font-size:28px;margin:25px 0 5px}.hero p{margin:0;line-height:1.7;color:#e4f5ec}
main{max-width:560px;margin:18px auto;padding:0 15px}.notice{background:#fff8e8;border:1px solid #f1d99b;color:#5b481a;border-radius:14px;padding:13px;line-height:1.65;font-size:13px;margin-bottom:17px}
form{background:white;padding:18px;border-radius:18px;box-shadow:0 4px 18px #183b2810}label{display:block;font-weight:650;margin:0 0 15px;font-size:14px}input:not([type=checkbox]),select{display:block;width:100%;margin-top:7px;border:1px solid #dce5df;border-radius:11px;padding:13px;font:inherit;background:#fff;color:#17221d;min-height:48px}
.consent{display:flex;align-items:flex-start;gap:9px;font-weight:400;line-height:1.6}.consent input{margin-top:4px;flex:0 0 auto}
button{width:100%;border:0;border-radius:12px;background:#087b53;color:white;font:inherit;font-weight:750;padding:14px;min-height:50px}button:disabled{opacity:.6}#message{font-size:14px;line-height:1.6}footer{text-align:center;color:#718078;font-size:12px;padding:20px}
`;
document.head.append(style);

document.querySelector("#inquiry").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = document.querySelector("#send");
  const message = document.querySelector("#message");
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.consent) return;
  const user = tg?.initDataUnsafe?.user;
  if (!tg?.initData || !user?.id) {
    message.textContent = "افتح التطبيق من داخل بوت تيليجرام لإرسال الاستفسار.";
    return;
  }
  button.disabled = true;
  message.textContent = "جارٍ إرسال الاستفسار…";
  try {
    const response = await fetch("/api/inquiries", {
      method: "POST",
      headers: {"Content-Type":"application/json", "X-Telegram-Init-Data":tg.initData},
      body: JSON.stringify({
        full_name: data.full_name.trim(),
        phone: data.phone.trim(),
        governorate: data.governorate,
        requested_amount: data.requested_amount
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "تعذر إرسال الاستفسار");
    message.textContent = `تم استلام استفسارك. الرقم المرجعي: ${result.reference}`;
    form.reset();
  } catch (err) {
    message.textContent = err.message || "حدث خطأ. حاول لاحقاً.";
  } finally {
    button.disabled = false;
  }
});