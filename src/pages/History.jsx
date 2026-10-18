import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, FileText, FolderOpen, Trash2, Search, Upload, Loader2, Cloud, Server as ServerIcon, HardDrive, AlertTriangle } from 'lucide-react';
import { call, on, fmtDate, fmtSize, duration } from '../api';
import { Modal, Field, Check, StatusPill, DbTag, LogView, useToast } from '../components/ui.jsx';

export default function History() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState({ search: '', status: '', jobId: '', dateFrom: '', dateTo: '' });
  const [logItem, setLogItem] = useState(null);
  const [restoreItem, setRestoreItem] = useState(null);
  const [delItem, setDelItem] = useState(null);

  const load = () => call('history:list', { ...filter, jobId: filter.jobId || undefined }).then(setList).catch((e) => toast(e.message, 'error'));
  useEffect(() => { call('jobs:list').then(setJobs).catch(() => {}); }, []);
  useEffect(() => { load(); }, [filter]);
  useEffect(() => on('history:changed', load), [filter]);

  const f = (k, v) => setFilter((x) => ({ ...x, [k]: v }));
  const openLog = async (h) => { try { setLogItem(await call('history:get', h.id)); } catch (e) { toast(e.message, 'error'); } };
  const showFile = async (h) => { try { await call('history:showFile', h.id); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Histórico de backups</h1><p>Consulte execuções anteriores e restaure backups.</p></div>
        <button className="btn primary" onClick={() => setRestoreItem({ fromFile: true })}><Upload size={16} /> Restaurar de um arquivo</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
        <div className="flex" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="input-group" style={{ flex: 1, minWidth: 220 }}>
            <input className="input" placeholder="Buscar por banco, tarefa ou conexão..." value={filter.search} onChange={(e) => f('search', e.target.value)} />
          </div>
          <select className="input" style={{ width: 200 }} value={filter.jobId} onChange={(e) => f('jobId', e.target.value)}>
            <option value="">Todas as tarefas</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
          <select className="input" style={{ width: 150 }} value={filter.status} onChange={(e) => f('status', e.target.value)}>
            <option value="">Todos status</option>
            <option value="sucesso">Sucesso</option>
            <option value="aviso">Aviso</option>
            <option value="erro">Erro</option>
            <option value="executando">Executando</option>
          </select>
          <input className="input" type="date" style={{ width: 150 }} value={filter.dateFrom} onChange={(e) => f('dateFrom', e.target.value)} />
          <input className="input" type="date" style={{ width: 150 }} value={filter.dateTo} onChange={(e) => f('dateTo', e.target.value)} />
          <Search size={18} className="muted" />
        </div>
      </div></div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Tarefa / Conexão</th><th>Banco</th><th>Status</th><th>Arquivo</th><th>Tamanho</th><th>Locais</th><th>Duração</th><th></th></tr></thead>
          <tbody>
            {list.map((h) => {
              const restorable = ['sucesso', 'aviso'].includes(h.status) && !h.purged;
              return (
                <tr key={h.id} style={h.purged ? { opacity: 0.55 } : null}>
                  <td className="small">{fmtDate(h.started_at)}<div className="muted">{h.trigger_type}</div></td>
                  <td>{h.job_name}<div className="small muted"><DbTag type={h.db_type} /> {h.connection_name}</div></td>
                  <td><b>{h.database_name}</b></td>
                  <td><StatusPill status={h.status} />{h.purged && <div className="small muted">removido</div>}</td>
                  <td className="small" title={h.message}>{h.file_name || <span className="muted">{(h.message || '').slice(0, 60)}</span>}</td>
                  <td>{fmtSize(h.file_size)}</td>
                  <td>
                    <div className="flex" style={{ gap: 4 }}>
                      {h.file_name && !h.local_deleted && <span title="Local"><HardDrive size={16} color="#475569" /></span>}
                      {h.gdrive_file_id && <span title="Google Drive"><Cloud size={16} color="#16a34a" /></span>}
                      {h.ftp_path && <span title={h.ftp_path}><ServerIcon size={16} color="#ea580c" /></span>}
                    </div>
                  </td>
                  <td className="small">{duration(h.started_at, h.finished_at)}</td>
                  <td>
                    <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn sm primary" disabled={!restorable} onClick={() => setRestoreItem(h)} title="Restaurar"><RotateCcw size={14} /></button>
                      <button className="btn sm" onClick={() => openLog(h)} title="Log"><FileText size={14} /></button>
                      <button className="btn sm" disabled={!h.file_name || h.local_deleted} onClick={() => showFile(h)} title="Abrir pasta"><FolderOpen size={14} /></button>
                      <button className="btn sm danger" disabled={h.status === 'executando'} onClick={() => setDelItem(h)} title="Excluir"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={9} className="empty">Nenhum registro encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      {logItem && (
        <Modal size="lg" title={`Log - ${logItem.database_name} (${fmtDate(logItem.started_at)})`} onClose={() => setLogItem(null)}>
          {logItem.message && <div className={`alert ${logItem.status === 'erro' ? 'danger' : logItem.status === 'aviso' ? 'warn' : 'info'}`} style={{ marginBottom: 12 }}>{logItem.message}</div>}
          {logItem.file_path && <p className="small muted">Arquivo: {logItem.file_path}</p>}
          <LogView lines={(logItem.log || '').split('\n').filter(Boolean)} />
        </Modal>
      )}
      {restoreItem && <RestoreModal item={restoreItem} onClose={() => setRestoreItem(null)} />}
      {delItem && <DeleteModal item={delItem} onClose={() => setDelItem(null)} onDone={() => { setDelItem(null); load(); }} />}
    </div>
  );
}

function DeleteModal({ item, onClose, onDone }) {
  const toast = useToast();
  const [files, setFiles] = useState(true);
  const go = async () => {
    try { await call('history:delete', item.id, files); toast('Registro excluído.', 'success'); onDone(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title="Excluir registro do histórico" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn danger" onClick={go}><Trash2 size={14} /> Excluir</button>
    </>}>
      <p>Excluir o registro de <b>{item.database_name}</b> de {fmtDate(item.started_at)}?</p>
      {item.file_name && <Check checked={files} onChange={setFiles} label="Apagar também os arquivos (local, Google Drive e FTP)" />}
    </Modal>
  );
}

function RestoreModal({ item, onClose }) {
  const toast = useToast();
  const [conns, setConns] = useState([]);
  const [form, setForm] = useState({
    connectionId: item.connection_id || '', targetDb: item.database_name || '', sourceDb: item.database_name || '',
    filePath: '', password: ''
  });
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const [result, setResult] = useState(null);
  const logRef = useRef(null);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    call('connections:list').then((l) => {
      const filtered = item.db_type ? l.filter((c) => c.type === item.db_type) : l;
      setConns(filtered);
      if (!form.connectionId && filtered.length) set('connectionId', filtered[0].id);
    });
    return on('restore:log', (d) => setLines((x) => [...x, d.line]));
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [lines]);

  const pickFile = async () => {
    const p = await call('dialog:selectFile', [{ name: 'Backups', extensions: ['zip', 'bak', 'backup', 'sql', 'dmp', 'dump'] }, { name: 'Todos', extensions: ['*'] }]);
    if (p) set('filePath', p);
  };

  const go = async () => {
    if (!form.targetDb) return toast('Informe o banco de destino.', 'error');
    if (item.fromFile && !form.filePath) return toast('Selecione o arquivo de backup.', 'error');
    setRunning(true); setLines([]); setResult(null);
    const r = await call('restore:run', {
      historyId: item.fromFile ? undefined : item.id,
      filePath: item.fromFile ? form.filePath : undefined,
      connectionId: Number(form.connectionId),
      targetDb: form.targetDb.trim(),
      sourceDb: form.sourceDb || form.targetDb,
      password: form.password || undefined
    }).catch((e) => ({ ok: false, error: e.message }));
    setResult(r);
    setRunning(false);
    toast(r.ok ? 'Restauração concluída!' : 'Falha na restauração: ' + r.error, r.ok ? 'success' : 'error');
  };

  const conn = conns.find((c) => c.id === Number(form.connectionId));
  const isZip = item.fromFile ? /\.zip$/i.test(form.filePath) : item.zipped;

  return (
    <Modal size="lg" title="Restaurar backup" onClose={running ? null : onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={running}>Fechar</button>
      <button className="btn primary" onClick={go} disabled={running || !confirm || !conn}>
        {running ? <Loader2 size={16} className="spin" /> : <RotateCcw size={16} />} {running ? 'Restaurando...' : 'Restaurar agora'}
      </button>
    </>}>
      <div className="form">
        {item.fromFile ? (
          <Field label="Arquivo de backup" hint=".zip, .bak (SQL Server), .backup (PostgreSQL), .sql (MySQL), .dmp (Oracle)">
            <div className="input-group">
              <input className="input" value={form.filePath} readOnly placeholder="Selecione o arquivo..." />
              <button className="btn" onClick={pickFile}><FolderOpen size={16} /> Procurar</button>
            </div>
          </Field>
        ) : (
          <div className="alert info">
            <div>Backup de <b>{item.database_name}</b> ({item.connection_name}) em {fmtDate(item.started_at)} — {item.file_name} ({fmtSize(item.file_size)})
              {item.local_deleted && <div className="small">O arquivo local foi removido; será baixado do {item.gdrive_file_id ? 'Google Drive' : 'FTP'}.</div>}
            </div>
          </div>
        )}

        <div className="row">
          <Field label="Restaurar na conexão">
            <select className="input" value={form.connectionId} onChange={(e) => set('connectionId', e.target.value)}>
              {!conns.length && <option value="">Nenhuma conexão compatível</option>}
              {conns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </Field>
          <Field label={conn && conn.type === 'oracle' ? 'Schema de destino' : 'Banco de destino'} hint="Use outro nome para restaurar uma cópia sem sobrescrever o original.">
            <input className="input" value={form.targetDb} onChange={(e) => set('targetDb', e.target.value)} />
          </Field>
        </div>
        {(item.fromFile && conn && ['oracle', 'mysql'].includes(conn.type)) && (
          <Field label={conn.type === 'oracle' ? 'Schema de origem (dentro do dump)' : 'Banco de origem (dentro do dump)'}>
            <input className="input" value={form.sourceDb} onChange={(e) => set('sourceDb', e.target.value)} />
          </Field>
        )}
        {isZip && (
          <Field label="Senha do ZIP" hint={item.fromFile ? 'Deixe vazio se o arquivo não tiver senha.' : 'Deixe vazio para usar a senha gravada na tarefa.'}>
            <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
        )}

        <div className="alert warn"><AlertTriangle size={18} />
          <div>A restauração <b>substitui</b> os dados do banco de destino{conn && conn.type === 'sqlserver' ? ' e desconecta os usuários ativos' : ''}. Esta operação não pode ser desfeita.</div>
        </div>
        <Check checked={confirm} onChange={setConfirm} label={`Confirmo a restauração em "${form.targetDb}"`} />

        {(running || lines.length > 0) && <LogView lines={lines} refEl={logRef} />}
        {result && !result.ok && <div className="alert danger">{result.error}</div>}
      </div>
    </Modal>
  );
}
