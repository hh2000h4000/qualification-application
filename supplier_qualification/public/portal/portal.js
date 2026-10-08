/* Supplier qualification portal — the applicant's side.
   The screens are the approved design; what changed is where the data lives: every
   read and write goes to supplier_qualification.api.applicant, and the applicant is
   whoever holds the session token a verification code bought. */

const API = '/api/method/supplier_qualification.api.applicant.';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const STEP_DEFS = {
  construction:[
    {key:'org', num:'أولاً', title:'معلومات المقاول'},
    {key:'docs', num:'ثانياً', title:'المستندات المطلوبة'},
    {key:'structure', num:'ثالثاً', title:'التنظيم'},
    {key:'capacity', num:'رابعاً', title:'القدرات'},
    {key:'experience', num:'خامساً', title:'الخبرات'},
    {key:'quality', num:'سادساً', title:'نظام الجودة'},
    {key:'financial', num:'سابعاً', title:'الوضع المالي'},
    {key:'ack', num:'ثامناً', title:'الإقرار والاعتماد'},
  ],
  om:[
    {key:'org', num:'أولاً', title:'معلومات المقاول'},
    {key:'docs', num:'ثانياً', title:'المستندات المطلوبة'},
    {key:'staff', num:'ثالثاً', title:'الكوادر التشغيلية'},
    {key:'capacity', num:'رابعاً', title:'القدرات التشغيلية'},
    {key:'experience', num:'خامساً', title:'الخبرات'},
    {key:'quality', num:'سادساً', title:'الجودة ومتابعة الأداء'},
    {key:'financial', num:'سابعاً', title:'الوضع المالي'},
    {key:'ack', num:'ثامناً', title:'الإقرار والاعتماد'},
  ],
  supplier:[
    {key:'org', num:'أولاً', title:'معلومات المورد'},
    {key:'activity', num:'ثانياً', title:'نشاط التوريد'},
    {key:'docs', num:'ثالثاً', title:'المستندات الأساسية'},
    {key:'ack', num:'رابعاً', title:'الإقرار والاعتماد'},
  ],
};

/* What the form is built from; filled from the server before the first screen. */
let CONFIG = {documents:{}, supply_categories:[]};

const TOKEN_KEY = 'sq-session';
function recall(key){ try{ return sessionStorage.getItem(key)||''; }catch(e){ return ''; } }
function remember(key, value){ try{ value?sessionStorage.setItem(key, value):sessionStorage.removeItem(key); }catch(e){} }

let S = {
  phase:'select',     // select -> gate -> otp -> mine | form -> confirmed
  wanted:null,        // the track picked before signing in; null means "show me my applications"
  track:null,
  email:recall(TOKEN_KEY+':email'), token:recall(TOKEN_KEY),
  step:0, data:null,
  mine:null, refNumber:'',
  error:'', busy:false,
};

/* ============ Server ============ */
function api(method, args, file){ return call(API, method, args, file); }
/* A refused token means the session ended: back to the email screen, saying so. */
function fail(e){
  S.busy = false;
  if(e.status===403){
    S.token=''; remember(TOKEN_KEY, ''); S.phase='gate'; S.error=e.message;
    render();
    return;
  }
  if(S.phase==='gate' || S.phase==='otp'){ S.error=e.message; render(); }
  else toast(e.message);
}
function serverTrack(){ return TRACKS[S.track].server; }

let draftTimer = null;
function saveDraft(){
  clearTimeout(draftTimer);
  draftTimer = setTimeout(()=>{
    if(S.phase!=='form') return;
    api('save_draft', {token:S.token, track:serverTrack(), data:S.data, step:S.step}).catch(e=>{ if(e.status===403) fail(e); });
  }, 800);
}

/* ============ Small helpers ============ */
function errorBox(){ return S.error?`<div class="demo-flag error-flag">${esc(S.error)}</div>`:''; }

/* ============ Form data ============ */
function emptyEngineerRow(){ return {name:'',job:'',specialty:'',years:'',certRef:''}; }
function emptyStaffRow(){ return {name:'',specialty:'',years:'',certRef:''}; }
function emptyProjectRow(){ return {name:'',components:'',owner:'',ownerAddress:'',contractValue:'',contractDuration:'',startDate:'',endDate:'',ownerContact:''}; }
function emptyOMProjectRow(){ return {name:'',sitesCount:'',owner:'',contractValue:'',contractDuration:'',startDate:'',endDate:'',ownerContact:''}; }
function emptyBudgetRow(){ return {year:'',file:'',fileName:'',note:''}; }
function documentRows(track){
  return (CONFIG.documents[TRACKS[track].server]||[]).map(name=>({name, expiry:'', ref:'', file:'', fileName:''}));
}
function baseOrgFields(){
  return {
    companyName:'', capital:'', crNumber:'', crDate:'', responsiblePerson:'', position:'',
    city:'', street:'', poBox:'', postalCode:'', phone:'', fax:'', email2:'', foundingYear:'',
  };
}
function contractorFields(){
  return {
    hasQualitySystem:'', qualityDetails:'', qualityRef:'', qualityFile:'', qualityFileName:'',
    budgetYears:[emptyBudgetRow(),emptyBudgetRow(),emptyBudgetRow()],
    hasDisputes:'', disputeDetails:'',
    bankStatementRef:'', bankStatementFile:'', bankStatementFileName:'', hasAccountingSystem:'',
    equipmentRef:'', equipmentFile:'', equipmentFileName:'',
  };
}
function ackFields(){ return {ackName:'', ackEmployee:'', ackDate:'', ackConfirmed:false}; }

function freshData(track){
  if(track==='construction'){
    return Object.assign(baseOrgFields(), contractorFields(), ackFields(), {
      documents: documentRows(track),
      engineers:[emptyEngineerRow()], supervisors:[emptyEngineerRow()],
      hasOperationalStaff:'',
      orgChartRef:'', orgChartFile:'', orgChartFileName:'',
      projects:[emptyProjectRow()],
    });
  }
  if(track==='om'){
    return Object.assign(baseOrgFields(), contractorFields(), ackFields(), {
      documents: documentRows(track),
      supervisors:[emptyStaffRow()], technicians:[emptyStaffRow()],
      residentCleanerCommitted:false,
      vehiclesCount:'', hasUniforms:'',
      projects:[emptyOMProjectRow()],
    });
  }
  return Object.assign(ackFields(), {
    companyName:'', crNumber:'', responsiblePerson:'', position:'',
    city:'', phone:'', email2:'',
    supplyCategories:[], categoryOther:'', activityDesc:'',
    documents: documentRows(track),
  });
}

/* ============ Rendering ============ */
const app = document.getElementById('app');

function render(){
  if(S.phase==='select') return renderSelect();
  if(S.phase==='gate') return renderGate();
  if(S.phase==='otp') return renderOtp();
  if(S.phase==='confirmed') return renderConfirm();
  if(S.phase==='mine') return renderMine();
  return renderForm();
}

function gateLabel(){ return S.wanted ? TRACKS[S.wanted].label : 'طلباتي'; }
function sessionBar(){
  return `<div class="top-links">
    <button class="link-btn" onclick="showMine()">طلباتي</button>
    <button class="link-btn" onclick="signOut()">خروج (<span dir="ltr">${esc(S.email)}</span>)</button>
  </div>`;
}

function goHome(){ S.phase='select'; S.error=''; render(); }
/* Both doors lead through the same sign-in: a track card, or "my applications". */
function enter(track){
  S.wanted = track; S.error='';
  if(!S.token){ S.phase='gate'; render(); return; }
  if(track) openForm(track); else showMine();
}
async function openForm(track){
  try{
    S.track = track;
    const draft = await api('get_draft', {token:S.token, track:serverTrack()});
    S.data = Object.assign(freshData(track), draft?draft.data:{});
    S.step = draft?Math.min(draft.step||0, STEP_DEFS[track].length-1):0;
    S.busy=false; S.phase='form';
    render();
    window.scrollTo({top:0});
  }catch(e){ fail(e); }
}
async function showMine(){
  clearTimeout(draftTimer);
  try{
    if(S.phase==='form') await api('save_draft', {token:S.token, track:serverTrack(), data:S.data, step:S.step});
    S.mine = await api('my_applications', {token:S.token});
    S.busy=false; S.phase='mine';
    render();
    window.scrollTo({top:0});
  }catch(e){ fail(e); }
}
function signOut(){
  api('sign_out', {token:S.token}).catch(()=>{});
  S.token=''; S.mine=null; S.data=null;
  remember(TOKEN_KEY, '');
  goHome();
}

function renderSelect(){
  app.innerHTML = `
    ${letterheadHtml('اختر نوع النشاط لبدء طلب التأهيل')}
    <div class="track-intro">
      <h2>ما هو نشاطكم؟</h2>
      <p>اختر التصنيف الأقرب لطبيعة نشاط منشأتكم لعرض استمارة التأهيل المناسبة له.</p>
    </div>
    <div class="track-grid">
      ${Object.keys(TRACKS).map(key=>{
        const t = TRACKS[key];
        return `<div class="track-card" onclick="enter('${key}')">
          <div class="track-icon">${t.icon}</div>
          <div class="track-eyebrow">${t.eyebrow}</div>
          <h3>${t.label}</h3>
          <p>${t.desc}</p>
          <div class="go">ابدأ طلب التأهيل ←</div>
        </div>`;
      }).join('')}
    </div>
    ${S.token?sessionBar():`<div class="top-links">
      <button class="link-btn" onclick="enter(null)">سبق أن قدّمت؟ ادخل لمتابعة طلباتك</button>
    </div>`}
    ${footerNote()}
  `;
}

/* ---------- Sign-in: the organisation's email, then the code sent to it ---------- */
function renderGate(){
  app.innerHTML = `
    ${letterheadHtml('التحقق من البريد الإلكتروني — '+gateLabel())}
    <div class="gate">
      <h2>الدخول بالبريد الإلكتروني</h2>
      <p>${S.wanted
        ? 'أدخل البريد الإلكتروني الرسمي للمنشأة. سنرسل رمز تحقق مكوّن من 6 أرقام لتأكيد هويتكم قبل بدء التعبئة.'
        : 'أدخل البريد الإلكتروني الذي قدّمتم به. سنرسل رمز تحقق مكوّن من 6 أرقام، وبعده تظهر طلباتكم وحالتها.'}</p>
      <div class="field" style="text-align:right">
        <label>البريد الإلكتروني للمنشأة <span class="req">*</span></label>
        <input type="email" id="gateEmail" dir="ltr" placeholder="info@company.com" value="${esc(S.email)}" onkeydown="if(event.key==='Enter')handleSendOtp()">
      </div>
      ${errorBox()}
      <button class="btn btn-primary" style="width:100%;margin-top:10px" ${S.busy?'disabled':''} onclick="handleSendOtp()">إرسال رمز التحقق</button>
      <button class="change-track" style="margin-top:14px" onclick="goHome()">رجوع للصفحة الرئيسية</button>
    </div>
    <p class="footer-note">هذه بوابة رسمية تابعة لـ${ORG_NAME} لاستقبال طلبات تأهيل الموردين والمقاولين ولا تُستخدم لأي غرض آخر.</p>
  `;
}

async function handleSendOtp(){
  if(S.busy) return;
  const email = document.getElementById('gateEmail').value.trim();
  if(!email || !email.includes('@')){ S.error='الرجاء إدخال بريد إلكتروني صحيح.'; render(); return; }
  S.email = email; S.error=''; S.busy=true;
  render();
  try{
    await api('send_code', {email});
    S.busy=false; S.phase='otp';
    render();
  }catch(e){ fail(e); }
}

function renderOtp(){
  app.innerHTML = `
    ${letterheadHtml('تم إرسال رمز التحقق — '+gateLabel())}
    <div class="gate">
      <h2>أدخل رمز التحقق</h2>
      <p>أرسلنا رمزاً مكوّناً من 6 أرقام إلى <strong dir="ltr">${esc(S.email)}</strong>، وهو صالح لمدة 10 دقائق.</p>
      <div class="otp-box">
        ${[0,1,2,3,4,5].map(i=>`<input inputmode="numeric" autocomplete="one-time-code" data-i="${i}" oninput="handleOtpDigit(event,${i})" onkeydown="if(event.key==='Enter')handleVerifyOtp()">`).join('')}
      </div>
      ${errorBox()}
      <button class="btn btn-primary" style="width:100%;margin-top:16px" ${S.busy?'disabled':''} onclick="handleVerifyOtp()">${S.wanted?'تأكيد ومتابعة التقديم':'تأكيد وعرض طلباتي'}</button>
      <button class="btn btn-ghost" style="width:100%;margin-top:8px" onclick="S.phase='gate';S.error='';render();">تغيير البريد الإلكتروني أو إعادة الإرسال</button>
    </div>
  `;
  setTimeout(()=>{ const f=document.querySelector('.otp-box input'); if(f) f.focus(); },30);
}
/* One digit per box — but a code pasted or filled in at once is spread across them. */
function handleOtpDigit(e,i){
  const digits = latinDigits(e.target.value).replace(/[^0-9]/g,'');
  const boxes = Array.from(document.querySelectorAll('.otp-box input'));
  e.target.value = '';
  if(!digits) return;
  digits.split('').slice(0, 6-i).forEach((d,k)=>{ boxes[i+k].value = d; });
  boxes[Math.min(i+digits.length, 5)].focus();
}
async function handleVerifyOtp(){
  if(S.busy) return;
  const code = Array.from(document.querySelectorAll('.otp-box input')).map(i=>i.value).join('');
  if(code.length<6){ S.error='الرجاء إدخال الرمز كاملاً.'; render(); return; }
  S.error=''; S.busy=true;
  try{
    S.token = (await api('verify_code', {email:S.email, code})).token;
    remember(TOKEN_KEY, S.token);
    remember(TOKEN_KEY+':email', S.email);
  }catch(e){ fail(e); return; }
  if(S.wanted) openForm(S.wanted); else showMine();
}

/* ============ Field helpers (generic, operate on S.data) ============ */
function fld(label, id, value, opts={}){
  const req = opts.required?'<span class="req">*</span>':'';
  return `<div class="field">
    <label>${label} ${req}</label>
    <input type="${opts.type||'text'}" id="${id}" value="${esc(value)}" placeholder="${esc(opts.placeholder||'')}" oninput="setVal('${id}', this.value)">
  </div>`;
}
function ta(label,id,value,opts={}){
  return `<div class="field">
    <label>${label}${opts.required?'<span class="req">*</span>':''}</label>
    <textarea id="${id}" oninput="setVal('${id}', this.value)">${esc(value)}</textarea>
  </div>`;
}
function radio(label,id,value,name){
  return `<div class="field">
    <label>${label}</label>
    <div class="radio-row">
      <label><input type="radio" name="${name}" ${value==='نعم'?'checked':''} onchange="setVal('${id}','نعم');render();"> نعم</label>
      <label><input type="radio" name="${name}" ${value==='لا'?'checked':''} onchange="setVal('${id}','لا');render();"> لا</label>
    </div>
  </div>`;
}
/* A link, a file, or both: `key` names the link, and `key` minus "Ref" names the file. */
function refFld(label, key){
  const base = key.replace(/Ref$/,'');
  return `<div class="field">
    <label>${label}</label>
    <div class="ref-row">
      <input type="text" id="${key}" dir="ltr" value="${esc(S.data[key])}" placeholder="رابط المستند (اختياري)" oninput="setVal('${key}', this.value)">
      ${uploader(base, S.data[base+'FileName'])}
    </div>
  </div>`;
}
function uploader(path, fileName){
  return `<label class="upload">
    <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" onchange="handleUpload(this,'${path}')">
    <span class="upload-btn">${fileName?'تغيير الملف':'رفع ملف'}</span>
    ${fileName?`<span class="upload-name" title="${esc(fileName)}">✓ ${esc(fileName)}</span>`:''}
  </label>`;
}
/* `path` is "documents.2" for a table row, or "orgChart" for a single file on the form. */
async function handleUpload(input, path){
  const file = input.files[0];
  if(!file) return;
  if(file.size > MAX_FILE_BYTES){ toast('حجم الملف أكبر من 10 ميجابايت.'); input.value=''; return; }
  const [table, index] = path.split('.');
  const target = index===undefined ? S.data : S.data[table][Number(index)];
  const key = index===undefined ? table+'File' : 'file';
  toast('جارِ رفع الملف...');
  try{
    const saved = await api('upload_file', {token:S.token, track:serverTrack()}, file);
    target[key] = saved.file_url;
    target[key+'Name'] = saved.file_name;
    saveDraft();
    render();
    toast('تم رفع الملف.');
  }catch(e){ input.value=''; fail(e); }
}

function setVal(path, value){ S.data[path] = value; saveDraft(); }
function setArrVal(arrName, idx, key, value){ S.data[arrName][idx][key] = value; saveDraft(); }
function addRow(arrName, factory){ S.data[arrName].push(factory()); saveDraft(); render(); }
function removeRow(arrName, idx){
  if(S.data[arrName].length<=1) return;
  S.data[arrName].splice(idx,1);
  saveDraft(); render();
}
function toggleCategory(i){
  const cat = CONFIG.supply_categories[i];
  const arr = S.data.supplyCategories;
  const at = arr.indexOf(cat);
  if(at===-1) arr.push(cat); else arr.splice(at,1);
  saveDraft(); render();
}

function stepSidebar(){
  const defs = STEP_DEFS[S.track];
  return `<div class="steps">
    <div class="sidebar-track"><strong>${TRACKS[S.track].label}</strong><span style="font-size:11.5px;color:var(--slate)" dir="ltr">${esc(S.email)}</span>
      <button class="link-btn" style="display:block;margin-top:6px" onclick="showMine()">حفظ والرجوع إلى طلباتي</button></div>
    ${defs.map((s,i)=>`
      <div class="step-item ${i===S.step?'active':''} ${i<S.step?'done':''}" onclick="goStep(${i})">
        <div class="step-mark">${i<S.step?'':i+1}</div>
        <div class="step-label"><small>${s.num}</small>${s.title}</div>
      </div>`).join('')}
  </div>`;
}
function goStep(i){ S.step=i; saveDraft(); render(); window.scrollTo({top:0,behavior:'smooth'}); }

function renderForm(){
  const defs = STEP_DEFS[S.track];
  const s = defs[S.step];
  const body = S.track==='construction' ? renderConstructionStep(s) : S.track==='om' ? renderOMStep(s) : renderSupplierStep(s);
  app.innerHTML = `
    ${letterheadHtml(TRACKS[S.track].label+' — الخطوة '+(S.step+1)+' من '+defs.length)}
    <div class="layout">
      ${stepSidebar()}
      <div class="panel">${body}${actionsBar()}</div>
    </div>
    <p class="footer-note">يتم حفظ إجاباتكم تلقائياً كمسودة، ويمكنكم إكمال التقديم لاحقاً من أي جهاز بنفس البريد الإلكتروني.</p>
  `;
}

function engTable(arrName, rows, mode){
  const withJob = mode==='job';
  return `<table class="dyn"><thead><tr><th>م</th><th>الاسم</th><th>${withJob?'الوظيفة':'التخصص'}</th>${withJob?'<th>التخصص / مجال الخبرة</th>':''}<th>سنوات الخبرة</th><th>مرجع الشهادات</th><th></th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr>
      <td style="text-align:center">${i+1}</td>
      <td><input value="${esc(r.name)}" oninput="setArrVal('${arrName}',${i},'name',this.value)"></td>
      ${withJob?`<td><input value="${esc(r.job)}" oninput="setArrVal('${arrName}',${i},'job',this.value)"></td>`:''}
      <td><input value="${esc(r.specialty)}" oninput="setArrVal('${arrName}',${i},'specialty',this.value)" ${withJob?'':'placeholder="كهرباء / سباكة / تكييف / نظافة"'}></td>
      <td><input type="number" min="0" value="${esc(r.years)}" oninput="setArrVal('${arrName}',${i},'years',this.value)"></td>
      <td><input dir="ltr" value="${esc(r.certRef)}" oninput="setArrVal('${arrName}',${i},'certRef',this.value)" placeholder="رابط الشهادات"></td>
      <td>${rows.length>1?`<button class="row-remove" onclick="removeRow('${arrName}',${i})">✕</button>`:''}</td>
    </tr>`).join('')}
  </tbody></table>
  <button class="add-row-btn" onclick="addRow('${arrName}', ${withJob?'emptyEngineerRow':'emptyStaffRow'})">+ إضافة صف</button>`;
}

function docsChecklist(prefix){
  return `<div class="section-note">
      ارفعوا نسخة من كل مستند (PDF أو صورة، حتى 10 ميجابايت) وأدخلوا تاريخ انتهاء صلاحيته. يمكن بدلاً من الرفع وضع رابط للمستند (Google Drive أو مماثل).
    </div>
    ${S.data.documents.map((doc,i)=>`
      <div class="doc-item">
        <div class="doc-name"><span class="doc-num">${prefix}-${i+1}</span>${esc(doc.name)}</div>
        <input type="date" title="تاريخ الانتهاء" value="${esc(doc.expiry)}" oninput="setArrVal('documents',${i},'expiry',this.value)">
        <input type="text" dir="ltr" placeholder="رابط المستند" value="${esc(doc.ref)}" oninput="setArrVal('documents',${i},'ref',this.value)">
        ${uploader('documents.'+i, doc.fileName)}
      </div>`).join('')}`;
}

function financialStep(s){
  const d = S.data;
  return `<h2>${s.num}: ${s.title}</h2>
    <div class="section-note">يجب إرفاق نسخة من الميزانية المدققة لآخر ثلاث سنوات مالية (سنة واحدة على الأقل)، معتمدة من محاسب معتمد.</div>
    <table class="dyn"><thead><tr><th>م</th><th>العام</th><th>الميزانية المدققة</th><th>ملاحظة</th></tr></thead><tbody>
      ${d.budgetYears.map((b,i)=>`<tr>
        <td style="text-align:center">${i+1}</td>
        <td><input value="${esc(b.year)}" oninput="setArrVal('budgetYears',${i},'year',this.value)" placeholder="١٤٤٤هـ"></td>
        <td>${uploader('budgetYears.'+i, b.fileName)}</td>
        <td><input value="${esc(b.note)}" oninput="setArrVal('budgetYears',${i},'note',this.value)"></td>
      </tr>`).join('')}
    </tbody></table>

    <div class="section-note" style="margin-top:18px">هل هناك أي نزاعات قضائية حالية أو سابقة تشمل دعاوى مقامة ضد المنشأة أو ممثليها؟</div>
    ${radio('','hasDisputes',d.hasDisputes,'disputes')}
    ${d.hasDisputes==='نعم'?ta('وضّح بإيجاز أسباب النزاعات ونتيجتها','disputeDetails',d.disputeDetails):''}

    <div class="section-note" style="margin-top:18px">كشف حساب بنكي محدّث يثبت توفر سيولة دائمة خلال سنة ماضية على الأقل، لا تقل عن 300 ألف ريال.</div>
    ${refFld('كشف الحساب البنكي','bankStatementRef')}

    <div class="section-note" style="margin-top:18px">وجود نظام محاسبي وقيود يومية باستخدام برنامج محاسبة يتطابق مع بيانات التأهيل.</div>
    ${radio('','hasAccountingSystem',d.hasAccountingSystem,'accSystem')}`;
}

function ackStep(s){
  const d = S.data;
  return `<h2>${s.num}: ${s.title}</h2><p class="hint">راجعوا البيانات ثم أكّدوا الإقرار لإرسال الطلب إلى لجنة تأهيل الموردين.</p>
    ${reviewSummary(d)}
    <div class="ack-box">
      بموجب التوقيع أدناه نصادق على صحة جميع المعلومات الواردة في الاستمارة، ونتحمل كامل المسؤولية القانونية عن عدم صحة أي معلومة واردة فيها.
      <div class="grid" style="margin-top:12px">
        ${fld('اسم المنشأة','ackName',d.ackName,{required:true})}
        ${fld('الموظف المسؤول','ackEmployee',d.ackEmployee,{required:true})}
        ${fld('التاريخ','ackDate',d.ackDate,{type:'date',required:true})}
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin-top:6px;cursor:pointer">
        <input type="checkbox" ${d.ackConfirmed?'checked':''} onchange="setVal('ackConfirmed', this.checked); render();">
        أقرّ بصحة جميع البيانات المدخلة أعلاه وأوافق على إحالة الطلب إلى لجنة تأهيل الموردين.
      </label>
    </div>`;
}

function reviewSummary(d){
  const item = (label, value)=>`<div><span>${label}</span>${esc(value)||'—'}</div>`;
  const block = (title, items)=>`<div class="review-block"><h4>${title}</h4><div class="review-grid">${items}</div></div>`;
  let blocks = block('معلومات المنشأة',
      item('الاسم', d.companyName)+item('رقم السجل التجاري', d.crNumber)+item('الشخص المسؤول', d.responsiblePerson)+item('المدينة', d.city))
    + block('المستندات', item('عدد المستندات المرفقة', d.documents.filter(x=>x.file||x.ref).length+' من '+d.documents.length));
  if(d.projects) blocks += block('الخبرات', item('عدد المشاريع المذكورة', String(d.projects.filter(p=>p.name).length)));
  if(d.supplyCategories) blocks += block('نشاط التوريد', item('الأصناف المختارة', d.supplyCategories.join('، ')));
  if(d.hasAccountingSystem!==undefined) blocks += block('الوضع المالي', item('نزاعات قضائية', d.hasDisputes)+item('نظام محاسبي', d.hasAccountingSystem));
  return blocks;
}

/* ============ Steps per track ============ */
function orgFieldsHtml(s){
  const d = S.data;
  const has = k=>d[k]!==undefined;
  return `<h2>${s.num}: ${s.title}</h2><p class="hint">بيانات المنشأة الأساسية وعنوانها الرسمي.</p>
    <div class="grid3">
      ${fld('اسم المنشأة (شركة / مؤسسة)','companyName',d.companyName,{required:true})}
      ${has('capital')?fld('رأس مال المنشأة','capital',d.capital,{type:'number',placeholder:'ريال سعودي'}):''}
      ${fld('رقم السجل التجاري','crNumber',d.crNumber,{required:true})}
      ${has('crDate')?fld('تاريخ السجل التجاري','crDate',d.crDate,{type:'date'}):''}
      ${fld('اسم الشخص المسؤول','responsiblePerson',d.responsiblePerson,{required:true})}
      ${fld('المنصب','position',d.position)}
      ${has('foundingYear')?fld('سنة التأسيس','foundingYear',d.foundingYear,{type:'number'}):''}
    </div>
    <h4 class="sub-h">العنوان والتواصل</h4>
    <div class="grid3">
      ${fld('المدينة','city',d.city,{required:true})}
      ${has('street')?fld('الشارع','street',d.street):''}
      ${has('poBox')?fld('ص. ب','poBox',d.poBox):''}
      ${has('postalCode')?fld('الرمز البريدي','postalCode',d.postalCode):''}
      ${fld('هاتف','phone',d.phone,{type:'tel',required:true})}
      ${has('fax')?fld('فاكس','fax',d.fax,{type:'tel'}):''}
      ${fld('البريد الإلكتروني الثانوي','email2',d.email2,{type:'email'})}
    </div>`;
}

function projectCards(noun, fields, factory){
  return `${S.data.projects.map((p,i)=>`
      <div class="project-card">
        <div class="project-head">
          <strong>${noun} ${i+1}</strong>
          ${S.data.projects.length>1?`<button class="row-remove" onclick="removeRow('projects',${i})">✕ حذف</button>`:''}
        </div>
        <div class="grid3">
          ${fields.map(([key,label,type])=>`<div class="field"><label>${label}</label><input type="${type||'text'}" value="${esc(p[key])}" oninput="setArrVal('projects',${i},'${key}',this.value)"></div>`).join('')}
        </div>
      </div>`).join('')}
    <button class="add-row-btn" onclick="addRow('projects', ${factory})">+ إضافة ${noun==='المشروع'?'مشروع':'عقد'} آخر</button>`;
}

function renderConstructionStep(s){
  const d = S.data;
  if(s.key==='org') return orgFieldsHtml(s);
  if(s.key==='docs') return `<h2>${s.num}: ${s.title}</h2>${docsChecklist(2)}`;
  if(s.key==='structure') return `<h2>${s.num}: ${s.title}</h2><p class="hint">خبرات الجهاز الفني الهندسي التابع للمقاول.</p>
    <h4 class="sub-h">المهندسون</h4>
    ${engTable('engineers', d.engineers,'job')}
    <h4 class="sub-h">المراقبون</h4>
    ${engTable('supervisors', d.supervisors,'job')}
    ${radio('هل لدى المقاول كادر فني تشغيلي (عمالة كافية) لتنفيذ 4 بنود أساسية على الأقل (العظم / اللياسة / البلاط / الدهانات / الكهرباء / السباكة)؟','hasOperationalStaff',d.hasOperationalStaff,'opStaff')}`;
  if(s.key==='capacity') return `<h2>${s.num}: ${s.title}</h2>
    <div class="section-note">إرفاق الهيكل التنظيمي للمقاول — يجب إرفاق ما يثبت ذلك.</div>
    ${refFld('الهيكل التنظيمي','orgChartRef')}
    <div class="section-note" style="margin-top:14px">المعدات والتجهيزات: يتوفر الحد الأدنى من المعدات المناسبة (مكينة صب خرسانة، سقائل، بوكلين، رافعات، سيارات نقل).</div>
    ${refFld('إثبات المعدات والتجهيزات','equipmentRef')}`;
  if(s.key==='experience') return `<h2>${s.num}: ${s.title}</h2><p class="hint">تفاصيل المشاريع المنفذة خلال الثلاث سنوات الأخيرة.</p>
    ${projectCards('المشروع', [
      ['name','اسم المشروع'],['components','مكونات المشروع'],['owner','المالك'],['ownerAddress','عنوان المالك'],
      ['contractValue','قيمة العقد (ريال)','number'],['contractDuration','مدة العقد (شهر)','number'],
      ['startDate','تاريخ البداية','date'],['endDate','تاريخ الانتهاء','date'],['ownerContact','رقم تواصل مع المالك'],
    ], 'emptyProjectRow')}`;
  if(s.key==='quality') return `<h2>${s.num}: ${s.title}</h2>
    ${radio('هل لدى المقاول نظام جودة؟','hasQualitySystem',d.hasQualitySystem,'quality')}
    ${d.hasQualitySystem==='نعم'?`
      ${ta('وضّح تفاصيل نظام الجودة','qualityDetails',d.qualityDetails)}
      ${refFld('المستندات الثبوتية لتطبيق النظام','qualityRef')}`:''}`;
  if(s.key==='financial') return financialStep(s);
  return ackStep(s);
}

function renderOMStep(s){
  const d = S.data;
  if(s.key==='org') return orgFieldsHtml(s);
  if(s.key==='docs') return `<h2>${s.num}: ${s.title}</h2>${docsChecklist(2)}`;
  if(s.key==='staff') return `<h2>${s.num}: ${s.title}</h2><p class="hint">فرق الإشراف والصيانة المتوفرة لدى المقاول.</p>
    <h4 class="sub-h">المشرفون</h4>
    ${engTable('supervisors', d.supervisors,'specialty')}
    <h4 class="sub-h">الفنيون (كهرباء / سباكة / تكييف / نظافة)</h4>
    ${engTable('technicians', d.technicians,'specialty')}
    <div class="section-note" style="margin-top:14px">عدد عمال النظافة المقيمين يختلف حسب احتياج كل مسجد، وتحدده الجمعية وفق ما تراه مناسباً. يلتزم المقاول بتوفير العدد الذي تحدده الجمعية لكل مسجد ضمن نطاق العقد، دون أي زيادة في التكلفة على هذا الأساس.</div>
    <div class="field">
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer">
        <input type="checkbox" ${d.residentCleanerCommitted?'checked':''} onchange="setVal('residentCleanerCommitted', this.checked)">
        نلتزم بتوفير العدد المطلوب من عمال النظافة المقيمين بشكل دائم داخل كل مسجد حسب ما تحدده الجمعية
      </label>
    </div>`;
  if(s.key==='capacity') return `<h2>${s.num}: ${s.title}</h2>
    <div class="section-note">يلتزم المقاول بتوفير وسائل انتقال مجهزة لكل فرقة عمل وسيارة مخصصة للأعمال الطارئة، إضافة إلى المعدات والأدوات اللازمة لأعمال الصيانة والنظافة.</div>
    ${fld('عدد السيارات / الفانات المخصصة للأعمال والطوارئ','vehiclesCount',d.vehiclesCount,{type:'number'})}
    ${refFld('إثبات توفر المعدات والأدوات','equipmentRef')}
    ${radio('هل يلتزم المقاول بتوفير زي موحد وبطاقات تعريفية للعمال والمشرفين؟','hasUniforms',d.hasUniforms,'uniforms')}`;
  if(s.key==='experience') return `<h2>${s.num}: ${s.title}</h2><p class="hint">تفاصيل عقود التشغيل والصيانة المنفذة خلال الثلاث سنوات الأخيرة.</p>
    ${projectCards('العقد', [
      ['name','اسم المشروع / العقد'],['sitesCount','عدد المواقع / المرافق المشمولة','number'],['owner','المالك / الجهة'],
      ['contractValue','قيمة العقد (ريال)','number'],['contractDuration','مدة العقد (شهر)','number'],
      ['startDate','تاريخ البداية','date'],['endDate','تاريخ الانتهاء','date'],['ownerContact','رقم تواصل مع الجهة'],
    ], 'emptyOMProjectRow')}`;
  if(s.key==='quality') return `<h2>${s.num}: ${s.title}</h2>
    <div class="section-note">مثل: سجلات فحص دورية (Check List)، متابعة يومية للمواقع، تحليل جودة المياه، تقارير أداء دورية.</div>
    ${radio('هل يوجد لدى المقاول نظام لمتابعة سجلات الفحص الدوري وتقارير الأداء؟','hasQualitySystem',d.hasQualitySystem,'quality')}
    ${d.hasQualitySystem==='نعم'?`
      ${ta('وضّح تفاصيل نظام المتابعة والفحص الدوري','qualityDetails',d.qualityDetails)}
      ${refFld('نماذج أو تقارير سابقة','qualityRef')}`:''}`;
  if(s.key==='financial') return financialStep(s);
  return ackStep(s);
}

function renderSupplierStep(s){
  const d = S.data;
  if(s.key==='org') return orgFieldsHtml(s);
  if(s.key==='activity') return `<h2>${s.num}: ${s.title}</h2><p class="hint">اختر صنف أو أكثر يمثل نشاط التوريد لديكم.</p>
    <div class="check-grid">
      ${CONFIG.supply_categories.map((c,i)=>`<label><input type="checkbox" ${d.supplyCategories.includes(c)?'checked':''} onchange="toggleCategory(${i})"> ${esc(c)}</label>`).join('')}
    </div>
    ${d.supplyCategories.includes('أخرى')?fld('حدد الصنف الآخر','categoryOther',d.categoryOther):''}
    ${ta('وصف مختصر لنشاط التوريد والمنتجات / الخدمات المقدمة','activityDesc',d.activityDesc,{required:true})}
    <div class="section-note">قد تطلب لجنة تأهيل الموردين بيانات أو مستندات إضافية لاحقاً حسب طبيعة المشروع أو الصنف المطلوب توريده.</div>`;
  if(s.key==='docs') return `<h2>${s.num}: ${s.title}</h2>${docsChecklist(3)}`;
  return ackStep(s);
}

function actionsBar(){
  const last = STEP_DEFS[S.track].length-1;
  return `<div class="actions">
    <button class="btn btn-ghost" onclick="goStep(${S.step-1})" ${S.step===0?'disabled':''}>السابق</button>
    ${S.step===last
      ? `<button class="btn btn-primary" onclick="handleSubmit()" ${S.data.ackConfirmed && !S.busy?'':'disabled'}>${S.busy?'جارِ الإرسال...':'تقديم الطلب'}</button>`
      : `<button class="btn btn-primary" onclick="goStep(${S.step+1})">التالي</button>`}
  </div>`;
}

async function handleSubmit(){
  const d = S.data;
  if(!d.ackConfirmed || S.busy) return;
  if(!d.companyName || !d.crNumber || !d.responsiblePerson){
    toast('الرجاء تعبئة اسم المنشأة ورقم السجل التجاري واسم الشخص المسؤول.');
    goStep(0);
    return;
  }
  if(!d.ackName || !d.ackEmployee || !d.ackDate){
    toast('الرجاء تعبئة بيانات الإقرار (اسم المنشأة، الموظف المسؤول، التاريخ) قبل الإرسال.');
    return;
  }
  clearTimeout(draftTimer);
  S.busy=true; render();
  try{
    S.refNumber = (await api('submit', {token:S.token, track:serverTrack(), data:d})).reference;
    S.busy=false; S.phase='confirmed';
    render();
  }catch(e){ fail(e); render(); }
}

function renderConfirm(){
  app.innerHTML = `
    <div class="confirm">
      <div class="big-seal"><span>تم الاستلام</span></div>
      <h2 style="font-family:'RB',serif;color:var(--green-deep)">تم استلام طلب التأهيل بنجاح</h2>
      <p style="color:var(--slate)">تمت إحالة طلبكم (${TRACKS[S.track].label}) إلى لجنة تأهيل الموردين لمراجعته وتقييمه. يمكنكم متابعة حالته في أي وقت من صفحة "طلباتي".</p>
      <div class="ref-code" dir="ltr">${esc(S.refNumber)}</div>
      <p style="font-size:12.5px;color:var(--slate)">يرجى الاحتفاظ برقم الطلب أعلاه للمتابعة لاحقاً. أرسلنا نسخة منه إلى بريدكم الإلكتروني.</p>
      <button class="btn btn-primary" onclick="showMine()">عرض طلباتي</button>
    </div>
    ${footerNote()}
  `;
}

/* ============ My applications ============ */
function applicationCard(rec){
  const meta = STATUS_META[rec.status]||{label:rec.status,cls:'pill-slate'};
  const key = trackOf(rec.track);
  const decided = rec.status==='Qualified' || rec.status==='Not Qualified';
  return `<div class="sub-card" style="cursor:default">
    <div class="sub-card-top">
      <strong>${esc(rec.company_name)} <span style="color:var(--slate);font-weight:400;font-size:12px" dir="ltr">(${esc(rec.name)})</span></strong>
      <span class="pill ${meta.cls}">${meta.label}</span>
    </div>
    <div class="sub-card-meta">${key?TRACKS[key].label:esc(rec.track)} · قُدّم بتاريخ ${shortDate(rec.submitted_at)}</div>
    ${decided?`<div class="ack-box">نتيجة التأهيل: <strong>${meta.label}</strong> — نسبة التأهيل: <strong>${rec.final_percentage!==null&&rec.final_percentage!==undefined?Number(rec.final_percentage)+'%':'—'}</strong></div>`:''}
    ${rec.chair_note?`<div class="ack-box">ملاحظة لجنة التأهيل: ${esc(rec.chair_note)}</div>`:''}
  </div>`;
}
function draftCard(draft){
  const key = trackOf(draft.track);
  if(!key) return '';
  return `<div class="sub-card" onclick="enter('${key}')">
    <div class="sub-card-top">
      <strong>${TRACKS[key].label}</strong>
      <span class="pill pill-slate">مسودة لم تُقدَّم</span>
    </div>
    <div class="sub-card-meta">آخر تعديل ${shortDate(draft.modified)} · الخطوة ${Math.min((draft.step||0)+1, STEP_DEFS[key].length)} من ${STEP_DEFS[key].length} — <b style="color:var(--green)">أكمل التعبئة ←</b></div>
  </div>`;
}

function renderMine(){
  const {applications, drafts} = S.mine;
  app.innerHTML = `
    ${letterheadHtml('طلباتي')}
    <div class="layout" style="grid-template-columns:1fr">
      <div class="panel">
        <div class="sub-toolbar"><h2>الطلبات المقدَّمة (${applications.length})</h2>
          <button class="btn btn-primary" onclick="goHome()">+ طلب تأهيل جديد</button></div>
        ${applications.length?applications.map(applicationCard).join(''):'<p class="empty-note">لم تقدّموا أي طلب بعد.</p>'}
        ${drafts.length?`<div class="sub-toolbar" style="margin-top:26px"><h2>مسودات لم تكتمل (${drafts.length})</h2></div>${drafts.map(draftCard).join('')}`:''}
      </div>
    </div>
    <div class="top-links"><button class="link-btn" onclick="signOut()">خروج (<span dir="ltr">${esc(S.email)}</span>)</button></div>
    ${footerNote()}
  `;
}

/* ============ Start ============ */
(async function(){
  app.innerHTML = letterheadHtml('')+'<p class="empty-note">جارِ التحميل...</p>';
  try{
    CONFIG = await api('get_config');
  }catch(e){
    app.innerHTML = letterheadHtml('')+`<p class="empty-note">${esc(e.message)}</p>`;
    return;
  }
  // Still signed in from before a reload: straight to "my applications".
  if(S.token){
    try{ S.mine = await api('my_applications', {token:S.token}); S.phase='mine'; }
    catch(e){ S.token=''; remember(TOKEN_KEY, ''); }
  }
  render();
})();
