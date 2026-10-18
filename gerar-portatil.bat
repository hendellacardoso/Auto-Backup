@echo off
chcp 65001 >nul
title API2Dev Backup - Gerar versao portatil
cd /d "%~dp0"

where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install || (echo [ERRO] Falha no npm install & pause & exit /b 1)
)

echo Gerando versao portatil...
call npm run dist:portable || (echo [ERRO] Falha ao gerar a versao portatil & pause & exit /b 1)

echo.
echo Versao portatil gerada em: %~dp0release
explorer "%~dp0release"
pause
