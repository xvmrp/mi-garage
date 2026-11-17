// Service worker: permite abrir la app sin internet.
// Estrategia "primero la red": si hay conexión siempre se usa lo más nuevo,
// y si no, lo último que se guardó en caché.
const CACHE = "mi-garage-v1";
const ARCHIVOS = [
  "./",
  "index.html",
  "estilos.css",
  "app.js",
  "db.js",
  "manifest.webmanifest",
  "iconos/icono.svg",
  "iconos/icono-192.png",
  "iconos/icono-512.png",
  "datos/catalogo.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // fotos de la wiki: las maneja el navegador
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(async () => {
        const guardada = await caches.match(e.request, { ignoreSearch: true });
        if (guardada) return guardada;
        if (e.request.mode === "navigate") return caches.match("index.html");
        return Response.error();
      }),
  );
});
