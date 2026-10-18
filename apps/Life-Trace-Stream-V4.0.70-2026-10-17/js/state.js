"use strict";

const PALETTE=['#8b93a1','#6f8ff8','#45b987','#9b7bf0','#e29b43','#db6f86','#4ab9c2','#c3ad45'];
const OFF_COLOR='#626975';
const MIN_EVENT_GAP_MS=1000;
const LONG_RANGE_MS=8*3600000;
let lastMutationBefore=null;

function now(){return Date.now();}
function uid(prefix){return `${prefix}_${now()}_${Math.random().toString(36).slice(2,8)}`;}
function timezoneOffset(ts=now()){return new Date(ts).getTimezoneOffset();}
function dayStart(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime();}
function addLocalDays(ts,days){const d=new Date(dayStart(ts));d.setDate(d.getDate()+days);d.setHours(0,0,0,0);return d.getTime();}
function nextDayStart(ts){return addLocalDays(ts,1);}
function previousDayStart(ts){return addLocalDays(ts,-1);}
function dayKey(ts){const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dayStartFromKey(key){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key||''));if(!m)return NaN;return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),0,0,0,0).getTime();}
function dayLabel(ts){const k=dayKey(ts),today=dayKey(now()),yesterday=dayKey(previousDayStart(now()));if(k===today)return t('today');if(k===yesterday)return t('yesterday');return localizedDayNumber(ts);}
function fullDayLabel(ts){return new Intl.DateTimeFormat(uiLocale,{year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(ts));}
function shortDateLabel(ts){const d=new Date(ts);return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;}
function isColor(c){return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c||'');}
function fmtTime(ts){return new Intl.DateTimeFormat(uiLocale,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(ts));}
function timeInputValue(ts){const d=new Date(ts);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function timeOnDay(value,dayTs,preserveTs=null){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));if(!m)return NaN;const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return NaN;const d=new Date(dayStart(dayTs));const ref=preserveTs==null?null:new Date(Number(preserveTs));d.setHours(h,min,ref?.getSeconds()||0,ref?.getMilliseconds()||0);return d.getTime();}
function fmtDur(ms){ms=Math.max(0,ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);if(h>0)return m?`${h}h ${m}m`:`${h}h`;if(m>0)return `${m}m`;return t('underMinute');}
function localDateTimeStr(ts){const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function localDateTimeToTs(value,preserveTs=null){const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value||''));if(!m)return NaN;const hasReference=preserveTs!==null&&preserveTs!==undefined&&Number.isFinite(Number(preserveTs)),ref=hasReference?new Date(Number(preserveTs)):null;const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),ref?ref.getSeconds():0,ref?ref.getMilliseconds():0);return d.getTime();}

function defaultStates(){return [
  {id:'st_undefined',name:'未定义',color:'#8b93a1',locked:true,archived:false},
  {id:'st_focus',name:'专注',color:'#6f8ff8',locked:false,archived:false},
  {id:'st_active',name:'活动',color:'#45b987',locked:false,archived:false},
  {id:'st_rest',name:'放松',color:'#9b7bf0',locked:false,archived:false}
];}
function blankState(){return {version:4,states:defaultStates(),events:[],points:[],rangeNotes:{},settings:{}};}

function normalizeLegacyStates(list){
  const states=(Array.isArray(list)&&list.length?list:defaultStates()).map((s,i)=>({
    id:s.id==='st_lost'?'st_undefined':(s.id||`st_${i}`),
    name:s.name==='迷茫'?'未定义':String(s.name||`状态${i+1}`),
    color:isColor(s.color)?s.color:PALETTE[i%PALETTE.length],
    locked:!!s.locked,
    archived:!!s.archived
  }));
  let u=states.find(s=>s.id==='st_undefined')||states.find(s=>s.locked);
  if(!u){u=defaultStates()[0];states.unshift(u);}else{u.id='st_undefined';u.locked=true;u.name=String(u.name||'未定义');}
  return states;
}

function legacyRangesFromRaw(raw){
  if(Array.isArray(raw.ranges)){
    return raw.ranges.map(r=>({id:r.id||uid('legacy_range'),type:r.type==='off'?'off':'state',stateId:r.stateId,start:r.start,end:r.end,open:!!r.open,note:String(r.note||'')}));
  }
  return (raw.segments||[]).map(seg=>({
    id:(seg.id||uid('legacy_range')).replace(/^seg_/,'range_'),
    type:seg.type==='off'?'off':'state',
    stateId:seg.type==='off'?null:(seg.statusId==='st_lost'?'st_undefined':seg.statusId),
    start:seg.start,end:seg.end,open:!!seg.open,
    note:[String(seg.note||''),Array.isArray(seg.activities)?seg.activities.map(a=>a.name+(a.durationMinutes?` ${a.durationType==='estimated'?'~':''}${a.durationMinutes}m`:'')).join('；'):''].filter(Boolean).join('\n')
  }));
}

function migrateLegacy(raw){
  const out=blankState();
  out.states=normalizeLegacyStates(raw.states||raw.statuses);
  out.points=Array.isArray(raw.points)?raw.points.map(p=>({id:p.id||uid('point'),at:Number(p.at),text:String(p.text||''),tzOffset:Number.isFinite(p.tzOffset)?p.tzOffset:timezoneOffset(Number(p.at))})):[];
  out.settings=raw.settings&&typeof raw.settings==='object'?raw.settings:{};
  const ranges=legacyRangesFromRaw(raw).filter(r=>Number.isFinite(r.start)).sort((a,b)=>a.start-b.start);
  const notes={};
  let previousEnd=null;
  for(const r of ranges){
    const end=r.open?now():Number(r.end);
    if(previousEnd!==null&&r.start>previousEnd+MIN_EVENT_GAP_MS){
      out.events.push({id:uid('ev'),type:'stop',at:previousEnd,tzOffset:timezoneOffset(previousEnd)});
    }
    const id=`ev_${r.id}`;
    out.events.push({id,type:r.type==='off'?'stop':'switch',at:r.start,stateId:r.type==='state'?(r.stateId||'st_undefined'):undefined,tzOffset:timezoneOffset(r.start)});
    if(r.note)notes[id]=r.note;
    previousEnd=Number.isFinite(end)?end:r.start;
    if(r.open)previousEnd=null;
  }
  const legacyCurrent=raw.current?{
    stateId:raw.current.stateId||(raw.current.statusId==='st_lost'?'st_undefined':raw.current.statusId),
    start:Number(raw.current.start),note:String(raw.current.note||'')
  }:null;
  if(legacyCurrent&&Number.isFinite(legacyCurrent.start)){
    if(previousEnd!==null&&legacyCurrent.start>previousEnd+MIN_EVENT_GAP_MS)out.events.push({id:uid('ev'),type:'stop',at:previousEnd,tzOffset:timezoneOffset(previousEnd)});
    const id=uid('ev');out.events.push({id,type:'switch',at:legacyCurrent.start,stateId:legacyCurrent.stateId||'st_undefined',tzOffset:timezoneOffset(legacyCurrent.start)});if(legacyCurrent.note)notes[id]=legacyCurrent.note;
    previousEnd=null;
  }else if(previousEnd!==null&&ranges.length){
    const last=ranges[ranges.length-1];
    if(!last.open&&Number.isFinite(last.end))out.events.push({id:uid('ev'),type:'stop',at:last.end,tzOffset:timezoneOffset(last.end)});
  }
  out.rangeNotes=notes;
  return out;
}

function migrate(raw){
  raw=unwrapImportedState(raw);
  if(!raw||typeof raw!=='object')return blankState();
  if(Number(raw.version)>=4&&Array.isArray(raw.events))return deepClone(raw);
  return migrateLegacy(raw);
}

let state=migrate(readStoredState());
let lastPersistError=null;

function normalizeState(){
  if(!state||typeof state!=='object')state=blankState();
  state.version=4;
  if(!Array.isArray(state.states)||!state.states.length)state.states=defaultStates();
  if(!Array.isArray(state.events))state.events=[];
  if(!Array.isArray(state.points))state.points=[];
  if(!state.rangeNotes||typeof state.rangeNotes!=='object'||Array.isArray(state.rangeNotes))state.rangeNotes={};
  if(!state.settings||typeof state.settings!=='object')state.settings={};

  state.states=normalizeLegacyStates(state.states);
  const stateIds=new Set(state.states.map(s=>s.id));
  const usedStateIds=new Set();
  const byTime=new Map();
  for(const raw of state.events){
    if(!raw||!Number.isFinite(Number(raw.at)))continue;
    const type=raw.type==='switch'?'switch':'stop';
    const ev={id:String(raw.id||uid('ev')),type,at:Number(raw.at),tzOffset:Number.isFinite(raw.tzOffset)?raw.tzOffset:timezoneOffset(Number(raw.at))};
    if(type==='switch'){ev.stateId=stateIds.has(raw.stateId)?raw.stateId:'st_undefined';usedStateIds.add(ev.stateId);}
    byTime.set(ev.at,ev); // 同一时刻只能有一个结构事件；后者覆盖前者。
  }
  state.events=[...byTime.values()].filter(e=>e.at<=now()+60000).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  state.points=state.points.filter(p=>p&&Number.isFinite(Number(p.at))&&String(p.text||'').trim()).map(p=>({id:String(p.id||uid('point')),at:Number(p.at),text:String(p.text).trim(),tzOffset:Number.isFinite(p.tzOffset)?p.tzOffset:timezoneOffset(Number(p.at))})).sort((a,b)=>a.at-b.at);
  const validEventIds=new Set(state.events.map(e=>e.id));
  const notes={};for(const [id,text] of Object.entries(state.rangeNotes)){if(validEventIds.has(id)&&String(text||'').trim())notes[id]=String(text).trim();}state.rangeNotes=notes;
  const compactEvents=[];
  for(const event of state.events){
    const previous=compactEvents[compactEvents.length-1];
    if(previous?.type==='stop'&&event.type==='stop'){
      const merged=[state.rangeNotes[previous.id],state.rangeNotes[event.id]].filter(Boolean).join('\n');
      if(merged)state.rangeNotes[previous.id]=merged;else delete state.rangeNotes[previous.id];
      delete state.rangeNotes[event.id];
      continue;
    }
    compactEvents.push(event);
  }
  state.events=compactEvents;
  state.states.forEach(s=>{s.archived=!!s.archived;if(s.locked)s.archived=false;});
}

normalizeState();writeStoredState(state);

function saveState(){normalizeState();const ok=writeStoredState(state);lastPersistError=ok?null:t('storageFailure');return ok;}
function transact(mutator){
  const before=deepClone(state);
  lastMutationBefore=null;
  try{
    const result=mutator();
    if(result===false){state=before;return false;}
    normalizeState();
    if(!writeStoredState(state)){state=before;lastPersistError=t('storageFailure');return false;}
    lastPersistError=null;lastMutationBefore=JSON.stringify(before);return result===undefined?true:result;
  }catch(err){console.error(err);state=before;lastPersistError=t('operationFailure');return false;}
}
function snapshotState(){return JSON.stringify(state);}
function restoreSnapshot(s){const before=state;lastMutationBefore=null;try{state=JSON.parse(s);normalizeState();if(!writeStoredState(state)){state=before;return false;}return true;}catch(_){state=before;return false;}}
function stateById(id){return state.states.find(s=>s.id===id);}
function stateName(id){return stateById(id)?displayStateName(stateById(id)):t('unknown');}
function stateColor(id){const c=stateById(id)?.color;return isColor(c)?c:'#888';}
function visibleStates(){return state.states.filter(s=>!s.archived);}

function structureEvents(){return state.events.slice().sort((a,b)=>a.at-b.at);}
function lastStructureEvent(at=now()){let found=null;for(const e of state.events){if(e.at<=at)found=e;else break;}return found;}
function stateAt(at){const e=lastStructureEvent(at);return e?.type==='switch'?e.stateId:null;}
function currentEvent(){return lastStructureEvent(now());}
function isRecording(){return currentEvent()?.type==='switch';}
function currentStateId(){const e=currentEvent();return e?.type==='switch'?e.stateId:null;}
function currentRangeStart(){return currentEvent()?.at??null;}

function rangeFromEventIndex(events,i,endAt=now()){
  const e=events[i],next=events[i+1],end=Math.min(next?next.at:endAt,endAt);
  if(!e||end<=e.at)return null;
  return {id:e.id,startEventId:e.id,type:e.type==='switch'?'state':'off',stateId:e.type==='switch'?e.stateId:null,start:e.at,end,note:state.rangeNotes[e.id]||'',live:!next&&endAt>=now()-1000,open:!next};
}
function allRanges(endAt=now()){
  const events=structureEvents(),out=[];for(let i=0;i<events.length;i++){const r=rangeFromEventIndex(events,i,endAt);if(r)out.push(r);}return out;
}
function rangeById(id){return allRanges().find(r=>r.id===id)||null;}
function currentRange(){const e=currentEvent();if(!e)return null;return {id:e.id,startEventId:e.id,type:e.type==='switch'?'state':'off',stateId:e.type==='switch'?e.stateId:null,start:e.at,end:now(),note:state.rangeNotes[e.id]||'',live:true,open:true};}

function upsertStructureEvent(type,at,stateId){
  const t=Math.min(now(),Number(at));if(!Number.isFinite(t))return false;
  const existing=state.events.find(e=>Math.abs(e.at-t)<MIN_EVENT_GAP_MS);
  if(existing){existing.type=type;existing.at=t;existing.tzOffset=timezoneOffset(t);if(type==='switch')existing.stateId=stateId;else delete existing.stateId;return existing.id;}
  const id=uid('ev');const ev={id,type,at:t,tzOffset:timezoneOffset(t)};if(type==='switch')ev.stateId=stateId;state.events.push(ev);return id;
}
function switchAt(stateId,at=now()){
  if(!stateById(stateId))return false;const t=Math.min(now(),Number(at));if(!Number.isFinite(t))return false;
  const exact=state.events.find(e=>Math.abs(e.at-t)<MIN_EVENT_GAP_MS);
  if(!exact&&stateAt(t)===stateId)return false;
  return transact(()=>!!upsertStructureEvent('switch',t,stateId));
}
function switchNow(stateId){return switchAt(stateId,now());}
function stopAt(at=now()){
  const t=Math.min(now(),Number(at));if(!Number.isFinite(t))return false;
  const exact=state.events.find(e=>Math.abs(e.at-t)<MIN_EVENT_GAP_MS);
  if(!exact&&stateAt(t)===null)return false;
  return transact(()=>!!upsertStructureEvent('stop',t));
}
function stopRecording(){return stopAt(now());}

// Local-midnight events must be exact: rounding by the normal event-gap rule can
// absorb a nearby event on the adjacent day and let an edit cross the boundary.
function putEventAtDayBoundary(at,type,stateId){
  const exact=state.events.find(e=>e.at===at);
  if(exact){exact.type=type;exact.tzOffset=timezoneOffset(at);if(type==='switch')exact.stateId=stateId;else delete exact.stateId;return exact.id;}
  const id=uid('ev'),event={id,type,at,tzOffset:timezoneOffset(at)};if(type==='switch')event.stateId=stateId;state.events.push(event);return id;
}
function changeRangeState(rangeId,stateId,dayTs=dayStart(now())){
  if(!stateById(stateId))return false;
  const day=dayStart(dayTs),dayEnd=nextDayStart(day),segment=dayRanges(day).find(r=>r.id===rangeId);
  if(!segment||(segment.type==='state'&&segment.stateId===stateId))return false;
  return transact(()=>{
    const events=structureEvents(),index=events.findIndex(e=>e.id===rangeId),source=events[index];if(!source)return false;
    const next=events[index+1]||null,restoreState=stateAt(dayEnd),rangeNote=state.rangeNotes[rangeId]||'';
    const start=Math.max(source.at,day),startEvent=source.at>=day?source:putEventAtDayBoundary(start,'switch',stateId);
    if(startEvent===source){source.type='switch';source.stateId=stateId;source.tzOffset=timezoneOffset(source.at);}
    else if(rangeNote)state.rangeNotes[startEvent]=rangeNote;
    const needsRestore=dayEnd<=now()&&(!next||next.at>dayEnd)&&!events.some(e=>e.at===dayEnd);
    if(needsRestore){const restoreId=putEventAtDayBoundary(dayEnd,restoreState?'switch':'stop',restoreState||undefined);if(rangeNote)state.rangeNotes[restoreId]=rangeNote;}
    return true;
  });
}
function deleteRange(rangeId,dayTs=dayStart(now())){
  const day=dayStart(dayTs),dayEnd=nextDayStart(day),segment=dayRanges(day).find(r=>r.id===rangeId);if(!segment)return false;
  return transact(()=>{
    const events=structureEvents(),index=events.findIndex(e=>e.id===rangeId),source=events[index];if(!source)return false;
    const next=events[index+1]||null,restoreState=stateAt(dayEnd),rangeNote=state.rangeNotes[rangeId]||'';
    if(source.at>=day){source.type='stop';delete source.stateId;source.tzOffset=timezoneOffset(source.at);delete state.rangeNotes[rangeId];}
    else putEventAtDayBoundary(day,'stop');
    const needsRestore=dayEnd<=now()&&(!next||next.at>dayEnd)&&!events.some(e=>e.at===dayEnd);
    if(needsRestore){const restoreId=putEventAtDayBoundary(dayEnd,restoreState?'switch':'stop',restoreState||undefined);if(rangeNote)state.rangeNotes[restoreId]=rangeNote;}
    return true;
  });
}
function setRangeNote(rangeId,text){
  return transact(()=>{if(!state.events.some(e=>e.id===rangeId))return false;text=String(text||'').trim();if(text)state.rangeNotes[rangeId]=text;else delete state.rangeNotes[rangeId];return true;});
}
function moveBoundary(rightRangeId,newAt){
  return transact(()=>{
    const events=structureEvents(),i=events.findIndex(e=>e.id===rightRangeId);if(i<0)return false;
    const prev=events[i-1]||null,next=events[i+1]||null;
    let t=Math.min(now(),Number(newAt));if(!Number.isFinite(t))return false;
    if(prev)t=Math.max(t,prev.at+MIN_EVENT_GAP_MS);
    if(next)t=Math.min(t,next.at-MIN_EVENT_GAP_MS);else t=Math.min(t,now()-MIN_EVENT_GAP_MS);
    if(t<0||Math.abs(t-events[i].at)<1)return false;
    const target=state.events.find(e=>e.id===rightRangeId);target.at=t;target.tzOffset=timezoneOffset(t);return true;
  });
}
function removeBoundary(rightRangeId){
  return transact(()=>{
    const events=structureEvents(),i=events.findIndex(e=>e.id===rightRangeId);if(i<=0)return false;
    const left=events[i-1],right=events[i];
    const merged=[state.rangeNotes[left.id],state.rangeNotes[right.id]].filter(Boolean).join('\n');
    if(merged)state.rangeNotes[left.id]=merged;delete state.rangeNotes[right.id];
    state.events=state.events.filter(e=>e.id!==rightRangeId);return true;
  });
}
function insertSwitchInRange(rangeId,stateId,at){
  const r=rangeById(rangeId);if(!r||!stateById(stateId))return false;const t=Number(at);if(!(t>r.start+MIN_EVENT_GAP_MS&&t<r.end-MIN_EVENT_GAP_MS))return false;return switchAt(stateId,t);
}

function addPoint(text,at=now()){
  text=String(text||'').trim();const t=Math.min(now(),Number(at));if(!text||!Number.isFinite(t))return false;
  const id=uid('point'),ok=transact(()=>{state.points.push({id,at:t,text,tzOffset:timezoneOffset(t)});return true;});return ok?id:false;
}
function updatePoint(id,{text,at}){
  return transact(()=>{const p=state.points.find(x=>x.id===id);if(!p)return false;const nextText=String(text??p.text).trim();if(!nextText)return false;const t=Number.isFinite(Number(at))?Math.min(now(),Number(at)):p.at;p.text=nextText;p.at=t;p.tzOffset=timezoneOffset(t);return true;});
}
function deletePoint(id){return transact(()=>{const before=state.points.length;state.points=state.points.filter(p=>p.id!==id);return state.points.length!==before;});}

function dayRanges(dayTs){
  const ds=dayStart(dayTs),de=nextDayStart(ds),out=[];
  for(const r of allRanges()){const a=Math.max(r.start,ds),b=Math.min(r.end,de);if(b>a)out.push({...r,start:a,end:b,live:r.live&&now()>=ds&&now()<de});}
  return out;
}
function pointsForDay(dayTs){const ds=dayStart(dayTs),de=nextDayStart(ds);return state.points.filter(p=>p.at>=ds&&p.at<de);}
function hasDataOnDay(dayTs){return dayRanges(dayTs).length>0||pointsForDay(dayTs).length>0;}
function recentDayStarts(count){const today=dayStart(now()),out=[];for(let i=0;i<count;i++)out.push(addLocalDays(today,-i));return out;}
function knownDays(){
  const set=new Set();for(const r of allRanges()){let d=dayStart(r.start),guard=0;while(d<r.end&&guard++<5000){set.add(dayKey(d));d=nextDayStart(d);}}for(const p of state.points)set.add(dayKey(p.at));return [...set].sort().reverse();
}

function archiveState(id,archived=true){return transact(()=>{const s=stateById(id);if(!s||s.locked)return false;s.archived=!!archived;return true;});}
function deleteUnusedState(id){return transact(()=>{const s=stateById(id);if(!s||s.locked||state.events.some(e=>e.type==='switch'&&e.stateId===id))return false;state.states=state.states.filter(x=>x.id!==id);return true;});}

function replaceFromImport(payload){const incoming=migrate(payload);const before=state;state=incoming;normalizeState();if(!writeStoredState(state)){state=before;return false;}return true;}
function mergeFromImport(payload){
  const inc=migrate(payload);normalizeIncoming(inc);
  let addedEvents=0,addedPoints=0,skippedConflicts=0;
  const ok=transact(()=>{
    for(const s of inc.states){if(!state.states.some(x=>x.id===s.id))state.states.push(s);}
    const ids=new Set(state.events.map(e=>e.id));
    for(const e of inc.events){
      if(ids.has(e.id))continue;
      if(state.events.some(x=>Math.abs(x.at-e.at)<MIN_EVENT_GAP_MS)){skippedConflicts++;continue;}
      state.events.push(deepClone(e));ids.add(e.id);addedEvents++;if(inc.rangeNotes?.[e.id])state.rangeNotes[e.id]=inc.rangeNotes[e.id];
    }
    const pids=new Set(state.points.map(p=>p.id));for(const p of inc.points){if(!pids.has(p.id)){state.points.push(deepClone(p));pids.add(p.id);addedPoints++;}}
    return true;
  });
  return ok?{addedEvents,addedPoints,skippedConflicts}:false;
}
function normalizeIncoming(x){if(!Array.isArray(x.events))x.events=[];if(!Array.isArray(x.points))x.points=[];if(!Array.isArray(x.states))x.states=[];if(!x.rangeNotes||typeof x.rangeNotes!=='object')x.rangeNotes={};}
