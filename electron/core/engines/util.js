// Utilitários comuns aos motores de backup.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../database');

/**
 * Executa um processo externo (pg_dump, mysqldump, expdp, sqlcmd...).
 * opts.stdinFile  -> arquivo enviado para o stdin
 * opts.stdoutFile -> grava stdout em arquivo
 * opts.okCodes    -> códigos de saída aceitos (padrão [0])
 * opts.hide       -> textos a ocultar no log (senhas)
 */
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const hide = (s) => (opts.hide || []).filter(Boolean).reduce((acc, h) => acc.split(h).join('****'), s);
    opts.log && opts.log(`> ${path.basename(cmd)} ${hide(args.join(' '))}`);

    const child = spawn(cmd, args, {
      env: { ...process.env, ...(opts.env || {}) },
      windowsHide: true,
      cwd: opts.cwd
    });
    let stdout = '';
    let stderr = '';

    if (opts.stdoutFile) {
      const ws = fs.createWriteStream(opts.stdoutFile);
      child.stdout.pipe(ws);
    } else {
      child.stdout.on('data', (d) => { stdout += d.toString(); });
    }
    child.stderr.on('data', (d) => {
      const t = d.toString();
      stderr += t;
      if (opts.log && opts.streamStderr) t.split(/\r?\n/).filter(Boolean).forEach((l) => opts.log(hide(l)));
    });
    if (opts.stdinFile) {
      fs.createReadStream(opts.stdinFile).pipe(child.stdin);
    } else {
      child.stdin.end();
    }

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`Executável não encontrado: "${cmd}". Configure o caminho em Configurações > Ferramentas.`));
      } else reject(err);
    });
    child.on('close', (code) => {
      const ok = (opts.okCodes || [0]).includes(code);
      if (ok) resolve({ code, stdout, stderr: hide(stderr) });
      else reject(new Error(`${path.basename(cmd)} terminou com código ${code}: ${hide((stderr || stdout).trim()).slice(-2000)}`));
    });
  });
}

// Procura um executável: 1) caminho configurado 2) pastas de instalação comuns 3) PATH
function resolveBin(name, searchGlobs = []) {
  const general = db.getSettings('general') || {};
  const configured = general.binPaths && general.binPaths[name];
  if (configured && fs.existsSync(configured)) return configured;

  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  for (const base of searchGlobs) {
    try {
      if (!fs.existsSync(base.root)) continue;
      const subs = fs.readdirSync(base.root)
        .filter((s) => !base.match || base.match.test(s))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const s of subs) {
        const candidate = path.join(base.root, s, base.sub || '', exe);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (_) { /* ignora */ }
  }
  return exe; // tenta pelo PATH
}

const PF = process.env.ProgramFiles || 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (_) {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
  }
}

module.exports = { run, resolveBin, moveFile, PF, PF86 };
