// Ponte com o processo principal (Electron). Em navegador comum (vite sem electron) usa um stub.
const bridge = window.api || {
  invoke: async () => ({ ok: false, error: 'Execute pelo Electron (npm run dev).' }),
  on: () => () => {}
};

export async function call(channel, ...args) {
  const r = await bridge.invoke(channel, ...args);
  if (!r || !r.ok) throw new Error((r && r.error) || 'Erro desconhecido');
  return r.data;
}

export const on = (event, cb) => bridge.on(event, cb);

export const DB_TYPES = {
  sqlserver: { label: 'SQL Server', port: 1433, color: '#e11d48' },
  postgres: { label: 'PostgreSQL', port: 5432, color: '#2563eb' },
  mysql: { label: 'MySQL / MariaDB', port: 3306, color: '#ea580c' },
  oracle: { label: 'Oracle', port: 1521, color: '#dc2626' }
};

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function fmtSize(n) {
  if (!n) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return (n / Math.pow(1024, i)).toFixed(i ? 2 : 0) + ' ' + u[i];
}

export function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (isNaN(d)) return s;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function duration(a, b) {
  if (!a || !b) return '-';
  const ms = new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'));
  if (isNaN(ms)) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'min ' + (s % 60) + 's';
}
