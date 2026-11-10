const tg = window.Telegram?.WebApp;
tg?.ready?.();
tg?.expand?.();
const app = document.querySelector('#app');
const fallback = {
  site_title: 'سلف فورية', site_description: 'قدّم استفسارك الأولي بسهولة وسنتواصل معك.',
  primary_color: '#087b53', accent_color: '#c7a45b', background_color: '#f4f7f5', text_color: '#17221d', logo_url: '', logo_slots: [],
  form_fields: [
    {key:'full_name',label:'الاسم بالكامل',type:'text',required:true,enabled:true,placeholder:'اكتب اسمك كما يظهر في هويتك'},
    {key:'phone',label:'رقم الهاتف المربوط بالواتساب',type:'tel',required:true,enabled:true,placeholder:'مثال: 0791234567'},
    {key:'age',label:'العمر',type:'number',required:true,enabled:true,min:18,max:65,placeholder:'العمر بين 18 و65 سنة'},
    {key:'requested_amount',label:'المبلغ المطلوب',type:'select',required:true,enabled:true,options:['5000000','10000000']},
    {key:'salary',label:'الراتب الشهري',type:'select',required:true,enabled:true,options:['100000-300000','300000-500000','500000-700000','700000-1000000','1000000+']},
    {key:'has_k_services',label:'هل لديك تطبيق خدمات كي؟',type:'select',required:true,enabled:true,options:['نعم','لا']},
    {key:'employment_status',label:'الحالة الوظيفية',type:'select',required:true,enabled:true,options:['موظف','متقاعد','عاطل عن العمل']},
    {key:'occupation',label:'ما هي وظيفتك؟',type:'text',required:true,enabled:true,placeholder:'اكتب المسمى الوظيفي',show_if:{field:'employment_status',operator:'equals',value:'موظف'}}
  ]
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeDigits = s => String(s ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
function labelForOption(key, value) {
  const v = String(value);
  if (key === 'requested_amount') return ({'5000000':'5 مليون','10000000':'10 ملايين'})[v] || v;
  if (key === 'salary') return ({'100000-300000':'من 100 ألف إلى 300 ألف','300000-500000':'من 300 ألف إلى 500 ألف','500000-700000':'من 500 ألف إلى 700 ألف','700000-1000000':'من 700 ألف إلى مليون','1000000+':'أكثر من مليون'})[v] || v;
  return v;
}
function normalizedFields(settings) {
  const configured = Array.isArray(settings.form_fields) ? settings.form_fields : fallback.form_fields;
  const byKey = new Map(configured.filter(x => x?.key).map(x => [x.key, x]));
  const fields = fallback.form_fields.map(base => ({...base, ...(byKey.get(base.key) || {})}));
  for (const f of configured) if (f?.key && !fields.some(x => x.key === f.key) && f.key !== 'governorate' && f.key !== 'consent') fields.push(f);
  return fields.filter(f => f.enabled !== false && f.key !== 'governorate' && f.key !== 'consent').map(f => {
    if (f.key === 'age') return {...f, type:'number', min:18, max:65, required:true};
    if (f.key === 'occupation') return {...f, show_if:{field:'employment_status',operator:'equals',value:'موظف'}, required:true};
    return f;
  });
}
function isVisible(field, form) {
  const c = field.show_if; if (!c?.field) return true;
  const value = String(new FormData(form).get(c.field) || ''), expected = String(c.value ?? '');
  switch (c.operator || 'equals') {
    case 'not_equals': return value !== expected;
    case 'contains': return value.includes(expected);
    case 'greater_than': return Number(value) > Number(expected);
    case 'less_than': return Number(value) < Number(expected);
    default: return value === expected;
  }
}
function updateConditional(form) {
  form.querySelectorAll('[data-show-if]').forEach(wrap => {
    let c; try { c = JSON.parse(wrap.dataset.showIf); } catch { return; }
    const v = String(new FormData(form).get(c.field) || ''), expected = String(c.value ?? '');
    const show = c.operator === 'not_equals' ? v !== expected : c.operator === 'contains' ? v.includes(expected) : c.operator === 'greater_than' ? Number(v) > Number(expected) : c.operator === 'less_than' ? Number(v) < Number(expected) : v === expected;
    wrap.hidden = !show;
    const input = wrap.querySelector('input,select,textarea');
    if (input) { input.required = show && wrap.dataset.required === 'true'; if (!show) { input.required = false; input.value = ''; } }
  });
}
function render(settings) {
  const fields = normalizedFields(settings);
  const slots = (settings.logo_slots || []).filter(x => x.enabled !== false && x.image_url);
  const logoAt = place => slots.filter(x => x.placement === place).map(x => `<img class="placed-logo" src="${esc(x.image_url)}" alt="${esc(x.label || 'الشعار')}">`).join('');
  const controls = fields.map(f => {
    const req = f.required ? 'required' : '';
    let control = '';
    if (f.type === 'select') {
      control = `<select name="${esc(f.key)}" ${req}><option value="">اختر من القائمة</option>${(f.options || []).map(o => `<option value="${esc(o)}">${esc(labelForOption(f.key,o))}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') control = `<textarea name="${esc(f.key)}" ${req} placeholder="${esc(f.placeholder || '')}"></textarea>`;
    else control = `<input name="${esc(f.key)}" type="${['text','tel','number','email','date'].includes(f.type) ? f.type : 'text'}" ${req} ${f.min !== undefined ? `min="${esc(f.min)}"` : ''} ${f.max !== undefined ? `max="${esc(f.max)}"` : ''} placeholder="${esc(f.placeholder || '')}" autocomplete="${f.key === 'phone' ? 'tel' : f.key === 'full_name' ? 'name' : 'off'}">`;
    const condition = f.show_if ? `data-show-if="${esc(JSON.stringify(f.show_if))}" hidden` : '';
    return `<label class="form-field" ${condition} data-required="${f.required ? 'true' : 'false'}"><span>${esc(f.label)}${f.required ? '<i>*</i>' : ''}</span>${control}<small class="field-error" aria-live="polite"></small></label>`;
  }).join('');
  app.innerHTML = `
    <header class="site-header"><div class="header-inner"><div class="brand">${settings.logo_url ? `<img src="${esc(settings.logo_url)}" alt="الشعار">` : '<span class="mark">س</span>'}<div><b>${esc(settings.site_title || 'سلف فورية')}</b><small>خدمة مستقلة للاستفسارات الأولية</small></div></div>${logoAt('header')}<div class="hero-copy"><span class="eyebrow">خطوة أولى بسيطة</span><h1>ابدأ استفسارك<br>بكل سهولة</h1><p>${esc(settings.site_description || fallback.site_description)}</p></div>${logoAt('hero')}</div></header>
    <main><section class="trust-note"><span class="note-icon">i</span><div><b>معلومات مهمة</b><p>هذه منصة مستقلة لاستقبال الاستفسارات الأولية وليست مصرفاً أو جهة حكومية، ولا تضمن الموافقة أو صرف التمويل. تُستخدم بيانات الاتصال للرد على استفسارك فقط. لا ترسل كلمات مرور أو بيانات بطاقات أو رموز تحقق.</p></div></section>
    <section class="form-card"><div class="form-heading"><div><span class="eyebrow">نموذج إلكتروني</span><h2>بيانات الاستفسار</h2><p>يرجى تعبئة البيانات بدقة، جميع الحقول المطلوبة موضحة بعلامة *</p></div><span class="step-count">01 <small>/ 01</small></span></div><form id="inquiry" novalidate>${controls}<div class="form-message" id="message" role="status" aria-live="polite"></div><div id="wa-fallback"></div><button id="send" type="submit"><span>إرسال الاستفسار</span><span aria-hidden="true">←</span></button><p class="secure-note">بياناتك تُستخدم لمعالجة استفسارك والتواصل معك بشأنه.</p></form></section></main>
    <footer>${logoAt('footer')}<b>${esc(settings.site_title || 'سلف فورية')}</b><span>منصة مستقلة للاستفسارات الأولية</span></footer>`;
  const root = document.documentElement;
  root.style.setProperty('--primary', settings.primary_color || fallback.primary_color);
  root.style.setProperty('--accent', settings.accent_color || fallback.accent_color);
  root.style.setProperty('--bg', settings.background_color || fallback.background_color);
  root.style.setProperty('--fg', settings.text_color || fallback.text_color);
  root.style.setProperty('--font', ['Tahoma','Arial','system-ui'].includes(settings.font_family) ? settings.font_family : 'Tahoma');
  const form = app.querySelector('#inquiry');
  form.addEventListener('change', () => updateConditional(form));
  updateConditional(form);
}
(async () => {
  try { const r = await fetch('/api/site-settings'); render(r.ok ? await r.json() : fallback); }
  catch { render(fallback); }
})();
app.addEventListener('submit', async event => {
  if (event.target.id !== 'inquiry') return;
  event.preventDefault();
  const form = event.target, message = form.querySelector('#message'), button = form.querySelector('#send');
  updateConditional(form);
  for (const wrap of form.querySelectorAll('.form-field')) {
    if (wrap.hidden) continue;
    const input = wrap.querySelector('input,select,textarea'), error = wrap.querySelector('.field-error');
    error.textContent = '';
    if (input?.required && !input.value.trim()) { error.textContent = 'هذا الحقل مطلوب'; input.focus(); return; }
    if (input?.name === 'age' && input.value) {
      const age = Number(normalizeDigits(input.value));
      if (!Number.isInteger(age) || age < 18) { error.textContent = 'العمر يجب أن يكون 18 سنة أو أكثر'; input.focus(); return; }
      if (age > 65) { message.textContent = 'عذراً، أنت غير مشمول بشروط الاستفسار لأن الحد الأعلى للعمر هو 65 سنة.'; message.className = 'form-message error'; input.focus(); return; }
    }
    if (input?.type === 'tel' && input.value && !/^[+0-9٠-٩۰-۹()\-\s]{7,20}$/.test(input.value)) { error.textContent = 'أدخل رقم هاتف صحيحاً'; input.focus(); return; }
    if (input?.type === 'number' && input.value && !Number.isFinite(Number(normalizeDigits(input.value)))) { error.textContent = 'أدخل رقماً صحيحاً'; input.focus(); return; }
  }
  const raw = Object.fromEntries(new FormData(form).entries());
  const body = {...raw, phone: normalizeDigits(raw.phone)};
  for (const wrap of form.querySelectorAll('.form-field')) {
    if (wrap.hidden) { const input = wrap.querySelector('input,select,textarea'); if (input) delete body[input.name]; continue; }
    const input = wrap.querySelector('input,select,textarea');
    if (input?.type === 'number' && input.value) body[input.name] = Number(normalizeDigits(input.value));
  }
  button.disabled = true; button.classList.add('loading'); message.textContent = 'جارٍ إرسال الاستفسار…'; message.className = 'form-message';
  try {
    const headers = {'Content-Type':'application/json'};
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    const response = await fetch('/api/inquiries', {method:'POST',headers,body:JSON.stringify(body)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'تعذر إرسال الاستفسار');
    message.innerHTML = `<strong>تم استلام استفسارك بنجاح</strong><span>رقمك المرجعي: <b>${esc(result.reference)}</b></span>`;
    message.className = 'form-message success';
    if (result.whatsapp_url) {
      const box = form.querySelector('#wa-fallback');
      box.innerHTML = `<div class="wa-next"><b>الخطوة التالية</b><p>تابع إلى واتساب لاستكمال التواصل. إذا لم يفتح تلقائياً، اضغط الزر أدناه.</p><a href="${esc(result.whatsapp_url)}" target="_blank" rel="noopener">متابعة إلى واتساب</a></div>`;
      try { if (tg?.openLink) tg.openLink(result.whatsapp_url); else window.open(result.whatsapp_url, '_blank', 'noopener'); } catch {}
    }
    form.querySelectorAll('input,select,textarea,button').forEach(control => control.disabled = true);
  } catch (error) {
    message.textContent = error.message; message.className = 'form-message error'; button.disabled = false; button.classList.remove('loading');
  }
});
const style = document.createElement('style');
style.textContent = `
:root{--primary:#087b53;--accent:#c7a45b;--bg:#f4f7f5;--fg:#17221d;--font:Tahoma,Arial,sans-serif;color-scheme:light}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font),Arial,sans-serif;line-height:1.6}.site-header{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary),#092b20 28%));color:#fff;padding:24px 18px 48px;border-radius:0 0 30px 30px}.header-inner{max-width:680px;margin:auto}.brand{display:flex;align-items:center;gap:12px}.brand img,.mark{width:48px;height:48px;object-fit:contain;border-radius:15px;background:#fff;color:var(--primary);display:grid;place-items:center;font-size:25px;font-weight:900;padding:5px}.brand b,.brand small{display:block}.brand b{font-size:17px}.brand small{font-size:11px;opacity:.78}.placed-logo{display:block;max-width:100%;max-height:68px;object-fit:contain;margin:10px auto}.hero-copy{padding-top:35px}.eyebrow{font-size:11px;letter-spacing:.4px;color:var(--accent);font-weight:800}.hero-copy .eyebrow{color:#f4dba8}.hero-copy h1{font-size:clamp(28px,7vw,39px);line-height:1.25;margin:9px 0}.hero-copy p{margin:0;max-width:500px;color:#e5f2eb;font-size:14px}.brand .placed-logo{max-width:58px;max-height:44px;margin:0}main{max-width:620px;margin:-25px auto 0;padding:0 14px;position:relative}.trust-note{display:flex;gap:12px;background:#fff9e9;border:1px solid #f0dfb7;color:#5e4c25;border-radius:16px;padding:14px;margin-bottom:14px;box-shadow:0 5px 18px #193b2510}.note-icon{flex:0 0 25px;width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#f0dfb7;font-weight:900}.trust-note b{font-size:13px}.trust-note p{font-size:11px;line-height:1.7;margin:3px 0 0}.form-card{background:#fff;border:1px solid #e8eee9;border-radius:22px;padding:20px 17px;box-shadow:0 12px 35px #163c2810}.form-heading{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:22px}.form-heading h2{font-size:22px;margin:3px 0;color:var(--primary)}.form-heading p{font-size:11px;color:#748078;margin:0}.step-count{font-size:20px;font-weight:900;color:var(--primary);background:#eef7f1;border-radius:12px;padding:7px 10px;white-space:nowrap}.step-count small{font-size:10px;color:#8b9990}.form-field{display:block;margin:0 0 16px;font-size:13px;font-weight:700}.form-field>span{display:block;margin-bottom:6px}.form-field i{font-style:normal;color:#c14d42;margin-right:4px}input:not([type=checkbox]),select,textarea{display:block;width:100%;min-height:49px;margin-top:0;border:1px solid #dce6df;border-radius:12px;padding:12px 13px;font:inherit;font-size:14px;color:#1d2a22;background:#fbfdfb;outline:none;transition:border-color .15s,box-shadow .15s}input:focus,select:focus,textarea:focus{border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary),transparent 88%)}input::placeholder{color:#a1aca5}.field-error{display:block;color:#b42318;font-size:11px;font-weight:400;margin-top:5px}.form-message{margin:8px 0;font-size:13px}.form-message.error{color:#b42318;background:#fff1f0;padding:10px;border-radius:10px}.form-message.success{display:grid;gap:5px;color:#14633d;background:#eefaf2;padding:14px;border:1px solid #ccebd7;border-radius:13px}.form-message.success strong{font-size:15px}.form-message.success b{font-size:17px;letter-spacing:.5px}.form-field[hidden]{display:none!important}#send{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:52px;border:0;border-radius:13px;background:var(--primary);color:white;font:inherit;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 6px 15px color-mix(in srgb,var(--primary),transparent 78%)}#send:disabled{opacity:.6;cursor:wait}.secure-note{text-align:center;font-size:10px;color:#89958d;margin:10px 0 0}.wa-next{margin-top:12px;padding:14px;border:1px solid #b9e5cb;background:#effbf3;border-radius:14px}.wa-next p{font-size:12px;margin:4px 0 12px}.wa-next a{display:block;text-align:center;text-decoration:none;border-radius:11px;background:#168c4b;color:white;font-weight:800;padding:12px}footer{display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;color:#829087;font-size:11px;padding:25px 15px 30px}footer b{color:var(--primary);font-size:13px}footer .placed-logo{margin:0 auto 7px;max-height:45px}
`;
document.head.append(style);
