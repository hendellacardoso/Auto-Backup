// Motor Oracle: Data Pump (expdp / impdp) por SCHEMA.
// O expdp grava o .dmp no DIRECTORY do servidor; o caminho dessa pasta precisa ser acessível por esta máquina.
const fs = require('fs');
const path = require('path');
const oracledb = require('oracledb');
const { run, resolveBin, moveFile } = require('./util');

const ORA_DIRS = [
  { root: 'C:\\app', sub: path.join('product') },
  { root: 'C:\\oracle', sub: '' }
];

function connectString(c) {
  return `${c.host || 'localhost'}:${c.port || 1521}/${c.service_name || 'ORCL'}`;
}

async function withConn(c, fn) {
  const cfg = { user: c.username, password: c.password, connectString: connectString(c) };
  if (c.options && c.options.sysdba) cfg.privilege = oracledb.SYSDBA;
  const cn = await oracledb.getConnection(cfg);
  try { return await fn(cn); } finally { await cn.close(); }
}

function userid(c) {
  const sys = c.options && c.options.sysdba ? ' AS SYSDBA' : '';
  return `${c.username}/"${c.password}"@//${connectString(c)}${sys}`;
}

function bin(name) {
  if (process.env.ORACLE_HOME) {
    const p = path.join(process.env.ORACLE_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
    if (fs.existsSync(p)) return p;
  }
  return resolveBin(name, ORA_DIRS);
}

async function testConnection(c) {
  return withConn(c, async (cn) => {
    const r = await cn.execute("SELECT banner FROM v$version WHERE ROWNUM = 1").catch(() => ({ rows: [['Oracle (conectado)']] }));
    return r.rows[0][0];
  });
}

async function listDatabases(c) {
  return withConn(c, async (cn) => {
    let r;
    try {
      r = await cn.execute("SELECT username FROM all_users WHERE oracle_maintained = 'N' ORDER BY username");
    } catch (_) {
      r = await cn.execute('SELECT username FROM all_users ORDER BY username');
    }
    return r.rows.map((x) => x[0]);
  });
}

async function dirInfo(c) {
  const dirName = (c.options && c.options.directoryName) || 'DATA_PUMP_DIR';
  let dirPath = c.options && c.options.directoryPath;
  if (!dirPath) {
    dirPath = await withConn(c, async (cn) => {
      const r = await cn.execute('SELECT directory_path FROM all_directories WHERE directory_name = :d', [dirName.toUpperCase()]);
      return r.rows[0] && r.rows[0][0];
    });
  }
  if (!dirPath) throw new Error(`DIRECTORY ${dirName} não encontrado. Informe o caminho na conexão.`);
  return { dirName, dirPath };
}

async function backup(c, schema, outDir, baseName, ctx) {
  const { dirName, dirPath } = await dirInfo(c);
  const dump = baseName + '.dmp';
  const logf = baseName + '_exp.log';
  await run(bin('expdp'), [userid(c), `SCHEMAS=${schema}`, `DIRECTORY=${dirName}`, `DUMPFILE=${dump}`, `LOGFILE=${logf}`, 'REUSE_DUMPFILES=YES'],
    { log: ctx.log, okCodes: [0, 5], hide: [c.password], streamStderr: true });
  const src = path.join(dirPath, dump);
  if (!fs.existsSync(src)) throw new Error(`Dump gerado, mas não acessível em ${src}. Ajuste o "Caminho da pasta do DIRECTORY".`);
  const dest = path.join(outDir, dump);
  moveFile(src, dest);
  try { fs.unlinkSync(path.join(dirPath, logf)); } catch (_) { /* ignora */ }
  return dest;
}

async function restore(c, file, targetSchema, ctx) {
  const { dirName, dirPath } = await dirInfo(c);
  const dump = path.basename(file);
  const staged = path.join(dirPath, dump);
  if (path.resolve(staged) !== path.resolve(file)) fs.copyFileSync(file, staged);
  const source = ctx.sourceDatabase || targetSchema;
  const args = [userid(c), `SCHEMAS=${source}`, `DIRECTORY=${dirName}`, `DUMPFILE=${dump}`,
    `LOGFILE=${path.parse(dump).name}_imp.log`, 'TABLE_EXISTS_ACTION=REPLACE'];
  if (source.toUpperCase() !== targetSchema.toUpperCase()) args.push(`REMAP_SCHEMA=${source}:${targetSchema}`);
  try {
    await run(bin('impdp'), args, { log: ctx.log, okCodes: [0, 5], hide: [c.password], streamStderr: true });
  } finally {
    if (path.resolve(staged) !== path.resolve(file)) { try { fs.unlinkSync(staged); } catch (_) { /* ignora */ } }
  }
}

module.exports = { testConnection, listDatabases, backup, restore, extension: '.dmp' };
