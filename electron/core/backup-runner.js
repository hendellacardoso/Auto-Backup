// Execução dos backups e restaurações.
const fs = require('fs');
const path = require('path');
const db = require('./database');
const bus = require('./events');
const logger = require('./logger');
const { getEngine } = require('./engines');
const { zipFile, unzipFile } = require('./compress');
const gdrive = require('./destinations/gdrive');
const ftp = require('./destinations/ftp');
const email = require('./notify/email');
const { TEMP_DIR } = require('./paths');

const running = new Set(); // jobs em execução

function sanitize(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'backup';
}
function pad(n) { return String(n).padStart(2, '0'); }
function nowParts() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    stamp: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  };
}

function isRunning(jobId) { return running.has(Number(jobId)); }
function runningJobs() { return [...running]; }

/** Executa uma tarefa de backup (todos os bancos selecionados). */
async function runJob(jobId, trigger = 'agendado') {
  jobId = Number(jobId);
  if (running.has(jobId)) throw new Error('Esta tarefa já está em execução.');
  const job = db.getJob(jobId);
  if (!job) throw new Error('Tarefa não encontrada.');
  const conn = db.getConnection(job.connection_id);
  if (!conn) throw new Error('Conexão da tarefa não encontrada.');
  if (!job.databases.length) throw new Error('Nenhum banco selecionado na tarefa.');

  running.add(jobId);
  bus.emit('job:state', { jobId, running: true });
  logger.info(`Iniciando tarefa "${job.name}" (${trigger})`);

  const general = db.getSettings('general');
  const engine = getEngine(conn.type);
  const results = [];

  try {
    for (const database of job.databases) {
      results.push(await backupOne({ job, conn, engine, general, database, trigger }));
    }
    try { await applyRetention(job); } catch (e) { logger.warn('Retenção: ' + e.message); }
  } finally {
    running.delete(jobId);
    const status = results.some((r) => r.status === 'erro') ? 'erro' : results.some((r) => r.status === 'aviso') ? 'aviso' : 'sucesso';
    db.setJobLastRun(jobId, status);
    bus.emit('job:state', { jobId, running: false, status });
    bus.emit('history:changed');
    logger.info(`Tarefa "${job.name}" finalizada: ${status}`);

    const policy = job.notify || 'erro';
    const emailCfg = db.getSettings('email');
    if (emailCfg.enabled && results.length && (policy === 'sempre' || (policy === 'erro' && status !== 'sucesso'))) {
      const rep = email.jobReport(job, results);
      email.send(rep.subject, rep.html).catch((e) => logger.error('Falha ao enviar e-mail: ' + e.message));
    }
  }
  return results;
}

async function backupOne({ job, conn, engine, general, database, trigger }) {
  const lines = [];
  const historyId = db.addHistory({
    job_id: job.id, job_name: job.name, connection_id: conn.id, connection_name: conn.name,
    db_type: conn.type, database_name: database, trigger_type: trigger
  });
  bus.emit('history:changed');
  const log = (m) => {
    const line = `[${logger.stamp()}] ${m}`;
    lines.push(line);
    bus.emit('backup:log', { jobId: job.id, historyId, database, line });
  };

  const { date, stamp } = nowParts();
  const outDir = path.join(general.backupDir, sanitize(job.name), date);
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = `${sanitize(database)}_${stamp}`;
  const warnings = [];
  let finalFile = null;

  try {
    log(`Backup de "${database}" (${conn.type}) iniciado`);
    let file = await engine.backup(conn, database, outDir, baseName, { log });
    log(`Arquivo gerado: ${path.basename(file)} (${email.fmtSize(fs.statSync(file).size)})`);

    if (job.zip) {
      const zipPath = path.join(outDir, baseName + '.zip');
      log(`Compactando${job.zip_password ? ' com senha (AES-256)' : ''}...`);
      await zipFile(file, zipPath, job.zip_password, log);
      fs.unlinkSync(file);
      file = zipPath;
    }
    finalFile = file;
    const size = fs.statSync(file).size;
    const fields = {
      file_path: file, file_name: path.basename(file), file_size: size,
      zipped: job.zip ? 1 : 0, zip_password: job.zip ? job.zip_password : ''
    };

    // Envio para destinos remotos
    let uploaded = false;
    if (job.upload_gdrive) {
      try {
        log('Enviando para o Google Drive...');
        fields.gdrive_file_id = await gdrive.upload(file, path.basename(file));
        uploaded = true;
        log('Google Drive: enviado.');
      } catch (e) { warnings.push('Google Drive: ' + e.message); log('ERRO Google Drive: ' + e.message); }
    }
    if (job.upload_ftp) {
      try {
        log('Enviando para o FTP...');
        fields.ftp_path = await ftp.upload(file, path.posix.join(sanitize(job.name), date));
        uploaded = true;
        log('FTP: enviado para ' + fields.ftp_path);
      } catch (e) { warnings.push('FTP: ' + e.message); log('ERRO FTP: ' + e.message); }
    }
    if (!job.keep_local && uploaded) {
      fs.unlinkSync(file);
      fields.local_deleted = 1;
      log('Cópia local removida (mantida somente no destino remoto).');
    }

    const status = warnings.length ? 'aviso' : 'sucesso';
    db.finishHistory(historyId, { ...fields, status, message: warnings.join(' | ') || 'Backup concluído', log: lines.join('\n') });
    log(`Concluído com ${status}.`);
    bus.emit('history:changed');

    try { await applyMaxPerDay(job, database, date); } catch (e) { logger.warn('Rotação diária: ' + e.message); }
    return { database, status, fileName: fields.file_name, size, message: warnings.join(' | ') };
  } catch (e) {
    log('ERRO: ' + e.message);
    logger.error(`Backup ${job.name}/${database}: ${e.message}`);
    if (finalFile && fs.existsSync(finalFile) && !fs.statSync(finalFile).size) fs.rmSync(finalFile, { force: true });
    db.finishHistory(historyId, { status: 'erro', message: e.message, log: lines.join('\n') });
    bus.emit('history:changed');
    return { database, status: 'erro', message: e.message };
  }
}

/** Remove arquivo local e remoto de um item do histórico. */
async function purgeEntry(h, reason) {
  if (h.file_path && fs.existsSync(h.file_path)) { try { fs.unlinkSync(h.file_path); } catch (_) { /* ignora */ } }
  if (h.gdrive_file_id) { try { await gdrive.remove(h.gdrive_file_id); } catch (e) { logger.warn('Drive remove: ' + e.message); } }
  if (h.ftp_path) { try { await ftp.remove(h.ftp_path); } catch (e) { logger.warn('FTP remove: ' + e.message); } }
  db.updateHistory(h.id, { purged: 1, local_deleted: 1, message: `${h.message || ''} [${reason}]`.trim() });
}

// Quantidade máxima de backups por dia (por banco): remove os mais antigos do dia.
async function applyMaxPerDay(job, database, date) {
  const max = Number(job.max_per_day) || 0;
  if (max <= 0) return;
  const list = db.successfulBackupsOfDay(job.id, database, date);
  const excess = list.length - max;
  for (let i = 0; i < excess; i++) await purgeEntry(list[i], `removido: limite de ${max} backup(s) por dia`);
}

// Dias de retenção: remove backups mais antigos que N dias.
async function applyRetention(job) {
  const days = Number(job.retention_days) || 0;
  if (days <= 0) return;
  for (const h of db.backupsOlderThan(job.id, days)) await purgeEntry(h, `removido: retenção de ${days} dia(s)`);
  // remove pastas de data vazias
  const general = db.getSettings('general');
  const base = path.join(general.backupDir, sanitize(job.name));
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d);
      try { if (fs.statSync(p).isDirectory() && !fs.readdirSync(p).length) fs.rmdirSync(p); } catch (_) { /* ignora */ }
    }
  }
}

/** Obtém o arquivo de backup (local, Drive ou FTP) e descompacta se necessário. */
async function prepareFile(h, password, log, tmpDir) {
  let file = h.file_path;
  if (!file || !fs.existsSync(file)) {
    const dl = path.join(tmpDir, h.file_name || 'backup.bin');
    if (h.gdrive_file_id) {
      log('Arquivo local não encontrado. Baixando do Google Drive...');
      file = await gdrive.download(h.gdrive_file_id, dl);
    } else if (h.ftp_path) {
      log('Arquivo local não encontrado. Baixando do FTP...');
      file = await ftp.download(h.ftp_path, dl);
    } else {
      throw new Error('Arquivo de backup não encontrado (local nem remoto).');
    }
  }
  if (/\.zip$/i.test(file)) {
    log('Descompactando...');
    file = await unzipFile(file, path.join(tmpDir, 'unzip'), password != null ? password : h.zip_password, log);
  }
  return file;
}

/**
 * Restaura um backup.
 * opts: { historyId?, filePath?, connectionId, targetDb, sourceDb?, password? }
 */
async function restore(opts) {
  const lines = [];
  const log = (m) => {
    const line = `[${logger.stamp()}] ${m}`;
    lines.push(line);
    bus.emit('restore:log', { line });
  };
  const tmpDir = path.join(TEMP_DIR, 'restore_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    let h;
    if (opts.historyId) {
      h = db.getHistory(opts.historyId);
      if (!h) throw new Error('Item do histórico não encontrado.');
    } else {
      h = { file_path: opts.filePath, file_name: path.basename(opts.filePath || ''), database_name: opts.sourceDb || opts.targetDb, zip_password: '' };
    }
    const conn = db.getConnection(opts.connectionId || h.connection_id);
    if (!conn) throw new Error('Conexão de destino não encontrada.');
    const engine = getEngine(conn.type);
    if (h.db_type && h.db_type !== conn.type) throw new Error(`Backup de ${h.db_type} não pode ser restaurado em ${conn.type}.`);

    log(`Restauração iniciada: "${h.file_name}" -> ${conn.name} / ${opts.targetDb}`);
    logger.info(`Restaurando ${h.file_name} em ${conn.name}/${opts.targetDb}`);
    const file = await prepareFile(h, opts.password || null, log, tmpDir);
    await engine.restore(conn, file, opts.targetDb, { log, sourceDatabase: opts.sourceDb || h.database_name });
    log('Restauração concluída com sucesso!');
    logger.info('Restauração concluída: ' + opts.targetDb);
    return { ok: true, log: lines.join('\n') };
  } catch (e) {
    log('ERRO: ' + e.message);
    logger.error('Restauração: ' + e.message);
    return { ok: false, error: e.message, log: lines.join('\n') };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Exclui manualmente um item do histórico (opcionalmente apagando os arquivos). */
async function deleteHistoryEntry(id, deleteFiles) {
  const h = db.getHistory(id);
  if (!h) return;
  if (deleteFiles) await purgeEntry(h, 'excluído manualmente');
  db.deleteHistory(id);
  bus.emit('history:changed');
}

module.exports = { runJob, restore, deleteHistoryEntry, isRunning, runningJobs };
