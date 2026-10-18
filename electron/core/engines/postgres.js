// Motor PostgreSQL: pg_dump (formato custom -Fc) / pg_restore
const path = require('path');
const { Client } = require('pg');
const { run, resolveBin, PF } = require('./util');

const PG_DIRS = [{ root: path.join(PF, 'PostgreSQL'), sub: 'bin' }];

function clientCfg(c, database = 'postgres') {
  return {
    host: c.host || 'localhost', port: Number(c.port) || 5432, user: c.username, password: c.password,
    database: (c.options && c.options.maintenanceDb) || database,
    ssl: c.options && c.options.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000
  };
}

async function withClient(c, fn, database) {
  const client = new Client(clientCfg(c, database));
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

function env(c) {
  return { PGPASSWORD: c.password || '', PGSSLMODE: c.options && c.options.ssl ? 'require' : 'prefer' };
}
function baseArgs(c) {
  return ['-h', c.host || 'localhost', '-p', String(c.port || 5432), '-U', c.username || 'postgres', '-w'];
}

async function testConnection(c) {
  return withClient(c, async (cl) => (await cl.query('SELECT version() v')).rows[0].v.split(',')[0]);
}

async function listDatabases(c) {
  return withClient(c, async (cl) =>
    (await cl.query('SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY datname')).rows.map((r) => r.datname));
}

async function backup(c, database, outDir, baseName, ctx) {
  const file = path.join(outDir, baseName + '.backup');
  await run(resolveBin('pg_dump', PG_DIRS), [...baseArgs(c), '-F', 'c', '-b', '-v', '-f', file, database],
    { env: env(c), log: ctx.log });
  return file;
}

async function restore(c, file, targetDb, ctx) {
  const exists = await withClient(c, async (cl) =>
    (await cl.query('SELECT 1 FROM pg_database WHERE datname=$1', [targetDb])).rowCount > 0);
  if (!exists) {
    ctx.log(`Criando banco ${targetDb}...`);
    await withClient(c, (cl) => cl.query(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`));
  } else {
    // encerra conexões ativas no banco de destino
    await withClient(c, (cl) => cl.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()', [targetDb]));
  }
  await run(resolveBin('pg_restore', PG_DIRS),
    [...baseArgs(c), '-d', targetDb, '--clean', '--if-exists', '--no-owner', '-v', file],
    { env: env(c), log: ctx.log, okCodes: [0, 1] });
}

module.exports = { testConnection, listDatabases, backup, restore, extension: '.backup' };
