"use strict";

function performWithUndo(mutator, message, ritualInfo){
  const snap=snapshotState();
  if(!mutator())return false;
  renderAll();
  if(ritualInfo) ritual(ritualInfo.color,ritualInfo.big,ritualInfo.sub,ritualInfo.options||{});
  showUndo(message,()=>{restoreSnapshot(snap);renderAll();toast('已撤销');});
  return true;
}

function handleStartStop(){
  if(state.on){
    const old=nameOf(state.current.statusId);
    performWithUndo(()=>stopRecording(),`已停止记录（上一状态：${old}）`,{color:OFF_COLOR,big:'停止记录',sub:'之后的时间标记为未记录',options:{blackout:true}});
  }else{
    const target=state.statuses[0];
    performWithUndo(()=>startRecording(target.id),`已开始记录：${target.name}`,{color:colorOf(target.id),big:'开始记录',sub:target.name+' · 开始计时'});
  }
}

function handleSwitch(id){
  if(!state.on){toast('请先开始记录');return false;}
  const target=byId(id);if(!target)return false;
  if(state.current?.statusId===id){toast(`已经在「${target.name}」`);return false;}
  return performWithUndo(()=>switchState(id),`已进入「${target.name}」`,{color:colorOf(id),big:'进入 '+target.name,sub:'已开始计时'});
}

function handleCycle(dir){
  if(!state.on){toast('请先开始记录');return;}
  const list=state.statuses,idx=list.findIndex(s=>s.id===state.current?.statusId),next=(idx<0?0:idx+dir+list.length)%list.length;handleSwitch(list[next].id);
}

function endLongRunningAndEdit(){
  if(!state.on||!state.current)return;
  const snap=snapshotState();
  const seg=endCurrent(now());state.on=false;pushSegment({id:newSegId(),type:'off',start:now(),end:now(),open:true});saveState();renderAll();
  if(seg)openEdit(seg.id);
  showUndo('已结束当前状态，可修正结束时间',()=>{restoreSnapshot(snap);closeModals();renderAll();toast('已恢复原状态');});
}

function bindUI(){
  document.getElementById('switchBtn').onclick=handleStartStop;
  document.getElementById('manageBtn').onclick=()=>{renderManage();document.getElementById('manageModal').classList.add('show');};
  document.getElementById('manageClose').onclick=()=>document.getElementById('manageModal').classList.remove('show');
  document.getElementById('helpBtn').onclick=openHelp;document.getElementById('helpClose').onclick=()=>document.getElementById('helpModal').classList.remove('show');
  document.getElementById('recordingKeep').onclick=()=>{state.settings.longRunningAckStart=state.current?.start||null;saveState();document.getElementById('recordingAlert').classList.remove('show');};
  document.getElementById('recordingFix').onclick=endLongRunningAndEdit;

  document.getElementById('addBtn').onclick=()=>{const inp=document.getElementById('newName'),v=inp.value.trim();if(!v)return;state.statuses.push({id:'st_'+now(),name:v,color:PALETTE[state.statuses.length%PALETTE.length]});inp.value='';saveState();renderManage();renderAll();inp.focus();};
  document.getElementById('exportBtn').onclick=()=>{downloadState(state,'life-state-'+dayKey(now())+'.json');toast('已导出');};
  document.getElementById('importBtn').onclick=()=>document.getElementById('importFile').click();
  document.getElementById('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const imported=await parseImportedState(f);if(!imported||!Array.isArray(imported.statuses)||!Array.isArray(imported.segments))throw new Error('bad format');if(confirm('导入将覆盖当前所有数据，确定继续？')){state=imported;normalizeState();saveState();renderAll();renderManage();toast('导入成功');}}catch(err){toast('文件格式错误，原数据未改变');}finally{e.target.value='';}};

  document.getElementById('editSave').onclick=saveEdit;document.getElementById('editCancel').onclick=closeModals;document.getElementById('editDelete').onclick=deleteEdit;
  document.getElementById('editModal').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();saveEdit();}});
  document.querySelectorAll('.modal-bg').forEach(m=>m.onclick=e=>{if(e.target===m)m.classList.remove('show');});

  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
    const k=e.key;if(k==='Escape'){if(modalOpen()){closeModals();e.preventDefault();}return;}if(modalOpen())return;
    if(e.code==='Space'){e.preventDefault();handleStartStop();return;}
    if(k==='r'||k==='R'){e.preventDefault();if(!state.on)handleStartStop();else handleSwitch(state.statuses[0].id);return;}
    if(k==='?'||(k==='/'&&e.shiftKey)){e.preventDefault();openHelp();return;}
    if(k==='ArrowRight'){e.preventDefault();handleCycle(1);return;}if(k==='ArrowLeft'){e.preventDefault();handleCycle(-1);return;}
    if(/^[1-9]$/.test(k)){e.preventDefault();const s=state.statuses[+k-1];if(s)handleSwitch(s.id);}
  });
}

function registerServiceWorker(){
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service Worker 注册失败',err)));}
}

window.__onThemeChange=()=>renderAll();
bindUI();renderAll();registerServiceWorker();
setInterval(()=>{if(!document.hidden){tickClock();if(selectedDay===dayStart(now()))renderTimeline();renderLongRunningAlert();}},1000);
