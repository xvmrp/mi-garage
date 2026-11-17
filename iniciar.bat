@echo off
chcp 65001 >nul
title Mi Garage - Coleccion Hot Wheels
cd /d "%~dp0app"
echo.
echo  Mi Garage esta funcionando en:  http://localhost:8000
echo.
echo  Para abrirla desde el celular (misma red Wi-Fi), usa la direccion
echo  IPv4 de este PC que aparece abajo, por ejemplo http://192.168.1.20:8000
echo.
ipconfig | findstr /i "IPv4"
echo.
echo  Deja esta ventana abierta mientras usas la app. Para cerrarla: Ctrl+C
echo.
start "" "http://localhost:8000"
python -m http.server 8000
