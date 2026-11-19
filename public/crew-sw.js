// Service worker for the crew app (/jobb): shows push notifications and opens the right booking when tapped.
// No offline caching – the admin page always needs fresh data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let n = { title: "FX Flytt", body: "", url: "/jobb" };
  try { n = { ...n, ...e.data.json() }; } catch (_) { if (e.data) n.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(n.title, {
    body: n.body, tag: n.tag, renotify: !!n.tag, data: { url: n.url },
    icon: "/icon-192.png", badge: "/icon-192.png",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/jobb", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => new URL(c.url).pathname.startsWith("/jobb"));
    if (w) { await w.focus(); return w.navigate(url); }
    return self.clients.openWindow(url);
  })());
});

// The browser can replace the push subscription (expired, reset). Subscribe again at once and tell the
// server, so notifications keep coming even if the app is not opened.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    const info = await fetch("/api/crew/push", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
    if (!info || !info.publicKey) return;
    const k = info.publicKey, p = "=".repeat((4 - (k.length % 4)) % 4), raw = atob((k + p).replace(/-/g, "+").replace(/_/g, "/"));
    const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
    await fetch("/api/crew/push", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  })().catch(() => {}));
});
