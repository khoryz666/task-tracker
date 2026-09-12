export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err: unknown) => {
      console.error("Service worker registration failed", err);
    });
  });

  // sw.ts calls skipWaiting()+clients.claim() on update, which hands control
  // to a new service worker immediately - but an already-open tab keeps
  // running the OLD app.js/styles.css it already loaded into memory until it
  // reloads. Without this, every deploy needs a manual hard-refresh to show
  // up, which looks exactly like "the change didn't apply."
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
