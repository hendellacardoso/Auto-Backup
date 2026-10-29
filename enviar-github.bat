@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title API2Dev Backup - Enviar para o GitHub
cd /d "%~dp0"

set "REPO=https://github.com/hendellacardoso/Auto-Backup.git"
set "BRANCH=main"

echo ==========================================================
echo   API2Dev Backup - Enviar codigo para o GitHub
echo   %REPO%
echo ==========================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Git nao encontrado. Instale em https://git-scm.com/download/win
  pause
  exit /b 1
)

rem ---------------------------------------------- copia o workflow do GitHub Actions (ci\github -> .github)
if exist "ci\github" (
  xcopy /e /i /y /q "ci\github" ".github" >nul
  echo Workflow do GitHub Actions atualizado em .github
)

rem ---------------------------------------------- inicializa o repositorio
if not exist ".git" (
  echo Inicializando repositorio Git...
  git init || goto :erro
  git branch -M %BRANCH%
)

rem ---------------------------------------------- remote origin
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin "%REPO%" || goto :erro
) else (
  git remote set-url origin "%REPO%" || goto :erro
)

rem ---------------------------------------------- identidade do autor
for /f "delims=" %%a in ('git config user.name') do set "GITNAME=%%a"
if not defined GITNAME git config user.name "Hendell Cardoso"
for /f "delims=" %%a in ('git config user.email') do set "GITMAIL=%%a"
if not defined GITMAIL git config user.email "hendellacardoso@gmail.com"

rem ---------------------------------------------- commit
set "MSG="
set /p "MSG=Mensagem do commit (Enter = Atualizacao %date% %time:~0,5%): "
if not defined MSG set "MSG=Atualizacao %date% %time:~0,5%"

git add -A || goto :erro
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "!MSG!" || goto :erro
) else (
  echo Nenhuma alteracao nova para commitar.
)

rem ---------------------------------------------- sincroniza com o remoto
echo.
echo Verificando o repositorio remoto...
git fetch origin >nul 2>nul
git rev-parse --verify --quiet origin/%BRANCH% >nul
if not errorlevel 1 (
  echo Mesclando alteracoes do GitHub...
  git pull origin %BRANCH% --no-rebase --allow-unrelated-histories --no-edit
  if errorlevel 1 (
    echo.
    echo [ERRO] Conflito ao mesclar com o GitHub. Resolva os conflitos,
    echo        rode "git add -A" e "git commit" e execute este arquivo novamente.
    pause
    exit /b 1
  )
)

rem ---------------------------------------------- push
echo.
echo Enviando para o GitHub (pode abrir uma janela de login)...
git push -u origin %BRANCH% || goto :erro

echo.
echo [OK] Codigo enviado para %REPO%
if /i "%~1"=="/semabrir" exit /b 0
start "" "https://github.com/hendellacardoso/Auto-Backup"
pause
exit /b 0

:erro
echo.
echo [ERRO] A operacao falhou. Veja a mensagem acima.
pause
exit /b 1
