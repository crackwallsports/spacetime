"use strict";

function closeSheet(id){const sheet=qs(id);for(const input of sheet.querySelectorAll('input,textarea'))if(input.__flush?.()===false)return false;sheet.hidden=true;if(id==='settingsSheet')finishNewStateDraft();return true;}
function anyEditorOpen(){return !!document.querySelector('.sheet-backdrop:not([hidden]),.quick-tools-panel:not([hidden]),.note-composer:not([hidden]),.range-inline:not([hidden]),.range-actions-popover:not([hidden]),.point-inline:not([hidden]),.boundary-inline:not([hidden]),.history-picker:not([hidden]),.undo-history:not([hidden])');}

function bind(){
  bindAutoHideScrollbars();
  bindSettingsSheetDrag();
  qs('quickToolsToggle').onclick=()=>{const panel=qs('quickToolsPanel');if(panel.hidden){closeOtherPanels(panel);panel.hidden=false;qs('quickToolsToggle').setAttribute('aria-expanded','true');updateQuickToolsPosition();revealPanel(panel);}else closeTimelinePanel(panel);};
  qs('backToTop').onclick=()=>qs('stream').scrollTo({top:0,behavior:'smooth'});
  qs('undoHistoryTrigger').onclick=()=>{const panel=qs('undoHistory');if(panel.hidden){closeOtherPanels(panel);renderUndoHistory();panel.hidden=false;positionUndoHistory();}else panel.hidden=true;};
  qs('undoLatest').onclick=()=>{if(!qs('noteComposer').hidden)closeQuickNote();performUndo(undoStack.length-1);};
  qs('undoHistoryClose').onclick=()=>qs('undoHistory').hidden=true;
  qs('settingsBtn').onclick=()=>{const panel=qs('settingsSheet');closeOtherPanels(panel);renderSettings();panel.hidden=false;};
  qs('localeZh').onclick=()=>setUiLocale('zh-CN');
  qs('localeEn').onclick=()=>setUiLocale('en');
  document.querySelectorAll('[data-close-sheet]').forEach(b=>b.onclick=()=>closeSheet(b.dataset.closeSheet));
  document.querySelectorAll('.sheet-backdrop').forEach(bg=>bg.addEventListener('click',e=>{if(e.target===bg)closeSheet(bg.id);}));
  document.addEventListener('pointerdown',rememberOutsidePanelPointer,true);
  document.addEventListener('click',closePanelAfterOutsideClick);

  qs('historyDate').onchange=()=>{const ts=dayStartFromKey(qs('historyDate').value);if(!Number.isFinite(ts))return;selectedDay=ts;closeHistory();renderDays();renderStream();};
  qs('historyClose').onclick=closeHistory;

  qs('stopBtn').onclick=()=>{const snap=snapshotState();if(!stopRecording()){if(lastPersistError)showPersistError();return;}pulseFeedback();renderAll();undo(t('stopDone'),()=>{restoreSnapshot(snap);renderAll();});};

  qs('noteTrigger').onclick=openQuickNote;qs('noteClose').onclick=()=>closeQuickNote();

  qs('addStateBtn').onclick=addNewState;
  qs('newStateName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addNewState();}});

  qs('exportBtn').onclick=()=>downloadState(state,`life-trace-${dayKey(now())}.json`);
  qs('importBtn').onclick=()=>qs('importFile').click();
  qs('importFile').onchange=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    try{
      const payload=await parseImportedState(f);
      const merge=confirm(t('importMergePrompt'));
      if(merge){const result=mergeFromImport(payload);if(!result){showPersistError();return;}clearUndoHistory();toast(result.skippedConflicts?t('importSkipped',{count:result.skippedConflicts}):t('importDone'));}
      else if(confirm(t('replacePrompt'))){if(!replaceFromImport(payload)){showPersistError();return;}clearUndoHistory();toast(t('backupRestored'));}
      else return;
      selectedDay=dayStart(now());renderAll();renderSettings();
    }catch(err){console.warn(err);toast(t('invalidImport'));}
  };

  window.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!e.target.matches('input,textarea,select')&&undoStack.length){e.preventDefault();performUndo(undoStack.length-1);return;}
    if(e.target.matches('input,textarea,select')||anyEditorOpen()){
      if(e.key==='Escape'){closeQuickNote();closeBoundary();closeHistory();document.querySelectorAll('.range-inline:not([hidden]),.range-actions-popover:not([hidden]),.point-inline:not([hidden])').forEach(x=>closeTimelinePanel(x));document.querySelectorAll('.sheet-backdrop:not([hidden])').forEach(x=>closeSheet(x.id));if(!qs('quickToolsPanel').hidden)closeTimelinePanel(qs('quickToolsPanel'));qs('undoHistory').hidden=true;}return;
    }
    if(e.key>='1'&&e.key<='9'){const s=visibleStates()[Number(e.key)-1];if(s)performSwitch(s.id);}
    else if(e.key.toLowerCase()==='n')openQuickNote();
    else if(e.key==='Escape'){closeQuickNote();closeBoundary();closeHistory();document.querySelectorAll('.range-inline:not([hidden]),.range-actions-popover:not([hidden]),.point-inline:not([hidden])').forEach(x=>closeTimelinePanel(x));if(!qs('quickToolsPanel').hidden)closeTimelinePanel(qs('quickToolsPanel'));qs('undoHistory').hidden=true;}
  });

  window.matchMedia('(max-width:640px)').addEventListener?.('change',()=>renderDays());
  window.addEventListener('scroll',updateQuickToolsPosition,{passive:true});
  qs('stream').addEventListener('scroll',updateQuickToolsPosition,{passive:true});
  window.addEventListener('resize',()=>{fitQuickToolsLabel();updateQuickToolsPosition();},{passive:true});
  window.visualViewport?.addEventListener('resize',updateQuickToolsPosition);
  window.visualViewport?.addEventListener('scroll',updateQuickToolsPosition);
  window.addEventListener('resize',positionUndoHistory);
  window.visualViewport?.addEventListener('resize',positionUndoHistory);
}

function bindSettingsSheetDrag(){
  const sheet=qs('settingsSheet')?.querySelector('.sheet'),handle=qs('settingsSheet')?.querySelector('.sheet-handle');
  if(!sheet||!handle)return;
  let drag=null;
  const reset=()=>{drag=null;sheet.classList.remove('dragging');sheet.style.removeProperty('--sheet-drag');};
  handle.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    drag={id:e.pointerId,y:e.clientY};sheet.classList.add('dragging');handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    sheet.style.setProperty('--sheet-drag',`${Math.max(0,e.clientY-drag.y)}px`);
  });
  handle.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const distance=e.clientY-drag.y;reset();
    if(distance>64)closeSheet('settingsSheet');
  });
  handle.addEventListener('pointercancel',reset);
  handle.addEventListener('lostpointercapture',reset);
}

function registerServiceWorker(){if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service Worker 注册失败',err)));}
window.__onThemeChange=()=>renderAll();
window.__onLocaleChange=()=>{
  const sheet=qs('settingsSheet'),draft=qs('newStateName').value;
  if(!sheet.hidden)sheet.querySelectorAll('.state-setting').forEach(row=>row.__flush?.());
  renderAll();renderUndoHistory();
  if(!sheet.hidden){renderSettings();qs('newStateName').value=draft;}
};
bind();renderAll();renderUndoHistory();registerServiceWorker();
setInterval(()=>{
  if(document.hidden)return;
  renderNow();
  const currentToday=dayKey(now());
  if(currentToday!==lastTodayKey){if(dayKey(selectedDay)===lastTodayKey)selectedDay=dayStart(now());lastTodayKey=currentToday;renderDays();renderStream();}
  else if(dayKey(selectedDay)===currentToday)renderStream();
},30000);
