// Processo principal do Electron: janela, bandeja (systray), inicialização com o Windows e IPC.
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const db = require('./core/database');
const scheduler = require('./core/scheduler');
const runner = require('./core/backup-runner');
const bus = require('./core/events');
const logger = require('./core/logger');
const paths = require('./core/paths');
const { getEngine } = require('./core/engines');
const gdrive = require('./core/destinations/gdrive');
const ftp = require('./core/destinations/ftp');
const email = require('./core/notify/email');
const service = require('./service-manager');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const START_HIDDEN = process.argv.includes('--hidden');
const ICON = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const TRAY_ICON = path.join(__dirname, '..', 'build', 'tray.png');

let win = null;
let tray = null;
let quitting = false;
let serviceRunning = false;

// ------------------------------------------------------------ instância única
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('br.com.api2dev.backup');

function createWindow(show) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'API2Dev Backup',
    icon: ICON,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenu(null);

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.once('ready-to-show', () => { if (show) win.show(); });

  win.on('close', (e) => {
    const general = db.getSettings('general');
    if (!quitting && general.closeToTray !== false) {
      e.preventDefault();
      win.hide();
      if (!global.__trayHintShown && tray && process.platform === 'win32') {
        tray.displayBalloon({ iconType: 'info', title: 'API2Dev Backup', content: 'O backup continua rodando na bandeja do sistema.' });
        global.__trayHintShown = true;
      }
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function showWindow(route) {
  if (!win) createWindow(true);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (route) win.webContents.send('navigate', route);
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

// ---------------------------------------------------------------- bandeja
function buildTrayMenu() {
  if (!tray) return;
  const general = db.getSettings('general');
  const jobs = db.listJobs();
  const modo = serviceRunning ? 'Serviço do Windows' : 'Aplicativo (bandeja)';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'API2Dev Backup', enabled: false, icon: nativeImage.createFromPath(TRAY_ICON).resize({ width: 16, height: 16 }) },
    { label: `Agendador: ${modo}${general.schedulerPaused ? ' (PAUSADO)' : ''}`, enabled: false },
    { type: 'separator' },
    { label: 'Abrir painel', click: () => showWindow('/') },
    {
      label: 'Executar backup agora',
      submenu: jobs.length
        ? jobs.map((j) => ({
          label: j.name + (runner.isRunning(j.id) ? ' (executando...)' : ''),
          enabled: !runner.isRunning(j.id),
          click: () => runner.runJob(j.id, 'manual').catch((e) => notify('Erro', e.message))
        }))
        : [{ label: 'Nenhuma tarefa cadastrada', enabled: false }]
    },
    { label: 'Histórico de backups', click: () => showWindow('/historico') },
    { type: 'separator' },
    {
      label: general.schedulerPaused ? 'Retomar agendamentos' : 'Pausar agendamentos',
      click: () => { db.saveSettings('general', { schedulerPaused: !general.schedulerPaused }); buildTrayMenu(); }
    },
    { label: 'Abrir pasta de backups', click: () => shell.openPath(general.backupDir) },
    { type: 'separator' },
    { label: 'Sobre', click: () => showWindow('/sobre') },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.setToolTip(`API2Dev Backup\nAgendador: ${modo}${general.schedulerPaused ? ' - pausado' : ''}${runner.runningJobs().length ? '\nBackup em execução...' : ''}`);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.on('double-click', () => showWindow());
  tray.on('click', () => showWindow());
  buildTrayMenu();
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show();
}

// ------------------------------------------- agendador: app x serviço
// Se o serviço do Windows estiver rodando, ele executa os agendamentos e o app apenas gerencia.
async function syncSchedulerMode() {
  try {
    const st = await service.status();
    serviceRunning = st.running;
  } catch (_) { serviceRunning = false; }
  if (serviceRunning && scheduler.isActive()) {
    scheduler.stop();
    logger.info('Serviço do Windows ativo: agendador do app desativado.');
  } else if (!serviceRunning && !scheduler.isActive()) {
    scheduler.start();
  }
  buildTrayMenu();
}

function applyLoginItem() {
  const general = db.getSettings('general');
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: !!general.startWithWindows,
    // na versão portátil o executável real é o .exe portátil (o process.execPath é uma pasta temporária)
    path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: ['--hidden']
  });
}

// --------------------------------------------------------------------- IPC
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      logger.error(`${channel}: ${e.message}`);
      return { ok: false, error: e.message };
    }
  });
}

function registerIpc() {
  // Configurações
  handle('settings:get', (key) => db.getSettings(key));
  handle('settings:save', (key, value) => {
    const r = db.saveSettings(key, value);
    if (key === 'general') { applyLoginItem(); buildTrayMenu(); }
    return r;
  });

  // Conexões
  handle('connections:list', () => db.listConnections());
  handle('connections:save', (c) => { const r = db.saveConnection(c); buildTrayMenu(); return r; });
  handle('connections:delete', (id) => db.deleteConnection(id));
  handle('connections:test', (c) => getEngine(c.type).testConnection(c));
  handle('connections:databases', (c) => getEngine(c.type).listDatabases(c));

  // Tarefas
  handle('jobs:list', () => {
    const next = scheduler.isActive() ? scheduler.nextRuns() : {};
    return db.listJobs().map((j) => {
      let nextRun = next[j.id] || null;
      if (!nextRun && j.enabled && j.schedule_type !== 'intervalo') {
        const n = scheduler.nextForTimes(j.times || [], j.weekdays || []);
        nextRun = n ? n.toISOString() : null;
      }
      return { ...j, running: runner.isRunning(j.id), next_run: nextRun };
    });
  });
  handle('jobs:save', (j) => { const r = db.saveJob(j); scheduler.reload(); buildTrayMenu(); return r; });
  handle('jobs:delete', (id) => { db.deleteJob(id); scheduler.reload(); buildTrayMenu(); });
  handle('jobs:run', (id) => {
    runner.runJob(id, 'manual').catch((e) => notify('Erro no backup', e.message));
    return true;
  });

  // Histórico / restauração
  handle('history:list', (filter) => db.listHistory(filter || {}));
  handle('history:get', (id) => { const h = db.getHistory(id); if (h) delete h.zip_password; return h; });
  handle('history:delete', (id, deleteFiles) => runner.deleteHistoryEntry(id, deleteFiles));
  handle('history:showFile', (id) => {
    const h = db.getHistory(id);
    if (h && h.file_path && fs.existsSync(h.file_path)) shell.showItemInFolder(h.file_path);
    else throw new Error('Arquivo local não encontrado.');
  });
  handle('restore:run', (opts) => runner.restore(opts));

  // Diálogos
  handle('dialog:selectFolder', async (def) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: def || undefined });
    return r.canceled ? null : r.filePaths[0];
  });
  handle('dialog:selectFile', async (filters) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] });
    return r.canceled ? null : r.filePaths[0];
  });

  // Destinos e e-mail
  handle('gdrive:authorize', () => gdrive.authorize((url) => shell.openExternal(url)));
  handle('gdrive:disconnect', () => gdrive.disconnect());
  handle('gdrive:test', () => gdrive.test());
  handle('ftp:test', (override) => ftp.test(override));
  handle('email:test', (override) => email.send('E-mail de teste',
    '<p style="font-family:Segoe UI">Este é um e-mail de teste do <b>API2Dev Backup</b>. As notificações estão funcionando!</p>', override));

  // Serviço do Windows
  handle('service:status', () => service.status());
  handle('service:install', async () => { const r = await service.install(); await syncSchedulerMode(); return r; });
  handle('service:uninstall', async () => { const r = await service.uninstall(); await syncSchedulerMode(); return r; });
  handle('service:start', async () => { const r = await service.start(); await syncSchedulerMode(); return r; });
  handle('service:stop', async () => { const r = await service.stop(); await syncSchedulerMode(); return r; });

  // Aplicativo
  handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: paths.DATA_DIR,
    logDir: paths.LOG_DIR,
    schedulerMode: serviceRunning ? 'servico' : 'app',
    paused: !!db.getSettings('general').schedulerPaused,
    platform: process.platform,
    portable: !!process.env.PORTABLE_EXECUTABLE_FILE
  }));
  handle('app:stats', () => db.stats());
  handle('app:openExternal', (url) => shell.openExternal(url));
  handle('app:openPath', (p) => shell.openPath(p));
}

// ----------------------------------------------------------------- eventos
function wireEvents() {
  bus.on('backup:log', (d) => send('backup:log', d));
  bus.on('restore:log', (d) => send('restore:log', d));
  bus.on('history:changed', () => send('history:changed'));
  bus.on('scheduler:reloaded', () => { send('scheduler:reloaded'); buildTrayMenu(); });
  bus.on('job:state', (d) => {
    send('job:state', d);
    buildTrayMenu();
    if (!d.running && (!win || !win.isVisible())) {
      const job = db.getJob(d.jobId);
      if (job && d.status === 'erro') notify('Falha no backup', `A tarefa "${job.name}" terminou com erro.`);
      else if (job && d.status === 'aviso') notify('Backup com avisos', `A tarefa "${job.name}" terminou com avisos.`);
    }
  });
}

// ------------------------------------------------------------------ início
app.whenReady().then(async () => {
  if (!gotLock) return;
  process.on('uncaughtException', (e) => logger.error('Exceção não tratada: ' + (e.stack || e.message)));
  db.init();
  registerIpc();
  wireEvents();
  createTray();

  const general = db.getSettings('general');
  const showOnStart = !(START_HIDDEN && general.startMinimized !== false);
  createWindow(showOnStart);
  applyLoginItem();

  await syncSchedulerMode();
  setInterval(syncSchedulerMode, 30000);
  logger.info('Aplicativo iniciado.');
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* continua na bandeja */ });
