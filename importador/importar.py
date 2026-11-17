"""
Importador del catálogo de Hot Wheels desde la Hot Wheels Wiki (Fandom).

Descarga las listas por año (mainline y algunas líneas premium), lee las tablas
y genera app/datos/catalogo.json para la app.

Uso:
    python importador/importar.py              # usa la caché si existe
    python importador/importar.py --actualizar # vuelve a descargar todo de la wiki
    python importador/importar.py --desde 2020 --hasta 2027

Solo usa la biblioteca estándar de Python (3.9+).
El texto de la wiki tiene licencia CC BY-SA: https://hotwheels.fandom.com/
"""

import argparse
import datetime as dt
import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://hotwheels.fandom.com/api.php"
WIKI = "https://hotwheels.fandom.com/wiki/"
USER_AGENT = "HWColeccionImporter/1.0 (catalogo personal; uso no comercial)"

RAIZ = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
SALIDA = RAIZ / "app" / "datos" / "catalogo.json"

# (patrón de título, nombre de la línea, agrupar filas con el mismo Toy #)
FUENTES = [
    ("List of {y} Hot Wheels", "Mainline", False),
    ("{y} Car Culture", "Car Culture", False),
    ("{y} Car Culture: Team Transport", "Team Transport", True),
    ("{y} Hot Wheels Boulevard", "Boulevard", False),
    ("{y} Pop Culture", "Pop Culture", False),
    ("{y} 5-Packs", "5-Packs", False),
    ("{y} Multi-Pack Exclusives", "Multi-Packs", False),
]

# Páginas que no agregan autos, sino que marcan autos del Mainline del mismo año
# (se buscan por Toy #). "th" se convierte en "sth" en las secciones de Super Treasure Hunts.
MARCADORES = [
    ("{y} Treasure Hunts Series", "th"),
    ("{y} New Models", "nuevo"),
    ("{y} First Editions", "nuevo"),
]

# Plantillas de la wiki que indican exclusivos de tienda u otras marcas
PLANTILLAS_ETIQUETA = {"TG": "tg", "KR": "kr", "DG": "dg", "DT": "dt", "NIM": "nim"}
RE_PLANTILLA_ETIQUETA = re.compile(r"\{\{\s*(" + "|".join(PLANTILLAS_ETIQUETA) + r")\s*(?:\||\}\})")
RE_NUEVO = re.compile(r"New for \d{4}|New Models?\b|First Editions?\b", re.I)


# --------------------------------------------------------------------------- #
# Descarga
# --------------------------------------------------------------------------- #

def api_get(params):
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # red inestable: reintenta con espera creciente
            if intento == 3:
                raise
            espera = 2 ** intento * 2
            print(f"  ! error ({e}); reintento en {espera}s", file=sys.stderr)
            time.sleep(espera)


def archivo_cache(titulo):
    seguro = re.sub(r"[^A-Za-z0-9._-]+", "_", titulo)
    return CACHE / f"{seguro}.json"


def descargar_paginas(titulos, actualizar):
    """Devuelve {titulo: wikitext} para las páginas que existen."""
    CACHE.mkdir(parents=True, exist_ok=True)
    resultado, pendientes = {}, []
    for t in titulos:
        f = archivo_cache(t)
        if f.exists() and not actualizar:
            datos = json.loads(f.read_text(encoding="utf-8"))
            if datos.get("wikitext") is not None:
                resultado[t] = datos["wikitext"]
        else:
            pendientes.append(t)

    LOTE = 10
    for i in range(0, len(pendientes), LOTE):
        lote = pendientes[i:i + LOTE]
        print(f"  descargando {i + 1}-{i + len(lote)} de {len(pendientes)}...")
        d = api_get({
            "action": "query",
            "prop": "revisions",
            "rvprop": "content|timestamp",
            "rvslots": "main",
            "titles": "|".join(lote),
            "redirects": "1",
        })
        q = d.get("query", {})
        # El título pedido puede venir normalizado o redirigido
        mapa = {t: t for t in lote}
        for n in q.get("normalized", []):
            mapa[n["to"]] = n["from"]
        for r in q.get("redirects", []):
            mapa[r["to"]] = mapa.get(r["from"], r["from"])
        vistos = set()
        for p in q.get("pages", []):
            original = mapa.get(p["title"], p["title"])
            vistos.add(original)
            texto = None
            if not p.get("missing") and p.get("revisions"):
                texto = p["revisions"][0]["slots"]["main"]["content"]
                resultado[original] = texto
            archivo_cache(original).write_text(
                json.dumps({"titulo": original, "wikitext": texto}, ensure_ascii=False),
                encoding="utf-8")
        for t in lote:
            if t not in vistos:
                archivo_cache(t).write_text(
                    json.dumps({"titulo": t, "wikitext": None}), encoding="utf-8")
        time.sleep(1.0)  # ser amables con la wiki
    return resultado


# --------------------------------------------------------------------------- #
# Lectura del wikitext
# --------------------------------------------------------------------------- #

def dividir_fuera_de_enlaces(texto, sep):
    """Divide `texto` por `sep` ignorando lo que esté dentro de [[ ]] o {{ }}."""
    partes, actual, prof, i = [], [], 0, 0
    while i < len(texto):
        dos = texto[i:i + 2]
        if dos in ("[[", "{{"):
            prof += 1
            actual.append(dos)
            i += 2
            continue
        if dos in ("]]", "}}"):
            prof = max(0, prof - 1)
            actual.append(dos)
            i += 2
            continue
        if prof == 0 and texto.startswith(sep, i):
            partes.append("".join(actual))
            actual = []
            i += len(sep)
            continue
        actual.append(texto[i])
        i += 1
    partes.append("".join(actual))
    return partes


def separar_atributos(celda):
    """'bgcolor="x" | contenido' -> ('bgcolor="x"', 'contenido')."""
    partes = dividir_fuera_de_enlaces(celda, "|")
    if len(partes) > 1:
        attrs = partes[0]
        if "=" in attrs and "[[" not in attrs and "{{" not in attrs:
            return attrs, "|".join(partes[1:])
    return "", celda


def numero_attr(attrs, nombre):
    m = re.search(nombre + r'\s*=\s*"?(\d+)', attrs, re.I)
    return max(1, int(m.group(1))) if m else 1


RE_ARCHIVO = re.compile(r"\[\[\s*(?:File|Image|Archivo)\s*:\s*([^|\]]+)", re.I)


def archivos(texto):
    return [a.strip() for a in RE_ARCHIVO.findall(texto)]


def quitar_plantillas(s):
    anterior = None
    while anterior != s:
        anterior = s
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    return s


def quitar_archivos(s):
    # [[File:...]] puede tener enlaces dentro del pie de foto; se quita balanceando corchetes
    salida, i = [], 0
    while i < len(s):
        m = re.match(r"\[\[\s*(?:File|Image|Archivo)\s*:", s[i:], re.I)
        if m:
            prof, j = 0, i
            while j < len(s):
                if s.startswith("[[", j):
                    prof += 1
                    j += 2
                elif s.startswith("]]", j):
                    prof -= 1
                    j += 2
                    if prof == 0:
                        break
                else:
                    j += 1
            i = j
            continue
        salida.append(s[i])
        i += 1
    return "".join(salida)


def limpiar(s):
    """Convierte wikitext de una celda en texto plano (líneas separadas por \\n)."""
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*/>", "", s, flags=re.I)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.I | re.S)
    s = quitar_archivos(s)
    s = quitar_plantillas(s)
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\2", s)
    s = re.sub(r"\[\[:?(?:Category:)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", s)
    s = re.sub(r"\[https?://[^\]]+\]", "", s)
    s = re.sub(r"</?[a-zA-Z][^>]*>", "", s)
    s = s.replace("'''", "").replace("''", "")
    s = html.unescape(s).replace("​", "").replace("\xa0", " ")
    lineas = [re.sub(r"\s+", " ", l).strip(" /") for l in s.split("\n")]
    return "\n".join(l for l in lineas if l)


def primer_enlace(s):
    for m in re.finditer(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", s):
        destino = m.group(1).strip()
        if not re.match(r"(?:File|Image|Archivo|Category)\s*:", destino, re.I):
            return destino.lstrip(":")
    return None


RE_PLANTILLA_FILA = re.compile(
    r"\{\{\s*List[0-9A-Za-z]*\s*\|((?:[^{}]|\{(?!\{)|\}(?!\}))*)\}\}")


def expandir_plantillas_de_fila(wikitext):
    """{{List0000White|toy|col|nombre|serie|num|}} -> una fila de tabla normal.

    Así arma la wiki las tablas de 1997-1998: la plantilla abre la fila y la foto
    viene después como una celda suelta."""
    def fila(m):
        params = dividir_fuera_de_enlaces(m.group(1), "|")[:5]
        return "\n|-\n" + "\n".join("|" + p.strip() for p in params) + "\n"
    return RE_PLANTILLA_FILA.sub(fila, wikitext)


def leer_galerias(wikitext):
    """Para los años sin tablas (1970-1973): <gallery> con 'Archivo|[[Nombre]]'."""
    items, seccion = [], ""
    en_galeria = False
    for cruda in wikitext.split("\n"):
        linea = cruda.strip()
        m = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", linea)
        if m and not en_galeria:
            seccion = limpiar(m.group(2)).replace("\n", " ")
            continue
        if linea.lower().startswith("<gallery"):
            en_galeria = True
            continue
        if linea.lower().startswith("</gallery"):
            en_galeria = False
            continue
        if not en_galeria or not linea:
            continue
        partes = dividir_fuera_de_enlaces(linea, "|")
        archivo = re.sub(r"^(?:File|Image|Archivo)\s*:", "", partes[0].strip(), flags=re.I)
        textos = [p for p in partes[1:] if not re.match(r"\s*(link|alt|caption)\s*=", p, re.I)]
        texto = "|".join(textos)
        nombre = limpiar(texto).replace("\n", " ").strip()
        if nombre:
            items.append({"nombre": nombre, "wt": texto, "archivo": archivo, "seccion": seccion})
    return items


def leer_tablas(wikitext):
    """Devuelve una lista de tablas: {'seccion': str, 'filas': [[(attrs, wikitext), ...]]}."""
    wikitext = expandir_plantillas_de_fila(wikitext)
    tablas, seccion, subseccion = [], "", ""
    tabla, prof = None, 0
    fila = None

    def cerrar_fila():
        nonlocal fila
        if tabla is not None and fila:
            tabla["filas"].append(fila)
        fila = []

    for cruda in wikitext.split("\n"):
        linea = cruda.strip()
        if tabla is None:
            m = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", linea)
            if m:
                nivel, titulo = len(m.group(1)), limpiar(m.group(2)).replace("\n", " ")
                if nivel == 2:
                    seccion, subseccion = titulo, ""
                else:
                    subseccion = titulo
                continue
            if linea.startswith("{|"):
                tabla = {"seccion": subseccion or seccion, "filas": []}
                prof, fila = 1, []
            continue

        # dentro de una tabla
        if linea.startswith("{|"):
            prof += 1
            continue
        if linea.startswith("|}"):
            prof -= 1
            if prof == 0:
                cerrar_fila()
                tablas.append(tabla)
                tabla = None
            continue
        if prof > 1:
            continue  # tablas anidadas: se ignoran
        if linea.startswith("|+"):
            continue
        if linea.startswith("|-"):
            cerrar_fila()
            continue
        if linea.startswith("!"):
            for c in dividir_fuera_de_enlaces(linea[1:].replace("||", "!!"), "!!"):
                fila.append(("!",) + separar_atributos(c))
            continue
        if linea.startswith("|"):
            for c in dividir_fuera_de_enlaces(linea[1:], "||"):
                fila.append(("|",) + separar_atributos(c))
            continue
        if fila:  # continuación de la celda anterior en otra línea
            tipo, attrs, cont = fila[-1]
            fila[-1] = (tipo, attrs, cont + "\n" + cruda)
    return tablas


def expandir_filas(filas):
    """Aplica rowspan/colspan y devuelve (encabezado, filas_de_datos)."""
    encabezado, datos, arrastre = None, [], {}
    for fila in filas:
        if encabezado is None and fila:
            textos = []
            for _, attrs, cont in fila:
                textos += [limpiar(cont).replace("\n", " ")] * numero_attr(attrs, "colspan")
            es_titulo = all(t == "!" for t, _, _ in fila)
            # Algunas tablas usan celdas normales en negrita como encabezado
            if not es_titulo and not any("[[" in c for _, _, c in fila):
                es_titulo = "nombre" in [campo_de_encabezado(t) for t in textos]
            if es_titulo:
                encabezado = textos
                continue
        if encabezado is None:
            continue
        salida, col = [], 0
        celdas = list(fila)
        while celdas or any(k >= col for k in arrastre):
            if not celdas and col not in arrastre:
                salida.append("")  # hueco antes de una columna arrastrada
                col += 1
                continue
            if col in arrastre:
                cont, restantes = arrastre[col]
                salida.append(cont)
                if restantes <= 1:
                    del arrastre[col]
                else:
                    arrastre[col] = (cont, restantes - 1)
                col += 1
                continue
            _, attrs, cont = celdas.pop(0)
            rs, cs = numero_attr(attrs, "rowspan"), numero_attr(attrs, "colspan")
            for _ in range(cs):
                if rs > 1:
                    arrastre[col] = (cont, rs - 1)
                salida.append(cont)
                col += 1
        datos.append(salida)
    return encabezado, datos


def campo_de_encabezado(h):
    h = re.sub(r"[^a-z0-9#/ ]", "", h.lower()).strip()
    h = re.sub(r"\s+", " ", h)
    if h.startswith("toy") or h.startswith("package") or h in ("item #", "item"):
        return "toy"
    if h.startswith("col") and ("#" in h or "num" in h or h in ("col", "col no")):
        return "col"
    if h.startswith("collector"):
        return "col"
    if h.startswith("series #") or h in ("series no", "series number", "#", "no"):
        return "num"
    if h.startswith("series") or h.startswith("segment"):
        return "serie"
    if h in ("model name", "casting", "casting name", "name", "model", "vehicle", "car",
             "car name", "vehicle name", "model names"):
        return "nombre"
    if h.startswith("photo carded") or h.startswith("carded"):
        return "foto2"
    if h.startswith("photo") or h.startswith("image") or h.startswith("picture"):
        return "foto"
    if h in ("color", "body color", "colour", "body colour", "paint"):
        return "color"
    if h.startswith("note"):
        return "notas"
    if h.startswith("vehicles") or h.startswith("cars included") or h.startswith("contents"):
        return "vehiculos"
    if h.startswith("tampo"):
        return "tampo"
    if h.startswith("wheel"):
        return "ruedas"
    return None


def ruta_imagen(nombre):
    """Ruta en el CDN de Fandom: <h0>/<h01>/<archivo> (md5 del nombre)."""
    if not nombre:
        return None
    n = nombre.strip().replace(" ", "_")
    n = n[0].upper() + n[1:]
    if re.match(r"image_not_available", n, re.I) or n.lower().startswith("noimage"):
        return None
    h = hashlib.md5(n.encode("utf-8")).hexdigest()
    return f"{h[0]}/{h[:2]}/{urllib.parse.quote(n)}"


def url_wiki(destino):
    if not destino:
        return None
    return urllib.parse.quote(destino.replace(" ", "_"), safe="()'!,:/&")


def items_de_pagina(titulo, wikitext, anio, linea, agrupar):
    items = []
    for tabla in leer_tablas(wikitext):
        encabezado, filas = expandir_filas(tabla["filas"])
        if not encabezado:
            continue
        campos = [campo_de_encabezado(h) for h in encabezado]
        if "nombre" not in campos:
            continue
        previo = None
        for fila in filas:
            reg = {}
            for i, valor in enumerate(fila):
                if i >= len(campos) or not campos[i]:
                    continue
                c = campos[i]
                if c in reg:  # columna repetida: conservar la primera
                    continue
                reg[c] = valor
            nombre_wt = reg.get("nombre", "")
            nombre = limpiar(nombre_wt).replace("\n", " ").strip()
            if not nombre or nombre.lower() in ("model name", "casting name", "casting", "name"):
                continue
            serie_lineas = limpiar(reg.get("serie", "")).split("\n")
            serie = serie_lineas[0] if serie_lineas and serie_lineas[0] else ""
            extras = [l for l in serie_lineas[1:] if l]
            notas = [l for l in limpiar(reg.get("notas", "")).split("\n") if l]
            vehiculos = limpiar(reg.get("vehiculos", "")).replace("\n", " ")
            fotos = archivos(reg.get("foto", "")) or archivos(nombre_wt)
            fotos2 = archivos(reg.get("foto2", ""))
            toy = limpiar(reg.get("toy", "")).replace("\n", " ").strip()
            etiquetas = {PLANTILLAS_ETIQUETA[m] for m in RE_PLANTILLA_ETIQUETA.findall(" ".join(fila))}
            if linea == "Mainline" and RE_NUEVO.search(" ".join([serie] + extras)):
                etiquetas.add("nuevo")
            item = {
                "y": anio,
                "l": linea,
                "n": nombre,
                "t": toy,
                "c": limpiar(reg.get("col", "")).replace("\n", " ").strip(),
                "s": serie,
                "sn": limpiar(reg.get("num", "")).replace("\n", " ").strip(),
                "sec": tabla["seccion"],
                "co": limpiar(reg.get("color", "")).replace("\n", ", "),
                "no": " · ".join(extras + notas + ([f"Incluye: {vehiculos}"] if vehiculos else [])),
                "p": ruta_imagen(fotos[0]) if fotos else None,
                "p2": ruta_imagen(fotos2[0]) if fotos2 else None,
                "w": url_wiki(primer_enlace(nombre_wt)),
                "e": etiquetas,
                "src": titulo,
            }
            if agrupar and previo and toy and previo["t"] == toy and previo["sec"] == item["sec"]:
                previo["n"] += " + " + nombre
                if item["co"]:
                    previo["co"] = ", ".join(x for x in (previo["co"], item["co"]) if x)
                previo["p"] = previo["p"] or item["p"]
                continue
            items.append(item)
            previo = item

    if not items:  # páginas antiguas sin tablas: usar las galerías de fotos
        for g in leer_galerias(wikitext):
            items.append({
                "y": anio, "l": linea, "n": g["nombre"], "t": "", "c": "",
                "s": g["seccion"], "sn": "", "sec": g["seccion"], "co": "", "no": "",
                "p": ruta_imagen(g["archivo"]), "p2": None,
                "w": url_wiki(primer_enlace(g["wt"])), "e": set(), "src": titulo,
            })
    return items


def aplicar_marcadores(items, titulo, wikitext, anio, etiqueta):
    """Marca autos del Mainline de `anio` según una página de Treasure Hunts / New Models.

    Devuelve (marcados, sin_coincidencia)."""
    del_anio = [i for i in items if i["y"] == anio and i["l"] == "Mainline"]
    por_toy, por_casting = {}, {}
    for it in del_anio:
        if it["t"]:
            por_toy.setdefault(it["t"], []).append(it)
        if it["w"]:
            por_casting.setdefault(it["w"], []).append(it)

    marcados, sin = 0, 0
    for tabla in leer_tablas(wikitext):
        encabezado, filas = expandir_filas(tabla["filas"])
        if not encabezado:
            continue
        campos = [campo_de_encabezado(h) for h in encabezado]
        if "nombre" not in campos:
            continue
        seccion = tabla["seccion"]
        tag = etiqueta
        if etiqueta == "th" and re.search(r"super|\$", seccion, re.I):
            tag = "sth"
        for fila in filas:
            reg = {campos[i]: v for i, v in enumerate(fila) if i < len(campos) and campos[i]}
            toy = limpiar(reg.get("toy", "")).replace("\n", " ").strip()
            candidatos = por_toy.get(toy, []) if toy else []
            if not candidatos and etiqueta == "nuevo":
                # Modelo nuevo: todas las versiones del molde de ese año
                candidatos = por_casting.get(url_wiki(primer_enlace(reg.get("nombre", ""))), [])
            if not candidatos:
                sin += 1
                continue
            for it in candidatos:
                if tag == "sth":
                    it["e"].discard("th")
                elif tag == "th" and "sth" in it["e"]:
                    continue
                it["e"].add(tag)
            marcados += 1
    return marcados, sin


def asignar_ids(items):
    vistos = {}
    for it in items:
        base = "|".join(str(it.get(k, "")) for k in ("src", "t", "c", "n", "s", "sn", "sec", "co"))
        h = hashlib.sha1(base.encode("utf-8")).hexdigest()[:10]
        vistos[h] = vistos.get(h, 0) + 1
        it["id"] = h if vistos[h] == 1 else f"{h}-{vistos[h]}"


def compactar(it):
    # "src" solo sirve para calcular el id; no hace falta en la app
    salida = {k: v for k, v in it.items() if v not in (None, "", [], set()) and k != "src"}
    if "e" in salida:
        salida["e"] = sorted(salida["e"])
    return salida


def main():
    hoy = dt.date.today()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--desde", type=int, default=1968)
    ap.add_argument("--hasta", type=int, default=hoy.year + 1)
    ap.add_argument("--actualizar", action="store_true", help="ignorar la caché y descargar de nuevo")
    args = ap.parse_args()

    pedidos = []  # (titulo, anio, linea, agrupar)
    marcadores = []  # (titulo, anio, etiqueta)
    for anio in range(args.desde, args.hasta + 1):
        for patron, linea, agrupar in FUENTES:
            pedidos.append((patron.format(y=anio), anio, linea, agrupar))
        for patron, etiqueta in MARCADORES:
            marcadores.append((patron.format(y=anio), anio, etiqueta))

    titulos = [p[0] for p in pedidos] + [m[0] for m in marcadores]
    print(f"Buscando {len(titulos)} páginas posibles en la wiki ({args.desde}-{args.hasta})...")
    textos = descargar_paginas(titulos, args.actualizar)
    print(f"Páginas encontradas: {len(textos)}")

    items, resumen = [], {}
    for titulo, anio, linea, agrupar in pedidos:
        if titulo not in textos:
            continue
        nuevos = items_de_pagina(titulo, textos[titulo], anio, linea, agrupar)
        items += nuevos
        resumen.setdefault(linea, 0)
        resumen[linea] += len(nuevos)
        if not nuevos:
            print(f"  (sin autos reconocibles en: {titulo})")

    marcas = {"th": [0, 0], "nuevo": [0, 0]}
    for titulo, anio, etiqueta in marcadores:
        if titulo in textos:
            ok, sin = aplicar_marcadores(items, titulo, textos[titulo], anio, etiqueta)
            marcas[etiqueta][0] += ok
            marcas[etiqueta][1] += sin

    asignar_ids(items)
    compactos = [compactar(i) for i in items]

    # Si nada cambió, no tocar el archivo (así GitHub no publica una versión nueva sin motivo)
    if SALIDA.exists():
        try:
            anterior = json.loads(SALIDA.read_text(encoding="utf-8"))
            if anterior.get("items") == compactos:
                print(f"\nEl catálogo no cambió ({len(items)} autos). No se modificó {SALIDA.name}.")
                return
        except (ValueError, OSError):
            pass

    catalogo = {
        "generado": dt.datetime.now().isoformat(timespec="seconds"),
        "fuente": "Hot Wheels Wiki (hotwheels.fandom.com) - texto bajo licencia CC BY-SA",
        "imagenes": "https://static.wikia.nocookie.net/hotwheels/images/",
        "wiki": WIKI,
        "total": len(items),
        "lineas": resumen,
        "items": compactos,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(catalogo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nListo: {len(items)} autos -> {SALIDA}")
    for linea, n in resumen.items():
        print(f"  {linea:15} {n:6}")
    contar = lambda e: sum(1 for i in compactos if e in i.get("e", []))
    print(f"  Treasure Hunts: {contar('th')}  Super Treasure Hunts: {contar('sth')}  "
          f"modelos nuevos: {contar('nuevo')}  (filas sin coincidencia: TH {marcas['th'][1]}, "
          f"nuevos {marcas['nuevo'][1]})")
    print("  Exclusivos: " + ", ".join(f"{e}={contar(e)}" for e in ("tg", "kr", "dg", "dt", "nim")))


if __name__ == "__main__":
    main()
