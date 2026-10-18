// Instalação/controle do serviço do Windows usando WinSW.
// O serviço executa o próprio executável do app com ELECTRON_RUN_AS_NODE=1 rodando service-runner.js
// (sem janela e sem bandeja), compartilhando o mesmo SQLite em ProgramData.
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { SERVICE_DIR, DATA_DIR } = require('./core/paths');

const SERVICE_ID = 'API2DevBackup';
const WRAPPER = path.join(SERVICE_DIR, 'API2DevBackupService.exe');
const XML = path.join(SERVICE_DIR, 'API2DevBackupService.xml');

function isWindows() { return process.platform === 'win32'; }

function winswSource() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'service', 'WinSW-x64.exe'),
    path.join(__dirname, '..', 'resources', 'service', 'WinSW-x64.exe')
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function status() {
  return new Promise((resolve) => {
    if (!isWindows()) return resolve({ installed: false, running: false, state: 'INDISPONÍVEL (somente Windows)' });
    execFile('sc', ['query', SERVICE_ID], { windowsHide: true }, (err, stdout) => {
      if (err && /1060/.test(String(stdout) + String(err.message))) return resolve({ installed: false, running: false, state: 'NÃO INSTALADO' });
      const m = /STATE\s*:\s*\d+\s+(\w+)/.exec(stdout || '');
      const state = m ? m[1] : (err ? 'NÃO INSTALADO' : 'DESCONHECIDO');
      resolve({ installed: !!m, running: state === 'RUNNING', state });
    });
  });
}

function xmlEscape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Executa um .cmd com elevação (UAC) e aguarda
function runElevated(lines) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(SERVICE_DIR, { recursive: true });
    const cmdFile = path.join(SERVICE_DIR, `op_${Date.now()}.cmd`);
    const logFile = cmdFile.replace(/\.cmd$/, '.log');
    fs.writeFileSync(cmdFile, ['@echo off', 'chcp 65001 >nul', ...lines.map((l) => `${l} >> "${logFile}" 2>&1`), 'exit /b 0'].join('\r\n'));
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Process -FilePath '${cmdFile.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden`], { windowsHide: true });
    let err = '';
    ps.stderr.on('data', (d) => { err += d; });
    ps.on('close', (code) => {
      const out = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
      try { fs.unlinkSync(cmdFile); fs.unlinkSync(logFile); } catch (_) { /* ignora */ }
      if (code !== 0) return reject(new Error(/cancel/i.test(err) ? 'Operação cancelada pelo usuário (UAC).' : (err || `Falha (código ${code})`)));
      resolve(out);
    });
  });
}

async function install() {
  if (!isWindows()) throw new Error('Serviço disponível somente no Windows.');
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    throw new Error('A versão portátil não pode ser instalada como serviço (ela roda a partir de uma pasta temporária). Use o instalador para habilitar o serviço do Windows.');
  }
  const src = winswSource();
  if (!src) throw new Error('WinSW-x64.exe não encontrado em resources/service. Execute "npm install" (baixa automaticamente) ou copie manualmente.');
  fs.mkdirSync(path.join(SERVICE_DIR, 'logs'), { recursive: true });
  fs.copyFileSync(src, WRAPPER);

  const runner = path.join(__dirname, 'service-runner.js');
  const xml = `<service>
  <id>${SERVICE_ID}</id>
  <name>API2Dev Backup</name>
  <description>API2Dev Backup - backups agendados de SQL Server, PostgreSQL, MySQL e Oracle (suporte@api2dev.com.br)</description>
  <executable>${xmlEscape(process.execPath)}</executable>
  <arguments>"${xmlEscape(runner)}"</arguments>
  <workingdirectory>${xmlEscape(path.dirname(process.execPath))}</workingdirectory>
  <env name="ELECTRON_RUN_AS_NODE" value="1"/>
  <env name="API2DEV_SERVICE" value="1"/>
  <env name="API2DEV_DATA_DIR" value="${xmlEscape(DATA_DIR)}"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <stoptimeout>15 sec</stoptimeout>
  <logpath>${xmlEscape(path.join(SERVICE_DIR, 'logs'))}</logpath>
  <log mode="roll-by-size"><sizeThreshold>5120</sizeThreshold><keepFiles>5</keepFiles></log>
</service>`;
  fs.writeFileSync(XML, xml, 'utf8');

  await runElevated([
    // garante que o app (usuário comum) e o serviço (LocalSystem) possam gravar na pasta de dados
    `icacls "${DATA_DIR}" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q`,
    `"${WRAPPER}" stop`,
    `"${WRAPPER}" uninstall`,
    `"${WRAPPER}" install`,
    `"${WRAPPER}" start`
  ]);
  return status();
}

async function uninstall() {
  if (!fs.existsSync(WRAPPER)) return status();
  await runElevated([`"${WRAPPER}" stop`, `"${WRAPPER}" uninstall`]);
  return status();
}

async function start() { await runElevated([`sc start ${SERVICE_ID}`]); return status(); }
async function stop() { await runElevated([`sc stop ${SERVICE_ID}`]); return status(); }

module.exports = { status, install, uninstall, start, stop, SERVICE_ID };
