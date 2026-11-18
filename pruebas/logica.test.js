// Pruebas de la lógica pura de la app (app/logica.js). Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esc, norm, textoSerie, numeroDe, celdaCSV, hayFiltros, filtrarCatalogo, limpiarRegistro,
  debeReemplazar, diasDesde, mensajeRecordatorio, calcularHueco, escalaTexto, leerVersion,
  cumpleEspecial, etiquetasDe,
} from "../app/logica.js";

const DIA = 86400000;
const AHORA = Date.parse("2026-11-18T12:00:00Z");
const haceDias = (n) => new Date(AHORA - n * DIA).toISOString();

test("esc escapa lo que rompería el HTML", () => {
  assert.equal(esc(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  assert.equal(esc(null), "");
});

test("norm quita tildes y mayúsculas", () => {
  assert.equal(norm("Ferrári 308 GTS Ñandú"), "ferrari 308 gts nandu");
});

test("serie y número de colección", () => {
  assert.equal(textoSerie({ s: "HW Dream Garage", sn: "1/5" }), "HW Dream Garage 1/5");
  assert.equal(textoSerie({ sec: "2026 Hot Wheels" }), "2026 Hot Wheels");
  assert.equal(textoSerie({}), "");
  assert.equal(numeroDe({ c: "001" }), "001");
  for (const c of ["No #", "N/A", "INTL", undefined]) assert.equal(numeroDe({ c }), "");
});

test("celdas del CSV con ; comillas y saltos de línea", () => {
  assert.equal(celdaCSV("Mazda"), "Mazda");
  assert.equal(celdaCSV('Dice "hola"; chao'), '"Dice ""hola""; chao"');
  assert.equal(celdaCSV("línea 1\nlínea 2"), '"línea 1\nlínea 2"');
  assert.equal(celdaCSV(null), "");
});

test("etiquetas especiales", () => {
  assert.deepEqual(etiquetasDe({ e: ["kr", "sth", "desconocida"] }), ["sth", "kr"]);
  assert.ok(cumpleEspecial({ e: ["dg"] }, "exclusivo"));
  assert.ok(!cumpleEspecial({ e: ["th"] }, "sth"));
  assert.ok(cumpleEspecial({}, ""));
});

// Catálogo de prueba: _q es el texto de búsqueda ya normalizado, _i la posición original
const CATALOGO = [
  { id: "a", n: "Deora", y: 1968, l: "Mainline", e: [] },
  { id: "b", n: "Deora II", y: 2026, l: "Mainline", e: ["nuevo"] },
  { id: "c", n: "Mazda MX-5 Miata", y: 2026, l: "Mainline", e: ["kr"] },
  { id: "d", n: "Audi Sport quattro", y: 2026, l: "Car Culture", e: ["th"] },
  { id: "e", n: "Deora III", y: 2024, l: "Mainline", e: [] },
].map((it, i) => ({ ...it, _q: norm(it.n), _i: i }));
const filtro = (f) => ({ q: "", anio: "", linea: "", est: "", orden: "anio", especial: "", ...f });
const ids = (r) => r.lista.map((it) => it.id);

test("filtrar por año y avisar cuántos quedan fuera", () => {
  const r = filtrarCatalogo(CATALOGO, filtro({ q: "deora", anio: "2026" }), new Map());
  assert.deepEqual(ids(r), ["b"]);
  assert.equal(r.ocultos, 2); // Deora (1968) y Deora III (2024)
  const sinFiltros = filtrarCatalogo(CATALOGO, filtro({ q: "deora" }), new Map());
  assert.equal(sinFiltros.ocultos, 0);
  assert.deepEqual(ids(sinFiltros), ["b", "e", "a"]); // más nuevos primero
});

test("filtrar por línea, especial y lo que tengo", () => {
  const coleccion = new Map([["c", { cantidad: 2 }], ["d", { cantidad: 0, deseo: true }]]);
  assert.deepEqual(ids(filtrarCatalogo(CATALOGO, filtro({ linea: "Car Culture" }), coleccion)), ["d"]);
  assert.deepEqual(ids(filtrarCatalogo(CATALOGO, filtro({ especial: "exclusivo" }), coleccion)), ["c"]);
  assert.deepEqual(ids(filtrarCatalogo(CATALOGO, filtro({ est: "tengo" }), coleccion)), ["c"]);
  assert.deepEqual(ids(filtrarCatalogo(CATALOGO, filtro({ est: "deseo" }), coleccion)), ["d"]);
  assert.equal(filtrarCatalogo(CATALOGO, filtro({ est: "falta" }), coleccion).lista.length, 4);
  assert.ok(!hayFiltros(filtro({ orden: "nombre" })), "el orden no es un filtro");
});

test("ordenar por nombre y por más antiguos", () => {
  assert.deepEqual(ids(filtrarCatalogo(CATALOGO, filtro({ orden: "nombre" }), new Map())), ["d", "a", "b", "e", "c"]);
  assert.deepEqual(ids(filtrarCatalogo(CATALOGO, filtro({ orden: "antiguos" }), new Map())), ["a", "e", "b", "c", "d"]);
});

test("un respaldo con datos malos queda limpio", () => {
  const r = limpiarRegistro({
    id: 123, cantidad: -3, deseo: "sí", condicion: "roto", fecha: "ayer", precio: -10,
    tienda: "x".repeat(200), notas: "<script>", tieneFoto: true, creado: 5,
    ref: { n: "Deora", y: "1968", w: 7 },
  }, "2026-11-18T00:00:00.000Z");
  assert.equal(r.id, "123");
  assert.equal(r.cantidad, 0);
  assert.equal(r.deseo, true);
  assert.equal(r.condicion, "");
  assert.equal(r.fecha, "");
  assert.equal(r.precio, null);
  assert.equal(r.tienda.length, 80);
  assert.equal(r.notas, "<script>"); // se guarda tal cual: al mostrarlo siempre pasa por esc()
  assert.equal(r.tieneFoto, false); // la foto solo cuenta si viene en el respaldo
  assert.equal(r.creado, "2026-11-18T00:00:00.000Z");
  assert.deepEqual(r.ref, { n: "Deora" }); // y no es número, w no es texto
});

test("al restaurar gana la versión editada más recientemente", () => {
  const nuevo = { actualizado: "2026-11-18T10:00:00Z" };
  assert.ok(debeReemplazar(undefined, nuevo));
  assert.ok(debeReemplazar({ actualizado: "2026-11-01T00:00:00Z" }, nuevo));
  assert.ok(!debeReemplazar({ actualizado: "2026-11-18T10:00:00Z" }, nuevo));
  assert.ok(!debeReemplazar({ actualizado: "2026-11-20T00:00:00Z" }, nuevo));
});

test("recordatorio de respaldo", () => {
  const autos = (n, dias) => Array.from({ length: n }, () => ({ creado: haceDias(dias) }));
  const base = { ahora: AHORA, cambios: 0, ultimoRespaldo: null, ultimoRecordatorio: null };
  assert.equal(diasDesde(haceDias(20), AHORA), 20);
  assert.equal(mensajeRecordatorio({ ...base, registros: [] }), "");
  // Nunca respaldado
  assert.equal(mensajeRecordatorio({ ...base, registros: autos(2, 1) }), "");
  assert.match(mensajeRecordatorio({ ...base, registros: autos(2, 4) }), /Todavía no tienes un respaldo/);
  assert.match(mensajeRecordatorio({ ...base, registros: autos(10, 0) }), /Todavía no tienes un respaldo/);
  // Con respaldo
  const conRespaldo = { ...base, registros: autos(3, 40), ultimoRespaldo: haceDias(20) };
  assert.equal(mensajeRecordatorio(conRespaldo), "", "sin cambios no hay que recordar");
  assert.equal(mensajeRecordatorio({ ...conRespaldo, cambios: 2 }), "Tu último respaldo fue hace 20 días");
  assert.equal(mensajeRecordatorio({ ...conRespaldo, cambios: 2, ultimoRespaldo: haceDias(5) }), "");
  // Como mucho uno cada 3 días
  assert.equal(mensajeRecordatorio({ ...conRespaldo, cambios: 2, ultimoRecordatorio: haceDias(1) }), "");
});

test("hueco de iOS 26 bajo las pestañas", () => {
  const iphone = { anchoVentana: 390, altoVentana: 797, anchoPantalla: 390, altoPantalla: 844 };
  assert.equal(calcularHueco({ ...iphone, altoSonda: 797 }), 47, "iPhone con notch");
  assert.equal(calcularHueco({ ...iphone, altoPantalla: 852, altoSonda: 793 }), 59, "Dynamic Island");
  assert.equal(calcularHueco({ ...iphone, altoSonda: 844 }), 0, "sin el error");
  assert.equal(calcularHueco({ ...iphone, altoSonda: 600 }), 0, "más de 80 px es otra cosa");
  assert.equal(calcularHueco({ ...iphone, altoSonda: 0 }), 0);
  assert.equal(calcularHueco({ anchoVentana: 844, altoVentana: 390, anchoPantalla: 390, altoPantalla: 844, altoSonda: 390 }), 0,
    "horizontal: el alto real es el lado corto");
});

test("escala de letra del iPhone", () => {
  assert.equal(escalaTexto(17), 1);
  assert.equal(escalaTexto(25.5), 1.5);
  assert.equal(escalaTexto(53), 1.5, "tope");
  assert.equal(escalaTexto(10), 0.85, "piso");
  assert.equal(escalaTexto(0), 1);
});

test("versión publicada", () => {
  const v = leerVersion("c9b19f1-202611181222");
  assert.equal(v.commit, "c9b19f1");
  assert.equal(v.fecha.toISOString(), "2026-11-18T12:22:00.000Z");
  assert.equal(leerVersion("__VERSION__"), null);
});
