"""
Genera los íconos de la app y las pantallas de arranque del iPhone (sin dependencias).

Uso:
    python herramientas/generar_imagenes.py            # íconos y pantallas de arranque
    python herramientas/generar_imagenes.py --arranque # solo pantallas de arranque

Las pantallas de arranque se enlazan en app/index.html (etiquetas apple-touch-startup-image);
este script imprime esas etiquetas al final.
"""
import math
import struct
import sys
import zlib
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
ICONOS = APP / "iconos"
ARRANQUE = ICONOS / "arranque"
FONDO_ARRANQUE = (22, 22, 26)  # mismo color que la barra de la app

# iPhones en vertical: (ancho CSS, alto CSS, densidad de píxeles)
IPHONES = [
    (375, 667, 2),  # SE 2.ª/3.ª gen, 8
    (414, 736, 3),  # 8 Plus
    (375, 812, 3),  # X, XS, 11 Pro, 12 mini, 13 mini
    (414, 896, 2),  # XR, 11
    (414, 896, 3),  # XS Max, 11 Pro Max
    (390, 844, 3),  # 12, 13, 14, 16e
    (428, 926, 3),  # 12/13 Pro Max, 14 Plus
    (393, 852, 3),  # 14 Pro, 15, 15 Pro, 16
    (430, 932, 3),  # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    (402, 874, 3),  # 16 Pro, 17, 17 Pro
    (440, 956, 3),  # 16 Pro Max, 17 Pro Max
    (420, 912, 3),  # iPhone Air
]


def png(ruta, ancho, alto, filas, canales=4):
    """Escribe un PNG. `filas` es un iterable de bytes (una fila de píxeles cada uno)."""
    datos = b"".join(b"\x00" + f for f in filas)
    def bloque(tipo, contenido):
        c = struct.pack(">I", len(contenido)) + tipo + contenido
        return c + struct.pack(">I", zlib.crc32(tipo + contenido) & 0xFFFFFFFF)
    tipo_color = 6 if canales == 4 else 2
    ruta.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + bloque(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, tipo_color, 0, 0, 0))
                     + bloque(b"IDAT", zlib.compress(datos, 9)) + bloque(b"IEND", b""))


def mezclar(base, color, a):
    return tuple(base[i] * (1 - a) + color[i] * a for i in range(3)) + (max(base[3], a),)


def dist_segmento(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dentro_redondeado(x, y, r):
    cx = min(max(x, r), 1 - r)
    cy = min(max(y, r), 1 - r)
    return math.hypot(x - cx, y - cy) <= r


def muestra(x, y, maskable):
    """Color RGBA del ícono en el punto (x, y) de 0 a 1."""
    if maskable or dentro_redondeado(x, y, 0.22):
        t = y
        c = (255 * (1 - t) + 227 * t, 122 * (1 - t) + 38 * t, 26 * (1 - t) + 27 * t, 1.0)
    else:
        return (0, 0, 0, 0.0)
    escala = 0.78 if maskable else 1.0  # zona segura para íconos "maskable"
    x = 0.5 + (x - 0.5) / escala
    y = 0.5 + (y - 0.5) / escala
    for yy, x0, x1 in ((0.40, 0.10, 0.30), (0.52, 0.04, 0.26), (0.64, 0.12, 0.30)):
        if dist_segmento(x, y, x0, yy, x1, yy) <= 0.028:
            c = mezclar(c, (255, 244, 230), 0.95)
    cx, cy = 0.58, 0.52
    d = math.hypot(x - cx, y - cy)
    if d <= 0.31:
        c = mezclar(c, (28, 28, 34), 1)
    if d <= 0.205:
        c = mezclar(c, (214, 219, 226), 1)
    if d <= 0.175:
        c = mezclar(c, (120, 128, 140), 1)
        for k in range(5):
            a = -math.pi / 2 + k * 2 * math.pi / 5
            if dist_segmento(x, y, cx, cy, cx + 0.17 * math.cos(a), cy + 0.17 * math.sin(a)) <= 0.032:
                c = mezclar(c, (236, 239, 243), 1)
    if d <= 0.06:
        c = mezclar(c, (28, 28, 34), 1)
    if d <= 0.025:
        c = mezclar(c, (255, 106, 0), 1)
    return c


def pixeles_icono(lado, maskable=False, ss=2):
    """Devuelve una lista de filas; cada fila es una lista de (r, g, b, a) con a de 0 a 1."""
    filas = []
    n = ss * ss
    for j in range(lado):
        fila = []
        for i in range(lado):
            r = g = b = a = 0.0
            for sj in range(ss):
                for si in range(ss):
                    cr, cg, cb, ca = muestra((i + (si + 0.5) / ss) / lado, (j + (sj + 0.5) / ss) / lado, maskable)
                    r += cr * ca; g += cg * ca; b += cb * ca; a += ca
            fila.append((r / a, g / a, b / a, a / n) if a else (0, 0, 0, 0))
        filas.append(fila)
    return filas


def generar_icono(nombre, lado, maskable=False, ss=3):
    px = pixeles_icono(lado, maskable, ss)
    filas = [bytes(v for (r, g, b, a) in fila for v in (round(r), round(g), round(b), round(255 * a))) for fila in px]
    png(ICONOS / nombre, lado, lado, filas)
    print("ok", nombre)


def generar_arranque(ancho, alto):
    lado = round(ancho * 0.28)
    icono = pixeles_icono(lado, ss=2)
    x0, y0 = (ancho - lado) // 2, round(alto * 0.42 - lado / 2)
    fondo = bytes(FONDO_ARRANQUE)
    fila_fondo = fondo * ancho
    filas = []
    for j in range(alto):
        if y0 <= j < y0 + lado:
            centro = bytearray()
            for (r, g, b, a) in icono[j - y0]:
                centro += bytes(round(FONDO_ARRANQUE[k] * (1 - a) + v * a) for k, v in enumerate((r, g, b)))
            filas.append(fondo * x0 + bytes(centro) + fondo * (ancho - x0 - lado))
        else:
            filas.append(fila_fondo)
    nombre = f"arranque-{ancho}x{alto}.png"
    png(ARRANQUE / nombre, ancho, alto, filas, canales=3)
    print("ok", nombre)
    return nombre


def main():
    if "--arranque" not in sys.argv:
        generar_icono("icono-192.png", 192)
        generar_icono("icono-512.png", 512, ss=2)
        generar_icono("icono-maskable-512.png", 512, maskable=True, ss=2)
        generar_icono("apple-touch-icon.png", 180, maskable=True)
    ARRANQUE.mkdir(parents=True, exist_ok=True)
    etiquetas = []
    for w, h, dpr in IPHONES:
        nombre = generar_arranque(w * dpr, h * dpr)
        etiquetas.append(
            f'  <link rel="apple-touch-startup-image" href="iconos/arranque/{nombre}" media="screen and '
            f'(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {dpr}) '
            f'and (orientation: portrait)">')
    print("\nEtiquetas para app/index.html:\n" + "\n".join(etiquetas))


if __name__ == "__main__":
    main()
