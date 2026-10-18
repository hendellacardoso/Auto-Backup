// Barramento de eventos interno (progresso de backup, histórico atualizado...)
const { EventEmitter } = require('events');
const bus = new EventEmitter();
bus.setMaxListeners(50);
module.exports = bus;
