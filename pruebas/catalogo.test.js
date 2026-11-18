// Revisa que el catálogo generado sea válido. Corre antes de publicar, también cuando
// GitHub lo actualiza solo cada lunes: así un cambio raro en la wiki no rompe la app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const datos = JSON.parse(readFileSync(new URL("../app/datos/catalogo.json", import.meta.url), "utf8"));

test("el catálogo tiene autos y el total cuadra", () => {
  assert.ok(Array.isArray(datos.items));
  assert.ok(datos.items.length > 10000, `solo ${datos.items.length} autos: ¿falló la descarga de la wiki?`);
  assert.equal(datos.total, datos.items.length);
  assert.ok(!Number.isNaN(Date.parse(datos.generado)), "fecha de generación");
});

test("cada auto tiene id único, nombre, año y línea", () => {
  const vistos = new Set();
  const anioMax = new Date().getFullYear() + 3;
  for (const it of datos.items) {
    const quien = `${it.id} ${it.n}`;
    assert.equal(typeof it.id, "string", quien);
    assert.ok(it.id.length > 0 && it.id.length <= 60, quien);
    assert.ok(!vistos.has(it.id), `id repetido: ${quien}`);
    vistos.add(it.id);
    assert.equal(typeof it.n, "string", quien);
    assert.ok(it.n.trim().length > 0, quien);
    assert.ok(Number.isInteger(it.y) && it.y >= 1968 && it.y <= anioMax, `año raro: ${quien} (${it.y})`);
    assert.equal(typeof it.l, "string", quien);
    for (const k of ["p", "p2", "w", "t", "c", "s", "sn", "sec", "co"]) {
      if (k in it) assert.equal(typeof it[k], "string", `${k} no es texto: ${quien}`);
    }
    if ("e" in it) assert.ok(Array.isArray(it.e), `e no es lista: ${quien}`);
  }
});
