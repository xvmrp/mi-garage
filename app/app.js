import * as db from "./db.js";

const IMG = "https://static.wikia.nocookie.net/hotwheels/images/";
const WIKI = "https://hotwheels.fandom.com/wiki/";
const ORDEN_LINEAS = ["Mainline", "Car Culture", "Team Transport", "Boulevard", "Pop Culture", "5-Packs", "Multi-Packs"];
const LOTE = 48;

const ICONOS = {
  corazon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="16" r="2.5"/><circle cx="17" cy="16" r="2.5"/><path d="M3 16v-4l3-5h9l4 5h2v4"/></svg>',
};

// Etiquetas que vienen del catálogo (campo "e")
const ETIQUETAS = {
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
const EXCLUSIVOS = ["tg", "kr", "dg", "dt"];
const ESPECIALES = [
  { valor: "th", nombre: "Treasure Hunts" },
  { valor: "sth", nombre: "Super Treasure Hunts" },
  { valor: "nuevo", nombre: "Modelos nuevos" },
  { valor: "exclusivo", nombre: "Exclusivos de tienda" },
];
const etiquetasDe = (d) => (d.e || []).filter((e) => ETIQUETAS[e])
  .sort((a, b) => ORDEN_ETIQUETAS.indexOf(a) - ORDEN_ETIQUETAS.indexOf(b));
const cumpleEspecial = (it, esp) =>
  !esp || (esp === "exclusivo" ? (it.e || []).some((e) => EXCLUSIVOS.includes(e)) : (it.e || []).includes(esp));

const estado = {
  catalogo: [],
  porId: new Map(),
  coleccion: new Map(), // id -> registro
  meta: null,
  totalesLinea: new Map(),
  totalesAnio: new Map(), // solo Mainline
  totalesEspecial: new Map(), // th, sth, nuevo, exclusivo
  vista: "catalogo",
  todosLosAnios: false,
};

// ------------------------------------------------------------------ utilidades

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const urlFoto = (p, ancho = 300) => (p ? `${IMG}${p}/revision/latest/scale-to-width-down/${ancho}` : null);
const fmtNum = (n) => Number(n).toLocaleString("es");
const plural = (n, uno, varios) => `${fmtNum(n)} ${n === 1 ? uno : varios}`;

function hoyLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const ajustes = {
  leer(clave, defecto) {
    try {
      const v = localStorage.getItem("mi-garage:" + clave);
      return v === null ? defecto : JSON.parse(v);
    } catch { return defecto; }
  },
  escribir(clave, valor) {
    try { localStorage.setItem("mi-garage:" + clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
  },
};

function monedaPorDefecto() {
  const region = (navigator.language || "").split("-")[1]?.toUpperCase();
  return { CL: "CLP", MX: "MXN", AR: "ARS", CO: "COP", PE: "PEN", UY: "UYU", US: "USD", ES: "EUR" }[region] || "USD";
}

function fmtPrecio(n) {
  if (n === null || n === undefined || n === "" || isNaN(n)) return "";
  const moneda = ajustes.leer("moneda", monedaPorDefecto());
  try {
    return new Intl.NumberFormat("es", {
      style: "currency", currency: moneda, minimumFractionDigits: 0, maximumFractionDigits: Number(n) % 1 ? 2 : 0,
    }).format(n);
  } catch { return fmtNum(n); }
}

let temporizadorAviso;
let avisoFijo = false;
function avisar(mensaje, { deshacer, accion, fijo = false } = {}) {
  const el = $("#aviso");
  if (avisoFijo && !fijo) return; // no tapar el aviso de versión nueva
  avisoFijo = fijo;
  if (deshacer) accion = { texto: "Deshacer", fn: deshacer };
  el.innerHTML = esc(mensaje) + (accion ? `<button type="button">${esc(accion.texto)}</button>` : "");
  if (accion) {
    el.querySelector("button").onclick = async () => {
      el.classList.remove("visible");
      avisoFijo = false;
      await accion.fn();
    };
  }
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  if (!fijo) temporizadorAviso = setTimeout(() => el.classList.remove("visible"), accion ? 8000 : 2600);
}

// En celulares (sobre todo iPhone con la app instalada) descargar archivos no funciona bien:
// se usa el menú "Compartir", que permite "Guardar en Archivos", enviarlo por WhatsApp, etc.
const esCelular = matchMedia("(pointer: coarse)").matches;

async function descargar(nombre, contenido, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  if (esCelular && navigator.canShare) {
    const archivo = new File([blob], nombre, { type: tipo });
    if (navigator.canShare({ files: [archivo] })) {
      const compartir = () => navigator.share({ files: [archivo], title: nombre });
      try {
        await compartir();
        return true;
      } catch (e) {
        if (e.name === "AbortError") return false; // el usuario cerró el menú
        if (e.name === "NotAllowedError") {
          // Safari exige un toque reciente y preparar el archivo tomó tiempo: pedir otro toque
          avisar("Tu archivo está listo", { accion: { texto: "Guardar", fn: () => compartir().catch(() => {}) } });
          return false;
        }
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// ------------------------------------------------------------------ datos

/** Datos para mostrar un auto: del catálogo, o la copia guardada en el registro. */
function datosDe(id) {
  return estado.porId.get(id) || estado.coleccion.get(id)?.ref || { n: "(auto desconocido)" };
}

function refDe(item) {
  const ref = {};
  for (const k of ["n", "y", "l", "s", "sn", "t", "c", "co", "p", "p2", "sec", "w", "e"]) if (item[k]) ref[k] = item[k];
  return ref;
}

function nuevoRegistro(id) {
  const item = estado.porId.get(id);
  const ahora = new Date().toISOString();
  return {
    id, cantidad: 0, deseo: false, condicion: "", fecha: "", precio: null, tienda: "", notas: "",
    tieneFoto: false, creado: ahora, actualizado: ahora, personalizado: !item, ref: item ? refDe(item) : {},
  };
}

function copiaRegistro(id) {
  const r = estado.coleccion.get(id);
  return r ? structuredClone(r) : nuevoRegistro(id);
}

let persistenciaPedida = false;
async function persistir(reg) {
  reg.actualizado = new Date().toISOString();
  if (reg.cantidad <= 0 && !reg.deseo) {
    await quitarRegistro(reg.id, { silencioso: true });
    return;
  }
  const item = estado.porId.get(reg.id);
  if (item) reg.ref = refDe(item); // mantener la copia al día
  await db.guardar(reg);
  estado.coleccion.set(reg.id, reg);
  if (!persistenciaPedida) { persistenciaPedida = true; db.pedirPersistencia(); }
  alCambiar(reg.id);
}

async function quitarRegistro(id, { silencioso = false } = {}) {
  const reg = estado.coleccion.get(id);
  await db.borrar(id);
  if (reg?.tieneFoto) { await db.borrarFoto(id); olvidarFotoPropia(id); }
  estado.coleccion.delete(id);
  alCambiar(id);
  if (!silencioso) avisar("Quitado de tu colección");
}

async function sumarUno(id) {
  const antes = estado.coleccion.get(id) ? structuredClone(estado.coleccion.get(id)) : null;
  const reg = copiaRegistro(id);
  reg.cantidad += 1;
  if (reg.cantidad === 1) {
    if (!reg.fecha) reg.fecha = hoyLocal();
    reg.deseo = false; // ya lo tienes: sale de la lista de deseos
  }
  await persistir(reg);
  const nombre = datosDe(id).n;
  avisar(reg.cantidad === 1 ? `Agregado: ${nombre}` : `Ahora tienes ${reg.cantidad}: ${nombre}`, {
    deshacer: async () => {
      if (antes) { await db.guardar(antes); estado.coleccion.set(id, antes); alCambiar(id); }
      else await quitarRegistro(id, { silencioso: true });
    },
  });
}

async function alternarDeseo(id) {
  const reg = copiaRegistro(id);
  reg.deseo = !reg.deseo;
  await persistir(reg);
  avisar(reg.deseo ? "Agregado a tu lista de deseos" : "Quitado de tu lista de deseos");
}

// Fotos propias (guardadas en IndexedDB) -> URLs temporales
const urlsPropias = new Map();
async function urlFotoPropia(id) {
  if (urlsPropias.has(id)) return urlsPropias.get(id);
  const blob = await db.leerFoto(id);
  const url = blob ? URL.createObjectURL(blob) : null;
  urlsPropias.set(id, url);
  return url;
}
function olvidarFotoPropia(id) {
  const url = urlsPropias.get(id);
  if (url) URL.revokeObjectURL(url);
  urlsPropias.delete(id);
}

async function reducirImagen(archivo, max = 1200) {
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * k);
  lienzo.height = Math.round(bmp.height * k);
  lienzo.getContext("2d").drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  bmp.close?.();
  return new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.82));
}

// ------------------------------------------------------------------ tarjetas

function textoSerie(d) {
  const serie = d.s || d.sec || "";
  return [d.y, serie && d.sn ? `${serie} ${d.sn}` : serie].filter(Boolean).join(" · ");
}

function fotoHTML(p) {
  const url = urlFoto(p);
  if (!url) return `<div class="sin-foto">${ICONOS.auto}Sin foto</div>`;
  return `<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(url)}" alt="">`;
}

function tarjetaHTML(id, { fotosPropias = false } = {}) {
  const d = datosDe(id);
  const reg = estado.coleccion.get(id);
  const cant = reg?.cantidad || 0;
  const deseo = !!reg?.deseo;
  const codigos = [d.c && `#${d.c}`, d.t].filter(Boolean).join(" · ");
  const propia = fotosPropias && reg?.tieneFoto;
  const chips = [
    d.l && d.l !== "Mainline" && `<span class="chip e-linea">${esc(d.l)}</span>`,
    ...etiquetasDe(d).slice(0, 2).map((e) =>
      `<span class="chip ${ETIQUETAS[e].clase}" title="${esc(ETIQUETAS[e].largo)}">${esc(ETIQUETAS[e].corto)}</span>`),
  ].filter(Boolean);
  return `<article class="tarjeta${cant ? " tengo" : ""}" data-id="${esc(id)}">
    <button type="button" class="tarjeta-abrir" data-accion="abrir" aria-label="Ver ficha de ${esc(d.n)}">
      <div class="foto"${propia ? " data-foto-propia" : ""}>${fotoHTML(d.p || d.p2)}</div>
      <div class="info">
        <h3>${esc(d.n)}</h3>
        <p>${esc(textoSerie(d))}</p>
        ${codigos ? `<p class="codigos">${esc(codigos)}</p>` : ""}
      </div>
    </button>
    ${chips.length ? `<div class="etiquetas">${chips.join("")}</div>` : ""}
    ${cant ? `<span class="cantidad-insignia" title="Tienes ${cant}">×${cant}</span>` : ""}
    <div class="acciones">
      <button type="button" class="btn-redondo btn-deseo${deseo ? " activo" : ""}" data-accion="deseo"
        aria-pressed="${deseo}" aria-label="${deseo ? "Quitar de" : "Agregar a"} la lista de deseos" title="Lista de deseos">${ICONOS.corazon}</button>
      <button type="button" class="btn-redondo btn-sumar" data-accion="sumar"
        aria-label="Agregar uno a mi colección" title="Agregar uno a mi colección">${ICONOS.mas}</button>
    </div>
  </article>`;
}

async function cargarFotosPropias(raiz) {
  for (const div of $$(".foto[data-foto-propia]:not([data-cargada])", raiz)) {
    div.dataset.cargada = "1";
    const url = await urlFotoPropia(div.closest(".tarjeta").dataset.id);
    if (url) div.innerHTML = `<img src="${esc(url)}" alt="">`;
  }
}

/** Grilla que agrega tarjetas por tandas a medida que se hace scroll. */
class Grilla {
  constructor(grilla, centinela, opciones = {}) {
    this.grilla = grilla;
    this.centinela = centinela;
    this.opciones = opciones;
    this.ids = [];
    this.n = 0;
    new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) this.mas(); }, { rootMargin: "1200px" })
      .observe(centinela);
  }
  mostrar(ids) {
    this.ids = ids;
    this.n = 0;
    this.grilla.innerHTML = "";
    this.mas();
  }
  mas() {
    if (this.n >= this.ids.length || this.grilla.offsetParent === null) return;
    const tramo = this.ids.slice(this.n, this.n + LOTE);
    this.n += tramo.length;
    this.grilla.insertAdjacentHTML("beforeend", tramo.map((id) => tarjetaHTML(id, this.opciones)).join(""));
    if (this.opciones.fotosPropias) cargarFotosPropias(this.grilla);
    requestAnimationFrame(() => {
      if (this.centinela.getBoundingClientRect().top < innerHeight + 1200) this.mas();
    });
  }
  actualizar(id, sigueEnLista = true) {
    const selector = `.tarjeta[data-id="${CSS.escape(id)}"]`;
    for (const el of $$(selector, this.grilla)) {
      if (!sigueEnLista) { el.remove(); continue; }
      el.outerHTML = tarjetaHTML(id, this.opciones);
    }
    $$(`${selector} .cantidad-insignia`, this.grilla).forEach((b) => b.classList.add("pulso"));
    if (this.opciones.fotosPropias) cargarFotosPropias(this.grilla);
  }
}

let grillaCatalogo, grillaColeccion, grillaDeseos;

/** Refresca lo que se ve después de cambiar un registro. */
function alCambiar(id) {
  const reg = estado.coleccion.get(id);
  grillaCatalogo.actualizar(id);
  grillaColeccion.actualizar(id, (reg?.cantidad || 0) > 0);
  grillaDeseos.actualizar(id, !!reg?.deseo);
  actualizarConteoCatalogo();
  actualizarConteos();
  if (estado.vista === "estadisticas") renderEstadisticas();
}

// ------------------------------------------------------------------ catálogo

function leerFiltros() {
  return {
    q: $("#buscar").value,
    anio: $("#f-anio").value,
    linea: $("#f-linea").value,
    est: $("#f-estado").value,
    orden: $("#f-orden").value,
    especial: $('input[name="especial"]:checked')?.value || "",
  };
}

function marcarEspecial(valor) {
  const radio = $(`input[name="especial"][value="${CSS.escape(valor || "")}"]`) || $('input[name="especial"][value=""]');
  radio.checked = true;
}

function filtrarCatalogo() {
  const f = leerFiltros();
  ajustes.escribir("filtros", { ...f, q: "" });
  const terminos = norm(f.q).trim().split(/\s+/).filter(Boolean);
  const anio = f.anio ? Number(f.anio) : null;
  const lista = estado.catalogo.filter((it) => {
    if (anio && it.y !== anio) return false;
    if (f.linea && it.l !== f.linea) return false;
    if (!cumpleEspecial(it, f.especial)) return false;
    if (f.est) {
      const r = estado.coleccion.get(it.id);
      const tiene = (r?.cantidad || 0) > 0;
      if (f.est === "tengo" && !tiene) return false;
      if (f.est === "falta" && tiene) return false;
      if (f.est === "deseo" && !r?.deseo) return false;
    }
    return terminos.every((t) => it._q.includes(t));
  });
  if (f.orden === "nombre") lista.sort((a, b) => a.n.localeCompare(b.n, "es") || b.y - a.y);
  else if (f.orden === "antiguos") lista.sort((a, b) => a.y - b.y || a._i - b._i);
  else lista.sort((a, b) => b.y - a.y || a._i - b._i);

  grillaCatalogo.mostrar(lista.map((it) => it.id));
  actualizarConteoCatalogo();
}

function actualizarConteoCatalogo() {
  const ids = grillaCatalogo.ids;
  const tengo = ids.reduce((n, id) => n + ((estado.coleccion.get(id)?.cantidad || 0) > 0 ? 1 : 0), 0);
  $("#conteo-catalogo").textContent = ids.length
    ? `${plural(ids.length, "auto", "autos")} · tienes ${fmtNum(tengo)}`
    : "No hay autos que coincidan con la búsqueda.";
}

function prepararCatalogo(datos) {
  estado.meta = datos;
  estado.catalogo = datos.items;
  estado.catalogo.forEach((it, i) => {
    it._i = i;
    const etiquetas = etiquetasDe(it).map((e) => `${ETIQUETAS[e].corto} ${ETIQUETAS[e].largo}`);
    it._q = norm([it.n, it.t, it.s, it.sec, it.co, it.l, it.y, it.c && "#" + it.c, it.no, ...etiquetas]
      .filter(Boolean).join(" "));
    estado.porId.set(it.id, it);
    for (const esp of ESPECIALES) {
      if (cumpleEspecial(it, esp.valor)) estado.totalesEspecial.set(esp.valor, (estado.totalesEspecial.get(esp.valor) || 0) + 1);
    }
    estado.totalesLinea.set(it.l, (estado.totalesLinea.get(it.l) || 0) + 1);
    if (it.l === "Mainline") estado.totalesAnio.set(it.y, (estado.totalesAnio.get(it.y) || 0) + 1);
  });

  const anios = [...new Set(estado.catalogo.map((it) => it.y))].sort((a, b) => b - a);
  $("#f-anio").insertAdjacentHTML("beforeend", anios.map((y) => `<option value="${y}">${y}</option>`).join(""));
  const lineas = [...estado.totalesLinea.keys()].sort(
    (a, b) => (ORDEN_LINEAS.indexOf(a) + 1 || 99) - (ORDEN_LINEAS.indexOf(b) + 1 || 99));
  $("#f-linea").insertAdjacentHTML("beforeend",
    lineas.map((l) => `<option value="${esc(l)}">${esc(l)} (${fmtNum(estado.totalesLinea.get(l))})</option>`).join(""));
  $("#lista-lineas").innerHTML = lineas.map((l) => `<option value="${esc(l)}">`).join("");

  const generado = datos.generado ? new Date(datos.generado).toLocaleDateString("es") : "?";
  $("#info-catalogo").textContent = `${fmtNum(datos.total)} autos de ${anios.at(-1)} a ${anios[0]} · actualizado el ${generado}.`;
}

// ------------------------------------------------------------------ colección y deseos

function registrosVisibles(filtro, q) {
  const terminos = norm(q).trim().split(/\s+/).filter(Boolean);
  return [...estado.coleccion.values()].filter((r) => {
    if (!filtro(r)) return false;
    if (!terminos.length) return true;
    const d = datosDe(r.id);
    const texto = norm([d.n, d.t, d.s, d.sec, d.co, d.l, d.y, r.tienda, r.notas].filter(Boolean).join(" "));
    return terminos.every((t) => texto.includes(t));
  });
}

function renderColeccion() {
  const orden = $("#orden-coleccion").value;
  const regs = registrosVisibles((r) => r.cantidad > 0, $("#buscar-coleccion").value);
  const nombre = (r) => datosDe(r.id).n || "";
  if (orden === "nombre") regs.sort((a, b) => nombre(a).localeCompare(nombre(b), "es"));
  else if (orden === "anio") regs.sort((a, b) => (datosDe(b.id).y || 0) - (datosDe(a.id).y || 0) || nombre(a).localeCompare(nombre(b), "es"));
  else if (orden === "precio") regs.sort((a, b) => (b.precio || 0) - (a.precio || 0));
  else regs.sort((a, b) => (b.creado || "").localeCompare(a.creado || ""));
  grillaColeccion.mostrar(regs.map((r) => r.id));
  actualizarConteos();
}

function renderDeseos() {
  const regs = registrosVisibles((r) => r.deseo, "");
  regs.sort((a, b) => (b.actualizado || "").localeCompare(a.actualizado || ""));
  grillaDeseos.mostrar(regs.map((r) => r.id));
  actualizarConteos();
}

function resumenColeccion() {
  let modelos = 0, unidades = 0, gasto = 0, deseos = 0;
  for (const r of estado.coleccion.values()) {
    if (r.cantidad > 0) {
      modelos += 1;
      unidades += r.cantidad;
      gasto += (Number(r.precio) || 0) * r.cantidad;
    }
    if (r.deseo) deseos += 1;
  }
  return { modelos, unidades, gasto, deseos };
}

function actualizarConteos() {
  const { modelos, unidades, gasto, deseos } = resumenColeccion();
  $("#conteo-coleccion").textContent = modelos
    ? `${plural(modelos, "modelo", "modelos")} · ${plural(unidades, "unidad", "unidades")}${gasto ? ` · ${fmtPrecio(gasto)} invertidos` : ""}`
    : "";
  $("#vacio-coleccion").hidden = modelos > 0;
  $("#conteo-deseos").textContent = deseos ? `${plural(deseos, "auto", "autos")} en tu lista de deseos` : "";
  $("#vacio-deseos").hidden = deseos > 0;
}

// ------------------------------------------------------------------ resumen

function filaProgreso(nombre, tengo, total, filtro) {
  const pct = total ? (tengo / total) * 100 : 0;
  const pctTxt = pct > 0 && pct < 1 ? "<1" : Math.round(pct);
  return `<button type="button" class="progreso" data-linea="${esc(filtro.linea || "")}" data-anio="${esc(filtro.anio || "")}"
      data-especial="${esc(filtro.especial || "")}"
      title="${esc(`${nombre}: tienes ${tengo} de ${total} (${pctTxt}%)`)}">
    <span class="nombre">${esc(nombre)}</span>
    <span class="pista"><span class="relleno" style="width:${tengo ? `max(${pct.toFixed(2)}%, 4px)` : "0"}"></span></span>
    <span class="cifra">${fmtNum(tengo)} / ${fmtNum(total)} · ${pctTxt}%</span>
  </button>`;
}

function renderEstadisticas() {
  const { modelos, unidades, gasto, deseos } = resumenColeccion();
  const porLinea = new Map(), porAnio = new Map(), porEspecial = new Map();
  let personalizados = 0;
  for (const r of estado.coleccion.values()) {
    if (!(r.cantidad > 0)) continue;
    const it = estado.porId.get(r.id);
    if (!it) { personalizados += 1; continue; }
    for (const esp of ESPECIALES) {
      if (cumpleEspecial(it, esp.valor)) porEspecial.set(esp.valor, (porEspecial.get(esp.valor) || 0) + 1);
    }
    porLinea.set(it.l, (porLinea.get(it.l) || 0) + 1);
    if (it.l === "Mainline") porAnio.set(it.y, (porAnio.get(it.y) || 0) + 1);
  }
  const lineas = [...estado.totalesLinea.keys()].sort(
    (a, b) => (ORDEN_LINEAS.indexOf(a) + 1 || 99) - (ORDEN_LINEAS.indexOf(b) + 1 || 99));
  const anios = [...estado.totalesAnio.keys()].sort((a, b) => b - a);
  const aniosVisibles = estado.todosLosAnios ? anios : anios.filter((y) => porAnio.get(y));

  $("#estadisticas").innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="valor">${fmtNum(modelos)}</div><div class="etq">Modelos distintos</div></div>
      <div class="tile"><div class="valor">${fmtNum(unidades)}</div><div class="etq">Unidades en total</div></div>
      <div class="tile"><div class="valor">${gasto ? esc(fmtPrecio(gasto)) : "—"}</div><div class="etq">Invertido</div></div>
      <div class="tile"><div class="valor">${fmtNum(deseos)}</div><div class="etq">En lista de deseos</div></div>
    </div>
    <div class="panel">
      <h2>Avance por línea</h2>
      <p class="ayuda">Modelos distintos que tienes del catálogo. Toca una línea para verla.</p>
      <div class="progresos">
        ${lineas.map((l) => filaProgreso(l, porLinea.get(l) || 0, estado.totalesLinea.get(l), { linea: l })).join("")}
      </div>
      ${personalizados ? `<p class="ayuda" style="margin:10px 0 0">Además tienes ${plural(personalizados, "auto agregado", "autos agregados")} a mano.</p>` : ""}
    </div>
    <div class="panel">
      <h2>Cacería</h2>
      <p class="ayuda">Treasure Hunts, modelos nuevos y exclusivos que tienes.</p>
      <div class="progresos">
        ${ESPECIALES.filter((e) => estado.totalesEspecial.get(e.valor)).map((e) =>
          filaProgreso(e.nombre, porEspecial.get(e.valor) || 0, estado.totalesEspecial.get(e.valor), { especial: e.valor })).join("")}
      </div>
    </div>
    <div class="panel">
      <h2>Mainline por año</h2>
      ${aniosVisibles.length
        ? `<div class="progresos">${aniosVisibles.map((y) =>
            filaProgreso(String(y), porAnio.get(y) || 0, estado.totalesAnio.get(y), { linea: "Mainline", anio: y })).join("")}</div>`
        : `<p class="ayuda">Todavía no tienes autos Mainline.</p>`}
      <button type="button" class="boton secundario mostrar-todo" id="btn-todos-anios">
        ${estado.todosLosAnios ? "Mostrar solo los años en que tengo autos" : "Mostrar todos los años"}
      </button>
    </div>`;
}

// ------------------------------------------------------------------ ficha

async function abrirFicha(id) {
  const d = datosDe(id);
  const existe = estado.coleccion.has(id);
  const r = copiaRegistro(id);
  const propia = r.tieneFoto ? await urlFotoPropia(id) : null;
  const fotos = [
    propia && { tipo: "Mi foto", url: propia, grande: propia },
    d.p && { tipo: "Suelto", url: urlFoto(d.p, 640), grande: urlFoto(d.p, 1400) },
    d.p2 && { tipo: "En blíster", url: urlFoto(d.p2, 640), grande: urlFoto(d.p2, 1400) },
  ].filter(Boolean);
  const etiquetas = etiquetasDe(d);
  const filas = [
    ["Año", d.y], ["Línea", d.l], ["Serie", d.s], ["Nº en la serie", d.sn], ["Nº de colección", d.c],
    ["Toy #", d.t], ["Color", d.co], ["Grupo", d.sec && d.sec !== d.s ? d.sec : ""], ["Notas", d.no],
  ].filter(([, v]) => v);
  const tiendas = [...new Set([...estado.coleccion.values()].map((x) => x.tienda).filter(Boolean))];

  const dialogo = $("#ficha");
  dialogo.innerHTML = `
    <form id="form-ficha" novalidate>
      <header class="dialogo-cabecera">
        <div>
          <h2 id="ficha-titulo">${esc(d.n)}</h2>
          <p class="sub">${esc([d.l, textoSerie(d)].filter(Boolean).join(" · "))}</p>
          ${etiquetas.length ? `<div class="chips-ficha">${etiquetas.map((e) =>
            `<span class="chip ${ETIQUETAS[e].clase}">${esc(ETIQUETAS[e].largo)}</span>`).join("")}</div>` : ""}
        </div>
        <button type="button" class="cerrar" data-cerrar aria-label="Cerrar">×</button>
      </header>
      <div class="ficha-cuerpo">
        <div class="carrusel" id="carrusel">
          ${fotos.length ? fotos.map((f, i) => `
            <figure class="diapo">
              <button type="button" class="diapo-boton" data-ver="${i}" aria-label="Ver en grande: ${esc(f.tipo)}">
                <img src="${esc(f.url)}" alt="${esc(f.tipo)}" referrerpolicy="no-referrer"${i ? ' loading="lazy"' : ""}>
              </button>
              <figcaption>${esc(f.tipo)}</figcaption>
            </figure>`).join("")
          : `<div class="diapo"><div class="sin-foto">${ICONOS.auto}Sin foto</div></div>`}
        </div>
        ${fotos.length > 1 ? `<div class="puntos">${fotos.map((f, i) => `
          <button type="button" data-ir-foto="${i}" class="${i === 0 ? "activa" : ""}" aria-label="Foto ${i + 1}: ${esc(f.tipo)}"></button>`).join("")}</div>` : ""}
        <dl class="datos">${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        ${d.w ? `<a class="wiki-link" href="${esc(WIKI + d.w)}" target="_blank" rel="noopener">Ver en la Hot Wheels Wiki ↗</a>` : ""}
        ${r.personalizado ? `<p><button type="button" class="enlace" data-editar>Editar datos del auto</button></p>` : ""}

        <fieldset class="registro">
          <legend>Mi registro</legend>
          <div class="contador">
            <button type="button" data-cant="-1" aria-label="Uno menos">−</button>
            <output id="f-cantidad" aria-live="polite">${r.cantidad}</output>
            <button type="button" data-cant="1" aria-label="Uno más">+</button>
            <span class="etq">en mi colección</span>
          </div>
          <div class="chips" role="radiogroup" aria-label="Estado del auto">
            <label><input type="radio" name="condicion" value="blister" ${r.condicion === "blister" ? "checked" : ""}><span>En blíster</span></label>
            <label><input type="radio" name="condicion" value="suelto" ${r.condicion === "suelto" ? "checked" : ""}><span>Suelto</span></label>
          </div>
          <div class="dos-columnas">
            <label class="campo"><span>Fecha de compra</span><input type="date" name="fecha" value="${esc(r.fecha)}"></label>
            <label class="campo"><span>Precio por unidad</span><input type="number" name="precio" min="0" step="any" inputmode="decimal" value="${r.precio ?? ""}"></label>
          </div>
          <label class="campo"><span>Dónde lo compré</span><input name="tienda" maxlength="80" list="lista-tiendas" value="${esc(r.tienda)}"></label>
          <datalist id="lista-tiendas">${tiendas.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
          <label class="campo"><span>Notas</span><textarea name="notas" maxlength="1000">${esc(r.notas)}</textarea></label>
          <div class="mi-foto">
            <img id="vista-mi-foto" alt="Mi foto" ${propia ? `src="${esc(propia)}"` : "hidden"}>
            <label class="boton secundario">${propia ? "Cambiar mi foto" : "Agregar mi foto"}
              <input type="file" accept="image/*" id="input-mi-foto" hidden></label>
            <button type="button" class="boton secundario" data-quitar-foto ${propia ? "" : "hidden"}>Quitar foto</button>
          </div>
          <label class="check"><input type="checkbox" name="deseo" ${r.deseo ? "checked" : ""}> Lo estoy buscando (lista de deseos)</label>
        </fieldset>
      </div>
      <footer class="dialogo-pie ficha-pie">
        ${existe ? `<button type="button" class="boton peligro" data-quitar>Quitar</button>` : ""}
        <span style="flex:1"></span>
        <button type="button" class="boton secundario" data-cerrar>Cancelar</button>
        <button type="submit" class="boton">Guardar</button>
      </footer>
    </form>`;

  const form = $("#form-ficha");
  let cantidad = r.cantidad;
  let fotoNueva = null, quitarFoto = false;

  form.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.cant) {
      cantidad = Math.max(0, cantidad + Number(b.dataset.cant));
      $("#f-cantidad").textContent = cantidad;
      if (cantidad > 0 && !form.fecha.value) form.fecha.value = hoyLocal();
      if (cantidad > 0) form.deseo.checked = false;
    } else if (b.dataset.irFoto) {
      const c = $("#carrusel");
      c.scrollTo({ left: Number(b.dataset.irFoto) * c.clientWidth, behavior: "smooth" });
    } else if (b.dataset.ver) {
      abrirVisor(fotos, Number(b.dataset.ver));
    } else if (b.hasAttribute("data-quitar-foto")) {
      quitarFoto = true;
      fotoNueva = null;
      $("#vista-mi-foto").hidden = true;
      b.hidden = true;
    } else if (b.hasAttribute("data-quitar")) {
      if (confirm(`¿Quitar "${d.n}" de tu colección? Se borran también tus datos de compra.`)) {
        dialogo.close();
        await quitarRegistro(id);
      }
    } else if (b.hasAttribute("data-editar")) {
      dialogo.close();
      abrirPersonalizado(id);
    }
  });

  $("#input-mi-foto").addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      fotoNueva = await reducirImagen(archivo);
      quitarFoto = false;
      const vista = $("#vista-mi-foto");
      vista.src = URL.createObjectURL(fotoNueva);
      vista.hidden = false;
      $("[data-quitar-foto]", form).hidden = false;
    } catch {
      avisar("No se pudo leer esa imagen. Prueba con una foto JPG o PNG.");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const precio = form.precio.value.trim();
    const nuevo = {
      ...r,
      cantidad,
      condicion: form.condicion.value || "",
      fecha: form.fecha.value,
      precio: precio === "" ? null : Math.max(0, Number(precio)),
      tienda: form.tienda.value.trim(),
      notas: form.notas.value.trim(),
      deseo: form.deseo.checked,
    };
    if (nuevo.cantidad <= 0 && !nuevo.deseo) {
      if (existe && !confirm(`Dejaste la cantidad en 0. ¿Quitar "${d.n}" de tu colección?`)) return;
      dialogo.close();
      if (existe) await quitarRegistro(id);
      return;
    }
    if (fotoNueva) {
      await db.guardarFoto(id, fotoNueva);
      olvidarFotoPropia(id);
      nuevo.tieneFoto = true;
    } else if (quitarFoto) {
      await db.borrarFoto(id);
      olvidarFotoPropia(id);
      nuevo.tieneFoto = false;
    }
    dialogo.close();
    await persistir(nuevo);
    avisar("Guardado");
  });

  // Puntos del carrusel según la foto visible
  const carrusel = $("#carrusel");
  carrusel.addEventListener("scroll", () => {
    const i = Math.round(carrusel.scrollLeft / Math.max(1, carrusel.clientWidth));
    $$(".puntos button", form).forEach((x, k) => x.classList.toggle("activa", k === i));
  }, { passive: true });

  dialogo.showModal();
  dialogo.scrollTop = 0;
}

function abrirVisor(fotos, inicio) {
  const visor = $("#visor");
  visor.innerHTML = `
    <div class="visor-carrusel" id="visor-carrusel">
      ${fotos.map((f) => `<figure class="visor-diapo">
        <img src="${esc(f.grande)}" alt="${esc(f.tipo)}" referrerpolicy="no-referrer">
        <figcaption>${esc(f.tipo)}</figcaption></figure>`).join("")}
    </div>
    <button type="button" class="cerrar visor-cerrar" data-cerrar aria-label="Cerrar">×</button>`;
  visor.showModal();
  const c = $("#visor-carrusel");
  c.scrollLeft = inicio * c.clientWidth;
}

// ------------------------------------------------------------------ auto personalizado

function abrirPersonalizado(idEditar = null) {
  const dialogo = $("#dialogo-personalizado");
  const form = $("#form-personalizado");
  form.reset();
  form.dataset.editar = idEditar || "";
  $("#personalizado-titulo").textContent = idEditar ? "Editar auto" : "Agregar un auto";
  if (idEditar) {
    const ref = estado.coleccion.get(idEditar)?.ref || {};
    for (const k of ["n", "y", "l", "s", "t", "co"]) form.elements[k].value = ref[k] ?? "";
  }
  dialogo.showModal();
}

async function guardarPersonalizado(e) {
  e.preventDefault();
  const form = e.target;
  const v = (k) => form.elements[k].value.trim();
  const ref = { n: v("n"), y: v("y") ? Number(v("y")) : "", l: v("l"), s: v("s"), t: v("t"), co: v("co") };
  if (!ref.n) return;
  for (const k of Object.keys(ref)) if (ref[k] === "") delete ref[k];
  const idEditar = form.dataset.editar;
  $("#dialogo-personalizado").close();
  if (idEditar) {
    const reg = copiaRegistro(idEditar);
    reg.ref = ref;
    await persistir(reg);
    abrirFicha(idEditar);
    return;
  }
  const id = "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const reg = { ...nuevoRegistro(id), personalizado: true, ref, cantidad: 1, fecha: hoyLocal() };
  await persistir(reg);
  abrirFicha(id); // para completar precio, tienda, foto...
}

// ------------------------------------------------------------------ respaldo

const blobADataURL = (blob) => new Promise((ok, mal) => {
  const lector = new FileReader();
  lector.onload = () => ok(lector.result);
  lector.onerror = () => mal(lector.error);
  lector.readAsDataURL(blob);
});

async function exportarRespaldo() {
  const fotos = {};
  for (const [id, blob] of await db.todasLasFotos()) fotos[id] = await blobADataURL(blob);
  const respaldo = {
    app: "mi-garage", version: 1, exportado: new Date().toISOString(),
    moneda: ajustes.leer("moneda", monedaPorDefecto()),
    registros: [...estado.coleccion.values()], fotos,
  };
  const listo = await descargar(`mi-garage-respaldo-${hoyLocal()}.json`, JSON.stringify(respaldo), "application/json");
  if (listo) avisar(`Respaldo guardado (${plural(respaldo.registros.length, "auto", "autos")})`);
}

function limpiarRegistro(r) {
  const texto = (x, max) => (typeof x === "string" ? x.slice(0, max) : "");
  const ref = {};
  if (r.ref && typeof r.ref === "object") {
    for (const k of ["n", "l", "s", "sn", "t", "c", "co", "p", "p2", "sec", "w"]) if (typeof r.ref[k] === "string") ref[k] = r.ref[k].slice(0, 300);
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
    creado: texto(r.creado, 40) || new Date().toISOString(),
    actualizado: texto(r.actualizado, 40) || new Date().toISOString(),
    personalizado: !!r.personalizado,
    ref,
  };
}

async function importarRespaldo(archivo) {
  let datos;
  try { datos = JSON.parse(await archivo.text()); } catch { datos = null; }
  if (!datos || datos.app !== "mi-garage" || !Array.isArray(datos.registros)) {
    avisar("Ese archivo no es un respaldo de Mi Garage.");
    return;
  }
  let nuevos = 0, actualizados = 0, iguales = 0;
  for (const crudo of datos.registros) {
    if (!crudo || typeof crudo.id !== "string") continue;
    const r = limpiarRegistro(crudo);
    const actual = estado.coleccion.get(r.id);
    if (actual && (actual.actualizado || "") >= r.actualizado) { iguales += 1; continue; }
    const foto = datos.fotos?.[crudo.id];
    if (typeof foto === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(foto)) {
      await db.guardarFoto(r.id, await (await fetch(foto)).blob());
      olvidarFotoPropia(r.id);
      r.tieneFoto = true;
    } else if (actual?.tieneFoto) {
      r.tieneFoto = true;
    }
    if (r.cantidad <= 0 && !r.deseo) continue;
    await db.guardar(r);
    estado.coleccion.set(r.id, r);
    actual ? (actualizados += 1) : (nuevos += 1);
  }
  if (datos.moneda && /^[A-Z]{3}$/.test(datos.moneda) && !ajustes.leer("moneda", null)) {
    ajustes.escribir("moneda", datos.moneda);
    $("#moneda").value = datos.moneda;
  }
  filtrarCatalogo();
  actualizarConteos();
  avisar(`Respaldo restaurado: ${nuevos} nuevos, ${actualizados} actualizados, ${iguales} sin cambios`);
}

function exportarCSV() {
  const columnas = ["Nombre", "Año", "Línea", "Serie", "Nº serie", "Nº colección", "Toy #", "Color", "Cantidad",
    "Estado", "Fecha compra", "Precio unidad", "Dónde", "Notas", "Lista de deseos", "Especial"];
  const celda = (v) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = [...estado.coleccion.values()].map((r) => {
    const d = datosDe(r.id);
    return [d.n, d.y, d.l, d.s || d.sec, d.sn, d.c, d.t, d.co, r.cantidad,
      { blister: "En blíster", suelto: "Suelto" }[r.condicion] || "", r.fecha, r.precio ?? "", r.tienda, r.notas,
      r.deseo ? "Sí" : "", etiquetasDe(d).map((e) => ETIQUETAS[e].largo).join(", ")];
  });
  const csv = "﻿" + [columnas, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  descargar(`mi-garage-${hoyLocal()}.csv`, csv, "text/csv;charset=utf-8");
}

// ------------------------------------------------------------------ navegación

function mostrarVista(vista) {
  estado.vista = vista;
  ajustes.escribir("vista", vista);
  $$(".vista").forEach((s) => s.classList.toggle("activa", s.id === `vista-${vista}`));
  $$(".pestanas button").forEach((b) => {
    const activa = b.dataset.vista === vista;
    b.classList.toggle("activa", activa);
    b.setAttribute("aria-current", activa ? "page" : "false");
  });
  if (vista === "catalogo") grillaCatalogo.mas();
  if (vista === "coleccion") renderColeccion();
  if (vista === "deseos") renderDeseos();
  if (vista === "estadisticas") renderEstadisticas();
  window.scrollTo({ top: 0 });
}

function irAlCatalogo({ linea = "", anio = "", est = "", especial = "" } = {}) {
  $("#buscar").value = "";
  $("#f-linea").value = linea;
  $("#f-anio").value = anio;
  $("#f-estado").value = est;
  marcarEspecial(especial);
  mostrarVista("catalogo");
  filtrarCatalogo();
}

function enGrilla(e) {
  const boton = e.target.closest("[data-accion]");
  if (!boton) return;
  const id = boton.closest(".tarjeta").dataset.id;
  const accion = boton.dataset.accion;
  if (accion === "abrir") abrirFicha(id);
  else if (accion === "sumar") sumarUno(id);
  else if (accion === "deseo") alternarDeseo(id);
}

function conectarEventos() {
  $$(".pestanas button").forEach((b) => b.addEventListener("click", () => mostrarVista(b.dataset.vista)));
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => mostrarVista(b.dataset.ir)));

  let espera;
  $("#buscar").addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(filtrarCatalogo, 140); });
  ["#f-anio", "#f-linea", "#f-estado", "#f-orden"].forEach((s) => $(s).addEventListener("change", filtrarCatalogo));
  $$('input[name="especial"]').forEach((r) => r.addEventListener("change", filtrarCatalogo));

  let esperaCol;
  $("#buscar-coleccion").addEventListener("input", () => { clearTimeout(esperaCol); esperaCol = setTimeout(renderColeccion, 140); });
  $("#orden-coleccion").addEventListener("change", () => { ajustes.escribir("ordenColeccion", $("#orden-coleccion").value); renderColeccion(); });
  $("#btn-personalizado").addEventListener("click", () => abrirPersonalizado());
  $("#form-personalizado").addEventListener("submit", guardarPersonalizado);

  ["#grilla-catalogo", "#grilla-coleccion", "#grilla-deseos"].forEach((s) => $(s).addEventListener("click", enGrilla));

  $("#estadisticas").addEventListener("click", (e) => {
    if (e.target.closest("#btn-todos-anios")) {
      estado.todosLosAnios = !estado.todosLosAnios;
      renderEstadisticas();
      return;
    }
    const fila = e.target.closest(".progreso");
    if (fila) irAlCatalogo({ linea: fila.dataset.linea, anio: fila.dataset.anio, especial: fila.dataset.especial });
  });

  // Diálogos: cerrar con los botones [data-cerrar] o tocando fuera
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-cerrar]")) d.close();
    });
  });

  // Fotos de la wiki que no cargan -> marcador "Sin foto"
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName === "IMG" && img.closest(".foto, .diapo, .visor-diapo")) {
      img.replaceWith(Object.assign(document.createElement("div"), {
        className: "sin-foto", innerHTML: `${ICONOS.auto}Sin foto`,
      }));
    }
  }, true);

  $("#bienvenida").addEventListener("close", () => ajustes.escribir("bienvenidaVista", true));
  $("#btn-guia").addEventListener("click", mostrarBienvenida);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-instalar]")) instalar(); });

  $("#btn-exportar").addEventListener("click", exportarRespaldo);
  $("#btn-csv").addEventListener("click", exportarCSV);
  $("#archivo-importar").addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    e.target.value = "";
    if (archivo) await importarRespaldo(archivo);
  });
  $("#moneda").addEventListener("change", (e) => {
    ajustes.escribir("moneda", e.target.value);
    actualizarConteos();
    avisar("Moneda actualizada");
  });
  $("#btn-borrar-todo").addEventListener("click", async () => {
    const n = estado.coleccion.size;
    if (!n) { avisar("Tu colección ya está vacía"); return; }
    if (!confirm(`Se borrarán ${n} autos y sus fotos de este navegador. Esto no se puede deshacer. ¿Continuar?`)) return;
    await db.borrarTodo();
    estado.coleccion.clear();
    urlsPropias.forEach((u) => u && URL.revokeObjectURL(u));
    urlsPropias.clear();
    filtrarCatalogo();
    actualizarConteos();
    avisar("Colección borrada");
  });
}

// ------------------------------------------------------------------ versión nueva e instalación

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    const habiaControl = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register("sw.js");
    const ofrecer = (sw) => avisar("Hay una versión nueva de la app", {
      fijo: true,
      accion: { texto: "Actualizar", fn: () => sw.postMessage({ tipo: "actualizar" }) },
    });
    if (reg.waiting && habiaControl) ofrecer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener("statechange", () => {
        if (nuevo.state === "installed" && navigator.serviceWorker.controller) ofrecer(nuevo);
      });
    });
    let recargando = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (habiaControl && !recargando) { recargando = true; location.reload(); }
    });
    // Las apps instaladas en el iPhone casi nunca se recargan: revisar al volver a abrirlas
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  } catch { /* sin service worker: la app funciona igual, pero solo con internet */ }
}

const enModoApp = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let promptInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptInstalar = e;
  actualizarConsejoInstalar();
});
window.addEventListener("appinstalled", () => { promptInstalar = null; actualizarConsejoInstalar(); });

function actualizarConsejoInstalar() {
  let html = "";
  if (!enModoApp()) {
    if (promptInstalar) {
      html = `<button type="button" class="boton secundario" data-instalar>Instalar en este dispositivo</button>`;
    } else if (esIOS()) {
      html = `<p><strong>Instálala en tu iPhone:</strong> toca <b>Compartir</b>
        <svg class="icono-compartir" viewBox="0 0 24 24" aria-label="(el cuadrado con la flecha)"><path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9"/></svg>
        y luego <b>Agregar a pantalla de inicio</b>.</p>`;
    }
  }
  for (const el of $$(".consejo-instalar")) {
    el.innerHTML = html;
    el.hidden = !html;
  }
}

async function instalar() {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice.catch(() => {});
  promptInstalar = null;
  actualizarConsejoInstalar();
}

function mostrarBienvenida() {
  actualizarConsejoInstalar();
  $("#bienvenida").showModal();
}

// ------------------------------------------------------------------ inicio

function esqueletos(n) {
  return Array.from({ length: n }, () => `<div class="tarjeta esqueleto" aria-hidden="true">
    <div class="foto"></div><div class="linea" style="width:70%"></div><div class="linea" style="width:45%"></div></div>`).join("");
}

async function iniciar() {
  registrarServiceWorker();
  $("#grilla-catalogo").innerHTML = esqueletos(8);
  grillaCatalogo = new Grilla($("#grilla-catalogo"), $("#centinela-catalogo"));
  grillaColeccion = new Grilla($("#grilla-coleccion"), $("#centinela-coleccion"), { fotosPropias: true });
  grillaDeseos = new Grilla($("#grilla-deseos"), $("#centinela-deseos"));
  conectarEventos();

  $("#moneda").value = ajustes.leer("moneda", monedaPorDefecto());
  $("#orden-coleccion").value = ajustes.leer("ordenColeccion", "reciente");

  let catalogo;
  try {
    const [resp, registros] = await Promise.all([fetch("datos/catalogo.json"), db.todos()]);
    if (!resp.ok) throw new Error(resp.status);
    catalogo = await resp.json();
    for (const r of registros) estado.coleccion.set(r.id, r);
  } catch (err) {
    console.error(err);
    $("#conteo-catalogo").innerHTML = location.protocol === "file:"
      ? "No se pudo cargar el catálogo. Abre la app con <b>iniciar.bat</b> (no haciendo doble clic en index.html)."
      : "No se pudo cargar el catálogo. Revisa tu conexión y vuelve a abrir la app.";
    return;
  }
  prepararCatalogo(catalogo);

  const f = ajustes.leer("filtros", null);
  if (!f) {
    // Primera vez: mostrar el año actual (el próximo aún casi no tiene fotos)
    const actual = String(new Date().getFullYear());
    if ([...$("#f-anio").options].some((o) => o.value === actual)) $("#f-anio").value = actual;
  } else {
    for (const [sel, v] of [["#f-anio", f.anio], ["#f-linea", f.linea], ["#f-estado", f.est], ["#f-orden", f.orden]]) {
      if (v && [...$(sel).options].some((o) => o.value === v)) $(sel).value = v;
    }
    marcarEspecial(f.especial);
  }
  actualizarConteos();
  mostrarVista(ajustes.leer("vista", "catalogo"));
  filtrarCatalogo();
  actualizarConsejoInstalar();
  if (!ajustes.leer("bienvenidaVista", false)) mostrarBienvenida();
}

iniciar();
