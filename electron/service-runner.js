// Ponto de entrada do SERVIÇO do Windows (executado via WinSW com ELECTRON_RUN_AS_NODE=1).
// Não possui janela nem bandeja: apenas carrega o agendador e executa os backups.
process.env.API2DEV_SERVICE = '1';

const db = require('./core/database');
const scheduler = require('./core/scheduler');
const logger = require('./core/logger');

process.on('uncaughtException', (e) => logger.error('Exceção não tratada: ' + (e.stack || e.message)));
process.on('unhandledRejection', (e) => logger.error('Promise rejeitada: ' + (e && (e.stack || e.message))));

db.init();
scheduler.start();
logger.info('Serviço API2Dev Backup iniciado.');

function shutdown() {
  logger.info('Serviço API2Dev Backup finalizando.');
  scheduler.stop();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);

// mantém o processo vivo
setInterval(() => {}, 1 << 30);
