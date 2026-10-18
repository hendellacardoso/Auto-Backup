// Google Drive (OAuth2 - aplicativo de computador). Escopo drive.file: o app só enxerga
// os arquivos/pastas que ele próprio criou, por isso a pasta de destino é criada pelo app.
const fs = require('fs');
const http = require('http');
const { OAuth2Client } = require('google-auth-library');
const { drive: driveApi } = require('@googleapis/drive');
const db = require('../database');

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'];

function client(cfg, redirectUri) {
  const c = new OAuth2Client(cfg.clientId, cfg.clientSecret, redirectUri);
  if (cfg.tokens) c.setCredentials(JSON.parse(cfg.tokens));
  c.on('tokens', (t) => {
    const cur = db.getSettings('gdrive');
    const old = cur.tokens ? JSON.parse(cur.tokens) : {};
    db.saveSettings('gdrive', { tokens: JSON.stringify({ ...old, ...t }) });
  });
  return c;
}

function drive() {
  const cfg = db.getSettings('gdrive');
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('Google Drive: informe Client ID e Client Secret.');
  if (!cfg.tokens) throw new Error('Google Drive: conta não autorizada. Clique em "Conectar conta Google".');
  return { api: driveApi({ version: 'v3', auth: client(cfg) }), cfg };
}

/** Fluxo OAuth com servidor local (loopback). openUrl abre o navegador. */
function authorize(openUrl) {
  const cfg = db.getSettings('gdrive');
  if (!cfg.clientId || !cfg.clientSecret) return Promise.reject(new Error('Informe Client ID e Client Secret antes de conectar.'));
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const timer = setTimeout(() => { server.close(); reject(new Error('Tempo esgotado aguardando autorização do Google.')); }, 5 * 60 * 1000);
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}`;
      const oauth = client({ ...cfg, tokens: '' }, redirect);
      server.on('request', async (req, res) => {
        const url = new URL(req.url, redirect);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');
        if (!code && !err) { res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:Segoe UI;text-align:center;padding:60px">
          <h2>${err ? 'Autorização cancelada' : 'Conta Google conectada!'}</h2><p>Você já pode fechar esta janela e voltar ao API2Dev Backup.</p></body></html>`);
        clearTimeout(timer);
        server.close();
        if (err) return reject(new Error('Autorização negada: ' + err));
        try {
          const { tokens } = await oauth.getToken(code);
          oauth.setCredentials(tokens);
          const info = await oauth.request({ url: 'https://www.googleapis.com/oauth2/v2/userinfo' });
          db.saveSettings('gdrive', { tokens: JSON.stringify(tokens), account: info.data.email || '', folderId: '' });
          resolve({ account: info.data.email });
        } catch (e) { reject(e); }
      });
      openUrl(oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES }));
    });
  });
}

function disconnect() {
  db.saveSettings('gdrive', { tokens: '', account: '', folderId: '' });
}

async function ensureFolder(api, cfg) {
  if (cfg.folderId) {
    try {
      const r = await api.files.get({ fileId: cfg.folderId, fields: 'id, name, trashed' });
      if (!r.data.trashed && r.data.name === (cfg.folderName || 'API2Dev Backup')) return cfg.folderId;
    } catch (_) { /* recria */ }
  }
  const folderName = cfg.folderName || 'API2Dev Backup';
  const found = await api.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id)', spaces: 'drive'
  });
  let id = found.data.files[0] && found.data.files[0].id;
  if (!id) {
    const r = await api.files.create({ requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
    id = r.data.id;
  }
  db.saveSettings('gdrive', { folderId: id });
  return id;
}

async function upload(filePath, fileName) {
  const { api, cfg } = drive();
  const parent = await ensureFolder(api, cfg);
  const r = await api.files.create({
    requestBody: { name: fileName, parents: [parent] },
    media: { body: fs.createReadStream(filePath) },
    fields: 'id'
  });
  return r.data.id;
}

async function download(fileId, dest) {
  const { api } = drive();
  const r = await api.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    r.data.on('error', reject).pipe(ws).on('finish', resolve).on('error', reject);
  });
  return dest;
}

async function remove(fileId) {
  const { api } = drive();
  await api.files.delete({ fileId });
}

async function test() {
  const { api, cfg } = drive();
  await ensureFolder(api, cfg);
  const r = await api.about.get({ fields: 'user(emailAddress), storageQuota(limit, usage)' });
  return r.data;
}

module.exports = { authorize, disconnect, upload, download, remove, test };
