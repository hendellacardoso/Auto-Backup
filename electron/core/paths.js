// Caminhos compartilhados entre o aplicativo (bandeja) e o serviço do Windows.
// Ambos usam a mesma pasta de dados (ProgramData) para compartilhar o SQLite.
const path = require('path');
const fs = require('fs');
const os = require('os');

function getDataDir() {
  if (process.env.API2DEV_DATA_DIR) return process.env.API2DEV_DATA_DIR;
  if (process.platform === 'win32') {
    const base = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(base, 'API2Dev', 'SistemaBackup');
  }
  return path.join(os.homedir(), '.api2dev-backup');
}

const DATA_DIR = getDataDir();
const DB_FILE = path.join(DATA_DIR, 'backup.db');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const TEMP_DIR = path.join(DATA_DIR, 'temp');
const SERVICE_DIR = path.join(DATA_DIR, 'service');
const DEFAULT_BACKUP_DIR = path.join(DATA_DIR, 'backups');

for (const d of [DATA_DIR, LOG_DIR, TEMP_DIR, DEFAULT_BACKUP_DIR]) {
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) { /* ignora */ }
}

// Resolve o caminho do 7za mesmo quando empacotado em app.asar
function get7zaPath() {
  const p = require('7zip-bin').path7za;
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

module.exports = { DATA_DIR, DB_FILE, LOG_DIR, TEMP_DIR, SERVICE_DIR, DEFAULT_BACKUP_DIR, get7zaPath };
