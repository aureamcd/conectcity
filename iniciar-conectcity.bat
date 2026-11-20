@echo off
chcp 65001 >nul
title e-CONECT-CITY - Municipio de Picos-PI (Arquitetura de Microsservicos)
echo ======================================================================
echo   INICIANDO PLATAFORMA e-CONECT-CITY (3 MICROSSERVICOS + API GATEWAY)
echo ======================================================================
echo.
start "" "http://localhost:3000"
node --no-warnings "%~dp0start-all.js"
pause
