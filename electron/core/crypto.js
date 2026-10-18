// Criptografia AES-256-GCM das senhas gravadas no SQLite.
// A chave fica na pasta de dados para que o app e o serviço (LocalSystem) consigam ler.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

const KEY_FILE = path.join(DATA_DIR, '.key');
let KEY = null;

function key() {
  if (KEY) return KEY;
  if (fs.existsSync(KEY_FILE)) {
    KEY = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  } else {
    KEY = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, KEY.toString('hex'), { mode: 0o600 });
  }
  return KEY;
}

function encrypt(text) {
  if (text === null || text === undefined || text === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (!String(value).startsWith('enc:')) return value;
  try {
    const raw = Buffer.from(value.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch (_) {
    return '';
  }
}

module.exports = { encrypt, decrypt };
