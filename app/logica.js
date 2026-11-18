// Lógica pura de Mi Garage: no toca la página ni el almacenamiento, así que se puede probar
// con Node (ver pruebas/). app.js la usa para todo lo que sea cálculo o decisión.

// ------------------------------------------------------------------ etiquetas del catálogo

// Etiquetas que vienen del catálogo (campo "e")
export const ETIQUETAS = {
  sth: { corto: "Super TH", largo: "Super Treasure Hunt", clase: "e-sth" },
  th: { corto: "TH", largo: "Treasure Hunt", clase: "e-th" },
  nuevo: { corto: "Nuevo", largo: "Modelo nuevo del año", clase: "e-nuevo" },
  nim: { corto: "Nuevo en Mainline", largo: "Nuevo en Mainline (antes solo en premium)", clase: "e-tienda" },
  tg: { corto: "Target", largo: "Exclusivo de Target (Red Edition)", clase: "e-tienda" },
  kr: { corto: "Kroger", largo: "Exclusivo de Kroger", clase: "e-tienda" },
  dg: { corto: "Dollar General", largo: "Exclusivo de Dollar General", clase: "e-tienda" },
  dt: { corto: "Dollar Tree", largo: "Exclusivo de Dollar Tree / Family Dollar", clase: "e-tienda" },
};
const ORDEN_ETIQUETAS = Object.keys(ETIQUETAS);
export const EXCLUSIVOS = ["tg", "kr", "dg", "dt"];
export const ESPECIALES = [
  { valor: "th", nombre: "Treasure Hunts" },
  { valor: "sth", nombre: "Super Treasure Hunts" },
  { valor: "nuevo", nombre: "Modelos nuevos" },
  { valor: "exclusivo", nombre: "Exclusivos de tienda" },
];

export const etiquetasDe = (d) => (d.e || []).filter((e) => ETIQUETAS[e])
  .sort((a, b) => ORDEN_ETIQUETAS.indexOf(a) - ORDEN_ETIQUETAS.indexOf(b));

export const cumpleEspecial = (it, esp) =>
  !esp || (esp === "exclusivo" ? (it.e || []).some((e) => EXCLUSIVOS.includes(e)) : (it.e || []).includes(esp));

// ------------------------------------------------------------------ textos

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapa texto para meterlo en HTML. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
/** Minúsculas y sin tildes, para buscar ("Jose" encuentra "José"). */
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "HW Dream Garage 1/5" */
export function textoSerie(d) {
  const serie = d.s || d.sec || "";
  return serie && d.sn ? `${serie} ${d.sn}` : serie;
}

/** Número de colección para mostrar en grande ("001"); "No #", "N/A"… no se muestran. */
export const numeroDe = (d) => (/^\d+$/.test(d.c || "") ? d.c : "");

/** Celda de un CSV separado por ";" (Excel en español). */
export function celdaCSV(v) {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ------------------------------------------------------------------ catálogo

/** ¿Hay algún filtro que pueda esconder autos? (el orden no cuenta) */
export const hayFiltros = (f) => !!(f.anio || f.linea || f.est || f.especial || f.serie);

// ------------------------------------------------------------------ series

/** "4/5" -> { n: 4, de: 5 }; null si no trae número ("No #", "Unnumbered"…). */
export function posicionEnSerie(sn) {
  const m = /^(\d+)\/(\d+)$/.exec(sn || "");
  return m ? { n: Number(m[1]), de: Number(m[2]) } : null;
}

/** El mismo nombre de serie se repite en distintos años ("Sweet Rides" 2023 y 2026): la clave lleva los dos. */
export const claveSerie = (d) => (d.s && d.y ? `${d.y}|${d.s}` : "");

/**
 * Resumen de la serie de un auto para su ficha. `miembros` = los autos del catálogo con la misma
 * claveSerie. Cuenta posiciones, no autos: el "2nd Color" ocupa la misma que el original.
 * Devuelve null si no vale la pena mostrarla: menos de 2 autos, o un grupo grande sin números
 * (p. ej. "1999 Hot Wheels", que es todo el año y no una serie).
 */
export function resumenSerie(d, miembros, coleccion) {
  if (!miembros || miembros.length < 2) return null;
  const propia = posicionEnSerie(d.sn);
  if (!propia && miembros.length > 30) return null;
  const posicion = (it) => posicionEnSerie(it.sn)?.n ?? it.id;
  const tengo = new Set(miembros.filter((it) => (coleccion.get(it.id)?.cantidad || 0) > 0).map(posicion));
  const total = propia ? propia.de : new Set(miembros.map(posicion)).size;
  return {
    nombre: d.s,
    anio: d.y,
    total,
    tengo: Math.min(tengo.size, total),
    actual: propia?.n ?? null, // el número de este auto
    // Qué números de la serie tienes (para dibujar los casilleros); solo si la serie va numerada
    posiciones: propia ? [...tengo].filter((n) => typeof n === "number").sort((a, b) => a - b) : null,
  };
}

/**
 * Filtra y ordena el catálogo. `f` = { q, anio, linea, est, orden, especial, serie };
 * `serie` = { s, y } o vacío. `coleccion` = Map id -> registro. Devuelve la lista y cuántos
 * autos con esa búsqueda quedaron fuera solo por los filtros (para avisar "Hay N más fuera de
 * tus filtros"). Cada auto necesita `_q` (texto de búsqueda ya normalizado) e `_i` (posición original).
 */
export function filtrarCatalogo(catalogo, f, coleccion) {
  const terminos = norm(f.q).trim().split(/\s+/).filter(Boolean);
  const coincide = (it) => terminos.every((t) => it._q.includes(t));
  const anio = f.anio ? Number(f.anio) : null;
  const lista = catalogo.filter((it) => {
    if (anio && it.y !== anio) return false;
    if (f.serie && (it.s !== f.serie.s || it.y !== f.serie.y)) return false;
    if (f.linea && it.l !== f.linea) return false;
    if (!cumpleEspecial(it, f.especial)) return false;
    if (f.est) {
      const r = coleccion.get(it.id);
      const tiene = (r?.cantidad || 0) > 0;
      if (f.est === "tengo" && !tiene) return false;
      if (f.est === "falta" && tiene) return false;
      if (f.est === "deseo" && !r?.deseo) return false;
    }
    return coincide(it);
  });
  const enSerie = (it) => posicionEnSerie(it.sn)?.n ?? Infinity;
  if (f.orden === "nombre") lista.sort((a, b) => a.n.localeCompare(b.n, "es") || b.y - a.y);
  else if (f.serie) lista.sort((a, b) => enSerie(a) - enSerie(b) || a._i - b._i); // 1/5, 2/5…
  else if (f.orden === "antiguos") lista.sort((a, b) => a.y - b.y || a._i - b._i);
  else lista.sort((a, b) => b.y - a.y || a._i - b._i);
  const ocultos = terminos.length && hayFiltros(f)
    ? catalogo.reduce((n, it) => n + (coincide(it) ? 1 : 0), 0) - lista.length
    : 0;
  return { lista, ocultos };
}

// ------------------------------------------------------------------ respaldo

/** Deja un registro de un respaldo con solo datos válidos (el archivo puede venir de cualquier lado). */
export function limpiarRegistro(r, ahora = new Date().toISOString()) {
  const texto = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");
  const ref = {};
  if (r.ref && typeof r.ref === "object") {
    for (const k of ["n", "l", "s", "sn", "t", "c", "co", "p", "p2", "sec", "w"]) {
      if (typeof r.ref[k] === "string") ref[k] = r.ref[k].slice(0, 300);
    }
    if (Number.isFinite(r.ref.y)) ref.y = r.ref.y;
  }
  return {
    id: String(r.id).slice(0, 60),
    cantidad: Math.max(0, Math.floor(Number(r.cantidad) || 0)),
    deseo: !!r.deseo,
    condicion: ["blister", "suelto"].includes(r.condicion) ? r.condicion : "",
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) ? r.fecha : "",
    precio: Number.isFinite(r.precio) && r.precio >= 0 ? r.precio : null,
    tienda: texto(r.tienda, 80),
    notas: texto(r.notas, 1000),
    tieneFoto: false,
    creado: texto(r.creado, 40) || ahora,
    actualizado: texto(r.actualizado, 40) || ahora,
    personalizado: !!r.personalizado,
    ref,
  };
}

/** Al restaurar: de cada auto se queda la versión editada más recientemente. */
export const debeReemplazar = (actual, nuevo) => !actual || (actual.actualizado || "") < nuevo.actualizado;

const DIA = 86400000;
export const diasDesde = (iso, ahora = Date.now()) => Math.floor((ahora - Date.parse(iso)) / DIA);

/**
 * Mensaje del recordatorio de respaldo al abrir la app, o "" si no toca.
 * Sin respaldo nunca: con 10 autos o desde 3 días después del primero. Con respaldo: cuando
 * pasaron 14 días y hubo cambios. Como mucho, un aviso cada 3 días.
 */
export function mensajeRecordatorio({ registros, ultimoRespaldo, cambios, ultimoRecordatorio, ahora = Date.now() }) {
  if (!registros.length) return "";
  if (ultimoRecordatorio && diasDesde(ultimoRecordatorio, ahora) < 3) return "";
  if (!ultimoRespaldo) {
    const masAntiguo = registros.reduce((m, r) => (r.creado && r.creado < m ? r.creado : m), new Date(ahora).toISOString());
    return registros.length >= 10 || diasDesde(masAntiguo, ahora) >= 3 ? "Todavía no tienes un respaldo de tu colección" : "";
  }
  const dias = diasDesde(ultimoRespaldo, ahora);
  return cambios > 0 && dias >= 14 ? `Tu último respaldo fue hace ${dias} días` : "";
}

// ------------------------------------------------------------------ iPhone

/**
 * Error de iOS 26 (app instalada con barra de estado translúcida): las capas fijas terminan
 * antes del borde de la pantalla. `altoSonda` es el alto de una capa fija de arriba a abajo;
 * en el iPhone, screen.width/height son siempre los de la pantalla vertical. Devuelve los px
 * que faltan hasta el borde real, o 0. Más de 80 px no es este error: se ignora.
 */
export function calcularHueco({ altoSonda, anchoVentana, altoVentana, anchoPantalla, altoPantalla }) {
  if (!(altoSonda > 0)) return 0;
  const altoReal = anchoVentana > altoVentana
    ? Math.min(anchoPantalla, altoPantalla) : Math.max(anchoPantalla, altoPantalla);
  const diferencia = Math.round(altoReal - altoSonda);
  return diferencia > 0 && diferencia <= 80 ? diferencia : 0;
}

/** Escala de la letra según el "Tamaño del texto" del iPhone (17 px es el normal), entre 0,85 y 1,5. */
export const escalaTexto = (pxCuerpo) => (pxCuerpo > 0 ? Math.min(1.5, Math.max(0.85, pxCuerpo / 17)) : 1);

// ------------------------------------------------------------------ versión

/**
 * La publicación reemplaza __VERSION__ por "<commit>-<AAAAMMDDhhmm>" (hora UTC).
 * Devuelve { commit, fecha } o null si es la copia de desarrollo.
 */
export function leerVersion(v) {
  const m = /^([0-9a-f]{7,40})-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v || "");
  if (!m) return null;
  const [, commit, a, mes, d, h, min] = m;
  return { commit, fecha: new Date(Date.UTC(+a, +mes - 1, +d, +h, +min)) };
}
