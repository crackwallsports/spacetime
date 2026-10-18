"use strict";

const STORE_KEY="life_trace_v4";
const LEGACY_KEYS=["life_trace_v3","focus_machine_v1"];
const EXPORT_SCHEMA_VERSION=4;

function deepClone(value){return JSON.parse(JSON.stringify(value));}

function readStoredState(){
  try{
    const current=localStorage.getItem(STORE_KEY);
    if(current)return JSON.parse(current);
    for(const key of LEGACY_KEYS){
      const legacy=localStorage.getItem(key);
      if(legacy)return JSON.parse(legacy);
    }
    return null;
  }catch(err){console.warn("读取本地数据失败",err);return null;}
}

function writeStoredState(value){
  try{localStorage.setItem(STORE_KEY,JSON.stringify(value));return true;}
  catch(err){console.error("保存本地数据失败",err);return false;}
}

function buildExportPackage(value){
  return {
    schemaVersion:EXPORT_SCHEMA_VERSION,
    app:"Life Trace",
    exportedAt:new Date().toISOString(),
    data:deepClone(value)
  };
}

function downloadState(value,filename){
  const blob=new Blob([JSON.stringify(buildExportPackage(value),null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function parseImportedState(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>{try{resolve(JSON.parse(r.result));}catch(err){reject(err);}};
    r.onerror=reject;
    r.readAsText(file);
  });
}

function unwrapImportedState(payload){return payload&&payload.data?payload.data:payload;}
