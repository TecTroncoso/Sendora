@echo off
title Proyecto: Whattsapp Automatizacion
cd /d "%~dp0"
call venv\Scripts\activate.bat
echo.
echo [OK] Entorno virtual activado.
echo [OK] Directorio: %CD%
echo.
echo Abriendo Antigravity...
start "" antigravity .
echo Escribe tus comandos aqui (`pip`, `python`, etc.)
cmd /k
