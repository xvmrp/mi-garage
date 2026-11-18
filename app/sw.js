// Service worker de Mi Garage.
//
// - Versión publicada: la app y el catálogo se sirven desde la caché (abre al instante y
//   sin internet). Cuando hay una versión nueva se descarga por detrás y la app ofrece
//   "Actualizar". GitHub Actions reemplaza __VERSION__ al publicar.
// - En el PC (versión sin reemplazar): siempre "primero la red", para ver los cambios al tiro.
// - Fotos de la wiki: se guardan las que ya se vieron, para verlas sin internet.

const VERSION = "__VERSION__";
const DESARROLLO = VERSION.startsWith("__");
const CACHE_APP = `mi-garage-app-${VERSION}`;
const CACHE_FOTOS = "mi-garage-fotos";
const MAX_FOTOS = 4000;
const HOST_FOTOS = "static.wikia.nocookie.net";

const ARCHIVOS = [
  "./",
  "index.html",
  "estilos.css",
  "app.js",
  "logica.js",
  "db.js",
  "manifest.webmanifest",
  "iconos/icono.svg",
  "iconos/icono-192.png",
  "iconos/icono-512.png",
  "fuentes/barlow-400.woff2",
  "fuentes/barlow-600.woff2",
  "fuentes/barlow-700.woff2",
  "fuentes/barlow-condensed-500.woff2",
  "fuentes/barlow-condensed-600.woff2",
  "fuentes/barlow-condensed-700.woff2",
  "datos/catalogo.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => { if (DESARROLLO) return self.skipWaiting(); }),
  );
});

// La app pide activar la versión nueva cuando tocas "Actualizar"
self.addEventListener("message", (e) => {
  if (e.data?.tipo === "actualizar") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves
        .filter((k) => k !== CACHE_APP && k !== CACHE_FOTOS)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.hostname === HOST_FOTOS) {
    e.respondWith(foto(e.request));
  } else if (url.origin === location.origin) {
    e.respondWith(DESARROLLO ? primeroLaRed(e.request) : primeroLaCache(e.request));
  }
});

async function primeroLaCache(peticion) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  if (guardada) return guardada;
  if (peticion.mode === "navigate") {
    const inicio = await cache.match("index.html");
    if (inicio) return inicio;
  }
  const resp = await fetch(peticion);
  if (resp.ok) cache.put(peticion, resp.clone());
  return resp;
}

async function primeroLaRed(peticion) {
  const cache = await caches.open(CACHE_APP);
  try {
    // "no-cache": siempre preguntar al servidor, para no ver una copia vieja mientras se edita
    const resp = await fetch(peticion, { cache: "no-cache" });
    if (resp.ok) cache.put(peticion, resp.clone());
    return resp;
  } catch {
    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    if (peticion.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  }
}

async function foto(peticion) {
  const cache = await caches.open(CACHE_FOTOS);
  const guardada = await cache.match(peticion.url, { ignoreVary: true });
  if (guardada) return guardada;
  try {
    // La wiki permite CORS: así la respuesta se puede guardar sin ocupar espacio de más
    const resp = await fetch(peticion.url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
    if (resp.ok) {
      await cache.put(peticion.url, resp.clone());
      if (Math.random() < 0.03) recortar(cache);
    }
    return resp;
  } catch {
    try { return await fetch(peticion); } catch { return Response.error(); }
  }
}

async function recortar(cache) {
  const claves = await cache.keys();
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_FOTOS))) await cache.delete(k);
}
