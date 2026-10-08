/* Supplier qualification portal — the committee's side.
   A signed-in ERPNext user sees what their role allows: a member scores applications,
   the chair reads the scores and decides. Who is on the committee is kept in the desk
   (Qualification Committee Member), not here. */

const API = '/api/method/supplier_qualification.api.committee.';
function api(method, args){ return call(API, method, args); }

const VOTING = ['Awaiting Committee','Under Committee Vote','Revote Requested'];
const ON_HOLD = ['Chair Reservation','Chair Inquiry'];
const DECIDED = ['Qualified','Not Qualified'];
const RESULT_LABELS = {'Qualified':'مؤهل', 'Not Qualified':'غير مؤهل'};
const DECISION_LABELS = {
  'Approve Result':'اعتماد النتيجة', 'Record Reservation':'تحفظ',
  'Raise Inquiry':'استفسار', 'Request Revote':'طلب إعادة تقييم',
};

let C = {
  phase:'loading',   // loading -> list -> detail | denied
  me:null,           // {full_name, member, chair, admin}
  list:[], rec:null,
  vote:{decision:'', percentage:'', note:'', negotiate:false, negotiation_note:''},
  decision:{type:'', result:'', percentage:'', note:''},
  busy:false, message:'',
};

const app = document.getElementById('app');

function roleLabel(){
  if(C.me.chair) return 'معتمِد طلبات التأهيل';
  if(C.me.member) return 'مراجِع طلبات التأهيل';
  return 'إدارة المنصة';
}
function bottomLinks(){
  return `<div class="top-links">
    ${C.me.admin?'<a class="link-btn" href="/app/qualification-committee-member">إدارة اللجنة والصلاحيات</a><a class="link-btn" href="/app/qualification-settings">إعدادات التأهيل</a>':''}
    <a class="link-btn" href="/qualification">بوابة التقديم</a>
    <a class="link-btn" href="/app">مكتب ERPNext</a>
  </div>`;
}
function fail(e){
  C.busy = false;
  if(e.status===403){ C.phase='denied'; C.message=e.message; render(); return; }
  toast(e.message);
  render();
}

function render(){
  if(C.phase==='loading'){ app.innerHTML = letterheadHtml('بوابة اللجنة')+'<p class="empty-note">جارِ التحميل...</p>'; return; }
  if(C.phase==='denied') return renderDenied();
  if(C.phase==='detail') return renderDetail();
  return renderList();
}

function renderDenied(){
  app.innerHTML = `
    ${letterheadHtml('بوابة اللجنة')}
    <div class="gate">
      <h2>لا توجد صلاحية</h2>
      <p>${esc(C.message || 'هذا الحساب ليس ضمن لجنة التأهيل.')}</p>
      <p>للإضافة إلى اللجنة تواصل مع قسم المشتريات والعقود.</p>
      <a class="btn btn-ghost" style="display:block;text-decoration:none" href="/qualification">الذهاب إلى بوابة التقديم</a>
    </div>`;
}

/* ============ List ============ */
async function loadList(){
  try{
    C.list = await api('list_applications');
    C.phase='list'; C.busy=false;
    render();
    window.scrollTo({top:0});
  }catch(e){ fail(e); }
}

function subCard(row){
  const meta = STATUS_META[row.status]||{label:row.status,cls:'pill-slate'};
  const key = trackOf(row.track);
  return `<div class="sub-card" onclick="openDetail('${esc(row.name)}')">
    <div class="sub-card-top">
      <strong>${esc(row.company_name)} <span style="color:var(--slate);font-weight:400;font-size:12px" dir="ltr">(${esc(row.name)})</span></strong>
      <span class="pill ${meta.cls}">${meta.label}</span>
    </div>
    <div class="sub-card-meta">${key?TRACKS[key].label:esc(row.track)} · قُدّم بتاريخ ${shortDate(row.submitted_at)}${row.vote_round>1?' · جولة التقييم '+row.vote_round:''}</div>
  </div>`;
}
/* The first group is the user's own work and is always shown; the rest appear when they have something. */
function groups(){
  const L = C.list;
  if(C.me.member && !C.me.chair){
    const open = r=>VOTING.includes(r.status);
    return [
      ['بانتظار تقييمك', L.filter(r=>open(r) && !r.voted), 'لا توجد طلبات بانتظار تقييمك حالياً.'],
      ['قيّمتها وما زال التقييم مفتوحاً', L.filter(r=>open(r) && r.voted)],
      ['عند صاحب الاعتماد', L.filter(r=>r.status==='Pending Chair' || ON_HOLD.includes(r.status))],
      ['طلبات تم البت فيها', L.filter(r=>DECIDED.includes(r.status))],
    ];
  }
  return [
    ['بانتظار قرارك', L.filter(r=>r.can_decide && !ON_HOLD.includes(r.status)), 'لا توجد طلبات جاهزة للقرار حالياً.'],
    ['معلّقة على تحفظ أو استفسار', L.filter(r=>ON_HOLD.includes(r.status))],
    ['قيد تقييم المراجعين', L.filter(r=>VOTING.includes(r.status) && !r.can_decide)],
    ['طلبات تم البت فيها', L.filter(r=>DECIDED.includes(r.status))],
  ];
}
function renderList(){
  app.innerHTML = `
    ${letterheadHtml(roleLabel()+' — '+C.me.full_name)}
    <div class="layout" style="grid-template-columns:1fr">
      <div class="panel">
        ${groups().map(([title, rows, empty], i)=>(rows.length || empty)?`
          <div class="sub-toolbar" ${i?'style="margin-top:26px"':''}><h2>${title} (${rows.length})</h2></div>
          ${rows.length?rows.map(subCard).join(''):`<p class="empty-note">${empty}</p>`}`:'').join('')}
      </div>
    </div>
    ${bottomLinks()}
  `;
}

/* ============ Detail ============ */
async function openDetail(name){
  try{
    const rec = await api('get_application', {name});
    const mine = rec.my_vote;
    C.rec = rec;
    C.vote = mine
      ? {decision:mine.decision, percentage:mine.percentage, note:mine.note||'', negotiate:!!mine.negotiate, negotiation_note:mine.negotiation_note||''}
      : {decision:'', percentage:'', note:'', negotiate:false, negotiation_note:''};
    C.decision = {type:'', result:'', percentage:rec.average===null||rec.average===undefined?'':rec.average, note:''};
    C.phase='detail'; C.busy=false;
    render();
    window.scrollTo({top:0});
  }catch(e){ fail(e); }
}

function shown(cell){
  if(!cell.value) return '—';
  if(cell.kind==='file') return `<a href="${esc(cell.value)}" target="_blank" rel="noopener">فتح الملف</a>`;
  if(cell.kind==='link') return `<a href="${esc(cell.value)}" target="_blank" rel="noopener" dir="ltr">فتح الرابط</a>`;
  return esc(cell.value);
}
/* The application, read-only: sections, labels and tables come from the server as the form defines them. */
function applicationHtml(sections){
  return sections.map(section=>`
    <div class="ro-h4">${esc(section.title)}</div>
    ${section.fields.length?`<div class="ro-grid">${section.fields.map(f=>`<div class="ro-field"><span>${esc(f.label)}</span>${shown(f)}</div>`).join('')}</div>`:''}
    ${section.tables.map(t=>`
      <div class="ro-sub">${esc(t.title)}</div>
      <div class="table-scroll"><table class="dyn"><thead><tr>${t.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${t.rows.map(row=>`<tr>${row.map(cell=>`<td>${shown(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`).join('')}`).join('');
}

function voteForm(){
  const rec = C.rec, v = C.vote;
  const voted = !!rec.my_vote;
  return `
    <div class="ro-h4">تقييمك</div>
    ${!rec.can_vote?`<div class="section-note">هذا الطلب ليس في مرحلة تقييم المراجعين (الحالة الحالية: ${(STATUS_META[rec.status]||{}).label||esc(rec.status)}).</div>`:''}
    ${voted && rec.can_vote?`<div class="section-note">قدّمت تقييمك على هذا الطلب. يمكنك تعديله ما دام التقييم مفتوحاً.</div>`:''}
    ${(rec.can_vote || voted)?`
    <fieldset ${rec.can_vote?'':'disabled'} style="border:0;padding:0;margin:0">
      <div class="field"><label>القرار</label>
        <div class="radio-row">
          ${Object.keys(RESULT_LABELS).map(k=>`<label><input type="radio" name="voteDecision" ${v.decision===k?'checked':''} onchange="C.vote.decision='${k}'"> ${RESULT_LABELS[k]}</label>`).join('')}
        </div>
      </div>
      <div class="grid">
        <div class="field"><label>نسبة التأهيل المقترحة (%)</label>
          <input type="number" min="0" max="100" value="${esc(v.percentage)}" oninput="C.vote.percentage=this.value">
        </div>
      </div>
      <div class="field"><label>ملاحظات / مبررات التقييم</label>
        <textarea oninput="C.vote.note=this.value">${esc(v.note)}</textarea>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;font-weight:400;cursor:pointer">
          <input type="checkbox" ${v.negotiate?'checked':''} onchange="C.vote.negotiate=this.checked; render();">
          أقترح تفاوضاً / تعديلاً على بعض الشروط مع المتقدم قبل الاعتماد النهائي
        </label>
      </div>
      ${v.negotiate?`<div class="field"><label>تفاصيل التفاوض المقترح</label><textarea oninput="C.vote.negotiation_note=this.value">${esc(v.negotiation_note)}</textarea></div>`:''}
    </fieldset>
    ${rec.can_vote?`<div class="actions" style="justify-content:flex-end">
      <button class="btn btn-primary" ${C.busy?'disabled':''} onclick="submitVote()">${voted?'تحديث التقييم':'إرسال التقييم'}</button>
    </div>`:''}`:''}`;
}
async function submitVote(){
  const v = C.vote;
  if(C.busy) return;
  if(!v.decision || v.percentage===''){ toast('الرجاء تحديد القرار ونسبة التأهيل المقترحة قبل الإرسال.'); return; }
  C.busy=true;
  try{
    await api('vote', {name:C.rec.name, decision:v.decision, percentage:v.percentage, note:v.note, negotiate:v.negotiate?1:0, negotiation_note:v.negotiation_note});
    toast('تم حفظ تقييمك.');
    loadList();
  }catch(e){ fail(e); }
}

function votesHtml(){
  const rec = C.rec;
  return `
    <div class="ro-h4">تقييمات المراجعين (${rec.votes.length})${rec.vote_round>1?' — الجولة '+rec.vote_round:''}</div>
    ${rec.votes.length?rec.votes.map(v=>`
      <div class="vote-card">
        <div class="vhead"><span>${esc(v.member_name)}</span><span>${RESULT_LABELS[v.decision]||esc(v.decision)} — ${Number(v.percentage)}%</span></div>
        ${v.note?`<div>${esc(v.note)}</div>`:''}
        ${v.negotiate?`<div style="color:var(--gold);margin-top:4px">⚠ مقترح تفاوض: ${esc(v.negotiation_note)||'—'}</div>`:''}
      </div>`).join(''):'<p class="empty-note">لا توجد تقييمات من المراجعين على هذا الطلب.</p>'}
    ${rec.average!==null&&rec.average!==undefined?`<p style="font-size:13px;color:var(--slate)">متوسط النسبة المقترحة من المراجعين: <strong>${rec.average}%</strong></p>`:''}`;
}
function decisionForm(){
  const d = C.decision;
  return `
    <div class="ro-h4">قرار الاعتماد</div>
    <div class="decision-grid">
      ${Object.keys(DECISION_LABELS).map(k=>`<div class="decision-opt ${d.type===k?'active':''}" onclick="C.decision.type='${k}'; render();">${DECISION_LABELS[k]}</div>`).join('')}
    </div>
    ${d.type==='Approve Result'?`
      <div class="grid">
        <div class="field"><label>النتيجة النهائية</label>
          <div class="radio-row">
            ${Object.keys(RESULT_LABELS).map(k=>`<label><input type="radio" name="decResult" ${d.result===k?'checked':''} onchange="C.decision.result='${k}'"> ${RESULT_LABELS[k]}</label>`).join('')}
          </div>
        </div>
        <div class="field"><label>نسبة التأهيل النهائية (%)</label>
          <input type="number" min="0" max="100" value="${esc(d.percentage)}" oninput="C.decision.percentage=this.value">
        </div>
      </div>
      <div class="section-note">عند اعتماد «مؤهل» يُسجَّل المتقدّم مورداً في ERPNext، ويُبلَّغ بالنتيجة على بريده.</div>`:''}
    ${d.type?`<div class="field"><label>ملاحظة${d.type==='Approve Result'?' (اختياري)':d.type==='Request Revote'?' (تظهر في سجل القرارات)':' (تُرسل للمتقدّم)'}</label>
      <textarea oninput="C.decision.note=this.value">${esc(d.note)}</textarea></div>
      <div class="actions" style="justify-content:flex-end">
        <button class="btn btn-primary" ${C.busy?'disabled':''} onclick="submitDecision()">تأكيد القرار</button>
      </div>`:''}`;
}
async function submitDecision(){
  const d = C.decision;
  if(C.busy) return;
  if(d.type==='Approve Result' && (!d.result || d.percentage==='')){ toast('الرجاء تحديد النتيجة النهائية ونسبة التأهيل.'); return; }
  if(d.type!=='Approve Result' && !d.note.trim()){ toast('الرجاء إضافة ملاحظة توضح سبب القرار.'); return; }
  C.busy=true;
  try{
    await api('decide', {name:C.rec.name, decision_type:d.type, result:d.result, percentage:d.percentage, note:d.note});
    toast('تم تسجيل القرار.');
    loadList();
  }catch(e){ fail(e); }
}
function decisionsHtml(){
  const list = C.rec.decisions||[];
  if(!list.length) return '';
  return `<div class="ro-h4">سجل القرارات</div>${list.map(d=>`
    <div class="vote-card">
      <div class="vhead"><span>${DECISION_LABELS[d.decision_type]||esc(d.decision_type)}${d.result?' — '+(RESULT_LABELS[d.result]||esc(d.result)):''} · ${esc(d.decided_by)}</span><span>${shortDate(d.decided_at)}</span></div>
      ${d.note?`<div>${esc(d.note)}</div>`:''}
      ${d.result?`<div>النسبة: ${Number(d.percentage)}%</div>`:''}
    </div>`).join('')}`;
}

function renderDetail(){
  const rec = C.rec;
  const key = trackOf(rec.track);
  const meta = STATUS_META[rec.status]||{label:rec.status,cls:'pill-slate'};
  const seesVotes = !!rec.votes;
  app.innerHTML = `
    ${letterheadHtml((C.me.chair?'مراجعة طلب ':'تقييم طلب ')+rec.name)}
    <div class="layout" style="grid-template-columns:1fr">
      <div class="panel">
        <div class="sub-toolbar"><h2>${esc(rec.company_name)} <span style="font-weight:400;font-size:13px;color:var(--slate)">(${key?TRACKS[key].label:esc(rec.track)} — <span dir="ltr">${esc(rec.name)}</span>)</span> <span class="pill ${meta.cls}">${meta.label}</span></h2>
          <button class="link-btn" onclick="loadList()">رجوع للقائمة</button></div>
        ${applicationHtml(rec.sections)}
        ${C.me.member && !C.me.chair?voteForm():''}
        ${seesVotes?votesHtml():''}
        ${seesVotes && C.me.chair && !rec.can_decide && !DECIDED.includes(rec.status)?`<div class="section-note">القرار متاح بعد أن يقيّم جميع المراجعين الطلب. الحالة الحالية: ${meta.label}.</div>`:''}
        ${rec.can_decide?decisionForm():''}
        ${rec.supplier?`<div class="section-note">سُجِّل مورداً في ERPNext: <a href="/app/supplier/${encodeURIComponent(rec.supplier)}" target="_blank">${esc(rec.supplier)}</a></div>`:''}
        ${decisionsHtml()}
      </div>
    </div>
    ${bottomLinks()}
  `;
}

/* ============ Start ============ */
(async function(){
  render();
  try{
    C.me = await api('whoami');
    loadList();
  }catch(e){
    C.me = {full_name:'', member:false, chair:false, admin:false};
    fail(e);
  }
})();
