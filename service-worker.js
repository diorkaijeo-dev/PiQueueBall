"use strict";

const CACHE_NAME = "piqueueball-offline-v7";
const APP_FILES = [
  "./",
  "./index.html",
  "./login.html",
  "./signup.html",
  "./home.html",
  "./score.html",
  "./totals.html",
  "./results.html",
  "./profiles.html",
  "./friends.html",
  "./styles.css",
  "./offline.js",
  "./page-transitions.js",
  "./supabase-config.js",
  "./supabase-client.js",
  "./auth-guard.js",
  "./online-sync.js",
  "./auth-ui.js",
  "./history-utils.js",
  "./auth-pages.js",
  "./queue.js",
  "./score.js",
  "./tracker-pages.js",
  "./profiles.js",
  "./friends.js",
  "./assets/logo.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("piqueueball-offline-") && key !== CACHE_NAME)
    .map((key) => caches.delete(key)))), self.clients.claim()]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(fetch(request).then((response) => {
    if (!response.ok) return response;
    const cacheRequest = request.mode === "navigate"
      ? new Request(url.origin + url.pathname)
      : request;
    return caches.open(CACHE_NAME).then((cache) =>
      cache.put(cacheRequest, response.clone()).catch((error) => {
        console.error("Offline app file could not be cached.", error);
      })
        .then(() => response)
    );
  }, async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    return Response.error();
  }));
});
