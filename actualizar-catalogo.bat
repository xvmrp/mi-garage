@echo off
chcp 65001 >nul
title Actualizar catalogo Hot Wheels
cd /d "%~dp0"
echo.
echo  Descargando el catalogo actualizado desde la Hot Wheels Wiki...
echo  (tarda unos minutos; tu coleccion no se toca)
echo.
python importador\importar.py --actualizar
echo.
pause
