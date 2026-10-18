// Baixa o WinSW (wrapper de serviço do Windows) usado para instalar o backup como serviço.
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe';
const dest = path.join(__dirname, '..', 'resources', 'service', 'WinSW-x64.exe');

if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) {
  console.log('[winsw] já existe:', dest);
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });

function get(url, redirects = 0) {
  https.get(url, { headers: { 'User-Agent': 'api2dev-backup' } }, (res) => {
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && redirects < 5) {
      return get(res.headers.location, redirects + 1);
    }
    if (res.statusCode !== 200) {
      console.warn('[winsw] falha ao baixar (HTTP ' + res.statusCode + '). Baixe manualmente de ' + URL + ' para ' + dest);
      return;
    }
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(() => { console.log('[winsw] baixado em', dest); process.exit(0); }));
  }).on('error', (e) => console.warn('[winsw] erro:', e.message, '- baixe manualmente de', URL));
}
get(URL);
