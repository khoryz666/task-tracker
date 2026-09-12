export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err: unknown) => {
      console.error("Service worker registration failed", err);
    });
  });
}
