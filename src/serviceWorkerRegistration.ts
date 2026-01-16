// src/serviceWorkerRegistration.ts
// Simple SW registration. Works best on deployed HTTPS sites.

export function register() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Some dev hosts (like CodeSandbox preview) may not support SW well.
    });
  });
}

export function unregister() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}
