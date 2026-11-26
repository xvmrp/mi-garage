# Mi Garage: registro de mi colección Hot Wheels

App web para registrar los Hot Wheels que vas comprando. Funciona en el PC y en el celular,
se puede instalar como app y funciona sin internet.

**Ábrela aquí: https://xvmrp.github.io/mi-garage/**

- **Catálogo**: 15.282 autos de 1968 a 2027 sacados de la [Hot Wheels Wiki](https://hotwheels.fandom.com/):
  Mainline, Car Culture, Team Transport, Boulevard, Pop Culture, 5-Packs y Multi-Packs.
  Puedes buscar por nombre, Toy # (el código que trae el blíster por detrás), serie o color.
  En la ficha de un auto ves cuántos tienes de su serie (p. ej. "Sweet Rides 2026": 1 de 5) y
  **Ver toda la serie** te la muestra entera, en orden.
- **Valor de mercado**: en la ficha anotas a cuánto se vende cada auto, con botones que abren las
  ventas cerradas de eBay y los avisos de Mercado Libre Chile ya buscados. En Resumen ves cuánto vale
  tu colección, cuánto pagaste por esos mismos autos y cuáles valen más.
- **Cacería**: insignias y filtros para **Treasure Hunts**, **Super Treasure Hunts**, **modelos nuevos**
  del año y **exclusivos de tienda** (Target, Kroger, Dollar General, Dollar Tree).
- **Mi colección**: toca **+** para agregar un auto. En su ficha anotas cantidad, si está en blíster
  o suelto, la fecha, el precio, dónde lo compraste, notas y tu propia foto. Las fotos se deslizan
  con el dedo y se ven en grande al tocarlas.
- **Deseos**: toca ♥ para guardar los que andas buscando.
- **Resumen**: cuántos modelos tienes, cuánto has invertido y tu avance por línea, por año y en la cacería.
- **Ajustes**: respaldo, exportar a Excel, moneda y la guía de bienvenida.
- **Siempre al día**: el catálogo se actualiza solo cada semana, y cuando hay una versión nueva
  la app avisa con un botón **Actualizar**. Las fotos que ya viste quedan guardadas para verlas sin internet.
  Cada publicación tiene su número (1.0 fue la primera, y cada cambio suma uno); en Ajustes ves la
  versión que tienes y qué trajo cada una.

## Usarla en el PC

Haz doble clic en **`iniciar.bat`**. Se abre el navegador en http://localhost:8000.
Deja abierta la ventana negra mientras usas la app.

> No abras `app/index.html` con doble clic directamente: el navegador no deja cargar el catálogo así.

Para instalarla como app en Chrome o Edge, usa el ícono "Instalar" de la barra de direcciones.

## Publicarla en GitHub Pages

El repositorio ya trae una automatización (`.github/workflows/publicar.yml`) que publica la carpeta
`app/` en GitHub Pages cada vez que subes cambios a la rama `main`. La dirección queda así:
`https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`

1. En GitHub crea un repositorio **público** y vacío (sin README). En la cuenta gratis, GitHub Pages solo funciona con repositorios públicos.
2. Súbelo desde esta carpeta:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/NOMBRE-DEL-REPO.git
   git push -u origin main
   ```
3. En GitHub ve a **Settings → Pages** y en "Source" elige **GitHub Actions**.
4. Ve a la pestaña **Actions**, abre "Publicar en GitHub Pages" y, si falló la primera vez
   (porque Pages aún no estaba activado), toca **Re-run all jobs**.

Lo único que se publica es la app y el catálogo; tu colección nunca sale de tu dispositivo.
Para publicar cambios después: `git pull` (trae los catálogos que GitHub actualizó solo),
`git add -A`, `git commit -m "..."` y `git push`.

## Instalarla en el iPhone

1. Abre la dirección de GitHub Pages en **Safari** (tiene que ser Safari).
2. Toca el botón **Compartir** (el cuadrado con la flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Usa siempre la app desde ese ícono: se abre a pantalla completa y funciona sin internet.

Importante en iPhone:

- La app instalada guarda sus datos **aparte de Safari**. Si agregaste autos en Safari antes de instalarla,
  no aparecerán en la app instalada: pásalos con un respaldo.
- Los respaldos se guardan con el menú **Compartir** → "Guardar en Archivos" (o mándatelos por WhatsApp o correo).
  Para restaurar, elige ese archivo desde Ajustes → Restaurar respaldo.
- Si borras la app de la pantalla de inicio, se borra también tu colección. Descarga un respaldo antes.

## Usarla en el celular sin publicarla

Con `iniciar.bat` abierto, entra desde el celular (misma red Wi-Fi) a la dirección que muestra la
ventana, por ejemplo `http://192.168.1.20:8000`. Si Windows pregunta por el firewall, permite el acceso
en redes privadas. En este modo la app no se puede instalar ni funciona sin el PC prendido.

## Dónde se guarda mi colección

En el propio navegador de cada dispositivo (IndexedDB). Eso significa que:

- El PC y el celular tienen **colecciones separadas**. Para pasar la colección de uno a otro:
  Ajustes → **Descargar respaldo** en uno, y **Restaurar respaldo** en el otro.
  Al restaurar se combinan los datos: de cada auto se queda la versión editada más recientemente.
- Si borras los datos de navegación del sitio, se borra la colección. **Descarga un respaldo de vez en cuando.**

## Actualizar el catálogo

**Es automático.** Cada lunes, GitHub ejecuta `.github/workflows/actualizar-catalogo.yml`: descarga
las listas de la wiki y, si hay autos nuevos o cambios, guarda el catálogo y publica la app.
Para forzarlo en cualquier momento: pestaña **Actions** del repositorio → **Actualizar catálogo** →
**Run workflow**.

> GitHub pausa las tareas programadas de un repositorio que pasa 60 días sin actividad. Si eso pasa,
> te llega un correo; actívala de nuevo desde la pestaña Actions.

Si quieres actualizarlo desde tu PC: doble clic en **`actualizar-catalogo.bat`** y luego sube el cambio
con `git pull`, `git add -A`, `git commit -m "Actualizar catálogo"` y `git push`.
Tu colección nunca se toca: solo cambia la lista de autos disponibles.

También puedes ejecutar el importador a mano:

```bash
python importador/importar.py              # usa lo ya descargado (rápido)
python importador/importar.py --actualizar # descarga todo de nuevo
python importador/importar.py --desde 2020 --hasta 2027
```

## Archivos

| Ruta | Qué es |
|---|---|
| `iniciar.bat` | Abre la app en el PC |
| `actualizar-catalogo.bat` | Descarga el catálogo actualizado |
| `app/` | La app (HTML, CSS y JavaScript, sin dependencias) |
| `app/logica.js` | Cálculos y decisiones de la app, separados para poder probarlos |
| `app/datos/catalogo.json` | El catálogo generado |
| `app/fuentes/` | Letra Barlow, guardada dentro de la app para que funcione sin internet (licencia OFL en `OFL.txt`) |
| `importador/importar.py` | Lee la wiki y genera el catálogo (solo Python estándar) |
| `importador/cache/` | Copia de las páginas descargadas de la wiki (no se sube a GitHub) |
| `.github/workflows/publicar.yml` | Publica `app/` en GitHub Pages en cada push |
| `.github/workflows/actualizar-catalogo.yml` | Actualiza el catálogo cada lunes y lo publica |
| `herramientas/generar_imagenes.py` | Genera los íconos y las pantallas de arranque del iPhone |
| `herramientas/novedades.py` | Al publicar, calcula el número de versión y arma la lista de "Versión y novedades" |
| `pruebas/` y `package.json` | Pruebas automáticas (se corren con `npm test`) |

## Pruebas

Antes de cada publicación, GitHub corre las pruebas de `pruebas/`: la lógica de la app (filtros,
respaldos, recordatorios, el ajuste de iOS), que el catálogo sea válido y que existan todos los
archivos que necesita la app sin internet. Si alguna falla, la app no se publica y GitHub te avisa
por correo. El catálogo de cada lunes también se revisa antes de guardarlo.

Para correrlas en tu PC necesitas [Node](https://nodejs.org/) 22 o más nuevo:

```bash
npm test
```

## Créditos

Los datos y fotos del catálogo vienen de la Hot Wheels Wiki de Fandom; el texto está bajo licencia
[CC BY-SA](https://creativecommons.org/licenses/by-sa/3.0/). Hot Wheels es una marca de Mattel;
esta es una app personal sin relación con Mattel ni con Fandom.
