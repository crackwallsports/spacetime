"use strict";
const CACHE="life-trace-stream-v4.0.70";
const SHELL=["./","./index.html","./css/app.css?v=70","./js/storage.js?v=70","./js/i18n.js?v=70","./js/state.js?v=70","./js/ui.js?v=70","./js/app.js?v=70","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
  self.clients.claim();
});

// Local-first app shell: return cache immediately, refresh it in the background.
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    const refresh=fetch(event.request).then(response=>{
      if(response&&response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      return response;
    }).catch(()=>null);
    if(cached){event.waitUntil(refresh);return cached;}
    const network=await refresh;
    if(network)return network;
    if(event.request.mode==="navigate")return caches.match("./index.html");
    return new Response("Offline",{status:503,statusText:"Offline"});
  })());
});
