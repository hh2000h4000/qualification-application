/* What the applicant's page and the committee's page share: the organisation's name,
   the tracks and statuses, the call to the server, and the letterhead. */

const ASSETS = '/assets/supplier_qualification/portal/';
const ORG_NAME = 'جمعية العناية بمساجد الطرق';
const ORG_UNIT = 'قسم المشتريات والعقود';

const TRACKS = {
  construction: {
    server:'Construction Contractor', label:'مقاول تنفيذ', eyebrow:'أعمال الإنشاء والبناء', icon:'🏗',
    desc:'لمقاولي إنشاء وتنفيذ المشاريع الجديدة (عظم، تشطيب، وأعمال إنشائية بمختلف تخصصاتها).',
  },
  om: {
    server:'O&M Contractor', label:'مقاول صيانة وتشغيل', eyebrow:'التشغيل والصيانة الدورية', icon:'🛠',
    desc:'لمقاولي التشغيل والصيانة الدورية والوقائية والنظافة للمرافق والمساجد القائمة.',
  },
  supplier: {
    server:'General Supplier', label:'مورد عام', eyebrow:'التوريد والخدمات المساندة', icon:'📦',
    desc:'لموردي المواد والمنتجات والخدمات المساندة من غير أعمال الإنشاء أو التشغيل والصيانة.',
  },
};

const STATUS_META = {
  'Awaiting Committee':{label:'بانتظار المراجعة', cls:'pill-slate'},
  'Under Committee Vote':{label:'قيد المراجعة', cls:'pill-gold'},
  'Pending Chair':{label:'بانتظار الاعتماد', cls:'pill-gold'},
  'Revote Requested':{label:'أعيد للمراجعة', cls:'pill-gold'},
  'Chair Reservation':{label:'عليه تحفظ', cls:'pill-danger'},
  'Chair Inquiry':{label:'عليه استفسار', cls:'pill-gold'},
  'Qualified':{label:'مؤهَّل', cls:'pill-success'},
  'Not Qualified':{label:'غير مؤهَّل', cls:'pill-danger'},
};


/* ============ Server ============ */
async function call(base, method, args, file){
  const body = new FormData();
  Object.entries(args||{}).forEach(([k,v])=>{
    if(v===null || v===undefined) return;
    body.append(k, typeof v==='object' ? JSON.stringify(v) : v);
  });
  if(file) body.append('file', file, file.name);
  let res, payload = {};
  try{
    res = await fetch(base+method, {
      method:'POST', body, credentials:'same-origin',
      headers:{'X-Frappe-CSRF-Token': window.SQ_CSRF || '', 'Accept':'application/json'},
    });
    payload = await res.json();
  }catch(e){
    if(!res) throw new Error('تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة.');
  }
  if(!res.ok){
    const err = new Error(
      res.status===429 ? 'محاولات كثيرة. الرجاء الانتظار قليلاً ثم إعادة المحاولة.'
      : (serverMessage(payload) || 'حدث خطأ غير متوقع. الرجاء إعادة المحاولة.'));
    err.status = res.status;
    throw err;
  }
  return payload.message;
}
function serverMessage(payload){
  try{
    const list = JSON.parse(payload._server_messages || '[]');
    if(!list.length) return '';
    const holder = document.createElement('div');
    holder.innerHTML = JSON.parse(list[0]).message || '';
    return holder.textContent;
  }catch(e){ return ''; }
}

/* ============ Small helpers ============ */
function esc(v){
  return String(v===null||v===undefined?'':v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg){
  const t = document.createElement('div');
  t.setAttribute('role','status');
  t.className = 'toast';
  t.textContent = String(msg);
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 4500);
}
function latinDigits(v){
  return String(v||'')
    .replace(/[٠-٩]/g, d=>String(d.charCodeAt(0)-0x0660))
    .replace(/[۰-۹]/g, d=>String(d.charCodeAt(0)-0x06F0));
}
function trackOf(server){ return Object.keys(TRACKS).find(k=>TRACKS[k].server===server); }
function shortDate(value){ return new Date(String(value).replace(' ','T')).toLocaleDateString('ar-SA-u-ca-gregory'); }


/* ============ Letterhead ============ */
function letterheadHtml(subtitle){
  return `
  <div class="letterhead">
    <div class="brand">
      <img src="${ASSETS}logo.png" alt="شعار ${ORG_NAME}">
      <span class="brand-name">${ORG_NAME}</span>
    </div>
    <div class="letterhead-divider"></div>
    <div class="letterhead-text">
      <span class="org-badge">${ORG_UNIT}</span>
      <h1>بوابة تأهيل الموردين والمقاولين</h1>
      <p>${esc(subtitle||'')}</p>
    </div>
  </div>`;
}
function footerNote(){ return `<p class="footer-note">${ORG_NAME} — ${ORG_UNIT}</p>`; }
