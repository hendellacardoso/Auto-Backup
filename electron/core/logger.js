const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./paths');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function write(level, source, msg) {
  const line = `[${stamp()}] [${level}] [${source}] ${msg}`;
  const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`);
  try { fs.appendFileSync(file, line + '\n'); } catch (_) { /* ignora */ }
  if (level === 'ERRO') console.error(line); else console.log(line);
}

const source = process.env.API2DEV_SERVICE ? 'servico' : 'app';
module.exports = {
  info: (m) => write('INFO', source, m),
  warn: (m) => write('AVISO', source, m),
  error: (m) => write('ERRO', source, m),
  stamp
};
