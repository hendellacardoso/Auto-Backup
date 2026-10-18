// Motor MySQL / MariaDB: mysqldump / mysql
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
const { run, resolveBin, PF, PF86 } = require('./util');
const { TEMP_DIR } = require('../paths');

const MY_DIRS = [
  { root: path.join(PF, 'MySQL'), match: /^MySQL Server/i, sub: 'bin' },
  { root: PF, match: /^MariaDB/i, sub: 'bin' },
  { root: path.join(PF86, 'MySQL'), match: /^MySQL Server/i, sub: 'bin' }
];
const SYSTEM = ['information_schema', 'performance_schema', 'mysql', 'sys'];

async function conn(c) {
  return mysql.createConnection({
    host: c.host || 'localhost', port: Number(c.port) || 3306, user: c.username, password: c.password,
    connectTimeout: 15000, ssl: c.options && c.options.ssl ? { rejectUnauthorized: false } : undefined
  });
}

// Arquivo temporário de credenciais (evita senha na linha de comando)
function credFile(c) {
  const f = path.join(TEMP_DIR, `my_${process.pid}_${Date.now()}.cnf`);
  const pass = String(c.password || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  fs.writeFileSync(f, `[client]\nuser="${c.username || 'root'}"\npassword="${pass}"\nhost="${c.host || 'localhost'}"\nport=${Number(c.port) || 3306}\n`, { mode: 0o600 });
  return f;
}

async function testConnection(c) {
  const cn = await conn(c);
  try { const [r] = await cn.query('SELECT VERSION() v'); return 'MySQL ' + r[0].v; } finally { await cn.end(); }
}

async function listDatabases(c) {
  const cn = await conn(c);
  try {
    const [r] = await cn.query('SHOW DATABASES');
    return r.map((x) => x.Database).filter((d) => !SYSTEM.includes(d));
  } finally { await cn.end(); }
}

async function backup(c, database, outDir, baseName, ctx) {
  const file = path.join(outDir, baseName + '.sql');
  const cnf = credFile(c);
  try {
    await run(resolveBin('mysqldump', MY_DIRS), [
      `--defaults-extra-file=${cnf}`, '--single-transaction', '--routines', '--triggers', '--events',
      '--default-character-set=utf8mb4', '--hex-blob', `--result-file=${file}`, '--databases', database
    ], { log: ctx.log });
  } finally { fs.rmSync(cnf, { force: true }); }
  return file;
}

async function restore(c, file, targetDb, ctx) {
  // O dump foi gerado com --databases (contém CREATE DATABASE/USE do banco original).
  // Para restaurar com outro nome, as linhas de CREATE/USE são reescritas em um arquivo temporário.
  let src = file;
  let tmp = null;
  if (ctx.sourceDatabase && ctx.sourceDatabase !== targetDb) {
    tmp = path.join(TEMP_DIR, `restore_${Date.now()}.sql`);
    const esc = ctx.sourceDatabase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('^(CREATE DATABASE.*`|USE `)' + esc + '`');
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    const out = fs.createWriteStream(tmp, 'utf8');
    for await (const line of rl) {
      const l = /^(CREATE DATABASE|USE )/.test(line) ? line.replace(re, (_m, p1) => p1 + targetDb + '`') : line;
      if (!out.write(l + '\n')) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((r) => out.end(r));
    src = tmp;
  }
  const cn = await conn(c);
  try { await cn.query(`CREATE DATABASE IF NOT EXISTS \`${targetDb.replace(/`/g, '``')}\``); } finally { await cn.end(); }
  const cnf = credFile(c);
  try {
    await run(resolveBin('mysql', MY_DIRS), [`--defaults-extra-file=${cnf}`, '--default-character-set=utf8mb4', targetDb],
      { stdinFile: src, log: ctx.log });
  } finally {
    fs.rmSync(cnf, { force: true });
    if (tmp) fs.rmSync(tmp, { force: true });
  }
}

module.exports = { testConnection, listDatabases, backup, restore, extension: '.sql' };
