@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title API2Dev Backup - Publicar release no GitHub
cd /d "%~dp0"

rem ============================================================================
rem  Cria a tag v<versao> e envia para o GitHub. O GitHub Actions (Release) entao:
rem    - gera o instalador e a versao portatil no Windows
rem    - assina pela SignPath (quando o SIGNPATH_API_TOKEN estiver configurado)
rem    - publica em https://github.com/hendellacardoso/Auto-Backup/releases
rem ============================================================================

where git >nul 2>nul || (echo [ERRO] Git nao encontrado. & pause & exit /b 1)
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. & pause & exit /b 1)

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "VERSAO=%%v"
echo Versao atual no package.json: %VERSAO%
set "NOVA="
set /p "NOVA=Nova versao (Enter = publicar %VERSAO%): "
if defined NOVA (
  call npm version !NOVA! --no-git-tag-version >nul || (echo [ERRO] Versao invalida: !NOVA! & pause & exit /b 1)
  set "VERSAO=!NOVA!"
)
set "TAG=v%VERSAO%"

rem envia o codigo atual (commit + push) antes da tag
call "%~dp0enviar-github.bat" /semabrir
if errorlevel 1 (echo [ERRO] Falha ao enviar o codigo. & pause & exit /b 1)

git rev-parse -q --verify "refs/tags/%TAG%" >nul
if not errorlevel 1 (
  echo.
  echo [AVISO] A tag %TAG% ja existe. Altere a versao para publicar uma release nova.
  pause
  exit /b 1
)

echo.
echo Criando a tag %TAG%...
git tag -a "%TAG%" -m "API2Dev Backup %VERSAO%" || goto :erro
git push origin "%TAG%" || goto :erro

echo.
echo [OK] Tag %TAG% enviada. Acompanhe o build em:
echo      https://github.com/hendellacardoso/Auto-Backup/actions
echo      Se a SignPath estiver configurada, aprove o pedido de assinatura em https://app.signpath.io
start "" "https://github.com/hendellacardoso/Auto-Backup/actions"
pause
exit /b 0

:erro
echo.
echo [ERRO] A operacao falhou. Veja a mensagem acima.
pause
exit /b 1
