"use strict";

const STORE_KEY = "focus_machine_v1";

function readStoredState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(err){
    console.warn("读取本地数据失败", err);
    return null;
  }
}

function writeStoredState(value){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
    return true;
  }catch(err){
    console.error("保存本地数据失败", err);
    return false;
  }
}

function downloadState(value, filename){
  const blob = new Blob([JSON.stringify(value, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function parseImportedState(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      try{ resolve(JSON.parse(reader.result)); }
      catch(err){ reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
