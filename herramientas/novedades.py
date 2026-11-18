"""
Genera app/datos/novedades.json con los últimos cambios (los mensajes de los commits), para la
sección "Versión y novedades" de Ajustes. Lo corre la publicación en GitHub; en el PC no hace
falta (el archivo no se sube al repositorio).

Uso:
    python herramientas/novedades.py
"""
import json
import subprocess
from pathlib import Path

SALIDA = Path(__file__).resolve().parent.parent / "app" / "datos" / "novedades.json"
MAXIMO = 15
CATALOGO = "Actualizar catálogo desde la Hot Wheels Wiki"


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
    salida = subprocess.run(
        ["git", "log", f"-{MAXIMO}", "--format=%h%x1f%cI%x1f%s%x1f%b%x1e"],
        capture_output=True, text=True, check=True,
    ).stdout
    novedades = []
    for registro in salida.split("\x1e"):
        if not registro.strip():
            continue
        commit, fecha, titulo, cuerpo = registro.strip("\n").split("\x1f")
        if titulo == CATALOGO:
            novedades.append({"commit": commit, "fecha": fecha,
                              "titulo": "Catálogo actualizado con los autos nuevos de la wiki", "detalle": []})
        else:
            novedades.append({"commit": commit, "fecha": fecha, "titulo": titulo, "detalle": detalle(cuerpo)})
    SALIDA.write_text(json.dumps(novedades, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"ok {SALIDA.name}: {len(novedades)} cambios")


if __name__ == "__main__":
    main()
