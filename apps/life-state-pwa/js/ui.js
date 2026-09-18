"use strict";

let selectedDay=dayStart(now());
let editDraft=null;
let toastTimer=null;
let undoTimer=null;

function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function safeColor(c){return isColor(c)?c:'#888';}
function hexToRgb(hex){const h=hex.replace('#','');const n=h.length===3?h.split('').map(c=>c+c).join(''):h;return [parseInt(n.slice(0,2),16),parseInt(n.slice(2,4),16),parseInt(n.slice(4,6),16)];}
function hexA(hex,a){const [r,g,b]=hexToRgb(safeColor(hex));return `rgba(${r},${g},${b},${a})`;}
function textTone(hex){
  const dark=document.documentElement.getAttribute('data-theme')!=='light';let [r,g,b]=hexToRgb(safeColor(hex));
  const lum=(.2126*r+.7152*g+.0722*b)/255;
  if(dark&&lum<.55){const k=Math.min(1,(.55-lum)/.55*1.15);r=Math.round(r+(255-r)*k);g=Math.round(g+(255-g)*k);b=Math.round(b+(255-b)*k);}
  if(!dark&&lum>.48){const k=Math.min(1,(lum-.48)/.52*1.25);r=Math.round(r*(1-k));g=Math.round(g*(1-k));b=Math.round(b*(1-k));}
  return `rgb(${r},${g},${b})`;
}
function statusTone(id){return textTone(colorOf(id));}

function toast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1700);
}
function showUndo(message,onUndo){
  const box=document.getElementById('undoToast');document.getElementById('undoText').textContent=message;box.classList.add('show');
  clearTimeout(undoTimer);undoTimer=setTimeout(()=>box.classList.remove('show'),5000);
  document.getElementById('undoBtn').onclick=()=>{clearTimeout(undoTimer);box.classList.remove('show');onUndo();};
}
function applyAmbient(color,on){
  const glow=document.getElementById('glow'),amb=document.getElementById('ambient'),con=document.getElementById('console');
  if(on){glow.style.background=`radial-gradient(120% 90% at 12% -20%, ${hexA(color,.28)}, transparent 60%)`;glow.style.opacity='1';amb.style.background=`radial-gradient(900px 620px at 50% -12%, ${color}, transparent 72%)`;amb.classList.add('on');document.body.style.background=`linear-gradient(180deg, ${hexA(color,.10)} 0%, var(--bg) 460px)`;con.style.borderColor=hexA(color,.45);con.style.boxShadow=`0 18px 50px -20px ${hexA(color,.5)}`;}
  else{glow.style.opacity='0';amb.classList.remove('on');document.body.style.background='var(--bg)';con.style.borderColor='var(--line)';con.style.boxShadow='none';}
}
function ritual(color,big,sub,{blackout=false}={}){
  const tone=textTone(color);const p=document.getElementById('pulse');p.style.color=tone;p.classList.remove('go');void p.offsetWidth;p.classList.add('go');
  const a=document.getElementById('announce');a.innerHTML=`<span style="color:${tone}">${esc(big)}</span>${sub?`<small>${esc(sub)}</small>`:''}`;a.classList.remove('go');void a.offsetWidth;a.classList.add('go');
  if(blackout){const bo=document.getElementById('blackout');bo.classList.remove('go');void bo.offsetWidth;bo.classList.add('go');}
  if(navigator.vibrate)try{navigator.vibrate(blackout?[18,40,18]:28);}catch(e){}
}

function renderAll(){renderConsole();renderModes();renderDays();renderTimeline();renderLongRunningAlert();}
function renderConsole(){
  const con=document.getElementById('console'),led=document.getElementById('led'),eyebrow=document.getElementById('eyebrow'),sname=document.getElementById('stateName'),since=document.getElementById('since'),switchTxt=document.getElementById('switchTxt'),sw=document.getElementById('switchBtn');
  con.classList.toggle('on',state.on);sw.classList.toggle('on',state.on);
  if(state.on&&state.current){const c=colorOf(state.current.statusId);led.style.background=c;led.classList.add('live');eyebrow.textContent='记录中';sname.textContent=nameOf(state.current.statusId);sname.style.color=statusTone(state.current.statusId);since.textContent='开始于 '+fmtTime(state.current.start);switchTxt.textContent='停止记录';applyAmbient(c,true);}
  else{led.style.background=OFF_COLOR;led.classList.remove('live');eyebrow.textContent='未记录';sname.textContent='未记录';sname.style.color='var(--muted)';since.textContent=dayTotal(now())>0?'今日已记录 '+fmtDur(dayTotal(now())):'开始记录后进入「迷茫」';switchTxt.textContent='开始记录';applyAmbient(OFF_COLOR,false);}
  tickClock();
}
function tickClock(){
  const clock=document.getElementById('clock'),lab=document.getElementById('clockLab');
  if(state.on&&state.current){clock.textContent=fmtClock(now()-state.current.start);clock.style.color='';lab.textContent='本次时长';}
  else{clock.textContent=fmtClock(dayTotal(now()));clock.style.color='var(--muted)';lab.textContent='今日已记录';}
}
function renderModes(){
  const box=document.getElementById('modes');box.innerHTML='';
  state.statuses.forEach((s,i)=>{const el=document.createElement('button');const cur=state.on&&state.current?.statusId===s.id;el.className='mode'+(state.on?'':' dis')+(cur?' active active-state':'');el.dataset.id=s.id;const c=safeColor(s.color),d=dayTotalOn(s.id,now());el.innerHTML=`<span class="mkey">${i<9?i+1:'·'}</span><span class="mname" style="color:${textTone(c)}"><span class="cdot" style="background:${c}"></span>${esc(s.name)}</span><span class="mnow">${cur?'进行中':(d>0?'今日 '+fmtDur(d):'')}</span><span class="mbar" style="background:${cur?c:'transparent'}"></span>`;el.onclick=()=>handleSwitch(s.id);box.appendChild(el);});
}
function renderDays(){
  const box=document.getElementById('days'),keys=new Set([dayKey(now())]);state.segments.forEach(s=>keys.add(dayKey(s.start)));if(state.current)keys.add(dayKey(state.current.start));const list=[...keys].sort().reverse().slice(0,14);box.innerHTML='';
  list.forEach(k=>{const d=new Date(k.replace(/-/g,'/'));d.setHours(0,0,0,0);const b=document.createElement('button');b.textContent=dayLabel(d.getTime());b.className=dayStart(selectedDay)===d.getTime()?'on':'';b.onclick=()=>{selectedDay=d.getTime();renderDays();renderTimeline();};box.appendChild(b);});
}
function renderTimeline(){
  const box=document.getElementById('timeline'),rows=dayRows(selectedDay);if(!rows.length){box.innerHTML='<div class="empty">这一天还没有记录</div>';return;}box.innerHTML='';
  rows.forEach(r=>{const el=document.createElement('div'),editable=!!r.segId&&!r.live;el.className='tl-item'+(r.live?' live':'')+(r.type==='off'?' off':'')+(editable?' editable':'');const dur=r.live?now()-r.start:r.end-r.start;const name=r.type==='off'?'未记录':nameOf(r.statusId),color=r.type==='off'?'var(--off)':statusTone(r.statusId),dot=r.type==='off'?OFF_COLOR:colorOf(r.statusId),range=r.live?`${fmtTime(r.start)} → 现在`:`${fmtTime(r.start)} → ${fmtTime(r.end)}`;el.innerHTML=`<span class="tdot" style="background:${dot}"></span><span class="tname" style="color:${color}">${esc(name)}</span><span class="trange">${range}</span><span class="tdur">${r.live?'进行中':fmtDur(dur)}</span>`;if(editable){el.title='点击修正';el.onclick=()=>openEdit(r.segId);}box.appendChild(el);});
}
function renderLongRunningAlert(){
  const box=document.getElementById('recordingAlert'),txt=document.getElementById('recordingAlertText');
  if(suspiciousCurrent()){txt.textContent=`「${nameOf(state.current.statusId)}」已持续 ${fmtDur(now()-state.current.start)}。页面关闭/锁屏不会自动结束记录；如果忘记切换，可以修正。`;box.classList.add('show');}
  else box.classList.remove('show');
}

function renderManage(){
  const list=document.getElementById('manageList');list.innerHTML='';
  state.statuses.forEach((s,i)=>{const row=document.createElement('div');row.className='row';row.innerHTML=`<span class="mkey" style="position:static">${i+1}</span><input type="color" value="${safeColor(s.color)}" data-color="${s.id}" ${s.locked?'disabled':''}><input type="text" value="${esc(s.name)}" data-name="${s.id}" ${s.locked?'readonly':''}>${s.locked?'<span class="lockbadge">锁定</span>':''}`;if(!s.locked){const del=document.createElement('button');del.className='btn danger sm';del.textContent='删除';del.onclick=()=>{if(state.current?.statusId===s.id){toast('该状态进行中，先切换');return;}const used=state.segments.filter(x=>x.statusId===s.id).length;if(used&&!confirm(`「${s.name}」有 ${used} 段历史记录，删除后这些记录将显示为未知状态。继续？`))return;state.statuses=state.statuses.filter(x=>x.id!==s.id);saveState();renderManage();renderAll();};row.appendChild(del);}list.appendChild(row);});
  list.querySelectorAll('[data-name]').forEach(i=>i.onchange=e=>{const s=byId(e.target.dataset.name);if(!s||s.locked)return;const v=e.target.value.trim();if(!v){e.target.value=s.name;return;}s.name=v;saveState();renderManage();renderAll();});
  list.querySelectorAll('[data-color]').forEach(i=>i.oninput=e=>{const s=byId(e.target.dataset.color);if(!s||s.locked)return;s.color=e.target.value;saveState();renderAll();});
}

function hmStr(ts){const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function hmToTs(hm){const [h,m]=hm.split(':').map(Number);return editDraft.day+h*3600000+m*60000;}
function openEdit(segId){
  const seg=state.segments.find(s=>s.id===segId);if(!seg)return;if(seg.type==='off'&&seg.open){toast('当前仍处于未记录状态；开始记录后再修正');return;}
  editDraft={segId,seg,type:seg.type==='off'?'off':'status',statusId:seg.statusId||state.statuses[0].id,start:seg.start,end:seg.end,day:dayStart(seg.start)};
  document.getElementById('editHint').textContent='调整这段的时间或类型。保存后系统会自动消除重叠。';
  const MIN=60000,sTs=Math.floor(seg.start/MIN)*MIN,eTs=Math.max(Math.ceil(seg.end/MIN)*MIN,sTs+MIN);document.getElementById('editStart').value=hmStr(sTs);document.getElementById('editEnd').value=hmStr(eTs);renderEditChips();document.getElementById('editModal').classList.add('show');
}
function renderEditChips(){
  const box=document.getElementById('editChips');box.innerHTML='';state.statuses.forEach(s=>{const b=document.createElement('button');b.className='editchip'+(editDraft.type==='status'&&editDraft.statusId===s.id?' sel':'');b.innerHTML=`<span class="cdot" style="background:${safeColor(s.color)}"></span>${esc(s.name)}`;b.onclick=()=>{editDraft.type='status';editDraft.statusId=s.id;renderEditChips();};box.appendChild(b);});
  if(editDraft.seg.type==='off'){const b=document.createElement('button');b.className='editchip'+(editDraft.type==='off'?' sel':'');b.textContent='保持未记录';b.onclick=()=>{editDraft.type='off';renderEditChips();};box.appendChild(b);}
}
function saveEdit(){
  const seg=editDraft.seg,sRaw=document.getElementById('editStart').value,eRaw=document.getElementById('editEnd').value;if(!sRaw||!eRaw){toast('请填写开始与结束时间');return;}let st=hmToTs(sRaw),en=hmToTs(eRaw);if(en===st){toast('开始与结束不能相同');return;}if(en<st)en+=86400000;if(en-st<60000){toast('这段至少要有 1 分钟');return;}seg.start=st;seg.end=en;seg.type=editDraft.type==='off'?'off':'status';if(seg.type==='status'){seg.statusId=editDraft.statusId;delete seg.open;}else{delete seg.statusId;}absorbRange(seg);mergeAdjacent();resolveOverlaps();state.segments.sort((a,b)=>a.start-b.start);saveState();closeModals();renderAll();toast('已修正');
}
function deleteEdit(){if(!confirm('删除这段记录？该时段将不再计入任何状态。'))return;state.segments=state.segments.filter(s=>s!==editDraft.seg);saveState();closeModals();renderAll();toast('已删除');}
function closeModals(){document.querySelectorAll('.modal-bg.show').forEach(m=>m.classList.remove('show'));}
function modalOpen(){return !!document.querySelector('.modal-bg.show');}

function openHelp(){
  const rows=[['空格','开始 / 停止记录'],['1 – 9','切换到第 N 个状态'],['← / →','上一个 / 下一个状态'],['R','回到「迷茫」'],['点击时间线','修正历史记录'],['Esc','关闭弹窗'],['?','显示本帮助']];
  document.getElementById('helpList').innerHTML=rows.map(([k,v])=>`<div class="row"><span class="kbd">${esc(k)}</span><span style="color:var(--muted);font-size:13px">${esc(v)}</span></div>`).join('');document.getElementById('helpModal').classList.add('show');
}
