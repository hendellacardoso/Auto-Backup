// Motor SQL Server: BACKUP DATABASE / RESTORE DATABASE (arquivo .bak)
// Autenticação SQL usa o driver "mssql"; autenticação do Windows usa o "sqlcmd" (-E).
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { run, resolveBin, moveFile, PF } = require('./util');

const SYSTEM_DBS = ['master', 'model', 'msdb', 'tempdb'];

function q(name) { return '[' + String(name).replace(/]/g, ']]') + ']'; }
function lit(v) { return "N'" + String(v).replace(/'/g, "''") + "'"; }

function sqlcmdBin() {
  return resolveBin('sqlcmd', [
    { root: path.join(PF, 'Microsoft SQL Server', 'Client SDK', 'ODBC'), sub: path.join('Tools', 'Binn') },
    { root: path.join(PF, 'Microsoft SQL Server'), match: /^\d+$/, sub: path.join('Tools', 'Binn') }
  ]);
}

function serverName(c) {
  let s = c.host || 'localhost';
  if (c.instance) s += '\\' + c.instance;
  else if (c.port) s += ',' + c.port;
  return s;
}

function poolConfig(c, database = 'master') {
  const cfg = {
    server: c.host || 'localhost',
    user: c.username,
    password: c.password,
    database,
    connectionTimeout: 15000,
    requestTimeout: 0, // backups longos
    options: {
      encrypt: !!(c.options && c.options.encrypt),
      trustServerCertificate: c.options ? c.options.trustServerCertificate !== false : true,
      enableArithAbort: true
    }
  };
  if (c.instance) cfg.options.instanceName = c.instance;
  if (c.port && !c.instance) cfg.port = Number(c.port);
  return cfg;
}

/** Executa um comando e devolve as linhas como arrays de valores. */
async function query(c, text, log) {
  if (c.auth_type === 'windows') {
    const args = ['-S', serverName(c), '-E', '-b', '-h', '-1', '-W', '-s', '\u0001', '-Q', 'SET NOCOUNT ON; ' + text];
    if (c.options && c.options.trustServerCertificate !== false) args.push('-C');
    const { stdout } = await run(sqlcmdBin(), args, { log });
    return stdout.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l && !/^\(\d+ rows? affected\)$/.test(l))
      .map((l) => l.split('\u0001').map((v) => (v === 'NULL' ? null : v)));
  }
  const pool = new sql.ConnectionPool(poolConfig(c));
  await pool.connect();
  try {
    const req = pool.request();
    if (log) req.on('info', (i) => log(i.message));
    const r = await req.query(text);
    return (r.recordset || []).map((row) => Object.values(row));
  } finally {
    await pool.close();
  }
}

async function testConnection(c) {
  const r = await query(c, 'SELECT @@VERSION');
  return String(r[0] && r[0][0] || 'OK').split('\n')[0];
}

async function listDatabases(c) {
  const r = await query(c, "SELECT name FROM sys.databases WHERE state_desc='ONLINE' AND name <> 'tempdb' ORDER BY name");
  return r.map((x) => x[0]).sort((a, b) => (SYSTEM_DBS.includes(a) - SYSTEM_DBS.includes(b)) || a.localeCompare(b));
}

// Pasta onde o SQL Server grava o .bak (precisa ser acessível pelo serviço do SQL Server)
async function serverDirs(c) {
  const o = c.options || {};
  let serverDir = o.serverBackupDir;
  if (!serverDir) {
    const r = await query(c, "DECLARE @d NVARCHAR(4000); EXEC master.dbo.xp_instance_regread N'HKEY_LOCAL_MACHINE', N'Software\\Microsoft\\MSSQLServer\\MSSQLServer', N'BackupDirectory', @d OUTPUT; SELECT @d");
    serverDir = r[0] && r[0][0];
    if (!serverDir) throw new Error('Não foi possível obter a pasta padrão de backup do SQL Server. Informe a "Pasta de backup no servidor" na conexão.');
  }
  // Caminho da mesma pasta vista por esta máquina (ex.: \\servidor\backup). Se vazio, assume servidor local.
  const localDir = o.localAccessDir || serverDir;
  return { serverDir, localDir };
}

async function backup(c, database, outDir, baseName, ctx) {
  const { serverDir, localDir } = await serverDirs(c);
  const fileName = baseName + '.bak';
  const serverFile = path.win32.join(serverDir, fileName);
  const compression = c.options && c.options.compression ? ', COMPRESSION' : '';
  ctx.log(`Gerando backup no servidor: ${serverFile}`);
  await query(c, `BACKUP DATABASE ${q(database)} TO DISK = ${lit(serverFile)} WITH COPY_ONLY, INIT, FORMAT, CHECKSUM, STATS = 10${compression}`, ctx.log);

  const localFile = path.join(localDir, fileName);
  const dest = path.join(outDir, fileName);
  if (path.resolve(localFile) !== path.resolve(dest)) {
    if (!fs.existsSync(localFile)) throw new Error(`Backup gerado, mas o arquivo não está acessível em ${localFile}. Configure "Caminho de acesso local".`);
    moveFile(localFile, dest);
  }
  return dest;
}

async function restore(c, file, targetDb, ctx) {
  const { serverDir, localDir } = await serverDirs(c);
  const fileName = path.basename(file);
  const staged = path.join(localDir, fileName);
  let copied = false;
  if (path.resolve(staged) !== path.resolve(file)) {
    fs.copyFileSync(file, staged);
    copied = true;
  }
  const serverFile = path.win32.join(serverDir, fileName);
  try {
    // Arquivos lógicos do backup
    const files = await query(c, `RESTORE FILELISTONLY FROM DISK = ${lit(serverFile)}`);
    const paths = await query(c, "SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS NVARCHAR(4000)), CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS NVARCHAR(4000))");
    const [dataPath, logPath] = paths[0] || [];
    const existing = await query(c, `SELECT mf.name, mf.physical_name FROM sys.master_files mf WHERE mf.database_id = DB_ID(${lit(targetDb)})`);
    const exists = (await query(c, `SELECT COUNT(*) FROM sys.databases WHERE name = ${lit(targetDb)}`))[0][0] > 0;

    const moves = files.map((f) => {
      const logical = f[0];
      const type = f[2]; // D = dados, L = log
      const found = existing.find((e) => e[0] === logical);
      let target;
      if (found) target = found[1];
      else {
        const ext = type === 'L' ? '.ldf' : (path.extname(f[1]) || '.mdf');
        const dir = (type === 'L' ? logPath : dataPath) || path.win32.dirname(f[1]);
        target = path.win32.join(dir, `${targetDb}_${logical}${ext}`);
      }
      return `MOVE ${lit(logical)} TO ${lit(target)}`;
    });

    if (exists) {
      ctx.log(`Colocando ${targetDb} em SINGLE_USER...`);
      await query(c, `ALTER DATABASE ${q(targetDb)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE`, ctx.log);
    }
    try {
      ctx.log(`Restaurando ${serverFile} em ${targetDb}...`);
      await query(c, `RESTORE DATABASE ${q(targetDb)} FROM DISK = ${lit(serverFile)} WITH REPLACE, RECOVERY, STATS = 10, ${moves.join(', ')}`, ctx.log);
    } finally {
      try { await query(c, `IF DB_ID(${lit(targetDb)}) IS NOT NULL ALTER DATABASE ${q(targetDb)} SET MULTI_USER`); } catch (_) { /* ignora */ }
    }
  } finally {
    if (copied) { try { fs.unlinkSync(staged); } catch (_) { /* ignora */ } }
  }
}

module.exports = { testConnection, listDatabases, backup, restore, extension: '.bak' };
