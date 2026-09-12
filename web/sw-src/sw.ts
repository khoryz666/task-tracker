/// <reference lib="webworker" />
// Deliberately not an ES module: registered as a classic script so it works
// in every browser (module service workers aren't universally supported yet).
// `self` can't be re-declared globally without conflicting with lib.webworker's
// generic WorkerGlobalScope typing, so it's cast once into its own name instead.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = "v5";
const CACHE_NAME = `task-tracker-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./dist/app.js",
  "./dist/store.js",
  "./dist/db.js",
  "./dist/types.js",
  "./dist/export.js",
  "./dist/settings.js",
  "./dist/gist.js",
  "./dist/sync.js",
  "./dist/push.js",
  "./dist/config.js",
  "./dist/ui/list-view.js",
  "./dist/ui/dashboard-view.js",
  "./dist/ui/settings-panel.js",
  "./dist/ui/icons.js",
  "./dist/ui/collapse.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== sw.location.origin) return;

  // Navigations: prefer fresh HTML, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html").then((res) => res ?? Response.error())));
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

sw.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    data = { body: event.data?.text() };
  }

  event.waitUntil(
    sw.registration.showNotification(data.title ?? "Task Tracker", {
      body: data.body ?? "You have upcoming tasks.",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: data.url ?? "./index.html" },
    }),
  );
});

sw.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as PushPayload | undefined)?.url ?? "./index.html";

  event.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c): c is WindowClient => "focus" in c);
      if (existing) return existing.focus();
      return sw.clients.openWindow(url);
    }),
  );
});
