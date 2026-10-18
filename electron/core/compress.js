// Compactação ZIP (com senha AES-256 opcional) usando o 7-Zip embutido (7zip-bin).
const fs = require('fs');
const path = require('path');
const { get7zaPath } = require('./paths');
const { run } = require('./engines/util');

function bin() {
  const p = get7zaPath();
  if (process.platform !== 'win32') { try { fs.chmodSync(p, 0o755); } catch (_) { /* ignora */ } }
  return p;
}

async function zipFile(file, zipPath, password, log) {
  const args = ['a', '-tzip', '-mx=5', '-y', '-bso0', '-bsp0'];
  if (password) args.push(`-p${password}`, '-mem=AES256');
  args.push(zipPath, file);
  await run(bin(), args, { log, hide: [password] });
  return zipPath;
}

async function unzipFile(zipPath, outDir, password, log) {
  fs.mkdirSync(outDir, { recursive: true });
  const args = ['x', '-y', '-bso0', '-bsp0', `-o${outDir}`, `-p${password || ''}`, zipPath];
  await run(bin(), args, { log, hide: [password] });
  const files = fs.readdirSync(outDir).map((f) => path.join(outDir, f)).filter((f) => fs.statSync(f).isFile());
  if (!files.length) throw new Error('O arquivo ZIP está vazio ou a senha está incorreta.');
  return files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
}

module.exports = { zipFile, unzipFile };
