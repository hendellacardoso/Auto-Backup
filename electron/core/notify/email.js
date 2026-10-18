// Notificação por e-mail (SMTP) usando nodemailer
const nodemailer = require('nodemailer');
const os = require('os');
const db = require('../database');

function transport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host, port: Number(cfg.port) || 587, secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
    tls: { rejectUnauthorized: false }
  });
}

async function send(subject, html, override) {
  const cfg = { ...db.getSettings('email'), ...(override || {}) };
  if (!cfg.host || !cfg.to) throw new Error('E-mail: configure servidor SMTP e destinatários.');
  await transport(cfg).sendMail({
    from: cfg.from || cfg.user, to: cfg.to, subject: `[API2Dev Backup] ${subject}`, html
  });
}

function fmtSize(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return (n / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + u[i];
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function jobReport(job, results) {
  const ok = results.every((r) => r.status !== 'erro');
  const rows = results.map((r) => `
    <tr>
      <td style="padding:6px;border:1px solid #ddd">${esc(r.database)}</td>
      <td style="padding:6px;border:1px solid #ddd;color:${r.status === 'erro' ? '#c62828' : r.status === 'aviso' ? '#ef6c00' : '#2e7d32'}"><b>${esc(r.status.toUpperCase())}</b></td>
      <td style="padding:6px;border:1px solid #ddd">${esc(r.fileName || '-')}</td>
      <td style="padding:6px;border:1px solid #ddd">${fmtSize(r.size)}</td>
      <td style="padding:6px;border:1px solid #ddd">${esc(r.message || '')}</td>
    </tr>`).join('');
  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">
    <h2 style="color:${ok ? '#2e7d32' : '#c62828'}">Backup ${ok ? 'concluído' : 'com falhas'}: ${esc(job.name)}</h2>
    <p>Conexão: <b>${esc(job.connection_name)}</b> (${esc(job.db_type)})<br>Computador: ${esc(os.hostname())}<br>Data: ${new Date().toLocaleString('pt-BR')}</p>
    <table style="border-collapse:collapse">
      <tr style="background:#f1f5f9"><th style="padding:6px;border:1px solid #ddd">Banco</th><th style="padding:6px;border:1px solid #ddd">Status</th>
      <th style="padding:6px;border:1px solid #ddd">Arquivo</th><th style="padding:6px;border:1px solid #ddd">Tamanho</th><th style="padding:6px;border:1px solid #ddd">Mensagem</th></tr>
      ${rows}
    </table>
    <p style="color:#888;font-size:12px;margin-top:24px">API2Dev Backup &middot; suporte@api2dev.com.br</p>
  </div>`;
  return { subject: `${ok ? 'Sucesso' : 'FALHA'} - ${job.name}`, html, ok };
}

module.exports = { send, jobReport, fmtSize };
