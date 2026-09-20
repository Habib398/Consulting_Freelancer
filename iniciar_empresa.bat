@echo off
setlocal
cd /d %~dp0

echo ============================================
echo  CONSULTING - Work Log
echo  Iniciando servidor...
echo ============================================

:: Copiar .env si no existe
if not exist ".env" (
    if exist ".env.example" copy /Y ".env.example" ".env" >nul
)

set APP_DEBUG=0
set LOG_LEVEL=INFO

:: Usar Python del venv si existe, si no usar el del sistema
if exist ".venv\Scripts\python.exe" (
    echo  Entorno: .venv detectado
    set PYTHON=.venv\Scripts\python.exe
) else (
    echo  Entorno: Python del sistema
    set PYTHON=python
)

echo  Servidor: http://127.0.0.1:5000
echo  Presiona Ctrl+C para detener
echo ============================================
echo.

%PYTHON% run_waitress.py

echo.
echo  Servidor detenido.
pause
