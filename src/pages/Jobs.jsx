import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Play, Loader2, X, RefreshCw, Lock, Cloud, Server as ServerIcon } from 'lucide-react';
import { call, on, fmtDate, WEEKDAYS } from '../api';
import { Modal, Field, Check, DbTag, StatusPill, useToast, useConfirm } from '../components/ui.jsx';

const EMPTY = {
  name: '', connection_id: '', databases: [], schedule_type: 'horarios', times: ['02:00'], weekdays: [0, 1, 2, 3, 4, 5, 6],
  interval_minutes: 60, zip: true, zip_password: '', max_per_day: 0, retention_days: 30,
  upload_gdrive: false, upload_ftp: false, keep_local: true, notify: 'erro', enabled: true
};

function scheduleText(j) {
  if (j.schedule_type === 'intervalo') return `A cada ${j.interval_minutes} min`;
  const days = j.weekdays.length === 7 ? 'Todos os dias' : j.weekdays.map((d) => WEEKDAYS[d]).join(', ');
  return `${days} às ${j.times.join(', ')}`;
}

export default function Jobs() {
  const toast = useToast();
  const [ask, confirmEl] = useConfirm();
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(null);

  const load = () => call('jobs:list').then(setList).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
    const off = on('job:state', load);
    return off;
  }, []);

  const run = async (j) => {
    try { await call('jobs:run', j.id); toast(`Backup "${j.name}" iniciado.`, 'success'); setTimeout(load, 400); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async (j) => {
    if (!(await ask(`Excluir a tarefa "${j.name}"? O histórico será mantido.`))) return;
    try { await call('jobs:delete', j.id); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const toggle = async (j) => {
    try { await call('jobs:save', { ...j, enabled: !j.enabled }); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Tarefas de backup</h1><p>Agendamentos, bancos selecionados, compactação e destinos.</p></div>
        <button className="btn primary" onClick={() => setEdit({ ...EMPTY })}><Plus size={16} /> Nova tarefa</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Ativa</th><th>Tarefa</th><th>Conexão</th><th>Agenda</th><th>Opções</th><th>Última / Próxima</th><th></th></tr></thead>
          <tbody>
            {list.map((j) => (
              <tr key={j.id}>
                <td><input type="checkbox" checked={j.enabled} onChange={() => toggle(j)} style={{ width: 16, height: 16 }} /></td>
                <td><b>{j.name}</b><div className="small muted">{j.databases.length} banco(s): {j.databases.slice(0, 3).join(', ')}{j.databases.length > 3 ? '...' : ''}</div></td>
                <td><DbTag type={j.db_type} /><div className="small muted">{j.connection_name}</div></td>
                <td className="small">{scheduleText(j)}</td>
                <td>
                  <div className="flex" style={{ flexWrap: 'wrap', gap: 4 }}>
                    {j.zip && <span className="pill blue">ZIP{j.zip_password ? <Lock size={11} /> : null}</span>}
                    {j.upload_gdrive && <span className="pill green"><Cloud size={11} /> Drive</span>}
                    {j.upload_ftp && <span className="pill orange"><ServerIcon size={11} /> FTP</span>}
                    {j.max_per_day > 0 && <span className="pill gray">{j.max_per_day}/dia</span>}
                    {j.retention_days > 0 && <span className="pill gray">{j.retention_days} dias</span>}
                  </div>
                </td>
                <td className="small">
                  <div>{j.last_run ? <>{fmtDate(j.last_run)} <StatusPill status={j.last_status} /></> : 'Nunca executada'}</div>
                  <div className="muted">Próxima: {j.enabled ? fmtDate(j.next_run) : '-'}</div>
                </td>
                <td>
                  <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm primary" disabled={j.running} onClick={() => run(j)}>{j.running ? <Loader2 size={14} className="spin" /> : <Play size={14} />}</button>
                    <button className="btn sm" onClick={() => setEdit({ ...j })}><Pencil size={14} /></button>
                    <button className="btn sm danger" onClick={() => remove(j)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="empty">Nenhuma tarefa cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <JobForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {confirmEl}
    </div>
  );
}

function JobForm({ value, onClose, onSaved }) {
  const toast = useToast();
  const [j, setJ] = useState(value);
  const [conns, setConns] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [newTime, setNewTime] = useState('12:00');
  const [dest, setDest] = useState({ gdrive: false, ftp: false, email: false });
  const set = (k, v) => setJ((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    call('connections:list').then((l) => {
      setConns(l);
      if (!j.connection_id && l.length) set('connection_id', l[0].id);
    });
    Promise.all([call('settings:get', 'gdrive'), call('settings:get', 'ftp'), call('settings:get', 'email')])
      .then(([g, f, e]) => setDest({ gdrive: g.enabled && !!g.tokens, ftp: f.enabled && !!f.host, email: e.enabled }));
  }, []);

  const loadDbs = async () => {
    const c = conns.find((x) => x.id === Number(j.connection_id));
    if (!c) return;
    setLoadingDbs(true);
    try { setDbs(await call('connections:databases', c)); } catch (e) { toast(e.message, 'error'); setDbs([]); }
    setLoadingDbs(false);
  };
  useEffect(() => { if (j.connection_id && conns.length) loadDbs(); }, [j.connection_id, conns.length]);

  const allDbs = [...new Set([...dbs, ...j.databases])];
  const toggleDb = (d) => set('databases', j.databases.includes(d) ? j.databases.filter((x) => x !== d) : [...j.databases, d]);
  const toggleDay = (d) => set('weekdays', j.weekdays.includes(d) ? j.weekdays.filter((x) => x !== d) : [...j.weekdays, d].sort());
  const addTime = () => { if (newTime && !j.times.includes(newTime)) set('times', [...j.times, newTime].sort()); };

  const save = async () => {
    if (!j.name.trim()) return toast('Informe o nome da tarefa.', 'error');
    if (!j.connection_id) return toast('Selecione a conexão.', 'error');
    if (!j.databases.length) return toast('Selecione ao menos um banco de dados.', 'error');
    if (j.schedule_type === 'horarios' && (!j.times.length || !j.weekdays.length)) return toast('Informe horários e dias da semana.', 'error');
    if (j.max_per_day > 0 && j.schedule_type === 'horarios' && j.times.length > j.max_per_day) {
      toast(`Atenção: ${j.times.length} horários por dia, mas só ${j.max_per_day} backup(s) serão mantidos por dia.`, 'info');
    }
    try { await call('jobs:save', j); toast('Tarefa salva.', 'success'); onSaved(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <Modal size="lg" title={j.id ? 'Editar tarefa' : 'Nova tarefa de backup'} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn primary" onClick={save}>Salvar tarefa</button>
    </>}>
      <div className="form">
        <div className="row">
          <Field label="Nome da tarefa"><input className="input" value={j.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Backup diário ERP" autoFocus /></Field>
          <Field label="Conexão">
            <select className="input" value={j.connection_id} onChange={(e) => setJ({ ...j, connection_id: Number(e.target.value), databases: [] })}>
              {!conns.length && <option value="">Cadastre uma conexão primeiro</option>}
              {conns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
            </select>
          </Field>
        </div>

        <div className="section-title">Bancos de dados</div>
        <div className="flex between">
          <div className="flex">
            <button className="btn sm" onClick={() => set('databases', [...allDbs])}>Marcar todos</button>
            <button className="btn sm" onClick={() => set('databases', [])}>Desmarcar</button>
            <span className="small muted">{j.databases.length} selecionado(s)</span>
          </div>
          <button className="btn sm" onClick={loadDbs} disabled={loadingDbs}>{loadingDbs ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Recarregar</button>
        </div>
        <div className="dblist">
          {allDbs.map((d) => <Check key={d} checked={j.databases.includes(d)} onChange={() => toggleDb(d)} label={d} />)}
          {!allDbs.length && <span className="muted small" style={{ padding: 8 }}>{loadingDbs ? 'Carregando...' : 'Nenhum banco encontrado.'}</span>}
        </div>

        <div className="section-title">Agendamento</div>
        <div className="row">
          <Field label="Tipo">
            <select className="input" value={j.schedule_type} onChange={(e) => set('schedule_type', e.target.value)}>
              <option value="horarios">Horários fixos</option>
              <option value="intervalo">Intervalo (a cada N minutos)</option>
            </select>
          </Field>
          {j.schedule_type === 'intervalo' && (
            <Field label="Intervalo (minutos)"><input className="input" type="number" min={5} value={j.interval_minutes} onChange={(e) => set('interval_minutes', Number(e.target.value))} /></Field>
          )}
        </div>
        {j.schedule_type === 'horarios' && <>
          <Field label="Horários">
            <div className="flex" style={{ flexWrap: 'wrap' }}>
              <div className="chips">
                {j.times.map((t) => <span key={t} className="chip">{t}<button onClick={() => set('times', j.times.filter((x) => x !== t))}><X size={13} /></button></span>)}
              </div>
              <input className="input" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 120 }} />
              <button className="btn sm" onClick={addTime}><Plus size={14} /> Adicionar</button>
            </div>
          </Field>
          <Field label="Dias da semana">
            <div className="weekdays">
              {WEEKDAYS.map((d, i) => <button key={i} className={j.weekdays.includes(i) ? 'on' : ''} onClick={() => toggleDay(i)}>{d}</button>)}
            </div>
          </Field>
        </>}

        <div className="section-title">Compactação e retenção</div>
        <div className="row">
          <div className="form" style={{ gap: 8 }}>
            <Check checked={j.zip} onChange={(v) => set('zip', v)} label="Compactar em ZIP" />
            <Field label="Senha do ZIP (opcional - AES-256)" hint="Guarde esta senha: ela é necessária para abrir o arquivo fora do sistema.">
              <input className="input" type="password" disabled={!j.zip} value={j.zip_password || ''} onChange={(e) => set('zip_password', e.target.value)} />
            </Field>
          </div>
          <div className="form" style={{ gap: 8 }}>
            <Field label="Quantidade máxima de backups por dia (por banco)" hint="0 = ilimitado. Ao exceder, os mais antigos do dia são removidos.">
              <input className="input" type="number" min={0} value={j.max_per_day} onChange={(e) => set('max_per_day', Number(e.target.value))} />
            </Field>
            <Field label="Manter backups por (dias)" hint="0 = nunca apagar. Vale para local, Drive e FTP.">
              <input className="input" type="number" min={0} value={j.retention_days} onChange={(e) => set('retention_days', Number(e.target.value))} />
            </Field>
          </div>
        </div>

        <div className="section-title">Destinos e notificação</div>
        <div className="row">
          <div className="form" style={{ gap: 8 }}>
            <Check checked={j.upload_gdrive} onChange={(v) => set('upload_gdrive', v)} disabled={!dest.gdrive && !j.upload_gdrive} label={`Enviar para o Google Drive${dest.gdrive ? '' : ' (não configurado)'}`} />
            <Check checked={j.upload_ftp} onChange={(v) => set('upload_ftp', v)} disabled={!dest.ftp && !j.upload_ftp} label={`Enviar para o FTP${dest.ftp ? '' : ' (não configurado)'}`} />
            <Check checked={j.keep_local} onChange={(v) => set('keep_local', v)} disabled={!j.upload_gdrive && !j.upload_ftp} label="Manter cópia local após o envio" />
          </div>
          <Field label="Notificar por e-mail" hint={dest.email ? '' : 'E-mail não configurado em Configurações.'}>
            <select className="input" value={j.notify} onChange={(e) => set('notify', e.target.value)}>
              <option value="nunca">Nunca</option>
              <option value="erro">Somente em caso de erro/aviso</option>
              <option value="sempre">Sempre</option>
            </select>
          </Field>
        </div>
        <Check checked={j.enabled} onChange={(v) => set('enabled', v)} label="Tarefa ativa" />
      </div>
    </Modal>
  );
}
