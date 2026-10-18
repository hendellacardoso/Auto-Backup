import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, HardDrive, CalendarClock, Play, Loader2, RefreshCw } from 'lucide-react';
import { call, on, fmtDate, fmtSize } from '../api';
import { useToast, StatusPill, DbTag, LogView } from '../components/ui.jsx';

export default function Dashboard({ info }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [recent, setRecent] = useState([]);
  const [lines, setLines] = useState([]);
  const logRef = useRef(null);

  const load = () => {
    call('app:stats').then(setStats).catch(() => {});
    call('jobs:list').then(setJobs).catch(() => {});
    call('history:list', { limit: 8 }).then(setRecent).catch(() => {});
  };

  useEffect(() => {
    load();
    const offs = [
      on('history:changed', load),
      on('job:state', load),
      on('backup:log', (d) => setLines((l) => [...l.slice(-400), `${d.database}: ${d.line}`]))
    ];
    const t = setInterval(load, 30000);
    return () => { offs.forEach((o) => o()); clearInterval(t); };
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [lines]);

  const run = async (j) => {
    try { await call('jobs:run', j.id); toast(`Tarefa "${j.name}" iniciada.`, 'success'); setTimeout(load, 500); } catch (e) { toast(e.message, 'error'); }
  };

  // gráfico dos últimos 7 dias
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = (stats && stats.last7.find((x) => x.dia === key)) || { ok: 0, erro: 0 };
    days.push({ label: d.toLocaleDateString('pt-BR', { weekday: 'short' }), ...row });
  }
  const max = Math.max(1, ...days.map((d) => d.ok + d.erro));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Painel</h1>
          <p>
            {info && info.schedulerMode === 'servico'
              ? 'Os agendamentos estão sendo executados pelo serviço do Windows.'
              : 'Os agendamentos estão sendo executados por este aplicativo (bandeja do sistema).'}
          </p>
        </div>
        <button className="btn" onClick={load}><RefreshCw size={16} /> Atualizar</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat icon={<CheckCircle2 color="#16a34a" />} bg="#dcfce7" value={stats ? stats.todayOk : '-'} label="Backups com sucesso hoje" />
        <Stat icon={<XCircle color="#dc2626" />} bg="#fee2e2" value={stats ? stats.todayErr : '-'} label="Falhas hoje" />
        <Stat icon={<CalendarClock color="#1d6fe0" />} bg="#e0edff" value={stats ? stats.jobs : '-'} label="Tarefas ativas" />
        <Stat icon={<HardDrive color="#7c3aed" />} bg="#ede9fe" value={stats ? fmtSize(stats.totalSize) : '-'} label="Espaço em backups locais" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card"><div className="card-body">
          <div className="card-title">Últimos 7 dias</div>
          <div className="bars">
            {days.map((d, i) => (
              <div className="bar" key={i} title={`${d.ok} sucesso / ${d.erro} erro`}>
                <small>{d.ok + d.erro || ''}</small>
                <div className="stack" style={{ height: `${((d.ok + d.erro) / max) * 100}%` }}>
                  <div style={{ background: '#16a34a', height: `${(d.ok / Math.max(1, d.ok + d.erro)) * 100}%` }} />
                  <div style={{ background: '#dc2626', height: `${(d.erro / Math.max(1, d.ok + d.erro)) * 100}%` }} />
                </div>
                <small>{d.label}</small>
              </div>
            ))}
          </div>
          <div className="flex small muted" style={{ marginTop: 8 }}>
            <span className="pill green">Sucesso</span><span className="pill red">Erro</span>
          </div>
        </div></div>

        <div className="card"><div className="card-body">
          <div className="card-title">Execução em tempo real</div>
          <LogView lines={lines} refEl={logRef} />
        </div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ paddingBottom: 0 }}><div className="card-title">Tarefas agendadas</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tarefa</th><th>Banco</th><th>Bases</th><th>Última execução</th><th>Próxima execução</th><th></th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><b>{j.name}</b>{!j.enabled && <span className="pill gray" style={{ marginLeft: 6 }}>Desativada</span>}</td>
                  <td><DbTag type={j.db_type} /> <span className="small muted">{j.connection_name}</span></td>
                  <td>{j.databases.length}</td>
                  <td>{j.last_run ? <>{fmtDate(j.last_run)} <StatusPill status={j.last_status} /></> : '-'}</td>
                  <td>{j.enabled ? fmtDate(j.next_run) : '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sm primary" disabled={j.running} onClick={() => run(j)}>
                      {j.running ? <Loader2 size={14} className="spin" /> : <Play size={14} />} {j.running ? 'Executando' : 'Executar'}
                    </button>
                  </td>
                </tr>
              ))}
              {!jobs.length && <tr><td colSpan={6} className="empty">Nenhuma tarefa cadastrada. Comece criando uma conexão e uma tarefa.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 0 }}><div className="card-title">Backups recentes</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Tarefa</th><th>Banco de dados</th><th>Status</th><th>Tamanho</th><th>Mensagem</th></tr></thead>
            <tbody>
              {recent.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDate(h.started_at)}</td>
                  <td>{h.job_name}</td>
                  <td><b>{h.database_name}</b></td>
                  <td><StatusPill status={h.status} /></td>
                  <td>{fmtSize(h.file_size)}</td>
                  <td className="small muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.message}>{h.message}</td>
                </tr>
              ))}
              {!recent.length && <tr><td colSpan={6} className="empty">Nenhum backup realizado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, bg, value, label }) {
  return (
    <div className="card"><div className="card-body stat">
      <div className="icon" style={{ background: bg }}>{icon}</div>
      <div><div className="value">{value}</div><div className="label">{label}</div></div>
    </div></div>
  );
}
