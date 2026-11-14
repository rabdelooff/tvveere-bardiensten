// Service worker: maakt de app installeerbaar en toont pushmeldingen.
// Verzoeken gaan gewoon naar het netwerk; er wordt niets gecachet.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* netwerk zoals gewoonlijk */ });

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data ? e.data.text() : "" }; }
  const stapel = d.soort === "aanmelding" || d.soort === "afmelding";
  e.waitUntil(self.registration.showNotification(d.titel || "Bardiensten TV Veere", {
    body: d.tekst || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: stapel ? "aanmeldingen" : undefined,
    renotify: stapel ? true : undefined,
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const vensters = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const v of vensters) {
      if ("focus" in v) { await v.focus(); if ("navigate" in v) await v.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
