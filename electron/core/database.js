// Banco de dados local (SQLite) - configurações, conexões, tarefas e histórico.
const Database = require('better-sqlite3');
const { DB_FILE, DEFAULT_BACKUP_DIR } = require('./paths');
const { encrypt, decrypt } = require('./crypto');

let db;

function init() {
  if (db) return db;
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL CHECK (type IN ('sqlserver','postgres','mysql','oracle')),
      host         TEXT NOT NULL DEFAULT 'localhost',
      port         INTEGER,
      instance     TEXT,
      auth_type    TEXT NOT NULL DEFAULT 'sql',
      username     TEXT,
      password     TEXT,
      service_name TEXT,
      options      TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      connection_id    INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      databases        TEXT NOT NULL DEFAULT '[]',
      schedule_type    TEXT NOT NULL DEFAULT 'horarios',
      times            TEXT NOT NULL DEFAULT '["02:00"]',
      weekdays         TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
      interval_minutes INTEGER NOT NULL DEFAULT 60,
      zip              INTEGER NOT NULL DEFAULT 1,
      zip_password     TEXT,
      max_per_day      INTEGER NOT NULL DEFAULT 0,
      retention_days   INTEGER NOT NULL DEFAULT 30,
      upload_gdrive    INTEGER NOT NULL DEFAULT 0,
      upload_ftp       INTEGER NOT NULL DEFAULT 0,
      keep_local       INTEGER NOT NULL DEFAULT 1,
      notify           TEXT NOT NULL DEFAULT 'erro',
      enabled          INTEGER NOT NULL DEFAULT 1,
      last_run         TEXT,
      last_status      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id          INTEGER,
      job_name        TEXT,
      connection_id   INTEGER,
      connection_name TEXT,
      db_type         TEXT,
      database_name   TEXT,
      trigger_type    TEXT DEFAULT 'agendado',
      started_at      TEXT NOT NULL,
      finished_at     TEXT,
      status          TEXT NOT NULL DEFAULT 'executando',
      file_path       TEXT,
      file_name       TEXT,
      file_size       INTEGER DEFAULT 0,
      zipped          INTEGER DEFAULT 0,
      zip_password    TEXT,
      gdrive_file_id  TEXT,
      ftp_path        TEXT,
      local_deleted   INTEGER DEFAULT 0,
      purged          INTEGER DEFAULT 0,
      message         TEXT,
      log             TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_history_job  ON history(job_id, database_name, started_at);
    CREATE INDEX IF NOT EXISTS ix_history_date ON history(started_at);
  `);

  // Valores padrão
  const defaults = {
    general: {
      backupDir: DEFAULT_BACKUP_DIR,
      startWithWindows: true,
      startMinimized: true,
      closeToTray: true,
      binPaths: { sqlcmd: '', pg_dump: '', pg_restore: '', psql: '', mysqldump: '', mysql: '', expdp: '', impdp: '' }
    },
    gdrive: { enabled: false, clientId: '', clientSecret: '', folderName: 'API2Dev Backup', folderId: '', tokens: '', account: '' },
    ftp: { enabled: false, host: '', port: 21, user: '', password: '', secure: false, remoteDir: '/backups' },
    email: { enabled: false, host: '', port: 587, secure: false, user: '', password: '', from: '', to: '' }
  };
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) ins.run(k, JSON.stringify(v));
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('config_version', '1')").run();

  // Backups que ficaram "executando" (app/serviço encerrado no meio) viram erro
  db.prepare(`UPDATE history SET status='erro', message='Interrompido (aplicação encerrada durante o backup)',
              finished_at=datetime('now','localtime') WHERE status='executando'`).run();
  return db;
}

// ------------------------------------------------------------------ settings
const SECRET_FIELDS = { gdrive: ['clientSecret', 'tokens'], ftp: ['password'], email: ['password'] };

function getSettings(key) {
  const row = init().prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return null;
  const val = JSON.parse(row.value);
  for (const f of SECRET_FIELDS[key] || []) if (val[f]) val[f] = decrypt(val[f]);
  return val;
}

function saveSettings(key, value) {
  const current = getSettings(key) || {};
  const merged = { ...current, ...value };
  const toSave = { ...merged };
  for (const f of SECRET_FIELDS[key] || []) if (toSave[f]) toSave[f] = encrypt(toSave[f]);
  init().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(toSave));
  bumpVersion();
  return merged;
}

function bumpVersion() {
  init().prepare("UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key='config_version'").run();
}
function getVersion() {
  return Number(init().prepare("SELECT value FROM settings WHERE key='config_version'").get().value);
}

// --------------------------------------------------------------- connections
function mapConnection(r) {
  if (!r) return null;
  return { ...r, password: decrypt(r.password), options: JSON.parse(r.options || '{}') };
}

function listConnections() {
  return init().prepare('SELECT * FROM connections ORDER BY name').all().map(mapConnection);
}
function getConnection(id) {
  return mapConnection(init().prepare('SELECT * FROM connections WHERE id=?').get(id));
}
function saveConnection(c) {
  const data = {
    name: c.name, type: c.type, host: c.host || 'localhost', port: c.port ? Number(c.port) : null,
    instance: c.instance || null, auth_type: c.auth_type || 'sql', username: c.username || null,
    password: encrypt(c.password || ''), service_name: c.service_name || null,
    options: JSON.stringify(c.options || {})
  };
  if (c.id) {
    init().prepare(`UPDATE connections SET name=@name, type=@type, host=@host, port=@port, instance=@instance,
      auth_type=@auth_type, username=@username, password=@password, service_name=@service_name, options=@options
      WHERE id=@id`).run({ ...data, id: c.id });
  } else {
    c.id = init().prepare(`INSERT INTO connections (name,type,host,port,instance,auth_type,username,password,service_name,options)
      VALUES (@name,@type,@host,@port,@instance,@auth_type,@username,@password,@service_name,@options)`).run(data).lastInsertRowid;
  }
  bumpVersion();
  return getConnection(c.id);
}
function deleteConnection(id) {
  init().prepare('DELETE FROM connections WHERE id=?').run(id);
  bumpVersion();
}

// ---------------------------------------------------------------------- jobs
function mapJob(r) {
  if (!r) return null;
  return {
    ...r,
    databases: JSON.parse(r.databases || '[]'),
    times: JSON.parse(r.times || '[]'),
    weekdays: JSON.parse(r.weekdays || '[]'),
    zip: !!r.zip, upload_gdrive: !!r.upload_gdrive, upload_ftp: !!r.upload_ftp,
    keep_local: !!r.keep_local, enabled: !!r.enabled,
    zip_password: decrypt(r.zip_password)
  };
}
function listJobs() {
  return init().prepare(`SELECT j.*, c.name AS connection_name, c.type AS db_type
    FROM jobs j JOIN connections c ON c.id = j.connection_id ORDER BY j.name`).all().map(mapJob);
}
function getJob(id) {
  return mapJob(init().prepare(`SELECT j.*, c.name AS connection_name, c.type AS db_type
    FROM jobs j JOIN connections c ON c.id = j.connection_id WHERE j.id=?`).get(id));
}
function saveJob(j) {
  const data = {
    name: j.name, connection_id: Number(j.connection_id),
    databases: JSON.stringify(j.databases || []),
    schedule_type: j.schedule_type || 'horarios',
    times: JSON.stringify(j.times || []),
    weekdays: JSON.stringify(j.weekdays || []),
    interval_minutes: Number(j.interval_minutes) || 60,
    zip: j.zip ? 1 : 0, zip_password: encrypt(j.zip_password || ''),
    max_per_day: Number(j.max_per_day) || 0,
    retention_days: Number(j.retention_days) || 0,
    upload_gdrive: j.upload_gdrive ? 1 : 0, upload_ftp: j.upload_ftp ? 1 : 0,
    keep_local: j.keep_local === false ? 0 : 1,
    notify: j.notify || 'erro', enabled: j.enabled === false ? 0 : 1
  };
  if (j.id) {
    init().prepare(`UPDATE jobs SET name=@name, connection_id=@connection_id, databases=@databases,
      schedule_type=@schedule_type, times=@times, weekdays=@weekdays, interval_minutes=@interval_minutes,
      zip=@zip, zip_password=@zip_password, max_per_day=@max_per_day, retention_days=@retention_days,
      upload_gdrive=@upload_gdrive, upload_ftp=@upload_ftp, keep_local=@keep_local, notify=@notify, enabled=@enabled
      WHERE id=@id`).run({ ...data, id: j.id });
  } else {
    j.id = init().prepare(`INSERT INTO jobs (name,connection_id,databases,schedule_type,times,weekdays,interval_minutes,
      zip,zip_password,max_per_day,retention_days,upload_gdrive,upload_ftp,keep_local,notify,enabled)
      VALUES (@name,@connection_id,@databases,@schedule_type,@times,@weekdays,@interval_minutes,
      @zip,@zip_password,@max_per_day,@retention_days,@upload_gdrive,@upload_ftp,@keep_local,@notify,@enabled)`)
      .run(data).lastInsertRowid;
  }
  bumpVersion();
  return getJob(j.id);
}
function deleteJob(id) {
  init().prepare('DELETE FROM jobs WHERE id=?').run(id);
  bumpVersion();
}
function setJobLastRun(id, status) {
  init().prepare("UPDATE jobs SET last_run=datetime('now','localtime'), last_status=? WHERE id=?").run(status, id);
}

// ------------------------------------------------------------------- history
function mapHistory(r) {
  if (!r) return null;
  return { ...r, zip_password: decrypt(r.zip_password), zipped: !!r.zipped, local_deleted: !!r.local_deleted };
}
function addHistory(h) {
  return init().prepare(`INSERT INTO history (job_id,job_name,connection_id,connection_name,db_type,database_name,trigger_type,started_at,status)
    VALUES (@job_id,@job_name,@connection_id,@connection_name,@db_type,@database_name,@trigger_type,datetime('now','localtime'),'executando')`)
    .run(h).lastInsertRowid;
}
function updateHistory(id, fields) {
  const f = { ...fields };
  if ('zip_password' in f) f.zip_password = encrypt(f.zip_password || '');
  const cols = Object.keys(f);
  if (!cols.length) return;
  init().prepare(`UPDATE history SET ${cols.map((c) => `${c}=@${c}`).join(', ')} WHERE id=@__id`).run({ ...f, __id: id });
}
function finishHistory(id, fields) {
  updateHistory(id, fields);
  init().prepare("UPDATE history SET finished_at=datetime('now','localtime') WHERE id=?").run(id);
}
function getHistory(id) {
  return mapHistory(init().prepare('SELECT * FROM history WHERE id=?').get(id));
}
function listHistory(filter = {}) {
  const where = [];
  const p = {};
  if (filter.jobId) { where.push('job_id=@jobId'); p.jobId = filter.jobId; }
  if (filter.status) { where.push('status=@status'); p.status = filter.status; }
  if (filter.dateFrom) { where.push('date(started_at) >= @dateFrom'); p.dateFrom = filter.dateFrom; }
  if (filter.dateTo) { where.push('date(started_at) <= @dateTo'); p.dateTo = filter.dateTo; }
  if (filter.search) { where.push('(database_name LIKE @s OR job_name LIKE @s OR connection_name LIKE @s)'); p.s = `%${filter.search}%`; }
  const sql = `SELECT id,job_id,job_name,connection_id,connection_name,db_type,database_name,trigger_type,started_at,finished_at,
    status,file_path,file_name,file_size,zipped,gdrive_file_id,ftp_path,local_deleted,purged,message
    FROM history ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ${Number(filter.limit) || 500}`;
  return init().prepare(sql).all(p).map((r) => ({ ...r, zipped: !!r.zipped, local_deleted: !!r.local_deleted, purged: !!r.purged }));
}
function deleteHistory(id) {
  init().prepare('DELETE FROM history WHERE id=?').run(id);
}
function successfulBackupsOfDay(jobId, database, dateStr) {
  return init().prepare(`SELECT * FROM history WHERE job_id=? AND database_name=? AND status IN ('sucesso','aviso')
    AND date(started_at)=? AND purged=0 ORDER BY started_at ASC`).all(jobId, database, dateStr).map(mapHistory);
}
function backupsOlderThan(jobId, days) {
  return init().prepare(`SELECT * FROM history WHERE job_id=? AND status IN ('sucesso','aviso') AND purged=0
    AND date(started_at) < date('now','localtime', ?)`).all(jobId, `-${Number(days)} days`).map(mapHistory);
}
function stats() {
  const d = init();
  return {
    today: d.prepare("SELECT COUNT(*) n FROM history WHERE date(started_at)=date('now','localtime')").get().n,
    todayOk: d.prepare("SELECT COUNT(*) n FROM history WHERE status IN ('sucesso','aviso') AND date(started_at)=date('now','localtime')").get().n,
    todayErr: d.prepare("SELECT COUNT(*) n FROM history WHERE status='erro' AND date(started_at)=date('now','localtime')").get().n,
    totalSize: d.prepare("SELECT COALESCE(SUM(file_size),0) n FROM history WHERE status IN ('sucesso','aviso') AND local_deleted=0").get().n,
    jobs: d.prepare('SELECT COUNT(*) n FROM jobs WHERE enabled=1').get().n,
    connections: d.prepare('SELECT COUNT(*) n FROM connections').get().n,
    last7: d.prepare(`SELECT date(started_at) dia,
        SUM(CASE WHEN status IN ('sucesso','aviso') THEN 1 ELSE 0 END) ok,
        SUM(CASE WHEN status='erro' THEN 1 ELSE 0 END) erro
      FROM history WHERE date(started_at) >= date('now','localtime','-6 days') GROUP BY date(started_at) ORDER BY dia`).all()
  };
}

module.exports = {
  init, getSettings, saveSettings, getVersion, bumpVersion,
  listConnections, getConnection, saveConnection, deleteConnection,
  listJobs, getJob, saveJob, deleteJob, setJobLastRun,
  addHistory, updateHistory, finishHistory, getHistory, listHistory, deleteHistory,
  successfulBackupsOfDay, backupsOlderThan, stats
};
