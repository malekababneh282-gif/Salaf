import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..")));
const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN,
  TELEGRAM_GROUP_ID = "-5388219884", TELEGRAM_WEBHOOK_SECRET,
  ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_PANEL_SECRET, PORT = 3000
} = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
  console.error("Missing required environment variables."); process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const clean = (v, n=500) => String(v ?? "").trim().slice(0,n);
const shortRef = id => `SF-${String(id).replace(/-/g,"").slice(0,8).toUpperCase()}`;
async function telegram(method,payload){
  const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json(); if(!r.ok||!d.ok) throw new Error(d.description||"Telegram API error"); return d.result;
}
async function sendGroup(text, reply_markup){ return telegram("sendMessage",{chat_id:TELEGRAM_GROUP_ID,text, ...(reply_markup?{reply_markup}:{})}); }
function verifyTelegramInitData(initData){
  if(!initData||initData.length>10000)return null; const params=new URLSearchParams(initData); const hash=params.get("hash"); const authDate=Number(params.get("auth_date"));
  if(!hash||!Number.isFinite(authDate)||Math.abs(Date.now()/1000-authDate)>300)return null; params.delete("hash");
  const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret=crypto.createHmac("sha256","WebAppData").update(TELEGRAM_BOT_TOKEN).digest(); const calc=crypto.createHmac("sha256",secret).update(check).digest("hex");
  const a=Buffer.from(calc,"hex"),b=Buffer.from(hash,"hex"); if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{const u=JSON.parse(params.get("user")||"{}");return u.id?u:null;}catch{return null;}
}
const settingsDefaults={site_title:"سلف فورية",site_description:"منصة مستقلة للاستفسارات الأولية",logo_url:"",logo_slots:[{id:"header",label:"شعار أعلى الصفحة",placement:"header",image_url:"",enabled:true},{id:"hero",label:"شعار الواجهة الرئيسية",placement:"hero",image_url:"",enabled:true},{id:"footer",label:"شعار أسفل الصفحة",placement:"footer",image_url:"",enabled:true}],whatsapp_number:"",whatsapp_message_template:"مرحباً، قدمت استفساراً عبر موقع {site_title}. رقم الطلب: {reference}. الاسم: {full_name}. أود التواصل بخصوص استفساري.",primary_color:"#087b53",accent_color:"#c7a45b",background_color:"#f4f7f5",text_color:"#17221d",font_family:"Tahoma",language:"ar",form_fields:[
 {key:"full_name",label:"الاسم الكامل",type:"text",required:true,enabled:true,placeholder:"اكتب اسمك الكامل"},
 {key:"phone",label:"رقم الهاتف",type:"tel",required:true,enabled:true,placeholder:"مثال: 0791234567"},
 {key:"age",label:"العمر",type:"number",required:true,enabled:true,placeholder:"أدخل عمرك",min:18,max:100},
 {key:"employment_status",label:"الحالة الوظيفية",type:"select",required:true,enabled:true,options:["موظف","صاحب عمل","لا أعمل","متقاعد"]},
 {key:"occupation",label:"ما هي وظيفتك؟",type:"text",required:true,enabled:true,placeholder:"اكتب المسمى الوظيفي",show_if:{field:"employment_status",operator:"equals",value:"موظف"}},
 {key:"governorate",label:"المحافظة",type:"select",required:true,enabled:true,options:["بغداد","البصرة","نينوى","أربيل","النجف","كربلاء","ذي قار","بابل","الأنبار","ديالى","كركوك","واسط","ميسان","المثنى","القادسية","صلاح الدين","دهوك","السليمانية"]},
 {key:"requested_amount",label:"المبلغ المطلوب للاستفسار",type:"select",required:true,enabled:true,options:["5000000","10000000","other"]}
]};
function normalizeFormFields(input){
  const incoming=Array.isArray(input)?input:[];
  const byKey=new Map(incoming.filter(f=>f&&typeof f.key==="string").map(f=>[f.key,f]));
  // Required contact fields are always present so the UI and API cannot disagree.
  const core=settingsDefaults.form_fields.filter(f=>["full_name","phone"].includes(f.key));
  const merged=[...core.map(d=>({...d,...(byKey.get(d.key)||{}),key:d.key,type:d.type,enabled:true,required:true}))];
  const extras=settingsDefaults.form_fields.filter(f=>!["full_name","phone"].includes(f.key)).map(d=>({...d,...(byKey.get(d.key)||{})}));
  for(const f of incoming){if(!f?.key||["full_name","phone"].includes(f.key)||extras.some(x=>x.key===f.key))continue;extras.push(f)}
  const all=[...merged,...extras].slice(0,30);
  return all.map((f,i)=>({key:clean(f.key,40)||`field_${i+1}`,label:clean(f.label,80)||`خانة ${i+1}`,type:["text","tel","number","email","select","textarea","date","checkbox"].includes(f.type)?f.type:"text",required:!!f.required,enabled:f.enabled!==false,placeholder:clean(f.placeholder,120),options:Array.isArray(f.options)?f.options.slice(0,30).map(x=>clean(x,100)):[],...(f.min!==undefined&&f.min!==""?{min:Number(f.min)}:{}),...(f.max!==undefined&&f.max!==""?{max:Number(f.max)}:{}),...(f.show_if&&typeof f.show_if.field==="string"?{show_if:{field:clean(f.show_if.field,40),operator:["equals","not_equals","contains","greater_than","less_than"].includes(f.show_if.operator)?f.show_if.operator:"equals",value:clean(f.show_if.value,200)}}:{})}));
}
async function getSettings(){const {data,error}=await supabase.from("site_settings").select("*").eq("id",1).maybeSingle();if(error)throw error;const merged={...settingsDefaults,...(data||{}), ...(data?.settings_json||{})};merged.form_fields=normalizeFormFields(merged.form_fields);return merged;}
function signSession(payload){const body=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",ADMIN_PANEL_SECRET).update(body).digest("base64url");return `${body}.${sig}`;}
function readSession(token){try{const [body,sig]=String(token||"").split(".");if(!body||!sig)return null;const expected=crypto.createHmac("sha256",ADMIN_PANEL_SECRET).update(body).digest();const actual=Buffer.from(sig,"base64url");if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return null;const p=JSON.parse(Buffer.from(body,"base64url").toString());if(!p.exp||p.exp<Date.now())return null;return p;}catch{return null;}}
function requireAdmin(req,res,next){if(!ADMIN_USERNAME||!ADMIN_PASSWORD||!ADMIN_PANEL_SECRET)return res.status(503).json({error:"لوحة الإدارة غير مهيأة. أضف متغيرات الإدارة في Render."});const s=readSession(req.cookies?.salaf_admin || req.get("X-Admin-Session"));if(!s)return res.status(401).json({error:"يرجى تسجيل الدخول."});req.admin=s;next();}
// Minimal cookie parser, avoiding another dependency.
app.use((req,_res,next)=>{const raw=req.headers.cookie||"";req.cookies=Object.fromEntries(raw.split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));next();});
const loginAttempts=new Map();
app.post("/api/admin/login",(req,res)=>{
  if(!ADMIN_USERNAME||!ADMIN_PASSWORD||!ADMIN_PANEL_SECRET)return res.status(503).json({error:"إعدادات لوحة الإدارة غير مكتملة."});
  const ip=req.ip||"unknown", now=Date.now(), old=loginAttempts.get(ip)||{count:0,until:0};if(old.until>now&&old.count>=8)return res.status(429).json({error:"محاولات كثيرة. حاول لاحقاً."});
  const u=clean(req.body?.username,100),p=String(req.body?.password||"");const ok=crypto.timingSafeEqual(Buffer.from(u.padEnd(100,"\0").slice(0,100)),Buffer.from(String(ADMIN_USERNAME).padEnd(100,"\0").slice(0,100)))&&crypto.timingSafeEqual(crypto.createHash("sha256").update(p).digest(),crypto.createHash("sha256").update(String(ADMIN_PASSWORD)).digest());
  if(!ok){old.count++;old.until=old.count>=8?now+15*60*1000:0;loginAttempts.set(ip,old);return res.status(401).json({error:"اسم المستخدم أو كلمة المرور غير صحيحة."});}
  loginAttempts.delete(ip);const token=signSession({user:u,exp:now+8*60*60*1000});res.setHeader("Set-Cookie",`salaf_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);res.json({ok:true,user:u});
});
app.post("/api/admin/logout",(_req,res)=>{res.setHeader("Set-Cookie","salaf_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");res.json({ok:true});});
app.get("/api/admin/me",requireAdmin,(req,res)=>res.json({ok:true,user:req.admin.user}));
app.get("/api/site-settings",async(_req,res)=>{try{const s=await getSettings();delete s.settings_json;res.json(s);}catch(e){console.error(e);res.status(500).json({error:"تعذر تحميل إعدادات الموقع."});}});
app.get("/api/admin/settings",requireAdmin,async(_req,res)=>{try{res.json(await getSettings());}catch(e){console.error(e);res.status(500).json({error:"تعذر تحميل الإعدادات."});}});
async function audit(action,details={}){try{await supabase.from("admin_audit_log").insert({actor:"admin",action,details});}catch(e){console.error("audit log:",e.message);}}
app.put("/api/admin/settings",requireAdmin,async(req,res)=>{
  const b=req.body||{};const allowed={site_title:clean(b.site_title,100)||settingsDefaults.site_title,site_description:clean(b.site_description,500),logo_url:clean(b.logo_url,1000),logo_slots:Array.isArray(b.logo_slots)?b.logo_slots.slice(0,12).map((x,i)=>({id:clean(x.id,40)||`logo_${i+1}`,label:clean(x.label,80)||`موضع شعار ${i+1}`,placement:["header","hero","footer","contact","custom"].includes(x.placement)?x.placement:"custom",image_url:clean(x.image_url,1000),enabled:x.enabled!==false})):settingsDefaults.logo_slots,whatsapp_number:clean(b.whatsapp_number,20).replace(/[^0-9]/g,""),whatsapp_message_template:clean(b.whatsapp_message_template,1000)||settingsDefaults.whatsapp_message_template,primary_color:/^#[0-9a-fA-F]{6}$/.test(b.primary_color)?b.primary_color:settingsDefaults.primary_color,accent_color:/^#[0-9a-fA-F]{6}$/.test(b.accent_color)?b.accent_color:settingsDefaults.accent_color,background_color:/^#[0-9a-fA-F]{6}$/.test(b.background_color)?b.background_color:settingsDefaults.background_color,text_color:/^#[0-9a-fA-F]{6}$/.test(b.text_color)?b.text_color:settingsDefaults.text_color,font_family:["Tahoma","Arial","system-ui"].includes(b.font_family)?b.font_family:"Tahoma",language:["ar","en","both"].includes(b.language)?b.language:"ar",form_fields:normalizeFormFields(b.form_fields)};
  const {error}=await supabase.from("site_settings").upsert({id:1,site_title:allowed.site_title,site_description:allowed.site_description,settings_json:allowed,updated_at:new Date().toISOString()});if(error){console.error(error);return res.status(500).json({error:"تعذر حفظ الإعدادات. تحقق من ترقية قاعدة البيانات."});}await audit("settings_updated",{keys:Object.keys(allowed)});res.json({ok:true,settings:allowed});
});
app.get("/api/admin/inquiries",requireAdmin,async(req,res)=>{const q=clean(req.query.q,100),status=clean(req.query.status,20);let query=supabase.from("loan_inquiries").select("id,full_name,phone,governorate,requested_amount,status,created_at").order("created_at",{ascending:false}).limit(200);if(status&&["pending","reviewing","completed","rejected"].includes(status))query=query.eq("status",status);if(q)query=query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,id.ilike.%${q}%`);const {data,error}=await query;if(error)return res.status(500).json({error:"تعذر تحميل الطلبات."});res.json({items:data||[]});});
app.get("/api/admin/inquiries/:id",requireAdmin,async(req,res)=>{const {data,error}=await supabase.from("loan_inquiries").select("id,full_name,phone,governorate,requested_amount,status,created_at,custom_fields,consent_given").eq("id",req.params.id).maybeSingle();if(error)return res.status(500).json({error:"تعذر تحميل تفاصيل الطلب."});if(!data)return res.status(404).json({error:"الطلب غير موجود."});res.json({item:data,reference:shortRef(data.id)});});
app.patch("/api/admin/inquiries/:id/status",requireAdmin,async(req,res)=>{const status=clean(req.body?.status,20);if(!["pending","reviewing","completed","rejected"].includes(status))return res.status(400).json({error:"حالة غير صالحة."});const {data,error}=await supabase.from("loan_inquiries").update({status}).eq("id",req.params.id).select("id,status").maybeSingle();if(error)return res.status(500).json({error:"تعذر تحديث الحالة."});if(!data)return res.status(404).json({error:"الطلب غير موجود."});await audit("inquiry_status_changed",{id:data.id,status});try{await sendGroup(`🔔 تحديث حالة الطلب #${shortRef(data.id)}\nالحالة الجديدة: ${({pending:"جديد",reviewing:"قيد المراجعة",completed:"مكتمل",rejected:"مرفوض"})[status]}`);}catch(e){console.error("Telegram status notification:",e.message);}res.json({ok:true,item:data});});
app.get("/api/admin/stats",requireAdmin,async(_req,res)=>{const {data,error}=await supabase.from("loan_inquiries").select("status,created_at");if(error)return res.status(500).json({error:"تعذر تحميل الإحصائيات."});const rows=data||[],c={pending:0,reviewing:0,completed:0,rejected:0},now=Date.now(),today=new Date();today.setHours(0,0,0,0);let todayCount=0,weekCount=0;for(const x of rows){c[x.status]=(c[x.status]||0)+1;const t=Date.parse(x.created_at);if(Number.isFinite(t)){if(t>=today.getTime())todayCount++;if(t>=now-7*86400000)weekCount++;}}res.json({total:rows.length,...c,today:todayCount,last7days:weekCount});});
app.get("/api/admin/audit",requireAdmin,async(_req,res)=>{const {data,error}=await supabase.from("admin_audit_log").select("id,actor,action,details,created_at").order("created_at",{ascending:false}).limit(100);if(error)return res.status(500).json({error:"تعذر تحميل سجل النشاط."});res.json({items:data||[]});});
function normalizeDigits(value){return String(value??"").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[‎‏‪-‮]/g,"").trim();}
function fieldVisible(field, values){const c=field.show_if;if(!c||!c.field)return true;const actual=String(values[c.field]??"");const expected=String(c.value??"");switch(c.operator||"equals"){case"not_equals":return actual!==expected;case"contains":return actual.includes(expected);case"greater_than":return Number(actual)>Number(expected);case"less_than":return Number(actual)<Number(expected);case"equals":default:return actual===expected;}}
app.post("/api/inquiries",async(req,res)=>{
  try{
    const user=verifyTelegramInitData(req.get("X-Telegram-Init-Data"));
    if(!user)return res.status(401).json({error:"افتح التطبيق من داخل بوت تيليجرام."});
    const body=req.body||{};const currentSettings=await getSettings();
    const fields=(currentSettings.form_fields||[]).filter(f=>f.enabled!==false);
    const values={...body};
    const phone=normalizeDigits(body.phone).trim();
    if(body.consent!==true)return res.status(400).json({error:"يجب الموافقة على إشعار الخصوصية."});
    const nameField=fields.find(f=>f.key==="full_name");
    if(nameField?.required!==false&&(typeof body.full_name!=="string"||body.full_name.trim().length<3||body.full_name.trim().length>100))return res.status(400).json({error:"يرجى إدخال الاسم الكامل بشكل صحيح."});
    if(typeof body.full_name!=="string"||body.full_name.trim().length<3||body.full_name.trim().length>100)return res.status(400).json({error:"يرجى إدخال الاسم الكامل بشكل صحيح."});
    if(!/^[+0-9()\-\s]{7,20}$/.test(phone)||phone.replace(/\D/g,"").length<7)return res.status(400).json({error:"يرجى إدخال رقم هاتف صحيح مع مفتاح الدولة أو بصيغته المحلية."});
    const customFields={};
    for(const field of fields){
      if(["full_name","phone"].includes(field.key))continue;
      if(field.enabled===false||!fieldVisible(field,values))continue;
      let value=body[field.key];
      if(field.type==="checkbox")value=!!value;
      if(field.required&&(value===undefined||value===null||value===""||value===false))return res.status(400).json({error:`يرجى تعبئة خانة: ${clean(field.label,80)}`});
      if(value===undefined||value===null||value==="")continue;
      if(field.type==="number"){
        const n=Number(normalizeDigits(value));
        if(!Number.isFinite(n))return res.status(400).json({error:`يرجى إدخال رقم صحيح في خانة: ${clean(field.label,80)}`});
        if(field.min!==undefined&&n<Number(field.min))return res.status(400).json({error:`القيمة في خانة ${clean(field.label,80)} أقل من الحد المسموح.`});
        if(field.max!==undefined&&n>Number(field.max))return res.status(400).json({error:`القيمة في خانة ${clean(field.label,80)} أكبر من الحد المسموح.`});
        value=n;
      }
      if(field.type==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))return res.status(400).json({error:`يرجى إدخال بريد إلكتروني صحيح في خانة: ${clean(field.label,80)}`});
      if(field.type==="tel"){
        const v=normalizeDigits(value).trim();if(!/^[+0-9()\-\s]{7,20}$/.test(v)||v.replace(/\D/g,"").length<7)return res.status(400).json({error:`يرجى إدخال رقم هاتف صحيح في خانة: ${clean(field.label,80)}`});value=v;
      }
      if(field.type==="select"&&Array.isArray(field.options)&&!field.options.map(String).includes(String(value)))return res.status(400).json({error:`الخيار المحدد غير صالح في خانة: ${clean(field.label,80)}`});
      customFields[field.key]=typeof value==="string"?clean(value,1000):value;
    }
    const governorate=clean(body.governorate,40),requestedAmount=String(body.requested_amount??"");
    const {data,error}=await supabase.from("loan_inquiries").insert({telegram_user_id:String(user.id),full_name:body.full_name.trim(),phone,governorate,requested_amount:["5000000","10000000"].includes(requestedAmount)?Number(requestedAmount):null,custom_fields:customFields,consent_given:true,status:"pending"}).select("id").single();
    if(error){console.error("insert:",error.message);return res.status(500).json({error:"تعذر حفظ الاستفسار حالياً."});}
    const ref=shortRef(data.id);
    try{await sendGroup(`📩 طلب جديد — سلف فورية\nالمرجع: #${ref}\nالاسم: ${body.full_name.trim()}\nالحالة: جديد\nافتح التفاصيل من الزر أدناه.`,{inline_keyboard:[[{text:"📄 عرض الطلب وإدارته",callback_data:`inquiry:${data.id}`}],[{text:"📊 الإحصائيات",callback_data:"admin:stats"},{text:"📥 أحدث الطلبات",callback_data:"admin:latest"}]]});}catch(e){console.error("Telegram notify:",e.message);}
    const waNumber=String(currentSettings.whatsapp_number||"").replace(/\D/g,"");
    const template=String(currentSettings.whatsapp_message_template||settingsDefaults.whatsapp_message_template);
    const waMessage=template.replaceAll("{site_title}",currentSettings.site_title||"سلف فورية").replaceAll("{reference}",ref).replaceAll("{full_name}",body.full_name.trim()).replaceAll("{phone}",phone);
    const whatsappUrl=/^\d{8,15}$/.test(waNumber)?`https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`:null;
    return res.json({ok:true,reference:ref,whatsapp_url:whatsappUrl});
  }catch(e){console.error("inquiry submission:",e);return res.status(500).json({error:"حدث خطأ غير متوقع أثناء معالجة الاستفسار."});}
});
async function isGroupAdmin(userId){const m=await telegram("getChatMember",{chat_id:TELEGRAM_GROUP_ID,user_id:userId});return ["creator","administrator"].includes(m.status);}
async function handleAdminCommand(message){const chatId=message.chat.id,userId=message.from?.id,text=String(message.text||"").trim();if(String(chatId)!==String(TELEGRAM_GROUP_ID)||!userId)return;let allowed=false;try{allowed=await isGroupAdmin(userId);}catch(e){console.error("admin check:",e.message);return;}if(!allowed)return;const [cmd,...parts]=text.split(/\s+/),arg=parts.join(" ").trim();
  if(["/start","/help","/panel"].includes(cmd))return telegram("sendMessage",{chat_id:chatId,text:"🛠 مركز إدارة سلف فورية\nاختر الخدمة:",reply_markup:{inline_keyboard:[[{text:"📊 الإحصائيات",callback_data:"admin:stats"},{text:"📥 أحدث الطلبات",callback_data:"admin:latest"}],[{text:"🎨 إعدادات الموقع",callback_data:"admin:settings"},{text:"🌐 لوحة الويب",url:process.env.PUBLIC_SITE_URL||"https://salaf-0zmu.onrender.com/admin"}]]}});
  if(cmd==="/stats"){const {data,error}=await supabase.from("loan_inquiries").select("status");if(error)throw error;const c={pending:0,reviewing:0,completed:0,rejected:0};for(const x of data||[])c[x.status]=(c[x.status]||0)+1;return telegram("sendMessage",{chat_id:chatId,text:`الإجمالي: ${(data||[]).length}\nجديد: ${c.pending}\nمراجعة: ${c.reviewing}\nمكتمل: ${c.completed}\nمرفوض: ${c.rejected}`});}
  if(cmd==="/latest"){const {data,error}=await supabase.from("loan_inquiries").select("id,full_name,phone,status").order("created_at",{ascending:false}).limit(5);if(error)throw error;return telegram("sendMessage",{chat_id:chatId,text:(data||[]).map(x=>`#${shortRef(x.id)} ${x.full_name} — ${x.phone} — ${x.status}`).join("\n")||"لا توجد طلبات."});}
  if(cmd==="/title"||cmd==="/description"){if(!arg)return telegram("sendMessage",{chat_id:chatId,text:"اكتب النص بعد الأمر."});const s=await getSettings();const next={...s,[cmd==="/title"?"site_title":"site_description"]:arg};const {error}=await supabase.from("site_settings").upsert({id:1,site_title:next.site_title,site_description:next.site_description,settings_json:next,updated_at:new Date().toISOString()});if(error)throw error;return telegram("sendMessage",{chat_id:chatId,text:"تم حفظ التعديل وسيظهر على الموقع."});}
  return telegram("sendMessage",{chat_id:chatId,text:"الأوامر: /panel /stats /latest /title النص /description النص"});
}
async function handleAdminCallback(q){
  const chatId=q.message?.chat?.id,userId=q.from?.id,data=String(q.data||"");
  if(String(chatId)!==String(TELEGRAM_GROUP_ID)||!userId)return;
  let allowed=false;try{allowed=await isGroupAdmin(userId);}catch(e){console.error("callback admin check:",e.message);}
  if(!allowed){await telegram("answerCallbackQuery",{callback_query_id:q.id,text:"هذه الخاصية للمشرفين فقط.",show_alert:true});return;}
  await telegram("answerCallbackQuery",{callback_query_id:q.id});
  if(data==="admin:stats"){
    const {data:rows,error}=await supabase.from("loan_inquiries").select("status");if(error)throw error;
    const c={pending:0,reviewing:0,completed:0,rejected:0};for(const x of rows||[])c[x.status]=(c[x.status]||0)+1;
    return telegram("sendMessage",{chat_id:chatId,text:`📊 إحصائيات سلف فورية\nالإجمالي: ${(rows||[]).length}\nجديد: ${c.pending}\nقيد المراجعة: ${c.reviewing}\nمكتمل: ${c.completed}\nمرفوض: ${c.rejected}`});
  }
  if(data==="admin:latest"){
    const {data:rows,error}=await supabase.from("loan_inquiries").select("id,full_name,phone,status").order("created_at",{ascending:false}).limit(5);if(error)throw error;
    return telegram("sendMessage",{chat_id:chatId,text:(rows||[]).map(x=>`#${shortRef(x.id)} ${x.full_name} — ${x.phone} — ${x.status}`).join("\n")||"لا توجد طلبات."});
  }
  if(data==="admin:settings"){
    const s=await getSettings();return telegram("sendMessage",{chat_id:chatId,text:`⚙️ إعدادات الموقع الحالية\nالاسم: ${s.site_title}\nالوصف: ${s.site_description}\nاللون الأساسي: ${s.primary_color}\nعدد خانات النموذج: ${(s.form_fields||[]).length}\n\nللتعديل الكامل استخدم لوحة الويب: ${process.env.PUBLIC_SITE_URL||"https://salaf-0zmu.onrender.com"}/admin`});
  }
  if(data.startsWith("inquiry:")){
    const id=data.slice(8);const {data:x,error}=await supabase.from("loan_inquiries").select("id,full_name,phone,governorate,requested_amount,status,created_at,custom_fields").eq("id",id).maybeSingle();if(error)throw error;if(!x)return telegram("sendMessage",{chat_id:chatId,text:"الطلب غير موجود."});
    const kb={inline_keyboard:[[{text:"قيد المراجعة",callback_data:`setstatus:${id}:reviewing`},{text:"مكتمل",callback_data:`setstatus:${id}:completed`}],[{text:"مرفوض",callback_data:`setstatus:${id}:rejected`},{text:"جديد",callback_data:`setstatus:${id}:pending`}]]};
    return telegram("sendMessage",{chat_id:chatId,text:`📄 الطلب #${shortRef(x.id)}\nالاسم: ${x.full_name}\nالهاتف: ${x.phone}\nالمحافظة: ${x.governorate||"—"}\nالمبلغ: ${x.requested_amount??"غير محدد"}\nالحالة: ${x.status}\nتاريخ التقديم: ${x.created_at||"—"}`,reply_markup:kb});
  }
  if(data.startsWith("setstatus:")){
    const [,id,status]=data.split(":");if(!["pending","reviewing","completed","rejected"].includes(status))return;
    const {data:x,error}=await supabase.from("loan_inquiries").update({status}).eq("id",id).select("id,status").maybeSingle();if(error)throw error;
    if(x){await audit("inquiry_status_changed_telegram",{id,status,actor:String(userId)});try{await sendGroup(`🔔 تحديث حالة الطلب #${shortRef(id)}\nالحالة الجديدة: ${({pending:"جديد",reviewing:"قيد المراجعة",completed:"مكتمل",rejected:"مرفوض"})[status]}`);}catch(e){console.error("status notification:",e.message);}}
    return telegram("sendMessage",{chat_id:chatId,text:x?`تم تحديث الطلب #${shortRef(id)} إلى ${status}.`:"الطلب غير موجود."});
  }
}
app.post("/telegram/webhook",async(req,res)=>{
  if(!TELEGRAM_WEBHOOK_SECRET||req.get("X-Telegram-Bot-Api-Secret-Token")!==TELEGRAM_WEBHOOK_SECRET)return res.status(401).json({error:"Unauthorized"});
  res.status(200).json({ok:true});
  const m=req.body?.message,q=req.body?.callback_query;
  try{if(m)await handleAdminCommand(m);else if(q)await handleAdminCallback(q);}catch(e){console.error("Telegram update failed:",e.message);}
});
app.get("/health",(_req,res)=>res.json({ok:true}));
app.get("/admin",(_req,res)=>res.sendFile(path.join(__dirname,"..","admin","index.html")));
app.listen(PORT,()=>console.log(`Salaf Fawri listening on ${PORT}`));
