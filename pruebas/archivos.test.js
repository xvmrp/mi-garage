// Revisa que existan todos los archivos que piden la página y la caché sin internet.
// Si falta uno de la caché (sw.js), el service worker no se instala y la app deja de
// funcionar sin internet; si falta uno de index.html, la página se ve rota.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const APP = new URL("../app/", import.meta.url);
const existe = (ruta) => existsSync(new URL(ruta.replace(/^\.\//, "").split(/[?#]/)[0] || "index.html", APP));

test("existen los archivos de la caché sin internet", () => {
  const sw = readFileSync(new URL("sw.js", APP), "utf8");
  const lista = /const ARCHIVOS = \[([\s\S]*?)\];/.exec(sw);
  assert.ok(lista, "no encontré ARCHIVOS en sw.js");
  const archivos = [...lista[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(archivos.length > 5);
  for (const a of archivos) assert.ok(existe(a), `falta ${a}`);
});

test("existen los archivos que enlaza index.html", () => {
  const html = readFileSync(new URL("index.html", APP), "utf8");
  const rutas = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    .filter((r) => !/^(https?:|data:|#|mailto:)/.test(r));
  assert.ok(rutas.length > 5);
  for (const r of rutas) assert.ok(existe(r), `falta ${r}`);
});

test("existen los íconos del manifiesto", () => {
  const manifiesto = JSON.parse(readFileSync(new URL("manifest.webmanifest", APP), "utf8"));
  const iconos = [...manifiesto.icons, ...(manifiesto.shortcuts || []).flatMap((s) => s.icons || [])];
  for (const i of iconos) assert.ok(existe(i.src), `falta ${i.src}`);
});
