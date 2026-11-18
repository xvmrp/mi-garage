"""
Genera app/datos/novedades.json con los últimos cambios (los mensajes de los commits), para la
sección "Versión y novedades" de Ajustes, y escribe en la salida el número de la versión actual
("1.12"), que la publicación pone en la app. Lo corre la publicación en GitHub; en el PC no hace
falta (el archivo no se sube al repositorio).

Número de versión: cada cambio publicado en main suma uno, contando desde el primero, que fue la
1.0. Por eso la publicación baja toda la historia (fetch-depth: 0): con una parte, la cuenta
saldría mal.

Uso:
    python herramientas/novedades.py
"""
import json
import subprocess
import sys
from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / "app" / "datos" / "novedades.json"
MAXIMO = 15
CATALOGO = "Actualizar catálogo desde la Hot Wheels Wiki"
MAYOR = 1  # para pasar a la 2.0 algún día, habría que contar desde ese cambio


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def numero_version(posicion):
    """El primer cambio de la historia es la 1.0, el segundo la 1.1…"""
    return f"{MAYOR}.{posicion - 1}"


def detalle(cuerpo):
    """Viñetas del mensaje: cada '- ' empieza una; las líneas con sangría la continúan.
    Los párrafos sueltos también cuentan; los títulos terminados en ':' y las firmas no."""
    items = []
    en_parrafo = False  # las líneas seguidas de un párrafo van juntas hasta una línea en blanco
    for linea in cuerpo.splitlines():
        texto = linea.strip()
        if not texto:
            en_parrafo = False
            continue
        if texto.lower().startswith("co-authored-by"):
            continue
        if texto.startswith("- "):
            items.append(texto[2:])
            en_parrafo = False
        elif items and (en_parrafo or linea.startswith((" ", "\t"))):
            items[-1] += " " + texto
        elif texto.endswith(":"):
            continue
        else:
            items.append(texto)
            en_parrafo = True
    return items


def main():
    # --first-parent: la línea de main, aunque algún día entre un "merge"
    total = int(git("rev-list", "--count", "--first-parent", "HEAD"))
    salida = git("log", "--first-parent", f"-{MAXIMO}", "--format=%h%x1f%cI%x1f%s%x1f%b%x1e")
    registros = [r for r in salida.split("\x1e") if r.strip()]
    novedades = []
    for i, registro in enumerate(registros):  # del más nuevo al más antiguo
        commit, fecha, titulo, cuerpo = registro.strip("\n").split("\x1f")
        numero = numero_version(total - i)
        if titulo == CATALOGO:
            titulo, items = "Catálogo actualizado con los autos nuevos de la wiki", []
        else:
            items = detalle(cuerpo)
        novedades.append({"numero": numero, "commit": commit, "fecha": fecha, "titulo": titulo, "detalle": items})
    SALIDA.write_text(json.dumps(novedades, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"ok {SALIDA.name}: {len(novedades)} cambios", file=sys.stderr)
    print(numero_version(total))  # lo único en la salida: la publicación lo pone en la app


if __name__ == "__main__":
    main()
