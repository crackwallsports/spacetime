"use strict";

const PALETTE=['#5b8def','#3ecf8e','#f0a830','#e8607d','#9b7bf0','#46c6c6','#d0c24a','#ff8a5b','#6ad19a','#c97cf0'];
const OFF_COLOR='#5a6270';
const LONG_RUNNING_MS = 8 * 60 * 60 * 1000;

function defaultStatuses(){
  return [
    {id:'st_lost',  name:'迷茫', color:'#8b93a1', locked:true},
    {id:'st_study', name:'学习', color:'#5b8def'},
    {id:'st_work',  name:'工作', color:'#3ecf8e'},
    {id:'st_fit',   name:'健身', color:'#f0a830'},
    {id:'st_eat',   name:'吃饭', color:'#e8607d'},
    {id:'st_rest',  name:'休息', color:'#9b7bf0'}
  ];
}

function blankState(){
  return {on:false,current:null,segments:[],statuses:defaultStatuses(),settings:{}};
}

let state = readStoredState() || blankState();

function isColor(c){return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c||'');}
function now(){return Date.now();}
function newSegId(){return 'seg_'+now()+'_'+Math.random().toString(36).slice(2,7);}
function byId(id){return state.statuses.find(s=>s.id===id);}
function nameOf(id){const s=byId(id);return s?s.name:'未知';}
function colorOf(id){const s=byId(id);return s&&isColor(s.color)?s.color:'#888';}
function dayStart(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime();}
function dayKey(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

function normalizeState(){
  if(!state || typeof state!=='object') state=blankState();
  if(!Array.isArray(state.statuses)||!state.statuses.length) state.statuses=defaultStatuses();
  if(!Array.isArray(state.segments)) state.segments=[];
  if(!state.settings||typeof state.settings!=='object') state.settings={};

  let lost=state.statuses.find(s=>s.locked)||state.statuses.find(s=>s.name==='迷茫');
  if(!lost){lost={id:'st_lost',name:'迷茫',color:'#8b93a1',locked:true};state.statuses.unshift(lost);}
  lost.locked=true; lost.name='迷茫'; lost.id=lost.id||'st_lost'; lost.color='#8b93a1';
  state.statuses.sort((a,b)=>(b.locked?1:0)-(a.locked?1:0));
  state.statuses.forEach((s,i)=>{
    s.id=s.id||('st_'+(i+1));
    s.name=String(s.name||('状态'+(i+1)));
    s.color=isColor(s.color)?s.color:PALETTE[i%PALETTE.length];
    if(s.locked)s.color='#8b93a1';
  });

  state.segments=state.segments.filter(s=>s&&typeof s.start==='number'&&typeof s.end==='number'&&(s.end>s.start||(s.type==='off'&&s.open)));
  let seq=0, openSeen=false;
  state.segments.forEach(s=>{
    if(!s.id)s.id='seg_legacy_'+(seq++)+'_'+s.start;
    if(s.type==='off'&&s.open){
      if(openSeen)s.open=false; else openSeen=true;
    }
  });

  if(state.current&&!state.statuses.some(s=>s.id===state.current.statusId)) state.current=null;
  if(state.on&&!state.current){state.on=false;}
  if(!state.on) state.current=null;

  // 旧版 lastSeen/heartbeat 只保留为历史字段，不再参与生命周期判断。
  delete state.settings.lastHeartbeat;
}

normalizeState();

function saveState(){writeStoredState(state);}

function snapshotState(){return JSON.stringify(state);}
function restoreSnapshot(snapshot){
  const parsed=JSON.parse(snapshot);
  state=parsed; normalizeState(); saveState();
}

function pushSegment(seg){state.segments.push(seg);}
function endCurrent(endTs=now()){
  if(!state.current)return null;
  const end=Math.max(endTs,state.current.start+1000);
  const seg={id:newSegId(),type:'status',statusId:state.current.statusId,start:state.current.start,end};
  pushSegment(seg); state.current=null; return seg;
}
function openOffSeg(){
  const last=state.segments[state.segments.length-1];
  return last&&last.type==='off'&&last.open?last:null;
}
function closeOffSeg(t=now()){
  const seg=openOffSeg();
  if(seg){seg.end=Math.max(t,seg.start+1000);seg.open=false;return seg;}
  return null;
}

function startRecording(targetId){
  if(state.on)return false;
  const t=now(); closeOffSeg(t);
  const target=targetId?byId(targetId):state.statuses[0];
  state.on=true; state.current={statusId:(target||state.statuses[0]).id,start:t};
  saveState(); return true;
}

function stopRecording(){
  if(!state.on)return false;
  const t=now(); endCurrent(t);
  pushSegment({id:newSegId(),type:'off',start:t,end:t,open:true});
  state.on=false; state.current=null; saveState(); return true;
}

function switchState(id){
  if(!state.on||!byId(id))return false;
  if(state.current&&state.current.statusId===id)return false;
  const t=now(); endCurrent(t); state.current={statusId:id,start:t}; saveState(); return true;
}

function cycleState(dir){
  if(!state.on)return false;
  const list=state.statuses;
  const idx=list.findIndex(s=>s.id===state.current?.statusId);
  const next=(idx<0?0:idx+dir+list.length)%list.length;
  return switchState(list[next].id);
}

function fmtDur(ms){
  ms=Math.max(0,ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
  if(h>0)return h+'h'+String(m).padStart(2,'0')+'m';
  if(m>0)return m+'m';return s+'s';
}
function fmtClock(ms){
  ms=Math.max(0,ms);const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
  return (h>0?h+':':'')+String(m).padStart(h>0?2:1,'0')+':'+String(s).padStart(2,'0');
}
function fmtTime(ts){return new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}
function dayLabel(ts){const t=dayStart(now()),y=t-86400000;if(dayStart(ts)===t)return '今天';if(dayStart(ts)===y)return '昨天';const d=new Date(ts);return (d.getMonth()+1)+'/'+d.getDate();}

function dayTotal(ts){
  const ds=dayStart(ts),de=ds+86400000;let total=0;
  state.segments.forEach(s=>{if(s.type==='status'){const a=Math.max(s.start,ds),b=Math.min(s.end,de);if(b>a)total+=b-a;}});
  if(state.current){const a=Math.max(state.current.start,ds),b=Math.min(now(),de);if(b>a)total+=b-a;}
  return total;
}
function dayTotalOn(statusId,ts){
  const ds=dayStart(ts),de=ds+86400000;let total=0;
  state.segments.forEach(s=>{if(s.type==='status'&&s.statusId===statusId){const a=Math.max(s.start,ds),b=Math.min(s.end,de);if(b>a)total+=b-a;}});
  if(state.current?.statusId===statusId){const a=Math.max(state.current.start,ds),b=Math.min(now(),de);if(b>a)total+=b-a;}
  return total;
}
function dayRows(dayTs){
  const ds=dayStart(dayTs),de=ds+86400000,rows=[];
  state.segments.forEach(s=>{
    const rawEnd=(s.type==='off'&&s.open)?Math.max(now(),s.end):s.end;
    const a=Math.max(s.start,ds),b=Math.min(rawEnd,de);if(b<=a||b-a<1000)return;
    rows.push({segId:s.id,type:s.type==='off'?'off':'status',statusId:s.statusId,start:a,end:b,live:false,open:!!s.open});
  });
  if(state.current){const a=Math.max(state.current.start,ds),b=Math.min(now(),de);if(b>a)rows.push({type:'status',statusId:state.current.statusId,start:a,end:b,live:true});}
  rows.sort((a,b)=>b.start-a.start);return rows;
}

function mergeAdjacent(){
  const segs=state.segments.slice().sort((a,b)=>a.start-b.start),out=[];
  for(const s of segs){
    const p=out[out.length-1];const same=p&&p.type===s.type&&(s.type==='off'||p.statusId===s.statusId);
    if(same&&!p.open&&!s.open&&s.start<=p.end+1000)p.end=Math.max(p.end,s.end); else out.push(s);
  }
  state.segments=out;
}
function resolveOverlaps(){
  const segs=state.segments.filter(s=>s.type!=='off'||!s.open).slice().sort((a,b)=>a.start-b.start);
  for(let i=0;i<segs.length-1;i++){const cur=segs[i],next=segs[i+1];if(cur.end>next.start)cur.end=Math.max(next.start,cur.start+1000);}
}
function absorbRange(target){
  const a=target.start,b=target.end,out=[];
  for(const s of state.segments){
    if(s===target||s.end<=a||s.start>=b){out.push(s);continue;}
    if(s.start<a){const left={...s,end:a};if(left.end-left.start>=1000)out.push(left);}
    if(s.end>b){const right={...s,start:b};if(right.end-right.start>=1000)out.push(right);}
  }
  state.segments=out;
}

function suspiciousCurrent(){
  if(!(state.on&&state.current&&(now()-state.current.start>=LONG_RUNNING_MS)))return false;
  return state.settings.longRunningAckStart!==state.current.start;
}
