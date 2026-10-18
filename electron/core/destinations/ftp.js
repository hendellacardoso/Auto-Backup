// FTP / FTPS usando basic-ftp
const ftp = require('basic-ftp');
const path = require('path');
const db = require('../database');

async function withClient(fn, override) {
  const cfg = { ...db.getSettings('ftp'), ...(override || {}) };
  if (!cfg.host) throw new Error('FTP: servidor não configurado.');
  const c = new ftp.Client(60000);
  try {
    await c.access({
      host: cfg.host, port: Number(cfg.port) || 21, user: cfg.user || 'anonymous', password: cfg.password || '',
      secure: cfg.secure ? true : false, secureOptions: { rejectUnauthorized: false }
    });
    return await fn(c, cfg);
  } finally {
    c.close();
  }
}

function remoteDirFor(cfg, sub) {
  return path.posix.join(cfg.remoteDir || '/', sub || '');
}

async function upload(localFile, subDir) {
  return withClient(async (c, cfg) => {
    const dir = remoteDirFor(cfg, subDir);
    await c.ensureDir(dir);
    const name = path.basename(localFile);
    await c.uploadFrom(localFile, name);
    return path.posix.join(dir, name);
  });
}

async function download(remotePath, dest) {
  return withClient(async (c) => { await c.downloadTo(dest, remotePath); return dest; });
}

async function remove(remotePath) {
  return withClient(async (c) => { await c.remove(remotePath); });
}

async function test(override) {
  return withClient(async (c, cfg) => {
    await c.ensureDir(remoteDirFor(cfg));
    return `Conectado. Pasta: ${await c.pwd()}`;
  }, override);
}

module.exports = { upload, download, remove, test };
