// Agendador de tarefas de backup (node-cron para horários fixos e timer para intervalos).
const cron = require('node-cron');
const db = require('./database');
const runner = require('./backup-runner');
const logger = require('./logger');
const bus = require('./events');

let tasks = [];        // { jobId, stop(), next() }
let watcher = null;
let loadedVersion = -1;
let active = false;

function clear() {
  tasks.forEach((t) => t.stop());
  tasks = [];
}

function fire(job) {
  const general = db.getSettings('general');
  if (general.schedulerPaused) { logger.info(`Agendamento pausado - tarefa "${job.name}" ignorada.`); return; }
  if (runner.isRunning(job.id)) { logger.warn(`Tarefa "${job.name}" ainda em execução - disparo ignorado.`); return; }
  runner.runJob(job.id, 'agendado').catch((e) => logger.error(`Tarefa "${job.name}": ${e.message}`));
}

function nextForTimes(times, weekdays, from = new Date()) {
  for (let add = 0; add < 8; add++) {
    const d = new Date(from);
    d.setDate(d.getDate() + add);
    if (!weekdays.includes(d.getDay())) continue;
    const sorted = [...times].sort();
    for (const t of sorted) {
      const [h, m] = t.split(':').map(Number);
      const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
      if (c > from) return c;
    }
  }
  return null;
}

function load() {
  clear();
  loadedVersion = db.getVersion();
  const jobs = db.listJobs().filter((j) => j.enabled);
  for (const job of jobs) {
    if (job.schedule_type === 'intervalo') {
      const ms = Math.max(5, Number(job.interval_minutes) || 60) * 60000;
      let nextAt = Date.now() + ms;
      const timer = setInterval(() => { nextAt = Date.now() + ms; fire(job); }, ms);
      tasks.push({ jobId: job.id, stop: () => clearInterval(timer), next: () => new Date(nextAt) });
    } else {
      const weekdays = job.weekdays && job.weekdays.length ? job.weekdays : [0, 1, 2, 3, 4, 5, 6];
      const times = (job.times || []).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
      const crons = times.map((t) => {
        const [h, m] = t.split(':').map(Number);
        return cron.schedule(`${m} ${h} * * ${weekdays.join(',')}`, () => fire(job));
      });
      tasks.push({ jobId: job.id, stop: () => crons.forEach((c) => c.stop()), next: () => nextForTimes(times, weekdays) });
    }
  }
  logger.info(`Agendador carregado: ${tasks.length} tarefa(s) ativa(s).`);
  bus.emit('scheduler:reloaded');
}

function start() {
  if (active) return;
  active = true;
  load();
  // Recarrega automaticamente quando a configuração muda (app <-> serviço compartilham o SQLite)
  watcher = setInterval(() => {
    try { if (db.getVersion() !== loadedVersion) load(); } catch (e) { logger.error('Agendador: ' + e.message); }
  }, 10000);
}

function stop() {
  active = false;
  clear();
  if (watcher) clearInterval(watcher);
  watcher = null;
}

function reload() { if (active) load(); }
function isActive() { return active; }

function nextRuns() {
  const out = {};
  for (const t of tasks) {
    const n = t.next();
    if (n && (!out[t.jobId] || n < out[t.jobId])) out[t.jobId] = n;
  }
  for (const k of Object.keys(out)) out[k] = out[k].toISOString();
  return out;
}

module.exports = { start, stop, reload, isActive, nextRuns, nextForTimes };
