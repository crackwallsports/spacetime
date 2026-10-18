"use strict";

const qs=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selectedDay=dayStart(now());
let lastTodayKey=dayKey(now());
let toastTimer=null,quickNoteAt=now(),quickNotePointId=null,quickNoteBefore=null,quickNoteUndoKey=null,quickNoteCommit=null,boundaryContext=null,suppressBoundaryClick=false,quickNoteNeedsStreamRender=false,outsidePanelPending=null;
const undoStack=[];
const UNDO_STORAGE_KEY='life_trace_v4_undo_history';
const UNDO_STORAGE_LIMIT=1500000;
let undoStorageWarningShown=false;
const scrollHideTimers=new WeakMap();
let quickToolsPositionFrame=0;

function toast(msg){const el=qs('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800);}
function showPersistError(){if(lastPersistError)toast(lastPersistError);}
function undoHistoryPayload(){return undoStack.map((item,index)=>({msg:item.msg,key:item.key,before:item.before,...(index===undoStack.length-1?{after:item.after}:{})}));}
function loadUndoHistory(){try{const raw=localStorage.getItem(UNDO_STORAGE_KEY);if(!raw)return;const saved=JSON.parse(raw);if(!Array.isArray(saved)||!saved.length)return;const current=snapshotState(),last=saved[saved.length-1];if(last.after!==current){localStorage.removeItem(UNDO_STORAGE_KEY);return;}saved.forEach(item=>{if(typeof item.msg==='string'&&typeof item.before==='string')undoStack.push({msg:item.msg,key:item.key||null,before:item.before,after:item.after||null});});}catch(err){console.warn('Could not restore undo history',err);}}
function warnUndoStorage(){if(undoStorageWarningShown)return;undoStorageWarningShown=true;setTimeout(()=>toast(t('undoHistoryNotSaved')),0);}
function persistUndoHistory(){try{while(undoStack.length){const raw=JSON.stringify(undoHistoryPayload());if(raw.length<=UNDO_STORAGE_LIMIT){localStorage.setItem(UNDO_STORAGE_KEY,raw);return true;}undoStack.shift();}localStorage.removeItem(UNDO_STORAGE_KEY);warnUndoStorage();return false;}catch(err){while(undoStack.length>1){undoStack.shift();try{localStorage.setItem(UNDO_STORAGE_KEY,JSON.stringify(undoHistoryPayload()));return true;}catch(_){}}try{localStorage.removeItem(UNDO_STORAGE_KEY);}catch(_){}warnUndoStorage();console.warn('Could not persist undo history',err);return false;}}
function clearUndoHistory(){undoStack.length=0;try{localStorage.removeItem(UNDO_STORAGE_KEY);}catch(_){}renderUndoHistory();}
function undo(msg,fn,key=null){const before=lastMutationBefore;if(typeof before!=='string')return;let item=key&&undoStack[undoStack.length-1]?.key===key?undoStack[undoStack.length-1]:null;if(item){item.msg=msg;item.after=snapshotState();}else{item={msg,key,before,after:snapshotState()};undoStack.push(item);if(undoStack.length>50)undoStack.shift();}persistUndoHistory();renderUndoHistory();}
function performUndo(index){const item=undoStack[index];if(!item||!restoreSnapshot(item.before)){showPersistError();return false;}undoStack.splice(index);if(undoStack.length)undoStack[undoStack.length-1].after=snapshotState();persistUndoHistory();renderUndoHistory();refreshAfterUndo();return true;}
function refreshAfterUndo(){renderAll();if(!qs('settingsSheet').hidden)renderSettings();}
function renderUndoHistory(){const listTrigger=qs('undoHistoryTrigger'),latestTrigger=qs('undoLatest'),label=qs('undoLatestLabel'),list=qs('undoHistoryList'),hasUndo=!!undoStack.length;if(listTrigger)listTrigger.hidden=!hasUndo;if(latestTrigger)latestTrigger.hidden=!hasUndo;if(label)label.textContent=hasUndo?undoStack[undoStack.length-1].msg:'';if(!list)return;if(!hasUndo)qs('undoHistory').hidden=true;list.innerHTML='';undoStack.slice().reverse().forEach((item,reverseIndex)=>{const index=undoStack.length-1-reverseIndex,row=document.createElement('div');row.className='undo-history-row';const label=document.createElement('span');label.textContent=item.msg;const button=document.createElement('button');button.type='button';button.textContent=index===undoStack.length-1?t('undo'):t('undoToHere');button.onclick=()=>performUndo(index);row.append(label,button);list.appendChild(row);});}
function positionUndoHistory(){requestAnimationFrame(()=>{const panel=qs('undoHistory'),trigger=qs('undoHistoryTrigger');if(!panel||panel.hidden||!trigger)return;const vv=window.visualViewport,viewTop=Math.max(0,vv?.offsetTop||0),triggerRect=trigger.getBoundingClientRect(),rect=panel.getBoundingClientRect(),margin=12,gap=8;panel.style.left=`${Math.max(margin,Math.min(triggerRect.left,innerWidth-rect.width-margin))}px`;panel.style.top=`${Math.max(viewTop+margin,triggerRect.top-rect.height-gap)}px`;});}
function autoSaveMutation(key,msg,before,mutate,onSaved=()=>{}){const ok=mutate();if(!ok){showPersistError();return false;}undo(msg,()=>restoreSnapshot(before),key);onSaved();return true;}
function autosaveField(input,{key,msg,before,save,delay=320}){let last=input.value,timer=null;const commit=()=>{clearTimeout(timer);timer=null;const value=input.value;if(value===last)return true;const label=typeof msg==='function'?msg(value):msg;const ok=autoSaveMutation(key,label,before,()=>save(value));if(ok)last=value;return ok;};const schedule=()=>{clearTimeout(timer);timer=setTimeout(commit,delay);};input.addEventListener('input',schedule);input.addEventListener('change',commit);input.addEventListener('blur',commit);input.__flush=commit;return commit;}
function pulseFeedback(ms=16){if(navigator.vibrate)try{navigator.vibrate(ms);}catch(_){}}
function renderAll(){renderNow();renderStates();renderDays();renderStream(true);}

loadUndoHistory();

function fitQuickToolsLabel(){
  const label=qs('quickToolsLabel');if(!label)return;const text=label.textContent.trim(),width=label.clientWidth||50;if(!text)return;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),style=getComputedStyle(label),base=11,min=8.5;ctx.font=`${style.fontWeight} ${base}px ${style.fontFamily}`;
  const parts=/[\u3400-\u9fff]/u.test(text)?Array.from(text):text.split(/\s+/);const widest=Math.max(1,...parts.map(part=>ctx.measureText(part).width)),fit=base*width/widest;
  label.style.fontSize=`${Math.max(min,Math.min(base,fit<base?fit*.9:base)).toFixed(1)}px`;
}

function renderNow(){
  const r=currentRange(),dot=qs('liveDot'),stateEl=qs('nowState'),meta=qs('nowMeta'),duration=qs('nowDuration'),stop=qs('stopBtn'),toggleLabel=qs('quickToolsLabel');
  const toggle=qs('quickToolsToggle');
  if(r&&r.type==='state'){
    const c=stateColor(r.stateId),dur=now()-r.start;stateEl.textContent=stateName(r.stateId);stateEl.style.color=c;duration.textContent=fmtDur(dur);dot.style.background=c;dot.classList.add('live');stop.hidden=false;document.documentElement.style.setProperty('--current',c);toggleLabel.textContent=stateName(r.stateId);toggle.title=stateName(r.stateId);fitQuickToolsLabel();toggle.classList.add('recording');
    meta.textContent=t('fromStart',{time:dayKey(r.start)===dayKey(now())?fmtTime(r.start):`${fullDayLabel(r.start)} ${fmtTime(r.start)}`});
    meta.classList.toggle('warn',dur>=LONG_RANGE_MS);
  }else{
    stateEl.textContent=t('unrecorded');stateEl.style.color='var(--muted)';duration.textContent='—';dot.style.background=OFF_COLOR;dot.classList.remove('live');stop.hidden=true;meta.textContent=r?t('offFrom',{time:fmtTime(r.start)}):t('noStateStart');meta.classList.remove('warn');document.documentElement.style.setProperty('--current',OFF_COLOR);toggleLabel.textContent=t('sphereUnrecorded');toggle.title=t('unrecorded');fitQuickToolsLabel();toggle.classList.remove('recording');
  }
}

function renderStates(){
  const box=qs('stateStrip'),current=currentStateId();box.innerHTML='';
  visibleStates().forEach((s,i)=>{
    const b=document.createElement('button');b.type='button';b.className='state-chip'+(current===s.id?' current':'');b.style.setProperty('--state-color',s.color);b.innerHTML=`<span class="state-dot"></span><span>${esc(stateName(s.id))}</span>`;b.title=i<9?t('stateShortcut',{number:i+1}):t('switchState');
    b.onclick=()=>performSwitch(s.id);
    box.appendChild(b);
  });
}

function dayNavCount(){return window.matchMedia('(max-width:640px)').matches?3:7;}
function renderDays(){
  const box=qs('dayNav'),count=dayNavCount(),recent=recentDayStarts(count),selectedKey=dayKey(selectedDay),recentKeys=new Set(recent.map(dayKey));box.innerHTML='';
  recent.forEach(ts=>{const b=document.createElement('button');b.type='button';b.textContent=dayLabel(ts);b.classList.toggle('selected',dayKey(ts)===selectedKey);b.onclick=()=>{selectedDay=ts;closeHistory();renderDays();renderStream();};box.appendChild(b);});
  const history=document.createElement('button');history.type='button';history.className='history-btn'+(!recentKeys.has(selectedKey)?' selected':'');history.textContent=recentKeys.has(selectedKey)?t('history'):t('historySelected',{date:localizedDayNumber(selectedDay)});history.onclick=()=>toggleHistory();box.appendChild(history);
  qs('streamDate').textContent=fullDayLabel(selectedDay);const hd=qs('historyDate');hd.value=dayKey(selectedDay);hd.max=dayKey(now());hd.removeAttribute('min');
}
function toggleHistory(){const panel=qs('historyPicker');if(panel.hidden){closeOtherPanels(panel);panel.hidden=false;revealPanel(panel);setTimeout(()=>qs('historyDate').focus({preventScroll:true}),30);}else closeHistory();}
function closeHistory(){qs('historyPicker').hidden=true;}

function rangeColor(r){return r.type==='state'?stateColor(r.stateId):OFF_COLOR;}
function rangeLabel(r){return r.type==='state'?stateName(r.stateId):t('unrecorded');}
function fullRangeById(id){return rangeById(id);}
function actualBoundaryAt(r){const full=fullRangeById(r.id);return full&&Math.abs(full.start-r.start)<1000;}

function renderStream(force=false){
  // Keep inline editors (and their unsaved text) mounted during the live clock refresh.
  if(!force&&document.querySelector('.range-inline:not([hidden]),.range-actions-popover:not([hidden]),.point-inline:not([hidden]),.boundary-inline:not([hidden])'))return;
  const box=qs('stream'),ranges=dayRanges(selectedDay),points=pointsForDay(selectedDay),items=[];box.innerHTML='';
  if(!ranges.length&&!points.length){box.innerHTML=`<div class="stream-empty">${t('emptyDay')}</div>`;updateQuickToolsPosition();return;}
  ranges.forEach(r=>items.push({kind:'range',at:r.start,r}));
  const contained=new Set();for(const p of points){const owner=ranges.find(r=>p.at>=r.start&&p.at<r.end);if(!owner)items.push({kind:'point',at:p.at,p});else contained.add(p.id);}
  items.sort((a,b)=>a.at-b.at);
  let previousRange=null;
  for(const item of items){
    if(item.kind==='point'){box.appendChild(buildLoosePoint(item.p));continue;}
    const r=item.r;
    const mergePrevious=previousRange&&actualBoundaryAt(r)&&Math.abs(previousRange.end-r.start)<1500?previousRange:null;
    if(mergePrevious)box.appendChild(buildBoundary(mergePrevious,r));
    const owned=points.filter(p=>contained.has(p.id)&&p.at>=r.start&&p.at<r.end);box.appendChild(buildRange(r,owned,mergePrevious));previousRange=r;
  }
  const live=ranges.find(r=>r.live);if(live){const a=document.createElement('div');a.className='now-anchor';a.innerHTML='<span class="now-pulse"></span><span>NOW</span>';box.appendChild(a);}updateQuickToolsPosition();
}

function buildRange(r,points,mergePrevious=null){
  const el=document.createElement('article');el.className='range'+(r.live?' live':'')+(r.type==='off'?' off':'');el.dataset.rangeId=r.id;el.style.setProperty('--range-color',rangeColor(r));
  const editableStart=actualBoundaryAt(r);
  el.innerHTML=`<div class="rail"><span class="switch-point"></span><span class="rail-line"></span></div><div class="range-main"><div class="range-top">${editableStart?`<button class="range-start range-start-edit" type="button">${fmtTime(r.start)}</button><div class="range-inline boundary-inline range-start-inline" hidden></div>`:`<span class="range-start">${fmtTime(r.start)}</span>`}<button class="range-state" type="button">${esc(rangeLabel(r))}</button><span class="range-duration">${fmtDur(r.end-r.start)}</span><button class="range-more" type="button" aria-label="${esc(t('more'))}">···</button><div class="range-actions-popover" hidden></div></div><div class="range-state-inline range-inline" hidden></div><button class="range-note ${r.note?'has-note':''}" type="button">${r.note?esc(r.note):'+ Note'}</button><div class="range-note-inline range-inline" hidden></div><div class="point-list"></div></div>`;
  const startBtn=el.querySelector('.range-start-edit');if(startBtn){startBtn.title=t('boundaryTitle');startBtn.addEventListener('click',e=>{if(e.pointerType==='touch')openBoundary(r,e.currentTarget);else openBoundaryFromClick(e,r,e.currentTarget);});const full=fullRangeById(r.id);attachBoundaryDrag(startBtn,r.id,full?.start??r.start);}
  el.querySelector('.range-state').onclick=()=>openRangeStatePicker(el,r);
  el.querySelector('.range-note').onclick=()=>openRangeNoteEditor(el,r);
  el.querySelector('.range-more').onclick=()=>openRangeActions(el,r,mergePrevious);
  const plist=el.querySelector('.point-list');points.forEach(p=>plist.appendChild(buildPoint(p)));
  return el;
}

function refreshDeferredQuickNote(){if(quickNoteNeedsStreamRender){quickNoteNeedsStreamRender=false;renderStream(true);}}
function revealPanel(panel){requestAnimationFrame(()=>{
  if(!panel||panel.hidden||panel.closest('#quickTools'))return;
  const scroller=panel.closest('#stream');if(!scroller)return;
  const vv=window.visualViewport,viewTop=Math.max(0,vv?.offsetTop||0),viewBottom=viewTop+(vv?.height||window.innerHeight),tools=qs('quickTools'),toggle=qs('quickToolsToggle'),sphereDocked=tools?.style.bottom!=='auto'&&qs('quickToolsPanel').hidden,floatReserve=sphereDocked?toggle.getBoundingClientRect().height+16:0,scrollerRect=scroller.getBoundingClientRect(),visibleTop=Math.max(scrollerRect.top+10,viewTop),visibleBottom=Math.min(scrollerRect.bottom,viewBottom-Math.max(10,floatReserve)),margin=12;
  const adjust=behavior=>{const rect=panel.getBoundingClientRect(),available=visibleBottom-visibleTop;let delta=0;if(rect.height>available)delta=rect.top-visibleTop;else if(rect.bottom>visibleBottom)delta=rect.bottom-visibleBottom+margin;else if(rect.top<visibleTop)delta=rect.top-visibleTop-margin;if(Math.abs(delta)<2)return false;const maxTop=Math.max(0,scroller.scrollHeight-scroller.clientHeight);scroller.scrollTo({top:Math.max(0,Math.min(maxTop,scroller.scrollTop+delta)),behavior});return true;};
  if(!adjust('smooth'))return;setTimeout(()=>{if(!panel.hidden)adjust('instant');},360);
});}
function updateQuickToolsPosition(){
  if(quickToolsPositionFrame)return;
  quickToolsPositionFrame=requestAnimationFrame(()=>{
    quickToolsPositionFrame=0;const tools=qs('quickTools'),toggle=qs('quickToolsToggle');if(!tools||!toggle)return;
    const anchor=document.querySelector('.now-anchor'),vv=window.visualViewport,viewTop=vv?.offsetTop||0,viewBottom=viewTop+(vv?.height||window.innerHeight),safeBottom=14;
    const expanded=!qs('quickToolsPanel').hidden,anchorBottom=anchor?.getBoundingClientRect().bottom;
    const fits=anchor&&anchorBottom+12+toggle.getBoundingClientRect().height<=viewBottom-safeBottom&&anchorBottom>=viewTop;
    if(!expanded&&fits){tools.style.top=`${Math.round(anchorBottom+10)}px`;tools.style.bottom='auto';}
    else{tools.style.top='auto';tools.style.bottom='calc(env(safe-area-inset-bottom, 0px) + 14px)';}
  });
}
function closeTimelinePanel(panel,{refresh=true}={}){
  panel.__flush?.();panel.querySelectorAll('input,textarea').forEach(input=>input.__flush?.());
  if(panel.id==='noteComposer'){closeQuickNote({refresh});return;}
  if(panel.id==='quickToolsPanel'){if(!qs('noteComposer').hidden)closeQuickNote({refresh});panel.hidden=true;qs('quickToolsToggle').setAttribute('aria-expanded','false');updateQuickToolsPosition();refreshDeferredQuickNote();return;}
  if(panel.id==='historyPicker'){closeHistory();refreshDeferredQuickNote();return;}
  if(panel.id==='undoHistory'){panel.hidden=true;refreshDeferredQuickNote();return;}
  if(panel.id==='settingsSheet'){panel.hidden=true;finishNewStateDraft();refreshDeferredQuickNote();return;}
  if(panel.matches('.boundary-inline')){closeBoundary();refreshDeferredQuickNote();return;}
  panel.hidden=true;
  panel.closest('.range,.point-wrap,.boundary-wrap')?.classList.remove('panel-on-top');
  panel.closest('.point-wrap')?.closest('.range')?.classList.remove('panel-on-top');
  if(panel.matches('.range-inline,.range-actions-popover,.point-inline,.boundary-inline'))panel.innerHTML='';
  refreshDeferredQuickNote();
}
function closeOtherPanels(active){
  if(boundaryContext?.box&&boundaryContext.box!==active)closeBoundary();
  document.querySelectorAll('.sheet-backdrop:not([hidden]),.quick-tools-panel:not([hidden]),.note-composer:not([hidden]),.history-picker:not([hidden]),.range-inline:not([hidden]),.range-actions-popover:not([hidden]),.point-inline:not([hidden]),.boundary-inline:not([hidden]),.undo-history:not([hidden])').forEach(panel=>{
    if(active?.id==='undoHistory'&&panel.id==='quickToolsPanel')return;
    if(panel===active||panel.contains(active))return;
    closeTimelinePanel(panel,{refresh:false});
  });
}
function rememberOutsidePanelPointer(e){
  outsidePanelPending=null;
  const undoPanel=document.querySelector('.undo-history:not([hidden])');
  const active=undoPanel||document.querySelector('.quick-tools-panel:not([hidden]),.note-composer:not([hidden]),.history-picker:not([hidden]),.range-inline:not([hidden]),.range-actions-popover:not([hidden]),.point-inline:not([hidden]),.boundary-inline:not([hidden])');
  if(active&&!active.contains(e.target))outsidePanelPending=active;
}
function closePanelAfterOutsideClick(e){
  const panel=outsidePanelPending;outsidePanelPending=null;
  if(!panel||panel.hidden)return;
  closeTimelinePanel(panel,{refresh:true});
}
function resetRangeInline(box){box.hidden=true;box.innerHTML='';box.closest('.range,.point-wrap,.boundary-wrap')?.classList.remove('panel-on-top');}
function openRangeStatePicker(el,r){
  const box=el.querySelector('.range-state-inline');closeOtherPanels(box);el.classList.add('panel-on-top');box.innerHTML=`<div class="inline-title">${t('changeState')}</div>`;const chips=document.createElement('div');chips.className='inline-state-list';
  const ids=new Set(visibleStates().map(s=>s.id));if(r.stateId)ids.add(r.stateId);
  state.states.filter(s=>ids.has(s.id)).forEach(s=>{const b=document.createElement('button');b.type='button';b.className='mini-state'+(r.stateId===s.id?' selected':'');b.style.setProperty('--state-color',s.color);b.innerHTML=`<span></span>${esc(stateName(s.id))}`;b.onclick=()=>{if(r.type==='state'&&r.stateId===s.id)return;const snap=snapshotState();if(!changeRangeState(r.id,s.id,selectedDay)){showPersistError();return;}pulseFeedback();renderAll();undo(t('stateChanged',{state:stateName(s.id)}),()=>{restoreSnapshot(snap);renderAll();});};chips.appendChild(b);});
  box.appendChild(chips);box.hidden=false;revealPanel(box);
}
function openRangeNoteEditor(el,r){
  const box=el.querySelector('.range-note-inline'),savedNote=state.rangeNotes?.[r.id]??r.note??'';closeOtherPanels(box);el.classList.add('panel-on-top');box.innerHTML=`<div class="inline-title">${t('rangeNoteTitle')}</div><textarea class="inline-note" rows="3" placeholder="${esc(t('rangeNotePlaceholder'))}">${esc(savedNote)}</textarea>`;box.hidden=false;revealPanel(box);const ta=box.querySelector('textarea'),before=snapshotState(),key=`range-note:${r.id}:${uid('edit')}`,label=el.querySelector('.range-note');const commit=autosaveField(ta,{key,msg:()=>t('rangeNoteUndo',{text:ta.value.trim().slice(0,18)||t('clear')}),before,save:value=>{if(!setRangeNote(r.id,value))return false;label.textContent=value.trim()||'+ Note';label.classList.toggle('has-note',!!value.trim());return true;}});box.__flush=commit;setTimeout(()=>ta.focus({preventScroll:true}),20);ta.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();commit();resetRangeInline(box);}};
}
function openRangeActions(el,r,mergePrevious=null){
  const box=el.querySelector('.range-actions-popover');closeOtherPanels(box);el.classList.add('panel-on-top');box.innerHTML=`<div class="inline-title">${t('rangeActions')}</div><button type="button" class="range-action-item insert">${t('insertSwitch')}</button>${mergePrevious?`<button type="button" class="range-action-item merge">${t('mergePrevious')}</button>`:''}<button type="button" class="range-action-item danger delete">${t('deleteRange')}</button>`;box.hidden=false;revealPanel(box);
  box.querySelector('.insert').onclick=()=>openInsertSwitch(el,r);
  box.querySelector('.delete').onclick=()=>confirmClearRange(el,r);
  box.querySelector('.merge')?.addEventListener('click',()=>confirmMergeRange(el,r,mergePrevious));
}
function confirmClearRange(el,r){
  const box=el.querySelector('.range-actions-popover');box.innerHTML=`<div class="inline-title">${t('deleteRangeTitle')}</div><p class="inline-help">${t('deleteRangeHelp')}</p><div class="inline-actions"><button type="button" class="text-btn cancel">${t('keep')}</button><span></span><button type="button" class="text-btn range-delete-confirm confirm">${t('delete')}</button></div>`;revealPanel(box);
  box.querySelector('.cancel').onclick=()=>resetRangeInline(box);
  box.querySelector('.confirm').onclick=()=>{const snap=snapshotState();if(!deleteRange(r.id,selectedDay)){showPersistError();return;}renderAll();undo(t('rangeDeleted'),()=>{restoreSnapshot(snap);renderAll();});};
}
function confirmMergeRange(el,r,previous){
  const continued=previous.type==='off'?t('previousOffContinues'):t('previousStateContinues');
  const box=el.querySelector('.range-actions-popover');box.innerHTML=`<div class="inline-title">${t('mergeQuestion')}</div><p class="inline-help">${t('mergeNoteHelp',{continued})}</p><div class="inline-actions"><button type="button" class="text-btn cancel">${t('keepBoundary')}</button><span></span><button type="button" class="text-btn merge-confirm confirm">${t('mergeRanges')}</button></div>`;revealPanel(box);
  box.querySelector('.cancel').onclick=()=>resetRangeInline(box);
  box.querySelector('.confirm').onclick=()=>{const snap=snapshotState();if(!removeBoundary(r.id)){showPersistError();return;}renderAll();undo(t('mergedPrevious'),()=>{restoreSnapshot(snap);renderAll();});};
}
function openInsertSwitch(el,r){
  const box=el.querySelector('.range-actions-popover'),mid=Math.min(r.end-60000,Math.max(r.start+60000,r.start+(r.end-r.start)/2)),dayTs=dayStart(selectedDay);closeOtherPanels(box);box.innerHTML=`<div class="inline-title">${t('insertDateHint')}</div><input class="insert-time auto-time" type="time" aria-label="${t('switchTime')}" value="${timeInputValue(mid)}"><div class="inline-state-list insert-states"></div>`;const list=box.querySelector('.insert-states');visibleStates().forEach(s=>{const b=document.createElement('button');b.type='button';b.className='mini-state';b.style.setProperty('--state-color',s.color);b.innerHTML=`<span></span>${esc(stateName(s.id))}`;b.onclick=()=>{const at=timeOnDay(box.querySelector('.insert-time').value,dayTs,mid),snap=snapshotState();if(!insertSwitchInRange(r.id,s.id,at)){toast(t('timeMustBeInside'));return;}renderAll();undo(t('insertedUndo',{state:stateName(s.id)}),()=>{restoreSnapshot(snap);renderAll();});};list.appendChild(b);});box.hidden=false;revealPanel(box);
}

function buildPoint(p){
  const wrap=document.createElement('div');wrap.className='point-wrap';wrap.innerHTML=`<button class="point-note" type="button"><span class="point-time">${fmtTime(p.at)}</span><span class="point-mark">●</span><span class="point-text">${esc(p.text)}</span></button><div class="point-inline" hidden></div>`;wrap.querySelector('.point-note').onclick=()=>openPointEditor(wrap,p);return wrap;
}
function buildLoosePoint(p){const div=document.createElement('div');div.className='loose-point';div.appendChild(buildPoint(p));return div;}
function openPointEditor(wrap,p){
  const box=wrap.querySelector('.point-inline'),savedPoint=state.points.find(point=>point.id===p.id)||p;closeOtherPanels(box);wrap.classList.add('panel-on-top');wrap.closest('.range')?.classList.add('panel-on-top');box.innerHTML=`<textarea rows="2" aria-label="${t('noteContent')}">${esc(savedPoint.text)}</textarea><div class="point-edit-footer"><div class="inline-hint">${t('autosaveUndoHint')}</div><button type="button" class="point-delete delete" aria-label="${t('delete')}">${t('delete')}</button></div>`;box.hidden=false;revealPanel(box);const ta=box.querySelector('textarea'),before=snapshotState(),key=`point:${p.id}:${uid('edit')}`,label=wrap.querySelector('.point-text');let pointId=savedPoint.id;
  let timer=null,last=ta.value;const commit=()=>{clearTimeout(timer);timer=null;const text=ta.value.trim();if(text===last)return true;const ok=autoSaveMutation(key,t('pointNoteUndo',{text:text.slice(0,18)||t('clear')}),before,()=>{if(!text){if(pointId){deletePoint(pointId);pointId=null;}return true;}if(pointId)return updatePoint(pointId,{text});const id=addPoint(text,savedPoint.at);if(!id)return false;pointId=id;return true;});if(ok){last=text;label.textContent=text;}return ok;};const schedule=()=>{clearTimeout(timer);timer=setTimeout(commit,320);};ta.addEventListener('input',schedule);ta.addEventListener('change',commit);ta.addEventListener('blur',commit);box.__flush=commit;box.querySelector('.delete').onclick=()=>{if(!commit())return;const snap=snapshotState();if(!pointId||!deletePoint(pointId)){toast(t('noteEmpty'));return;}renderAll();undo(t('pointDeletedUndo'),()=>{restoreSnapshot(snap);renderAll();});};setTimeout(()=>ta.focus({preventScroll:true}),20);
}
function revealAutoHideScrollbar(target){
  const scroller=target===document?document.documentElement:target;
  if(!(scroller instanceof Element))return;
  scroller.classList.add('is-scrolling');clearTimeout(scrollHideTimers.get(scroller));
  scrollHideTimers.set(scroller,setTimeout(()=>scroller.classList.remove('is-scrolling'),700));
}
function bindAutoHideScrollbars(){document.addEventListener('scroll',e=>revealAutoHideScrollbar(e.target),true);window.addEventListener('scroll',()=>revealAutoHideScrollbar(document.documentElement),{passive:true});}

function buildBoundary(left,right){
  const wrap=document.createElement('div');wrap.className='boundary-wrap';
  const b=document.createElement('button');b.type='button';b.className='boundary';b.dataset.rightId=right.id;b.innerHTML=`<span class="boundary-end-time" aria-label="${t('boundaryAria')}">${fmtTime(right.start)}</span><i class="boundary-line"></i>`;b.title=t('boundaryHelp');
  const editor=document.createElement('div');editor.className='range-inline boundary-inline';editor.hidden=true;editor.setAttribute('role','group');editor.setAttribute('aria-label',t('adjustBoundary'));
  b.onclick=e=>openBoundaryFromClick(e,right,b);
  wrap.append(editor,b);attachBoundaryDrag(b,right.id,right.start);return wrap;
}
let ignoreTouchBoundaryClick=false,touchClickResetTimer=null;
function openBoundaryFromClick(e,right,anchor){
  if(suppressBoundaryClick){suppressBoundaryClick=false;return;}
  if(e.pointerType==='touch'||ignoreTouchBoundaryClick)return;
  openBoundary(right,anchor);
}
function attachBoundaryDrag(el,rightId,startAt){
  let startY=0,candidate=startAt,dragging=false,pointerId=null,touchPointerId=null,touchStartX=0,touchStartY=0,touchTimer=null,touchLongPressed=false,touchDragging=false;
  const clearTouchHold=()=>{clearTimeout(touchTimer);touchTimer=null;};
  const resetTouchClickGuard=()=>{clearTimeout(touchClickResetTimer);touchClickResetTimer=setTimeout(()=>{ignoreTouchBoundaryClick=false;suppressBoundaryClick=false;},400);};
  const setEndLabel=time=>{const label=el.querySelector('.boundary-end-time');if(label)label.textContent=fmtTime(time);};
  const resetEndLabel=()=>setEndLabel(rangeById(rightId)?.start??startAt);
  const commitDrag=()=>{const snap=snapshotState();if(moveBoundary(rightId,candidate)){renderAll();undo(t('movedBoundary'),()=>{restoreSnapshot(snap);renderAll();});}else{resetEndLabel();toast(t('boundaryOutOfRange'));}};
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'){
      if(!e.target.closest('.boundary-line'))return;
      touchPointerId=e.pointerId;touchStartX=e.clientX;touchStartY=e.clientY;touchLongPressed=false;ignoreTouchBoundaryClick=true;clearTimeout(touchClickResetTimer);
      touchDragging=false;candidate=startAt;
      touchTimer=setTimeout(()=>{if(touchPointerId!==e.pointerId)return;touchLongPressed=true;suppressBoundaryClick=true;el.setPointerCapture?.(e.pointerId);setEndLabel(candidate);pulseFeedback(10);},520);
      return;
    }
    if(e.pointerType!=='mouse')return;pointerId=e.pointerId;startY=e.clientY;candidate=startAt;dragging=false;el.setPointerCapture?.(pointerId);
  });
  el.addEventListener('pointermove',e=>{
    if(touchPointerId===e.pointerId){if(!touchLongPressed&&Math.hypot(e.clientX-touchStartX,e.clientY-touchStartY)>9){clearTouchHold();touchPointerId=null;ignoreTouchBoundaryClick=false;return;}if(!touchLongPressed)return;const dy=e.clientY-touchStartY;if(Math.abs(dy)<8&&!touchDragging)return;touchDragging=true;const minutes=Math.round((dy/1.5)/5)*5;candidate=startAt+minutes*60000;setEndLabel(candidate);e.preventDefault();return;}
    if(pointerId!==e.pointerId)return;const dy=e.clientY-startY;if(Math.abs(dy)<8&&!dragging)return;dragging=true;suppressBoundaryClick=true;const minutes=Math.round((dy/1.5)/5)*5;candidate=startAt+minutes*60000;setEndLabel(candidate);
  });
  const finish=(e,cancelled=false)=>{if(pointerId!==e.pointerId)return;pointerId=null;el.releasePointerCapture?.(e.pointerId);if(!dragging)return;if(cancelled)resetEndLabel();else commitDrag();dragging=false;};
  el.addEventListener('pointerup',e=>{if(touchPointerId===e.pointerId){clearTouchHold();el.releasePointerCapture?.(e.pointerId);if(touchLongPressed){suppressBoundaryClick=true;if(touchDragging)commitDrag();else{resetEndLabel();openBoundary(rangeById(rightId)||{id:rightId,start:startAt},el);}}touchPointerId=null;ignoreTouchBoundaryClick=true;resetTouchClickGuard();touchLongPressed=false;touchDragging=false;return;}finish(e);});
  el.addEventListener('pointercancel',e=>{if(touchPointerId===e.pointerId){clearTouchHold();resetEndLabel();touchPointerId=null;touchLongPressed=false;touchDragging=false;ignoreTouchBoundaryClick=false;clearTimeout(touchClickResetTimer);suppressBoundaryClick=false;return;}finish(e,true);});
  el.addEventListener('contextmenu',e=>e.preventDefault());
}
function openBoundary(right,anchor){
  const at=fullRangeById(right.id)?.start??right.start,isRangeStart=anchor.matches?.('.range-start-edit'),host=isRangeStart?anchor.closest('.range'):anchor.closest('.boundary-wrap'),box=isRangeStart?host?.querySelector('.range-start-inline'):host?.querySelector('.boundary-inline');if(!box)return;
  closeBoundary();closeOtherPanels(box);host.classList.add('panel-on-top');box.className=`range-inline boundary-inline${isRangeStart?' range-start-inline':''}`;box.innerHTML=`<input class="auto-time" type="time" aria-label="${t('time')}"><div class="inline-hint">${t('boundaryDateHint')}</div>`;
  const input=box.querySelector('input'),before=snapshotState(),dayTs=dayStart(selectedDay),undoKey=`time:${right.id}:${uid('edit')}`;input.value=timeInputValue(at);boundaryContext={rightId:right.id,at,originalAt:at,dayTs,host,box,input,before,undoKey};
  const commit=()=>{const ctx=boundaryContext;if(!ctx||ctx.input!==input)return;const movedAt=timeOnDay(input.value,ctx.dayTs,ctx.at);if(!Number.isFinite(movedAt)){input.setAttribute('aria-invalid','true');return false;}input.removeAttribute('aria-invalid');if(Math.abs(movedAt-ctx.at)<1000)return true;const ok=moveBoundary(ctx.rightId,movedAt);if(!ok){toast(t('cannotMoveBoundary'));return false;}const actualAt=rangeById(ctx.rightId)?.start;if(!Number.isFinite(actualAt))return false;ctx.at=actualAt;input.value=timeInputValue(actualAt);undo(t('timeChanged',{from:fmtTime(ctx.originalAt),to:fmtTime(actualAt)}),()=>restoreSnapshot(ctx.before),ctx.undoKey);refreshStreamTimeLabels();renderNow();renderStates();return true;};
  let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(commit,320);};input.addEventListener('input',schedule);input.addEventListener('change',commit);input.addEventListener('blur',commit);input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();commit();closeBoundary();}});box.__flush=commit;boundaryContext.flush=commit;box.hidden=false;
  if(!isRangeStart){const streamRect=box.closest('#stream')?.getBoundingClientRect(),hostRect=host.getBoundingClientRect(),panelHeight=box.getBoundingClientRect().height,above=streamRect?hostRect.top-streamRect.top:Infinity,below=streamRect?streamRect.bottom-hostRect.bottom:0;box.classList.toggle('opens-below',above<panelHeight+4&&below>above);}
  revealPanel(box);setTimeout(()=>{input.focus({preventScroll:true});input.select?.();},20);
}
function closeBoundary(){if(boundaryContext?.box){boundaryContext.flush?.();boundaryContext.box.hidden=true;boundaryContext.box.innerHTML='';boundaryContext.host?.classList.remove('panel-on-top');}boundaryContext=null;}
function refreshStreamTimeLabels(){const ranges=new Map(dayRanges(selectedDay).map(r=>[r.id,r]));document.querySelectorAll('.range[data-range-id]').forEach(el=>{const r=ranges.get(el.dataset.rangeId);if(!r)return;const duration=el.querySelector('.range-duration');if(duration)duration.textContent=fmtDur(r.end-r.start);const start=el.querySelector('.range-start-edit');if(start)start.textContent=fmtTime(r.start);});document.querySelectorAll('.boundary[data-right-id]').forEach(b=>{const r=ranges.get(b.dataset.rightId);if(r&&b.querySelector('span'))b.querySelector('span').textContent=fmtTime(r.start);});}
function finishNewStateDraft(){const input=qs('newStateName');if(input)input.value='';}

function performSwitch(id){
  const snap=snapshotState();if(!switchNow(id)){if(lastPersistError)showPersistError();else toast(currentStateId()===id?t('alreadyState',{state:stateName(id)}):t('cannotSwitch'));return;}pulseFeedback();selectedDay=dayStart(now());renderAll();undo(t('switchUndo',{state:stateName(id)}),()=>{restoreSnapshot(snap);renderAll();});
}

function openQuickNote(){const panel=qs('noteComposer');closeOtherPanels(panel);qs('quickToolsPanel').hidden=false;qs('quickToolsToggle').setAttribute('aria-expanded','true');updateQuickToolsPosition();quickNotePointId=null;quickNoteBefore=snapshotState();quickNoteUndoKey=`quick-note:${uid('edit')}`;quickNoteAt=null;qs('quickNoteInput').value='';panel.hidden=false;qs('noteTrigger').hidden=true;revealPanel(panel);let timer=null,lastSig='';const commit=({refresh=true}={})=>{clearTimeout(timer);timer=null;const text=qs('quickNoteInput').value.trim(),at=quickNoteAt??timeOnDay(timeInputValue(now()),selectedDay),sig=text;if(sig===lastSig)return true;if(!text){if(quickNotePointId){const id=quickNotePointId;if(!autoSaveMutation(quickNoteUndoKey,t('eraseNote'),quickNoteBefore,()=>deletePoint(id)))return false;quickNotePointId=null;if(refresh)renderStream(true);}lastSig=sig;return true;}const ok=autoSaveMutation(quickNoteUndoKey,t('pointNoteUndo',{text:text.slice(0,18)}),quickNoteBefore,()=>{if(quickNotePointId)return updatePoint(quickNotePointId,{text,at});const id=addPoint(text,at);if(!id)return false;quickNotePointId=id;return true;});if(ok){quickNoteAt=at;lastSig=sig;if(refresh)renderStream(true);}return ok;};quickNoteCommit=commit;panel.__flush=commit;const schedule=()=>{clearTimeout(timer);timer=setTimeout(commit,320);};qs('quickNoteInput').oninput=schedule;qs('quickNoteInput').onblur=()=>commit();setTimeout(()=>qs('quickNoteInput').focus({preventScroll:true}),20);}
function closeQuickNote({refresh=true}={}){quickNoteCommit?.({refresh});const hadPoint=!!quickNotePointId;qs('noteComposer').hidden=true;qs('noteTrigger').hidden=false;qs('quickNoteInput').value='';quickNotePointId=null;quickNoteCommit=null;quickNoteBefore=null;quickNoteUndoKey=null;if(!refresh&&hadPoint)quickNoteNeedsStreamRender=true;}

function renderSettings(){
  const box=qs('stateSettings');box.innerHTML='';
  state.states.forEach((s,i)=>{
    const row=document.createElement('div');row.className='state-setting'+(s.locked?' locked':'');row.dataset.stateId=s.id;
    if(s.locked){
      row.innerHTML=`<span class="state-index">${i+1}</span><span class="state-swatch" style="--swatch:${esc(s.color)}" aria-hidden="true"></span><span class="state-name-static">${esc(stateName(s.id))}</span>`;
    }else{
      const visibleName=stateName(s.id);
      row.innerHTML=`<span class="state-index">${i+1}</span><input type="color" aria-label="${esc(t('colorFor',{state:visibleName}))}" value="${esc(s.color)}"><input type="text" aria-label="${t('stateName')}" value="${esc(visibleName)}"><div class="state-setting-actions"><button class="archive-state" type="button">${t(s.archived?'enable':'disable')}</button><button class="delete-state" type="button">${t('delete')}</button></div>`;
      const color=row.querySelector('input[type=color]'),name=row.querySelector('input[type=text]'),before=snapshotState(),key=`state-edit:${s.id}:${uid('edit')}`;let timer=null,nameTouched=false;
      const commit=()=>{clearTimeout(timer);timer=null;const nextName=nameTouched?(name.value.trim()||s.name):s.name,nextColor=color.value;if(nextName===s.name&&nextColor===s.color)return true;return autoSaveMutation(key,t('stateColorChanged',{before:visibleName,after:nextName}),before,()=>transact(()=>{const target=stateById(s.id);if(!target)return false;target.name=nextName;target.color=nextColor;return true;}),()=>{renderNow();renderStates();document.querySelectorAll('.range-state').forEach(el=>{if(el.dataset.stateId===s.id)el.textContent=stateName(s.id);});});};
      name.addEventListener('input',()=>{nameTouched=true;clearTimeout(timer);timer=setTimeout(commit,320);});color.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(commit,320);});[name,color].forEach(input=>{input.addEventListener('change',commit);input.addEventListener('blur',commit);input.__flush=commit;});row.__flush=commit;
      row.querySelector('.archive-state').onclick=()=>{const snap=snapshotState(),archived=!s.archived;if(!archiveState(s.id,archived))return;renderSettings();renderAll();undo(t(archived?'stateDisabled':'stateEnabled'),()=>{restoreSnapshot(snap);renderSettings();renderAll();});};
      row.querySelector('.delete-state').onclick=()=>{if(state.events.some(e=>e.type==='switch'&&e.stateId===s.id)){toast(t('stateInUse'));return;}const snap=snapshotState();if(deleteUnusedState(s.id)){renderSettings();renderAll();undo(t('stateDeleted',{state:visibleName}),()=>{restoreSnapshot(snap);renderSettings();renderAll();});}else toast(t('cannotDelete'));};
    }
    box.appendChild(row);
  });
  const version=qs('settingsVersion');if(version)version.textContent='Life Trace · Stream V4.0.70';
}

function addNewState(){
  const input=qs('newStateName'),name=input.value.trim();
  if(!name){input.focus({preventScroll:true});return;}
  if(state.states.some(s=>s.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){toast(t('stateExists'));input.focus({preventScroll:true});return;}
  const before=snapshotState(),id=uid('st'),color=PALETTE[state.states.length%PALETTE.length];
  if(!transact(()=>{state.states.push({id,name,color,locked:false,archived:false});return true;})){showPersistError();return;}
  input.value='';renderSettings();renderStates();undo(t('stateCreated',{state:name}),()=>{restoreSnapshot(before);renderSettings();renderAll();});input.focus({preventScroll:true});
}
