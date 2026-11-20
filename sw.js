// Service worker SAKU: simpan fail app & ayat yang pernah dibuka supaya laju.
const VERSI = "saku-v5";
const FAIL = ["./","index.html","manifest.json",
  "icons/icon-192.png","icons/icon-512.png","icons/icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FAIL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Cuba internet dahulu; jika gagal, guna salinan tersimpan.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        caches.open(VERSI).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
