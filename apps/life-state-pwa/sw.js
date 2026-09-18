"use strict";

const CACHE_VERSION = "life-state-v1.0.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/storage.js",
  "./js/state.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", event=>{
  if(event.request.method!=="GET") return;
  event.respondWith(
    caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE_VERSION).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match("./index.html")))
  );
});
