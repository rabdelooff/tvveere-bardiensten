// Minimale service worker. Doet niets slims: geeft elk verzoek gewoon door.
// Nodig omdat Chrome pas een installatieprompt aanbiedt als er een service
// worker met een fetch-handler is geregistreerd.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* netwerk zoals gewoonlijk */ });
